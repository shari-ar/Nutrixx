import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { FoodChoice, SaveMealInput } from '@/lib/browser-stage-two';

import { MealWorkspace } from './meal-workspace';

const food: FoodChoice = {
  key: 'food:test-release:test-food:1',
  name: 'Test oats',
  description: 'one bowl',
  reference: {
    kind: 'food',
    catalogReleaseId: 'test-release',
    foodId: '10000000-0000-4000-8000-000000000001',
    foodRevision: 1,
  },
  defaultGramWeight: '80',
  preparationState: 'dry',
  provenance: 'Golden fixture',
  completeness: '1 known · 1 explicitly unknown',
};

describe('meal workspace', () => {
  it('supports an accessible manual meal entry and a recoverable empty state', async () => {
    const saveMeal = vi.fn<(input: SaveMealInput) => Promise<string>>(
      async () => '20000000-0000-4000-8000-000000000001',
    );
    const store = {
      listMeals: vi.fn(async () => []),
      saveMeal,
      voidMeal: vi.fn(async () => undefined),
      searchFoods: vi.fn(async () => [food]),
      recipeChoices: vi.fn(async () => []),
    };
    render(<MealWorkspace store={store} />);

    expect(
      await screen.findByText(
        'Your first manually logged meal will appear here.',
      ),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: /add a food/i }), {
      target: { value: 'oats' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(await screen.findByRole('button', { name: /Test oats/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save meal' }));

    await waitFor(() => expect(saveMeal).toHaveBeenCalledOnce());
    expect(saveMeal.mock.calls[0]?.[0]).toMatchObject({
      mealType: 'other',
      items: [{ choice: food, gramWeight: '80' }],
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Meal saved in this browser.',
    );
  });
});
