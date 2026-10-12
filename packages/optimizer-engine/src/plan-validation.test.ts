import { describe, expect, it } from 'vitest';

import {
  FREE_SEARCH_PROFILE_V1,
  PlanningInputV1Schema,
  type PlanningCandidateV1,
} from './planning-contract.js';
import { searchLocalPlanV1 } from './local-search.js';
import {
  findValidatedAlternativesV1,
  reviewLocalSearchDraftV1,
  validateLocalPlanV1,
  verifyLocalExplanationV1,
} from './plan-validation.js';

const id = (number: number): string =>
  `00000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
const source = {
  kind: 'dataset',
  sourceId: 'fixture-catalog',
  sourceVersion: '1',
} as const;
const unit = (code: string) => ({ system: 'ucum', code }) as const;

function candidate(
  number: number,
  energy: string,
  sodium: string,
): PlanningCandidateV1 {
  return {
    candidateId: id(100 + number),
    semanticKey: `fixture.food-${number.toString().padStart(3, '0')}`,
    displayNameSnapshot: `Food ${number}`,
    sourceReference: {
      kind: 'food',
      foodId: id(200 + number),
      foodRevision: 1,
      catalogReleaseId: 'catalog-v1',
    },
    baseServingGrams: '100',
    baseServingSource: source,
    portionBounds: {
      minimumEdibleGrams: '50',
      maximumEdibleGrams: '200',
      source,
    },
    portions: [{ portionId: 'base', edibleGrams: '100' }],
    nutrientsPer100EdibleGrams: [
      {
        state: 'known',
        nutrientId: 'energy',
        amount: energy,
        unit: unit('kcal'),
        source,
      },
      {
        state: 'known',
        nutrientId: 'sodium',
        amount: sodium,
        unit: unit('mg'),
        source,
      },
    ],
    restrictionEvidence: {
      state: 'verified',
      ingredientIds: [],
      allergenCodes: [],
      source,
    },
    pinnedByUser: false,
  };
}

function fixture() {
  return PlanningInputV1Schema.parse({
    format: 'nutrixx.local-planning-input',
    schemaVersion: 1,
    requestId: id(1),
    ownerSubjectId: id(2),
    capturedAt: '2026-10-12T09:00:00.000Z',
    capturedTimeZone: 'UTC',
    day: {
      periodId: 'fixture-day',
      zonePolicyVersion: 'zone-v1',
      zoneSequence: 0,
      timeZone: 'UTC',
      localDate: '2026-10-12',
      startsAt: '2026-10-12T00:00:00.000Z',
      endsAt: '2026-10-13T00:00:00.000Z',
      travelAdjusted: false,
    },
    eligibility: {
      status: 'READY',
      healthRuleVersion: 'health-v1',
      profileId: id(3),
      profileRevision: 1,
      assessedAt: '2026-10-12T08:00:00.000Z',
      reasonCodes: [],
    },
    restrictions: {
      sourceRecordId: id(4),
      sourceRevision: 1,
      excludedFoodIds: [],
      excludedRecipeIds: [],
      excludedIngredientIds: [],
      excludedAllergenCodes: [],
    },
    preferences: { favoredSemanticKeys: [], avoidedSemanticKeys: [] },
    recordedIntake: {
      nutritionSnapshotId: id(5),
      nutritionRuleVersion: 'nutrition-v1',
      nutrients: [
        {
          state: 'known',
          nutrientId: 'energy',
          amount: '0',
          unit: unit('kcal'),
          source,
        },
        {
          state: 'known',
          nutrientId: 'sodium',
          amount: '0',
          unit: unit('mg'),
          source,
        },
      ],
    },
    targetPolicyVersion: 'targets-v1',
    candidatePolicyVersion: 'free-candidate-policy-v1',
    targets: [
      {
        ruleId: 'energy-reference',
        nutrientId: 'energy',
        type: 'RDA',
        value: { kind: 'point', amount: '100' },
        unit: unit('kcal'),
        horizon: 'daily-average',
        sourceScope: 'all-intake',
        sourceReleaseId: 'science-v1',
        hardLimitApproved: false,
      },
      {
        ruleId: 'sodium-limit',
        nutrientId: 'sodium',
        type: 'UL',
        value: { kind: 'point', amount: '100' },
        unit: unit('mg'),
        horizon: 'daily-limit',
        sourceScope: 'all-intake',
        sourceReleaseId: 'science-v1',
        hardLimitApproved: true,
      },
    ],
    referenceReleases: [
      { component: 'food-catalog', releaseId: 'catalog-v1' },
      { component: 'nutrition-policy', releaseId: 'science-v1' },
    ],
    slots: [
      {
        state: 'open',
        slotId: id(10),
        position: 1,
        label: 'Dinner',
        candidates: [
          candidate(1, '80', '60'),
          candidate(2, '100', '150'),
          candidate(3, '90', '40'),
        ],
      },
    ],
    searchProfile: FREE_SEARCH_PROFILE_V1,
  });
}

const selection = (number: number, slotId = id(10)) => ({
  slotId,
  candidateId: id(100 + number),
  portionId: 'base',
});

describe('Independent local plan validation', () => {
  it('recomputes a safe plan and rejects a forged hard-limit violation', () => {
    const input = fixture();
    const safe = validateLocalPlanV1(input, [selection(3)]);
    expect(safe.status).toBe('passed');
    expect(safe.hardLimits[0]).toMatchObject({
      status: 'within-limit',
      observedAmount: '40',
      maximumAmount: '100',
    });
    expect(
      safe.nutrients.find((item) => item.nutrientId === 'energy')?.totalAmount,
    ).toBe('90');
    const unsafe = validateLocalPlanV1(input, [selection(2)]);
    expect(unsafe.status).toBe('rejected');
    expect(
      unsafe.issues.some((item) => item.code === 'hard-upper-limit-exceeded'),
    ).toBe(true);
  });

  it('checks the sum across all proposed slots with exact decimal arithmetic', () => {
    const input = fixture();
    const recordedSodium = input.recordedIntake.nutrients.find(
      (item) => item.nutrientId === 'sodium',
    );
    if (recordedSodium?.state !== 'known')
      throw new Error('Expected known sodium.');
    recordedSodium.amount = '0.1';
    input.targets[1]!.value = { kind: 'point', amount: '0.3' };
    input.slots = [
      {
        state: 'open',
        slotId: id(10),
        position: 1,
        label: 'Lunch',
        candidates: [candidate(1, '50', '0.1')],
      },
      {
        state: 'open',
        slotId: id(11),
        position: 2,
        label: 'Dinner',
        candidates: [candidate(3, '50', '0.1')],
      },
    ];
    const report = validateLocalPlanV1(input, [
      selection(1),
      selection(3, id(11)),
    ]);
    expect(report.status).toBe('passed');
    expect(report.hardLimits[0]?.observedAmount).toBe('0.3');
  });

  it('rejects missing slot coverage, excluded allergens, and unresolved hard evidence', () => {
    const input = fixture();
    expect(validateLocalPlanV1(input, []).status).toBe('rejected');
    input.restrictions.excludedAllergenCodes = ['peanut'];
    if (input.slots[0]?.state !== 'open')
      throw new Error('Expected open slot.');
    input.slots[0].candidates[0]!.restrictionEvidence = {
      state: 'verified',
      ingredientIds: [],
      allergenCodes: ['peanut'],
      source,
    };
    const excluded = validateLocalPlanV1(input, [selection(1)]);
    expect(
      excluded.issues.some((item) => item.code === 'excluded-allergen'),
    ).toBe(true);
    input.restrictions.excludedAllergenCodes = [];
    input.slots[0].candidates[0]!.nutrientsPer100EdibleGrams[1] = {
      state: 'unknown',
      nutrientId: 'sodium',
      reason: 'not-measured',
    };
    const unknown = validateLocalPlanV1(input, [selection(1)]);
    expect(
      unknown.issues.some(
        (item) => item.code === 'hard-limit-evidence-unresolved',
      ),
    ).toBe(true);
  });

  it('offers only independently validated full-plan replacements', () => {
    const alternatives = findValidatedAlternativesV1(fixture(), [selection(3)]);
    expect(alternatives.map((item) => item.replacement.candidateId)).toEqual([
      id(101),
    ]);
    expect(alternatives[0]?.validation.status).toBe('passed');
  });

  it('promotes only a validated search draft and verifies every numeric claim', () => {
    const input = fixture();
    const search = searchLocalPlanV1(input, { clock: () => 0 });
    const review = reviewLocalSearchDraftV1(
      input,
      search,
      '2026-10-12T09:00:02.000Z',
    );
    expect(review.status).toBe('APPROVED');
    if (review.status !== 'APPROVED') return;
    expect(review.outcome.status).toBe('READY');
    expect(review.outcome.optimalityGap).toBeNull();
    expect(
      review.explanation.nutrientClaims.find(
        (item) => item.ruleId === 'sodium-limit',
      ),
    ).toMatchObject({
      observedAmount: '40',
      targetAmount: '100',
      differenceAmount: '60',
    });
    expect(
      verifyLocalExplanationV1(
        input,
        review.validation,
        review.alternatives,
        review.explanation,
      ),
    ).toBe(true);
    const forged = {
      ...review.explanation,
      nutrientClaims: review.explanation.nutrientClaims.map((claim, index) =>
        index === 0 ? { ...claim, observedAmount: '999' } : claim,
      ),
    };
    expect(
      verifyLocalExplanationV1(
        input,
        review.validation,
        review.alternatives,
        forged,
      ),
    ).toBe(false);
    const forgedReport = {
      ...review.validation,
      nutrients: review.validation.nutrients.map((nutrient) =>
        nutrient.nutrientId === 'sodium'
          ? { ...nutrient, totalAmount: '1' }
          : nutrient,
      ),
    };
    expect(
      verifyLocalExplanationV1(
        input,
        forgedReport,
        review.alternatives,
        review.explanation,
      ),
    ).toBe(false);
    const unsafeSearch = { ...search, selections: [selection(2)] };
    expect(
      reviewLocalSearchDraftV1(input, unsafeSearch, '2026-10-12T09:00:02.000Z')
        .status,
    ).toBe('REJECTED');
    const limitedSearch = {
      ...search,
      trace: { ...search.trace, termination: 'watchdog' },
    };
    expect(
      reviewLocalSearchDraftV1(input, limitedSearch, '2026-10-12T09:00:02.000Z')
        .status,
    ).toBe('REJECTED');
  });

  it('rejects a stale catalog release and an ineligible planning day', () => {
    const input = fixture();
    input.referenceReleases[0]!.releaseId = 'catalog-v2';
    expect(
      validateLocalPlanV1(input, [selection(3)]).issues.some(
        (item) => item.code === 'catalog-release-mismatch',
      ),
    ).toBe(true);
    input.referenceReleases[0]!.releaseId = 'catalog-v1';
    input.day.localDate = '2026-10-15';
    expect(
      validateLocalPlanV1(input, [selection(3)]).issues.some(
        (item) => item.code === 'planning-day-ineligible',
      ),
    ).toBe(true);
  });
});
