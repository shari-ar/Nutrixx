import { FoodCatalogIndexV1 } from '@nutrixx/food-knowledge';

import type { RecipeIngredientCompositionResolverV1 } from './calculator.js';
import type {
  RecipeIngredientReferenceV1,
  RecipeNutritionCalculationV1,
  ResolvedIngredientCompositionV1,
} from './model.js';

export type RecipeNutritionLookupV1 = (
  recipeId: string,
  recipeVersion: number,
) => RecipeNutritionCalculationV1 | null;

export class CatalogRecipeCompositionResolverV1
  implements RecipeIngredientCompositionResolverV1
{
  public constructor(
    private readonly catalog: FoodCatalogIndexV1,
    private readonly recipeLookup: RecipeNutritionLookupV1 = () => null,
  ) {}

  public resolve(
    reference: RecipeIngredientReferenceV1,
    nutrientId: string,
  ): ResolvedIngredientCompositionV1 {
    if (reference.kind === 'recipe') {
      const calculation = this.recipeLookup(
        reference.recipeId,
        reference.recipeVersion,
      );
      const nutrient = calculation?.nutrients.find(
        (candidate) => candidate.nutrientId === nutrientId,
      );
      return nutrient?.state === 'known'
        ? {
            state: 'known',
            amountPer100Gram: nutrient.per100Gram.amount,
            unit: nutrient.per100Gram.unit,
          }
        : { state: 'unknown', reason: 'not-resolvable' };
    }

    const observations = this.catalog
      .listComposition(reference.foodId, reference.foodRevision)
      .filter((observation) => observation.nutrientId === nutrientId);
    if (observations.length === 0) {
      return { state: 'unknown', reason: 'not-provided' };
    }
    if (observations.length !== 1) {
      return { state: 'unknown', reason: 'not-resolvable' };
    }
    const observation = observations[0]!;
    if (observation.value.state === 'unknown') {
      return observation.value;
    }
    if (observation.value.basis !== 'per-100-gram-edible') {
      return { state: 'unknown', reason: 'unsupported' };
    }
    return {
      state: 'known',
      amountPer100Gram: observation.value.amount,
      unit: observation.value.unit,
    };
  }
}
