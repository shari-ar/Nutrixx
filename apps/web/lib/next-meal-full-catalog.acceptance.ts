import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { FoodCatalogManifestV1Schema } from '@nutrixx/food-knowledge';
import {
  nextMealSourceKey,
  rankNextMealCandidatesV1,
  reviewNextMealRankingV1,
} from '@nutrixx/optimizer-engine';
import { expect, it } from 'vitest';

import {
  STAGE_4_ACCEPTANCE_INSTANT,
  STAGE_4_CATALOG_PATH,
  STAGE_4_CATALOG_SHA256,
  stage4NutritionFixture,
} from './next-meal-acceptance-fixture';
import { buildNextMealCatalogSnapshot } from './next-meal-catalog';
import { buildNextMealInputV1 } from './next-meal-input';

import type { FoodCatalogPayloadV1 } from '@nutrixx/food-knowledge';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const artifactPath = path.join(
  root,
  'apps/web/public',
  STAGE_4_CATALOG_PATH.slice(1),
);
const reportPath = path.join(root, '.temp/stage-4-acceptance/report.json');

it('audits the pinned full catalog and sparse-evidence behavior without network access', async () => {
  const timings: Record<string, number> = {};
  let start = performance.now();
  const compressed = await readFile(artifactPath);
  const artifactSha256 = createHash('sha256')
    .update(Uint8Array.from(compressed))
    .digest('hex');
  expect(artifactSha256).toBe(STAGE_4_CATALOG_SHA256);
  const release = JSON.parse(gunzipSync(compressed).toString('utf8')) as {
    releaseId: string;
    manifest: unknown;
    payload: FoodCatalogPayloadV1;
  };
  const manifest = FoodCatalogManifestV1Schema.parse(release.manifest);
  expect(release.releaseId).toBe(manifest.releaseId);
  expect(release.payload.foods).toHaveLength(manifest.counts.foods);
  expect(release.payload.portions).toHaveLength(manifest.counts.portions);
  expect(release.payload.composition).toHaveLength(
    manifest.counts.compositionObservations,
  );
  timings['loadMs'] = Math.round(performance.now() - start);

  start = performance.now();
  const catalog = buildNextMealCatalogSnapshot({
    activeReleaseId: manifest.releaseId,
    catalog: release.payload,
    customFoods: [],
    recipes: [],
  });
  expect(catalog.entries).toHaveLength(manifest.counts.foods);
  expect(catalog.manifest.entryKeys).toHaveLength(manifest.counts.foods);
  timings['mapMs'] = Math.round(performance.now() - start);

  start = performance.now();
  const built = buildNextMealInputV1({
    catalog,
    nutrition: stage4NutritionFixture(),
    foodRestrictions: [],
    inventory: null,
    now: STAGE_4_ACCEPTANCE_INSTANT,
    trackingStartedAt: '2026-10-10T00:00:00.000Z',
  });
  expect(built.status).toBe('READY');
  if (built.status !== 'READY')
    throw new TypeError(built.reasonCodes.join(', '));
  timings['inputMs'] = Math.round(performance.now() - start);

  start = performance.now();
  const ranking = rankNextMealCandidatesV1(built.request);
  const review = reviewNextMealRankingV1(built.request, ranking);
  timings['rankAndReviewMs'] = Math.round(performance.now() - start);
  expect(review.status).toBe('APPROVED');
  expect(ranking.total).toBe(catalog.entries.length);
  expect(ranking.processed).toBe(ranking.total);
  expect(ranking.ranked.length + ranking.unranked.length).toBe(ranking.total);
  expect(
    new Set(
      [...ranking.ranked, ...ranking.unranked].map((row) => row.candidateKey),
    ).size,
  ).toBe(ranking.total);
  expect(rankNextMealCandidatesV1(built.request)).toEqual(ranking);
  const deterministicResultSha256 = createHash('sha256')
    .update(JSON.stringify(ranking))
    .digest('hex');

  const knownIron = catalog.entries.find(
    (entry) =>
      entry.edibleResolution === 'resolved' &&
      entry.portions.length > 0 &&
      entry.nutrientsPer100EdibleGrams.some(
        (item) =>
          item.nutrientId === 'nutrient.iron' &&
          item.state === 'known' &&
          item.amountPer100EdibleGrams !== '0',
      ),
  );
  if (knownIron === undefined)
    throw new TypeError('The installed catalog has no known iron observation.');
  const sparse = {
    ...knownIron,
    nutrientsPer100EdibleGrams: knownIron.nutrientsPer100EdibleGrams.map(
      (item) =>
        item.nutrientId === 'nutrient.iron'
          ? {
              state: 'unknown' as const,
              nutrientId: item.nutrientId,
              reasonCode: 'acceptance-fixture-missing-value',
            }
          : item,
    ),
  };
  const ironRule = built.request.temporalRules.find(
    (rule) => rule.nutrientId === 'nutrient.iron',
  );
  if (ironRule === undefined)
    throw new TypeError('The selected target set has no iron rule.');
  const sparseRequest = {
    ...built.request,
    candidates: {
      ...built.request.candidates,
      entries: [sparse],
      manifest: { entryKeys: [nextMealSourceKey(sparse.reference)] },
      comparisonNutrients: [
        { nutrientId: ironRule.nutrientId, unit: ironRule.unit },
      ],
    },
    temporalRules: [ironRule],
  };
  const sparseRanking = rankNextMealCandidatesV1(sparseRequest);
  expect(reviewNextMealRankingV1(sparseRequest, sparseRanking).status).toBe(
    'APPROVED',
  );
  expect(sparseRanking.ranked).toHaveLength(0);
  expect(sparseRanking.unranked[0]?.classification).toBe('EVIDENCE_LIMITED');
  const boundedRequest = {
    ...sparseRequest,
    candidates: {
      ...sparseRequest.candidates,
      entries: [knownIron],
      hardLimits: [
        {
          ruleId: 'acceptance-iron-upper-bound',
          nutrientId: 'nutrient.iron',
          unit: ironRule.unit,
          maximum: '0',
          recordedIntake: { state: 'known' as const, amount: '0' },
          sourceScope: 'all-intake' as const,
        },
      ],
    },
  };
  const boundedRanking = rankNextMealCandidatesV1(boundedRequest);
  expect(reviewNextMealRankingV1(boundedRequest, boundedRanking).status).toBe(
    'APPROVED',
  );
  expect(boundedRanking.ranked).toHaveLength(0);
  expect(boundedRanking.unranked[0]?.classification).toBe('EXCLUDED');
  const inventoryRequest = {
    ...sparseRequest,
    candidates: {
      ...sparseRequest.candidates,
      entries: [knownIron],
      inventory: {
        mode: 'AVAILABLE_ONLY' as const,
        revision: 1,
        entries: [],
      },
    },
  };
  const inventoryRanking = rankNextMealCandidatesV1(inventoryRequest);
  expect(
    reviewNextMealRankingV1(inventoryRequest, inventoryRanking).status,
  ).toBe('APPROVED');
  expect(inventoryRanking.unranked[0]?.classification).toBe('UNAVAILABLE');

  const report = {
    schemaVersion: 1,
    evaluatedAt: new Date().toISOString(),
    environment: {
      runtime: `Node.js ${process.version}`,
      platform: process.platform,
      architecture: process.arch,
      memoryLimit: 'Node process; not a browser/device sign-off',
    },
    catalog: {
      releaseId: manifest.releaseId,
      artifactSha256,
      foods: manifest.counts.foods,
      portions: manifest.counts.portions,
      compositionObservations: manifest.counts.compositionObservations,
    },
    scenario:
      'Adult age 30, female reference, US market, complete local catalog, empty accepted meal ledger',
    comparisonNutrients: built.request.temporalRules.map(
      (rule) => rule.nutrientId,
    ),
    ranking: {
      total: ranking.total,
      processed: ranking.processed,
      counts: ranking.counts,
      independentlyApproved: review.status === 'APPROVED',
      deterministicResultSha256,
      missingIronClassification: sparseRanking.unranked[0]?.classification,
      hardLimitClassification: boundedRanking.unranked[0]?.classification,
      absentInventoryClassification:
        inventoryRanking.unranked[0]?.classification,
    },
    timings,
    peakResidentBytes: process.resourceUsage().maxRSS * 1024,
    signOff: 'PENDING_BROWSER_DEVICE_AND_COVERAGE_EVIDENCE',
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
});
