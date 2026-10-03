import {
  CanonicalIdSchema,
  UtcInstantSchema,
  canonicalizeJson,
  type CanonicalRecordV1,
  type JsonValue,
} from '@nutrixx/canonical-schema';
import {
  PersistenceError,
  classifyCanonicalWrite,
  validateCanonicalRecord,
  type AtomicCanonicalRecordRepository,
  type CanonicalRecordMutationResult,
  type CanonicalRecordVerifier,
  type CanonicalTransactionCommand,
  type CanonicalTransactionLogEntryV1,
  type CanonicalTransactionResult,
  type CanonicalWriteResult,
} from '@nutrixx/persistence';

import {
  CANONICAL_RECORD_STORE,
  COMMAND_RECEIPT_STORE,
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
}

async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
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
  implements AtomicCanonicalRecordRepository
{
  readonly #database: IDBDatabase;
  readonly #options: IndexedDbRepositoryOptions;
  readonly #createId: () => string;
  readonly #fingerprint: (canonicalCommand: string) => Promise<string>;
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
    this.#fingerprint = options.fingerprint ?? sha256;
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
