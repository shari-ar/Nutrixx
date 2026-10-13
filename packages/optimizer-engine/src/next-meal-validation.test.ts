import { describe, expect, it } from 'vitest';

import {
  nextMealSourceKey,
  type NextMealCandidateSource,
} from './next-meal-candidates.js';
import { rankNextMealCandidatesV1 } from './next-meal-ranking.js';
import {
  reviewNextMealRankingV1,
  verifyNextMealExplanationsV1,
} from './next-meal-validation.js';

const id = (number: number): string =>
  `00000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
const source = {
  kind: 'dataset',
  sourceId: 'fixture',
  sourceVersion: '1',
} as const;
const unit = { system: 'ucum', code: 'mg' } as const;

function food(number: number, iron: string): NextMealCandidateSource {
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
      { portionId: id(number + 100), edibleGrams: '100', source },
      { portionId: id(number + 200), edibleGrams: '200', source },
    ],
    nutrientsPer100EdibleGrams: [
      {
        state: 'known',
        nutrientId: 'nutrient.iron',
        amountPer100EdibleGrams: iron,
        unit,
        source,
      },
    ],
    restrictionEvidence: {
      state: 'verified',
      ingredientFoodIds: [],
      allergenCodes: [],
      source,
    },
  };
}

function request(entries: NextMealCandidateSource[]) {
  return {
    candidates: {
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
      comparisonNutrients: [{ nutrientId: 'nutrient.iron', unit }],
      hardLimits: [],
    },
    acceptedMeals: [
      {
        mealId: id(500),
        revision: 1,
        consumedAt: '2026-10-11T08:00:00.000Z',
        nutrients: [
          {
            state: 'known',
            nutrientId: 'nutrient.iron',
            amount: '20',
            unit,
            source,
          },
        ],
      },
    ],
    temporalRules: [
      {
        ruleId: 'iron-rolling-days',
        ruleVersion: 'fixture-v1',
        nutrientId: 'nutrient.iron',
        unit,
        sourceScope: 'all-intake',
        timeBasis: 'elapsed-time',
        windowStartInclusive: '2026-10-09T00:00:00.000Z',
        windowEndExclusive: '2026-10-13T00:00:00.000Z',
        coverage: { state: 'complete', source },
        target: {
          amount: '25',
          mode: 'preferred',
          referenceType: 'planning-target',
          releaseId: 'fixture-release',
          source,
        },
        weight: 2,
      },
    ],
  };
}

describe('independent next-meal review', () => {
  it('approves a complete ranked catalog and produces traceable facts', () => {
    const input = request([food(2, '5'), food(1, '20')]);
    const ranking = rankNextMealCandidatesV1(input);
    const review = reviewNextMealRankingV1(input, ranking);
    expect(review.status).toBe('APPROVED');
    if (review.status !== 'APPROVED') return;
    expect(review.explanations).toHaveLength(2);
    expect(review.explanations[0]).toMatchObject({
      candidateKey: nextMealSourceKey(input.candidates.entries[0]!.reference),
      rank: 1,
      comparisons: [
        {
          ruleId: 'iron-rolling-days',
          targetAmount: '25',
          acceptedMealIds: [id(500)],
          recordedAmount: { numerator: '20', denominator: '1' },
          projectedAmount: { numerator: '25', denominator: '1' },
          normalizedDistance: { numerator: '0', denominator: '1' },
        },
      ],
    });
    expect(
      verifyNextMealExplanationsV1(input, ranking, review.explanations),
    ).toBe(true);
    const altered = review.explanations.map((explanation, index) =>
      index === 0
        ? {
            ...explanation,
            comparisons: explanation.comparisons?.map((comparison) => ({
              ...comparison,
              projectedAmount: {
                ...comparison.projectedAmount,
                numerator: '26',
              },
            })),
          }
        : explanation,
    );
    expect(verifyNextMealExplanationsV1(input, ranking, altered)).toBe(false);
  });

  it('rejects an altered numerical score, rank, portion, or catalog coverage', () => {
    const input = request([food(1, '20'), food(2, '5')]);
    const ranking = rankNextMealCandidatesV1(input);
    const alteredScore = {
      ...ranking,
      ranked: ranking.ranked.map((row, index) =>
        index === 0
          ? {
              ...row,
              ruleScores: row.ruleScores.map((score) => ({
                ...score,
                projectedAmount: { ...score.projectedAmount, numerator: '99' },
              })),
            }
          : row,
      ),
    };
    expect(reviewNextMealRankingV1(input, alteredScore)).toMatchObject({
      status: 'REJECTED',
      reasonCodes: ['ranked-claim-mismatch'],
    });
    const alteredOrder = { ...ranking, ranked: [...ranking.ranked].reverse() };
    expect(reviewNextMealRankingV1(input, alteredOrder).status).toBe(
      'REJECTED',
    );
    const alteredPortion = {
      ...ranking,
      ranked: ranking.ranked.map((row, index) =>
        index === 0 ? { ...row, edibleGrams: '200' } : row,
      ),
    };
    expect(reviewNextMealRankingV1(input, alteredPortion).status).toBe(
      'REJECTED',
    );
    const alteredCoverage = { ...ranking, total: 1 };
    expect(reviewNextMealRankingV1(input, alteredCoverage)).toMatchObject({
      status: 'REJECTED',
      reasonCodes: ['catalog-coverage-mismatch'],
    });
  });

  it('independently checks exclusions, verified upper limits, and evidence limits', () => {
    const first = food(1, '20');
    const second = food(2, '5');
    const base = request([first, second]);
    const input = {
      ...base,
      candidates: {
        ...base.candidates,
        exclusions: {
          ...base.candidates.exclusions,
          foodIds: [
            first.reference.kind === 'food' ? first.reference.foodId : id(1),
          ],
        },
        hardLimits: [
          {
            ruleId: 'iron-upper-limit',
            nutrientId: 'nutrient.iron',
            unit,
            maximum: '27',
            recordedIntake: { state: 'known', amount: '20' },
            sourceScope: 'all-intake',
          },
        ],
      },
    };
    const ranking = rankNextMealCandidatesV1(input);
    const review = reviewNextMealRankingV1(input, ranking);
    expect(review.status).toBe('APPROVED');
    if (review.status !== 'APPROVED') return;
    expect(review.explanations).toMatchObject([
      { classification: 'COMPARABLE', edibleGrams: '100' },
      { classification: 'EXCLUDED', reasonCodes: ['excluded-food'] },
    ]);
    const unsafe = {
      ...ranking,
      ranked: ranking.ranked.map((row, index) =>
        index === 0
          ? { ...row, portionId: second.portions[1]!.portionId }
          : row,
      ),
    };
    expect(reviewNextMealRankingV1(input, unsafe).status).toBe('REJECTED');
    const unknown = {
      ...base,
      temporalRules: [
        {
          ...base.temporalRules[0],
          coverage: { state: 'unknown', reasonCode: 'unlogged-history' },
        },
      ],
    };
    const limited = reviewNextMealRankingV1(
      unknown,
      rankNextMealCandidatesV1(unknown),
    );
    expect(limited.status).toBe('APPROVED');
    if (limited.status === 'APPROVED')
      expect(
        limited.explanations.every(
          (item) =>
            item.classification === 'EVIDENCE_LIMITED' &&
            item.rank === undefined,
        ),
      ).toBe(true);
  });

  it('checks recipe ingredient quantities under the personal inventory gate', () => {
    const ingredient = food(1, '5');
    const recipe: NextMealCandidateSource = {
      ...food(3, '10'),
      reference: { kind: 'recipe', recipeId: id(3), recipeVersion: 1 },
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
    const input = {
      ...base,
      candidates: {
        ...base.candidates,
        inventory: {
          mode: 'AVAILABLE_ONLY',
          revision: 1,
          entries: [
            {
              reference: ingredient.reference,
              edibleGrams: '60',
              preparationState: 'prepared',
            },
          ],
        },
      },
    };
    const ranking = rankNextMealCandidatesV1(input);
    expect(ranking.ranked[0]?.edibleGrams).toBe('100');
    expect(reviewNextMealRankingV1(input, ranking).status).toBe('APPROVED');
    const missing = {
      ...input,
      candidates: {
        ...input.candidates,
        inventory: { ...input.candidates.inventory, entries: [] },
      },
    };
    const unavailable = reviewNextMealRankingV1(
      missing,
      rankNextMealCandidatesV1(missing),
    );
    expect(unavailable.status).toBe('APPROVED');
    if (unavailable.status === 'APPROVED')
      expect(unavailable.explanations[0]).toMatchObject({
        classification: 'UNAVAILABLE',
        reasonCodes: ['inventory-insufficient'],
      });
  });

  it('rejects incomplete manifests and malformed result shapes', () => {
    const input = request([food(1, '20')]);
    const ranking = rankNextMealCandidatesV1(input);
    expect(
      reviewNextMealRankingV1(
        {
          ...input,
          candidates: { ...input.candidates, manifest: { entryKeys: [] } },
        },
        ranking,
      ),
    ).toMatchObject({
      status: 'REJECTED',
      reasonCodes: ['invalid-frozen-input'],
    });
    expect(
      reviewNextMealRankingV1(input, {
        ...ranking,
        ranked: [{ ...ranking.ranked[0], unexpected: true }],
      }),
    ).toMatchObject({
      status: 'REJECTED',
      reasonCodes: ['invalid-ranking-shape'],
    });
  });
});
