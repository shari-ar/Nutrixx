import {
  MealRevisionV1Schema,
  type MealRevisionV1,
} from '@nutrixx/consumption';

import type { HealthContextSnapshotV1 } from './health-context.js';
import {
  NUTRIENT_CROSSWALK_V1,
  resolveNutrientConceptV1,
} from './nutrient-crosswalk.js';
import type { NutritionPeriodV1 } from './nutrition-period.js';
import {
  selectTargetV1,
  type TargetPolicyReleaseV1,
  type TargetSelectionV1,
} from './target-policy.js';

export const NUTRITION_STATE_RULE_VERSION_V1 = 'recorded-intake-v1' as const;

type ComparisonV1 =
  | 'recorded-below-reference'
  | 'recorded-at-or-above-reference'
  | 'recorded-above-upper-limit'
  | 'recorded-at-or-below-upper-limit-in-available-data'
  | 'indeterminate';

export interface NutrientIntakeStateV1 {
  readonly nutrientId: string;
  readonly unit: string;
  readonly knownRecordedSubtotal: string;
  readonly evidence: 'known-for-recorded-meals' | 'incomplete';
  readonly contributingMeals: readonly {
    readonly mealId: string;
    readonly revision: number;
    readonly amount: string;
  }[];
  readonly missingMealIds: readonly string[];
  readonly missingItemIds: readonly string[];
  readonly target: TargetSelectionV1;
  readonly comparison: ComparisonV1;
  readonly upperLimit: TargetSelectionV1;
  readonly upperLimitComparison: ComparisonV1;
  readonly energyShareTarget: TargetSelectionV1;
  readonly energyShareComparison: 'indeterminate';
  readonly limitationCodes: readonly string[];
}

export interface DailyNutritionStateV1 {
  readonly ruleVersion: typeof NUTRITION_STATE_RULE_VERSION_V1;
  readonly ownerSubjectId: string;
  readonly period: NutritionPeriodV1;
  readonly calculatedAt: string;
  readonly status: 'COMPLETE' | 'PARTIAL' | 'NEEDS_INPUT' | 'OUT_OF_SCOPE';
  readonly recordedMealCount: number;
  readonly mealRevisions: readonly {
    readonly mealId: string;
    readonly revision: number;
    readonly recordedAt: string;
  }[];
  readonly targetReleaseId: string;
  readonly healthContextRevision: number;
  readonly nutrients: readonly NutrientIntakeStateV1[];
  readonly limitationCodes: readonly string[];
}

export interface RollingNutritionStateV1 {
  readonly ruleVersion: typeof NUTRITION_STATE_RULE_VERSION_V1;
  readonly ownerSubjectId: string;
  readonly completedPeriodIds: readonly string[];
  readonly status: 'COMPLETE' | 'PARTIAL' | 'NEEDS_INPUT' | 'OUT_OF_SCOPE';
  readonly trends: readonly {
    readonly nutrientId: string;
    readonly targetPolicyKey: string;
    readonly meanKnownRecordedPerObservedDay: string | null;
    readonly unit: string;
    readonly comparableDayCount: number;
    readonly excludedDayCount: number;
  }[];
}

function decimalParts(value: string): [bigint, number] {
  if (!/^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/.test(value)) {
    throw new TypeError(
      'Nutrient amounts must be canonical nonnegative decimals.',
    );
  }
  const [whole = '', fraction = ''] = value.split('.');
  return [BigInt(`${whole}${fraction}`), fraction.length];
}

function canonicalDecimal(value: bigint, scale: number): string {
  if (value === 0n) return '0';
  const digits = value.toString().padStart(scale + 1, '0');
  if (scale === 0) return digits;
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

function sumDecimals(values: readonly string[]): string {
  const parsed = values.map(decimalParts);
  const scale = Math.max(0, ...parsed.map(([, places]) => places));
  return canonicalDecimal(
    parsed.reduce(
      (sum, [amount, places]) => sum + amount * 10n ** BigInt(scale - places),
      0n,
    ),
    scale,
  );
}

function compareDecimals(left: string, right: string): number {
  const [leftAmount, leftScale] = decimalParts(left);
  const [rightAmount, rightScale] = decimalParts(right);
  const scale = Math.max(leftScale, rightScale);
  const a = leftAmount * 10n ** BigInt(scale - leftScale);
  const b = rightAmount * 10n ** BigInt(scale - rightScale);
  return a < b ? -1 : a > b ? 1 : 0;
}

function meanDecimals(values: readonly string[]): string {
  const [amount, scale] = decimalParts(sumDecimals(values));
  const precision = Math.max(scale, 6);
  const scaled = amount * 10n ** BigInt(precision - scale);
  const divisor = BigInt(values.length);
  return canonicalDecimal((scaled + divisor / 2n) / divisor, precision);
}

function comparisonFor(
  knownSubtotal: string,
  incomplete: boolean,
  target: TargetSelectionV1,
  travelAdjusted: boolean,
  unit: string,
): ComparisonV1 {
  if (
    travelAdjusted ||
    target.status !== 'READY' ||
    target.rule.sourceScope !== 'all-intake' ||
    target.rule.unit.code !== unit ||
    target.rule.type === 'AMDR' ||
    target.rule.type === 'EAR'
  ) {
    return 'indeterminate';
  }
  if (target.rule.value.kind !== 'point') return 'indeterminate';
  const relation = compareDecimals(knownSubtotal, target.rule.value.amount);
  if (target.rule.type === 'UL') {
    if (relation > 0) return 'recorded-above-upper-limit';
    return incomplete
      ? 'indeterminate'
      : 'recorded-at-or-below-upper-limit-in-available-data';
  }
  if (relation >= 0) return 'recorded-at-or-above-reference';
  return incomplete ? 'indeterminate' : 'recorded-below-reference';
}

export function calculateDailyNutritionStateV1(options: {
  readonly ownerSubjectId: string;
  readonly period: NutritionPeriodV1;
  readonly meals: readonly MealRevisionV1[];
  readonly context: HealthContextSnapshotV1;
  readonly release: TargetPolicyReleaseV1;
  readonly marketCode?: string | undefined;
  readonly calculatedAt: string;
}): DailyNutritionStateV1 {
  const { period, context, release } = options;
  if (context.profileRevision < 1 || context.profileId.length === 0) {
    throw new TypeError('A dated health context is required.');
  }
  const start = Date.parse(period.startsAt);
  const end = Date.parse(period.endsAt);
  if (start >= end) {
    throw new TypeError('A nutrition period requires positive duration.');
  }
  const meals = options.meals
    .map((meal) => MealRevisionV1Schema.parse(meal))
    .filter(
      (meal) =>
        meal.state === 'recorded' &&
        Date.parse(meal.occurredAt) >= start &&
        Date.parse(meal.occurredAt) < end,
    );
  if (
    meals.some((meal) => meal.ownerSubjectId !== options.ownerSubjectId) ||
    new Set(meals.map((meal) => meal.mealId)).size !== meals.length
  ) {
    throw new TypeError(
      'Current meal revisions must have one owner and identity.',
    );
  }
  const nutrients: NutrientIntakeStateV1[] = NUTRIENT_CROSSWALK_V1.map(
    (concept) => {
      const contributingMeals: NutrientIntakeStateV1['contributingMeals'][number][] =
        [];
      const missingMealIds: string[] = [];
      const missingItemIds = new Set<string>();
      for (const meal of meals) {
        const matches = (meal.nutrition ?? []).filter(
          (value) =>
            value.nutrientId === concept.nutrientId ||
            value.nutrientId === `source.usda-fdc.${concept.usdaFdcNutrientId}`,
        );
        const value = matches[0];
        if (matches.length !== 1 || value === undefined) {
          missingMealIds.push(meal.mealId);
          for (const item of meal.items) missingItemIds.add(item.itemId);
          continue;
        }
        if (value.state === 'incomplete' && value.unit === undefined) {
          missingMealIds.push(meal.mealId);
          for (const itemId of value.missingItemIds) missingItemIds.add(itemId);
          continue;
        }
        if (
          value.unit?.system !== 'ucum' ||
          value.unit.code !== concept.observationUnit ||
          resolveNutrientConceptV1(value.nutrientId, value.unit.code) !==
            concept.nutrientId
        ) {
          missingMealIds.push(meal.mealId);
          for (const item of meal.items) missingItemIds.add(item.itemId);
          continue;
        }
        if (value.state === 'incomplete') {
          missingMealIds.push(meal.mealId);
          for (const itemId of value.missingItemIds) missingItemIds.add(itemId);
        }
        const amount =
          value.state === 'known' ? value.amount : value.knownAmount;
        if (amount !== undefined) {
          contributingMeals.push({
            mealId: meal.mealId,
            revision: meal.revision,
            amount,
          });
        }
      }
      const incomplete = meals.length === 0 || missingMealIds.length > 0;
      const knownRecordedSubtotal = sumDecimals(
        contributingMeals.map((value) => value.amount),
      );
      const target = selectTargetV1({
        release,
        context,
        nutrientId: concept.nutrientId,
        query: 'intake-reference',
        ...(options.marketCode === undefined
          ? {}
          : { marketCode: options.marketCode }),
      });
      const comparison = comparisonFor(
        knownRecordedSubtotal,
        incomplete,
        target,
        period.travelAdjusted,
        concept.observationUnit,
      );
      const upperLimit = selectTargetV1({
        release,
        context,
        nutrientId: concept.nutrientId,
        query: 'UL',
        ...(options.marketCode === undefined
          ? {}
          : { marketCode: options.marketCode }),
      });
      const upperLimitComparison = comparisonFor(
        knownRecordedSubtotal,
        incomplete,
        upperLimit,
        period.travelAdjusted,
        concept.observationUnit,
      );
      const energyShareTarget = selectTargetV1({
        release,
        context,
        nutrientId: concept.nutrientId,
        query: 'AMDR',
        ...(options.marketCode === undefined
          ? {}
          : { marketCode: options.marketCode }),
      });
      const limitations = [
        ...(incomplete ? ['recorded-composition-incomplete'] : []),
        ...(period.travelAdjusted ? ['travel-period-comparison-withheld'] : []),
        ...(target.status === 'READY'
          ? []
          : ['target-unavailable-or-ambiguous']),
        ...(energyShareTarget.status === 'READY'
          ? ['energy-share-requires-validated-energy-attribution']
          : []),
      ];
      return {
        nutrientId: concept.nutrientId,
        unit: concept.observationUnit,
        knownRecordedSubtotal,
        evidence: incomplete ? 'incomplete' : 'known-for-recorded-meals',
        contributingMeals,
        missingMealIds,
        missingItemIds: [...missingItemIds],
        target,
        comparison,
        upperLimit,
        upperLimitComparison,
        energyShareTarget,
        energyShareComparison: 'indeterminate',
        limitationCodes: limitations,
      };
    },
  );
  const status =
    context.status === 'OUT_OF_SCOPE'
      ? 'OUT_OF_SCOPE'
      : context.status === 'NEEDS_INPUT' ||
          nutrients.some((nutrient) => nutrient.target.status === 'NEEDS_INPUT')
        ? 'NEEDS_INPUT'
        : meals.length === 0 ||
            period.travelAdjusted ||
            nutrients.some((nutrient) => nutrient.evidence === 'incomplete') ||
            nutrients.some((nutrient) => nutrient.target.status !== 'READY')
          ? 'PARTIAL'
          : 'COMPLETE';
  return {
    ruleVersion: NUTRITION_STATE_RULE_VERSION_V1,
    ownerSubjectId: options.ownerSubjectId,
    period,
    calculatedAt: options.calculatedAt,
    status,
    recordedMealCount: meals.length,
    mealRevisions: meals.map((meal) => ({
      mealId: meal.mealId,
      revision: meal.revision,
      recordedAt: meal.recordedAt,
    })),
    targetReleaseId: release.releaseId,
    healthContextRevision: context.profileRevision,
    nutrients,
    limitationCodes: [
      ...context.limitationCodes,
      ...(meals.length === 0 ? ['no-recorded-meals'] : []),
      ...(period.travelAdjusted ? ['travel-adjusted-period'] : []),
    ],
  };
}

export function calculateRollingNutritionStateV1(
  daily: readonly DailyNutritionStateV1[],
): RollingNutritionStateV1 {
  if (daily.length !== 7) {
    throw new TypeError('A rolling state requires seven completed periods.');
  }
  const owner = daily[0]?.ownerSubjectId;
  if (
    owner === undefined ||
    daily.some((day) => day.ownerSubjectId !== owner) ||
    new Set(daily.map((day) => day.period.periodId)).size !== 7 ||
    daily.some(
      (day, index) =>
        index > 0 && day.period.startsAt !== daily[index - 1]?.period.endsAt,
    )
  ) {
    throw new TypeError(
      'Rolling periods must be consecutive and share an owner.',
    );
  }
  const groups = new Map<
    string,
    { nutrientId: string; unit: string; policyKey: string; amounts: string[] }
  >();
  for (const day of daily) {
    for (const nutrient of day.nutrients) {
      const policyKey =
        nutrient.target.status === 'READY'
          ? `${nutrient.target.releaseId}:${nutrient.target.rule.ruleId}`
          : `${day.targetReleaseId}:${nutrient.target.status}:${nutrient.target.reason}`;
      const key = `${nutrient.nutrientId}:${policyKey}`;
      const group = groups.get(key) ?? {
        nutrientId: nutrient.nutrientId,
        unit: nutrient.unit,
        policyKey,
        amounts: [],
      };
      if (
        day.recordedMealCount > 0 &&
        !day.period.travelAdjusted &&
        nutrient.evidence === 'known-for-recorded-meals'
      ) {
        group.amounts.push(nutrient.knownRecordedSubtotal);
      }
      groups.set(key, group);
    }
  }
  const trends = [...groups.values()].map((group) => ({
    nutrientId: group.nutrientId,
    targetPolicyKey: group.policyKey,
    meanKnownRecordedPerObservedDay:
      group.amounts.length === 0 ? null : meanDecimals(group.amounts),
    unit: group.unit,
    comparableDayCount: group.amounts.length,
    excludedDayCount: 7 - group.amounts.length,
  }));
  return {
    ruleVersion: NUTRITION_STATE_RULE_VERSION_V1,
    ownerSubjectId: owner,
    completedPeriodIds: daily.map((day) => day.period.periodId),
    status: daily.some((day) => day.status === 'OUT_OF_SCOPE')
      ? 'OUT_OF_SCOPE'
      : daily.some((day) => day.status === 'NEEDS_INPUT')
        ? 'NEEDS_INPUT'
        : daily.every((day) => day.status === 'COMPLETE')
          ? 'COMPLETE'
          : 'PARTIAL',
    trends,
  };
}
