import { describe, expect, it } from 'vitest';

import {
  validateReferenceProposalV1,
  type ReferenceIntakeContextV1,
} from './intake.js';

const sourceDigest = 'a'.repeat(64);
const catalogDigest = 'b'.repeat(64);
const context: ReferenceIntakeContextV1 = {
  sourceSha256: sourceDigest,
  catalog: { releaseId: 'catalog-1', artifactSha256: catalogDigest },
  foodIds: new Set(['food-1']),
  components: [
    { componentId: 'nutrient.protein', unit: 'g' },
    { componentId: 'nutrient.vitamin-c', unit: 'mg' },
  ],
};

function proposal(claims: unknown[]): unknown {
  return {
    format: 'nutrixx.reference-proposal',
    schemaVersion: 1,
    catalog: context.catalog,
    source: {
      sourceId: 'source-1',
      title: 'Reference table',
      publisher: 'Example publisher',
      sourceUrl: 'https://example.org/table',
      licenseId: 'CC-BY-4.0',
      edition: '2026',
      retrievedAt: '2026-10-18T00:00:00.000Z',
      expectedSha256: sourceDigest,
    },
    extraction: {
      operatorId: 'operator-1',
      extractedAt: '2026-10-18T01:00:00.000Z',
      method: 'manual-transcription',
    },
    claims,
  };
}

const knownFood = {
  kind: 'food-composition',
  foodId: 'food-1',
  componentId: 'nutrient.protein',
  value: {
    state: 'known',
    amount: '0',
    unit: { system: 'ucum', code: 'g' },
    basis: 'per-100-gram-edible',
  },
  locator: 'Table 2, row 4',
};

describe('local reference proposal intake', () => {
  it('stages traceable claims across all reference domains for review', () => {
    const result = validateReferenceProposalV1(
      proposal([
        knownFood,
        {
          kind: 'cooking-retention',
          foodId: 'food-1',
          methodId: 'boiled',
          componentId: 'nutrient.vitamin-c',
          retainedFraction: '0.7',
          locator: 'Page 3, table 1',
        },
        {
          kind: 'cooking-yield',
          foodId: 'food-1',
          methodId: 'boiled',
          cookedToRawMassRatio: '1.25',
          locator: 'Page 5, line 2',
        },
        {
          kind: 'intake-reference',
          componentId: 'nutrient.vitamin-c',
          referenceType: 'RDA',
          sourceScope: 'all-intake',
          market: 'US',
          population: {
            minimumAgeYears: 19,
            maximumAgeYears: 50,
            physiologicalReference: 'female',
            lifeStage: 'adult',
          },
          value: { kind: 'point', amount: '75' },
          unit: { system: 'ucum', code: 'mg' },
          horizon: 'daily-average',
          locator: 'Page 6, table 2',
        },
      ]),
      context,
    );
    expect(result.proposed).toHaveLength(4);
    expect(result.quarantined).toEqual([]);
    expect(result.proposed[0]).toMatchObject({
      sourceSha256: sourceDigest,
      reviewStatus: 'pending-review',
      claim: { value: { amount: '0' } },
    });
  });

  it('quarantines invalid units, unknown IDs, missing evidence, and all duplicates', () => {
    const result = validateReferenceProposalV1(
      proposal([
        knownFood,
        knownFood,
        {
          ...knownFood,
          foodId: 'missing-food',
        },
        {
          ...knownFood,
          componentId: 'nutrient.unknown',
        },
        {
          ...knownFood,
          value: {
            ...knownFood.value,
            unit: { system: 'ucum', code: 'mg' },
          },
        },
        {
          ...knownFood,
          locator: '',
        },
      ]),
      context,
    );
    expect(result.proposed).toEqual([]);
    expect(result.quarantined.map((item) => item.index)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });

  it('rejects mismatched raw source identity for the whole proposal', () => {
    expect(() =>
      validateReferenceProposalV1(proposal([knownFood]), {
        ...context,
        sourceSha256: 'c'.repeat(64),
      }),
    ).toThrow(/source file digest/u);
  });

  it('quarantines incompatible reference semantics', () => {
    const result = validateReferenceProposalV1(
      proposal([
        {
          kind: 'intake-reference',
          componentId: 'nutrient.protein',
          referenceType: 'AMDR',
          sourceScope: 'all-intake',
          market: 'US',
          population: {
            minimumAgeYears: 19,
            maximumAgeYears: 50,
            physiologicalReference: 'any',
            lifeStage: 'adult',
          },
          value: { kind: 'point', amount: '10' },
          unit: { system: 'nutrixx', code: 'percent-energy' },
          horizon: 'energy-share',
          locator: 'Table 9',
        },
      ]),
      context,
    );
    expect(result.proposed).toEqual([]);
    expect(result.quarantined[0]?.reason).toMatch(/AMDR requires a range/u);
  });
});
