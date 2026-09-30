import {
  CanonicalRecordV1Schema,
  canonicalizeJson,
  type CanonicalRecordV1,
  type JsonValue,
} from '@nutrixx/canonical-schema';

import {
  PersistenceError,
  type CanonicalRecordVerifier,
  type CanonicalWriteResult,
} from './repository.js';

export async function validateCanonicalRecord(
  input: unknown,
  verifyRecord: CanonicalRecordVerifier,
): Promise<CanonicalRecordV1> {
  const result = CanonicalRecordV1Schema.safeParse(input);
  if (!result.success || !(await verifyRecord(result.data))) {
    throw new PersistenceError(
      'invalid-record',
      'The canonical record is malformed or its integrity seal is invalid.',
    );
  }
  return result.data;
}

export function classifyCanonicalWrite(
  existing: CanonicalRecordV1 | null,
  incoming: CanonicalRecordV1,
): CanonicalWriteResult {
  if (existing === null) return 'inserted';

  if (incoming.logicalVersion < existing.logicalVersion) {
    throw new PersistenceError('stale-write', 'A newer record already exists.');
  }

  if (incoming.logicalVersion === existing.logicalVersion) {
    if (
      canonicalizeJson(incoming as unknown as JsonValue) ===
      canonicalizeJson(existing as unknown as JsonValue)
    ) {
      return 'unchanged';
    }
    throw new PersistenceError(
      'version-conflict',
      'Different content cannot share one logical version.',
    );
  }

  if (
    incoming.subjectId !== existing.subjectId ||
    incoming.recordType !== existing.recordType ||
    incoming.owningContext !== existing.owningContext
  ) {
    throw new PersistenceError(
      'identity-conflict',
      'A record update cannot change its stable identity fields.',
    );
  }

  return 'updated';
}
