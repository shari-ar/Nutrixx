import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BrowserOnboardingStore,
  ONBOARDING_LOCATOR_STORAGE_KEY,
} from './browser-onboarding';

const PROFILE_ID = '10000000-0000-4000-8000-000000000001';
const SUBJECT_ID = '20000000-0000-4000-8000-000000000001';
const NOW = '2026-10-04T10:00:00.000Z';

function createStore(database: IDBFactory) {
  const identifiers = [PROFILE_ID, SUBJECT_ID];
  return new BrowserOnboardingStore({
    storage: localStorage,
    indexedDB: database,
    keyRange: IDBKeyRange,
    createId: () => identifiers.shift() ?? PROFILE_ID,
    now: () => NOW,
    timeZone: () => 'America/New_York',
  });
}

beforeEach(() => {
  localStorage.clear();
});

describe('browser onboarding store', () => {
  it('saves and reloads the one-time profile entirely offline', async () => {
    const database = new IDBFactory();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const firstSession = createStore(database);

    await expect(
      firstSession.save({
        ageYears: 32,
        heightCentimeters: '172.0',
        weightKilograms: '68.0',
        physiologicalReference: 'female',
        primaryGoal: 'maintain',
        foodRestrictions: ['peanut allergy'],
      }),
    ).resolves.toMatchObject({
      ageYears: 32,
      heightCentimeters: '172',
      revision: 1,
    });

    await expect(createStore(database).load()).resolves.toMatchObject({
      profileId: PROFILE_ID,
      ownerSubjectId: SUBJECT_ID,
      primaryGoal: 'maintain',
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(localStorage.getItem(ONBOARDING_LOCATOR_STORAGE_KEY)).toContain(
      PROFILE_ID,
    );
    vi.unstubAllGlobals();
  });

  it('keeps the first profile identity when values are updated', async () => {
    const database = new IDBFactory();
    const store = createStore(database);
    const values = {
      ageYears: 32,
      heightCentimeters: '172',
      weightKilograms: '68',
      physiologicalReference: 'female' as const,
      primaryGoal: 'maintain' as const,
      foodRestrictions: [] as readonly string[],
    };
    await store.save(values);

    await expect(
      store.save({ ...values, primaryGoal: 'gain' }),
    ).resolves.toMatchObject({
      profileId: PROFILE_ID,
      revision: 2,
      primaryGoal: 'gain',
    });
  });
});
