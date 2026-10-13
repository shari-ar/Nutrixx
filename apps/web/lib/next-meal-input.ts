import {
  nutritionPeriodAtV1,
  resolveFoodComponentV1,
} from '@nutrixx/nutrition-engine';
import {
  NextMealTemporalPolicyReleaseV1Schema,
  NextMealRankingRequestSchema,
  assessNextMealTemporalHistoryV1,
  type NextMealAppliedTemporalRuleV1,
  type NextMealRankingRequest,
  type NextMealTemporalPolicyReleaseV1,
} from '@nutrixx/optimizer-engine';

import type { BrowserNutritionSnapshotV1 } from './browser-nutrition-state';
import type { FoodChoice } from './browser-stage-two';
import type { NextMealCatalogSnapshot } from './next-meal-catalog';

export const NEXT_MEAL_DAILY_BASELINE_POLICY_VERSION_V1 =
  'free-next-meal-daily-baseline-v1' as const;

export interface DeclaredInventoryItemV1 {
  readonly choice: FoodChoice;
  readonly edibleGrams: string;
}

export type NextMealInputResultV1 =
  | {
      readonly status: 'READY';
      readonly request: NextMealRankingRequest;
      readonly temporalPolicy: NextMealTemporalPolicyReleaseV1;
      readonly appliedTemporalRules: readonly NextMealAppliedTemporalRuleV1[];
    }
  | { readonly status: 'NEEDS_INPUT'; readonly reasonCodes: readonly string[] };

interface Context {
  readonly catalog: NextMealCatalogSnapshot;
  readonly nutrition: BrowserNutritionSnapshotV1;
  readonly foodRestrictions: readonly string[];
  readonly inventory: readonly DeclaredInventoryItemV1[] | null;
  readonly now: string;
  readonly trackingStartedAt: string;
  readonly temporalPolicy?: NextMealTemporalPolicyReleaseV1;
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

type NutrientState =
  BrowserNutritionSnapshotV1['window']['current']['nutrients'][number];
type ReadyTarget = Extract<NutrientState['target'], { status: 'READY' }>;

function populationKey(target: ReadyTarget): string {
  const group = target.rule.population;
  return `adult-${group.minimumAgeYears}-${group.maximumAgeYears}-${group.physiologicalReference}-${group.lifeStage}`;
}

function dailyBaselinePolicy(
  targets: readonly NutrientState[],
): NextMealTemporalPolicyReleaseV1 {
  const ready = targets.flatMap((item) =>
    item.target.status === 'READY' ? [item.target] : [],
  );
  return NextMealTemporalPolicyReleaseV1Schema.parse({
    schemaVersion: 1,
    releaseId: NEXT_MEAL_DAILY_BASELINE_POLICY_VERSION_V1,
    policyVersion: NEXT_MEAL_DAILY_BASELINE_POLICY_VERSION_V1,
    effectiveAt: ready.map((target) => target.rule.effectiveFrom).sort()[0],
    intakeCompletenessAssumption: 'user-logs-all-consumption',
    unrecordedIntakeTreatment: 'unknown-no-imputation',
    physiologicalStatusClaim: 'none',
    rules: ready.map((target) => {
      const rule = target.rule;
      const citation = {
        ...rule.source,
        relevantSection: `Daily-average ${rule.type} reference`,
      };
      return {
        ruleId: rule.ruleId.toLowerCase(),
        ruleVersion: NEXT_MEAL_DAILY_BASELINE_POLICY_VERSION_V1,
        nutrientId: rule.nutrientId,
        populationKey: populationKey(target),
        reference: {
          type: rule.type.toLowerCase(),
          releaseId: target.releaseId,
          ruleId: rule.ruleId.toLowerCase(),
          citation,
        },
        unit: rule.unit,
        sourceScope: rule.sourceScope,
        window: { basis: 'nutrition-day', periodCount: 1 },
        aggregation: 'sum',
        minimumKnownMeals: 0,
        earlyHistoryTreatment: 'provisional-comparison',
        horizonCitation: citation,
        intendedUse: 'next-meal-dietary-planning',
        limitations:
          'Current nutrition-day comparison; additional lookback requires a separately sourced temporal rule.',
      };
    }),
  });
}

function previousPeriodStart(
  context: Context,
  periodCount: number,
): string | null {
  let start = context.nutrition.window.current.period.startsAt;
  for (let index = 1; index < periodCount; index += 1) {
    const previous = nutritionPeriodAtV1(
      context.nutrition.dayPolicy,
      new Date(Date.parse(start) - 1).toISOString(),
    );
    if (previous.travelAdjusted) return null;
    start = previous.startsAt;
  }
  return start;
}

function representedNutritionDays(context: Context, start: string): number {
  let count = 1;
  let before = context.nutrition.window.current.period.startsAt;
  while (Date.parse(before) > Date.parse(start)) {
    const previous = nutritionPeriodAtV1(
      context.nutrition.dayPolicy,
      new Date(Date.parse(before) - 1).toISOString(),
    );
    if (previous.travelAdjusted) return 0;
    count += 1;
    before = previous.startsAt;
  }
  return count;
}

function multiplyDecimal(value: string, factor: number): string {
  const [whole = '0', fraction = ''] = value.split('.');
  const scale = BigInt(`1${'0'.repeat(fraction.length)}`);
  const product = BigInt(`${whole}${fraction}`) * BigInt(factor);
  const integer = product / scale;
  const remainder = (product % scale)
    .toString()
    .padStart(fraction.length, '0')
    .replace(/0+$/, '');
  return remainder ? `${integer}.${remainder}` : integer.toString();
}

/** Builds one frozen recommendation input from recorded meals and cited rules. */
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
  const eligibleTargets = day.nutrients
    .filter(
      (item) =>
        item.target.status === 'READY' &&
        item.target.rule.value.kind === 'point' &&
        item.target.rule.sourceScope === 'all-intake' &&
        item.target.rule.unit.system === 'ucum' &&
        item.target.rule.unit.code === item.unit &&
        (coverage.get(`${item.nutrientId}:${item.unit}`) ?? 0) > 0,
    )
    .sort(
      (a, b) =>
        (coverage.get(`${b.nutrientId}:${b.unit}`) ?? 0) -
          (coverage.get(`${a.nutrientId}:${a.unit}`) ?? 0) ||
        a.nutrientId.localeCompare(b.nutrientId),
    );
  if (eligibleTargets.length === 0)
    return {
      status: 'NEEDS_INPUT',
      reasonCodes: ['comparable-nutrient-evidence-required'],
    };
  const temporalPolicy = NextMealTemporalPolicyReleaseV1Schema.parse(
    context.temporalPolicy ?? dailyBaselinePolicy(eligibleTargets),
  );
  if (Date.parse(temporalPolicy.effectiveAt) > Date.parse(context.now))
    return {
      status: 'NEEDS_INPUT',
      reasonCodes: ['temporal-policy-not-effective'],
    };
  const targetsByRule = new Map(
    eligibleTargets.flatMap((item) =>
      item.target.status === 'READY'
        ? [[item.target.rule.ruleId.toLowerCase(), item] as const]
        : [],
    ),
  );
  const trackingStartedAt = context.nutrition.meals.reduce(
    (earliest, meal) =>
      meal.state === 'recorded' && meal.occurredAt < earliest
        ? meal.occurredAt
        : earliest,
    context.trackingStartedAt,
  );
  const selected = temporalPolicy.rules.flatMap((policyRule) => {
    const item = targetsByRule.get(policyRule.reference.ruleId);
    if (item?.target.status !== 'READY') return [];
    const target = item.target;
    if (
      policyRule.nutrientId !== item.nutrientId ||
      policyRule.reference.releaseId !== target.releaseId ||
      policyRule.reference.type !== target.rule.type.toLowerCase() ||
      policyRule.populationKey !== populationKey(target) ||
      policyRule.unit.system !== target.rule.unit.system ||
      policyRule.unit.code !== target.rule.unit.code ||
      policyRule.sourceScope !== target.rule.sourceScope ||
      policyRule.reference.citation.url !== target.rule.source.url
    )
      return [];
    const configuredStart =
      policyRule.window.basis === 'elapsed-time'
        ? new Date(
            Date.parse(context.now) -
              policyRule.window.durationHours * 3_600_000,
          ).toISOString()
        : previousPeriodStart(context, policyRule.window.periodCount);
    if (configuredStart === null) return [];
    const end =
      policyRule.window.basis === 'elapsed-time'
        ? new Date(Date.parse(context.now) + 1).toISOString()
        : day.period.endsAt;
    const effectiveStart =
      trackingStartedAt > configuredStart ? trackingStartedAt : configuredStart;
    const meals = context.nutrition.meals.filter(
      (meal) =>
        meal.state === 'recorded' &&
        meal.occurredAt >= effectiveStart &&
        meal.occurredAt < context.now,
    );
    const knownMealCount = meals.filter(
      (meal) =>
        observationFor(meal, item.nutrientId, item.unit).state === 'known',
    ).length;
    const decision = assessNextMealTemporalHistoryV1(policyRule, {
      windowStartInclusive: configuredStart,
      windowEndExclusive: end,
      trackingStartedAt,
      knownMealCount,
      unresolvedMealCount: meals.length - knownMealCount,
    });
    if (
      decision !== 'FULL_HORIZON_AVAILABLE' &&
      decision !== 'PROVISIONAL_SHORT_HISTORY'
    )
      return [];
    const representedDays =
      policyRule.aggregation === 'mean-per-nutrition-day'
        ? representedNutritionDays(context, effectiveStart)
        : 1;
    if (representedDays === 0) return [];
    return [
      {
        item,
        policyRule,
        decision,
        configuredStart,
        effectiveStart,
        end,
        representedDays,
      },
    ];
  });
  if (selected.length === 0)
    return {
      status: 'NEEDS_INPUT',
      reasonCodes: ['comparable-nutrient-evidence-required'],
    };
  const selectedKeys = new Set<string>();
  for (const { item } of selected) {
    const key = `${item.nutrientId}:${item.unit}`;
    if (selectedKeys.has(key))
      throw new TypeError('An active nutrient needs one temporal rule.');
    selectedKeys.add(key);
  }
  const recorded = context.nutrition.meals.filter(
    (meal) =>
      meal.state === 'recorded' &&
      selected.some(
        (rule) =>
          meal.occurredAt >= rule.effectiveStart &&
          meal.occurredAt < context.now,
      ),
  );
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
      comparisonNutrients: selected.map(({ item }) => ({
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
      nutrients: selected.map(({ item: target }) => {
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
    temporalRules: selected.map(
      ({ item, policyRule, effectiveStart, end, representedDays }) => {
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
          ruleId: policyRule.ruleId,
          ruleVersion: policyRule.ruleVersion,
          nutrientId: item.nutrientId,
          unit: target.rule.unit,
          sourceScope: 'all-intake',
          timeBasis:
            policyRule.window.basis === 'elapsed-time'
              ? 'elapsed-time'
              : 'nutrition-day',
          windowStartInclusive: effectiveStart,
          windowEndExclusive: end,
          coverage: {
            state: 'complete',
            source: {
              kind: 'calculation',
              sourceId: 'accepted-meal-ledger',
              sourceVersion: temporalPolicy.policyVersion,
            },
          },
          target: {
            amount:
              policyRule.aggregation === 'mean-per-nutrition-day'
                ? multiplyDecimal(value.amount, representedDays)
                : value.amount,
            mode: 'minimum',
            referenceType: policyRule.reference.type,
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
      },
    ),
  });
  return {
    status: 'READY',
    request,
    temporalPolicy,
    appliedTemporalRules: selected.map(
      ({ policyRule, decision, configuredStart, effectiveStart, end }) => ({
        ruleId: policyRule.ruleId,
        decision,
        configuredWindowStartInclusive: configuredStart,
        appliedWindowStartInclusive: effectiveStart,
        windowEndExclusive: end,
      }),
    ),
  };
}
