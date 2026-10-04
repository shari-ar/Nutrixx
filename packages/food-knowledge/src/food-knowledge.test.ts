import { createHash } from 'node:crypto';

import { CanonicalIdSchema, type CanonicalId } from '@nutrixx/canonical-schema';
import {
  IndexedDbReferenceDatasetCache,
  sha256Canonical,
} from '@nutrixx/persistence-indexeddb';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import {
  CachedFoodKnowledgeRepositoryV1,
  FoodCatalogIndexV1,
  createFoodCatalogReleaseV1,
  deriveFoodCatalogManifestV1,
} from './catalog.js';
import { FoodCatalogPayloadV1Schema } from './model.js';
import {
  normalizeRawUsdaFoodDataCentralV1,
  normalizeUsdaFoodDataCentralV1,
  type StagedUsdaFoodV1,
} from './usda-fooddata-central.js';

const NOW = '2026-10-04T10:00:00.000Z';
const SOURCE_RELEASE = 'fixture-2026-10-04';

function deterministicId(
  kind: 'source' | 'food' | 'portion' | 'observation',
  sourceId: string,
): CanonicalId {
  const value = createHash('sha256')
    .update(`${kind}:${sourceId}`, 'utf8')
    .digest('hex');
  return CanonicalIdSchema.parse(
    `${value.slice(0, 8)}-${value.slice(8, 12)}-5${value.slice(13, 16)}-a${value.slice(17, 20)}-${value.slice(20, 32)}`,
  );
}

function stagedFoods(): readonly StagedUsdaFoodV1[] {
  return [
    {
      fdcId: 1001,
      description: 'Apple, raw',
      preparationState: 'raw',
      source: {
        dataset: 'foundation',
        sourceRelease: SOURCE_RELEASE,
        retrievedAt: NOW,
      },
      portions: [
        {
          sourcePortionId: 'medium',
          description: '1 medium apple',
          amount: '1',
          measureUnitCode: '{item}',
          gramWeight: '182',
        },
      ],
      nutrients: [
        {
          sourceNutrientId: 'sugar',
          sourceNutrientName: 'Total Sugars',
          nutrientId: 'nutrient.sugars-total',
          unitCode: 'g',
          amount: '0',
        },
        {
          sourceNutrientId: 'vitamin-d',
          sourceNutrientName: 'Vitamin D',
          nutrientId: 'nutrient.vitamin-d',
          unitCode: 'ug',
          unknownReason: 'not-measured',
        },
      ],
    },
    {
      fdcId: 2001,
      description: 'Rice, white, cooked',
      preparationState: 'cooked.boiled',
      source: {
        dataset: 'sr-legacy',
        sourceRelease: SOURCE_RELEASE,
        retrievedAt: NOW,
      },
      portions: [
        {
          sourcePortionId: 'cup',
          description: '1 cup',
          amount: '1',
          measureUnitCode: 'cup_us',
          gramWeight: '158',
        },
      ],
      nutrients: [
        {
          sourceNutrientId: 'protein',
          sourceNutrientName: 'Protein',
          nutrientId: 'nutrient.protein',
          unitCode: 'g',
          amount: '2.69',
        },
      ],
    },
  ];
}

function fixturePayload() {
  return normalizeUsdaFoodDataCentralV1(stagedFoods(), deterministicId);
}

function fixtureManifest(payload = fixturePayload()) {
  return deriveFoodCatalogManifestV1(
    {
      format: 'nutrixx.food-catalog-manifest',
      schemaVersion: 1,
      releaseId: 'food-catalog-fixture-2026-10-04',
      publishedAt: NOW,
      sourceDatasets: [
        {
          provider: 'usda-fdc',
          dataset: 'foundation',
          sourceRelease: SOURCE_RELEASE,
          licenseId: 'CC0-1.0',
          homepage: 'https://fdc.nal.usda.gov/',
        },
        {
          provider: 'usda-fdc',
          dataset: 'sr-legacy',
          sourceRelease: SOURCE_RELEASE,
          licenseId: 'CC0-1.0',
          homepage: 'https://fdc.nal.usda.gov/',
        },
      ],
      quality: {
        sourceEntries: 2,
        quarantinedEntries: 0,
        sourceComponents: 5,
        quarantinedComponents: 0,
        quarantineReasonCounts: {},
      },
    },
    payload,
  );
}

describe('Food Knowledge foundation', () => {
  it('normalizes source provenance and preserves measured zero apart from unknown', () => {
    const payload = fixturePayload();
    expect(payload.foods).toHaveLength(2);
    expect(payload.sources[0]).toMatchObject({
      provider: 'usda-fdc',
      licenseId: 'CC0-1.0',
      sourceRecordId: '1001',
    });
    expect(payload.composition[0]?.value).toEqual({
      state: 'known',
      amount: '0',
      unit: { system: 'ucum', code: 'g' },
      basis: 'per-100-gram-edible',
    });
    expect(payload.composition[1]?.value).toEqual({
      state: 'unknown',
      reason: 'not-measured',
    });
  });

  it('normalizes valid raw variants and quarantines unsafe source values', () => {
    const result = normalizeRawUsdaFoodDataCentralV1(
      [
        null,
        {
          fdcId: 3001,
          foodClass: 'FinalFood',
          description: 'Golden test food',
          foodNutrients: [
            {
              id: 1,
              nutrient: {
                id: 1008,
                number: '208',
                name: 'Energy',
                unitName: 'kcal',
              },
              amount: 1.29e3,
              dataPoints: 0,
            },
            {
              id: 2,
              nutrient: {
                id: 1003,
                number: '   ',
                name: 'Protein',
                unitName: 'g',
              },
              amount: null,
            },
            {
              id: 3,
              nutrient: {
                id: 1005,
                number: '205',
                name: 'Carbohydrate, by difference',
                unitName: 'g',
              },
              amount: -0.1,
            },
          ],
          foodPortions: [
            {
              id: 10,
              amount: 1,
              modifier: '   ',
              gramWeight: 28,
              measureUnit: { name: 'serving', abbreviation: 'serving' },
            },
            {
              id: 11,
              amount: 0,
              modifier: 'invalid source portion',
              gramWeight: 28,
              measureUnit: { name: 'serving', abbreviation: 'serving' },
            },
          ],
        },
      ],
      {
        dataset: 'foundation',
        sourceRelease: SOURCE_RELEASE,
        retrievedAt: NOW,
        idFor: deterministicId,
      },
    );
    expect(result.report).toEqual({
      sourceEntries: 2,
      quarantinedEntries: 1,
      sourceComponents: 5,
      quarantinedComponents: 2,
      quarantineReasonCounts: {
        'negative-nutrient-amount': 1,
        'nonpositive-portion-amount': 1,
        'null-source-entry': 1,
      },
    });
    expect(result.payload.composition.map(({ value }) => value)).toEqual([
      {
        state: 'known',
        amount: '1290',
        unit: { system: 'ucum', code: 'kcal' },
        basis: 'per-100-gram-edible',
      },
      { state: 'unknown', reason: 'not-provided' },
    ]);
    expect(result.payload.composition[1]).not.toHaveProperty(
      'sourceNutrientNumber',
    );
    expect(result.payload.portions).toMatchObject([
      {
        description: { value: 'serving' },
        amount: '1',
        gramWeight: '28',
      },
    ]);
  });

  it('rejects broken food-revision relationships and duplicate identities', () => {
    const payload = fixturePayload();
    expect(() =>
      FoodCatalogPayloadV1Schema.parse({
        ...payload,
        portions: [
          ...payload.portions,
          {
            ...payload.portions[0],
            foodId: deterministicId('food', 'missing'),
          },
        ],
      }),
    ).toThrow();
  });

  it('derives release counts and deterministic coverage', () => {
    const payload = fixturePayload();
    const manifest = fixtureManifest(payload);
    expect(manifest.counts).toEqual({
      sources: 2,
      foods: 2,
      portions: 2,
      compositionObservations: 3,
    });
    expect(manifest.coverage).toEqual({
      foodsWithPortions: '1',
      foodsWithComposition: '1',
      observationsWithKnownValues: '0.666667',
    });
  });

  it('ranks localized exact and prefix matches deterministically', () => {
    const payload = fixturePayload();
    const first = payload.foods[0];
    if (first === undefined) throw new Error('The fixture requires a food.');
    const catalog = new FoodCatalogIndexV1({
      ...payload,
      foods: [
        {
          ...first,
          descriptions: [
            ...first.descriptions,
            { locale: 'es', value: 'Manzana', kind: 'primary' },
          ],
        },
        ...payload.foods.slice(1),
      ],
    });
    expect(catalog.search('manz', { locale: 'es' })).toMatchObject([
      {
        matchedDescription: { locale: 'es', value: 'Manzana' },
        match: 'prefix',
      },
    ]);
    expect(catalog.getFood(first.foodId)?.foodId).toBe(first.foodId);
    expect(catalog.listPortions(first.foodId, first.revision)).toHaveLength(1);
  });

  it('loads an integrity-checked active release through the IndexedDB cache', async () => {
    const indexedDB = new IDBFactory();
    const cache = await IndexedDbReferenceDatasetCache.create({
      databaseName: `nutrixx-food-catalog-${deterministicId('food', 'cache')}`,
      indexedDB,
      now: () => NOW,
      deleteOnClose: true,
    });
    const payload = fixturePayload();
    const release = await createFoodCatalogReleaseV1({
      manifest: fixtureManifest(payload),
      payload,
      hash: sha256Canonical,
    });
    await cache.putRelease(release);
    await cache.activateRelease(release.releaseId);

    const repository = new CachedFoodKnowledgeRepositoryV1(cache);
    const catalog = await repository.loadActiveCatalog();
    expect(catalog.search('apple')).toMatchObject([
      {
        matchedDescription: { value: 'Apple, raw' },
        match: 'prefix',
      },
    ]);
    await cache.close();
  });
});
