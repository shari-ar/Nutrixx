import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MealDetail } from './meal-detail';

import type { MealRevisionV1 } from '@nutrixx/consumption';

const meal: MealRevisionV1 = {
  mealId: '10000000-0000-4000-8000-000000000001',
  ownerSubjectId: '20000000-0000-4000-8000-000000000001',
  revision: 1,
  state: 'recorded',
  occurredAt: '2026-10-04T10:00:00.000Z',
  localDate: '2026-10-04',
  timeZone: 'UTC',
  mealType: 'breakfast',
  items: [
    {
      itemId: '30000000-0000-4000-8000-000000000001',
      position: 1,
      displayNameSnapshot: 'Oat bowl',
      preparationState: 'prepared',
      reference: {
        kind: 'recipe',
        recipeId: '40000000-0000-4000-8000-000000000001',
        recipeVersion: 1,
      },
      consumedQuantity: { amount: '180', unit: { system: 'ucum', code: 'g' } },
      edibleGramWeight: '180',
      provenance: {
        method: 'user-entered',
        source: {
          kind: 'user',
          sourceId: '20000000-0000-4000-8000-000000000001',
        },
        recordedAt: '2026-10-04T10:05:00.000Z',
      },
    },
  ],
  nutrition: [
    {
      state: 'known',
      nutrientId: 'nutrient.protein',
      amount: '10',
      unit: { system: 'ucum', code: 'g' },
    },
    {
      state: 'incomplete',
      nutrientId: 'nutrient.iron',
      missingItemIds: ['30000000-0000-4000-8000-000000000001'],
    },
  ],
  provenance: {
    method: 'user-entered',
    source: { kind: 'user', sourceId: '20000000-0000-4000-8000-000000000001' },
    recordedAt: '2026-10-04T10:05:00.000Z',
  },
  recordedAt: '2026-10-04T10:05:00.000Z',
};

describe('meal detail', () => {
  it('shows the retained known total and incomplete evidence separately', async () => {
    render(
      <MealDetail
        mealId={meal.mealId}
        store={{ mealHistory: async () => [meal] }}
      />,
    );

    expect(await screen.findByText('Meal nutrition')).toBeInTheDocument();
    expect(screen.getByText('10 g')).toBeInTheDocument();
    expect(screen.getByText('Incomplete evidence')).toBeInTheDocument();
  });
});
