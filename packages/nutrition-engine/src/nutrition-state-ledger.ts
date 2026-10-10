import {
  canonicalizeJson,
  sealCanonicalRecordV1,
  type CanonicalRecordV1,
  type JsonValue,
  type Sha256HexDigest,
} from '@nutrixx/canonical-schema';
import { ConsumptionLedgerV1 } from '@nutrixx/consumption';
import type { AtomicCanonicalRecordRepository } from '@nutrixx/persistence';

import type { HealthContextSnapshotV1 } from './health-context.js';
import {
  nutritionPeriodAtV1,
  nutritionWindowAtV1,
  type NutritionDayPolicyV1,
  type NutritionPeriodV1,
} from './nutrition-period.js';
import {
  calculateDailyNutritionStateV1,
  calculateRollingNutritionStateV1,
  NUTRITION_STATE_RULE_VERSION_V1,
  type DailyNutritionStateV1,
  type RollingNutritionStateV1,
} from './nutrition-state.js';
import type { TargetPolicyReleaseV1 } from './target-policy.js';

const DAILY_TYPE = 'nutrition-state.daily-snapshot';
const ROLLING_TYPE = 'nutrition-state.rolling-snapshot';

interface SnapshotPayload<State> {
  readonly periodKey: string;
  readonly inputFingerprint: string;
  readonly eventWatermark: string | null;
  readonly state: State;
}

export interface NutritionStateLedgerV1Options {
  readonly repository: AtomicCanonicalRecordRepository;
  readonly digestSha256Hex: Sha256HexDigest;
  readonly createId: () => string;
  readonly now: () => string;
  readonly ownerSubjectId: string;
  readonly dayPolicy: NutritionDayPolicyV1;
  readonly targetRelease: TargetPolicyReleaseV1;
  readonly marketCode?: string;
  readonly contextForPeriod: (
    period: NutritionPeriodV1,
  ) => HealthContextSnapshotV1;
}

export interface NutritionWindowSnapshotV1 {
  readonly current: DailyNutritionStateV1;
  readonly completed: readonly DailyNutritionStateV1[];
  readonly rolling: RollingNutritionStateV1;
  readonly newSnapshotCount: number;
}

function snapshotPayload<State>(
  record: CanonicalRecordV1,
): SnapshotPayload<State> {
  const payload = record.payload as unknown as SnapshotPayload<State>;
  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof payload.periodKey !== 'string' ||
    typeof payload.inputFingerprint !== 'string' ||
    typeof payload.state !== 'object' ||
    payload.state === null
  ) {
    throw new TypeError('A local nutrition snapshot is malformed.');
  }
  return payload;
}

function latestSnapshots(
  records: readonly CanonicalRecordV1[],
): Map<string, CanonicalRecordV1> {
  const latest = new Map<string, CanonicalRecordV1>();
  for (const record of records) {
    if (
      record.recordType !== DAILY_TYPE &&
      record.recordType !== ROLLING_TYPE
    ) {
      continue;
    }
    const key = `${record.recordType}:${snapshotPayload(record).periodKey}`;
    const previous = latest.get(key);
    if (
      previous === undefined ||
      record.logicalVersion > previous.logicalVersion
    ) {
      latest.set(key, record);
    } else if (record.logicalVersion === previous.logicalVersion) {
      throw new TypeError(
        'Conflicting nutrition snapshot versions were found.',
      );
    }
  }
  return latest;
}

export class LocalNutritionStateLedgerV1 {
  public constructor(private readonly options: NutritionStateLedgerV1Options) {}

  private async fingerprint(input: JsonValue): Promise<string> {
    return this.options.digestSha256Hex(canonicalizeJson(input));
  }

  private async createSnapshot<State>(options: {
    type: typeof DAILY_TYPE | typeof ROLLING_TYPE;
    key: string;
    fingerprint: string;
    eventWatermark: string | null;
    state: State;
    previous?: CanonicalRecordV1 | undefined;
    now: string;
  }): Promise<CanonicalRecordV1> {
    const recordId = this.options.createId();
    return sealCanonicalRecordV1(
      {
        format: 'nutrixx.canonical-record',
        schemaVersion: 1,
        recordType: options.type,
        recordVersion: 1,
        recordId,
        subjectId: this.options.ownerSubjectId,
        owningContext: 'nutrition-state',
        logicalVersion: (options.previous?.logicalVersion ?? 0) + 1,
        createdAt: options.now,
        updatedAt: options.now,
        ...(options.previous === undefined
          ? {}
          : { correctionOf: options.previous.recordId }),
        provenance: {
          method: 'calculated',
          source: {
            kind: 'calculation',
            sourceId: NUTRITION_STATE_RULE_VERSION_V1,
          },
          recordedAt: options.now,
        },
        payload: {
          periodKey: options.key,
          inputFingerprint: options.fingerprint,
          eventWatermark: options.eventWatermark,
          state: options.state,
        } as JsonValue,
      },
      this.options.digestSha256Hex,
    );
  }

  public async recomputeWindow(
    asOf: string,
  ): Promise<NutritionWindowSnapshotV1> {
    const { repository, ownerSubjectId } = this.options;
    const calculatedAt = this.options.now();
    if (Date.parse(asOf) > Date.parse(calculatedAt)) {
      throw new RangeError('A future nutrition window cannot be calculated.');
    }
    const window = nutritionWindowAtV1(this.options.dayPolicy, asOf);
    const ledger = new ConsumptionLedgerV1({
      repository,
      digestSha256Hex: this.options.digestSha256Hex,
    });
    const [meals, events, records] = await Promise.all([
      ledger.listCurrentMeals(ownerSubjectId),
      ledger.listEvents(ownerSubjectId),
      repository.listBySubject(ownerSubjectId),
    ]);
    const latest = latestSnapshots(records);
    const watermark =
      events.length === 0
        ? null
        : await this.fingerprint(events.map((event) => event.eventId));
    const newRecords: CanonicalRecordV1[] = [];
    const states: DailyNutritionStateV1[] = [];
    const fingerprints: string[] = [];
    for (const period of [...window.completed, window.current]) {
      const context = this.options.contextForPeriod(period);
      const inputs = meals.filter(
        (meal) =>
          meal.occurredAt >= period.startsAt && meal.occurredAt < period.endsAt,
      );
      const fingerprint = await this.fingerprint({
        ruleVersion: NUTRITION_STATE_RULE_VERSION_V1,
        period,
        meals: inputs,
        context,
        release: this.options.targetRelease,
        marketCode: this.options.marketCode ?? null,
      } as unknown as JsonValue);
      const key = `${DAILY_TYPE}:${period.periodId}`;
      const previous = latest.get(key);
      const state =
        previous &&
        snapshotPayload<DailyNutritionStateV1>(previous).inputFingerprint ===
          fingerprint
          ? snapshotPayload<DailyNutritionStateV1>(previous).state
          : calculateDailyNutritionStateV1({
              ownerSubjectId,
              period,
              meals: inputs,
              context,
              release: this.options.targetRelease,
              marketCode: this.options.marketCode,
              calculatedAt,
            });
      if (
        previous === undefined ||
        snapshotPayload(previous).inputFingerprint !== fingerprint
      ) {
        newRecords.push(
          await this.createSnapshot({
            type: DAILY_TYPE,
            key: period.periodId,
            fingerprint,
            eventWatermark: watermark,
            state,
            previous,
            now: calculatedAt,
          }),
        );
      }
      states.push(state);
      fingerprints.push(fingerprint);
    }
    const completed = states.slice(0, 7);
    const current = states[7];
    if (current === undefined) throw new TypeError('Current period is absent.');
    const rollingKey = window.completed
      .map((period) => period.periodId)
      .join('|');
    const rollingFingerprint = await this.fingerprint({
      ruleVersion: NUTRITION_STATE_RULE_VERSION_V1,
      completedPeriodIds: window.completed.map((period) => period.periodId),
      dailyFingerprints: fingerprints.slice(0, 7),
    });
    const previousRolling = latest.get(`${ROLLING_TYPE}:${rollingKey}`);
    const rolling =
      previousRolling &&
      snapshotPayload<RollingNutritionStateV1>(previousRolling)
        .inputFingerprint === rollingFingerprint
        ? snapshotPayload<RollingNutritionStateV1>(previousRolling).state
        : calculateRollingNutritionStateV1(completed);
    if (
      previousRolling === undefined ||
      snapshotPayload(previousRolling).inputFingerprint !== rollingFingerprint
    ) {
      newRecords.push(
        await this.createSnapshot({
          type: ROLLING_TYPE,
          key: rollingKey,
          fingerprint: rollingFingerprint,
          eventWatermark: watermark,
          state: rolling,
          previous: previousRolling,
          now: calculatedAt,
        }),
      );
    }
    if (newRecords.length > 0) {
      await repository.commit({
        commandId: `nutrition-state:${await this.fingerprint(
          newRecords.map((record) => record.recordId),
        )}`,
        occurredAt: calculatedAt,
        mutations: newRecords.map((record) => ({ kind: 'put', record })),
      });
    }
    return {
      current,
      completed,
      rolling,
      newSnapshotCount: newRecords.length,
    };
  }

  public periodAt(instant: string): NutritionPeriodV1 {
    return nutritionPeriodAtV1(this.options.dayPolicy, instant);
  }

  public async recomputeAfterMealCorrection(
    affectedOccurredAt: readonly string[],
  ): Promise<number> {
    const currentTime = this.options.now();
    const anchors = new Set<string>();
    for (const instant of affectedOccurredAt) {
      let period = this.periodAt(instant);
      for (let index = 0; index <= 7; index += 1) {
        if (Date.parse(period.startsAt) > Date.parse(currentTime)) break;
        anchors.add(period.startsAt);
        period = this.periodAt(period.endsAt);
      }
    }
    let newSnapshotCount = 0;
    for (const anchor of [...anchors].sort()) {
      newSnapshotCount += (await this.recomputeWindow(anchor)).newSnapshotCount;
    }
    return newSnapshotCount;
  }
}
