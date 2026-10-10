import {
  TargetPolicyReleaseV1Schema,
  type TargetPolicyReleaseV1,
  type TargetRuleV1,
} from './target-policy.js';

const EFFECTIVE_FROM = '2026-10-10T00:00:00.000Z';
const SOURCE_URL = 'https://www.nationalacademies.org/read/25353/chapter/28';
const AGE_BANDS = [
  { minimumAgeYears: 18, maximumAgeYears: 18 },
  { minimumAgeYears: 19, maximumAgeYears: 30 },
  { minimumAgeYears: 31, maximumAgeYears: 50 },
  { minimumAgeYears: 51, maximumAgeYears: 70 },
  { minimumAgeYears: 71, maximumAgeYears: 120 },
] as const;

type FiveBands = readonly [string, string, string, string, string];
type TableName =
  | 'vitamins'
  | 'elements'
  | 'macronutrients'
  | 'amdr'
  | 'vitamin-ul'
  | 'element-ul';

interface BaselineDefinition {
  readonly nutrientId: string;
  readonly type: 'RDA' | 'AI' | 'UL' | 'AMDR';
  readonly unit: string;
  readonly table: TableName;
  readonly male: FiveBands;
  readonly female: FiveBands;
}

// Columns follow the National Academies' adult life-stage rows:
// 14-18, 19-30, 31-50, 51-70, and >70 years. The first column applies only
// to age 18 in this adult-only release. Values are independent source facts;
// percentages are energy shares, not grams of food composition.
const DEFINITIONS: readonly BaselineDefinition[] = [
  {
    nutrientId: 'nutrient.protein',
    type: 'RDA',
    unit: 'g',
    table: 'macronutrients',
    male: ['52', '56', '56', '56', '56'],
    female: ['46', '46', '46', '46', '46'],
  },
  {
    nutrientId: 'nutrient.carbohydrate-by-difference',
    type: 'RDA',
    unit: 'g',
    table: 'macronutrients',
    male: ['130', '130', '130', '130', '130'],
    female: ['130', '130', '130', '130', '130'],
  },
  {
    nutrientId: 'nutrient.dietary-fiber',
    type: 'AI',
    unit: 'g',
    table: 'macronutrients',
    male: ['38', '38', '38', '30', '30'],
    female: ['26', '25', '25', '21', '21'],
  },
  {
    nutrientId: 'nutrient.calcium',
    type: 'RDA',
    unit: 'mg',
    table: 'elements',
    male: ['1300', '1000', '1000', '1000', '1200'],
    female: ['1300', '1000', '1000', '1200', '1200'],
  },
  {
    nutrientId: 'nutrient.iron',
    type: 'RDA',
    unit: 'mg',
    table: 'elements',
    male: ['11', '8', '8', '8', '8'],
    female: ['15', '18', '18', '8', '8'],
  },
  {
    nutrientId: 'nutrient.magnesium',
    type: 'RDA',
    unit: 'mg',
    table: 'elements',
    male: ['410', '400', '420', '420', '420'],
    female: ['360', '310', '320', '320', '320'],
  },
  {
    nutrientId: 'nutrient.phosphorus',
    type: 'RDA',
    unit: 'mg',
    table: 'elements',
    male: ['1250', '700', '700', '700', '700'],
    female: ['1250', '700', '700', '700', '700'],
  },
  {
    nutrientId: 'nutrient.potassium',
    type: 'AI',
    unit: 'mg',
    table: 'elements',
    male: ['3000', '3400', '3400', '3400', '3400'],
    female: ['2300', '2600', '2600', '2600', '2600'],
  },
  {
    nutrientId: 'nutrient.sodium',
    type: 'AI',
    unit: 'mg',
    table: 'elements',
    male: ['1500', '1500', '1500', '1500', '1500'],
    female: ['1500', '1500', '1500', '1500', '1500'],
  },
  {
    nutrientId: 'nutrient.zinc',
    type: 'RDA',
    unit: 'mg',
    table: 'elements',
    male: ['11', '11', '11', '11', '11'],
    female: ['9', '8', '8', '8', '8'],
  },
  {
    nutrientId: 'nutrient.copper',
    type: 'RDA',
    unit: 'mg',
    table: 'elements',
    male: ['0.89', '0.9', '0.9', '0.9', '0.9'],
    female: ['0.89', '0.9', '0.9', '0.9', '0.9'],
  },
  {
    nutrientId: 'nutrient.iodine',
    type: 'RDA',
    unit: 'ug',
    table: 'elements',
    male: ['150', '150', '150', '150', '150'],
    female: ['150', '150', '150', '150', '150'],
  },
  {
    nutrientId: 'nutrient.manganese',
    type: 'AI',
    unit: 'mg',
    table: 'elements',
    male: ['2.2', '2.3', '2.3', '2.3', '2.3'],
    female: ['1.6', '1.8', '1.8', '1.8', '1.8'],
  },
  {
    nutrientId: 'nutrient.selenium',
    type: 'RDA',
    unit: 'ug',
    table: 'elements',
    male: ['55', '55', '55', '55', '55'],
    female: ['55', '55', '55', '55', '55'],
  },
  {
    nutrientId: 'nutrient.vitamin-a-rae',
    type: 'RDA',
    unit: 'ug',
    table: 'vitamins',
    male: ['900', '900', '900', '900', '900'],
    female: ['700', '700', '700', '700', '700'],
  },
  {
    nutrientId: 'nutrient.vitamin-c',
    type: 'RDA',
    unit: 'mg',
    table: 'vitamins',
    male: ['75', '90', '90', '90', '90'],
    female: ['65', '75', '75', '75', '75'],
  },
  {
    nutrientId: 'nutrient.vitamin-d',
    type: 'RDA',
    unit: 'ug',
    table: 'vitamins',
    male: ['15', '15', '15', '15', '20'],
    female: ['15', '15', '15', '15', '20'],
  },
  {
    nutrientId: 'nutrient.vitamin-e-alpha-tocopherol',
    type: 'RDA',
    unit: 'mg',
    table: 'vitamins',
    male: ['15', '15', '15', '15', '15'],
    female: ['15', '15', '15', '15', '15'],
  },
  {
    nutrientId: 'nutrient.thiamin',
    type: 'RDA',
    unit: 'mg',
    table: 'vitamins',
    male: ['1.2', '1.2', '1.2', '1.2', '1.2'],
    female: ['1', '1.1', '1.1', '1.1', '1.1'],
  },
  {
    nutrientId: 'nutrient.riboflavin',
    type: 'RDA',
    unit: 'mg',
    table: 'vitamins',
    male: ['1.3', '1.3', '1.3', '1.3', '1.3'],
    female: ['1', '1.1', '1.1', '1.1', '1.1'],
  },
  {
    nutrientId: 'nutrient.vitamin-b6',
    type: 'RDA',
    unit: 'mg',
    table: 'vitamins',
    male: ['1.3', '1.3', '1.3', '1.7', '1.7'],
    female: ['1.2', '1.3', '1.3', '1.5', '1.5'],
  },
  {
    nutrientId: 'nutrient.folate-dfe',
    type: 'RDA',
    unit: 'ug',
    table: 'vitamins',
    male: ['400', '400', '400', '400', '400'],
    female: ['400', '400', '400', '400', '400'],
  },
  {
    nutrientId: 'nutrient.vitamin-b12',
    type: 'RDA',
    unit: 'ug',
    table: 'vitamins',
    male: ['2.4', '2.4', '2.4', '2.4', '2.4'],
    female: ['2.4', '2.4', '2.4', '2.4', '2.4'],
  },
  {
    nutrientId: 'nutrient.pantothenic-acid',
    type: 'AI',
    unit: 'mg',
    table: 'vitamins',
    male: ['5', '5', '5', '5', '5'],
    female: ['5', '5', '5', '5', '5'],
  },
  {
    nutrientId: 'nutrient.biotin',
    type: 'AI',
    unit: 'ug',
    table: 'vitamins',
    male: ['25', '30', '30', '30', '30'],
    female: ['25', '30', '30', '30', '30'],
  },
  {
    nutrientId: 'nutrient.choline',
    type: 'AI',
    unit: 'mg',
    table: 'vitamins',
    male: ['550', '550', '550', '550', '550'],
    female: ['400', '425', '425', '425', '425'],
  },
  {
    nutrientId: 'nutrient.total-fat',
    type: 'AMDR',
    unit: 'percent-energy',
    table: 'amdr',
    male: ['25-35', '20-35', '20-35', '20-35', '20-35'],
    female: ['25-35', '20-35', '20-35', '20-35', '20-35'],
  },
  {
    nutrientId: 'nutrient.carbohydrate-by-difference',
    type: 'AMDR',
    unit: 'percent-energy',
    table: 'amdr',
    male: ['45-65', '45-65', '45-65', '45-65', '45-65'],
    female: ['45-65', '45-65', '45-65', '45-65', '45-65'],
  },
  {
    nutrientId: 'nutrient.protein',
    type: 'AMDR',
    unit: 'percent-energy',
    table: 'amdr',
    male: ['10-30', '10-35', '10-35', '10-35', '10-35'],
    female: ['10-30', '10-35', '10-35', '10-35', '10-35'],
  },
  {
    nutrientId: 'nutrient.vitamin-c',
    type: 'UL',
    unit: 'mg',
    table: 'vitamin-ul',
    male: ['1800', '2000', '2000', '2000', '2000'],
    female: ['1800', '2000', '2000', '2000', '2000'],
  },
  {
    nutrientId: 'nutrient.vitamin-d',
    type: 'UL',
    unit: 'ug',
    table: 'vitamin-ul',
    male: ['100', '100', '100', '100', '100'],
    female: ['100', '100', '100', '100', '100'],
  },
  {
    nutrientId: 'nutrient.calcium',
    type: 'UL',
    unit: 'mg',
    table: 'element-ul',
    male: ['3000', '2500', '2500', '2000', '2000'],
    female: ['3000', '2500', '2500', '2000', '2000'],
  },
  {
    nutrientId: 'nutrient.iron',
    type: 'UL',
    unit: 'mg',
    table: 'element-ul',
    male: ['45', '45', '45', '45', '45'],
    female: ['45', '45', '45', '45', '45'],
  },
];

const TABLE_SOURCE: Record<TableName, { title: string; page: string }> = {
  vitamins: {
    title: 'Recommended Dietary Allowances and Adequate Intakes, Vitamins',
    page: '568-569',
  },
  elements: {
    title: 'Recommended Dietary Allowances and Adequate Intakes, Elements',
    page: '570-571',
  },
  macronutrients: {
    title:
      'Recommended Dietary Allowances and Adequate Intakes, Total Water and Macronutrients',
    page: '572',
  },
  amdr: { title: 'Acceptable Macronutrient Distribution Ranges', page: '573' },
  'vitamin-ul': {
    title: 'Tolerable Upper Intake Levels, Vitamins',
    page: '574-575',
  },
  'element-ul': {
    title: 'Tolerable Upper Intake Levels, Elements',
    page: '576-577',
  },
};

function valueFor(
  definition: BaselineDefinition,
  amount: string,
): TargetRuleV1['value'] {
  if (definition.type !== 'AMDR') return { kind: 'point', amount };
  const [lower, upper] = amount.split('-');
  if (lower === undefined || upper === undefined) {
    throw new TypeError('The AMDR range is malformed.');
  }
  return { kind: 'range', lower, upper };
}

function ruleFor(
  definition: BaselineDefinition,
  bandIndex: number,
  physiology: 'any' | 'female' | 'male',
  amount: string,
): TargetRuleV1 {
  const band = AGE_BANDS[bandIndex];
  if (band === undefined) throw new TypeError('The age band is unavailable.');
  const source = TABLE_SOURCE[definition.table];
  return {
    ruleId: `${definition.type.toLowerCase()}.${definition.nutrientId}.${band.minimumAgeYears}.${physiology}`,
    nutrientId: definition.nutrientId,
    type: definition.type,
    value: valueFor(definition, amount),
    unit: {
      system: definition.type === 'AMDR' ? 'nutrixx' : 'ucum',
      code: definition.unit,
    },
    horizon:
      definition.type === 'UL'
        ? 'daily-limit'
        : definition.type === 'AMDR'
          ? 'energy-share'
          : 'daily-average',
    sourceScope: 'all-intake',
    population: {
      ...band,
      physiologicalReference: physiology,
      lifeStage: 'adult',
    },
    effectiveFrom: EFFECTIVE_FROM,
    source: {
      authority: 'National Academies of Sciences, Engineering, and Medicine',
      title: source.title,
      edition: `2019 Appendix J, pp. ${source.page}`,
      url: SOURCE_URL,
    },
  };
}

function buildRules(): TargetRuleV1[] {
  return DEFINITIONS.flatMap((definition) =>
    AGE_BANDS.flatMap((_, index) => {
      const male = definition.male[index];
      const female = definition.female[index];
      if (male === undefined || female === undefined) {
        throw new TypeError('A baseline target age band is missing.');
      }
      return male === female
        ? [ruleFor(definition, index, 'any', male)]
        : [
            ruleFor(definition, index, 'male', male),
            ruleFor(definition, index, 'female', female),
          ];
    }),
  );
}

const release = TargetPolicyReleaseV1Schema.parse({
  releaseId: 'dri-us-ca-adult-2019-summary-v1',
  policyVersion: 'dri-adult-targets-v1',
  effectiveFrom: EFFECTIVE_FROM,
  applicableMarkets: ['US', 'CA'],
  publication: {
    status: 'provisional',
    authorId: 'nutrixx-product-domain',
    publishedAt: EFFECTIVE_FROM,
  },
  rules: buildRules(),
});

export function getAdultDriBaselineReleaseV1(): TargetPolicyReleaseV1 {
  return structuredClone(release);
}
