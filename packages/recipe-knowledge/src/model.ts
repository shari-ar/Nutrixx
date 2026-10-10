import * as z from 'zod';

import {
  CanonicalCodeSchema,
  CanonicalFractionSchema,
  CanonicalIdSchema,
  EvidenceMethodV1Schema,
  EvidenceSourceV1Schema,
  NonnegativeCanonicalDecimalSchema,
  UnitV1Schema,
  UnknownReasonV1Schema,
  UtcInstantSchema,
  VersionReferenceV1Schema,
  createCanonicalRecordDraftV1Schema,
  createCanonicalRecordV1Schema,
} from '@nutrixx/canonical-schema';
import {
  FoodCatalogPayloadV1Schema,
  LocalizedFoodTextV1Schema,
} from '@nutrixx/food-knowledge';

export const PositiveCanonicalDecimalSchema =
  NonnegativeCanonicalDecimalSchema.refine(
    (value) => value !== '0',
    'The value must be greater than zero.',
  );

export const RecipeIdentityV1Schema = z.strictObject({
  recipeId: CanonicalIdSchema,
  ownerSubjectId: CanonicalIdSchema,
  origin: z.enum(['user', 'curated']),
  createdAt: UtcInstantSchema,
});

export const RecipeIngredientReferenceV1Schema = z.discriminatedUnion('kind', [
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

export const RecipeRetentionFactorV1Schema = z.strictObject({
  nutrientId: CanonicalCodeSchema,
  factor: CanonicalFractionSchema,
  rule: VersionReferenceV1Schema,
});

export const RecipeIngredientV1Schema = z.strictObject({
  ingredientId: CanonicalIdSchema,
  position: z.int().positive(),
  label: z.string().trim().min(1).max(500),
  reference: RecipeIngredientReferenceV1Schema,
  inputQuantity: z.strictObject({
    amount: PositiveCanonicalDecimalSchema,
    unit: UnitV1Schema,
  }),
  edibleGramWeight: PositiveCanonicalDecimalSchema,
  retentionFactors: z.array(RecipeRetentionFactorV1Schema),
  cookingYieldFactor: PositiveCanonicalDecimalSchema.optional(),
  cookingYieldRule: VersionReferenceV1Schema.optional(),
});

export const RecipeYieldV1Schema = z.strictObject({
  finalEdibleGramWeight: PositiveCanonicalDecimalSchema,
  servings: PositiveCanonicalDecimalSchema,
  determination: z.enum([
    'measured',
    'user-entered',
    'calculated',
    'policy-approved',
  ]),
  yieldFactor: PositiveCanonicalDecimalSchema.optional(),
  yieldRule: VersionReferenceV1Schema.optional(),
});

export const RecipePreparationStepV1Schema = z.strictObject({
  position: z.int().positive(),
  instruction: z.string().trim().min(1).max(5_000),
  ingredientIds: z.array(CanonicalIdSchema).optional(),
});

export const RecipeCalculationRuleV1Schema = z.strictObject({
  component: z.literal('recipe-calculation'),
  version: z.string().trim().min(1).max(128),
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

export const RecipeVersionV1Schema = z
  .strictObject({
    recipeId: CanonicalIdSchema,
    version: z.int().positive(),
    names: z.array(LocalizedFoodTextV1Schema).min(1),
    ingredients: z.array(RecipeIngredientV1Schema).min(1),
    preparationSteps: z.array(RecipePreparationStepV1Schema),
    outputFood: z
      .strictObject({
        foodId: CanonicalIdSchema,
        nutrition: z.lazy(() => RecipeNutritionCalculationV1Schema),
      })
      .optional(),
    yield: RecipeYieldV1Schema,
    calculationRule: RecipeCalculationRuleV1Schema,
    provenance: z.strictObject({
      method: EvidenceMethodV1Schema,
      source: EvidenceSourceV1Schema,
    }),
    publishedAt: UtcInstantSchema,
  })
  .superRefine((recipe, context) => {
    const groups = [
      {
        label: 'ingredient identifier',
        values: recipe.ingredients.map(({ ingredientId }) => ingredientId),
      },
      {
        label: 'ingredient position',
        values: recipe.ingredients.map(({ position }) => String(position)),
      },
      {
        label: 'preparation-step position',
        values: recipe.preparationSteps.map(({ position }) => String(position)),
      },
    ];
    for (const group of groups) {
      for (const duplicate of duplicates(group.values)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate ${group.label}: ${duplicate}.`,
        });
      }
    }

    for (const [ingredientIndex, ingredient] of recipe.ingredients.entries()) {
      if (
        ingredient.reference.kind === 'recipe' &&
        ingredient.reference.recipeId === recipe.recipeId
      ) {
        context.addIssue({
          code: 'custom',
          path: ['ingredients', ingredientIndex, 'reference'],
          message: 'A recipe version cannot include its own recipe identity.',
        });
      }
      for (const nutrientId of duplicates(
        ingredient.retentionFactors.map(({ nutrientId }) => nutrientId),
      )) {
        context.addIssue({
          code: 'custom',
          path: ['ingredients', ingredientIndex, 'retentionFactors'],
          message: `Duplicate retention factor for nutrient: ${nutrientId}.`,
        });
      }
    }

    const ingredientIds = new Set(
      recipe.ingredients.map(({ ingredientId }) => ingredientId),
    );
    for (const [stepIndex, step] of recipe.preparationSteps.entries()) {
      for (const ingredientId of step.ingredientIds ?? []) {
        if (!ingredientIds.has(ingredientId)) {
          context.addIssue({
            code: 'custom',
            path: ['preparationSteps', stepIndex, 'ingredientIds'],
            message:
              'A preparation step must reference an ingredient in this recipe version.',
          });
        }
      }
      if (duplicates(step.ingredientIds ?? []).length > 0) {
        context.addIssue({
          code: 'custom',
          path: ['preparationSteps', stepIndex, 'ingredientIds'],
          message: 'A preparation step cannot repeat one ingredient.',
        });
      }
    }

    if (
      recipe.outputFood !== undefined &&
      (recipe.outputFood.nutrition.recipeId !== recipe.recipeId ||
        recipe.outputFood.nutrition.recipeVersion !== recipe.version ||
        recipe.outputFood.nutrition.finalEdibleGramWeight !==
          recipe.yield.finalEdibleGramWeight ||
        recipe.outputFood.nutrition.servings !== recipe.yield.servings)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['outputFood'],
        message:
          'The output food nutrition must describe this exact recipe version.',
      });
    }

    if (
      (recipe.yield.yieldFactor === undefined) !==
      (recipe.yield.yieldRule === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['yield'],
        message: 'A yield factor and its governing rule must appear together.',
      });
    }
  });

export const RecipeCalculationPolicyV1Schema = z.strictObject({
  rule: RecipeCalculationRuleV1Schema,
  decimalPlaces: z.int().min(0).max(12),
  rounding: z.literal('half-even'),
});

export const ResolvedIngredientCompositionV1Schema = z.discriminatedUnion(
  'state',
  [
    z.strictObject({
      state: z.literal('known'),
      amountPer100Gram: NonnegativeCanonicalDecimalSchema,
      unit: UnitV1Schema,
    }),
    z.strictObject({
      state: z.literal('unknown'),
      reason: UnknownReasonV1Schema,
    }),
  ],
);

const RecipeCalculatedAmountV1Schema = z.strictObject({
  amount: NonnegativeCanonicalDecimalSchema,
  unit: UnitV1Schema,
});

export const RecipeNutrientCalculationV1Schema = z.discriminatedUnion('state', [
  z.strictObject({
    state: z.literal('known'),
    nutrientId: CanonicalCodeSchema,
    total: RecipeCalculatedAmountV1Schema,
    per100Gram: RecipeCalculatedAmountV1Schema,
    perServing: RecipeCalculatedAmountV1Schema,
    completeness: z.literal('1'),
  }),
  z.strictObject({
    state: z.literal('incomplete'),
    nutrientId: CanonicalCodeSchema,
    knownTotal: RecipeCalculatedAmountV1Schema.optional(),
    completeness: CanonicalFractionSchema,
    missingIngredientIds: z.array(CanonicalIdSchema).min(1),
    reasonCodes: z.array(CanonicalCodeSchema).min(1),
  }),
]);

export const RecipeNutritionCalculationV1Schema = z.strictObject({
  recipeId: CanonicalIdSchema,
  recipeVersion: z.int().positive(),
  finalEdibleGramWeight: PositiveCanonicalDecimalSchema,
  servings: PositiveCanonicalDecimalSchema,
  calculationRule: VersionReferenceV1Schema,
  nutrients: z.array(RecipeNutrientCalculationV1Schema),
});

export const RecipeOutputFoodVersionV1Schema = z
  .strictObject({
    foodId: CanonicalIdSchema,
    ownerSubjectId: CanonicalIdSchema,
    revision: z.int().positive(),
    recipeId: CanonicalIdSchema,
    recipeVersion: z.int().positive(),
    catalog: FoodCatalogPayloadV1Schema,
    nutrition: RecipeNutritionCalculationV1Schema,
    publishedAt: UtcInstantSchema,
  })
  .refine(
    (food) =>
      food.revision === food.recipeVersion &&
      food.nutrition.recipeId === food.recipeId &&
      food.nutrition.recipeVersion === food.recipeVersion &&
      food.catalog.foods.length === 1 &&
      food.catalog.foods[0]?.foodId === food.foodId &&
      food.catalog.foods[0]?.revision === food.revision &&
      food.catalog.portions.length >= 1 &&
      food.catalog.composition.length === food.nutrition.nutrients.length &&
      food.nutrition.nutrients.every((nutrient) =>
        food.catalog.composition.some(
          (observation) =>
            observation.nutrientId === nutrient.nutrientId &&
            (nutrient.state === 'known'
              ? observation.value.state === 'known' &&
                observation.value.amount === nutrient.per100Gram.amount &&
                observation.value.unit.code === nutrient.per100Gram.unit.code
              : observation.value.state === 'unknown'),
        ),
      ),
    { message: 'An output food must describe its exact recipe version.' },
  );

export const RecipeOutputFoodVersionRecordV1Schema =
  createCanonicalRecordV1Schema(
    'food.recipe-output-version',
    1,
    RecipeOutputFoodVersionV1Schema,
  ).refine(
    (record) =>
      record.owningContext === 'food-knowledge' &&
      record.subjectId === record.payload.ownerSubjectId &&
      record.logicalVersion === record.payload.revision,
    { message: 'Recipe output food record envelope is invalid.' },
  );

export const RecipeIdentityRecordDraftV1Schema =
  createCanonicalRecordDraftV1Schema(
    'recipe.identity',
    1,
    RecipeIdentityV1Schema,
  ).refine((record) => record.owningContext === 'recipe-knowledge', {
    message: 'Recipe identity records belong to Recipe Knowledge.',
    path: ['owningContext'],
  });

export const RecipeIdentityRecordV1Schema = createCanonicalRecordV1Schema(
  'recipe.identity',
  1,
  RecipeIdentityV1Schema,
).refine((record) => record.owningContext === 'recipe-knowledge', {
  message: 'Recipe identity records belong to Recipe Knowledge.',
  path: ['owningContext'],
});

export const RecipeVersionRecordDraftV1Schema =
  createCanonicalRecordDraftV1Schema(
    'recipe.version',
    1,
    RecipeVersionV1Schema,
  ).refine((record) => record.owningContext === 'recipe-knowledge', {
    message: 'Recipe version records belong to Recipe Knowledge.',
    path: ['owningContext'],
  });

export const RecipeVersionRecordV1Schema = createCanonicalRecordV1Schema(
  'recipe.version',
  1,
  RecipeVersionV1Schema,
).refine((record) => record.owningContext === 'recipe-knowledge', {
  message: 'Recipe version records belong to Recipe Knowledge.',
  path: ['owningContext'],
});

export type RecipeIdentityV1 = z.infer<typeof RecipeIdentityV1Schema>;
export type RecipeIngredientReferenceV1 = z.infer<
  typeof RecipeIngredientReferenceV1Schema
>;
export type RecipeIngredientV1 = z.infer<typeof RecipeIngredientV1Schema>;
export type RecipeVersionV1 = z.infer<typeof RecipeVersionV1Schema>;
export type RecipeCalculationPolicyV1 = z.infer<
  typeof RecipeCalculationPolicyV1Schema
>;
export type ResolvedIngredientCompositionV1 = z.infer<
  typeof ResolvedIngredientCompositionV1Schema
>;
export type RecipeNutritionCalculationV1 = z.infer<
  typeof RecipeNutritionCalculationV1Schema
>;
export type RecipeOutputFoodVersionV1 = z.infer<
  typeof RecipeOutputFoodVersionV1Schema
>;
export type RecipeIdentityRecordDraftV1 = z.infer<
  typeof RecipeIdentityRecordDraftV1Schema
>;
export type RecipeIdentityRecordV1 = z.infer<
  typeof RecipeIdentityRecordV1Schema
>;
export type RecipeVersionRecordDraftV1 = z.infer<
  typeof RecipeVersionRecordDraftV1Schema
>;
export type RecipeVersionRecordV1 = z.infer<typeof RecipeVersionRecordV1Schema>;
