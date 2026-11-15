import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { JsonValueSchema, canonicalizeJson } from '@nutrixx/canonical-schema';

import {
  nextMealSourceKey,
  type NextMealCandidateSource,
} from './next-meal-candidates.js';
import { createNextMealPlanningDecisionChainV1 } from './next-meal-domain-adapter.js';
import {
  DEFAULT_NEXT_MEAL_PLANNING_POLICY_V1,
  rankNextMealCandidatesV1,
} from './next-meal-ranking.js';
import { comparePlanningShadowSolversV1 } from './planning-shadow-solver.js';

const id = (number: number): string =>
  `00000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
const source = {
  kind: 'dataset',
  sourceId: 'shadow-fixture',
  sourceVersion: '1',
} as const;
const unit = { system: 'ucum', code: 'mg' } as const;
const digest = async (value: string) =>
  createHash('sha256').update(value).digest('hex');

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
    portions: [{ portionId: id(number + 100), edibleGrams: '100', source }],
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

function fixture() {
  const entries = [food(1, '20'), food(2, '10'), food(3, '5')];
  const request = {
    planningPolicy: DEFAULT_NEXT_MEAL_PLANNING_POLICY_V1,
    candidates: {
      requestedAt: '2026-11-12T12:00:00.000Z',
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
      inventory: { mode: 'ALL_CATALOG' as const },
      comparisonNutrients: [{ nutrientId: 'nutrient.iron', unit }],
      hardLimits: [],
    },
    acceptedMeals: [],
    temporalRules: [
      {
        ruleId: 'iron-current-day',
        ruleVersion: 'fixture-v1',
        nutrientId: 'nutrient.iron',
        unit,
        sourceScope: 'all-intake' as const,
        timeBasis: 'elapsed-time' as const,
        windowStartInclusive: '2026-11-12T00:00:00.000Z',
        windowEndExclusive: '2026-11-13T00:00:00.000Z',
        coverage: { state: 'complete' as const, source },
        target: {
          amount: '20',
          mode: 'minimum' as const,
          referenceType: 'planning-target',
          releaseId: 'fixture-release',
          source,
        },
        forecastTargetPerDay: '20',
        weight: 1,
      },
    ],
  };
  const context = {
    problemId: id(900),
    runId: id(901),
    subjectKey: id(902),
    capturedAt: '2026-11-12T12:00:00.000Z',
    validatedAt: '2026-11-12T12:00:01.000Z',
  };
  return { request, context, ranking: rankNextMealCandidatesV1(request) };
}

describe('planning shadow solver', () => {
  function execution(selectedActionId: string, variableCount = 3) {
    return {
      modelKind: 'MILP' as const,
      engine: 'HIGHS' as const,
      engineVersion: '1.15.0',
      modelVersion: 'planning-highs-binary-selection-v1',
      modelSha256: 'a'.repeat(64),
      status: 'OPTIMAL' as const,
      variableCount,
      constraintCount: 1,
      selectedActionId,
      objectiveValue: '0',
      mipGap: { numerator: '0' as const, denominator: '1' as const },
    };
  }

  it('reports exact agreement between independently validated chains', async () => {
    const value = fixture();
    const chain = createNextMealPlanningDecisionChainV1(
      value.request,
      value.ranking,
      value.context,
    );
    const report = await comparePlanningShadowSolversV1({
      comparisonId: id(903),
      evaluatedAt: '2026-11-12T12:00:02.000Z',
      primarySolverVersion: 'primary-v1',
      shadowSolverVersion: 'shadow-v1',
      primaryChain: chain,
      shadowChain: chain,
      shadowExecution: execution(chain.outcome.recommendedActionId!),
      digest,
    });
    expect(report).toMatchObject({
      outcome: 'MATCH',
      severity: 'NONE',
      publicationAuthority: 'PRIMARY_ONLY',
      shadowAffectsPublication: false,
      metrics: {
        stateAgreement: true,
        outcomeStatusAgreement: true,
        feasibleActionSetAgreement: true,
        recommendationAgreement: true,
        completeOrderAgreement: true,
        topK: 3,
        topKIntersectionCount: 3,
      },
    });
    expect(report.shadowExecution).toMatchObject({
      modelKind: 'MILP',
      engine: 'HIGHS',
      status: 'OPTIMAL',
    });
  });

  it('classifies recommendation and order divergence without changing authority', async () => {
    const value = fixture();
    const primaryChain = createNextMealPlanningDecisionChainV1(
      value.request,
      value.ranking,
      value.context,
    );
    const reversed = {
      ...value.ranking,
      ranked: [...value.ranking.ranked]
        .reverse()
        .map((row, index) => ({ ...row, rank: index + 1 })),
    };
    const shadowChain = createNextMealPlanningDecisionChainV1(
      value.request,
      reversed,
      value.context,
    );
    const report = await comparePlanningShadowSolversV1({
      comparisonId: id(904),
      evaluatedAt: '2026-11-12T12:00:02.000Z',
      primarySolverVersion: 'primary-v1',
      shadowSolverVersion: 'shadow-v1',
      primaryChain,
      shadowChain,
      shadowExecution: execution(shadowChain.outcome.recommendedActionId!),
      digest,
    });
    expect(report).toMatchObject({
      outcome: 'RECOMMENDATION_DIVERGENCE',
      severity: 'CRITICAL',
      publicationAuthority: 'PRIMARY_ONLY',
      shadowAffectsPublication: false,
      metrics: {
        feasibleActionSetAgreement: true,
        recommendationAgreement: false,
        completeOrderAgreement: false,
      },
    });
    expect(report.metrics.rankDeltas.length).toBeGreaterThan(0);
  });

  it('produces canonical deterministic evidence for equivalent inputs', async () => {
    const value = fixture();
    const chain = createNextMealPlanningDecisionChainV1(
      value.request,
      value.ranking,
      value.context,
    );
    const input = {
      comparisonId: id(905),
      evaluatedAt: '2026-11-12T12:00:02.000Z',
      primarySolverVersion: 'primary-v1',
      shadowSolverVersion: 'shadow-v1',
      primaryChain: chain,
      shadowChain: chain,
      shadowExecution: execution(chain.outcome.recommendedActionId!),
      digest,
    };
    const first = await comparePlanningShadowSolversV1(input);
    const second = await comparePlanningShadowSolversV1(input);
    expect(canonicalizeJson(JsonValueSchema.parse(first))).toBe(
      canonicalizeJson(JsonValueSchema.parse(second)),
    );
  });
});
