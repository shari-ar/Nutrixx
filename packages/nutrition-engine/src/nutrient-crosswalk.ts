export interface NutrientCrosswalkEntryV1 {
  readonly nutrientId: string;
  readonly usdaFdcNutrientId: string;
  readonly usdaFdcName: string;
  readonly observationUnit: 'g' | 'mg' | 'ug';
}

// Names and units were checked against the active USDA FDC Foundation/SR Legacy
// food catalog. A shared name alone does not establish nutritional equivalence.
export const NUTRIENT_CROSSWALK_V1: readonly NutrientCrosswalkEntryV1[] = [
  {
    nutrientId: 'nutrient.protein',
    usdaFdcNutrientId: '1003',
    usdaFdcName: 'Protein',
    observationUnit: 'g',
  },
  {
    nutrientId: 'nutrient.total-fat',
    usdaFdcNutrientId: '1004',
    usdaFdcName: 'Total lipid (fat)',
    observationUnit: 'g',
  },
  {
    nutrientId: 'nutrient.carbohydrate-by-difference',
    usdaFdcNutrientId: '1005',
    usdaFdcName: 'Carbohydrate, by difference',
    observationUnit: 'g',
  },
  {
    nutrientId: 'nutrient.dietary-fiber',
    usdaFdcNutrientId: '1079',
    usdaFdcName: 'Fiber, total dietary',
    observationUnit: 'g',
  },
  {
    nutrientId: 'nutrient.calcium',
    usdaFdcNutrientId: '1087',
    usdaFdcName: 'Calcium, Ca',
    observationUnit: 'mg',
  },
  {
    nutrientId: 'nutrient.iron',
    usdaFdcNutrientId: '1089',
    usdaFdcName: 'Iron, Fe',
    observationUnit: 'mg',
  },
  {
    nutrientId: 'nutrient.magnesium',
    usdaFdcNutrientId: '1090',
    usdaFdcName: 'Magnesium, Mg',
    observationUnit: 'mg',
  },
  {
    nutrientId: 'nutrient.phosphorus',
    usdaFdcNutrientId: '1091',
    usdaFdcName: 'Phosphorus, P',
    observationUnit: 'mg',
  },
  {
    nutrientId: 'nutrient.potassium',
    usdaFdcNutrientId: '1092',
    usdaFdcName: 'Potassium, K',
    observationUnit: 'mg',
  },
  {
    nutrientId: 'nutrient.sodium',
    usdaFdcNutrientId: '1093',
    usdaFdcName: 'Sodium, Na',
    observationUnit: 'mg',
  },
  {
    nutrientId: 'nutrient.zinc',
    usdaFdcNutrientId: '1095',
    usdaFdcName: 'Zinc, Zn',
    observationUnit: 'mg',
  },
  {
    nutrientId: 'nutrient.copper',
    usdaFdcNutrientId: '1098',
    usdaFdcName: 'Copper, Cu',
    observationUnit: 'mg',
  },
  {
    nutrientId: 'nutrient.iodine',
    usdaFdcNutrientId: '1100',
    usdaFdcName: 'Iodine, I',
    observationUnit: 'ug',
  },
  {
    nutrientId: 'nutrient.manganese',
    usdaFdcNutrientId: '1101',
    usdaFdcName: 'Manganese, Mn',
    observationUnit: 'mg',
  },
  {
    nutrientId: 'nutrient.selenium',
    usdaFdcNutrientId: '1103',
    usdaFdcName: 'Selenium, Se',
    observationUnit: 'ug',
  },
  {
    nutrientId: 'nutrient.vitamin-a-rae',
    usdaFdcNutrientId: '1106',
    usdaFdcName: 'Vitamin A, RAE',
    observationUnit: 'ug',
  },
  {
    nutrientId: 'nutrient.vitamin-e-alpha-tocopherol',
    usdaFdcNutrientId: '1109',
    usdaFdcName: 'Vitamin E (alpha-tocopherol)',
    observationUnit: 'mg',
  },
  {
    nutrientId: 'nutrient.vitamin-d',
    usdaFdcNutrientId: '1114',
    usdaFdcName: 'Vitamin D (D2 + D3)',
    observationUnit: 'ug',
  },
  {
    nutrientId: 'nutrient.vitamin-c',
    usdaFdcNutrientId: '1162',
    usdaFdcName: 'Vitamin C, total ascorbic acid',
    observationUnit: 'mg',
  },
  {
    nutrientId: 'nutrient.thiamin',
    usdaFdcNutrientId: '1165',
    usdaFdcName: 'Thiamin',
    observationUnit: 'mg',
  },
  {
    nutrientId: 'nutrient.riboflavin',
    usdaFdcNutrientId: '1166',
    usdaFdcName: 'Riboflavin',
    observationUnit: 'mg',
  },
  {
    nutrientId: 'nutrient.pantothenic-acid',
    usdaFdcNutrientId: '1170',
    usdaFdcName: 'Pantothenic acid',
    observationUnit: 'mg',
  },
  {
    nutrientId: 'nutrient.vitamin-b6',
    usdaFdcNutrientId: '1175',
    usdaFdcName: 'Vitamin B-6',
    observationUnit: 'mg',
  },
  {
    nutrientId: 'nutrient.biotin',
    usdaFdcNutrientId: '1176',
    usdaFdcName: 'Biotin',
    observationUnit: 'ug',
  },
  {
    nutrientId: 'nutrient.vitamin-b12',
    usdaFdcNutrientId: '1178',
    usdaFdcName: 'Vitamin B-12',
    observationUnit: 'ug',
  },
  {
    nutrientId: 'nutrient.choline',
    usdaFdcNutrientId: '1180',
    usdaFdcName: 'Choline, total',
    observationUnit: 'mg',
  },
  {
    nutrientId: 'nutrient.folate-dfe',
    usdaFdcNutrientId: '1190',
    usdaFdcName: 'Folate, DFE',
    observationUnit: 'ug',
  },
];

const bySourceId = new Map(
  NUTRIENT_CROSSWALK_V1.map((entry) => [
    `source.usda-fdc.${entry.usdaFdcNutrientId}`,
    entry,
  ]),
);
const byCanonicalId = new Map(
  NUTRIENT_CROSSWALK_V1.map((entry) => [entry.nutrientId, entry]),
);

export function resolveNutrientConceptV1(
  observationNutrientId: string,
  observationUnit: string,
): string | null {
  const entry =
    bySourceId.get(observationNutrientId) ??
    byCanonicalId.get(observationNutrientId);
  return entry?.observationUnit === observationUnit ? entry.nutrientId : null;
}
