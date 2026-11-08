import * as z from 'zod';

import {
  NEXT_MEAL_RANKING_POLICY_VERSION_V1,
  NextMealRankingRequestSchema,
  rankValidatedNextMealCensusV1,
  type NextMealRankingRequest,
  type NextMealRankingResult,
  type NextMealRankedCandidate,
} from './next-meal-ranking.js';
import {
  nextMealSourceKey,
  type NextMealCandidateClassification,
  type NextMealCandidateDecision,
  type NextMealCandidateSource,
} from './next-meal-candidates.js';

export const NEXT_MEAL_VALIDATOR_VERSION_V1 =
  'free-next-meal-independent-validator-v1' as const;
export const NEXT_MEAL_EXPLANATION_VERSION_V1 =
  'free-next-meal-explanation-v1' as const;

const RatioSchema = z.strictObject({
  numerator: z.string().regex(/^(0|[1-9]\d*)$/),
  denominator: z.string().regex(/^[1-9]\d*$/),
});
const ClassificationSchema = z.enum([
  'COMPARABLE',
  'EVIDENCE_LIMITED',
  'UNAVAILABLE',
  'EXCLUDED',
  'REQUIRES_PREPARATION',
]);
const ClassificationCountsSchema = z.strictObject({
  COMPARABLE: z.int().nonnegative(),
  EVIDENCE_LIMITED: z.int().nonnegative(),
  UNAVAILABLE: z.int().nonnegative(),
  EXCLUDED: z.int().nonnegative(),
  REQUIRES_PREPARATION: z.int().nonnegative(),
});
export const NextMealRankingResultSchema = z.strictObject({
  policyVersion: z.literal(NEXT_MEAL_RANKING_POLICY_VERSION_V1),
  total: z.int().nonnegative(),
  processed: z.int().nonnegative(),
  counts: ClassificationCountsSchema,
  ranked: z.array(
    z.strictObject({
      candidateKey: z.string().min(1),
      classification: z.literal('COMPARABLE'),
      rank: z.int().positive(),
      portionId: z.string().min(1),
      edibleGrams: z.string().min(1),
      weightedDistance: RatioSchema,
      maximumDistance: RatioSchema,
      nominalWeightedDistance: RatioSchema,
      nominalMaximumDistance: RatioSchema,
      immediateWeightedDistance: RatioSchema,
      immediateMaximumDistance: RatioSchema,
      repetitionCount: z.int().nonnegative(),
      ruleScores: z.array(
        z.strictObject({
          ruleId: z.string().min(1),
          recordedAmount: RatioSchema,
          projectedAmount: RatioSchema,
          normalizedDistance: RatioSchema,
        }),
      ),
    }),
  ),
  unranked: z.array(
    z.strictObject({
      candidateKey: z.string().min(1),
      classification: ClassificationSchema.exclude(['COMPARABLE']),
      reasonCodes: z.array(z.string().min(1)),
      supportedPortionIds: z.array(z.string().min(1)),
    }),
  ),
});

export const NextMealCompactRankingResultV1Schema = z
  .strictObject({
    policyVersion: z.literal(NEXT_MEAL_RANKING_POLICY_VERSION_V1),
    total: z.int().nonnegative(),
    processed: z.int().nonnegative(),
    counts: ClassificationCountsSchema,
    ranked: z.array(
      z.strictObject({
        candidateKey: z.string().min(1),
        rank: z.int().positive(),
        score: RatioSchema,
      }),
    ),
  })
  .superRefine((result, context) => {
    const counted = Object.values(result.counts).reduce(
      (total, count) => total + count,
      0,
    );
    if (
      result.processed !== result.total ||
      counted !== result.total ||
      result.ranked.length !== result.counts.COMPARABLE
    )
      context.addIssue({
        code: 'custom',
        message: 'Compact ranking coverage is inconsistent.',
      });
    const keys = new Set<string>();
    for (const [index, row] of result.ranked.entries()) {
      if (row.rank !== index + 1 || keys.has(row.candidateKey))
        context.addIssue({
          code: 'custom',
          path: ['ranked', index],
          message: 'Compact ranking order and identities must be unique.',
        });
      keys.add(row.candidateKey);
    }
  });

export type NextMealCompactRankingResultV1 = z.infer<
  typeof NextMealCompactRankingResultV1Schema
>;

/** Retains only ordered identity and score after the full result passes review. */
export function compactNextMealRankingResultV1(
  result: NextMealRankingResult,
): NextMealCompactRankingResultV1 {
  return NextMealCompactRankingResultV1Schema.parse({
    policyVersion: result.policyVersion,
    total: result.total,
    processed: result.processed,
    counts: result.counts,
    ranked: result.ranked.map((row) => ({
      candidateKey: row.candidateKey,
      rank: row.rank,
      score: row.weightedDistance,
    })),
  });
}

type Rule = NextMealRankingRequest['temporalRules'][number];
type CandidateRequest = NextMealRankingRequest['candidates'];
type Rational = readonly [bigint, bigint];
const ZERO: Rational = [0n, 1n];

function commonDivisor(a: bigint, b: bigint): bigint {
  let left = a < 0n ? -a : a;
  let right = b;
  while (right !== 0n) [left, right] = [right, left % right];
  return left;
}

function rational(a: bigint, b: bigint): Rational {
  const divisor = commonDivisor(a, b);
  return [a / divisor, b / divisor];
}

function amount(value: string): Rational {
  const [integer, decimal = ''] = value.split('.');
  return rational(
    BigInt(`${integer}${decimal}`),
    10n ** BigInt(decimal.length),
  );
}

function plus(a: Rational, b: Rational): Rational {
  return rational(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
}

function times(a: Rational, b: Rational): Rational {
  return rational(a[0] * b[0], a[1] * b[1]);
}

function divide(a: Rational, b: Rational): Rational {
  return rational(a[0] * b[1], a[1] * b[0]);
}

function order(a: Rational, b: Rational): number {
  const delta = a[0] * b[1] - b[0] * a[1];
  return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}

function sameUnit(
  a: { system: string; code: string },
  b: { system: string; code: string },
): boolean {
  return a.system === b.system && a.code === b.code;
}

function keyOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function matchedStock(
  candidate: NextMealCandidateSource,
  request: CandidateRequest,
  portion: NextMealCandidateSource['portions'][number],
): boolean {
  if (request.inventory.mode === 'ALL_CATALOG') return true;
  const stock = new Map<string, Rational>(
    request.inventory.entries
      .filter(
        (entry) => !entry.expiresAt || entry.expiresAt > request.requestedAt,
      )
      .map(
        (entry) =>
          [
            `${nextMealSourceKey(entry.reference)}:${entry.preparationState}`,
            amount(entry.edibleGrams),
          ] as const,
      ),
  );
  const direct = stock.get(
    `${nextMealSourceKey(candidate.reference)}:${candidate.preparationState}`,
  );
  if (direct && order(direct, amount(portion.edibleGrams)) >= 0) return true;
  if (!candidate.recipe) return false;
  const required = new Map<string, Rational>();
  for (const ingredient of candidate.recipe.ingredients) {
    const key = `${nextMealSourceKey(ingredient.reference)}:${ingredient.preparationState}`;
    const scaled = divide(
      times(
        amount(ingredient.edibleGramsForYield),
        amount(portion.edibleGrams),
      ),
      amount(candidate.recipe.yieldEdibleGrams),
    );
    required.set(key, plus(required.get(key) ?? ZERO, scaled));
  }
  return [...required].every(([key, needed]) => {
    const available = stock.get(key);
    return available !== undefined && order(available, needed) >= 0;
  });
}

function inspectCandidate(
  candidate: NextMealCandidateSource,
  request: CandidateRequest,
): NextMealCandidateDecision {
  const candidateKey = nextMealSourceKey(candidate.reference);
  const result = (
    classification: NextMealCandidateClassification,
    reasonCodes: string[],
    supportedPortionIds: string[] = [],
  ): NextMealCandidateDecision => ({
    candidateKey,
    classification,
    reasonCodes,
    supportedPortionIds,
  });
  const exclusions = request.exclusions;
  if (
    candidate.reference.kind === 'food' &&
    exclusions.foodIds.includes(candidate.reference.foodId)
  )
    return result('EXCLUDED', ['excluded-food']);
  if (
    candidate.reference.kind === 'recipe' &&
    exclusions.recipeIds.includes(candidate.reference.recipeId)
  )
    return result('EXCLUDED', ['excluded-recipe']);
  if (
    candidate.recipe?.ingredients.some(
      (item) =>
        item.reference.kind === 'food' &&
        (exclusions.foodIds.includes(item.reference.foodId) ||
          exclusions.ingredientFoodIds.includes(item.reference.foodId)),
    )
  )
    return result('EXCLUDED', ['excluded-ingredient']);
  if (candidate.restrictionEvidence.state === 'verified') {
    if (
      candidate.restrictionEvidence.ingredientFoodIds.some(
        (id) =>
          exclusions.foodIds.includes(id) ||
          exclusions.ingredientFoodIds.includes(id),
      )
    )
      return result('EXCLUDED', ['excluded-ingredient']);
    if (
      candidate.restrictionEvidence.allergenCodes.some((code) =>
        exclusions.allergenCodes.includes(code),
      )
    )
      return result('EXCLUDED', ['excluded-allergen']);
  }
  if (
    candidate.edibleResolution === 'requires-preparation' ||
    candidate.portions.length === 0
  )
    return result('REQUIRES_PREPARATION', ['edible-portion-unresolved']);
  let portions = candidate.portions.filter((portion) =>
    matchedStock(candidate, request, portion),
  );
  if (portions.length === 0)
    return result('UNAVAILABLE', ['inventory-insufficient']);
  if (
    candidate.restrictionEvidence.state === 'unknown' &&
    Object.values(exclusions).some((values) => values.length > 0)
  )
    return result(
      'EVIDENCE_LIMITED',
      ['restriction-evidence-unresolved'],
      portions.map((item) => item.portionId),
    );
  const nutrients = new Map(
    candidate.nutrientsPer100EdibleGrams.map((item) => [item.nutrientId, item]),
  );
  const reasons: string[] = [];
  for (const limit of request.hardLimits) {
    const observation = nutrients.get(limit.nutrientId);
    if (
      limit.sourceScope !== 'all-intake' ||
      limit.recordedIntake.state !== 'known' ||
      observation?.state !== 'known' ||
      !sameUnit(limit.unit, observation.unit)
    ) {
      reasons.push(`hard-limit-evidence-unresolved:${limit.ruleId}`);
      continue;
    }
    const recorded = amount(limit.recordedIntake.amount);
    const maximum = amount(limit.maximum);
    portions = portions.filter(
      (portion) =>
        order(
          plus(
            recorded,
            divide(
              times(
                amount(observation.amountPer100EdibleGrams),
                amount(portion.edibleGrams),
              ),
              amount('100'),
            ),
          ),
          maximum,
        ) <= 0,
    );
    if (portions.length === 0)
      return result('EXCLUDED', [`hard-limit-exceeded:${limit.ruleId}`]);
  }
  for (const comparison of request.comparisonNutrients) {
    const observation = nutrients.get(comparison.nutrientId);
    if (
      observation?.state !== 'known' ||
      !sameUnit(comparison.unit, observation.unit)
    )
      reasons.push(`comparison-evidence-unresolved:${comparison.nutrientId}`);
  }
  return result(
    reasons.length ? 'EVIDENCE_LIMITED' : 'COMPARABLE',
    reasons,
    portions.map((item) => item.portionId),
  );
}

export interface NextMealCandidateExplanationV1 {
  readonly candidateKey: string;
  readonly classification: NextMealCandidateClassification;
  readonly displayName: string;
  readonly reasonCodes: readonly string[];
  readonly rank?: number;
  readonly portionId?: string;
  readonly edibleGrams?: string;
  readonly comparisons?: readonly {
    readonly ruleId: string;
    readonly nutrientId: string;
    readonly unit: Rule['unit'];
    readonly windowStartInclusive: string;
    readonly windowEndExclusive: string;
    readonly targetAmount: string;
    readonly targetMode: Rule['target']['mode'];
    readonly referenceType: string;
    readonly referenceReleaseId: string;
    readonly recordedAmount: NextMealRankedCandidate['weightedDistance'];
    readonly projectedAmount: NextMealRankedCandidate['weightedDistance'];
    readonly normalizedDistance: NextMealRankedCandidate['weightedDistance'];
    readonly acceptedMealIds: readonly string[];
  }[];
}

export type NextMealRankingReviewV1 =
  | {
      readonly status: 'APPROVED';
      readonly validatorVersion: typeof NEXT_MEAL_VALIDATOR_VERSION_V1;
      readonly explanationVersion: typeof NEXT_MEAL_EXPLANATION_VERSION_V1;
      readonly ranking: NextMealRankingResult;
      readonly explanations: readonly NextMealCandidateExplanationV1[];
    }
  | { readonly status: 'REJECTED'; readonly reasonCodes: readonly string[] };

/** Independently reconstructs the census, then reapplies the frozen objective policy. */
export function reviewNextMealRankingV1(
  rawInput: unknown,
  rawRanking: unknown,
): NextMealRankingReviewV1 {
  const inputResult = NextMealRankingRequestSchema.safeParse(rawInput);
  if (!inputResult.success)
    return { status: 'REJECTED', reasonCodes: ['invalid-frozen-input'] };
  const rankingResult = NextMealRankingResultSchema.safeParse(rawRanking);
  if (!rankingResult.success)
    return { status: 'REJECTED', reasonCodes: ['invalid-ranking-shape'] };
  const input = inputResult.data;
  const ranking = rankingResult.data;
  const rules = [...input.temporalRules].sort((a, b) =>
    keyOrder(a.ruleId, b.ruleId),
  );
  const sourceByKey = new Map(
    input.candidates.entries.map((entry) => [
      nextMealSourceKey(entry.reference),
      entry,
    ]),
  );
  const auditedDecisions: NextMealCandidateDecision[] = [];
  for (const key of input.candidates.manifest.entryKeys) {
    const candidate = sourceByKey.get(key)!;
    auditedDecisions.push(inspectCandidate(candidate, input.candidates));
  }
  const baseCounts = auditedDecisions.reduce(
    (counts, decision) => {
      counts[decision.classification]++;
      return counts;
    },
    {
      COMPARABLE: 0,
      EVIDENCE_LIMITED: 0,
      UNAVAILABLE: 0,
      EXCLUDED: 0,
      REQUIRES_PREPARATION: 0,
    } satisfies Record<NextMealCandidateClassification, number>,
  );
  const expected = rankValidatedNextMealCensusV1(input, {
    total: auditedDecisions.length,
    processed: auditedDecisions.length,
    counts: baseCounts,
    decisions: auditedDecisions,
  });
  const reasons: string[] = [];
  if (
    ranking.total !== input.candidates.manifest.entryKeys.length ||
    ranking.processed !== ranking.total ||
    JSON.stringify(ranking.counts) !== JSON.stringify(expected.counts)
  )
    reasons.push('catalog-coverage-mismatch');
  if (JSON.stringify(ranking.ranked) !== JSON.stringify(expected.ranked))
    reasons.push('ranked-claim-mismatch');
  if (JSON.stringify(ranking.unranked) !== JSON.stringify(expected.unranked))
    reasons.push('classification-mismatch');
  if (reasons.length) return { status: 'REJECTED', reasonCodes: reasons };
  const explanations: NextMealCandidateExplanationV1[] = [
    ...expected.ranked.map((row): NextMealCandidateExplanationV1 => {
      const candidate = sourceByKey.get(row.candidateKey)!;
      return {
        candidateKey: row.candidateKey,
        classification: 'COMPARABLE',
        displayName: candidate.displayName,
        reasonCodes: [
          'validated-comparable',
          'best-supported-portion',
          'rolling-horizon-continuation-validated',
          'robust-schedule-scenarios-evaluated',
          row.rank === 1
            ? 'highest-ranked-among-comparable'
            : 'ordered-by-hierarchical-robust-objectives',
        ],
        rank: row.rank,
        portionId: row.portionId,
        edibleGrams: row.edibleGrams,
        comparisons: row.ruleScores.map((score) => {
          const rule = rules.find((item) => item.ruleId === score.ruleId)!;
          return {
            ruleId: rule.ruleId,
            nutrientId: rule.nutrientId,
            unit: rule.unit,
            windowStartInclusive: rule.windowStartInclusive,
            windowEndExclusive: rule.windowEndExclusive,
            targetAmount: rule.target.amount,
            targetMode: rule.target.mode,
            referenceType: rule.target.referenceType,
            referenceReleaseId: rule.target.releaseId,
            recordedAmount: score.recordedAmount,
            projectedAmount: score.projectedAmount,
            normalizedDistance: score.normalizedDistance,
            acceptedMealIds: input.acceptedMeals
              .filter(
                (meal) =>
                  meal.consumedAt >= rule.windowStartInclusive &&
                  meal.consumedAt < rule.windowEndExclusive,
              )
              .map((meal) => meal.mealId)
              .sort(),
          };
        }),
      };
    }),
    ...expected.unranked.map(
      (decision): NextMealCandidateExplanationV1 => ({
        candidateKey: decision.candidateKey,
        classification: decision.classification,
        displayName: sourceByKey.get(decision.candidateKey)!.displayName,
        reasonCodes: decision.reasonCodes,
      }),
    ),
  ];
  return {
    status: 'APPROVED',
    validatorVersion: NEXT_MEAL_VALIDATOR_VERSION_V1,
    explanationVersion: NEXT_MEAL_EXPLANATION_VERSION_V1,
    ranking,
    explanations,
  };
}

/** Only explanations reconstructed from the frozen input and independently approved ranking are publishable. */
export function verifyNextMealExplanationsV1(
  input: unknown,
  ranking: unknown,
  explanations: unknown,
): boolean {
  const review = reviewNextMealRankingV1(input, ranking);
  return (
    review.status === 'APPROVED' &&
    JSON.stringify(explanations) === JSON.stringify(review.explanations)
  );
}
