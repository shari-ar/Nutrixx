import { describe, expect, it } from 'vitest';

import {
  nextMealSourceKey,
  type NextMealCandidateSource,
} from './next-meal-candidates.js';
import { createNextMealPlanningDecisionChainV1 } from './next-meal-domain-adapter.js';
import {
  NextMealRankingRequestSchema,
  rankNextMealCandidatesV1,
} from './next-meal-ranking.js';
import {
  PLANNING_DECISION_VALIDATOR_VERSION_V1,
  validatePlanningDecisionChainV1,
} from './planning-decision-validator.js';

const id = (number: number): string =>
  `00000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
const source = {
  kind: 'dataset',
  sourceId: 'validator-fixture',
  sourceVersion: '1',
} as const;
const unit = { system: 'ucum', code: 'mg' } as const;

function food(number: number): NextMealCandidateSource {
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
        amountPer100EdibleGrams: '10',
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

function infeasibleChain() {
  const first = food(1);
  const second = food(2);
  const entries = [first, second];
  const request = NextMealRankingRequestSchema.parse({
    candidates: {
      requestedAt: '2026-11-11T10:00:00.000Z',
      manifest: {
        entryKeys: entries
          .map((entry) => nextMealSourceKey(entry.reference))
          .sort(),
      },
      entries,
      exclusions: {
        foodIds: [id(1)],
        recipeIds: [],
        ingredientFoodIds: [],
        allergenCodes: [],
      },
      inventory: { mode: 'AVAILABLE_ONLY', revision: 1, entries: [] },
      comparisonNutrients: [{ nutrientId: 'nutrient.iron', unit }],
      hardLimits: [],
    },
    acceptedMeals: [],
    temporalRules: [
      {
        ruleId: 'iron-current-window',
        ruleVersion: 'fixture-v1',
        nutrientId: 'nutrient.iron',
        unit,
        sourceScope: 'all-intake',
        timeBasis: 'elapsed-time',
        windowStartInclusive: '2026-11-10T10:00:00.000Z',
        windowEndExclusive: '2026-11-12T10:00:00.000Z',
        coverage: { state: 'complete', source },
        target: {
          amount: '20',
          mode: 'minimum',
          referenceType: 'planning-target',
          releaseId: 'fixture-release',
          source,
        },
        forecastTargetPerDay: '20',
        weight: 1,
      },
    ],
  });
  return createNextMealPlanningDecisionChainV1(
    request,
    rankNextMealCandidatesV1(request),
    {
      problemId: id(900),
      runId: id(901),
      subjectKey: id(902),
      capturedAt: '2026-11-11T10:00:00.000Z',
      validatedAt: '2026-11-11T10:00:01.000Z',
    },
  );
}

describe('independent planning decision validator', () => {
  it('approves a complete infeasibility proof from the operational adapter', () => {
    const chain = infeasibleChain();
    expect(chain.outcome).toMatchObject({
      status: 'INFEASIBLE',
      validatorVersion: PLANNING_DECISION_VALIDATOR_VERSION_V1,
      diagnosis: {
        conflictSet: {
          reasonCodes: ['excluded-food', 'inventory-insufficient'],
          coveredCandidateCount: 2,
          complete: true,
        },
      },
    });
    expect(validatePlanningDecisionChainV1(chain)).toMatchObject({
      status: 'APPROVED',
      validatorVersion: PLANNING_DECISION_VALIDATOR_VERSION_V1,
    });
  });

  it('rejects a chain that claims complete conflict coverage without proof', () => {
    const chain = infeasibleChain();
    const altered = structuredClone(chain);
    altered.outcome.diagnosis.conflictSet.reasonCodes = ['excluded-food'];

    expect(validatePlanningDecisionChainV1(altered)).toEqual({
      status: 'REJECTED',
      validatorVersion: PLANNING_DECISION_VALIDATOR_VERSION_V1,
      reasonCodes: ['conflict-set-coverage-mismatch'],
    });
  });

  it('rejects a Decision Chain carrying a different validator identity', () => {
    const chain = infeasibleChain();
    const altered = structuredClone(chain);
    altered.outcome.validatorVersion = 'untrusted-validator';

    expect(validatePlanningDecisionChainV1(altered)).toEqual({
      status: 'REJECTED',
      validatorVersion: PLANNING_DECISION_VALIDATOR_VERSION_V1,
      reasonCodes: ['validator-version-mismatch'],
    });
  });
});
