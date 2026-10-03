import type { CanonicalRecordV1 } from '@nutrixx/canonical-schema';

export type CanonicalWriteResult = 'inserted' | 'updated' | 'unchanged';

export interface CanonicalRecordRepository {
  put(record: CanonicalRecordV1): Promise<CanonicalWriteResult>;
  getById(recordId: string): Promise<CanonicalRecordV1 | null>;
  listBySubject(subjectId: string): Promise<readonly CanonicalRecordV1[]>;
  deleteById(recordId: string): Promise<boolean>;
  close(): Promise<void>;
}

export type CanonicalRecordVerifier = (
  record: CanonicalRecordV1,
) => Promise<boolean>;

export type PersistenceErrorCode =
  | 'command-conflict'
  | 'closed'
  | 'identity-conflict'
  | 'invalid-command'
  | 'invalid-record'
  | 'stale-write'
  | 'unsupported-schema'
  | 'version-conflict';

export class PersistenceError extends Error {
  public constructor(
    public readonly code: PersistenceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PersistenceError';
  }
}
