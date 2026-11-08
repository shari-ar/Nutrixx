import { describe, expect, it } from 'vitest';

import {
  PLANNING_DOMAIN_MODEL_VERSION_V1,
  PlanningDecisionChainV1Schema,
  PlanningProblemV1Schema,
  type PlanningDecisionChainV1,
} from './planning-domain-model.js';

const id = (number: number): string =>
  `00000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
const source = {
  kind: 'dataset',
  sourceId: 'fixture',
  sourceVersion: '1',
} as const;
const stateKey = 'state:subject-1:2026-11-08t12:00:00.000z';
const actionOne = 'food:fixture:food-1:portion-1';
const actionTwo = 'food:fixture:food-2:portion-1';

function chain(): PlanningDecisionChainV1 {
  return {
    problem: {
      modelVersion: PLANNING_DOMAIN_MODEL_VERSION_V1,
      problemId: id(1),
      state: {
        modelVersion: PLANNING_DOMAIN_MODEL_VERSION_V1,
        stateKey,
        subjectKey: 'subject:local-primary',
        capturedAt: '2026-11-08T12:00:00.000Z',
        decisionInstant: '2026-11-08T12:00:00.000Z',
        policyVersion: 'next-meal-hierarchical-robust-v1',
        horizon: {
          mode: 'rolling',
          uncertaintyPolicyVersion: 'next-meal-uncertainty-policy-v1',
          terminalValuePolicyVersion: 'next-meal-terminal-value-v1',
          days: 3,
          terminalTailDays: 1,
          opportunitiesPerDay: 3,
          publishedActionCount: 1,
          scenarios: [
            {
              scenarioId: 'expected-schedule',
              role: 'NOMINAL',
              probability: '0.8',
              perturbations: [],
              description: 'All modeled eating opportunities remain available.',
            },
            {
              scenarioId: 'one-opportunity-lost',
              role: 'STRESS',
              probability: '0.2',
              perturbations: [{ kind: 'future-opportunity-loss', count: 1 }],
              description: 'One future eating opportunity becomes unavailable.',
            },
          ],
        },
        facts: [
          {
            factType: 'recorded-intake',
            factKey: 'ledger:subject-1',
            revision: '42',
            source,
          },
          {
            factType: 'catalog-release',
            factKey: 'catalog:fixture-release',
            revision: '1',
            source,
          },
        ],
        completeness: { status: 'COMPLETE', reasonCodes: [] },
      },
      actions: [
        {
          actionId: actionOne,
          stateKey,
          actionType: 'next-meal',
          candidateKey: 'food:fixture:food-1',
          candidateKind: 'food',
          portionId: 'portion-1',
          edibleGrams: '100',
          eligibleOpportunityIndexes: [0, 1, 2, 3, 4, 5, 6, 7, 8],
          evidence: source,
        },
        {
          actionId: actionTwo,
          stateKey,
          actionType: 'next-meal',
          candidateKey: 'food:fixture:food-2',
          candidateKind: 'food',
          portionId: 'portion-1',
          edibleGrams: '120',
          eligibleOpportunityIndexes: [0, 1, 2],
          evidence: source,
        },
      ],
      constraints: [
        {
          constraintId: 'safety.declared-exclusions',
          constraintFamily: 'safety-restrictions',
          constraintVersion: '1',
          kind: 'safety',
          strength: 'HARD',
          enforcementStage: 'CANDIDATE_CLASSIFICATION',
          scope: { kind: 'global' },
          metricCode: 'candidate.allowed',
          operator: 'ALLOW',
          bound: { kind: 'boolean', value: true },
          failureReasonCode: 'declared-exclusion',
          source,
        },
      ],
      objectives: [
        {
          objectiveId: 'robust.maximum-gap',
          objectiveVersion: '1',
          priorityTier: 1,
          orderWithinTier: 0,
          direction: 'MINIMIZE',
          metricCode: 'normalized-nutrient-gap',
          temporalScope: 'HORIZON',
          scenarioAggregation: 'WORST_CASE',
          weight: '1',
          activation: { status: 'ACTIVE' },
          source,
        },
        {
          objectiveId: 'robust.combined-gap',
          objectiveVersion: '1',
          priorityTier: 2,
          orderWithinTier: 0,
          direction: 'MINIMIZE',
          metricCode: 'weighted-nutrient-gap',
          temporalScope: 'HORIZON',
          scenarioAggregation: 'WORST_CASE',
          weight: '1',
          activation: { status: 'ACTIVE' },
          source,
        },
      ],
    },
    outcome: {
      modelVersion: PLANNING_DOMAIN_MODEL_VERSION_V1,
      runId: id(2),
      problemId: id(1),
      stateKey,
      status: 'READY',
      censusComplete: true,
      actionOutcomes: [
        {
          actionId: actionOne,
          classification: 'FEASIBLE',
          rank: 1,
          constraintResults: [
            {
              constraintId: 'safety.declared-exclusions',
              status: 'PASSED',
              reasonCodes: [],
            },
          ],
          objectiveResults: [
            {
              objectiveId: 'robust.maximum-gap',
              value: { numerator: '1', denominator: '4' },
            },
            {
              objectiveId: 'robust.maximum-gap',
              scenarioId: 'expected-schedule',
              value: { numerator: '1', denominator: '8' },
            },
            {
              objectiveId: 'robust.maximum-gap',
              scenarioId: 'one-opportunity-lost',
              value: { numerator: '1', denominator: '4' },
            },
            {
              objectiveId: 'robust.combined-gap',
              value: { numerator: '1', denominator: '2' },
            },
            {
              objectiveId: 'robust.combined-gap',
              scenarioId: 'expected-schedule',
              value: { numerator: '1', denominator: '4' },
            },
            {
              objectiveId: 'robust.combined-gap',
              scenarioId: 'one-opportunity-lost',
              value: { numerator: '1', denominator: '2' },
            },
          ],
        },
        {
          actionId: actionTwo,
          classification: 'EXCLUDED',
          constraintResults: [
            {
              constraintId: 'safety.declared-exclusions',
              status: 'FAILED',
              reasonCodes: ['declared-exclusion'],
            },
          ],
          objectiveResults: [],
        },
      ],
      recommendedActionId: actionOne,
      validatorVersion: 'planning-validator-v1',
      validatedAt: '2026-11-08T12:00:01.000Z',
    },
  };
}

describe('planning domain model', () => {
  it('binds one frozen state to actions, constraints, objectives, and a ready outcome', () => {
    expect(PlanningDecisionChainV1Schema.parse(chain())).toEqual(chain());
  });

  it('rejects duplicate actions and objective order positions', () => {
    const value = chain();
    value.problem.actions[1] = value.problem.actions[0]!;
    value.problem.objectives[1] = {
      ...value.problem.objectives[1]!,
      priorityTier: 1,
      orderWithinTier: 0,
    };
    expect(PlanningProblemV1Schema.safeParse(value.problem).success).toBe(
      false,
    );
  });

  it('rejects action opportunities outside the frozen horizon', () => {
    const value = chain();
    value.problem.actions[0] = {
      ...value.problem.actions[0]!,
      eligibleOpportunityIndexes: [9],
    };
    expect(PlanningProblemV1Schema.safeParse(value.problem).success).toBe(
      false,
    );
  });

  it('requires complete scenario probabilities that total exactly one', () => {
    const value = chain();
    value.problem.state.horizon.scenarios[1] = {
      ...value.problem.state.horizon.scenarios[1]!,
      probability: '0.3',
    };
    expect(PlanningProblemV1Schema.safeParse(value.problem).success).toBe(
      false,
    );
  });

  it('requires one unperturbed nominal scenario and explicit stress perturbations', () => {
    const value = chain();
    value.problem.state.horizon.scenarios[1] = {
      ...value.problem.state.horizon.scenarios[1]!,
      role: 'NOMINAL',
      perturbations: [],
    };
    expect(PlanningProblemV1Schema.safeParse(value.problem).success).toBe(
      false,
    );
  });

  it('requires complete scenario traces and exact worst-case aggregation', () => {
    const missing = chain();
    missing.outcome.actionOutcomes[0]!.objectiveResults =
      missing.outcome.actionOutcomes[0]!.objectiveResults.filter(
        ({ objectiveId, scenarioId }) =>
          !(
            objectiveId === 'robust.maximum-gap' &&
            scenarioId === 'one-opportunity-lost'
          ),
      );
    expect(PlanningDecisionChainV1Schema.safeParse(missing).success).toBe(
      false,
    );

    const incorrect = chain();
    incorrect.outcome.actionOutcomes[0]!.objectiveResults =
      incorrect.outcome.actionOutcomes[0]!.objectiveResults.map((result) =>
        result.objectiveId === 'robust.maximum-gap' &&
        result.scenarioId === undefined
          ? { ...result, value: { numerator: '1', denominator: '8' } }
          : result,
      );
    expect(PlanningDecisionChainV1Schema.safeParse(incorrect).success).toBe(
      false,
    );
  });

  it('rejects feasible actions that fail a hard constraint', () => {
    const value = chain();
    value.outcome.actionOutcomes[0] = {
      ...value.outcome.actionOutcomes[0]!,
      constraintResults: [
        {
          constraintId: 'safety.declared-exclusions',
          status: 'FAILED',
          reasonCodes: ['declared-exclusion'],
        },
      ],
    };
    expect(PlanningDecisionChainV1Schema.safeParse(value).success).toBe(false);
  });

  it('requires every applicable constraint on a feasible action', () => {
    const value = chain();
    value.outcome.actionOutcomes[0] = {
      ...value.outcome.actionOutcomes[0]!,
      constraintResults: [],
    };
    expect(PlanningDecisionChainV1Schema.safeParse(value).success).toBe(false);
  });

  it('requires every objective value and every action in a ready census', () => {
    const value = chain();
    value.outcome.actionOutcomes = [
      {
        ...value.outcome.actionOutcomes[0]!,
        objectiveResults: [],
      },
    ];
    expect(PlanningDecisionChainV1Schema.safeParse(value).success).toBe(false);
  });

  it('publishes the first-ranked action only from a ready outcome', () => {
    const value = chain();
    value.outcome.status = 'NEEDS_INPUT';
    expect(PlanningDecisionChainV1Schema.safeParse(value).success).toBe(false);
  });

  it('keeps deferred objectives visible without fabricating outcome values', () => {
    const value = chain();
    value.problem.objectives.push({
      objectiveId: 'personalization.expected-adherence',
      objectiveVersion: '1',
      priorityTier: 3,
      orderWithinTier: 0,
      direction: 'MAXIMIZE',
      metricCode: 'expected-adherence',
      temporalScope: 'IMMEDIATE',
      scenarioAggregation: 'EXPECTED',
      weight: '0',
      activation: {
        status: 'DEFERRED',
        reasonCode: 'validated-model-required',
        requiredFactTypes: ['acceptance-history'],
      },
      source,
    });
    expect(PlanningDecisionChainV1Schema.safeParse(value).success).toBe(true);

    value.outcome.actionOutcomes[0]!.objectiveResults.push({
      objectiveId: 'personalization.expected-adherence',
      value: { numerator: '1', denominator: '2' },
    });
    expect(PlanningDecisionChainV1Schema.safeParse(value).success).toBe(false);
  });

  it('requires contiguous objective order inside every priority tier', () => {
    const value = chain();
    value.problem.objectives[1] = {
      ...value.problem.objectives[1]!,
      priorityTier: 1,
      orderWithinTier: 2,
    };
    expect(PlanningProblemV1Schema.safeParse(value.problem).success).toBe(
      false,
    );
  });
});
