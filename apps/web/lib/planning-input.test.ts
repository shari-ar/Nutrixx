import {
  prepareLocalCandidateSetV1,
  reviewLocalSearchDraftV1,
  searchLocalPlanV1,
} from '@nutrixx/optimizer-engine';
import { describe, expect, it } from 'vitest';

import { buildPlanningRequestV1 } from './planning-input';

import type { FoodChoice } from './browser-stage-two';
import type { NutritionContextV1 } from './nutrition-context';
import type { StartingProfileV1 } from '@nutrixx/user-context';

const owner = '10000000-0000-4000-8000-000000000001';
const foodId = '20000000-0000-4000-8000-000000000001';
let sequence = 10;
const createId = () =>
  `30000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`;

const profile: StartingProfileV1 = {
  profileId: '40000000-0000-4000-8000-000000000001',
  ownerSubjectId: owner,
  revision: 1,
  ageYears: 30,
  heightCentimeters: '170',
  weightKilograms: '70',
  physiologicalReference: 'female',
  primaryGoal: 'maintain',
  foodRestrictions: [],
  timeZone: 'UTC',
  adultConfirmedAt: '2026-10-12T07:00:00.000Z',
  createdAt: '2026-10-12T07:00:00.000Z',
  updatedAt: '2026-10-12T07:00:00.000Z',
};

const choice: FoodChoice = {
  key: `food:user-custom-v1:${foodId}:1`,
  name: 'Plain oats',
  description: '100 g',
  reference: {
    kind: 'food',
    catalogReleaseId: 'user-custom-v1',
    foodId,
    foodRevision: 1,
  },
  defaultGramWeight: '100',
  preparationState: 'prepared',
  provenance: 'User-entered',
  completeness: '1 known nutrient',
};

const nutrition: NutritionContextV1 = {
  nutrientIds: ['food.energy'],
  resolver: {
    resolve(_reference, nutrientId) {
      return nutrientId === 'food.energy' ||
        nutrientId === 'source.usda-fdc.1008'
        ? {
            state: 'known',
            amountPer100Gram: '130',
            unit: { system: 'ucum', code: 'kcal' },
          }
        : { state: 'unknown', reason: 'not-provided' };
    },
  },
};

function request(
  overrides: Partial<Parameters<typeof buildPlanningRequestV1>[0]> = {},
) {
  return buildPlanningRequestV1({
    profile,
    dayPolicy: {
      policyVersion: 'nutrition-day-zone-v1',
      initialTimeZone: 'UTC',
      changes: [],
    },
    market: 'US',
    meals: [],
    activeCatalogRelease: null,
    nutrition,
    choices: [choice],
    day: 'today',
    openSlotLabels: ['Dinner'],
    now: '2026-10-12T12:00:00.000Z',
    createId,
    ...overrides,
  });
}

describe('browser planning input', () => {
  it('reaches a validated local draft from a current custom food', () => {
    const prepared = prepareLocalCandidateSetV1(request());
    expect(prepared.status).toBe('READY');
    expect(prepared.preparedInput).toBeDefined();
    const search = searchLocalPlanV1(prepared.preparedInput);
    expect(search.status).toBe('DRAFT');
    const review = reviewLocalSearchDraftV1(
      prepared.preparedInput,
      search,
      '2026-10-12T12:00:01.000Z',
    );
    expect(review, JSON.stringify(review)).toMatchObject({
      status: 'APPROVED',
    });
    if (review.status === 'APPROVED') {
      expect(review.outcome.status).toBe('READY');
      expect(review.validation.status).toBe('passed');
    }
  });

  it('withholds planning when free-text restrictions lack verifiable evidence', () => {
    expect(() =>
      request({ profile: { ...profile, foodRestrictions: ['peanuts'] } }),
    ).toThrow(/cannot verify the food restrictions/i);
  });

  it('uses the following nutrition period for tomorrow', () => {
    expect(request({ day: 'tomorrow' }).baseInput.day.localDate).toBe(
      '2026-10-13',
    );
  });
});
