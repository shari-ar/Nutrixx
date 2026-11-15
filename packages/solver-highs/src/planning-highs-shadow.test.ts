import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_NEXT_MEAL_PLANNING_POLICY_V1,
  createNextMealPlanningDecisionChainV1,
  nextMealSourceKey,
  rankNextMealCandidatesV1,
  type NextMealCandidateSource,
} from '@nutrixx/optimizer-engine';

import {
  HIGHS_SHADOW_MODEL_VERSION_V1,
  HIGHS_SHADOW_SOLVER_VERSION_V1,
  solvePlanningHighsShadowV1,
  type HighsShadowRuntimeV1,
} from './planning-highs-shadow.js';

const id = (number: number): string =>
  `00000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
const source = {
  kind: 'dataset',
  sourceId: 'highs-shadow-fixture',
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

function fixture(candidateCount = 3) {
  const entries = Array.from({ length: candidateCount }, (_, index) =>
    food(index + 1, String((candidateCount - index) * 5)),
  );
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
  const ranking = rankNextMealCandidatesV1(request);
  return createNextMealPlanningDecisionChainV1(request, ranking, {
    problemId: id(900),
    runId: id(901),
    subjectKey: id(902),
    capturedAt: '2026-11-12T12:00:00.000Z',
    validatedAt: '2026-11-12T12:00:01.000Z',
  });
}

describe('HiGHS MILP planning shadow', () => {
  it('solves the binary action model with the real WebAssembly runtime', async () => {
    const primary = fixture();
    const result = await solvePlanningHighsShadowV1({
      primaryChain: primary,
      digest,
    });

    expect(HIGHS_SHADOW_SOLVER_VERSION_V1).toContain('highs-js-1.15.4');
    expect(result.execution).toMatchObject({
      modelKind: 'MILP',
      engine: 'HIGHS',
      modelVersion: HIGHS_SHADOW_MODEL_VERSION_V1,
      status: 'OPTIMAL',
      variableCount: 3,
      constraintCount: 4,
      objectiveValue: '0',
      mipGap: { numerator: '0', denominator: '1' },
    });
    expect(result.execution.modelSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.chain.outcome.recommendedActionId).toBe(
      primary.outcome.recommendedActionId,
    );
    expect(
      result.chain.outcome.actionOutcomes.map(({ actionId, rank }) => ({
        actionId,
        rank,
      })),
    ).toEqual(
      primary.outcome.actionOutcomes.map(({ actionId, rank }) => ({
        actionId,
        rank,
      })),
    );
  });

  it('rejects a runtime selection that conflicts with the exact hierarchy', async () => {
    const runtime = {
      version: {
        major: 1,
        minor: 15,
        patch: 0,
        string: '1.15.0',
        gitHash: 'x',
      },
      solve: () => ({
        Status: 'Optimal',
        ObjectiveValue: 1,
        Columns: {
          x0: { Primal: 0 },
          x1: { Primal: 1 },
          x2: { Primal: 0 },
        },
        Rows: [],
      }),
    } as unknown as HighsShadowRuntimeV1;

    await expect(
      solvePlanningHighsShadowV1({
        primaryChain: fixture(),
        digest,
        loadRuntime: async () => runtime,
      }),
    ).rejects.toThrow('diverged from the exact lexicographic model');
  });

  it('solves wrapped LP sections for a larger candidate set', async () => {
    const result = await solvePlanningHighsShadowV1({
      primaryChain: fixture(30),
      digest,
    });

    expect(result.execution.variableCount).toBe(30);
    expect(result.execution.status).toBe('OPTIMAL');
  });
});
