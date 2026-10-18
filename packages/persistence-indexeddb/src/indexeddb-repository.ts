import {
  CanonicalIdSchema,
  UtcInstantSchema,
  canonicalizeJson,
  sealCanonicalRecordV1,
  type CanonicalRecordV1,
  type JsonValue,
} from '@nutrixx/canonical-schema';
import {
  PersistenceError,
  commandFromTransactionEntry,
  classifyCanonicalWrite,
  classifyEditableChange,
  createLocalDataExportV1,
  createEditableDataFileV1,
  validateLocalDataExportV1,
  validateEditableDataFileV1,
  validateCanonicalRecord,
  type AtomicCanonicalRecordRepository,
  type CanonicalRecordMutationResult,
  type CanonicalRecordVerifier,
  type CanonicalPayloadHasher,
  type CanonicalTransactionCommand,
  type CanonicalTransactionLogEntryV1,
  type CanonicalTransactionResult,
  type CanonicalWriteResult,
  type EditableChangeV1,
  type EditableDataFileV1,
  type EditableFactV1,
  type EditableImportPreviewV1,
  type LocalDataExportArtifactV1,
  type LocalPortabilityRepository,
} from '@nutrixx/persistence';

import { sha256Canonical } from './crypto.js';
import {
  CANONICAL_RECORD_STORE,
  COMMAND_RECEIPT_STORE,
  INDEXED_DB_SCHEMA_VERSION,
  SUBJECT_INDEX,
  TRANSACTION_LOG_STORE,
  openIndexedDb,
} from './schema.js';

const MAX_MUTATIONS_PER_TRANSACTION = 100;
const MAX_LOG_PAGE_SIZE = 500;

interface StoredCommandReceipt {
  readonly commandId: string;
  readonly fingerprint: string;
  readonly sequence: number;
}

export interface IndexedDbRepositoryOptions {
  readonly databaseName: string;
  readonly indexedDB: IDBFactory;
  readonly keyRange?: typeof IDBKeyRange;
  readonly verifyRecord: CanonicalRecordVerifier;
  readonly deleteOnClose?: boolean;
  readonly createId?: () => string;
  readonly now?: () => string;
  readonly beforeLogAppend?: () => void;
  readonly fingerprint?: (canonicalCommand: string) => Promise<string>;
  readonly beforeImportCommit?: () => void;
  readonly validatePortableRecord?: (
    record: CanonicalRecordV1,
  ) => boolean | Promise<boolean>;
  readonly validatePortableDataset?: (
    records: readonly CanonicalRecordV1[],
  ) => boolean;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), {
      once: true,
    });
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('IndexedDB request failed.')),
      { once: true },
    );
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener(
      'abort',
      () =>
        reject(
          transaction.error ?? new Error('IndexedDB transaction aborted.'),
        ),
      { once: true },
    );
    transaction.addEventListener(
      'error',
      () =>
        reject(transaction.error ?? new Error('IndexedDB transaction failed.')),
      { once: true },
    );
  });
}

function validateCommandShape(command: CanonicalTransactionCommand): void {
  if (
    typeof command.commandId !== 'string' ||
    command.commandId.trim() !== command.commandId ||
    command.commandId.length === 0 ||
    command.commandId.length > 200 ||
    !UtcInstantSchema.safeParse(command.occurredAt).success ||
    command.mutations.length === 0 ||
    command.mutations.length > MAX_MUTATIONS_PER_TRANSACTION
  ) {
    throw new PersistenceError(
      'invalid-command',
      'A transaction command has an invalid identifier, timestamp, or mutation count.',
    );
  }

  const recordIds = new Set<string>();
  for (const mutation of command.mutations) {
    const recordId =
      mutation.kind === 'put' ? mutation.record.recordId : mutation.recordId;
    if (
      !CanonicalIdSchema.safeParse(recordId).success ||
      recordIds.has(recordId)
    ) {
      throw new PersistenceError(
        'invalid-command',
        'A transaction command contains an invalid or duplicate record identifier.',
      );
    }
    recordIds.add(recordId);
  }
}

function abortTransaction(transaction: IDBTransaction): void {
  try {
    transaction.abort();
  } catch {
    // The transaction may already be aborting after a failed request.
  }
}

export class IndexedDbCanonicalRecordRepository
  implements AtomicCanonicalRecordRepository, LocalPortabilityRepository
{
  readonly #database: IDBDatabase;
  readonly #options: IndexedDbRepositoryOptions;
  readonly #createId: () => string;
  readonly #fingerprint: CanonicalPayloadHasher;
  readonly #keyRange: typeof IDBKeyRange;
  readonly #now: () => string;
  #closed = false;

  private constructor(
    database: IDBDatabase,
    options: IndexedDbRepositoryOptions,
  ) {
    this.#database = database;
    this.#options = options;
    this.#createId = options.createId ?? (() => crypto.randomUUID());
    this.#fingerprint = options.fingerprint ?? sha256Canonical;
    this.#keyRange = options.keyRange ?? IDBKeyRange;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  public static async create(
    options: IndexedDbRepositoryOptions,
  ): Promise<IndexedDbCanonicalRecordRepository> {
    return new IndexedDbCanonicalRecordRepository(
      await openIndexedDb(options.indexedDB, options.databaseName),
      options,
    );
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new PersistenceError('closed', 'The repository is closed.');
    }
  }

  public async commit(
    command: CanonicalTransactionCommand,
  ): Promise<CanonicalTransactionResult> {
    this.#assertOpen();
    validateCommandShape(command);

    const validatedRecords = new Map<string, CanonicalRecordV1>();
    for (const mutation of command.mutations) {
      if (mutation.kind === 'put') {
        validatedRecords.set(
          mutation.record.recordId,
          await validateCanonicalRecord(
            mutation.record,
            this.#options.verifyRecord,
          ),
        );
      }
    }

    const fingerprint = await this.#fingerprint(
      canonicalizeJson(command as unknown as JsonValue),
    );
    const transaction = this.#database.transaction(
      [CANONICAL_RECORD_STORE, TRANSACTION_LOG_STORE, COMMAND_RECEIPT_STORE],
      'readwrite',
      { durability: 'strict' },
    );
    const completion = transactionComplete(transaction);
    const records = transaction.objectStore(CANONICAL_RECORD_STORE);
    const log = transaction.objectStore(TRANSACTION_LOG_STORE);
    const receipts = transaction.objectStore(COMMAND_RECEIPT_STORE);

    try {
      const receipt = (await requestResult(receipts.get(command.commandId))) as
        | StoredCommandReceipt
        | undefined;
      if (receipt !== undefined) {
        if (receipt.fingerprint !== fingerprint) {
          throw new PersistenceError(
            'command-conflict',
            'A different transaction already uses this command identifier.',
          );
        }
        const storedEntry = (await requestResult(log.get(receipt.sequence))) as
          | CanonicalTransactionLogEntryV1
          | undefined;
        if (storedEntry === undefined) {
          throw new PersistenceError(
            'invalid-command',
            'The command receipt points to a missing transaction log entry.',
          );
        }
        await completion;
        return { entry: structuredClone(storedEntry), replayed: true };
      }

      const mutationResults: CanonicalRecordMutationResult[] = [];
      for (const mutation of command.mutations) {
        if (mutation.kind === 'put') {
          const record = validatedRecords.get(mutation.record.recordId);
          if (record === undefined) {
            throw new PersistenceError(
              'invalid-record',
              'A validated canonical record is unavailable.',
            );
          }
          const existing = (await requestResult(
            records.get(record.recordId),
          )) as CanonicalRecordV1 | undefined;
          const result = classifyCanonicalWrite(existing ?? null, record);
          if (result !== 'unchanged') {
            await requestResult(records.put(structuredClone(record)));
          }
          mutationResults.push({ kind: 'put', record, result });
        } else {
          const existed =
            (await requestResult(records.getKey(mutation.recordId))) !==
            undefined;
          if (existed) await requestResult(records.delete(mutation.recordId));
          mutationResults.push({
            kind: 'delete',
            recordId: mutation.recordId,
            deleted: existed,
          });
        }
      }

      this.#options.beforeLogAppend?.();
      const entryWithoutSequence = {
        format: 'nutrixx.local-transaction',
        schemaVersion: 1,
        transactionId: this.#createId(),
        commandId: command.commandId,
        occurredAt: command.occurredAt,
        committedAt: this.#now(),
        mutations: mutationResults,
      } as const;
      const sequenceKey = await requestResult(log.add(entryWithoutSequence));
      if (typeof sequenceKey !== 'number') {
        throw new PersistenceError(
          'invalid-command',
          'IndexedDB returned a non-numeric transaction sequence.',
        );
      }
      const entry: CanonicalTransactionLogEntryV1 = {
        ...entryWithoutSequence,
        sequence: sequenceKey,
      };
      await requestResult(
        receipts.add({
          commandId: command.commandId,
          fingerprint,
          sequence: entry.sequence,
        } satisfies StoredCommandReceipt),
      );
      await completion;
      return { entry: structuredClone(entry), replayed: false };
    } catch (error) {
      abortTransaction(transaction);
      await completion.catch(() => undefined);
      throw error;
    }
  }

  public async put(input: CanonicalRecordV1): Promise<CanonicalWriteResult> {
    const result = await this.commit({
      commandId: this.#createId(),
      occurredAt: this.#now(),
      mutations: [{ kind: 'put', record: input }],
    });
    const mutation = result.entry.mutations[0];
    if (mutation?.kind !== 'put') {
      throw new PersistenceError(
        'invalid-command',
        'The put command produced an unexpected transaction result.',
      );
    }
    return mutation.result;
  }

  public async getById(recordId: string): Promise<CanonicalRecordV1 | null> {
    this.#assertOpen();
    const transaction = this.#database.transaction(
      CANONICAL_RECORD_STORE,
      'readonly',
    );
    const completion = transactionComplete(transaction);
    const value = (await requestResult(
      transaction.objectStore(CANONICAL_RECORD_STORE).get(recordId),
    )) as CanonicalRecordV1 | undefined;
    await completion;
    return value === undefined ? null : structuredClone(value);
  }

  public async listBySubject(
    subjectId: string,
  ): Promise<readonly CanonicalRecordV1[]> {
    this.#assertOpen();
    const transaction = this.#database.transaction(
      CANONICAL_RECORD_STORE,
      'readonly',
    );
    const completion = transactionComplete(transaction);
    const values = (await requestResult(
      transaction
        .objectStore(CANONICAL_RECORD_STORE)
        .index(SUBJECT_INDEX)
        .getAll(subjectId),
    )) as CanonicalRecordV1[];
    await completion;
    return structuredClone(
      values.sort((left, right) => left.recordId.localeCompare(right.recordId)),
    );
  }

  public async deleteById(recordId: string): Promise<boolean> {
    const result = await this.commit({
      commandId: this.#createId(),
      occurredAt: this.#now(),
      mutations: [{ kind: 'delete', recordId }],
    });
    const mutation = result.entry.mutations[0];
    if (mutation?.kind !== 'delete') {
      throw new PersistenceError(
        'invalid-command',
        'The delete command produced an unexpected transaction result.',
      );
    }
    return mutation.deleted;
  }

  public async listTransactions(
    afterSequence = 0,
    limit = 100,
  ): Promise<readonly CanonicalTransactionLogEntryV1[]> {
    this.#assertOpen();
    if (
      !Number.isSafeInteger(afterSequence) ||
      afterSequence < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > MAX_LOG_PAGE_SIZE
    ) {
      throw new PersistenceError(
        'invalid-command',
        'Transaction log pagination is outside the supported range.',
      );
    }
    const transaction = this.#database.transaction(
      TRANSACTION_LOG_STORE,
      'readonly',
    );
    const completion = transactionComplete(transaction);
    const entries = (await requestResult(
      transaction
        .objectStore(TRANSACTION_LOG_STORE)
        .getAll(this.#keyRange.lowerBound(afterSequence, true), limit),
    )) as CanonicalTransactionLogEntryV1[];
    await completion;
    return structuredClone(entries);
  }

  /** A cheap revision token for derived browser views; no log payload is read. */
  public async latestTransactionSequence(): Promise<number> {
    this.#assertOpen();
    const transaction = this.#database.transaction(
      TRANSACTION_LOG_STORE,
      'readonly',
    );
    const completion = transactionComplete(transaction);
    const key = await requestResult(
      transaction
        .objectStore(TRANSACTION_LOG_STORE)
        .openKeyCursor(null, 'prev'),
    );
    await completion;
    return typeof key?.primaryKey === 'number' ? key.primaryKey : 0;
  }

  public async exportLocalData(
    exportedAt = this.#now(),
  ): Promise<LocalDataExportArtifactV1> {
    this.#assertOpen();
    const transaction = this.#database.transaction(
      [CANONICAL_RECORD_STORE, TRANSACTION_LOG_STORE],
      'readonly',
    );
    const completion = transactionComplete(transaction);
    const [records, transactions] = await Promise.all([
      requestResult(transaction.objectStore(CANONICAL_RECORD_STORE).getAll()),
      requestResult(transaction.objectStore(TRANSACTION_LOG_STORE).getAll()),
    ]);
    await completion;
    const artifact = await createLocalDataExportV1({
      exportedAt,
      databaseSchemaVersion: INDEXED_DB_SCHEMA_VERSION,
      records: records as CanonicalRecordV1[],
      transactions: transactions as CanonicalTransactionLogEntryV1[],
      hash: this.#fingerprint,
    });
    return validateLocalDataExportV1(artifact, {
      hash: this.#fingerprint,
      verifyRecord: this.#options.verifyRecord,
    });
  }

  public async exportEditableData(
    subjectId: string,
  ): Promise<EditableDataFileV1> {
    this.#assertOpen();
    const records = await this.listBySubject(subjectId);
    for (const record of records) {
      await validateCanonicalRecord(record, this.#options.verifyRecord);
    }
    return createEditableDataFileV1(records, subjectId, this.#now());
  }

  async #prepareEditableRecord(
    fact: EditableFactV1,
    existing: CanonicalRecordV1 | null,
    occurredAt: string,
  ): Promise<CanonicalRecordV1> {
    const transferred = existing === null && fact.sourceRevision !== null;
    const logicalVersion =
      existing === null ? fact.logicalVersion : existing.logicalVersion + 1;
    const payload =
      existing !== null &&
      fact.recordType === 'user-context.starting-profile' &&
      typeof fact.payload === 'object' &&
      fact.payload !== null &&
      !Array.isArray(fact.payload)
        ? { ...fact.payload, revision: logicalVersion }
        : fact.payload;
    const record = await sealCanonicalRecordV1(
      {
        format: 'nutrixx.canonical-record',
        schemaVersion: 1,
        recordType: fact.recordType,
        recordVersion: fact.recordVersion,
        recordId: fact.recordId,
        subjectId: fact.subjectId,
        owningContext: fact.owningContext,
        logicalVersion,
        createdAt: fact.createdAt,
        updatedAt: existing === null ? fact.updatedAt : occurredAt,
        ...(fact.correctionOf === undefined
          ? {}
          : { correctionOf: fact.correctionOf }),
        provenance: transferred
          ? fact.provenance
          : {
              method: 'imported',
              source: {
                kind: 'import',
                sourceId: 'editable-data',
                sourceRecordId: fact.recordId,
              },
              recordedAt: occurredAt,
            },
        payload,
      },
      this.#fingerprint,
    );
    if (!(await this.#options.validatePortableRecord?.(record))) {
      throw new PersistenceError(
        'invalid-export',
        'An edited fact fails its domain schema.',
      );
    }
    return record;
  }

  #validateEditableDataset(
    current: readonly CanonicalRecordV1[],
    facts: readonly EditableFactV1[],
    prepared: ReadonlyMap<string, CanonicalRecordV1>,
  ): void {
    if (this.#options.validatePortableDataset === undefined) return;
    const next = new Map(current.map((record) => [record.recordId, record]));
    for (const fact of facts) {
      if (fact.action === 'delete') next.delete(fact.recordId);
      else {
        const record = prepared.get(fact.recordId);
        if (record !== undefined) next.set(fact.recordId, record);
      }
    }
    if (!this.#options.validatePortableDataset([...next.values()])) {
      throw new PersistenceError(
        'invalid-export',
        'The edited facts break local record relationships.',
      );
    }
  }

  public async previewEditableData(
    input: unknown,
  ): Promise<EditableImportPreviewV1> {
    this.#assertOpen();
    const file = validateEditableDataFileV1(input);
    const transaction = this.#database.transaction(
      CANONICAL_RECORD_STORE,
      'readonly',
    );
    const completion = transactionComplete(transaction);
    const records = (await requestResult(
      transaction.objectStore(CANONICAL_RECORD_STORE).getAll(),
    )) as CanonicalRecordV1[];
    await completion;
    if (
      records.some(
        (record) => record.subjectId !== file.content.manifest.subjectId,
      )
    ) {
      throw new PersistenceError(
        'invalid-export',
        'The editable file belongs to a different local profile.',
      );
    }
    const byId = new Map(records.map((record) => [record.recordId, record]));
    const targetWasEmpty = records.length === 0;
    if (this.#options.validatePortableRecord === undefined) {
      throw new PersistenceError(
        'invalid-export',
        'Portable record validation is required for editable imports.',
      );
    }
    const changes = file.content.facts.map((fact) =>
      classifyEditableChange(
        fact,
        byId.get(fact.recordId) ?? null,
        targetWasEmpty,
      ),
    );
    const prepared = new Map<string, CanonicalRecordV1>();
    for (const [index, fact] of file.content.facts.entries()) {
      if (
        fact.action === 'delete' &&
        fact.recordType === 'user-context.starting-profile'
      ) {
        throw new PersistenceError(
          'invalid-export',
          'The local profile cannot be deleted through an editable import.',
        );
      }
      if (
        changes[index]?.kind === 'add' ||
        changes[index]?.kind === 'correct'
      ) {
        prepared.set(
          fact.recordId,
          await this.#prepareEditableRecord(
            fact,
            byId.get(fact.recordId) ?? null,
            this.#now(),
          ),
        );
      }
    }
    if (!changes.some((change) => change.kind === 'conflict')) {
      this.#validateEditableDataset(
        records,
        file.content.facts.filter(
          (_, index) => changes[index]?.kind !== 'unchanged',
        ),
        prepared,
      );
    }
    return {
      file,
      changes,
      targetWasEmpty,
      reviewDigest: await this.#fingerprint(
        canonicalizeJson(file as unknown as JsonValue),
      ),
    };
  }

  public async importEditableData(
    reviewed: EditableImportPreviewV1,
  ): Promise<readonly EditableChangeV1[]> {
    this.#assertOpen();
    const preview = await this.previewEditableData(reviewed.file);
    if (
      reviewed.targetWasEmpty !== preview.targetWasEmpty ||
      reviewed.reviewDigest !== preview.reviewDigest ||
      canonicalizeJson(reviewed.changes as unknown as JsonValue) !==
        canonicalizeJson(preview.changes as unknown as JsonValue)
    ) {
      throw new PersistenceError(
        'invalid-export',
        'The editable import review is outdated.',
      );
    }
    if (preview.changes.some((change) => change.kind === 'conflict')) {
      throw new PersistenceError(
        'invalid-export',
        'Resolve editable import conflicts before committing.',
      );
    }
    const occurredAt = this.#now();
    const changedFacts = preview.file.content.facts.filter((_, index) =>
      ['add', 'correct', 'delete'].includes(preview.changes[index]?.kind ?? ''),
    );
    if (changedFacts.length === 0) return preview.changes;

    const sourceRecords = new Map<string, CanonicalRecordV1>();
    const prepared = new Map<string, CanonicalRecordV1>();
    for (const fact of changedFacts) {
      const existing = await this.getById(fact.recordId);
      if (
        classifyEditableChange(fact, existing, preview.targetWasEmpty).kind ===
        'conflict'
      ) {
        throw new PersistenceError(
          'invalid-export',
          'The editable source changed during import review.',
        );
      }
      if (existing !== null) sourceRecords.set(fact.recordId, existing);
      if (fact.action === 'delete') continue;
      prepared.set(
        fact.recordId,
        await this.#prepareEditableRecord(fact, existing, occurredAt),
      );
    }

    const commandId = this.#createId();
    const command = {
      commandId,
      occurredAt,
      mutations: changedFacts.map((fact) =>
        fact.action === 'delete'
          ? { kind: 'delete' as const, recordId: fact.recordId }
          : { kind: 'put' as const, record: prepared.get(fact.recordId)! },
      ),
    } satisfies CanonicalTransactionCommand;
    const fingerprint = await this.#fingerprint(
      canonicalizeJson(command as unknown as JsonValue),
    );
    const transaction = this.#database.transaction(
      [CANONICAL_RECORD_STORE, TRANSACTION_LOG_STORE, COMMAND_RECEIPT_STORE],
      'readwrite',
      { durability: 'strict' },
    );
    const completion = transactionComplete(transaction);
    const records = transaction.objectStore(CANONICAL_RECORD_STORE);
    const log = transaction.objectStore(TRANSACTION_LOG_STORE);
    const receipts = transaction.objectStore(COMMAND_RECEIPT_STORE);
    try {
      const currentRecords = (await requestResult(
        records.getAll(),
      )) as CanonicalRecordV1[];
      if (preview.targetWasEmpty && currentRecords.length !== 0) {
        throw new PersistenceError(
          'invalid-export',
          'The local profile changed before import committed.',
        );
      }
      const currentById = new Map(
        currentRecords.map((record) => [record.recordId, record]),
      );
      for (const fact of changedFacts) {
        const current = currentById.get(fact.recordId);
        const expected = sourceRecords.get(fact.recordId);
        if (
          (current?.integrity.value ?? null) !==
            (expected?.integrity.value ?? null) ||
          classifyEditableChange(fact, current ?? null, preview.targetWasEmpty)
            .kind === 'conflict'
        ) {
          throw new PersistenceError(
            'invalid-export',
            'The local fact changed before import committed.',
          );
        }
      }
      this.#validateEditableDataset(currentRecords, changedFacts, prepared);
      const mutationResults: CanonicalRecordMutationResult[] = [];
      for (const fact of changedFacts) {
        const current = currentById.get(fact.recordId);
        if (fact.action === 'delete') {
          if (current !== undefined)
            await requestResult(records.delete(fact.recordId));
          mutationResults.push({
            kind: 'delete',
            recordId: fact.recordId,
            deleted: current !== undefined,
          });
        } else {
          const record = prepared.get(fact.recordId)!;
          const result = classifyCanonicalWrite(current ?? null, record);
          await requestResult(records.put(structuredClone(record)));
          mutationResults.push({ kind: 'put', record, result });
        }
      }
      this.#options.beforeLogAppend?.();
      const sequence = await requestResult(
        log.add({
          format: 'nutrixx.local-transaction',
          schemaVersion: 1,
          transactionId: this.#createId(),
          commandId,
          occurredAt,
          committedAt: this.#now(),
          mutations: mutationResults,
        }),
      );
      if (typeof sequence !== 'number') {
        throw new PersistenceError(
          'invalid-command',
          'IndexedDB returned an invalid sequence.',
        );
      }
      await requestResult(
        receipts.add({
          commandId,
          fingerprint,
          sequence,
        } satisfies StoredCommandReceipt),
      );
      this.#options.beforeImportCommit?.();
      await completion;
      return preview.changes;
    } catch (error) {
      abortTransaction(transaction);
      await completion.catch(() => undefined);
      throw error;
    }
  }

  public async importLocalData(
    input: unknown,
  ): Promise<LocalDataExportArtifactV1['content']['manifest']> {
    this.#assertOpen();
    const artifact = await validateLocalDataExportV1(input, {
      hash: this.#fingerprint,
      verifyRecord: this.#options.verifyRecord,
    });
    const receiptsToImport = await Promise.all(
      artifact.content.transactions.map(async (entry) => ({
        commandId: entry.commandId,
        fingerprint: await this.#fingerprint(
          canonicalizeJson(
            commandFromTransactionEntry(entry) as unknown as JsonValue,
          ),
        ),
        sequence: entry.sequence,
      })),
    );

    const transaction = this.#database.transaction(
      [CANONICAL_RECORD_STORE, TRANSACTION_LOG_STORE, COMMAND_RECEIPT_STORE],
      'readwrite',
      { durability: 'strict' },
    );
    const completion = transactionComplete(transaction);
    const records = transaction.objectStore(CANONICAL_RECORD_STORE);
    const log = transaction.objectStore(TRANSACTION_LOG_STORE);
    const receipts = transaction.objectStore(COMMAND_RECEIPT_STORE);

    try {
      await Promise.all([
        requestResult(records.clear()),
        requestResult(log.clear()),
        requestResult(receipts.clear()),
      ]);
      for (const record of artifact.content.records) {
        await requestResult(records.add(structuredClone(record)));
      }
      for (const entry of artifact.content.transactions) {
        await requestResult(log.add(structuredClone(entry)));
      }
      for (const receipt of receiptsToImport) {
        await requestResult(
          receipts.add(receipt satisfies StoredCommandReceipt),
        );
      }
      this.#options.beforeImportCommit?.();
      await completion;
      return structuredClone(artifact.content.manifest);
    } catch (error) {
      abortTransaction(transaction);
      await completion.catch(() => undefined);
      throw error;
    }
  }

  public async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#database.close();
    if (this.#options.deleteOnClose === true) {
      await requestResult(
        this.#options.indexedDB.deleteDatabase(this.#options.databaseName),
      );
    }
  }
}
