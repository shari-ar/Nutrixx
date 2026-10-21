import { describe, expect, it } from 'vitest';

import {
  ACTIVE_FOOD_CATALOG,
  validateActiveFoodCatalog,
} from './active-food-catalog';

describe('active food catalog descriptor', () => {
  it('pins the distributed multi-source artifact', () => {
    expect(ACTIVE_FOOD_CATALOG.releaseId).toBe('food-catalog-us-ca-au-2026.1');
    expect(ACTIVE_FOOD_CATALOG.artifactSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('requires exact release filenames, digests, and delivery for reviewed releases', () => {
    expect(() =>
      validateActiveFoodCatalog({
        ...ACTIVE_FOOD_CATALOG,
        artifactName: '../unverified.gz',
      }),
    ).toThrow(/invalid/);
    expect(() =>
      validateActiveFoodCatalog({
        ...ACTIVE_FOOD_CATALOG,
        candidateId: 'a'.repeat(64),
        reviewedClaimCount: 1,
      }),
    ).toThrow(/invalid/);
  });
});
