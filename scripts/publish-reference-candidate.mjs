import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

import { sha256Canonical } from '@nutrixx/persistence-indexeddb';
import {
  createFoodCatalogReleaseV1,
  deriveFoodCatalogManifestV1,
  FoodCatalogPayloadV1Schema,
} from '@nutrixx/food-knowledge';
import { FOOD_COMPONENTS_V1 } from '@nutrixx/nutrition-engine';

import { buildReferenceCandidateV1 } from './build-reference-candidate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultCatalog = path.join(
  root,
  'apps/web/public/catalog/food-catalog-usda-2026-04-30.1.v1.json.gz',
);
const defaultOutput = path.join(root, '.temp/reference-publication');
const publicCatalog = path.join(root, 'apps/web/public/catalog');
const activeConfig = path.join(
  root,
  'apps/web/config/active-food-catalog.json',
);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function idFor(kind, value) {
  const hex = hash(`nutrixx:reviewed-reference:v1:${kind}:${value}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function writeImmutable(filename, bytes) {
  try {
    await writeFile(filename, bytes, { flag: 'wx' });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    if (!(await readFile(filename)).equals(bytes))
      throw new TypeError(`An immutable release asset differs: ${filename}`);
  }
}

/** Install verified assets first, then atomically switch the single pointer. */
export async function activateReferenceCatalogFilesV1({
  descriptor,
  artifact,
  receipt,
  destination,
  config,
}) {
  if (
    descriptor.candidateId === null ||
    !descriptor.artifactUrl?.startsWith('https://') ||
    !descriptor.receiptUrl?.startsWith('https://') ||
    hash(artifact) !== descriptor.artifactSha256 ||
    artifact.length !== descriptor.compressedByteLength ||
    receipt.artifactSha256 !== descriptor.artifactSha256 ||
    receipt.releaseId !== descriptor.releaseId
  )
    throw new TypeError('Activation assets differ from the reviewed release.');
  await mkdir(destination, { recursive: true });
  await writeImmutable(
    path.join(destination, descriptor.artifactName),
    artifact,
  );
  await writeImmutable(
    path.join(destination, `${descriptor.releaseId}.receipt.json`),
    Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`),
  );
  const temporary = `${config}.next`;
  await writeFile(temporary, `${JSON.stringify(descriptor, null, 2)}\n`);
  await rename(temporary, config);
}

function componentAliases() {
  const aliases = new Map();
  for (const component of FOOD_COMPONENTS_V1) {
    aliases.set(component.componentId, component.componentId);
    for (const sourceId of component.usdaFdcNutrientIds)
      aliases.set(`source.usda-fdc.${sourceId}`, component.componentId);
  }
  return aliases;
}

/** Publish only a fully replayed food-composition candidate as one normal catalog. */
export async function publishReferenceCandidateV1({
  runPath,
  reviewPath,
  corpusPath,
  catalogPath = defaultCatalog,
  outputPath = defaultOutput,
  activate = false,
  artifactUrl,
  receiptUrl,
  publicCatalogPath = publicCatalog,
  activeConfigPath = activeConfig,
}) {
  if (
    activate &&
    (!artifactUrl?.startsWith('https://') ||
      !receiptUrl?.startsWith('https://'))
  )
    throw new TypeError(
      'Activation needs immutable HTTPS artifact and receipt URLs.',
    );
  const candidateResult = await buildReferenceCandidateV1({
    runPath,
    reviewPath,
    corpusPath,
    catalogPath,
    outputPath: path.dirname(path.resolve(runPath)),
  });
  const { candidate, report } = candidateResult;
  if (
    candidate.status !== 'REPLAYED' ||
    report.status !== 'REPLAYED' ||
    report.regressionCaseIds.length ||
    report.uncoveredClaimKeys.length ||
    report.unsupportedClaimKeys.length
  )
    throw new TypeError('Only a fully replayed candidate can be published.');
  const workbench = path.dirname(path.resolve(runPath));
  const projectionBytes = await readFile(
    path.join(workbench, candidate.projection.file),
  );
  const replayBytes = await readFile(
    path.join(workbench, candidate.replay.file),
  );
  if (
    hash(projectionBytes) !== candidate.projection.sha256 ||
    projectionBytes.length !== candidate.projection.bytes ||
    hash(replayBytes) !== candidate.replay.sha256 ||
    replayBytes.length !== candidate.replay.bytes
  )
    throw new TypeError('Candidate artifacts differ from their manifest.');
  const projection = JSON.parse(projectionBytes.toString('utf8'));
  const run = JSON.parse(await readFile(runPath, 'utf8'));
  const review = JSON.parse(await readFile(reviewPath, 'utf8'));
  if (
    projection.reviewedRunId !== run.runId ||
    projection.baseCatalog.releaseId !== candidate.baseCatalog.releaseId ||
    projection.baseCatalog.sha256 !== candidate.baseCatalog.sha256 ||
    projection.foodComposition.length !== candidate.reviewedClaimCount ||
    projection.cookingRetention.length ||
    projection.cookingYield.length ||
    projection.intakeReferences.length
  )
    throw new TypeError(
      'The candidate projection is inconsistent or unsupported.',
    );
  const compressedBase = await readFile(catalogPath);
  if (hash(compressedBase) !== candidate.baseCatalog.sha256)
    throw new TypeError('The base catalog digest differs from the candidate.');
  const base = JSON.parse(gunzipSync(compressedBase).toString('utf8'));
  if (base.releaseId !== candidate.baseCatalog.releaseId)
    throw new TypeError('The base catalog release differs from the candidate.');
  const source = run.proposal.source;
  const releaseId = `food-catalog-reviewed-${candidate.candidateId.slice(0, 24)}`;
  const latest = new Map();
  for (const food of base.payload.foods)
    if ((latest.get(food.foodId)?.revision ?? 0) < food.revision)
      latest.set(food.foodId, food);
  const aliases = componentAliases();
  const replacements = new Map();
  const addedSources = [];
  const addedObservations = [];
  const lineage = [];
  for (const item of projection.foodComposition) {
    const food = latest.get(item.foodId);
    const component = FOOD_COMPONENTS_V1.find(
      (part) => part.componentId === item.componentId,
    );
    if (!food || !component || food.preparationStates.length !== 1)
      throw new TypeError(
        'A reviewed claim needs one exact latest food and preparation state.',
      );
    const key = `${food.foodId}:${food.revision}:${item.componentId}`;
    if (replacements.has(key))
      throw new TypeError('Duplicate reviewed food component.');
    replacements.set(key, true);
    const sourceId = idFor('source', `${candidate.candidateId}:${key}`);
    const observationId = idFor(
      'observation',
      `${candidate.candidateId}:${key}`,
    );
    const sourceRecordId = hash(`${key}:${item.provenance.locator}`);
    addedSources.push({
      sourceId,
      provider: 'nutrixx',
      dataset: 'reviewed-reference',
      sourceRelease: candidate.candidateId,
      sourceRecordId,
      licenseId: source.licenseId,
      retrievedAt: source.retrievedAt,
    });
    addedObservations.push({
      observationId,
      foodId: food.foodId,
      foodRevision: food.revision,
      nutrientId: item.componentId,
      sourceNutrientId: item.componentId,
      sourceNutrientName: component.name,
      derivationCode: 'reviewed-source-observation',
      preparationState: food.preparationStates[0],
      value: item.value,
      sourceId,
      quality: [],
    });
    lineage.push({
      observationId,
      sourceId,
      sourceRecordId,
      foodId: food.foodId,
      foodRevision: food.revision,
      componentId: item.componentId,
      locator: item.provenance.locator,
      sourceSha256: item.provenance.sourceSha256,
      reviewerId: item.provenance.reviewerId,
      reviewedAt: item.provenance.reviewedAt,
    });
  }
  const retained = base.payload.composition.filter(
    (observation) =>
      !replacements.has(
        `${observation.foodId}:${observation.foodRevision}:${aliases.get(observation.nutrientId) ?? observation.nutrientId}`,
      ),
  );
  const payload = FoodCatalogPayloadV1Schema.parse({
    ...base.payload,
    sources: [...base.payload.sources, ...addedSources],
    composition: [...retained, ...addedObservations],
  });
  const manifest = deriveFoodCatalogManifestV1(
    {
      ...base.manifest,
      releaseId,
      publishedAt: review.reviewedAt,
      sourceDatasets: [
        ...base.manifest.sourceDatasets,
        {
          provider: 'nutrixx',
          dataset: 'reviewed-reference',
          sourceRelease: candidate.candidateId,
          licenseId: source.licenseId,
          homepage: source.sourceUrl,
        },
      ],
      quality: {
        ...base.manifest.quality,
        sourceEntries:
          base.manifest.quality.sourceEntries + addedSources.length,
        sourceComponents:
          base.manifest.quality.sourceComponents + addedObservations.length,
      },
      counts: undefined,
      coverage: undefined,
    },
    payload,
  );
  const release = await createFoodCatalogReleaseV1({
    manifest,
    payload,
    hash: sha256Canonical,
  });
  const artifact = gzipSync(JSON.stringify(release), { level: 9 });
  const artifactName = `${releaseId}.v1.json.gz`;
  const receiptName = `${releaseId}.receipt.json`;
  const receipt = {
    releaseId,
    artifact: artifactName,
    compressedByteLength: artifact.length,
    artifactSha256: hash(artifact),
    uncompressedPayloadByteLength: release.byteLength,
    manifest,
    manifestSha256: release.manifestSha256,
    payloadSha256: release.payloadSha256,
    candidateId: candidate.candidateId,
    sourceCatalog: candidate.baseCatalog,
    projectionSha256: candidate.projection.sha256,
    replaySha256: candidate.replay.sha256,
    lineage,
    source: {
      title: source.title,
      publisher: source.publisher,
      sourceUrl: source.sourceUrl,
      licenseId: source.licenseId,
      edition: source.edition,
      retrievedAt: source.retrievedAt,
    },
  };
  const descriptor = {
    format: 'nutrixx.active-food-catalog',
    schemaVersion: 1,
    releaseId,
    artifactName,
    artifactSha256: receipt.artifactSha256,
    compressedByteLength: artifact.length,
    candidateId: candidate.candidateId,
    artifactUrl: artifactUrl ?? null,
    receiptUrl: receiptUrl ?? null,
    reviewedClaimCount: addedObservations.length,
  };
  const output = path.resolve(outputPath);
  await mkdir(output, { recursive: true });
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
  const descriptorBytes = Buffer.from(
    `${JSON.stringify(descriptor, null, 2)}\n`,
  );
  await writeImmutable(path.join(output, artifactName), artifact);
  await writeImmutable(path.join(output, receiptName), receiptBytes);
  await writeImmutable(
    path.join(output, 'active-food-catalog.json'),
    descriptorBytes,
  );
  if (activate) {
    const destination = path.resolve(publicCatalogPath);
    const config = path.resolve(activeConfigPath);
    if (destination !== publicCatalog || config !== activeConfig)
      throw new TypeError(
        'Activation destinations must remain in the Web release locations.',
      );
    await activateReferenceCatalogFilesV1({
      descriptor,
      artifact,
      receipt,
      destination,
      config,
    });
  }
  return { descriptor, receipt, outputDirectory: output };
}

function argumentValue(flag) {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: npm run reference:publish -- --run <run.json> --review <review.json> --corpus <corpus.json> [--catalog <catalog.gz>] [--activate --artifact-url <https-url> --receipt-url <https-url>]',
    );
  } else {
    const runPath = argumentValue('--run');
    const reviewPath = argumentValue('--review');
    const corpusPath = argumentValue('--corpus');
    if (!runPath || !reviewPath || !corpusPath)
      throw new TypeError(
        '--run, --review, and --corpus are required local files.',
      );
    const result = await publishReferenceCandidateV1({
      runPath,
      reviewPath,
      corpusPath,
      ...(argumentValue('--catalog')
        ? { catalogPath: argumentValue('--catalog') }
        : {}),
      activate: process.argv.includes('--activate'),
      artifactUrl: argumentValue('--artifact-url'),
      receiptUrl: argumentValue('--receipt-url'),
    });
    console.log(
      `Verified release ${result.descriptor.releaseId}: ${result.outputDirectory}`,
    );
    console.log(
      result.descriptor.candidateId
        ? 'Reviewed candidate ready.'
        : 'Base release ready.',
    );
  }
}
