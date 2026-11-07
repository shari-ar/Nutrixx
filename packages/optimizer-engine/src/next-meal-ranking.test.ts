import { describe, expect, it } from 'vitest';

import {
  nextMealSourceKey,
  type NextMealCandidateSource,
} from './next-meal-candidates.js';
import {
  DEFAULT_NEXT_MEAL_PLANNING_POLICY_V1,
  rankNextMealCandidatesChunkedV1,
  rankNextMealCandidatesV1,
  type NextMealRankingChunkProgressV1,
} from './next-meal-ranking.js';

const id = (number: number): string =>
  `00000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
const source = {
  kind: 'dataset',
  sourceId: 'fixture',
  sourceVersion: '1',
} as const;
const unit = { system: 'ucum', code: 'mg' } as const;

function food(number: number, amount: string): NextMealCandidateSource {
  return {
    reference: {
      kind: 'food',
      catalogReleaseId: 'fixture-release',
      foodId: id(number),
      foodRevision: 1,
    },
    displayName: `Food ${number}`,
    preparationState: 'prepared',
    edibleResolution: 'resolved',
    portions: [
      { portionId: id(number + 100), edibleGrams: '100', source },
      { portionId: id(number + 200), edibleGrams: '200', source },
    ],
    nutrientsPer100EdibleGrams: [
      {
        state: 'known',
        nutrientId: 'nutrient.iron',
        amountPer100EdibleGrams: amount,
        unit,
        source,
      },
    ],
    restrictionEvidence: {
      state: 'verified',
      ingredientFoodIds: [],
      allergenCodes: [],
      source,
    },
  };
}

function rule(ruleId: string, start: string, weight = 1) {
  return {
    ruleId,
    ruleVersion: 'fixture-v1',
    nutrientId: 'nutrient.iron',
    unit,
    sourceScope: 'all-intake',
    timeBasis: 'elapsed-time',
    windowStartInclusive: start,
    windowEndExclusive: '2026-10-13T00:00:00.000Z',
    coverage: { state: 'complete', source },
    target: {
      amount: '25',
      mode: 'preferred',
      referenceType: 'planning-target',
      releaseId: 'fixture-release',
      source,
    },
    forecastTargetPerDay: '25',
    weight,
  };
}

function request(entries: readonly NextMealCandidateSource[]) {
  return {
    candidates: {
      requestedAt: '2026-10-12T10:00:00.000Z',
      manifest: {
        entryKeys: entries
          .map((entry) => nextMealSourceKey(entry.reference))
          .sort(),
      },
      entries,
      exclusions: {
        foodIds: [],
        recipeIds: [],
        ingredientFoodIds: [],
        allergenCodes: [],
      },
      inventory: { mode: 'ALL_CATALOG' },
      comparisonNutrients: [{ nutrientId: 'nutrient.iron', unit }],
      hardLimits: [],
    },
    acceptedMeals: [],
    temporalRules: [rule('iron-current-day', '2026-10-12T00:00:00.000Z')],
  };
}

function priorMeal(number: number, amount: string, consumedAt: string) {
  return {
    mealId: id(number),
    revision: 1,
    consumedAt,
    nutrients: [
      {
        state: 'known',
        nutrientId: 'nutrient.iron',
        amount,
        unit,
        source,
      },
    ],
  };
}

describe('next-meal ranking', () => {
  it('chunks classification and scoring without changing the exact ranking', async () => {
    const input = request([food(2, '5'), food(1, '20')]);
    const progress: NextMealRankingChunkProgressV1[] = [];
    let yields = 0;
    const chunked = await rankNextMealCandidatesChunkedV1(input, {
      chunkSize: 1,
      adaptiveChunkSize: false,
      onProgress: (update) => progress.push(update),
      yieldControl: async () => {
        yields++;
      },
    });

    expect(chunked).toEqual(rankNextMealCandidatesV1(input));
    expect(progress).toEqual([
      {
        phase: 'classifying',
        processed: 0,
        total: 2,
        chunkSize: 1,
        recommendedChunkSize: 1,
      },
      {
        phase: 'classifying',
        processed: 1,
        total: 2,
        chunkSize: 1,
        recommendedChunkSize: 1,
      },
      {
        phase: 'classifying',
        processed: 2,
        total: 2,
        chunkSize: 1,
        recommendedChunkSize: 1,
      },
      {
        phase: 'scoring',
        processed: 0,
        total: 2,
        chunkSize: 1,
        recommendedChunkSize: 1,
      },
      {
        phase: 'scoring',
        processed: 1,
        total: 2,
        chunkSize: 1,
        recommendedChunkSize: 1,
      },
      {
        phase: 'scoring',
        processed: 2,
        total: 2,
        chunkSize: 1,
        recommendedChunkSize: 1,
      },
    ]);
    expect(yields).toBe(2);
  });

  it('benchmarks actual work and expands chunks on a faster device', async () => {
    const input = request(
      Array.from({ length: 8 }, (_, index) => food(index + 1, '10')),
    );
    const progress: NextMealRankingChunkProgressV1[] = [];
    let tick = 0;
    const chunked = await rankNextMealCandidatesChunkedV1(input, {
      chunkSize: 2,
      minimumChunkSize: 1,
      maximumChunkSize: 8,
      targetChunkDurationMs: 8,
      now: () => tick++,
      onProgress: (update) => progress.push(update),
    });

    expect(chunked).toEqual(rankNextMealCandidatesV1(input));
    expect(
      progress
        .filter((update) => update.phase === 'classifying')
        .map(({ processed, chunkSize }) => ({ processed, chunkSize })),
    ).toEqual([
      { processed: 0, chunkSize: 2 },
      { processed: 2, chunkSize: 2 },
      { processed: 6, chunkSize: 4 },
      { processed: 8, chunkSize: 2 },
    ]);
    expect(
      progress
        .filter((update) => update.phase === 'scoring')
        .map(({ processed, chunkSize }) => ({ processed, chunkSize })),
    ).toEqual([
      { processed: 0, chunkSize: 2 },
      { processed: 2, chunkSize: 2 },
      { processed: 6, chunkSize: 4 },
      { processed: 8, chunkSize: 2 },
    ]);
  });

  it('changes the first choice when actual recorded intake changes', () => {
    const high = food(1, '20');
    const low = food(2, '5');
    const base = {
      ...request([low, high]),
      planningPolicy: {
        ...DEFAULT_NEXT_MEAL_PLANNING_POLICY_V1,
        horizonDays: 2,
        opportunitiesPerDay: 1,
        robustScenarios: [
          { scenarioId: 'expected-schedule', missedFutureOpportunities: 0 },
        ],
      },
    };
    const before = rankNextMealCandidatesV1(base);
    const after = rankNextMealCandidatesV1({
      ...base,
      acceptedMeals: [priorMeal(500, '20', '2026-10-12T08:00:00.000Z')],
    });
    expect(before.ranked[0]?.candidateKey).toBe(
      nextMealSourceKey(high.reference),
    );
    expect(after.ranked[0]?.candidateKey).toBe(
      nextMealSourceKey(low.reference),
    );
    expect(after.ranked).toHaveLength(2);
    expect(after.ranked[0]?.ruleScores[0]?.recordedAmount).toEqual({
      numerator: '20',
      denominator: '1',
    });
  });

  it('uses the least favorable rolling-horizon schedule without publishing future meals', () => {
    const candidate = food(1, '12.5');
    const base = request([candidate]);
    const expectedOnly = rankNextMealCandidatesV1({
      ...base,
      planningPolicy: {
        ...DEFAULT_NEXT_MEAL_PLANNING_POLICY_V1,
        horizonDays: 2,
        opportunitiesPerDay: 1,
        robustScenarios: [
          { scenarioId: 'expected-schedule', missedFutureOpportunities: 0 },
        ],
      },
    });
    const robust = rankNextMealCandidatesV1({
      ...base,
      planningPolicy: {
        ...DEFAULT_NEXT_MEAL_PLANNING_POLICY_V1,
        horizonDays: 2,
        opportunitiesPerDay: 1,
        robustScenarios: [
          { scenarioId: 'expected-schedule', missedFutureOpportunities: 0 },
          { scenarioId: 'one-opportunity-lost', missedFutureOpportunities: 1 },
        ],
      },
    });

    expect(expectedOnly.ranked[0]?.weightedDistance).toEqual({
      numerator: '0',
      denominator: '1',
    });
    expect(robust.ranked[0]?.weightedDistance).toEqual({
      numerator: '1',
      denominator: '2',
    });
    expect(Object.keys(robust.ranked[0]!).sort()).toEqual([
      'candidateKey',
      'classification',
      'edibleGrams',
      'maximumDistance',
      'portionId',
      'rank',
      'ruleScores',
      'weightedDistance',
    ]);
  });

  it('uses each sourced rule window independently, including previous days', () => {
    const high = food(1, '20');
    const low = food(2, '5');
    const input = {
      ...request([high, low]),
      acceptedMeals: [priorMeal(500, '20', '2026-10-11T08:00:00.000Z')],
      temporalRules: [
        rule('iron-rolling-days', '2026-10-09T00:00:00.000Z', 2),
        rule('iron-current-day', '2026-10-12T00:00:00.000Z'),
      ],
    };
    const result = rankNextMealCandidatesV1(input);
    expect(result.ranked[0]?.candidateKey).toBe(
      nextMealSourceKey(low.reference),
    );
    expect(
      result.ranked[0]?.ruleScores.map((item) => item.recordedAmount),
    ).toEqual([
      { numerator: '0', denominator: '1' },
      { numerator: '20', denominator: '1' },
    ]);
    expect(
      rankNextMealCandidatesV1({
        ...input,
        candidates: {
          ...input.candidates,
          entries: [low, high],
        },
      }),
    ).toEqual(result);
  });

  it('scores only hard-limit-safe portions and resolves exact ties by identity', () => {
    const first = food(1, '20');
    const second = food(2, '20');
    const base = request([second, first]);
    const result = rankNextMealCandidatesV1({
      ...base,
      candidates: {
        ...base.candidates,
        hardLimits: [
          {
            ruleId: 'iron-upper-limit',
            nutrientId: 'nutrient.iron',
            unit,
            maximum: '30',
            recordedIntake: { state: 'known', amount: '0' },
            sourceScope: 'all-intake',
          },
        ],
      },
    });
    expect(result.ranked.map((item) => item.candidateKey)).toEqual([
      nextMealSourceKey(first.reference),
      nextMealSourceKey(second.reference),
    ]);
    expect(result.ranked.map((item) => item.edibleGrams)).toEqual([
      '100',
      '100',
    ]);
  });

  it('keeps incomplete historical evidence visible without a numeric rank', () => {
    const candidate = food(1, '20');
    const base = request([candidate]);
    const result = rankNextMealCandidatesV1({
      ...base,
      temporalRules: [
        {
          ...base.temporalRules[0],
          coverage: { state: 'unknown', reasonCode: 'unlogged-history' },
        },
      ],
    });
    expect(result.ranked).toHaveLength(0);
    expect(result.unranked[0]).toMatchObject({
      classification: 'EVIDENCE_LIMITED',
      reasonCodes: ['history-evidence-unresolved:iron-current-day'],
    });
    expect(result.total).toBe(1);
    expect(result.processed).toBe(1);
    expect(result.counts.EVIDENCE_LIMITED).toBe(1);
  });

  it('does not penalize exceeding a minimum target after hard-limit checks', () => {
    const high = food(1, '20');
    const low = food(2, '5');
    const base = request([low, high]);
    const result = rankNextMealCandidatesV1({
      ...base,
      acceptedMeals: [priorMeal(500, '25', '2026-10-12T08:00:00.000Z')],
      temporalRules: [
        {
          ...base.temporalRules[0],
          target: {
            ...base.temporalRules[0]!.target,
            mode: 'minimum',
            referenceType: 'rda',
          },
        },
      ],
    });
    expect(result.ranked.map((item) => item.weightedDistance)).toEqual([
      { numerator: '0', denominator: '1' },
      { numerator: '0', denominator: '1' },
    ]);
  });
});
