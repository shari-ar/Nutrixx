import { describe, expect, it } from 'vitest';

import { ReviewedFoodIdentityResolverV1 } from './identity.js';
import type { FoodV1 } from './model.js';

const reviewed = {
  format: 'nutrixx.reviewed-food-identity-links',
  schemaVersion: 1,
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
    duplicate.groups.push(structuredClone(duplicate.groups[0]));
    expect(() => new ReviewedFoodIdentityResolverV1(duplicate)).toThrow(
      'Repeated reviewed food identity',
    );
    const inverted = structuredClone(reviewed);
    inverted.groups[0].members.reverse();
    expect(() => new ReviewedFoodIdentityResolverV1(inverted)).toThrow(
      'Invalid reviewed food identity',
    );
  });
});
