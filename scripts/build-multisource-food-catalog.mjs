import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { createGzip, gunzip } from 'node:zlib';

import {
  auditFoodDataQualityV1,
  compareFoodSourcePriorityV1,
  createFoodCatalogReleaseV1,
  deriveFoodCatalogManifestV1,
  reconcileExactFoodIdentitiesV1,
  ReviewedFoodIdentityResolverV1,
} from '@nutrixx/food-knowledge';
import { sha256Canonical } from '@nutrixx/persistence-indexeddb';
import {
  FOOD_COMPONENTS_V1,
  getAdultDriBaselineReleaseV1,
  resolveFoodComponentV1,
} from '@nutrixx/nutrition-engine';

const [
  basePath,
  legacyPath,
  cnfDirectory,
  afcdPath,
  cofidPath,
  ciqualPath,
  outputDirectory,
] = process.argv.slice(2);
if (
  [
    basePath,
    legacyPath,
    cnfDirectory,
    afcdPath,
    cofidPath,
    ciqualPath,
    outputDirectory,
  ].some((x) => !x)
) {
  throw new TypeError(
    'Usage: build-multisource-food-catalog.mjs <base.v1.json.gz> <sr-legacy.json> <cnf-csv-directory> <afcd-extract.json> <cofid-extract.json> <ciqual-extract.json> <output-directory>',
  );
}

const RELEASE_ID = 'food-catalog-us-ca-au-uk-fr-2026.3';
const RELEASE_INSTANT = '2026-10-24T00:00:00.000Z';
const COFID_WORKBOOK_SHA256 =
  '436e9445ef2adb2a75f3d7edd51302de3adad25385f9795fc94ba58bd030e97d';
const AFCD_COLUMNS_SHA256 =
  'de5eb458e2333bd3f675af47e5dc7f847f8d0e611cb5dccaf198c0ea5d301c07';
const CIQUAL_SOURCE_SHA256 = {
  workbook: '2c3495c8136d17356c50db410918da2102cb28096cb497c9cdf83c5f8ecb10ba',
  composition:
    '8c46a9032ece4eab4ffccc9dfcb0c490ec2f416aa664cc1ee013b241c6bdd4af',
  components:
    '3a231ea3e9836e4ac0b6ff94511e010210b2523d1b8b486c6b29e211066ba3f3',
  sources: '73e6a0c573f88c23f23b4670a016c616edea806b3d92340942cdbdb9b4323137',
};
const unzip = promisify(gunzip);
const COMPONENT_BY_ACCESS = new Map(
  FOOD_COMPONENTS_V1.map((component) => [component.accessCode, component]),
);
const AFCD_COLUMNS = [
  [5, 'ENERC_KCAL'],
  [8, 'PROCNT'],
  [10, 'FAT'],
  [12, 'FIBTG'],
  [13, 'ALC'],
  [14, 'FRUS'],
  [15, 'GLUS'],
  [16, 'SUCS'],
  [17, 'MALS'],
  [18, 'LACS'],
  [20, 'SUGAR'],
  [23, 'STARCH'],
  [54, 'AS'],
  [55, 'CD'],
  [56, 'CA'],
  [57, 'CR'],
  [58, 'CL'],
  [60, 'CU'],
  [61, 'F'],
  [62, 'I'],
  [63, 'FE'],
  [64, 'PB'],
  [65, 'MG'],
  [66, 'MN'],
  [67, 'HG'],
  [68, 'MO'],
  [69, 'NI'],
  [70, 'P'],
  [71, 'K'],
  [72, 'SE'],
  [73, 'NA'],
  [76, 'ZN'],
  [77, 'RETOL'],
  [78, 'CARTA'],
  [79, 'CARTB'],
  [80, 'CRYPX'],
  [84, 'LYCO'],
  [86, 'THIA'],
  [87, 'RIBF'],
  [88, 'NIA'],
  [91, 'PANTAC'],
  [93, 'BIOT'],
  [94, 'VITB12'],
  [98, 'FOLDFE'],
  [99, 'VITC'],
  [105, 'TOCPHA'],
  [183, 'PA'],
  [185, 'SA'],
  [192, 'FASAT'],
  [205, 'FAMS'],
  [209, 'LA'],
  [210, 'ALA'],
  [223, 'EPA'],
  [230, 'DHA'],
  [231, 'FAPU'],
  [235, 'CAFFN'],
  [236, 'CHOL'],
  [255, 'ALANINE'],
  [256, 'ARG'],
  [257, 'ASP'],
  [259, 'GLU'],
  [260, 'GLY'],
  [261, 'HIS'],
  [262, 'ILE'],
  [263, 'LEU'],
  [264, 'LYS'],
  [265, 'MET'],
  [266, 'PHE'],
  [267, 'PRO'],
  [268, 'SER'],
  [269, 'THR'],
  [270, 'TYR'],
  [271, 'TRP'],
  [272, 'VAL'],
];
// Only exact, per-100-g-food concepts enter the 112-component registry.
// CoFID available carbohydrate, retinol equivalent, total vitamin E, and
// vitamin K1 are distinct from the corresponding broader USDA concepts.
const COFID_COLUMNS = [
  ['1.3 Proximates', 'WATER', 'WATER', 'g'],
  ['1.3 Proximates', 'PROT', 'PROCNT', 'g'],
  ['1.3 Proximates', 'FAT', 'FAT', 'g'],
  ['1.3 Proximates', 'KCALS', 'ENERC_KCAL', 'kcal'],
  ['1.3 Proximates', 'STAR', 'STARCH', 'g'],
  ['1.3 Proximates', 'TOTSUG', 'SUGAR', 'g'],
  ['1.3 Proximates', 'GLUC', 'GLUS', 'g'],
  ['1.3 Proximates', 'FRUCT', 'FRUS', 'g'],
  ['1.3 Proximates', 'SUCR', 'SUCS', 'g'],
  ['1.3 Proximates', 'MALT', 'MALS', 'g'],
  ['1.3 Proximates', 'LACT', 'LACS', 'g'],
  ['1.3 Proximates', 'ALCO', 'ALC', 'g'],
  ['1.3 Proximates', 'AOACFIB', 'FIBTG', 'g'],
  ['1.3 Proximates', 'SATFOD', 'FASAT', 'g'],
  ['1.3 Proximates', 'TOTn6PFOD', 'FA_O6', 'g'],
  ['1.3 Proximates', 'TOTn3PFOD', 'FA_O3', 'g'],
  ['1.3 Proximates', 'MONOFOD', 'FAMS', 'g'],
  ['1.3 Proximates', 'POLYFOD', 'FAPU', 'g'],
  ['1.3 Proximates', 'FODTRANS', 'FATRN', 'g'],
  ['1.3 Proximates', 'CHOL', 'CHOL', 'mg'],
  ['1.4 Inorganics', 'NA', 'NA', 'mg'],
  ['1.4 Inorganics', 'K', 'K', 'mg'],
  ['1.4 Inorganics', 'CA', 'CA', 'mg'],
  ['1.4 Inorganics', 'MG', 'MG', 'mg'],
  ['1.4 Inorganics', 'P', 'P', 'mg'],
  ['1.4 Inorganics', 'FE', 'FE', 'mg'],
  ['1.4 Inorganics', 'CU', 'CU', 'mg'],
  ['1.4 Inorganics', 'ZN', 'ZN', 'mg'],
  ['1.4 Inorganics', 'CL', 'CL', 'mg'],
  ['1.4 Inorganics', 'MN', 'MN', 'mg'],
  ['1.4 Inorganics', 'SE', 'SE', 'ug'],
  ['1.4 Inorganics', 'I', 'I', 'ug'],
  ['1.5 Vitamins', 'RET', 'RETOL', 'ug'],
  ['1.5 Vitamins', 'VITD', 'VITD', 'ug'],
  ['1.5 Vitamins', 'THIA', 'THIA', 'mg'],
  ['1.5 Vitamins', 'RIBO', 'RIBF', 'mg'],
  ['1.5 Vitamins', 'NIAC', 'NIA', 'mg'],
  ['1.5 Vitamins', 'VITB6', 'VITB6A', 'mg'],
  ['1.5 Vitamins', 'VITB12', 'VITB12', 'ug'],
  ['1.5 Vitamins', 'FOLT', 'FOLDFE', 'ug'],
  ['1.5 Vitamins', 'PANTO', 'PANTAC', 'mg'],
  ['1.5 Vitamins', 'BIOT', 'BIOT', 'ug'],
  ['1.5 Vitamins', 'VITC', 'VITC', 'mg'],
  ['1.6 Vitamin Fractions', 'ACAR', 'CARTA', 'ug'],
  ['1.6 Vitamin Fractions', 'BCAR', 'CARTB', 'ug'],
  ['1.6 Vitamin Fractions', 'LYCO', 'LYCO', 'ug'],
  ['1.6 Vitamin Fractions', 'ATOPH', 'TOCPHA', 'mg'],
  ['1.8 (SFA per 100gFood)', 'FOD16:0', 'PA', 'g'],
  ['1.8 (SFA per 100gFood)', 'FOD18:0', 'SA', 'g'],
  ['1.12 (PUFA per 100gFood)', 'FOD18:2cn6', 'LA', 'g'],
  ['1.12 (PUFA per 100gFood)', 'FOD18:3cn3', 'ALA', 'g'],
  ['1.12 (PUFA per 100gFood)', 'FOD20:5cn3', 'EPA', 'g'],
  ['1.12 (PUFA per 100gFood)', 'FOD22:6cn3', 'DHA', 'g'],
  ['1.13 Phytosterols', 'Total PHYTO', 'PHYTO', 'mg'],
];
// Ciqual codes come from the official 2025 constituent XML. Available
// carbohydrate, retinol equivalents, and broad vitamin K have different
// definitions from the Nutrixx registry and therefore remain unmapped.
const CIQUAL_COMPONENTS = [
  ['328', 'ENERC_KCAL', 'kcal'],
  ['400', 'WATER', 'g'],
  ['10110', 'NA', 'mg'],
  ['10120', 'MG', 'mg'],
  ['10150', 'P', 'mg'],
  ['10170', 'CL', 'mg'],
  ['10190', 'K', 'mg'],
  ['10200', 'CA', 'mg'],
  ['10251', 'MN', 'mg'],
  ['10260', 'FE', 'mg'],
  ['10290', 'CU', 'mg'],
  ['10300', 'ZN', 'mg'],
  ['10340', 'SE', 'ug'],
  ['10530', 'I', 'ug'],
  ['25000', 'PROCNT', 'g'],
  ['32000', 'SUGAR', 'g'],
  ['32210', 'FRUS', 'g'],
  ['32250', 'GLUS', 'g'],
  ['32410', 'LACS', 'g'],
  ['32430', 'MALS', 'g'],
  ['32480', 'SUCS', 'g'],
  ['33110', 'STARCH', 'g'],
  ['34100', 'FIBTG', 'g'],
  ['40000', 'FAT', 'g'],
  ['40302', 'FASAT', 'g'],
  ['40303', 'FAMS', 'g'],
  ['40304', 'FAPU', 'g'],
  ['41600', 'PA', 'g'],
  ['41800', 'SA', 'g'],
  ['41819', 'OA', 'g'],
  ['41826', 'LA', 'g'],
  ['41833', 'ALA', 'g'],
  ['42053', 'EPA', 'g'],
  ['42263', 'DHA', 'g'],
  ['51200', 'RETOL', 'ug'],
  ['51330', 'CARTB', 'ug'],
  ['52100', 'VITD', 'ug'],
  ['55100', 'VITC', 'mg'],
  ['56100', 'THIA', 'mg'],
  ['56200', 'RIBF', 'mg'],
  ['56310', 'NIA', 'mg'],
  ['56400', 'PANTAC', 'mg'],
  ['56500', 'VITB6A', 'mg'],
  ['56600', 'VITB12', 'ug'],
  ['56702', 'FOLDFE', 'ug'],
  ['60000', 'ALC', 'g'],
  ['71010', 'TOCPHA', 'mg'],
  ['75100', 'CHOL', 'mg'],
];
const ACCEPTED_CNF_FOOD_SOURCES = new Set(['0', '1', '3', '4', '6', '12']);
const EXCLUDED_CNF_NUTRIENT_SOURCES = new Set([
  '5',
  '6',
  '8',
  '12',
  '14',
  '15',
  '50',
  '81',
  '82',
  '83',
]);

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += character;
  }
  if (quoted) throw new TypeError('Unclosed CSV quote.');
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const [headers, ...values] = rows;
  if (!headers) throw new TypeError('Empty CSV.');
  headers[0] = headers[0].replace(/^\uFEFF/u, '');
  return values.map((value, index) => {
    if (value.length !== headers.length)
      throw new TypeError(
        `CSV row ${index + 2} has ${value.length} cells, expected ${headers.length}.`,
      );
    return Object.fromEntries(
      headers.map((header, position) => [header, value[position]]),
    );
  });
}

function deterministicId(kind, key) {
  const hash = createHash('sha256')
    .update(`nutrixx:multisource:v1:${kind}:${key}`)
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function decimal(value) {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/u.test(text)) return null;
  const normalized = text
    .replace(/^0+(?=\d)/u, '')
    .replace(/(\.\d*?)0+$/u, '$1')
    .replace(/\.$/u, '');
  return normalized || '0';
}

function convertedAmount(value, sourceUnit, targetUnit) {
  if (!Number.isFinite(value) || value < 0) return null;
  if (sourceUnit === 'kJ' && targetUnit === 'kcal')
    return decimal((value / 4.184).toFixed(6));
  const scale = { kcal: 1, g: 1, mg: 1e-3, ug: 1e-6 };
  if (!(sourceUnit in scale) || !(targetUnit in scale)) return null;
  if (sourceUnit === 'kcal' || targetUnit === 'kcal') {
    return sourceUnit === targetUnit ? decimal(value) : null;
  }
  if (sourceUnit === targetUnit) return decimal(value);
  const result = (value * scale[sourceUnit]) / scale[targetUnit];
  return decimal(result.toFixed(12));
}

function claimKey(food, component) {
  return `${food.foodId}:${food.revision}:${component.componentId}`;
}

function addSource(
  payload,
  provider,
  dataset,
  sourceRelease,
  recordId,
  licenseId,
  sourceReference = null,
) {
  const sourceId = deterministicId(
    'source',
    `${provider}:${dataset}:${sourceRelease}:${recordId}`,
  );
  payload.sources.push({
    sourceId,
    provider,
    dataset,
    sourceRelease,
    sourceRecordId: recordId,
    ...(sourceReference ? { sourceReference } : {}),
    licenseId,
    retrievedAt: RELEASE_INSTANT,
  });
  return sourceId;
}

function addFood(payload, provider, recordId, name, category, sourceId) {
  const foodId = deterministicId('food', `${provider}:${recordId}`);
  const food = {
    foodId,
    revision: 1,
    foodClass: `${provider}.food`,
    descriptions: [
      { locale: 'en', value: name.slice(0, 500), kind: 'primary' },
    ],
    categories: category
      ? [{ locale: 'en', description: category.slice(0, 500) }]
      : [],
    preparationStates: ['unspecified'],
    sourceId,
  };
  payload.foods.push(food);
  payload.portions.push({
    portionId: deterministicId('portion', `${provider}:${recordId}:100g`),
    foodId,
    foodRevision: 1,
    description: {
      locale: 'en',
      value: '100 g edible portion',
      kind: 'primary',
    },
    amount: '100',
    measureUnit: { system: 'ucum', code: 'g' },
    gramWeight: '100',
    edibleFraction: '1',
    sourceId,
  });
  return food;
}

function addFoodIdentityLink(food, sourceId, matchBasis) {
  if (food.sourceId === sourceId) return;
  const links = (food.sourceIdentityLinks ??= []);
  if (links.some((link) => link.sourceId === sourceId)) {
    throw new TypeError(`Repeated food identity source: ${sourceId}.`);
  }
  links.push({ sourceId, matchBasis });
}

function addObservation(
  payload,
  known,
  food,
  component,
  sourceId,
  sourceNutrientId,
  sourceNutrientName,
  amount,
  derivationCode,
  dataPoints,
  evidence = null,
) {
  const key = claimKey(food, component);
  if (known.has(key)) return false;
  const observationId = deterministicId(
    'observation',
    `${food.foodId}:${component.componentId}:${sourceId}`,
  );
  payload.composition.push({
    observationId,
    foodId: food.foodId,
    foodRevision: food.revision,
    nutrientId: component.componentId,
    sourceNutrientId,
    sourceNutrientName: sourceNutrientName.slice(0, 500),
    ...(derivationCode === null ? {} : { derivationCode }),
    ...(dataPoints === null ? {} : { dataPoints }),
    ...(evidence?.sourceConfidenceCode
      ? { sourceConfidenceCode: evidence.sourceConfidenceCode }
      : {}),
    preparationState: 'unspecified',
    value: {
      state: 'known',
      amount,
      unit: { system: 'ucum', code: component.unit },
      basis: 'per-100-gram-edible',
    },
    sourceId,
    quality: [],
  });
  known.add(key);
  return true;
}

const compressed = await readFile(basePath);
const base = JSON.parse((await unzip(compressed)).toString('utf8'));
let payload = base.payload;
const sourceById = new Map(
  payload.sources.map((source) => [source.sourceId, source]),
);
const reviewedIdentity = new ReviewedFoodIdentityResolverV1(
  JSON.parse(
    await readFile(
      new URL('./food-identity-links.json', import.meta.url),
      'utf8',
    ),
  ),
);
for (const food of payload.foods) {
  const source = sourceById.get(food.sourceId);
  if (source) {
    reviewedIdentity.register(
      source.provider,
      source.sourceRecordId,
      food.descriptions[0].value,
      food,
    );
  }
}
const foodByFdcId = new Map(
  payload.foods.map((food) => [
    sourceById.get(food.sourceId)?.sourceRecordId,
    food,
  ]),
);
const originalFoodIds = new Set(payload.foods.map((food) => food.foodId));
const known = new Set();
for (const observation of payload.composition) {
  if (observation.value.state !== 'known') continue;
  const componentId = resolveFoodComponentV1(
    observation.nutrientId,
    observation.value.unit.code,
  );
  if (componentId)
    known.add(
      `${observation.foodId}:${observation.foodRevision}:${componentId}`,
    );
}
const baselineTargetIds = getAdultDriBaselineReleaseV1().rules.map(
  (rule) => rule.nutrientId,
);
const evaluatedAt = RELEASE_INSTANT;
const before = auditFoodDataQualityV1({
  manifest: base.manifest,
  payload,
  components: FOOD_COMPONENTS_V1,
  baselineTargetIds,
  evaluatedAt,
});
const originalKnownPairs = () =>
  [...known].filter((key) =>
    originalFoodIds.has(key.slice(0, key.indexOf(':'))),
  ).length;
const originalBefore = originalKnownPairs();

const rawLegacy = JSON.parse(await readFile(legacyPath, 'utf8')).SRLegacyFoods;
const byNdb = new Map();
const nutrientNumberByFdcId = new Map();
for (const food of rawLegacy) {
  const ndb = String(Number(food.ndbNumber));
  const entries = byNdb.get(ndb) ?? [];
  entries.push(String(food.fdcId));
  byNdb.set(ndb, entries);
  for (const item of food.foodNutrients ?? []) {
    if (item.nutrient?.id && item.nutrient?.number)
      nutrientNumberByFdcId.set(
        String(item.nutrient.id),
        String(item.nutrient.number),
      );
  }
}
const componentByCnfCode = new Map();
const ambiguousCnfCodes = new Set();
for (const component of FOOD_COMPONENTS_V1) {
  for (const fdcId of component.usdaFdcNutrientIds) {
    const code = nutrientNumberByFdcId.get(fdcId);
    if (!code) continue;
    const existing = componentByCnfCode.get(code);
    if (existing && existing.componentId !== component.componentId)
      ambiguousCnfCodes.add(code);
    else componentByCnfCode.set(code, component);
  }
}
for (const code of ambiguousCnfCodes) componentByCnfCode.delete(code);

const readCnf = async (name) =>
  parseCsv(await readFile(path.join(cnfDirectory, name), 'utf8'));
const cnfFoods = await readCnf('Food_Name.csv');
const cnfNutrients = new Map(
  (await readCnf('Nutrient_Name.csv')).map((row) => [row.Nutrient_Code, row]),
);
const cnfGroups = new Map(
  (await readCnf('CNF_Food_Group.csv')).map((row) => [
    row.CNF_Food_Group_Code,
    row.CNF_Food_Group_Description_EN,
  ]),
);
const cnfByNdb = new Map();
for (const food of cnfFoods) {
  if (!food.USDA_NDB_Code) continue;
  const ndb = String(Number(food.USDA_NDB_Code));
  cnfByNdb.set(ndb, (cnfByNdb.get(ndb) ?? 0) + 1);
}
const cnfFoodByCode = new Map();
const cnfStats = {
  foods: cnfFoods.length,
  linkedFoods: 0,
  reviewedLinkedFoods: 0,
  addedFoods: 0,
  observations: 0,
  excludedAssumedZeros: 0,
  excludedSources: 0,
  excludedUnit: 0,
};
for (const row of cnfFoods) {
  const ndb = row.USDA_NDB_Code ? String(Number(row.USDA_NDB_Code)) : '';
  const linkedId =
    ndb &&
    cnfByNdb.get(ndb) === 1 &&
    byNdb.get(ndb)?.length === 1 &&
    ACCEPTED_CNF_FOOD_SOURCES.has(row.Food_Source_Code)
      ? byNdb.get(ndb)[0]
      : null;
  const linked = linkedId ? foodByFdcId.get(linkedId) : null;
  const reviewed = reviewedIdentity.resolve(
    'health-canada',
    row.Food_Code,
    row.Food_Description_EN,
  );
  if (linked && reviewed && linked.foodId !== reviewed.foodId) {
    throw new TypeError(`Conflicting CNF identity: ${row.Food_Code}.`);
  }
  const sourceId = addSource(
    payload,
    'health-canada',
    'cnf',
    '2026',
    row.Food_Code,
    'source-terms-unverified',
  );
  const food =
    linked ??
    reviewed ??
    addFood(
      payload,
      'health-canada',
      row.Food_Code,
      row.Food_Description_EN,
      cnfGroups.get(row.CNF_Food_Group_Code),
      sourceId,
    );
  if (linked) addFoodIdentityLink(food, sourceId, 'official-crosswalk');
  else if (reviewed) {
    addFoodIdentityLink(food, sourceId, 'reviewed-food-identity');
    cnfStats.reviewedLinkedFoods += 1;
  }
  cnfStats[linked || reviewed ? 'linkedFoods' : 'addedFoods'] += 1;
  reviewedIdentity.register(
    'health-canada',
    row.Food_Code,
    row.Food_Description_EN,
    food,
  );
  cnfFoodByCode.set(row.Food_Code, { food, sourceId });
}
for (const row of await readCnf('Nutrient_Amount.csv')) {
  const match = cnfFoodByCode.get(row.Food_Code);
  const definition = cnfNutrients.get(row.Nutrient_Code);
  const component = componentByCnfCode.get(row.Nutrient_Code);
  if (!match || !definition || !component) continue;
  if (EXCLUDED_CNF_NUTRIENT_SOURCES.has(row.Nutrient_Source_Code)) {
    if (row.Nutrient_Source_Code === '12') cnfStats.excludedAssumedZeros += 1;
    else cnfStats.excludedSources += 1;
    continue;
  }
  const units = {
    Gram: 'g',
    Milligram: 'mg',
    Microgram: 'ug',
    kilocalorie: 'kcal',
  };
  const amount = decimal(row.Nutrient_Amount);
  if (!amount || units[definition.Nutrient_Unit] !== component.unit) {
    cnfStats.excludedUnit += 1;
    continue;
  }
  const observations = Number(row.Observations);
  if (
    addObservation(
      payload,
      known,
      match.food,
      component,
      match.sourceId,
      row.Nutrient_Code,
      definition.Nutrient_Name_EN,
      amount,
      `cnf-source-${row.Nutrient_Source_Code}`,
      Number.isInteger(observations) && observations >= 0 ? observations : null,
    )
  )
    cnfStats.observations += 1;
}
const afterCnfManifest = deriveFoodCatalogManifestV1(
  {
    ...base.manifest,
    releaseId: 'food-catalog-us-ca-2026.1',
    publishedAt: RELEASE_INSTANT,
    sourceDatasets: [
      ...base.manifest.sourceDatasets,
      {
        provider: 'health-canada',
        dataset: 'cnf',
        sourceRelease: '2026',
        licenseId: 'source-terms-unverified',
        homepage:
          'https://open.canada.ca/data/en/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109',
      },
    ],
  },
  payload,
);
const afterCanada = auditFoodDataQualityV1({
  manifest: afterCnfManifest,
  payload,
  components: FOOD_COMPONENTS_V1,
  baselineTargetIds,
  evaluatedAt,
});
const originalAfterCanada = originalKnownPairs();

const afcd = JSON.parse(await readFile(afcdPath, 'utf8'));
if (
  afcd.format !== 'nutrixx.afcd-source-extract' ||
  afcd.release !== '3' ||
  afcd.foods.length !== 1588
)
  throw new TypeError('Unexpected AFCD Release 3 extract.');
if (
  createHash('sha256').update(JSON.stringify(afcd.columns)).digest('hex') !==
  AFCD_COLUMNS_SHA256
)
  throw new TypeError(
    'AFCD nutrient columns differ from the reviewed Release 3 mapping.',
  );
for (const [column, accessCode] of AFCD_COLUMNS) {
  const header = afcd.columns[String(column)];
  const component = COMPONENT_BY_ACCESS.get(accessCode);
  if (!header || !component)
    throw new TypeError(`Missing AFCD mapping ${column}: ${accessCode}.`);
  const unit = /\((kJ|kcal|mg|ug|g)\)\s*$/u.exec(
    header.replace(/\s+/gu, ' '),
  )?.[1];
  if (!unit || convertedAmount(1, unit, component.unit) === null)
    throw new TypeError(`Incompatible AFCD mapping ${column}: ${accessCode}.`);
}
const afcdStats = {
  foods: afcd.foods.length,
  linkedFoods: 0,
  reviewedLinkedFoods: 0,
  addedFoods: 0,
  observations: 0,
  excludedZeros: 0,
  excludedUncertainLinks: 0,
};
for (const row of afcd.foods) {
  const fdcIds = [
    ...String(row.samplingDetails ?? '').matchAll(
      /\bFDC\s*ID\s*(\d{5,7})\b/giu,
    ),
  ].map((match) => match[1]);
  const uniqueIds = [...new Set(fdcIds)];
  const linked =
    row.derivation === 'Borrowed' && uniqueIds.length === 1
      ? foodByFdcId.get(uniqueIds[0])
      : null;
  const reviewed = reviewedIdentity.resolve('fsanz', row.key, row.name);
  if (linked && reviewed && linked.foodId !== reviewed.foodId) {
    throw new TypeError(`Conflicting AFCD identity: ${row.key}.`);
  }
  if (uniqueIds.length > 0 && !linked) afcdStats.excludedUncertainLinks += 1;
  const sourceId = addSource(
    payload,
    'fsanz',
    'afcd-release-3',
    '2025-12',
    row.key,
    'source-terms-unverified',
  );
  const food =
    linked ??
    reviewed ??
    addFood(payload, 'fsanz', row.key, row.name, null, sourceId);
  if (linked) addFoodIdentityLink(food, sourceId, 'source-declared-identifier');
  else if (reviewed) {
    addFoodIdentityLink(food, sourceId, 'reviewed-food-identity');
    afcdStats.reviewedLinkedFoods += 1;
  }
  afcdStats[linked || reviewed ? 'linkedFoods' : 'addedFoods'] += 1;
  reviewedIdentity.register('fsanz', row.key, row.name, food);
  for (const [column, accessCode] of AFCD_COLUMNS) {
    const value = row.values[String(column)];
    if (typeof value !== 'number' || value < 0 || !Number.isFinite(value))
      continue;
    // AFCD identifies many zeroes as imputed but does not provide a per-cell flag.
    if (value === 0) {
      afcdStats.excludedZeros += 1;
      continue;
    }
    const component = COMPONENT_BY_ACCESS.get(accessCode);
    const header = afcd.columns[String(column)].replace(/\s+/gu, ' ').trim();
    const unit = /\((kJ|kcal|mg|ug|g)\)\s*$/u.exec(header)[1];
    const amount = convertedAmount(value, unit, component.unit);
    if (!amount) continue;
    if (
      addObservation(
        payload,
        known,
        food,
        component,
        sourceId,
        `column-${column}`,
        header,
        amount,
        null,
        null,
      )
    )
      afcdStats.observations += 1;
  }
}

// A known value from a precisely linked source supersedes an unknown USDA cell.
function removeSupersededUnknowns() {
  payload.composition = payload.composition.filter((observation) => {
    if (observation.value.state !== 'unknown') return true;
    const component = FOOD_COMPONENTS_V1.find(
      (item) =>
        item.componentId === observation.nutrientId ||
        item.usdaFdcNutrientIds.some(
          (id) => `source.usda-fdc.${id}` === observation.nutrientId,
        ),
    );
    return (
      !component ||
      !known.has(
        `${observation.foodId}:${observation.foodRevision}:${component.componentId}`,
      )
    );
  });
}
removeSupersededUnknowns();

const manifest = deriveFoodCatalogManifestV1(
  {
    ...afterCnfManifest,
    releaseId: RELEASE_ID,
    sourceDatasets: [
      ...afterCnfManifest.sourceDatasets,
      {
        provider: 'fsanz',
        dataset: 'afcd-release-3',
        sourceRelease: '2025-12',
        licenseId: 'source-terms-unverified',
        homepage:
          'https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd/data-files',
      },
    ],
  },
  payload,
);
const afterAustralia = auditFoodDataQualityV1({
  manifest,
  payload,
  components: FOOD_COMPONENTS_V1,
  baselineTargetIds,
  evaluatedAt,
});
const originalAfterAustralia = originalKnownPairs();
const cofid = JSON.parse(await readFile(cofidPath, 'utf8'));
if (
  cofid.format !== 'nutrixx.cofid-source-extract' ||
  cofid.release !== '2021' ||
  cofid.sourceSha256 !== COFID_WORKBOOK_SHA256 ||
  cofid.foods.length !== 2887 ||
  JSON.stringify(cofid.duplicateFoodCodes) !== '["13-669"]'
)
  throw new TypeError('Unexpected CoFID 2021 extract.');
for (const [sheet, sourceCode, accessCode, unit] of COFID_COLUMNS) {
  const key = `${sheet}:${sourceCode}`;
  const component = COMPONENT_BY_ACCESS.get(accessCode);
  if (!cofid.columns[key] || !component || component.unit !== unit)
    throw new TypeError(`Incompatible CoFID mapping: ${key} to ${accessCode}.`);
}
const cofidStats = {
  foods: cofid.foods.length,
  linkedFoods: 0,
  addedFoods: 0,
  observations: 0,
  excludedVolumeBasisFoods: 0,
  excludedNonNumericValues: 0,
  duplicateFoodCodes: cofid.duplicateFoodCodes,
};
for (const row of cofid.foods) {
  // CoFID specifies alcoholic beverage observations per 100 ml. There is no
  // universal gram conversion, so exclude the entire Q group from this release.
  if (String(row.group).startsWith('Q')) {
    cofidStats.excludedVolumeBasisFoods += 1;
    continue;
  }
  const sourceId = addSource(
    payload,
    'public-health-england',
    'cofid',
    '2021',
    row.key,
    'uk-ogl-3.0',
  );
  const reviewed = reviewedIdentity.resolve(
    'public-health-england',
    row.key,
    row.name,
  );
  const food =
    reviewed ??
    addFood(
      payload,
      'public-health-england',
      row.key,
      row.name,
      `CoFID group ${row.group}`,
      sourceId,
    );
  if (reviewed) addFoodIdentityLink(food, sourceId, 'reviewed-food-identity');
  cofidStats[reviewed ? 'linkedFoods' : 'addedFoods'] += 1;
  reviewedIdentity.register('public-health-england', row.key, row.name, food);
  for (const [sheet, sourceCode, accessCode, unit] of COFID_COLUMNS) {
    const key = `${sheet}:${sourceCode}`;
    const raw = row.values[key];
    if (raw === undefined) continue;
    const amount = decimal(raw);
    if (amount === null) {
      cofidStats.excludedNonNumericValues += 1;
      continue;
    }
    const component = COMPONENT_BY_ACCESS.get(accessCode);
    if (component.unit !== unit)
      throw new TypeError(`CoFID unit changed: ${key}.`);
    if (
      addObservation(
        payload,
        known,
        food,
        component,
        sourceId,
        key,
        cofid.columns[key],
        amount,
        null,
        null,
      )
    )
      cofidStats.observations += 1;
  }
}
removeSupersededUnknowns();
const unitedKingdomManifest = deriveFoodCatalogManifestV1(
  {
    ...manifest,
    releaseId: RELEASE_ID,
    publishedAt: RELEASE_INSTANT,
    sourceDatasets: [
      ...manifest.sourceDatasets,
      {
        provider: 'public-health-england',
        dataset: 'cofid',
        sourceRelease: '2021',
        licenseId: 'uk-ogl-3.0',
        homepage:
          'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid',
      },
    ],
  },
  payload,
);
const afterUnitedKingdom = auditFoodDataQualityV1({
  manifest: unitedKingdomManifest,
  payload,
  components: FOOD_COMPONENTS_V1,
  baselineTargetIds,
  evaluatedAt,
});
const originalAfterUnitedKingdom = originalKnownPairs();
const ciqual = JSON.parse(await readFile(ciqualPath, 'utf8'));
if (
  ciqual.format !== 'nutrixx.ciqual-source-extract' ||
  ciqual.release !== '2025' ||
  JSON.stringify(ciqual.sourceSha256) !==
    JSON.stringify(CIQUAL_SOURCE_SHA256) ||
  ciqual.foods.length !== 3484 ||
  ciqual.counts.xmlRows !== 257816
)
  throw new TypeError('Unexpected Ciqual 2025 extract.');
for (const [sourceCode, accessCode, unit] of CIQUAL_COMPONENTS) {
  const sourceComponent = ciqual.components[sourceCode];
  const component = COMPONENT_BY_ACCESS.get(accessCode);
  const sourceUnit = sourceComponent?.name.match(
    /\(([^()]*)\/100\s?g\)\s*$/u,
  )?.[1];
  if (
    !sourceComponent?.name ||
    !component ||
    component.unit !== unit ||
    !(unit === 'ug'
      ? ['ug', 'µg', 'μg', '�g'].includes(sourceUnit)
      : sourceUnit === unit)
  )
    throw new TypeError(
      `Incompatible Ciqual mapping: ${sourceCode} to ${accessCode}.`,
    );
}
const ciqualStats = {
  foods: ciqual.foods.length,
  linkedFoods: 0,
  addedFoods: 0,
  observations: 0,
  unquantified: 0,
  mappedComponents: CIQUAL_COMPONENTS.length,
  confidenceCodes: { A: 0, B: 0, C: 0, D: 0 },
};
const ciqualEvidenceSources = new Map();
function ciqualObservationSourceId(value, foodSourceId) {
  if (!value.sourceCode) return foodSourceId;
  const existing = ciqualEvidenceSources.get(value.sourceCode);
  if (existing) return existing;
  const sourceId = addSource(
    payload,
    'anses-ciqual',
    'ciqual',
    '2025',
    `source:${value.sourceCode}`,
    'fr-etalab-open-license-2.0',
    ciqual.sources[value.sourceCode],
  );
  ciqualEvidenceSources.set(value.sourceCode, sourceId);
  return sourceId;
}
for (const row of ciqual.foods) {
  const sourceId = addSource(
    payload,
    'anses-ciqual',
    'ciqual',
    '2025',
    row.code,
    'fr-etalab-open-license-2.0',
  );
  const reviewed = reviewedIdentity.resolve('anses-ciqual', row.code, row.name);
  const food =
    reviewed ??
    addFood(payload, 'anses-ciqual', row.code, row.name, row.group, sourceId);
  if (reviewed) addFoodIdentityLink(food, sourceId, 'reviewed-food-identity');
  ciqualStats[reviewed ? 'linkedFoods' : 'addedFoods'] += 1;
  reviewedIdentity.register('anses-ciqual', row.code, row.name, food);
  for (const [sourceCode, accessCode] of CIQUAL_COMPONENTS) {
    const value = row.values[sourceCode];
    if (!value) continue;
    const amount = decimal(value.raw.replace(',', '.'));
    if (amount === null) {
      ciqualStats.unquantified += 1;
      continue;
    }
    const evidence = {
      sourceConfidenceCode: value.confidence,
    };
    if (
      addObservation(
        payload,
        known,
        food,
        COMPONENT_BY_ACCESS.get(accessCode),
        ciqualObservationSourceId(value, sourceId),
        sourceCode,
        ciqual.components[sourceCode].name,
        amount,
        null,
        null,
        evidence,
      )
    ) {
      ciqualStats.observations += 1;
      if (value.confidence in ciqualStats.confidenceCodes)
        ciqualStats.confidenceCodes[value.confidence] += 1;
    }
  }
}
removeSupersededUnknowns();
const reviewedIdentityStats = reviewedIdentity.assertComplete(
  new Set(payload.sources.map((source) => source.provider)),
);
const originalAfterFrance = originalKnownPairs();
const identityReconciliation = reconcileExactFoodIdentitiesV1(payload, {
  sourceOrder: reviewedIdentity.sourceOrder,
  canonicalFoodId: (identitySignature) =>
    deterministicId('canonical-food', identitySignature),
});
payload = identityReconciliation.payload;
const pendingBySourceId = new Map();
for (const pending of reviewedIdentity.pending) {
  const source = payload.sources.find(
    (candidate) =>
      candidate.provider === pending.provider &&
      candidate.sourceRecordId === pending.sourceRecordId,
  );
  if (!source) continue;
  pendingBySourceId.set(source.sourceId, pending);
}
const excludedFoodKeys = new Set();
const identityReviewItems = [];
for (const food of payload.foods) {
  const pendingSourceIds = [
    food.sourceId,
    ...(food.sourceIdentityLinks ?? []).map((link) => link.sourceId),
  ].filter((sourceId) => pendingBySourceId.has(sourceId));
  if (pendingSourceIds.length === 0) continue;
  for (const sourceId of pendingSourceIds) {
    const pending = pendingBySourceId.get(sourceId);
    identityReviewItems.push({
      provider: pending.provider,
      sourceRecordId: pending.sourceRecordId,
      sourceName: pending.sourceName,
      reason: pending.reason,
      candidateSourceRecords: pending.candidateSourceRecords,
    });
  }
  const usableLinks = (food.sourceIdentityLinks ?? []).filter(
    (link) => !pendingBySourceId.has(link.sourceId),
  );
  if (pendingBySourceId.has(food.sourceId)) {
    const promoted = usableLinks.sort((left, right) => {
      const leftSource = payload.sources.find(
        (source) => source.sourceId === left.sourceId,
      );
      const rightSource = payload.sources.find(
        (source) => source.sourceId === right.sourceId,
      );
      return compareFoodSourcePriorityV1(
        leftSource?.provider ?? '',
        rightSource?.provider ?? '',
        reviewedIdentity.sourceOrder,
      );
    })[0];
    if (!promoted) {
      excludedFoodKeys.add(`${food.foodId}:${food.revision}`);
      continue;
    }
    food.sourceId = promoted.sourceId;
    food.sourceIdentityLinks = usableLinks.filter(
      (link) => link.sourceId !== promoted.sourceId,
    );
  } else food.sourceIdentityLinks = usableLinks;
}
payload.foods = payload.foods.filter(
  (food) => !excludedFoodKeys.has(`${food.foodId}:${food.revision}`),
);
payload.portions = payload.portions.filter(
  (portion) =>
    !pendingBySourceId.has(portion.sourceId) &&
    !excludedFoodKeys.has(`${portion.foodId}:${portion.foodRevision}`),
);
payload.composition = payload.composition.filter(
  (observation) =>
    !pendingBySourceId.has(observation.sourceId) &&
    !excludedFoodKeys.has(`${observation.foodId}:${observation.foodRevision}`),
);
payload.sources = payload.sources.filter(
  (source) => !pendingBySourceId.has(source.sourceId),
);
const identityReview = {
  format: 'nutrixx.food-identity-review',
  schemaVersion: 1,
  releaseId: RELEASE_ID,
  generatedAt: evaluatedAt,
  blocksPublication: false,
  items: identityReviewItems,
};
const finalManifest = deriveFoodCatalogManifestV1(
  {
    ...unitedKingdomManifest,
    sourceDatasets: [
      ...unitedKingdomManifest.sourceDatasets,
      {
        provider: 'anses-ciqual',
        dataset: 'ciqual',
        sourceRelease: '2025',
        licenseId: 'fr-etalab-open-license-2.0',
        homepage: 'https://ciqual.anses.fr/cms/en/2025-anses-ciqual-table',
      },
    ],
  },
  payload,
);
const afterFrance = auditFoodDataQualityV1({
  manifest: finalManifest,
  payload,
  components: FOOD_COMPONENTS_V1,
  baselineTargetIds,
  evaluatedAt,
});
const finalSourceById = new Map(
  payload.sources.map((source) => [source.sourceId, source]),
);
const identityLinkCounts = {
  foodsWithMultipleSources: 0,
  officialCrosswalk: 0,
  sourceDeclaredIdentifier: 0,
  reviewedFoodIdentity: 0,
  exactIdentitySignature: 0,
};
for (const food of payload.foods) {
  const links = food.sourceIdentityLinks ?? [];
  if (links.length > 0) identityLinkCounts.foodsWithMultipleSources += 1;
  const primary = finalSourceById.get(food.sourceId);
  for (const link of links) {
    const secondary = finalSourceById.get(link.sourceId);
    if (
      !primary ||
      !secondary ||
      compareFoodSourcePriorityV1(
        primary.provider,
        secondary.provider,
        reviewedIdentity.sourceOrder,
      ) > 0
    ) {
      throw new TypeError(`Invalid source priority for food ${food.foodId}.`);
    }
    if (link.matchBasis === 'official-crosswalk')
      identityLinkCounts.officialCrosswalk += 1;
    else if (link.matchBasis === 'source-declared-identifier')
      identityLinkCounts.sourceDeclaredIdentifier += 1;
    else if (link.matchBasis === 'exact-identity-signature')
      identityLinkCounts.exactIdentitySignature += 1;
    else identityLinkCounts.reviewedFoodIdentity += 1;
  }
}
await mkdir(outputDirectory, { recursive: true });
const report = {
  format: 'nutrixx.multisource-integration-report',
  releaseId: RELEASE_ID,
  evaluatedAt,
  inputSha256: {
    base: createHash('sha256').update(compressed).digest('hex'),
    cnfFoodName: createHash('sha256')
      .update(await readFile(path.join(cnfDirectory, 'Food_Name.csv')))
      .digest('hex'),
    cnfNutrientAmount: createHash('sha256')
      .update(await readFile(path.join(cnfDirectory, 'Nutrient_Amount.csv')))
      .digest('hex'),
    afcdExtract: createHash('sha256')
      .update(await readFile(afcdPath))
      .digest('hex'),
    afcdFoodDetails: afcd.sourceSha256?.foodDetails ?? null,
    afcdNutrientProfiles: afcd.sourceSha256?.nutrientProfiles ?? null,
    cofidExtract: createHash('sha256')
      .update(await readFile(cofidPath))
      .digest('hex'),
    cofidWorkbook: cofid.sourceSha256,
    ciqualExtract: createHash('sha256')
      .update(await readFile(ciqualPath))
      .digest('hex'),
    ciqualOfficialFiles: ciqual.sourceSha256,
  },
  reviewedIdentity: reviewedIdentityStats,
  identityReconciliation: {
    exactGroups: identityReconciliation.exactLinks.length,
    mergedRecords: identityReconciliation.exactLinks.reduce(
      (total, link) => total + Math.max(0, link.mergedFoodIds.length - 1),
      0,
    ),
  },
  identityReview,
  identityLinkCounts,
  stages: [
    {
      source: 'USDA',
      ...summary(before, originalBefore, originalFoodIds.size),
    },
    {
      source: 'Canada CNF 2026',
      ...summary(afterCanada, originalAfterCanada, originalFoodIds.size),
      integration: cnfStats,
    },
    {
      source: 'Australia AFCD 3',
      ...summary(afterAustralia, originalAfterAustralia, originalFoodIds.size),
      integration: afcdStats,
    },
    {
      source: 'United Kingdom CoFID 2021',
      ...summary(
        afterUnitedKingdom,
        originalAfterUnitedKingdom,
        originalFoodIds.size,
      ),
      integration: cofidStats,
    },
    {
      source: 'France Ciqual 2025',
      ...summary(afterFrance, originalAfterFrance, originalFoodIds.size),
      integration: ciqualStats,
    },
  ],
  coverageByComponent: FOOD_COMPONENTS_V1.map((component) => ({
    componentId: component.componentId,
    name: component.name,
    usda:
      before.rows.find((row) => row.componentId === component.componentId)
        ?.knownFoods ?? 0,
    canada:
      afterCanada.rows.find((row) => row.componentId === component.componentId)
        ?.knownFoods ?? 0,
    australia:
      afterAustralia.rows.find(
        (row) => row.componentId === component.componentId,
      )?.knownFoods ?? 0,
    unitedKingdom:
      afterUnitedKingdom.rows.find(
        (row) => row.componentId === component.componentId,
      )?.knownFoods ?? 0,
    france:
      afterFrance.rows.find((row) => row.componentId === component.componentId)
        ?.knownFoods ?? 0,
  })),
};
await writeFile(
  path.join(outputDirectory, `${RELEASE_ID}.comparison.json`),
  `${JSON.stringify(report, null, 2)}\n`,
);
const release = await createFoodCatalogReleaseV1({
  manifest: finalManifest,
  payload,
  hash: sha256Canonical,
});
const baseName = `${RELEASE_ID}.v1.json`;
const artifactPath = path.join(outputDirectory, `${baseName}.gz`);
const plainPath = path.join(outputDirectory, baseName);
await writeFile(plainPath, JSON.stringify(release), { flag: 'wx' });
await pipeline(
  createReadStream(plainPath),
  createGzip({ level: 9 }),
  createWriteStream(artifactPath, { flags: 'wx' }),
);
await unlink(plainPath);
const artifact = await readFile(artifactPath);
const receipt = {
  releaseId: RELEASE_ID,
  artifact: path.basename(artifactPath),
  compressedByteLength: artifact.length,
  artifactSha256: createHash('sha256').update(artifact).digest('hex'),
  uncompressedPayloadByteLength: release.byteLength,
  manifest: finalManifest,
  manifestSha256: release.manifestSha256,
  payloadSha256: release.payloadSha256,
  identityReview,
};
await writeFile(
  path.join(outputDirectory, `${RELEASE_ID}.receipt.json`),
  `${JSON.stringify(receipt, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      comparison: report.stages,
      artifact: artifactPath,
      artifactSha256: receipt.artifactSha256,
    },
    null,
    2,
  ),
);

function summary(audit, originalKnown, originalFoods) {
  return {
    foods: audit.latestFoods,
    knownFoodComponentPairs: audit.knownFoodComponentPairs,
    possibleFoodComponentPairs: audit.possibleFoodComponentPairs,
    coverageScore: audit.coverageScore,
    originalFoodKnownPairs: originalKnown,
    originalFoodCoverageScore:
      Math.round(
        (10000 * originalKnown) / (originalFoods * FOOD_COMPONENTS_V1.length),
      ) / 100,
    tracedObservations: audit.tracedObservations,
  };
}
