import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';

import { deriveFoodCatalogManifestV1 } from '@nutrixx/food-knowledge';
import { FOOD_COMPONENTS_V1 } from '@nutrixx/nutrition-engine';

import { stageReferenceDataV1 } from './stage-reference-data.mjs';

const foodId = '22222222-2222-5222-a222-222222222222';
const sourceId = '11111111-1111-5111-a111-111111111111';
const now = '2026-10-18T00:00:00.000Z';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

test('local intake preserves raw evidence, stages reviewed claims, and quarantines invalid ones', async (context) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'nutrixx-reference-stage-'),
  );
  context.after(async () => {
    const expectedPrefix = path.join(tmpdir(), 'nutrixx-reference-stage-');
    if (!directory.startsWith(expectedPrefix))
      throw new Error('Unsafe test cleanup path.');
    await rm(directory, { recursive: true, force: true });
  });
  const sourcePath = path.join(directory, 'source.txt');
  const proposalPath = path.join(directory, 'proposal.json');
  const catalogPath = path.join(directory, 'catalog.json.gz');
  const workbenchPath = path.join(directory, 'workbench');
  const sourceBytes = Buffer.from('Example published table, row 4.\n');
  await writeFile(sourcePath, sourceBytes);

  const payload = {
    format: 'nutrixx.food-catalog',
    schemaVersion: 1,
    sources: [
      {
        sourceId,
        provider: 'usda-fdc',
        dataset: 'foundation',
        sourceRelease: '2026-04-30',
        sourceRecordId: '12345',
        licenseId: 'CC0-1.0',
        retrievedAt: now,
      },
    ],
    foods: [
      {
        foodId,
        revision: 1,
        foodClass: 'usda.foundation',
        descriptions: [
          { locale: 'en', value: 'Example food', kind: 'primary' },
        ],
        categories: [],
        preparationStates: ['raw'],
        sourceId,
      },
    ],
    portions: [],
    composition: [],
  };
  const manifest = deriveFoodCatalogManifestV1(
    {
      format: 'nutrixx.food-catalog-manifest',
      schemaVersion: 1,
      releaseId: 'test-catalog',
      publishedAt: now,
      sourceDatasets: [
        {
          provider: 'usda-fdc',
          dataset: 'foundation',
          sourceRelease: '2026-04-30',
          licenseId: 'CC0-1.0',
          homepage: 'https://fdc.nal.usda.gov/',
        },
      ],
      quality: {
        sourceEntries: 1,
        quarantinedEntries: 0,
        sourceComponents: 0,
        quarantinedComponents: 0,
        quarantineReasonCounts: {},
      },
    },
    payload,
  );
  const catalogBytes = gzipSync(
    JSON.stringify({
      format: 'nutrixx.reference-release',
      releaseId: manifest.releaseId,
      publishedAt: manifest.publishedAt,
      manifest,
      payload,
    }),
  );
  await writeFile(catalogPath, catalogBytes);
  const protein = FOOD_COMPONENTS_V1.find(
    (component) => component.accessCode === 'PROCNT',
  );
  assert.ok(protein);
  const proposal = {
    format: 'nutrixx.reference-proposal',
    schemaVersion: 1,
    catalog: {
      releaseId: manifest.releaseId,
      artifactSha256: sha256(catalogBytes),
    },
    source: {
      sourceId: 'published-table-2026',
      title: 'Example published table',
      publisher: 'Example publisher',
      sourceUrl: 'https://example.org/table',
      licenseId: 'CC-BY-4.0',
      edition: '2026',
      retrievedAt: now,
      expectedSha256: sha256(sourceBytes),
    },
    extraction: {
      operatorId: 'operator-1',
      extractedAt: now,
      method: 'manual-transcription',
    },
    claims: [
      {
        kind: 'food-composition',
        foodId,
        componentId: protein.componentId,
        value: {
          state: 'known',
          amount: '0',
          unit: { system: 'ucum', code: 'g' },
          basis: 'per-100-gram-edible',
        },
        locator: 'Table 1, row 4',
      },
      {
        kind: 'cooking-yield',
        foodId: '33333333-3333-5333-a333-333333333333',
        methodId: 'boil',
        cookedToRawMassRatio: '1.2',
        locator: 'Table 2, row 5',
      },
    ],
  };
  await writeFile(proposalPath, JSON.stringify(proposal));
  const input = { sourcePath, proposalPath, catalogPath, workbenchPath };
  const first = await stageReferenceDataV1(input);
  const second = await stageReferenceDataV1(input);
  assert.equal(first.runId, second.runId);
  assert.equal(first.proposed.length, 1);
  assert.equal(first.quarantined.length, 1);
  assert.match(first.quarantined[0].reason, /outside the pinned catalog/u);
  assert.deepEqual(
    await readFile(path.join(workbenchPath, first.evidence.sourcePath)),
    sourceBytes,
  );
  assert.equal(first.evidence.sourceSha256, sha256(sourceBytes));
  assert.deepEqual(await readFile(catalogPath), catalogBytes);
  assert.deepEqual(
    JSON.parse(await readFile(first.runPath, 'utf8')).proposed,
    first.proposed,
  );
});
