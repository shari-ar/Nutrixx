import { createHash } from 'node:crypto';

import { CanonicalIdSchema, type CanonicalId } from '@nutrixx/canonical-schema';
import { describe, expect, it } from 'vitest';

import { deriveFoodCatalogManifestV1 } from './catalog.js';
import { auditFoodDataQualityV1 } from './data-quality-radar.js';
import {
  normalizeUsdaFoodDataCentralV1,
  type StagedUsdaFoodV1,
} from './usda-fooddata-central.js';

const NOW = '2026-10-14T00:00:00.000Z';
const proteinId = 'nutrient.protein';
const fatId = 'nutrient.total-fat';
const components = [
  {
    componentId: proteinId,
    accessCode: 'PROCNT',
    name: 'Protein',
    category: 'Macronutrient',
    kind: 'nutrient',
    unit: 'g',
    usdaFdcNutrientIds: ['1003'],
  },
  {
    componentId: fatId,
    accessCode: 'FAT',
    name: 'Total Fat',
    category: 'Macronutrient',
    kind: 'nutrient',
    unit: 'g',
    usdaFdcNutrientIds: ['1004'],
  },
  {
    componentId: 'nutrient.dietary-fiber',
    accessCode: 'FIBTG',
    name: 'Fiber',
    category: 'Carbohydrate',
    kind: 'nutrient',
    unit: 'g',
    usdaFdcNutrientIds: ['1079'],
  },
];

function idFor(
  kind: 'source' | 'food' | 'portion' | 'observation',
  value: string,
): CanonicalId {
  const hash = createHash('sha256').update(`${kind}:${value}`).digest('hex');
  return CanonicalIdSchema.parse(
    `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`,
  );
}

function fixture() {
  const staged: StagedUsdaFoodV1[] = [
    {
      fdcId: 1001,
      description: 'Recent food',
      preparationState: 'raw',
      source: {
        dataset: 'foundation',
        sourceRelease: '2026-04-30',
        retrievedAt: NOW,
      },
      portions: [
        {
          sourcePortionId: 'portion',
          description: 'One portion',
          amount: '1',
          measureUnitCode: '{item}',
          gramWeight: '100',
        },
      ],
      nutrients: [
        {
          sourceNutrientId: '1003',
          sourceNutrientName: 'Protein',
          nutrientId: proteinId,
          unitCode: 'g',
          amount: '0',
        },
        {
          sourceNutrientId: '1004',
          sourceNutrientName: 'Fat',
          nutrientId: fatId,
          unitCode: 'g',
          amount: '2',
        },
      ],
    },
    {
      fdcId: 2001,
      description: 'Older food',
      preparationState: 'raw',
      source: {
        dataset: 'sr-legacy',
        sourceRelease: '2018-04',
        retrievedAt: NOW,
      },
      portions: [],
      nutrients: [
        {
          sourceNutrientId: '1003',
          sourceNutrientName: 'Protein',
          nutrientId: proteinId,
          unitCode: 'g',
          unknownReason: 'not-measured',
        },
        {
          sourceNutrientId: '1004',
          sourceNutrientName: 'Fat',
          nutrientId: fatId,
          unitCode: 'g',
          amount: '2',
        },
      ],
    },
  ];
  const payload = normalizeUsdaFoodDataCentralV1(staged, idFor);
  const manifest = deriveFoodCatalogManifestV1(
    {
      format: 'nutrixx.food-catalog-manifest',
      schemaVersion: 1,
      releaseId: 'fixture-quality-radar',
      publishedAt: NOW,
      sourceDatasets: [
        {
          provider: 'usda-fdc',
          dataset: 'foundation',
          sourceRelease: '2026-04-30',
          licenseId: 'CC0-1.0',
          homepage: 'https://fdc.nal.usda.gov/',
        },
        {
          provider: 'usda-fdc',
          dataset: 'sr-legacy',
          sourceRelease: '2018-04',
          licenseId: 'CC0-1.0',
          homepage: 'https://fdc.nal.usda.gov/',
        },
      ],
      quality: {
        sourceEntries: 2,
        quarantinedEntries: 0,
        sourceComponents: 4,
        quarantinedComponents: 0,
        quarantineReasonCounts: {},
      },
    },
    payload,
  );
  return { payload, manifest };
}

describe('internal food data quality radar', () => {
  it('counts known zero, missing, explicit unknown, source age, and catalog-only rankability separately', () => {
    const report = auditFoodDataQualityV1({
      ...fixture(),
      components,
      baselineTargetIds: [proteinId, fatId],
      evaluatedAt: NOW,
    });
    expect(report.totalComponents).toBe(3);
    expect(report.latestFoods).toBe(2);
    expect(report.knownFoodComponentPairs).toBe(3);
    expect(report.coverageScore).toBe(50);
    expect(report.tracedObservations).toBe(3);
    expect(report.freshSourceObservations).toBe(2);
    expect(report.explicitlyGradedObservations).toBe(0);
    expect(report.catalogComparableFoodsForBaselineSet).toBe(1);
    expect(
      report.rows.find((row) => row.componentId === proteinId),
    ).toMatchObject({
      knownFoods: 1,
      explicitlyUnknownFoods: 1,
      foodsMissingKnownValue: 1,
      coverageScore: 50,
    });
    expect(report.rows.find((row) => row.accessCode === 'FIBTG')).toMatchObject(
      {
        knownFoods: 0,
        explicitlyUnknownFoods: 0,
        coverageScore: 0,
      },
    );
  });

  it('does not claim comparability when a target has no matching component', () => {
    const report = auditFoodDataQualityV1({
      ...fixture(),
      components,
      baselineTargetIds: [proteinId, 'nutrient.unmapped'],
      evaluatedAt: NOW,
    });
    expect(report.unmappedBaselineTargetIds).toEqual(['nutrient.unmapped']);
    expect(report.catalogComparableFoodsForBaselineSet).toBeNull();
  });
});
