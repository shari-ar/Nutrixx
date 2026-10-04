import * as z from 'zod';

import {
  CanonicalCodeSchema,
  CanonicalIdSchema,
  EvidenceMethodV1Schema,
  EvidenceSourceV1Schema,
  IanaTimeZoneSchema,
  NonnegativeCanonicalDecimalSchema,
  UnitV1Schema,
  UtcInstantSchema,
  createCanonicalRecordDraftV1Schema,
  createCanonicalRecordV1Schema,
} from '@nutrixx/canonical-schema';

const PositiveCanonicalDecimalSchema = NonnegativeCanonicalDecimalSchema.refine(
  (value) => value !== '0',
  'The value must be greater than zero.',
);

const DomainProvenanceV1Schema = z.strictObject({
  method: EvidenceMethodV1Schema,
  source: EvidenceSourceV1Schema,
  recordedAt: UtcInstantSchema,
});

export const MealItemReferenceV1Schema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('food'),
    catalogReleaseId: z.string().trim().min(1).max(200),
    foodId: CanonicalIdSchema,
    foodRevision: z.int().positive(),
  }),
  z.strictObject({
    kind: z.literal('recipe'),
    recipeId: CanonicalIdSchema,
    recipeVersion: z.int().positive(),
  }),
]);

export const MealItemV1Schema = z.strictObject({
  itemId: CanonicalIdSchema,
  position: z.int().positive(),
  displayNameSnapshot: z.string().trim().min(1).max(500),
  preparationState: CanonicalCodeSchema,
  reference: MealItemReferenceV1Schema,
  consumedQuantity: z.strictObject({
    amount: PositiveCanonicalDecimalSchema,
    unit: UnitV1Schema,
  }),
  edibleGramWeight: PositiveCanonicalDecimalSchema,
  provenance: DomainProvenanceV1Schema,
});

function duplicateValues(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function localDateFor(instant: string, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(instant));
    const value = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    return `${value['year']}-${value['month']}-${value['day']}`;
  } catch {
    return null;
  }
}

export const MealRevisionV1Schema = z
  .strictObject({
    mealId: CanonicalIdSchema,
    ownerSubjectId: CanonicalIdSchema,
    revision: z.int().positive(),
    state: z.enum(['recorded', 'voided']),
    occurredAt: UtcInstantSchema,
    localDate: z.iso.date(),
    timeZone: IanaTimeZoneSchema,
    mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'other']),
    items: z.array(MealItemV1Schema),
    note: z.string().trim().min(1).max(2_000).optional(),
    provenance: DomainProvenanceV1Schema,
    recordedAt: UtcInstantSchema,
  })
  .superRefine((meal, context) => {
    const actualLocalDate = localDateFor(meal.occurredAt, meal.timeZone);
    if (actualLocalDate === null) {
      context.addIssue({
        code: 'custom',
        path: ['timeZone'],
        message: 'The time zone must resolve through the active IANA data.',
      });
    } else if (actualLocalDate !== meal.localDate) {
      context.addIssue({
        code: 'custom',
        path: ['localDate'],
        message:
          'The local date must match the occurrence instant and time zone.',
      });
    }
    if (meal.state === 'recorded' && meal.items.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'A recorded meal requires at least one consumed item.',
      });
    }
    if (meal.state === 'voided' && meal.items.length !== 0) {
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'A voided meal retains history through earlier revisions.',
      });
    }
    for (const itemId of duplicateValues(
      meal.items.map(({ itemId }) => itemId),
    )) {
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: `Duplicate meal item identifier: ${itemId}.`,
      });
    }
    for (const position of duplicateValues(
      meal.items.map(({ position }) => String(position)),
    )) {
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: `Duplicate meal item position: ${position}.`,
      });
    }
    if (Date.parse(meal.recordedAt) < Date.parse(meal.occurredAt)) {
      context.addIssue({
        code: 'custom',
        path: ['recordedAt'],
        message: 'A meal cannot be recorded before it occurred.',
      });
    }
  });

export const MealHeadV1Schema = z.strictObject({
  mealId: CanonicalIdSchema,
  ownerSubjectId: CanonicalIdSchema,
  activeRevision: z.int().positive(),
  activeMealRecordId: CanonicalIdSchema,
  state: z.enum(['recorded', 'voided']),
});

export const ConsumptionEventV1Schema = z.strictObject({
  eventId: CanonicalIdSchema,
  eventType: z.enum(['meal.recorded', 'meal.corrected', 'meal.voided']),
  ownerSubjectId: CanonicalIdSchema,
  mealId: CanonicalIdSchema,
  mealRevision: z.int().positive(),
  mealRecordId: CanonicalIdSchema,
  mealOccurredAt: UtcInstantSchema,
  occurredAt: UtcInstantSchema,
});

export const RecordMealCommandV1Schema = z.strictObject({
  commandId: z.string().trim().min(1).max(200),
  mealRecordId: CanonicalIdSchema,
  eventRecordId: CanonicalIdSchema,
  eventId: CanonicalIdSchema,
  meal: MealRevisionV1Schema,
});

export const CorrectMealCommandV1Schema = z.strictObject({
  commandId: z.string().trim().min(1).max(200),
  expectedPreviousMealRecordId: CanonicalIdSchema,
  mealRecordId: CanonicalIdSchema,
  eventRecordId: CanonicalIdSchema,
  eventId: CanonicalIdSchema,
  meal: MealRevisionV1Schema,
});

function consumptionRecordRefinement(record: {
  owningContext: string;
  subjectId: string;
  logicalVersion: number;
  payload: {
    ownerSubjectId: string;
    mealId?: string;
    revision?: number;
    activeRevision?: number;
  };
}): boolean {
  const payloadVersion =
    record.payload.revision ?? record.payload.activeRevision ?? 1;
  return (
    record.owningContext === 'consumption' &&
    record.subjectId === record.payload.ownerSubjectId &&
    record.logicalVersion === payloadVersion
  );
}

export const MealRevisionRecordDraftV1Schema =
  createCanonicalRecordDraftV1Schema(
    'consumption.meal-revision',
    1,
    MealRevisionV1Schema,
  ).refine(consumptionRecordRefinement, {
    message: 'Meal revision envelope ownership or logical version is invalid.',
  });

export const MealRevisionRecordV1Schema = createCanonicalRecordV1Schema(
  'consumption.meal-revision',
  1,
  MealRevisionV1Schema,
).refine(consumptionRecordRefinement, {
  message: 'Meal revision envelope ownership or logical version is invalid.',
});

export const MealHeadRecordDraftV1Schema = createCanonicalRecordDraftV1Schema(
  'consumption.meal-head',
  1,
  MealHeadV1Schema,
).refine(
  (record) =>
    consumptionRecordRefinement(record) &&
    record.recordId === record.payload.mealId,
  { message: 'Meal head envelope identity is invalid.' },
);

export const MealHeadRecordV1Schema = createCanonicalRecordV1Schema(
  'consumption.meal-head',
  1,
  MealHeadV1Schema,
).refine(
  (record) =>
    consumptionRecordRefinement(record) &&
    record.recordId === record.payload.mealId,
  { message: 'Meal head envelope identity is invalid.' },
);

export const ConsumptionEventRecordDraftV1Schema =
  createCanonicalRecordDraftV1Schema(
    'consumption.event',
    1,
    ConsumptionEventV1Schema,
  ).refine(
    (record) =>
      record.owningContext === 'consumption' &&
      record.subjectId === record.payload.ownerSubjectId &&
      record.logicalVersion === 1,
    { message: 'Consumption event envelope ownership is invalid.' },
  );

export const ConsumptionEventRecordV1Schema = createCanonicalRecordV1Schema(
  'consumption.event',
  1,
  ConsumptionEventV1Schema,
).refine(
  (record) =>
    record.owningContext === 'consumption' &&
    record.subjectId === record.payload.ownerSubjectId &&
    record.logicalVersion === 1,
  { message: 'Consumption event envelope ownership is invalid.' },
);

export type MealItemReferenceV1 = z.infer<typeof MealItemReferenceV1Schema>;
export type MealItemV1 = z.infer<typeof MealItemV1Schema>;
export type MealRevisionV1 = z.infer<typeof MealRevisionV1Schema>;
export type MealHeadV1 = z.infer<typeof MealHeadV1Schema>;
export type ConsumptionEventV1 = z.infer<typeof ConsumptionEventV1Schema>;
export type RecordMealCommandV1 = z.infer<typeof RecordMealCommandV1Schema>;
export type CorrectMealCommandV1 = z.infer<typeof CorrectMealCommandV1Schema>;
export type MealRevisionRecordV1 = z.infer<typeof MealRevisionRecordV1Schema>;
export type MealHeadRecordV1 = z.infer<typeof MealHeadRecordV1Schema>;
