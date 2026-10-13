import {
  rankNextMealCandidatesV1,
  reviewNextMealRankingV1,
  type NextMealCandidateSource,
} from '@nutrixx/optimizer-engine';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BrowserOnboardingStore } from './browser-onboarding';
import { BrowserPlanningStore } from './browser-planning';

import type { BrowserNutritionSnapshotV1 } from './browser-nutrition-state';
import type { BrowserStageTwoStore } from './browser-stage-two';

const NOW = '2026-10-12T12:00:00.000Z';

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
    const planning = new BrowserPlanningStore();
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
                      type: 'RDA',
                      sourceScope: 'all-intake',
                      unit: { system: 'ucum', code: 'mg' },
                      value: { kind: 'point', amount: '18' },
                      source: { authority: 'fixture', edition: '1' },
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
    const foods = {
      enumerateNextMealCatalog: async () => ({
        manifest: {
          entryKeys: [
            'food:fixture-release:00000000-0000-4000-8000-000000000001:1',
          ],
        },
        entries: [food],
      }),
      activeCatalogRelease: async () => 'fixture-release',
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
    );
    const created = await planning.createRecommendation({ inventory: null });
    expect(created.status).toBe('READY');
    if (created.status !== 'READY') return;
    const ranked = await planning.load();
    expect(ranked.run?.result.ranked).toHaveLength(1);
    expect(ranked.fresh).toBe(true);
    const candidateKey = ranked.run!.result.ranked[0]!.candidateKey;
    const intentionId = await planning.select(created.runId, candidateKey);
    expect((await planning.load()).intention?.intentionId).toBe(intentionId);
    await planning.logAsEaten({
      intentionId,
      mealType: 'lunch',
      occurredAt: NOW,
      edibleGrams: '90',
    });
    expect((await planning.load()).loggedMealId).toBe(
      '00000000-0000-4000-8000-000000000010',
    );
    await expect(
      planning.logAsEaten({
        intentionId,
        mealType: 'lunch',
        occurredAt: NOW,
        edibleGrams: '90',
      }),
    ).rejects.toThrow('already logged');
  });
});
