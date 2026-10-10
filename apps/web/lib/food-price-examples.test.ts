import { describe, expect, it } from 'vitest';

import { exampleUsdPricePer100g } from './food-price-examples';

describe('illustrative food prices', () => {
  it('prices only exact foods from the pinned catalog release', () => {
    expect(
      exampleUsdPricePer100g(
        'food-catalog-usda-2026-04-30.1',
        '2f20cf47-a43c-5431-a46e-768e022d2901',
      ),
    ).toBe('0.4');
    expect(
      exampleUsdPricePer100g(
        'food-catalog-usda-2026-04-30.1',
        '6e34a3b2-34f1-5f33-a79f-29bf47c7753e',
      ),
    ).toBe('0.6');
    expect(
      exampleUsdPricePer100g(
        'food-catalog-usda-2026-04-30.1',
        'fb1c2e2b-c316-5307-a31e-1d4399c3062f',
      ),
    ).toBe('0.2');
    expect(
      exampleUsdPricePer100g(
        'a-new-release',
        '2f20cf47-a43c-5431-a46e-768e022d2901',
      ),
    ).toBeUndefined();
  });
});
