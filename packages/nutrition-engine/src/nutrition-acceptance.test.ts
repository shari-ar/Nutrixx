import { createHash, randomUUID } from 'node:crypto';

import {
  verifyCanonicalRecordV1,
  type CanonicalRecordV1,
} from '@nutrixx/canonical-schema';
import type { MealRevisionV1 } from '@nutrixx/consumption';
import { IndexedDbCanonicalRecordRepository } from '@nutrixx/persistence-indexeddb';
import type { StartingProfileV1 } from '@nutrixx/user-context';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import { getAdultDriBaselineReleaseV1 } from './baseline-targets.js';
import { assessHealthContextV1 } from './health-context.js';
import { LocalNutritionStateLedgerV1 } from './nutrition-state-ledger.js';
import {
  nutritionPeriodAtV1,
  nutritionWindowAtV1,
  type NutritionDayPolicyV1,
} from './nutrition-period.js';
import {
  calculateDailyNutritionStateV1,
  calculateRollingNutritionStateV1,
} from './nutrition-state.js';
import { selectTargetV1, type TargetQueryV1 } from './target-policy.js';

const OWNER = '10000000-0000-4000-8000-000000000001';
const AS_OF = '2026-10-20T12:00:00.000Z';
const POLICY: NutritionDayPolicyV1 = {
  policyVersion: 'acceptance-zone-v1',
  initialTimeZone: 'UTC',
  changes: [],
};
const SOURCE_URL = 'https://www.nationalacademies.org/read/25353/chapter/28';

function context(
  ageYears = 32,
  physiologicalReference: 'female' | 'male' = 'female',
) {
  const profile: StartingProfileV1 = {
    profileId: '20000000-0000-4000-8000-000000000001',
    ownerSubjectId: OWNER,
    revision: 1,
    createdAt: AS_OF,
    updatedAt: AS_OF,
    ageYears,
    heightCentimeters: '170',
    weightKilograms: '70',
    physiologicalReference,
    primaryGoal: 'maintain',
    foodRestrictions: [],
    timeZone: 'UTC',
    adultConfirmedAt: AS_OF,
  };
  return assessHealthContextV1({ profile, assessedAt: AS_OF });
}

function meal(
  occurredAt: string,
  amount: string | null,
  nutrientId = 'source.usda-fdc.1089',
  unit = 'mg',
): MealRevisionV1 {
  return {
    mealId: randomUUID(),
    ownerSubjectId: OWNER,
    revision: 1,
    state: 'recorded',
    occurredAt,
    localDate: occurredAt.slice(0, 10),
    timeZone: 'UTC',
    mealType: 'lunch',
    items: [
      {
        itemId: randomUUID(),
        position: 1,
        displayNameSnapshot: 'Acceptance fixture food',
        preparationState: 'raw',
        reference: {
          kind: 'food',
          catalogReleaseId: 'acceptance-release',
          foodId: '30000000-0000-4000-8000-000000000001',
          foodRevision: 1,
        },
        consumedQuantity: {
          amount: '100',
          unit: { system: 'ucum', code: 'g' },
        },
        edibleGramWeight: '100',
        provenance: {
          method: 'user-entered',
          source: { kind: 'user', sourceId: OWNER },
          recordedAt: AS_OF,
        },
      },
    ],
    nutrition:
      amount === null
        ? []
        : [
            {
              state: 'known',
              nutrientId,
              amount,
              unit: { system: 'ucum', code: unit },
            },
          ],
    provenance: {
      method: 'user-entered',
      source: { kind: 'user', sourceId: OWNER },
      recordedAt: AS_OF,
    },
    recordedAt: AS_OF,
  };
}

function daily(
  meals: readonly MealRevisionV1[],
  options: {
    ageYears?: number;
    travelAdjusted?: boolean;
    market?: string;
  } = {},
) {
  const period = nutritionPeriodAtV1(POLICY, '2026-10-19T12:00:00.000Z');
  return calculateDailyNutritionStateV1({
    ownerSubjectId: OWNER,
    period: options.travelAdjusted
      ? { ...period, travelAdjusted: true }
      : period,
    meals,
    context: context(options.ageYears),
    release: getAdultDriBaselineReleaseV1(),
    marketCode: options.market ?? 'US',
    calculatedAt: AS_OF,
  });
}

function nutrient(state: ReturnType<typeof daily>, nutrientId: string) {
  const result = state.nutrients.find(
    (value) => value.nutrientId === nutrientId,
  );
  if (!result)
    throw new TypeError(`Missing acceptance nutrient: ${nutrientId}`);
  return result;
}

describe('FR-007 scientific acceptance fixtures', () => {
  // Independent expected values transcribed from the National Academies'
  // Appendix J adult life-stage tables, not derived from baseline-targets.ts.
  it.each([
    [
      'S3-SCI-001',
      'nutrient.iron',
      32,
      'female',
      'intake-reference',
      'RDA',
      '18',
      'mg',
    ],
    [
      'S3-SCI-002',
      'nutrient.iron',
      32,
      'male',
      'intake-reference',
      'RDA',
      '8',
      'mg',
    ],
    [
      'S3-SCI-003',
      'nutrient.dietary-fiber',
      32,
      'female',
      'intake-reference',
      'AI',
      '25',
      'g',
    ],
    [
      'S3-SCI-004',
      'nutrient.calcium',
      51,
      'female',
      'intake-reference',
      'RDA',
      '1200',
      'mg',
    ],
    [
      'S3-SCI-005',
      'nutrient.vitamin-d',
      71,
      'female',
      'intake-reference',
      'RDA',
      '20',
      'ug',
    ],
    [
      'S3-SCI-006',
      'nutrient.copper',
      32,
      'male',
      'intake-reference',
      'RDA',
      '0.9',
      'mg',
    ],
    ['S3-SCI-007', 'nutrient.calcium', 51, 'female', 'UL', 'UL', '2000', 'mg'],
  ] as const)(
    '%s matches the source adult reference',
    (_, nutrientId, ageYears, physiology, query, type, amount, unit) => {
      const result = selectTargetV1({
        release: getAdultDriBaselineReleaseV1(),
        context: context(ageYears, physiology),
        nutrientId,
        query: query as TargetQueryV1,
        marketCode: 'US',
      });
      expect(result.status).toBe('READY');
      if (result.status !== 'READY') return;
      expect(result.rule).toMatchObject({
        type,
        value: { kind: 'point', amount },
        unit: { code: unit },
        source: { url: SOURCE_URL },
      });
      expect(result.publicationStatus).toBe('provisional');
    },
  );

  it('S3-SCI-008 retains the AMDR as an energy-share range, not a gram target', () => {
    const result = selectTargetV1({
      release: getAdultDriBaselineReleaseV1(),
      context: context(),
      nutrientId: 'nutrient.protein',
      query: 'AMDR',
      marketCode: 'US',
    });
    expect(result.status).toBe('READY');
    if (result.status === 'READY') {
      expect(result.rule).toMatchObject({
        type: 'AMDR',
        value: { kind: 'range', lower: '10', upper: '35' },
        unit: { code: 'percent-energy' },
      });
    }
  });

  it('S3-SCI-009 distinguishes known zero, missingness, and decisive lower bounds', () => {
    const at = '2026-10-19T10:00:00.000Z';
    const zero = meal(at, '0');
    const unknown = meal('2026-10-19T11:00:00.000Z', null);
    const zeroOnly = nutrient(daily([zero]), 'nutrient.iron');
    expect(zeroOnly.knownRecordedSubtotal).toBe('0');
    expect(zeroOnly.comparison).toBe('recorded-below-reference');
    const withUnknown = nutrient(daily([zero, unknown]), 'nutrient.iron');
    expect(withUnknown.knownRecordedSubtotal).toBe('0');
    expect(withUnknown.missingMealIds).toEqual([unknown.mealId]);
    expect(withUnknown.comparison).toBe('indeterminate');
    const decisive = nutrient(
      daily([meal(at, '18'), unknown]),
      'nutrient.iron',
    );
    expect(decisive.comparison).toBe('recorded-at-or-above-reference');
  });

  it('S3-SCI-010 preserves exact sums and weakens a below-UL claim when evidence is missing', () => {
    const first = meal('2026-10-19T10:00:00.000Z', '2.005');
    const second = meal('2026-10-19T11:00:00.000Z', '4.05');
    const unknown = meal('2026-10-19T12:00:00.000Z', null);
    for (const ordered of [
      [first, second],
      [second, first],
    ]) {
      const result = nutrient(daily(ordered), 'nutrient.iron');
      expect(result.knownRecordedSubtotal).toBe('6.055');
      expect(result.upperLimitComparison).toBe(
        'recorded-at-or-below-upper-limit-in-available-data',
      );
    }
    expect(
      nutrient(daily([first, second, unknown]), 'nutrient.iron')
        .upperLimitComparison,
    ).toBe('indeterminate');
    expect(
      nutrient(
        daily([meal('2026-10-19T10:00:00.000Z', '46'), unknown]),
        'nutrient.iron',
      ).upperLimitComparison,
    ).toBe('recorded-above-upper-limit');
  });

  it('S3-SCI-011 abstains for a source-specific UL and travel-adjusted period', () => {
    const vitaminA = nutrient(
      daily([
        meal('2026-10-19T10:00:00.000Z', '5000', 'source.usda-fdc.1106', 'ug'),
      ]),
      'nutrient.vitamin-a-rae',
    );
    expect(vitaminA.upperLimit.status).toBe('OUT_OF_SCOPE');
    expect(vitaminA.upperLimitComparison).toBe('indeterminate');
    const travel = nutrient(
      daily([meal('2026-10-19T10:00:00.000Z', '18')], {
        travelAdjusted: true,
      }),
      'nutrient.iron',
    );
    expect(travel.comparison).toBe('indeterminate');
    expect(travel.upperLimitComparison).toBe('indeterminate');
  });

  it('S3-SCI-012 splits seven-day trends when the applicable target changes', () => {
    const periods = nutritionWindowAtV1(POLICY, AS_OF).completed;
    const dailyStates = periods.map((period, index) => {
      const occurredAt = new Date(
        Date.parse(period.startsAt) + 3_600_000,
      ).toISOString();
      return calculateDailyNutritionStateV1({
        ownerSubjectId: OWNER,
        period,
        meals: [meal(occurredAt, '500', 'source.usda-fdc.1087')],
        context: context(index < 3 ? 50 : 51),
        release: getAdultDriBaselineReleaseV1(),
        marketCode: 'US',
        calculatedAt: AS_OF,
      });
    });
    const trends = calculateRollingNutritionStateV1(dailyStates).trends.filter(
      (trend) => trend.nutrientId === 'nutrient.calcium',
    );
    expect(trends).toHaveLength(2);
    expect(trends.map((trend) => trend.comparableDayCount)).toEqual([3, 4]);
    expect(
      trends.every((trend) => trend.meanKnownRecordedPerObservedDay === '500'),
    ).toBe(true);
  });

  it('S3-TIME-001 keeps date-line transitions contiguous with distinct repeated date labels', () => {
    const policy: NutritionDayPolicyV1 = {
      policyVersion: 'date-line-acceptance-v1',
      initialTimeZone: 'UTC',
      changes: [
        {
          effectiveAt: '2026-10-18T00:00:00.000Z',
          timeZone: 'Pacific/Kiritimati',
        },
        {
          effectiveAt: '2026-10-18T10:00:00.000Z',
          timeZone: 'Pacific/Honolulu',
        },
      ],
    };
    const before = nutritionPeriodAtV1(policy, '2026-10-17T23:59:59.999Z');
    const east = nutritionPeriodAtV1(policy, '2026-10-18T00:00:00.000Z');
    const west = nutritionPeriodAtV1(policy, '2026-10-18T10:00:00.000Z');
    expect(before.endsAt).toBe(east.startsAt);
    expect(east.endsAt).toBe(west.startsAt);
    expect(east.localDate).toBe(west.localDate);
    expect(east.periodId).not.toBe(west.periodId);
    expect(east.travelAdjusted).toBe(true);
    expect(west.travelAdjusted).toBe(true);
    for (const [instant, expected] of [
      ['2026-10-17T23:59:59.999Z', before.periodId],
      ['2026-10-18T00:00:00.000Z', east.periodId],
      ['2026-10-18T09:59:59.999Z', east.periodId],
      ['2026-10-18T10:00:00.000Z', west.periodId],
    ]) {
      expect(nutritionPeriodAtV1(policy, instant).periodId).toBe(expected);
    }
  });

  it('S3-REG-001 supersedes snapshots after a target-release revision and then replays idempotently', async () => {
    const digest = (value: string): string =>
      createHash('sha256').update(value, 'utf8').digest('hex');
    const repository = await IndexedDbCanonicalRecordRepository.create({
      databaseName: `stage-3-release-impact-${randomUUID()}`,
      indexedDB: new IDBFactory(),
      keyRange: IDBKeyRange,
      verifyRecord: (record: CanonicalRecordV1) =>
        verifyCanonicalRecordV1(record, digest),
      createId: randomUUID,
      now: () => AS_OF,
      deleteOnClose: true,
    });
    try {
      const original = getAdultDriBaselineReleaseV1();
      const revised = {
        ...original,
        releaseId: `${original.releaseId}.acceptance-revision`,
        rules: original.rules.map((rule) =>
          rule.nutrientId === 'nutrient.iron' &&
          rule.type === 'RDA' &&
          rule.population.minimumAgeYears === 31 &&
          rule.population.physiologicalReference === 'female'
            ? {
                ...rule,
                ruleId: `${rule.ruleId}.acceptance-revision`,
                value: { kind: 'point' as const, amount: '19' },
              }
            : rule,
        ),
      };
      const ledger = (targetRelease: typeof original) =>
        new LocalNutritionStateLedgerV1({
          repository,
          digestSha256Hex: digest,
          createId: randomUUID,
          now: () => AS_OF,
          ownerSubjectId: OWNER,
          dayPolicy: POLICY,
          targetRelease,
          marketCode: 'US',
          contextForPeriod: () => context(),
        });
      expect(
        (await ledger(original).recomputeWindow(AS_OF)).newSnapshotCount,
      ).toBe(9);
      expect(
        (await ledger(original).recomputeWindow(AS_OF)).newSnapshotCount,
      ).toBe(0);
      const changed = await ledger(revised).recomputeWindow(AS_OF);
      expect(changed.newSnapshotCount).toBe(9);
      const iron = nutrient(changed.current, 'nutrient.iron');
      expect(iron.target.status).toBe('READY');
      if (iron.target.status === 'READY') {
        expect(iron.target.rule.value).toEqual({ kind: 'point', amount: '19' });
      }
      expect(
        (await ledger(revised).recomputeWindow(AS_OF)).newSnapshotCount,
      ).toBe(0);
      const records = await repository.listBySubject(OWNER);
      const currentDay = records.filter(
        (record) =>
          record.recordType === 'nutrition-state.daily-snapshot' &&
          (record.payload as { periodKey?: string }).periodKey ===
            changed.current.period.periodId,
      );
      expect(currentDay.map((record) => record.logicalVersion).sort()).toEqual([
        1, 2,
      ]);
      expect(
        currentDay.find((record) => record.logicalVersion === 2)?.correctionOf,
      ).toBe(
        currentDay.find((record) => record.logicalVersion === 1)?.recordId,
      );
    } finally {
      await repository.close();
    }
  });
});
