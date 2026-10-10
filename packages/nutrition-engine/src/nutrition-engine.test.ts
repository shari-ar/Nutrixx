import { describe, expect, it } from 'vitest';

import type { StartingProfileV1 } from '@nutrixx/user-context';

import { assessHealthContextV1 } from './health-context.js';
import {
  TargetPolicyReleaseV1Schema,
  selectTargetV1,
  type TargetPolicyReleaseV1,
  type TargetRuleV1,
} from './target-policy.js';

const PROFILE_TIME = '2026-10-10T10:00:00.000Z';
const SUBJECT_ID = '20000000-0000-4000-8000-000000000001';
const PROFILE_ID = '10000000-0000-4000-8000-000000000001';

function profile(
  overrides: Partial<StartingProfileV1> = {},
): StartingProfileV1 {
  return {
    profileId: PROFILE_ID,
    ownerSubjectId: SUBJECT_ID,
    revision: 1,
    createdAt: PROFILE_TIME,
    updatedAt: PROFILE_TIME,
    ageYears: 32,
    heightCentimeters: '172',
    weightKilograms: '68',
    physiologicalReference: 'female',
    primaryGoal: 'maintain',
    foodRestrictions: [],
    timeZone: 'America/New_York',
    adultConfirmedAt: PROFILE_TIME,
    ...overrides,
  };
}

function rule(
  ruleId: string,
  overrides: Partial<TargetRuleV1> = {},
): TargetRuleV1 {
  return {
    ruleId,
    nutrientId: 'test.nutrient',
    type: 'RDA',
    value: { kind: 'point', amount: '10' },
    unit: { system: 'ucum', code: 'mg' },
    horizon: 'daily-average',
    sourceScope: 'all-intake',
    population: {
      minimumAgeYears: 18,
      maximumAgeYears: 120,
      physiologicalReference: 'any',
      lifeStage: 'any',
    },
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    source: {
      authority: 'Synthetic test authority',
      title: 'Synthetic target fixture',
      edition: '1',
      url: 'https://example.com/test-targets',
    },
    ...overrides,
  };
}

function release(
  rules: readonly TargetRuleV1[],
  publication: TargetPolicyReleaseV1['publication'] = {
    status: 'provisional',
    authorId: 'synthetic-test-author',
    publishedAt: '2026-10-01T00:00:00.000Z',
  },
): TargetPolicyReleaseV1 {
  return {
    releaseId: 'synthetic-target-release-v1',
    policyVersion: 'test-policy-v1',
    effectiveFrom: '2026-10-01T00:00:00.000Z',
    applicableMarkets: ['US'],
    publication,
    rules: [...rules],
  };
}

describe('Stage 3 health context', () => {
  it('uses the existing minimal starting profile without another questionnaire', () => {
    const context = assessHealthContextV1({
      profile: profile(),
      assessedAt: PROFILE_TIME,
    });
    expect(context).toMatchObject({
      status: 'READY',
      ruleVersion: 'health-context-v1',
      profileRevision: 1,
      ageYears: { minimum: 32, maximum: 32 },
      lifeStage: 'adult',
      lifeStageEvidence: 'assumed',
      activityLevel: 'unreported',
      neededInput: [],
    });
    expect(context.limitationCodes).toContain('adult-life-stage-assumed');
  });

  it('tracks age ambiguity over time and resolves it from an optional birth date', () => {
    const assessedAt = '2026-12-10T10:00:00.000Z';
    expect(
      assessHealthContextV1({ profile: profile(), assessedAt }).ageYears,
    ).toEqual({ minimum: 32, maximum: 33 });
    expect(
      assessHealthContextV1({
        profile: profile(),
        assessedAt,
        birthDate: '1994-11-20',
      }).ageYears,
    ).toEqual({ minimum: 32, maximum: 32 });
  });

  it('requests one correction for conflicting age evidence', () => {
    const context = assessHealthContextV1({
      profile: profile(),
      assessedAt: PROFILE_TIME,
      birthDate: '2008-01-01',
    });
    expect(context.status).toBe('NEEDS_INPUT');
    expect(context.neededInput).toContain('age-confirmation');
  });

  it('requests correction for a future birth date', () => {
    const context = assessHealthContextV1({
      profile: profile(),
      assessedAt: PROFILE_TIME,
      birthDate: '2027-01-01',
    });
    expect(context.status).toBe('NEEDS_INPUT');
    expect(context.neededInput).toContain('age-confirmation');
  });

  it('routes declared higher-risk life stages outside the general-wellness rule', () => {
    const context = assessHealthContextV1({
      profile: profile(),
      assessedAt: PROFILE_TIME,
      lifeStage: 'pregnancy',
    });
    expect(context.status).toBe('OUT_OF_SCOPE');
  });
});

describe('Versioned target selection', () => {
  it('selects a provisional all-population RDA without extra input', () => {
    const context = assessHealthContextV1({
      profile: profile({ physiologicalReference: 'unsure' }),
      assessedAt: PROFILE_TIME,
    });
    const result = selectTargetV1({
      release: release([rule('all-rda')]),
      context,
      nutrientId: 'test.nutrient',
      query: 'intake-reference',
      marketCode: 'US',
    });
    expect(result).toMatchObject({
      status: 'READY',
      releaseId: 'synthetic-target-release-v1',
      policyVersion: 'test-policy-v1',
      publicationStatus: 'provisional',
      rule: { ruleId: 'all-rda' },
    });
  });

  it('preserves a later expert-reviewed publication status', () => {
    const context = assessHealthContextV1({
      profile: profile(),
      assessedAt: PROFILE_TIME,
    });
    const result = selectTargetV1({
      release: release([rule('reviewed-rda')], {
        status: 'reviewed',
        reviewerId: 'synthetic-test-reviewer',
        reviewedAt: '2026-10-01T00:00:00.000Z',
      }),
      context,
      nutrientId: 'test.nutrient',
      query: 'intake-reference',
      marketCode: 'US',
    });
    expect(result).toMatchObject({
      status: 'READY',
      publicationStatus: 'reviewed',
    });
  });

  it('prefers RDA over AI for the same eligible population', () => {
    const context = assessHealthContextV1({
      profile: profile(),
      assessedAt: PROFILE_TIME,
      lifeStage: 'adult',
    });
    const result = selectTargetV1({
      release: release([rule('ai', { type: 'AI' }), rule('rda')]),
      context,
      nutrientId: 'test.nutrient',
      query: 'intake-reference',
      marketCode: 'US',
    });
    expect(result).toMatchObject({ status: 'READY', rule: { ruleId: 'rda' } });
  });

  it('uses AI as the intake reference when an applicable RDA is absent', () => {
    const context = assessHealthContextV1({
      profile: profile(),
      assessedAt: PROFILE_TIME,
      lifeStage: 'adult',
    });
    const result = selectTargetV1({
      release: release([rule('ai-only', { type: 'AI' })]),
      context,
      nutrientId: 'test.nutrient',
      query: 'intake-reference',
      marketCode: 'US',
    });
    expect(result).toMatchObject({
      status: 'READY',
      rule: { ruleId: 'ai-only', type: 'AI' },
    });
  });

  it('keeps EAR separate from the individual intake reference', () => {
    const context = assessHealthContextV1({
      profile: profile(),
      assessedAt: PROFILE_TIME,
      lifeStage: 'adult',
    });
    const targetRelease = release([rule('rda'), rule('ear', { type: 'EAR' })]);
    expect(
      selectTargetV1({
        release: targetRelease,
        context,
        nutrientId: 'test.nutrient',
        query: 'EAR',
        marketCode: 'US',
      }),
    ).toMatchObject({ status: 'READY', rule: { ruleId: 'ear' } });
  });

  it('asks for life stage only when the applicable rule differs', () => {
    const context = assessHealthContextV1({
      profile: profile(),
      assessedAt: PROFILE_TIME,
      lifeStage: 'unspecified',
    });
    const result = selectTargetV1({
      release: release([
        rule('adult', {
          population: {
            minimumAgeYears: 18,
            maximumAgeYears: 120,
            physiologicalReference: 'female',
            lifeStage: 'adult',
          },
        }),
        rule('pregnancy', {
          population: {
            minimumAgeYears: 18,
            maximumAgeYears: 120,
            physiologicalReference: 'female',
            lifeStage: 'pregnancy',
          },
        }),
      ]),
      context,
      nutrientId: 'test.nutrient',
      query: 'intake-reference',
      marketCode: 'US',
    });
    expect(result).toMatchObject({
      status: 'NEEDS_INPUT',
      fields: ['life-stage'],
    });
  });

  it('keeps life-stage uncertainty independent of physiological reference', () => {
    const context = assessHealthContextV1({
      profile: profile({ physiologicalReference: 'male' }),
      assessedAt: PROFILE_TIME,
      lifeStage: 'unspecified',
    });
    const result = selectTargetV1({
      release: release([
        rule('adult-only', {
          population: {
            minimumAgeYears: 18,
            maximumAgeYears: 120,
            physiologicalReference: 'male',
            lifeStage: 'adult',
          },
        }),
      ]),
      context,
      nutrientId: 'test.nutrient',
      query: 'intake-reference',
      marketCode: 'US',
    });
    expect(result).toMatchObject({
      status: 'NEEDS_INPUT',
      fields: ['life-stage'],
    });
  });

  it('asks for current age only when aging may cross a target band', () => {
    const context = assessHealthContextV1({
      profile: profile({ ageYears: 30 }),
      assessedAt: '2026-12-10T10:00:00.000Z',
      lifeStage: 'adult',
    });
    const result = selectTargetV1({
      release: release([
        rule('age-30', {
          population: {
            minimumAgeYears: 18,
            maximumAgeYears: 30,
            physiologicalReference: 'any',
            lifeStage: 'adult',
          },
        }),
        rule('age-31', {
          value: { kind: 'point', amount: '20' },
          population: {
            minimumAgeYears: 31,
            maximumAgeYears: 120,
            physiologicalReference: 'any',
            lifeStage: 'adult',
          },
        }),
      ]),
      context,
      nutrientId: 'test.nutrient',
      query: 'intake-reference',
      marketCode: 'US',
    });
    expect(result).toMatchObject({
      status: 'NEEDS_INPUT',
      fields: ['birth-date-or-current-age'],
    });
  });

  it('preserves the source scope of a selected upper limit', () => {
    const context = assessHealthContextV1({
      profile: profile(),
      assessedAt: PROFILE_TIME,
      lifeStage: 'adult',
    });
    const result = selectTargetV1({
      release: release([
        rule('supplement-ul', {
          type: 'UL',
          horizon: 'daily-limit',
          sourceScope: 'fortified-and-supplemental',
        }),
      ]),
      context,
      nutrientId: 'test.nutrient',
      query: 'UL',
      marketCode: 'US',
    });
    expect(result).toMatchObject({
      status: 'READY',
      rule: { sourceScope: 'fortified-and-supplemental' },
    });
  });

  it('blocks draft releases and conflicting rules', () => {
    const context = assessHealthContextV1({
      profile: profile(),
      assessedAt: PROFILE_TIME,
      lifeStage: 'adult',
    });
    expect(
      selectTargetV1({
        release: release([rule('draft-rda')], { status: 'draft' }),
        context,
        nutrientId: 'test.nutrient',
        query: 'intake-reference',
        marketCode: 'US',
      }),
    ).toMatchObject({
      status: 'OUT_OF_SCOPE',
      reason: 'target-release-unavailable',
    });
    expect(
      selectTargetV1({
        release: release([rule('first'), rule('second')]),
        context,
        nutrientId: 'test.nutrient',
        query: 'intake-reference',
        marketCode: 'US',
      }),
    ).toMatchObject({
      status: 'OUT_OF_SCOPE',
      reason: 'target-policy-conflict',
    });
  });

  it('requests market only when target selection needs it', () => {
    const context = assessHealthContextV1({
      profile: profile(),
      assessedAt: PROFILE_TIME,
    });
    const targetRelease = release([rule('all-rda')]);
    expect(
      selectTargetV1({
        release: targetRelease,
        context,
        nutrientId: 'test.nutrient',
        query: 'intake-reference',
      }),
    ).toMatchObject({ status: 'NEEDS_INPUT', fields: ['market'] });
    expect(
      selectTargetV1({
        release: targetRelease,
        context,
        nutrientId: 'test.nutrient',
        query: 'intake-reference',
        marketCode: 'CA',
      }),
    ).toMatchObject({
      status: 'OUT_OF_SCOPE',
      reason: 'target-market-unavailable',
    });
  });

  it('rejects malformed ranges and duplicate release rule IDs', () => {
    expect(() =>
      TargetPolicyReleaseV1Schema.parse(
        release([
          rule('bad-range', {
            type: 'AMDR',
            horizon: 'energy-share',
            value: { kind: 'range', lower: '40', upper: '20' },
          }),
        ]),
      ),
    ).toThrow();
    expect(() =>
      TargetPolicyReleaseV1Schema.parse(release([rule('same'), rule('same')])),
    ).toThrow();
  });
});
