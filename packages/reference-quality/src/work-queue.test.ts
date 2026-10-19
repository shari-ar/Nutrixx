import { describe, expect, it } from 'vitest';

import {
  buildFoodCompositionWorkQueueV1,
  type FoodCompositionQueueInputV1,
} from './work-queue.js';

const digest = 'a'.repeat(64);
const fixture: FoodCompositionQueueInputV1 = {
  releaseId: 'catalog-1',
  artifactSha256: digest,
  evaluatedAt: '2026-10-18T00:00:00.000Z',
  foods: [
    { foodId: 'potato', revision: 1, name: 'Potato', sourceRecordId: '100' },
    { foodId: 'potato', revision: 2, name: 'Potato', sourceRecordId: '100' },
    {
      foodId: 'eggplant',
      revision: 1,
      name: 'Eggplant',
      sourceRecordId: '200',
    },
  ],
  observations: [
    {
      foodId: 'potato',
      foodRevision: 1,
      nutrientId: 'protein',
      sourceNutrientId: '1003',
      value: {
        state: 'known',
        amount: '2',
        unit: { system: 'ucum', code: 'g' },
        basis: 'per-100-gram-edible',
      },
    },
    {
      foodId: 'potato',
      foodRevision: 2,
      nutrientId: 'protein',
      sourceNutrientId: '1003',
      value: {
        state: 'known',
        amount: '0',
        unit: { system: 'ucum', code: 'g' },
        basis: 'per-100-gram-edible',
      },
    },
    {
      foodId: 'potato',
      foodRevision: 2,
      nutrientId: 'fat',
      sourceNutrientId: '1004',
      value: { state: 'unknown' },
    },
    {
      foodId: 'eggplant',
      foodRevision: 1,
      nutrientId: 'unmapped',
      sourceNutrientId: '1003',
      value: {
        state: 'known',
        amount: '1',
        unit: { system: 'ucum', code: 'mg' },
        basis: 'per-100-gram-edible',
      },
    },
  ],
  components: [
    {
      componentId: 'protein',
      name: 'Protein',
      unit: 'g',
      usdaFdcNutrientIds: ['1003'],
    },
    {
      componentId: 'fat',
      name: 'Fat',
      unit: 'g',
      usdaFdcNutrientIds: ['1004'],
    },
    {
      componentId: 'fiber',
      name: 'Fiber',
      unit: 'g',
      usdaFdcNutrientIds: ['1079'],
    },
  ],
  baselineTargetIds: ['protein', 'fat'],
};

describe('food-composition work queue', () => {
  it('uses latest food revisions and separates absent, unknown, and incompatible values', () => {
    const queue = buildFoodCompositionWorkQueueV1(fixture);
    expect(queue.totalFoods).toBe(2);
    expect(queue.candidateFoods).toBe(2);
    expect(queue.items.map((item) => item.foodName)).toEqual([
      'Eggplant',
      'Potato',
    ]);
    expect(queue.items[0]).toMatchObject({
      sourceRecordId: '200',
      knownComponentCount: 0,
      missingBaselineComponentIds: ['protein', 'fat'],
      unitIncompatibleComponentIds: ['protein'],
      absentComponentIds: ['fat', 'fiber'],
      priorityBand: 'unmeasured',
      priorityScore: null,
    });
    expect(queue.items[1]).toMatchObject({
      knownComponentCount: 1,
      missingBaselineComponentIds: ['fat'],
      explicitlyUnknownComponentIds: ['fat'],
      absentComponentIds: ['fiber'],
    });
    expect(queue.items[1]?.gapKey).toBe(
      'food-composition-coverage/potato/incomplete-coverage',
    );
  });

  it('rejects ambiguous component aliases', () => {
    expect(() =>
      buildFoodCompositionWorkQueueV1({
        ...fixture,
        components: [
          ...fixture.components,
          {
            componentId: 'duplicate',
            name: 'Duplicate',
            unit: 'g',
            usdaFdcNutrientIds: ['1003'],
          },
        ],
      }),
    ).toThrow(/Ambiguous component mapping/u);
  });
});
