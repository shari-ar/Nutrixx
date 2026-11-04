import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import {
  PLANNING_VIEW_DATABASE_NAME,
  clearPlanningViews,
  projectPlanningSnapshot,
  readPlanningView,
  savePlanningView,
} from './next-meal-display-cache';

import type { LocalPlanningSnapshotV1 } from './browser-planning-core';

describe('disposable next-meal display view', () => {
  it('stores the compact active snapshot and invalidates by revision and release', async () => {
    const factory = new IDBFactory();
    const snapshot = {
      run: {
        runId: 'run-1',
        validUntil: '2026-10-20T00:00:00.000Z',
        input: {
          temporalRules: [],
          candidates: {
            requestedAt: '2026-10-19T00:00:00.000Z',
            entries: [
              {
                reference: {
                  kind: 'food',
                  catalogReleaseId: 'release-1',
                  foodId: 'food-1',
                  foodRevision: 1,
                },
                displayName: 'Food 1',
                preparationState: 'raw',
                nutrientsPer100EdibleGrams: [],
              },
            ],
          },
        },
        result: { ranked: [{ candidateKey: 'food:release-1:food-1:1' }] },
        explanations: [
          {
            candidateKey: 'food:release-1:food-1:1',
            classification: 'COMPARABLE',
            displayName: 'Food 1',
            reasonCodes: ['validated-comparable'],
            comparisons: [{ ruleId: 'rule-1' }, { ruleId: 'rule-2' }],
          },
        ],
      },
      fresh: true,
      intention: null,
      loggedMealId: null,
    } as unknown as LocalPlanningSnapshotV1;
    const projected = projectPlanningSnapshot(snapshot);
    expect(projected.run?.input.candidates.entries).toHaveLength(1);
    expect(projected.run?.input.candidates.entries[0]?.reference).toMatchObject(
      { foodId: 'food-1' },
    );
    expect(projected.run?.explanations[0]).toEqual({
      candidateKey: 'food:release-1:food-1:1',
      classification: 'COMPARABLE',
      displayName: 'Food 1',
      reasonCodes: ['validated-comparable'],
      comparisonCount: 2,
    });
    expect(
      projectPlanningSnapshot(projected as unknown as LocalPlanningSnapshotV1)
        .run?.explanations[0],
    ).toEqual(projected.run?.explanations[0]);
    await savePlanningView(factory, {
      owner: 'owner-1',
      sequence: 4,
      activeReleaseId: 'release-1',
      snapshot: projected,
    });
    expect(await readPlanningView(factory, 'owner-1', 4, 'release-1')).toEqual(
      projected,
    );
    expect(
      await readPlanningView(factory, 'owner-1', 5, 'release-1'),
    ).toBeNull();
    expect(
      await readPlanningView(factory, 'owner-1', 4, 'release-2'),
    ).toBeNull();
    expect(
      await readPlanningView(factory, 'owner-2', 4, 'release-1'),
    ).toBeNull();
    await clearPlanningViews(factory);
    expect(
      await readPlanningView(factory, 'owner-1', 4, 'release-1'),
    ).toBeNull();

    await savePlanningView(factory, {
      owner: 'owner-1',
      sequence: 4,
      activeReleaseId: 'release-1',
      snapshot: projected,
    });

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(PLANNING_VIEW_DATABASE_NAME, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction('views', 'readwrite');
    const store = transaction.objectStore('views');
    const existing = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        const request = store.get('owner-1');
        request.onsuccess = () =>
          resolve(request.result as Record<string, unknown>);
        request.onerror = () => reject(request.error);
      },
    );
    store.put({ ...existing, sequence: 5 });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
    expect(
      await readPlanningView(factory, 'owner-1', 5, 'release-1'),
    ).toBeNull();
  });
});
