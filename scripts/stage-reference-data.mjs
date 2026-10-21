import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { constants } from 'node:fs';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';

import {
  FoodCatalogManifestV1Schema,
  FoodCatalogPayloadV1Schema,
} from '@nutrixx/food-knowledge';
import { FOOD_COMPONENTS_V1 } from '@nutrixx/nutrition-engine';

import { validateReferenceProposalV1 } from '../packages/reference-quality/dist/index.js';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const activeCatalog = JSON.parse(
  await readFile(
    path.join(projectRoot, 'apps/web/config/active-food-catalog.json'),
    'utf8',
  ),
);
const defaultCatalog = path.join(
  projectRoot,
  'apps/web/public/catalog',
  activeCatalog.artifactName,
);
const workbenchRoot = path.join(projectRoot, 'reference-workbench');
const unzip = promisify(gunzip);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fileSha256(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function requireRegularFile(filename) {
  const info = await stat(filename);
  if (!info.isFile())
    throw new TypeError(`A regular local file is required: ${filename}`);
  return info;
}

async function copyImmutable(source, destination, expectedDigest) {
  try {
    await copyFile(source, destination, constants.COPYFILE_EXCL);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
  if ((await fileSha256(destination)) !== expectedDigest)
    throw new Error(
      `A content-addressed workbench file has a different digest: ${destination}`,
    );
}

async function writeImmutableJson(destination, value) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  try {
    await writeFile(destination, content, { flag: 'wx' });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const existing = await readFile(destination, 'utf8');
    if (existing !== content)
      throw new Error(
        `A staged run already exists with different content: ${destination}`,
      );
  }
}

async function loadCatalog(filename) {
  const compressed = await readFile(filename);
  const release = JSON.parse((await unzip(compressed)).toString('utf8'));
  if (release.format !== 'nutrixx.reference-release')
    throw new TypeError('The local catalog has the wrong release format.');
  const manifest = FoodCatalogManifestV1Schema.parse(release.manifest);
  const payload = FoodCatalogPayloadV1Schema.parse(release.payload);
  if (
    release.releaseId !== manifest.releaseId ||
    release.publishedAt !== manifest.publishedAt ||
    manifest.counts.sources !== payload.sources.length ||
    manifest.counts.foods !== payload.foods.length ||
    manifest.counts.portions !== payload.portions.length ||
    manifest.counts.compositionObservations !== payload.composition.length
  )
    throw new TypeError('The local catalog release and manifest differ.');
  return {
    releaseId: manifest.releaseId,
    artifactSha256: sha256(compressed),
    foodIds: new Set(payload.foods.map((food) => food.foodId)),
  };
}

/** Stage local evidence without changing the active reference releases. */
export async function stageReferenceDataV1({
  sourcePath,
  proposalPath,
  catalogPath = defaultCatalog,
  workbenchPath = workbenchRoot,
}) {
  const sourceFile = path.resolve(sourcePath);
  const proposalFile = path.resolve(proposalPath);
  const catalogFile = path.resolve(catalogPath);
  if (
    sourceFile === proposalFile ||
    sourceFile === catalogFile ||
    proposalFile === catalogFile
  )
    throw new TypeError(
      'Source, proposal, and catalog must be separate local files.',
    );
  await requireRegularFile(sourceFile);
  const proposalInfo = await requireRegularFile(proposalFile);
  if (proposalInfo.size > 10_000_000)
    throw new RangeError(
      'A proposal file must be at most 10 MB. Split larger batches.',
    );
  const rawProposal = await readFile(proposalFile);
  const proposalDigest = sha256(rawProposal);
  const proposal = JSON.parse(rawProposal.toString('utf8'));
  const sourceDigest = await fileSha256(sourceFile);
  const catalog = await loadCatalog(catalogFile);
  const result = validateReferenceProposalV1(proposal, {
    sourceSha256: sourceDigest,
    catalog,
    foodIds: catalog.foodIds,
    components: FOOD_COMPONENTS_V1,
  });
  const runId = sha256(
    `${proposalDigest}:${sourceDigest}:${catalog.artifactSha256}`,
  );
  const sourceRelativePath = `source-${sourceDigest}.bin`;
  const proposalRelativePath = `proposal-${proposalDigest}.json`;
  const runRelativePath = `run-${runId}.json`;
  const workbench = path.resolve(workbenchPath);
  await mkdir(workbench, { recursive: true });
  await copyImmutable(
    sourceFile,
    path.join(workbench, sourceRelativePath),
    sourceDigest,
  );
  await copyImmutable(
    proposalFile,
    path.join(workbench, proposalRelativePath),
    proposalDigest,
  );
  const record = {
    ...result,
    runId,
    evidence: {
      sourceSha256: sourceDigest,
      sourceByteLength: (await stat(path.join(workbench, sourceRelativePath)))
        .size,
      sourcePath: sourceRelativePath,
      proposalSha256: proposalDigest,
      proposalPath: proposalRelativePath,
      catalogReleaseId: catalog.releaseId,
      catalogSha256: catalog.artifactSha256,
    },
  };
  await writeImmutableJson(path.join(workbench, runRelativePath), record);
  return { ...record, runPath: path.join(workbench, runRelativePath) };
}

function argumentValue(flag) {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: npm run reference:stage -- --source <local-file> --proposal <proposal.json> [--catalog <local-catalog.gz>]',
    );
    return;
  }
  const sourcePath = argumentValue('--source');
  const proposalPath = argumentValue('--proposal');
  if (!sourcePath || !proposalPath)
    throw new TypeError(
      'Both --source and --proposal local file paths are required.',
    );
  const catalogPath = argumentValue('--catalog');
  const result = await stageReferenceDataV1({
    sourcePath,
    proposalPath,
    ...(catalogPath ? { catalogPath } : {}),
  });
  console.log(`Staged run: ${result.runPath}`);
  console.log(
    `Pending review: ${result.proposed.length}; quarantined: ${result.quarantined.length}.`,
  );
  if (result.quarantined.length > 0) process.exitCode = 2;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
