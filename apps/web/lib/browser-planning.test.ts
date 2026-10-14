import {
  rankNextMealCandidatesV1,
  reviewNextMealRankingV1,
  type NextMealCandidateSource,
} from '@nutrixx/optimizer-engine';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BrowserOnboardingStore } from './browser-onboarding';
import { BrowserOutcomeFeedbackStore } from './browser-outcome-feedback';
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
    );
    const created = await planning.createRecommendation({ inventory: null });
    expect(created.status).toBe('READY');
    if (created.status !== 'READY') return;
    const ranked = await planning.load();
    expect(ranked.run?.result.ranked).toHaveLength(1);
    expect(ranked.run?.temporalPolicy.releaseId).toBe(
      'free-next-meal-daily-baseline-v1',
    );
    expect(ranked.run?.appliedTemporalRules).toHaveLength(1);
    expect(ranked.fresh).toBe(true);
    expect(ranked.run?.validUntil).toBe('2026-10-12T12:15:00.000Z');
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
      planning.select(
        created.runId,
        ranked.run!.result.ranked[0]!.candidateKey,
      ),
    ).rejects.toThrow('Refresh it');
    const refreshed = await planning.createRecommendation({ inventory: null });
    expect(refreshed.status).toBe('READY');
    if (refreshed.status !== 'READY') return;
    expect(refreshed.runId).not.toBe(created.runId);
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
