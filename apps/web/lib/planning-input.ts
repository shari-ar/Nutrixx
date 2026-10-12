import {
  FOOD_COMPONENTS_V1,
  HEALTH_CONTEXT_RULE_VERSION_V1,
  NUTRITION_STATE_RULE_VERSION_V2,
  assessHealthContextV1,
  calculateDailyNutritionStateV1,
  getAdultDriBaselineReleaseV1,
  nutritionPeriodAtV1,
  type NutritionDayPolicyV1,
} from '@nutrixx/nutrition-engine';
import {
  FREE_CANDIDATE_POLICY_VERSION_V1,
  FREE_SEARCH_PROFILE_V1,
  PlanningInputV1Schema,
  type CandidateSourceV1,
  type PlanningInputV1,
  type PlanningSourceReferenceV1,
} from '@nutrixx/optimizer-engine';

import type { FoodChoice } from './browser-stage-two';
import type { NutritionContextV1 } from './nutrition-context';
import type { MealRevisionV1 } from '@nutrixx/consumption';
import type { StartingProfileV1 } from '@nutrixx/user-context';

export interface PlanningContextV1 {
  readonly profile: StartingProfileV1;
  readonly dayPolicy: NutritionDayPolicyV1;
  readonly market: 'US' | 'CA' | null;
  readonly meals: readonly MealRevisionV1[];
  readonly activeCatalogRelease: string | null;
  readonly nutrition: NutritionContextV1;
  readonly choices: readonly FoodChoice[];
  readonly day: 'today' | 'tomorrow';
  readonly openSlotLabels: readonly string[];
  readonly now: string;
  readonly createId: () => string;
}

function canonicalAmount(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new TypeError('A positive, source-backed serving is required.');
  }
  const canonical = parsed.toString();
  if (canonical.includes('e')) {
    throw new TypeError('The serving size is outside the supported range.');
  }
  return canonical;
}

function sourceKey(reference: PlanningSourceReferenceV1): string {
  return reference.kind === 'food'
    ? `food:${reference.catalogReleaseId}:${reference.foodId}:${reference.foodRevision}`
    : `recipe:${reference.recipeId}:${reference.recipeVersion}`;
}

function candidateSource(
  choice: FoodChoice,
  slotId: string,
  nutrition: NutritionContextV1,
  createId: () => string,
): CandidateSourceV1 {
  const reference = choice.reference;
  const grams = canonicalAmount(choice.defaultGramWeight);
  const evidence = {
    kind:
      reference.kind === 'recipe' ||
      (reference.kind === 'food' &&
        reference.catalogReleaseId === 'user-recipe-v1')
        ? ('calculation' as const)
        : reference.kind === 'food' &&
            reference.catalogReleaseId === 'user-custom-v1'
          ? ('user' as const)
          : ('dataset' as const),
    sourceId: sourceKey(reference),
    sourceVersion: '1',
  };
  const nutrients = FOOD_COMPONENTS_V1.map((component) => {
    const possible = [
      component.componentId,
      ...component.usdaFdcNutrientIds.map((id) => `source.usda-fdc.${id}`),
    ];
    const resolved = possible
      .map((id) => nutrition.resolver.resolve(reference, id))
      .find(
        (value) =>
          value.state === 'known' &&
          value.unit.system === 'ucum' &&
          value.unit.code === component.unit,
      );
    return resolved?.state === 'known'
      ? {
          state: 'known' as const,
          nutrientId: component.componentId,
          amount: resolved.amountPer100Gram,
          unit: resolved.unit,
          source: evidence,
        }
      : {
          state: 'unknown' as const,
          nutrientId: component.componentId,
          reason: 'not-resolvable' as const,
        };
  });
  return {
    candidateId: createId(),
    semanticKey:
      `${reference.kind}.${reference.kind === 'food' ? reference.foodId : reference.recipeId}`.replaceAll(
        '-',
        '',
      ),
    displayNameSnapshot: choice.name,
    sourceReference: reference,
    baseServingGrams: grams,
    baseServingSource: evidence,
    portionBounds: {
      minimumEdibleGrams: canonicalAmount(String(Number(grams) / 2)),
      maximumEdibleGrams: canonicalAmount(String(Number(grams) * 2)),
      source: {
        kind: 'calculation',
        sourceId: 'free-serving-range-v1',
        sourceRecordId: slotId,
      },
    },
    nutrientsPer100EdibleGrams: nutrients,
    restrictionEvidence: {
      state: 'unknown',
      reasonCode: 'allergen-evidence-unavailable',
    },
    ...(choice.approximatePriceUsdPer100g
      ? { approximatePriceUsd: choice.approximatePriceUsdPer100g }
      : {}),
    pinnedByUser: true,
    available: true,
  };
}

export function buildPlanningRequestV1(context: PlanningContextV1) {
  if (context.profile.foodRestrictions.length > 0) {
    throw new TypeError(
      'The local catalog cannot verify the food restrictions in your profile. Review them before requesting a plan.',
    );
  }
  if (
    context.openSlotLabels.length < 1 ||
    context.openSlotLabels.length > 4 ||
    context.choices.length < 1 ||
    context.choices.length > 24
  ) {
    throw new TypeError('Choose one to four slots and one to 24 foods.');
  }
  const current = nutritionPeriodAtV1(context.dayPolicy, context.now);
  const period =
    context.day === 'today'
      ? current
      : nutritionPeriodAtV1(context.dayPolicy, current.endsAt);
  const recorded = context.meals
    .filter(
      (meal) =>
        meal.state === 'recorded' &&
        meal.occurredAt >= period.startsAt &&
        meal.occurredAt < period.endsAt,
    )
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  if (recorded.length + context.openSlotLabels.length > 4) {
    throw new TypeError(
      'This day already has too many recorded meals for the selected slots.',
    );
  }
  const health = assessHealthContextV1({
    profile: { ...context.profile, timeZone: period.timeZone },
    assessedAt: context.now,
  });
  const release = getAdultDriBaselineReleaseV1();
  const daily = calculateDailyNutritionStateV1({
    ownerSubjectId: context.profile.ownerSubjectId,
    period,
    meals: recorded,
    context: health,
    release,
    ...(context.market === null ? {} : { marketCode: context.market }),
    calculatedAt: context.now,
  });
  const targets = daily.nutrients.flatMap((nutrient) =>
    [nutrient.target, nutrient.upperLimit].flatMap((selection) =>
      selection.status === 'READY' &&
      (selection.rule.type !== 'UL' ||
        release.publication.status === 'reviewed')
        ? [
            {
              ruleId: selection.rule.ruleId,
              nutrientId: selection.rule.nutrientId,
              type: selection.rule.type,
              value: selection.rule.value,
              unit: selection.rule.unit,
              horizon: selection.rule.horizon,
              sourceScope: selection.rule.sourceScope,
              sourceReleaseId: selection.releaseId,
              hardLimitApproved:
                release.publication.status === 'reviewed' &&
                selection.rule.type === 'UL' &&
                selection.rule.sourceScope === 'all-intake',
            },
          ]
        : [],
    ),
  );
  const recordedIntake = daily.nutrients.map((nutrient) =>
    nutrient.missingMealIds.length === 0
      ? {
          state: 'known' as const,
          nutrientId: nutrient.nutrientId,
          amount: nutrient.knownRecordedSubtotal,
          unit: { system: 'ucum' as const, code: nutrient.unit },
          source: {
            kind: 'calculation' as const,
            sourceId: NUTRITION_STATE_RULE_VERSION_V2,
          },
        }
      : {
          state: 'unknown' as const,
          nutrientId: nutrient.nutrientId,
          reason: 'not-resolvable' as const,
        },
  );
  const slots = [
    ...recorded.map((meal, index) => ({
      state: 'recorded' as const,
      slotId: context.createId(),
      position: index + 1,
      label: meal.mealType,
      mealId: meal.mealId,
      mealRevision: meal.revision,
    })),
    ...context.openSlotLabels.map((label, index) => ({
      state: 'open' as const,
      slotId: context.createId(),
      position: recorded.length + index + 1,
      label: label.trim(),
      candidates: [],
    })),
  ];
  const baseInput: PlanningInputV1 = PlanningInputV1Schema.parse({
    format: 'nutrixx.local-planning-input',
    schemaVersion: 1,
    requestId: context.createId(),
    ownerSubjectId: context.profile.ownerSubjectId,
    capturedAt: context.now,
    capturedTimeZone: current.timeZone,
    day: period,
    eligibility: {
      status: health.status,
      healthRuleVersion: HEALTH_CONTEXT_RULE_VERSION_V1,
      profileId: context.profile.profileId,
      profileRevision: context.profile.revision,
      assessedAt: health.assessedAt,
      reasonCodes: health.status === 'READY' ? [] : health.neededInput,
    },
    restrictions: {
      sourceRecordId: context.profile.profileId,
      sourceRevision: context.profile.revision,
      excludedFoodIds: [],
      excludedRecipeIds: [],
      excludedIngredientIds: [],
      excludedAllergenCodes: [],
    },
    preferences: { favoredSemanticKeys: [], avoidedSemanticKeys: [] },
    recordedIntake: {
      nutritionSnapshotId: context.createId(),
      nutritionRuleVersion: NUTRITION_STATE_RULE_VERSION_V2,
      nutrients: recordedIntake,
    },
    targetPolicyVersion: release.policyVersion,
    candidatePolicyVersion: FREE_CANDIDATE_POLICY_VERSION_V1,
    targets,
    referenceReleases: [
      { component: 'target-policy', releaseId: release.releaseId },
      {
        component: 'nutrition-market',
        releaseId: context.market ?? 'unselected',
      },
      ...(context.activeCatalogRelease
        ? [
            {
              component: 'food-catalog',
              releaseId: context.activeCatalogRelease,
            },
          ]
        : []),
      ...(context.choices.some(
        (choice) =>
          choice.reference.kind === 'food' &&
          choice.reference.catalogReleaseId === 'user-custom-v1',
      )
        ? [{ component: 'user-custom-food', releaseId: 'user-custom-v1' }]
        : []),
      ...(context.choices.some(
        (choice) =>
          choice.reference.kind === 'food' &&
          choice.reference.catalogReleaseId === 'user-recipe-v1',
      )
        ? [{ component: 'user-recipe-output', releaseId: 'user-recipe-v1' }]
        : []),
    ],
    slots,
    searchProfile: FREE_SEARCH_PROFILE_V1,
  });
  const currentSources = Array.from(
    new Map(
      context.choices.map((choice) => [
        sourceKey(choice.reference),
        choice.reference,
      ]),
    ).values(),
  );
  return {
    format: 'nutrixx.local-candidate-pool' as const,
    schemaVersion: 1 as const,
    baseInput,
    currentSources,
    slotPools: slots.flatMap((slot) =>
      slot.state === 'open'
        ? [
            {
              slotId: slot.slotId,
              sources: context.choices.map((choice) =>
                candidateSource(
                  choice,
                  slot.slotId,
                  context.nutrition,
                  context.createId,
                ),
              ),
            },
          ]
        : [],
    ),
  };
}
