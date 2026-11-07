import { describe, expect, it } from 'vitest';

import { presentMealNutritionV1 } from './meal-nutrition-presentation';

import type { MealRevisionV1 } from '@nutrixx/consumption';

type MealNutritionV1 = NonNullable<MealRevisionV1['nutrition']>;

describe('meal nutrition presentation', () => {
  it('maps source observations to one human-readable canonical component', () => {
    const nutrition: MealNutritionV1 = [
      {
        state: 'known',
        nutrientId: 'food-component.sugar',
        amount: '14',
        unit: { system: 'ucum', code: 'g' },
      },
      {
        state: 'known',
        nutrientId: 'source.usda-fdc.2000',
        amount: '15',
        unit: { system: 'ucum', code: 'g' },
      },
      {
        state: 'known',
        nutrientId: 'source.usda-fdc.1063',
        amount: '13',
        unit: { system: 'ucum', code: 'g' },
      },
      {
        state: 'known',
        nutrientId: 'source.usda-fdc.1002',
        amount: '2',
        unit: { system: 'ucum', code: 'g' },
      },
    ];

    const result = presentMealNutritionV1(nutrition);

    expect(result.rows).toEqual([
      expect.objectContaining({
        name: 'Sugars',
        amount: '15',
        unit: 'g',
      }),
    ]);
    expect(result.collapsedEquivalentObservationCount).toBe(2);
    expect(result.hiddenTechnicalObservationCount).toBe(1);
  });

  it('keeps a recorded zero distinct from incomplete evidence', () => {
    const nutrition: MealNutritionV1 = [
      {
        state: 'known',
        nutrientId: 'nutrient.protein',
        amount: '0',
        unit: { system: 'ucum', code: 'g' },
      },
      {
        state: 'incomplete',
        nutrientId: 'nutrient.iron',
        missingItemIds: ['30000000-0000-4000-8000-000000000001'],
      },
    ];

    expect(presentMealNutritionV1(nutrition).rows).toEqual([
      expect.objectContaining({
        name: 'Protein',
        state: 'known',
        amount: '0',
      }),
      expect.objectContaining({
        name: 'Iron',
        state: 'incomplete',
        missingItemCount: 1,
      }),
    ]);
  });
});
