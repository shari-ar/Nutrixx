import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { createGzip, gunzip } from 'node:zlib';

import {
  auditFoodDataQualityV1,
  createFoodCatalogReleaseV1,
  deriveFoodCatalogManifestV1,
} from '@nutrixx/food-knowledge';
import { sha256Canonical } from '@nutrixx/persistence-indexeddb';
import {
  FOOD_COMPONENTS_V1,
  getAdultDriBaselineReleaseV1,
  resolveFoodComponentV1,
} from '@nutrixx/nutrition-engine';

const [basePath, legacyPath, cnfDirectory, afcdPath, outputDirectory] =
  process.argv.slice(2);
if (
  [basePath, legacyPath, cnfDirectory, afcdPath, outputDirectory].some(
    (x) => !x,
  )
) {
  throw new TypeError(
    'Usage: build-multisource-food-catalog.mjs <base.v1.json.gz> <sr-legacy.json> <cnf-csv-directory> <afcd-extract.json> <output-directory>',
  );
}

const RELEASE_ID = 'food-catalog-us-ca-au-2026.1';
const RELEASE_INSTANT = '2026-10-21T04:05:56.904Z';
const AFCD_COLUMNS_SHA256 =
  'de5eb458e2333bd3f675af47e5dc7f847f8d0e611cb5dccaf198c0ea5d301c07';
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
const payload = base.payload;
const sourceById = new Map(
  payload.sources.map((source) => [source.sourceId, source]),
);
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
    addFood(
      payload,
      'health-canada',
      row.Food_Code,
      row.Food_Description_EN,
      cnfGroups.get(row.CNF_Food_Group_Code),
      sourceId,
    );
  cnfStats[linked ? 'linkedFoods' : 'addedFoods'] += 1;
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
    linked ?? addFood(payload, 'fsanz', row.key, row.name, null, sourceId);
  afcdStats[linked ? 'linkedFoods' : 'addedFoods'] += 1;
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

// Unknown USDA observations are superseded by a known, precisely mapped source value.
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
  },
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
  })),
};
await writeFile(
  path.join(outputDirectory, `${RELEASE_ID}.comparison.json`),
  `${JSON.stringify(report, null, 2)}\n`,
);
const release = await createFoodCatalogReleaseV1({
  manifest,
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
  manifest,
  manifestSha256: release.manifestSha256,
  payloadSha256: release.payloadSha256,
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
