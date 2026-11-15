import {
  findFoodComponentV1,
  type FoodComponentV1,
} from '@nutrixx/nutrition-engine';
import { nextMealSourceKey } from '@nutrixx/optimizer-engine';

import type { MealNutritionPresentationRowV1 } from './meal-nutrition-presentation';
import type { NextMealCatalogSnapshot } from './next-meal-catalog';

export const NUTRIENT_PROMINENCE_POLICY_VERSION_V1 =
  'nutrient-prominence-catalog-v1' as const;
export const NUTRIENT_PROMINENCE_SOURCE_V1 = {
  authority: 'U.S. Food and Drug Administration',
  title: 'Daily Value on the Nutrition and Supplement Facts Labels',
  url: 'https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels',
  highThresholdPercent: 20,
  meaningfulThresholdPercent: 10,
} as const;

type Direction = 'ENCOURAGE' | 'LIMIT' | 'REFERENCE' | 'UNSPECIFIED';

interface DailyValueV1 {
  readonly accessCode: string;
  readonly amount: number;
  readonly unit: FoodComponentV1['unit'];
  readonly direction: Direction;
}

const DAILY_VALUES: readonly DailyValueV1[] = [
  {
    accessCode: 'ENERC_KCAL',
    amount: 2_000,
    unit: 'kcal',
    direction: 'REFERENCE',
  },
  { accessCode: 'PROCNT', amount: 50, unit: 'g', direction: 'REFERENCE' },
  { accessCode: 'FAT', amount: 78, unit: 'g', direction: 'REFERENCE' },
  { accessCode: 'CHOCDF', amount: 275, unit: 'g', direction: 'REFERENCE' },
  { accessCode: 'FIBTG', amount: 28, unit: 'g', direction: 'ENCOURAGE' },
  { accessCode: 'CA', amount: 1_300, unit: 'mg', direction: 'ENCOURAGE' },
  { accessCode: 'FE', amount: 18, unit: 'mg', direction: 'ENCOURAGE' },
  { accessCode: 'MG', amount: 420, unit: 'mg', direction: 'ENCOURAGE' },
  { accessCode: 'P', amount: 1_250, unit: 'mg', direction: 'ENCOURAGE' },
  { accessCode: 'K', amount: 4_700, unit: 'mg', direction: 'ENCOURAGE' },
  { accessCode: 'ZN', amount: 11, unit: 'mg', direction: 'ENCOURAGE' },
  { accessCode: 'CU', amount: 0.9, unit: 'mg', direction: 'ENCOURAGE' },
  { accessCode: 'MN', amount: 2.3, unit: 'mg', direction: 'ENCOURAGE' },
  { accessCode: 'SE', amount: 55, unit: 'ug', direction: 'ENCOURAGE' },
  { accessCode: 'I', amount: 150, unit: 'ug', direction: 'ENCOURAGE' },
  { accessCode: 'CR', amount: 35, unit: 'ug', direction: 'ENCOURAGE' },
  { accessCode: 'MO', amount: 45, unit: 'ug', direction: 'ENCOURAGE' },
  { accessCode: 'CL', amount: 2_300, unit: 'mg', direction: 'ENCOURAGE' },
  { accessCode: 'VITA_RAE', amount: 900, unit: 'ug', direction: 'ENCOURAGE' },
  { accessCode: 'VITD', amount: 20, unit: 'ug', direction: 'ENCOURAGE' },
  { accessCode: 'TOCPHA', amount: 15, unit: 'mg', direction: 'ENCOURAGE' },
  { accessCode: 'VITK', amount: 120, unit: 'ug', direction: 'ENCOURAGE' },
  { accessCode: 'VITC', amount: 90, unit: 'mg', direction: 'ENCOURAGE' },
  { accessCode: 'THIA', amount: 1.2, unit: 'mg', direction: 'ENCOURAGE' },
  { accessCode: 'RIBF', amount: 1.3, unit: 'mg', direction: 'ENCOURAGE' },
  { accessCode: 'NIA', amount: 16, unit: 'mg', direction: 'ENCOURAGE' },
  { accessCode: 'VITB6A', amount: 1.7, unit: 'mg', direction: 'ENCOURAGE' },
  { accessCode: 'FOLDFE', amount: 400, unit: 'ug', direction: 'ENCOURAGE' },
  { accessCode: 'VITB12', amount: 2.4, unit: 'ug', direction: 'ENCOURAGE' },
  { accessCode: 'PANTAC', amount: 5, unit: 'mg', direction: 'ENCOURAGE' },
  { accessCode: 'BIOT', amount: 30, unit: 'ug', direction: 'ENCOURAGE' },
  { accessCode: 'CHOLN', amount: 550, unit: 'mg', direction: 'ENCOURAGE' },
  { accessCode: 'NA', amount: 2_300, unit: 'mg', direction: 'LIMIT' },
  { accessCode: 'FASAT', amount: 20, unit: 'g', direction: 'LIMIT' },
] as const;

const DAILY_VALUE_BY_ACCESS_CODE = new Map(
  DAILY_VALUES.map((value) => [value.accessCode, value]),
);

type NutrientHighlightLabelV1 =
  | 'Strong contribution'
  | 'Distinctive source'
  | 'Watch-out';

interface RankedNutrientFoodV1 {
  readonly candidateKey: string;
  readonly displayName: string;
  readonly amountPer100Grams: string;
  readonly unit: string;
  readonly percentDailyValuePer100Grams: number | null;
  readonly sourceId: string;
}

export interface NutrientProminenceEntryV1 {
  readonly componentId: string;
  readonly accessCode: string;
  readonly name: string;
  readonly unit: string;
  readonly direction: Direction;
  readonly dailyValueAmount: number | null;
  readonly knownFoodCount: number;
  readonly highSourceCount: number | null;
  readonly highSourceShare: number | null;
  readonly topFoods: readonly RankedNutrientFoodV1[];
}

export interface NutrientProminenceIndexV1 {
  readonly policyVersion: typeof NUTRIENT_PROMINENCE_POLICY_VERSION_V1;
  readonly source: typeof NUTRIENT_PROMINENCE_SOURCE_V1;
  readonly catalogEntryCount: number;
  readonly nutrients: readonly NutrientProminenceEntryV1[];
}

export interface MealSignatureNutrientV1 {
  readonly componentId: string;
  readonly accessCode: string;
  readonly slug: string;
  readonly name: string;
  readonly amount: string;
  readonly unit: string;
  readonly percentDailyValue: number;
  readonly label: NutrientHighlightLabelV1 | null;
  readonly basis: string;
}

export function nutrientSlugV1(
  componentId: string,
  accessCode: string,
): string {
  return componentId.startsWith('nutrient.')
    ? componentId.slice('nutrient.'.length)
    : accessCode.toLocaleLowerCase('en-US').replaceAll('_', '-');
}

function finiteAmount(value: string): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function buildNutrientProminenceIndexV1(
  catalog: NextMealCatalogSnapshot,
  topFoodLimit = 200,
): NutrientProminenceIndexV1 {
  const observations = new Map<string, RankedNutrientFoodV1[]>();
  for (const candidate of catalog.entries) {
    if (candidate.reference.kind !== 'food') continue;
    const candidateKey = nextMealSourceKey(candidate.reference);
    for (const nutrient of candidate.nutrientsPer100EdibleGrams) {
      if (nutrient.state !== 'known') continue;
      const component = findFoodComponentV1(nutrient.nutrientId);
      if (!component) continue;
      const amount = finiteAmount(nutrient.amountPer100EdibleGrams);
      if (amount === null || nutrient.unit.code !== component.unit) continue;
      const dailyValue = DAILY_VALUE_BY_ACCESS_CODE.get(component.accessCode);
      const percent = dailyValue ? (amount / dailyValue.amount) * 100 : null;
      observations.set(component.componentId, [
        ...(observations.get(component.componentId) ?? []),
        {
          candidateKey,
          displayName: candidate.displayName,
          amountPer100Grams: nutrient.amountPer100EdibleGrams,
          unit: nutrient.unit.code,
          percentDailyValuePer100Grams: percent,
          sourceId: nutrient.source.sourceId,
        },
      ]);
    }
  }

  const nutrients = Array.from(observations.entries()).flatMap(
    ([componentId, foods]) => {
      const component = findFoodComponentV1(componentId);
      if (!component) return [];
      const dailyValue = DAILY_VALUE_BY_ACCESS_CODE.get(component.accessCode);
      const ordered = [...foods].sort(
        (left, right) =>
          finiteAmount(right.amountPer100Grams)! -
            finiteAmount(left.amountPer100Grams)! ||
          left.displayName.localeCompare(right.displayName, 'en-US') ||
          left.candidateKey.localeCompare(right.candidateKey, 'en-US'),
      );
      const highSourceCount = dailyValue
        ? ordered.filter(
            (food) =>
              food.percentDailyValuePer100Grams !== null &&
              food.percentDailyValuePer100Grams >=
                NUTRIENT_PROMINENCE_SOURCE_V1.highThresholdPercent,
          ).length
        : null;
      return [
        {
          componentId,
          accessCode: component.accessCode,
          name: component.name,
          unit: component.unit,
          direction: dailyValue?.direction ?? 'UNSPECIFIED',
          dailyValueAmount: dailyValue?.amount ?? null,
          knownFoodCount: ordered.length,
          highSourceCount,
          highSourceShare:
            highSourceCount === null
              ? null
              : ordered.length === 0
                ? 0
                : highSourceCount / ordered.length,
          topFoods: (dailyValue
            ? ordered.filter(
                (food) =>
                  food.percentDailyValuePer100Grams !== null &&
                  food.percentDailyValuePer100Grams >=
                    NUTRIENT_PROMINENCE_SOURCE_V1.highThresholdPercent,
              )
            : ordered
          ).slice(0, topFoodLimit),
        },
      ];
    },
  );
  return {
    policyVersion: NUTRIENT_PROMINENCE_POLICY_VERSION_V1,
    source: NUTRIENT_PROMINENCE_SOURCE_V1,
    catalogEntryCount: catalog.entries.length,
    nutrients: nutrients.sort((left, right) =>
      left.componentId.localeCompare(right.componentId, 'en-US'),
    ),
  };
}

const FIXED_HIGHLIGHT_CODES = new Set([
  'ENERC_KCAL',
  'PROCNT',
  'CHOCDF',
  'FAT',
]);

export function selectMealSignatureNutrientsV1(
  rows: readonly MealNutritionPresentationRowV1[],
  index?: NutrientProminenceIndexV1,
): readonly MealSignatureNutrientV1[] {
  const indexByComponent = new Map(
    (index?.nutrients ?? []).map((entry) => [entry.componentId, entry]),
  );
  const candidates = rows.flatMap((row) => {
    if (row.state !== 'known' || row.amount === undefined) return [];
    if (FIXED_HIGHLIGHT_CODES.has(row.accessCode)) return [];
    const prominence = indexByComponent.get(row.componentId);
    const dailyValue = DAILY_VALUE_BY_ACCESS_CODE.get(row.accessCode);
    const amount = finiteAmount(row.amount);
    if (
      !dailyValue ||
      amount === null ||
      amount === 0 ||
      row.unit !== dailyValue.unit
    )
      return [];
    const percent = (amount / dailyValue.amount) * 100;
    const distinctive =
      dailyValue.direction === 'ENCOURAGE' &&
      percent >= NUTRIENT_PROMINENCE_SOURCE_V1.meaningfulThresholdPercent &&
      prominence?.highSourceShare !== null &&
      prominence?.highSourceShare !== undefined &&
      prominence.highSourceShare <= 0.05;
    const strong =
      dailyValue.direction === 'ENCOURAGE' &&
      percent >= NUTRIENT_PROMINENCE_SOURCE_V1.highThresholdPercent;
    const watchOut =
      dailyValue.direction === 'LIMIT' &&
      percent >= NUTRIENT_PROMINENCE_SOURCE_V1.highThresholdPercent;
    const scarcityWeight = Math.max(
      1,
      Math.log(
        ((prominence?.knownFoodCount ?? 0) + 1) /
          ((prominence?.highSourceCount ?? 0) + 1),
      ),
    );
    return [
      {
        componentId: row.componentId,
        accessCode: row.accessCode,
        slug: nutrientSlugV1(row.componentId, row.accessCode),
        name: row.name,
        amount: row.amount,
        unit: row.unit,
        percentDailyValue: percent,
        label: watchOut
          ? ('Watch-out' as const)
          : distinctive
            ? ('Distinctive source' as const)
            : strong
              ? ('Strong contribution' as const)
              : null,
        basis: `${percent.toFixed(1)}% of the FDA Daily Value in this recorded meal`,
        priority: watchOut ? 3 : distinctive ? 2 : strong ? 1 : 0,
        score: watchOut ? percent : percent * scarcityWeight,
      },
    ];
  });
  return candidates
    .sort(
      (left, right) =>
        right.priority - left.priority ||
        right.score - left.score ||
        left.componentId.localeCompare(right.componentId, 'en-US'),
    )
    .slice(0, 2)
    .map(({ priority: _priority, score: _score, ...candidate }) => candidate);
}

export function nutrientProminenceEntryV1(
  index: NutrientProminenceIndexV1,
  slug: string,
): NutrientProminenceEntryV1 | null {
  return (
    index.nutrients.find((entry) => {
      const component = findFoodComponentV1(entry.componentId);
      return (
        component &&
        nutrientSlugV1(component.componentId, component.accessCode) === slug
      );
    }) ?? null
  );
}
