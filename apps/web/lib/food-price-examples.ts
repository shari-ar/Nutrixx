// Illustrative USD prices for three exact foods in the pinned USDA catalog.
// They are product examples, not USDA facts or current market quotations.
const EXAMPLE_RELEASE_ID = 'food-catalog-usda-2026-04-30.1';

const EXAMPLE_USD_PER_100G: Readonly<Record<string, string>> = {
  '2f20cf47-a43c-5431-a46e-768e022d2901': '0.4', // Fuji apple, raw
  '6e34a3b2-34f1-5f33-a79f-29bf47c7753e': '0.6', // Whole egg, raw, fresh
  'fb1c2e2b-c316-5307-a31e-1d4399c3062f': '0.2', // Whole milk, no added vitamins
};

export function exampleUsdPricePer100g(
  releaseId: string,
  foodId: string,
): string | undefined {
  return releaseId === EXAMPLE_RELEASE_ID
    ? EXAMPLE_USD_PER_100G[foodId]
    : undefined;
}
