import {
  sealCanonicalRecordV1,
  verifyCanonicalRecordV1,
  type CanonicalRecordV1,
} from '@nutrixx/canonical-schema';
import { ConsumptionLedgerV1, type MealRevisionV1 } from '@nutrixx/consumption';
import {
  assessHealthContextV1,
  estimateEnergyRequirementV1,
  getAdultDriBaselineReleaseV1,
  LocalNutritionStateLedgerV1,
  NutritionDayPolicyV1Schema,
  nutritionPeriodAtV1,
  type NutritionDayPolicyV1,
  type NutritionWindowSnapshotV1,
  type EnergyRequirementResultV1,
} from '@nutrixx/nutrition-engine';
import {
  IndexedDbCanonicalRecordRepository,
  sha256Canonical,
} from '@nutrixx/persistence-indexeddb';

import { BrowserOnboardingStore } from './browser-onboarding';
import { LOCAL_USER_DATABASE_NAME } from './storage-constants';

import type { StartingProfileV1 } from '@nutrixx/user-context';

const MARKET_RECORD_TYPE = 'user-context.nutrition-market';
const DAY_POLICY_RECORD_TYPE = 'user-context.nutrition-day-policy';
const ACTIVITY_RECORD_TYPE = 'user-context.activity-level';
const DAY_POLICY_VERSION = 'nutrition-day-zone-v1';

export type NutritionTargetMarketV1 = 'US' | 'CA';
export type NutritionActivityLevelV1 =
  | 'inactive'
  | 'low'
  | 'active'
  | 'very-active';

export interface BrowserEnergyRequirementV1 {
  readonly activityLevel: NutritionActivityLevelV1 | null;
  readonly result: EnergyRequirementResultV1;
}

export interface BrowserNutritionSnapshotV1 {
  readonly market: NutritionTargetMarketV1 | null;
  readonly dayPolicy: NutritionDayPolicyV1;
  readonly deviceTimeZone: string;
  readonly window: NutritionWindowSnapshotV1;
  readonly meals: readonly MealRevisionV1[];
}

export type NutritionLockRunner = <T>(
  name: string,
  operation: () => Promise<T>,
) => Promise<T>;

export interface BrowserNutritionStateDependencies {
  readonly indexedDB: IDBFactory;
  readonly keyRange: typeof IDBKeyRange;
  readonly createId: () => string;
  readonly now: () => string;
  readonly timeZone: () => string;
  readonly onboarding: Pick<BrowserOnboardingStore, 'load'>;
  readonly runExclusive?: NutritionLockRunner;
}

function browserNutritionLock<T>(
  name: string,
  operation: () => Promise<T>,
): Promise<T> {
  const manager = globalThis.navigator?.locks;
  if (manager === undefined) {
    throw new Error(
      'Local nutrition calculation requires Web Locks in a secure browser context.',
    );
  }
  return manager.request(name, { mode: 'exclusive' }, operation);
}

function defaults(): BrowserNutritionStateDependencies {
  return {
    indexedDB,
    keyRange: IDBKeyRange,
    createId: () => crypto.randomUUID(),
    now: () => new Date().toISOString(),
    timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    onboarding: new BrowserOnboardingStore(),
  };
}

function latestMarketRecord(
  records: readonly CanonicalRecordV1[],
): CanonicalRecordV1 | null {
  let latest: CanonicalRecordV1 | null = null;
  for (const record of records) {
    if (record.recordType !== MARKET_RECORD_TYPE) continue;
    if (latest === null || record.logicalVersion > latest.logicalVersion) {
      latest = record;
    } else if (record.logicalVersion === latest.logicalVersion) {
      throw new TypeError('Conflicting nutrition market settings were found.');
    }
  }
  return latest;
}

function marketFromRecord(
  record: CanonicalRecordV1 | null,
): NutritionTargetMarketV1 | null {
  if (record === null) return null;
  const payload = record.payload;
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload) ||
    (payload['market'] !== 'US' && payload['market'] !== 'CA')
  ) {
    throw new TypeError('The stored nutrition market is invalid.');
  }
  return payload['market'];
}

function latestActivityRecord(
  records: readonly CanonicalRecordV1[],
): CanonicalRecordV1 | null {
  let latest: CanonicalRecordV1 | null = null;
  for (const record of records) {
    if (record.recordType !== ACTIVITY_RECORD_TYPE) continue;
    if (latest === null || record.logicalVersion > latest.logicalVersion) {
      latest = record;
    } else if (record.logicalVersion === latest.logicalVersion) {
      throw new TypeError('Conflicting activity-level settings were found.');
    }
  }
  return latest;
}

function activityFromRecord(
  record: CanonicalRecordV1 | null,
): NutritionActivityLevelV1 | null {
  if (record === null) return null;
  const payload = record.payload;
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload) ||
    typeof payload['activityLevel'] !== 'string' ||
    !['inactive', 'low', 'active', 'very-active'].includes(
      payload['activityLevel'],
    )
  ) {
    throw new TypeError('The stored activity level is invalid.');
  }
  return payload['activityLevel'] as NutritionActivityLevelV1;
}

function latestDayPolicyRecord(
  records: readonly CanonicalRecordV1[],
): CanonicalRecordV1 | null {
  let latest: CanonicalRecordV1 | null = null;
  for (const record of records) {
    if (record.recordType !== DAY_POLICY_RECORD_TYPE) continue;
    if (latest === null || record.logicalVersion > latest.logicalVersion) {
      latest = record;
    } else if (record.logicalVersion === latest.logicalVersion) {
      throw new TypeError('Conflicting nutrition-day policies were found.');
    }
  }
  return latest;
}

function dayPolicyFromRecord(
  record: CanonicalRecordV1 | null,
  profile: StartingProfileV1,
): NutritionDayPolicyV1 {
  if (record === null) {
    return {
      policyVersion: DAY_POLICY_VERSION,
      initialTimeZone: profile.timeZone,
      changes: [],
    };
  }
  const policy = NutritionDayPolicyV1Schema.parse(record.payload);
  if (policy.policyVersion !== DAY_POLICY_VERSION) {
    throw new TypeError('The stored nutrition-day policy is inconsistent.');
  }
  return policy;
}

function validatedTimeZone(timeZone: string): string {
  const trimmed = timeZone.trim();
  if (trimmed.length === 0 || trimmed.length > 255) {
    throw new TypeError('Choose a valid IANA time zone.');
  }
  new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).format();
  return trimmed;
}

function createLedger(options: {
  readonly repository: IndexedDbCanonicalRecordRepository;
  readonly profile: StartingProfileV1;
  readonly market: NutritionTargetMarketV1 | null;
  readonly dayPolicy: NutritionDayPolicyV1;
  readonly createId: () => string;
  readonly now: string;
}): LocalNutritionStateLedgerV1 {
  return new LocalNutritionStateLedgerV1({
    repository: options.repository,
    digestSha256Hex: sha256Canonical,
    createId: options.createId,
    now: () => options.now,
    ownerSubjectId: options.profile.ownerSubjectId,
    dayPolicy: options.dayPolicy,
    targetRelease: getAdultDriBaselineReleaseV1(),
    ...(options.market === null ? {} : { marketCode: options.market }),
    contextForPeriod: (period) =>
      assessHealthContextV1({
        profile: { ...options.profile, timeZone: period.timeZone },
        assessedAt:
          period.startsAt > options.profile.updatedAt
            ? period.startsAt
            : options.profile.updatedAt,
      }),
  });
}

export class BrowserNutritionStateStore {
  private inFlightLoad: Promise<BrowserNutritionSnapshotV1> | null = null;

  public constructor(
    private readonly dependencies: BrowserNutritionStateDependencies = defaults(),
  ) {}

  private async withRepository<T>(
    operation: (
      repository: IndexedDbCanonicalRecordRepository,
      profile: StartingProfileV1,
    ) => Promise<T>,
    exclusiveNutritionCalculation = false,
  ): Promise<T> {
    const profile = await this.dependencies.onboarding.load();
    if (profile === null) throw new Error('A starting profile is required.');
    const execute = async () => {
      const repository = await IndexedDbCanonicalRecordRepository.create({
        databaseName: LOCAL_USER_DATABASE_NAME,
        indexedDB: this.dependencies.indexedDB,
        keyRange: this.dependencies.keyRange,
        verifyRecord: (record) =>
          verifyCanonicalRecordV1(record, sha256Canonical),
      });
      try {
        return await operation(repository, profile);
      } finally {
        await repository.close();
      }
    };
    if (!exclusiveNutritionCalculation) return execute();
    return (this.dependencies.runExclusive ?? browserNutritionLock)(
      `nutrixx:nutrition-state:${profile.ownerSubjectId}`,
      execute,
    );
  }

  public async load(): Promise<BrowserNutritionSnapshotV1> {
    if (this.inFlightLoad !== null) return this.inFlightLoad;
    const pending = this.withRepository(async (repository, profile) => {
      const records = await repository.listBySubject(profile.ownerSubjectId);
      const market = marketFromRecord(latestMarketRecord(records));
      const dayPolicy = dayPolicyFromRecord(
        latestDayPolicyRecord(records),
        profile,
      );
      const now = this.dependencies.now();
      const ledger = createLedger({
        repository,
        profile,
        market,
        dayPolicy,
        createId: this.dependencies.createId,
        now,
      });
      const window = await ledger.recomputeWindow(now);
      const meals = await new ConsumptionLedgerV1({
        repository,
        digestSha256Hex: sha256Canonical,
      }).listCurrentMeals(profile.ownerSubjectId);
      return {
        market,
        dayPolicy,
        deviceTimeZone: validatedTimeZone(this.dependencies.timeZone()),
        window,
        meals,
      };
    }, true);
    this.inFlightLoad = pending;
    try {
      return await pending;
    } finally {
      if (this.inFlightLoad === pending) this.inFlightLoad = null;
    }
  }

  public async loadEnergyRequirement(): Promise<BrowserEnergyRequirementV1> {
    return this.withRepository(async (repository, profile) => {
      const records = await repository.listBySubject(profile.ownerSubjectId);
      const activityLevel = activityFromRecord(latestActivityRecord(records));
      const context = assessHealthContextV1({
        profile,
        assessedAt: this.dependencies.now(),
        ...(activityLevel === null ? {} : { activityLevel }),
      });
      return {
        activityLevel,
        result: estimateEnergyRequirementV1(context),
      };
    });
  }

  public async selectActivityLevel(
    activityLevel: NutritionActivityLevelV1,
  ): Promise<void> {
    if (!['inactive', 'low', 'active', 'very-active'].includes(activityLevel)) {
      throw new TypeError('Choose a supported activity level.');
    }
    await this.withRepository(async (repository, profile) => {
      const records = await repository.listBySubject(profile.ownerSubjectId);
      const previous = latestActivityRecord(records);
      if (activityFromRecord(previous) === activityLevel) return;
      const now = this.dependencies.now();
      const record = await sealCanonicalRecordV1(
        {
          format: 'nutrixx.canonical-record',
          schemaVersion: 1,
          recordType: ACTIVITY_RECORD_TYPE,
          recordVersion: 1,
          recordId: this.dependencies.createId(),
          subjectId: profile.ownerSubjectId,
          owningContext: 'user-context',
          logicalVersion: (previous?.logicalVersion ?? 0) + 1,
          createdAt: now,
          updatedAt: now,
          ...(previous === null ? {} : { correctionOf: previous.recordId }),
          provenance: {
            method: 'user-entered',
            source: { kind: 'user', sourceId: profile.ownerSubjectId },
            recordedAt: now,
          },
          payload: { activityLevel },
        },
        sha256Canonical,
      );
      await repository.commit({
        commandId: `activity-level:${this.dependencies.createId()}`,
        occurredAt: now,
        mutations: [{ kind: 'put', record }],
      });
    });
  }

  public async selectMarket(market: NutritionTargetMarketV1): Promise<void> {
    if (market !== 'US' && market !== 'CA') {
      throw new TypeError('The target market must be US or Canada.');
    }
    await this.withRepository(async (repository, profile) => {
      const records = await repository.listBySubject(profile.ownerSubjectId);
      const previous = latestMarketRecord(records);
      if (marketFromRecord(previous) === market) return;
      const now = this.dependencies.now();
      const record = await sealCanonicalRecordV1(
        {
          format: 'nutrixx.canonical-record',
          schemaVersion: 1,
          recordType: MARKET_RECORD_TYPE,
          recordVersion: 1,
          recordId: this.dependencies.createId(),
          subjectId: profile.ownerSubjectId,
          owningContext: 'user-context',
          logicalVersion: (previous?.logicalVersion ?? 0) + 1,
          createdAt: now,
          updatedAt: now,
          ...(previous === null ? {} : { correctionOf: previous.recordId }),
          provenance: {
            method: 'user-entered',
            source: { kind: 'user', sourceId: profile.ownerSubjectId },
            recordedAt: now,
          },
          payload: { market },
        },
        sha256Canonical,
      );
      await repository.commit({
        commandId: `nutrition-market:${this.dependencies.createId()}`,
        occurredAt: now,
        mutations: [{ kind: 'put', record }],
      });
    });
  }

  public async scheduleTimeZoneChange(
    timeZone: string,
    expectedEffectiveAt: string,
  ): Promise<void> {
    const selectedZone = validatedTimeZone(timeZone);
    await this.withRepository(async (repository, profile) => {
      const records = await repository.listBySubject(profile.ownerSubjectId);
      const previous = latestDayPolicyRecord(records);
      const policy = dayPolicyFromRecord(previous, profile);
      const now = this.dependencies.now();
      const current = nutritionPeriodAtV1(policy, now);
      if (current.endsAt !== expectedEffectiveAt) {
        throw new Error(
          'The next nutrition-day boundary changed. Review it again.',
        );
      }
      const pastChanges = policy.changes.filter(
        (change) => change.effectiveAt <= now,
      );
      const nextPolicy: NutritionDayPolicyV1 = {
        ...policy,
        changes:
          selectedZone === current.timeZone
            ? pastChanges
            : [
                ...pastChanges,
                { effectiveAt: current.endsAt, timeZone: selectedZone },
              ],
      };
      if (JSON.stringify(nextPolicy) === JSON.stringify(policy)) return;
      const record = await sealCanonicalRecordV1(
        {
          format: 'nutrixx.canonical-record',
          schemaVersion: 1,
          recordType: DAY_POLICY_RECORD_TYPE,
          recordVersion: 1,
          recordId: this.dependencies.createId(),
          subjectId: profile.ownerSubjectId,
          owningContext: 'user-context',
          logicalVersion: (previous?.logicalVersion ?? 0) + 1,
          createdAt: now,
          updatedAt: now,
          ...(previous === null ? {} : { correctionOf: previous.recordId }),
          provenance: {
            method: 'user-entered',
            source: { kind: 'user', sourceId: profile.ownerSubjectId },
            recordedAt: now,
          },
          payload: nextPolicy,
        },
        sha256Canonical,
      );
      await repository.commit({
        commandId: `nutrition-day-policy:${this.dependencies.createId()}`,
        occurredAt: now,
        mutations: [{ kind: 'put', record }],
      });
    });
  }

  public async recomputeAfterMealChange(
    affectedOccurredAt: readonly string[],
  ): Promise<number> {
    return this.withRepository(async (repository, profile) => {
      const records = await repository.listBySubject(profile.ownerSubjectId);
      const market = marketFromRecord(latestMarketRecord(records));
      const dayPolicy = dayPolicyFromRecord(
        latestDayPolicyRecord(records),
        profile,
      );
      const now = this.dependencies.now();
      const ledger = createLedger({
        repository,
        profile,
        market,
        dayPolicy,
        createId: this.dependencies.createId,
        now,
      });
      return ledger.recomputeAfterMealCorrection(affectedOccurredAt);
    }, true);
  }
}
