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
  NextMealPreparationRequestV1,
  NextMealPreparationResultV1,
} from '../lib/next-meal-preparation-client';

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
      const run = cached.run;
      return {
        status: 'SNAPSHOT',
        snapshot: {
          ...cached,
          fresh:
            cached.fresh &&
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
