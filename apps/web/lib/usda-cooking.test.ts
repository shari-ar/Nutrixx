import { describe, expect, it } from 'vitest';

import {
  estimateUsdaFinalWeight,
  inferCookingMethod,
  suggestUsdaCooking,
  usdaCookingMethodsCompatible,
  usdaFoodGroupFromCategory,
  usdaRetentionFactors,
  usdaRetentionOptions,
  usdaYieldFactor,
  usdaYieldOptions,
} from './usda-cooking';
import crosswalk from './usda-ndb-crosswalk.json';

const chicken = {
  name: 'Chicken, broilers or fryers, meat only, raw',
  preparationState: 'unspecified',
  usdaFoodGroup: '05',
  sourceNdbNumber: '05062',
  nutrients: [
    { nutrientId: 'source.usda-fdc.1162', sourceNutrientNumber: '401' },
    { nutrientId: 'source.usda-fdc.1003', sourceNutrientNumber: '203' },
  ],
} as const;

const beef = {
  name: 'Beef, bottom sirloin, tri-tip roast, separable lean and fat, trimmed to 0" fat, all grades, raw',
  preparationState: 'unspecified',
  usdaFoodGroup: '13',
  sourceNdbNumber: '13954',
  nutrients: [
    { nutrientId: 'source.usda-fdc.1162', sourceNutrientNumber: '401' },
  ],
} as const;

describe('USDA cooking references', () => {
  it('resolves source FDC IDs to their distinct SR Legacy NDB numbers', () => {
    expect(crosswalk.fdcToNdb['168734']).toBe('13954');
    expect(crosswalk.fdcToNdb['169703']).toBe('20036');
  });

  it('maps SR Legacy food groups and exact raw-food treatments', () => {
    expect(usdaFoodGroupFromCategory('Poultry Products')).toBe('05');
    expect(usdaRetentionOptions(chicken)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: '0801' })]),
    );
    expect(usdaRetentionFactors(chicken, '0801')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nutrientId: 'source.usda-fdc.1162',
          factor: '0.8',
          rule: { component: 'usda-retention-0801', version: '6-2007' },
        }),
      ]),
    );
  });

  it('uses the matching USDA meat yield and preserves its row provenance', () => {
    expect(usdaYieldOptions(beef)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: '2' })]),
    );
    expect(usdaYieldFactor(beef, '2')).toEqual({
      factor: '0.84',
      rule: { component: 'usda-cooking-yield-2', version: '2-2014' },
    });
    expect(usdaCookingMethodsCompatible(beef, '0601', '2')).toBe(true);
    expect(usdaCookingMethodsCompatible(beef, '0602', '2')).toBe(false);
    expect(inferCookingMethod(['Roast the beef for 40 minutes.'])).toBe(
      'roast',
    );
    expect(suggestUsdaCooking(beef, 'roast')).toEqual({
      treatmentCode: '0601',
      yieldRowId: '2',
    });
    expect(
      estimateUsdaFinalWeight([{ gramWeight: '150', yieldFactor: '0.84' }]),
    ).toBe('126');
    expect(() => estimateUsdaFinalWeight([{ gramWeight: '150' }])).toThrow();
  });

  it('supports curated USDA Handbook 102 yields above 100 percent', () => {
    const rice = {
      name: 'Rice, brown, long-grain, raw',
      preparationState: 'unspecified',
      usdaFoodGroup: '20',
      sourceNdbNumber: '20036',
    };
    expect(usdaYieldOptions(rice)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'ah102-2196', factor: '3.35' }),
      ]),
    );
    expect(usdaYieldFactor(rice, 'ah102-2196')).toEqual({
      factor: '3.35',
      rule: { component: 'usda-yield-ah102-2196', version: '1975' },
    });
    expect(
      estimateUsdaFinalWeight([{ gramWeight: '100', yieldFactor: '3.35' }]),
    ).toBe('335');
    expect(
      suggestUsdaCooking(rice, inferCookingMethod(['Boil the rice in water.'])),
    ).toEqual({ yieldRowId: 'ah102-2196' });
    expect(suggestUsdaCooking(rice, 'roast')).toEqual({});
    expect(
      usdaCookingMethodsCompatible(
        {
          ...rice,
          nutrients: [{ nutrientId: 'vitamin-c', sourceNutrientNumber: '401' }],
        },
        '0432',
        'ah102-2196',
      ),
    ).toBe(true);
    expect(usdaYieldOptions({ ...rice, sourceNdbNumber: '99999' })).toEqual([]);
  });

  it('rejects cooked foods and mismatched treatments or cuts', () => {
    expect(
      usdaRetentionOptions({ ...chicken, name: 'Chicken, cooked' }),
    ).toEqual([]);
    expect(usdaYieldOptions({ ...beef, preparationState: 'cooked' })).toEqual(
      [],
    );
    expect(() => usdaRetentionFactors(chicken, '3301')).toThrow();
    expect(() => usdaYieldFactor(chicken, '2')).toThrow();
  });
});
