import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BrowserNutritionStateStore,
  type NutritionLockRunner,
} from './browser-nutrition-state';
import { BrowserStageTwoStore } from './browser-stage-two';

import type { StartingProfileV1 } from '@nutrixx/user-context';

const NOW = '2026-10-10T12:00:00.000Z';
const OCCURRED_AT = '2026-10-10T10:00:00.000Z';
const OWNER_ID = '10000000-0000-4000-8000-000000000001';
const runWithoutContention: NutritionLockRunner = (_name, operation) =>
  operation();

function serialLockRunner(): NutritionLockRunner {
  const tails = new Map<string, Promise<void>>();
  return async (name, operation) => {
    const previous = tails.get(name) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    tails.set(name, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (tails.get(name) === current) tails.delete(name);
    }
  };
}

function ids() {
  let next = 1;
  return () => `20000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
}

function profile(): StartingProfileV1 {
  return {
    profileId: '30000000-0000-4000-8000-000000000001',
    ownerSubjectId: OWNER_ID,
    revision: 1,
    ageYears: 32,
    heightCentimeters: '172',
    weightKilograms: '68',
    physiologicalReference: 'female',
    primaryGoal: 'maintain',
    foodRestrictions: [],
    timeZone: 'UTC',
    adultConfirmedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('browser nutrition state', () => {
  it('requests an exclusive browser Web Lock for the current subject', async () => {
    const request = vi.fn(
      async (
        _name: string,
        _options: LockOptions,
        operation: () => Promise<unknown>,
      ) => operation(),
    );
    vi.stubGlobal('navigator', { locks: { request } });
    const store = new BrowserNutritionStateStore({
      indexedDB: new IDBFactory(),
      keyRange: IDBKeyRange,
      createId: ids(),
      now: () => NOW,
      timeZone: () => 'UTC',
      onboarding: { load: async () => profile() },
    });
    expect((await store.load()).window.newSnapshotCount).toBe(9);
    expect(request).toHaveBeenCalledWith(
      `nutrixx:nutrition-state:${OWNER_ID}`,
      { mode: 'exclusive' },
      expect.any(Function),
    );
  });

  it('shares one in-flight calculation within a page and serializes two tabs', async () => {
    const indexedDB = new IDBFactory();
    const createId = ids();
    const serial = serialLockRunner();
    const lockCalls: string[] = [];
    const runExclusive: NutritionLockRunner = (name, operation) => {
      lockCalls.push(name);
      return serial(name, operation);
    };
    const dependencies = {
      indexedDB,
      keyRange: IDBKeyRange,
      createId,
      now: () => NOW,
      timeZone: () => 'UTC',
      onboarding: { load: async () => profile() },
      runExclusive,
    };
    const firstTab = new BrowserNutritionStateStore(dependencies);
    const secondTab = new BrowserNutritionStateStore(dependencies);
    const [first, repeated, second] = await Promise.all([
      firstTab.load(),
      firstTab.load(),
      secondTab.load(),
    ]);
    expect(first).toEqual(repeated);
    expect(
      [first.window.newSnapshotCount, second.window.newSnapshotCount].sort(),
    ).toEqual([0, 9]);
    expect(lockCalls).toEqual([
      `nutrixx:nutrition-state:${OWNER_ID}`,
      `nutrixx:nutrition-state:${OWNER_ID}`,
    ]);
    expect((await secondTab.load()).window.newSnapshotCount).toBe(0);
  });

  it('retains a user-selected usual activity level and exposes the sourced maintenance estimate', async () => {
    const indexedDB = new IDBFactory();
    const dependencies = {
      indexedDB,
      keyRange: IDBKeyRange,
      createId: ids(),
      now: () => NOW,
      timeZone: () => 'UTC',
      onboarding: { load: async () => profile() },
      runExclusive: runWithoutContention,
    };
    const store = new BrowserNutritionStateStore(dependencies);
    const before = await store.loadEnergyRequirement();
    expect(before.activityLevel).toBeNull();
    expect(before.result).toMatchObject({
      status: 'NEEDS_INPUT',
      fields: ['activity-level'],
    });

    await store.selectActivityLevel('low');
    const after = await new BrowserNutritionStateStore(
      dependencies,
    ).loadEnergyRequirement();
    expect(after.activityLevel).toBe('low');
    expect(after.result.status).toBe('READY');
    if (after.result.status === 'READY') {
      expect(
        after.result.maintenanceKilocaloriesPerDay.minimum,
      ).toBeGreaterThan(0);
      expect(after.result.source.url).toBe(
        'https://www.nationalacademies.org/read/26818/chapter/7',
      );
    }
  });

  it('recalculates real local meals, retains market selection, and reconciles corrections offline', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const indexedDB = new IDBFactory();
    const createId = ids();
    const onboarding = { load: async () => profile() };
    const meals = new BrowserStageTwoStore({
      indexedDB,
      keyRange: IDBKeyRange,
      createId,
      now: () => NOW,
      timeZone: () => 'UTC',
      onboarding,
      runExclusive: runWithoutContention,
    });
    const nutrition = new BrowserNutritionStateStore({
      indexedDB,
      keyRange: IDBKeyRange,
      createId,
      now: () => NOW,
      timeZone: () => 'UTC',
      onboarding,
      runExclusive: runWithoutContention,
    });

    await meals.saveCustomFood({
      name: 'Test oats',
      preparationState: 'dry',
      portionLabel: '100 g',
      gramWeight: '100',
      nutrients: [{ nutrientId: 'nutrient.protein', amount: '10', unit: 'g' }],
    });
    const [choice] = await meals.searchFoods('Test oats');
    expect(choice).toBeDefined();
    const mealId = await meals.saveMeal({
      mealType: 'breakfast',
      occurredAt: OCCURRED_AT,
      items: [{ choice: choice!, gramWeight: '100' }],
    });

    const before = await nutrition.load();
    const proteinBefore = before.window.current.nutrients.find(
      (nutrient) => nutrient.nutrientId === 'nutrient.protein',
    );
    expect(proteinBefore?.knownRecordedSubtotal).toBe('10');
    expect(proteinBefore?.target.status).toBe('NEEDS_INPUT');
    expect(before.market).toBeNull();

    await nutrition.selectMarket('US');
    const selected = await nutrition.load();
    const proteinSelected = selected.window.current.nutrients.find(
      (nutrient) => nutrient.nutrientId === 'nutrient.protein',
    );
    expect(selected.market).toBe('US');
    expect(proteinSelected?.target.status).toBe('READY');
    expect((await nutrition.load()).window.newSnapshotCount).toBe(0);

    await meals.saveMeal({
      mealId,
      mealType: 'breakfast',
      occurredAt: OCCURRED_AT,
      items: [{ choice: choice!, gramWeight: '50' }],
    });
    const corrected = await nutrition.load();
    expect(
      corrected.window.current.nutrients.find(
        (nutrient) => nutrient.nutrientId === 'nutrient.protein',
      )?.knownRecordedSubtotal,
    ).toBe('5');
    expect(corrected.window.current.mealRevisions[0]?.revision).toBe(2);

    await meals.voidMeal(mealId, 'Removed by user');
    const removed = await nutrition.load();
    expect(removed.window.current.recordedMealCount).toBe(0);
    expect(removed.window.current.status).toBe('PARTIAL');
    expect(fetch).not.toHaveBeenCalled();
  }, 15_000);

  it('keeps historical days stable, schedules confirmed travel at the next boundary, and survives reload', async () => {
    const indexedDB = new IDBFactory();
    const createId = ids();
    let now = '2026-10-10T12:00:00.000Z';
    let deviceTimeZone = 'Asia/Tokyo';
    const onboarding = { load: async () => profile() };
    const dependencies = {
      indexedDB,
      keyRange: IDBKeyRange,
      createId,
      now: () => now,
      timeZone: () => deviceTimeZone,
      onboarding,
      runExclusive: runWithoutContention,
    };
    const store = new BrowserNutritionStateStore(dependencies);
    const before = await store.load();
    expect(before.deviceTimeZone).toBe('Asia/Tokyo');
    expect(before.window.current.period.timeZone).toBe('UTC');
    expect(before.dayPolicy.changes).toEqual([]);

    await store.scheduleTimeZoneChange(
      'Asia/Tokyo',
      before.window.current.period.endsAt,
    );
    const pending = await new BrowserNutritionStateStore(dependencies).load();
    expect(pending.window.current.period.timeZone).toBe('UTC');
    expect(pending.dayPolicy.changes).toEqual([
      {
        effectiveAt: '2026-10-11T00:00:00.000Z',
        timeZone: 'Asia/Tokyo',
      },
    ]);
    expect(pending.window.completed.at(-1)?.period.periodId).toBe(
      before.window.completed.at(-1)?.period.periodId,
    );
    await expect(
      store.scheduleTimeZoneChange('Europe/London', '2026-10-12T00:00:00.000Z'),
    ).rejects.toThrow('boundary changed');

    now = '2026-10-11T01:00:00.000Z';
    const after = await new BrowserNutritionStateStore(dependencies).load();
    expect(after.window.current.period.timeZone).toBe('Asia/Tokyo');
    expect(after.window.current.period.travelAdjusted).toBe(true);
    expect(after.window.current.period.startsAt).toBe(
      '2026-10-11T00:00:00.000Z',
    );
    expect(after.window.completed.at(-1)?.period.timeZone).toBe('UTC');
    expect(after.window.completed.at(-1)?.period.periodId).toBe(
      before.window.current.period.periodId,
    );
    const meals = new BrowserStageTwoStore(dependencies);
    await meals.saveCustomFood({
      name: 'Travel oats',
      preparationState: 'dry',
      portionLabel: '100 g',
      gramWeight: '100',
      nutrients: [{ nutrientId: 'nutrient.protein', amount: '10', unit: 'g' }],
    });
    const [choice] = await meals.searchFoods('Travel oats');
    await meals.saveMeal({
      mealType: 'breakfast',
      occurredAt: '2026-10-11T00:30:00.000Z',
      items: [{ choice: choice!, gramWeight: '100' }],
    });
    expect((await store.load()).window.current.recordedMealCount).toBe(1);
    expect(
      (await store.load()).window.completed.at(-1)?.recordedMealCount,
    ).toBe(0);
    deviceTimeZone = 'America/Los_Angeles';
    expect((await store.load()).window.current.period.timeZone).toBe(
      'Asia/Tokyo',
    );
  });

  it('replaces or cancels a pending change without changing completed periods', async () => {
    const indexedDB = new IDBFactory();
    const createId = ids();
    const dependencies = {
      indexedDB,
      keyRange: IDBKeyRange,
      createId,
      now: () => NOW,
      timeZone: () => 'UTC',
      onboarding: { load: async () => profile() },
      runExclusive: runWithoutContention,
    };
    const store = new BrowserNutritionStateStore(dependencies);
    const initial = await store.load();
    const boundary = initial.window.current.period.endsAt;
    await store.scheduleTimeZoneChange('Asia/Tokyo', boundary);
    await store.scheduleTimeZoneChange('America/New_York', boundary);
    expect((await store.load()).dayPolicy.changes).toEqual([
      { effectiveAt: boundary, timeZone: 'America/New_York' },
    ]);
    await store.scheduleTimeZoneChange('UTC', boundary);
    const cancelled = await store.load();
    expect(cancelled.dayPolicy.changes).toEqual([]);
    expect(cancelled.window.current.period.periodId).toBe(
      initial.window.current.period.periodId,
    );
    await expect(
      store.scheduleTimeZoneChange('Invalid/Zone', boundary),
    ).rejects.toThrow();
  });

  it('S3-OFFLINE-001 replays the same local window offline without new snapshots as the clock advances', async () => {
    const fetch = vi.fn(() => {
      throw new Error('Network unavailable');
    });
    vi.stubGlobal('fetch', fetch);
    const indexedDB = new IDBFactory();
    const createId = ids();
    let now = NOW;
    const dependencies = {
      indexedDB,
      keyRange: IDBKeyRange,
      createId,
      now: () => now,
      timeZone: () => 'UTC',
      onboarding: { load: async () => profile() },
      runExclusive: runWithoutContention,
    };
    const first = await new BrowserNutritionStateStore(dependencies).load();
    expect(first.window.newSnapshotCount).toBe(9);
    now = '2026-10-10T13:00:00.000Z';
    const replay = await new BrowserNutritionStateStore(dependencies).load();
    expect(replay.window.newSnapshotCount).toBe(0);
    expect(replay.window.current.period.periodId).toBe(
      first.window.current.period.periodId,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
