import { describe, expect, it } from 'vitest';

import {
  buildReferenceProjectionV1,
  selectReviewedClaimsV1,
} from './release-candidate.js';

const hash = 'a'.repeat(64);
const staged = [
  {
    claimKey: 'food-composition/food-1/nutrient.protein',
    claim: {
      kind: 'food-composition' as const,
      foodId: 'food-1',
      componentId: 'nutrient.protein',
      value: {
        state: 'known' as const,
        amount: '0',
        unit: { system: 'ucum' as const, code: 'g' },
        basis: 'per-100-gram-edible' as const,
      },
      locator: 'Table 1, row 1',
    },
    sourceId: 'source-1',
    sourceSha256: hash,
    reviewStatus: 'pending-review' as const,
  },
];
const review = {
  format: 'nutrixx.reference-review',
  schemaVersion: 1,
  runId: hash,
  reviewerId: 'reviewer-1',
  reviewedAt: '2026-10-18T00:00:00.000Z',
  decisions: [
    {
      claimKey: staged[0]!.claimKey,
      disposition: 'accepted',
      rationale: 'Evidence and license inspected.',
      checks: { sourceEvidence: true, usageRights: true, unitsAndMethod: true },
    },
  ],
};

describe('reviewed reference candidate', () => {
  it('preserves known zero and provenance in a deterministic projection', () => {
    const accepted = selectReviewedClaimsV1(hash, staged, review);
    const first = buildReferenceProjectionV1(
      { releaseId: 'catalog-1', sha256: hash },
      hash,
      accepted,
    );
    const second = buildReferenceProjectionV1(
      { releaseId: 'catalog-1', sha256: hash },
      hash,
      accepted,
    );
    expect(first).toEqual(second);
    expect(first.foodIndex['food-1']).toEqual({ start: 0, count: 1 });
    expect(first.foodComposition[0]).toMatchObject({
      value: { state: 'known', amount: '0' },
      provenance: {
        sourceId: 'source-1',
        sourceSha256: hash,
        reviewerId: 'reviewer-1',
      },
    });
  });

  it('requires exact run identity, complete decisions, and positive checks', () => {
    expect(() =>
      selectReviewedClaimsV1('b'.repeat(64), staged, review),
    ).toThrow(/another staged run/u);
    expect(() =>
      selectReviewedClaimsV1(hash, staged, { ...review, decisions: [] }),
    ).toThrow(/exactly one/u);
    expect(() =>
      selectReviewedClaimsV1(hash, staged, {
        ...review,
        decisions: [
          {
            ...review.decisions[0],
            checks: { ...review.decisions[0]!.checks, usageRights: false },
          },
        ],
      }),
    ).toThrow();
  });

  it('retains rejected claims outside the calculation projection', () => {
    const accepted = selectReviewedClaimsV1(hash, staged, {
      ...review,
      decisions: [
        {
          claimKey: staged[0]!.claimKey,
          disposition: 'rejected',
          rationale: 'Unit evidence is incomplete.',
        },
      ],
    });
    expect(accepted).toEqual([]);
  });
});
