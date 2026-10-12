import * as z from 'zod';

import {
  CanonicalCodeSchema,
  CanonicalIdSchema,
} from '@nutrixx/canonical-schema';

import {
  FREE_SEARCH_PROFILE_V1,
  PlanningInputV1Schema,
  type PlanningCandidateV1,
  type PlanningInputV1,
} from './planning-contract.js';

export const FREE_SCORING_POLICY_VERSION_V1 =
  'free-lexicographic-score-v1' as const;

const TraceSchema = z.strictObject({
  termination: z.enum([
    'draft',
    'direct-contradiction',
    'finite-exhaustion',
    'expansion-limit',
    'beam-pruning',
    'watchdog',
    'eligibility',
    'cancelled',
  ]),
  expandedStates: z.int().min(0).max(FREE_SEARCH_PROFILE_V1.expansionLimit),
  elapsedMilliseconds: z.int().nonnegative(),
  beamPruned: z.boolean(),
});

const ResultBase = {
  format: z.literal('nutrixx.local-search-result'),
  schemaVersion: z.literal(1),
  scoringPolicyVersion: z.literal(FREE_SCORING_POLICY_VERSION_V1),
  trace: TraceSchema,
} as const;

export const LocalSearchResultV1Schema = z.discriminatedUnion('status', [
  z.strictObject({
    ...ResultBase,
    status: z.literal('DRAFT'),
    optimalityGap: z.null(),
    selections: z
      .array(
        z.strictObject({
          slotId: CanonicalIdSchema,
          candidateId: CanonicalIdSchema,
          portionId: CanonicalCodeSchema,
        }),
      )
      .min(1)
      .max(4),
    score: z.strictObject({
      supportedNutritionTargets: z.int().nonnegative(),
      normalizedNutritionDistancePpm: z.int().nonnegative(),
      pinnedSelections: z.int().nonnegative(),
      favoredSelections: z.int().nonnegative(),
      avoidedSelections: z.int().nonnegative(),
      practicalFit: z.int(),
      distinctSemanticKeys: z.int().nonnegative(),
    }),
    limitationCodes: z.array(CanonicalCodeSchema).max(128),
  }),
  z.strictObject({
    ...ResultBase,
    status: z.literal('NEEDS_INPUT'),
    reasonCodes: z.array(CanonicalCodeSchema).min(1).max(32),
  }),
  z.strictObject({
    ...ResultBase,
    status: z.literal('OUT_OF_SCOPE'),
    reasonCodes: z.array(CanonicalCodeSchema).min(1).max(32),
  }),
  z.strictObject({
    ...ResultBase,
    status: z.literal('INFEASIBLE'),
    proof: z.enum(['direct-contradiction', 'finite-exhaustion']),
    reasonCodes: z.array(CanonicalCodeSchema).min(1).max(32),
  }),
  z.strictObject({
    ...ResultBase,
    status: z.literal('SEARCH_LIMIT'),
    limit: z.enum(['expansion-limit', 'beam-pruning', 'watchdog']),
    reasonCodes: z.array(CanonicalCodeSchema).min(1).max(32),
  }),
  z.strictObject({
    ...ResultBase,
    status: z.literal('CANCELLED'),
    reasonCodes: z.array(CanonicalCodeSchema).min(1).max(32),
  }),
]);

export type LocalSearchResultV1 = z.infer<typeof LocalSearchResultV1Schema>;

interface Fraction {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

const ONE: Fraction = { numerator: 1n, denominator: 1n };

function decimal(value: string): Fraction {
  const [whole = '0', fractional = ''] = value.split('.');
  return {
    numerator: BigInt(`${whole}${fractional}`),
    denominator: 10n ** BigInt(fractional.length),
  };
}

function add(left: Fraction, right: Fraction): Fraction {
  return {
    numerator:
      left.numerator * right.denominator + right.numerator * left.denominator,
    denominator: left.denominator * right.denominator,
  };
}

function compare(left: Fraction, right: Fraction): number {
  const difference =
    left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function nutrientAmount(
  candidate: PlanningCandidateV1,
  nutrientId: string,
  unit: { system: string; code: string },
  edibleGrams: string,
): Fraction | null {
  const observation = candidate.nutrientsPer100EdibleGrams.find(
    (item) => item.nutrientId === nutrientId,
  );
  if (
    observation?.state !== 'known' ||
    observation.unit.system !== unit.system ||
    observation.unit.code !== unit.code
  )
    return null;
  const amount = decimal(observation.amount);
  const grams = decimal(edibleGrams);
  return {
    numerator: amount.numerator * grams.numerator,
    denominator: amount.denominator * grams.denominator * 100n,
  };
}

type Target = PlanningInputV1['targets'][number];

function recordedAmount(
  input: PlanningInputV1,
  target: Target,
): Fraction | null {
  const observation = input.recordedIntake.nutrients.find(
    (item) => item.nutrientId === target.nutrientId,
  );
  return observation?.state === 'known' &&
    observation.unit.system === target.unit.system &&
    observation.unit.code === target.unit.code
    ? decimal(observation.amount)
    : null;
}

function normalizedDistancePpm(total: Fraction, target: Fraction): number {
  const difference =
    total.numerator * target.denominator - target.numerator * total.denominator;
  const absolute = difference < 0n ? -difference : difference;
  const denominator =
    total.denominator *
    (compare(target, ONE) < 0 ? target.denominator : target.numerator);
  const partsPerMillion = (absolute * 1_000_000n) / denominator;
  return Number(partsPerMillion > 1_000_000n ? 1_000_000n : partsPerMillion);
}

interface SearchState {
  readonly selections: readonly {
    slotId: string;
    candidateId: string;
    portionId: string;
  }[];
  readonly hardTotals: readonly Fraction[];
  readonly softTotals: readonly (Fraction | null)[];
  readonly score: {
    supportedNutritionTargets: number;
    normalizedNutritionDistancePpm: number;
    pinnedSelections: number;
    favoredSelections: number;
    avoidedSelections: number;
    practicalFit: number;
    distinctSemanticKeys: number;
  };
  readonly semanticKeys: readonly string[];
  readonly tieKey: string;
}

function rank(left: SearchState, right: SearchState): number {
  const a = left.score;
  const b = right.score;
  return (
    b.supportedNutritionTargets - a.supportedNutritionTargets ||
    a.normalizedNutritionDistancePpm - b.normalizedNutritionDistancePpm ||
    b.pinnedSelections - a.pinnedSelections ||
    b.favoredSelections - a.favoredSelections ||
    a.avoidedSelections - b.avoidedSelections ||
    b.practicalFit - a.practicalFit ||
    b.distinctSemanticKeys - a.distinctSemanticKeys ||
    (left.tieKey < right.tieKey ? -1 : left.tieKey > right.tieKey ? 1 : 0)
  );
}

function practicalFit(
  input: PlanningInputV1,
  candidate: PlanningCandidateV1,
): number {
  let result = 0;
  const maxMinutes = input.preferences.maximumPreparationMinutes;
  if (maxMinutes !== undefined && candidate.preparationMinutes !== undefined)
    result += candidate.preparationMinutes <= maxMinutes ? 1 : -1;
  const maxPrice = input.preferences.maximumApproximatePriceUsd;
  if (maxPrice !== undefined && candidate.approximatePriceUsd !== undefined)
    result +=
      compare(decimal(candidate.approximatePriceUsd), decimal(maxPrice)) <= 0
        ? 1
        : -1;
  return result;
}

function restrictionStatus(
  input: PlanningInputV1,
  candidate: PlanningCandidateV1,
): 'eligible' | 'excluded' | 'unresolved' {
  const restrictions = input.restrictions;
  const reference = candidate.sourceReference;
  if (
    reference.kind === 'food' &&
    (restrictions.excludedFoodIds.includes(reference.foodId) ||
      restrictions.excludedIngredientIds.includes(reference.foodId))
  )
    return 'excluded';
  if (
    reference.kind === 'recipe' &&
    restrictions.excludedRecipeIds.includes(reference.recipeId)
  )
    return 'excluded';
  const declared =
    restrictions.excludedFoodIds.length +
      restrictions.excludedIngredientIds.length +
      restrictions.excludedAllergenCodes.length >
    0;
  if (declared && candidate.restrictionEvidence.state === 'unknown')
    return 'unresolved';
  if (
    candidate.restrictionEvidence.state === 'verified' &&
    (candidate.restrictionEvidence.ingredientIds.some(
      (id) =>
        restrictions.excludedFoodIds.includes(id) ||
        restrictions.excludedIngredientIds.includes(id),
    ) ||
      candidate.restrictionEvidence.allergenCodes.some((code) =>
        restrictions.excludedAllergenCodes.includes(code),
      ))
  )
    return 'excluded';
  return 'eligible';
}

export interface LocalSearchOptionsV1 {
  readonly signal?: AbortSignal;
  readonly clock?: () => number;
}

/** Returns a search draft only. Independent validation must precede a READY outcome. */
export function searchLocalPlanV1(
  raw: unknown,
  options: LocalSearchOptionsV1 = {},
): LocalSearchResultV1 {
  const input = PlanningInputV1Schema.parse(raw);
  const clock = options.clock ?? (() => performance.now());
  const started = clock();
  let expandedStates = 0;
  let beamPruned = false;
  const elapsed = (): number => Math.max(0, Math.floor(clock() - started));
  const result = (
    status: Exclude<LocalSearchResultV1['status'], 'DRAFT'>,
    termination: LocalSearchResultV1['trace']['termination'],
    reasonCode: string,
  ): LocalSearchResultV1 => {
    const base = {
      format: 'nutrixx.local-search-result',
      schemaVersion: 1,
      scoringPolicyVersion: FREE_SCORING_POLICY_VERSION_V1,
      status,
      trace: {
        termination,
        expandedStates,
        elapsedMilliseconds: elapsed(),
        beamPruned,
      },
      reasonCodes: [reasonCode],
    };
    return LocalSearchResultV1Schema.parse(
      status === 'INFEASIBLE'
        ? { ...base, proof: termination }
        : status === 'SEARCH_LIMIT'
          ? { ...base, limit: termination }
          : base,
    );
  };
  if (input.eligibility.status !== 'READY')
    return result(
      input.eligibility.status,
      'eligibility',
      input.eligibility.reasonCodes[0] ?? 'health-context-unavailable',
    );
  const openSlots = input.slots.filter((slot) => slot.state === 'open');
  if (openSlots.length === 0)
    return result('NEEDS_INPUT', 'eligibility', 'no-open-planning-slots');
  if (openSlots.some((slot) => slot.candidates.length === 0))
    return result('NEEDS_INPUT', 'eligibility', 'candidate-pool-empty');

  const hardTargets = input.targets.filter(
    (target) => target.hardLimitApproved,
  );
  if (
    hardTargets.some(
      (target) =>
        target.type !== 'UL' ||
        target.horizon !== 'daily-limit' ||
        target.value.kind !== 'point',
    )
  )
    return result('OUT_OF_SCOPE', 'eligibility', 'unsupported-hard-target');
  if (hardTargets.some((target) => target.sourceScope !== 'all-intake'))
    return result(
      'NEEDS_INPUT',
      'eligibility',
      'source-scoped-upper-limit-evidence-unavailable',
    );
  const hardBaseline = hardTargets.map((target) =>
    recordedAmount(input, target),
  );
  if (hardBaseline.some((amount) => amount === null))
    return result(
      'NEEDS_INPUT',
      'eligibility',
      'hard-limit-recorded-intake-unresolved',
    );
  if (
    hardTargets.some(
      (target, index) =>
        target.value.kind === 'point' &&
        compare(hardBaseline[index]!, decimal(target.value.amount)) > 0,
    )
  )
    return result(
      'INFEASIBLE',
      'direct-contradiction',
      'recorded-intake-exceeds-hard-limit',
    );

  const softTargets = input.targets.filter(
    (target) =>
      !target.hardLimitApproved &&
      target.sourceScope === 'all-intake' &&
      (target.type === 'RDA' ||
        target.type === 'AI' ||
        target.type === 'EAR') &&
      target.value.kind === 'point',
  );
  const softBaseline = softTargets.map((target) =>
    recordedAmount(input, target),
  );
  const limitations = new Set<string>();
  if (
    input.targets.some(
      (target) => !target.hardLimitApproved && !softTargets.includes(target),
    )
  )
    limitations.add('unsupported-soft-target');
  if (softBaseline.some((amount) => amount === null))
    limitations.add('soft-baseline-unresolved');
  let states: SearchState[] = [
    {
      selections: [],
      hardTotals: hardBaseline as Fraction[],
      softTotals: softBaseline,
      score: {
        supportedNutritionTargets: 0,
        normalizedNutritionDistancePpm: 0,
        pinnedSelections: 0,
        favoredSelections: 0,
        avoidedSelections: 0,
        practicalFit: 0,
        distinctSemanticKeys: 0,
      },
      semanticKeys: [],
      tieKey: '',
    },
  ];
  let unresolvedHardEvidence = false;
  let unresolvedRestrictionEvidence = false;
  for (const slot of openSlots) {
    const next: SearchState[] = [];
    for (const state of states) {
      for (const candidate of slot.candidates) {
        const restriction = restrictionStatus(input, candidate);
        if (restriction !== 'eligible') {
          if (restriction === 'unresolved')
            unresolvedRestrictionEvidence = true;
          continue;
        }
        for (const portion of candidate.portions) {
          if (options.signal?.aborted)
            return result('CANCELLED', 'cancelled', 'search-cancelled');
          if (elapsed() >= FREE_SEARCH_PROFILE_V1.workerWatchdogMilliseconds)
            return result(
              'SEARCH_LIMIT',
              'watchdog',
              'search-watchdog-reached',
            );
          if (expandedStates >= FREE_SEARCH_PROFILE_V1.expansionLimit)
            return result(
              'SEARCH_LIMIT',
              'expansion-limit',
              'search-expansion-limit-reached',
            );
          expandedStates += 1;
          const hardTotals: Fraction[] = [];
          let blocked = false;
          for (const [index, target] of hardTargets.entries()) {
            const contribution = nutrientAmount(
              candidate,
              target.nutrientId,
              target.unit,
              portion.edibleGrams,
            );
            if (contribution === null) {
              unresolvedHardEvidence = true;
              blocked = true;
              break;
            }
            const total = add(state.hardTotals[index]!, contribution);
            if (
              target.value.kind !== 'point' ||
              compare(total, decimal(target.value.amount)) > 0
            ) {
              blocked = true;
              break;
            }
            hardTotals.push(total);
          }
          if (blocked) continue;
          const softTotals = softTargets.map((target, index) => {
            const previous = state.softTotals[index];
            const contribution = nutrientAmount(
              candidate,
              target.nutrientId,
              target.unit,
              portion.edibleGrams,
            );
            if (previous == null || contribution === null) return null;
            return add(previous, contribution);
          });
          const supportedNutritionTargets = softTotals.filter(
            (amount) => amount !== null,
          ).length;
          const normalizedNutritionDistancePpm = softTotals.reduce<number>(
            (sum, amount, index) =>
              amount === null || softTargets[index]?.value.kind !== 'point'
                ? sum
                : sum +
                  normalizedDistancePpm(
                    amount,
                    decimal(softTargets[index].value.amount),
                  ),
            0,
          );
          const semanticKeys = [...state.semanticKeys, candidate.semanticKey];
          next.push({
            selections: [
              ...state.selections,
              {
                slotId: slot.slotId,
                candidateId: candidate.candidateId,
                portionId: portion.portionId,
              },
            ],
            hardTotals,
            softTotals,
            score: {
              supportedNutritionTargets,
              normalizedNutritionDistancePpm,
              pinnedSelections:
                state.score.pinnedSelections + Number(candidate.pinnedByUser),
              favoredSelections:
                state.score.favoredSelections +
                Number(
                  input.preferences.favoredSemanticKeys.includes(
                    candidate.semanticKey,
                  ),
                ),
              avoidedSelections:
                state.score.avoidedSelections +
                Number(
                  input.preferences.avoidedSemanticKeys.includes(
                    candidate.semanticKey,
                  ),
                ),
              practicalFit:
                state.score.practicalFit + practicalFit(input, candidate),
              distinctSemanticKeys: new Set(semanticKeys).size,
            },
            semanticKeys,
            tieKey: `${state.tieKey}|${candidate.semanticKey}:${portion.portionId}`,
          });
        }
      }
    }
    if (next.length === 0) {
      if (unresolvedHardEvidence || unresolvedRestrictionEvidence)
        return result(
          'NEEDS_INPUT',
          'eligibility',
          unresolvedHardEvidence
            ? 'hard-limit-composition-unresolved'
            : 'restriction-evidence-unresolved',
        );
      if (beamPruned)
        return result(
          'SEARCH_LIMIT',
          'beam-pruning',
          'beam-pruning-prevents-infeasibility-proof',
        );
      return result(
        'INFEASIBLE',
        'finite-exhaustion',
        'candidate-space-exhausted',
      );
    }
    next.sort(rank);
    if (next.length > FREE_SEARCH_PROFILE_V1.beamWidth) beamPruned = true;
    states = next.slice(0, FREE_SEARCH_PROFILE_V1.beamWidth);
  }
  const winner = states[0]!;
  if (winner.softTotals.some((amount) => amount === null))
    limitations.add('soft-target-composition-unresolved');
  return LocalSearchResultV1Schema.parse({
    format: 'nutrixx.local-search-result',
    schemaVersion: 1,
    scoringPolicyVersion: FREE_SCORING_POLICY_VERSION_V1,
    status: 'DRAFT',
    optimalityGap: null,
    selections: winner.selections,
    score: winner.score,
    limitationCodes: [...limitations].sort(),
    trace: {
      termination: 'draft',
      expandedStates,
      elapsedMilliseconds: elapsed(),
      beamPruned,
    },
  });
}
