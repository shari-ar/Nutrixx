import {
  NextMealRankingRequestSchema,
  type ExactRatio,
  type NextMealRankingRequest,
  type NextMealRankingResult,
} from './next-meal-ranking.js';
import {
  NEXT_MEAL_VALIDATOR_VERSION_V1,
  NextMealRankingResultSchema,
} from './next-meal-validation.js';
import {
  NEXT_MEAL_ACTIVE_OBJECTIVE_IDS_V1,
  NEXT_MEAL_HARD_CONSTRAINT_POLICY_VERSION_V1,
  nextMealObjectiveHierarchyV1,
} from './next-meal-decision-policy.js';
import {
  PLANNING_DOMAIN_MODEL_VERSION_V1,
  PlanningDecisionChainV1Schema,
  type PlanningActionV1,
  type PlanningConstraintV1,
  type PlanningDecisionChainV1,
} from './planning-domain-model.js';

export const NEXT_MEAL_DOMAIN_ADAPTER_VERSION_V1 =
  'next-meal-domain-adapter-v1' as const;

const ENGINE_SOURCE = {
  kind: 'calculation',
  sourceId: 'nutrixx-next-meal-engine',
  sourceVersion: NEXT_MEAL_DOMAIN_ADAPTER_VERSION_V1,
} as const;

export interface NextMealDomainAdapterContextV1 {
  readonly problemId: string;
  readonly runId: string;
  readonly subjectKey: string;
  readonly capturedAt: string;
  readonly validatedAt: string;
}

function actionId(candidateKey: string, portionId: string): string {
  return `action:${candidateKey}:${portionId}`;
}

function decimalRatio(value: string): ExactRatio {
  const [whole = '0', fraction = ''] = value.split('.');
  const numerator = BigInt(`${whole}${fraction}`).toString();
  const denominator = (10n ** BigInt(fraction.length)).toString();
  return { numerator, denominator };
}

function constraintDefinitions(
  request: NextMealRankingRequest,
  actions: readonly PlanningActionV1[],
): PlanningConstraintV1[] {
  const recipeActionIds = actions
    .filter(({ candidateKind }) => candidateKind === 'recipe')
    .map(({ actionId }) => actionId);
  const global: PlanningConstraintV1[] = [
    {
      constraintId: 'integrity.complete-catalog-census',
      constraintFamily: 'integrity',
      constraintVersion: NEXT_MEAL_HARD_CONSTRAINT_POLICY_VERSION_V1,
      kind: 'integrity',
      strength: 'HARD',
      enforcementStage: 'OUTPUT_VALIDATION',
      scope: { kind: 'global' },
      metricCode: 'catalog.census-complete',
      operator: 'EQUAL',
      bound: { kind: 'boolean', value: true },
      failureReasonCode: 'catalog-census-incomplete',
      source: ENGINE_SOURCE,
    },
    {
      constraintId: 'integrity.frozen-revision-bindings',
      constraintFamily: 'integrity',
      constraintVersion: NEXT_MEAL_HARD_CONSTRAINT_POLICY_VERSION_V1,
      kind: 'integrity',
      strength: 'HARD',
      enforcementStage: 'INPUT_VALIDATION',
      scope: { kind: 'global' },
      metricCode: 'input.revisions-resolved',
      operator: 'KNOWN',
      bound: { kind: 'boolean', value: true },
      failureReasonCode: 'revision-binding-unresolved',
      source: ENGINE_SOURCE,
    },
    {
      constraintId: 'eligibility.supported-intended-use',
      constraintFamily: 'intended-use',
      constraintVersion: NEXT_MEAL_HARD_CONSTRAINT_POLICY_VERSION_V1,
      kind: 'eligibility',
      strength: 'HARD',
      enforcementStage: 'INPUT_VALIDATION',
      scope: { kind: 'global' },
      metricCode: 'subject.intended-use-supported',
      operator: 'ALLOW',
      bound: { kind: 'boolean', value: true },
      failureReasonCode: 'intended-use-unsupported',
      source: ENGINE_SOURCE,
    },
    {
      constraintId: 'safety.declared-exclusions',
      constraintFamily: 'safety-restrictions',
      constraintVersion: NEXT_MEAL_HARD_CONSTRAINT_POLICY_VERSION_V1,
      kind: 'safety',
      strength: 'HARD',
      enforcementStage: 'CANDIDATE_CLASSIFICATION',
      scope: { kind: 'global' },
      metricCode: 'candidate.exclusions-cleared',
      operator: 'ALLOW',
      bound: { kind: 'boolean', value: true },
      failureReasonCode: 'declared-exclusion',
      source: ENGINE_SOURCE,
    },
    {
      constraintId: 'eligibility.comparable-evidence',
      constraintFamily: 'evidence-completeness',
      constraintVersion: NEXT_MEAL_HARD_CONSTRAINT_POLICY_VERSION_V1,
      kind: 'eligibility',
      strength: 'HARD',
      enforcementStage: 'CANDIDATE_CLASSIFICATION',
      scope: { kind: 'global' },
      metricCode: 'candidate.comparable-evidence',
      operator: 'KNOWN',
      bound: { kind: 'boolean', value: true },
      failureReasonCode: 'comparison-evidence-unresolved',
      source: ENGINE_SOURCE,
    },
    {
      constraintId: 'preparation.edible-portion-resolved',
      constraintFamily: 'portion-validity',
      constraintVersion: NEXT_MEAL_HARD_CONSTRAINT_POLICY_VERSION_V1,
      kind: 'preparation',
      strength: 'HARD',
      enforcementStage: 'CANDIDATE_CLASSIFICATION',
      scope: { kind: 'global' },
      metricCode: 'candidate.edible-portion-resolved',
      operator: 'KNOWN',
      bound: { kind: 'boolean', value: true },
      failureReasonCode: 'edible-portion-unresolved',
      source: ENGINE_SOURCE,
    },
    {
      constraintId: 'preparation.dimensionally-valid-portion',
      constraintFamily: 'portion-validity',
      constraintVersion: NEXT_MEAL_HARD_CONSTRAINT_POLICY_VERSION_V1,
      kind: 'preparation',
      strength: 'HARD',
      enforcementStage: 'INPUT_VALIDATION',
      scope: { kind: 'global' },
      metricCode: 'candidate.portion-dimension-valid',
      operator: 'KNOWN',
      bound: { kind: 'boolean', value: true },
      failureReasonCode: 'portion-dimension-invalid',
      source: ENGINE_SOURCE,
    },
    {
      constraintId: 'schedule.rolling-horizon-consistency',
      constraintFamily: 'horizon-consistency',
      constraintVersion: NEXT_MEAL_HARD_CONSTRAINT_POLICY_VERSION_V1,
      kind: 'schedule',
      strength: 'HARD',
      enforcementStage: 'HORIZON_SEARCH',
      scope: { kind: 'global' },
      metricCode: 'horizon.schedule-consistent',
      operator: 'EQUAL',
      bound: { kind: 'boolean', value: true },
      failureReasonCode: 'horizon-schedule-inconsistent',
      source: ENGINE_SOURCE,
    },
  ];
  return [
    ...global,
    ...(request.candidates.exclusions.foodIds.length +
      request.candidates.exclusions.recipeIds.length +
      request.candidates.exclusions.ingredientFoodIds.length +
      request.candidates.exclusions.allergenCodes.length >
    0
      ? [
          {
            constraintId: 'safety.verified-restriction-evidence',
            constraintFamily: 'safety-restrictions',
            constraintVersion: NEXT_MEAL_HARD_CONSTRAINT_POLICY_VERSION_V1,
            kind: 'safety' as const,
            strength: 'HARD' as const,
            enforcementStage: 'CANDIDATE_CLASSIFICATION' as const,
            scope: { kind: 'global' as const },
            metricCode: 'candidate.restriction-evidence-verified',
            operator: 'KNOWN' as const,
            bound: { kind: 'boolean' as const, value: true },
            failureReasonCode: 'restriction-evidence-unresolved',
            source: ENGINE_SOURCE,
          },
        ]
      : []),
    ...(request.candidates.inventory.mode === 'AVAILABLE_ONLY'
      ? [
          {
            constraintId: 'inventory.selected-mode-availability',
            constraintFamily: 'inventory-feasibility',
            constraintVersion: NEXT_MEAL_HARD_CONSTRAINT_POLICY_VERSION_V1,
            kind: 'inventory' as const,
            strength: 'HARD' as const,
            enforcementStage: 'CANDIDATE_CLASSIFICATION' as const,
            scope: { kind: 'global' as const },
            metricCode: 'candidate.inventory-available',
            operator: 'ALLOW' as const,
            bound: { kind: 'boolean' as const, value: true },
            failureReasonCode: 'inventory-insufficient',
            source: ENGINE_SOURCE,
          },
          ...(recipeActionIds.length > 0
            ? [
                {
                  constraintId: 'inventory.recipe-ingredient-sufficiency',
                  constraintFamily: 'inventory-feasibility',
                  constraintVersion:
                    NEXT_MEAL_HARD_CONSTRAINT_POLICY_VERSION_V1,
                  kind: 'inventory' as const,
                  strength: 'HARD' as const,
                  enforcementStage: 'CANDIDATE_CLASSIFICATION' as const,
                  scope: {
                    kind: 'actions' as const,
                    actionIds: recipeActionIds,
                  },
                  metricCode: 'recipe.ingredients-sufficient',
                  operator: 'ALLOW' as const,
                  bound: { kind: 'boolean' as const, value: true },
                  failureReasonCode: 'recipe-ingredients-insufficient',
                  source: ENGINE_SOURCE,
                },
              ]
            : []),
        ]
      : []),
    ...request.candidates.hardLimits.map(
      (limit, index): PlanningConstraintV1 => ({
        constraintId: `nutrient-limit.rule-${index + 1}`,
        constraintFamily: 'nutrient-upper-limit',
        constraintVersion: limit.ruleId,
        kind: 'nutrient-limit',
        strength: 'HARD',
        enforcementStage: 'HORIZON_SEARCH',
        scope: { kind: 'global' },
        metricCode: limit.nutrientId,
        operator: 'LTE',
        bound: {
          kind: 'quantity',
          amount: limit.maximum,
          unit: limit.unit,
        },
        failureReasonCode: 'hard-limit-exceeded',
        source: {
          ...ENGINE_SOURCE,
          sourceRecordId: limit.ruleId,
        },
      }),
    ),
  ];
}

function stateFacts(request: NextMealRankingRequest) {
  const candidateRevisions = new Map<
    string,
    ReturnType<typeof stateFactForCandidate>
  >();
  for (const candidate of request.candidates.entries) {
    const fact = stateFactForCandidate(candidate);
    candidateRevisions.set(`${fact.factType}:${fact.factKey}`, fact);
  }
  return [
    {
      factType: 'planning-policy',
      factKey: `policy:${request.planningPolicy.policyVersion}`,
      revision: request.planningPolicy.policyVersion,
      source: ENGINE_SOURCE,
    },
    {
      factType: 'hard-constraint-policy',
      factKey: `policy:${request.planningPolicy.hardConstraintPolicyVersion}`,
      revision: request.planningPolicy.hardConstraintPolicyVersion,
      source: ENGINE_SOURCE,
    },
    {
      factType: 'objective-hierarchy',
      factKey: `policy:${request.planningPolicy.objectiveHierarchyVersion}`,
      revision: request.planningPolicy.objectiveHierarchyVersion,
      source: ENGINE_SOURCE,
    },
    ...request.acceptedMeals.map((meal) => ({
      factType: 'recorded-meal',
      factKey: `meal:${meal.mealId}`,
      revision: String(meal.revision),
      source: {
        kind: 'calculation' as const,
        sourceId: 'accepted-meal-ledger',
        sourceVersion: String(meal.revision),
        sourceRecordId: meal.mealId,
      },
    })),
    ...request.temporalRules.map((rule) => ({
      factType: 'temporal-rule',
      factKey: `rule:${rule.ruleId}`,
      revision: rule.ruleVersion,
      source: rule.target.source,
    })),
    ...candidateRevisions.values(),
    ...(request.candidates.inventory.mode === 'AVAILABLE_ONLY'
      ? [
          {
            factType: 'inventory-revision',
            factKey: `inventory:${request.candidates.inventory.revision}`,
            revision: String(request.candidates.inventory.revision),
            source: ENGINE_SOURCE,
          },
        ]
      : []),
  ];
}

function stateFactForCandidate(
  candidate: NextMealRankingRequest['candidates']['entries'][number],
) {
  const evidence =
    candidate.portions[0]?.source ??
    (candidate.restrictionEvidence.state === 'verified'
      ? candidate.restrictionEvidence.source
      : ENGINE_SOURCE);
  return candidate.reference.kind === 'food'
    ? {
        factType: 'catalog-release',
        factKey: `catalog:${candidate.reference.catalogReleaseId}`,
        revision: candidate.reference.catalogReleaseId,
        source: evidence,
      }
    : {
        factType: 'recipe-revision',
        factKey: `recipe:${candidate.reference.recipeId}:${candidate.reference.recipeVersion}`,
        revision: String(candidate.reference.recipeVersion),
        source: evidence,
      };
}

function completenessReasons(
  request: NextMealRankingRequest,
  ranking: NextMealRankingResult,
): string[] {
  const reasons = new Set<string>();
  if (ranking.processed !== ranking.total)
    reasons.add('catalog-census-limited');
  if (ranking.counts.EVIDENCE_LIMITED > 0)
    reasons.add('candidate-evidence-limited');
  if (request.temporalRules.some((rule) => rule.coverage.state === 'unknown'))
    reasons.add('recorded-intake-evidence-limited');
  return [...reasons].sort();
}

/**
 * Projects the active next-meal engine into the solver-neutral planning model.
 * The action universe contains the engine-selected, exact portion for every
 * comparable catalog entry. Upstream nonactionable catalog classifications
 * remain represented by the frozen census and completeness facts.
 */
export function createNextMealPlanningDecisionChainV1(
  rawRequest: unknown,
  rawRanking: unknown,
  context: NextMealDomainAdapterContextV1,
): PlanningDecisionChainV1 {
  const request = NextMealRankingRequestSchema.parse(rawRequest);
  const ranking = NextMealRankingResultSchema.parse(rawRanking);
  if (ranking.processed !== ranking.total)
    throw new TypeError(
      'The active domain adapter requires a complete catalog census.',
    );
  const stateKey = `state:${context.subjectKey}:${request.candidates.requestedAt}`;
  const opportunityCount =
    request.planningPolicy.horizonDays *
    request.planningPolicy.opportunitiesPerDay;
  const entries = new Map(
    request.candidates.entries.map((entry) => [
      entry.reference.kind === 'food'
        ? `food:${entry.reference.catalogReleaseId}:${entry.reference.foodId}:${entry.reference.foodRevision}`
        : `recipe:${entry.reference.recipeId}:${entry.reference.recipeVersion}`,
      entry,
    ]),
  );
  const orderedIdentity = new Map(
    [...ranking.ranked]
      .sort((left, right) =>
        `${left.candidateKey}:${left.portionId}`.localeCompare(
          `${right.candidateKey}:${right.portionId}`,
        ),
      )
      .map((row, index) => [actionId(row.candidateKey, row.portionId), index]),
  );
  const objectives = nextMealObjectiveHierarchyV1();
  const actions = ranking.ranked.map((row) => {
    const candidate = entries.get(row.candidateKey);
    const portion = candidate?.portions.find(
      ({ portionId }) => portionId === row.portionId,
    );
    if (!candidate || !portion)
      throw new TypeError(
        'A ranked action must resolve to its frozen portion.',
      );
    return {
      actionId: actionId(row.candidateKey, row.portionId),
      stateKey,
      actionType: 'next-meal' as const,
      candidateKey: row.candidateKey,
      candidateKind: candidate.reference.kind,
      portionId: row.portionId,
      edibleGrams: row.edibleGrams,
      eligibleOpportunityIndexes: Array.from(
        { length: opportunityCount },
        (_, index) => index,
      ),
      evidence: portion.source,
    };
  });
  const constraints = constraintDefinitions(request, actions);
  const reasons = completenessReasons(request, ranking);
  const chain: PlanningDecisionChainV1 = {
    problem: {
      modelVersion: PLANNING_DOMAIN_MODEL_VERSION_V1,
      problemId: context.problemId,
      state: {
        modelVersion: PLANNING_DOMAIN_MODEL_VERSION_V1,
        stateKey,
        subjectKey: context.subjectKey,
        capturedAt: context.capturedAt,
        decisionInstant: request.candidates.requestedAt,
        policyVersion: request.planningPolicy.policyVersion,
        horizon: {
          mode: 'rolling',
          days: request.planningPolicy.horizonDays,
          opportunitiesPerDay: request.planningPolicy.opportunitiesPerDay,
          publishedActionCount: 1,
          scenarios: request.planningPolicy.robustScenarios.map((scenario) => ({
            scenarioId: scenario.scenarioId,
            description: `${scenario.missedFutureOpportunities} future eating opportunities unavailable.`,
          })),
        },
        facts: stateFacts(request),
        completeness:
          reasons.length === 0
            ? { status: 'COMPLETE', reasonCodes: [] }
            : { status: 'LIMITED', reasonCodes: reasons },
      },
      actions,
      constraints,
      objectives,
    },
    outcome: {
      modelVersion: PLANNING_DOMAIN_MODEL_VERSION_V1,
      runId: context.runId,
      problemId: context.problemId,
      stateKey,
      status:
        ranking.ranked.length > 0
          ? 'READY'
          : ranking.counts.EVIDENCE_LIMITED > 0 ||
              ranking.counts.REQUIRES_PREPARATION > 0
            ? 'NEEDS_INPUT'
            : 'INFEASIBLE',
      censusComplete: true,
      actionOutcomes: ranking.ranked.map((row) => {
        const id = actionId(row.candidateKey, row.portionId);
        const values = new Map<string, ExactRatio>([
          ['nutrition.robust-maximum-gap', row.maximumDistance],
          ['nutrition.robust-weighted-gap', row.weightedDistance],
          ['nutrition.nominal-maximum-gap', row.nominalMaximumDistance],
          ['nutrition.nominal-weighted-gap', row.nominalWeightedDistance],
          ['nutrition.immediate-maximum-gap', row.immediateMaximumDistance],
          ['nutrition.immediate-weighted-gap', row.immediateWeightedDistance],
          ['practicality.portion-size', decimalRatio(row.edibleGrams)],
          [
            'context.variety-repetition',
            { numerator: String(row.repetitionCount), denominator: '1' },
          ],
          [
            'stability.deterministic-identity',
            {
              numerator: String(orderedIdentity.get(id) ?? 0),
              denominator: '1',
            },
          ],
        ]);
        return {
          actionId: id,
          classification: 'FEASIBLE' as const,
          rank: row.rank,
          constraintResults: constraints
            .filter(
              ({ scope }) =>
                scope.kind === 'global' ||
                scope.kind === 'scenarios' ||
                scope.actionIds.includes(id),
            )
            .map((constraint) => ({
              constraintId: constraint.constraintId,
              status: 'PASSED' as const,
              reasonCodes: [],
            })),
          objectiveResults: NEXT_MEAL_ACTIVE_OBJECTIVE_IDS_V1.map(
            (objectiveId) => {
              const value = values.get(objectiveId);
              if (!value)
                throw new TypeError(
                  `Active objective ${objectiveId} has no result value.`,
                );
              return { objectiveId, value };
            },
          ),
        };
      }),
      ...(ranking.ranked[0]
        ? {
            recommendedActionId: actionId(
              ranking.ranked[0].candidateKey,
              ranking.ranked[0].portionId,
            ),
          }
        : {}),
      validatorVersion: NEXT_MEAL_VALIDATOR_VERSION_V1,
      validatedAt: context.validatedAt,
    },
  };
  return PlanningDecisionChainV1Schema.parse(chain);
}
