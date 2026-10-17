import {
  rankNextMealCandidatesV1,
  reviewNextMealRankingV1,
} from '@nutrixx/optimizer-engine';

import { BrowserNutritionStateStore } from '../lib/browser-nutrition-state';
import { BrowserPlanningStore } from '../lib/browser-planning-core';
import { BrowserStageTwoStore } from '../lib/browser-stage-two';
import {
  STAGE_4_ACCEPTANCE_INSTANT,
  STAGE_4_CATALOG_SHA256,
  stage4NutritionFixture,
} from '../lib/next-meal-acceptance-fixture';
import { buildNextMealCatalogSnapshot } from '../lib/next-meal-catalog';
import { buildNextMealInputV1 } from '../lib/next-meal-input';

import type {
  NextMealPreparationRequestV1,
  NextMealPreparationResultV1,
} from '../lib/next-meal-preparation-client';
import type { FoodCatalogPayloadV1 } from '@nutrixx/food-knowledge';

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

async function prepare(
  request: NextMealPreparationRequestV1,
): Promise<NextMealPreparationResultV1> {
  if (request.kind === 'LOCAL_RECOMMENDATION') {
    const onboarding = { load: async () => request.profile };
    const store = new BrowserStageTwoStore({
      indexedDB,
      keyRange: IDBKeyRange,
      createId: () => crypto.randomUUID(),
      now: () => new Date().toISOString(),
      timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      onboarding,
    });
    const planning = new BrowserPlanningStore(
      undefined,
      onboarding,
      new BrowserNutritionStateStore({
        indexedDB,
        keyRange: IDBKeyRange,
        createId: () => crypto.randomUUID(),
        now: () => new Date().toISOString(),
        timeZone: () =>
          Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        onboarding,
      }),
      store,
    );
    return {
      status: 'RECOMMENDATION',
      result: await planning.createRecommendation({
        inventory: request.inventory,
      }),
    };
  }

  if (request.kind === 'LOCAL_LOAD') {
    const onboarding = { load: async () => request.profile };
    const foods = new BrowserStageTwoStore({
      indexedDB,
      keyRange: IDBKeyRange,
      createId: () => crypto.randomUUID(),
      now: () => new Date().toISOString(),
      timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      onboarding,
    });
    const planning = new BrowserPlanningStore(
      undefined,
      onboarding,
      {
        load: async () => {
          throw new TypeError('Unused nutrition read.');
        },
      },
      foods,
    );
    return { status: 'SNAPSHOT', snapshot: await planning.load() };
  }

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
    status: 'BENCHMARK',
    measurement: {
      catalogEntries: catalog.entries.length,
      comparable,
      comparisonNutrients: input.request.temporalRules.length,
      artifactSha256: release.artifactSha256,
      loadMs,
      mapMs,
      inputMs,
      workerSamplesMs,
      workerP95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1]!,
    },
  };
}

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<NextMealPreparationRequestV1>) => void;
  postMessage: (result: NextMealPreparationResultV1) => void;
};

scope.onmessage = (event) => {
  void prepare(event.data).then(
    (result) => scope.postMessage(result),
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
