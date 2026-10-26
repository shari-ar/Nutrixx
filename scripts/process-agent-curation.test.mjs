import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { gunzipSync, gzipSync } from 'node:zlib';

import {
  NUTRIXX_FALLBACK_PROVIDER_V1,
  deriveFoodCatalogManifestV1,
} from '../packages/food-knowledge/dist/index.js';

import { processAgentCurationRunV1 } from './process-agent-curation.mjs';

const SOURCE_ID = '11111111-1111-4111-a111-111111111111';
const FOOD_ID = '22222222-2222-4222-a222-222222222222';
const OBSERVATION_ID = '33333333-3333-4333-a333-333333333333';
const DIGEST = 'a'.repeat(64);
const NOW = '2026-10-24T10:00:00.000Z';
const directory = await mkdtemp(path.join(tmpdir(), 'nutrixx-curation-'));

after(async () => rm(directory, { recursive: true, force: true }));

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function payload(value) {
  return {
    format: 'nutrixx.food-catalog',
    schemaVersion: 1,
    sources: [
      {
        sourceId: SOURCE_ID,
        provider: 'future-external-source',
        dataset: 'fixture',
        sourceRelease: '1',
        sourceRecordId: 'apple',
        licenseId: 'TEST-1.0',
        retrievedAt: NOW,
      },
    ],
    foods: [
      {
        foodId: FOOD_ID,
        revision: 1,
        foodClass: 'fixture.food',
        descriptions: [{ locale: 'en', value: 'Apple', kind: 'primary' }],
        categories: [],
        preparationStates: ['raw'],
        sourceId: SOURCE_ID,
      },
    ],
    portions: [],
    composition: [
      {
        observationId: OBSERVATION_ID,
        foodId: FOOD_ID,
        foodRevision: 1,
        nutrientId: 'nutrient.protein',
        sourceNutrientId: 'protein',
        sourceNutrientName: 'Protein',
        preparationState: 'raw',
        value,
        sourceId: SOURCE_ID,
        quality: [],
      },
    ],
  };
}

async function installBase(root, value, releaseId) {
  const catalogPayload = payload(value);
  const manifest = deriveFoodCatalogManifestV1(
    {
      format: 'nutrixx.food-catalog-manifest',
      schemaVersion: 1,
      releaseId,
      publishedAt: NOW,
      sourceDatasets: [
        {
          provider: 'future-external-source',
          dataset: 'fixture',
          sourceRelease: '1',
          licenseId: 'TEST-1.0',
          homepage: 'https://example.test',
        },
      ],
      quality: {
        sourceEntries: 1,
        quarantinedEntries: 0,
        sourceComponents: 1,
        quarantinedComponents: 0,
        quarantineReasonCounts: {},
      },
    },
    catalogPayload,
  );
  const artifact = gzipSync(
    JSON.stringify({ releaseId, manifest, payload: catalogPayload }),
  );
  const artifactName = `${releaseId}.v1.json.gz`;
  await mkdir(path.join(root, 'apps/web/public/catalog'), { recursive: true });
  await mkdir(path.join(root, 'apps/web/config'), { recursive: true });
  await writeFile(
    path.join(root, 'apps/web/public/catalog', artifactName),
    artifact,
  );
  const descriptor = {
    releaseId,
    artifactName,
    artifactSha256: sha256(artifact),
    compressedByteLength: artifact.length,
  };
  await writeFile(
    path.join(root, 'apps/web/config/active-food-catalog.json'),
    JSON.stringify(descriptor),
  );
  return descriptor;
}

function batch(
  descriptor,
  batchId,
  evidence = {
    evidenceType: 'external-source',
    sourceTitle: 'Test table',
    publisher: 'Test publisher',
    sourceUrl: 'https://example.test/table',
    sourceEdition: '1',
    licenseId: 'TEST-1.0',
    locator: 'row Apple',
    retrievedAt: NOW,
    sourceContentSha256: DIGEST,
    method: 'direct-transcription',
  },
) {
  return {
    format: 'nutrixx.agent-curation-batch',
    schemaVersion: 1,
    batchId,
    generatedAt: NOW,
    catalog: {
      releaseId: descriptor.releaseId,
      artifactSha256: descriptor.artifactSha256,
    },
    agent: {
      agentId: 'test-agent',
      model: 'test-model',
      instructionSha256: DIGEST,
    },
    claims: [
      {
        claimId: 'claim.apple.protein',
        foodId: FOOD_ID,
        foodRevision: 1,
        preparationState: 'raw',
        componentId: 'nutrient.protein',
        value: {
          amount: '0.3',
          unit: { system: 'ucum', code: 'g' },
          basis: 'per-100-gram-edible',
        },
        evidence,
      },
    ],
  };
}

async function prepareRun(root, runId, input) {
  const runDirectory = path.join(
    root,
    'reference-workbench/agent-curation/runs',
    runId,
  );
  await mkdir(runDirectory, { recursive: true });
  await writeFile(path.join(runDirectory, 'input.json'), JSON.stringify(input));
}

async function generatedRelease(root, status) {
  return JSON.parse(
    gunzipSync(await readFile(path.join(root, status.artifact))).toString(
      'utf8',
    ),
  );
}

test('Nutrixx fills an unknown cell and yields automatically to a later external value', async () => {
  await mkdir(path.join(directory, 'reference-data/nutrixx-curated'), {
    recursive: true,
  });
  await writeFile(
    path.join(directory, 'reference-data/nutrixx-curated/claims.v1.json'),
    JSON.stringify({
      format: 'nutrixx.agent-curated-food-composition',
      schemaVersion: 1,
      claims: [],
    }),
  );

  const firstDescriptor = await installBase(
    directory,
    { state: 'unknown', reason: 'not-provided' },
    'catalog-before-external-value',
  );
  const firstRunId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  await prepareRun(
    directory,
    firstRunId,
    batch(firstDescriptor, 'batch-1', {
      evidenceType: 'model-knowledge',
      knowledgeDescription:
        'The model supplied its existing food-composition knowledge.',
    }),
  );
  const firstStatus = await processAgentCurationRunV1({
    runId: firstRunId,
    rootPath: directory,
  });
  const firstRelease = await generatedRelease(directory, firstStatus);
  const activeAfterFirstRun = JSON.parse(
    await readFile(
      path.join(directory, 'apps/web/config/active-food-catalog.json'),
      'utf8',
    ),
  );
  assert.equal(firstStatus.projectedClaimCount, 1);
  assert.equal(firstStatus.publicationState, 'active-local');
  assert.equal(activeAfterFirstRun.releaseId, firstStatus.releaseId);
  assert.equal(
    activeAfterFirstRun.artifactSha256,
    sha256(
      await readFile(
        path.join(
          directory,
          'apps/web/public/catalog',
          activeAfterFirstRun.artifactName,
        ),
      ),
    ),
  );
  assert.equal(firstRelease.payload.composition.length, 1);
  const firstSource = firstRelease.payload.sources.find(
    (source) =>
      source.sourceId === firstRelease.payload.composition[0].sourceId,
  );
  assert.equal(firstSource.provider, NUTRIXX_FALLBACK_PROVIDER_V1);
  assert.deepEqual(firstSource.agentProvenance, {
    evidenceType: 'model-knowledge',
    agentId: 'test-agent',
    model: 'test-model',
    generatedAt: NOW,
    knowledgeDescription:
      'The model supplied its existing food-composition knowledge.',
  });

  const secondDescriptor = await installBase(
    directory,
    {
      state: 'known',
      amount: '0.4',
      unit: { system: 'ucum', code: 'g' },
      basis: 'per-100-gram-edible',
    },
    'catalog-with-future-external-value',
  );
  const secondRunId = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
  await prepareRun(directory, secondRunId, batch(secondDescriptor, 'batch-2'));
  const secondStatus = await processAgentCurationRunV1({
    runId: secondRunId,
    rootPath: directory,
  });
  const secondRelease = await generatedRelease(directory, secondStatus);
  assert.equal(secondStatus.projectedClaimCount, 0);
  assert.equal(secondStatus.shadowedClaimCount, 1);
  assert.equal(secondRelease.payload.composition.length, 1);
  assert.equal(secondRelease.payload.composition[0].value.amount, '0.4');
  assert.equal(
    secondRelease.payload.sources.some(
      (source) => source.provider === NUTRIXX_FALLBACK_PROVIDER_V1,
    ),
    false,
  );
});
