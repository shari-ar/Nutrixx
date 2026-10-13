import {
  rankNextMealCandidatesV1,
  reviewNextMealRankingV1,
  type NextMealCandidateSource,
} from '@nutrixx/optimizer-engine';
import { describe, expect, it } from 'vitest';

import { buildNextMealInputV1 } from './next-meal-input';

import type { BrowserNutritionSnapshotV1 } from './browser-nutrition-state';

const NOW = '2026-10-12T12:00:00.000Z';
const source = {
  kind: 'dataset',
  sourceId: 'fixture',
  sourceVersion: '1',
} as const;
const food: NextMealCandidateSource = {
  reference: {
    kind: 'food',
    catalogReleaseId: 'fixture-release',
    foodId: '00000000-0000-4000-8000-000000000001',
    foodRevision: 1,
  },
  displayName: 'Test food',
  preparationState: 'prepared',
  edibleResolution: 'resolved',
  portions: [
    {
      portionId: '00000000-0000-4000-8000-000000000002',
      edibleGrams: '100',
      source,
    },
  ],
  nutrientsPer100EdibleGrams: [
    {
      state: 'known',
      nutrientId: 'nutrient.iron',
      amountPer100EdibleGrams: '10',
      unit: { system: 'ucum', code: 'mg' },
      source,
    },
  ],
  restrictionEvidence: {
    state: 'unknown',
    reasonCode: 'allergen-evidence-unavailable',
  },
};

function nutrition(): BrowserNutritionSnapshotV1 {
  return {
    market: 'US',
    meals: [],
    window: {
      current: {
        period: {
          startsAt: '2026-10-12T00:00:00.000Z',
          endsAt: '2026-10-13T00:00:00.000Z',
          travelAdjusted: false,
        },
        nutrients: [
          {
            nutrientId: 'nutrient.iron',
            unit: 'mg',
            target: {
              status: 'READY',
              policyVersion: '1',
              releaseId: 'fixture-release',
              rule: {
                ruleId: 'iron-current-day',
                type: 'RDA',
                sourceScope: 'all-intake',
                unit: { system: 'ucum', code: 'mg' },
                value: { kind: 'point', amount: '18' },
                source: { authority: 'fixture', edition: '1' },
              },
            },
            upperLimit: { status: 'UNAVAILABLE' },
          },
        ],
      },
    },
  } as unknown as BrowserNutritionSnapshotV1;
}

describe('next-meal browser input', () => {
  it('builds a source-backed one-meal request and passes independent review', () => {
    const built = buildNextMealInputV1({
      catalog: {
        manifest: {
          entryKeys: [
            'food:fixture-release:00000000-0000-4000-8000-000000000001:1',
          ],
        },
        entries: [food],
      },
      nutrition: nutrition(),
      foodRestrictions: [],
      inventory: null,
      now: NOW,
    });
    expect(built.status).toBe('READY');
    if (built.status !== 'READY') return;
    const ranked = rankNextMealCandidatesV1(built.request);
    expect(reviewNextMealRankingV1(built.request, ranked).status).toBe(
      'APPROVED',
    );
    expect(ranked.ranked).toHaveLength(1);
  });

  it('requires evidence before ranking a declared restriction', () => {
    expect(
      buildNextMealInputV1({
        catalog: { manifest: { entryKeys: [] }, entries: [] },
        nutrition: nutrition(),
        foodRestrictions: ['peanut'],
        inventory: null,
        now: NOW,
      }),
    ).toEqual({
      status: 'NEEDS_INPUT',
      reasonCodes: ['unverified-food-restrictions'],
    });
  });
});
