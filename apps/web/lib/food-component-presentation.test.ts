import { FOOD_COMPONENTS_V1 } from '@nutrixx/nutrition-engine';
import { describe, expect, it } from 'vitest';

import { foodComponentDisplayNameV1 } from './food-component-presentation';

describe('food component presentation', () => {
  it('uses the canonical register, source label, and safe fallback in order', () => {
    expect(foodComponentDisplayNameV1('source.usda-fdc.1003')).toBe('Protein');
    expect(foodComponentDisplayNameV1('source.usda-fdc.1002', 'Nitrogen')).toBe(
      'Nitrogen',
    );
    expect(foodComponentDisplayNameV1('protein')).toBe('Protein');
    expect(foodComponentDisplayNameV1('source.example.999')).toBe(
      'Additional source component',
    );
  });

  it('gives every supported canonical and USDA observation a human label', () => {
    for (const component of FOOD_COMPONENTS_V1) {
      expect(foodComponentDisplayNameV1(component.componentId)).toBe(
        component.name,
      );
      for (const sourceId of component.usdaFdcNutrientIds) {
        expect(foodComponentDisplayNameV1(`source.usda-fdc.${sourceId}`)).toBe(
          component.name,
        );
      }
    }
  });
});
