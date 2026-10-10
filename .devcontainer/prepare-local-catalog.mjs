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

const releaseId = 'food-catalog-usda-2026-04-30.1';
const artifactName = `${releaseId}.v1.json.gz`;
const receiptName = `${releaseId}.receipt.json`;
const baseUrl =
  process.env.NUTRIXX_CATALOG_BASE_URL ??
  'https://shari-ar.github.io/Nutrixx/catalog';
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
  try {
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    const artifact = await readFile(artifactPath);
    const size = (await stat(artifactPath)).size;
    const digest = createHash('sha256').update(artifact).digest('hex');
    if (
      receipt.releaseId === releaseId &&
      receipt.artifact === artifactName &&
      receipt.compressedByteLength === size &&
      receipt.artifactSha256 === digest
    ) {
      console.log(`Catalog ${releaseId} is already ready.`);
      return;
    }
  } catch {
    // A missing or invalid local copy is replaced atomically below.
  }

  const temporaryArtifact = `${artifactPath}.download`;
  const temporaryReceipt = `${receiptPath}.download`;
  try {
    await download(urlFor(receiptName), temporaryReceipt);
    await download(urlFor(artifactName), temporaryArtifact);
    const [receiptText, artifact] = await Promise.all([
      readFile(temporaryReceipt, 'utf8'),
      readFile(temporaryArtifact),
    ]);
    const receipt = JSON.parse(receiptText);
    const digest = createHash('sha256').update(artifact).digest('hex');
    if (
      receipt.releaseId !== releaseId ||
      receipt.artifact !== artifactName ||
      receipt.compressedByteLength !== artifact.length ||
      receipt.artifactSha256 !== digest
    ) {
      throw new Error('The downloaded catalog receipt did not verify.');
    }
    await Promise.all([
      rename(temporaryArtifact, artifactPath),
      rename(temporaryReceipt, receiptPath),
    ]);
    console.log(
      `Catalog ${releaseId} is ready for local browser installation.`,
    );
  } catch (error) {
    await Promise.allSettled([
      unlink(temporaryArtifact),
      unlink(temporaryReceipt),
    ]);
    console.warn(
      `Catalog preparation skipped: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
}

await prepare();
