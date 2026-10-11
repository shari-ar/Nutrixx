import { NUTRIENT_CROSSWALK_V1 } from './nutrient-crosswalk.js';

export type FoodComponentKindV1 =
  | 'nutrient'
  | 'bioactive'
  | 'contaminant'
  | 'other';

export interface FoodComponentV1 {
  readonly componentId: string;
  readonly accessCode: string;
  readonly name: string;
  readonly category: string;
  readonly unit: 'kcal' | 'g' | 'mg' | 'ug';
  readonly kind: FoodComponentKindV1;
  readonly usdaFdcNutrientIds: readonly string[];
}

type Definition = readonly [
  accessCode: string,
  name: string,
  category: string,
  unit: FoodComponentV1['unit'],
  kind: FoodComponentKindV1,
  usdaFdcNutrientIds?: readonly string[],
];

// Transcribed from the 112 active rows in the feasibility Access database's
// nutrients table. USDA IDs below were checked against the locally bundled
// Foundation/SR Legacy source releases. An absent ID means that this release
// has no exact, unit-compatible mapping; it never implies a measured zero.
const DEFINITIONS: readonly Definition[] = [
  ['ENERC_KCAL', 'Energy', 'Energy', 'kcal', 'nutrient', ['1008']],
  ['PROCNT', 'Protein', 'Macronutrient', 'g', 'nutrient', ['1003']],
  ['FAT', 'Total Fat', 'Macronutrient', 'g', 'nutrient', ['1004']],
  ['CHOCDF', 'Carbohydrate', 'Macronutrient', 'g', 'nutrient', ['1005']],
  ['FIBTG', 'Fiber', 'Carbohydrate', 'g', 'nutrient', ['1079']],
  ['SUGAR', 'Sugars', 'Carbohydrate', 'g', 'nutrient', ['2000', '1063']],
  ['STARCH', 'Starch', 'Carbohydrate', 'g', 'nutrient', ['1009']],
  ['SUCS', 'Sucrose', 'Carbohydrate', 'g', 'nutrient', ['1010']],
  ['GLUS', 'Glucose', 'Carbohydrate', 'g', 'nutrient', ['1011']],
  ['FRUS', 'Fructose', 'Carbohydrate', 'g', 'nutrient', ['1012']],
  ['LACS', 'Lactose', 'Carbohydrate', 'g', 'nutrient', ['1013']],
  ['MALS', 'Maltose', 'Carbohydrate', 'g', 'nutrient', ['1014']],
  ['CA', 'Calcium', 'Mineral', 'mg', 'nutrient', ['1087']],
  ['FE', 'Iron', 'Mineral', 'mg', 'nutrient', ['1089']],
  ['MG', 'Magnesium', 'Mineral', 'mg', 'nutrient', ['1090']],
  ['P', 'Phosphorus', 'Mineral', 'mg', 'nutrient', ['1091']],
  ['K', 'Potassium', 'Mineral', 'mg', 'nutrient', ['1092']],
  ['NA', 'Sodium', 'Mineral', 'mg', 'nutrient', ['1093']],
  ['ZN', 'Zinc', 'Mineral', 'mg', 'nutrient', ['1095']],
  ['CU', 'Copper', 'Mineral', 'mg', 'nutrient', ['1098']],
  ['MN', 'Manganese', 'Mineral', 'mg', 'nutrient', ['1101']],
  ['SE', 'Selenium', 'Mineral', 'ug', 'nutrient', ['1103']],
  ['I', 'Iodine', 'Mineral', 'ug', 'nutrient', ['1100']],
  ['CR', 'Chromium', 'Mineral', 'ug', 'nutrient'],
  ['MO', 'Molybdenum', 'Mineral', 'ug', 'nutrient', ['1102']],
  ['CL', 'Chloride', 'Mineral', 'mg', 'nutrient'],
  ['F', 'Fluoride', 'Mineral', 'mg', 'other'],
  ['B', 'Boron', 'Mineral', 'mg', 'bioactive'],
  ['SI', 'Silicon', 'Mineral', 'mg', 'bioactive'],
  ['VITA_RAE', 'Vitamin A', 'Vitamin', 'ug', 'nutrient', ['1106']],
  ['RETOL', 'Retinol', 'Vitamin', 'ug', 'nutrient', ['1105']],
  ['CARTB', 'Beta-Carotene', 'Carotenoid', 'ug', 'bioactive', ['1107']],
  ['CARTA', 'Alpha-Carotene', 'Carotenoid', 'ug', 'bioactive', ['1108']],
  ['CRYPX', 'Beta-Cryptoxanthin', 'Carotenoid', 'ug', 'bioactive', ['1120']],
  ['LYCO', 'Lycopene', 'Carotenoid', 'ug', 'bioactive', ['1122']],
  ['LUTZEA', 'Lutein + Zeaxanthin', 'Carotenoid', 'ug', 'bioactive', ['1123']],
  ['VITD', 'Vitamin D', 'Vitamin', 'ug', 'nutrient', ['1114']],
  ['TOCPHA', 'Vitamin E', 'Vitamin', 'mg', 'nutrient', ['1109']],
  ['VITK', 'Vitamin K', 'Vitamin', 'ug', 'nutrient'],
  ['VITC', 'Vitamin C', 'Vitamin', 'mg', 'nutrient', ['1162']],
  ['THIA', 'Thiamin', 'Vitamin', 'mg', 'nutrient', ['1165']],
  ['RIBF', 'Riboflavin', 'Vitamin', 'mg', 'nutrient', ['1166']],
  ['NIA', 'Niacin', 'Vitamin', 'mg', 'nutrient', ['1167']],
  ['VITB6A', 'Vitamin B6', 'Vitamin', 'mg', 'nutrient', ['1175']],
  ['FOLDFE', 'Folate', 'Vitamin', 'ug', 'nutrient', ['1190']],
  ['VITB12', 'Vitamin B12', 'Vitamin', 'ug', 'nutrient', ['1178']],
  ['PANTAC', 'Pantothenic Acid', 'Vitamin', 'mg', 'nutrient', ['1170']],
  ['BIOT', 'Biotin', 'Vitamin', 'ug', 'nutrient', ['1176']],
  ['CHOLN', 'Choline', 'Vitamin', 'mg', 'nutrient', ['1180']],
  ['ALC', 'Alcohol', 'Other', 'g', 'other', ['1018']],
  ['WATER', 'Water', 'Other', 'g', 'nutrient', ['1051']],
  ['CAFFN', 'Caffeine', 'Bioactive', 'mg', 'bioactive', ['1057']],
  ['TAUR', 'Taurine', 'Bioactive', 'mg', 'bioactive'],
  ['CREAT', 'Creatine', 'Bioactive', 'mg', 'bioactive'],
  ['CHOL', 'Cholesterol', 'Lipid', 'mg', 'bioactive', ['1253']],
  ['FASAT', 'Saturated Fat', 'Fatty Acid', 'g', 'nutrient', ['1258']],
  ['FAMS', 'Monounsaturated Fat', 'Fatty Acid', 'g', 'nutrient', ['1292']],
  ['FAPU', 'Polyunsaturated Fat', 'Fatty Acid', 'g', 'nutrient', ['1293']],
  ['FATRN', 'Trans Fat', 'Fatty Acid', 'g', 'nutrient', ['1257']],
  ['FA_O3', 'Omega-3 Fatty Acids', 'Fatty Acid', 'g', 'bioactive'],
  ['FA_O6', 'Omega-6 Fatty Acids', 'Fatty Acid', 'g', 'bioactive'],
  ['ALA', 'ALA', 'Fatty Acid', 'g', 'bioactive', ['1404']],
  ['EPA', 'EPA', 'Fatty Acid', 'g', 'bioactive', ['1278']],
  ['DHA', 'DHA', 'Fatty Acid', 'g', 'bioactive', ['1272']],
  ['LA', 'Linoleic Acid', 'Fatty Acid', 'g', 'bioactive', ['1316']],
  ['OA', 'Oleic Acid', 'Fatty Acid', 'g', 'bioactive'],
  ['PA', 'Palmitic Acid', 'Fatty Acid', 'g', 'bioactive', ['1265']],
  ['SA', 'Stearic Acid', 'Fatty Acid', 'g', 'bioactive', ['1266']],
  ['HIS', 'Histidine', 'Amino Acid', 'g', 'nutrient', ['1221']],
  ['ILE', 'Isoleucine', 'Amino Acid', 'g', 'nutrient', ['1212']],
  ['LEU', 'Leucine', 'Amino Acid', 'g', 'nutrient', ['1213']],
  ['LYS', 'Lysine', 'Amino Acid', 'g', 'nutrient', ['1214']],
  ['MET', 'Methionine', 'Amino Acid', 'g', 'nutrient', ['1215']],
  ['PHE', 'Phenylalanine', 'Amino Acid', 'g', 'nutrient', ['1217']],
  ['THR', 'Threonine', 'Amino Acid', 'g', 'nutrient', ['1211']],
  ['TRP', 'Tryptophan', 'Amino Acid', 'g', 'nutrient', ['1210']],
  ['VAL', 'Valine', 'Amino Acid', 'g', 'nutrient', ['1219']],
  ['ARG', 'Arginine', 'Amino Acid', 'g', 'bioactive', ['1220']],
  ['CYS', 'Cysteine', 'Amino Acid', 'g', 'bioactive', ['1232']],
  ['GLU', 'Glutamic Acid', 'Amino Acid', 'g', 'bioactive', ['1224']],
  ['GLN', 'Glutamine', 'Amino Acid', 'g', 'bioactive'],
  ['GLY', 'Glycine', 'Amino Acid', 'g', 'bioactive', ['1225']],
  ['PRO', 'Proline', 'Amino Acid', 'g', 'bioactive', ['1226']],
  ['SER', 'Serine', 'Amino Acid', 'g', 'bioactive', ['1227']],
  ['TYR', 'Tyrosine', 'Amino Acid', 'g', 'bioactive', ['1218']],
  ['ALANINE', 'Alanine', 'Amino Acid', 'g', 'bioactive', ['1222']],
  ['ASP', 'Aspartic Acid', 'Amino Acid', 'g', 'bioactive', ['1223']],
  ['HIST', 'Histamine', 'Bioactive', 'mg', 'bioactive'],
  ['OXAL', 'Oxalate', 'Antinutrient', 'mg', 'bioactive'],
  ['PHYT', 'Phytate', 'Antinutrient', 'mg', 'bioactive'],
  ['PUR', 'Purines', 'Bioactive', 'mg', 'bioactive'],
  ['NO3', 'Nitrate', 'Bioactive', 'mg', 'bioactive'],
  ['NO2', 'Nitrite', 'Bioactive', 'mg', 'bioactive'],
  ['POLY', 'Polyphenols', 'Bioactive', 'mg', 'bioactive'],
  ['FLAV', 'Flavonoids', 'Bioactive', 'mg', 'bioactive'],
  ['ANTHO', 'Anthocyanins', 'Bioactive', 'mg', 'bioactive'],
  ['ISOFL', 'Isoflavones', 'Bioactive', 'mg', 'bioactive'],
  ['PHYTO', 'Phytosterols', 'Bioactive', 'mg', 'bioactive', ['1283']],
  ['SAP', 'Saponins', 'Bioactive', 'mg', 'bioactive'],
  ['GLUCO', 'Glucosinolates', 'Bioactive', 'mg', 'bioactive'],
  ['CAPS', 'Capsaicin', 'Bioactive', 'mg', 'bioactive'],
  ['SULF', 'Sulforaphane', 'Bioactive', 'mg', 'bioactive'],
  ['GING', 'Gingerols', 'Bioactive', 'mg', 'bioactive'],
  ['CURC', 'Curcuminoids', 'Bioactive', 'mg', 'bioactive'],
  ['ALIC', 'Allicin', 'Bioactive', 'mg', 'bioactive'],
  ['COQ10', 'Coenzyme Q10', 'Bioactive', 'mg', 'bioactive'],
  ['MELAT', 'Melatonin', 'Bioactive', 'ug', 'bioactive'],
  ['NI', 'Nickel', 'Trace Element', 'ug', 'contaminant', ['1146']],
  ['AS', 'Arsenic', 'Contaminant', 'ug', 'contaminant'],
  ['PB', 'Lead', 'Contaminant', 'ug', 'contaminant'],
  ['CD', 'Cadmium', 'Contaminant', 'ug', 'contaminant'],
  ['HG', 'Mercury', 'Contaminant', 'ug', 'contaminant'],
];

const targetBySourceId = new Map(
  NUTRIENT_CROSSWALK_V1.map((entry) => [
    entry.usdaFdcNutrientId,
    entry.nutrientId,
  ]),
);

export const FOOD_COMPONENTS_V1: readonly FoodComponentV1[] = DEFINITIONS.map(
  ([accessCode, name, category, unit, kind, usdaFdcNutrientIds = []]) => ({
    componentId:
      targetBySourceId.get(usdaFdcNutrientIds[0] ?? '') ??
      `food-component.${accessCode.toLowerCase().replaceAll('_', '-')}`,
    accessCode,
    name,
    category,
    unit,
    kind,
    usdaFdcNutrientIds,
  }),
);

const byId = new Map(
  FOOD_COMPONENTS_V1.map((entry) => [entry.componentId, entry]),
);
const bySourceId = new Map<string, FoodComponentV1>(
  FOOD_COMPONENTS_V1.flatMap((entry) =>
    entry.usdaFdcNutrientIds.map(
      (id) => [`source.usda-fdc.${id}`, entry] as const,
    ),
  ),
);

export function findFoodComponentV1(
  componentId: string,
): FoodComponentV1 | undefined {
  return byId.get(componentId);
}

export function resolveFoodComponentV1(
  observationNutrientId: string,
  observationUnit: string,
): string | null {
  const entry =
    byId.get(observationNutrientId) ?? bySourceId.get(observationNutrientId);
  return entry?.unit === observationUnit ? entry.componentId : null;
}
