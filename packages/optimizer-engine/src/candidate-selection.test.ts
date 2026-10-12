import { describe, expect, it } from 'vitest';

import { FREE_SEARCH_PROFILE_V1 } from './planning-contract.js';
import {
  CandidatePoolRequestV1Schema,
  prepareLocalCandidateSetV1,
  type CandidatePoolRequestV1,
  type CandidateSourceV1,
} from './candidate-selection.js';

const id = (value: number): string =>
  `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
const evidence = {
  kind: 'dataset',
  sourceId: 'fixture-catalog',
  sourceVersion: '1',
} as const;
const unit = (code: string) => ({ system: 'ucum', code }) as const;

function source(value: number): CandidateSourceV1 {
  return {
    candidateId: id(value + 100),
    semanticKey: `fixture.food-${value.toString().padStart(3, '0')}`,
    displayNameSnapshot: `Test food ${value}`,
    sourceReference: {
      kind: 'food',
      foodId: id(value + 200),
      foodRevision: 1,
      catalogReleaseId: 'fixture-catalog-v1',
    },
    baseServingGrams: '100',
    baseServingSource: evidence,
    available: true,
    portionBounds: {
      minimumEdibleGrams: '50',
      maximumEdibleGrams: '200',
      source: evidence,
    },
    nutrientsPer100EdibleGrams: [
      {
        state: 'known',
        nutrientId: 'energy',
        amount: '130',
        unit: unit('kcal'),
        source: evidence,
      },
      {
        state: 'known',
        nutrientId: 'sodium',
        amount: '500',
        unit: unit('mg'),
        source: evidence,
      },
    ],
    restrictionEvidence: {
      state: 'verified',
      ingredientIds: [],
      allergenCodes: [],
      source: evidence,
    },
    pinnedByUser: false,
  };
}

function fixture(): CandidatePoolRequestV1 {
  const candidate = source(1);
  return CandidatePoolRequestV1Schema.parse({
    format: 'nutrixx.local-candidate-pool',
    schemaVersion: 1,
    baseInput: {
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
        healthRuleVersion: 'health-context-v1',
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
      preferences: {
        favoredSemanticKeys: [],
        avoidedSemanticKeys: [],
      },
      recordedIntake: {
        nutritionSnapshotId: id(5),
        nutritionRuleVersion: 'nutrition-state-v2',
        nutrients: [
          {
            state: 'known',
            nutrientId: 'sodium',
            amount: '100',
            unit: unit('mg'),
            source: evidence,
          },
        ],
      },
      targetPolicyVersion: 'fixture-policy-v1',
      candidatePolicyVersion: 'free-candidate-policy-v1',
      targets: [
        {
          ruleId: 'energy-rda',
          nutrientId: 'energy',
          type: 'RDA',
          value: { kind: 'point', amount: '2000' },
          unit: unit('kcal'),
          horizon: 'daily-average',
          sourceScope: 'all-intake',
          sourceReleaseId: 'fixture-science-v1',
          hardLimitApproved: false,
        },
        {
          ruleId: 'sodium-ul',
          nutrientId: 'sodium',
          type: 'UL',
          value: { kind: 'point', amount: '1000' },
          unit: unit('mg'),
          horizon: 'daily-limit',
          sourceScope: 'all-intake',
          sourceReleaseId: 'fixture-science-v1',
          hardLimitApproved: true,
        },
      ],
      referenceReleases: [
        { component: 'food-catalog', releaseId: 'fixture-catalog-v1' },
        { component: 'nutrition-policy', releaseId: 'fixture-science-v1' },
      ],
      slots: [
        {
          state: 'open',
          slotId: id(6),
          position: 1,
          label: 'Dinner',
          candidates: [],
        },
      ],
      searchProfile: FREE_SEARCH_PROFILE_V1,
    },
    currentSources: [candidate.sourceReference],
    slotPools: [{ slotId: id(6), sources: [candidate] }],
  });
}

function preparedCandidate(request: CandidatePoolRequestV1) {
  const result = prepareLocalCandidateSetV1(request);
  expect(result.status).toBe('READY');
  const slot = result.preparedInput?.slots[0];
  if (slot?.state !== 'open')
    throw new Error('A prepared open slot is required.');
  return { result, slot, candidate: slot.candidates[0]! };
}

describe('Free candidate preparation v1', () => {
  it('builds exact half/base/one-and-half/double edible portions', () => {
    const request = fixture();
    const { candidate } = preparedCandidate(request);
    expect(candidate.portions).toEqual([
      { portionId: 'half', edibleGrams: '50' },
      { portionId: 'base', edibleGrams: '100' },
      { portionId: 'one-and-half', edibleGrams: '150' },
    ]);
    const source = request.slotPools[0]!.sources[0]!;
    source.baseServingGrams = '100.25';
    source.portionBounds = {
      minimumEdibleGrams: '50',
      maximumEdibleGrams: '200.5',
      source: evidence,
    };
    const upperLimit = request.baseInput.targets[1]!;
    upperLimit.value = { kind: 'point', amount: '2000' };
    expect(
      preparedCandidate(request).candidate.portions.map(
        (portion) => portion.edibleGrams,
      ),
    ).toEqual(['50.125', '100.25', '150.375', '200.5']);
  });

  it('filters allergens and unresolved restriction evidence before any ranking', () => {
    const request = fixture();
    request.baseInput.restrictions.excludedAllergenCodes.push('peanut');
    const candidate = request.slotPools[0]!.sources[0]!;
    candidate.pinnedByUser = true;
    candidate.restrictionEvidence = {
      state: 'verified',
      ingredientIds: [],
      allergenCodes: ['peanut'],
      source: evidence,
    };
    let result = prepareLocalCandidateSetV1(request);
    expect(result.status).toBe('NEEDS_INPUT');
    expect(result.slots[0]?.decisions[0]?.reasonCodes).toContain(
      'excluded-allergen',
    );
    candidate.restrictionEvidence = {
      state: 'unknown',
      reasonCode: 'ingredient-list-missing',
    };
    result = prepareLocalCandidateSetV1(request);
    expect(result.slots[0]?.decisions[0]?.reasonCodes).toContain(
      'restriction-evidence-unresolved',
    );
  });

  it('honors direct food, recipe, and ingredient exclusions', () => {
    const request = fixture();
    const candidate = request.slotPools[0]!.sources[0]!;
    if (candidate.sourceReference.kind !== 'food')
      throw new Error('Fixture source is a food.');
    request.baseInput.restrictions.excludedFoodIds.push(
      candidate.sourceReference.foodId,
    );
    expect(
      prepareLocalCandidateSetV1(request).slots[0]?.decisions[0]?.reasonCodes,
    ).toContain('excluded-food');
    request.baseInput.restrictions.excludedFoodIds = [];
    request.baseInput.restrictions.excludedIngredientIds.push(
      candidate.sourceReference.foodId,
    );
    expect(
      prepareLocalCandidateSetV1(request).slots[0]?.decisions[0]?.reasonCodes,
    ).toContain('excluded-food');
    request.baseInput.restrictions.excludedIngredientIds = [];
    candidate.sourceReference = {
      kind: 'recipe',
      recipeId: id(333),
      recipeVersion: 1,
    };
    request.currentSources = [candidate.sourceReference];
    request.baseInput.restrictions.excludedRecipeIds.push(id(333));
    expect(
      prepareLocalCandidateSetV1(request).slots[0]?.decisions[0]?.reasonCodes,
    ).toContain('excluded-recipe');
  });

  it('rejects stale revisions, missing catalog releases, and unavailable sources', () => {
    const request = fixture();
    const candidate = request.slotPools[0]!.sources[0]!;
    request.currentSources = [];
    expect(
      prepareLocalCandidateSetV1(request).slots[0]?.decisions[0]?.reasonCodes,
    ).toContain('source-revision-stale');
    request.currentSources = [candidate.sourceReference];
    if (candidate.sourceReference.kind !== 'food')
      throw new Error('Fixture source is a food.');
    candidate.sourceReference.catalogReleaseId = 'uninstalled-release';
    expect(
      prepareLocalCandidateSetV1(request).slots[0]?.decisions[0]?.reasonCodes,
    ).toContain('catalog-release-missing');
    candidate.available = false;
    expect(
      prepareLocalCandidateSetV1(request).slots[0]?.decisions[0]?.reasonCodes,
    ).toContain('source-unavailable');
  });

  it('clips each portion against a supported all-intake upper bound', () => {
    const request = fixture();
    const candidate = request.slotPools[0]!.sources[0]!;
    const sodium = candidate.nutrientsPer100EdibleGrams.find(
      (item) => item.nutrientId === 'sodium',
    );
    if (sodium?.state !== 'known') throw new Error('Fixture sodium is known.');
    sodium.amount = '500';
    expect(
      preparedCandidate(request).candidate.portions.map(
        (portion) => portion.portionId,
      ),
    ).toEqual(['half', 'base', 'one-and-half']);
    sodium.amount = '2000';
    const result = prepareLocalCandidateSetV1(request);
    expect(result.status).toBe('NEEDS_INPUT');
    expect(result.slots[0]?.decisions[0]?.reasonCodes).toContain(
      'hard-limit-exceeded',
    );
  });

  it('compares fractional upper-limit values without floating-point rounding', () => {
    const request = fixture();
    const candidate = request.slotPools[0]!.sources[0]!;
    const sodium = candidate.nutrientsPer100EdibleGrams.find(
      (item) => item.nutrientId === 'sodium',
    );
    const recorded = request.baseInput.recordedIntake.nutrients[0];
    if (sodium?.state !== 'known' || recorded?.state !== 'known')
      throw new Error('Fixture amounts are known.');
    sodium.amount = '0.2';
    recorded.amount = '0.1';
    request.baseInput.targets[1]!.value = { kind: 'point', amount: '0.2' };
    expect(
      preparedCandidate(request).candidate.portions.map(
        (portion) => portion.portionId,
      ),
    ).toEqual(['half']);
  });

  it('reports unavailable portion bounds and rejects reversed bounds', () => {
    const request = fixture();
    const candidate = request.slotPools[0]!.sources[0]!;
    candidate.portionBounds = {
      minimumEdibleGrams: '250',
      maximumEdibleGrams: '300',
      source: evidence,
    };
    expect(
      prepareLocalCandidateSetV1(request).slots[0]?.decisions[0]?.reasonCodes,
    ).toContain('portion-bounds-unresolved');
    candidate.portionBounds = {
      minimumEdibleGrams: '300',
      maximumEdibleGrams: '250',
      source: evidence,
    };
    expect(CandidatePoolRequestV1Schema.safeParse(request).success).toBe(false);
  });

  it('treats missing safety composition and recorded intake as unknown, never zero', () => {
    const request = fixture();
    const candidate = request.slotPools[0]!.sources[0]!;
    candidate.nutrientsPer100EdibleGrams =
      candidate.nutrientsPer100EdibleGrams.filter(
        (item) => item.nutrientId !== 'sodium',
      );
    let result = prepareLocalCandidateSetV1(request);
    expect(result.slots[0]?.decisions[0]?.reasonCodes).toContain(
      'hard-limit-composition-unresolved',
    );
    request.baseInput.recordedIntake.nutrients = [
      { state: 'unknown', nutrientId: 'sodium', reason: 'not-measured' },
    ];
    result = prepareLocalCandidateSetV1(request);
    expect(result.status).toBe('NEEDS_INPUT');
    expect(result.reasonCodes).toContain(
      'hard-limit-recorded-intake-unresolved',
    );
  });

  it('withholds source-scoped hard limits without compatible source evidence', () => {
    const request = fixture();
    request.baseInput.targets[1]!.sourceScope = 'fortified-and-supplemental';
    const result = prepareLocalCandidateSetV1(request);
    expect(result.status).toBe('NEEDS_INPUT');
    expect(result.reasonCodes).toContain(
      'source-scoped-upper-limit-evidence-unavailable',
    );
  });

  it('keeps preferences soft and reports missing values explicitly', () => {
    const request = fixture();
    const candidate = request.slotPools[0]!.sources[0]!;
    request.baseInput.preferences.avoidedSemanticKeys.push(
      candidate.semanticKey,
    );
    request.baseInput.preferences.maximumPreparationMinutes = 20;
    request.baseInput.preferences.maximumApproximatePriceUsd = '2';
    candidate.preparationMinutes = 40;
    candidate.nutrientsPer100EdibleGrams =
      candidate.nutrientsPer100EdibleGrams.filter(
        (item) => item.nutrientId !== 'energy',
      );
    const { result } = preparedCandidate(request);
    const decision = result.slots[0]?.decisions[0];
    expect(decision?.disposition).toBe('selected');
    expect(decision?.softSignals).toMatchObject({
      matchedNutrientTargets: 0,
      missingNutrientTargets: ['energy-rda'],
      preference: 'avoided',
      preparation: 'over-preference',
      price: 'unknown',
    });
  });

  it('preserves eligible pinned sources within the 24-candidate cap', () => {
    const request = fixture();
    const sources = Array.from({ length: 25 }, (_, index) => source(index + 1));
    sources[24]!.pinnedByUser = true;
    sources[24]!.nutrientsPer100EdibleGrams =
      sources[24]!.nutrientsPer100EdibleGrams.filter(
        (item) => item.nutrientId !== 'energy',
      );
    request.slotPools[0]!.sources = sources.reverse();
    request.currentSources = sources.map((item) => item.sourceReference);
    const { result, slot } = preparedCandidate(request);
    expect(slot.candidates).toHaveLength(24);
    expect(
      slot.candidates.some(
        (item) => item.candidateId === sources[0]!.candidateId,
      ),
    ).toBe(true);
    expect(slot.candidates.map((item) => item.semanticKey)).toEqual(
      slot.candidates.map((item) => item.semanticKey).sort(),
    );
    expect(
      result.slots[0]?.decisions.filter(
        (item) => item.disposition === 'eligible-not-selected',
      ),
    ).toHaveLength(1);
  });

  it('asks for a smaller pinned set when more than 24 eligible sources are pinned', () => {
    const request = fixture();
    const sources = Array.from({ length: 25 }, (_, index) => ({
      ...source(index + 1),
      pinnedByUser: true,
    }));
    request.slotPools[0]!.sources = sources;
    request.currentSources = sources.map((item) => item.sourceReference);
    const result = prepareLocalCandidateSetV1(request);
    expect(result.status).toBe('NEEDS_INPUT');
    expect(result.reasonCodes).toContain('too-many-pinned-candidates');
    expect(result.preparedInput).toBeUndefined();
  });

  it('requires one current revision per source identity', () => {
    const request = fixture();
    const original = request.currentSources[0]!;
    if (original.kind !== 'food') throw new Error('Fixture source is a food.');
    request.currentSources.push({ ...original, foodRevision: 2 });
    expect(CandidatePoolRequestV1Schema.safeParse(request).success).toBe(false);
  });

  it('produces the same prepared snapshot for every source input order', () => {
    const request = fixture();
    const sources = [source(3), source(1), source(2)];
    request.slotPools[0]!.sources = sources;
    request.currentSources = sources.map((item) => item.sourceReference);
    const first = prepareLocalCandidateSetV1(request);
    request.slotPools[0]!.sources.reverse();
    const second = prepareLocalCandidateSetV1(request);
    expect(second.preparedInput).toEqual(first.preparedInput);
    expect(second.slots).toEqual(first.slots);
  });

  it('returns a truthful eligibility status for an unsupported planning day', () => {
    const request = fixture();
    request.baseInput.day.localDate = '2026-10-15';
    request.baseInput.day.startsAt = '2026-10-15T00:00:00.000Z';
    request.baseInput.day.endsAt = '2026-10-16T00:00:00.000Z';
    expect(prepareLocalCandidateSetV1(request)).toMatchObject({
      status: 'OUT_OF_SCOPE',
      reasonCodes: ['planning-day-out-of-range'],
    });
  });
});
