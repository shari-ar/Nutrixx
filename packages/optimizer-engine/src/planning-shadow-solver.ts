import * as z from 'zod';

import {
  CanonicalIdSchema,
  JsonValueSchema,
  UtcInstantSchema,
  canonicalizeJson,
} from '@nutrixx/canonical-schema';

import {
  PlanningDecisionChainV1Schema,
  type PlanningDecisionChainV1,
} from './planning-domain-model.js';
import { validatePlanningDecisionChainV1 } from './planning-decision-validator.js';

export const PLANNING_SHADOW_COMPARISON_VERSION_V1 =
  'planning-shadow-comparison-v1' as const;

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const SolverVersionSchema = z.string().trim().min(1).max(200);
const ActionSummarySchema = z.strictObject({
  solverVersion: SolverVersionSchema,
  decisionChainSha256: Sha256Schema,
  outcomeStatus: z.enum([
    'READY',
    'NEEDS_INPUT',
    'INFEASIBLE',
    'SEARCH_LIMIT',
    'FAILED',
  ]),
  feasibleActionCount: z.int().nonnegative(),
  recommendedActionId: z.string().min(1).optional(),
});
const RankDeltaSchema = z.strictObject({
  actionId: z.string().min(1),
  primaryRank: z.int().positive(),
  shadowRank: z.int().positive(),
  delta: z.int(),
});
const AgreementMetricsSchema = z.strictObject({
  stateAgreement: z.boolean(),
  outcomeStatusAgreement: z.boolean(),
  feasibleActionSetAgreement: z.boolean(),
  recommendationAgreement: z.boolean(),
  completeOrderAgreement: z.boolean(),
  topK: z.int().nonnegative(),
  topKIntersectionCount: z.int().nonnegative(),
  topKOverlap: z.strictObject({
    numerator: z.string().regex(/^(0|[1-9]\d*)$/),
    denominator: z.string().regex(/^[1-9]\d*$/),
  }),
  rankDeltas: z.array(RankDeltaSchema),
});

export const PlanningShadowExecutionV1Schema = z.strictObject({
  modelKind: z.literal('MILP'),
  engine: z.literal('HIGHS'),
  engineVersion: SolverVersionSchema,
  modelVersion: SolverVersionSchema,
  modelSha256: Sha256Schema,
  status: z.literal('OPTIMAL'),
  variableCount: z.int().positive(),
  constraintCount: z.int().positive(),
  selectedActionId: z.string().min(1),
  objectiveValue: z.string().regex(/^(0|[1-9]\d*)$/),
  mipGap: z.strictObject({
    numerator: z.literal('0'),
    denominator: z.literal('1'),
  }),
});

export const PlanningShadowComparisonV1Schema = z
  .strictObject({
    format: z.literal('nutrixx.planning-shadow-comparison'),
    schemaVersion: z.literal(1),
    comparisonVersion: z.literal(PLANNING_SHADOW_COMPARISON_VERSION_V1),
    comparisonId: CanonicalIdSchema,
    runId: CanonicalIdSchema,
    problemId: CanonicalIdSchema,
    stateKey: z.string().min(1),
    evaluatedAt: UtcInstantSchema,
    publicationAuthority: z.literal('PRIMARY_ONLY'),
    shadowAffectsPublication: z.literal(false),
    outcome: z.enum([
      'MATCH',
      'ORDER_DIVERGENCE',
      'RECOMMENDATION_DIVERGENCE',
      'FEASIBILITY_DIVERGENCE',
      'INPUT_DIVERGENCE',
    ]),
    severity: z.enum(['NONE', 'REVIEW', 'CRITICAL']),
    primary: ActionSummarySchema,
    shadow: ActionSummarySchema,
    shadowExecution: PlanningShadowExecutionV1Schema,
    metrics: AgreementMetricsSchema,
  })
  .superRefine((report, context) => {
    const expectedSeverity =
      report.outcome === 'MATCH'
        ? 'NONE'
        : report.outcome === 'ORDER_DIVERGENCE'
          ? 'REVIEW'
          : 'CRITICAL';
    if (report.severity !== expectedSeverity)
      context.addIssue({
        code: 'custom',
        path: ['severity'],
        message: 'Shadow severity must follow divergence class.',
      });
    if (
      report.metrics.topKIntersectionCount > report.metrics.topK ||
      report.metrics.topKOverlap.numerator !==
        String(report.metrics.topKIntersectionCount) ||
      report.metrics.topKOverlap.denominator !==
        String(Math.max(1, report.metrics.topK))
    )
      context.addIssue({
        code: 'custom',
        path: ['metrics', 'topKOverlap'],
        message: 'Top-k overlap must reproduce from the compared action sets.',
      });
    if (
      report.metrics.rankDeltas.some(
        ({ primaryRank, shadowRank, delta }) =>
          delta !== shadowRank - primaryRank,
      )
    )
      context.addIssue({
        code: 'custom',
        path: ['metrics', 'rankDeltas'],
        message: 'Rank deltas must reproduce from solver positions.',
      });
    if (
      report.shadow.recommendedActionId !==
        report.shadowExecution.selectedActionId ||
      report.shadow.feasibleActionCount !== report.shadowExecution.variableCount
    )
      context.addIssue({
        code: 'custom',
        path: ['shadowExecution'],
        message:
          'MILP execution evidence must reproduce the shadow recommendation and feasible action count.',
      });
  });

export type PlanningShadowComparisonV1 = z.infer<
  typeof PlanningShadowComparisonV1Schema
>;
export type PlanningShadowExecutionV1 = z.infer<
  typeof PlanningShadowExecutionV1Schema
>;
export type PlanningShadowDigestV1 = (canonicalJson: string) => Promise<string>;

function actionRanks(chain: PlanningDecisionChainV1): Map<string, number> {
  return new Map(
    chain.outcome.actionOutcomes.flatMap((outcome) =>
      outcome.classification === 'FEASIBLE' && outcome.rank
        ? [[outcome.actionId, outcome.rank] as const]
        : [],
    ),
  );
}

function summary(
  chain: PlanningDecisionChainV1,
  solverVersion: string,
  decisionChainSha256: string,
): z.infer<typeof ActionSummarySchema> {
  return ActionSummarySchema.parse({
    solverVersion,
    decisionChainSha256,
    outcomeStatus: chain.outcome.status,
    feasibleActionCount: actionRanks(chain).size,
    ...(chain.outcome.recommendedActionId
      ? { recommendedActionId: chain.outcome.recommendedActionId }
      : {}),
  });
}

function json(value: unknown): string {
  return canonicalizeJson(JsonValueSchema.parse(value));
}

export async function comparePlanningShadowSolversV1(input: {
  readonly comparisonId: string;
  readonly evaluatedAt: string;
  readonly primarySolverVersion: string;
  readonly shadowSolverVersion: string;
  readonly primaryChain: unknown;
  readonly shadowChain: unknown;
  readonly shadowExecution: unknown;
  readonly digest: PlanningShadowDigestV1;
  readonly topK?: number;
}): Promise<PlanningShadowComparisonV1> {
  const primary = PlanningDecisionChainV1Schema.parse(input.primaryChain);
  const shadow = PlanningDecisionChainV1Schema.parse(input.shadowChain);
  const shadowExecution = PlanningShadowExecutionV1Schema.parse(
    input.shadowExecution,
  );
  if (validatePlanningDecisionChainV1(primary).status !== 'APPROVED')
    throw new TypeError('The primary Decision Chain failed validation.');
  if (validatePlanningDecisionChainV1(shadow).status !== 'APPROVED')
    throw new TypeError('The shadow Decision Chain failed validation.');
  const primaryRanks = actionRanks(primary);
  const shadowRanks = actionRanks(shadow);
  const primaryActions = [...primaryRanks.keys()].sort();
  const shadowActions = [...shadowRanks.keys()].sort();
  const stateAgreement =
    primary.problem.state.stateKey === shadow.problem.state.stateKey;
  const outcomeStatusAgreement =
    primary.outcome.status === shadow.outcome.status;
  const feasibleActionSetAgreement =
    JSON.stringify(primaryActions) === JSON.stringify(shadowActions);
  const recommendationAgreement =
    primary.outcome.recommendedActionId === shadow.outcome.recommendedActionId;
  const commonActions = primaryActions.filter((actionId) =>
    shadowRanks.has(actionId),
  );
  const rankDeltas = commonActions
    .map((actionId) => ({
      actionId,
      primaryRank: primaryRanks.get(actionId)!,
      shadowRank: shadowRanks.get(actionId)!,
      delta: shadowRanks.get(actionId)! - primaryRanks.get(actionId)!,
    }))
    .filter(({ delta }) => delta !== 0);
  const completeOrderAgreement =
    feasibleActionSetAgreement && rankDeltas.length === 0;
  const requestedTopK = Math.max(0, input.topK ?? 10);
  const topK = Math.min(
    requestedTopK,
    primaryActions.length,
    shadowActions.length,
  );
  const primaryTop = new Set(
    [...primaryRanks]
      .sort((left, right) => left[1] - right[1])
      .slice(0, topK)
      .map(([actionId]) => actionId),
  );
  const shadowTop = [...shadowRanks]
    .sort((left, right) => left[1] - right[1])
    .slice(0, topK)
    .map(([actionId]) => actionId);
  const topKIntersectionCount = shadowTop.filter((actionId) =>
    primaryTop.has(actionId),
  ).length;
  const outcome = !stateAgreement
    ? 'INPUT_DIVERGENCE'
    : !outcomeStatusAgreement || !feasibleActionSetAgreement
      ? 'FEASIBILITY_DIVERGENCE'
      : !recommendationAgreement
        ? 'RECOMMENDATION_DIVERGENCE'
        : !completeOrderAgreement
          ? 'ORDER_DIVERGENCE'
          : 'MATCH';
  return PlanningShadowComparisonV1Schema.parse({
    format: 'nutrixx.planning-shadow-comparison',
    schemaVersion: 1,
    comparisonVersion: PLANNING_SHADOW_COMPARISON_VERSION_V1,
    comparisonId: input.comparisonId,
    runId: primary.outcome.runId,
    problemId: primary.problem.problemId,
    stateKey: primary.problem.state.stateKey,
    evaluatedAt: input.evaluatedAt,
    publicationAuthority: 'PRIMARY_ONLY',
    shadowAffectsPublication: false,
    outcome,
    severity:
      outcome === 'MATCH'
        ? 'NONE'
        : outcome === 'ORDER_DIVERGENCE'
          ? 'REVIEW'
          : 'CRITICAL',
    primary: summary(
      primary,
      input.primarySolverVersion,
      await input.digest(json(primary)),
    ),
    shadow: summary(
      shadow,
      input.shadowSolverVersion,
      await input.digest(json(shadow)),
    ),
    shadowExecution,
    metrics: {
      stateAgreement,
      outcomeStatusAgreement,
      feasibleActionSetAgreement,
      recommendationAgreement,
      completeOrderAgreement,
      topK,
      topKIntersectionCount,
      topKOverlap: {
        numerator: String(topKIntersectionCount),
        denominator: String(Math.max(1, topK)),
      },
      rankDeltas,
    },
  });
}
