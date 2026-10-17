import {
  JsonValueSchema,
  canonicalizeJson,
  sealCanonicalRecordV1,
  verifyCanonicalRecordV1,
  type CanonicalRecordV1,
} from '@nutrixx/canonical-schema';
import { getAdultDriBaselineReleaseV1 } from '@nutrixx/nutrition-engine';
import {
  NEXT_MEAL_RANKING_POLICY_VERSION_V1,
  NextMealRankingRequestSchema,
  NextMealRankingResultSchema,
  NextMealAppliedTemporalRuleV1Schema,
  NextMealTemporalPolicyReleaseV1Schema,
  rankNextMealCandidatesV1,
  reviewNextMealRankingV1,
  nextMealIsCurrentV1,
  nextMealValidUntilV1,
  verifyNextMealExplanationsV1,
  type NextMealCandidateExplanationV1,
  type NextMealRankingRequest,
  type NextMealRankingResult,
  type NextMealAppliedTemporalRuleV1,
  type NextMealRankingReviewV1,
  type NextMealTemporalPolicyReleaseV1,
} from '@nutrixx/optimizer-engine';
import {
  IndexedDbCanonicalRecordRepository,
  sha256Canonical,
} from '@nutrixx/persistence-indexeddb';

import { BrowserNutritionStateStore } from './browser-nutrition-state';
import { BrowserOnboardingStore } from './browser-onboarding';
import {
  BrowserStageTwoStore,
  type FoodChoice,
  type SaveMealInput,
} from './browser-stage-two';
import {
  NEXT_MEAL_DAILY_BASELINE_POLICY_VERSION_V1,
  buildNextMealInputV1,
  type DeclaredInventoryItemV1,
} from './next-meal-input';
import { LOCAL_USER_DATABASE_NAME } from './storage-constants';

const RUN_TYPE = 'planning.next-meal-run';
const INTENTION_TYPE = 'planning.next-meal-intention';
const ENGINE_VERSION = 'free-next-meal-local-v1';
const PLANNING_USER_CONTEXT_TYPES = new Set([
  'user-context.starting-profile',
  'user-context.nutrition-market',
  'user-context.nutrition-day-policy',
  'user-context.activity-level',
]);

export interface NextMealRunV1 {
  readonly format: 'nutrixx.next-meal-recommendation';
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly ownerSubjectId: string;
  readonly createdAt: string;
  readonly validUntil: string;
  readonly freshnessHash: string;
  readonly inputHash: string;
  readonly resultHash: string;
  readonly input: NextMealRankingRequest;
  readonly result: NextMealRankingResult;
  readonly explanations: readonly NextMealCandidateExplanationV1[];
  readonly temporalPolicy: NextMealTemporalPolicyReleaseV1;
  readonly appliedTemporalRules: readonly NextMealAppliedTemporalRuleV1[];
}

export interface NextMealIntentionV1 {
  readonly format: 'nutrixx.next-meal-intention';
  readonly schemaVersion: 1;
  readonly intentionId: string;
  readonly ownerSubjectId: string;
  readonly runId: string;
  readonly candidateKey: string;
  readonly portionId: string;
  readonly selectedAt: string;
}

export interface LocalPlanningSnapshotV1 {
  readonly run: NextMealRunV1 | null;
  readonly fresh: boolean;
  readonly intention: NextMealIntentionV1 | null;
  readonly loggedMealId: string | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readRun(record: CanonicalRecordV1): Promise<NextMealRunV1> {
  const data = record.payload;
  if (
    !isObject(data) ||
    data['format'] !== 'nutrixx.next-meal-recommendation' ||
    data['schemaVersion'] !== 1 ||
    data['runId'] !== record.recordId ||
    data['ownerSubjectId'] !== record.subjectId ||
    typeof data['createdAt'] !== 'string' ||
    typeof data['validUntil'] !== 'string' ||
    typeof data['freshnessHash'] !== 'string' ||
    typeof data['inputHash'] !== 'string' ||
    typeof data['resultHash'] !== 'string'
  )
    throw new TypeError('A stored next-meal run is invalid.');
  const input = NextMealRankingRequestSchema.parse(data['input']);
  const result = NextMealRankingResultSchema.parse(data['result']);
  const temporalPolicy = NextMealTemporalPolicyReleaseV1Schema.parse(
    data['temporalPolicy'],
  );
  const appliedTemporalRules =
    NextMealAppliedTemporalRuleV1Schema.array().parse(
      data['appliedTemporalRules'],
    );
  if (
    appliedTemporalRules.length !== input.temporalRules.length ||
    data['validUntil'] !== nextMealValidUntilV1(input, temporalPolicy) ||
    new Set(appliedTemporalRules.map((rule) => rule.ruleId)).size !==
      appliedTemporalRules.length ||
    appliedTemporalRules.some(
      (applied) =>
        !input.temporalRules.some(
          (rule) =>
            rule.ruleId === applied.ruleId &&
            rule.windowStartInclusive === applied.appliedWindowStartInclusive &&
            rule.windowEndExclusive === applied.windowEndExclusive &&
            temporalPolicy.rules.some(
              (policyRule) => policyRule.ruleId === applied.ruleId,
            ),
        ),
    ) ||
    (await sha256Canonical(canonicalizeJson(JsonValueSchema.parse(input)))) !==
      data['inputHash'] ||
    (await sha256Canonical(canonicalizeJson(JsonValueSchema.parse(result)))) !==
      data['resultHash'] ||
    !verifyNextMealExplanationsV1(input, result, data['explanations'])
  )
    throw new TypeError('Stored next-meal evidence failed independent review.');
  return data as unknown as NextMealRunV1;
}

function readIntention(record: CanonicalRecordV1): NextMealIntentionV1 {
  const data = record.payload;
  if (
    !isObject(data) ||
    data['format'] !== 'nutrixx.next-meal-intention' ||
    data['schemaVersion'] !== 1 ||
    data['intentionId'] !== record.recordId ||
    data['ownerSubjectId'] !== record.subjectId ||
    typeof data['runId'] !== 'string' ||
    typeof data['candidateKey'] !== 'string' ||
    typeof data['portionId'] !== 'string' ||
    typeof data['selectedAt'] !== 'string'
  )
    throw new TypeError('A stored next-meal selection is invalid.');
  return data as unknown as NextMealIntentionV1;
}

export class BrowserPlanningStore {
  public constructor(
    private readonly compute: (
      request: NextMealRankingRequest,
    ) => Promise<NextMealRankingReviewV1> = async (request) =>
      reviewNextMealRankingV1(request, rankNextMealCandidatesV1(request)),
    private readonly onboarding: Pick<
      BrowserOnboardingStore,
      'load'
    > = new BrowserOnboardingStore(),
    private readonly nutrition: Pick<
      BrowserNutritionStateStore,
      'load'
    > = new BrowserNutritionStateStore(),
    private readonly foods: Pick<
      BrowserStageTwoStore,
      | 'enumerateNextMealCatalog'
      | 'activeCatalogRelease'
      | 'listMeals'
      | 'saveMeal'
    > = new BrowserStageTwoStore(),
  ) {}

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

  private async freshnessHash(
    repository: IndexedDbCanonicalRecordRepository,
    owner: string,
  ): Promise<string> {
    const records = await repository.listBySubject(owner);
    const relevant = records
      .filter(
        (record) =>
          PLANNING_USER_CONTEXT_TYPES.has(record.recordType) ||
          /^(?:food|recipe|consumption)\./.test(record.recordType),
      )
      .map((record) => [record.recordId, record.integrity.value])
      .sort((a, b) => a[0]!.localeCompare(b[0]!));
    const referenceRelease = getAdultDriBaselineReleaseV1();
    return sha256Canonical(
      canonicalizeJson({
        owner,
        records: relevant,
        activeCatalogRelease: await this.foods.activeCatalogRelease(),
        temporalPolicyVersion: NEXT_MEAL_DAILY_BASELINE_POLICY_VERSION_V1,
        rankingPolicyVersion: NEXT_MEAL_RANKING_POLICY_VERSION_V1,
        referenceReleaseId: referenceRelease.releaseId,
        referencePolicyVersion: referenceRelease.policyVersion,
      }),
    );
  }

  private async record(
    recordId: string,
    owner: string,
    recordType: string,
    payload: unknown,
    at: string,
    method: 'calculated' | 'user-entered',
  ): Promise<CanonicalRecordV1> {
    return sealCanonicalRecordV1(
      {
        format: 'nutrixx.canonical-record',
        schemaVersion: 1,
        recordType,
        recordVersion: 1,
        recordId,
        subjectId: owner,
        owningContext: 'planning',
        logicalVersion: 1,
        createdAt: at,
        updatedAt: at,
        provenance: {
          method,
          source: {
            kind: method === 'calculated' ? 'calculation' : 'user',
            sourceId: method === 'calculated' ? ENGINE_VERSION : owner,
          },
          recordedAt: at,
        },
        payload: JsonValueSchema.parse(payload),
      },
      sha256Canonical,
    );
  }

  public async createRecommendation(options: {
    readonly inventory: readonly DeclaredInventoryItemV1[] | null;
  }): Promise<
    | { readonly status: 'READY'; readonly runId: string }
    | {
        readonly status: 'NEEDS_INPUT';
        readonly reasonCodes: readonly string[];
      }
  > {
    const profile = await this.onboarding.load();
    if (!profile) throw new TypeError('Complete the starting profile first.');
    const before = await this.withRepository((repository, owner) =>
      this.freshnessHash(repository, owner),
    );
    const [catalog, nutrition] = await Promise.all([
      this.foods.enumerateNextMealCatalog(),
      this.nutrition.load(),
    ]);
    const now = new Date().toISOString();
    const built = buildNextMealInputV1({
      catalog,
      nutrition,
      foodRestrictions: profile.foodRestrictions,
      inventory: options.inventory,
      now,
      trackingStartedAt: profile.createdAt,
    });
    if (built.status !== 'READY') return built;
    const computed = await this.compute(built.request);
    if (computed.status !== 'APPROVED')
      return { status: 'NEEDS_INPUT', reasonCodes: computed.reasonCodes };
    const review = reviewNextMealRankingV1(built.request, computed.ranking);
    if (
      review.status !== 'APPROVED' ||
      JSON.stringify(review.explanations) !==
        JSON.stringify(computed.explanations)
    )
      throw new TypeError('The next-meal result failed independent review.');
    const runId = crypto.randomUUID();
    const completedAt = new Date().toISOString();
    const validUntil = nextMealValidUntilV1(
      built.request,
      built.temporalPolicy,
    );
    await this.withRepository(async (repository, owner) => {
      if (
        owner !== profile.ownerSubjectId ||
        before !== (await this.freshnessHash(repository, owner)) ||
        !nextMealIsCurrentV1(
          built.request.candidates.requestedAt,
          validUntil,
          new Date().toISOString(),
        )
      )
        throw new TypeError(
          'Planning inputs changed. Request a fresh recommendation.',
        );
      const run: NextMealRunV1 = {
        format: 'nutrixx.next-meal-recommendation',
        schemaVersion: 1,
        runId,
        ownerSubjectId: owner,
        createdAt: completedAt,
        validUntil,
        freshnessHash: before,
        inputHash: await sha256Canonical(
          canonicalizeJson(JsonValueSchema.parse(built.request)),
        ),
        resultHash: await sha256Canonical(
          canonicalizeJson(JsonValueSchema.parse(review.ranking)),
        ),
        input: built.request,
        result: review.ranking,
        explanations: review.explanations,
        temporalPolicy: built.temporalPolicy,
        appliedTemporalRules: built.appliedTemporalRules,
      };
      await repository.put(
        await this.record(
          runId,
          owner,
          RUN_TYPE,
          run,
          completedAt,
          'calculated',
        ),
      );
    });
    return { status: 'READY', runId };
  }

  public async load(): Promise<LocalPlanningSnapshotV1> {
    return this.withRepository(async (repository, owner) => {
      const records = await repository.listBySubject(owner);
      const runs = records
        .filter((record) => record.recordType === RUN_TYPE)
        .sort(
          (a, b) =>
            b.createdAt.localeCompare(a.createdAt) ||
            b.recordId.localeCompare(a.recordId),
        );
      const latest = runs[0];
      if (!latest)
        return { run: null, fresh: false, intention: null, loggedMealId: null };
      if (!(await verifyCanonicalRecordV1(latest, sha256Canonical)))
        throw new TypeError('Stored next-meal run integrity check failed.');
      const run = await readRun(latest);
      const intentions = await Promise.all(
        records
          .filter((record) => record.recordType === INTENTION_TYPE)
          .map(async (record) => {
            if (!(await verifyCanonicalRecordV1(record, sha256Canonical)))
              throw new TypeError(
                'Stored next-meal selection integrity check failed.',
              );
            return readIntention(record);
          }),
      );
      const currentIntentions = intentions
        .filter((item) => item.runId === run.runId)
        .sort((a, b) => b.selectedAt.localeCompare(a.selectedAt));
      const intention = currentIntentions[0] ?? null;
      if (
        intention &&
        !run.result.ranked.some(
          (row) =>
            row.candidateKey === intention.candidateKey &&
            row.portionId === intention.portionId,
        )
      )
        throw new TypeError(
          'The stored selection is absent from the validated ranking.',
        );
      const meals = await this.foods.listMeals();
      const intentionIds = new Set(
        currentIntentions.map((item) => item.intentionId),
      );
      const linked = meals.find(
        (meal) =>
          meal.state === 'recorded' &&
          meal.planningIntentionId !== undefined &&
          intentionIds.has(meal.planningIntentionId),
      );
      return {
        run,
        fresh:
          run.freshnessHash === (await this.freshnessHash(repository, owner)) &&
          nextMealIsCurrentV1(
            run.input.candidates.requestedAt,
            run.validUntil,
            new Date().toISOString(),
          ),
        intention,
        loggedMealId: linked?.mealId ?? null,
      };
    });
  }

  public async select(runId: string, candidateKey: string): Promise<string> {
    const owner = (await this.onboarding.load())?.ownerSubjectId;
    if (!owner) throw new TypeError('Complete the starting profile first.');
    if (!navigator.locks)
      throw new TypeError('A secure browser context is required.');
    return navigator.locks.request(
      `nutrixx:planning:${owner}`,
      { mode: 'exclusive' },
      async () => {
        const snapshot = await this.load();
        if (
          !snapshot.run ||
          snapshot.run.runId !== runId ||
          !snapshot.fresh ||
          snapshot.loggedMealId
        )
          throw new TypeError(
            'The recommendation changed. Refresh it before selecting.',
          );
        const row = snapshot.run.result.ranked.find(
          (item) => item.candidateKey === candidateKey,
        );
        if (!row)
          throw new TypeError('Choose a validated, comparable food or recipe.');
        const intentionId = crypto.randomUUID();
        const selectedAt = new Date().toISOString();
        await this.withRepository(async (repository, currentOwner) => {
          if (
            snapshot.run!.freshnessHash !==
              (await this.freshnessHash(repository, currentOwner)) ||
            !nextMealIsCurrentV1(
              snapshot.run!.input.candidates.requestedAt,
              snapshot.run!.validUntil,
              new Date().toISOString(),
            )
          )
            throw new TypeError(
              'Planning inputs changed. Refresh the recommendation.',
            );
          const intention: NextMealIntentionV1 = {
            format: 'nutrixx.next-meal-intention',
            schemaVersion: 1,
            intentionId,
            ownerSubjectId: currentOwner,
            runId,
            candidateKey,
            portionId: row.portionId,
            selectedAt,
          };
          await repository.put(
            await this.record(
              intentionId,
              currentOwner,
              INTENTION_TYPE,
              intention,
              selectedAt,
              'user-entered',
            ),
          );
        });
        return intentionId;
      },
    );
  }

  public async logAsEaten(options: {
    readonly intentionId: string;
    readonly mealType: SaveMealInput['mealType'];
    readonly occurredAt: string;
    readonly edibleGrams: string;
  }): Promise<string> {
    const owner = (await this.onboarding.load())?.ownerSubjectId;
    if (!owner) throw new TypeError('Complete the starting profile first.');
    if (!navigator.locks)
      throw new TypeError('A secure browser context is required.');
    return navigator.locks.request(
      `nutrixx:planning:${owner}`,
      { mode: 'exclusive' },
      async () => {
        const snapshot = await this.load();
        if (
          !snapshot.run ||
          !snapshot.intention ||
          !snapshot.fresh ||
          snapshot.intention.intentionId !== options.intentionId ||
          snapshot.loggedMealId
        )
          throw new TypeError(
            'The selected recommendation is stale or already logged.',
          );
        const row = snapshot.run.result.ranked.find(
          (item) => item.candidateKey === snapshot.intention!.candidateKey,
        );
        const candidate = snapshot.run.input.candidates.entries.find(
          (item) =>
            (item.reference.kind === 'food'
              ? `food:${item.reference.catalogReleaseId}:${item.reference.foodId}:${item.reference.foodRevision}`
              : `recipe:${item.reference.recipeId}:${item.reference.recipeVersion}`) ===
            row?.candidateKey,
        );
        if (
          !row ||
          !candidate ||
          !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(options.edibleGrams) ||
          !Number.isFinite(Number(options.edibleGrams)) ||
          Number(options.edibleGrams) <= 0
        )
          throw new TypeError(
            'Confirm a positive edible quantity for the selected food.',
          );
        if (
          !nextMealIsCurrentV1(
            snapshot.run.input.candidates.requestedAt,
            snapshot.run.validUntil,
            new Date().toISOString(),
          )
        )
          throw new TypeError('Refresh the expired recommendation first.');
        const choice: FoodChoice = {
          key: row.candidateKey,
          name: candidate.displayName,
          description: candidate.displayName,
          reference: candidate.reference,
          defaultGramWeight: row.edibleGrams,
          preparationState: candidate.preparationState,
          provenance: 'validated-local-catalog',
          completeness: 'source-backed',
        };
        return this.foods.saveMeal({
          mealType: options.mealType,
          occurredAt: options.occurredAt,
          planningIntentionId: options.intentionId,
          items: [{ choice, gramWeight: options.edibleGrams }],
        });
      },
    );
  }
}
