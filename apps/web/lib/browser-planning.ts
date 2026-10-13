import {
  JsonValueSchema,
  canonicalizeJson,
  sealCanonicalRecordV1,
  verifyCanonicalRecordV1,
  type CanonicalRecordV1,
  type JsonValue,
} from '@nutrixx/canonical-schema';
import { ConsumptionLedgerV1 } from '@nutrixx/consumption';
import {
  NutritionDayPolicyV1Schema,
  getAdultDriBaselineReleaseV1,
  nutritionPeriodAtV1,
  type NutritionDayPolicyV1,
} from '@nutrixx/nutrition-engine';
import {
  FREE_SCORING_POLICY_VERSION_V1,
  PlanningRunV1Schema,
  fingerprintPlanningInputV1,
  fingerprintPlanningOutcomeV1,
  reviewLocalSelectionsV1,
  sealPlanningRunRecordV1,
  validateLocalPlanV1,
  verifyLocalExplanationV1,
  verifyPlanningRunRecordV1,
  type LocalPlanReviewV1,
  type PlanningInputV1,
  type PlanningRunV1,
} from '@nutrixx/optimizer-engine';
import {
  IndexedDbCanonicalRecordRepository,
  IndexedDbReferenceDatasetCache,
  sha256Canonical,
} from '@nutrixx/persistence-indexeddb';
import { StartingProfileV1Schema } from '@nutrixx/user-context';

import { BrowserNutritionStateStore } from './browser-nutrition-state';
import { BrowserOnboardingStore } from './browser-onboarding';
import { BrowserStageTwoStore, type FoodChoice } from './browser-stage-two';
import { loadNutritionContextV1 } from './nutrition-context';
import { buildPlanningRequestV1 } from './planning-input';
import {
  LOCAL_USER_DATABASE_NAME,
  REFERENCE_CACHE_DATABASE_NAME,
} from './storage-constants';

import type { LocalPlannerWorkerResultV1 } from '../workers/local-planner.worker';

const DRAFT_TYPE = 'planning.local-draft';
const PLAN_TYPE = 'planning.local-plan';
const DISCARD_TYPE = 'planning.draft-discard';
const ENGINE_VERSION = 'free-local-beam-v1';
const CONSTRAINT_VERSION = 'free-constraint-policy-v1';

export interface LocalPlanDraftV1 {
  readonly format: 'nutrixx.local-plan-draft';
  readonly schemaVersion: 1;
  readonly draftId: string;
  readonly runId: string;
  readonly ownerSubjectId: string;
  readonly createdAt: string;
  readonly freshnessHash: string;
  readonly review: LocalPlanReviewV1 & { status: 'APPROVED' };
}

export interface LocalPlanRevisionV1 {
  readonly format: 'nutrixx.local-plan-revision';
  readonly schemaVersion: 1;
  readonly planId: string;
  readonly ownerSubjectId: string;
  readonly dayPeriodId: string;
  readonly revision: number;
  readonly draftId: string;
  readonly runId: string;
  readonly acceptedAt: string;
  readonly freshnessHash: string;
}

export interface LocalPlanningSnapshotV1 {
  readonly draft: LocalPlanDraftV1 | null;
  readonly draftRun: PlanningRunV1 | null;
  readonly draftFresh: boolean;
  readonly active: LocalPlanRevisionV1 | null;
  readonly activeRun: PlanningRunV1 | null;
  readonly activeReview: LocalPlanDraftV1['review'] | null;
  readonly activeFresh: boolean;
  readonly history: readonly LocalPlanRevisionV1[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readDraft(record: CanonicalRecordV1): LocalPlanDraftV1 {
  const value = record.payload;
  if (
    !isObject(value) ||
    value['format'] !== 'nutrixx.local-plan-draft' ||
    value['schemaVersion'] !== 1 ||
    value['draftId'] !== record.recordId ||
    value['ownerSubjectId'] !== record.subjectId ||
    typeof value['runId'] !== 'string' ||
    typeof value['createdAt'] !== 'string' ||
    typeof value['freshnessHash'] !== 'string' ||
    !isObject(value['review']) ||
    value['review']['status'] !== 'APPROVED'
  ) {
    throw new TypeError('A stored planning draft is invalid.');
  }
  return value as unknown as LocalPlanDraftV1;
}

function readPlan(record: CanonicalRecordV1): LocalPlanRevisionV1 {
  const value = record.payload;
  if (
    !isObject(value) ||
    value['format'] !== 'nutrixx.local-plan-revision' ||
    value['schemaVersion'] !== 1 ||
    value['planId'] !== record.recordId ||
    value['ownerSubjectId'] !== record.subjectId ||
    typeof value['dayPeriodId'] !== 'string' ||
    typeof value['draftId'] !== 'string' ||
    typeof value['runId'] !== 'string' ||
    typeof value['revision'] !== 'number' ||
    typeof value['acceptedAt'] !== 'string' ||
    typeof value['freshnessHash'] !== 'string'
  ) {
    throw new TypeError('A stored plan revision is invalid.');
  }
  return value as unknown as LocalPlanRevisionV1;
}

function runFromRecords(
  records: readonly CanonicalRecordV1[],
  id: string,
): PlanningRunV1 {
  const record = records.find((item) => item.recordId === id);
  if (!record || record.recordType !== 'planning-run') {
    throw new TypeError('The planning run is unavailable.');
  }
  return PlanningRunV1Schema.parse(record.payload);
}

function latestRecord(
  records: readonly CanonicalRecordV1[],
  type: string,
): CanonicalRecordV1 | null {
  return (
    records
      .filter((record) => record.recordType === type)
      .sort((a, b) => b.logicalVersion - a.logicalVersion)[0] ?? null
  );
}

function dayPolicyFromRecords(
  records: readonly CanonicalRecordV1[],
  profileTimeZone: string,
): NutritionDayPolicyV1 {
  const stored = latestRecord(records, 'user-context.nutrition-day-policy');
  return stored
    ? NutritionDayPolicyV1Schema.parse(stored.payload)
    : {
        policyVersion: 'nutrition-day-zone-v1',
        initialTimeZone: profileTimeZone,
        changes: [],
      };
}

function assertReview(
  input: PlanningInputV1,
  review: LocalPlanDraftV1['review'],
): void {
  if (review.outcome.status !== 'READY') {
    throw new TypeError('The planning draft has no ready outcome.');
  }
  const validation = validateLocalPlanV1(
    input,
    review.outcome.draft.selections,
  );
  if (
    validation.status !== 'passed' ||
    JSON.stringify(validation) !== JSON.stringify(review.validation) ||
    !verifyLocalExplanationV1(
      input,
      review.validation,
      review.alternatives,
      review.explanation,
    )
  ) {
    throw new TypeError(
      'The planning evidence did not pass independent review.',
    );
  }
}

function sourceIdentity(choice: FoodChoice): string {
  const reference = choice.reference;
  return reference.kind === 'food'
    ? `food:${reference.catalogReleaseId}:${reference.foodId}:${reference.foodRevision}`
    : `recipe:${reference.recipeId}:${reference.recipeVersion}`;
}

function workerSearch(
  request: ReturnType<typeof buildPlanningRequestV1>,
): Promise<LocalPlannerWorkerResultV1> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/local-planner.worker.ts', import.meta.url),
      {
        type: 'module',
      },
    );
    const timer = setTimeout(() => {
      worker.terminate();
      resolve({ status: 'UNAVAILABLE', reasonCodes: ['worker-watchdog'] });
    }, 5_500);
    worker.onmessage = (event: MessageEvent<LocalPlannerWorkerResultV1>) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error('The local planner worker could not complete.'));
    };
    worker.postMessage({ request, validatedAt: new Date().toISOString() });
  });
}

export class BrowserPlanningStore {
  public constructor(
    private readonly compute: (
      request: ReturnType<typeof buildPlanningRequestV1>,
    ) => Promise<LocalPlannerWorkerResultV1> = workerSearch,
  ) {}

  private get onboarding(): BrowserOnboardingStore {
    return new BrowserOnboardingStore();
  }

  private get nutrition(): BrowserNutritionStateStore {
    return new BrowserNutritionStateStore();
  }

  private get stageTwo(): BrowserStageTwoStore {
    return new BrowserStageTwoStore();
  }

  private async withRepository<T>(
    operation: (
      repository: IndexedDbCanonicalRecordRepository,
      owner: string,
    ) => Promise<T>,
  ): Promise<T> {
    const profile = await this.onboarding.load();
    if (!profile) throw new TypeError('Complete the starting profile first.');
    const repository = await IndexedDbCanonicalRecordRepository.create({
      databaseName: LOCAL_USER_DATABASE_NAME,
      indexedDB,
      keyRange: IDBKeyRange,
      verifyRecord: (record) =>
        verifyCanonicalRecordV1(record, sha256Canonical),
    });
    try {
      return await operation(repository, profile.ownerSubjectId);
    } finally {
      await repository.close();
    }
  }

  private async activeCatalogRelease(): Promise<string | null> {
    const cache = await IndexedDbReferenceDatasetCache.create({
      databaseName: REFERENCE_CACHE_DATABASE_NAME,
      indexedDB,
    });
    try {
      return (
        (await cache.listReleases()).find((item) => item.active)?.releaseId ??
        null
      );
    } finally {
      await cache.close();
    }
  }

  private async freshnessHash(
    repository: IndexedDbCanonicalRecordRepository,
    owner: string,
    dayPeriodId: string,
    now: string,
  ): Promise<string> {
    const records = await repository.listBySubject(owner);
    const relevant = records
      .filter((record) =>
        /^(?:user-context|food|recipe|consumption)\./.test(record.recordType),
      )
      .map((record) => [record.recordId, record.integrity.value]);
    const profile = await this.onboarding.load();
    if (!profile || profile.ownerSubjectId !== owner) {
      throw new TypeError('The local profile changed.');
    }
    const dayPolicy = dayPolicyFromRecords(records, profile.timeZone);
    const period = nutritionPeriodAtV1(dayPolicy, now);
    const requestedDay =
      period.periodId === dayPeriodId
        ? period
        : nutritionPeriodAtV1(dayPolicy, period.endsAt);
    if (requestedDay.periodId !== dayPeriodId) return 'expired';
    return sha256Canonical(
      canonicalizeJson({
        owner,
        dayPeriodId,
        records: relevant,
        activeCatalogRelease: await this.activeCatalogRelease(),
        targetReleaseId: getAdultDriBaselineReleaseV1().releaseId,
      }),
    );
  }

  private async assertInputCurrent(
    repository: IndexedDbCanonicalRecordRepository,
    owner: string,
    input: PlanningInputV1,
  ): Promise<void> {
    const profile = await this.onboarding.load();
    if (
      !profile ||
      profile.ownerSubjectId !== owner ||
      profile.profileId !== input.eligibility.profileId ||
      profile.revision !== input.eligibility.profileRevision ||
      profile.revision !== input.restrictions.sourceRevision
    ) {
      throw new TypeError('The starting profile changed. Request a new plan.');
    }
    const records = await repository.listBySubject(owner);
    const policy = dayPolicyFromRecords(records, profile.timeZone);
    const day = nutritionPeriodAtV1(policy, input.day.startsAt);
    if (JSON.stringify(day) !== JSON.stringify(input.day)) {
      throw new TypeError(
        'The nutrition-day policy changed. Request a new plan.',
      );
    }
    const market = latestRecord(
      records,
      'user-context.nutrition-market',
    )?.payload;
    const selectedMarket =
      isObject(market) &&
      (market['market'] === 'US' || market['market'] === 'CA')
        ? market['market']
        : 'unselected';
    if (
      input.referenceReleases.find(
        (item) => item.component === 'nutrition-market',
      )?.releaseId !== selectedMarket ||
      input.referenceReleases.find((item) => item.component === 'target-policy')
        ?.releaseId !== getAdultDriBaselineReleaseV1().releaseId ||
      (input.referenceReleases.find((item) => item.component === 'food-catalog')
        ?.releaseId ?? null) !== (await this.activeCatalogRelease())
    ) {
      throw new TypeError('The reference context changed. Request a new plan.');
    }
    const meals = (
      await new ConsumptionLedgerV1({
        repository,
        digestSha256Hex: sha256Canonical,
      }).listCurrentMeals(owner)
    )
      .filter(
        (meal) =>
          meal.state === 'recorded' &&
          meal.occurredAt >= day.startsAt &&
          meal.occurredAt < day.endsAt,
      )
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const recorded = input.slots
      .filter(
        (
          slot,
        ): slot is Extract<
          PlanningInputV1['slots'][number],
          { state: 'recorded' }
        > => slot.state === 'recorded',
      )
      .map((slot) => `${slot.mealId}:${slot.mealRevision}`);
    if (
      meals.map((meal) => `${meal.mealId}:${meal.revision}`).join('|') !==
      recorded.join('|')
    ) {
      throw new TypeError('Recorded meals changed. Request a new plan.');
    }
  }

  private async assertCurrentChoices(
    choices: readonly FoodChoice[],
  ): Promise<void> {
    const [custom, recipes, activeCatalogRelease] = await Promise.all([
      this.stageTwo.listCustomFoods(),
      this.stageTwo.listRecipes(),
      this.activeCatalogRelease(),
    ]);
    const current = new Set<string>([
      ...custom.map(
        (food) => `food:user-custom-v1:${food.foodId}:${food.revision}`,
      ),
      ...recipes.flatMap((item) => {
        const output = item.version.outputFood;
        return [
          `recipe:${item.version.recipeId}:${item.version.version}`,
          ...(output
            ? [`food:user-recipe-v1:${output.foodId}:${item.version.version}`]
            : []),
        ];
      }),
    ]);
    for (const choice of choices) {
      const reference = choice.reference;
      if (
        reference.kind === 'food' &&
        !reference.catalogReleaseId.startsWith('user-') &&
        reference.catalogReleaseId === activeCatalogRelease
      ) {
        continue;
      }
      if (!current.has(sourceIdentity(choice))) {
        throw new TypeError(
          'A selected food or recipe has changed. Search again.',
        );
      }
    }
  }

  public async createDraft(options: {
    day: 'today' | 'tomorrow';
    openSlotLabels: readonly string[];
    choices: readonly FoodChoice[];
  }): Promise<
    | { status: 'READY'; draftId: string }
    | { status: 'UNAVAILABLE'; reasonCodes: readonly string[] }
  > {
    await this.assertCurrentChoices(options.choices);
    const profile = StartingProfileV1Schema.parse(await this.onboarding.load());
    const nutritionSnapshot = await this.nutrition.load();
    const now = new Date().toISOString();
    const references = options.choices.map((choice) => choice.reference);
    const request = await this.withRepository(async (repository, owner) => {
      const nutrition = await loadNutritionContextV1({
        references,
        repository,
        ownerSubjectId: owner,
        indexedDB,
      });
      return buildPlanningRequestV1({
        profile,
        dayPolicy: nutritionSnapshot.dayPolicy,
        market: nutritionSnapshot.market,
        meals: nutritionSnapshot.meals,
        activeCatalogRelease: await this.activeCatalogRelease(),
        nutrition,
        choices: options.choices,
        day: options.day,
        openSlotLabels: options.openSlotLabels,
        now,
        createId: () => crypto.randomUUID(),
      });
    });
    const initialFreshness = await this.withRepository((repository, owner) =>
      this.freshnessHash(
        repository,
        owner,
        request.baseInput.day.periodId,
        now,
      ),
    );
    if (initialFreshness === 'expired') {
      return { status: 'UNAVAILABLE', reasonCodes: ['planning-day-expired'] };
    }
    const result = await this.compute(request);
    if (result.status !== 'APPROVED') return result;
    await this.assertCurrentChoices(options.choices);
    const runId = crypto.randomUUID();
    const draftId = crypto.randomUUID();
    const completedAt = new Date().toISOString();
    const freshness = await this.withRepository((repository, owner) =>
      this.freshnessHash(
        repository,
        owner,
        result.input.day.periodId,
        completedAt,
      ),
    );
    if (freshness !== initialFreshness) {
      return {
        status: 'UNAVAILABLE',
        reasonCodes: ['planning-inputs-changed'],
      };
    }
    const run: PlanningRunV1 = {
      format: 'nutrixx.local-planning-run',
      schemaVersion: 1,
      runId,
      ownerSubjectId: profile.ownerSubjectId,
      startedAt: now,
      completedAt,
      engineVersion: ENGINE_VERSION,
      constraintPolicyVersion: CONSTRAINT_VERSION,
      scoringPolicyVersion: FREE_SCORING_POLICY_VERSION_V1,
      seed: 0,
      input: result.input,
      inputHash: await fingerprintPlanningInputV1(
        result.input,
        sha256Canonical,
      ),
      trace: {
        termination: 'feasible',
        expandedStates: result.search.trace.expandedStates,
        elapsedMilliseconds: result.search.trace.elapsedMilliseconds,
      },
      outcome: result.review.outcome,
      outputHash: await fingerprintPlanningOutcomeV1(
        result.review.outcome,
        sha256Canonical,
      ),
    };
    assertReview(run.input, result.review);
    const draft: LocalPlanDraftV1 = {
      format: 'nutrixx.local-plan-draft',
      schemaVersion: 1,
      draftId,
      runId,
      ownerSubjectId: profile.ownerSubjectId,
      createdAt: completedAt,
      freshnessHash: freshness,
      review: result.review,
    };
    await this.withRepository(async (repository, owner) => {
      const current = await this.freshnessHash(
        repository,
        owner,
        run.input.day.periodId,
        new Date().toISOString(),
      );
      if (current !== freshness)
        throw new TypeError(
          'Planning inputs changed during the run. Request a new plan.',
        );
      await this.assertInputCurrent(repository, owner, run.input);
      const runRecord = await sealPlanningRunRecordV1(
        {
          format: 'nutrixx.canonical-record',
          schemaVersion: 1,
          recordType: 'planning-run',
          recordVersion: 1,
          recordId: runId,
          subjectId: owner,
          owningContext: 'planning',
          logicalVersion: 1,
          createdAt: now,
          updatedAt: completedAt,
          provenance: {
            method: 'calculated',
            source: { kind: 'calculation', sourceId: ENGINE_VERSION },
            recordedAt: completedAt,
          },
          payload: run,
        },
        sha256Canonical,
      );
      const draftRecord = await this.record(
        draftId,
        owner,
        DRAFT_TYPE,
        JsonValueSchema.parse(draft),
        completedAt,
      );
      await repository.commit({
        commandId: crypto.randomUUID(),
        occurredAt: completedAt,
        mutations: [
          { kind: 'put', record: runRecord as unknown as CanonicalRecordV1 },
          { kind: 'put', record: draftRecord },
        ],
      });
    });
    return { status: 'READY', draftId };
  }

  private async record(
    recordId: string,
    owner: string,
    type: string,
    payload: JsonValue,
    at: string,
    logicalVersion = 1,
    correctionOf?: string,
  ): Promise<CanonicalRecordV1> {
    return sealCanonicalRecordV1(
      {
        format: 'nutrixx.canonical-record',
        schemaVersion: 1,
        recordType: type,
        recordVersion: 1,
        recordId,
        subjectId: owner,
        owningContext: 'planning',
        logicalVersion,
        createdAt: at,
        updatedAt: at,
        ...(correctionOf ? { correctionOf } : {}),
        provenance: {
          method: 'calculated',
          source: { kind: 'calculation', sourceId: ENGINE_VERSION },
          recordedAt: at,
        },
        payload,
      },
      sha256Canonical,
    );
  }

  public async load(): Promise<LocalPlanningSnapshotV1> {
    return this.withRepository(async (repository, owner) => {
      const records = await repository.listBySubject(owner);
      for (const record of records.filter((item) =>
        ['planning-run', DRAFT_TYPE, PLAN_TYPE, DISCARD_TYPE].includes(
          item.recordType,
        ),
      )) {
        if (!(await verifyCanonicalRecordV1(record, sha256Canonical))) {
          throw new TypeError(
            'Stored planning data failed its integrity check.',
          );
        }
      }
      const discarded = new Set(
        records
          .filter((record) => record.recordType === DISCARD_TYPE)
          .map((record) => (record.payload as { draftId?: string }).draftId),
      );
      const history = records
        .filter((record) => record.recordType === PLAN_TYPE)
        .map(readPlan)
        .sort(
          (a, b) =>
            b.acceptedAt.localeCompare(a.acceptedAt) || b.revision - a.revision,
        );
      const used = new Set(history.map((item) => item.draftId));
      const draft =
        records
          .filter((record) => record.recordType === DRAFT_TYPE)
          .map(readDraft)
          .filter(
            (item) => !discarded.has(item.draftId) && !used.has(item.draftId),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
      const profile = await this.onboarding.load();
      if (!profile) throw new TypeError('The local profile is unavailable.');
      const now = new Date().toISOString();
      const dayPolicy = dayPolicyFromRecords(records, profile.timeZone);
      const today = nutritionPeriodAtV1(dayPolicy, now);
      const tomorrow = nutritionPeriodAtV1(dayPolicy, today.endsAt);
      const active =
        history.find((item) => item.dayPeriodId === today.periodId) ??
        history.find((item) => item.dayPeriodId === tomorrow.periodId) ??
        null;
      const draftRun = draft ? runFromRecords(records, draft.runId) : null;
      const activeRun = active ? runFromRecords(records, active.runId) : null;
      const activeDraftRecord = active
        ? records.find(
            (item) =>
              item.recordId === active.draftId &&
              item.recordType === DRAFT_TYPE,
          )
        : undefined;
      if (active && !activeDraftRecord) {
        throw new TypeError('Accepted plan evidence is unavailable.');
      }
      const activeReview = activeDraftRecord
        ? readDraft(activeDraftRecord).review
        : null;
      for (const run of [draftRun, activeRun]) {
        if (!run) continue;
        const record = records.find((item) => item.recordId === run.runId);
        if (
          !record ||
          !(await verifyPlanningRunRecordV1(record, sha256Canonical))
        ) {
          throw new TypeError('Stored planning run integrity check failed.');
        }
      }
      if (draft && draftRun) assertReview(draftRun.input, draft.review);
      if (activeReview && activeRun)
        assertReview(activeRun.input, activeReview);
      if (
        (draft &&
          draftRun &&
          JSON.stringify(draft.review.outcome) !==
            JSON.stringify(draftRun.outcome)) ||
        (activeReview &&
          activeRun &&
          JSON.stringify(activeReview.outcome) !==
            JSON.stringify(activeRun.outcome))
      ) {
        throw new TypeError('A stored draft does not match its planning run.');
      }
      const draftFresh =
        draft && draftRun
          ? draft.freshnessHash ===
            (await this.freshnessHash(
              repository,
              owner,
              draftRun.input.day.periodId,
              new Date().toISOString(),
            ))
          : false;
      const activeFresh =
        active && activeRun
          ? active.freshnessHash ===
            (await this.freshnessHash(
              repository,
              owner,
              active.dayPeriodId,
              new Date().toISOString(),
            ))
          : false;
      return {
        draft,
        draftRun,
        draftFresh,
        active,
        activeRun,
        activeReview,
        activeFresh,
        history,
      };
    });
  }

  public async accept(draftId: string): Promise<void> {
    const profile = await this.onboarding.load();
    if (!profile) throw new TypeError('Complete the starting profile first.');
    const locks = navigator.locks;
    if (!locks)
      throw new TypeError(
        'A secure browser context is required for local planning.',
      );
    await locks.request(
      `nutrixx:planning:${profile.ownerSubjectId}`,
      { mode: 'exclusive' },
      () =>
        this.withRepository(async (repository, owner) => {
          const records = await repository.listBySubject(owner);
          const draftRecord = records.find(
            (item) =>
              item.recordId === draftId && item.recordType === DRAFT_TYPE,
          );
          if (!draftRecord) throw new TypeError('The draft is unavailable.');
          const draft = readDraft(draftRecord);
          if (
            records.some(
              (item) =>
                item.recordType === DISCARD_TYPE &&
                (item.payload as { draftId?: string }).draftId === draftId,
            )
          ) {
            throw new TypeError('The draft was discarded.');
          }
          if (
            records.some(
              (item) =>
                item.recordType === PLAN_TYPE &&
                (item.payload as { draftId?: string }).draftId === draftId,
            )
          ) {
            throw new TypeError('The draft was already accepted.');
          }
          const runRecord = records.find(
            (item) => item.recordId === draft.runId,
          );
          if (
            !runRecord ||
            !(await verifyPlanningRunRecordV1(runRecord, sha256Canonical))
          ) {
            throw new TypeError('The run integrity check failed.');
          }
          const run = runRecord.payload as unknown as PlanningRunV1;
          assertReview(run.input, draft.review);
          if (
            JSON.stringify(run.outcome) !== JSON.stringify(draft.review.outcome)
          ) {
            throw new TypeError(
              'The draft outcome does not match the sealed run.',
            );
          }
          const now = new Date().toISOString();
          const current = await this.freshnessHash(
            repository,
            owner,
            run.input.day.periodId,
            now,
          );
          if (current !== draft.freshnessHash) {
            throw new TypeError('This draft is stale. Request a new plan.');
          }
          await this.assertInputCurrent(repository, owner, run.input);
          const previous = records
            .filter((item) => item.recordType === PLAN_TYPE)
            .map(readPlan)
            .filter((plan) => plan.dayPeriodId === run.input.day.periodId)
            .sort((a, b) => b.revision - a.revision)[0];
          const planId = crypto.randomUUID();
          const plan: LocalPlanRevisionV1 = {
            format: 'nutrixx.local-plan-revision',
            schemaVersion: 1,
            planId,
            ownerSubjectId: owner,
            dayPeriodId: run.input.day.periodId,
            revision: (previous?.revision ?? 0) + 1,
            draftId,
            runId: run.runId,
            acceptedAt: now,
            freshnessHash: current,
          };
          await repository.put(
            await this.record(
              planId,
              owner,
              PLAN_TYPE,
              JsonValueSchema.parse(plan),
              now,
              plan.revision,
              previous?.planId,
            ),
          );
        }),
    );
  }

  public async discard(draftId: string): Promise<void> {
    await this.withRepository(async (repository, owner) => {
      const draft = await repository.getById(draftId);
      if (!draft || draft.recordType !== DRAFT_TYPE) return;
      const records = await repository.listBySubject(owner);
      if (
        records.some(
          (item) =>
            (item.recordType === DISCARD_TYPE ||
              item.recordType === PLAN_TYPE) &&
            (item.payload as { draftId?: string }).draftId === draftId,
        )
      )
        return;
      const now = new Date().toISOString();
      await repository.put(
        await this.record(
          crypto.randomUUID(),
          owner,
          DISCARD_TYPE,
          { draftId, discardedAt: now },
          now,
        ),
      );
    });
  }

  public async substitute(
    draftId: string,
    slotId: string,
    candidateId: string,
    portionId: string,
  ): Promise<string> {
    const profile = await this.onboarding.load();
    if (!profile) throw new TypeError('Complete the starting profile first.');
    const locks = navigator.locks;
    if (!locks)
      throw new TypeError(
        'A secure browser context is required for local planning.',
      );
    return locks.request(
      `nutrixx:planning:${profile.ownerSubjectId}`,
      { mode: 'exclusive' },
      () =>
        this.withRepository(async (repository, owner) => {
          const records = await repository.listBySubject(owner);
          const draftRecord = records.find(
            (item) =>
              item.recordId === draftId && item.recordType === DRAFT_TYPE,
          );
          if (!draftRecord) throw new TypeError('The draft is unavailable.');
          const draft = readDraft(draftRecord);
          if (
            records.some(
              (item) =>
                item.recordType === DISCARD_TYPE &&
                (item.payload as { draftId?: string }).draftId === draftId,
            )
          )
            throw new TypeError('The draft was discarded.');
          const sourceRunRecord = records.find(
            (item) => item.recordId === draft.runId,
          );
          if (
            !sourceRunRecord ||
            !(await verifyPlanningRunRecordV1(sourceRunRecord, sha256Canonical))
          ) {
            throw new TypeError('The source run integrity check failed.');
          }
          const run = runFromRecords(records, draft.runId);
          assertReview(run.input, draft.review);
          if (
            JSON.stringify(run.outcome) !== JSON.stringify(draft.review.outcome)
          ) {
            throw new TypeError(
              'The draft outcome does not match the sealed run.',
            );
          }
          const alternative = draft.review.alternatives.find(
            (item) =>
              item.slotId === slotId &&
              item.replacement.candidateId === candidateId &&
              item.replacement.portionId === portionId,
          );
          if (!alternative)
            throw new TypeError('This alternative has not been validated.');
          const now = new Date().toISOString();
          if (
            (await this.freshnessHash(
              repository,
              owner,
              run.input.day.periodId,
              now,
            )) !== draft.freshnessHash
          ) {
            throw new TypeError('This draft is stale. Request a new plan.');
          }
          await this.assertInputCurrent(repository, owner, run.input);
          const review = reviewLocalSelectionsV1(
            run.input,
            alternative.validation.selections,
            draft.review.outcome.limitationCodes,
            now,
          );
          if (review.status !== 'APPROVED')
            throw new TypeError(
              'The replacement failed independent validation.',
            );
          const replacementRunId = crypto.randomUUID();
          const replacementDraftId = crypto.randomUUID();
          const replacementRun: PlanningRunV1 = {
            ...run,
            runId: replacementRunId,
            startedAt: now,
            completedAt: now,
            engineVersion: 'validated-user-alternative-v1',
            scoringPolicyVersion: 'user-selected-alternative-v1',
            trace: {
              termination: 'feasible',
              expandedStates: 0,
              elapsedMilliseconds: 0,
            },
            outcome: review.outcome,
            outputHash: await fingerprintPlanningOutcomeV1(
              review.outcome,
              sha256Canonical,
            ),
          };
          const runRecord = await sealPlanningRunRecordV1(
            {
              format: 'nutrixx.canonical-record',
              schemaVersion: 1,
              recordType: 'planning-run',
              recordVersion: 1,
              recordId: replacementRunId,
              subjectId: owner,
              owningContext: 'planning',
              logicalVersion: 1,
              createdAt: now,
              updatedAt: now,
              provenance: {
                method: 'calculated',
                source: {
                  kind: 'calculation',
                  sourceId: 'validated-alternative-v1',
                },
                recordedAt: now,
              },
              payload: replacementRun,
            },
            sha256Canonical,
          );
          const replacementDraft: LocalPlanDraftV1 = {
            format: 'nutrixx.local-plan-draft',
            schemaVersion: 1,
            draftId: replacementDraftId,
            runId: replacementRunId,
            ownerSubjectId: owner,
            createdAt: now,
            freshnessHash: draft.freshnessHash,
            review,
          };
          const replacementRecord = await this.record(
            replacementDraftId,
            owner,
            DRAFT_TYPE,
            JsonValueSchema.parse(replacementDraft),
            now,
          );
          await repository.commit({
            commandId: crypto.randomUUID(),
            occurredAt: now,
            mutations: [
              {
                kind: 'put',
                record: runRecord as unknown as CanonicalRecordV1,
              },
              { kind: 'put', record: replacementRecord },
            ],
          });
          return replacementDraftId;
        }),
    );
  }
}
