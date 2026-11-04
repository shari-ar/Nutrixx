import {
  rankNextMealCandidatesV1,
  reviewNextMealRankingV1,
  type NextMealCandidateSource,
} from '@nutrixx/optimizer-engine';
import {
  CANONICAL_RECORD_STORE,
  openIndexedDb,
} from '@nutrixx/persistence-indexeddb';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BrowserOnboardingStore } from './browser-onboarding';
import { BrowserOutcomeFeedbackStore } from './browser-outcome-feedback';
import { BrowserPlanningStore } from './browser-planning';
import { LOCAL_USER_DATABASE_NAME } from './storage-constants';

import type { BrowserNutritionSnapshotV1 } from './browser-nutrition-state';
import type { BrowserStageTwoStore } from './browser-stage-two';
import type {
  NextMealPreparationMessageV1,
  NextMealPreparationRequestV1,
} from './next-meal-preparation-client';

const NOW = '2026-10-12T12:00:00.000Z';

async function planningRecordTypes(): Promise<string[]> {
  const database = await openIndexedDb(indexedDB, LOCAL_USER_DATABASE_NAME);
  try {
    const transaction = database.transaction(
      CANONICAL_RECORD_STORE,
      'readonly',
    );
    const request = transaction.objectStore(CANONICAL_RECORD_STORE).getAll();
    const records = await new Promise<{ recordType: string }[]>(
      (resolve, reject) => {
        request.onsuccess = () =>
          resolve(request.result as { recordType: string }[]);
        request.onerror = () => reject(request.error);
      },
    );
    return records
      .map((record) => record.recordType)
      .filter((recordType) => recordType.startsWith('planning.'));
  } finally {
    database.close();
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: async (
        _name: string,
        _options: unknown,
        work: () => Promise<unknown>,
      ) => work(),
    },
  });
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('browser next-meal planning', () => {
  it('keeps recommendation and reload work behind compact worker messages', async () => {
    const onboarding = new BrowserOnboardingStore({
      storage: localStorage,
      indexedDB,
      keyRange: IDBKeyRange,
      createId: () => crypto.randomUUID(),
      now: () => NOW,
      timeZone: () => 'UTC',
    });
    await onboarding.save({
      ageYears: 30,
      heightCentimeters: '170',
      weightKilograms: '70',
      physiologicalReference: 'female',
      primaryGoal: 'maintain',
      foodRestrictions: [],
    });
    const posted: string[] = [];
    let workersCreated = 0;
    class WorkerStub {
      public constructor() {
        workersCreated += 1;
      }
      public onmessage:
        | ((event: MessageEvent<NextMealPreparationMessageV1>) => void)
        | null = null;
      public onerror: ((event: ErrorEvent) => void) | null = null;

      public postMessage(request: NextMealPreparationRequestV1): void {
        posted.push(request.kind);
        if (request.kind === 'LOCAL_RECOMMENDATION') {
          queueMicrotask(() =>
            this.onmessage?.({
              data: {
                status: 'PROGRESS',
                stage: 'ranking-catalog',
                message: 'Ranking the local catalog for your next meal…',
              },
            } as MessageEvent<NextMealPreparationMessageV1>),
          );
        }
        if (request.kind === 'LOCAL_SELECT') {
          queueMicrotask(() =>
            this.onmessage?.({
              data: {
                status: 'PROGRESS',
                stage: 'validating-selection',
                message: 'Validating the current recommendation…',
              },
            } as MessageEvent<NextMealPreparationMessageV1>),
          );
        }
        const response: NextMealPreparationMessageV1 =
          request.kind === 'LOCAL_LOAD'
            ? {
                status: 'SNAPSHOT',
                snapshot: {
                  run: null,
                  fresh: false,
                  intention: null,
                  loggedMealId: null,
                },
              }
            : request.kind === 'LOCAL_SELECT'
              ? {
                  status: 'SELECTION',
                  intention: {
                    format: 'nutrixx.next-meal-intention',
                    schemaVersion: 1,
                    intentionId: 'worker-intention',
                    ownerSubjectId: request.profile.ownerSubjectId,
                    runId: request.runId,
                    candidateKey: request.candidateKey,
                    portionId: 'portion-100g',
                    selectedAt: NOW,
                  },
                }
              : {
                  status: 'RECOMMENDATION',
                  result: { status: 'READY', runId: 'worker-run' },
                };
        queueMicrotask(() =>
          this.onmessage?.({
            data: response,
          } as MessageEvent<NextMealPreparationMessageV1>),
        );
      }

      public terminate(): void {}
    }
    vi.stubGlobal('Worker', WorkerStub);
    const planning = new BrowserPlanningStore(undefined, onboarding);
    const recommendationProgress: string[] = [];
    expect(
      await planning.createRecommendation({ inventory: null }, (update) =>
        recommendationProgress.push(update.stage),
      ),
    ).toEqual({ status: 'READY', runId: 'worker-run' });
    expect(recommendationProgress).toEqual(['ranking-catalog']);
    expect(await planning.load()).toEqual({
      run: null,
      fresh: false,
      intention: null,
      loggedMealId: null,
    });
    const progress: string[] = [];
    expect(
      (
        await planning.selectForDisplay(
          'worker-run',
          'food:fixture',
          (update) => progress.push(update.stage),
        )
      ).intentionId,
    ).toBe('worker-intention');
    expect(progress).toEqual(['validating-selection']);
    expect(posted).toEqual([
      'LOCAL_RECOMMENDATION',
      'LOCAL_LOAD',
      'LOCAL_SELECT',
    ]);
    expect(workersCreated).toBe(3);
  });

  it('terminates a superseded recommendation worker before starting its replacement', async () => {
    const onboarding = new BrowserOnboardingStore({
      storage: localStorage,
      indexedDB,
      keyRange: IDBKeyRange,
      createId: () => crypto.randomUUID(),
      now: () => NOW,
      timeZone: () => 'UTC',
    });
    await onboarding.save({
      ageYears: 30,
      heightCentimeters: '170',
      weightKilograms: '70',
      physiologicalReference: 'female',
      primaryGoal: 'maintain',
      foodRestrictions: [],
    });
    let releaseFirstStart: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => {
      releaseFirstStart = resolve;
    });
    const terminated: number[] = [];
    let workersCreated = 0;
    class WorkerStub {
      private readonly id = ++workersCreated;
      public onmessage:
        | ((event: MessageEvent<NextMealPreparationMessageV1>) => void)
        | null = null;
      public onerror: ((event: ErrorEvent) => void) | null = null;

      public postMessage(request: NextMealPreparationRequestV1): void {
        if (this.id === 1) {
          releaseFirstStart?.();
          return;
        }
        queueMicrotask(() =>
          this.onmessage?.({
            data: {
              status: 'RECOMMENDATION',
              result: { status: 'READY', runId: 'replacement-run' },
            },
          } as MessageEvent<NextMealPreparationMessageV1>),
        );
        expect(request.kind).toBe('LOCAL_RECOMMENDATION');
      }

      public terminate(): void {
        terminated.push(this.id);
      }
    }
    vi.stubGlobal('Worker', WorkerStub);
    const planning = new BrowserPlanningStore(undefined, onboarding);
    const superseded = planning.createRecommendation({ inventory: null });
    await firstStarted;
    const replacement = planning.createRecommendation({ inventory: null });
    await expect(superseded).rejects.toMatchObject({ name: 'AbortError' });
    await expect(replacement).resolves.toEqual({
      status: 'READY',
      runId: 'replacement-run',
    });
    expect(workersCreated).toBe(2);
    expect(terminated).toEqual([1, 2]);
  });

  it('reuses a conservative device chunk profile on the next recommendation', async () => {
    const onboarding = new BrowserOnboardingStore({
      storage: localStorage,
      indexedDB,
      keyRange: IDBKeyRange,
      createId: () => crypto.randomUUID(),
      now: () => NOW,
      timeZone: () => 'UTC',
    });
    await onboarding.save({
      ageYears: 30,
      heightCentimeters: '170',
      weightKilograms: '70',
      physiologicalReference: 'female',
      primaryGoal: 'maintain',
      foodRestrictions: [],
    });
    const requests: NextMealPreparationRequestV1[] = [];
    class WorkerStub {
      public onmessage:
        | ((event: MessageEvent<NextMealPreparationMessageV1>) => void)
        | null = null;
      public onerror: ((event: ErrorEvent) => void) | null = null;

      public postMessage(request: NextMealPreparationRequestV1): void {
        requests.push(request);
        queueMicrotask(() => {
          this.onmessage?.({
            data: {
              status: 'PROGRESS',
              stage: 'classifying-catalog',
              message: 'Classifying catalog entries…',
              processed: 256,
              total: 1_000,
              recommendedChunkSize: 512,
            },
          } as MessageEvent<NextMealPreparationMessageV1>);
          this.onmessage?.({
            data: {
              status: 'PROGRESS',
              stage: 'scoring-catalog',
              message: 'Scoring comparable foods…',
              processed: 64,
              total: 1_000,
              recommendedChunkSize: 128,
            },
          } as MessageEvent<NextMealPreparationMessageV1>);
          this.onmessage?.({
            data: {
              status: 'RECOMMENDATION',
              result: { status: 'READY', runId: 'worker-run' },
            },
          } as MessageEvent<NextMealPreparationMessageV1>);
        });
      }

      public terminate(): void {}
    }
    vi.stubGlobal('Worker', WorkerStub);
    const planning = new BrowserPlanningStore(undefined, onboarding);

    await planning.createRecommendation({ inventory: null });
    await planning.createRecommendation({ inventory: null });

    expect(requests[0]).toMatchObject({
      kind: 'LOCAL_RECOMMENDATION',
    });
    expect(requests[0]).not.toHaveProperty('rankingChunkHints');
    expect(requests[1]).toMatchObject({
      kind: 'LOCAL_RECOMMENDATION',
      rankingChunkHints: { classifying: 256, scoring: 64 },
    });
  });

  it('starts without a recommendation and requests a nutrition market', async () => {
    const onboarding = new BrowserOnboardingStore({
      storage: localStorage,
      indexedDB,
      keyRange: IDBKeyRange,
      createId: () => crypto.randomUUID(),
      now: () => NOW,
      timeZone: () => 'UTC',
    });
    await onboarding.save({
      ageYears: 30,
      heightCentimeters: '170',
      weightKilograms: '70',
      physiologicalReference: 'female',
      primaryGoal: 'maintain',
      foodRestrictions: [],
    });
    const planning = new BrowserPlanningStore(
      undefined,
      onboarding,
      undefined,
      undefined,
      false,
    );
    expect(await planning.load()).toEqual({
      run: null,
      fresh: false,
      intention: null,
      loggedMealId: null,
    });
    expect(await planning.createRecommendation({ inventory: null })).toEqual({
      status: 'NEEDS_INPUT',
      reasonCodes: ['nutrition-market-required'],
    });
  });

  it('persists reviewed ranking, selection, and an actual meal link', async () => {
    const onboarding = new BrowserOnboardingStore({
      storage: localStorage,
      indexedDB,
      keyRange: IDBKeyRange,
      createId: () => crypto.randomUUID(),
      now: () => NOW,
      timeZone: () => 'UTC',
    });
    await onboarding.save({
      ageYears: 30,
      heightCentimeters: '170',
      weightKilograms: '70',
      physiologicalReference: 'female',
      primaryGoal: 'maintain',
      foodRestrictions: [],
    });
    const evidence = {
      kind: 'dataset',
      sourceId: 'fixture',
      sourceVersion: '1',
    } as const;
    const food: NextMealCandidateSource = {
      reference: {
        kind: 'food',
        catalogReleaseId: 'fixture-release',
        foodId: '00000000-0000-4000-8000-000000000001',
        foodRevision: 1,
      },
      displayName: 'Test food',
      preparationState: 'prepared',
      edibleResolution: 'resolved',
      portions: [
        {
          portionId: '00000000-0000-4000-8000-000000000002',
          edibleGrams: '100',
          source: evidence,
        },
      ],
      nutrientsPer100EdibleGrams: [
        {
          state: 'known',
          nutrientId: 'nutrient.iron',
          amountPer100EdibleGrams: '10',
          unit: { system: 'ucum', code: 'mg' },
          source: evidence,
        },
      ],
      restrictionEvidence: {
        state: 'unknown',
        reasonCode: 'allergen-evidence-unavailable',
      },
    };
    const nutrition = {
      load: async () =>
        ({
          market: 'US',
          meals: [],
          dayPolicy: {
            policyVersion: 'nutrition-day-zone-v1',
            initialTimeZone: 'UTC',
            changes: [],
          },
          window: {
            current: {
              period: {
                startsAt: '2026-10-12T00:00:00.000Z',
                endsAt: '2026-10-13T00:00:00.000Z',
                travelAdjusted: false,
              },
              nutrients: [
                {
                  nutrientId: 'nutrient.iron',
                  unit: 'mg',
                  target: {
                    status: 'READY',
                    policyVersion: '1',
                    releaseId: 'fixture-release',
                    rule: {
                      ruleId: 'iron-current-day',
                      nutrientId: 'nutrient.iron',
                      type: 'RDA',
                      sourceScope: 'all-intake',
                      unit: { system: 'ucum', code: 'mg' },
                      value: { kind: 'point', amount: '18' },
                      population: {
                        minimumAgeYears: 19,
                        maximumAgeYears: 30,
                        physiologicalReference: 'female',
                        lifeStage: 'adult',
                      },
                      effectiveFrom: '2025-01-01T00:00:00.000Z',
                      source: {
                        authority: 'fixture',
                        title: 'Fixture reference',
                        edition: '1',
                        url: 'https://example.org/fixture-reference',
                      },
                    },
                  },
                  upperLimit: { status: 'UNAVAILABLE' },
                },
              ],
            },
          },
        }) as unknown as BrowserNutritionSnapshotV1,
    };
    let linkedIntention: string | undefined;
    let catalogRelease = 'fixture-release';
    const foods = {
      enumerateNextMealCatalog: async () => ({
        manifest: {
          entryKeys: [
            'food:fixture-release:00000000-0000-4000-8000-000000000001:1',
          ],
        },
        entries: [food],
      }),
      activeCatalogRelease: async () => catalogRelease,
      listMeals: async () =>
        linkedIntention
          ? [
              {
                state: 'recorded',
                planningIntentionId: linkedIntention,
                mealId: '00000000-0000-4000-8000-000000000010',
              },
            ]
          : [],
      saveMeal: async (input: { planningIntentionId?: string }) => {
        linkedIntention = input.planningIntentionId;
        return '00000000-0000-4000-8000-000000000010';
      },
    } as unknown as Pick<
      BrowserStageTwoStore,
      | 'enumerateNextMealCatalog'
      | 'activeCatalogRelease'
      | 'listMeals'
      | 'saveMeal'
    >;
    const planning = new BrowserPlanningStore(
      async (request) =>
        reviewNextMealRankingV1(request, rankNextMealCandidatesV1(request)),
      onboarding,
      nutrition,
      foods,
      false,
    );
    const created = await planning.createRecommendation({ inventory: null });
    expect(created.status).toBe('READY');
    if (created.status !== 'READY') return;
    const ranked = await planning.load();
    expect(ranked.run).not.toBeNull();
    if (!ranked.run) return;
    expect(ranked.run.result.ranked).toHaveLength(1);
    const [first] = ranked.run.result.ranked;
    expect(first).toBeDefined();
    if (!first) return;
    expect(Object.keys(first).sort()).toEqual([
      'candidateKey',
      'rank',
      'score',
    ]);
    expect(ranked.run.result).not.toHaveProperty('unranked');
    expect(ranked.run.temporalPolicy.releaseId).toBe(
      'free-next-meal-daily-baseline-v1',
    );
    expect(ranked.run.appliedTemporalRules).toHaveLength(1);
    expect(ranked.fresh).toBe(true);
    expect(ranked.run.validUntil).toBe('2026-10-12T12:15:00.000Z');
    await new BrowserOutcomeFeedbackStore().saveWeight({
      observedOn: '2026-10-12',
      weightKilograms: '69.5',
    });
    expect((await planning.load()).fresh).toBe(true);
    await new BrowserOutcomeFeedbackStore().saveLab({
      observedOn: '2026-10-12',
      testName: 'Ferritin',
      result: '45',
      unit: 'ng/mL',
      laboratory: 'Example Lab',
    });
    expect((await planning.load()).fresh).toBe(true);
    catalogRelease = 'new-fixture-release';
    expect((await planning.load()).fresh).toBe(false);
    catalogRelease = 'fixture-release';
    expect((await planning.load()).fresh).toBe(true);
    vi.setSystemTime(new Date('2026-10-12T12:15:00.000Z'));
    expect((await planning.load()).fresh).toBe(false);
    await expect(
      planning.select(created.runId, first.candidateKey),
    ).rejects.toThrow('Refresh it');
    const refreshed = await planning.createRecommendation({ inventory: null });
    expect(refreshed.status).toBe('READY');
    if (refreshed.status !== 'READY') return;
    expect(refreshed.runId).not.toBe(created.runId);
    expect(await planningRecordTypes()).toEqual(['planning.next-meal-run']);
    const replay = await planning.load();
    expect(replay.fresh).toBe(true);
    expect(replay.run?.result).toEqual(ranked.run?.result);
    const candidateKey = replay.run!.result.ranked[0]!.candidateKey;
    const intentionId = await planning.select(refreshed.runId, candidateKey);
    expect((await planning.load()).intention?.intentionId).toBe(intentionId);
    await planning.logAsEaten({
      intentionId,
      mealType: 'lunch',
      occurredAt: new Date().toISOString(),
      edibleGrams: '90',
    });
    expect((await planning.load()).loggedMealId).toBe(
      '00000000-0000-4000-8000-000000000010',
    );
    await expect(
      planning.select(refreshed.runId, candidateKey),
    ).rejects.toThrow('Refresh it');
    await expect(
      planning.logAsEaten({
        intentionId,
        mealType: 'lunch',
        occurredAt: new Date().toISOString(),
        edibleGrams: '90',
      }),
    ).rejects.toThrow('already logged');
  });
});
