import { resolveFoodComponentV1 } from '@nutrixx/nutrition-engine';
import {
  NextMealRankingRequestSchema,
  type NextMealRankingRequest,
} from '@nutrixx/optimizer-engine';

import type { BrowserNutritionSnapshotV1 } from './browser-nutrition-state';
import type { FoodChoice } from './browser-stage-two';
import type { NextMealCatalogSnapshot } from './next-meal-catalog';

export interface DeclaredInventoryItemV1 {
  readonly choice: FoodChoice;
  readonly edibleGrams: string;
}

export type NextMealInputResultV1 =
  | { readonly status: 'READY'; readonly request: NextMealRankingRequest }
  | { readonly status: 'NEEDS_INPUT'; readonly reasonCodes: readonly string[] };

interface Context {
  readonly catalog: NextMealCatalogSnapshot;
  readonly nutrition: BrowserNutritionSnapshotV1;
  readonly foodRestrictions: readonly string[];
  readonly inventory: readonly DeclaredInventoryItemV1[] | null;
  readonly now: string;
}

function sourceKey(reference: FoodChoice['reference']): string {
  return reference.kind === 'food'
    ? `food:${reference.catalogReleaseId}:${reference.foodId}:${reference.foodRevision}`
    : `recipe:${reference.recipeId}:${reference.recipeVersion}`;
}

function observationFor(
  meal: BrowserNutritionSnapshotV1['meals'][number],
  nutrientId: string,
  unit: string,
): { state: 'known'; amount: string } | { state: 'unknown' } {
  const matches = (meal.nutrition ?? []).filter(
    (observation) =>
      observation.unit?.system === 'ucum' &&
      observation.unit.code === unit &&
      resolveFoodComponentV1(observation.nutrientId, unit) === nutrientId,
  );
  const match = matches[0];
  return matches.length === 1 && match?.state === 'known'
    ? { state: 'known', amount: match.amount }
    : { state: 'unknown' };
}

/** Uses the published daily reference horizon; no nutrient residence-time assumptions. */
export function buildNextMealInputV1(context: Context): NextMealInputResultV1 {
  if (context.foodRestrictions.length > 0)
    return {
      status: 'NEEDS_INPUT',
      reasonCodes: ['unverified-food-restrictions'],
    };
  if (context.nutrition.market === null)
    return {
      status: 'NEEDS_INPUT',
      reasonCodes: ['nutrition-market-required'],
    };
  if (context.catalog.entries.length === 0)
    return { status: 'NEEDS_INPUT', reasonCodes: ['local-catalog-required'] };
  const day = context.nutrition.window.current;
  if (day.period.travelAdjusted)
    return {
      status: 'NEEDS_INPUT',
      reasonCodes: ['travel-day-reference-unavailable'],
    };
  const recorded = context.nutrition.meals.filter(
    (meal) =>
      meal.state === 'recorded' &&
      meal.occurredAt >= day.period.startsAt &&
      meal.occurredAt < context.now,
  );
  const coverage = new Map<string, number>();
  for (const entry of context.catalog.entries) {
    for (const observation of entry.nutrientsPer100EdibleGrams) {
      if (observation.state === 'known')
        coverage.set(
          `${observation.nutrientId}:${observation.unit.code}`,
          (coverage.get(`${observation.nutrientId}:${observation.unit.code}`) ??
            0) + 1,
        );
    }
  }
  const targets = day.nutrients
    .filter(
      (item) =>
        item.target.status === 'READY' &&
        item.target.rule.value.kind === 'point' &&
        item.target.rule.sourceScope === 'all-intake' &&
        item.target.rule.unit.system === 'ucum' &&
        item.target.rule.unit.code === item.unit &&
        (coverage.get(`${item.nutrientId}:${item.unit}`) ?? 0) > 0 &&
        recorded.every(
          (meal) =>
            observationFor(meal, item.nutrientId, item.unit).state === 'known',
        ),
    )
    .sort(
      (a, b) =>
        (coverage.get(`${b.nutrientId}:${b.unit}`) ?? 0) -
          (coverage.get(`${a.nutrientId}:${a.unit}`) ?? 0) ||
        a.nutrientId.localeCompare(b.nutrientId),
    )
    .slice(0, 5);
  if (targets.length === 0)
    return {
      status: 'NEEDS_INPUT',
      reasonCodes: ['comparable-nutrient-evidence-required'],
    };
  const inventory =
    context.inventory === null
      ? { mode: 'ALL_CATALOG' as const }
      : {
          mode: 'AVAILABLE_ONLY' as const,
          revision: 1,
          entries: context.inventory.map((item) => ({
            reference: item.choice.reference,
            edibleGrams: item.edibleGrams,
            preparationState: item.choice.preparationState,
          })),
        };
  const installedKeys = new Set(context.catalog.manifest.entryKeys);
  if (
    context.inventory?.some(
      (item) => !installedKeys.has(sourceKey(item.choice.reference)),
    )
  )
    return { status: 'NEEDS_INPUT', reasonCodes: ['inventory-source-changed'] };
  const request = NextMealRankingRequestSchema.parse({
    candidates: {
      requestedAt: context.now,
      manifest: context.catalog.manifest,
      entries: context.catalog.entries,
      exclusions: {
        foodIds: [],
        recipeIds: [],
        ingredientFoodIds: [],
        allergenCodes: [],
      },
      inventory,
      comparisonNutrients: targets.map((item) => ({
        nutrientId: item.nutrientId,
        unit: { system: 'ucum', code: item.unit },
      })),
      hardLimits: day.nutrients.flatMap((item) => {
        const selected = item.upperLimit;
        return selected.status === 'READY' &&
          selected.publicationStatus === 'reviewed' &&
          selected.rule.sourceScope === 'all-intake' &&
          selected.rule.value.kind === 'point' &&
          selected.rule.unit.code === item.unit
          ? [
              {
                ruleId: selected.rule.ruleId.toLowerCase(),
                nutrientId: item.nutrientId,
                unit: selected.rule.unit,
                maximum: selected.rule.value.amount,
                recordedIntake:
                  item.missingMealIds.length === 0
                    ? { state: 'known', amount: item.knownRecordedSubtotal }
                    : {
                        state: 'unknown',
                        reasonCode: 'recorded-intake-incomplete',
                      },
                sourceScope: 'all-intake',
              },
            ]
          : [];
      }),
    },
    acceptedMeals: recorded.map((meal) => ({
      mealId: meal.mealId,
      revision: meal.revision,
      consumedAt: meal.occurredAt,
      nutrients: targets.map((target) => {
        const observation = observationFor(
          meal,
          target.nutrientId,
          target.unit,
        );
        return observation.state === 'known'
          ? {
              state: 'known',
              nutrientId: target.nutrientId,
              amount: observation.amount,
              unit: { system: 'ucum', code: target.unit },
              source: {
                kind: 'calculation',
                sourceId: 'recorded-meal-nutrition',
                sourceVersion: String(meal.revision),
                sourceRecordId: meal.mealId,
              },
            }
          : {
              state: 'unknown',
              nutrientId: target.nutrientId,
              reasonCode: 'recorded-intake-incomplete',
            };
      }),
    })),
    temporalRules: targets.map((item) => {
      if (
        item.target.status !== 'READY' ||
        item.target.rule.value.kind !== 'point'
      )
        throw new TypeError('A selected comparison requires a point target.');
      const target = item.target;
      const value = target.rule.value;
      if (value.kind !== 'point')
        throw new TypeError('A point target is required.');
      return {
        ruleId: target.rule.ruleId.toLowerCase(),
        ruleVersion: target.policyVersion,
        nutrientId: item.nutrientId,
        unit: target.rule.unit,
        sourceScope: 'all-intake',
        timeBasis: 'nutrition-day',
        windowStartInclusive: day.period.startsAt,
        windowEndExclusive: day.period.endsAt,
        coverage: {
          state: 'complete',
          source: {
            kind: 'calculation',
            sourceId: 'accepted-meal-ledger',
            sourceVersion: '1',
          },
        },
        target: {
          amount: value.amount,
          mode: 'minimum',
          referenceType: target.rule.type.toLowerCase(),
          releaseId: target.releaseId,
          source: {
            kind: 'dataset',
            sourceId: target.rule.source.authority,
            sourceVersion: target.rule.source.edition,
            sourceRecordId: target.rule.ruleId,
          },
        },
        weight: 1,
      };
    }),
  });
  return { status: 'READY', request };
}
