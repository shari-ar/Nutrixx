import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gzipSync, gunzipSync } from 'node:zlib';

import { deriveFoodCatalogManifestV1 } from '@nutrixx/food-knowledge';
import { FOOD_COMPONENTS_V1 } from '@nutrixx/nutrition-engine';
import { nextMealSourceKey } from '@nutrixx/optimizer-engine';

import { stageReferenceDataV1 } from './stage-reference-data.mjs';
import { buildReferenceCandidateV1 } from './build-reference-candidate.mjs';
import {
  activateReferenceCatalogFilesV1,
  publishReferenceCandidateV1,
} from './publish-reference-candidate.mjs';

const id = '22222222-2222-5222-a222-222222222222';
const sourceId = '11111111-1111-5111-a111-111111111111';
const portionId = '33333333-3333-5333-a333-333333333333';
const now = '2026-10-18T00:00:00.000Z';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('reviewed local evidence creates a deterministic inactive candidate after real engine replay', async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nutrixx-candidate-'));
  context.after(async () => {
    if (!directory.startsWith(path.join(tmpdir(), 'nutrixx-candidate-')))
      throw new Error('Unsafe test cleanup path.');
    await rm(directory, { recursive: true, force: true });
  });
  const protein = FOOD_COMPONENTS_V1.find(
    (item) => item.accessCode === 'PROCNT',
  );
  assert.ok(protein);
  const sourceBytes = Buffer.from('Verified table: protein 10 g per 100 g.\n');
  const sourcePath = path.join(directory, 'source.txt');
  const proposalPath = path.join(directory, 'proposal.json');
  const catalogPath = path.join(directory, 'catalog.json.gz');
  const reviewPath = path.join(directory, 'review.json');
  const corpusPath = path.join(directory, 'corpus.json');
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
        foodId: id,
        revision: 1,
        foodClass: 'usda.foundation',
        descriptions: [
          { locale: 'en', value: 'Fixture food', kind: 'primary' },
        ],
        categories: [],
        preparationStates: ['prepared'],
        sourceId,
      },
    ],
    portions: [
      {
        portionId,
        foodId: id,
        foodRevision: 1,
        description: { locale: 'en', value: '100 g', kind: 'primary' },
        amount: '1',
        measureUnit: { system: 'ucum', code: '1' },
        gramWeight: '100',
        edibleFraction: '1',
        sourceId,
      },
    ],
    composition: [
      {
        observationId: '44444444-4444-5444-a444-444444444444',
        foodId: id,
        foodRevision: 1,
        nutrientId: protein.componentId,
        sourceNutrientId: protein.componentId,
        sourceNutrientName: protein.name,
        preparationState: 'prepared',
        value: { state: 'unknown', reason: 'not-measured' },
        sourceId,
        quality: [],
      },
    ],
  };
  const manifest = deriveFoodCatalogManifestV1(
    {
      format: 'nutrixx.food-catalog-manifest',
      schemaVersion: 1,
      releaseId: 'fixture-catalog',
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
  const proposal = {
    format: 'nutrixx.reference-proposal',
    schemaVersion: 1,
    catalog: {
      releaseId: manifest.releaseId,
      artifactSha256: sha256(catalogBytes),
    },
    source: {
      sourceId: 'published-table-2026',
      title: 'Published table',
      publisher: 'Fixture publisher',
      sourceUrl: 'https://example.org/table',
      licenseId: 'CC-BY-4.0',
      edition: '2026',
      retrievedAt: now,
      expectedSha256: sha256(sourceBytes),
    },
    extraction: {
      operatorId: 'extractor-1',
      extractedAt: now,
      method: 'manual-transcription',
    },
    claims: [
      {
        kind: 'food-composition',
        foodId: id,
        componentId: protein.componentId,
        value: {
          state: 'known',
          amount: '10',
          unit: { system: 'ucum', code: 'g' },
          basis: 'per-100-gram-edible',
        },
        locator: 'Table 1, row 1',
      },
    ],
  };
  await writeFile(proposalPath, JSON.stringify(proposal));
  const staged = await stageReferenceDataV1({
    sourcePath,
    proposalPath,
    catalogPath,
    workbenchPath: directory,
  });
  assert.equal(staged.quarantined.length, 0);
  const review = {
    format: 'nutrixx.reference-review',
    schemaVersion: 1,
    runId: staged.runId,
    reviewerId: 'reviewer-2',
    reviewedAt: now,
    decisions: [
      {
        claimKey: staged.proposed[0].claimKey,
        disposition: 'accepted',
        rationale: 'Source row and unit checked.',
        checks: {
          sourceEvidence: true,
          usageRights: true,
          unitsAndMethod: true,
        },
      },
    ],
  };
  await writeFile(reviewPath, JSON.stringify(review));
  const reference = {
    kind: 'food',
    catalogReleaseId: manifest.releaseId,
    foodId: id,
    foodRevision: 1,
  };
  const evidence = { kind: 'dataset', sourceId, sourceVersion: '2026-04-30' };
  const request = {
    candidates: {
      requestedAt: '2026-10-18T10:00:00.000Z',
      manifest: { entryKeys: [nextMealSourceKey(reference)] },
      entries: [
        {
          reference,
          displayName: 'Fixture food',
          preparationState: 'prepared',
          edibleResolution: 'resolved',
          portions: [{ portionId, edibleGrams: '100', source: evidence }],
          nutrientsPer100EdibleGrams: [],
          restrictionEvidence: {
            state: 'verified',
            ingredientFoodIds: [],
            allergenCodes: [],
            source: evidence,
          },
        },
      ],
      exclusions: {
        foodIds: [],
        recipeIds: [],
        ingredientFoodIds: [],
        allergenCodes: [],
      },
      inventory: { mode: 'ALL_CATALOG' },
      comparisonNutrients: [
        {
          nutrientId: protein.componentId,
          unit: { system: 'ucum', code: 'g' },
        },
      ],
      hardLimits: [],
    },
    acceptedMeals: [],
    temporalRules: [
      {
        ruleId: 'protein',
        ruleVersion: 'fixture-v1',
        nutrientId: protein.componentId,
        unit: { system: 'ucum', code: 'g' },
        sourceScope: 'all-intake',
        timeBasis: 'elapsed-time',
        windowStartInclusive: '2026-10-18T00:00:00.000Z',
        windowEndExclusive: '2026-10-19T00:00:00.000Z',
        coverage: { state: 'complete', source: evidence },
        target: {
          amount: '10',
          mode: 'preferred',
          referenceType: 'planning-target',
          releaseId: 'fixture-reference',
          source: evidence,
        },
        weight: 1,
      },
    ],
  };
  await writeFile(
    corpusPath,
    JSON.stringify({
      format: 'nutrixx.reference-replay-corpus',
      schemaVersion: 1,
      corpusId: 'fixture-next-meal-v1',
      cases: [{ caseId: 'one-food', request }],
    }),
  );
  const input = {
    runPath: staged.runPath,
    reviewPath,
    corpusPath,
    catalogPath,
    outputPath: directory,
  };
  const first = await buildReferenceCandidateV1(input);
  const second = await buildReferenceCandidateV1(input);
  assert.equal(first.manifestPath, second.manifestPath);
  assert.equal(first.candidate.activation, 'inactive');
  assert.equal(first.report.status, 'REPLAYED');
  assert.equal(first.report.cases[0].before.comparable, 0);
  assert.equal(first.report.cases[0].after.comparable, 1);
  assert.equal(
    first.candidate.projection.sha256,
    sha256(
      await readFile(path.join(directory, first.candidate.projection.file)),
    ),
  );
  assert.equal(
    first.candidate.replay.sha256,
    sha256(await readFile(path.join(directory, first.candidate.replay.file))),
  );
  const published = await publishReferenceCandidateV1({
    ...input,
    outputPath: path.join(directory, 'publication'),
  });
  assert.equal(published.descriptor.candidateId, first.candidate.candidateId);
  assert.equal(published.descriptor.reviewedClaimCount, 1);
  const publishedBytes = await readFile(
    path.join(published.outputDirectory, published.descriptor.artifactName),
  );
  assert.equal(sha256(publishedBytes), published.descriptor.artifactSha256);
  const publishedRelease = JSON.parse(
    gunzipSync(publishedBytes).toString('utf8'),
  );
  assert.equal(publishedRelease.releaseId, published.descriptor.releaseId);
  assert.equal(publishedRelease.payload.composition.length, 1);
  assert.equal(publishedRelease.payload.composition[0].value.amount, '10');
  assert.equal(publishedRelease.payload.sources.length, 2);
  assert.deepEqual(await readFile(catalogPath), catalogBytes);
  const receipt = JSON.parse(
    await readFile(
      path.join(
        published.outputDirectory,
        `${published.descriptor.releaseId}.receipt.json`,
      ),
      'utf8',
    ),
  );
  const activeConfig = path.join(directory, 'active-food-catalog.json');
  const activeCatalog = path.join(directory, 'active-catalog');
  const activeDescriptor = {
    ...published.descriptor,
    artifactUrl: 'https://example.org/catalog.gz',
    receiptUrl: 'https://example.org/catalog.receipt.json',
  };
  await writeFile(activeConfig, JSON.stringify({ releaseId: 'old' }));
  await assert.rejects(
    activateReferenceCatalogFilesV1({
      descriptor: { ...activeDescriptor, artifactSha256: '0'.repeat(64) },
      artifact: publishedBytes,
      receipt,
      destination: activeCatalog,
      config: activeConfig,
    }),
    /differ/u,
  );
  assert.equal(
    JSON.parse(await readFile(activeConfig, 'utf8')).releaseId,
    'old',
  );
  await activateReferenceCatalogFilesV1({
    descriptor: activeDescriptor,
    artifact: publishedBytes,
    receipt,
    destination: activeCatalog,
    config: activeConfig,
  });
  assert.deepEqual(
    await readFile(path.join(activeCatalog, activeDescriptor.artifactName)),
    publishedBytes,
  );
  assert.equal(
    JSON.parse(await readFile(activeConfig, 'utf8')).releaseId,
    activeDescriptor.releaseId,
  );
  await writeFile(
    reviewPath,
    JSON.stringify({ ...review, reviewerId: 'extractor-1' }),
  );
  await assert.rejects(buildReferenceCandidateV1(input), /independent/u);
  await writeFile(reviewPath, JSON.stringify(review));
  await writeFile(path.join(directory, staged.evidence.sourcePath), 'tampered');
  await assert.rejects(buildReferenceCandidateV1(input), /missing or changed/u);
  await writeFile(
    path.join(directory, staged.evidence.sourcePath),
    sourceBytes,
  );

  const cookingProposalPath = path.join(directory, 'cooking-proposal.json');
  await writeFile(
    cookingProposalPath,
    JSON.stringify({
      ...proposal,
      claims: [
        {
          kind: 'cooking-yield',
          foodId: id,
          methodId: 'boil',
          cookedToRawMassRatio: '1.1',
          locator: 'Table 2, row 1',
        },
      ],
    }),
  );
  const cookingRun = await stageReferenceDataV1({
    sourcePath,
    proposalPath: cookingProposalPath,
    catalogPath,
    workbenchPath: directory,
  });
  await writeFile(
    reviewPath,
    JSON.stringify({
      ...review,
      runId: cookingRun.runId,
      decisions: [
        { ...review.decisions[0], claimKey: cookingRun.proposed[0].claimKey },
      ],
    }),
  );
  const blocked = await buildReferenceCandidateV1({
    ...input,
    runPath: cookingRun.runPath,
  });
  assert.equal(blocked.candidate.activation, 'inactive');
  assert.equal(blocked.report.status, 'BLOCKED');
  assert.deepEqual(blocked.report.unsupportedClaimKeys, [
    cookingRun.proposed[0].claimKey,
  ]);
  await assert.rejects(
    publishReferenceCandidateV1({
      ...input,
      runPath: cookingRun.runPath,
      outputPath: path.join(directory, 'blocked-publication'),
    }),
    /fully replayed/u,
  );
});
