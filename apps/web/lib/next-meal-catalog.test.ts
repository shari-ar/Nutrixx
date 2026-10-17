import {
  normalizeUsdaFoodDataCentralV1,
  type CustomFoodVersionV1,
  type StagedUsdaFoodV1,
} from '@nutrixx/food-knowledge';
import { describe, expect, it } from 'vitest';

import {
  IncrementalNextMealCatalog,
  buildNextMealCatalogSnapshot,
} from './next-meal-catalog';

import type { CurrentRecipeV1 } from '@nutrixx/recipe-knowledge';

const id = (number: number): string =>
  `00000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;

function catalog(size: number) {
  const staged: StagedUsdaFoodV1[] = Array.from(
    { length: size },
    (_, index) => ({
      fdcId: 1000 + index,
      description: `Catalog food ${index}`,
      preparationState: 'cooked',
      source: {
        dataset: 'foundation',
        sourceRelease: 'fixture-release',
        retrievedAt: '2026-10-12T10:00:00.000Z',
      },
      portions: [
        {
          sourcePortionId: 'serving',
          description: 'One serving',
          amount: '1',
          measureUnitCode: '{item}',
          gramWeight: '100',
        },
      ],
      nutrients: [
        {
          sourceNutrientId: 'protein',
          sourceNutrientName: 'Protein',
          nutrientId: 'nutrient.protein',
          unitCode: 'g',
          amount: '5',
        },
      ],
    }),
  );
  const ids = new Map<string, string>();
  return normalizeUsdaFoodDataCentralV1(staged, (kind, source) => {
    const key = `${kind}:${source}`;
    if (!ids.has(key)) ids.set(key, id(ids.size + 1));
    return ids.get(key)!;
  });
}

describe('next-meal catalog enumeration', () => {
  it('includes the complete installed catalog and current user foods and recipes', () => {
    const customFood = {
      foodId: id(500),
      revision: 1,
      name: 'Custom food',
      preparationState: 'prepared',
      portions: [{ portionId: id(501), gramWeight: '80' }],
      composition: [],
    } as unknown as CustomFoodVersionV1;
    const recipe = {
      version: {
        recipeId: id(600),
        version: 1,
        names: [{ value: 'Custom recipe' }],
        ingredients: [
          {
            reference: {
              kind: 'food',
              catalogReleaseId: 'user-custom-v1',
              foodId: customFood.foodId,
              foodRevision: 1,
            },
            edibleGramWeight: '80',
          },
        ],
        yield: { finalEdibleGramWeight: '75' },
        outputFood: { nutrition: { nutrients: [] } },
      },
    } as unknown as CurrentRecipeV1;
    const result = buildNextMealCatalogSnapshot({
      activeReleaseId: 'fixture-release',
      catalog: catalog(31),
      customFoods: [customFood],
      recipes: [recipe],
    });
    expect(result.entries).toHaveLength(33);
    expect(result.manifest.entryKeys).toHaveLength(33);
    expect(
      result.entries.filter(
        (entry) =>
          entry.reference.kind === 'food' &&
          entry.reference.catalogReleaseId === 'fixture-release',
      ),
    ).toHaveLength(31);
    expect(
      result.entries.some(
        (entry) =>
          entry.reference.kind === 'recipe' &&
          entry.reference.recipeId === id(600),
      ),
    ).toBe(true);
  });

  it('reuses an immutable release and replaces only changed custom revisions', () => {
    const builder = new IncrementalNextMealCatalog();
    builder.useOwner('owner-1');
    const firstFood = {
      foodId: id(500),
      revision: 1,
      name: 'First name',
      preparationState: 'prepared',
      portions: [{ portionId: id(501), gramWeight: '80' }],
      composition: [],
    } as unknown as CustomFoodVersionV1;
    const first = builder.build({
      activeReleaseId: 'fixture-release',
      catalog: catalog(3),
      customFoods: [firstFood],
      recipes: [],
    });
    expect(builder.hasRelease('fixture-release')).toBe(true);
    const second = builder.build({
      activeReleaseId: 'fixture-release',
      catalog: null,
      customFoods: [{ ...firstFood, revision: 2, name: 'Corrected name' }],
      recipes: [],
    });
    expect(second.entries).toHaveLength(4);
    expect(second.entries[0]).toBe(first.entries[0]);
    expect(second.entries.at(-1)?.displayName).toBe('Corrected name');
    expect(second.manifest.entryKeys).not.toContain(
      `food:user-custom-v1:${firstFood.foodId}:1`,
    );
    const replaced = builder.build({
      activeReleaseId: 'fixture-release',
      catalog: null,
      customFoods: [{ ...firstFood, revision: 2, name: 'Restored name' }],
      recipes: [],
    });
    expect(replaced.entries.at(-1)?.displayName).toBe('Restored name');
    builder.useOwner('owner-2');
    expect(builder.hasRelease('fixture-release')).toBe(false);
  });
});
