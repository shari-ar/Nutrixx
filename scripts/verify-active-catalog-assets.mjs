import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const [assetDirectory = '.catalog-release'] = process.argv.slice(2);
const descriptor = JSON.parse(
  await readFile('apps/web/config/active-food-catalog.json', 'utf8'),
);
const artifact = await readFile(
  path.join(assetDirectory, descriptor.artifactName),
);
const receipt = JSON.parse(
  await readFile(
    path.join(assetDirectory, `${descriptor.releaseId}.receipt.json`),
    'utf8',
  ),
);
const digest = createHash('sha256').update(artifact).digest('hex');

if (
  descriptor.format !== 'nutrixx.active-food-catalog' ||
  descriptor.schemaVersion !== 1 ||
  descriptor.artifactName !== `${descriptor.releaseId}.v1.json.gz` ||
  descriptor.artifactSha256 !== digest ||
  descriptor.compressedByteLength !== artifact.length ||
  receipt.releaseId !== descriptor.releaseId ||
  receipt.artifact !== descriptor.artifactName ||
  receipt.artifactSha256 !== digest ||
  receipt.compressedByteLength !== artifact.length
) {
  throw new Error(
    'The active catalog release assets differ from the descriptor.',
  );
}

console.log(`Verified ${descriptor.releaseId}: ${digest}`);
