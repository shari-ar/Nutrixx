import * as z from 'zod';

import {
  CanonicalCodeSchema,
  CanonicalIdSchema,
  EvidenceSourceV1Schema,
  NonnegativeCanonicalDecimalSchema,
  UnitV1Schema,
  UtcInstantSchema,
} from '@nutrixx/canonical-schema';

import {
  NextMealCandidateRequestSchema,
  classifyValidatedNextMealCatalog,
  createValidatedNextMealCatalogClassifier,
  nextMealSourceKey,
  type NextMealCandidateCensus,
  type NextMealCandidateClassification,
  type NextMealCandidateDecision,
  type NextMealCandidateSource,
} from './next-meal-candidates.js';
import {
  NEXT_MEAL_ACTIVE_OBJECTIVE_IDS_V1,
  NEXT_MEAL_HARD_CONSTRAINT_POLICY_VERSION_V1,
  NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1,
} from './next-meal-decision-policy.js';

export const NEXT_MEAL_RANKING_POLICY_VERSION_V1 =
  'next-meal-hierarchical-robust-v1' as const;

export const DEFAULT_NEXT_MEAL_PLANNING_POLICY_V1 = {
  policyVersion: NEXT_MEAL_RANKING_POLICY_VERSION_V1,
  hardConstraintPolicyVersion: NEXT_MEAL_HARD_CONSTRAINT_POLICY_VERSION_V1,
  objectiveHierarchyVersion: NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1,
  horizonDays: 3,
  opportunitiesPerDay: 3,
  continuationCandidateLimit: 12,
  continuationPortfolioSize: 8,
  robustScenarios: [
    { scenarioId: 'expected-schedule', missedFutureOpportunities: 0 },
    { scenarioId: 'one-opportunity-lost', missedFutureOpportunities: 1 },
  ],
};

const AmountSchema = NonnegativeCanonicalDecimalSchema.max(64);
const PositiveAmountSchema = AmountSchema.refine(
  (amount) => amount !== '0',
  'The reference target must be positive.',
);

const MealNutrientSchema = z.discriminatedUnion('state', [
  z.strictObject({
    state: z.literal('known'),
    nutrientId: CanonicalCodeSchema,
    amount: AmountSchema,
    unit: UnitV1Schema,
    source: EvidenceSourceV1Schema,
  }),
  z.strictObject({
    state: z.literal('unknown'),
    nutrientId: CanonicalCodeSchema,
    reasonCode: CanonicalCodeSchema,
  }),
]);

export const NextMealRankingRequestSchema = z
  .strictObject({
    planningPolicy: z
      .strictObject({
        policyVersion: z.literal(NEXT_MEAL_RANKING_POLICY_VERSION_V1),
        hardConstraintPolicyVersion: z
          .literal(NEXT_MEAL_HARD_CONSTRAINT_POLICY_VERSION_V1)
          .default(NEXT_MEAL_HARD_CONSTRAINT_POLICY_VERSION_V1),
        objectiveHierarchyVersion: z
          .literal(NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1)
          .default(NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1),
        horizonDays: z.int().min(2).max(7),
        opportunitiesPerDay: z.int().min(1).max(6),
        continuationCandidateLimit: z.int().min(4).max(64),
        continuationPortfolioSize: z.int().min(2).max(32),
        robustScenarios: z
          .array(
            z.strictObject({
              scenarioId: CanonicalCodeSchema,
              missedFutureOpportunities: z.int().min(0).max(6),
            }),
          )
          .min(1)
          .max(4),
      })
      .default(DEFAULT_NEXT_MEAL_PLANNING_POLICY_V1),
    candidates: NextMealCandidateRequestSchema,
    acceptedMeals: z.array(
      z.strictObject({
        mealId: CanonicalIdSchema,
        revision: z.int().positive(),
        consumedAt: UtcInstantSchema,
        nutrients: z.array(MealNutrientSchema),
      }),
    ),
    temporalRules: z
      .array(
        z.strictObject({
          ruleId: CanonicalCodeSchema,
          ruleVersion: z.string().min(1).max(128),
          nutrientId: CanonicalCodeSchema,
          unit: UnitV1Schema,
          sourceScope: z.literal('all-intake'),
          timeBasis: z.enum(['nutrition-day', 'elapsed-time']),
          windowStartInclusive: UtcInstantSchema,
          windowEndExclusive: UtcInstantSchema,
          coverage: z.discriminatedUnion('state', [
            z.strictObject({
              state: z.literal('complete'),
              source: EvidenceSourceV1Schema,
            }),
            z.strictObject({
              state: z.literal('unknown'),
              reasonCode: CanonicalCodeSchema,
            }),
          ]),
          target: z.strictObject({
            amount: PositiveAmountSchema,
            mode: z.enum(['minimum', 'preferred']),
            referenceType: CanonicalCodeSchema,
            releaseId: z.string().min(1).max(200),
            source: EvidenceSourceV1Schema,
          }),
          forecastTargetPerDay: PositiveAmountSchema,
          weight: z.int().positive().max(1000),
        }),
      )
      .min(1),
  })
  .superRefine((request, context) => {
    const futureOpportunities =
      request.planningPolicy.horizonDays *
        request.planningPolicy.opportunitiesPerDay -
      1;
    const scenarioIds = new Set<string>();
    for (const [
      index,
      scenario,
    ] of request.planningPolicy.robustScenarios.entries()) {
      if (
        scenarioIds.has(scenario.scenarioId) ||
        scenario.missedFutureOpportunities > futureOpportunities
      )
        context.addIssue({
          code: 'custom',
          path: ['planningPolicy', 'robustScenarios', index],
          message:
            'Planning scenarios need unique IDs and a feasible opportunity loss.',
        });
      scenarioIds.add(scenario.scenarioId);
    }
    if (
      !request.planningPolicy.robustScenarios.some(
        (scenario) => scenario.missedFutureOpportunities === 0,
      )
    )
      context.addIssue({
        code: 'custom',
        path: ['planningPolicy', 'robustScenarios'],
        message: 'Rolling-horizon planning requires an expected schedule.',
      });
    const requestedAt = Date.parse(request.candidates.requestedAt);
    const comparison = new Set(
      request.candidates.comparisonNutrients.map(
        (nutrient) =>
          `${nutrient.nutrientId}:${nutrient.unit.system}:${nutrient.unit.code}`,
      ),
    );
    if (comparison.size !== request.candidates.comparisonNutrients.length) {
      context.addIssue({
        code: 'custom',
        path: ['candidates', 'comparisonNutrients'],
        message: 'Comparison nutrient and unit pairs must be unique.',
      });
    }
    const ruleIds = new Set<string>();
    const matched = new Set<string>();
    for (const [index, rule] of request.temporalRules.entries()) {
      const key = `${rule.nutrientId}:${rule.unit.system}:${rule.unit.code}`;
      if (ruleIds.has(rule.ruleId) || !comparison.has(key)) {
        context.addIssue({
          code: 'custom',
          path: ['temporalRules', index],
          message: 'Rules need unique IDs and matching comparison nutrients.',
        });
      }
      ruleIds.add(rule.ruleId);
      matched.add(key);
      if (
        Date.parse(rule.windowStartInclusive) > requestedAt ||
        requestedAt >= Date.parse(rule.windowEndExclusive)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['temporalRules', index],
          message: 'The next eating occasion must fall within the rule window.',
        });
      }
    }
    if (matched.size !== comparison.size) {
      context.addIssue({
        code: 'custom',
        path: ['temporalRules'],
        message: 'Every comparison nutrient needs a temporal rule.',
      });
    }
    const mealIds = new Set<string>();
    for (const [index, meal] of request.acceptedMeals.entries()) {
      if (
        mealIds.has(meal.mealId) ||
        Date.parse(meal.consumedAt) > requestedAt
      ) {
        context.addIssue({
          code: 'custom',
          path: ['acceptedMeals', index],
          message: 'Only one accepted revision of each prior meal is allowed.',
        });
      }
      mealIds.add(meal.mealId);
      if (
        new Set(meal.nutrients.map((nutrient) => nutrient.nutrientId)).size !==
        meal.nutrients.length
      ) {
        context.addIssue({
          code: 'custom',
          path: ['acceptedMeals', index, 'nutrients'],
          message: 'A meal has one observation per nutrient.',
        });
      }
    }
  });

export type NextMealRankingRequest = z.infer<
  typeof NextMealRankingRequestSchema
>;

interface Fraction {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

export interface ExactRatio {
  readonly numerator: string;
  readonly denominator: string;
}

export interface NextMealRuleScore {
  readonly ruleId: string;
  readonly recordedAmount: ExactRatio;
  readonly projectedAmount: ExactRatio;
  readonly normalizedDistance: ExactRatio;
}

export interface NextMealRankedCandidate {
  readonly candidateKey: string;
  readonly classification: 'COMPARABLE';
  readonly rank: number;
  readonly portionId: string;
  readonly edibleGrams: string;
  readonly weightedDistance: ExactRatio;
  readonly maximumDistance: ExactRatio;
  readonly nominalWeightedDistance: ExactRatio;
  readonly nominalMaximumDistance: ExactRatio;
  readonly immediateWeightedDistance: ExactRatio;
  readonly immediateMaximumDistance: ExactRatio;
  readonly repetitionCount: number;
  readonly ruleScores: readonly NextMealRuleScore[];
}

export interface NextMealRankingResult {
  readonly policyVersion: typeof NEXT_MEAL_RANKING_POLICY_VERSION_V1;
  readonly total: number;
  readonly processed: number;
  readonly counts: Readonly<Record<NextMealCandidateClassification, number>>;
  readonly ranked: readonly NextMealRankedCandidate[];
  readonly unranked: readonly NextMealCandidateDecision[];
}

const ZERO: Fraction = { numerator: 0n, denominator: 1n };

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right;
  while (b !== 0n) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a;
}

function fraction(numerator: bigint, denominator: bigint): Fraction {
  const divisor = gcd(numerator, denominator);
  return {
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  };
}

function decimal(value: string): Fraction {
  const [whole = '0', part = ''] = value.split('.');
  return fraction(BigInt(`${whole}${part}`), 10n ** BigInt(part.length));
}

function add(left: Fraction, right: Fraction): Fraction {
  return fraction(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function multiply(left: Fraction, right: Fraction): Fraction {
  return fraction(
    left.numerator * right.numerator,
    left.denominator * right.denominator,
  );
}

function compare(left: Fraction, right: Fraction): number {
  const difference =
    left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function distance(
  projected: Fraction,
  target: Fraction,
  mode: Rule['target']['mode'],
): Fraction {
  const difference =
    projected.numerator * target.denominator -
    target.numerator * projected.denominator;
  if (mode === 'minimum' && difference >= 0n) return ZERO;
  return fraction(
    difference < 0n ? -difference : difference,
    projected.denominator * target.numerator,
  );
}

function ratio(value: Fraction): ExactRatio {
  return {
    numerator: value.numerator.toString(),
    denominator: value.denominator.toString(),
  };
}

type Rule = NextMealRankingRequest['temporalRules'][number];

function historyForRule(
  request: NextMealRankingRequest,
  rule: Rule,
): Fraction | null {
  if (rule.coverage.state === 'unknown') return null;
  let total = ZERO;
  const start = Date.parse(rule.windowStartInclusive);
  const end = Date.parse(rule.windowEndExclusive);
  for (const meal of request.acceptedMeals) {
    const instant = Date.parse(meal.consumedAt);
    if (instant < start || instant >= end) continue;
    const observation = meal.nutrients.find(
      (nutrient) => nutrient.nutrientId === rule.nutrientId,
    );
    if (
      observation?.state !== 'known' ||
      observation.unit.system !== rule.unit.system ||
      observation.unit.code !== rule.unit.code
    )
      return null;
    total = add(total, decimal(observation.amount));
  }
  return total;
}

interface ScoredPortion {
  readonly candidateKey: string;
  readonly portionId: string;
  readonly edibleGrams: string;
  readonly weightedDistance: Fraction;
  readonly maximumDistance: Fraction;
  readonly nominalWeightedDistance: Fraction;
  readonly nominalMaximumDistance: Fraction;
  readonly immediateWeightedDistance: Fraction;
  readonly immediateMaximumDistance: Fraction;
  readonly repetitionCount: number;
  readonly ruleScores: readonly NextMealRuleScore[];
}

function compareScored(left: ScoredPortion, right: ScoredPortion): number {
  for (const objectiveId of NEXT_MEAL_ACTIVE_OBJECTIVE_IDS_V1) {
    const comparison = (() => {
      switch (objectiveId) {
        case 'nutrition.robust-maximum-gap':
          return compare(left.maximumDistance, right.maximumDistance);
        case 'nutrition.robust-weighted-gap':
          return compare(left.weightedDistance, right.weightedDistance);
        case 'nutrition.nominal-maximum-gap':
          return compare(
            left.nominalMaximumDistance,
            right.nominalMaximumDistance,
          );
        case 'nutrition.nominal-weighted-gap':
          return compare(
            left.nominalWeightedDistance,
            right.nominalWeightedDistance,
          );
        case 'nutrition.immediate-maximum-gap':
          return compare(
            left.immediateMaximumDistance,
            right.immediateMaximumDistance,
          );
        case 'nutrition.immediate-weighted-gap':
          return compare(
            left.immediateWeightedDistance,
            right.immediateWeightedDistance,
          );
        case 'practicality.portion-size':
          return compare(decimal(left.edibleGrams), decimal(right.edibleGrams));
        case 'context.variety-repetition':
          return left.repetitionCount - right.repetitionCount;
        case 'stability.deterministic-identity':
          return (
            compareKeys(left.candidateKey, right.candidateKey) ||
            compareKeys(left.portionId, right.portionId)
          );
        default:
          throw new TypeError(
            `Active objective ${objectiveId} has no comparator.`,
          );
      }
    })();
    if (comparison !== 0) return comparison;
  }
  return 0;
}

interface HorizonObjective {
  readonly maximumDistance: Fraction;
  readonly weightedDistance: Fraction;
  readonly repetitionCount: number;
}

interface PlanningAction {
  readonly candidateKey: string;
  readonly portionId: string;
  readonly edibleGrams: string;
  readonly amounts: readonly Fraction[];
  readonly hardLimitAmounts: ReadonlyMap<string, Fraction>;
}

interface ContinuationPlan {
  readonly scenarioId: string;
  readonly actions: readonly PlanningAction[];
  readonly amounts: readonly Fraction[];
  readonly hardLimitAmountsByDay: readonly ReadonlyMap<string, Fraction>[];
  readonly repetitionCount: number;
}

function objective(
  totals: readonly Fraction[],
  targets: readonly Fraction[],
  rules: readonly Rule[],
  repetitionCount = 0,
): HorizonObjective {
  let weightedDistance = ZERO;
  let maximumDistance = ZERO;
  for (const [index, rule] of rules.entries()) {
    const normalized = distance(
      totals[index]!,
      targets[index]!,
      rule.target.mode,
    );
    weightedDistance = add(
      weightedDistance,
      multiply(normalized, fraction(BigInt(rule.weight), 1n)),
    );
    if (compare(normalized, maximumDistance) > 0) maximumDistance = normalized;
  }
  return { maximumDistance, weightedDistance, repetitionCount };
}

function compareObjective(
  left: HorizonObjective,
  right: HorizonObjective,
): number {
  return (
    compare(left.maximumDistance, right.maximumDistance) ||
    compare(left.weightedDistance, right.weightedDistance) ||
    left.repetitionCount - right.repetitionCount
  );
}

function actionKey(action: PlanningAction): string {
  return `${action.candidateKey}:${action.portionId}`;
}

function sumVectors(
  left: readonly Fraction[],
  right: readonly Fraction[],
): Fraction[] {
  return left.map((value, index) => add(value, right[index]!));
}

function actionForPortion(
  candidate: NextMealCandidateSource,
  portion: NextMealCandidateSource['portions'][number],
  rules: readonly Rule[],
  hardLimits: NextMealRankingRequest['candidates']['hardLimits'],
): PlanningAction {
  const nutrients = new Map(
    candidate.nutrientsPer100EdibleGrams.map((item) => [item.nutrientId, item]),
  );
  const grams = decimal(portion.edibleGrams);
  const scaled = (nutrientId: string): Fraction => {
    const nutrient = nutrients.get(nutrientId);
    if (nutrient?.state !== 'known') return ZERO;
    return fraction(
      decimal(nutrient.amountPer100EdibleGrams).numerator * grams.numerator,
      decimal(nutrient.amountPer100EdibleGrams).denominator *
        grams.denominator *
        100n,
    );
  };
  return {
    candidateKey: nextMealSourceKey(candidate.reference),
    portionId: portion.portionId,
    edibleGrams: portion.edibleGrams,
    amounts: rules.map((rule) => scaled(rule.nutrientId)),
    hardLimitAmounts: new Map(
      hardLimits.map((limit) => [limit.ruleId, scaled(limit.nutrientId)]),
    ),
  };
}

function actionsForDecision(
  candidate: NextMealCandidateSource,
  decision: NextMealCandidateDecision,
  rules: readonly Rule[],
  hardLimits: NextMealRankingRequest['candidates']['hardLimits'],
): PlanningAction[] {
  const supported = new Set(decision.supportedPortionIds);
  return candidate.portions
    .filter((portion) => supported.has(portion.portionId))
    .map((portion) => actionForPortion(candidate, portion, rules, hardLimits));
}

function targetVector(
  rules: readonly Rule[],
  additionalDays: number,
): Fraction[] {
  return rules.map((rule) =>
    add(
      decimal(rule.target.amount),
      multiply(
        decimal(rule.forecastTargetPerDay),
        fraction(BigInt(additionalDays), 1n),
      ),
    ),
  );
}

function repetitionCount(keys: readonly string[]): number {
  return keys.length - new Set(keys).size;
}

function actionOrder(
  left: PlanningAction,
  right: PlanningAction,
  histories: readonly Fraction[],
  targets: readonly Fraction[],
  rules: readonly Rule[],
): number {
  return (
    compareObjective(
      objective(sumVectors(histories, left.amounts), targets, rules),
      objective(sumVectors(histories, right.amounts), targets, rules),
    ) ||
    compare(decimal(left.edibleGrams), decimal(right.edibleGrams)) ||
    compareKeys(actionKey(left), actionKey(right))
  );
}

function continuationPool(
  actions: readonly PlanningAction[],
  histories: readonly Fraction[],
  rules: readonly Rule[],
  limit: number,
): PlanningAction[] {
  const currentTargets = rules.map((rule) => decimal(rule.target.amount));
  const bestByCandidate = new Map<string, PlanningAction>();
  for (const action of actions) {
    const current = bestByCandidate.get(action.candidateKey);
    if (
      current === undefined ||
      actionOrder(action, current, histories, currentTargets, rules) < 0
    )
      bestByCandidate.set(action.candidateKey, action);
  }
  const balanced = [...bestByCandidate.values()].sort((left, right) =>
    actionOrder(left, right, histories, currentTargets, rules),
  );
  const selected = new Map<string, PlanningAction>();
  for (const action of balanced.slice(0, Math.ceil(limit / 2)))
    selected.set(actionKey(action), action);
  for (const [ruleIndex] of rules.entries()) {
    const specialist = [...bestByCandidate.values()].sort(
      (left, right) =>
        compare(right.amounts[ruleIndex]!, left.amounts[ruleIndex]!) ||
        actionOrder(left, right, histories, currentTargets, rules),
    )[0];
    if (specialist) selected.set(actionKey(specialist), specialist);
    if (selected.size >= limit) break;
  }
  for (const action of balanced) {
    if (selected.size >= limit) break;
    selected.set(actionKey(action), action);
  }
  const flexibleOpportunity: PlanningAction = {
    candidateKey: 'continuation:uncommitted',
    portionId: 'continuation-uncommitted',
    edibleGrams: '0',
    amounts: rules.map(() => ZERO),
    hardLimitAmounts: new Map(),
  };
  return [
    ...[...selected.values()].slice(0, Math.max(0, limit - 1)),
    flexibleOpportunity,
  ];
}

function actionFitsHardLimits(
  action: PlanningAction,
  dayIndex: number,
  dayTotals: readonly ReadonlyMap<string, Fraction>[],
  hardLimits: NextMealRankingRequest['candidates']['hardLimits'],
): boolean {
  return hardLimits.every((limit) => {
    if (
      limit.sourceScope !== 'all-intake' ||
      limit.recordedIntake.state !== 'known'
    )
      return false;
    const baseline =
      dayIndex === 0 ? decimal(limit.recordedIntake.amount) : ZERO;
    const existing = dayTotals[dayIndex]?.get(limit.ruleId) ?? ZERO;
    const contribution = action.hardLimitAmounts.get(limit.ruleId) ?? ZERO;
    return (
      compare(
        add(add(baseline, existing), contribution),
        decimal(limit.maximum),
      ) <= 0
    );
  });
}

function appendAction(
  action: PlanningAction,
  dayIndex: number,
  state: {
    totals: Fraction[];
    dayTotals: Map<string, Fraction>[];
    actions: PlanningAction[];
  },
): void {
  state.totals = sumVectors(state.totals, action.amounts);
  const day = state.dayTotals[dayIndex] ?? new Map<string, Fraction>();
  for (const [ruleId, amount] of action.hardLimitAmounts)
    day.set(ruleId, add(day.get(ruleId) ?? ZERO, amount));
  state.dayTotals[dayIndex] = day;
  state.actions.push(action);
}

function buildContinuationPlan(
  scenarioId: string,
  futureOpportunityCount: number,
  seed: PlanningAction | null,
  pool: readonly PlanningAction[],
  histories: readonly Fraction[],
  rules: readonly Rule[],
  request: NextMealRankingRequest,
): ContinuationPlan | null {
  const policy = request.planningPolicy;
  const state = {
    totals: [...histories],
    dayTotals: Array.from(
      { length: policy.horizonDays },
      () => new Map<string, Fraction>(),
    ),
    actions: [] as PlanningAction[],
  };
  for (
    let opportunity = 1;
    opportunity <= futureOpportunityCount;
    opportunity++
  ) {
    const dayIndex = Math.floor(opportunity / policy.opportunitiesPerDay);
    const targets = targetVector(
      rules,
      Math.min(dayIndex, policy.horizonDays - 1),
    );
    const eligible = pool.filter((action) =>
      actionFitsHardLimits(
        action,
        dayIndex,
        state.dayTotals,
        request.candidates.hardLimits,
      ),
    );
    if (eligible.length === 0) return null;
    let selected =
      seed?.candidateKey === 'continuation:uncommitted' &&
      eligible.includes(seed)
        ? seed
        : opportunity === 1 && seed && eligible.includes(seed)
          ? seed
          : undefined;
    if (!selected)
      selected = [...eligible].sort((left, right) => {
        const leftKeys = [
          ...state.actions.map((item) => item.candidateKey),
          left.candidateKey,
        ];
        const rightKeys = [
          ...state.actions.map((item) => item.candidateKey),
          right.candidateKey,
        ];
        return (
          compareObjective(
            objective(
              sumVectors(state.totals, left.amounts),
              targets,
              rules,
              repetitionCount(leftKeys),
            ),
            objective(
              sumVectors(state.totals, right.amounts),
              targets,
              rules,
              repetitionCount(rightKeys),
            ),
          ) || compareKeys(actionKey(left), actionKey(right))
        );
      })[0];
    appendAction(selected!, dayIndex, state);
  }
  const amounts = rules.map((_, ruleIndex) =>
    state.actions.reduce(
      (total, action) => add(total, action.amounts[ruleIndex]!),
      ZERO,
    ),
  );
  return {
    scenarioId,
    actions: state.actions,
    amounts,
    hardLimitAmountsByDay: state.dayTotals,
    repetitionCount: repetitionCount(
      state.actions.map((action) => action.candidateKey),
    ),
  };
}

function buildContinuationPortfolios(
  pool: readonly PlanningAction[],
  histories: readonly Fraction[],
  rules: readonly Rule[],
  request: NextMealRankingRequest,
): ReadonlyMap<string, readonly ContinuationPlan[]> {
  const policy = request.planningPolicy;
  const totalFuture = policy.horizonDays * policy.opportunitiesPerDay - 1;
  return new Map(
    policy.robustScenarios.map((scenario) => {
      const count = totalFuture - scenario.missedFutureOpportunities;
      const seeds: (PlanningAction | null)[] = [
        null,
        ...pool.slice(0, Math.max(0, policy.continuationPortfolioSize - 1)),
      ];
      const plans = seeds.flatMap((seed) => {
        const plan = buildContinuationPlan(
          scenario.scenarioId,
          count,
          seed,
          pool,
          histories,
          rules,
          request,
        );
        return plan ? [plan] : [];
      });
      const unique = new Map<string, ContinuationPlan>();
      for (const plan of plans)
        unique.set(plan.actions.map(actionKey).join('|'), plan);
      return [scenario.scenarioId, [...unique.values()]] as const;
    }),
  );
}

function planFitsWithFirstAction(
  first: PlanningAction,
  plan: ContinuationPlan,
  hardLimits: NextMealRankingRequest['candidates']['hardLimits'],
): boolean {
  return hardLimits.every((limit) => {
    if (
      limit.sourceScope !== 'all-intake' ||
      limit.recordedIntake.state !== 'known'
    )
      return false;
    for (const [dayIndex, day] of plan.hardLimitAmountsByDay.entries()) {
      const baseline =
        dayIndex === 0 ? decimal(limit.recordedIntake.amount) : ZERO;
      const firstAmount =
        dayIndex === 0
          ? (first.hardLimitAmounts.get(limit.ruleId) ?? ZERO)
          : ZERO;
      const planned = day.get(limit.ruleId) ?? ZERO;
      if (
        compare(
          add(add(baseline, firstAmount), planned),
          decimal(limit.maximum),
        ) > 0
      )
        return false;
    }
    return true;
  });
}

function scoreCandidate(
  candidate: NextMealCandidateSource,
  decision: NextMealCandidateDecision,
  rules: readonly Rule[],
  histories: ReadonlyMap<string, Fraction>,
  portfolios: ReadonlyMap<string, readonly ContinuationPlan[]>,
  request: NextMealRankingRequest,
): ScoredPortion | null {
  const nutrients = new Map(
    candidate.nutrientsPer100EdibleGrams.map((item) => [item.nutrientId, item]),
  );
  const supported = new Set(decision.supportedPortionIds);
  const historyVector = rules.map((rule) => histories.get(rule.ruleId)!);
  const currentTargets = rules.map((rule) => decimal(rule.target.amount));
  const terminalTargets = targetVector(
    rules,
    request.planningPolicy.horizonDays - 1,
  );
  let best: ScoredPortion | null = null;
  for (const portion of candidate.portions) {
    if (!supported.has(portion.portionId)) continue;
    const firstAction = actionForPortion(
      candidate,
      portion,
      rules,
      request.candidates.hardLimits,
    );
    const immediateTotals = sumVectors(historyVector, firstAction.amounts);
    const immediate = objective(immediateTotals, currentTargets, rules);
    const ruleScores: NextMealRuleScore[] = [];
    for (const [ruleIndex, rule] of rules.entries()) {
      const nutrient = nutrients.get(rule.nutrientId)!;
      if (nutrient.state !== 'known')
        throw new TypeError('A comparable nutrient needs a known amount.');
      const recorded = histories.get(rule.ruleId)!;
      const projected = immediateTotals[ruleIndex]!;
      const normalized = distance(
        projected,
        decimal(rule.target.amount),
        rule.target.mode,
      );
      ruleScores.push({
        ruleId: rule.ruleId,
        recordedAmount: ratio(recorded),
        projectedAmount: ratio(projected),
        normalizedDistance: ratio(normalized),
      });
    }
    const scenarioObjectives: {
      readonly scenarioId: string;
      readonly objective: HorizonObjective;
    }[] = [];
    for (const scenario of request.planningPolicy.robustScenarios) {
      const plans = (portfolios.get(scenario.scenarioId) ?? []).filter((plan) =>
        planFitsWithFirstAction(
          firstAction,
          plan,
          request.candidates.hardLimits,
        ),
      );
      let scenarioBest: HorizonObjective | null = null;
      for (const plan of plans) {
        const keys = [
          firstAction.candidateKey,
          ...plan.actions.map((action) => action.candidateKey),
        ];
        const result = objective(
          sumVectors(immediateTotals, plan.amounts),
          terminalTargets,
          rules,
          repetitionCount(keys),
        );
        if (scenarioBest === null || compareObjective(result, scenarioBest) < 0)
          scenarioBest = result;
      }
      if (scenarioBest === null) {
        scenarioObjectives.length = 0;
        break;
      }
      scenarioObjectives.push({
        scenarioId: scenario.scenarioId,
        objective: scenarioBest,
      });
    }
    if (
      scenarioObjectives.length !==
      request.planningPolicy.robustScenarios.length
    )
      continue;
    const worst = [...scenarioObjectives].sort((left, right) =>
      compareObjective(right.objective, left.objective),
    )[0]!.objective;
    const nominal = scenarioObjectives.find(
      ({ scenarioId }) =>
        request.planningPolicy.robustScenarios.find(
          (scenario) => scenario.scenarioId === scenarioId,
        )?.missedFutureOpportunities === 0,
    )!.objective;
    const scored: ScoredPortion = {
      candidateKey: decision.candidateKey,
      portionId: portion.portionId,
      edibleGrams: portion.edibleGrams,
      weightedDistance: worst.weightedDistance,
      maximumDistance: worst.maximumDistance,
      nominalWeightedDistance: nominal.weightedDistance,
      nominalMaximumDistance: nominal.maximumDistance,
      immediateWeightedDistance: immediate.weightedDistance,
      immediateMaximumDistance: immediate.maximumDistance,
      repetitionCount: worst.repetitionCount,
      ruleScores,
    };
    if (best === null || compareScored(scored, best) < 0) best = scored;
  }
  return best;
}

const UNRANKED_ORDER: readonly NextMealCandidateClassification[] = [
  'EVIDENCE_LIMITED',
  'UNAVAILABLE',
  'EXCLUDED',
  'REQUIRES_PREPARATION',
];

function compareKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

interface RankingAccumulator {
  readonly request: NextMealRankingRequest;
  readonly census: NextMealCandidateCensus;
  readonly rules: readonly Rule[];
  readonly histories: ReadonlyMap<string, Fraction>;
  readonly unavailableRules: readonly string[];
  readonly entries: ReadonlyMap<string, NextMealCandidateSource>;
  readonly portfolios: ReadonlyMap<string, readonly ContinuationPlan[]>;
  readonly scored: ScoredPortion[];
  readonly unranked: NextMealCandidateDecision[];
}

function createRankingAccumulator(
  request: NextMealRankingRequest,
  census: NextMealCandidateCensus,
): RankingAccumulator {
  const rules = [...request.temporalRules].sort((left, right) =>
    left.ruleId < right.ruleId ? -1 : left.ruleId > right.ruleId ? 1 : 0,
  );
  const histories = new Map<string, Fraction>();
  const unavailableRules: string[] = [];
  for (const rule of rules) {
    const history = historyForRule(request, rule);
    if (history === null) unavailableRules.push(rule.ruleId);
    else histories.set(rule.ruleId, history);
  }
  const entries = new Map(
    request.candidates.entries.map((entry) => [
      nextMealSourceKey(entry.reference),
      entry,
    ]),
  );
  const historyVector = rules.map((rule) => histories.get(rule.ruleId) ?? ZERO);
  const allActions = census.decisions.flatMap((decision) =>
    decision.classification === 'COMPARABLE'
      ? actionsForDecision(
          entries.get(decision.candidateKey)!,
          decision,
          rules,
          request.candidates.hardLimits,
        )
      : [],
  );
  const pool = continuationPool(
    allActions,
    historyVector,
    rules,
    request.planningPolicy.continuationCandidateLimit,
  );
  return {
    request,
    census,
    rules,
    histories,
    unavailableRules,
    entries,
    portfolios: buildContinuationPortfolios(
      pool,
      historyVector,
      rules,
      request,
    ),
    scored: [],
    unranked: [],
  };
}

function processDecision(
  accumulator: RankingAccumulator,
  decision: NextMealCandidateDecision,
): void {
  if (decision.classification !== 'COMPARABLE') {
    accumulator.unranked.push(decision);
  } else if (accumulator.unavailableRules.length > 0) {
    accumulator.unranked.push({
      ...decision,
      classification: 'EVIDENCE_LIMITED',
      reasonCodes: accumulator.unavailableRules.map(
        (ruleId) => `history-evidence-unresolved:${ruleId}`,
      ),
    });
  } else {
    const scored = scoreCandidate(
      accumulator.entries.get(decision.candidateKey)!,
      decision,
      accumulator.rules,
      accumulator.histories,
      accumulator.portfolios,
      accumulator.request,
    );
    if (scored) accumulator.scored.push(scored);
    else
      accumulator.unranked.push({
        ...decision,
        classification: 'EVIDENCE_LIMITED',
        reasonCodes: ['continuation-search-infeasible'],
      });
  }
}

function finishRanking(accumulator: RankingAccumulator): NextMealRankingResult {
  accumulator.scored.sort(compareScored);
  accumulator.unranked.sort(
    (left, right) =>
      UNRANKED_ORDER.indexOf(left.classification) -
        UNRANKED_ORDER.indexOf(right.classification) ||
      compareKeys(left.reasonCodes.join(','), right.reasonCodes.join(',')) ||
      compareKeys(left.candidateKey, right.candidateKey),
  );
  const counts = { ...accumulator.census.counts };
  counts.COMPARABLE = accumulator.scored.length;
  counts.EVIDENCE_LIMITED = accumulator.unranked.filter(
    (decision) => decision.classification === 'EVIDENCE_LIMITED',
  ).length;
  return {
    policyVersion: NEXT_MEAL_RANKING_POLICY_VERSION_V1,
    total: accumulator.census.total,
    processed: accumulator.census.processed,
    counts,
    ranked: accumulator.scored.map((entry, index) => ({
      candidateKey: entry.candidateKey,
      classification: 'COMPARABLE',
      rank: index + 1,
      portionId: entry.portionId,
      edibleGrams: entry.edibleGrams,
      weightedDistance: ratio(entry.weightedDistance),
      maximumDistance: ratio(entry.maximumDistance),
      nominalWeightedDistance: ratio(entry.nominalWeightedDistance),
      nominalMaximumDistance: ratio(entry.nominalMaximumDistance),
      immediateWeightedDistance: ratio(entry.immediateWeightedDistance),
      immediateMaximumDistance: ratio(entry.immediateMaximumDistance),
      repetitionCount: entry.repetitionCount,
      ruleScores: entry.ruleScores,
    })),
    unranked: accumulator.unranked,
  };
}

export function rankNextMealCandidatesV1(raw: unknown): NextMealRankingResult {
  const request = NextMealRankingRequestSchema.parse(raw);
  const census = classifyValidatedNextMealCatalog(request.candidates);
  return rankValidatedNextMealCensusV1(request, census);
}

/** Applies the frozen objective policy to a census that was validated by the caller. */
export function rankValidatedNextMealCensusV1(
  request: NextMealRankingRequest,
  census: NextMealCandidateCensus,
): NextMealRankingResult {
  const accumulator = createRankingAccumulator(request, census);
  for (const decision of census.decisions)
    processDecision(accumulator, decision);
  return finishRanking(accumulator);
}

export interface NextMealRankingChunkProgressV1 {
  readonly phase: 'classifying' | 'scoring';
  readonly processed: number;
  readonly total: number;
  readonly chunkSize: number;
  readonly recommendedChunkSize: number;
}

export interface NextMealRankingChunkOptionsV1 {
  /** Initial size when adaptation is enabled; fixed size otherwise. */
  readonly chunkSize?: number;
  readonly initialChunkSizes?: {
    readonly classifying?: number;
    readonly scoring?: number;
  };
  readonly adaptiveChunkSize?: boolean;
  readonly minimumChunkSize?: number;
  readonly maximumChunkSize?: number;
  readonly targetChunkDurationMs?: number;
  readonly onProgress?: (progress: NextMealRankingChunkProgressV1) => void;
  readonly yieldControl?: () => Promise<void>;
  readonly now?: () => number;
}

interface ChunkSizer {
  readonly size: number;
  observe(processed: number, elapsedMs: number): void;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new TypeError(`${name} must be a positive integer.`);
  return value;
}

function createChunkSizer(
  options: NextMealRankingChunkOptionsV1,
  phase: NextMealRankingChunkProgressV1['phase'],
): ChunkSizer {
  const adaptive = options.adaptiveChunkSize ?? true;
  const requested = positiveInteger(
    options.initialChunkSizes?.[phase] ?? options.chunkSize ?? 8,
    'The initial ranking chunk size',
  );
  const minimum = positiveInteger(
    options.minimumChunkSize ?? 4,
    'The minimum ranking chunk size',
  );
  const maximum = positiveInteger(
    options.maximumChunkSize ?? 2_048,
    'The maximum ranking chunk size',
  );
  if (minimum > maximum)
    throw new TypeError(
      'The minimum ranking chunk size cannot exceed the maximum.',
    );
  const targetMs = options.targetChunkDurationMs ?? 8;
  if (!Number.isFinite(targetMs) || targetMs <= 0)
    throw new TypeError(
      'The target ranking chunk duration must be a positive number.',
    );
  let size = adaptive
    ? Math.min(maximum, Math.max(minimum, requested))
    : requested;
  return {
    get size() {
      return size;
    },
    observe(processed, elapsedMs) {
      if (!adaptive || processed === 0) return;
      const proposed =
        elapsedMs <= 0
          ? size * 2
          : Math.round((processed * targetMs) / elapsedMs);
      const gradual = Math.min(
        size * 2,
        Math.max(Math.ceil(size / 2), proposed),
      );
      size = Math.min(maximum, Math.max(minimum, gradual));
    },
  };
}

function emptyCounts(): Record<NextMealCandidateClassification, number> {
  return {
    COMPARABLE: 0,
    EVIDENCE_LIMITED: 0,
    UNAVAILABLE: 0,
    EXCLUDED: 0,
    REQUIRES_PREPARATION: 0,
  };
}

export async function rankNextMealCandidatesChunkedV1(
  raw: unknown,
  options: NextMealRankingChunkOptionsV1 = {},
): Promise<NextMealRankingResult> {
  const request = NextMealRankingRequestSchema.parse(raw);
  const yieldControl = options.yieldControl ?? (() => Promise.resolve());
  const now = options.now ?? (() => globalThis.performance.now());
  const total = request.candidates.manifest.entryKeys.length;
  const classifyKey = createValidatedNextMealCatalogClassifier(
    request.candidates,
  );
  const decisions: NextMealCandidateDecision[] = [];
  const counts = emptyCounts();
  const classificationChunks = createChunkSizer(options, 'classifying');
  options.onProgress?.({
    phase: 'classifying',
    processed: 0,
    total,
    chunkSize: classificationChunks.size,
    recommendedChunkSize: classificationChunks.size,
  });
  for (let start = 0; start < total; ) {
    const plannedChunkSize = classificationChunks.size;
    const end = Math.min(start + plannedChunkSize, total);
    const startedAt = now();
    for (let index = start; index < end; index++) {
      const decision = classifyKey(
        request.candidates.manifest.entryKeys[index]!,
      );
      decisions.push(decision);
      counts[decision.classification]++;
    }
    classificationChunks.observe(end - start, now() - startedAt);
    options.onProgress?.({
      phase: 'classifying',
      processed: end,
      total,
      chunkSize: end - start,
      recommendedChunkSize: classificationChunks.size,
    });
    start = end;
    if (end < total) await yieldControl();
  }
  const census: NextMealCandidateCensus = {
    total,
    processed: decisions.length,
    counts,
    decisions,
  };
  const accumulator = createRankingAccumulator(request, census);
  const scoringChunks = createChunkSizer(options, 'scoring');
  options.onProgress?.({
    phase: 'scoring',
    processed: 0,
    total,
    chunkSize: scoringChunks.size,
    recommendedChunkSize: scoringChunks.size,
  });
  for (let start = 0; start < total; ) {
    const plannedChunkSize = scoringChunks.size;
    const end = Math.min(start + plannedChunkSize, total);
    const startedAt = now();
    for (let index = start; index < end; index++)
      processDecision(accumulator, decisions[index]!);
    scoringChunks.observe(end - start, now() - startedAt);
    options.onProgress?.({
      phase: 'scoring',
      processed: end,
      total,
      chunkSize: end - start,
      recommendedChunkSize: scoringChunks.size,
    });
    start = end;
    if (end < total) await yieldControl();
  }
  return finishRanking(accumulator);
}
