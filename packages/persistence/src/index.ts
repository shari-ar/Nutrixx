export {
  PersistenceError,
  type CanonicalRecordRepository,
  type CanonicalRecordVerifier,
  type CanonicalWriteResult,
  type PersistenceErrorCode,
} from './repository.js';
export {
  classifyCanonicalWrite,
  validateCanonicalRecord,
} from './write-policy.js';
export {
  LOCAL_EXPORT_VERSION,
  commandFromTransactionEntry,
  createLocalDataExportV1,
  validateLocalDataExportV1,
  type CanonicalPayloadHasher,
  type CreateLocalDataExportV1Options,
  type LocalDataExportArtifactV1,
  type LocalDataExportImportRepository,
  type LocalDataExportManifestV1,
  type ValidateLocalDataExportV1Options,
} from './local-export.js';
export type {
  AtomicCanonicalRecordRepository,
  CanonicalRecordMutation,
  CanonicalRecordMutationResult,
  CanonicalTransactionCommand,
  CanonicalTransactionLogEntryV1,
  CanonicalTransactionResult,
  DeleteCanonicalRecordMutation,
  DeleteCanonicalRecordMutationResult,
  PutCanonicalRecordMutation,
  PutCanonicalRecordMutationResult,
} from './transaction-log.js';
export type {
  CachedReferenceReleaseV1,
  ReferenceCachePruneResult,
  ReferenceCacheWriteResult,
  ReferenceDatasetCache,
  ReferenceReleaseInputV1,
  ReferenceReleaseSummaryV1,
} from './reference-cache.js';
