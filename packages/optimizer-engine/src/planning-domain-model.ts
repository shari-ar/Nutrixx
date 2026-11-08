import * as z from 'zod';

import {
  CanonicalCodeSchema,
  CanonicalIdSchema,
  EvidenceSourceV1Schema,
  NonnegativeCanonicalDecimalSchema,
  UnitV1Schema,
  UtcInstantSchema,
} from '@nutrixx/canonical-schema';

export const PLANNING_DOMAIN_MODEL_VERSION_V1 =
  'planning-domain-model-v1' as const;

const PlanningKeySchema = z
  .string()
  .min(1)
  .max(600)
  .regex(/^[A-Za-z0-9][A-Za-z0-9:._/-]*$/u);
const PositiveIntegerStringSchema = z.string().regex(/^[1-9][0-9]*$/u);
const SignedIntegerStringSchema = z.string().regex(/^(?:0|-?[1-9][0-9]*)$/u);

function probabilitiesTotalOne(values: readonly string[]): boolean {
  const scale = Math.max(
    0,
    ...values.map((value) => value.split('.')[1]?.length ?? 0),
  );
  const denominator = 10n ** BigInt(scale);
  const total = values.reduce((sum, value) => {
    const [whole = '0', fraction = ''] = value.split('.');
    return (
      sum +
      BigInt(whole) * denominator +
      BigInt(fraction.padEnd(scale, '0') || '0')
    );
  }, 0n);
  return total === denominator;
}

export const PlanningExactValueV1Schema = z.strictObject({
  numerator: SignedIntegerStringSchema,
  denominator: PositiveIntegerStringSchema,
});

export const PlanningStateV1Schema = z
  .strictObject({
    modelVersion: z.literal(PLANNING_DOMAIN_MODEL_VERSION_V1),
    stateKey: PlanningKeySchema,
    subjectKey: PlanningKeySchema,
    capturedAt: UtcInstantSchema,
    decisionInstant: UtcInstantSchema,
    policyVersion: z.string().min(1).max(200),
    horizon: z.strictObject({
      mode: z.literal('rolling'),
      days: z.int().min(1).max(31),
      opportunitiesPerDay: z.int().min(1).max(12),
      publishedActionCount: z.literal(1),
      scenarios: z
        .array(
          z.strictObject({
            scenarioId: CanonicalCodeSchema,
            probability: NonnegativeCanonicalDecimalSchema.optional(),
            description: z.string().trim().min(1).max(500),
          }),
        )
        .min(1)
        .max(32),
    }),
    facts: z
      .array(
        z.strictObject({
          factType: CanonicalCodeSchema,
          factKey: PlanningKeySchema,
          revision: z.string().min(1).max(200),
          source: EvidenceSourceV1Schema,
        }),
      )
      .min(1),
    completeness: z.strictObject({
      status: z.enum(['COMPLETE', 'LIMITED']),
      reasonCodes: z.array(CanonicalCodeSchema),
    }),
  })
  .superRefine((state, context) => {
    if (
      new Set(state.horizon.scenarios.map(({ scenarioId }) => scenarioId))
        .size !== state.horizon.scenarios.length
    )
      context.addIssue({
        code: 'custom',
        path: ['horizon', 'scenarios'],
        message: 'Planning scenario identities must be unique.',
      });
    const factKeys = state.facts.map(
      ({ factType, factKey }) => `${factType}:${factKey}`,
    );
    if (new Set(factKeys).size !== factKeys.length)
      context.addIssue({
        code: 'custom',
        path: ['facts'],
        message: 'Planning state facts must be unique by type and key.',
      });
    if (
      (state.completeness.status === 'COMPLETE') !==
      (state.completeness.reasonCodes.length === 0)
    )
      context.addIssue({
        code: 'custom',
        path: ['completeness'],
        message:
          'Complete state has no limitation reasons; limited state declares at least one.',
      });
  });

export const PlanningActionV1Schema = z
  .strictObject({
    actionId: PlanningKeySchema,
    stateKey: PlanningKeySchema,
    actionType: z.literal('next-meal'),
    candidateKey: PlanningKeySchema,
    candidateKind: z.enum(['food', 'recipe']),
    portionId: PlanningKeySchema,
    edibleGrams: NonnegativeCanonicalDecimalSchema.refine(
      (value) => value !== '0',
      'Planning action edible grams must be positive.',
    ),
    eligibleOpportunityIndexes: z.array(z.int().nonnegative()).min(1),
    evidence: EvidenceSourceV1Schema,
  })
  .superRefine((action, context) => {
    if (
      new Set(action.eligibleOpportunityIndexes).size !==
      action.eligibleOpportunityIndexes.length
    )
      context.addIssue({
        code: 'custom',
        path: ['eligibleOpportunityIndexes'],
        message: 'Eligible opportunity indexes must be unique.',
      });
  });

const PlanningConstraintScopeV1Schema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('global') }),
  z.strictObject({
    kind: z.literal('actions'),
    actionIds: z.array(PlanningKeySchema).min(1),
  }),
  z.strictObject({
    kind: z.literal('scenarios'),
    scenarioIds: z.array(CanonicalCodeSchema).min(1),
  }),
]);

const PlanningConstraintBoundV1Schema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('boolean'), value: z.boolean() }),
  z.strictObject({
    kind: z.literal('quantity'),
    amount: NonnegativeCanonicalDecimalSchema,
    unit: UnitV1Schema,
  }),
  z.strictObject({ kind: z.literal('reference'), value: PlanningKeySchema }),
]);

export const PlanningConstraintV1Schema = z.strictObject({
  constraintId: CanonicalCodeSchema,
  constraintFamily: CanonicalCodeSchema,
  constraintVersion: z.string().min(1).max(128),
  kind: z.enum([
    'safety',
    'eligibility',
    'nutrient-limit',
    'inventory',
    'preparation',
    'integrity',
    'schedule',
  ]),
  strength: z.enum(['HARD', 'SOFT']),
  enforcementStage: z.enum([
    'INPUT_VALIDATION',
    'CANDIDATE_CLASSIFICATION',
    'HORIZON_SEARCH',
    'OUTPUT_VALIDATION',
  ]),
  scope: PlanningConstraintScopeV1Schema,
  metricCode: CanonicalCodeSchema,
  operator: z.enum(['ALLOW', 'FORBID', 'LTE', 'GTE', 'EQUAL', 'KNOWN']),
  bound: PlanningConstraintBoundV1Schema,
  failureReasonCode: CanonicalCodeSchema,
  source: EvidenceSourceV1Schema,
});

export const PlanningObjectiveV1Schema = z
  .strictObject({
    objectiveId: CanonicalCodeSchema,
    objectiveVersion: z.string().min(1).max(128),
    priorityTier: z.int().positive().max(100),
    orderWithinTier: z.int().nonnegative().max(1000),
    direction: z.enum(['MINIMIZE', 'MAXIMIZE']),
    metricCode: CanonicalCodeSchema,
    temporalScope: z.enum(['IMMEDIATE', 'HORIZON', 'TERMINAL']),
    scenarioAggregation: z.enum(['NONE', 'NOMINAL', 'WORST_CASE', 'EXPECTED']),
    weight: NonnegativeCanonicalDecimalSchema,
    activation: z.discriminatedUnion('status', [
      z.strictObject({ status: z.literal('ACTIVE') }),
      z.strictObject({
        status: z.literal('DEFERRED'),
        reasonCode: CanonicalCodeSchema,
        requiredFactTypes: z.array(CanonicalCodeSchema).min(1),
      }),
    ]),
    source: EvidenceSourceV1Schema,
  })
  .superRefine((objective, context) => {
    if (
      (objective.activation.status === 'ACTIVE') !==
      (objective.weight !== '0')
    )
      context.addIssue({
        code: 'custom',
        path: ['weight'],
        message:
          'Active objectives require positive weight; deferred objectives use zero weight.',
      });
  });

export const PlanningProblemV1Schema = z
  .strictObject({
    modelVersion: z.literal(PLANNING_DOMAIN_MODEL_VERSION_V1),
    problemId: CanonicalIdSchema,
    state: PlanningStateV1Schema,
    actions: z.array(PlanningActionV1Schema),
    constraints: z.array(PlanningConstraintV1Schema).min(1),
    objectives: z.array(PlanningObjectiveV1Schema).min(1),
  })
  .superRefine((problem, context) => {
    const actionIds = new Set(problem.actions.map(({ actionId }) => actionId));
    const constraintIds = new Set(
      problem.constraints.map(({ constraintId }) => constraintId),
    );
    const objectiveIds = new Set(
      problem.objectives.map(({ objectiveId }) => objectiveId),
    );
    if (actionIds.size !== problem.actions.length)
      context.addIssue({
        code: 'custom',
        path: ['actions'],
        message: 'Planning action identities must be unique.',
      });
    if (constraintIds.size !== problem.constraints.length)
      context.addIssue({
        code: 'custom',
        path: ['constraints'],
        message: 'Planning constraint identities must be unique.',
      });
    if (objectiveIds.size !== problem.objectives.length)
      context.addIssue({
        code: 'custom',
        path: ['objectives'],
        message: 'Planning objective identities must be unique.',
      });
    const horizonOpportunities =
      problem.state.horizon.days * problem.state.horizon.opportunitiesPerDay;
    for (const [index, action] of problem.actions.entries()) {
      if (action.stateKey !== problem.state.stateKey)
        context.addIssue({
          code: 'custom',
          path: ['actions', index, 'stateKey'],
          message: 'Every action must bind to the frozen planning state.',
        });
      if (
        action.eligibleOpportunityIndexes.some(
          (opportunity) => opportunity >= horizonOpportunities,
        )
      )
        context.addIssue({
          code: 'custom',
          path: ['actions', index, 'eligibleOpportunityIndexes'],
          message: 'Action opportunities must fit within the frozen horizon.',
        });
    }
    const scenarioIds = new Set(
      problem.state.horizon.scenarios.map(({ scenarioId }) => scenarioId),
    );
    for (const [index, constraint] of problem.constraints.entries()) {
      if (
        constraint.scope.kind === 'actions' &&
        constraint.scope.actionIds.some((actionId) => !actionIds.has(actionId))
      )
        context.addIssue({
          code: 'custom',
          path: ['constraints', index, 'scope'],
          message: 'Constraint action scope must reference declared actions.',
        });
      if (
        constraint.scope.kind === 'scenarios' &&
        constraint.scope.scenarioIds.some(
          (scenarioId) => !scenarioIds.has(scenarioId),
        )
      )
        context.addIssue({
          code: 'custom',
          path: ['constraints', index, 'scope'],
          message:
            'Constraint scenario scope must reference declared scenarios.',
        });
    }
    const objectiveOrder = problem.objectives.map(
      ({ priorityTier, orderWithinTier }) =>
        `${priorityTier}:${orderWithinTier}`,
    );
    if (new Set(objectiveOrder).size !== objectiveOrder.length)
      context.addIssue({
        code: 'custom',
        path: ['objectives'],
        message:
          'Objective priority and order pairs must define a total hierarchy.',
      });
    const objectivesByTier = new Map<number, typeof problem.objectives>();
    for (const objective of problem.objectives)
      objectivesByTier.set(objective.priorityTier, [
        ...(objectivesByTier.get(objective.priorityTier) ?? []),
        objective,
      ]);
    for (const [tier, objectives] of objectivesByTier) {
      const orders = objectives
        .map(({ orderWithinTier }) => orderWithinTier)
        .sort((left, right) => left - right);
      if (orders.some((order, index) => order !== index))
        context.addIssue({
          code: 'custom',
          path: ['objectives'],
          message: `Objective tier ${tier} must use contiguous zero-based order.`,
        });
    }
    const probabilities = problem.state.horizon.scenarios.flatMap(
      ({ probability }) => (probability === undefined ? [] : [probability]),
    );
    if (
      probabilities.length > 0 &&
      (probabilities.length !== problem.state.horizon.scenarios.length ||
        !probabilitiesTotalOne(probabilities))
    )
      context.addIssue({
        code: 'custom',
        path: ['state', 'horizon', 'scenarios'],
        message:
          'Declared scenario probabilities must cover every scenario and total exactly one.',
      });
    if (
      problem.objectives.some(
        ({ activation, scenarioAggregation }) =>
          activation.status === 'ACTIVE' && scenarioAggregation === 'EXPECTED',
      ) &&
      probabilities.length === 0
    )
      context.addIssue({
        code: 'custom',
        path: ['objectives'],
        message:
          'Expected-value objectives require complete scenario probabilities.',
      });
  });

const PlanningConstraintResultV1Schema = z.strictObject({
  constraintId: CanonicalCodeSchema,
  status: z.enum(['PASSED', 'FAILED', 'UNKNOWN']),
  reasonCodes: z.array(CanonicalCodeSchema),
});

const PlanningObjectiveResultV1Schema = z.strictObject({
  objectiveId: CanonicalCodeSchema,
  value: PlanningExactValueV1Schema,
  scenarioId: CanonicalCodeSchema.optional(),
});

export const PlanningActionOutcomeV1Schema = z
  .strictObject({
    actionId: PlanningKeySchema,
    classification: z.enum([
      'FEASIBLE',
      'EVIDENCE_LIMITED',
      'UNAVAILABLE',
      'EXCLUDED',
      'REQUIRES_PREPARATION',
    ]),
    rank: z.int().positive().optional(),
    constraintResults: z.array(PlanningConstraintResultV1Schema),
    objectiveResults: z.array(PlanningObjectiveResultV1Schema),
  })
  .superRefine((outcome, context) => {
    if (
      new Set(outcome.constraintResults.map(({ constraintId }) => constraintId))
        .size !== outcome.constraintResults.length
    )
      context.addIssue({
        code: 'custom',
        path: ['constraintResults'],
        message: 'Constraint results must be unique per action.',
      });
    if (
      new Set(
        outcome.objectiveResults.map(
          ({ objectiveId, scenarioId }) =>
            `${objectiveId}:${scenarioId ?? 'aggregate'}`,
        ),
      ).size !== outcome.objectiveResults.length
    )
      context.addIssue({
        code: 'custom',
        path: ['objectiveResults'],
        message: 'Objective results must be unique per action and scenario.',
      });
    if (
      (outcome.classification === 'FEASIBLE') !==
      (outcome.rank !== undefined)
    )
      context.addIssue({
        code: 'custom',
        path: ['rank'],
        message: 'Exactly the feasible actions participate in ranking.',
      });
  });

export const PlanningOutcomeV1Schema = z.strictObject({
  modelVersion: z.literal(PLANNING_DOMAIN_MODEL_VERSION_V1),
  runId: CanonicalIdSchema,
  problemId: CanonicalIdSchema,
  stateKey: PlanningKeySchema,
  status: z.enum([
    'READY',
    'NEEDS_INPUT',
    'INFEASIBLE',
    'SEARCH_LIMIT',
    'FAILED',
  ]),
  censusComplete: z.boolean(),
  actionOutcomes: z.array(PlanningActionOutcomeV1Schema),
  recommendedActionId: PlanningKeySchema.optional(),
  validatorVersion: z.string().min(1).max(200),
  validatedAt: UtcInstantSchema,
});

export const PlanningDecisionChainV1Schema = z
  .strictObject({
    problem: PlanningProblemV1Schema,
    outcome: PlanningOutcomeV1Schema,
  })
  .superRefine(({ problem, outcome }, context) => {
    if (
      outcome.problemId !== problem.problemId ||
      outcome.stateKey !== problem.state.stateKey
    )
      context.addIssue({
        code: 'custom',
        path: ['outcome'],
        message: 'Planning outcome must bind to its exact problem and state.',
      });
    const actions = new Set(problem.actions.map(({ actionId }) => actionId));
    const constraints = new Map(
      problem.constraints.map((constraint) => [
        constraint.constraintId,
        constraint,
      ]),
    );
    const objectives = new Map(
      problem.objectives.map((objective) => [objective.objectiveId, objective]),
    );
    const scenarioIds = new Set(
      problem.state.horizon.scenarios.map(({ scenarioId }) => scenarioId),
    );
    const outcomeActions = new Set<string>();
    for (const [index, actionOutcome] of outcome.actionOutcomes.entries()) {
      if (
        outcomeActions.has(actionOutcome.actionId) ||
        !actions.has(actionOutcome.actionId)
      )
        context.addIssue({
          code: 'custom',
          path: ['outcome', 'actionOutcomes', index, 'actionId'],
          message:
            'Action outcomes must uniquely reference declared planning actions.',
        });
      outcomeActions.add(actionOutcome.actionId);
      const applicableConstraints = new Map(
        problem.constraints
          .filter(
            ({ scope }) =>
              scope.kind === 'global' ||
              scope.kind === 'scenarios' ||
              scope.actionIds.includes(actionOutcome.actionId),
          )
          .map((constraint) => [constraint.constraintId, constraint]),
      );
      const evaluatedConstraints = new Set(
        actionOutcome.constraintResults.map(({ constraintId }) => constraintId),
      );
      for (const result of actionOutcome.constraintResults) {
        const constraint = constraints.get(result.constraintId);
        if (!constraint || !applicableConstraints.has(result.constraintId))
          context.addIssue({
            code: 'custom',
            path: ['outcome', 'actionOutcomes', index, 'constraintResults'],
            message: 'Constraint results must reference declared constraints.',
          });
        if (
          actionOutcome.classification === 'FEASIBLE' &&
          constraint?.strength === 'HARD' &&
          result.status !== 'PASSED'
        )
          context.addIssue({
            code: 'custom',
            path: ['outcome', 'actionOutcomes', index, 'constraintResults'],
            message:
              'Feasible actions must pass every evaluated hard constraint.',
          });
      }
      if (
        actionOutcome.classification === 'FEASIBLE' &&
        [...applicableConstraints].some(
          ([constraintId]) => !evaluatedConstraints.has(constraintId),
        )
      )
        context.addIssue({
          code: 'custom',
          path: ['outcome', 'actionOutcomes', index, 'constraintResults'],
          message:
            'Feasible actions must report every applicable constraint result.',
        });
      const aggregateObjectives = new Set(
        actionOutcome.objectiveResults
          .filter(({ scenarioId }) => scenarioId === undefined)
          .map(({ objectiveId }) => objectiveId),
      );
      if (
        actionOutcome.classification === 'FEASIBLE' &&
        [...objectives].some(
          ([objectiveId, objective]) =>
            objective.activation.status === 'ACTIVE' &&
            !aggregateObjectives.has(objectiveId),
        )
      )
        context.addIssue({
          code: 'custom',
          path: ['outcome', 'actionOutcomes', index, 'objectiveResults'],
          message:
            'Feasible actions must expose one aggregate value for every objective.',
        });
      if (
        actionOutcome.objectiveResults.some(({ objectiveId }) => {
          const objective = objectives.get(objectiveId);
          return !objective || objective.activation.status !== 'ACTIVE';
        })
      )
        context.addIssue({
          code: 'custom',
          path: ['outcome', 'actionOutcomes', index, 'objectiveResults'],
          message:
            'Objective results must reference active declared objectives.',
        });
      if (
        actionOutcome.objectiveResults.some(
          ({ scenarioId }) =>
            scenarioId !== undefined && !scenarioIds.has(scenarioId),
        )
      )
        context.addIssue({
          code: 'custom',
          path: ['outcome', 'actionOutcomes', index, 'objectiveResults'],
          message:
            'Scenario objective results must reference declared scenarios.',
        });
    }
    if (
      outcome.censusComplete &&
      outcomeActions.size !== problem.actions.length
    )
      context.addIssue({
        code: 'custom',
        path: ['outcome', 'actionOutcomes'],
        message: 'A complete census must contain one outcome for every action.',
      });
    const ranks = outcome.actionOutcomes
      .flatMap(({ rank }) => (rank === undefined ? [] : [rank]))
      .sort((left, right) => left - right);
    if (ranks.some((rank, index) => rank !== index + 1))
      context.addIssue({
        code: 'custom',
        path: ['outcome', 'actionOutcomes'],
        message: 'Feasible action ranks must form one consecutive total order.',
      });
    const recommended = outcome.actionOutcomes.find(
      ({ actionId }) => actionId === outcome.recommendedActionId,
    );
    if (
      outcome.status === 'READY' &&
      (!outcome.censusComplete || recommended?.rank !== 1)
    )
      context.addIssue({
        code: 'custom',
        path: ['outcome', 'recommendedActionId'],
        message:
          'Ready outcome requires a complete census and the first-ranked action.',
      });
    if (outcome.status !== 'READY' && outcome.recommendedActionId !== undefined)
      context.addIssue({
        code: 'custom',
        path: ['outcome', 'recommendedActionId'],
        message: 'Recommendation publication requires ready outcome status.',
      });
  });

export type PlanningExactValueV1 = z.infer<typeof PlanningExactValueV1Schema>;
export type PlanningStateV1 = z.infer<typeof PlanningStateV1Schema>;
export type PlanningActionV1 = z.infer<typeof PlanningActionV1Schema>;
export type PlanningConstraintV1 = z.infer<typeof PlanningConstraintV1Schema>;
export type PlanningObjectiveV1 = z.infer<typeof PlanningObjectiveV1Schema>;
export type PlanningProblemV1 = z.infer<typeof PlanningProblemV1Schema>;
export type PlanningActionOutcomeV1 = z.infer<
  typeof PlanningActionOutcomeV1Schema
>;
export type PlanningOutcomeV1 = z.infer<typeof PlanningOutcomeV1Schema>;
export type PlanningDecisionChainV1 = z.infer<
  typeof PlanningDecisionChainV1Schema
>;
