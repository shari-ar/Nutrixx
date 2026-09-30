import * as z from 'zod';

import {
  CanonicalCodeSchema,
  CanonicalDecimalSchema,
  CanonicalFractionSchema,
  CanonicalIdSchema,
  JsonValueSchema,
  NonnegativeCanonicalDecimalSchema,
  UtcInstantSchema,
} from './primitives.js';

export const QuantityBasisV1Schema = z.enum([
  'absolute',
  'per-100-gram-edible',
  'per-100-milliliter',
  'per-serving',
  'per-recipe-yield',
  'per-consumed-quantity',
]);

export const UnitV1Schema = z.strictObject({
  system: z.enum(['ucum', 'nutrixx']),
  code: z.string().min(1).max(64),
});

export const QuantityV1Schema = z
  .strictObject({
    value: CanonicalDecimalSchema,
    unit: UnitV1Schema,
    basis: QuantityBasisV1Schema,
    significantDigits: z.int().min(1).max(34).optional(),
  })
  .meta({ title: 'QuantityV1' });

export const UnknownReasonV1Schema = z.enum([
  'not-measured',
  'not-provided',
  'not-applicable',
  'not-resolvable',
  'withheld',
  'unsupported',
]);

export const EvidenceValueV1Schema = z.discriminatedUnion('state', [
  z.strictObject({
    state: z.literal('known'),
    value: JsonValueSchema,
  }),
  z.strictObject({
    state: z.literal('unknown'),
    reason: UnknownReasonV1Schema,
    detailCode: CanonicalCodeSchema.optional(),
  }),
]);

export const EvidenceMethodV1Schema = z.enum([
  'observed',
  'user-entered',
  'imported',
  'calculated',
  'estimated',
  'defaulted',
]);

export const EvidenceSourceV1Schema = z.strictObject({
  kind: z.enum(['user', 'dataset', 'device', 'calculation', 'import']),
  sourceId: z.string().min(1).max(512),
  sourceVersion: z.string().min(1).max(128).optional(),
  sourceRecordId: z.string().min(1).max(512).optional(),
  licenseId: z.string().min(1).max(256).optional(),
});

export const QualityAssessmentV1Schema = z.enum([
  'unknown',
  'low',
  'moderate',
  'high',
  'not-applicable',
]);

export const QualityDimensionV1Schema = z.strictObject({
  dimension: z.enum([
    'source-reliability',
    'measurement-uncertainty',
    'completeness',
    'recency-applicability',
    'review-status',
  ]),
  assessment: QualityAssessmentV1Schema,
  rationaleCode: CanonicalCodeSchema.optional(),
});

export const UncertaintyV1Schema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('not-quantified') }),
  z.strictObject({
    kind: z.literal('interval'),
    lower: CanonicalDecimalSchema,
    upper: CanonicalDecimalSchema,
    confidence: CanonicalFractionSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal('plus-minus'),
    amount: NonnegativeCanonicalDecimalSchema,
    confidence: CanonicalFractionSchema.optional(),
  }),
]);

export const ValidIntervalV1Schema = z.strictObject({
  start: UtcInstantSchema,
  end: UtcInstantSchema.optional(),
});

export const EvidenceFactV1Schema = z
  .strictObject({
    subjectId: CanonicalIdSchema,
    semanticId: CanonicalCodeSchema,
    value: EvidenceValueV1Schema,
    validInterval: ValidIntervalV1Schema,
    recordedAt: UtcInstantSchema,
    method: EvidenceMethodV1Schema,
    source: EvidenceSourceV1Schema,
    quality: z.array(QualityDimensionV1Schema).max(5),
    uncertainty: UncertaintyV1Schema,
    lineage: z.array(CanonicalIdSchema),
  })
  .meta({ title: 'EvidenceFactV1' });

export const VersionReferenceV1Schema = z.strictObject({
  component: CanonicalCodeSchema,
  version: z.string().min(1).max(128),
});

export const IntegrityV1Schema = z.strictObject({
  algorithm: z.literal('sha-256'),
  canonicalization: z.literal('rfc8785'),
  value: z.string().regex(/^[a-f0-9]{64}$/),
});

export const DerivedSnapshotV1Schema = z
  .strictObject({
    payload: JsonValueSchema,
    period: ValidIntervalV1Schema,
    inputRecordIds: z.array(CanonicalIdSchema).min(1),
    versions: z.array(VersionReferenceV1Schema).min(1),
    completeness: CanonicalFractionSchema,
    limitationCodes: z.array(CanonicalCodeSchema),
    outputIntegrity: IntegrityV1Schema,
    createdAt: UtcInstantSchema,
  })
  .meta({ title: 'DerivedSnapshotV1' });

export type QuantityV1 = z.infer<typeof QuantityV1Schema>;
export type EvidenceFactV1 = z.infer<typeof EvidenceFactV1Schema>;
export type DerivedSnapshotV1 = z.infer<typeof DerivedSnapshotV1Schema>;
