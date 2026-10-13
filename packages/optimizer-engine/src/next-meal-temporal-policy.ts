import * as z from 'zod';

import {
  CanonicalCodeSchema,
  UnitV1Schema,
  UtcInstantSchema,
} from '@nutrixx/canonical-schema';

export const NEXT_MEAL_TEMPORAL_POLICY_SCHEMA_VERSION_V1 = 1 as const;

const CitationSchema = z.strictObject({
  authority: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  edition: z.string().min(1).max(100),
  url: z.url(),
  relevantSection: z.string().min(1).max(200),
});

const WindowSchema = z.discriminatedUnion('basis', [
  z.strictObject({
    basis: z.literal('nutrition-day'),
    periodCount: z.int().positive().max(366),
  }),
  z.strictObject({
    basis: z.literal('elapsed-time'),
    durationHours: z.int().positive().max(8784),
  }),
  z.strictObject({
    basis: z.literal('usual-intake'),
    periodCount: z.int().positive().max(366),
  }),
]);

export const NextMealTemporalPolicyRuleV1Schema = z
  .strictObject({
    ruleId: CanonicalCodeSchema,
    ruleVersion: z.string().min(1).max(128),
    nutrientId: CanonicalCodeSchema,
    populationKey: CanonicalCodeSchema,
    reference: z.strictObject({
      type: CanonicalCodeSchema,
      releaseId: z.string().min(1).max(200),
      ruleId: CanonicalCodeSchema,
      citation: CitationSchema,
    }),
    unit: UnitV1Schema,
    sourceScope: CanonicalCodeSchema,
    window: WindowSchema,
    aggregation: z.enum(['sum', 'mean-per-nutrition-day']),
    minimumKnownMeals: z.int().nonnegative(),
    earlyHistoryTreatment: z.enum(['provisional-comparison', 'omit-rule']),
    horizonCitation: CitationSchema,
    intendedUse: z.literal('next-meal-dietary-planning'),
    limitations: z.string().min(1).max(1000),
  })
  .superRefine((rule, context) => {
    if (rule.window.basis === 'elapsed-time' && rule.aggregation !== 'sum') {
      context.addIssue({
        code: 'custom',
        path: ['aggregation'],
        message: 'Elapsed-time windows use a whole-window sum.',
      });
    }
    if (
      (rule.window.basis === 'usual-intake' ||
        (rule.window.basis === 'nutrition-day' &&
          rule.window.periodCount > 1)) &&
      rule.aggregation !== 'mean-per-nutrition-day'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['aggregation'],
        message: 'Multi-day reference windows use a daily mean.',
      });
    }
  });

export const NextMealTemporalPolicyReleaseV1Schema = z
  .strictObject({
    schemaVersion: z.literal(NEXT_MEAL_TEMPORAL_POLICY_SCHEMA_VERSION_V1),
    releaseId: z.string().min(1).max(200),
    policyVersion: z.string().min(1).max(128),
    effectiveAt: UtcInstantSchema,
    intakeCompletenessAssumption: z.literal('user-logs-all-consumption'),
    unrecordedIntakeTreatment: z.literal('unknown-no-imputation'),
    physiologicalStatusClaim: z.literal('none'),
    rules: z.array(NextMealTemporalPolicyRuleV1Schema).min(1),
  })
  .superRefine((release, context) => {
    const ids = new Set<string>();
    for (const [index, rule] of release.rules.entries()) {
      if (ids.has(rule.ruleId)) {
        context.addIssue({
          code: 'custom',
          path: ['rules', index, 'ruleId'],
          message: 'Temporal rule IDs must be unique within a release.',
        });
      }
      ids.add(rule.ruleId);
    }
  });

export type NextMealTemporalPolicyReleaseV1 = z.infer<
  typeof NextMealTemporalPolicyReleaseV1Schema
>;

export const NextMealTemporalHistoryEvidenceV1Schema = z
  .strictObject({
    windowStartInclusive: UtcInstantSchema,
    windowEndExclusive: UtcInstantSchema,
    trackingStartedAt: UtcInstantSchema,
    knownMealCount: z.int().nonnegative(),
    unresolvedMealCount: z.int().nonnegative(),
  })
  .superRefine((evidence, context) => {
    if (
      Date.parse(evidence.windowStartInclusive) >=
      Date.parse(evidence.windowEndExclusive)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['windowEndExclusive'],
        message: 'The comparison window must have a positive duration.',
      });
    }
    if (
      Date.parse(evidence.trackingStartedAt) >
      Date.parse(evidence.windowEndExclusive)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['trackingStartedAt'],
        message: 'Tracking must begin by the comparison window end.',
      });
    }
  });

export type NextMealTemporalHistoryEvidenceV1 = z.infer<
  typeof NextMealTemporalHistoryEvidenceV1Schema
>;

export type NextMealTemporalHistoryDecisionV1 =
  | 'FULL_HORIZON_AVAILABLE'
  | 'PROVISIONAL_SHORT_HISTORY'
  | 'OMIT_SHORT_HISTORY'
  | 'INSUFFICIENT_RECORDED_INTAKE'
  | 'UNRESOLVED_COMPOSITION';

export const NextMealAppliedTemporalRuleV1Schema = z
  .strictObject({
    ruleId: CanonicalCodeSchema,
    decision: z.enum(['FULL_HORIZON_AVAILABLE', 'PROVISIONAL_SHORT_HISTORY']),
    configuredWindowStartInclusive: UtcInstantSchema,
    appliedWindowStartInclusive: UtcInstantSchema,
    windowEndExclusive: UtcInstantSchema,
  })
  .superRefine((applied, context) => {
    const configured = Date.parse(applied.configuredWindowStartInclusive);
    const start = Date.parse(applied.appliedWindowStartInclusive);
    const end = Date.parse(applied.windowEndExclusive);
    if (
      configured > start ||
      start >= end ||
      (applied.decision === 'FULL_HORIZON_AVAILABLE' && configured !== start) ||
      (applied.decision === 'PROVISIONAL_SHORT_HISTORY' && configured === start)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['appliedWindowStartInclusive'],
        message: 'Applied rule boundaries must match the history decision.',
      });
    }
  });

export type NextMealAppliedTemporalRuleV1 = z.infer<
  typeof NextMealAppliedTemporalRuleV1Schema
>;

/** Classifies recorded evidence; tracking age is not proof that every meal was logged. */
export function assessNextMealTemporalHistoryV1(
  rule: z.infer<typeof NextMealTemporalPolicyRuleV1Schema>,
  evidence: NextMealTemporalHistoryEvidenceV1,
): NextMealTemporalHistoryDecisionV1 {
  const checkedRule = NextMealTemporalPolicyRuleV1Schema.parse(rule);
  const checkedEvidence =
    NextMealTemporalHistoryEvidenceV1Schema.parse(evidence);
  if (checkedEvidence.unresolvedMealCount > 0) return 'UNRESOLVED_COMPOSITION';
  if (checkedEvidence.knownMealCount < checkedRule.minimumKnownMeals)
    return 'INSUFFICIENT_RECORDED_INTAKE';
  if (
    Date.parse(checkedEvidence.trackingStartedAt) <=
    Date.parse(checkedEvidence.windowStartInclusive)
  )
    return 'FULL_HORIZON_AVAILABLE';
  return checkedRule.earlyHistoryTreatment === 'provisional-comparison'
    ? 'PROVISIONAL_SHORT_HISTORY'
    : 'OMIT_SHORT_HISTORY';
}
