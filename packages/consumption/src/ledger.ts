import {
  sealCanonicalRecordV1,
  type CanonicalRecordV1,
  type JsonValue,
  type Sha256HexDigest,
} from '@nutrixx/canonical-schema';
import type {
  AtomicCanonicalRecordRepository,
  CanonicalTransactionResult,
} from '@nutrixx/persistence';

import {
  ConsumptionEventRecordV1Schema,
  CorrectMealCommandV1Schema,
  MealHeadRecordV1Schema,
  MealRevisionRecordV1Schema,
  RecordMealCommandV1Schema,
  type ConsumptionEventV1,
  type CorrectMealCommandV1,
  type MealHeadV1,
  type MealRevisionV1,
  type RecordMealCommandV1,
} from './model.js';

export interface ConsumptionLedgerV1Options {
  readonly repository: AtomicCanonicalRecordRepository;
  readonly digestSha256Hex: Sha256HexDigest;
}

function assertDistinctRecordIds(ids: readonly string[]): void {
  if (new Set(ids).size !== ids.length) {
    throw new TypeError(
      'A consumption transaction requires distinct record identifiers.',
    );
  }
}

export class ConsumptionLedgerV1 {
  readonly #repository: AtomicCanonicalRecordRepository;
  readonly #digestSha256Hex: Sha256HexDigest;

  public constructor(options: ConsumptionLedgerV1Options) {
    this.#repository = options.repository;
    this.#digestSha256Hex = options.digestSha256Hex;
  }

  async #seal(input: Omit<CanonicalRecordV1, 'integrity'>) {
    return sealCanonicalRecordV1(input, this.#digestSha256Hex);
  }

  async #eventRecord(
    eventRecordId: string,
    event: ConsumptionEventV1,
    meal: MealRevisionV1,
  ) {
    return this.#seal({
      format: 'nutrixx.canonical-record',
      schemaVersion: 1,
      recordType: 'consumption.event',
      recordVersion: 1,
      recordId: eventRecordId,
      subjectId: meal.ownerSubjectId,
      owningContext: 'consumption',
      logicalVersion: 1,
      createdAt: event.occurredAt,
      updatedAt: event.occurredAt,
      provenance: meal.provenance,
      payload: event as unknown as JsonValue,
    });
  }

  async #mealRecord(
    recordId: string,
    meal: MealRevisionV1,
    correctionOf?: string,
  ) {
    return this.#seal({
      format: 'nutrixx.canonical-record',
      schemaVersion: 1,
      recordType: 'consumption.meal-revision',
      recordVersion: 1,
      recordId,
      subjectId: meal.ownerSubjectId,
      owningContext: 'consumption',
      logicalVersion: meal.revision,
      createdAt: meal.recordedAt,
      updatedAt: meal.recordedAt,
      ...(correctionOf === undefined ? {} : { correctionOf }),
      provenance: meal.provenance,
      payload: meal as unknown as JsonValue,
    });
  }

  async #headRecord(head: MealHeadV1, createdAt: string, meal: MealRevisionV1) {
    return this.#seal({
      format: 'nutrixx.canonical-record',
      schemaVersion: 1,
      recordType: 'consumption.meal-head',
      recordVersion: 1,
      recordId: head.mealId,
      subjectId: head.ownerSubjectId,
      owningContext: 'consumption',
      logicalVersion: head.activeRevision,
      createdAt,
      updatedAt: meal.recordedAt,
      provenance: meal.provenance,
      payload: head as unknown as JsonValue,
    });
  }

  public async recordMeal(
    commandInput: RecordMealCommandV1,
  ): Promise<CanonicalTransactionResult> {
    const command = RecordMealCommandV1Schema.parse(commandInput);
    const { meal } = command;
    if (meal.revision !== 1 || meal.state !== 'recorded') {
      throw new TypeError('An initial meal must be a recorded revision one.');
    }
    assertDistinctRecordIds([
      meal.mealId,
      command.mealRecordId,
      command.eventRecordId,
    ]);

    const existingHeadInput = await this.#repository.getById(meal.mealId);
    let headCreatedAt = meal.recordedAt;
    if (existingHeadInput !== null) {
      const existingHead = MealHeadRecordV1Schema.parse(existingHeadInput);
      if (
        existingHead.payload.activeRevision !== 1 ||
        existingHead.payload.activeMealRecordId !== command.mealRecordId ||
        existingHead.payload.ownerSubjectId !== meal.ownerSubjectId
      ) {
        throw new TypeError('The meal identity is already in use.');
      }
      headCreatedAt = existingHead.createdAt;
    }

    const head: MealHeadV1 = {
      mealId: meal.mealId,
      ownerSubjectId: meal.ownerSubjectId,
      activeRevision: 1,
      activeMealRecordId: command.mealRecordId,
      state: 'recorded',
    };
    const event: ConsumptionEventV1 = {
      eventId: command.eventId,
      eventType: 'meal.recorded',
      ownerSubjectId: meal.ownerSubjectId,
      mealId: meal.mealId,
      mealRevision: 1,
      mealRecordId: command.mealRecordId,
      mealOccurredAt: meal.occurredAt,
      occurredAt: meal.recordedAt,
    };
    const records = await Promise.all([
      this.#headRecord(head, headCreatedAt, meal),
      this.#mealRecord(command.mealRecordId, meal),
      this.#eventRecord(command.eventRecordId, event, meal),
    ]);
    return this.#repository.commit({
      commandId: command.commandId,
      occurredAt: meal.recordedAt,
      mutations: records.map((record) => ({ kind: 'put' as const, record })),
    });
  }

  public async correctMeal(
    commandInput: CorrectMealCommandV1,
  ): Promise<CanonicalTransactionResult> {
    const command = CorrectMealCommandV1Schema.parse(commandInput);
    const { meal } = command;
    assertDistinctRecordIds([
      meal.mealId,
      command.mealRecordId,
      command.eventRecordId,
    ]);
    const headInput = await this.#repository.getById(meal.mealId);
    if (headInput === null) {
      throw new TypeError('The meal must exist before correction.');
    }
    const headRecord = MealHeadRecordV1Schema.parse(headInput);
    const replay =
      headRecord.payload.activeRevision === meal.revision &&
      headRecord.payload.activeMealRecordId === command.mealRecordId;
    if (
      !replay &&
      headRecord.payload.activeMealRecordId !==
        command.expectedPreviousMealRecordId
    ) {
      throw new TypeError('The correction is based on a stale meal revision.');
    }
    if (meal.ownerSubjectId !== headRecord.payload.ownerSubjectId) {
      throw new TypeError('A correction cannot change meal ownership.');
    }
    const expectedRevision = replay
      ? headRecord.payload.activeRevision
      : headRecord.payload.activeRevision + 1;
    if (meal.revision !== expectedRevision) {
      throw new TypeError(`Meal revision ${expectedRevision} is required.`);
    }

    const previousInput = await this.#repository.getById(
      command.expectedPreviousMealRecordId,
    );
    if (previousInput === null) {
      throw new TypeError('The previous meal revision is unavailable.');
    }
    const previous = MealRevisionRecordV1Schema.parse(previousInput);
    if (
      previous.payload.mealId !== meal.mealId ||
      previous.payload.revision + 1 !== meal.revision
    ) {
      throw new TypeError('The correction lineage is invalid.');
    }
    if (Date.parse(meal.recordedAt) < Date.parse(previous.payload.recordedAt)) {
      throw new TypeError('Correction time must remain monotonic.');
    }

    const head: MealHeadV1 = {
      mealId: meal.mealId,
      ownerSubjectId: meal.ownerSubjectId,
      activeRevision: meal.revision,
      activeMealRecordId: command.mealRecordId,
      state: meal.state,
    };
    const event: ConsumptionEventV1 = {
      eventId: command.eventId,
      eventType: meal.state === 'voided' ? 'meal.voided' : 'meal.corrected',
      ownerSubjectId: meal.ownerSubjectId,
      mealId: meal.mealId,
      mealRevision: meal.revision,
      mealRecordId: command.mealRecordId,
      mealOccurredAt: meal.occurredAt,
      occurredAt: meal.recordedAt,
    };
    const records = await Promise.all([
      this.#headRecord(head, headRecord.createdAt, meal),
      this.#mealRecord(
        command.mealRecordId,
        meal,
        command.expectedPreviousMealRecordId,
      ),
      this.#eventRecord(command.eventRecordId, event, meal),
    ]);
    return this.#repository.commit({
      commandId: command.commandId,
      occurredAt: meal.recordedAt,
      mutations: records.map((record) => ({ kind: 'put' as const, record })),
    });
  }

  public async getMealHistory(
    ownerSubjectId: string,
    mealId: string,
  ): Promise<readonly MealRevisionV1[]> {
    const records = await this.#repository.listBySubject(ownerSubjectId);
    return records
      .map((record) => MealRevisionRecordV1Schema.safeParse(record))
      .flatMap((result) =>
        result.success && result.data.payload.mealId === mealId
          ? [result.data.payload]
          : [],
      )
      .sort((left, right) => left.revision - right.revision);
  }

  public async listCurrentMeals(
    ownerSubjectId: string,
  ): Promise<readonly MealRevisionV1[]> {
    const records = await this.#repository.listBySubject(ownerSubjectId);
    const heads = records
      .map((record) => MealHeadRecordV1Schema.safeParse(record))
      .flatMap((result) =>
        result.success && result.data.payload.state === 'recorded'
          ? [result.data.payload]
          : [],
      );
    const current = await Promise.all(
      heads.map(async (head) => {
        const record = await this.#repository.getById(head.activeMealRecordId);
        return record === null
          ? null
          : MealRevisionRecordV1Schema.parse(record).payload;
      }),
    );
    return current
      .filter((meal): meal is MealRevisionV1 => meal !== null)
      .sort(
        (left, right) =>
          Date.parse(right.occurredAt) - Date.parse(left.occurredAt),
      );
  }

  public async listEvents(
    ownerSubjectId: string,
  ): Promise<readonly ConsumptionEventV1[]> {
    const records = await this.#repository.listBySubject(ownerSubjectId);
    return records
      .map((record) => ConsumptionEventRecordV1Schema.safeParse(record))
      .flatMap((result) => (result.success ? [result.data.payload] : []))
      .sort(
        (left, right) =>
          Date.parse(left.occurredAt) - Date.parse(right.occurredAt),
      );
  }
}
