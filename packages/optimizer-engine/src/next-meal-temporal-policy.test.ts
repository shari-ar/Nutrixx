import { describe, expect, it } from 'vitest';

import {
  NextMealTemporalPolicyReleaseV1Schema,
  assessNextMealTemporalHistoryV1,
} from './next-meal-temporal-policy.js';

const citation = {
  authority: 'Fixture authority',
  title: 'Fixture planning reference',
  edition: '1',
  url: 'https://example.org/reference',
  relevantSection: 'Planning comparisons',
};

function release() {
  return {
    schemaVersion: 1,
    releaseId: 'fixture-temporal-release',
    policyVersion: 'fixture-v1',
    effectiveAt: '2026-10-13T00:00:00.000Z',
    intakeCompletenessAssumption: 'user-logs-all-consumption',
    unrecordedIntakeTreatment: 'unknown-no-imputation',
    physiologicalStatusClaim: 'none',
    rules: [
      {
        ruleId: 'fixture-iron-planning',
        ruleVersion: 'fixture-v1',
        nutrientId: 'nutrient.iron',
        populationKey: 'fixture-adult',
        reference: {
          type: 'rda',
          releaseId: 'fixture-reference-release',
          ruleId: 'fixture-rda-iron',
          citation,
        },
        unit: { system: 'ucum', code: 'mg' },
        sourceScope: 'all-intake',
        window: { basis: 'nutrition-day', periodCount: 3 },
        aggregation: 'mean-per-nutrition-day',
        minimumKnownMeals: 1,
        earlyHistoryTreatment: 'provisional-comparison',
        horizonCitation: citation,
        intendedUse: 'next-meal-dietary-planning',
        limitations:
          'Fixture only; this window is not an active nutrition rule.',
      },
    ],
  };
}

describe('versioned next-meal temporal policy contract', () => {
  it('keeps reference and horizon evidence distinct and accepts provisional startup history', () => {
    const parsed = NextMealTemporalPolicyReleaseV1Schema.parse(release());
    expect(parsed.rules[0]?.minimumKnownMeals).toBe(1);
    expect(parsed.rules[0]?.earlyHistoryTreatment).toBe(
      'provisional-comparison',
    );
  });

  it('requires explicit no-imputation and no-body-status semantics', () => {
    expect(
      NextMealTemporalPolicyReleaseV1Schema.safeParse({
        ...release(),
        unrecordedIntakeTreatment: 'zero',
      }).success,
    ).toBe(false);
    expect(
      NextMealTemporalPolicyReleaseV1Schema.safeParse({
        ...release(),
        physiologicalStatusClaim: 'measured',
      }).success,
    ).toBe(false);
  });

  it('rejects unsupported or internally inconsistent horizon metadata', () => {
    const original = release();
    const rule = original.rules[0]!;
    for (const changedRule of [
      { ...rule, horizonCitation: undefined },
      { ...rule, window: { basis: 'elapsed-time', durationHours: 0 } },
      { ...rule, minimumKnownMeals: -1 },
      { ...rule, aggregation: 'sum' },
      {
        ...rule,
        window: { basis: 'elapsed-time', durationHours: 24 },
      },
    ]) {
      expect(
        NextMealTemporalPolicyReleaseV1Schema.safeParse({
          ...original,
          rules: [changedRule],
        }).success,
      ).toBe(false);
    }
  });

  it('requires one stable identity for each rule in a release', () => {
    const original = release();
    expect(
      NextMealTemporalPolicyReleaseV1Schema.safeParse({
        ...original,
        rules: [original.rules[0], original.rules[0]],
      }).success,
    ).toBe(false);
  });

  it('keeps a short but known startup history eligible only when the rule allows it', () => {
    const rule =
      NextMealTemporalPolicyReleaseV1Schema.parse(release()).rules[0]!;
    const evidence = {
      windowStartInclusive: '2026-10-10T00:00:00.000Z',
      windowEndExclusive: '2026-10-13T00:00:00.000Z',
      trackingStartedAt: '2026-10-12T00:00:00.000Z',
      knownMealCount: 1,
      unresolvedMealCount: 0,
    };
    expect(assessNextMealTemporalHistoryV1(rule, evidence)).toBe(
      'PROVISIONAL_SHORT_HISTORY',
    );
    expect(
      assessNextMealTemporalHistoryV1(
        { ...rule, earlyHistoryTreatment: 'omit-rule' },
        evidence,
      ),
    ).toBe('OMIT_SHORT_HISTORY');
    expect(
      assessNextMealTemporalHistoryV1(rule, {
        ...evidence,
        trackingStartedAt: evidence.windowStartInclusive,
      }),
    ).toBe('FULL_HORIZON_AVAILABLE');
  });

  it('keeps intake below the rule minimum and unknown composition unresolved', () => {
    const rule =
      NextMealTemporalPolicyReleaseV1Schema.parse(release()).rules[0]!;
    const evidence = {
      windowStartInclusive: '2026-10-10T00:00:00.000Z',
      windowEndExclusive: '2026-10-13T00:00:00.000Z',
      trackingStartedAt: '2026-10-12T00:00:00.000Z',
      knownMealCount: 0,
      unresolvedMealCount: 0,
    };
    expect(assessNextMealTemporalHistoryV1(rule, evidence)).toBe(
      'INSUFFICIENT_RECORDED_INTAKE',
    );
    expect(
      assessNextMealTemporalHistoryV1(rule, {
        ...evidence,
        knownMealCount: 1,
        unresolvedMealCount: 1,
      }),
    ).toBe('UNRESOLVED_COMPOSITION');
  });

  it('permits an explicitly assumed first-meal comparison with zero recorded meals', () => {
    const rule = NextMealTemporalPolicyReleaseV1Schema.parse({
      ...release(),
      rules: [{ ...release().rules[0]!, minimumKnownMeals: 0 }],
    }).rules[0]!;
    expect(
      assessNextMealTemporalHistoryV1(rule, {
        windowStartInclusive: '2026-10-10T00:00:00.000Z',
        windowEndExclusive: '2026-10-13T00:00:00.000Z',
        trackingStartedAt: '2026-10-12T00:00:00.000Z',
        knownMealCount: 0,
        unresolvedMealCount: 0,
      }),
    ).toBe('PROVISIONAL_SHORT_HISTORY');
  });

  it('rejects reversed comparison windows before assessing history', () => {
    const rule =
      NextMealTemporalPolicyReleaseV1Schema.parse(release()).rules[0]!;
    expect(() =>
      assessNextMealTemporalHistoryV1(rule, {
        windowStartInclusive: '2026-10-13T00:00:00.000Z',
        windowEndExclusive: '2026-10-10T00:00:00.000Z',
        trackingStartedAt: '2026-10-12T00:00:00.000Z',
        knownMealCount: 1,
        unresolvedMealCount: 0,
      }),
    ).toThrow();
  });
});
