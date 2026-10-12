import * as z from 'zod';

import {
  CanonicalIdSchema,
  NonnegativeCanonicalDecimalSchema,
} from '@nutrixx/canonical-schema';

import {
  FREE_CANDIDATE_POLICY_VERSION_V1,
  FREE_SEARCH_PROFILE_V1,
  PlanningCandidateBaseV1Schema,
  PlanningInputV1Schema,
  PlanningPortionBoundsV1Schema,
  PlanningSourceReferenceV1Schema,
  type PlanningCandidateV1,
  type PlanningInputV1,
  type PlanningSourceReferenceV1,
} from './planning-contract.js';

export { FREE_CANDIDATE_POLICY_VERSION_V1 } from './planning-contract.js';

const PositiveGramsSchema = NonnegativeCanonicalDecimalSchema.max(64).refine(
  (value) => value !== '0',
  'Edible grams must be positive.',
);

export const CandidateSourceV1Schema = PlanningCandidateBaseV1Schema.omit({
  portions: true,
}).extend({
  available: z.boolean(),
  baseServingGrams: PositiveGramsSchema,
  portionBounds: PlanningPortionBoundsV1Schema.extend({
    minimumEdibleGrams: PositiveGramsSchema,
    maximumEdibleGrams: PositiveGramsSchema,
  }),
});

export const CandidatePoolRequestV1Schema = z
  .strictObject({
    format: z.literal('nutrixx.local-candidate-pool'),
    schemaVersion: z.literal(1),
    baseInput: PlanningInputV1Schema,
    currentSources: z.array(PlanningSourceReferenceV1Schema).max(2_000),
    slotPools: z
      .array(
        z.strictObject({
          slotId: CanonicalIdSchema,
          sources: z.array(CandidateSourceV1Schema).max(500),
        }),
      )
      .max(4),
  })
  .superRefine((request, context) => {
    const openSlots = request.baseInput.slots.filter(
      (slot) => slot.state === 'open',
    );
    const openIds = new Set(openSlots.map((slot) => slot.slotId));
    const poolIds = new Set<string>();
    const candidateIds = new Set<string>();
    for (const slot of openSlots) {
      if (slot.candidates.length > 0) {
        context.addIssue({
          code: 'custom',
          path: ['baseInput', 'slots'],
          message:
            'The base input contains open slots awaiting candidate preparation.',
        });
      }
    }
    for (const [poolIndex, pool] of request.slotPools.entries()) {
      if (!openIds.has(pool.slotId) || poolIds.has(pool.slotId)) {
        context.addIssue({
          code: 'custom',
          path: ['slotPools', poolIndex, 'slotId'],
          message: 'Each pool must identify one open slot.',
        });
      }
      poolIds.add(pool.slotId);
      const semanticKeys = new Set<string>();
      for (const [sourceIndex, source] of pool.sources.entries()) {
        if (
          candidateIds.has(source.candidateId) ||
          semanticKeys.has(source.semanticKey)
        ) {
          context.addIssue({
            code: 'custom',
            path: ['slotPools', poolIndex, 'sources', sourceIndex],
            message: 'Candidate IDs and per-slot semantic keys must be unique.',
          });
        }
        candidateIds.add(source.candidateId);
        semanticKeys.add(source.semanticKey);
        if (
          compareDecimal(
            source.portionBounds.minimumEdibleGrams,
            source.portionBounds.maximumEdibleGrams,
          ) > 0
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'slotPools',
              poolIndex,
              'sources',
              sourceIndex,
              'portionBounds',
            ],
            message: 'Portion bounds must be ordered.',
          });
        }
      }
    }
    if (poolIds.size !== openIds.size) {
      context.addIssue({
        code: 'custom',
        path: ['slotPools'],
        message: 'Every open slot requires one candidate pool.',
      });
    }
    if (
      new Set(request.currentSources.map(sourceIdentity)).size !==
      request.currentSources.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['currentSources'],
        message: 'Current source revisions must be unique.',
      });
    }
  });

export type CandidatePoolRequestV1 = z.infer<
  typeof CandidatePoolRequestV1Schema
>;
export type CandidateSourceV1 = z.infer<typeof CandidateSourceV1Schema>;

export interface CandidateDecisionV1 {
  readonly candidateId: string;
  readonly semanticKey: string;
  readonly disposition: 'selected' | 'eligible-not-selected' | 'excluded';
  readonly reasonCodes: readonly string[];
  readonly availablePortionIds: readonly string[];
  readonly softSignals?: {
    readonly matchedNutrientTargets: number;
    readonly missingNutrientTargets: readonly string[];
    readonly preference: 'favored' | 'neutral' | 'avoided';
    readonly preparation:
      | 'within-preference'
      | 'over-preference'
      | 'unknown'
      | 'unrestricted';
    readonly price:
      | 'within-preference'
      | 'over-preference'
      | 'unknown'
      | 'unrestricted';
  };
}

export interface CandidateSlotReportV1 {
  readonly slotId: string;
  readonly examined: number;
  readonly eligible: number;
  readonly selectedCandidateIds: readonly string[];
  readonly decisions: readonly CandidateDecisionV1[];
}

export interface CandidatePreparationV1 {
  readonly policyVersion: typeof FREE_CANDIDATE_POLICY_VERSION_V1;
  readonly status: 'READY' | 'NEEDS_INPUT' | 'OUT_OF_SCOPE';
  readonly reasonCodes: readonly string[];
  readonly slots: readonly CandidateSlotReportV1[];
  readonly preparedInput?: PlanningInputV1;
}

interface Fraction {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

function decimal(value: string): Fraction {
  const [whole = '0', fractional = ''] = value.split('.');
  return {
    numerator: BigInt(`${whole}${fractional}`),
    denominator: 10n ** BigInt(fractional.length),
  };
}

function compareFractions(left: Fraction, right: Fraction): number {
  const difference =
    left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function compareDecimal(left: string, right: string): number {
  return compareFractions(decimal(left), decimal(right));
}

function multiplyServing(
  base: string,
  numerator: bigint,
  denominator: bigint,
): string {
  const parsed = decimal(base);
  const value = parsed.numerator * numerator * (denominator === 2n ? 5n : 1n);
  const scale = parsed.denominator * (denominator === 2n ? 10n : 1n);
  const digits = scale.toString().length - 1;
  const padded = value.toString().padStart(digits + 1, '0');
  const result =
    digits === 0
      ? padded
      : `${padded.slice(0, -digits)}.${padded.slice(-digits)}`;
  return result.includes('.')
    ? result.replace(/0+$/u, '').replace(/\.$/u, '')
    : result;
}

const portionMultipliers = [
  { portionId: 'half', numerator: 1n, denominator: 2n },
  { portionId: 'base', numerator: 1n, denominator: 1n },
  { portionId: 'one-and-half', numerator: 3n, denominator: 2n },
  { portionId: 'double', numerator: 2n, denominator: 1n },
] as const;

function sourceKey(reference: PlanningSourceReferenceV1): string {
  return reference.kind === 'food'
    ? `food:${reference.catalogReleaseId}:${reference.foodId}:${reference.foodRevision}`
    : `recipe:${reference.recipeId}:${reference.recipeVersion}`;
}

function sourceIdentity(reference: PlanningSourceReferenceV1): string {
  return reference.kind === 'food'
    ? `food:${reference.foodId}`
    : `recipe:${reference.recipeId}`;
}

function localDate(instant: string, zone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(instant));
    const value = (type: string): string =>
      parts.find((part) => part.type === type)?.value ?? '';
    return `${value('year')}-${value('month')}-${value('day')}`;
  } catch {
    return null;
  }
}

function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function amountWithinLimit(
  recorded: string,
  per100Grams: string,
  grams: string,
  limit: string,
): boolean {
  const baseline = decimal(recorded);
  const composition = decimal(per100Grams);
  const portion = decimal(grams);
  const maximum = decimal(limit);
  const totalNumerator =
    baseline.numerator * composition.denominator * portion.denominator * 100n +
    composition.numerator * portion.numerator * baseline.denominator;
  const totalDenominator =
    baseline.denominator * composition.denominator * portion.denominator * 100n;
  return (
    compareFractions(
      { numerator: totalNumerator, denominator: totalDenominator },
      maximum,
    ) <= 0
  );
}

function sameUnit(
  left: { system: string; code: string },
  right: { system: string; code: string },
): boolean {
  return left.system === right.system && left.code === right.code;
}

function restrictionFailure(
  input: PlanningInputV1,
  source: CandidateSourceV1,
): string | null {
  const restrictions = input.restrictions;
  if (
    source.sourceReference.kind === 'food' &&
    (restrictions.excludedFoodIds.includes(source.sourceReference.foodId) ||
      restrictions.excludedIngredientIds.includes(
        source.sourceReference.foodId,
      ))
  )
    return 'excluded-food';
  if (
    source.sourceReference.kind === 'recipe' &&
    restrictions.excludedRecipeIds.includes(source.sourceReference.recipeId)
  )
    return 'excluded-recipe';
  const hasDeclaredRestrictions =
    restrictions.excludedFoodIds.length +
      restrictions.excludedIngredientIds.length +
      restrictions.excludedAllergenCodes.length >
    0;
  if (hasDeclaredRestrictions && source.restrictionEvidence.state === 'unknown')
    return 'restriction-evidence-unresolved';
  if (source.restrictionEvidence.state === 'verified') {
    if (
      source.restrictionEvidence.ingredientIds.some(
        (id) =>
          restrictions.excludedIngredientIds.includes(id) ||
          restrictions.excludedFoodIds.includes(id),
      )
    )
      return 'excluded-ingredient';
    if (
      source.restrictionEvidence.allergenCodes.some((code) =>
        restrictions.excludedAllergenCodes.includes(code),
      )
    )
      return 'excluded-allergen';
  }
  return null;
}

function softSignals(
  input: PlanningInputV1,
  source: CandidateSourceV1,
): NonNullable<CandidateDecisionV1['softSignals']> {
  const matched: string[] = [];
  const missing: string[] = [];
  for (const target of input.targets.filter(
    (rule) => !rule.hardLimitApproved,
  )) {
    const observation = source.nutrientsPer100EdibleGrams.find(
      (item) => item.nutrientId === target.nutrientId,
    );
    if (
      observation?.state === 'known' &&
      sameUnit(observation.unit, target.unit)
    )
      matched.push(target.ruleId);
    else missing.push(target.ruleId);
  }
  const preferences = input.preferences;
  const preparation =
    preferences.maximumPreparationMinutes === undefined
      ? 'unrestricted'
      : source.preparationMinutes === undefined
        ? 'unknown'
        : source.preparationMinutes <= preferences.maximumPreparationMinutes
          ? 'within-preference'
          : 'over-preference';
  const price =
    preferences.maximumApproximatePriceUsd === undefined
      ? 'unrestricted'
      : source.approximatePriceUsd === undefined
        ? 'unknown'
        : compareDecimal(
              source.approximatePriceUsd,
              preferences.maximumApproximatePriceUsd,
            ) <= 0
          ? 'within-preference'
          : 'over-preference';
  return {
    matchedNutrientTargets: matched.length,
    missingNutrientTargets: missing,
    preference: preferences.favoredSemanticKeys.includes(source.semanticKey)
      ? 'favored'
      : preferences.avoidedSemanticKeys.includes(source.semanticKey)
        ? 'avoided'
        : 'neutral',
    preparation,
    price,
  };
}

function rank(
  left: { source: CandidateSourceV1; decision: CandidateDecisionV1 },
  right: { source: CandidateSourceV1; decision: CandidateDecisionV1 },
): number {
  if (left.source.pinnedByUser !== right.source.pinnedByUser)
    return left.source.pinnedByUser ? -1 : 1;
  const a = left.decision.softSignals!;
  const b = right.decision.softSignals!;
  if (a.matchedNutrientTargets !== b.matchedNutrientTargets)
    return b.matchedNutrientTargets - a.matchedNutrientTargets;
  const preferenceOrder = { favored: 0, neutral: 1, avoided: 2 };
  if (a.preference !== b.preference)
    return preferenceOrder[a.preference] - preferenceOrder[b.preference];
  const practicalOrder = {
    'within-preference': 0,
    unrestricted: 1,
    unknown: 2,
    'over-preference': 3,
  };
  if (a.preparation !== b.preparation)
    return practicalOrder[a.preparation] - practicalOrder[b.preparation];
  if (a.price !== b.price)
    return practicalOrder[a.price] - practicalOrder[b.price];
  return left.source.semanticKey < right.source.semanticKey
    ? -1
    : left.source.semanticKey > right.source.semanticKey
      ? 1
      : 0;
}

export function prepareLocalCandidateSetV1(
  raw: unknown,
): CandidatePreparationV1 {
  const request = CandidatePoolRequestV1Schema.parse(raw);
  const input = request.baseInput;
  const empty = (
    status: 'NEEDS_INPUT' | 'OUT_OF_SCOPE',
    reasonCodes: string[],
  ): CandidatePreparationV1 => ({
    policyVersion: FREE_CANDIDATE_POLICY_VERSION_V1,
    status,
    reasonCodes,
    slots: [],
  });
  if (input.eligibility.status !== 'READY') {
    return empty(
      input.eligibility.status,
      input.eligibility.reasonCodes.length > 0
        ? input.eligibility.reasonCodes
        : ['health-context-unavailable'],
    );
  }
  const today = localDate(input.capturedAt, input.capturedTimeZone);
  if (today === null)
    return empty('OUT_OF_SCOPE', ['planning-zone-unavailable']);
  if (input.day.localDate !== today && input.day.localDate !== nextDate(today))
    return empty('OUT_OF_SCOPE', ['planning-day-out-of-range']);
  if (
    input.day.localDate === today &&
    (Date.parse(input.capturedAt) < Date.parse(input.day.startsAt) ||
      Date.parse(input.capturedAt) >= Date.parse(input.day.endsAt))
  )
    return empty('OUT_OF_SCOPE', ['planning-day-completed']);
  const hardLimits = input.targets.filter((target) => target.hardLimitApproved);
  if (
    hardLimits.some(
      (target) =>
        target.type !== 'UL' ||
        target.horizon !== 'daily-limit' ||
        target.value.kind !== 'point',
    )
  )
    return empty('OUT_OF_SCOPE', ['unsupported-hard-target']);
  if (hardLimits.some((target) => target.sourceScope !== 'all-intake'))
    return empty('NEEDS_INPUT', [
      'source-scoped-upper-limit-evidence-unavailable',
    ]);
  for (const target of hardLimits) {
    const recorded = input.recordedIntake.nutrients.find(
      (item) => item.nutrientId === target.nutrientId,
    );
    if (recorded?.state !== 'known' || !sameUnit(recorded.unit, target.unit))
      return empty('NEEDS_INPUT', ['hard-limit-recorded-intake-unresolved']);
  }
  const currentSources = new Set(request.currentSources.map(sourceKey));
  const releases = new Set(
    input.referenceReleases.map((release) => release.releaseId),
  );
  const selectedBySlot = new Map<string, PlanningCandidateV1[]>();
  const reports: CandidateSlotReportV1[] = [];
  const overallReasons = new Set<string>();
  for (const slot of input.slots) {
    if (slot.state === 'recorded') continue;
    const pool = request.slotPools.find((item) => item.slotId === slot.slotId)!;
    const eligible: {
      source: CandidateSourceV1;
      decision: CandidateDecisionV1;
      candidate: PlanningCandidateV1;
    }[] = [];
    const decisions: CandidateDecisionV1[] = [];
    for (const source of [...pool.sources].sort((a, b) =>
      a.semanticKey < b.semanticKey
        ? -1
        : a.semanticKey > b.semanticKey
          ? 1
          : 0,
    )) {
      const reasons: string[] = [];
      if (!source.available) reasons.push('source-unavailable');
      if (!currentSources.has(sourceKey(source.sourceReference)))
        reasons.push('source-revision-stale');
      if (
        source.sourceReference.kind === 'food' &&
        !releases.has(source.sourceReference.catalogReleaseId)
      )
        reasons.push('catalog-release-missing');
      const exclusion = restrictionFailure(input, source);
      if (exclusion) reasons.push(exclusion);
      let portions = portionMultipliers
        .map((multiplier) => ({
          portionId: multiplier.portionId,
          edibleGrams: multiplyServing(
            source.baseServingGrams,
            multiplier.numerator,
            multiplier.denominator,
          ),
        }))
        .filter(
          (portion) =>
            compareDecimal(
              portion.edibleGrams,
              source.portionBounds.minimumEdibleGrams,
            ) >= 0 &&
            compareDecimal(
              portion.edibleGrams,
              source.portionBounds.maximumEdibleGrams,
            ) <= 0,
        );
      if (portions.length === 0) reasons.push('portion-bounds-unresolved');
      if (reasons.length === 0) {
        for (const target of hardLimits) {
          const recorded = input.recordedIntake.nutrients.find(
            (item) => item.nutrientId === target.nutrientId,
          )!;
          const observed = source.nutrientsPer100EdibleGrams.find(
            (item) => item.nutrientId === target.nutrientId,
          );
          if (
            recorded.state !== 'known' ||
            observed?.state !== 'known' ||
            !sameUnit(observed.unit, target.unit) ||
            target.value.kind !== 'point'
          ) {
            reasons.push('hard-limit-composition-unresolved');
            portions = [];
            break;
          }
          const limitAmount = target.value.amount;
          portions = portions.filter((portion) =>
            amountWithinLimit(
              recorded.amount,
              observed.amount,
              portion.edibleGrams,
              limitAmount,
            ),
          );
          if (portions.length === 0) {
            reasons.push('hard-limit-exceeded');
            break;
          }
        }
      }
      const signals =
        reasons.length === 0 ? softSignals(input, source) : undefined;
      const decision: CandidateDecisionV1 = {
        candidateId: source.candidateId,
        semanticKey: source.semanticKey,
        disposition:
          reasons.length === 0 ? 'eligible-not-selected' : 'excluded',
        reasonCodes: reasons,
        availablePortionIds: portions.map((portion) => portion.portionId),
        ...(signals ? { softSignals: signals } : {}),
      };
      decisions.push(decision);
      if (reasons.length > 0) {
        for (const reason of reasons) overallReasons.add(reason);
      } else {
        const candidate = PlanningCandidateBaseV1Schema.parse({
          candidateId: source.candidateId,
          semanticKey: source.semanticKey,
          displayNameSnapshot: source.displayNameSnapshot,
          sourceReference: source.sourceReference,
          baseServingGrams: source.baseServingGrams,
          baseServingSource: source.baseServingSource,
          portionBounds: source.portionBounds,
          portions,
          nutrientsPer100EdibleGrams: source.nutrientsPer100EdibleGrams,
          restrictionEvidence: source.restrictionEvidence,
          ...(source.preparationMinutes !== undefined
            ? { preparationMinutes: source.preparationMinutes }
            : {}),
          ...(source.approximatePriceUsd !== undefined
            ? { approximatePriceUsd: source.approximatePriceUsd }
            : {}),
          pinnedByUser: source.pinnedByUser,
        });
        eligible.push({ source, decision, candidate });
      }
    }
    const pinnedCount = eligible.filter(
      (item) => item.source.pinnedByUser,
    ).length;
    if (pinnedCount > FREE_SEARCH_PROFILE_V1.candidateLimitPerSlot)
      overallReasons.add('too-many-pinned-candidates');
    const selected = [...eligible]
      .sort(rank)
      .slice(0, FREE_SEARCH_PROFILE_V1.candidateLimitPerSlot);
    const selectedIds = new Set(
      selected.map((item) => item.source.candidateId),
    );
    const sortedCandidates = selected
      .map((item) => item.candidate)
      .sort((a, b) =>
        a.semanticKey < b.semanticKey
          ? -1
          : a.semanticKey > b.semanticKey
            ? 1
            : 0,
      );
    selectedBySlot.set(slot.slotId, sortedCandidates);
    const finalizedDecisions = decisions.map(
      (decision): CandidateDecisionV1 =>
        selectedIds.has(decision.candidateId)
          ? { ...decision, disposition: 'selected' }
          : decision,
    );
    if (eligible.length === 0) overallReasons.add('no-eligible-candidates');
    reports.push({
      slotId: slot.slotId,
      examined: pool.sources.length,
      eligible: eligible.length,
      selectedCandidateIds: sortedCandidates.map((item) => item.candidateId),
      decisions: finalizedDecisions,
    });
  }
  if (
    overallReasons.has('too-many-pinned-candidates') ||
    overallReasons.has('no-eligible-candidates')
  ) {
    return {
      policyVersion: FREE_CANDIDATE_POLICY_VERSION_V1,
      status: 'NEEDS_INPUT',
      reasonCodes: [...overallReasons].sort(),
      slots: reports,
    };
  }
  const preparedInput = PlanningInputV1Schema.parse({
    ...input,
    slots: input.slots.map((slot) =>
      slot.state === 'open'
        ? { ...slot, candidates: selectedBySlot.get(slot.slotId)! }
        : slot,
    ),
  });
  return {
    policyVersion: FREE_CANDIDATE_POLICY_VERSION_V1,
    status: 'READY',
    reasonCodes: [...overallReasons].sort(),
    slots: reports,
    preparedInput,
  };
}
