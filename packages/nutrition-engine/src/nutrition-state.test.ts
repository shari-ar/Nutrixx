import { createHash, randomUUID } from 'node:crypto';

import {
  verifyCanonicalRecordV1,
  type CanonicalRecordV1,
} from '@nutrixx/canonical-schema';
import { ConsumptionLedgerV1, type MealRevisionV1 } from '@nutrixx/consumption';
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

const OWNER = '10000000-0000-4000-8000-000000000001';
const PROFILE = '20000000-0000-4000-8000-000000000001';
const FOOD = '30000000-0000-4000-8000-000000000001';
const AS_OF = '2026-10-20T12:00:00.000Z';
const UTC_POLICY: NutritionDayPolicyV1 = {
  policyVersion: 'zone-v1',
  initialTimeZone: 'UTC',
  changes: [],
};
const digest = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

function context() {
  const profile: StartingProfileV1 = {
    profileId: PROFILE,
    ownerSubjectId: OWNER,
    revision: 1,
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-10T00:00:00.000Z',
    ageYears: 32,
    heightCentimeters: '170',
    weightKilograms: '70',
    physiologicalReference: 'female',
    primaryGoal: 'maintain',
    foodRestrictions: [],
    timeZone: 'UTC',
    adultConfirmedAt: '2026-10-10T00:00:00.000Z',
  };
  return assessHealthContextV1({ profile, assessedAt: AS_OF });
}

function meal(
  occurredAt: string,
  nutrition: MealRevisionV1['nutrition'],
  overrides: Partial<MealRevisionV1> = {},
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
        displayNameSnapshot: 'Test food',
        preparationState: 'raw',
        reference: {
          kind: 'food',
          catalogReleaseId: 'test-release',
          foodId: FOOD,
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
    nutrition,
    provenance: {
      method: 'user-entered',
      source: { kind: 'user', sourceId: OWNER },
      recordedAt: AS_OF,
    },
    recordedAt: AS_OF,
    ...overrides,
  };
}

function daily(occurredAt: string, meals: readonly MealRevisionV1[] = []) {
  return calculateDailyNutritionStateV1({
    ownerSubjectId: OWNER,
    period: nutritionPeriodAtV1(UTC_POLICY, occurredAt),
    meals,
    context: context(),
    release: getAdultDriBaselineReleaseV1(),
    marketCode: 'US',
    calculatedAt: AS_OF,
  });
}

function nutrient(state: ReturnType<typeof daily>, id: string) {
  const value = state.nutrients.find((entry) => entry.nutrientId === id);
  if (!value) throw new TypeError(`Missing test nutrient: ${id}`);
  return value;
}

describe('Nutrition-day boundaries', () => {
  it('assigns 23- and 25-hour DST days without UTC-day assumptions', () => {
    const policy: NutritionDayPolicyV1 = {
      policyVersion: 'new-york-v1',
      initialTimeZone: 'America/New_York',
      changes: [],
    };
    const spring = nutritionPeriodAtV1(policy, '2026-03-08T16:00:00.000Z');
    expect(spring).toMatchObject({
      localDate: '2026-03-08',
      startsAt: '2026-03-08T05:00:00.000Z',
      endsAt: '2026-03-09T04:00:00.000Z',
    });
    const fall = nutritionPeriodAtV1(policy, '2026-11-01T16:00:00.000Z');
    expect(fall).toMatchObject({
      localDate: '2026-11-01',
      startsAt: '2026-11-01T04:00:00.000Z',
      endsAt: '2026-11-02T05:00:00.000Z',
    });
  });

  it('retains seven completed days and marks a boundary-aligned travel change', () => {
    const policy: NutritionDayPolicyV1 = {
      policyVersion: 'travel-v1',
      initialTimeZone: 'UTC',
      changes: [
        { effectiveAt: '2026-10-18T00:00:00.000Z', timeZone: 'Asia/Tokyo' },
      ],
    };
    const window = nutritionWindowAtV1(policy, '2026-10-19T06:00:00.000Z');
    expect(window.completed).toHaveLength(7);
    expect(window.completed[6]).toMatchObject({
      startsAt: '2026-10-18T00:00:00.000Z',
      endsAt: '2026-10-18T15:00:00.000Z',
      travelAdjusted: true,
    });
    expect(window.current.startsAt).toBe('2026-10-18T15:00:00.000Z');
    expect(() =>
      nutritionPeriodAtV1(
        {
          policyVersion: 'bad',
          initialTimeZone: 'UTC',
          changes: [
            { effectiveAt: '2026-10-18T01:00:00.000Z', timeZone: 'Asia/Tokyo' },
          ],
        },
        AS_OF,
      ),
    ).toThrow(/boundary/);
  });
});

describe('Recorded-intake state', () => {
  it('keeps measured zero and missing composition distinct', () => {
    const knownZero = meal('2026-10-19T10:00:00.000Z', [
      {
        state: 'known',
        nutrientId: 'source.usda-fdc.1089',
        amount: '0',
        unit: { system: 'ucum', code: 'mg' },
      },
    ]);
    const unknown = meal('2026-10-19T12:00:00.000Z', []);
    const result = nutrient(
      daily('2026-10-19T12:00:00.000Z', [knownZero, unknown]),
      'nutrient.iron',
    );
    expect(result.knownRecordedSubtotal).toBe('0');
    expect(result.evidence).toBe('incomplete');
    expect(result.missingMealIds).toEqual([unknown.mealId]);
    expect(result.comparison).toBe('indeterminate');
    expect(result.upperLimitComparison).toBe('indeterminate');
  });

  it('uses exact decimal sums, stable lower bounds, and separate upper limits', () => {
    const first = meal('2026-10-19T10:00:00.000Z', [
      {
        state: 'known',
        nutrientId: 'source.usda-fdc.1089',
        amount: '18.25',
        unit: { system: 'ucum', code: 'mg' },
      },
    ]);
    const secondDraft = meal('2026-10-19T12:00:00.000Z', []);
    const second = {
      ...secondDraft,
      nutrition: [
        {
          state: 'incomplete' as const,
          nutrientId: 'source.usda-fdc.1089',
          knownAmount: '27.5',
          unit: { system: 'ucum' as const, code: 'mg' },
          missingItemIds: [secondDraft.items[0]!.itemId],
        },
      ],
    };
    const result = nutrient(
      daily('2026-10-19T12:00:00.000Z', [first, second]),
      'nutrient.iron',
    );
    expect(result.knownRecordedSubtotal).toBe('45.75');
    expect(result.comparison).toBe('recorded-at-or-above-reference');
    expect(result.upperLimitComparison).toBe('recorded-above-upper-limit');
    expect(result.evidence).toBe('incomplete');
  });

  it('withholds target comparisons for travel periods and unknown markets', () => {
    const food = meal('2026-10-19T10:00:00.000Z', [
      {
        state: 'known',
        nutrientId: 'source.usda-fdc.1089',
        amount: '8',
        unit: { system: 'ucum', code: 'mg' },
      },
    ]);
    const ordinary = daily('2026-10-19T10:00:00.000Z', [food]);
    const travel = calculateDailyNutritionStateV1({
      ownerSubjectId: OWNER,
      period: { ...ordinary.period, travelAdjusted: true },
      meals: [food],
      context: context(),
      release: getAdultDriBaselineReleaseV1(),
      marketCode: 'US',
      calculatedAt: AS_OF,
    });
    expect(nutrient(travel, 'nutrient.iron').comparison).toBe('indeterminate');
    const unknownMarket = calculateDailyNutritionStateV1({
      ownerSubjectId: OWNER,
      period: ordinary.period,
      meals: [food],
      context: context(),
      release: getAdultDriBaselineReleaseV1(),
      calculatedAt: AS_OF,
    });
    expect(unknownMarket.status).toBe('NEEDS_INPUT');
    expect(nutrient(unknownMarket, 'nutrient.iron').target).toMatchObject({
      fields: ['market'],
    });
  });

  it('means only comparable observed days without turning gaps into zero', () => {
    const window = nutritionWindowAtV1(UTC_POLICY, AS_OF);
    const meals = [
      meal('2026-10-14T10:00:00.000Z', [
        {
          state: 'known',
          nutrientId: 'source.usda-fdc.1089',
          amount: '2',
          unit: { system: 'ucum', code: 'mg' },
        },
      ]),
      meal('2026-10-18T10:00:00.000Z', [
        {
          state: 'known',
          nutrientId: 'source.usda-fdc.1089',
          amount: '4',
          unit: { system: 'ucum', code: 'mg' },
        },
      ]),
    ];
    const rolling = calculateRollingNutritionStateV1(
      window.completed.map((period) =>
        calculateDailyNutritionStateV1({
          ownerSubjectId: OWNER,
          period,
          meals,
          context: context(),
          release: getAdultDriBaselineReleaseV1(),
          marketCode: 'US',
          calculatedAt: AS_OF,
        }),
      ),
    );
    expect(rolling.status).toBe('PARTIAL');
    expect(
      rolling.trends.find((value) => value.nutrientId === 'nutrient.iron'),
    ).toMatchObject({
      meanKnownRecordedPerObservedDay: '3',
      comparableDayCount: 2,
      excludedDayCount: 5,
    });
  });
});

describe('Local Nutrition State snapshots', () => {
  it('replays idempotently and supersedes affected daily and rolling windows after correction', async () => {
    const repository = await IndexedDbCanonicalRecordRepository.create({
      databaseName: `nutrition-state-${randomUUID()}`,
      indexedDB: new IDBFactory(),
      keyRange: IDBKeyRange,
      verifyRecord: (record: CanonicalRecordV1) =>
        verifyCanonicalRecordV1(record, digest),
      createId: randomUUID,
      now: () => AS_OF,
      deleteOnClose: true,
    });
    try {
      const consumption = new ConsumptionLedgerV1({
        repository,
        digestSha256Hex: digest,
      });
      const original = meal('2026-10-19T10:00:00.000Z', [
        {
          state: 'known',
          nutrientId: 'source.usda-fdc.1089',
          amount: '2',
          unit: { system: 'ucum', code: 'mg' },
        },
      ]);
      const firstMealRecordId = randomUUID();
      await consumption.recordMeal({
        commandId: randomUUID(),
        mealRecordId: firstMealRecordId,
        eventRecordId: randomUUID(),
        eventId: randomUUID(),
        meal: original,
      });
      const state = new LocalNutritionStateLedgerV1({
        repository,
        digestSha256Hex: digest,
        createId: randomUUID,
        now: () => AS_OF,
        ownerSubjectId: OWNER,
        dayPolicy: UTC_POLICY,
        targetRelease: getAdultDriBaselineReleaseV1(),
        marketCode: 'US',
        contextForPeriod: context,
      });
      expect((await state.recomputeWindow(AS_OF)).newSnapshotCount).toBe(9);
      expect((await state.recomputeWindow(AS_OF)).newSnapshotCount).toBe(0);
      await consumption.correctMeal({
        commandId: randomUUID(),
        expectedPreviousMealRecordId: firstMealRecordId,
        mealRecordId: randomUUID(),
        eventRecordId: randomUUID(),
        eventId: randomUUID(),
        meal: {
          ...original,
          revision: 2,
          occurredAt: '2026-10-18T10:00:00.000Z',
          localDate: '2026-10-18',
          nutrition: [
            {
              state: 'known',
              nutrientId: 'source.usda-fdc.1089',
              amount: '4',
              unit: { system: 'ucum', code: 'mg' },
            },
          ],
          note: 'Corrected time and amount',
          recordedAt: AS_OF,
        },
      });
      const replayed = await state.recomputeWindow(AS_OF);
      expect(replayed.newSnapshotCount).toBe(3);
      expect(
        nutrient(replayed.completed[5]!, 'nutrient.iron').knownRecordedSubtotal,
      ).toBe('4');
      expect(replayed.completed[6]?.recordedMealCount).toBe(0);
      const records = await repository.listBySubject(OWNER);
      const corrected = records.filter(
        (record) =>
          record.recordType === 'nutrition-state.daily-snapshot' &&
          record.logicalVersion === 2,
      );
      expect(corrected).toHaveLength(2);
      expect(corrected.every((record) => record.correctionOf)).toBe(true);
      expect(
        records.filter(
          (record) => record.recordType === 'nutrition-state.rolling-snapshot',
        ),
      ).toHaveLength(2);
    } finally {
      await repository.close();
    }
  });

  it('recomputes historical days and dependent rolling windows after a late time correction', async () => {
    const repository = await IndexedDbCanonicalRecordRepository.create({
      databaseName: `nutrition-state-history-${randomUUID()}`,
      indexedDB: new IDBFactory(),
      keyRange: IDBKeyRange,
      verifyRecord: (record: CanonicalRecordV1) =>
        verifyCanonicalRecordV1(record, digest),
      createId: randomUUID,
      now: () => AS_OF,
      deleteOnClose: true,
    });
    try {
      const consumption = new ConsumptionLedgerV1({
        repository,
        digestSha256Hex: digest,
      });
      const original = meal('2026-10-11T10:00:00.000Z', [
        {
          state: 'known',
          nutrientId: 'source.usda-fdc.1089',
          amount: '5',
          unit: { system: 'ucum', code: 'mg' },
        },
      ]);
      const originalRecordId = randomUUID();
      await consumption.recordMeal({
        commandId: randomUUID(),
        mealRecordId: originalRecordId,
        eventRecordId: randomUUID(),
        eventId: randomUUID(),
        meal: original,
      });
      const state = new LocalNutritionStateLedgerV1({
        repository,
        digestSha256Hex: digest,
        createId: randomUUID,
        now: () => AS_OF,
        ownerSubjectId: OWNER,
        dayPolicy: UTC_POLICY,
        targetRelease: getAdultDriBaselineReleaseV1(),
        marketCode: 'US',
        contextForPeriod: context,
      });
      await state.recomputeWindow('2026-10-11T12:00:00.000Z');
      await consumption.correctMeal({
        commandId: randomUUID(),
        expectedPreviousMealRecordId: originalRecordId,
        mealRecordId: randomUUID(),
        eventRecordId: randomUUID(),
        eventId: randomUUID(),
        meal: {
          ...original,
          revision: 2,
          occurredAt: '2026-10-10T10:00:00.000Z',
          localDate: '2026-10-10',
          note: 'Corrected nutrition day',
        },
      });
      expect(
        await state.recomputeAfterMealCorrection([
          original.occurredAt,
          '2026-10-10T10:00:00.000Z',
        ]),
      ).toBeGreaterThan(0);
      const records = await repository.listBySubject(OWNER);
      const oldDay = state.periodAt(original.occurredAt).periodId;
      const oldDaySnapshots = records.filter(
        (record) =>
          record.recordType === 'nutrition-state.daily-snapshot' &&
          (record.payload as { periodKey?: string }).periodKey === oldDay,
      );
      expect(
        oldDaySnapshots
          .map((record) => record.logicalVersion)
          .sort((left, right) => left - right),
      ).toEqual([1, 2]);
      const correctedDay = await state.recomputeWindow(
        '2026-10-10T12:00:00.000Z',
      );
      expect(correctedDay.current.recordedMealCount).toBe(1);
      expect(
        nutrient(correctedDay.current, 'nutrient.iron').knownRecordedSubtotal,
      ).toBe('5');
    } finally {
      await repository.close();
    }
  });
});
