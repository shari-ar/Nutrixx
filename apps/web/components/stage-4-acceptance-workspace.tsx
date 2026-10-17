'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  STAGE_4_ACCEPTANCE_INSTANT,
  STAGE_4_CATALOG_SHA256,
  stage4NutritionFixture,
} from '@/lib/next-meal-acceptance-fixture';
import { buildNextMealCatalogSnapshot } from '@/lib/next-meal-catalog';
import { buildNextMealInputV1 } from '@/lib/next-meal-input';

import type { NextMealWorkerResultV1 } from '../workers/next-meal.worker';
import type { FoodCatalogPayloadV1 } from '@nutrixx/food-knowledge';
import type { NextMealRankingRequest } from '@nutrixx/optimizer-engine';

const sampleCount = 5;

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function workerRun(
  request: NextMealRankingRequest,
): Promise<NextMealWorkerResultV1> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/next-meal.worker.ts', import.meta.url),
      { type: 'module' },
    );
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new TypeError('The browser worker exceeded its 90-second limit.'));
    }, 90_000);
    worker.onmessage = (event: MessageEvent<NextMealWorkerResultV1>) => {
      window.clearTimeout(timeout);
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = () => {
      window.clearTimeout(timeout);
      worker.terminate();
      reject(new TypeError('The browser worker failed.'));
    };
    worker.postMessage(request);
  });
}

async function measure(): Promise<object> {
  let lastTick = performance.now();
  let maxMainThreadGapMs = 0;
  const interval = window.setInterval(() => {
    const current = performance.now();
    maxMainThreadGapMs = Math.max(maxMainThreadGapMs, current - lastTick - 50);
    lastTick = current;
  }, 50);
  try {
    let start = performance.now();
    const response = await fetch('/acceptance/catalog', { cache: 'no-store' });
    if (!response.ok) throw new TypeError(`Catalog HTTP ${response.status}.`);
    const compressed = await response.arrayBuffer();
    const actualHash = await sha256(compressed);
    if (actualHash !== STAGE_4_CATALOG_SHA256)
      throw new TypeError(
        `The local catalog digest differs from the pinned release: ${actualHash} (${compressed.byteLength} bytes; ${response.url}; length ${response.headers.get('content-length')}; encoding ${response.headers.get('content-encoding')}).`,
      );
    const decompressed = new Blob([compressed])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'));
    const release = (await new Response(decompressed).json()) as {
      releaseId: string;
      payload: FoodCatalogPayloadV1;
    };
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
    const built = buildNextMealInputV1({
      catalog,
      nutrition: stage4NutritionFixture(),
      foodRestrictions: [],
      inventory: null,
      now: STAGE_4_ACCEPTANCE_INSTANT,
      trackingStartedAt: '2026-10-10T00:00:00.000Z',
    });
    if (built.status !== 'READY')
      throw new TypeError(`Input needs ${built.reasonCodes.join(', ')}.`);
    const inputMs = Math.round(performance.now() - start);
    const workerSamplesMs: number[] = [];
    let comparable = 0;
    for (let index = 0; index < sampleCount; index += 1) {
      start = performance.now();
      const result = await workerRun(built.request);
      workerSamplesMs.push(Math.round(performance.now() - start));
      if (
        result.status !== 'APPROVED' ||
        result.ranking.total !== catalog.entries.length ||
        result.ranking.processed !== result.ranking.total
      )
        throw new TypeError(
          'The worker did not independently approve a complete census.',
        );
      comparable = result.ranking.counts.COMPARABLE;
    }
    const sorted = [...workerSamplesMs].sort((a, b) => a - b);
    return {
      schemaVersion: 1,
      evaluatedAt: new Date().toISOString(),
      browser: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGiB:
        (navigator as Navigator & { deviceMemory?: number }).deviceMemory ??
        null,
      artifactSha256: STAGE_4_CATALOG_SHA256,
      catalogEntries: catalog.entries.length,
      comparable,
      comparisonNutrients: built.request.temporalRules.length,
      loadMs,
      mapMs,
      inputMs,
      workerSamplesMs,
      workerP95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
      maxMainThreadGapMs: Math.round(maxMainThreadGapMs),
      note: 'Development-browser measurement on this device; additional supported browser/device pairs remain separate sign-off evidence.',
    };
  } finally {
    window.clearInterval(interval);
  }
}

export function Stage4AcceptanceWorkspace() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(() => {
    setRunning(true);
    setError(null);
    measure().then(
      (report) => {
        setResult(JSON.stringify(report, null, 2));
        setRunning(false);
      },
      (reason: unknown) => {
        setError(
          reason instanceof Error ? reason.message : 'Measurement failed.',
        );
        setRunning(false);
      },
    );
  }, []);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('run')) return;
    const timer = window.setTimeout(start, 0);
    return () => window.clearTimeout(timer);
  }, [start]);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Stage 4 browser acceptance</h1>
      <p>
        Development-only local catalog and worker measurement. Five complete
        worker runs use the pinned adult corpus.
      </p>
      <button disabled={running} onClick={start} type="button">
        {running ? 'Measuring…' : 'Measure this browser'}
      </button>
      {error ? <pre id="stage4-error">{error}</pre> : null}
      {result ? <pre id="stage4-result">{result}</pre> : null}
    </main>
  );
}
