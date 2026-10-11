import { describe, expect, it } from 'vitest';

import { NUTRIENT_CROSSWALK_V1 } from './nutrient-crosswalk.js';
import {
  FOOD_COMPONENTS_V1,
  findFoodComponentV1,
  resolveFoodComponentV1,
} from './nutrient-registry.js';

describe('Feasibility food-component register', () => {
  it('contains all 112 distinct active Access concepts with the original categories', () => {
    expect(FOOD_COMPONENTS_V1).toHaveLength(112);
    expect(
      new Set(FOOD_COMPONENTS_V1.map((entry) => entry.accessCode)).size,
    ).toBe(112);
    expect(
      new Set(FOOD_COMPONENTS_V1.map((entry) => entry.componentId)).size,
    ).toBe(112);
    expect(
      Object.fromEntries(
        (['nutrient', 'bioactive', 'contaminant', 'other'] as const).map(
          (kind) => [
            kind,
            FOOD_COMPONENTS_V1.filter((entry) => entry.kind === kind).length,
          ],
        ),
      ),
    ).toEqual({ nutrient: 55, bioactive: 50, contaminant: 5, other: 2 });
    expect(
      Object.fromEntries(
        Array.from(
          new Set(FOOD_COMPONENTS_V1.map((entry) => entry.category)),
        ).map((category) => [
          category,
          FOOD_COMPONENTS_V1.filter((entry) => entry.category === category)
            .length,
        ]),
      ),
    ).toEqual({
      Energy: 1,
      Macronutrient: 3,
      Carbohydrate: 8,
      Mineral: 17,
      Vitamin: 15,
      Carotenoid: 5,
      Other: 2,
      Bioactive: 21,
      Lipid: 1,
      'Fatty Acid': 13,
      'Amino Acid': 19,
      Antinutrient: 2,
      'Trace Element': 1,
      Contaminant: 4,
    });
  });

  it('preserves all 27 existing target identities and exact units', () => {
    for (const target of NUTRIENT_CROSSWALK_V1) {
      const component = findFoodComponentV1(target.nutrientId);
      expect(component).toBeDefined();
      expect(component?.unit).toBe(target.observationUnit);
      expect(component?.usdaFdcNutrientIds).toContain(target.usdaFdcNutrientId);
    }
  });

  it('recognizes additional exact USDA facts without inventing missing mappings', () => {
    const sourceIds = FOOD_COMPONENTS_V1.flatMap(
      (entry) => entry.usdaFdcNutrientIds,
    );
    expect(sourceIds).toHaveLength(78);
    expect(new Set(sourceIds).size).toBe(sourceIds.length);
    expect(resolveFoodComponentV1('source.usda-fdc.1009', 'g')).toBe(
      'food-component.starch',
    );
    expect(resolveFoodComponentV1('source.usda-fdc.2000', 'g')).toBe(
      'food-component.sugar',
    );
    expect(resolveFoodComponentV1('source.usda-fdc.1063', 'g')).toBe(
      'food-component.sugar',
    );
    expect(resolveFoodComponentV1('source.usda-fdc.1099', 'ug')).toBeNull();
    expect(resolveFoodComponentV1('source.usda-fdc.1185', 'ug')).toBeNull();
    expect(resolveFoodComponentV1('source.usda-fdc.1009', 'mg')).toBeNull();
  });
});
