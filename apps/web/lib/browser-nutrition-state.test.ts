import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BrowserNutritionStateStore } from './browser-nutrition-state';
import { BrowserStageTwoStore } from './browser-stage-two';

import type { StartingProfileV1 } from '@nutrixx/user-context';

const NOW = '2026-10-10T12:00:00.000Z';
const OCCURRED_AT = '2026-10-10T10:00:00.000Z';
const OWNER_ID = '10000000-0000-4000-8000-000000000001';

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
    });
    const nutrition = new BrowserNutritionStateStore({
      indexedDB,
      keyRange: IDBKeyRange,
      createId,
      now: () => NOW,
      timeZone: () => 'UTC',
      onboarding,
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
  });

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
