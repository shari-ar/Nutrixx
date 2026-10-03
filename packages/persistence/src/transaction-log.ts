import type { CanonicalRecordV1 } from '@nutrixx/canonical-schema';

import type {
  CanonicalRecordRepository,
  CanonicalWriteResult,
} from './repository.js';

export interface PutCanonicalRecordMutation {
  readonly kind: 'put';
  readonly record: CanonicalRecordV1;
}

export interface DeleteCanonicalRecordMutation {
  readonly kind: 'delete';
  readonly recordId: string;
}

export type CanonicalRecordMutation =
  | PutCanonicalRecordMutation
  | DeleteCanonicalRecordMutation;

export interface CanonicalTransactionCommand {
  readonly commandId: string;
  readonly occurredAt: string;
  readonly mutations: readonly CanonicalRecordMutation[];
}

export interface PutCanonicalRecordMutationResult {
  readonly kind: 'put';
  readonly record: CanonicalRecordV1;
  readonly result: CanonicalWriteResult;
}

export interface DeleteCanonicalRecordMutationResult {
  readonly kind: 'delete';
  readonly recordId: string;
  readonly deleted: boolean;
}

export type CanonicalRecordMutationResult =
  | PutCanonicalRecordMutationResult
  | DeleteCanonicalRecordMutationResult;

export interface CanonicalTransactionLogEntryV1 {
  readonly format: 'nutrixx.local-transaction';
  readonly schemaVersion: 1;
  readonly sequence: number;
  readonly transactionId: string;
  readonly commandId: string;
  readonly occurredAt: string;
  readonly committedAt: string;
  readonly mutations: readonly CanonicalRecordMutationResult[];
}

export interface CanonicalTransactionResult {
  readonly entry: CanonicalTransactionLogEntryV1;
  readonly replayed: boolean;
}

export interface AtomicCanonicalRecordRepository
  extends CanonicalRecordRepository {
  commit(
    command: CanonicalTransactionCommand,
  ): Promise<CanonicalTransactionResult>;
  listTransactions(
    afterSequence?: number,
    limit?: number,
  ): Promise<readonly CanonicalTransactionLogEntryV1[]>;
}
