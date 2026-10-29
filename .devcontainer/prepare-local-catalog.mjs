import { createHash } from 'node:crypto';
import {
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import { DEFAULT_CATALOG_DELIVERY_URL } from '@nutrixx/config/application';

const active = JSON.parse(
  await readFile('apps/web/config/active-food-catalog.json', 'utf8'),
);
if (
  active.format !== 'nutrixx.active-food-catalog' ||
  active.schemaVersion !== 1 ||
  !/^[a-z0-9][a-z0-9.-]{0,199}$/u.test(active.releaseId ?? '') ||
  active.artifactName !== `${active.releaseId}.v1.json.gz` ||
  !/^[a-f0-9]{64}$/u.test(active.artifactSha256 ?? '')
)
  throw new TypeError('The active catalog descriptor is invalid.');
const releaseId = active.releaseId;
const artifactName = active.artifactName;
const receiptName = `${releaseId}.receipt.json`;
const baseUrl =
  process.env.NUTRIXX_CATALOG_BASE_URL ?? DEFAULT_CATALOG_DELIVERY_URL;
const outputDirectory = path.resolve('apps/web/public/catalog');

function urlFor(name) {
  return `${baseUrl.replace(/\/$/u, '')}/${name}`;
}

async function download(url, destination) {
  const response = await fetch(url, { redirect: 'error' });
  if (!response.ok || response.body === null) {
    throw new Error(`Catalog download failed with HTTP ${response.status}.`);
  }
  const content = Buffer.from(await response.arrayBuffer());
  await writeFile(destination, content, { flag: 'wx' });
}

async function prepare() {
  await mkdir(outputDirectory, { recursive: true });
  const artifactPath = path.join(outputDirectory, artifactName);
  const receiptPath = path.join(outputDirectory, receiptName);
  let verifiedArtifact = false;
  try {
    const artifact = await readFile(artifactPath);
    const size = (await stat(artifactPath)).size;
    const digest = createHash('sha256').update(artifact).digest('hex');
    verifiedArtifact =
      digest === active.artifactSha256 && size === active.compressedByteLength;
    if (verifiedArtifact) {
      const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
      if (
        receipt.releaseId === releaseId &&
        receipt.artifact === artifactName &&
        receipt.compressedByteLength === size &&
        receipt.artifactSha256 === digest
      ) {
        console.log(`Catalog ${releaseId} is already ready.`);
        return;
      }
    }
  } catch {
    // A missing or invalid local copy is replaced atomically below.
  }

  const temporaryArtifact = `${artifactPath}.download`;
  const temporaryReceipt = `${receiptPath}.download`;
  try {
    await download(active.receiptUrl ?? urlFor(receiptName), temporaryReceipt);
    if (!verifiedArtifact)
      await download(
        active.artifactUrl ?? urlFor(artifactName),
        temporaryArtifact,
      );
    const receiptText = await readFile(temporaryReceipt, 'utf8');
    const artifact = await readFile(
      verifiedArtifact ? artifactPath : temporaryArtifact,
    );
    const receipt = JSON.parse(receiptText);
    const digest = createHash('sha256').update(artifact).digest('hex');
    if (
      receipt.releaseId !== releaseId ||
      receipt.artifact !== artifactName ||
      receipt.compressedByteLength !== artifact.length ||
      receipt.artifactSha256 !== digest ||
      digest !== active.artifactSha256 ||
      artifact.length !== active.compressedByteLength
    ) {
      throw new Error('The downloaded catalog receipt did not verify.');
    }
    if (!verifiedArtifact) await rename(temporaryArtifact, artifactPath);
    await rename(temporaryReceipt, receiptPath);
    console.log(
      `Catalog ${releaseId} is ready for local browser installation.`,
    );
  } catch (error) {
    await Promise.allSettled([
      unlink(temporaryArtifact),
      unlink(temporaryReceipt),
    ]);
    if (error instanceof Error && error.message.includes('HTTP 403')) {
      throw error;
    }
    console.warn(
      `Catalog preparation skipped: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
}

await prepare();
