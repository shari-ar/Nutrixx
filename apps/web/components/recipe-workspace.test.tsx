import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { FoodChoice, SaveRecipeInput } from '@/lib/browser-stage-two';

import { RecipeWorkspace } from './recipe-workspace';

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
  completeness: '1 known nutrient',
  portions: [{ label: 'half bowl', gramWeight: '40' }],
};

describe('recipe workspace', () => {
  it('enables an automatic weight estimate after a unique linked cooking step', async () => {
    const rice: FoodChoice = {
      ...food,
      name: 'Rice, brown, long-grain, raw',
      preparationState: 'raw',
      usdaFoodGroup: '20',
      sourceNdbNumber: '20036',
    };
    render(
      <RecipeWorkspace
        store={{
          listRecipes: vi.fn(async () => []),
          recipeChoices: vi.fn(async () => []),
          saveRecipe: vi.fn(async () => '20000000-0000-4000-8000-000000000001'),
          searchFoods: vi.fn(async () => [rice]),
        }}
      />,
    );
    fireEvent.change(
      screen.getByRole('searchbox', { name: /add an exact food/i }),
      {
        target: { value: 'rice' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(
      await screen.findByRole('button', { name: /Rice, brown/i }),
    );
    fireEvent.change(
      screen.getByRole('spinbutton', { name: `${rice.name} grams` }),
      {
        target: { value: '100' },
      },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Add preparation step' }),
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Step 1' }), {
      target: { value: 'Boil the rice in water.' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: rice.name }));
    expect(
      screen.getByRole('option', {
        name: /USDA estimated ingredient yields.*335 g/i,
      }),
    ).not.toBeDisabled();
  });

  it('offers matching USDA retention and weight yield for raw beef', async () => {
    const beef: FoodChoice = {
      ...food,
      name: 'Beef, bottom sirloin, tri-tip roast, separable lean and fat, trimmed to 0" fat, all grades, raw',
      preparationState: 'unspecified',
      usdaFoodGroup: '13',
      sourceNdbNumber: '13954',
      nutrients: [
        {
          nutrientId: 'source.usda-fdc.1162',
          sourceNutrientNumber: '401',
          value: '12 mg / 100 g',
        },
      ],
    };
    const saveRecipe = vi.fn<(input: SaveRecipeInput) => Promise<string>>(
      async () => '20000000-0000-4000-8000-000000000001',
    );
    render(
      <RecipeWorkspace
        store={{
          listRecipes: vi.fn(async () => []),
          recipeChoices: vi.fn(async () => []),
          saveRecipe,
          searchFoods: vi.fn(async () => [beef]),
        }}
      />,
    );
    fireEvent.change(
      screen.getByRole('searchbox', { name: /add an exact food/i }),
      { target: { value: 'beef' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(
      await screen.findByRole('button', { name: /Beef, bottom sirloin/i }),
    );
    fireEvent.change(
      screen.getByRole('combobox', { name: /USDA retention/i }),
      { target: { value: '0601' } },
    );
    fireEvent.change(screen.getByRole('combobox', { name: /USDA yield/i }), {
      target: { value: '2' },
    });
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Final weight source' }),
      { target: { value: 'usda-estimated' } },
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Recipe name' }), {
      target: { value: 'Roasted beef' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }));
    await waitFor(() => expect(saveRecipe).toHaveBeenCalledOnce());
    expect(saveRecipe.mock.calls[0]?.[0]).toMatchObject({
      weightDetermination: 'usda-estimated',
      ingredients: [{ usdaTreatmentCode: '0601', usdaYieldRowId: '2' }],
    });
  });

  it('connects selected ingredients to preparation steps before publishing', async () => {
    const saveRecipe = vi.fn<(input: SaveRecipeInput) => Promise<string>>(
      async () => '20000000-0000-4000-8000-000000000001',
    );
    render(
      <RecipeWorkspace
        store={{
          listRecipes: vi.fn(async () => []),
          recipeChoices: vi.fn(async () => []),
          saveRecipe,
          searchFoods: vi.fn(async () => [food]),
        }}
      />,
    );

    fireEvent.change(
      screen.getByRole('searchbox', { name: /add an exact food/i }),
      {
        target: { value: 'oats' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(await screen.findByRole('button', { name: /Test oats/i }));
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Test oats portion' }),
      {
        target: { value: '0' },
      },
    );
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Test oats cooking loss' }),
      {
        target: { value: 'protein, 20' },
      },
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Recipe name' }), {
      target: { value: 'Oat bowl' },
    });
    fireEvent.change(
      screen.getByRole('spinbutton', { name: /final edible yield/i }),
      {
        target: { value: '80' },
      },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Add preparation step' }),
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Step 1' }), {
      target: { value: 'Mix the oats.' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Test oats' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }));

    await waitFor(() => expect(saveRecipe).toHaveBeenCalledOnce());
    expect(saveRecipe.mock.calls[0]?.[0]).toMatchObject({
      name: 'Oat bowl',
      ingredients: [
        {
          gramWeight: '40',
          retentionFactors: [{ nutrientId: 'protein', factor: '0.8' }],
        },
      ],
      steps: [{ instruction: 'Mix the oats.', ingredientIndexes: [0] }],
    });
  });
});
