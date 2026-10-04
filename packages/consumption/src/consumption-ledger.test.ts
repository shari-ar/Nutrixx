import { createHash } from 'node:crypto';

import {
  verifyCanonicalRecordV1,
  type CanonicalRecordV1,
} from '@nutrixx/canonical-schema';
import { IndexedDbCanonicalRecordRepository } from '@nutrixx/persistence-indexeddb';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import { ConsumptionLedgerV1 } from './ledger.js';
import {
  MealRevisionV1Schema,
  type CorrectMealCommandV1,
  type MealRevisionV1,
  type RecordMealCommandV1,
} from './model.js';

const OWNER_ID = '10000000-0000-4000-8000-000000000001';
const MEAL_ID = '20000000-0000-4000-8000-000000000001';
const FOOD_ID = '30000000-0000-4000-8000-000000000001';
const ITEM_ID = '40000000-0000-4000-8000-000000000001';
const FIRST_RECORD_ID = '50000000-0000-4000-8000-000000000001';
const SECOND_RECORD_ID = '50000000-0000-4000-8000-000000000002';
const THIRD_RECORD_ID = '50000000-0000-4000-8000-000000000003';
const FIRST_EVENT_RECORD_ID = '60000000-0000-4000-8000-000000000001';
const SECOND_EVENT_RECORD_ID = '60000000-0000-4000-8000-000000000002';
const THIRD_EVENT_RECORD_ID = '60000000-0000-4000-8000-000000000003';
const FIRST_EVENT_ID = '70000000-0000-4000-8000-000000000001';
const SECOND_EVENT_ID = '70000000-0000-4000-8000-000000000002';
const THIRD_EVENT_ID = '70000000-0000-4000-8000-000000000003';
const OCCURRED_AT = '2026-10-04T10:00:00.000Z';
const FIRST_RECORDED_AT = '2026-10-04T10:05:00.000Z';
const SECOND_RECORDED_AT = '2026-10-04T10:10:00.000Z';
const THIRD_RECORDED_AT = '2026-10-04T10:15:00.000Z';

const digest = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');
const verify = (record: CanonicalRecordV1) =>
  verifyCanonicalRecordV1(record, digest);

function meal(overrides: Partial<MealRevisionV1> = {}): MealRevisionV1 {
  return {
    mealId: MEAL_ID,
    ownerSubjectId: OWNER_ID,
    revision: 1,
    state: 'recorded',
    occurredAt: OCCURRED_AT,
    localDate: '2026-10-04',
    timeZone: 'America/New_York',
    mealType: 'breakfast',
    items: [
      {
        itemId: ITEM_ID,
        position: 1,
        displayNameSnapshot: 'Oatmeal',
        preparationState: 'cooked',
        reference: {
          kind: 'food',
          catalogReleaseId: 'food-catalog-usda-2026-04-30.1',
          foodId: FOOD_ID,
          foodRevision: 1,
        },
        consumedQuantity: {
          amount: '1',
          unit: { system: 'nutrixx', code: 'portion.bowl' },
        },
        edibleGramWeight: '250',
        provenance: {
          method: 'user-entered',
          source: { kind: 'user', sourceId: OWNER_ID },
          recordedAt: FIRST_RECORDED_AT,
        },
      },
    ],
    provenance: {
      method: 'user-entered',
      source: { kind: 'user', sourceId: OWNER_ID },
      recordedAt: FIRST_RECORDED_AT,
    },
    recordedAt: FIRST_RECORDED_AT,
    ...overrides,
  };
}

function initialCommand(): RecordMealCommandV1 {
  return {
    commandId: 'record-meal-1',
    mealRecordId: FIRST_RECORD_ID,
    eventRecordId: FIRST_EVENT_RECORD_ID,
    eventId: FIRST_EVENT_ID,
    meal: meal(),
  };
}

function correctionCommand(
  overrides: Partial<CorrectMealCommandV1> = {},
): CorrectMealCommandV1 {
  const corrected = meal({
    revision: 2,
    items: [
      {
        ...meal().items[0]!,
        edibleGramWeight: '300',
        provenance: {
          ...meal().items[0]!.provenance,
          recordedAt: SECOND_RECORDED_AT,
        },
      },
    ],
    note: 'Corrected portion size',
    provenance: {
      ...meal().provenance,
      recordedAt: SECOND_RECORDED_AT,
    },
    recordedAt: SECOND_RECORDED_AT,
  });
  return {
    commandId: 'correct-meal-1',
    expectedPreviousMealRecordId: FIRST_RECORD_ID,
    mealRecordId: SECOND_RECORD_ID,
    eventRecordId: SECOND_EVENT_RECORD_ID,
    eventId: SECOND_EVENT_ID,
    meal: corrected,
    ...overrides,
  };
}

async function harness() {
  const indexedDB = new IDBFactory();
  const repository = await IndexedDbCanonicalRecordRepository.create({
    databaseName: `nutrixx-consumption-${MEAL_ID}`,
    indexedDB,
    keyRange: IDBKeyRange,
    verifyRecord: verify,
    createId: () => THIRD_EVENT_ID,
    now: () => THIRD_RECORDED_AT,
    deleteOnClose: true,
  });
  return {
    repository,
    ledger: new ConsumptionLedgerV1({
      repository,
      digestSha256Hex: digest,
    }),
  };
}

describe('Consumption intake ledger', () => {
  it('validates local civil date and exact catalog release references', () => {
    expect(MealRevisionV1Schema.safeParse(meal()).success).toBe(true);
    expect(
      MealRevisionV1Schema.safeParse(meal({ localDate: '2026-10-03' })).success,
    ).toBe(false);
    const withoutRelease = structuredClone(meal()) as Record<string, unknown>;
    const items = withoutRelease['items'] as Array<Record<string, unknown>>;
    items[0]!['reference'] = {
      kind: 'food',
      foodId: FOOD_ID,
      foodRevision: 1,
    };
    expect(MealRevisionV1Schema.safeParse(withoutRelease).success).toBe(false);
  });

  it('commits meal, head, and MealRecorded event atomically', async () => {
    const { ledger, repository } = await harness();
    const result = await ledger.recordMeal(initialCommand());
    expect(result).toMatchObject({
      replayed: false,
      entry: { sequence: 1, mutations: [{}, {}, {}] },
    });
    await expect(ledger.listCurrentMeals(OWNER_ID)).resolves.toMatchObject([
      { mealId: MEAL_ID, revision: 1, state: 'recorded' },
    ]);
    await expect(ledger.listEvents(OWNER_ID)).resolves.toMatchObject([
      { eventType: 'meal.recorded', mealRevision: 1 },
    ]);
    await repository.close();
  });

  it('replays an identical command without duplicating ledger facts', async () => {
    const { ledger, repository } = await harness();
    const command = initialCommand();
    await ledger.recordMeal(command);
    await expect(ledger.recordMeal(command)).resolves.toMatchObject({
      replayed: true,
      entry: { sequence: 1 },
    });
    await expect(
      ledger.getMealHistory(OWNER_ID, MEAL_ID),
    ).resolves.toHaveLength(1);
    await repository.close();
  });

  it('appends a correction while preserving the original revision', async () => {
    const { ledger, repository } = await harness();
    await ledger.recordMeal(initialCommand());
    await ledger.correctMeal(correctionCommand());
    const history = await ledger.getMealHistory(OWNER_ID, MEAL_ID);
    expect(history.map(({ revision }) => revision)).toEqual([1, 2]);
    expect(history[0]?.items[0]?.edibleGramWeight).toBe('250');
    expect(history[1]?.items[0]?.edibleGramWeight).toBe('300');
    await expect(ledger.listCurrentMeals(OWNER_ID)).resolves.toMatchObject([
      { revision: 2, note: 'Corrected portion size' },
    ]);
    await expect(ledger.listEvents(OWNER_ID)).resolves.toMatchObject([
      { eventType: 'meal.recorded' },
      { eventType: 'meal.corrected' },
    ]);
    await repository.close();
  });

  it('rejects a stale competing correction', async () => {
    const { ledger, repository } = await harness();
    await ledger.recordMeal(initialCommand());
    await ledger.correctMeal(correctionCommand());
    await expect(
      ledger.correctMeal(
        correctionCommand({
          commandId: 'stale-correction',
          mealRecordId: THIRD_RECORD_ID,
          eventRecordId: THIRD_EVENT_RECORD_ID,
          eventId: THIRD_EVENT_ID,
        }),
      ),
    ).rejects.toThrow(/stale meal revision/u);
    await repository.close();
  });

  it('voids a meal through a retained third revision', async () => {
    const { ledger, repository } = await harness();
    await ledger.recordMeal(initialCommand());
    await ledger.correctMeal(correctionCommand());
    await ledger.correctMeal({
      commandId: 'void-meal-1',
      expectedPreviousMealRecordId: SECOND_RECORD_ID,
      mealRecordId: THIRD_RECORD_ID,
      eventRecordId: THIRD_EVENT_RECORD_ID,
      eventId: THIRD_EVENT_ID,
      meal: meal({
        revision: 3,
        state: 'voided',
        items: [],
        note: 'Logged on the wrong day',
        provenance: {
          ...meal().provenance,
          recordedAt: THIRD_RECORDED_AT,
        },
        recordedAt: THIRD_RECORDED_AT,
      }),
    });
    await expect(ledger.listCurrentMeals(OWNER_ID)).resolves.toEqual([]);
    await expect(
      ledger.getMealHistory(OWNER_ID, MEAL_ID),
    ).resolves.toHaveLength(3);
    await expect(ledger.listEvents(OWNER_ID)).resolves.toMatchObject([
      { eventType: 'meal.recorded' },
      { eventType: 'meal.corrected' },
      { eventType: 'meal.voided' },
    ]);
    await repository.close();
  });
});
