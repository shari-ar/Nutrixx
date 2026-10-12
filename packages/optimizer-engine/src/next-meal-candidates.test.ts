import { describe, expect, it } from 'vitest';

import {
  classifyNextMealCatalog,
  nextMealSourceKey,
  type NextMealCandidateSource,
} from './next-meal-candidates.js';

const id = (number: number): string =>
  `00000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
const evidence = {
  kind: 'dataset',
  sourceId: 'fixture',
  sourceVersion: '1',
} as const;
const unit = { system: 'ucum', code: 'mg' } as const;

function food(number: number): NextMealCandidateSource {
  return {
    reference: {
      kind: 'food',
      catalogReleaseId: 'fixture-release',
      foodId: id(number),
      foodRevision: 1,
    },
    displayName: `Food ${number}`,
    preparationState: 'prepared',
    edibleResolution: 'resolved',
    portions: [
      { portionId: id(number + 100), edibleGrams: '100', source: evidence },
      { portionId: id(number + 200), edibleGrams: '200', source: evidence },
    ],
    nutrientsPer100EdibleGrams: [
      {
        state: 'known',
        nutrientId: 'nutrient.sodium',
        amountPer100EdibleGrams: '50',
        unit,
        source: evidence,
      },
    ],
    restrictionEvidence: {
      state: 'verified',
      ingredientFoodIds: [],
      allergenCodes: [],
      source: evidence,
    },
  };
}

function request(entries: readonly NextMealCandidateSource[]) {
  return {
    requestedAt: '2026-10-12T10:00:00.000Z',
    manifest: {
      entryKeys: entries
        .map((entry) => nextMealSourceKey(entry.reference))
        .sort(),
    },
    entries,
    exclusions: {
      foodIds: [],
      recipeIds: [],
      ingredientFoodIds: [],
      allergenCodes: [],
    },
    inventory: { mode: 'ALL_CATALOG' },
    comparisonNutrients: [{ nutrientId: 'nutrient.sodium', unit }],
    hardLimits: [],
  };
}

describe('complete next-meal candidate census', () => {
  it('classifies every entry and enforces exact hard limits by portion', () => {
    const first = food(1);
    const second = food(2);
    const result = classifyNextMealCatalog({
      ...request([second, first]),
      hardLimits: [
        {
          ruleId: 'sodium-upper-limit',
          nutrientId: 'nutrient.sodium',
          unit,
          maximum: '1000',
          recordedIntake: { state: 'known', amount: '925' },
          sourceScope: 'all-intake',
        },
      ],
    });
    expect(result.total).toBe(2);
    expect(result.processed).toBe(2);
    expect(result.counts.COMPARABLE).toBe(2);
    expect(result.decisions.map((item) => item.candidateKey)).toEqual(
      request([second, first]).manifest.entryKeys,
    );
    expect(result.decisions[0]?.supportedPortionIds).toEqual([id(101)]);
  });

  it('keeps missing safety evidence separate from verified exclusions', () => {
    const candidate = food(1);
    const unknown = {
      ...candidate,
      restrictionEvidence: {
        state: 'unknown' as const,
        reasonCode: 'allergen-evidence-unavailable',
      },
    };
    const limited = classifyNextMealCatalog({
      ...request([unknown]),
      exclusions: {
        foodIds: [],
        recipeIds: [],
        ingredientFoodIds: [],
        allergenCodes: ['allergen.peanut'],
      },
    });
    expect(limited.decisions[0]?.classification).toBe('EVIDENCE_LIMITED');
    const excluded = classifyNextMealCatalog({
      ...request([candidate]),
      exclusions: {
        foodIds: [id(1)],
        recipeIds: [],
        ingredientFoodIds: [],
        allergenCodes: [],
      },
    });
    expect(excluded.decisions[0]?.classification).toBe('EXCLUDED');
  });

  it('checks recipe ingredient quantities for the proposed portion', () => {
    const ingredient = food(1);
    const recipe: NextMealCandidateSource = {
      ...food(2),
      reference: { kind: 'recipe', recipeId: id(2), recipeVersion: 1 },
      portions: [{ portionId: id(302), edibleGrams: '100', source: evidence }],
      recipe: {
        yieldEdibleGrams: '200',
        ingredients: [
          {
            reference: ingredient.reference,
            edibleGramsForYield: '100',
            preparationState: 'prepared',
          },
        ],
      },
    };
    const base = request([recipe]);
    const withStock = (grams: string) => ({
      ...base,
      inventory: {
        mode: 'AVAILABLE_ONLY',
        revision: 1,
        entries: [
          {
            reference: ingredient.reference,
            edibleGrams: grams,
            preparationState: 'prepared',
          },
        ],
      },
    });
    expect(
      classifyNextMealCatalog(withStock('49.999')).decisions[0]?.classification,
    ).toBe('UNAVAILABLE');
    expect(
      classifyNextMealCatalog(withStock('50')).decisions[0]?.classification,
    ).toBe('COMPARABLE');
  });

  it('adds repeated recipe ingredient lines before checking available stock', () => {
    const ingredient = food(1);
    const recipe: NextMealCandidateSource = {
      ...food(2),
      reference: { kind: 'recipe', recipeId: id(2), recipeVersion: 1 },
      portions: [{ portionId: id(302), edibleGrams: '100', source: evidence }],
      recipe: {
        yieldEdibleGrams: '100',
        ingredients: [
          {
            reference: ingredient.reference,
            edibleGramsForYield: '40',
            preparationState: 'prepared',
          },
          {
            reference: ingredient.reference,
            edibleGramsForYield: '40',
            preparationState: 'prepared',
          },
        ],
      },
    };
    const result = classifyNextMealCatalog({
      ...request([recipe]),
      inventory: {
        mode: 'AVAILABLE_ONLY',
        revision: 1,
        entries: [
          {
            reference: ingredient.reference,
            edibleGrams: '70',
            preparationState: 'prepared',
          },
        ],
      },
    });
    expect(result.decisions[0]?.classification).toBe('UNAVAILABLE');
  });

  it('rejects an incomplete manifest instead of calling a truncated pool complete', () => {
    const first = food(1);
    const second = food(2);
    expect(() =>
      classifyNextMealCatalog({
        ...request([first, second]),
        manifest: { entryKeys: [nextMealSourceKey(first.reference)] },
      }),
    ).toThrow();
  });
});
