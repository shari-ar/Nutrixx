import * as z from 'zod';

import {
  CanonicalCodeSchema,
  CanonicalFractionSchema,
  CanonicalIdSchema,
  NonnegativeCanonicalDecimalSchema,
  QuantityBasisV1Schema,
  QualityDimensionV1Schema,
  UnitV1Schema,
  UnknownReasonV1Schema,
  UtcInstantSchema,
} from '@nutrixx/canonical-schema';

const PositiveCanonicalDecimalSchema = NonnegativeCanonicalDecimalSchema.refine(
  (value) => value !== '0',
  'The value must be greater than zero.',
);

export const LocaleTagV1Schema = z
  .string()
  .min(2)
  .max(35)
  .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)
  .transform((value) => Intl.getCanonicalLocales(value)[0] ?? value);

export const LocalizedFoodTextV1Schema = z.strictObject({
  locale: LocaleTagV1Schema,
  value: z.string().trim().min(1).max(500),
  kind: z.enum(['primary', 'alias']),
});

export const FoodCatalogSourceV1Schema = z.strictObject({
  sourceId: CanonicalIdSchema,
  provider: CanonicalCodeSchema,
  dataset: CanonicalCodeSchema,
  sourceRelease: z.string().trim().min(1).max(128),
  sourceRecordId: z.string().trim().min(1).max(128),
  licenseId: z.string().trim().min(1).max(128),
  retrievedAt: UtcInstantSchema,
});

export const FoodV1Schema = z.strictObject({
  foodId: CanonicalIdSchema,
  revision: z.int().positive(),
  foodClass: CanonicalCodeSchema,
  descriptions: z.array(LocalizedFoodTextV1Schema).min(1),
  categories: z.array(
    z.strictObject({
      sourceCategoryId: z.string().trim().min(1).max(128).optional(),
      locale: LocaleTagV1Schema,
      description: z.string().trim().min(1).max(500),
    }),
  ),
  preparationStates: z.array(CanonicalCodeSchema).min(1),
  sourceId: CanonicalIdSchema,
});

export const FoodPortionV1Schema = z.strictObject({
  portionId: CanonicalIdSchema,
  foodId: CanonicalIdSchema,
  foodRevision: z.int().positive(),
  description: LocalizedFoodTextV1Schema,
  amount: PositiveCanonicalDecimalSchema,
  measureUnit: UnitV1Schema,
  gramWeight: PositiveCanonicalDecimalSchema,
  edibleFraction: CanonicalFractionSchema,
  sourceId: CanonicalIdSchema,
});

export const FoodCompositionValueV1Schema = z.discriminatedUnion('state', [
  z.strictObject({
    state: z.literal('known'),
    amount: NonnegativeCanonicalDecimalSchema,
    unit: UnitV1Schema,
    basis: QuantityBasisV1Schema,
  }),
  z.strictObject({
    state: z.literal('unknown'),
    reason: UnknownReasonV1Schema,
  }),
]);

export const FoodCompositionObservationV1Schema = z.strictObject({
  observationId: CanonicalIdSchema,
  foodId: CanonicalIdSchema,
  foodRevision: z.int().positive(),
  nutrientId: CanonicalCodeSchema,
  sourceNutrientId: z.string().trim().min(1).max(128),
  sourceNutrientName: z.string().trim().min(1).max(500),
  sourceNutrientNumber: z.string().trim().min(1).max(128).optional(),
  derivationCode: z.string().trim().min(1).max(128).optional(),
  dataPoints: z.int().nonnegative().optional(),
  preparationState: CanonicalCodeSchema,
  value: FoodCompositionValueV1Schema,
  sourceId: CanonicalIdSchema,
  quality: z.array(QualityDimensionV1Schema).max(5),
});

export const FoodCatalogSourceDatasetV1Schema = z.strictObject({
  provider: CanonicalCodeSchema,
  dataset: CanonicalCodeSchema,
  sourceRelease: z.string().trim().min(1).max(128),
  licenseId: z.string().trim().min(1).max(128),
  homepage: z.url(),
});

export const FoodCatalogCoverageV1Schema = z.strictObject({
  foodsWithPortions: CanonicalFractionSchema,
  foodsWithComposition: CanonicalFractionSchema,
  observationsWithKnownValues: CanonicalFractionSchema,
});

export const FoodCatalogManifestV1Schema = z.strictObject({
  format: z.literal('nutrixx.food-catalog-manifest'),
  schemaVersion: z.literal(1),
  releaseId: z.string().trim().min(1).max(200),
  publishedAt: UtcInstantSchema,
  sourceDatasets: z.array(FoodCatalogSourceDatasetV1Schema).min(1),
  counts: z.strictObject({
    sources: z.int().nonnegative(),
    foods: z.int().nonnegative(),
    portions: z.int().nonnegative(),
    compositionObservations: z.int().nonnegative(),
  }),
  coverage: FoodCatalogCoverageV1Schema,
  quality: z.strictObject({
    sourceEntries: z.int().nonnegative(),
    quarantinedEntries: z.int().nonnegative(),
    sourceComponents: z.int().nonnegative(),
    quarantinedComponents: z.int().nonnegative(),
    quarantineReasonCounts: z.record(
      CanonicalCodeSchema,
      z.int().nonnegative(),
    ),
  }),
});

function duplicates(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

export const FoodCatalogPayloadV1Schema = z
  .strictObject({
    format: z.literal('nutrixx.food-catalog'),
    schemaVersion: z.literal(1),
    sources: z.array(FoodCatalogSourceV1Schema),
    foods: z.array(FoodV1Schema),
    portions: z.array(FoodPortionV1Schema),
    composition: z.array(FoodCompositionObservationV1Schema),
  })
  .superRefine((payload, context) => {
    const duplicateGroups = [
      {
        field: 'source identifier',
        values: payload.sources.map(({ sourceId }) => sourceId),
      },
      {
        field: 'food revision',
        values: payload.foods.map(
          ({ foodId, revision }) => `${foodId}:${revision}`,
        ),
      },
      {
        field: 'portion identifier',
        values: payload.portions.map(({ portionId }) => portionId),
      },
      {
        field: 'composition observation identifier',
        values: payload.composition.map(({ observationId }) => observationId),
      },
    ];
    for (const group of duplicateGroups) {
      for (const value of duplicates(group.values)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate ${group.field}: ${value}.`,
        });
      }
    }

    const foodRevisions = new Set(
      payload.foods.map(({ foodId, revision }) => `${foodId}:${revision}`),
    );
    const sourceIds = new Set(payload.sources.map(({ sourceId }) => sourceId));
    for (const food of payload.foods) {
      if (!sourceIds.has(food.sourceId)) {
        context.addIssue({
          code: 'custom',
          path: ['foods'],
          message: `Food ${food.foodId} references an unavailable source.`,
        });
      }
    }
    for (const portion of payload.portions) {
      if (!foodRevisions.has(`${portion.foodId}:${portion.foodRevision}`)) {
        context.addIssue({
          code: 'custom',
          path: ['portions'],
          message: `Portion ${portion.portionId} references an unavailable food revision.`,
        });
      }
      if (!sourceIds.has(portion.sourceId)) {
        context.addIssue({
          code: 'custom',
          path: ['portions'],
          message: `Portion ${portion.portionId} references an unavailable source.`,
        });
      }
    }
    for (const observation of payload.composition) {
      if (
        !foodRevisions.has(`${observation.foodId}:${observation.foodRevision}`)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['composition'],
          message: `Observation ${observation.observationId} references an unavailable food revision.`,
        });
      }
      if (!sourceIds.has(observation.sourceId)) {
        context.addIssue({
          code: 'custom',
          path: ['composition'],
          message: `Observation ${observation.observationId} references an unavailable source.`,
        });
      }
    }
  });

export type FoodV1 = z.infer<typeof FoodV1Schema>;
export type FoodPortionV1 = z.infer<typeof FoodPortionV1Schema>;
export type FoodCompositionObservationV1 = z.infer<
  typeof FoodCompositionObservationV1Schema
>;
export type FoodCatalogManifestV1 = z.infer<typeof FoodCatalogManifestV1Schema>;
export type FoodCatalogPayloadV1 = z.infer<typeof FoodCatalogPayloadV1Schema>;
