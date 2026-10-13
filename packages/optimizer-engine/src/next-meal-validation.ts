import * as z from 'zod';

import {
  NextMealRankingRequestSchema,
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
export const NextMealRankingResultSchema = z.strictObject({
  policyVersion: z.literal('free-next-meal-weighted-distance-v1'),
  total: z.int().nonnegative(),
  processed: z.int().nonnegative(),
  counts: z.strictObject({
    COMPARABLE: z.int().nonnegative(),
    EVIDENCE_LIMITED: z.int().nonnegative(),
    UNAVAILABLE: z.int().nonnegative(),
    EXCLUDED: z.int().nonnegative(),
    REQUIRES_PREPARATION: z.int().nonnegative(),
  }),
  ranked: z.array(
    z.strictObject({
      candidateKey: z.string().min(1),
      classification: z.literal('COMPARABLE'),
      rank: z.int().positive(),
      portionId: z.string().min(1),
      edibleGrams: z.string().min(1),
      weightedDistance: RatioSchema,
      maximumDistance: RatioSchema,
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

function encoded(value: Rational): { numerator: string; denominator: string } {
  return { numerator: String(value[0]), denominator: String(value[1]) };
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

function acceptedHistory(
  input: NextMealRankingRequest,
  rule: Rule,
): Rational | null {
  if (rule.coverage.state !== 'complete') return null;
  let recorded = ZERO;
  for (const meal of input.acceptedMeals) {
    if (
      meal.consumedAt < rule.windowStartInclusive ||
      meal.consumedAt >= rule.windowEndExclusive
    )
      continue;
    const observation = meal.nutrients.find(
      (item) => item.nutrientId === rule.nutrientId,
    );
    if (
      observation?.state !== 'known' ||
      !sameUnit(observation.unit, rule.unit)
    )
      return null;
    recorded = plus(recorded, amount(observation.amount));
  }
  return recorded;
}

interface AuditedPortion {
  readonly candidateKey: string;
  readonly portionId: string;
  readonly edibleGrams: string;
  readonly weighted: Rational;
  readonly maximum: Rational;
  readonly rules: NextMealRankedCandidate['ruleScores'];
}

function portionOrder(a: AuditedPortion, b: AuditedPortion): number {
  return (
    order(a.weighted, b.weighted) ||
    order(a.maximum, b.maximum) ||
    order(amount(a.edibleGrams), amount(b.edibleGrams)) ||
    keyOrder(a.candidateKey, b.candidateKey) ||
    keyOrder(a.portionId, b.portionId)
  );
}

function inspectPortions(
  candidate: NextMealCandidateSource,
  decision: NextMealCandidateDecision,
  rules: readonly Rule[],
  histories: ReadonlyMap<string, Rational>,
): AuditedPortion {
  let best: AuditedPortion | undefined;
  for (const portion of candidate.portions) {
    if (!decision.supportedPortionIds.includes(portion.portionId)) continue;
    let weighted = ZERO;
    let maximum = ZERO;
    const scores: NextMealRankedCandidate['ruleScores'][number][] = [];
    for (const rule of rules) {
      const observation = candidate.nutrientsPer100EdibleGrams.find(
        (item) => item.nutrientId === rule.nutrientId,
      );
      if (observation?.state !== 'known')
        throw new TypeError('Comparable nutrients need known observations.');
      const recorded = histories.get(rule.ruleId)!;
      const projected = plus(
        recorded,
        divide(
          times(
            amount(observation.amountPer100EdibleGrams),
            amount(portion.edibleGrams),
          ),
          amount('100'),
        ),
      );
      const target = amount(rule.target.amount);
      const delta = order(projected, target);
      const gap =
        rule.target.mode === 'minimum' && delta >= 0
          ? ZERO
          : divide(
              delta < 0
                ? rational(
                    target[0] * projected[1] - projected[0] * target[1],
                    target[1] * projected[1],
                  )
                : rational(
                    projected[0] * target[1] - target[0] * projected[1],
                    projected[1] * target[1],
                  ),
              target,
            );
      weighted = plus(weighted, times(gap, rational(BigInt(rule.weight), 1n)));
      if (order(gap, maximum) > 0) maximum = gap;
      scores.push({
        ruleId: rule.ruleId,
        recordedAmount: encoded(recorded),
        projectedAmount: encoded(projected),
        normalizedDistance: encoded(gap),
      });
    }
    const current = {
      candidateKey: decision.candidateKey,
      portionId: portion.portionId,
      edibleGrams: portion.edibleGrams,
      weighted,
      maximum,
      rules: scores,
    };
    if (!best || portionOrder(current, best) < 0) best = current;
  }
  if (!best)
    throw new TypeError('Comparable candidates need supported portions.');
  return best;
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

/** Reconstructs the complete census and numerical order without calling the classifier or ranker. */
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
  const histories = new Map(
    rules.map((rule) => [rule.ruleId, acceptedHistory(input, rule)]),
  );
  const sourceByKey = new Map(
    input.candidates.entries.map((entry) => [
      nextMealSourceKey(entry.reference),
      entry,
    ]),
  );
  const expectedRanked: AuditedPortion[] = [];
  const expectedUnranked: NextMealCandidateDecision[] = [];
  for (const key of input.candidates.manifest.entryKeys) {
    const candidate = sourceByKey.get(key)!;
    const decision = inspectCandidate(candidate, input.candidates);
    if (decision.classification !== 'COMPARABLE')
      expectedUnranked.push(decision);
    else {
      const unknown = rules.filter(
        (rule) => histories.get(rule.ruleId) === null,
      );
      if (unknown.length)
        expectedUnranked.push({
          ...decision,
          classification: 'EVIDENCE_LIMITED',
          reasonCodes: unknown.map(
            (rule) => `history-evidence-unresolved:${rule.ruleId}`,
          ),
        });
      else
        expectedRanked.push(
          inspectPortions(
            candidate,
            decision,
            rules,
            new Map(
              [...histories].map(([ruleId, history]) => [ruleId, history!]),
            ),
          ),
        );
    }
  }
  expectedRanked.sort(portionOrder);
  const unrankedOrder: NextMealCandidateClassification[] = [
    'EVIDENCE_LIMITED',
    'UNAVAILABLE',
    'EXCLUDED',
    'REQUIRES_PREPARATION',
  ];
  expectedUnranked.sort(
    (a, b) =>
      unrankedOrder.indexOf(a.classification) -
        unrankedOrder.indexOf(b.classification) ||
      keyOrder(a.reasonCodes.join(','), b.reasonCodes.join(',')) ||
      keyOrder(a.candidateKey, b.candidateKey),
  );
  const expectedRows = expectedRanked.map(
    (item, index): NextMealRankedCandidate => ({
      candidateKey: item.candidateKey,
      classification: 'COMPARABLE',
      rank: index + 1,
      portionId: item.portionId,
      edibleGrams: item.edibleGrams,
      weightedDistance: encoded(item.weighted),
      maximumDistance: encoded(item.maximum),
      ruleScores: item.rules,
    }),
  );
  const counts: NextMealRankingResult['counts'] = {
    COMPARABLE: expectedRows.length,
    EVIDENCE_LIMITED: expectedUnranked.filter(
      (item) => item.classification === 'EVIDENCE_LIMITED',
    ).length,
    UNAVAILABLE: expectedUnranked.filter(
      (item) => item.classification === 'UNAVAILABLE',
    ).length,
    EXCLUDED: expectedUnranked.filter(
      (item) => item.classification === 'EXCLUDED',
    ).length,
    REQUIRES_PREPARATION: expectedUnranked.filter(
      (item) => item.classification === 'REQUIRES_PREPARATION',
    ).length,
  };
  const reasons: string[] = [];
  if (
    ranking.total !== input.candidates.manifest.entryKeys.length ||
    ranking.processed !== ranking.total ||
    JSON.stringify(ranking.counts) !== JSON.stringify(counts)
  )
    reasons.push('catalog-coverage-mismatch');
  if (JSON.stringify(ranking.ranked) !== JSON.stringify(expectedRows))
    reasons.push('ranked-claim-mismatch');
  if (JSON.stringify(ranking.unranked) !== JSON.stringify(expectedUnranked))
    reasons.push('classification-mismatch');
  if (reasons.length) return { status: 'REJECTED', reasonCodes: reasons };
  const explanations: NextMealCandidateExplanationV1[] = [
    ...expectedRows.map((row): NextMealCandidateExplanationV1 => {
      const candidate = sourceByKey.get(row.candidateKey)!;
      return {
        candidateKey: row.candidateKey,
        classification: 'COMPARABLE',
        displayName: candidate.displayName,
        reasonCodes: [
          'validated-comparable',
          'best-supported-portion',
          row.rank === 1
            ? 'highest-ranked-among-comparable'
            : 'ordered-by-weighted-target-distance',
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
    ...expectedUnranked.map(
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
