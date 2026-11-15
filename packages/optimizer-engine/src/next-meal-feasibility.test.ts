import { describe, expect, it } from 'vitest';

import { diagnoseNextMealFeasibilityV1 } from './next-meal-feasibility.js';

import type { NextMealCandidateDecision } from './next-meal-candidates.js';
import type { NextMealRankingResult } from './next-meal-ranking.js';

function result(
  unranked: readonly NextMealCandidateDecision[],
  counts: NextMealRankingResult['counts'],
): NextMealRankingResult {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return {
    policyVersion: 'next-meal-hierarchical-robust-v1',
    total,
    processed: total,
    counts,
    ranked: [],
    unranked,
  };
}

function blocked(
  candidateKey: string,
  classification: Exclude<
    NextMealCandidateDecision['classification'],
    'COMPARABLE'
  >,
  reasonCodes: readonly string[],
): NextMealCandidateDecision {
  return { candidateKey, classification, reasonCodes, supportedPortionIds: [] };
}

describe('next-meal feasibility diagnosis', () => {
  it('produces a compact deterministic conflict cover for missing evidence', () => {
    const diagnosis = diagnoseNextMealFeasibilityV1(
      result(
        [
          blocked('food:a', 'EVIDENCE_LIMITED', [
            'comparison-evidence-unresolved:nutrient.iron',
            'restriction-evidence-unresolved',
          ]),
          blocked('food:b', 'EVIDENCE_LIMITED', [
            'comparison-evidence-unresolved:nutrient.iron',
          ]),
        ],
        {
          COMPARABLE: 0,
          EVIDENCE_LIMITED: 2,
          UNAVAILABLE: 0,
          EXCLUDED: 0,
          REQUIRES_PREPARATION: 0,
        },
      ),
    );

    expect(diagnosis).toMatchObject({
      status: 'NEEDS_INPUT',
      conflictSet: {
        reasonCodes: ['comparison-evidence-unresolved:nutrient.iron'],
        coveredCandidateCount: 2,
        complete: true,
      },
    });
    expect(diagnosis.findings[0]).toMatchObject({
      resolution: 'CURATE_REFERENCE_DATA',
      candidateCount: 2,
      candidateKeys: ['food:a', 'food:b'],
    });
  });

  it('proves infeasibility across independent hard blockers', () => {
    const diagnosis = diagnoseNextMealFeasibilityV1(
      result(
        [
          blocked('food:a', 'EXCLUDED', ['excluded-allergen']),
          blocked('food:b', 'UNAVAILABLE', ['inventory-insufficient']),
        ],
        {
          COMPARABLE: 0,
          EVIDENCE_LIMITED: 0,
          UNAVAILABLE: 1,
          EXCLUDED: 1,
          REQUIRES_PREPARATION: 0,
        },
      ),
    );

    expect(diagnosis.status).toBe('INFEASIBLE');
    expect(diagnosis.conflictSet).toEqual({
      method: 'DETERMINISTIC_GREEDY_COVER',
      reasonCodes: ['excluded-allergen', 'inventory-insufficient'],
      coveredCandidateCount: 2,
      complete: true,
    });
  });

  it('routes an empty candidate corpus to a resolvable input requirement', () => {
    const diagnosis = diagnoseNextMealFeasibilityV1(
      result([], {
        COMPARABLE: 0,
        EVIDENCE_LIMITED: 0,
        UNAVAILABLE: 0,
        EXCLUDED: 0,
        REQUIRES_PREPARATION: 0,
      }),
    );

    expect(diagnosis).toMatchObject({
      status: 'NEEDS_INPUT',
      findings: [
        {
          reasonCode: 'candidate-corpus-empty',
          resolution: 'INSTALL_CANDIDATE_CORPUS',
          candidateCount: 0,
        },
      ],
      conflictSet: {
        reasonCodes: ['candidate-corpus-empty'],
        coveredCandidateCount: 0,
        complete: true,
      },
    });
  });
});
