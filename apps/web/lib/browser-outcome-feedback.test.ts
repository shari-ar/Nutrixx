import { verifyCanonicalRecordV1 } from '@nutrixx/canonical-schema';
import {
  IndexedDbCanonicalRecordRepository,
  sha256Canonical,
} from '@nutrixx/persistence-indexeddb';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BrowserOnboardingStore } from './browser-onboarding';
import {
  BrowserOutcomeFeedbackStore,
  summarizeOutcomeFeedbackV1,
} from './browser-outcome-feedback';
import { LOCAL_USER_DATABASE_NAME } from './storage-constants';

const NOW = '2026-10-14T10:00:00.000Z';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('browser-local outcome feedback', () => {
  it('retains optional observations after reload and groups only identical lab identities', async () => {
    await new BrowserOnboardingStore({
      storage: localStorage,
      indexedDB,
      keyRange: IDBKeyRange,
      createId: () => crypto.randomUUID(),
      now: () => NOW,
      timeZone: () => 'UTC',
    }).save({
      ageYears: 30,
      heightCentimeters: '170',
      weightKilograms: '70',
      physiologicalReference: 'female',
      primaryGoal: 'maintain',
      foodRestrictions: [],
    });
    const store = new BrowserOutcomeFeedbackStore();
    await store.saveWeight({
      observedOn: '2026-10-01',
      weightKilograms: '072.50',
    });
    await store.saveWeight({
      observedOn: '2026-10-14',
      weightKilograms: '71.25',
    });
    await store.saveLab({
      observedOn: '2026-10-01',
      testName: 'Ferritin',
      result: '045.0',
      unit: 'ng/mL',
      laboratory: 'Lab A',
    });
    await store.saveLab({
      observedOn: '2026-10-14',
      testName: 'Ferritin',
      result: '50',
      unit: 'ng/mL',
      laboratory: 'Lab A',
    });
    await store.saveLab({
      observedOn: '2026-10-14',
      testName: 'Ferritin',
      result: '0.05',
      unit: 'µg/mL',
      laboratory: 'Lab B',
    });

    const reloaded = new BrowserOutcomeFeedbackStore();
    const summary = summarizeOutcomeFeedbackV1(await reloaded.list());
    expect(summary.weights.map((entry) => entry.weightKilograms)).toEqual([
      '72.5',
      '71.25',
    ]);
    expect(summary.weightChangeKilograms).toBe(-1.25);
    expect(
      summary.labSeries.map((series) => series.observations.length),
    ).toEqual([2, 1]);
    const repository = await IndexedDbCanonicalRecordRepository.create({
      databaseName: LOCAL_USER_DATABASE_NAME,
      indexedDB,
      keyRange: IDBKeyRange,
      verifyRecord: (record) =>
        verifyCanonicalRecordV1(record, sha256Canonical),
    });
    const artifact = await repository.exportLocalData(NOW);
    expect(
      artifact.content.records.filter(
        (record) => record.recordType === 'user-context.outcome-observation',
      ),
    ).toHaveLength(5);
    await repository.close();
    const labId = summary.labSeries[0]!.observations[0]!.observationId;
    expect(await reloaded.delete(labId)).toBe(true);
    expect((await reloaded.list()).length).toBe(4);
  });
});
