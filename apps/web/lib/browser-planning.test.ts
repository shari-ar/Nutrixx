import {
  prepareLocalCandidateSetV1,
  reviewLocalSearchDraftV1,
  searchLocalPlanV1,
} from '@nutrixx/optimizer-engine';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BrowserOnboardingStore } from './browser-onboarding';
import { BrowserPlanningStore } from './browser-planning';
import { BrowserStageTwoStore } from './browser-stage-two';

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

function planner() {
  return new BrowserPlanningStore(async (request) => {
    const preparation = prepareLocalCandidateSetV1(request);
    if (!preparation.preparedInput) {
      return { status: 'UNAVAILABLE', reasonCodes: preparation.reasonCodes };
    }
    const search = searchLocalPlanV1(preparation.preparedInput);
    if (search.status !== 'DRAFT') {
      return { status: 'UNAVAILABLE', reasonCodes: search.reasonCodes };
    }
    const review = reviewLocalSearchDraftV1(
      preparation.preparedInput,
      search,
      NOW,
    );
    if (review.status !== 'APPROVED') {
      return { status: 'UNAVAILABLE', reasonCodes: review.reasonCodes };
    }
    return {
      status: 'APPROVED',
      input: preparation.preparedInput,
      search,
      review,
    };
  });
}

describe('browser local plan lifecycle', () => {
  it('persists a validated draft, accepts it, and marks a changed profile stale', async () => {
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
    const foods = new BrowserStageTwoStore();
    await foods.saveCustomFood({
      name: 'Plain oats',
      preparationState: 'prepared',
      portionLabel: '100 g',
      gramWeight: '100',
      nutrients: [
        { nutrientId: 'source.usda-fdc.1008', amount: '130', unit: 'kcal' },
      ],
    });
    await foods.saveCustomFood({
      name: 'Plain rice',
      preparationState: 'prepared',
      portionLabel: '100 g',
      gramWeight: '100',
      nutrients: [
        { nutrientId: 'source.usda-fdc.1008', amount: '140', unit: 'kcal' },
      ],
    });
    const [choice] = await foods.searchFoods('Plain oats');
    const [secondChoice] = await foods.searchFoods('Plain rice');
    expect(choice).toBeDefined();
    expect(secondChoice).toBeDefined();
    const store = planner();
    const created = await store.createDraft({
      day: 'today',
      openSlotLabels: ['Dinner'],
      choices: [choice!, secondChoice!],
    });
    expect(created.status).toBe('READY');
    if (created.status !== 'READY') return;
    const pending = await planner().load();
    expect(pending.draft?.draftId).toBe(created.draftId);
    expect(pending.draftFresh).toBe(true);

    await store.accept(created.draftId);
    const accepted = await planner().load();
    expect(accepted.draft).toBeNull();
    expect(accepted.active?.revision).toBe(1);
    expect(accepted.activeFresh).toBe(true);
    expect(accepted.history).toHaveLength(1);

    const alternative = accepted.activeReview?.alternatives[0];
    expect(alternative).toBeDefined();
    const replacementId = await store.substitute(
      created.draftId,
      alternative!.slotId,
      alternative!.replacement.candidateId,
      alternative!.replacement.portionId,
    );
    expect((await planner().load()).draft?.draftId).toBe(replacementId);
    await store.accept(replacementId);
    const revised = await planner().load();
    expect(revised.active?.revision).toBe(2);
    expect(revised.history).toHaveLength(2);

    await onboarding.save({
      ageYears: 30,
      heightCentimeters: '170',
      weightKilograms: '70',
      physiologicalReference: 'female',
      primaryGoal: 'gain',
      foodRestrictions: [],
    });
    expect((await planner().load()).activeFresh).toBe(false);
  });
});
