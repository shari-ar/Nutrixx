import {
  CANONICAL_SCHEMA_VERSION,
  CanonicalRecordV1Schema,
  UtcInstantSchema,
  canonicalizeJson,
  type CanonicalRecordV1,
  type JsonValue,
} from '@nutrixx/canonical-schema';

import { PersistenceError } from './repository.js';
import { classifyCanonicalWrite } from './write-policy.js';
import type {
  CanonicalRecordMutation,
  CanonicalRecordMutationResult,
  CanonicalTransactionCommand,
  CanonicalTransactionLogEntryV1,
} from './transaction-log.js';
import type { CanonicalRecordVerifier } from './repository.js';

export const LOCAL_EXPORT_VERSION = 1;

export type CanonicalPayloadHasher = (
  canonicalPayload: string,
) => Promise<string>;

export interface LocalDataExportManifestV1 {
  readonly format: 'nutrixx.local-export';
  readonly exportVersion: 1;
  readonly canonicalSchemaVersion: 1;
  readonly databaseSchemaVersion: 1;
  readonly exportedAt: string;
  readonly recordCount: number;
  readonly transactionCount: number;
  readonly lastSequence: number;
  readonly subjectIds: readonly string[];
  readonly payloadSha256: string;
}

export interface LocalDataExportArtifactV1 {
  readonly manifest: LocalDataExportManifestV1;
  readonly records: readonly CanonicalRecordV1[];
  readonly transactions: readonly CanonicalTransactionLogEntryV1[];
}

export interface CreateLocalDataExportV1Options {
  readonly exportedAt: string;
  readonly databaseSchemaVersion: 1;
  readonly records: readonly CanonicalRecordV1[];
  readonly transactions: readonly CanonicalTransactionLogEntryV1[];
  readonly hash: CanonicalPayloadHasher;
}

export interface ValidateLocalDataExportV1Options {
  readonly hash: CanonicalPayloadHasher;
  readonly verifyRecord: CanonicalRecordVerifier;
}

export interface LocalDataExportImportRepository {
  exportLocalData(exportedAt?: string): Promise<LocalDataExportArtifactV1>;
  importLocalData(input: unknown): Promise<LocalDataExportManifestV1>;
}

const SHA256_HEX = /^[a-f0-9]{64}$/;

function isObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function hasOnlyKeys(
  input: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(input).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function invalidExport(message: string): never {
  throw new PersistenceError('invalid-export', message);
}

function parseManifest(input: unknown): LocalDataExportManifestV1 {
  if (
    !isObject(input) ||
    !hasOnlyKeys(input, [
      'canonicalSchemaVersion',
      'databaseSchemaVersion',
      'exportVersion',
      'exportedAt',
      'format',
      'lastSequence',
      'payloadSha256',
      'recordCount',
      'subjectIds',
      'transactionCount',
    ]) ||
    input['format'] !== 'nutrixx.local-export' ||
    input['exportVersion'] !== LOCAL_EXPORT_VERSION ||
    input['canonicalSchemaVersion'] !== CANONICAL_SCHEMA_VERSION ||
    input['databaseSchemaVersion'] !== 1 ||
    !UtcInstantSchema.safeParse(input['exportedAt']).success ||
    !Number.isSafeInteger(input['recordCount']) ||
    Number(input['recordCount']) < 0 ||
    !Number.isSafeInteger(input['transactionCount']) ||
    Number(input['transactionCount']) < 0 ||
    !Number.isSafeInteger(input['lastSequence']) ||
    Number(input['lastSequence']) < 0 ||
    !Array.isArray(input['subjectIds']) ||
    !input['subjectIds'].every((value) => typeof value === 'string') ||
    typeof input['payloadSha256'] !== 'string' ||
    !SHA256_HEX.test(input['payloadSha256'])
  ) {
    invalidExport('The local export manifest is malformed or unsupported.');
  }

  return structuredClone(input) as unknown as LocalDataExportManifestV1;
}

function parseMutationResult(input: unknown): CanonicalRecordMutationResult {
  if (!isObject(input) || typeof input['kind'] !== 'string') {
    invalidExport('A transaction mutation result is malformed.');
  }
  if (input['kind'] === 'put') {
    const parsed = CanonicalRecordV1Schema.safeParse(input['record']);
    if (
      !hasOnlyKeys(input, ['kind', 'record', 'result']) ||
      !parsed.success ||
      !['inserted', 'updated', 'unchanged'].includes(String(input['result']))
    ) {
      invalidExport('A put mutation result is malformed.');
    }
    return {
      kind: 'put',
      record: parsed.data,
      result: input['result'] as 'inserted' | 'updated' | 'unchanged',
    };
  }
  if (
    input['kind'] === 'delete' &&
    hasOnlyKeys(input, ['deleted', 'kind', 'recordId']) &&
    typeof input['recordId'] === 'string' &&
    typeof input['deleted'] === 'boolean'
  ) {
    return {
      kind: 'delete',
      recordId: input['recordId'],
      deleted: input['deleted'],
    };
  }
  return invalidExport('A transaction mutation result is unsupported.');
}

function parseTransaction(input: unknown): CanonicalTransactionLogEntryV1 {
  if (
    !isObject(input) ||
    !hasOnlyKeys(input, [
      'commandId',
      'committedAt',
      'format',
      'mutations',
      'occurredAt',
      'schemaVersion',
      'sequence',
      'transactionId',
    ]) ||
    input['format'] !== 'nutrixx.local-transaction' ||
    input['schemaVersion'] !== 1 ||
    !Number.isSafeInteger(input['sequence']) ||
    Number(input['sequence']) < 1 ||
    typeof input['transactionId'] !== 'string' ||
    input['transactionId'].length === 0 ||
    typeof input['commandId'] !== 'string' ||
    input['commandId'].length === 0 ||
    !UtcInstantSchema.safeParse(input['occurredAt']).success ||
    !UtcInstantSchema.safeParse(input['committedAt']).success ||
    !Array.isArray(input['mutations']) ||
    input['mutations'].length === 0
  ) {
    invalidExport('A transaction log entry is malformed or unsupported.');
  }
  return {
    format: 'nutrixx.local-transaction',
    schemaVersion: 1,
    sequence: input['sequence'] as number,
    transactionId: input['transactionId'],
    commandId: input['commandId'],
    occurredAt: input['occurredAt'] as string,
    committedAt: input['committedAt'] as string,
    mutations: input['mutations'].map(parseMutationResult),
  };
}

export function commandFromTransactionEntry(
  entry: CanonicalTransactionLogEntryV1,
): CanonicalTransactionCommand {
  const mutations: CanonicalRecordMutation[] = entry.mutations.map(
    (mutation) =>
      mutation.kind === 'put'
        ? { kind: 'put', record: mutation.record }
        : { kind: 'delete', recordId: mutation.recordId },
  );
  return {
    commandId: entry.commandId,
    occurredAt: entry.occurredAt,
    mutations,
  };
}

function exportPayload(
  records: readonly CanonicalRecordV1[],
  transactions: readonly CanonicalTransactionLogEntryV1[],
): JsonValue {
  return { records, transactions } as unknown as JsonValue;
}

function sortedSubjectIds(records: readonly CanonicalRecordV1[]): string[] {
  return [...new Set(records.map(({ subjectId }) => subjectId))].sort();
}

export async function createLocalDataExportV1(
  options: CreateLocalDataExportV1Options,
): Promise<LocalDataExportArtifactV1> {
  if (!UtcInstantSchema.safeParse(options.exportedAt).success) {
    invalidExport('The export timestamp must be a canonical UTC instant.');
  }
  const records = [...structuredClone(options.records)].sort((left, right) =>
    left.recordId.localeCompare(right.recordId),
  );
  const transactions = [...structuredClone(options.transactions)].sort(
    (left, right) => left.sequence - right.sequence,
  );
  const payloadSha256 = await options.hash(
    canonicalizeJson(exportPayload(records, transactions)),
  );
  if (!SHA256_HEX.test(payloadSha256)) {
    invalidExport('The export hasher returned an invalid SHA-256 digest.');
  }
  return {
    manifest: {
      format: 'nutrixx.local-export',
      exportVersion: LOCAL_EXPORT_VERSION,
      canonicalSchemaVersion: CANONICAL_SCHEMA_VERSION,
      databaseSchemaVersion: options.databaseSchemaVersion,
      exportedAt: options.exportedAt,
      recordCount: records.length,
      transactionCount: transactions.length,
      lastSequence: transactions.at(-1)?.sequence ?? 0,
      subjectIds: sortedSubjectIds(records),
      payloadSha256,
    },
    records,
    transactions,
  };
}

export async function validateLocalDataExportV1(
  input: unknown,
  options: ValidateLocalDataExportV1Options,
): Promise<LocalDataExportArtifactV1> {
  if (
    !isObject(input) ||
    !hasOnlyKeys(input, ['manifest', 'records', 'transactions']) ||
    !Array.isArray(input['records']) ||
    !Array.isArray(input['transactions'])
  ) {
    invalidExport('The local export artifact is malformed.');
  }
  const manifest = parseManifest(input['manifest']);
  const records = input['records'].map((candidate) => {
    const parsed = CanonicalRecordV1Schema.safeParse(candidate);
    if (!parsed.success)
      invalidExport('The export contains a malformed record.');
    return parsed.data;
  });
  const transactions = input['transactions'].map(parseTransaction);

  if (
    manifest.recordCount !== records.length ||
    manifest.transactionCount !== transactions.length ||
    manifest.lastSequence !== (transactions.at(-1)?.sequence ?? 0) ||
    canonicalizeJson(manifest.subjectIds as unknown as JsonValue) !==
      canonicalizeJson(sortedSubjectIds(records) as unknown as JsonValue)
  ) {
    invalidExport('The export manifest does not match its payload.');
  }

  const recordIds = new Set<string>();
  for (const record of records) {
    if (
      recordIds.has(record.recordId) ||
      !(await options.verifyRecord(record))
    ) {
      invalidExport('The export contains a duplicate or unverified record.');
    }
    recordIds.add(record.recordId);
  }

  const commandIds = new Set<string>();
  const transactionIds = new Set<string>();
  const replayed = new Map<string, CanonicalRecordV1>();
  let previousSequence = 0;
  for (const transaction of transactions) {
    if (
      transaction.sequence <= previousSequence ||
      commandIds.has(transaction.commandId) ||
      transactionIds.has(transaction.transactionId)
    ) {
      invalidExport('The transaction log order or identity is invalid.');
    }
    previousSequence = transaction.sequence;
    commandIds.add(transaction.commandId);
    transactionIds.add(transaction.transactionId);

    for (const mutation of transaction.mutations) {
      if (mutation.kind === 'put') {
        if (!(await options.verifyRecord(mutation.record))) {
          invalidExport('The transaction log contains an unverified record.');
        }
        let expected: typeof mutation.result;
        try {
          expected = classifyCanonicalWrite(
            replayed.get(mutation.record.recordId) ?? null,
            mutation.record,
          );
        } catch {
          invalidExport('The transaction log cannot be replayed consistently.');
        }
        if (expected !== mutation.result) {
          invalidExport(
            'A transaction result does not match replay semantics.',
          );
        }
        if (mutation.result !== 'unchanged') {
          replayed.set(mutation.record.recordId, mutation.record);
        }
      } else {
        const existed = replayed.delete(mutation.recordId);
        if (existed !== mutation.deleted) {
          invalidExport('A deletion result does not match replay semantics.');
        }
      }
    }
  }

  const replayedRecords = [...replayed.values()].sort((left, right) =>
    left.recordId.localeCompare(right.recordId),
  );
  const sortedRecords = [...records].sort((left, right) =>
    left.recordId.localeCompare(right.recordId),
  );
  if (
    canonicalizeJson(replayedRecords as unknown as JsonValue) !==
    canonicalizeJson(sortedRecords as unknown as JsonValue)
  ) {
    invalidExport('The current records do not match transaction-log replay.');
  }

  const payloadSha256 = await options.hash(
    canonicalizeJson(exportPayload(sortedRecords, transactions)),
  );
  if (payloadSha256 !== manifest.payloadSha256) {
    invalidExport('The export payload SHA-256 digest does not match.');
  }

  return structuredClone({
    manifest,
    records: sortedRecords,
    transactions,
  });
}
