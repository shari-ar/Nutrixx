import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';

import { sha256Canonical } from '@nutrixx/persistence-indexeddb';

import { createFoodCatalogReleaseV1 } from './dist/index.js';

const [artifactPath, receiptPath] = process.argv.slice(2);
if (artifactPath === undefined || receiptPath === undefined) {
  throw new TypeError(
    'Usage: verify-food-catalog-release.mjs <catalog.json.gz> <receipt.json>',
  );
}

const unzip = promisify(gunzip);
const [compressed, receiptText, artifactStats] = await Promise.all([
  readFile(artifactPath),
  readFile(receiptPath, 'utf8'),
  stat(artifactPath),
]);
const release = JSON.parse((await unzip(compressed)).toString('utf8'));
const receipt = JSON.parse(receiptText);
const verified = await createFoodCatalogReleaseV1({
  manifest: release.manifest,
  payload: release.payload,
  hash: sha256Canonical,
});

const checks = {
  artifact: path.basename(artifactPath),
  compressedByteLength: artifactStats.size,
  uncompressedPayloadByteLength: verified.byteLength,
  releaseId: verified.releaseId,
  manifestSha256: verified.manifestSha256,
  payloadSha256: verified.payloadSha256,
};
for (const [field, value] of Object.entries(checks)) {
  if (receipt[field] !== value) {
    throw new TypeError(
      `Receipt ${field} does not match the catalog artifact.`,
    );
  }
}
if (
  release.releaseId !== verified.releaseId ||
  release.publishedAt !== verified.publishedAt ||
  release.byteLength !== verified.byteLength ||
  release.manifestSha256 !== verified.manifestSha256 ||
  release.payloadSha256 !== verified.payloadSha256
) {
  throw new TypeError(
    'Catalog release metadata or integrity digest is invalid.',
  );
}

console.log(JSON.stringify({ status: 'verified', ...checks }, null, 2));
