import handbook from './usda-ah102-curated.json';
import tables from './usda-cooking-tables.json';

export { usdaFoodGroupFromCategory } from './usda-food-group';

export interface UsdaCookingFood {
  readonly name: string;
  readonly preparationState: string;
  readonly usdaFoodGroup?: string;
  readonly sourceNdbNumber?: string;
  readonly nutrients?: readonly {
    nutrientId: string;
    sourceNutrientNumber?: string;
  }[];
}

const rawDescription = /(?:^|[,; ]+)raw(?:$|[,; ])/i;

function primaryName(value: string): string {
  return value.split(',')[0]!.trim().toLocaleUpperCase('en-US');
}

function treatmentMatchesFoodDescription(
  foodName: string,
  description: string,
): boolean {
  const food = foodName.toLocaleUpperCase('en-US');
  const treatment = description.toLocaleUpperCase('en-US');
  if (/\bGROUND\b/.test(treatment) && !/\bGROUND\b/.test(food)) return false;
  if (/\bSLICES\b/.test(treatment) && !/\bSLIC(?:E|ES|ED)\b/.test(food))
    return false;
  if (/^LIVER\b/.test(treatment) && !/\bLIVER\b/.test(food)) return false;
  if (
    /^ORGAN MEATS/.test(treatment) &&
    !/\b(?:LIVER|HEART|KIDNEY|TONGUE|ORGAN)\b/.test(food)
  )
    return false;
  return true;
}

function eligible(food: UsdaCookingFood): boolean {
  return Boolean(
    food.usdaFoodGroup &&
      food.sourceNdbNumber &&
      (food.preparationState === 'raw' ||
        (food.preparationState === 'unspecified' &&
          rawDescription.test(food.name))),
  );
}

export function usdaRetentionOptions(food: UsdaCookingFood) {
  if (
    !eligible(food) ||
    !food.nutrients?.some((nutrient) => nutrient.sourceNutrientNumber)
  )
    return [];
  const name = primaryName(food.name);
  return tables.treatments.filter(
    (treatment) =>
      treatment.foodGroup === food.usdaFoodGroup &&
      primaryName(treatment.description) === name &&
      treatmentMatchesFoodDescription(food.name, treatment.description) &&
      food.nutrients?.some(
        (nutrient) =>
          nutrient.sourceNutrientNumber &&
          nutrient.sourceNutrientNumber in treatment.factors,
      ),
  );
}

export function usdaYieldOptions(food: UsdaCookingFood) {
  if (!eligible(food)) return [];
  return [
    ...tables.yields
      .filter(
        (row) =>
          row.foodGroup === food.usdaFoodGroup &&
          row.rawNdbNumber === food.sourceNdbNumber,
      )
      .map((row) => ({ ...row, source: 'meat-poultry-release-2' as const })),
    ...handbook.rows
      .filter(
        (row) =>
          row.foodGroup === food.usdaFoodGroup &&
          row.rawNdbNumbers.includes(food.sourceNdbNumber!),
      )
      .map((row) => ({ ...row, source: 'handbook-102' as const })),
  ];
}

export function usdaRetentionFactors(
  food: UsdaCookingFood,
  treatmentCode: string,
) {
  const treatment = usdaRetentionOptions(food).find(
    (candidate) => candidate.code === treatmentCode,
  );
  if (!treatment)
    throw new TypeError('USDA cooking treatment does not match the raw food.');
  const factors: {
    nutrientId: string;
    factor: string;
    rule: { component: string; version: string };
  }[] = [];
  for (const nutrient of food.nutrients ?? []) {
    const number = nutrient.sourceNutrientNumber;
    if (!number) continue;
    const factor = (treatment.factors as Record<string, string>)[number];
    if (factor === undefined) continue;
    factors.push({
      nutrientId: nutrient.nutrientId,
      factor,
      rule: {
        component: `usda-retention-${treatment.code}`,
        version: '6-2007',
      },
    });
  }
  return factors;
}

export function usdaYieldFactor(food: UsdaCookingFood, rowId: string) {
  const row = usdaYieldOptions(food).find(
    (candidate) => candidate.id === rowId,
  );
  if (!row)
    throw new TypeError('USDA cooking yield does not match the raw food.');
  return {
    factor: row.factor,
    rule:
      row.source === 'handbook-102'
        ? { component: `usda-yield-${row.id}`, version: '1975' }
        : { component: `usda-cooking-yield-${row.id}`, version: '2-2014' },
  };
}

export function cookingMethods(description: string): readonly string[] {
  const value = description.toLocaleUpperCase('en-US');
  return [
    /(?:BAK|ROASTED)/.test(value) && !/BAKED IN WATER/.test(value)
      ? 'roast'
      : '',
    /BROIL|GRILL/.test(value) ? 'grill' : '',
    /BRAIS/.test(value) ? 'braise' : '',
    /SIMMER/.test(value) ? 'simmer' : '',
    /FRI|FRY|SAUTE/.test(value) ? 'fry' : '',
    /BOIL|BLD|BAKED IN WATER/.test(value) ? 'boil' : '',
    /STEAM/.test(value) ? 'steam' : '',
  ].filter(Boolean);
}

export type CookingMethod =
  | 'roast'
  | 'grill'
  | 'braise'
  | 'simmer'
  | 'fry'
  | 'boil'
  | 'steam';

export function inferCookingMethod(
  instructions: readonly string[],
): CookingMethod | null {
  const methods = new Set<CookingMethod>();
  for (const instruction of instructions) {
    const value = instruction.toLocaleLowerCase('en-US');
    if (/\b(?:bak(?:e|ed|ing))\s+in\s+water\b/.test(value)) methods.add('boil');
    else if (/\b(?:bake|baked|baking|roast|roasted|roasting)\b/.test(value))
      methods.add('roast');
    if (/\b(?:broil|broiled|broiling|grill|grilled|grilling)\b/.test(value))
      methods.add('grill');
    if (/\b(?:braise|braised|braising)\b/.test(value)) methods.add('braise');
    if (/\b(?:simmer|simmered|simmering)\b/.test(value)) methods.add('simmer');
    if (/\b(?:fry|fried|frying|saute|sauteed|sauteing)\b/.test(value))
      methods.add('fry');
    if (/\b(?:boil|boiled|boiling)\b/.test(value)) methods.add('boil');
    if (/\b(?:steam|steamed|steaming)\b/.test(value)) methods.add('steam');
  }
  return methods.size === 1 ? (methods.values().next().value ?? null) : null;
}

export function suggestUsdaCooking(
  food: UsdaCookingFood,
  method: CookingMethod | null,
) {
  if (!method) return {};
  const treatments = usdaRetentionOptions(food).filter((row) =>
    cookingMethods(row.description).includes(method),
  );
  const yields = usdaYieldOptions(food).filter((row) =>
    cookingMethods(row.method).includes(method),
  );
  return {
    ...(treatments.length === 1 ? { treatmentCode: treatments[0]!.code } : {}),
    ...(yields.length === 1 ? { yieldRowId: yields[0]!.id } : {}),
  };
}

export function usdaCookingMethodsCompatible(
  food: UsdaCookingFood,
  treatmentCode: string,
  yieldRowId: string,
): boolean {
  const treatment = usdaRetentionOptions(food).find(
    (row) => row.code === treatmentCode,
  );
  const yieldRow = usdaYieldOptions(food).find((row) => row.id === yieldRowId);
  if (!treatment || !yieldRow) return false;
  const treatmentMethods = cookingMethods(treatment.description);
  const yieldMethods = cookingMethods(yieldRow.method);
  // An unspecified USDA method needs an explicit treatment choice, not a false mismatch.
  if (treatmentMethods.length === 0 || yieldMethods.length === 0) return true;
  return treatmentMethods.some((method) => yieldMethods.includes(method));
}

export function estimateUsdaFinalWeight(
  ingredients: readonly { gramWeight: string; yieldFactor?: string }[],
): string {
  if (
    ingredients.length === 0 ||
    ingredients.some((item) => !item.yieldFactor)
  ) {
    throw new TypeError(
      'Every ingredient needs an applicable USDA cooking yield for an estimated final weight.',
    );
  }
  const grams = ingredients.reduce(
    (total, item) => total + Number(item.gramWeight) * Number(item.yieldFactor),
    0,
  );
  if (!Number.isFinite(grams) || grams <= 0) {
    throw new TypeError('Invalid USDA estimated weight.');
  }
  return String(Number(grams.toFixed(6)));
}

export const USDA_COOKING_SOURCES = {
  retention:
    'https://www.ars.usda.gov/ARSUserFiles/80400535/Data/retn/retn06.txt',
  yield:
    'https://www.ars.usda.gov/ARSUserFiles/80400535/Data/retn/USDA_CookingYields_MeatPoultry02.xlsx',
  retentionSha256: tables.retentionSha256,
  yieldSha256: tables.yieldSha256,
  handbook: handbook.sourceUrl,
  handbookSha256: handbook.sourceSha256,
} as const;
