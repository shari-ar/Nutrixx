import * as z from 'zod';

import {
  CanonicalIdSchema,
  NonnegativeCanonicalDecimalSchema,
  UtcInstantSchema,
} from '@nutrixx/canonical-schema';

export const PLANNING_OUTCOME_FEEDBACK_VERSION_V1 =
  'planning-outcome-feedback-v1' as const;
export const PLANNING_CALIBRATION_VERSION_V1 =
  'planning-calibration-v1' as const;
export const PLANNING_CALIBRATION_MIN_FINALIZED_TRIALS_V1 = 30;

const PositiveCanonicalDecimalSchema = NonnegativeCanonicalDecimalSchema.refine(
  (value) => value !== '0',
  'The value must be positive.',
);
const ExactRatioSchema = z.strictObject({
  numerator: z.string().regex(/^(0|[1-9]\d*)$/),
  denominator: z.string().regex(/^[1-9]\d*$/),
});
const VersionSchema = z.string().trim().min(1).max(200);
const PlanningKeySchema = z.string().trim().min(1).max(1_000);

export const PlanningFeedbackTrialV1Schema = z
  .strictObject({
    format: z.literal('nutrixx.planning-feedback-trial'),
    schemaVersion: z.literal(1),
    feedbackVersion: z.literal(PLANNING_OUTCOME_FEEDBACK_VERSION_V1),
    trialId: CanonicalIdSchema,
    subjectKey: CanonicalIdSchema,
    runId: CanonicalIdSchema,
    problemId: CanonicalIdSchema,
    stateKey: PlanningKeySchema,
    versions: z.strictObject({
      rankingPolicy: VersionSchema,
      domainModel: VersionSchema,
      domainAdapter: VersionSchema,
      independentValidator: VersionSchema,
    }),
    presentedAt: UtcInstantSchema,
    validUntil: UtcInstantSchema,
    comparableCandidateCount: z.int().positive(),
    recommended: z.strictObject({
      candidateKey: PlanningKeySchema,
      portionId: PlanningKeySchema,
      rank: z.literal(1),
      suggestedEdibleGrams: PositiveCanonicalDecimalSchema,
      score: ExactRatioSchema,
    }),
  })
  .superRefine((trial, context) => {
    if (Date.parse(trial.validUntil) <= Date.parse(trial.presentedAt))
      context.addIssue({
        code: 'custom',
        path: ['validUntil'],
        message: 'The trial validity boundary must follow presentation.',
      });
  });

const PlanningFeedbackEventBaseV1Schema = z.object({
  format: z.literal('nutrixx.planning-feedback-event'),
  schemaVersion: z.literal(1),
  feedbackVersion: z.literal(PLANNING_OUTCOME_FEEDBACK_VERSION_V1),
  eventId: CanonicalIdSchema,
  trialId: CanonicalIdSchema,
  subjectKey: CanonicalIdSchema,
  runId: CanonicalIdSchema,
  observedAt: UtcInstantSchema,
});

export const PlanningFeedbackEventV1Schema = z.discriminatedUnion('eventType', [
  PlanningFeedbackEventBaseV1Schema.extend({
    eventType: z.literal('SELECTED'),
    intentionId: CanonicalIdSchema,
    candidateKey: PlanningKeySchema,
    portionId: PlanningKeySchema,
    rank: z.int().positive(),
    suggestedEdibleGrams: PositiveCanonicalDecimalSchema,
  }).strict(),
  PlanningFeedbackEventBaseV1Schema.extend({
    eventType: z.literal('CONSUMED'),
    intentionId: CanonicalIdSchema,
    mealId: CanonicalIdSchema,
    candidateKey: PlanningKeySchema,
    portionId: PlanningKeySchema,
    consumedAt: UtcInstantSchema,
    actualEdibleGrams: PositiveCanonicalDecimalSchema,
  }).strict(),
  PlanningFeedbackEventBaseV1Schema.extend({
    eventType: z.literal('SUPERSEDED'),
    cause: z.literal('NEW_PLANNING_REQUEST'),
  }).strict(),
]);

const LifecycleCountsSchema = z.strictObject({
  PRESENTED: z.int().nonnegative(),
  SELECTED_PENDING: z.int().nonnegative(),
  CONSUMED: z.int().nonnegative(),
  FINALIZED_UNSELECTED: z.int().nonnegative(),
  FINALIZED_UNCONSUMED: z.int().nonnegative(),
});

export const PlanningCalibrationCohortV1Schema = z
  .strictObject({
    cohortKey: z.string().min(1),
    versions: PlanningFeedbackTrialV1Schema.shape.versions,
    firstPresentedAt: UtcInstantSchema,
    lastPresentedAt: UtcInstantSchema,
    evidenceStatus: z.enum(['COLLECTING', 'EVALUABLE']),
    requiredFinalizedTrials: z.int().positive(),
    trialCount: z.int().nonnegative(),
    finalizedTrialCount: z.int().nonnegative(),
    finalizedSelectedTrialCount: z.int().nonnegative(),
    consumedTrialCount: z.int().nonnegative(),
    topRecommendationSelectedCount: z.int().nonnegative(),
    lifecycleCounts: LifecycleCountsSchema,
    selectionRate: ExactRatioSchema.nullable(),
    followThroughRate: ExactRatioSchema.nullable(),
    topRecommendationSelectionRate: ExactRatioSchema.nullable(),
    meanReciprocalSelectedRank: ExactRatioSchema.nullable(),
    meanConsumedPortionRatio: ExactRatioSchema.nullable(),
  })
  .superRefine((cohort, context) => {
    if (cohort.firstPresentedAt > cohort.lastPresentedAt)
      context.addIssue({
        code: 'custom',
        path: ['firstPresentedAt'],
        message: 'Cohort presentation bounds must be chronological.',
      });
    const lifecycleTotal = Object.values(cohort.lifecycleCounts).reduce(
      (total, count) => total + count,
      0,
    );
    if (lifecycleTotal !== cohort.trialCount)
      context.addIssue({
        code: 'custom',
        path: ['lifecycleCounts'],
        message: 'Lifecycle counts must cover every trial.',
      });
    const finalizedFromLifecycle =
      cohort.lifecycleCounts.CONSUMED +
      cohort.lifecycleCounts.FINALIZED_UNSELECTED +
      cohort.lifecycleCounts.FINALIZED_UNCONSUMED;
    if (
      cohort.finalizedTrialCount !== finalizedFromLifecycle ||
      cohort.finalizedSelectedTrialCount !==
        cohort.lifecycleCounts.CONSUMED +
          cohort.lifecycleCounts.FINALIZED_UNCONSUMED ||
      cohort.consumedTrialCount !== cohort.lifecycleCounts.CONSUMED ||
      cohort.topRecommendationSelectedCount > cohort.finalizedSelectedTrialCount
    )
      context.addIssue({
        code: 'custom',
        path: ['finalizedTrialCount'],
        message: 'Calibration counts must agree with lifecycle evidence.',
      });
    const sameRatio = (
      left: { numerator: string; denominator: string } | null,
      right: { numerator: string; denominator: string } | null,
    ) =>
      left?.numerator === right?.numerator &&
      left?.denominator === right?.denominator;
    if (
      !sameRatio(
        cohort.selectionRate,
        countRatio(
          cohort.finalizedSelectedTrialCount,
          cohort.finalizedTrialCount,
        ),
      ) ||
      !sameRatio(
        cohort.followThroughRate,
        countRatio(
          cohort.consumedTrialCount,
          cohort.finalizedSelectedTrialCount,
        ),
      ) ||
      !sameRatio(
        cohort.topRecommendationSelectionRate,
        countRatio(
          cohort.topRecommendationSelectedCount,
          cohort.finalizedSelectedTrialCount,
        ),
      )
    )
      context.addIssue({
        code: 'custom',
        path: ['selectionRate'],
        message: 'Calibration rates must reproduce from cohort counts.',
      });
    if (
      cohort.evidenceStatus !==
      (cohort.finalizedTrialCount >= cohort.requiredFinalizedTrials
        ? 'EVALUABLE'
        : 'COLLECTING')
    )
      context.addIssue({
        code: 'custom',
        path: ['evidenceStatus'],
        message: 'Evidence status must follow the finalized sample count.',
      });
  });

export const PlanningCalibrationReportV1Schema = z.strictObject({
  format: z.literal('nutrixx.planning-calibration-report'),
  schemaVersion: z.literal(1),
  calibrationVersion: z.literal(PLANNING_CALIBRATION_VERSION_V1),
  generatedAt: UtcInstantSchema,
  automaticPolicyMutation: z.literal(false),
  cohorts: z.array(PlanningCalibrationCohortV1Schema),
});

export type PlanningFeedbackTrialV1 = z.infer<
  typeof PlanningFeedbackTrialV1Schema
>;
export type PlanningFeedbackEventV1 = z.infer<
  typeof PlanningFeedbackEventV1Schema
>;
export type PlanningCalibrationCohortV1 = z.infer<
  typeof PlanningCalibrationCohortV1Schema
>;
export type PlanningCalibrationReportV1 = z.infer<
  typeof PlanningCalibrationReportV1Schema
>;

type Fraction = readonly [bigint, bigint];
const ZERO: Fraction = [0n, 1n];

function divisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function fraction(numerator: bigint, denominator: bigint): Fraction {
  if (denominator === 0n) throw new TypeError('A ratio needs a denominator.');
  const sign = denominator < 0n ? -1n : 1n;
  const common = divisor(numerator, denominator);
  return [(numerator / common) * sign, (denominator / common) * sign];
}

function decimal(value: string): Fraction {
  const [whole, digits = ''] = value.split('.');
  return fraction(BigInt(`${whole}${digits}`), 10n ** BigInt(digits.length));
}

function plus(left: Fraction, right: Fraction): Fraction {
  return fraction(left[0] * right[1] + right[0] * left[1], left[1] * right[1]);
}

function dividedBy(left: Fraction, right: Fraction): Fraction {
  return fraction(left[0] * right[1], left[1] * right[0]);
}

function ratio(value: Fraction): { numerator: string; denominator: string } {
  return { numerator: String(value[0]), denominator: String(value[1]) };
}

function countRatio(numerator: number, denominator: number) {
  return denominator === 0
    ? null
    : ratio(fraction(BigInt(numerator), BigInt(denominator)));
}

function mean(values: readonly Fraction[]) {
  return values.length === 0
    ? null
    : ratio(
        dividedBy(
          values.reduce((total, value) => plus(total, value), ZERO),
          fraction(BigInt(values.length), 1n),
        ),
      );
}

type Lifecycle = keyof z.infer<typeof LifecycleCountsSchema>;

interface TrialProjection {
  readonly trial: PlanningFeedbackTrialV1;
  readonly selection?: Extract<
    PlanningFeedbackEventV1,
    { eventType: 'SELECTED' }
  >;
  readonly consumption?: Extract<
    PlanningFeedbackEventV1,
    { eventType: 'CONSUMED' }
  >;
  readonly superseded?: Extract<
    PlanningFeedbackEventV1,
    { eventType: 'SUPERSEDED' }
  >;
  readonly lifecycle: Lifecycle;
}

function projectTrials(
  rawTrials: readonly unknown[],
  rawEvents: readonly unknown[],
  asOf: string,
): readonly TrialProjection[] {
  const trials = rawTrials.map((trial) =>
    PlanningFeedbackTrialV1Schema.parse(trial),
  );
  const events = rawEvents.map((event) =>
    PlanningFeedbackEventV1Schema.parse(event),
  );
  if (new Set(trials.map(({ trialId }) => trialId)).size !== trials.length)
    throw new TypeError('Planning feedback trial identities must be unique.');
  if (new Set(events.map(({ eventId }) => eventId)).size !== events.length)
    throw new TypeError('Planning feedback event identities must be unique.');
  const eventsByTrial = new Map<string, PlanningFeedbackEventV1[]>();
  if (
    events.some(({ observedAt }) => Date.parse(observedAt) > Date.parse(asOf))
  )
    throw new TypeError('Calibration events must be observed by report time.');
  for (const event of events) {
    const related = eventsByTrial.get(event.trialId) ?? [];
    related.push(event);
    eventsByTrial.set(event.trialId, related);
  }
  const trialIds = new Set(trials.map(({ trialId }) => trialId));
  if (events.some(({ trialId }) => !trialIds.has(trialId)))
    throw new TypeError(
      'Every planning feedback event must resolve to a trial.',
    );

  return trials.map((trial) => {
    const related = eventsByTrial.get(trial.trialId) ?? [];
    if (
      related.some(
        (event) =>
          event.subjectKey !== trial.subjectKey || event.runId !== trial.runId,
      )
    )
      throw new TypeError('Feedback events must retain trial ownership.');
    const selections = related.filter(
      (
        event,
      ): event is Extract<PlanningFeedbackEventV1, { eventType: 'SELECTED' }> =>
        event.eventType === 'SELECTED',
    );
    const consumptions = related.filter(
      (
        event,
      ): event is Extract<PlanningFeedbackEventV1, { eventType: 'CONSUMED' }> =>
        event.eventType === 'CONSUMED',
    );
    const supersededEvents = related.filter(
      (
        event,
      ): event is Extract<
        PlanningFeedbackEventV1,
        { eventType: 'SUPERSEDED' }
      > => event.eventType === 'SUPERSEDED',
    );
    if (
      new Set(selections.map(({ intentionId }) => intentionId)).size !==
      selections.length
    )
      throw new TypeError('Selection intention identities must be unique.');
    if (consumptions.length > 1 || supersededEvents.length > 1)
      throw new TypeError(
        'A feedback trial accepts one terminal event per lifecycle step.',
      );
    const consumption = consumptions[0];
    const orderedSelections = [...selections].sort(
      (left, right) =>
        left.observedAt.localeCompare(right.observedAt) ||
        left.intentionId.localeCompare(right.intentionId),
    );
    const selection = consumption
      ? orderedSelections.find(
          ({ intentionId }) => intentionId === consumption.intentionId,
        )
      : orderedSelections.at(-1);
    const superseded = supersededEvents[0];
    if (
      selections.some(
        (event) =>
          event.rank > trial.comparableCandidateCount ||
          Date.parse(event.observedAt) < Date.parse(trial.presentedAt) ||
          (event.rank === 1 &&
            (event.candidateKey !== trial.recommended.candidateKey ||
              event.portionId !== trial.recommended.portionId)) ||
          (event.candidateKey === trial.recommended.candidateKey &&
            event.rank !== 1),
      )
    )
      throw new TypeError('The selected action must belong to the trial.');
    if (
      consumption &&
      (!selection ||
        consumption.intentionId !== selection.intentionId ||
        consumption.candidateKey !== selection.candidateKey ||
        consumption.portionId !== selection.portionId ||
        Date.parse(consumption.observedAt) < Date.parse(selection.observedAt) ||
        Date.parse(consumption.consumedAt) < Date.parse(trial.presentedAt) ||
        Date.parse(consumption.consumedAt) > Date.parse(consumption.observedAt))
    )
      throw new TypeError('Consumed feedback must resolve to its selection.');
    if (
      superseded &&
      (Date.parse(superseded.observedAt) < Date.parse(trial.presentedAt) ||
        selections.some(
          ({ observedAt }) =>
            Date.parse(observedAt) > Date.parse(superseded.observedAt),
        ) ||
        (consumption &&
          Date.parse(consumption.observedAt) >
            Date.parse(superseded.observedAt)))
    )
      throw new TypeError('Supersession must follow trial presentation.');
    const finalized =
      superseded !== undefined ||
      Date.parse(asOf) >= Date.parse(trial.validUntil);
    const lifecycle: Lifecycle = consumption
      ? 'CONSUMED'
      : selection
        ? finalized
          ? 'FINALIZED_UNCONSUMED'
          : 'SELECTED_PENDING'
        : finalized
          ? 'FINALIZED_UNSELECTED'
          : 'PRESENTED';
    return {
      trial,
      ...(selection ? { selection } : {}),
      ...(consumption ? { consumption } : {}),
      ...(superseded ? { superseded } : {}),
      lifecycle,
    };
  });
}

function cohortKey(trial: PlanningFeedbackTrialV1): string {
  return [
    trial.versions.rankingPolicy,
    trial.versions.domainModel,
    trial.versions.domainAdapter,
    trial.versions.independentValidator,
  ].join('|');
}

/** Builds observation-only calibration evidence from append-only decisions. */
export function buildPlanningCalibrationReportV1(input: {
  readonly trials: readonly unknown[];
  readonly events: readonly unknown[];
  readonly asOf: string;
}): PlanningCalibrationReportV1 {
  const asOf = UtcInstantSchema.parse(input.asOf);
  const projections = projectTrials(input.trials, input.events, asOf);
  const grouped = new Map<string, TrialProjection[]>();
  for (const projection of projections) {
    const key = cohortKey(projection.trial);
    const cohort = grouped.get(key) ?? [];
    cohort.push(projection);
    grouped.set(key, cohort);
  }
  const cohorts = [...grouped]
    .map(([key, cohort]): PlanningCalibrationCohortV1 => {
      const lifecycleCounts = {
        PRESENTED: 0,
        SELECTED_PENDING: 0,
        CONSUMED: 0,
        FINALIZED_UNSELECTED: 0,
        FINALIZED_UNCONSUMED: 0,
      } satisfies Record<Lifecycle, number>;
      cohort.forEach(({ lifecycle }) => lifecycleCounts[lifecycle]++);
      const finalized = cohort.filter(({ lifecycle }) =>
        ['CONSUMED', 'FINALIZED_UNSELECTED', 'FINALIZED_UNCONSUMED'].includes(
          lifecycle,
        ),
      );
      const finalizedSelected = finalized.filter(
        ({ selection }) => selection !== undefined,
      );
      const consumed = finalized.filter(
        ({ consumption }) => consumption !== undefined,
      );
      const topSelected = finalizedSelected.filter(
        ({ selection }) => selection?.rank === 1,
      );
      return PlanningCalibrationCohortV1Schema.parse({
        cohortKey: key,
        versions: cohort[0]!.trial.versions,
        firstPresentedAt: [...cohort].sort((left, right) =>
          left.trial.presentedAt.localeCompare(right.trial.presentedAt),
        )[0]!.trial.presentedAt,
        lastPresentedAt: [...cohort].sort((left, right) =>
          right.trial.presentedAt.localeCompare(left.trial.presentedAt),
        )[0]!.trial.presentedAt,
        evidenceStatus:
          finalized.length >= PLANNING_CALIBRATION_MIN_FINALIZED_TRIALS_V1
            ? 'EVALUABLE'
            : 'COLLECTING',
        requiredFinalizedTrials: PLANNING_CALIBRATION_MIN_FINALIZED_TRIALS_V1,
        trialCount: cohort.length,
        finalizedTrialCount: finalized.length,
        finalizedSelectedTrialCount: finalizedSelected.length,
        consumedTrialCount: consumed.length,
        topRecommendationSelectedCount: topSelected.length,
        lifecycleCounts,
        selectionRate: countRatio(finalizedSelected.length, finalized.length),
        followThroughRate: countRatio(
          consumed.length,
          finalizedSelected.length,
        ),
        topRecommendationSelectionRate: countRatio(
          topSelected.length,
          finalizedSelected.length,
        ),
        meanReciprocalSelectedRank: mean(
          finalizedSelected.map(({ selection }) =>
            fraction(1n, BigInt(selection!.rank)),
          ),
        ),
        meanConsumedPortionRatio: mean(
          consumed.map(({ selection, consumption }) =>
            dividedBy(
              decimal(consumption!.actualEdibleGrams),
              decimal(selection!.suggestedEdibleGrams),
            ),
          ),
        ),
      });
    })
    .sort(
      (left, right) =>
        left.lastPresentedAt.localeCompare(right.lastPresentedAt) ||
        left.cohortKey.localeCompare(right.cohortKey),
    );
  return PlanningCalibrationReportV1Schema.parse({
    format: 'nutrixx.planning-calibration-report',
    schemaVersion: 1,
    calibrationVersion: PLANNING_CALIBRATION_VERSION_V1,
    generatedAt: asOf,
    automaticPolicyMutation: false,
    cohorts,
  });
}
