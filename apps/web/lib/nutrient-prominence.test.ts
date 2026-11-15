import { describe, expect, it } from 'vitest';

import {
  NUTRIENT_PROMINENCE_POLICY_VERSION_V1,
  NUTRIENT_PROMINENCE_SOURCE_V1,
  selectMealSignatureNutrientsV1,
  type NutrientProminenceIndexV1,
} from './nutrient-prominence';

const index = {
  policyVersion: NUTRIENT_PROMINENCE_POLICY_VERSION_V1,
  source: NUTRIENT_PROMINENCE_SOURCE_V1,
  catalogEntryCount: 1_000,
  nutrients: [
    {
      componentId: 'nutrient.vitamin-c',
      accessCode: 'VITC',
      name: 'Vitamin C',
      unit: 'mg',
      direction: 'ENCOURAGE',
      dailyValueAmount: 90,
      knownFoodCount: 800,
      highSourceCount: 240,
      highSourceShare: 0.3,
      topFoods: [],
    },
    {
      componentId: 'food-component.vitk',
      accessCode: 'VITK',
      name: 'Vitamin K',
      unit: 'ug',
      direction: 'ENCOURAGE',
      dailyValueAmount: 120,
      knownFoodCount: 500,
      highSourceCount: 10,
      highSourceShare: 0.02,
      topFoods: [],
    },
    {
      componentId: 'nutrient.sodium',
      accessCode: 'NA',
      name: 'Sodium',
      unit: 'mg',
      direction: 'LIMIT',
      dailyValueAmount: 2_300,
      knownFoodCount: 900,
      highSourceCount: 300,
      highSourceShare: 1 / 3,
      topFoods: [],
    },
  ],
} satisfies NutrientProminenceIndexV1;

describe('nutrient prominence policy', () => {
  it('keeps two slots while labeling contribution, scarcity, and limits', () => {
    const selected = selectMealSignatureNutrientsV1(
      [
        {
          componentId: 'nutrient.vitamin-c',
          accessCode: 'VITC',
          name: 'Vitamin C',
          category: 'Vitamin',
          state: 'known',
          amount: '45',
          unit: 'mg',
          missingItemCount: 0,
        },
        {
          componentId: 'food-component.vitk',
          accessCode: 'VITK',
          name: 'Vitamin K',
          category: 'Vitamin',
          state: 'known',
          amount: '18',
          unit: 'ug',
          missingItemCount: 0,
        },
        {
          componentId: 'nutrient.sodium',
          accessCode: 'NA',
          name: 'Sodium',
          category: 'Mineral',
          state: 'known',
          amount: '500',
          unit: 'mg',
          missingItemCount: 0,
        },
      ],
      index,
    );
    expect(selected).toMatchObject([
      { name: 'Sodium', label: 'Watch-out' },
      { name: 'Vitamin K', label: 'Distinctive source' },
    ]);
  });

  it('keeps a small contribution unlabeled', () => {
    const selected = selectMealSignatureNutrientsV1(
      [
        {
          componentId: 'food-component.vitk',
          accessCode: 'VITK',
          name: 'Vitamin K',
          category: 'Vitamin',
          state: 'known',
          amount: '2',
          unit: 'ug',
          missingItemCount: 0,
        },
      ],
      index,
    );
    expect(selected).toMatchObject([{ name: 'Vitamin K', label: null }]);
  });

  it('keeps two unlabeled signals when no threshold is reached', () => {
    const selected = selectMealSignatureNutrientsV1(
      [
        {
          componentId: 'nutrient.vitamin-c',
          accessCode: 'VITC',
          name: 'Vitamin C',
          category: 'Vitamin',
          state: 'known',
          amount: '2',
          unit: 'mg',
          missingItemCount: 0,
        },
        {
          componentId: 'food-component.vitk',
          accessCode: 'VITK',
          name: 'Vitamin K',
          category: 'Vitamin',
          state: 'known',
          amount: '3',
          unit: 'ug',
          missingItemCount: 0,
        },
      ],
      index,
    );
    expect(selected).toHaveLength(2);
    expect(selected.every(({ label }) => label === null)).toBe(true);
  });
});
