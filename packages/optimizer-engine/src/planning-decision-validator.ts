import {
  PlanningDecisionChainV1Schema,
  type PlanningDecisionChainV1,
} from './planning-domain-model.js';
import { NEXT_MEAL_FEASIBILITY_DIAGNOSIS_VERSION_V1 } from './next-meal-feasibility.js';

export const PLANNING_DECISION_VALIDATOR_VERSION_V1 =
  'planning-independent-validator-v1' as const;

export type PlanningDecisionValidationReasonV1 =
  | 'invalid-decision-chain'
  | 'validator-version-mismatch'
  | 'diagnosis-version-mismatch'
  | 'diagnosis-classification-coverage-mismatch'
  | 'conflict-set-coverage-mismatch';

export type PlanningDecisionValidationV1 =
  | {
      readonly status: 'APPROVED';
      readonly validatorVersion: typeof PLANNING_DECISION_VALIDATOR_VERSION_V1;
      readonly chain: PlanningDecisionChainV1;
    }
  | {
      readonly status: 'REJECTED';
      readonly validatorVersion: typeof PLANNING_DECISION_VALIDATOR_VERSION_V1;
      readonly reasonCodes: readonly PlanningDecisionValidationReasonV1[];
    };

/**
 * Validates the published Decision Chain through a path independent from its
 * adapter and verifies the diagnostic proof against the complete census.
 */
export function validatePlanningDecisionChainV1(
  rawChain: unknown,
): PlanningDecisionValidationV1 {
  const parsed = PlanningDecisionChainV1Schema.safeParse(rawChain);
  if (!parsed.success)
    return {
      status: 'REJECTED',
      validatorVersion: PLANNING_DECISION_VALIDATOR_VERSION_V1,
      reasonCodes: ['invalid-decision-chain'],
    };
  const chain = parsed.data;
  const reasons = new Set<PlanningDecisionValidationReasonV1>();
  const diagnosis = chain.outcome.diagnosis;
  if (chain.outcome.validatorVersion !== PLANNING_DECISION_VALIDATOR_VERSION_V1)
    reasons.add('validator-version-mismatch');
  if (diagnosis.diagnosisVersion !== NEXT_MEAL_FEASIBILITY_DIAGNOSIS_VERSION_V1)
    reasons.add('diagnosis-version-mismatch');

  const keysByClassification = new Map<string, Set<string>>();
  const classificationByKey = new Map<string, string>();
  for (const finding of diagnosis.findings) {
    const keys =
      keysByClassification.get(finding.classification) ?? new Set<string>();
    for (const key of finding.candidateKeys) {
      const existing = classificationByKey.get(key);
      if (existing && existing !== finding.classification)
        reasons.add('diagnosis-classification-coverage-mismatch');
      classificationByKey.set(key, finding.classification);
      keys.add(key);
    }
    keysByClassification.set(finding.classification, keys);
  }
  for (const classification of [
    'EVIDENCE_LIMITED',
    'UNAVAILABLE',
    'EXCLUDED',
    'REQUIRES_PREPARATION',
  ] as const) {
    if (
      (keysByClassification.get(classification)?.size ?? 0) !==
      diagnosis.census.counts[classification]
    )
      reasons.add('diagnosis-classification-coverage-mismatch');
  }

  const findingByReason = new Map(
    diagnosis.findings.map((finding) => [finding.reasonCode, finding]),
  );
  const conflictCoverage = new Set<string>();
  diagnosis.conflictSet.reasonCodes.forEach((reasonCode) =>
    findingByReason
      .get(reasonCode)
      ?.candidateKeys.forEach((key) => conflictCoverage.add(key)),
  );
  if (
    conflictCoverage.size !== diagnosis.conflictSet.coveredCandidateCount ||
    (diagnosis.status !== 'READY' &&
      conflictCoverage.size !== diagnosis.census.total)
  )
    reasons.add('conflict-set-coverage-mismatch');

  return reasons.size > 0
    ? {
        status: 'REJECTED',
        validatorVersion: PLANNING_DECISION_VALIDATOR_VERSION_V1,
        reasonCodes: [...reasons],
      }
    : {
        status: 'APPROVED',
        validatorVersion: PLANNING_DECISION_VALIDATOR_VERSION_V1,
        chain,
      };
}
