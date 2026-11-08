import { describe, expect, it } from 'vitest';

import {
  NEXT_MEAL_ACTIVE_OBJECTIVE_IDS_V1,
  NEXT_MEAL_HARD_CONSTRAINT_FAMILIES_V1,
  NEXT_MEAL_HARD_CONSTRAINT_POLICY_VERSION_V1,
  NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1,
  nextMealObjectiveHierarchyV1,
} from './next-meal-decision-policy.js';

describe('next-meal decision policy', () => {
  it('publishes one complete, deterministic hierarchy across product tiers', () => {
    const objectives = nextMealObjectiveHierarchyV1();

    expect(NEXT_MEAL_HARD_CONSTRAINT_POLICY_VERSION_V1).toBe(
      'next-meal-hard-constraints-v1',
    );
    expect(NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1).toBe(
      'next-meal-objective-hierarchy-v1',
    );
    expect(
      NEXT_MEAL_HARD_CONSTRAINT_FAMILIES_V1.map(({ familyCode }) => familyCode),
    ).toEqual([
      'integrity',
      'intended-use',
      'safety-restrictions',
      'evidence-completeness',
      'portion-validity',
      'inventory-feasibility',
      'horizon-consistency',
      'nutrient-upper-limit',
    ]);
    expect([
      ...new Set(objectives.map(({ priorityTier }) => priorityTier)),
    ]).toEqual([2, 3, 4, 5, 6]);
    expect(
      objectives.map(
        ({ objectiveId, priorityTier, orderWithinTier, activation }) => ({
          objectiveId,
          priorityTier,
          orderWithinTier,
          activation: activation.status,
        }),
      ),
    ).toMatchInlineSnapshot(`
      [
        {
          "activation": "ACTIVE",
          "objectiveId": "nutrition.robust-maximum-gap",
          "orderWithinTier": 0,
          "priorityTier": 2,
        },
        {
          "activation": "ACTIVE",
          "objectiveId": "nutrition.robust-weighted-gap",
          "orderWithinTier": 1,
          "priorityTier": 2,
        },
        {
          "activation": "ACTIVE",
          "objectiveId": "nutrition.nominal-maximum-gap",
          "orderWithinTier": 2,
          "priorityTier": 2,
        },
        {
          "activation": "ACTIVE",
          "objectiveId": "nutrition.nominal-weighted-gap",
          "orderWithinTier": 3,
          "priorityTier": 2,
        },
        {
          "activation": "ACTIVE",
          "objectiveId": "nutrition.immediate-maximum-gap",
          "orderWithinTier": 4,
          "priorityTier": 2,
        },
        {
          "activation": "ACTIVE",
          "objectiveId": "nutrition.immediate-weighted-gap",
          "orderWithinTier": 5,
          "priorityTier": 2,
        },
        {
          "activation": "DEFERRED",
          "objectiveId": "nutrition.energy-macro-pattern",
          "orderWithinTier": 0,
          "priorityTier": 3,
        },
        {
          "activation": "DEFERRED",
          "objectiveId": "personalization.expected-adherence",
          "orderWithinTier": 0,
          "priorityTier": 4,
        },
        {
          "activation": "DEFERRED",
          "objectiveId": "personalization.culture-satiety-fit",
          "orderWithinTier": 1,
          "priorityTier": 4,
        },
        {
          "activation": "ACTIVE",
          "objectiveId": "practicality.portion-size",
          "orderWithinTier": 2,
          "priorityTier": 4,
        },
        {
          "activation": "ACTIVE",
          "objectiveId": "context.variety-repetition",
          "orderWithinTier": 0,
          "priorityTier": 5,
        },
        {
          "activation": "DEFERRED",
          "objectiveId": "context.cost-preparation-waste",
          "orderWithinTier": 1,
          "priorityTier": 5,
        },
        {
          "activation": "DEFERRED",
          "objectiveId": "stability.previous-intention-change",
          "orderWithinTier": 0,
          "priorityTier": 6,
        },
        {
          "activation": "ACTIVE",
          "objectiveId": "stability.deterministic-identity",
          "orderWithinTier": 1,
          "priorityTier": 6,
        },
      ]
    `);
    expect(NEXT_MEAL_ACTIVE_OBJECTIVE_IDS_V1).toEqual([
      'nutrition.robust-maximum-gap',
      'nutrition.robust-weighted-gap',
      'nutrition.nominal-maximum-gap',
      'nutrition.nominal-weighted-gap',
      'nutrition.immediate-maximum-gap',
      'nutrition.immediate-weighted-gap',
      'practicality.portion-size',
      'context.variety-repetition',
      'stability.deterministic-identity',
    ]);
  });

  it('assigns positive weight only to objectives with executable evidence', () => {
    for (const objective of nextMealObjectiveHierarchyV1()) {
      if (objective.activation.status === 'ACTIVE')
        expect(objective.weight).not.toBe('0');
      else {
        expect(objective.weight).toBe('0');
        expect(objective.activation.requiredFactTypes.length).toBeGreaterThan(
          0,
        );
      }
    }
  });
});
