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
