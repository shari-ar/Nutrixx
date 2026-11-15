import {
  PlanningFeasibilityDiagnosisV1Schema,
  type PlanningFeasibilityDiagnosisV1,
} from './planning-domain-model.js';

import type { NextMealCandidateClassification } from './next-meal-candidates.js';
import type { NextMealRankingResult } from './next-meal-ranking.js';

export const NEXT_MEAL_FEASIBILITY_DIAGNOSIS_VERSION_V1 =
  'next-meal-feasibility-diagnosis-v1' as const;

type FindingClassification = Exclude<
  NextMealCandidateClassification,
  'COMPARABLE'
>;
type Resolution =
  PlanningFeasibilityDiagnosisV1['findings'][number]['resolution'];

function resolutionFor(reasonCode: string): Resolution {
  if (reasonCode.startsWith('history-evidence-unresolved:'))
    return 'COMPLETE_HISTORY';
  if (
    reasonCode.startsWith('comparison-evidence-unresolved:') ||
    reasonCode.startsWith('hard-limit-evidence-unresolved:') ||
    reasonCode === 'restriction-evidence-unresolved'
  )
    return 'CURATE_REFERENCE_DATA';
  if (reasonCode === 'edible-portion-unresolved') return 'RESOLVE_PREPARATION';
  if (reasonCode === 'inventory-insufficient') return 'UPDATE_INVENTORY';
  if (reasonCode.startsWith('excluded-')) return 'REVIEW_RESTRICTIONS';
  if (reasonCode.startsWith('hard-limit-exceeded:')) return 'REVIEW_HARD_LIMIT';
  if (reasonCode === 'candidate-corpus-empty')
    return 'INSTALL_CANDIDATE_CORPUS';
  return 'EXPAND_SEARCH';
}

function statusFor(
  ranking: NextMealRankingResult,
): PlanningFeasibilityDiagnosisV1['status'] {
  if (ranking.ranked.length > 0) return 'READY';
  return ranking.total === 0 ||
    ranking.counts.EVIDENCE_LIMITED > 0 ||
    ranking.counts.REQUIRES_PREPARATION > 0
    ? 'NEEDS_INPUT'
    : 'INFEASIBLE';
}

interface FindingAccumulator {
  readonly classification: FindingClassification;
  readonly candidateKeys: Set<string>;
}

/**
 * Produces a deterministic, complete explanation of why a full-census result
 * is ready, needs evidence, or has no feasible candidate under current facts.
 */
export function diagnoseNextMealFeasibilityV1(
  ranking: NextMealRankingResult,
): PlanningFeasibilityDiagnosisV1 {
  const status = statusFor(ranking);
  const grouped = new Map<string, FindingAccumulator>();
  const reasonsByCandidate = new Map<string, Set<string>>();
  for (const candidate of ranking.unranked) {
    if (candidate.classification === 'COMPARABLE')
      throw new TypeError('An unranked candidate cannot be comparable.');
    const reasonCodes =
      candidate.reasonCodes.length > 0
        ? candidate.reasonCodes
        : ['unclassified-blocker'];
    reasonsByCandidate.set(candidate.candidateKey, new Set(reasonCodes));
    for (const reasonCode of reasonCodes) {
      const existing = grouped.get(reasonCode);
      if (existing && existing.classification !== candidate.classification)
        throw new TypeError(
          `Feasibility reason ${reasonCode} has inconsistent classifications.`,
        );
      const finding = existing ?? {
        classification: candidate.classification,
        candidateKeys: new Set<string>(),
      };
      finding.candidateKeys.add(candidate.candidateKey);
      grouped.set(reasonCode, finding);
    }
  }
  if (ranking.total === 0)
    grouped.set('candidate-corpus-empty', {
      classification: 'UNAVAILABLE',
      candidateKeys: new Set(),
    });

  const findings = [...grouped]
    .map(([reasonCode, finding]) => {
      const candidateKeys = [...finding.candidateKeys].sort();
      return {
        reasonCode,
        classification: finding.classification,
        resolution: resolutionFor(reasonCode),
        candidateCount: candidateKeys.length,
        candidateKeys,
      };
    })
    .sort(
      (left, right) =>
        right.candidateCount - left.candidateCount ||
        left.reasonCode.localeCompare(right.reasonCode),
    );

  const conflictReasons: string[] = [];
  const uncovered = new Set(
    status === 'READY'
      ? []
      : ranking.unranked.map(({ candidateKey }) => candidateKey),
  );
  if (status !== 'READY' && ranking.total === 0) {
    conflictReasons.push('candidate-corpus-empty');
  } else {
    while (uncovered.size > 0) {
      const next = findings
        .map((finding) => ({
          finding,
          coverage: finding.candidateKeys.filter((key) => uncovered.has(key))
            .length,
        }))
        .filter(({ coverage }) => coverage > 0)
        .sort(
          (left, right) =>
            right.coverage - left.coverage ||
            left.finding.reasonCode.localeCompare(right.finding.reasonCode),
        )[0];
      if (!next) break;
      conflictReasons.push(next.finding.reasonCode);
      next.finding.candidateKeys.forEach((key) => uncovered.delete(key));
    }
  }

  return PlanningFeasibilityDiagnosisV1Schema.parse({
    diagnosisVersion: NEXT_MEAL_FEASIBILITY_DIAGNOSIS_VERSION_V1,
    status,
    census: {
      complete: true,
      total: ranking.total,
      processed: ranking.processed,
      counts: ranking.counts,
    },
    findings,
    conflictSet: {
      method: 'DETERMINISTIC_GREEDY_COVER',
      reasonCodes: conflictReasons,
      coveredCandidateCount:
        status === 'READY' ? 0 : ranking.total - uncovered.size,
      complete: uncovered.size === 0,
    },
  });
}
