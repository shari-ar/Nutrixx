import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

import { CanonicalIdSchema } from '@nutrixx/canonical-schema';
import { sha256Canonical } from '@nutrixx/persistence-indexeddb';

import {
  createFoodCatalogReleaseV1,
  deriveFoodCatalogManifestV1,
  normalizeRawUsdaFoodDataCentralV1,
} from './dist/index.js';

const [foundationPath, legacyPath, outputDirectory] = process.argv.slice(2);
if (
  foundationPath === undefined ||
  legacyPath === undefined ||
  outputDirectory === undefined
) {
  throw new TypeError(
    'Usage: build-usda-release.mjs <foundation.json> <sr-legacy.json> <output-directory>',
  );
}

const RELEASE_ID = 'food-catalog-usda-2026-04-30.1';
const RELEASE_INSTANT = '2026-10-04T00:00:00.000Z';

function idFor(kind, sourceId) {
  const value = createHash('sha256')
    .update(`nutrixx:food-catalog:v1:${kind}:${sourceId}`, 'utf8')
    .digest('hex');
  return CanonicalIdSchema.parse(
    `${value.slice(0, 8)}-${value.slice(8, 12)}-5${value.slice(13, 16)}-a${value.slice(17, 20)}-${value.slice(20, 32)}`,
  );
}

async function parseSource(filePath, rootProperty) {
  const document = JSON.parse(await readFile(filePath, 'utf8'));
  const entries = document[rootProperty];
  if (!Array.isArray(entries)) {
    throw new TypeError(`${rootProperty} must be an array.`);
  }
  return entries;
}

function mergeReports(left, right) {
  const quarantineReasonCounts = { ...left.quarantineReasonCounts };
  for (const [reason, count] of Object.entries(right.quarantineReasonCounts)) {
    quarantineReasonCounts[reason] =
      (quarantineReasonCounts[reason] ?? 0) + count;
  }
  return {
    sourceEntries: left.sourceEntries + right.sourceEntries,
    quarantinedEntries: left.quarantinedEntries + right.quarantinedEntries,
    sourceComponents: left.sourceComponents + right.sourceComponents,
    quarantinedComponents:
      left.quarantinedComponents + right.quarantinedComponents,
    quarantineReasonCounts,
  };
}

const foundationEntries = await parseSource(foundationPath, 'FoundationFoods');
const foundation = normalizeRawUsdaFoodDataCentralV1(foundationEntries, {
  dataset: 'foundation',
  sourceRelease: '2026-04-30',
  retrievedAt: RELEASE_INSTANT,
  idFor,
});

const legacyEntries = await parseSource(legacyPath, 'SRLegacyFoods');
const legacy = normalizeRawUsdaFoodDataCentralV1(legacyEntries, {
  dataset: 'sr-legacy',
  sourceRelease: '2018-04',
  retrievedAt: RELEASE_INSTANT,
  idFor,
});

const payload = {
  format: 'nutrixx.food-catalog',
  schemaVersion: 1,
  sources: [...foundation.payload.sources, ...legacy.payload.sources],
  foods: [...foundation.payload.foods, ...legacy.payload.foods],
  portions: [...foundation.payload.portions, ...legacy.payload.portions],
  composition: [
    ...foundation.payload.composition,
    ...legacy.payload.composition,
  ],
};
const quality = mergeReports(foundation.report, legacy.report);
const manifest = deriveFoodCatalogManifestV1(
  {
    format: 'nutrixx.food-catalog-manifest',
    schemaVersion: 1,
    releaseId: RELEASE_ID,
    publishedAt: RELEASE_INSTANT,
    sourceDatasets: [
      {
        provider: 'usda-fdc',
        dataset: 'foundation',
        sourceRelease: '2026-04-30',
        licenseId: 'CC0-1.0',
        homepage: 'https://fdc.nal.usda.gov/',
      },
      {
        provider: 'usda-fdc',
        dataset: 'sr-legacy',
        sourceRelease: '2018-04',
        licenseId: 'CC0-1.0',
        homepage: 'https://fdc.nal.usda.gov/',
      },
    ],
    quality,
  },
  payload,
);
const release = await createFoodCatalogReleaseV1({
  manifest,
  payload,
  hash: sha256Canonical,
});

await mkdir(outputDirectory, { recursive: true });
const baseName = `${RELEASE_ID}.v1.json`;
const temporaryJsonPath = path.join(outputDirectory, `${baseName}.tmp`);
const temporaryGzipPath = path.join(outputDirectory, `${baseName}.gz.tmp`);
const gzipPath = path.join(outputDirectory, `${baseName}.gz`);
await writeFile(temporaryJsonPath, JSON.stringify(release), {
  encoding: 'utf8',
  flag: 'wx',
});
await pipeline(
  createReadStream(temporaryJsonPath),
  createGzip({ level: 9 }),
  createWriteStream(temporaryGzipPath, { flags: 'wx' }),
);
await rename(temporaryGzipPath, gzipPath);
await unlink(temporaryJsonPath);
const gzipStats = await stat(gzipPath);
const receipt = {
  releaseId: RELEASE_ID,
  artifact: path.basename(gzipPath),
  compressedByteLength: gzipStats.size,
  uncompressedPayloadByteLength: release.byteLength,
  manifest,
  manifestSha256: release.manifestSha256,
  payloadSha256: release.payloadSha256,
};
await writeFile(
  path.join(outputDirectory, `${RELEASE_ID}.receipt.json`),
  `${JSON.stringify(receipt, null, 2)}\n`,
  { encoding: 'utf8', flag: 'wx' },
);
console.log(JSON.stringify(receipt, null, 2));
