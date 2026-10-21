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

  it('ranks actual unique consumers first and uses coverage only for ties', () => {
    const snapshot = {
      format: 'nutrixx.food-consumption-snapshot' as const,
      schemaVersion: 1 as const,
      catalogReleaseId: fixture.releaseId,
      source: 'consented-recorded-meals' as const,
      periodStartInclusive: '2026-07-01T00:00:00.000Z',
      periodEndExclusive: '2026-10-01T00:00:00.000Z',
      foodCounts: [
        { foodId: 'potato', uniqueConsumers: 20 },
        { foodId: 'eggplant', uniqueConsumers: 3 },
      ],
    };
    const ranked = buildFoodCompositionWorkQueueV1({
      ...fixture,
      consumptionSnapshot: snapshot,
    });
    expect(ranked.items.map((item) => item.foodName)).toEqual([
      'Potato',
      'Eggplant',
    ]);
    expect(ranked.items.map((item) => item.uniqueConsumers)).toEqual([20, 3]);
    expect(ranked.consumptionEvidence.status).toBe(
      'aggregated-recorded-consumption',
    );

    const tied = buildFoodCompositionWorkQueueV1({
      ...fixture,
      consumptionSnapshot: {
        ...snapshot,
        foodCounts: snapshot.foodCounts.map((count) => ({
          ...count,
          uniqueConsumers: 7,
        })),
      },
    });
    expect(tied.items.map((item) => item.foodName)).toEqual([
      'Eggplant',
      'Potato',
    ]);
    expect(
      buildFoodCompositionWorkQueueV1(fixture).consumptionEvidence,
    ).toEqual({ status: 'not-provided' });
  });

  it('rejects stale, duplicate, and invalid consumption counts', () => {
    const snapshot = {
      format: 'nutrixx.food-consumption-snapshot' as const,
      schemaVersion: 1 as const,
      catalogReleaseId: fixture.releaseId,
      source: 'consented-recorded-meals' as const,
      periodStartInclusive: '2026-07-01T00:00:00.000Z',
      periodEndExclusive: '2026-10-01T00:00:00.000Z',
      foodCounts: [{ foodId: 'potato', uniqueConsumers: 2 }],
    };
    for (const invalid of [
      { ...snapshot, catalogReleaseId: 'another-catalog' },
      {
        ...snapshot,
        foodCounts: [...snapshot.foodCounts, ...snapshot.foodCounts],
      },
      { ...snapshot, foodCounts: [{ foodId: 'potato', uniqueConsumers: -1 }] },
      { ...snapshot, foodCounts: [{ foodId: 'unknown', uniqueConsumers: 1 }] },
    ]) {
      expect(() =>
        buildFoodCompositionWorkQueueV1({
          ...fixture,
          consumptionSnapshot: invalid,
        }),
      ).toThrow();
    }
  });
});
