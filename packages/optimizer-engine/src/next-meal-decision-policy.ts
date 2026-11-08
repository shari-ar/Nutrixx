import {
  PlanningObjectiveV1Schema,
  type PlanningObjectiveV1,
} from './planning-domain-model.js';

export const NEXT_MEAL_HARD_CONSTRAINT_POLICY_VERSION_V1 =
  'next-meal-hard-constraints-v1' as const;
export const NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1 =
  'next-meal-objective-hierarchy-v1' as const;
export const NEXT_MEAL_UNCERTAINTY_POLICY_VERSION_V1 =
  'next-meal-uncertainty-policy-v1' as const;
export const NEXT_MEAL_TERMINAL_VALUE_POLICY_VERSION_V1 =
  'next-meal-terminal-value-v1' as const;

export const NEXT_MEAL_HARD_CONSTRAINT_FAMILIES_V1 = [
  {
    familyCode: 'integrity',
    applicability: 'ALWAYS',
    enforcementStages: ['INPUT_VALIDATION', 'OUTPUT_VALIDATION'],
  },
  {
    familyCode: 'intended-use',
    applicability: 'ALWAYS',
    enforcementStages: ['INPUT_VALIDATION'],
  },
  {
    familyCode: 'safety-restrictions',
    applicability: 'WHEN_DECLARED',
    enforcementStages: ['CANDIDATE_CLASSIFICATION'],
  },
  {
    familyCode: 'evidence-completeness',
    applicability: 'ALWAYS',
    enforcementStages: ['CANDIDATE_CLASSIFICATION'],
  },
  {
    familyCode: 'portion-validity',
    applicability: 'ALWAYS',
    enforcementStages: ['INPUT_VALIDATION', 'CANDIDATE_CLASSIFICATION'],
  },
  {
    familyCode: 'inventory-feasibility',
    applicability: 'WHEN_INVENTORY_MODE_ACTIVE',
    enforcementStages: ['CANDIDATE_CLASSIFICATION'],
  },
  {
    familyCode: 'horizon-consistency',
    applicability: 'ALWAYS',
    enforcementStages: ['HORIZON_SEARCH'],
  },
  {
    familyCode: 'nutrient-upper-limit',
    applicability: 'WHEN_RULE_PRESENT',
    enforcementStages: ['HORIZON_SEARCH'],
  },
] as const;

const POLICY_SOURCE = {
  kind: 'calculation',
  sourceId: 'nutrixx-next-meal-decision-policy',
  sourceVersion: NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1,
} as const;

const active = { status: 'ACTIVE' } as const;
const deferred = (reasonCode: string, ...requiredFactTypes: string[]) =>
  ({
    status: 'DEFERRED',
    reasonCode,
    requiredFactTypes,
  }) as const;

/**
 * Complete product hierarchy. Deferred slots preserve policy intent without
 * inventing a score until their required facts and validated model exist.
 */
export function nextMealObjectiveHierarchyV1(): PlanningObjectiveV1[] {
  return PlanningObjectiveV1Schema.array().parse([
    {
      objectiveId: 'nutrition.robust-maximum-gap',
      objectiveVersion: NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1,
      priorityTier: 2,
      orderWithinTier: 0,
      direction: 'MINIMIZE',
      metricCode: 'normalized-nutrient-gap',
      temporalScope: 'HORIZON',
      scenarioAggregation: 'WORST_CASE',
      weight: '1',
      activation: active,
      source: POLICY_SOURCE,
    },
    {
      objectiveId: 'nutrition.robust-weighted-gap',
      objectiveVersion: NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1,
      priorityTier: 2,
      orderWithinTier: 1,
      direction: 'MINIMIZE',
      metricCode: 'weighted-nutrient-gap',
      temporalScope: 'HORIZON',
      scenarioAggregation: 'WORST_CASE',
      weight: '1',
      activation: active,
      source: POLICY_SOURCE,
    },
    {
      objectiveId: 'nutrition.terminal-maximum-gap',
      objectiveVersion: NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1,
      priorityTier: 2,
      orderWithinTier: 2,
      direction: 'MINIMIZE',
      metricCode: 'normalized-nutrient-gap',
      temporalScope: 'TERMINAL',
      scenarioAggregation: 'WORST_CASE',
      weight: '1',
      activation: active,
      source: POLICY_SOURCE,
    },
    {
      objectiveId: 'nutrition.terminal-weighted-gap',
      objectiveVersion: NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1,
      priorityTier: 2,
      orderWithinTier: 3,
      direction: 'MINIMIZE',
      metricCode: 'weighted-nutrient-gap',
      temporalScope: 'TERMINAL',
      scenarioAggregation: 'WORST_CASE',
      weight: '1',
      activation: active,
      source: POLICY_SOURCE,
    },
    {
      objectiveId: 'nutrition.nominal-maximum-gap',
      objectiveVersion: NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1,
      priorityTier: 2,
      orderWithinTier: 4,
      direction: 'MINIMIZE',
      metricCode: 'normalized-nutrient-gap',
      temporalScope: 'HORIZON',
      scenarioAggregation: 'NOMINAL',
      weight: '1',
      activation: active,
      source: POLICY_SOURCE,
    },
    {
      objectiveId: 'nutrition.nominal-weighted-gap',
      objectiveVersion: NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1,
      priorityTier: 2,
      orderWithinTier: 5,
      direction: 'MINIMIZE',
      metricCode: 'weighted-nutrient-gap',
      temporalScope: 'HORIZON',
      scenarioAggregation: 'NOMINAL',
      weight: '1',
      activation: active,
      source: POLICY_SOURCE,
    },
    {
      objectiveId: 'nutrition.immediate-maximum-gap',
      objectiveVersion: NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1,
      priorityTier: 2,
      orderWithinTier: 6,
      direction: 'MINIMIZE',
      metricCode: 'normalized-nutrient-gap',
      temporalScope: 'IMMEDIATE',
      scenarioAggregation: 'NONE',
      weight: '1',
      activation: active,
      source: POLICY_SOURCE,
    },
    {
      objectiveId: 'nutrition.immediate-weighted-gap',
      objectiveVersion: NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1,
      priorityTier: 2,
      orderWithinTier: 7,
      direction: 'MINIMIZE',
      metricCode: 'weighted-nutrient-gap',
      temporalScope: 'IMMEDIATE',
      scenarioAggregation: 'NONE',
      weight: '1',
      activation: active,
      source: POLICY_SOURCE,
    },
    {
      objectiveId: 'nutrition.energy-macro-pattern',
      objectiveVersion: NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1,
      priorityTier: 3,
      orderWithinTier: 0,
      direction: 'MINIMIZE',
      metricCode: 'energy-macro-pattern-distance',
      temporalScope: 'HORIZON',
      scenarioAggregation: 'WORST_CASE',
      weight: '0',
      activation: deferred(
        'dedicated-pattern-model-required',
        'energy-target',
        'macronutrient-range',
        'dietary-pattern-policy',
      ),
      source: POLICY_SOURCE,
    },
    {
      objectiveId: 'personalization.expected-adherence',
      objectiveVersion: NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1,
      priorityTier: 4,
      orderWithinTier: 0,
      direction: 'MAXIMIZE',
      metricCode: 'expected-adherence',
      temporalScope: 'IMMEDIATE',
      scenarioAggregation: 'EXPECTED',
      weight: '0',
      activation: deferred(
        'validated-adherence-model-required',
        'preference-history',
        'acceptance-history',
      ),
      source: POLICY_SOURCE,
    },
    {
      objectiveId: 'personalization.culture-satiety-fit',
      objectiveVersion: NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1,
      priorityTier: 4,
      orderWithinTier: 1,
      direction: 'MAXIMIZE',
      metricCode: 'culture-satiety-fit',
      temporalScope: 'IMMEDIATE',
      scenarioAggregation: 'NONE',
      weight: '0',
      activation: deferred(
        'personal-context-required',
        'culture-preference',
        'satiety-context',
      ),
      source: POLICY_SOURCE,
    },
    {
      objectiveId: 'practicality.portion-size',
      objectiveVersion: NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1,
      priorityTier: 4,
      orderWithinTier: 2,
      direction: 'MINIMIZE',
      metricCode: 'edible-grams',
      temporalScope: 'IMMEDIATE',
      scenarioAggregation: 'NONE',
      weight: '1',
      activation: active,
      source: POLICY_SOURCE,
    },
    {
      objectiveId: 'context.variety-repetition',
      objectiveVersion: NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1,
      priorityTier: 5,
      orderWithinTier: 0,
      direction: 'MINIMIZE',
      metricCode: 'candidate-repetition-count',
      temporalScope: 'HORIZON',
      scenarioAggregation: 'WORST_CASE',
      weight: '1',
      activation: active,
      source: POLICY_SOURCE,
    },
    {
      objectiveId: 'context.cost-preparation-waste',
      objectiveVersion: NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1,
      priorityTier: 5,
      orderWithinTier: 1,
      direction: 'MINIMIZE',
      metricCode: 'contextual-burden',
      temporalScope: 'HORIZON',
      scenarioAggregation: 'EXPECTED',
      weight: '0',
      activation: deferred(
        'practical-context-required',
        'food-cost',
        'preparation-effort',
        'inventory-expiry',
      ),
      source: POLICY_SOURCE,
    },
    {
      objectiveId: 'stability.previous-intention-change',
      objectiveVersion: NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1,
      priorityTier: 6,
      orderWithinTier: 0,
      direction: 'MINIMIZE',
      metricCode: 'previous-intention-change',
      temporalScope: 'IMMEDIATE',
      scenarioAggregation: 'NONE',
      weight: '0',
      activation: deferred(
        'still-valid-intention-required',
        'previous-planning-intention',
      ),
      source: POLICY_SOURCE,
    },
    {
      objectiveId: 'stability.deterministic-identity',
      objectiveVersion: NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1,
      priorityTier: 6,
      orderWithinTier: 1,
      direction: 'MINIMIZE',
      metricCode: 'stable-action-order',
      temporalScope: 'IMMEDIATE',
      scenarioAggregation: 'NONE',
      weight: '1',
      activation: active,
      source: POLICY_SOURCE,
    },
  ]);
}

export const NEXT_MEAL_ACTIVE_OBJECTIVE_IDS_V1 = nextMealObjectiveHierarchyV1()
  .filter(({ activation }) => activation.status === 'ACTIVE')
  .map(({ objectiveId }) => objectiveId);
