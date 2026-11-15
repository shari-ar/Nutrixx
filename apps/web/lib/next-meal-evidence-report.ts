import {
  JsonValueSchema,
  canonicalizeJson,
  type JsonValue,
} from '@nutrixx/canonical-schema';
import { nextMealSourceKey } from '@nutrixx/optimizer-engine';
import { sha256Canonical } from '@nutrixx/persistence-indexeddb';

import type { NextMealDisplayRunV1 } from './next-meal-display-cache';
import type {
  NextMealCandidateExplanationV1,
  NextMealCompactRankingResultV1,
} from '@nutrixx/optimizer-engine';

const NEXT_MEAL_EVIDENCE_REPORT_FORMAT_V1 =
  'nutrixx.next-meal-evidence-report' as const;

type DigestSha256Hex = (canonicalInput: string) => Promise<string>;

export interface NextMealEvidenceReportV1 {
  readonly format: typeof NEXT_MEAL_EVIDENCE_REPORT_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly payload: JsonValue;
  readonly integrity: {
    readonly algorithm: 'sha-256';
    readonly canonicalization: 'rfc8785';
    readonly value: string;
  };
}

function jsonValue(value: unknown): JsonValue {
  return JsonValueSchema.parse(JSON.parse(JSON.stringify(value)));
}

export async function createNextMealEvidenceReportV1(
  input: {
    readonly run: NextMealDisplayRunV1;
    readonly row: NextMealCompactRankingResultV1['ranked'][number];
    readonly explanation: NextMealCandidateExplanationV1;
    readonly generatedAt?: string;
  },
  digest: DigestSha256Hex = sha256Canonical,
): Promise<NextMealEvidenceReportV1> {
  const candidate = input.run.input.candidates.entries.find(
    (entry) => nextMealSourceKey(entry.reference) === input.row.candidateKey,
  );
  if (!candidate)
    throw new TypeError('The ranked candidate evidence is unavailable.');

  const policies = new Map(
    input.run.temporalPolicy.rules.map((rule) => [rule.ruleId, rule]),
  );
  const scoredRules = new Map(
    input.run.input.temporalRules.map((rule) => [rule.ruleId, rule]),
  );
  const appliedRules = new Map(
    input.run.appliedTemporalRules.map((rule) => [rule.ruleId, rule]),
  );
  const payload = jsonValue({
    decision: {
      requestedAt: input.run.input.candidates.requestedAt,
      validUntil: input.run.validUntil,
      planningPolicy: input.run.input.planningPolicy,
      candidate: {
        candidateKey: input.row.candidateKey,
        reference: candidate.reference,
        displayName: input.explanation.displayName,
        rank: input.row.rank,
        exactCombinedGap: input.row.score,
        portionId: input.explanation.portionId ?? null,
        edibleGrams: input.explanation.edibleGrams ?? null,
        rankReason: input.explanation.rankReason ?? null,
      },
    },
    assumptions: {
      intakeLogComplete: true,
      scope: 'recorded-dietary-intake',
      bodyNutrientStoresMeasured: false,
      onlyNextMealActionable: true,
    },
    evidence: (input.explanation.comparisons ?? []).map((fact) => {
      const policy = policies.get(fact.ruleId);
      const scoredRule = scoredRules.get(fact.ruleId);
      const appliedRule = appliedRules.get(fact.ruleId);
      const composition = candidate.nutrientsPer100EdibleGrams.find(
        (item) => item.nutrientId === fact.nutrientId,
      );
      return {
        ruleId: fact.ruleId,
        nutrientId: fact.nutrientId,
        calculation: {
          recordedAmount: fact.recordedAmount,
          projectedAmount: fact.projectedAmount,
          targetAmount: fact.targetAmount,
          unit: fact.unit,
          targetMode: fact.targetMode,
          normalizedDistance: fact.normalizedDistance,
          weight: scoredRule?.weight ?? null,
        },
        observationWindow: {
          startInclusive: fact.windowStartInclusive,
          endExclusive: fact.windowEndExclusive,
          application: appliedRule ?? null,
          acceptedMealIds: [...fact.acceptedMealIds].sort(),
        },
        targetReference: policy?.reference ?? null,
        windowReference: policy?.horizonCitation ?? null,
        policy: policy
          ? {
              ruleVersion: policy.ruleVersion,
              aggregation: policy.aggregation,
              window: policy.window,
              limitations: policy.limitations,
              referenceType: fact.referenceType,
              referenceReleaseId: fact.referenceReleaseId,
            }
          : null,
        foodComposition:
          composition?.state === 'known'
            ? {
                state: composition.state,
                amountPer100EdibleGrams: composition.amountPer100EdibleGrams,
                unit: composition.unit,
                source: composition.source,
              }
            : {
                state: 'unknown',
                reasonCode:
                  composition?.state === 'unknown'
                    ? composition.reasonCode
                    : 'composition-not-in-display-evidence',
              },
      };
    }),
  });
  const content = jsonValue({
    format: NEXT_MEAL_EVIDENCE_REPORT_FORMAT_V1,
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    payload,
  }) as Extract<JsonValue, Record<string, JsonValue>>;
  const value = await digest(canonicalizeJson(content));
  return {
    format: NEXT_MEAL_EVIDENCE_REPORT_FORMAT_V1,
    schemaVersion: 1,
    generatedAt: String(content['generatedAt']),
    payload,
    integrity: {
      algorithm: 'sha-256',
      canonicalization: 'rfc8785',
      value,
    },
  };
}

export async function verifyNextMealEvidenceReportV1(
  report: NextMealEvidenceReportV1,
  digest: DigestSha256Hex = sha256Canonical,
): Promise<boolean> {
  if (
    report.format !== NEXT_MEAL_EVIDENCE_REPORT_FORMAT_V1 ||
    report.schemaVersion !== 1 ||
    report.integrity.algorithm !== 'sha-256' ||
    report.integrity.canonicalization !== 'rfc8785'
  )
    return false;
  const content = jsonValue({
    format: report.format,
    schemaVersion: report.schemaVersion,
    generatedAt: report.generatedAt,
    payload: report.payload,
  });
  return (await digest(canonicalizeJson(content))) === report.integrity.value;
}

export function serializeNextMealEvidenceReportV1(
  report: NextMealEvidenceReportV1,
): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function nextMealEvidenceReportFileName(
  report: NextMealEvidenceReportV1,
  displayName: string,
): string {
  const safeName = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `nutrixx-next-meal-evidence-${safeName || 'candidate'}-${report.generatedAt.slice(0, 10)}.json`;
}
