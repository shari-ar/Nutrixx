'use client';

import { useCallback, useEffect, useState } from 'react';

import { BrowserNutritionStateStore } from '@/lib/browser-nutrition-state';
import { BrowserOnboardingStore } from '@/lib/browser-onboarding';
import { BrowserPlanningStore } from '@/lib/browser-planning';
import { BrowserStageTwoStore } from '@/lib/browser-stage-two';
import { measureNextMealAcceptanceInWorker } from '@/lib/next-meal-acceptance-client.dev';
import { STAGE_4_CATALOG_SHA256 } from '@/lib/next-meal-acceptance-fixture';

async function measure(): Promise<object> {
  let lastTick = performance.now();
  let maxMainThreadGapMs = 0;
  let maxGapAtMs = 0;
  const longTasks: { startMs: number; durationMs: number }[] = [];
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries())
      longTasks.push({
        startMs: Math.round(entry.startTime),
        durationMs: Math.round(entry.duration),
      });
  });
  observer.observe({ type: 'longtask' });
  const interval = window.setInterval(() => {
    const current = performance.now();
    const gap = current - lastTick - 50;
    if (gap > maxMainThreadGapMs) {
      maxMainThreadGapMs = gap;
      maxGapAtMs = current;
    }
    lastTick = current;
  }, 50);
  try {
    const start = performance.now();
    const prepared = await measureNextMealAcceptanceInWorker();
    if (prepared.status === 'FAILED' && prepared.reasonCode === 'http-403')
      throw new TypeError('HTTP 403 stopped the local acceptance run.');
    if (prepared.status !== 'BENCHMARK')
      throw new TypeError('The browser acceptance worker did not complete.');
    const preparationElapsedMs = Math.round(performance.now() - start);
    if (prepared.measurement.artifactSha256 !== STAGE_4_CATALOG_SHA256)
      throw new TypeError('The worker used a different catalog artifact.');
    return {
      schemaVersion: 1,
      evaluatedAt: new Date().toISOString(),
      browser: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGiB:
        (navigator as Navigator & { deviceMemory?: number }).deviceMemory ??
        null,
      ...prepared.measurement,
      preparationElapsedMs,
      maxMainThreadGapMs: Math.round(maxMainThreadGapMs),
      maxGapAtMs: Math.round(maxGapAtMs),
      longTasks: longTasks
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, 5),
      note: 'Development-browser measurement on this device; additional supported browser/device pairs remain separate sign-off evidence.',
    };
  } finally {
    window.clearInterval(interval);
    observer.disconnect();
  }
}

async function measureLocalJourney(): Promise<object> {
  const onboarding = new BrowserOnboardingStore();
  await onboarding.save({
    ageYears: 30,
    heightCentimeters: '170',
    weightKilograms: '70',
    physiologicalReference: 'female',
    primaryGoal: 'maintain',
    foodRestrictions: [],
  });
  await new BrowserNutritionStateStore().selectMarket('US');
  const response = await fetch('/acceptance/catalog', { cache: 'no-store' });
  if (!response.ok) throw new TypeError(`Catalog HTTP ${response.status}.`);
  const artifact = new File([await response.arrayBuffer()], 'catalog.json.gz', {
    type: 'application/gzip',
  });
  await new BrowserStageTwoStore().installCatalog(artifact);

  let lastTick = performance.now();
  let phase: 'create' | 'load' = 'create';
  const maxGap = { create: 0, load: 0 };
  const interval = window.setInterval(() => {
    const current = performance.now();
    maxGap[phase] = Math.max(maxGap[phase], current - lastTick - 50);
    lastTick = current;
  }, 50);
  try {
    const planning = new BrowserPlanningStore();
    let started = performance.now();
    const created = await planning.createRecommendation({ inventory: null });
    const createMs = Math.round(performance.now() - started);
    if (created.status !== 'READY')
      throw new TypeError(
        `Local input needs ${created.reasonCodes.join(', ')}.`,
      );
    phase = 'load';
    started = performance.now();
    const snapshot = await planning.load();
    const loadMs = Math.round(performance.now() - started);
    if (!snapshot.fresh || snapshot.run?.runId !== created.runId)
      throw new TypeError('The saved local recommendation did not reload.');
    return {
      schemaVersion: 1,
      evaluatedAt: new Date().toISOString(),
      browser: navigator.userAgent,
      journey: 'temporary-profile-installed-catalog-create-and-reload',
      catalogEntries: snapshot.run.result.total,
      comparable: snapshot.run.result.counts.COMPARABLE,
      createMs,
      loadMs,
      createMainThreadGapMs: Math.round(maxGap.create),
      loadMainThreadGapMs: Math.round(maxGap.load),
      workerP95Ms: createMs,
      maxMainThreadGapMs: Math.round(Math.max(maxGap.create, maxGap.load)),
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
    const local = new URLSearchParams(window.location.search).has('run-local');
    (local ? measureLocalJourney() : measure()).then(
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
    const params = new URLSearchParams(window.location.search);
    if (!params.has('run') && !params.has('run-local')) return;
    const timer = window.setTimeout(start, 1_500);
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
