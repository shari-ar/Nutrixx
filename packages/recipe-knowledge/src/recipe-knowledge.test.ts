import { describe, expect, it } from 'vitest';
import { FoodCatalogIndexV1 } from '@nutrixx/food-knowledge';

import { calculateRecipeNutritionV1 } from './calculator.js';
import { CatalogRecipeCompositionResolverV1 } from './composition-resolver.js';
import {
  RecipeVersionRecordDraftV1Schema,
  RecipeVersionV1Schema,
  type RecipeCalculationPolicyV1,
  type RecipeIngredientReferenceV1,
  type RecipeVersionV1,
  type ResolvedIngredientCompositionV1,
} from './model.js';
import { InMemoryRecipeBookV1 } from './recipe-book.js';

const OWNER_ID = '10000000-0000-4000-8000-000000000001';
const RECIPE_ID = '20000000-0000-4000-8000-000000000001';
const SECOND_RECIPE_ID = '20000000-0000-4000-8000-000000000002';
const FOOD_ONE_ID = '30000000-0000-4000-8000-000000000001';
const FOOD_TWO_ID = '30000000-0000-4000-8000-000000000002';
const INGREDIENT_ONE_ID = '40000000-0000-4000-8000-000000000001';
const INGREDIENT_TWO_ID = '40000000-0000-4000-8000-000000000002';
const SOURCE_ID = '50000000-0000-4000-8000-000000000001';
const OBSERVATION_ID = '60000000-0000-4000-8000-000000000001';
const RECORD_ID = '70000000-0000-4000-8000-000000000001';
const CATALOG_RELEASE_ID = 'food-catalog-fixture-1';
const NOW = '2026-10-04T12:00:00.000Z';

const POLICY: RecipeCalculationPolicyV1 = {
  rule: { component: 'recipe-calculation', version: '1' },
  decimalPlaces: 6,
  rounding: 'half-even',
};

function recipeVersion(
  overrides: Partial<RecipeVersionV1> = {},
): RecipeVersionV1 {
  return {
    recipeId: RECIPE_ID,
    version: 1,
    names: [{ locale: 'en', value: 'Golden bowl', kind: 'primary' }],
    ingredients: [
      {
        ingredientId: INGREDIENT_ONE_ID,
        position: 1,
        label: 'Ingredient one',
        reference: {
          kind: 'food',
          catalogReleaseId: CATALOG_RELEASE_ID,
          foodId: FOOD_ONE_ID,
          foodRevision: 1,
        },
        inputQuantity: { amount: '200', unit: { system: 'ucum', code: 'g' } },
        edibleGramWeight: '200',
        retentionFactors: [
          {
            nutrientId: 'nutrient.protein',
            factor: '0.8',
            rule: { component: 'retention.usda', version: '1' },
          },
        ],
      },
      {
        ingredientId: INGREDIENT_TWO_ID,
        position: 2,
        label: 'Ingredient two',
        reference: {
          kind: 'food',
          catalogReleaseId: CATALOG_RELEASE_ID,
          foodId: FOOD_TWO_ID,
          foodRevision: 1,
        },
        inputQuantity: { amount: '50', unit: { system: 'ucum', code: 'g' } },
        edibleGramWeight: '50',
        retentionFactors: [],
      },
    ],
    preparationSteps: [
      { position: 1, instruction: 'Combine the ingredients.' },
    ],
    yield: {
      finalEdibleGramWeight: '200',
      servings: '4',
      determination: 'measured',
    },
    calculationRule: POLICY.rule,
    provenance: {
      method: 'user-entered',
      source: { kind: 'user', sourceId: OWNER_ID },
    },
    publishedAt: NOW,
    ...overrides,
  };
}

function resolver(
  values: Readonly<Record<string, ResolvedIngredientCompositionV1>>,
) {
  return {
    resolve(
      reference: RecipeIngredientReferenceV1,
      nutrientId: string,
    ): ResolvedIngredientCompositionV1 {
      const identity =
        reference.kind === 'food' ? reference.foodId : reference.recipeId;
      return (
        values[`${identity}:${nutrientId}`] ?? {
          state: 'unknown',
          reason: 'not-provided',
        }
      );
    },
  };
}

describe('Recipe Knowledge', () => {
  it('binds recipe payloads to storage-neutral canonical records', () => {
    const draft = {
      format: 'nutrixx.canonical-record',
      schemaVersion: 1,
      recordType: 'recipe.version',
      recordVersion: 1,
      recordId: RECORD_ID,
      subjectId: OWNER_ID,
      owningContext: 'recipe-knowledge',
      logicalVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
      provenance: {
        method: 'user-entered',
        source: { kind: 'user', sourceId: OWNER_ID },
        recordedAt: NOW,
      },
      payload: recipeVersion(),
    };
    expect(RecipeVersionRecordDraftV1Schema.safeParse(draft).success).toBe(
      true,
    );
    expect(
      RecipeVersionRecordDraftV1Schema.safeParse({
        ...draft,
        owningContext: 'consumption',
      }).success,
    ).toBe(false);
  });

  it('publishes sequential immutable versions and preserves exact references', () => {
    const book = new InMemoryRecipeBookV1();
    book.registerIdentity({
      recipeId: RECIPE_ID,
      ownerSubjectId: OWNER_ID,
      origin: 'user',
      createdAt: NOW,
    });
    const first = recipeVersion();
    book.publishVersion(first);

    const retrieved = book.getVersion(RECIPE_ID, 1);
    expect(retrieved).not.toBeNull();
    if (retrieved === null) return;
    retrieved.names[0]!.value = 'Changed outside the registry';
    expect(book.getVersion(RECIPE_ID, 1)?.names[0]?.value).toBe('Golden bowl');
    expect(() => book.publishVersion(recipeVersion({ version: 3 }))).toThrow(
      /version 2/u,
    );
  });

  it('requires referenced recipe versions to exist before publication', () => {
    const book = new InMemoryRecipeBookV1();
    book.registerIdentity({
      recipeId: SECOND_RECIPE_ID,
      ownerSubjectId: OWNER_ID,
      origin: 'user',
      createdAt: NOW,
    });
    const nested = recipeVersion({
      recipeId: SECOND_RECIPE_ID,
      ingredients: [
        {
          ...recipeVersion().ingredients[0]!,
          reference: { kind: 'recipe', recipeId: RECIPE_ID, recipeVersion: 1 },
        },
      ],
    });
    expect(() => book.publishVersion(nested)).toThrow(
      /available exact version/u,
    );
  });

  it('rejects self-reference and duplicate ingredient positions', () => {
    const value = recipeVersion({
      ingredients: [
        {
          ...recipeVersion().ingredients[0]!,
          reference: { kind: 'recipe', recipeId: RECIPE_ID, recipeVersion: 1 },
        },
        {
          ...recipeVersion().ingredients[1]!,
          position: 1,
        },
      ],
    });
    const result = RecipeVersionV1Schema.safeParse(value);
    expect(result.success).toBe(false);
  });

  it('calculates totals, final-yield concentration, and servings exactly', () => {
    const nutrition = calculateRecipeNutritionV1(
      recipeVersion(),
      ['nutrient.protein', 'nutrient.sodium'],
      resolver({
        [`${FOOD_ONE_ID}:nutrient.protein`]: {
          state: 'known',
          amountPer100Gram: '10',
          unit: { system: 'ucum', code: 'g' },
        },
        [`${FOOD_TWO_ID}:nutrient.protein`]: {
          state: 'known',
          amountPer100Gram: '4',
          unit: { system: 'ucum', code: 'g' },
        },
        [`${FOOD_ONE_ID}:nutrient.sodium`]: {
          state: 'known',
          amountPer100Gram: '0',
          unit: { system: 'ucum', code: 'mg' },
        },
        [`${FOOD_TWO_ID}:nutrient.sodium`]: {
          state: 'known',
          amountPer100Gram: '0',
          unit: { system: 'ucum', code: 'mg' },
        },
      }),
      POLICY,
    );
    expect(nutrition.nutrients).toMatchObject([
      {
        state: 'known',
        total: { amount: '18' },
        per100Gram: { amount: '9' },
        perServing: { amount: '4.5' },
        completeness: '1',
      },
      {
        state: 'known',
        total: { amount: '0' },
        per100Gram: { amount: '0' },
        perServing: { amount: '0' },
        completeness: '1',
      },
    ]);
  });

  it('resolves exact Food Knowledge revisions without guessing missing data', () => {
    const catalog = new FoodCatalogIndexV1({
      format: 'nutrixx.food-catalog',
      schemaVersion: 1,
      sources: [
        {
          sourceId: SOURCE_ID,
          provider: 'usda-fdc',
          dataset: 'foundation',
          sourceRelease: 'fixture',
          sourceRecordId: '1',
          licenseId: 'CC0-1.0',
          retrievedAt: NOW,
        },
      ],
      foods: [
        {
          foodId: FOOD_ONE_ID,
          revision: 1,
          foodClass: 'fixture.food',
          descriptions: [
            { locale: 'en', value: 'Fixture food', kind: 'primary' },
          ],
          categories: [],
          preparationStates: ['unspecified'],
          sourceId: SOURCE_ID,
        },
      ],
      portions: [],
      composition: [
        {
          observationId: OBSERVATION_ID,
          foodId: FOOD_ONE_ID,
          foodRevision: 1,
          nutrientId: 'nutrient.protein',
          sourceNutrientId: '1003',
          sourceNutrientName: 'Protein',
          preparationState: 'unspecified',
          value: {
            state: 'known',
            amount: '10',
            unit: { system: 'ucum', code: 'g' },
            basis: 'per-100-gram-edible',
          },
          sourceId: SOURCE_ID,
          quality: [],
        },
      ],
    });
    const composition = new CatalogRecipeCompositionResolverV1(
      catalog,
      CATALOG_RELEASE_ID,
    );
    expect(
      composition.resolve(
        {
          kind: 'food',
          catalogReleaseId: CATALOG_RELEASE_ID,
          foodId: FOOD_ONE_ID,
          foodRevision: 1,
        },
        'nutrient.protein',
      ),
    ).toEqual({
      state: 'known',
      amountPer100Gram: '10',
      unit: { system: 'ucum', code: 'g' },
    });
    expect(
      composition.resolve(
        {
          kind: 'food',
          catalogReleaseId: CATALOG_RELEASE_ID,
          foodId: FOOD_ONE_ID,
          foodRevision: 1,
        },
        'nutrient.unavailable',
      ),
    ).toEqual({ state: 'unknown', reason: 'not-provided' });
  });

  it('propagates missing composition without converting it to zero', () => {
    const nutrition = calculateRecipeNutritionV1(
      recipeVersion(),
      ['nutrient.protein'],
      resolver({
        [`${FOOD_ONE_ID}:nutrient.protein`]: {
          state: 'known',
          amountPer100Gram: '10',
          unit: { system: 'ucum', code: 'g' },
        },
      }),
      POLICY,
    );
    expect(nutrition.nutrients).toEqual([
      {
        state: 'incomplete',
        nutrientId: 'nutrient.protein',
        knownTotal: {
          amount: '16',
          unit: { system: 'ucum', code: 'g' },
        },
        completeness: '0.5',
        missingIngredientIds: [INGREDIENT_TWO_ID],
        reasonCodes: ['ingredient.not-provided'],
      },
    ]);
  });

  it('stops calculation when one nutrient resolves to incompatible units', () => {
    expect(() =>
      calculateRecipeNutritionV1(
        recipeVersion(),
        ['nutrient.protein'],
        resolver({
          [`${FOOD_ONE_ID}:nutrient.protein`]: {
            state: 'known',
            amountPer100Gram: '10',
            unit: { system: 'ucum', code: 'g' },
          },
          [`${FOOD_TWO_ID}:nutrient.protein`]: {
            state: 'known',
            amountPer100Gram: '4000',
            unit: { system: 'ucum', code: 'mg' },
          },
        }),
        POLICY,
      ),
    ).toThrow(/incompatible units/u);
  });
});
