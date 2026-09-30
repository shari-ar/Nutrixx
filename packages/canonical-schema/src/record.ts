import * as z from 'zod';

import { canonicalizeJson } from './canonical-json.js';
import {
  CANONICAL_SCHEMA_VERSION,
  CanonicalCodeSchema,
  CanonicalIdSchema,
  JsonValueSchema,
  UtcInstantSchema,
  type JsonValue,
} from './primitives.js';
import {
  EvidenceMethodV1Schema,
  EvidenceSourceV1Schema,
  IntegrityV1Schema,
} from './value-objects.js';

export const OwningContextV1Schema = z.enum([
  'identity-consent',
  'user-context',
  'food-knowledge',
  'recipe-knowledge',
  'consumption',
  'nutrition-science',
  'nutrition-state',
  'planning',
  'data-publication',
  'audit-provenance',
  'commerce-entitlements',
  'portability-sync',
  'ai-orchestration',
]);

export const RecordProvenanceV1Schema = z.strictObject({
  method: EvidenceMethodV1Schema,
  source: EvidenceSourceV1Schema,
  recordedAt: UtcInstantSchema,
});

const canonicalRecordDraftShape = {
  format: z.literal('nutrixx.canonical-record'),
  schemaVersion: z.literal(CANONICAL_SCHEMA_VERSION),
  recordType: CanonicalCodeSchema,
  recordVersion: z.int().positive(),
  recordId: CanonicalIdSchema,
  subjectId: CanonicalIdSchema,
  owningContext: OwningContextV1Schema,
  logicalVersion: z.int().positive(),
  createdAt: UtcInstantSchema,
  updatedAt: UtcInstantSchema,
  correctionOf: CanonicalIdSchema.optional(),
  provenance: RecordProvenanceV1Schema,
  payload: JsonValueSchema,
};

export const CanonicalRecordDraftV1Schema = z
  .strictObject(canonicalRecordDraftShape)
  .meta({ title: 'CanonicalRecordDraftV1' });

export const CanonicalRecordV1Schema = z
  .strictObject({
    ...canonicalRecordDraftShape,
    integrity: IntegrityV1Schema,
  })
  .meta({
    $id: 'urn:nutrixx:schema:canonical-record:1',
    title: 'CanonicalRecordV1',
    description:
      'Storage-neutral, integrity-sealed Nutrixx canonical record envelope.',
  });

export function createCanonicalRecordDraftV1Schema<
  const RecordType extends string,
  const RecordVersion extends number,
  PayloadSchema extends z.ZodType,
>(
  recordType: RecordType,
  recordVersion: RecordVersion,
  payloadSchema: PayloadSchema,
) {
  return CanonicalRecordDraftV1Schema.extend({
    recordType: z.literal(recordType),
    recordVersion: z.literal(recordVersion),
    payload: payloadSchema,
  });
}

export function createCanonicalRecordV1Schema<
  const RecordType extends string,
  const RecordVersion extends number,
  PayloadSchema extends z.ZodType,
>(
  recordType: RecordType,
  recordVersion: RecordVersion,
  payloadSchema: PayloadSchema,
) {
  return CanonicalRecordV1Schema.extend({
    recordType: z.literal(recordType),
    recordVersion: z.literal(recordVersion),
    payload: payloadSchema,
  });
}

export type CanonicalRecordDraftV1 = z.infer<
  typeof CanonicalRecordDraftV1Schema
>;
export type CanonicalRecordV1 = z.infer<typeof CanonicalRecordV1Schema>;

export interface CanonicalInvariantIssue {
  readonly code: 'correction-cycle' | 'invalid-time-order';
  readonly path: 'correctionOf' | 'updatedAt';
  readonly message: string;
}

export function inspectCanonicalRecordV1Invariants(
  record: CanonicalRecordDraftV1 | CanonicalRecordV1,
): readonly CanonicalInvariantIssue[] {
  const issues: CanonicalInvariantIssue[] = [];

  if (Date.parse(record.updatedAt) < Date.parse(record.createdAt)) {
    issues.push({
      code: 'invalid-time-order',
      path: 'updatedAt',
      message: 'updatedAt cannot precede createdAt.',
    });
  }

  if (record.correctionOf === record.recordId) {
    issues.push({
      code: 'correction-cycle',
      path: 'correctionOf',
      message: 'A record cannot correct itself.',
    });
  }

  return issues;
}

export function canonicalRecordHashInput(
  record: CanonicalRecordDraftV1 | CanonicalRecordV1,
): string {
  const { integrity: _integrity, ...draft } = record as CanonicalRecordV1;
  return canonicalizeJson(draft as JsonValue);
}

export type Sha256HexDigest = (
  canonicalUtf8Input: string,
) => Promise<string> | string;

export async function sealCanonicalRecordV1(
  input: unknown,
  digestSha256Hex: Sha256HexDigest,
): Promise<CanonicalRecordV1> {
  const draft = CanonicalRecordDraftV1Schema.parse(input);
  const issues = inspectCanonicalRecordV1Invariants(draft);

  if (issues.length > 0) {
    throw new TypeError(issues.map((issue) => issue.message).join(' '));
  }

  const value = await digestSha256Hex(canonicalRecordHashInput(draft));
  return CanonicalRecordV1Schema.parse({
    ...draft,
    integrity: {
      algorithm: 'sha-256',
      canonicalization: 'rfc8785',
      value,
    },
  });
}

export async function verifyCanonicalRecordV1(
  input: unknown,
  digestSha256Hex: Sha256HexDigest,
): Promise<boolean> {
  const result = CanonicalRecordV1Schema.safeParse(input);
  if (!result.success) {
    return false;
  }

  const record = result.data;
  const issues = inspectCanonicalRecordV1Invariants(record);
  if (issues.length > 0) {
    return false;
  }

  const actual = await digestSha256Hex(canonicalRecordHashInput(record));
  return actual === record.integrity.value;
}
