import { CanonicalCodeSchema } from '@nutrixx/canonical-schema';

import {
  ONE_HUNDRED_RATIONAL,
  ZERO_RATIONAL,
  addRational,
  divideRational,
  multiplyRational,
  rationalFromCanonicalDecimal,
  roundRationalHalfEven,
  type NonnegativeRational,
} from './decimal.js';
import {
  RecipeCalculationPolicyV1Schema,
  RecipeNutritionCalculationV1Schema,
  RecipeVersionV1Schema,
  ResolvedIngredientCompositionV1Schema,
  type RecipeCalculationPolicyV1,
  type RecipeIngredientReferenceV1,
  type RecipeNutritionCalculationV1,
  type RecipeIngredientV1,
  type RecipeVersionV1,
  type ResolvedIngredientCompositionV1,
} from './model.js';

export interface RecipeIngredientCompositionResolverV1 {
  resolve(
    reference: RecipeIngredientReferenceV1,
    nutrientId: string,
  ): ResolvedIngredientCompositionV1;
}

function sameUnit(
  left: { readonly system: string; readonly code: string },
  right: { readonly system: string; readonly code: string },
): boolean {
  return left.system === right.system && left.code === right.code;
}

function sameRule(
  left: { readonly component: string; readonly version: string },
  right: { readonly component: string; readonly version: string },
): boolean {
  return left.component === right.component && left.version === right.version;
}

export function calculateRecipeNutritionV1(
  recipeInput: RecipeVersionV1,
  nutrientIdsInput: readonly string[],
  resolver: RecipeIngredientCompositionResolverV1,
  policyInput: RecipeCalculationPolicyV1,
): RecipeNutritionCalculationV1 {
  const recipe = RecipeVersionV1Schema.parse(recipeInput);
  const policy = RecipeCalculationPolicyV1Schema.parse(policyInput);
  if (!sameRule(recipe.calculationRule, policy.rule)) {
    throw new TypeError(
      'The active calculation policy must match the recipe calculation rule.',
    );
  }
  const nutrientIds = nutrientIdsInput.map((value) =>
    CanonicalCodeSchema.parse(value),
  );
  if (
    nutrientIds.length === 0 ||
    new Set(nutrientIds).size !== nutrientIds.length
  ) {
    throw new TypeError('At least one unique nutrient identifier is required.');
  }

  const nutrients = calculateIngredientNutritionV1({
    ingredients: recipe.ingredients,
    nutrientIds,
    finalEdibleGramWeight: recipe.yield.finalEdibleGramWeight,
    servings: recipe.yield.servings,
    resolver,
    decimalPlaces: policy.decimalPlaces,
  });

  return RecipeNutritionCalculationV1Schema.parse({
    recipeId: recipe.recipeId,
    recipeVersion: recipe.version,
    finalEdibleGramWeight: recipe.yield.finalEdibleGramWeight,
    servings: recipe.yield.servings,
    calculationRule: policy.rule,
    nutrients,
  });
}

export function calculateIngredientNutritionV1(input: {
  readonly ingredients: readonly RecipeIngredientV1[];
  readonly nutrientIds: readonly string[];
  readonly finalEdibleGramWeight: string;
  readonly servings: string;
  readonly resolver: RecipeIngredientCompositionResolverV1;
  readonly decimalPlaces: number;
}): RecipeNutritionCalculationV1['nutrients'] {
  const { ingredients, nutrientIds, resolver, decimalPlaces } = input;
  const finalYield = rationalFromCanonicalDecimal(input.finalEdibleGramWeight);
  const servings = rationalFromCanonicalDecimal(input.servings);
  const nutrients: RecipeNutritionCalculationV1['nutrients'][number][] = [];

  for (const nutrientId of nutrientIds) {
    let total: NonnegativeRational = ZERO_RATIONAL;
    let unit: { system: 'ucum' | 'nutrixx'; code: string } | undefined;
    let knownIngredients = 0;
    const missingIngredientIds: string[] = [];
    const reasonCodes = new Set<string>();

    for (const ingredient of ingredients) {
      const resolved = ResolvedIngredientCompositionV1Schema.parse(
        resolver.resolve(ingredient.reference, nutrientId),
      );
      if (resolved.state === 'unknown') {
        missingIngredientIds.push(ingredient.ingredientId);
        reasonCodes.add(`ingredient.${resolved.reason}`);
        continue;
      }
      if (unit !== undefined && !sameUnit(unit, resolved.unit)) {
        throw new TypeError(
          `Nutrient ${nutrientId} resolved to incompatible units within one recipe.`,
        );
      }
      unit = resolved.unit;
      knownIngredients += 1;
      const retention = ingredient.retentionFactors.find(
        (factor) => factor.nutrientId === nutrientId,
      )?.factor;
      let contribution = multiplyRational(
        rationalFromCanonicalDecimal(resolved.amountPer100Gram),
        rationalFromCanonicalDecimal(ingredient.edibleGramWeight),
      );
      contribution = divideRational(contribution, ONE_HUNDRED_RATIONAL);
      if (retention !== undefined) {
        contribution = multiplyRational(
          contribution,
          rationalFromCanonicalDecimal(retention),
        );
      }
      total = addRational(total, contribution);
    }

    if (missingIngredientIds.length > 0) {
      nutrients.push({
        state: 'incomplete',
        nutrientId,
        ...(unit === undefined
          ? {}
          : {
              knownTotal: {
                amount: roundRationalHalfEven(total, decimalPlaces),
                unit,
              },
            }),
        completeness: roundRationalHalfEven(
          {
            numerator: BigInt(knownIngredients),
            denominator: BigInt(ingredients.length),
          },
          6,
        ),
        missingIngredientIds,
        reasonCodes: [...reasonCodes].sort(),
      });
      continue;
    }
    if (unit === undefined) {
      throw new TypeError(`Nutrient ${nutrientId} has no resolved unit.`);
    }

    nutrients.push({
      state: 'known',
      nutrientId,
      total: {
        amount: roundRationalHalfEven(total, decimalPlaces),
        unit,
      },
      per100Gram: {
        amount: roundRationalHalfEven(
          divideRational(
            multiplyRational(total, ONE_HUNDRED_RATIONAL),
            finalYield,
          ),
          decimalPlaces,
        ),
        unit,
      },
      perServing: {
        amount: roundRationalHalfEven(
          divideRational(total, servings),
          decimalPlaces,
        ),
        unit,
      },
      completeness: '1',
    });
  }

  return nutrients;
}
