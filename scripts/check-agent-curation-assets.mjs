import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const promptPath = path.join(root, 'docs/data/agent-curation-prompt.md');
const checksumPath = path.join(root, 'docs/data/agent-curation-prompt.sha256');
const collectionPath = path.join(
  root,
  'packages/contracts/postman/nutrixx-agent-curation.postman_collection.json',
);
const activeCatalogPath = path.join(
  root,
  'apps/web/config/active-food-catalog.json',
);

const [prompt, checksumText, collectionText, activeCatalogText] =
  await Promise.all([
    readFile(promptPath),
    readFile(checksumPath, 'utf8'),
    readFile(collectionPath, 'utf8'),
    readFile(activeCatalogPath, 'utf8'),
  ]);
const promptSha256 = createHash('sha256').update(prompt).digest('hex');
const recordedPromptSha256 = checksumText.trim().split(/\s+/u)[0];
if (recordedPromptSha256 !== promptSha256)
  throw new TypeError('The agent curation prompt checksum is stale.');

const collection = JSON.parse(collectionText);
const activeCatalog = JSON.parse(activeCatalogText);
if (
  collection.info?.schema !==
    'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' ||
  collection.auth?.type !== 'bearer' ||
  !Array.isArray(collection.variable) ||
  !Array.isArray(collection.item)
)
  throw new TypeError('The Postman collection envelope is invalid.');

const variables = new Map(
  collection.variable.map((entry) => [entry.key, entry.value]),
);
const sample = JSON.parse(variables.get('agentBatchJson'));
if (
  variables.get('baseUrl') !== 'http://localhost:3001/api/v1' ||
  sample.format !== 'nutrixx.agent-curation-batch' ||
  sample.schemaVersion !== 1 ||
  sample.agent?.instructionSha256 !== promptSha256 ||
  sample.catalog?.releaseId !== activeCatalog.releaseId ||
  sample.catalog?.artifactSha256 !== activeCatalog.artifactSha256 ||
  !Array.isArray(sample.claims) ||
  sample.claims.length !== 0
)
  throw new TypeError(
    'The Postman collection template differs from the prompt or active catalog.',
  );

const requests = new Map(
  collection.item.map((entry) => [entry.name, entry.request]),
);
if (
  requests.get('1 - Submit Agent Curation Batch')?.method !== 'POST' ||
  requests.get('1 - Submit Agent Curation Batch')?.url?.raw !==
    '{{baseUrl}}/internal/curation/runs' ||
  requests.get('2 - Get Curation Run Status')?.method !== 'GET' ||
  requests.get('2 - Get Curation Run Status')?.url?.raw !==
    '{{baseUrl}}/internal/curation/runs/{{runId}}'
)
  throw new TypeError('The Postman collection request sequence is invalid.');

console.log('Agent curation prompt and Postman collection: valid');
