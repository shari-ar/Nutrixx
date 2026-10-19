import { describe, expect, it } from 'vitest';

import {
  REFERENCE_GAP_PRIORITY_POLICY_V1,
  ReferenceGapV1Schema,
  prioritizeReferenceGapsV1,
  referenceGapKeyV1,
  type ReferenceGapV1,
} from './priority.js';

const digest = 'a'.repeat(64);
const corpusDigest = 'b'.repeat(64);

function foodGap(
  foodId: string,
  impact: ReferenceGapV1['impact'],
): ReferenceGapV1 {
  return {
    subject: {
      kind: 'food-composition',
      foodId,
      componentId: 'nutrient.potassium',
    },
    deficiency: 'absent',
    detectedIn: { releaseId: 'catalog-1', artifactSha256: digest },
    impact,
    safety: { level: 'routine' },
  };
}

function impact(affectedCases: number, blockedCases: number) {
  return {
    corpusId: 'next-meal-corpus-1',
    corpusSha256: corpusDigest,
    evaluatedCases: 100,
    affectedCases,
    blockedCases,
  };
}

describe('reference gap priority contract', () => {
  it('ranks measured cross-domain gaps by blocked and affected decisions', () => {
    const potato = foodGap('potato', impact(80, 20));
    const eggplantYield: ReferenceGapV1 = {
      ...foodGap('eggplant', impact(40, 2)),
      subject: {
        kind: 'cooking-yield',
        foodId: 'eggplant',
        methodId: 'roast',
      },
    };
    const rows = prioritizeReferenceGapsV1([eggplantYield, potato]);
    expect(REFERENCE_GAP_PRIORITY_POLICY_V1.policyId).toBe(
      'reference-gap-priority-v1',
    );
    expect(rows.map((row) => row.gapKey)).toEqual([
      referenceGapKeyV1(potato),
      referenceGapKeyV1(eggplantYield),
    ]);
    expect(rows.map((row) => row.score)).toEqual([38, 13]);
    expect(rows.every((row) => row.band === 'measured')).toBe(true);
  });

  it('keeps absent impact evidence unmeasured rather than calling it zero', () => {
    const measuredZero = foodGap('potato', impact(0, 0));
    const unknown = foodGap('eggplant', null);
    const rows = prioritizeReferenceGapsV1([unknown, measuredZero]);
    expect(rows.map((row) => [row.band, row.score])).toEqual([
      ['measured', 0],
      ['unmeasured', null],
    ]);
  });

  it('places an evidenced critical safety concern before measured coverage', () => {
    const safety: ReferenceGapV1 = {
      ...foodGap('eggplant', null),
      safety: {
        level: 'critical',
        rationale: 'A missing upper reference could affect a hard constraint.',
        evidenceId: 'review-42',
      },
    };
    const rows = prioritizeReferenceGapsV1([
      foodGap('potato', impact(100, 100)),
      safety,
    ]);
    expect(rows.map((row) => row.band)).toEqual(['critical', 'measured']);
    expect(rows[0]?.score).toBeNull();
  });

  it('rejects fabricated denominators, incompatible corpora, and duplicates', () => {
    expect(() =>
      ReferenceGapV1Schema.parse(foodGap('potato', impact(5, 6))),
    ).toThrow();
    expect(() =>
      ReferenceGapV1Schema.parse(
        foodGap('potato', { ...impact(1, 0), evaluatedCases: 0 }),
      ),
    ).toThrow();
    expect(() =>
      prioritizeReferenceGapsV1([
        foodGap('potato', impact(1, 0)),
        foodGap('eggplant', {
          ...impact(1, 0),
          corpusSha256: 'c'.repeat(64),
        }),
      ]),
    ).toThrow('one pinned corpus');
    expect(() =>
      prioritizeReferenceGapsV1([
        foodGap('potato', impact(1, 0)),
        foodGap('eggplant', { ...impact(1, 0), evaluatedCases: 50 }),
      ]),
    ).toThrow('one pinned corpus');
    expect(() =>
      prioritizeReferenceGapsV1([
        foodGap('potato', impact(1, 0)),
        foodGap('potato', impact(2, 0)),
      ]),
    ).toThrow('Duplicate reference gap');
  });

  it('creates a stable key when source release evidence changes', () => {
    const first = foodGap('potato', null);
    const second = {
      ...first,
      detectedIn: { releaseId: 'catalog-2', artifactSha256: 'd'.repeat(64) },
    };
    expect(referenceGapKeyV1(first)).toBe(referenceGapKeyV1(second));
  });

  it('keeps distinct intake reference types and source scopes separate', () => {
    const base: ReferenceGapV1 = {
      ...foodGap('potato', null),
      subject: {
        kind: 'intake-reference',
        componentId: 'nutrient.calcium',
        referenceType: 'RDA',
        sourceScope: 'all-intake',
        populationId: 'adult-female-31-50',
        market: 'US',
      },
    };
    const upper: ReferenceGapV1 = {
      ...base,
      subject: {
        kind: 'intake-reference',
        componentId: 'nutrient.calcium',
        referenceType: 'UL',
        sourceScope: 'fortified-and-supplemental',
        populationId: 'adult-female-31-50',
        market: 'US',
      },
    };
    expect(referenceGapKeyV1(base)).not.toBe(referenceGapKeyV1(upper));
    expect(prioritizeReferenceGapsV1([base, upper])).toHaveLength(2);
  });
});
