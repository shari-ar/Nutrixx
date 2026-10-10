import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { FoodChoice, SaveCustomFoodInput } from '@/lib/browser-stage-two';

import { FoodWorkspace } from './food-workspace';

const foodId = '10000000-0000-4000-8000-000000000001';
const choice: FoodChoice = {
  key: `food:user-custom-v1:${foodId}:1`,
  name: 'Test oats',
  description: 'one bowl · 80 g',
  reference: {
    kind: 'food',
    catalogReleaseId: 'user-custom-v1',
    foodId,
    foodRevision: 1,
  },
  defaultGramWeight: '80',
  approximatePriceUsdPer100g: '0.25',
  preparationState: 'dry',
  provenance: 'User-entered label or custom food',
  completeness: '1 known · 0 explicitly unknown',
  categories: ['Grains'],
  portions: [
    { label: 'one bowl', gramWeight: '80' },
    { label: 'half bowl', gramWeight: '40' },
  ],
  nutrients: [{ nutrientId: 'protein', value: '10 g / one bowl' }],
};

describe('food workspace', () => {
  it('shows food details and publishes a correction with categories and portions', async () => {
    const saveCustomFood = vi.fn<
      (input: SaveCustomFoodInput) => Promise<string>
    >(async () => foodId);
    render(
      <FoodWorkspace
        store={{
          searchFoods: vi.fn(async () => [choice]),
          recipeChoices: vi.fn(async () => []),
          listCustomFoods: vi.fn(async () => [
            {
              foodId,
              ownerSubjectId: '20000000-0000-4000-8000-000000000001',
              revision: 1,
              name: 'Test oats',
              approximatePriceUsdPer100g: '0.25',
              preparationState: 'dry',
              categories: ['Grains'],
              portions: [
                {
                  portionId: '30000000-0000-4000-8000-000000000001',
                  label: 'one bowl',
                  gramWeight: '80',
                },
                {
                  portionId: '30000000-0000-4000-8000-000000000002',
                  label: 'half bowl',
                  gramWeight: '40',
                },
              ],
              composition: [
                {
                  nutrientId: 'protein',
                  value: {
                    state: 'known' as const,
                    amount: '10',
                    unit: { system: 'ucum' as const, code: 'g' },
                    basis: 'per-serving' as const,
                  },
                },
              ],
              publishedAt: '2026-10-07T00:00:00.000Z',
            },
          ]),
          saveCustomFood,
        }}
      />,
    );
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a food' }), {
      target: { value: 'oats' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(await screen.findByRole('button', { name: /Test oats/i }));
    expect(screen.getByText('Grains')).toBeInTheDocument();
    expect(screen.getByText('$0.25')).toBeInTheDocument();
    expect(screen.getByText(/half bowl: 40 g/)).toBeInTheDocument();
    expect(screen.getByText(/protein: 10 g/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit this custom food' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Publish food correction' }),
    );
    await waitFor(() =>
      expect(saveCustomFood).toHaveBeenCalledWith(
        expect.objectContaining({
          foodId,
          approximatePriceUsdPer100g: '0.25',
          categories: ['Grains'],
          portions: [{ label: 'half bowl', gramWeight: '40' }],
        }),
      ),
    );
  });
});
