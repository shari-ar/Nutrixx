import { describe, expect, it } from 'vitest';

import type { StartingProfileV1 } from '@nutrixx/user-context';

import { getAdultDriBaselineReleaseV1 } from './baseline-targets.js';
import { assessHealthContextV1 } from './health-context.js';
import {
  NUTRIENT_CROSSWALK_V1,
  resolveNutrientConceptV1,
} from './nutrient-crosswalk.js';
import {
  TargetPolicyReleaseV1Schema,
  selectTargetV1,
  type TargetQueryV1,
} from './target-policy.js';

const NOW = '2026-10-10T12:00:00.000Z';

function profile(
  ageYears: number,
  physiologicalReference: 'female' | 'male' | 'unsure',
): StartingProfileV1 {
  return {
    profileId: '10000000-0000-4000-8000-000000000001',
    ownerSubjectId: '20000000-0000-4000-8000-000000000001',
    revision: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ageYears,
    heightCentimeters: '170',
    weightKilograms: '70',
    physiologicalReference,
    primaryGoal: 'maintain',
    foodRestrictions: [],
    timeZone: 'America/New_York',
    adultConfirmedAt: NOW,
  };
}

function selected(
  nutrientId: string,
  ageYears: number,
  physiologicalReference: 'female' | 'male' | 'unsure',
  query: TargetQueryV1 = 'intake-reference',
) {
  return selectTargetV1({
    release: getAdultDriBaselineReleaseV1(),
    context: assessHealthContextV1({
      profile: profile(ageYears, physiologicalReference),
      assessedAt: NOW,
    }),
    nutrientId,
    query,
    marketCode: 'US',
  });
}

describe('Provisional adult DRI baseline', () => {
  it('publishes a valid US/Canada release with exact catalog concepts', () => {
    const release = getAdultDriBaselineReleaseV1();
    expect(TargetPolicyReleaseV1Schema.parse(release)).toEqual(release);
    expect(release.publication.status).toBe('provisional');
    expect(release.applicableMarkets).toEqual(['US', 'CA']);
    const concepts = new Set(
      NUTRIENT_CROSSWALK_V1.map((entry) => entry.nutrientId),
    );
    expect(concepts.size).toBe(27);
    expect(new Set(release.rules.map((rule) => rule.nutrientId))).toEqual(
      concepts,
    );
    expect(
      release.rules.every((rule) =>
        rule.source.url.includes('/read/25353/chapter/28'),
      ),
    ).toBe(true);
    expect(new Set(release.rules.map((rule) => rule.ruleId)).size).toBe(
      release.rules.length,
    );
  });

  it('maps only matching USDA nutrient identities and units', () => {
    expect(resolveNutrientConceptV1('source.usda-fdc.1089', 'mg')).toBe(
      'nutrient.iron',
    );
    expect(resolveNutrientConceptV1('nutrient.iron', 'mg')).toBe(
      'nutrient.iron',
    );
    expect(resolveNutrientConceptV1('source.usda-fdc.1089', 'ug')).toBeNull();
    expect(resolveNutrientConceptV1('source.usda-fdc.1177', 'ug')).toBeNull();
    expect(resolveNutrientConceptV1('source.usda-fdc.1104', 'IU')).toBeNull();
  });

  it('selects sex- and age-specific iron RDAs from the source table', () => {
    expect(selected('nutrient.iron', 18, 'male')).toMatchObject({
      status: 'READY',
      rule: { value: { amount: '11' } },
    });
    expect(selected('nutrient.iron', 18, 'female')).toMatchObject({
      status: 'READY',
      rule: { value: { amount: '15' } },
    });
    expect(selected('nutrient.iron', 32, 'male')).toMatchObject({
      status: 'READY',
      rule: { value: { amount: '8' } },
    });
    expect(selected('nutrient.iron', 32, 'female')).toMatchObject({
      status: 'READY',
      rule: { value: { amount: '18' } },
    });
    expect(selected('nutrient.iron', 55, 'female')).toMatchObject({
      status: 'READY',
      rule: { value: { amount: '8' } },
    });
  });

  it('preserves vitamin D and calcium age boundaries', () => {
    expect(selected('nutrient.vitamin-d', 70, 'female')).toMatchObject({
      status: 'READY',
      rule: { value: { amount: '15' } },
    });
    expect(selected('nutrient.vitamin-d', 71, 'female')).toMatchObject({
      status: 'READY',
      rule: { value: { amount: '20' } },
    });
    expect(selected('nutrient.calcium', 50, 'female')).toMatchObject({
      status: 'READY',
      rule: { value: { amount: '1000' } },
    });
    expect(selected('nutrient.calcium', 51, 'female')).toMatchObject({
      status: 'READY',
      rule: { value: { amount: '1200' } },
    });
  });

  it('keeps ULs and AMDRs separate from intake references', () => {
    expect(selected('nutrient.calcium', 50, 'female', 'UL')).toMatchObject({
      status: 'READY',
      rule: {
        value: { amount: '2500' },
        horizon: 'daily-limit',
        sourceScope: 'all-intake',
      },
    });
    expect(selected('nutrient.calcium', 51, 'female', 'UL')).toMatchObject({
      status: 'READY',
      rule: { value: { amount: '2000' } },
    });
    expect(selected('nutrient.vitamin-c', 18, 'male', 'UL')).toMatchObject({
      status: 'READY',
      rule: { value: { amount: '1800' } },
    });
    expect(selected('nutrient.protein', 18, 'female', 'AMDR')).toMatchObject({
      status: 'READY',
      rule: {
        value: { lower: '10', upper: '30' },
        unit: { code: 'percent-energy' },
      },
    });
    expect(selected('nutrient.protein', 19, 'female', 'AMDR')).toMatchObject({
      status: 'READY',
      rule: { value: { lower: '10', upper: '35' } },
    });
    expect(
      selected('nutrient.vitamin-a-rae', 32, 'female', 'UL'),
    ).toMatchObject({ status: 'OUT_OF_SCOPE', reason: 'target-unavailable' });
  });

  it('avoids extra input when plausible profiles share the same rule value', () => {
    expect(selected('nutrient.vitamin-d', 32, 'unsure')).toMatchObject({
      status: 'READY',
      rule: { value: { amount: '15' } },
    });
    expect(selected('nutrient.iron', 32, 'unsure')).toMatchObject({
      status: 'NEEDS_INPUT',
      fields: ['physiological-reference'],
    });
    const context = assessHealthContextV1({
      profile: profile(30, 'male'),
      assessedAt: '2026-12-10T12:00:00.000Z',
    });
    const acrossBand = selectTargetV1({
      release: getAdultDriBaselineReleaseV1(),
      context,
      nutrientId: 'nutrient.vitamin-c',
      query: 'intake-reference',
      marketCode: 'CA',
    });
    expect(acrossBand.status).toBe('READY');
    if (acrossBand.status === 'READY') {
      expect(acrossBand.rule.value).toEqual({ kind: 'point', amount: '90' });
      expect(acrossBand.equivalentRuleIds.length).toBeGreaterThan(1);
    }
  });

  it('keeps source-specific or unmodeled values unavailable', () => {
    expect(selected('nutrient.folate-dfe', 32, 'female', 'UL')).toMatchObject({
      status: 'OUT_OF_SCOPE',
      reason: 'target-unavailable',
    });
    expect(
      selected('nutrient.vitamin-e-alpha-tocopherol', 32, 'female', 'UL'),
    ).toMatchObject({ status: 'OUT_OF_SCOPE', reason: 'target-unavailable' });
    expect(selected('nutrient.sodium', 32, 'female', 'UL')).toMatchObject({
      status: 'OUT_OF_SCOPE',
      reason: 'target-unavailable',
    });
  });

  it('does not leak mutations between release reads', () => {
    const first = getAdultDriBaselineReleaseV1();
    first.rules[0]!.source.title = 'Changed test title';
    expect(getAdultDriBaselineReleaseV1().rules[0]!.source.title).not.toBe(
      'Changed test title',
    );
  });
});
