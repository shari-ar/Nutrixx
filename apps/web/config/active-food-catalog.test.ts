import { describe, expect, it } from 'vitest';

import {
  ACTIVE_FOOD_CATALOG,
  validateActiveFoodCatalog,
} from './active-food-catalog';

describe('active food catalog descriptor', () => {
  it('pins one valid catalog artifact', () => {
    expect(ACTIVE_FOOD_CATALOG.releaseId).toMatch(/^[a-z0-9][a-z0-9.-]+$/);
    expect(ACTIVE_FOOD_CATALOG.artifactSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('requires exact filenames and state-consistent delivery URLs', () => {
    expect(() =>
      validateActiveFoodCatalog({
        ...ACTIVE_FOOD_CATALOG,
        artifactName: '../unverified.gz',
      }),
    ).toThrow(/invalid/);
    expect(() =>
      validateActiveFoodCatalog({
        ...ACTIVE_FOOD_CATALOG,
        artifactUrl: 'https://example.test/catalog.gz',
        receiptUrl: null,
      }),
    ).toThrow(/invalid/);
  });
});
