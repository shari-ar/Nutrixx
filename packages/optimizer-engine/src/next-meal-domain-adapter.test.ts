import { describe, expect, it } from 'vitest';

import {
  nextMealSourceKey,
  type NextMealCandidateSource,
} from './next-meal-candidates.js';
import { NEXT_MEAL_HARD_CONSTRAINT_FAMILIES_V1 } from './next-meal-decision-policy.js';
import { createNextMealPlanningDecisionChainV1 } from './next-meal-domain-adapter.js';
import { rankNextMealCandidatesV1 } from './next-meal-ranking.js';

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

function request(entries: readonly NextMealCandidateSource[]) {
  return {
    candidates: {
      requestedAt: '2026-11-08T12:00:00.000Z',
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
    temporalRules: [
      {
        ruleId: 'iron-current-day',
        ruleVersion: 'fixture-v1',
        nutrientId: 'nutrient.iron',
        unit,
        sourceScope: 'all-intake',
        timeBasis: 'elapsed-time',
        windowStartInclusive: '2026-11-08T00:00:00.000Z',
        windowEndExclusive: '2026-11-09T00:00:00.000Z',
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
  };
}

const context = {
  problemId: id(900),
  runId: id(901),
  subjectKey: id(902),
  capturedAt: '2026-11-08T12:00:00.000Z',
  validatedAt: '2026-11-08T12:00:01.000Z',
};

describe('next-meal planning domain adapter', () => {
  it('projects the active comparator and its complete action order', () => {
    const input = request([food(1, '20'), food(2, '5')]);
    const ranking = rankNextMealCandidatesV1(input);
    const chain = createNextMealPlanningDecisionChainV1(
      input,
      ranking,
      context,
    );

    expect(chain.problem.actions).toHaveLength(2);
    expect(chain.problem.state.stateKey).toContain(
      'next-meal-terminal-value-v1',
    );
    expect(
      chain.problem.constraints.map(({ constraintId }) => constraintId),
    ).toEqual([
      'integrity.complete-catalog-census',
      'integrity.frozen-revision-bindings',
      'eligibility.supported-intended-use',
      'safety.declared-exclusions',
      'eligibility.comparable-evidence',
      'preparation.edible-portion-resolved',
      'preparation.dimensionally-valid-portion',
      'schedule.rolling-horizon-consistency',
    ]);
    expect(
      chain.problem.objectives.map(({ objectiveId }) => objectiveId),
    ).toEqual([
      'nutrition.robust-maximum-gap',
      'nutrition.robust-weighted-gap',
      'nutrition.terminal-maximum-gap',
      'nutrition.terminal-weighted-gap',
      'nutrition.nominal-maximum-gap',
      'nutrition.nominal-weighted-gap',
      'nutrition.immediate-maximum-gap',
      'nutrition.immediate-weighted-gap',
      'nutrition.energy-macro-pattern',
      'personalization.expected-adherence',
      'personalization.culture-satiety-fit',
      'practicality.portion-size',
      'context.variety-repetition',
      'context.cost-preparation-waste',
      'stability.previous-intention-change',
      'stability.deterministic-identity',
    ]);
    expect(chain.outcome.status).toBe('READY');
    expect(chain.outcome.recommendedActionId).toBe(
      chain.outcome.actionOutcomes[0]?.actionId,
    );
    expect(
      chain.problem.objectives.filter(
        ({ activation }) => activation.status === 'ACTIVE',
      ),
    ).toHaveLength(11);
    expect(
      chain.outcome.actionOutcomes[0]?.objectiveResults.filter(
        ({ scenarioId }) => scenarioId === undefined,
      ),
    ).toHaveLength(11);
    expect(
      chain.outcome.actionOutcomes[0]?.objectiveResults.filter(
        ({ scenarioId }) => scenarioId !== undefined,
      ),
    ).toHaveLength(12);
    expect(chain.problem.state.horizon).toMatchObject({
      uncertaintyPolicyVersion: 'next-meal-uncertainty-policy-v1',
      terminalValuePolicyVersion: 'next-meal-terminal-value-v1',
      terminalTailDays: 1,
      scenarios: [
        { role: 'NOMINAL', perturbations: [] },
        {
          role: 'STRESS',
          perturbations: [{ kind: 'future-opportunity-loss', count: 1 }],
        },
      ],
    });
  });

  it('represents a complete census without an actionable candidate', () => {
    const unresolved = {
      ...food(1, '20'),
      edibleResolution: 'requires-preparation' as const,
      portions: [],
    };
    const input = request([unresolved]);
    const ranking = rankNextMealCandidatesV1(input);
    const chain = createNextMealPlanningDecisionChainV1(
      input,
      ranking,
      context,
    );

    expect(chain.problem.actions).toEqual([]);
    expect(chain.outcome.actionOutcomes).toEqual([]);
    expect(chain.outcome.status).toBe('NEEDS_INPUT');
    expect(chain.outcome.censusComplete).toBe(true);
  });

  it('instantiates conditional safety, inventory, recipe, and nutrient limits', () => {
    const ingredient = food(1, '20');
    const candidate: NextMealCandidateSource = {
      ...food(2, '20'),
      reference: {
        kind: 'recipe',
        recipeId: id(700),
        recipeVersion: 1,
      },
      recipe: {
        yieldEdibleGrams: '100',
        ingredients: [
          {
            reference: ingredient.reference,
            edibleGramsForYield: '100',
            preparationState: ingredient.preparationState,
          },
        ],
      },
    };
    const base = request([ingredient, candidate]);
    const input = {
      ...base,
      candidates: {
        ...base.candidates,
        exclusions: {
          ...base.candidates.exclusions,
          allergenCodes: ['allergen.peanut'],
        },
        inventory: {
          mode: 'AVAILABLE_ONLY' as const,
          revision: 1,
          entries: [
            {
              reference: ingredient.reference,
              edibleGrams: '200',
              preparationState: ingredient.preparationState,
            },
          ],
        },
        hardLimits: [
          {
            ruleId: 'iron-upper-limit',
            nutrientId: 'nutrient.iron',
            unit,
            maximum: '100',
            recordedIntake: { state: 'known' as const, amount: '0' },
            sourceScope: 'all-intake' as const,
          },
        ],
      },
    };
    const chain = createNextMealPlanningDecisionChainV1(
      input,
      rankNextMealCandidatesV1(input),
      context,
    );

    expect(
      chain.problem.constraints.map(({ constraintId }) => constraintId),
    ).toEqual(
      expect.arrayContaining([
        'safety.verified-restriction-evidence',
        'inventory.selected-mode-availability',
        'inventory.recipe-ingredient-sufficiency',
        'nutrient-limit.rule-1',
      ]),
    );
    expect(
      chain.problem.constraints.every(({ strength }) => strength === 'HARD'),
    ).toBe(true);
    const recipeConstraint = chain.problem.constraints.find(
      ({ constraintId }) =>
        constraintId === 'inventory.recipe-ingredient-sufficiency',
    );
    expect(recipeConstraint?.scope.kind).toBe('actions');
    if (recipeConstraint?.scope.kind !== 'actions') return;
    expect(recipeConstraint.scope.actionIds).toHaveLength(1);
    const foodOutcome = chain.outcome.actionOutcomes.find((outcome) =>
      outcome.actionId.includes('food:'),
    );
    expect(
      foodOutcome?.constraintResults.some(
        ({ constraintId }) =>
          constraintId === 'inventory.recipe-ingredient-sufficiency',
      ),
    ).toBe(false);
    const policyFamilies = new Set<string>(
      NEXT_MEAL_HARD_CONSTRAINT_FAMILIES_V1.map(({ familyCode }) => familyCode),
    );
    expect(
      chain.problem.constraints.every(({ constraintFamily }) =>
        policyFamilies.has(constraintFamily),
      ),
    ).toBe(true);
  });
});
