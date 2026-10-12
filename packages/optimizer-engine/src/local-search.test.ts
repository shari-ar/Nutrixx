import { describe, expect, it } from 'vitest';

import {
  FREE_SEARCH_PROFILE_V1,
  PlanningInputV1Schema,
  type PlanningCandidateV1,
} from './planning-contract.js';
import { searchLocalPlanV1 } from './local-search.js';

const id = (value: number): string =>
  `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
const source = {
  kind: 'dataset',
  sourceId: 'fixture-catalog',
  sourceVersion: '1',
} as const;
const unit = (code: string) => ({ system: 'ucum', code }) as const;

function candidate(
  value: number,
  energy: string,
  sodium = '0',
): PlanningCandidateV1 {
  return {
    candidateId: id(100 + value),
    semanticKey: `fixture.food-${value.toString().padStart(3, '0')}`,
    displayNameSnapshot: `Fixture food ${value}`,
    sourceReference: {
      kind: 'food',
      foodId: id(200 + value),
      foodRevision: 1,
      catalogReleaseId: 'catalog-v1',
    },
    baseServingGrams: '100',
    baseServingSource: source,
    portionBounds: {
      minimumEdibleGrams: '50',
      maximumEdibleGrams: '200',
      source,
    },
    portions: [{ portionId: 'base', edibleGrams: '100' }],
    nutrientsPer100EdibleGrams: [
      {
        state: 'known',
        nutrientId: 'energy',
        amount: energy,
        unit: unit('kcal'),
        source,
      },
      {
        state: 'known',
        nutrientId: 'sodium',
        amount: sodium,
        unit: unit('mg'),
        source,
      },
    ],
    restrictionEvidence: {
      state: 'verified',
      ingredientIds: [],
      allergenCodes: [],
      source,
    },
    pinnedByUser: false,
  };
}

function fixture() {
  return PlanningInputV1Schema.parse({
    format: 'nutrixx.local-planning-input',
    schemaVersion: 1,
    requestId: id(1),
    ownerSubjectId: id(2),
    capturedAt: '2026-10-12T09:00:00.000Z',
    capturedTimeZone: 'UTC',
    day: {
      periodId: 'fixture-day',
      zonePolicyVersion: 'zone-v1',
      zoneSequence: 0,
      timeZone: 'UTC',
      localDate: '2026-10-12',
      startsAt: '2026-10-12T00:00:00.000Z',
      endsAt: '2026-10-13T00:00:00.000Z',
      travelAdjusted: false,
    },
    eligibility: {
      status: 'READY',
      healthRuleVersion: 'health-v1',
      profileId: id(3),
      profileRevision: 1,
      assessedAt: '2026-10-12T08:00:00.000Z',
      reasonCodes: [],
    },
    restrictions: {
      sourceRecordId: id(4),
      sourceRevision: 1,
      excludedFoodIds: [],
      excludedRecipeIds: [],
      excludedIngredientIds: [],
      excludedAllergenCodes: [],
    },
    preferences: {
      favoredSemanticKeys: [],
      avoidedSemanticKeys: [],
    },
    recordedIntake: {
      nutritionSnapshotId: id(5),
      nutritionRuleVersion: 'nutrition-v1',
      nutrients: [
        {
          state: 'known',
          nutrientId: 'energy',
          amount: '0',
          unit: unit('kcal'),
          source,
        },
        {
          state: 'known',
          nutrientId: 'sodium',
          amount: '0',
          unit: unit('mg'),
          source,
        },
      ],
    },
    targetPolicyVersion: 'targets-v1',
    candidatePolicyVersion: 'free-candidate-policy-v1',
    targets: [
      {
        ruleId: 'energy-reference',
        nutrientId: 'energy',
        type: 'RDA',
        value: { kind: 'point', amount: '100' },
        unit: unit('kcal'),
        horizon: 'daily-average',
        sourceScope: 'all-intake',
        sourceReleaseId: 'science-v1',
        hardLimitApproved: false,
      },
      {
        ruleId: 'sodium-limit',
        nutrientId: 'sodium',
        type: 'UL',
        value: { kind: 'point', amount: '100' },
        unit: unit('mg'),
        horizon: 'daily-limit',
        sourceScope: 'all-intake',
        sourceReleaseId: 'science-v1',
        hardLimitApproved: true,
      },
    ],
    referenceReleases: [{ component: 'food-catalog', releaseId: 'catalog-v1' }],
    slots: [
      {
        state: 'open',
        slotId: id(10),
        position: 1,
        label: 'Dinner',
        candidates: [candidate(1, '80'), candidate(2, '100')],
      },
    ],
    searchProfile: FREE_SEARCH_PROFILE_V1,
  });
}

const stationaryClock = () => 0;

describe('Bounded Free local search v1', () => {
  it('selects the closest evidence-backed nutrition target without publishing READY', () => {
    const result = searchLocalPlanV1(fixture(), { clock: stationaryClock });
    expect(result.status).toBe('DRAFT');
    if (result.status !== 'DRAFT') return;
    expect(result.selections).toEqual([
      {
        slotId: id(10),
        candidateId: id(102),
        portionId: 'base',
      },
    ]);
    expect(result.score.normalizedNutritionDistancePpm).toBe(0);
    expect(result.optimalityGap).toBeNull();
    expect(result.trace.expandedStates).toBe(2);
  });

  it('enforces an exact aggregate daily hard upper limit across slots', () => {
    const input = fixture();
    const first = candidate(1, '50', '60');
    const second = candidate(2, '50', '60');
    const safe = candidate(3, '40', '40');
    input.slots = [
      {
        state: 'open',
        slotId: id(10),
        position: 1,
        label: 'Lunch',
        candidates: [first],
      },
      {
        state: 'open',
        slotId: id(11),
        position: 2,
        label: 'Dinner',
        candidates: [second, safe],
      },
    ];
    const result = searchLocalPlanV1(input, { clock: stationaryClock });
    expect(result.status).toBe('DRAFT');
    if (result.status === 'DRAFT')
      expect(result.selections[1]?.candidateId).toBe(id(103));
  });

  it('proves direct contradiction from already recorded intake', () => {
    const input = fixture();
    const sodium = input.recordedIntake.nutrients.find(
      (item) => item.nutrientId === 'sodium',
    );
    if (sodium?.state !== 'known') throw new Error('Expected known sodium.');
    sodium.amount = '100.0000000000000000000000000001';
    const result = searchLocalPlanV1(input, { clock: stationaryClock });
    expect(result.status).toBe('INFEASIBLE');
    if (result.status === 'INFEASIBLE')
      expect(result.proof).toBe('direct-contradiction');
  });

  it('proves finite exhaustion only when the unpruned options are known', () => {
    const input = fixture();
    if (input.slots[0]?.state !== 'open')
      throw new Error('Expected open slot.');
    input.slots[0].candidates = [candidate(1, '50', '101')];
    const result = searchLocalPlanV1(input, { clock: stationaryClock });
    expect(result.status).toBe('INFEASIBLE');
    if (result.status === 'INFEASIBLE')
      expect(result.proof).toBe('finite-exhaustion');
  });

  it('withholds a draft when hard-limit composition is unknown', () => {
    const input = fixture();
    if (input.slots[0]?.state !== 'open')
      throw new Error('Expected open slot.');
    const unknown = candidate(1, '50');
    unknown.nutrientsPer100EdibleGrams = [
      {
        state: 'known',
        nutrientId: 'energy',
        amount: '50',
        unit: unit('kcal'),
        source,
      },
      { state: 'unknown', nutrientId: 'sodium', reason: 'not-measured' },
    ];
    input.slots[0].candidates = [unknown];
    const result = searchLocalPlanV1(input, { clock: stationaryClock });
    expect(result.status).toBe('NEEDS_INPUT');
  });

  it('withholds a draft when a declared allergen has unresolved evidence', () => {
    const input = fixture();
    input.restrictions.excludedAllergenCodes = ['peanut'];
    if (input.slots[0]?.state !== 'open')
      throw new Error('Expected open slot.');
    const unknown = candidate(1, '50');
    unknown.restrictionEvidence = {
      state: 'unknown',
      reasonCode: 'ingredient-list-missing',
    };
    input.slots[0].candidates = [unknown];
    const result = searchLocalPlanV1(input, { clock: stationaryClock });
    expect(result.status).toBe('NEEDS_INPUT');
    if (result.status === 'NEEDS_INPUT')
      expect(result.reasonCodes).toContain('restriction-evidence-unresolved');
  });

  it('requires source evidence for a scoped hard upper limit', () => {
    const input = fixture();
    input.targets[1]!.sourceScope = 'fortified-and-supplemental';
    const result = searchLocalPlanV1(input, { clock: stationaryClock });
    expect(result.status).toBe('NEEDS_INPUT');
    if (result.status === 'NEEDS_INPUT')
      expect(result.reasonCodes).toContain(
        'source-scoped-upper-limit-evidence-unavailable',
      );
  });

  it('keeps missing soft evidence out of the numeric score', () => {
    const input = fixture();
    if (input.slots[0]?.state !== 'open')
      throw new Error('Expected open slot.');
    input.slots[0].candidates[0]!.nutrientsPer100EdibleGrams = [
      { state: 'unknown', nutrientId: 'energy', reason: 'not-measured' },
      {
        state: 'known',
        nutrientId: 'sodium',
        amount: '0',
        unit: unit('mg'),
        source,
      },
    ];
    input.slots[0].candidates = [input.slots[0].candidates[0]!];
    const result = searchLocalPlanV1(input, { clock: stationaryClock });
    expect(result.status).toBe('DRAFT');
    if (result.status === 'DRAFT') {
      expect(result.score.supportedNutritionTargets).toBe(0);
      expect(result.limitationCodes).toContain(
        'soft-target-composition-unresolved',
      );
    }
  });

  it('returns a watchdog limit without a partial selection', () => {
    let ticks = 0;
    const limited = searchLocalPlanV1(fixture(), {
      clock: () => (ticks++ === 0 ? 0 : 5_000),
    });
    expect(limited.status).toBe('SEARCH_LIMIT');
    if (limited.status === 'SEARCH_LIMIT')
      expect(limited.limit).toBe('watchdog');
  });

  it('supports cancellation and exact replay', () => {
    const controller = new AbortController();
    controller.abort();
    expect(
      searchLocalPlanV1(fixture(), {
        signal: controller.signal,
        clock: stationaryClock,
      }).status,
    ).toBe('CANCELLED');
    expect(searchLocalPlanV1(fixture(), { clock: stationaryClock })).toEqual(
      searchLocalPlanV1(fixture(), { clock: stationaryClock }),
    );
  });

  it('reports a true expansion cap separately from finite infeasibility', () => {
    const input = fixture();
    input.targets = [];
    input.slots = Array.from({ length: 4 }, (_, index) => ({
      state: 'open' as const,
      slotId: id(10 + index),
      position: index + 1,
      label: `Slot ${index + 1}`,
      candidates: Array.from({ length: 24 }, (_, value) => ({
        ...candidate(index * 24 + value + 1, '1'),
        portions: [
          { portionId: 'half', edibleGrams: '50' },
          { portionId: 'base', edibleGrams: '100' },
          { portionId: 'one-and-half', edibleGrams: '150' },
          { portionId: 'double', edibleGrams: '200' },
        ],
      })),
    }));
    const result = searchLocalPlanV1(input, { clock: stationaryClock });
    expect(result.status).toBe('SEARCH_LIMIT');
    if (result.status === 'SEARCH_LIMIT') {
      expect(result.limit).toBe('expansion-limit');
      expect(result.trace.expandedStates).toBe(30_000);
    }
  });

  it('does not claim finite infeasibility after beam pruning', () => {
    const input = fixture();
    input.targets = [input.targets[1]!];
    input.slots = [
      ...Array.from({ length: 2 }, (_, index) => ({
        state: 'open' as const,
        slotId: id(10 + index),
        position: index + 1,
        label: `Slot ${index + 1}`,
        candidates: Array.from({ length: 24 }, (_, value) => ({
          ...candidate(index * 24 + value + 1, '1'),
          portions: [
            { portionId: 'half', edibleGrams: '50' },
            { portionId: 'base', edibleGrams: '100' },
            { portionId: 'one-and-half', edibleGrams: '150' },
            { portionId: 'double', edibleGrams: '200' },
          ],
        })),
      })),
      {
        state: 'open',
        slotId: id(12),
        position: 3,
        label: 'Final',
        candidates: [candidate(49, '1', '101')],
      },
    ];
    const result = searchLocalPlanV1(input, { clock: stationaryClock });
    expect(result.status).toBe('SEARCH_LIMIT');
    if (result.status === 'SEARCH_LIMIT') {
      expect(result.limit).toBe('beam-pruning');
      expect(result.trace.beamPruned).toBe(true);
    }
  });
});
