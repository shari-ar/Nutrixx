import { verifyCanonicalRecordV1 } from '@nutrixx/canonical-schema';
import { nextMealIsCurrentV1 } from '@nutrixx/optimizer-engine';
import {
  IndexedDbCanonicalRecordRepository,
  sha256Canonical,
} from '@nutrixx/persistence-indexeddb';

import { BrowserNutritionStateStore } from '../lib/browser-nutrition-state';
import { BrowserPlanningStore } from '../lib/browser-planning-core';
import { BrowserStageTwoStore } from '../lib/browser-stage-two';
import {
  projectPlanningSnapshot,
  readPlanningView,
  savePlanningView,
} from '../lib/next-meal-display-cache';
import { LOCAL_USER_DATABASE_NAME } from '../lib/storage-constants';

import type {
  NextMealPreparationMessageV1,
  NextMealPreparationProgressV1,
  NextMealPreparationRequestV1,
  NextMealPreparationResultV1,
} from '../lib/next-meal-preparation-client';

async function prepare(
  request: NextMealPreparationRequestV1,
  report: (progress: NextMealPreparationProgressV1) => void,
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
      result: await planning.createRecommendation(
        {
          inventory: request.inventory,
          ...(request.rankingChunkHints
            ? { rankingChunkHints: request.rankingChunkHints }
            : {}),
        },
        (stage, detail) => {
          if (stage === 'classifying-catalog' || stage === 'scoring-catalog') {
            const processed = detail?.processed ?? 0;
            const total = detail?.total ?? 0;
            const percent =
              total === 0 ? 100 : Math.floor((processed / total) * 100);
            report({
              status: 'PROGRESS',
              stage,
              processed,
              total,
              ...(detail
                ? { recommendedChunkSize: detail.recommendedChunkSize }
                : {}),
              message: `${stage === 'classifying-catalog' ? 'Classifying catalog entries' : 'Simulating robust multi-day continuations'}… ${processed.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} (${percent}%).`,
            });
            return;
          }
          if (stage === 'clearing-prior-run')
            report({
              status: 'PROGRESS',
              stage: 'clearing-prior-run',
              message: 'Replacing the previous recommendation…',
            });
          else if (stage === 'loading-inputs')
            report({
              status: 'PROGRESS',
              stage: 'loading-planning-inputs',
              message: 'Loading your recorded meals and local catalog…',
            });
          else if (stage === 'ranking-catalog')
            report({
              status: 'PROGRESS',
              stage: 'ranking-catalog',
              message: 'Ranking the local catalog for your next meal…',
            });
          else
            report({
              status: 'PROGRESS',
              stage: 'saving-recommendation',
              message: 'Saving the compact recommendation locally…',
            });
        },
      ),
    };
  }

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
  if (request.kind === 'LOCAL_EXPLANATION')
    return {
      status: 'EXPLANATION',
      explanation: await planning.loadExplanation(
        request.runId,
        request.candidateKey,
      ),
    };
  if (request.kind === 'LOCAL_SELECT') {
    const beforeRepository = await IndexedDbCanonicalRecordRepository.create({
      databaseName: LOCAL_USER_DATABASE_NAME,
      indexedDB,
      keyRange: IDBKeyRange,
      verifyRecord: (record) =>
        verifyCanonicalRecordV1(record, sha256Canonical),
    });
    let beforeSequence: number;
    let activeReleaseId: string | null;
    let cached: Awaited<ReturnType<typeof readPlanningView>>;
    try {
      beforeSequence = await beforeRepository.latestTransactionSequence();
      activeReleaseId = await foods.activeCatalogRelease();
      cached = await readPlanningView(
        indexedDB,
        request.profile.ownerSubjectId,
        beforeSequence,
        activeReleaseId,
      );
    } finally {
      await beforeRepository.close();
    }
    const intention = await planning.selectIntention(
      request.runId,
      request.candidateKey,
      (stage) =>
        report(
          stage === 'validating'
            ? {
                status: 'PROGRESS',
                stage: 'validating-selection',
                message: 'Validating the current recommendation…',
              }
            : {
                status: 'PROGRESS',
                stage: 'saving-selection',
                message: 'Saving your selection locally…',
              },
        ),
    );
    report({
      status: 'PROGRESS',
      stage: 'preparing-meal-form',
      message: 'Preparing the meal recording form…',
    });
    const afterRepository = await IndexedDbCanonicalRecordRepository.create({
      databaseName: LOCAL_USER_DATABASE_NAME,
      indexedDB,
      keyRange: IDBKeyRange,
      verifyRecord: (record) =>
        verifyCanonicalRecordV1(record, sha256Canonical),
    });
    try {
      const afterSequence = await afterRepository.latestTransactionSequence();
      const currentReleaseId = await foods.activeCatalogRelease();
      if (
        cached?.run?.runId === request.runId &&
        currentReleaseId === activeReleaseId
      ) {
        await savePlanningView(indexedDB, {
          owner: request.profile.ownerSubjectId,
          sequence: afterSequence,
          activeReleaseId: currentReleaseId,
          snapshot: {
            ...cached,
            intention,
            loggedMealId: null,
          },
        });
      }
    } finally {
      await afterRepository.close();
    }
    return { status: 'SELECTION', intention };
  }
  const repository = await IndexedDbCanonicalRecordRepository.create({
    databaseName: LOCAL_USER_DATABASE_NAME,
    indexedDB,
    keyRange: IDBKeyRange,
    verifyRecord: (record) => verifyCanonicalRecordV1(record, sha256Canonical),
  });
  try {
    const sequence = await repository.latestTransactionSequence();
    const activeReleaseId = await foods.activeCatalogRelease();
    const cached = await readPlanningView(
      indexedDB,
      request.profile.ownerSubjectId,
      sequence,
      activeReleaseId,
    );
    if (
      cached !== null &&
      sequence === (await repository.latestTransactionSequence()) &&
      activeReleaseId === (await foods.activeCatalogRelease())
    ) {
      const projected = projectPlanningSnapshot(cached);
      const run = projected.run;
      try {
        await savePlanningView(indexedDB, {
          owner: request.profile.ownerSubjectId,
          sequence,
          activeReleaseId,
          snapshot: projected,
        });
      } catch {
        // A disposable view can always be rebuilt from the canonical run.
      }
      return {
        status: 'SNAPSHOT',
        snapshot: {
          ...projected,
          fresh:
            projected.fresh &&
            run !== null &&
            nextMealIsCurrentV1(
              run.input.candidates.requestedAt,
              run.validUntil,
              new Date().toISOString(),
            ),
        },
      };
    }
    const before = await repository.latestTransactionSequence();
    const full = await planning.load();
    const after = await repository.latestTransactionSequence();
    if (before === after) {
      try {
        await savePlanningView(indexedDB, {
          owner: request.profile.ownerSubjectId,
          sequence: after,
          activeReleaseId: await foods.activeCatalogRelease(),
          snapshot: projectPlanningSnapshot(full),
        });
      } catch {
        // A disposable view can always be rebuilt from the canonical run.
      }
    }
    return { status: 'SNAPSHOT', snapshot: projectPlanningSnapshot(full) };
  } finally {
    await repository.close();
  }
}

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<NextMealPreparationRequestV1>) => void;
  postMessage: (result: NextMealPreparationMessageV1) => void;
};

scope.onmessage = (event) => {
  void prepare(event.data, (progress) => scope.postMessage(progress)).then(
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
