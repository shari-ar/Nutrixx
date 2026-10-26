import { describe, expect, it } from 'vitest';

import type { FoodCatalogPayloadV1 } from './model.js';
import { reconcileExactFoodIdentitiesV1 } from './identity-reconciliation.js';

const ids = {
  usdaSource: '00000000-0000-4000-8000-000000000001',
  futureSource: '00000000-0000-4000-8000-000000000002',
  nutrixxSource: '00000000-0000-4000-8000-000000000003',
  usdaFood: '00000000-0000-4000-8000-000000000011',
  futureFood: '00000000-0000-4000-8000-000000000012',
  nutrixxFood: '00000000-0000-4000-8000-000000000013',
  canonicalFood: '00000000-0000-4000-8000-000000000014',
  usdaPortion: '00000000-0000-4000-8000-000000000021',
  futurePortion: '00000000-0000-4000-8000-000000000022',
  unknownProtein: '00000000-0000-4000-8000-000000000031',
  futureProtein: '00000000-0000-4000-8000-000000000032',
  usdaEnergy: '00000000-0000-4000-8000-000000000033',
  futureEnergy: '00000000-0000-4000-8000-000000000034',
} as const;

const canonicalFoodId = () => ids.canonicalFood;

function fixture(): FoodCatalogPayloadV1 {
  return {
    format: 'nutrixx.food-catalog',
    schemaVersion: 1,
    sources: [
      {
        sourceId: ids.usdaSource,
        provider: 'usda-fdc',
        dataset: 'foundation',
        sourceRelease: '1',
        sourceRecordId: 'usda-1',
        licenseId: 'CC0-1.0',
        retrievedAt: '2026-10-25T00:00:00.000Z',
      },
      {
        sourceId: ids.futureSource,
        provider: 'future-source',
        dataset: 'release-1',
        sourceRelease: '1',
        sourceRecordId: 'future-1',
        licenseId: 'test',
        retrievedAt: '2026-10-25T00:00:00.000Z',
      },
      {
        sourceId: ids.nutrixxSource,
        provider: 'nutrixx-curated',
        dataset: 'curated',
        sourceRelease: '1',
        sourceRecordId: 'nutrixx-1',
        licenseId: 'proprietary',
        retrievedAt: '2026-10-25T00:00:00.000Z',
      },
    ],
    foods: [
      {
        foodId: ids.usdaFood,
        revision: 1,
        foodClass: 'reference.food',
        descriptions: [
          {
            locale: 'en',
            value: 'Cucumber, with peel, raw',
            kind: 'primary',
          },
        ],
        categories: [],
        preparationStates: ['raw'],
        sourceId: ids.usdaSource,
      },
      {
        foodId: ids.futureFood,
        revision: 1,
        foodClass: 'reference.food',
        descriptions: [
          {
            locale: 'en',
            value: 'Cucumber, with peel, raw',
            kind: 'primary',
          },
        ],
        categories: [],
        preparationStates: ['raw'],
        sourceId: ids.futureSource,
      },
    ],
    portions: [
      {
        portionId: ids.usdaPortion,
        foodId: ids.usdaFood,
        foodRevision: 1,
        description: { locale: 'en', value: '100 g', kind: 'primary' },
        amount: '100',
        measureUnit: { system: 'ucum', code: 'g' },
        gramWeight: '100',
        edibleFraction: '1',
        sourceId: ids.usdaSource,
      },
      {
        portionId: ids.futurePortion,
        foodId: ids.futureFood,
        foodRevision: 1,
        description: { locale: 'en', value: '100 g', kind: 'primary' },
        amount: '100',
        measureUnit: { system: 'ucum', code: 'g' },
        gramWeight: '100',
        edibleFraction: '1',
        sourceId: ids.futureSource,
      },
    ],
    composition: [
      {
        observationId: ids.unknownProtein,
        foodId: ids.usdaFood,
        foodRevision: 1,
        nutrientId: 'nutrient.protein',
        sourceNutrientId: 'protein',
        sourceNutrientName: 'Protein',
        preparationState: 'raw',
        value: { state: 'unknown', reason: 'not-provided' },
        sourceId: ids.usdaSource,
        quality: [],
      },
      {
        observationId: ids.futureProtein,
        foodId: ids.futureFood,
        foodRevision: 1,
        nutrientId: 'nutrient.protein',
        sourceNutrientId: 'protein',
        sourceNutrientName: 'Protein',
        preparationState: 'raw',
        value: {
          state: 'known',
          amount: '1',
          unit: { system: 'ucum', code: 'g' },
          basis: 'per-100-gram-edible',
        },
        sourceId: ids.futureSource,
        quality: [],
      },
      {
        observationId: ids.usdaEnergy,
        foodId: ids.usdaFood,
        foodRevision: 1,
        nutrientId: 'nutrient.energy',
        sourceNutrientId: 'energy',
        sourceNutrientName: 'Energy',
        preparationState: 'raw',
        value: {
          state: 'known',
          amount: '15',
          unit: { system: 'ucum', code: 'kcal' },
          basis: 'per-100-gram-edible',
        },
        sourceId: ids.usdaSource,
        quality: [],
      },
      {
        observationId: ids.futureEnergy,
        foodId: ids.futureFood,
        foodRevision: 1,
        nutrientId: 'nutrient.energy',
        sourceNutrientId: 'energy',
        sourceNutrientName: 'Energy',
        preparationState: 'raw',
        value: {
          state: 'known',
          amount: '16',
          unit: { system: 'ucum', code: 'kcal' },
          basis: 'per-100-gram-edible',
        },
        sourceId: ids.futureSource,
        quality: [],
      },
    ],
  };
}

describe('exact food identity reconciliation', () => {
  it('keeps one canonical food and fills gaps from lower-priority sources', () => {
    const result = reconcileExactFoodIdentitiesV1(fixture(), {
      sourceOrder: ['usda-fdc', 'future-source'],
      canonicalFoodId,
    });

    expect(result.payload.foods).toHaveLength(1);
    expect(result.payload.foods[0]?.foodId).toBe(ids.canonicalFood);
    expect(result.payload.foods[0]?.sourceIdentityLinks).toEqual([
      {
        sourceId: ids.futureSource,
        matchBasis: 'exact-identity-signature',
      },
    ]);
    expect(result.payload.portions).toHaveLength(1);
    expect(
      result.payload.composition.map((observation) => ({
        nutrientId: observation.nutrientId,
        sourceId: observation.sourceId,
        value: observation.value,
      })),
    ).toEqual([
      {
        nutrientId: 'nutrient.energy',
        sourceId: ids.usdaSource,
        value: {
          state: 'known',
          amount: '15',
          unit: { system: 'ucum', code: 'kcal' },
          basis: 'per-100-gram-edible',
        },
      },
      {
        nutrientId: 'nutrient.protein',
        sourceId: ids.futureSource,
        value: {
          state: 'known',
          amount: '1',
          unit: { system: 'ucum', code: 'g' },
          basis: 'per-100-gram-edible',
        },
      },
    ]);
  });

  it('keeps preparation and edible-part differences separate', () => {
    const payload = fixture();
    const second = payload.foods[1];
    if (!second) throw new Error('The fixture requires a second food.');
    second.descriptions[0] = {
      locale: 'en',
      value: 'Cucumber, peeled, cooked',
      kind: 'primary',
    };
    second.preparationStates = ['cooked'];

    const result = reconcileExactFoodIdentitiesV1(payload, {
      sourceOrder: ['usda-fdc', 'future-source'],
      canonicalFoodId,
    });

    expect(result.payload.foods).toHaveLength(2);
    expect(result.exactLinks).toHaveLength(0);
  });

  it('keeps Nutrixx fallback last when external sources change', () => {
    const payload = fixture();
    const future = payload.foods[1];
    if (!future) throw new Error('The fixture requires a second food.');
    future.sourceId = ids.nutrixxSource;

    const result = reconcileExactFoodIdentitiesV1(payload, {
      sourceOrder: ['future-source'],
      canonicalFoodId,
    });

    expect(result.payload.foods[0]?.foodId).toBe(ids.canonicalFood);
    expect(result.payload.foods[0]?.sourceIdentityLinks?.[0]?.sourceId).toBe(
      ids.nutrixxSource,
    );
  });

  it('keeps the canonical identity when a source is removed', () => {
    const withBothSources = reconcileExactFoodIdentitiesV1(fixture(), {
      sourceOrder: ['usda-fdc', 'future-source'],
      canonicalFoodId,
    });
    const futureOnly = fixture();
    futureOnly.foods = futureOnly.foods.filter(
      (food) => food.sourceId === ids.futureSource,
    );
    futureOnly.portions = futureOnly.portions.filter(
      (portion) => portion.sourceId === ids.futureSource,
    );
    futureOnly.composition = futureOnly.composition.filter(
      (observation) => observation.sourceId === ids.futureSource,
    );
    const withoutUsda = reconcileExactFoodIdentitiesV1(futureOnly, {
      sourceOrder: ['future-source'],
      canonicalFoodId,
    });

    expect(withBothSources.payload.foods[0]?.foodId).toBe(ids.canonicalFood);
    expect(withoutUsda.payload.foods[0]?.foodId).toBe(ids.canonicalFood);
  });
});
