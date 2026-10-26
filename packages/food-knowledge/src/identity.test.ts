import { describe, expect, it } from 'vitest';

import {
  NUTRIXX_FALLBACK_PROVIDER_V1,
  ReviewedFoodIdentityResolverV1,
  compareFoodSourcePriorityV1,
} from './identity.js';
import type { FoodV1 } from './model.js';

const reviewed = {
  format: 'nutrixx.reviewed-food-identity-links',
  schemaVersion: 1,
  sourceOrder: [
    'usda-fdc',
    'health-canada',
    'fsanz',
    'public-health-england',
    'anses-ciqual',
  ],
  pending: [],
  groups: [
    {
      name: 'Basil, fresh',
      members: [
        {
          provider: 'usda-fdc',
          sourceRecordId: '100',
          sourceName: 'Basil, fresh',
        },
        {
          provider: 'public-health-england',
          sourceRecordId: '13-804',
          sourceName: 'Basil, fresh',
        },
        {
          provider: 'anses-ciqual',
          sourceRecordId: '11033',
          sourceName: 'Basil, fresh',
        },
      ],
    },
  ],
};

function food(foodId: string): FoodV1 {
  return {
    foodId,
    revision: 1,
    foodClass: 'usda-fdc.food',
    descriptions: [{ locale: 'en', value: 'Basil, fresh', kind: 'primary' }],
    categories: [],
    preparationStates: ['unspecified'],
    sourceId: 'source-id',
  };
}

describe('reviewed cross-source food identity', () => {
  it('resolves later sources to the first source identity', () => {
    const resolver = new ReviewedFoodIdentityResolverV1(reviewed);
    const primary = food('usda-food');
    expect(
      resolver.resolve('public-health-england', '13-804', 'Basil, fresh'),
    ).toBeNull();
    resolver.register('usda-fdc', '100', 'Basil, fresh', primary);
    expect(
      resolver.resolve('public-health-england', '13-804', 'Basil, fresh'),
    ).toBe(primary);
    resolver.register(
      'public-health-england',
      '13-804',
      'Basil, fresh',
      primary,
    );
    resolver.register('anses-ciqual', '11033', 'Basil, fresh', primary);
    expect(resolver.assertComplete()).toEqual({
      reviewedGroups: 1,
      reviewedSourceRecords: 3,
    });
  });

  it('rejects a changed description, a conflicting official link, and a missing source', () => {
    const resolver = new ReviewedFoodIdentityResolverV1(reviewed);
    const primary = food('usda-food');
    resolver.register('usda-fdc', '100', 'Basil, fresh', primary);
    expect(() =>
      resolver.resolve('public-health-england', '13-804', 'Basil, dried'),
    ).toThrow('description changed');
    expect(() =>
      resolver.register(
        'public-health-england',
        '13-804',
        'Basil, fresh',
        food('different-food'),
      ),
    ).toThrow('Conflicting reviewed food identity');
    expect(() => resolver.assertComplete()).toThrow(
      'Unresolved reviewed food identity',
    );
  });

  it('rejects ambiguous source identities and an inverted source order', () => {
    const duplicate = structuredClone(reviewed);
    const firstGroup = duplicate.groups[0];
    if (!firstGroup) throw new Error('The fixture requires an identity group.');
    duplicate.groups.push(structuredClone(firstGroup));
    expect(() => new ReviewedFoodIdentityResolverV1(duplicate)).toThrow(
      'Repeated reviewed food identity',
    );
    const inverted = structuredClone(reviewed);
    const invertedGroup = inverted.groups[0];
    if (!invertedGroup)
      throw new Error('The fixture requires an identity group.');
    invertedGroup.members.reverse();
    expect(() => new ReviewedFoodIdentityResolverV1(inverted)).toThrow(
      'Invalid reviewed food identity',
    );
  });

  it('allows multiple ordered records from one provider', () => {
    const sameProvider = structuredClone(reviewed);
    sameProvider.groups[0]?.members.splice(1, 0, {
      provider: 'usda-fdc',
      sourceRecordId: '101',
      sourceName: 'Basil, fresh',
    });
    const resolver = new ReviewedFoodIdentityResolverV1(sameProvider);
    const primary = food('usda-food');
    resolver.register('usda-fdc', '100', 'Basil, fresh', primary);
    expect(resolver.resolve('usda-fdc', '101', 'Basil, fresh')).toBe(primary);
  });

  it('keeps ambiguous identities separate from reviewed links', () => {
    const withPending = {
      ...structuredClone(reviewed),
      pending: [
        {
          provider: 'health-canada',
          sourceRecordId: 'pending-1',
          sourceName: 'Basil, unspecified',
          reason: 'Preparation state is ambiguous.',
          candidateSourceRecords: [
            {
              provider: 'usda-fdc',
              sourceRecordId: '100',
              sourceName: 'Basil, fresh',
            },
          ],
        },
      ],
    };
    const resolver = new ReviewedFoodIdentityResolverV1(withPending);

    expect(
      resolver.pendingIdentity(
        'health-canada',
        'pending-1',
        'Basil, unspecified',
      ),
    ).toMatchObject({ reason: 'Preparation state is ambiguous.' });
    expect(
      resolver.resolve('health-canada', 'pending-1', 'Basil, unspecified'),
    ).toBeNull();
  });

  it('keeps reviewed policy valid when a provider is removed', () => {
    const resolver = new ReviewedFoodIdentityResolverV1(reviewed);
    resolver.register('usda-fdc', '100', 'Basil, fresh', food('usda-food'));

    expect(resolver.assertComplete(new Set(['usda-fdc']))).toEqual({
      reviewedGroups: 1,
      reviewedSourceRecords: 1,
    });
  });
});

describe('food source priority', () => {
  it('keeps every current and future external source ahead of Nutrixx', () => {
    expect(
      compareFoodSourcePriorityV1(
        'future-external-provider',
        NUTRIXX_FALLBACK_PROVIDER_V1,
        reviewed.sourceOrder,
      ),
    ).toBeLessThan(0);
    expect(
      compareFoodSourcePriorityV1(
        NUTRIXX_FALLBACK_PROVIDER_V1,
        'future-external-provider',
        reviewed.sourceOrder,
      ),
    ).toBeGreaterThan(0);
  });

  it('retains the declared external-source order', () => {
    expect(
      compareFoodSourcePriorityV1(
        'usda-fdc',
        'health-canada',
        reviewed.sourceOrder,
      ),
    ).toBeLessThan(0);
  });

  it('derives additions and removals entirely from policy data', () => {
    const changed = ['usda-fdc', 'new-provider', 'anses-ciqual'];
    expect(
      compareFoodSourcePriorityV1('new-provider', 'anses-ciqual', changed),
    ).toBeLessThan(0);
    expect(
      compareFoodSourcePriorityV1(
        'anses-ciqual',
        NUTRIXX_FALLBACK_PROVIDER_V1,
        changed,
      ),
    ).toBeLessThan(0);
  });
});
