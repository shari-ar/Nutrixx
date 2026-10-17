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
    dayPolicy: {
      policyVersion: 'nutrition-day-zone-v1',
      initialTimeZone: 'UTC',
      changes: [],
    },
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
                nutrientId: 'nutrient.iron',
                type: 'RDA',
                sourceScope: 'all-intake',
                unit: { system: 'ucum', code: 'mg' },
                value: { kind: 'point', amount: '18' },
                population: {
                  minimumAgeYears: 19,
                  maximumAgeYears: 30,
                  physiologicalReference: 'female',
                  lifeStage: 'adult',
                },
                effectiveFrom: '2025-01-01T00:00:00.000Z',
                source: {
                  authority: 'fixture',
                  title: 'Fixture reference',
                  edition: '1',
                  url: 'https://example.org/fixture-reference',
                },
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
      trackingStartedAt: '2026-10-12T08:00:00.000Z',
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
        trackingStartedAt: '2026-10-12T08:00:00.000Z',
      }),
    ).toEqual({
      status: 'NEEDS_INPUT',
      reasonCodes: ['unverified-food-restrictions'],
    });
  });

  it('uses a cited multi-day rule and changes next-meal order when prior intake changes', () => {
    const secondFood: NextMealCandidateSource = {
      ...food,
      reference: {
        kind: 'food',
        catalogReleaseId: 'fixture-release',
        foodId: '00000000-0000-4000-8000-000000000003',
        foodRevision: 1,
      },
      portions: [
        {
          portionId: '00000000-0000-4000-8000-000000000004',
          edibleGrams: '100',
          source,
        },
      ],
      nutrientsPer100EdibleGrams: [
        {
          state: 'known',
          nutrientId: 'nutrient.iron',
          amountPer100EdibleGrams: '18',
          unit: { system: 'ucum', code: 'mg' },
          source,
        },
      ],
    };
    const citation = {
      authority: 'Fixture authority',
      title: 'Fixture temporal reference',
      edition: '1',
      url: 'https://example.org/fixture-reference',
      relevantSection: 'Fixture planning window',
    };
    const policy = {
      schemaVersion: 1 as const,
      releaseId: 'fixture-temporal-release',
      policyVersion: 'fixture-temporal-v1',
      effectiveAt: '2025-01-01T00:00:00.000Z',
      intakeCompletenessAssumption: 'user-logs-all-consumption' as const,
      unrecordedIntakeTreatment: 'unknown-no-imputation' as const,
      physiologicalStatusClaim: 'none' as const,
      rules: [
        {
          ruleId: 'iron-current-day',
          ruleVersion: 'fixture-temporal-v1',
          nutrientId: 'nutrient.iron',
          populationKey: 'adult-19-30-female-adult',
          reference: {
            type: 'rda',
            releaseId: 'fixture-release',
            ruleId: 'iron-current-day',
            citation,
          },
          unit: { system: 'ucum' as const, code: 'mg' },
          sourceScope: 'all-intake',
          window: { basis: 'nutrition-day' as const, periodCount: 3 },
          aggregation: 'mean-per-nutrition-day' as const,
          minimumKnownMeals: 1,
          earlyHistoryTreatment: 'provisional-comparison' as const,
          horizonCitation: citation,
          intendedUse: 'next-meal-dietary-planning' as const,
          limitations: 'Fixture only; this window is not an active rule.',
        },
      ],
    };
    const run = (previousIron: string) => {
      const snapshot = nutrition();
      const built = buildNextMealInputV1({
        catalog: {
          manifest: {
            entryKeys: [
              'food:fixture-release:00000000-0000-4000-8000-000000000001:1',
              'food:fixture-release:00000000-0000-4000-8000-000000000003:1',
            ],
          },
          entries: [food, secondFood],
        },
        nutrition: {
          ...snapshot,
          meals: [
            {
              state: 'recorded',
              mealId: '00000000-0000-4000-8000-000000000010',
              ownerSubjectId: '00000000-0000-4000-8000-000000000011',
              revision: 1,
              occurredAt: '2026-10-11T08:00:00.000Z',
              localDate: '2026-10-11',
              timeZone: 'UTC',
              mealType: 'breakfast',
              items: [
                {
                  itemId: '00000000-0000-4000-8000-000000000012',
                  position: 1,
                  displayNameSnapshot: 'Test food',
                  preparationState: 'prepared',
                  reference: food.reference,
                  consumedQuantity: {
                    amount: '1',
                    unit: { system: 'nutrixx', code: 'portion.serving' },
                  },
                  edibleGramWeight: '100',
                  provenance: {
                    method: 'user-entered',
                    source: {
                      kind: 'user',
                      sourceId: '00000000-0000-4000-8000-000000000011',
                    },
                    recordedAt: '2026-10-11T08:00:00.000Z',
                  },
                },
              ],
              nutrition: [
                {
                  state: 'known',
                  nutrientId: 'nutrient.iron',
                  amount: previousIron,
                  unit: { system: 'ucum', code: 'mg' },
                },
              ],
              provenance: {
                method: 'user-entered',
                source: {
                  kind: 'user',
                  sourceId: '00000000-0000-4000-8000-000000000011',
                },
                recordedAt: '2026-10-11T08:00:00.000Z',
              },
              recordedAt: '2026-10-11T08:00:00.000Z',
            },
          ],
        },
        foodRestrictions: [],
        inventory: null,
        now: NOW,
        trackingStartedAt: '2026-10-11T00:00:00.000Z',
        temporalPolicy: policy,
      });
      expect(built.status).toBe('READY');
      if (built.status !== 'READY') throw new Error('Fixture must be ready.');
      expect(built.request.temporalRules[0]).toMatchObject({
        windowStartInclusive: '2026-10-11T00:00:00.000Z',
        target: { amount: '36' },
      });
      expect(built.appliedTemporalRules[0]?.decision).toBe(
        'PROVISIONAL_SHORT_HISTORY',
      );
      const ranking = rankNextMealCandidatesV1(built.request);
      expect(reviewNextMealRankingV1(built.request, ranking).status).toBe(
        'APPROVED',
      );
      return ranking.ranked[0]?.candidateKey;
    };
    expect(run('18')).toContain('000000000003');
    expect(run('27')).toContain('000000000001');
  });

  it('keeps every eligible nutrient rule instead of selecting a fixed top five', () => {
    const ids = [
      'nutrient.iron',
      'nutrient.calcium',
      'nutrient.magnesium',
      'nutrient.zinc',
      'nutrient.selenium',
      'nutrient.copper',
    ];
    const snapshot = nutrition();
    const template = snapshot.window.current.nutrients[0]!;
    const target = template.target;
    if (target.status !== 'READY') throw new Error('Fixture target required.');
    const nutrients = ids.map((nutrientId) => ({
      ...template,
      nutrientId,
      target: {
        ...target,
        rule: {
          ...target.rule,
          ruleId: `rda.${nutrientId}`,
          nutrientId,
        },
      },
    }));
    const candidate: NextMealCandidateSource = {
      ...food,
      nutrientsPer100EdibleGrams: ids.map((nutrientId) => ({
        state: 'known' as const,
        nutrientId,
        amountPer100EdibleGrams: '1',
        unit: { system: 'ucum' as const, code: 'mg' },
        source,
      })),
    };
    const built = buildNextMealInputV1({
      catalog: {
        manifest: {
          entryKeys: [
            'food:fixture-release:00000000-0000-4000-8000-000000000001:1',
          ],
        },
        entries: [candidate],
      },
      nutrition: {
        ...snapshot,
        window: {
          ...snapshot.window,
          current: { ...snapshot.window.current, nutrients },
        },
      },
      foodRestrictions: [],
      inventory: null,
      now: NOW,
      trackingStartedAt: NOW,
    });
    expect(built.status).toBe('READY');
    if (built.status !== 'READY') return;
    expect(built.request.temporalRules).toHaveLength(6);
    expect(rankNextMealCandidatesV1(built.request).ranked).toHaveLength(1);
  });
});
