import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { FoodChoice, SaveCustomFoodInput } from '@/lib/browser-stage-two';

import { FoodWorkspace } from './food-workspace';

import type { CustomFoodVersionV1 } from '@nutrixx/food-knowledge';

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
  nutrients: [
    {
      nutrientId: 'protein',
      value: '10 g / one bowl',
      source: 'nutrixx-curated · agent-curated-food-composition · batch-1',
      agentProvenance: {
        evidenceType: 'model-knowledge',
        agentId: 'nutrixx-agent',
        model: 'example-model',
        generatedAt: '2026-10-26T00:00:00.000Z',
        knowledgeDescription: 'Existing model knowledge for this exact food.',
      },
    },
  ],
};

describe('food workspace', () => {
  it('shows the source record and review basis behind a linked food', async () => {
    render(
      <FoodWorkspace
        store={{
          searchFoods: vi.fn(async () => [
            {
              ...choice,
              linkedSources: [
                {
                  source: 'anses-ciqual · ciqual · 2025 · 11033',
                  matchBasis: 'reviewed-food-identity',
                },
              ],
            },
          ]),
          recipeChoices: vi.fn(async () => []),
          listCustomFoods: vi.fn(async () => []),
          saveCustomFood: vi.fn(async () => foodId),
          customFoodHistory: vi.fn(async () => []),
        }}
      />,
    );
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a food' }), {
      target: { value: 'oats' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(
      within(
        await screen.findByRole('list', { name: 'Food search results' }),
      ).getByRole('button', { name: /Test oats/i }),
    );
    expect(screen.getByText('Linked reference records')).toBeInTheDocument();
    expect(
      screen.getByText(
        'anses-ciqual · ciqual · 2025 · 11033 · Reviewed food identity',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Collected by Nutrixx Agent · Model Knowledge/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Existing model knowledge for this exact food/),
    ).toBeInTheDocument();
  });

  it('exposes searchable IDs and units for all 112 custom food components', async () => {
    render(
      <FoodWorkspace
        store={{
          searchFoods: vi.fn(async () => []),
          recipeChoices: vi.fn(async () => []),
          listCustomFoods: vi.fn(async () => []),
          saveCustomFood: vi.fn(async () => foodId),
          customFoodHistory: vi.fn(async () => []),
        }}
      />,
    );
    fireEvent.click(
      screen.getByText('Browse the 112 recognized food components'),
    );
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Find a food component' }),
      {
        target: { value: 'arsenic' },
      },
    );
    expect(screen.getByText('food-component.as')).toBeInTheDocument();
    expect(screen.queryByText('food-component.pb')).not.toBeInTheDocument();
  });

  it('opens the complete published history of a custom food', async () => {
    const original = {
      foodId,
      revision: 1,
      name: 'Original oats',
      publishedAt: '2026-10-06T00:00:00.000Z',
      preparationState: 'dry',
      categories: ['Grains'],
      approximatePriceUsdPer100g: '0.20',
      portions: [{ label: 'one bowl', gramWeight: '80' }],
      composition: [
        {
          nutrientId: 'protein',
          value: { state: 'known', amount: '9', unit: { code: 'g' } },
        },
      ],
    } as unknown as CustomFoodVersionV1;
    const revised = {
      ...original,
      revision: 2,
      name: 'Revised oats',
      publishedAt: '2026-10-07T00:00:00.000Z',
    };
    const customFoodHistory = vi.fn(async () => [original, revised]);
    render(
      <FoodWorkspace
        store={{
          searchFoods: vi.fn(async () => []),
          recipeChoices: vi.fn(async () => []),
          listCustomFoods: vi.fn(async () => [revised]),
          saveCustomFood: vi.fn(async () => foodId),
          customFoodHistory,
        }}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View Revised oats version history',
      }),
    );
    const list = await screen.findByRole('list', {
      name: 'Revised oats version history',
    });
    expect(customFoodHistory).toHaveBeenCalledWith(foodId);
    expect(
      within(list).getByText('Revision 1 · Original oats'),
    ).toBeInTheDocument();
    expect(
      within(list).getByText('Revision 2 · Revised oats'),
    ).toBeInTheDocument();
    expect(within(list).getAllByText('protein: 9 g per serving')).toHaveLength(
      2,
    );
  });

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
          customFoodHistory: vi.fn(async () => []),
        }}
      />,
    );
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a food' }), {
      target: { value: 'oats' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(
      within(
        await screen.findByRole('list', { name: 'Food search results' }),
      ).getByRole('button', {
        name: /Test oats/i,
      }),
    );
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
