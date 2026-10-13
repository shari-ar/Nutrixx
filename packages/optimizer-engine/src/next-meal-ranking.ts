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
  classifyNextMealCatalog,
  nextMealSourceKey,
  type NextMealCandidateClassification,
  type NextMealCandidateDecision,
  type NextMealCandidateSource,
} from './next-meal-candidates.js';

export const NEXT_MEAL_RANKING_POLICY_VERSION_V1 =
  'free-next-meal-weighted-distance-v1' as const;

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
          weight: z.int().positive().max(1000),
        }),
      )
      .min(1),
  })
  .superRefine((request, context) => {
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
  readonly ruleScores: readonly NextMealRuleScore[];
}

function compareScored(left: ScoredPortion, right: ScoredPortion): number {
  return (
    compare(left.weightedDistance, right.weightedDistance) ||
    compare(left.maximumDistance, right.maximumDistance) ||
    compare(decimal(left.edibleGrams), decimal(right.edibleGrams)) ||
    (left.candidateKey < right.candidateKey
      ? -1
      : left.candidateKey > right.candidateKey
        ? 1
        : 0) ||
    (left.portionId < right.portionId
      ? -1
      : left.portionId > right.portionId
        ? 1
        : 0)
  );
}

function scoreCandidate(
  candidate: NextMealCandidateSource,
  decision: NextMealCandidateDecision,
  rules: readonly Rule[],
  histories: ReadonlyMap<string, Fraction>,
): ScoredPortion {
  const nutrients = new Map(
    candidate.nutrientsPer100EdibleGrams.map((item) => [item.nutrientId, item]),
  );
  const supported = new Set(decision.supportedPortionIds);
  let best: ScoredPortion | null = null;
  for (const portion of candidate.portions) {
    if (!supported.has(portion.portionId)) continue;
    const grams = decimal(portion.edibleGrams);
    let weightedDistance = ZERO;
    let maximumDistance = ZERO;
    const ruleScores: NextMealRuleScore[] = [];
    for (const rule of rules) {
      const nutrient = nutrients.get(rule.nutrientId)!;
      if (nutrient.state !== 'known')
        throw new TypeError('A comparable nutrient needs a known amount.');
      const recorded = histories.get(rule.ruleId)!;
      const composition = decimal(nutrient.amountPer100EdibleGrams);
      const candidateAmount = fraction(
        composition.numerator * grams.numerator,
        composition.denominator * grams.denominator * 100n,
      );
      const projected = add(recorded, candidateAmount);
      const normalized = distance(
        projected,
        decimal(rule.target.amount),
        rule.target.mode,
      );
      weightedDistance = add(
        weightedDistance,
        fraction(
          normalized.numerator * BigInt(rule.weight),
          normalized.denominator,
        ),
      );
      if (compare(normalized, maximumDistance) > 0)
        maximumDistance = normalized;
      ruleScores.push({
        ruleId: rule.ruleId,
        recordedAmount: ratio(recorded),
        projectedAmount: ratio(projected),
        normalizedDistance: ratio(normalized),
      });
    }
    const scored: ScoredPortion = {
      candidateKey: decision.candidateKey,
      portionId: portion.portionId,
      edibleGrams: portion.edibleGrams,
      weightedDistance,
      maximumDistance,
      ruleScores,
    };
    if (best === null || compareScored(scored, best) < 0) best = scored;
  }
  if (best === null)
    throw new TypeError('A comparable candidate needs a supported portion.');
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

export function rankNextMealCandidatesV1(raw: unknown): NextMealRankingResult {
  const request = NextMealRankingRequestSchema.parse(raw);
  const census = classifyNextMealCatalog(request.candidates);
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
  const scored: ScoredPortion[] = [];
  const unranked: NextMealCandidateDecision[] = [];
  for (const decision of census.decisions) {
    if (decision.classification !== 'COMPARABLE') {
      unranked.push(decision);
    } else if (unavailableRules.length > 0) {
      unranked.push({
        ...decision,
        classification: 'EVIDENCE_LIMITED',
        reasonCodes: unavailableRules.map(
          (ruleId) => `history-evidence-unresolved:${ruleId}`,
        ),
      });
    } else {
      scored.push(
        scoreCandidate(
          entries.get(decision.candidateKey)!,
          decision,
          rules,
          histories,
        ),
      );
    }
  }
  scored.sort(compareScored);
  unranked.sort(
    (left, right) =>
      UNRANKED_ORDER.indexOf(left.classification) -
        UNRANKED_ORDER.indexOf(right.classification) ||
      compareKeys(left.reasonCodes.join(','), right.reasonCodes.join(',')) ||
      compareKeys(left.candidateKey, right.candidateKey),
  );
  const counts = { ...census.counts };
  counts.COMPARABLE = scored.length;
  counts.EVIDENCE_LIMITED = unranked.filter(
    (decision) => decision.classification === 'EVIDENCE_LIMITED',
  ).length;
  return {
    policyVersion: NEXT_MEAL_RANKING_POLICY_VERSION_V1,
    total: census.total,
    processed: census.processed,
    counts,
    ranked: scored.map((entry, index) => ({
      candidateKey: entry.candidateKey,
      classification: 'COMPARABLE',
      rank: index + 1,
      portionId: entry.portionId,
      edibleGrams: entry.edibleGrams,
      weightedDistance: ratio(entry.weightedDistance),
      maximumDistance: ratio(entry.maximumDistance),
      ruleScores: entry.ruleScores,
    })),
    unranked,
  };
}
