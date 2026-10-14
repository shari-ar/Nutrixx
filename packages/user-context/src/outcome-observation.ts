import * as z from 'zod';

import {
  CanonicalDecimalSchema,
  CanonicalIdSchema,
  NonnegativeCanonicalDecimalSchema,
  UtcInstantSchema,
  createCanonicalRecordV1Schema,
} from '@nutrixx/canonical-schema';

const CommonFields = {
  observationId: CanonicalIdSchema,
  ownerSubjectId: CanonicalIdSchema,
  observedOn: z.iso.date(),
  recordedAt: UtcInstantSchema,
};

const WeightObservationV1Schema = z.strictObject({
  ...CommonFields,
  kind: z.literal('weight'),
  weightKilograms: NonnegativeCanonicalDecimalSchema.refine(
    (value) => Number(value) > 0 && Number(value) <= 1000,
    'Weight must be greater than zero and at most 1,000 kg.',
  ),
});

const LabObservationV1Schema = z.strictObject({
  ...CommonFields,
  kind: z.literal('lab'),
  testName: z.string().trim().min(1).max(120),
  result: CanonicalDecimalSchema.refine(
    (value) => Number.isFinite(Number(value)),
    'The reported result must be finite.',
  ),
  unit: z.string().trim().min(1).max(40),
  laboratory: z.string().trim().min(1).max(120),
});

export const OutcomeObservationV1Schema = z.discriminatedUnion('kind', [
  WeightObservationV1Schema,
  LabObservationV1Schema,
]);

export const OutcomeObservationRecordV1Schema = createCanonicalRecordV1Schema(
  'user-context.outcome-observation',
  1,
  OutcomeObservationV1Schema,
).refine(
  (record) =>
    record.recordId === record.payload.observationId &&
    record.subjectId === record.payload.ownerSubjectId &&
    record.owningContext === 'user-context' &&
    record.logicalVersion === 1 &&
    record.createdAt === record.payload.recordedAt &&
    record.updatedAt === record.payload.recordedAt,
  'Outcome observation envelope identity or version is invalid.',
);

export type OutcomeObservationV1 = z.infer<typeof OutcomeObservationV1Schema>;
export type OutcomeObservationRecordV1 = z.infer<
  typeof OutcomeObservationRecordV1Schema
>;

export type SaveOutcomeObservationV1 =
  | Omit<z.infer<typeof WeightObservationV1Schema>, 'recordedAt'>
  | Omit<z.infer<typeof LabObservationV1Schema>, 'recordedAt'>;
