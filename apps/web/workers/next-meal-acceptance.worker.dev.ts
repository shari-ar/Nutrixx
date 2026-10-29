import {
  rankNextMealCandidatesV1,
  reviewNextMealRankingV1,
} from '@nutrixx/optimizer-engine';

import {
  STAGE_4_ACCEPTANCE_INSTANT,
  STAGE_4_CATALOG_SHA256,
  stage4NutritionFixture,
} from '../lib/next-meal-acceptance-fixture';
import { buildNextMealCatalogSnapshot } from '../lib/next-meal-catalog';
import { buildNextMealInputV1 } from '../lib/next-meal-input';

import type { NextMealAcceptanceMeasurementV1 } from '../lib/next-meal-acceptance-client.dev';
import type { FoodCatalogPayloadV1 } from '@nutrixx/food-knowledge';

type AcceptanceResult =
  | {
      readonly status: 'BENCHMARK';
      readonly measurement: NextMealAcceptanceMeasurementV1;
    }
  | { readonly status: 'FAILED'; readonly reasonCode: string };

async function acceptanceCatalog(): Promise<{
  releaseId: string;
  payload: FoodCatalogPayloadV1;
  artifactSha256: string;
}> {
  const response = await fetch('/acceptance/catalog', { cache: 'no-store' });
  if (!response.ok) throw new TypeError(`Catalog HTTP ${response.status}.`);
  const compressed = await response.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', compressed);
  const artifactSha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  if (artifactSha256 !== STAGE_4_CATALOG_SHA256)
    throw new TypeError('The pinned acceptance catalog digest changed.');
  const decompressed = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  const release = (await new Response(decompressed).json()) as {
    releaseId: string;
    payload: FoodCatalogPayloadV1;
  };
  return { ...release, artifactSha256 };
}

async function measure(): Promise<NextMealAcceptanceMeasurementV1> {
  let start = performance.now();
  const release = await acceptanceCatalog();
  const loadMs = Math.round(performance.now() - start);
  start = performance.now();
  const catalog = buildNextMealCatalogSnapshot({
    activeReleaseId: release.releaseId,
    catalog: release.payload,
    customFoods: [],
    recipes: [],
  });
  const mapMs = Math.round(performance.now() - start);
  start = performance.now();
  const input = buildNextMealInputV1({
    catalog,
    nutrition: stage4NutritionFixture(),
    foodRestrictions: [],
    inventory: null,
    now: STAGE_4_ACCEPTANCE_INSTANT,
    trackingStartedAt: '2026-10-10T00:00:00.000Z',
  });
  if (input.status !== 'READY')
    throw new TypeError(`Input needs ${input.reasonCodes.join(', ')}.`);
  const inputMs = Math.round(performance.now() - start);
  const workerSamplesMs: number[] = [];
  let comparable = 0;
  for (let index = 0; index < 5; index += 1) {
    start = performance.now();
    const review = reviewNextMealRankingV1(
      input.request,
      rankNextMealCandidatesV1(input.request),
    );
    workerSamplesMs.push(Math.round(performance.now() - start));
    if (
      review.status !== 'APPROVED' ||
      review.ranking.total !== catalog.entries.length ||
      review.ranking.processed !== review.ranking.total
    )
      throw new TypeError('The full-catalog review was incomplete.');
    comparable = review.ranking.counts.COMPARABLE;
  }
  const sorted = [...workerSamplesMs].sort((a, b) => a - b);
  return {
    catalogEntries: catalog.entries.length,
    comparable,
    comparisonNutrients: input.request.temporalRules.length,
    artifactSha256: release.artifactSha256,
    loadMs,
    mapMs,
    inputMs,
    workerSamplesMs,
    workerP95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1]!,
  };
}

const scope = globalThis as unknown as {
  onmessage: () => void;
  postMessage: (result: AcceptanceResult) => void;
};

scope.onmessage = () => {
  void measure().then(
    (measurement) => scope.postMessage({ status: 'BENCHMARK', measurement }),
    (error: unknown) =>
      scope.postMessage({
        status: 'FAILED',
        reasonCode:
          error instanceof Error && error.message.includes('HTTP 403')
            ? 'http-403'
            : 'preparation-error',
      }),
  );
};
