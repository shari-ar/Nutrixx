import { describe, expect, it } from 'vitest';

import {
  buildPlanningCalibrationReportV1,
  type PlanningFeedbackEventV1,
  type PlanningFeedbackTrialV1,
} from './planning-outcome-feedback.js';

const id = (value: number) =>
  `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;

function trial(number: number, policy = 'policy-v1'): PlanningFeedbackTrialV1 {
  return {
    format: 'nutrixx.planning-feedback-trial',
    schemaVersion: 1,
    feedbackVersion: 'planning-outcome-feedback-v1',
    trialId: id(number),
    subjectKey: id(900),
    runId: id(number + 100),
    problemId: id(number + 200),
    stateKey: `state:${number}`,
    versions: {
      rankingPolicy: policy,
      domainModel: 'domain-v1',
      domainAdapter: 'adapter-v1',
      independentValidator: 'validator-v1',
    },
    presentedAt: '2026-11-12T10:00:00.000Z',
    validUntil: '2026-11-12T10:15:00.000Z',
    comparableCandidateCount: 10,
    recommended: {
      candidateKey: `food:${number}`,
      portionId: `portion:${number}`,
      rank: 1,
      suggestedEdibleGrams: '100',
      score: { numerator: '1', denominator: '5' },
    },
  };
}

function selected(
  value: PlanningFeedbackTrialV1,
  rank: number,
): Extract<PlanningFeedbackEventV1, { eventType: 'SELECTED' }> {
  return {
    format: 'nutrixx.planning-feedback-event',
    schemaVersion: 1,
    feedbackVersion: 'planning-outcome-feedback-v1',
    eventId: id(Number(value.trialId.slice(-4)) + 400),
    trialId: value.trialId,
    subjectKey: value.subjectKey,
    runId: value.runId,
    observedAt: '2026-11-12T10:05:00.000Z',
    eventType: 'SELECTED',
    intentionId: id(Number(value.trialId.slice(-4)) + 500),
    candidateKey:
      rank === 1 ? value.recommended.candidateKey : `selected:${value.trialId}`,
    portionId:
      rank === 1
        ? value.recommended.portionId
        : `portion:selected:${value.trialId}`,
    rank,
    suggestedEdibleGrams: '100',
  };
}

describe('planning outcome feedback calibration', () => {
  it('measures finalized selection, follow-through, rank, and portion evidence', () => {
    const first = trial(1);
    const second = trial(2);
    const third = trial(3);
    const firstSelection = selected(first, 1);
    const secondSelection = selected(second, 2);
    const events: PlanningFeedbackEventV1[] = [
      firstSelection,
      {
        format: 'nutrixx.planning-feedback-event',
        schemaVersion: 1,
        feedbackVersion: 'planning-outcome-feedback-v1',
        eventId: id(601),
        trialId: first.trialId,
        subjectKey: first.subjectKey,
        runId: first.runId,
        observedAt: '2026-11-12T10:07:00.000Z',
        eventType: 'CONSUMED',
        intentionId: firstSelection.intentionId,
        mealId: id(701),
        candidateKey: firstSelection.candidateKey,
        portionId: firstSelection.portionId,
        consumedAt: '2026-11-12T10:06:00.000Z',
        actualEdibleGrams: '90',
      },
      secondSelection,
      {
        format: 'nutrixx.planning-feedback-event',
        schemaVersion: 1,
        feedbackVersion: 'planning-outcome-feedback-v1',
        eventId: id(602),
        trialId: second.trialId,
        subjectKey: second.subjectKey,
        runId: second.runId,
        observedAt: '2026-11-12T10:10:00.000Z',
        eventType: 'SUPERSEDED',
        cause: 'NEW_PLANNING_REQUEST',
      },
    ];

    const report = buildPlanningCalibrationReportV1({
      trials: [first, second, third],
      events,
      asOf: '2026-11-12T10:20:00.000Z',
    });

    expect(report.automaticPolicyMutation).toBe(false);
    expect(report.cohorts[0]).toMatchObject({
      evidenceStatus: 'COLLECTING',
      trialCount: 3,
      finalizedTrialCount: 3,
      finalizedSelectedTrialCount: 2,
      consumedTrialCount: 1,
      topRecommendationSelectedCount: 1,
      lifecycleCounts: {
        PRESENTED: 0,
        SELECTED_PENDING: 0,
        CONSUMED: 1,
        FINALIZED_UNSELECTED: 1,
        FINALIZED_UNCONSUMED: 1,
      },
      selectionRate: { numerator: '2', denominator: '3' },
      followThroughRate: { numerator: '1', denominator: '2' },
      topRecommendationSelectionRate: { numerator: '1', denominator: '2' },
      meanReciprocalSelectedRank: { numerator: '3', denominator: '4' },
      meanConsumedPortionRatio: { numerator: '9', denominator: '10' },
    });
  });

  it('keeps policy versions in separate calibration cohorts', () => {
    const report = buildPlanningCalibrationReportV1({
      trials: [trial(1, 'policy-a'), trial(2, 'policy-b')],
      events: [],
      asOf: '2026-11-12T10:20:00.000Z',
    });
    expect(
      report.cohorts.map(({ versions }) => versions.rankingPolicy),
    ).toEqual(['policy-a', 'policy-b']);
  });

  it('uses the final reselection and activates evaluation at the evidence floor', () => {
    const value = trial(1);
    const firstChoice = selected(value, 2);
    const finalChoice = {
      ...selected(value, 1),
      eventId: id(910),
      intentionId: id(911),
      observedAt: '2026-11-12T10:06:00.000Z',
    };
    const report = buildPlanningCalibrationReportV1({
      trials: [
        value,
        ...Array.from({ length: 29 }, (_, index) => trial(index + 2)),
      ],
      events: [firstChoice, finalChoice],
      asOf: '2026-11-12T10:20:00.000Z',
    });
    expect(report.cohorts[0]).toMatchObject({
      evidenceStatus: 'EVALUABLE',
      finalizedTrialCount: 30,
      finalizedSelectedTrialCount: 1,
      topRecommendationSelectedCount: 1,
      meanReciprocalSelectedRank: { numerator: '1', denominator: '1' },
    });
  });

  it('rejects duplicate lifecycle steps and mismatched consumption evidence', () => {
    const value = trial(1);
    const choice = selected(value, 1);
    expect(() =>
      buildPlanningCalibrationReportV1({
        trials: [value],
        events: [choice, { ...choice, eventId: id(999) }],
        asOf: '2026-11-12T10:20:00.000Z',
      }),
    ).toThrow('Selection intention identities must be unique');

    expect(() =>
      buildPlanningCalibrationReportV1({
        trials: [value],
        events: [
          choice,
          {
            format: 'nutrixx.planning-feedback-event',
            schemaVersion: 1,
            feedbackVersion: 'planning-outcome-feedback-v1',
            eventId: id(998),
            trialId: value.trialId,
            subjectKey: value.subjectKey,
            runId: value.runId,
            observedAt: '2026-11-12T10:07:00.000Z',
            eventType: 'CONSUMED',
            intentionId: id(997),
            mealId: id(996),
            candidateKey: choice.candidateKey,
            portionId: choice.portionId,
            consumedAt: '2026-11-12T10:06:00.000Z',
            actualEdibleGrams: '100',
          },
        ],
        asOf: '2026-11-12T10:20:00.000Z',
      }),
    ).toThrow('resolve to its selection');
  });
});
