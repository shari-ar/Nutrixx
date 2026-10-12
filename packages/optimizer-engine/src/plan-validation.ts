import * as z from 'zod';

import {
  CanonicalCodeSchema,
  CanonicalIdSchema,
  UtcInstantSchema,
} from '@nutrixx/canonical-schema';

import {
  PlanningInputV1Schema,
  PlanningOutcomeV1Schema,
  type PlanningCandidateV1,
  type PlanningInputV1,
  type PlanningOutcomeV1,
} from './planning-contract.js';
import {
  LocalSearchResultV1Schema,
  type LocalSearchResultV1,
} from './local-search.js';

export const FREE_VALIDATOR_VERSION_V1 =
  'free-independent-validator-v1' as const;
export const FREE_EXPLANATION_VERSION_V1 =
  'free-evidence-explanation-v1' as const;

export const PlanSelectionV1Schema = z.strictObject({
  slotId: CanonicalIdSchema,
  candidateId: CanonicalIdSchema,
  portionId: CanonicalCodeSchema,
});

export type PlanSelectionV1 = z.infer<typeof PlanSelectionV1Schema>;
type Unit = { system: string; code: string };
type Observation = PlanningCandidateV1['nutrientsPer100EdibleGrams'][number];

interface DecimalFraction {
  numerator: bigint;
  denominator: bigint;
}

function fraction(value: string): DecimalFraction {
  const [whole = '0', fractional = ''] = value.split('.');
  return {
    numerator: BigInt(`${whole}${fractional}`),
    denominator: 10n ** BigInt(fractional.length),
  };
}

function sum(left: DecimalFraction, right: DecimalFraction): DecimalFraction {
  return {
    numerator:
      left.numerator * right.denominator + right.numerator * left.denominator,
    denominator: left.denominator * right.denominator,
  };
}

function compare(left: DecimalFraction, right: DecimalFraction): number {
  const difference =
    left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function absoluteDifference(left: string, right: string): string {
  const a = fraction(left);
  const b = fraction(right);
  const numerator = a.numerator * b.denominator - b.numerator * a.denominator;
  return decimalString({
    numerator: numerator < 0n ? -numerator : numerator,
    denominator: a.denominator * b.denominator,
  });
}

function decimalString(value: DecimalFraction): string {
  if (value.denominator === 1n) return value.numerator.toString();
  const places = value.denominator.toString().length - 1;
  const padded = value.numerator.toString().padStart(places + 1, '0');
  return `${padded.slice(0, -places)}.${padded.slice(-places)}`
    .replace(/0+$/u, '')
    .replace(/\.$/u, '');
}

function sameUnit(left: Unit, right: Unit): boolean {
  return left.system === right.system && left.code === right.code;
}

function localDate(instant: string, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(instant));
    const part = (type: string) =>
      parts.find((item) => item.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    return null;
  }
}

function restrictionIssue(
  input: PlanningInputV1,
  candidate: PlanningCandidateV1,
): string | null {
  const excluded = input.restrictions;
  const source = candidate.sourceReference;
  if (
    source.kind === 'food' &&
    (excluded.excludedFoodIds.includes(source.foodId) ||
      excluded.excludedIngredientIds.includes(source.foodId))
  )
    return 'excluded-food';
  if (
    source.kind === 'recipe' &&
    excluded.excludedRecipeIds.includes(source.recipeId)
  )
    return 'excluded-recipe';
  const needsIngredientEvidence =
    excluded.excludedFoodIds.length +
      excluded.excludedIngredientIds.length +
      excluded.excludedAllergenCodes.length >
    0;
  if (
    needsIngredientEvidence &&
    candidate.restrictionEvidence.state === 'unknown'
  )
    return 'restriction-evidence-unresolved';
  if (candidate.restrictionEvidence.state === 'verified') {
    if (
      candidate.restrictionEvidence.ingredientIds.some(
        (id) =>
          excluded.excludedFoodIds.includes(id) ||
          excluded.excludedIngredientIds.includes(id),
      )
    )
      return 'excluded-ingredient';
    if (
      candidate.restrictionEvidence.allergenCodes.some((code) =>
        excluded.excludedAllergenCodes.includes(code),
      )
    )
      return 'excluded-allergen';
  }
  return null;
}

interface ChosenPortion {
  readonly selection: PlanSelectionV1;
  readonly candidate: PlanningCandidateV1;
  readonly edibleGrams: string;
}

export interface ValidationIssueV1 {
  readonly code: string;
  readonly slotId?: string;
  readonly ruleId?: string;
}

export interface ValidatedNutrientV1 {
  readonly nutrientId: string;
  readonly state: 'known' | 'unknown';
  readonly unit?: Unit;
  readonly totalAmount?: string;
  readonly evidence: readonly {
    readonly origin: 'recorded' | 'candidate';
    readonly recordId: string;
    readonly amount: string;
    readonly source: Observation extends infer T
      ? T extends { state: 'known'; source: infer S }
        ? S
        : never
      : never;
  }[];
}

export interface ValidatedHardLimitV1 {
  readonly ruleId: string;
  readonly nutrientId: string;
  readonly sourceReleaseId: string;
  readonly unit: Unit;
  readonly maximumAmount: string;
  readonly observedAmount?: string;
  readonly status: 'within-limit' | 'exceeded' | 'unresolved';
}

export interface LocalPlanValidationV1 {
  readonly format: 'nutrixx.local-plan-validation';
  readonly schemaVersion: 1;
  readonly validatorVersion: typeof FREE_VALIDATOR_VERSION_V1;
  readonly status: 'passed' | 'rejected';
  readonly issues: readonly ValidationIssueV1[];
  readonly selections: readonly PlanSelectionV1[];
  readonly nutrients: readonly ValidatedNutrientV1[];
  readonly hardLimits: readonly ValidatedHardLimitV1[];
}

function nutrientTotals(
  input: PlanningInputV1,
  chosen: readonly ChosenPortion[],
): ValidatedNutrientV1[] {
  const nutrientIds = new Set([
    ...input.recordedIntake.nutrients.map((item) => item.nutrientId),
    ...input.targets.map((target) => target.nutrientId),
    ...chosen.flatMap((item) =>
      item.candidate.nutrientsPer100EdibleGrams.map(
        (observation) => observation.nutrientId,
      ),
    ),
  ]);
  return [...nutrientIds].sort().map((nutrientId) => {
    const recorded = input.recordedIntake.nutrients.find(
      (item) => item.nutrientId === nutrientId,
    );
    const evidence: ValidatedNutrientV1['evidence'][number][] = [];
    let unit: Unit | undefined;
    let total: DecimalFraction = { numerator: 0n, denominator: 1n };
    let complete = recorded?.state === 'known';
    if (recorded?.state === 'known') {
      unit = recorded.unit;
      total = fraction(recorded.amount);
      evidence.push({
        origin: 'recorded',
        recordId: input.recordedIntake.nutritionSnapshotId,
        amount: recorded.amount,
        source: recorded.source,
      });
    }
    for (const item of chosen) {
      const observation = item.candidate.nutrientsPer100EdibleGrams.find(
        (value) => value.nutrientId === nutrientId,
      );
      if (observation?.state !== 'known') {
        complete = false;
        continue;
      }
      if (unit !== undefined && !sameUnit(unit, observation.unit)) {
        complete = false;
        continue;
      }
      unit ??= observation.unit;
      const amount = fraction(observation.amount);
      const grams = fraction(item.edibleGrams);
      const contribution = {
        numerator: amount.numerator * grams.numerator,
        denominator: amount.denominator * grams.denominator * 100n,
      };
      total = sum(total, contribution);
      evidence.push({
        origin: 'candidate',
        recordId: item.candidate.candidateId,
        amount: decimalString(contribution),
        source: observation.source,
      });
    }
    return complete && unit !== undefined
      ? {
          nutrientId,
          state: 'known',
          unit,
          totalAmount: decimalString(total),
          evidence,
        }
      : { nutrientId, state: 'unknown', evidence };
  });
}

/** Recomputes constraints independently from the search score and search trace. */
function validateParsedLocalPlanV1(
  input: PlanningInputV1,
  rawSelections: unknown,
): LocalPlanValidationV1 {
  const parsed = z.array(PlanSelectionV1Schema).max(4).safeParse(rawSelections);
  const selections = parsed.success ? parsed.data : [];
  const issues: ValidationIssueV1[] = [];
  if (!parsed.success) issues.push({ code: 'invalid-selections' });
  if (input.eligibility.status !== 'READY')
    issues.push({ code: 'health-context-ineligible' });
  const today = localDate(input.capturedAt, input.capturedTimeZone);
  const tomorrow = today
    ? new Date(Date.parse(`${today}T00:00:00.000Z`) + 86_400_000)
        .toISOString()
        .slice(0, 10)
    : null;
  if (
    today === null ||
    (input.day.localDate !== today && input.day.localDate !== tomorrow) ||
    (input.day.localDate === today &&
      (Date.parse(input.capturedAt) < Date.parse(input.day.startsAt) ||
        Date.parse(input.capturedAt) >= Date.parse(input.day.endsAt)))
  )
    issues.push({ code: 'planning-day-ineligible' });

  const openSlots = input.slots.filter((slot) => slot.state === 'open');
  if (openSlots.length === 0) issues.push({ code: 'no-open-planning-slots' });
  if (selections.length !== openSlots.length)
    issues.push({ code: 'open-slot-coverage-mismatch' });
  const chosen: ChosenPortion[] = [];
  for (const [index, slot] of openSlots.entries()) {
    const selection = selections[index];
    if (selection?.slotId !== slot.slotId) {
      issues.push({ code: 'slot-selection-mismatch', slotId: slot.slotId });
      continue;
    }
    const candidate = slot.candidates.find(
      (item) => item.candidateId === selection.candidateId,
    );
    const portion = candidate?.portions.find(
      (item) => item.portionId === selection.portionId,
    );
    if (!candidate || !portion) {
      issues.push({
        code: 'candidate-or-portion-unresolved',
        slotId: slot.slotId,
      });
      continue;
    }
    chosen.push({ selection, candidate, edibleGrams: portion.edibleGrams });
    const restriction = restrictionIssue(input, candidate);
    if (restriction) issues.push({ code: restriction, slotId: slot.slotId });
    if (
      candidate.sourceReference.kind === 'food' &&
      input.referenceReleases.find(
        (release) => release.component === 'food-catalog',
      )?.releaseId !== candidate.sourceReference.catalogReleaseId
    )
      issues.push({ code: 'catalog-release-mismatch', slotId: slot.slotId });
  }
  const nutrients = nutrientTotals(input, chosen);
  const hardLimits: ValidatedHardLimitV1[] = [];
  for (const target of input.targets) {
    if (
      !input.referenceReleases.some(
        (release) => release.releaseId === target.sourceReleaseId,
      )
    )
      issues.push({ code: 'target-release-mismatch', ruleId: target.ruleId });
  }
  for (const target of input.targets.filter((item) => item.hardLimitApproved)) {
    if (
      target.type !== 'UL' ||
      target.horizon !== 'daily-limit' ||
      target.sourceScope !== 'all-intake' ||
      target.value.kind !== 'point'
    ) {
      issues.push({ code: 'unsupported-hard-target', ruleId: target.ruleId });
      continue;
    }
    const observation = nutrients.find(
      (item) => item.nutrientId === target.nutrientId,
    );
    const resolved =
      observation?.state === 'known' &&
      observation.unit !== undefined &&
      observation.totalAmount !== undefined &&
      sameUnit(observation.unit, target.unit);
    const status = !resolved
      ? 'unresolved'
      : compare(
            fraction(observation.totalAmount!),
            fraction(target.value.amount),
          ) <= 0
        ? 'within-limit'
        : 'exceeded';
    hardLimits.push({
      ruleId: target.ruleId,
      nutrientId: target.nutrientId,
      sourceReleaseId: target.sourceReleaseId,
      unit: target.unit,
      maximumAmount: target.value.amount,
      ...(resolved ? { observedAmount: observation.totalAmount } : {}),
      status,
    });
    if (status !== 'within-limit')
      issues.push({
        code:
          status === 'exceeded'
            ? 'hard-upper-limit-exceeded'
            : 'hard-limit-evidence-unresolved',
        ruleId: target.ruleId,
      });
  }
  return {
    format: 'nutrixx.local-plan-validation',
    schemaVersion: 1,
    validatorVersion: FREE_VALIDATOR_VERSION_V1,
    status: issues.length === 0 ? 'passed' : 'rejected',
    issues,
    selections,
    nutrients,
    hardLimits,
  };
}

export function validateLocalPlanV1(
  rawInput: unknown,
  rawSelections: unknown,
): LocalPlanValidationV1 {
  return validateParsedLocalPlanV1(
    PlanningInputV1Schema.parse(rawInput),
    rawSelections,
  );
}

export interface ValidatedAlternativeV1 {
  readonly slotId: string;
  readonly replacement: PlanSelectionV1;
  readonly validation: LocalPlanValidationV1 & { status: 'passed' };
}

export function findValidatedAlternativesV1(
  rawInput: unknown,
  rawSelections: unknown,
  maximumPerSlot = 3,
): ValidatedAlternativeV1[] {
  const input = PlanningInputV1Schema.parse(rawInput);
  const primary = validateParsedLocalPlanV1(input, rawSelections);
  if (primary.status !== 'passed') return [];
  const perSlotLimit = Number.isFinite(maximumPerSlot)
    ? Math.min(3, Math.max(0, Math.floor(maximumPerSlot)))
    : 3;
  const alternatives: ValidatedAlternativeV1[] = [];
  for (const slot of input.slots) {
    if (slot.state !== 'open') continue;
    let accepted = 0;
    for (const candidate of slot.candidates) {
      for (const portion of candidate.portions) {
        if (accepted >= perSlotLimit) break;
        const replacement = {
          slotId: slot.slotId,
          candidateId: candidate.candidateId,
          portionId: portion.portionId,
        };
        const selections = primary.selections.map((selection) =>
          selection.slotId === slot.slotId ? replacement : selection,
        );
        if (
          primary.selections.some(
            (selection) =>
              selection.slotId === slot.slotId &&
              selection.candidateId === replacement.candidateId &&
              selection.portionId === replacement.portionId,
          )
        )
          continue;
        const validation = validateParsedLocalPlanV1(input, selections);
        if (validation.status === 'passed') {
          alternatives.push({
            slotId: slot.slotId,
            replacement,
            validation: validation as LocalPlanValidationV1 & {
              status: 'passed';
            },
          });
          accepted += 1;
        }
      }
      if (accepted >= perSlotLimit) break;
    }
  }
  return alternatives;
}

export interface LocalPlanExplanationV1 {
  readonly format: 'nutrixx.local-plan-explanation';
  readonly schemaVersion: 1;
  readonly explanationVersion: typeof FREE_EXPLANATION_VERSION_V1;
  readonly reasonCodes: readonly string[];
  readonly limitationCodes: readonly string[];
  readonly selectionReasons: readonly {
    readonly slotId: string;
    readonly candidateId: string;
    readonly reasonCodes: readonly string[];
  }[];
  readonly nutrientClaims: readonly {
    readonly ruleId: string;
    readonly nutrientId: string;
    readonly targetType: PlanningInputV1['targets'][number]['type'];
    readonly relation: 'below' | 'met' | 'above';
    readonly observedAmount: string;
    readonly targetAmount: string;
    readonly differenceAmount: string;
    readonly unit: Unit;
    readonly sourceReleaseId: string;
    readonly evidence: ValidatedNutrientV1['evidence'];
  }[];
  readonly alternativeTradeoffs: readonly {
    readonly slotId: string;
    readonly replacement: PlanSelectionV1;
    readonly nutrientDifferences: readonly {
      readonly nutrientId: string;
      readonly unit: Unit;
      readonly primaryAmount: string;
      readonly alternativeAmount: string;
      readonly differenceAmount: string;
    }[];
  }[];
}

export function explainValidatedLocalPlanV1(
  rawInput: unknown,
  validation: LocalPlanValidationV1,
  alternatives: readonly ValidatedAlternativeV1[],
  limitationCodes: readonly string[] = [],
): LocalPlanExplanationV1 {
  const input = PlanningInputV1Schema.parse(rawInput);
  if (validation.status !== 'passed')
    throw new TypeError('A passed validation is required for explanation.');
  const selectionReasons = validation.selections.map((selection) => {
    const slot = input.slots.find((item) => item.slotId === selection.slotId);
    const candidate =
      slot?.state === 'open'
        ? slot.candidates.find(
            (item) => item.candidateId === selection.candidateId,
          )
        : undefined;
    if (!candidate)
      throw new TypeError('Validated selection became unresolved.');
    const reasonCodes = ['eligible-candidate', 'portion-within-bounds'];
    if (candidate.pinnedByUser) reasonCodes.push('user-pinned');
    if (input.preferences.favoredSemanticKeys.includes(candidate.semanticKey))
      reasonCodes.push('user-favored');
    return {
      slotId: selection.slotId,
      candidateId: candidate.candidateId,
      reasonCodes,
    };
  });
  const nutrientClaims = input.targets.flatMap((target) => {
    if (target.value.kind !== 'point' || target.sourceScope !== 'all-intake')
      return [];
    const observed = validation.nutrients.find(
      (item) => item.nutrientId === target.nutrientId,
    );
    if (
      observed?.state !== 'known' ||
      observed.unit === undefined ||
      observed.totalAmount === undefined ||
      !sameUnit(observed.unit, target.unit)
    )
      return [];
    const comparison = compare(
      fraction(observed.totalAmount),
      fraction(target.value.amount),
    );
    return [
      {
        ruleId: target.ruleId,
        nutrientId: target.nutrientId,
        targetType: target.type,
        relation:
          comparison < 0
            ? ('below' as const)
            : comparison > 0
              ? ('above' as const)
              : ('met' as const),
        observedAmount: observed.totalAmount,
        targetAmount: target.value.amount,
        differenceAmount: absoluteDifference(
          observed.totalAmount,
          target.value.amount,
        ),
        unit: target.unit,
        sourceReleaseId: target.sourceReleaseId,
        evidence: observed.evidence,
      },
    ];
  });
  const alternativeTradeoffs = alternatives.map((alternative) => ({
    slotId: alternative.slotId,
    replacement: alternative.replacement,
    nutrientDifferences: validation.nutrients.flatMap((primary) => {
      const other = alternative.validation.nutrients.find(
        (item) => item.nutrientId === primary.nutrientId,
      );
      if (
        primary.state !== 'known' ||
        other?.state !== 'known' ||
        primary.unit === undefined ||
        other.unit === undefined ||
        primary.totalAmount === undefined ||
        other.totalAmount === undefined ||
        !sameUnit(primary.unit, other.unit)
      )
        return [];
      return [
        {
          nutrientId: primary.nutrientId,
          unit: primary.unit,
          primaryAmount: primary.totalAmount,
          alternativeAmount: other.totalAmount,
          differenceAmount: absoluteDifference(
            primary.totalAmount,
            other.totalAmount,
          ),
        },
      ];
    }),
  }));
  const limitations = new Set(limitationCodes);
  if (validation.nutrients.some((item) => item.state === 'unknown'))
    limitations.add('incomplete-nutrient-composition');
  return {
    format: 'nutrixx.local-plan-explanation',
    schemaVersion: 1,
    explanationVersion: FREE_EXPLANATION_VERSION_V1,
    reasonCodes: [
      'independently-validated',
      'approximate-search',
      'user-review-required',
    ],
    limitationCodes: [...limitations].sort(),
    selectionReasons,
    nutrientClaims,
    alternativeTradeoffs,
  };
}

/** Rechecks every numerical claim against the independently computed report. */
export function verifyLocalExplanationV1(
  rawInput: unknown,
  validation: LocalPlanValidationV1,
  alternatives: readonly ValidatedAlternativeV1[],
  explanation: LocalPlanExplanationV1,
): boolean {
  if (validation.status !== 'passed') return false;
  const input = PlanningInputV1Schema.parse(rawInput);
  const checkedPrimary = validateParsedLocalPlanV1(
    input,
    validation.selections,
  );
  if (
    checkedPrimary.status !== 'passed' ||
    JSON.stringify(checkedPrimary) !== JSON.stringify(validation)
  )
    return false;
  if (
    explanation.selectionReasons.length !== validation.selections.length ||
    explanation.alternativeTradeoffs.length !== alternatives.length ||
    explanation.explanationVersion !== FREE_EXPLANATION_VERSION_V1 ||
    explanation.reasonCodes.join(',') !==
      'independently-validated,approximate-search,user-review-required'
  )
    return false;
  const claimableTargets = input.targets.filter((target) => {
    const observed = validation.nutrients.find(
      (item) => item.nutrientId === target.nutrientId,
    );
    return (
      target.value.kind === 'point' &&
      target.sourceScope === 'all-intake' &&
      observed?.state === 'known' &&
      observed.unit !== undefined &&
      sameUnit(observed.unit, target.unit)
    );
  });
  if (
    explanation.nutrientClaims.length !== claimableTargets.length ||
    new Set(explanation.nutrientClaims.map((claim) => claim.ruleId)).size !==
      claimableTargets.length ||
    new Set(explanation.selectionReasons.map((reason) => reason.slotId))
      .size !== validation.selections.length
  )
    return false;
  for (const reason of explanation.selectionReasons) {
    const selection = validation.selections.find(
      (item) => item.slotId === reason.slotId,
    );
    const slot = input.slots.find((item) => item.slotId === reason.slotId);
    const candidate =
      slot?.state === 'open'
        ? slot.candidates.find(
            (item) => item.candidateId === reason.candidateId,
          )
        : undefined;
    if (
      !selection ||
      selection.candidateId !== reason.candidateId ||
      !candidate
    )
      return false;
    const expected = ['eligible-candidate', 'portion-within-bounds'];
    if (candidate.pinnedByUser) expected.push('user-pinned');
    if (input.preferences.favoredSemanticKeys.includes(candidate.semanticKey))
      expected.push('user-favored');
    if (reason.reasonCodes.join(',') !== expected.join(',')) return false;
  }
  for (const claim of explanation.nutrientClaims) {
    const target = input.targets.find((item) => item.ruleId === claim.ruleId);
    const observed = validation.nutrients.find(
      (item) => item.nutrientId === claim.nutrientId,
    );
    if (
      !target ||
      target.value.kind !== 'point' ||
      target.sourceScope !== 'all-intake' ||
      target.nutrientId !== claim.nutrientId ||
      target.type !== claim.targetType ||
      target.sourceReleaseId !== claim.sourceReleaseId ||
      !sameUnit(target.unit, claim.unit) ||
      observed?.state !== 'known' ||
      observed.totalAmount !== claim.observedAmount ||
      observed.unit === undefined ||
      !sameUnit(observed.unit, claim.unit) ||
      target.value.amount !== claim.targetAmount ||
      JSON.stringify(observed.evidence) !== JSON.stringify(claim.evidence) ||
      absoluteDifference(claim.observedAmount, claim.targetAmount) !==
        claim.differenceAmount
    )
      return false;
    const comparison = compare(
      fraction(claim.observedAmount),
      fraction(claim.targetAmount),
    );
    if (
      claim.relation !==
      (comparison < 0 ? 'below' : comparison > 0 ? 'above' : 'met')
    )
      return false;
  }
  for (const [index, tradeoff] of explanation.alternativeTradeoffs.entries()) {
    const alternative = alternatives[index];
    const rechecked = alternative
      ? validateParsedLocalPlanV1(input, alternative.validation.selections)
      : null;
    if (
      !alternative ||
      rechecked?.status !== 'passed' ||
      JSON.stringify(rechecked) !== JSON.stringify(alternative.validation) ||
      !rechecked.selections.some(
        (selection) =>
          selection.slotId === alternative.slotId &&
          selection.candidateId === alternative.replacement.candidateId &&
          selection.portionId === alternative.replacement.portionId,
      ) ||
      tradeoff.slotId !== alternative.slotId ||
      tradeoff.replacement.slotId !== alternative.replacement.slotId ||
      tradeoff.replacement.candidateId !==
        alternative.replacement.candidateId ||
      tradeoff.replacement.portionId !== alternative.replacement.portionId
    )
      return false;
    const comparableNutrients = validation.nutrients.filter((primary) => {
      const other = alternative.validation.nutrients.find(
        (item) => item.nutrientId === primary.nutrientId,
      );
      return (
        primary.state === 'known' &&
        other?.state === 'known' &&
        primary.unit !== undefined &&
        other.unit !== undefined &&
        sameUnit(primary.unit, other.unit)
      );
    });
    if (
      tradeoff.nutrientDifferences.length !== comparableNutrients.length ||
      new Set(tradeoff.nutrientDifferences.map((item) => item.nutrientId))
        .size !== comparableNutrients.length
    )
      return false;
    for (const difference of tradeoff.nutrientDifferences) {
      const primary = validation.nutrients.find(
        (item) => item.nutrientId === difference.nutrientId,
      );
      const other = alternative.validation.nutrients.find(
        (item) => item.nutrientId === difference.nutrientId,
      );
      const independentlyChecked = rechecked.nutrients.find(
        (item) => item.nutrientId === difference.nutrientId,
      );
      if (
        primary?.state !== 'known' ||
        other?.state !== 'known' ||
        independentlyChecked?.state !== 'known' ||
        primary.totalAmount !== difference.primaryAmount ||
        other.totalAmount !== difference.alternativeAmount ||
        independentlyChecked.totalAmount !== difference.alternativeAmount ||
        primary.unit === undefined ||
        other.unit === undefined ||
        !sameUnit(primary.unit, difference.unit) ||
        !sameUnit(other.unit, difference.unit) ||
        absoluteDifference(
          difference.primaryAmount,
          difference.alternativeAmount,
        ) !== difference.differenceAmount
      )
        return false;
    }
  }
  return true;
}

export type LocalPlanReviewV1 =
  | {
      readonly status: 'APPROVED';
      readonly outcome: PlanningOutcomeV1 & { status: 'READY' };
      readonly validation: LocalPlanValidationV1;
      readonly alternatives: readonly ValidatedAlternativeV1[];
      readonly explanation: LocalPlanExplanationV1;
    }
  | {
      readonly status: 'REJECTED';
      readonly reasonCodes: readonly string[];
      readonly validation?: LocalPlanValidationV1;
    };

export function reviewLocalSearchDraftV1(
  rawInput: unknown,
  rawSearch: unknown,
  validatedAt: string,
): LocalPlanReviewV1 {
  const input = PlanningInputV1Schema.parse(rawInput);
  const search: LocalSearchResultV1 =
    LocalSearchResultV1Schema.parse(rawSearch);
  if (search.status !== 'DRAFT' || search.trace.termination !== 'draft')
    return { status: 'REJECTED', reasonCodes: ['search-result-is-not-draft'] };
  const validation = validateParsedLocalPlanV1(input, search.selections);
  if (validation.status !== 'passed')
    return {
      status: 'REJECTED',
      reasonCodes: [
        ...new Set(validation.issues.map((issue) => issue.code)),
      ].sort(),
      validation,
    };
  const alternatives = findValidatedAlternativesV1(input, search.selections);
  const explanation = explainValidatedLocalPlanV1(
    input,
    validation,
    alternatives,
    search.limitationCodes,
  );
  if (!verifyLocalExplanationV1(input, validation, alternatives, explanation))
    return {
      status: 'REJECTED',
      reasonCodes: ['explanation-claim-mismatch'],
      validation,
    };
  const outcome = PlanningOutcomeV1Schema.parse({
    format: 'nutrixx.local-planning-outcome',
    schemaVersion: 1,
    status: 'READY',
    solverOutcome: 'FEASIBLE',
    optimalityGap: null,
    draft: { selections: search.selections },
    validation: {
      status: 'passed',
      validatorVersion: FREE_VALIDATOR_VERSION_V1,
      validatedAt: UtcInstantSchema.parse(validatedAt),
      reportCodes: [
        'selection-complete',
        'restrictions-verified',
        'hard-limits-verified',
      ],
    },
    limitationCodes: explanation.limitationCodes,
  });
  if (outcome.status !== 'READY')
    throw new TypeError('Expected a READY planning outcome.');
  return { status: 'APPROVED', outcome, validation, alternatives, explanation };
}
