import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';

import { BrowserStageTwoStore } from './browser-stage-two';

import type { StartingProfileV1 } from '@nutrixx/user-context';

const OWNER_ID = '10000000-0000-4000-8000-000000000001';
const NOW = '2026-10-04T12:00:00.000Z';

function idFactory() {
  let value = 1;
  return () => {
    const suffix = value.toString(16).padStart(12, '0');
    value += 1;
    return `20000000-0000-4000-8000-${suffix}`;
  };
}

function profile(): StartingProfileV1 {
  return {
    profileId: '30000000-0000-4000-8000-000000000001',
    ownerSubjectId: OWNER_ID,
    revision: 1,
    ageYears: 32,
    heightCentimeters: '172',
    weightKilograms: '68',
    physiologicalReference: 'female',
    primaryGoal: 'maintain',
    foodRestrictions: [],
    timeZone: 'America/New_York',
    adultConfirmedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('browser Stage 2 golden flow', () => {
  it('persists an unambiguous USDA cooking yield inferred from a linked step', async () => {
    const store = new BrowserStageTwoStore({
      indexedDB: new IDBFactory(),
      keyRange: IDBKeyRange,
      createId: idFactory(),
      now: () => NOW,
      timeZone: () => 'America/New_York',
      onboarding: { load: async () => profile() },
    });
    await store.saveCustomFood({
      name: 'Rice, brown, long-grain, raw',
      preparationState: 'raw',
      portionLabel: '100 g dry rice',
      gramWeight: '100',
      nutrients: [{ nutrientId: 'protein', amount: '7', unit: 'g' }],
    });
    const [rice] = await store.searchFoods('brown');
    const recipeId = await store.saveRecipe({
      name: 'Cooked brown rice',
      servings: '2',
      finalEdibleGramWeight: '',
      weightDetermination: 'usda-estimated',
      ingredients: [
        {
          choice: { ...rice!, usdaFoodGroup: '20', sourceNdbNumber: '20036' },
          gramWeight: '100',
        },
      ],
      steps: [
        { instruction: 'Boil the rice in water.', ingredientIndexes: [0] },
      ],
    });
    const [recipe] = await store.listRecipes();
    expect(recipe?.version).toMatchObject({
      yield: {
        finalEdibleGramWeight: '335',
        yieldFactor: '3.35',
        determination: 'calculated',
      },
      ingredients: [
        {
          cookingYieldFactor: '3.35',
          cookingYieldRule: {
            component: 'usda-yield-ah102-2196',
            version: '1975',
          },
        },
      ],
    });
    await store.saveRecipe({
      recipeId,
      name: 'Measured brown rice',
      servings: '2',
      finalEdibleGramWeight: '330',
      weightDetermination: 'measured',
      ingredients: [
        {
          choice: { ...rice!, usdaFoodGroup: '20', sourceNdbNumber: '20036' },
          gramWeight: '100',
          usdaYieldRowId: 'none',
          cookingYieldFactor: '3.35',
          cookingYieldRule: {
            component: 'usda-yield-ah102-2196',
            version: '1975',
          },
        },
      ],
      steps: [
        { instruction: 'Boil the rice in water.', ingredientIndexes: [0] },
      ],
    });
    const [measured] = await store.listRecipes();
    expect(measured?.version.yield).toMatchObject({
      finalEdibleGramWeight: '330',
      determination: 'user-entered',
    });
    expect(
      measured?.version.ingredients[0]?.cookingYieldFactor,
    ).toBeUndefined();
  });

  it('stores a food, versioned recipe, and correctable meal without network access', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const store = new BrowserStageTwoStore({
      indexedDB: new IDBFactory(),
      keyRange: IDBKeyRange,
      createId: idFactory(),
      now: () => NOW,
      timeZone: () => 'America/New_York',
      onboarding: { load: async () => profile() },
    });

    const foodId = await store.saveCustomFood({
      name: 'Test oats',
      approximatePriceUsdPer100g: '0.25',
      preparationState: 'dry',
      portionLabel: 'one bowl',
      gramWeight: '80',
      categories: ['Grains', 'Breakfast'],
      portions: [{ label: 'half bowl', gramWeight: '40' }],
      nutrients: [
        { nutrientId: 'protein', amount: '10', unit: 'g' },
        { nutrientId: 'iron' },
      ],
    });
    const [food] = await store.searchFoods('oats');
    expect(food).toMatchObject({
      name: 'Test oats',
      approximatePriceUsdPer100g: '0.25',
      completeness: '1 known · 1 explicitly unknown',
      categories: ['Grains', 'Breakfast'],
      portions: [
        { label: 'one bowl', gramWeight: '80' },
        { label: 'half bowl', gramWeight: '40' },
      ],
    });
    await expect(store.searchFoods('Grains')).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: food?.key })]),
    );

    const recipeId = await store.saveRecipe({
      name: 'Overnight oats',
      servings: '1',
      finalEdibleGramWeight: '180',
      ingredients: [{ choice: food!, gramWeight: '80' }],
      steps: [{ instruction: 'Combine and chill.', ingredientIndexes: [0] }],
    });
    const firstOutputFoodId = (await store.listRecipes())[0]?.version.outputFood
      ?.foodId;
    const [firstOutputChoice] = await store.recipeChoices();
    await store.saveRecipe({
      recipeId,
      name: 'Overnight oats',
      servings: '2',
      finalEdibleGramWeight: '360',
      ingredients: [
        {
          choice: food!,
          gramWeight: '160',
          retentionFactors: [{ nutrientId: 'protein', factor: '0.8' }],
        },
      ],
      steps: [{ instruction: 'Combine and chill.', ingredientIndexes: [0] }],
    });
    const [published] = await store.listRecipes();
    expect(published?.version).toMatchObject({
      version: 2,
      preparationSteps: [
        { ingredientIds: [published?.version.ingredients[0]?.ingredientId] },
      ],
      outputFood: {
        nutrition: {
          nutrients: expect.arrayContaining([
            {
              state: 'known',
              nutrientId: 'protein',
              perServing: { amount: '8', unit: { system: 'ucum', code: 'g' } },
              total: { amount: '16', unit: { system: 'ucum', code: 'g' } },
              per100Gram: {
                amount: expect.any(String),
                unit: { system: 'ucum', code: 'g' },
              },
              completeness: '1',
            },
            expect.objectContaining({
              state: 'incomplete',
              nutrientId: 'iron',
            }),
          ]),
        },
      },
    });
    expect(published?.version.outputFood?.foodId).toBe(firstOutputFoodId);

    const [recipe] = await store.recipeChoices();
    expect(recipe).toMatchObject({
      key: expect.stringMatching(/^food:user-recipe-v1:/),
      reference: {
        kind: 'food',
        catalogReleaseId: 'user-recipe-v1',
        foodId: firstOutputFoodId,
        foodRevision: 2,
      },
      categories: ['Recipes'],
      portions: [{ label: '1 serving', gramWeight: '180' }],
    });
    await expect(store.searchFoods('Overnight')).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: recipe?.key })]),
    );
    const mealId = await store.saveMeal({
      mealType: 'breakfast',
      occurredAt: '2026-10-04T07:00:00-04:00',
      items: [{ choice: recipe!, gramWeight: '180' }],
    });
    await store.saveMeal({
      mealId,
      mealType: 'breakfast',
      occurredAt: '2026-10-04T07:10:00-04:00',
      note: 'Corrected time',
      items: [{ choice: recipe!, gramWeight: '180' }],
    });

    await expect(store.listMeals()).resolves.toMatchObject([
      {
        mealId,
        revision: 2,
        note: 'Corrected time',
        nutrition: expect.arrayContaining([
          {
            state: 'known',
            nutrientId: 'protein',
            amount: '8',
            unit: { system: 'ucum', code: 'g' },
          },
        ]),
      },
    ]);
    await expect(store.mealHistory(mealId)).resolves.toHaveLength(2);
    const historyBeforeFoodCorrection = await store.mealHistory(mealId);
    expect(historyBeforeFoodCorrection[1]?.nutrition).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          state: 'incomplete',
          nutrientId: 'iron',
        }),
      ]),
    );
    await store.saveCustomFood({
      foodId,
      name: 'Test oats',
      preparationState: 'dry',
      portionLabel: 'one bowl',
      gramWeight: '80',
      nutrients: [{ nutrientId: 'protein', amount: '100', unit: 'g' }],
    });
    expect((await store.mealHistory(mealId))[1]?.nutrition).toEqual(
      historyBeforeFoodCorrection[1]?.nutrition,
    );
    await store.voidMeal(mealId, 'Removed in golden flow');
    await expect(store.listMeals()).resolves.toEqual([]);
    await expect(store.mealHistory(mealId)).resolves.toHaveLength(3);

    const historicalMealId = await store.saveMeal({
      mealType: 'breakfast',
      occurredAt: '2026-10-04T07:30:00-04:00',
      items: [{ choice: firstOutputChoice!, gramWeight: '180' }],
    });
    await expect(store.mealHistory(historicalMealId)).resolves.toMatchObject([
      {
        nutrition: expect.arrayContaining([
          {
            state: 'known',
            nutrientId: 'protein',
            amount: '10',
            unit: { system: 'ucum', code: 'g' },
          },
        ]),
      },
    ]);

    expect(foodId).toBe(
      food?.reference.kind === 'food' ? food.reference.foodId : '',
    );
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
