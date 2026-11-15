import {
  JsonValueSchema,
  canonicalizeJson,
  sealCanonicalRecordV1,
  verifyCanonicalRecordV1,
  type CanonicalRecordV1,
} from '@nutrixx/canonical-schema';
import { getAdultDriBaselineReleaseV1 } from '@nutrixx/nutrition-engine';
import {
  NEXT_MEAL_DOMAIN_ADAPTER_VERSION_V1,
  NEXT_MEAL_RANKING_POLICY_VERSION_V1,
  PLANNING_DOMAIN_MODEL_VERSION_V1,
  PLANNING_OUTCOME_FEEDBACK_VERSION_V1,
  type PLANNING_SHADOW_COMPARISON_VERSION_V1,
  PlanningFeedbackEventV1Schema,
  PlanningFeedbackTrialV1Schema,
  PlanningReplayArtifactV1Schema,
  PlanningShadowComparisonV1Schema,
  buildPlanningCalibrationReportV1,
  nextMealSourceKey,
  NextMealCompactRankingResultV1Schema,
  NextMealAppliedTemporalRuleV1Schema,
  NextMealTemporalPolicyReleaseV1Schema,
  compactNextMealRankingResultV1,
  comparePlanningShadowSolversV1,
  createNextMealPlanningDecisionChainV1,
  createPlanningReplayArtifactV1,
  rankNextMealCandidatesChunkedV1,
  reviewNextMealRankingV1,
  nextMealIsCurrentV1,
  nextMealValidUntilV1,
  type NextMealCandidateSource,
  type NextMealCandidateExplanationV1,
  type NextMealCompactRankingResultV1,
  type NextMealRankingRequest,
  type NextMealRankingChunkProgressV1,
  type NextMealAppliedTemporalRuleV1,
  type NextMealRankingReviewV1,
  type NextMealTemporalPolicyReleaseV1,
  type PlanningFeasibilityDiagnosisV1,
  type PlanningCalibrationReportV1,
  type PlanningFeedbackEventV1,
  type PlanningFeedbackTrialV1,
  type PlanningReplayArtifactV1,
  type PlanningShadowComparisonV1,
} from '@nutrixx/optimizer-engine';
import {
  IndexedDbCanonicalRecordRepository,
  sha256Canonical,
} from '@nutrixx/persistence-indexeddb';
import {
  HIGHS_SHADOW_MODEL_VERSION_V1,
  HIGHS_SHADOW_SOLVER_VERSION_V1,
  solvePlanningHighsShadowV1,
  type HighsShadowResultV1,
} from '@nutrixx/solver-highs';

import { BrowserNutritionStateStore } from './browser-nutrition-state';
import { BrowserOnboardingStore } from './browser-onboarding';
import {
  BrowserStageTwoStore,
  type FoodChoice,
  type SaveMealInput,
} from './browser-stage-two';
import {
  projectPlanningSnapshot,
  savePlanningView,
} from './next-meal-display-cache';
import {
  NEXT_MEAL_DAILY_BASELINE_POLICY_VERSION_V1,
  buildNextMealInputV1,
  type DeclaredInventoryItemV1,
} from './next-meal-input';
import { LOCAL_USER_DATABASE_NAME } from './storage-constants';

const RUN_TYPE = 'planning.next-meal-run';
const REPLAY_TYPE = 'planning.next-meal-replay';
const INTENTION_TYPE = 'planning.next-meal-intention';
const FEEDBACK_TRIAL_TYPE = 'planning.next-meal-feedback-trial';
const FEEDBACK_EVENT_TYPE = 'planning.next-meal-feedback-event';
const SHADOW_COMPARISON_TYPE = 'planning.next-meal-shadow-comparison';
const ACTIVE_PLANNING_RECORD_TYPES = new Set([RUN_TYPE, INTENTION_TYPE]);
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
  readonly feedbackTrialId: string;
  readonly shadowEvaluation: {
    readonly comparisonId: string;
    readonly comparisonVersion: typeof PLANNING_SHADOW_COMPARISON_VERSION_V1;
    readonly solverVersion: typeof HIGHS_SHADOW_SOLVER_VERSION_V1;
    readonly engine: 'HIGHS';
    readonly engineVersion: string;
    readonly modelVersion: typeof HIGHS_SHADOW_MODEL_VERSION_V1;
    readonly modelSha256: string;
    readonly outcome: PlanningShadowComparisonV1['outcome'];
    readonly severity: PlanningShadowComparisonV1['severity'];
    readonly recommendationAgreement: boolean;
    readonly completeOrderAgreement: boolean;
    readonly topKOverlap: PlanningShadowComparisonV1['metrics']['topKOverlap'];
  };
  readonly decisionModel: {
    readonly modelVersion: typeof PLANNING_DOMAIN_MODEL_VERSION_V1;
    readonly adapterVersion: typeof NEXT_MEAL_DOMAIN_ADAPTER_VERSION_V1;
    readonly problemId: string;
    readonly stateKey: string;
    readonly decisionChainHash: string;
  };
  readonly replayArtifact: PlanningReplayArtifactV1;
  readonly input: NextMealStoredInputV1;
  readonly result: NextMealCompactRankingResultV1;
  readonly explanations: readonly NextMealCandidateExplanationV1[];
  readonly temporalPolicy: NextMealTemporalPolicyReleaseV1;
  readonly appliedTemporalRules: readonly NextMealAppliedTemporalRuleV1[];
}

interface NextMealStoredCandidateV1
  extends Pick<
    NextMealCandidateSource,
    'reference' | 'displayName' | 'preparationState'
  > {
  readonly nutrientsPer100EdibleGrams: readonly NextMealCandidateSource['nutrientsPer100EdibleGrams'][number][];
}

interface NextMealStoredInputV1 {
  readonly planningPolicy: NextMealRankingRequest['planningPolicy'];
  readonly temporalRules: NextMealRankingRequest['temporalRules'];
  readonly acceptedMeals: readonly Pick<
    NextMealRankingRequest['acceptedMeals'][number],
    'mealId' | 'consumedAt'
  >[];
  readonly candidates: {
    readonly requestedAt: string;
    readonly entries: readonly NextMealStoredCandidateV1[];
  };
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

export type NextMealSelectionStageV1 = 'validating' | 'saving';
export type NextMealRecommendationStageV1 =
  | 'clearing-prior-run'
  | 'loading-inputs'
  | 'ranking-catalog'
  | 'classifying-catalog'
  | 'scoring-catalog'
  | 'solving-shadow-milp'
  | 'saving-recommendation';

export interface NextMealRecommendationStageDetailV1 {
  readonly processed: number;
  readonly total: number;
  readonly recommendedChunkSize: number;
}

export interface NextMealRankingChunkHintsV1 {
  readonly classifying?: number;
  readonly scoring?: number;
}

export interface LocalPlanningSnapshotV1<TRun = NextMealRunV1> {
  readonly run: TRun | null;
  readonly fresh: boolean;
  readonly intention: NextMealIntentionV1 | null;
  readonly loggedMealId: string | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readRun(
  record: CanonicalRecordV1,
  replayRecord: CanonicalRecordV1,
  feedbackTrialRecord: CanonicalRecordV1,
  shadowRecord: CanonicalRecordV1,
): Promise<NextMealRunV1> {
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
    typeof data['resultHash'] !== 'string' ||
    typeof data['feedbackTrialId'] !== 'string' ||
    !isObject(data['shadowEvaluation']) ||
    typeof data['shadowEvaluation']['comparisonId'] !== 'string' ||
    typeof data['replayArtifactId'] !== 'string' ||
    replayRecord.recordType !== REPLAY_TYPE ||
    replayRecord.recordId !== data['replayArtifactId'] ||
    replayRecord.subjectId !== record.subjectId ||
    feedbackTrialRecord.recordType !== FEEDBACK_TRIAL_TYPE ||
    feedbackTrialRecord.recordId !== data['feedbackTrialId'] ||
    feedbackTrialRecord.subjectId !== record.subjectId ||
    shadowRecord.recordType !== SHADOW_COMPARISON_TYPE ||
    shadowRecord.recordId !== data['shadowEvaluation']['comparisonId'] ||
    shadowRecord.subjectId !== record.subjectId
  )
    throw new TypeError('A stored next-meal run is invalid.');
  if (
    !isObject(data['decisionModel']) ||
    data['decisionModel']['modelVersion'] !==
      PLANNING_DOMAIN_MODEL_VERSION_V1 ||
    data['decisionModel']['adapterVersion'] !==
      NEXT_MEAL_DOMAIN_ADAPTER_VERSION_V1 ||
    typeof data['decisionModel']['problemId'] !== 'string' ||
    typeof data['decisionModel']['stateKey'] !== 'string' ||
    typeof data['decisionModel']['decisionChainHash'] !== 'string'
  )
    throw new TypeError('A stored next-meal decision model is invalid.');
  if (
    !isObject(data['input']) ||
    !isObject(data['input']['candidates']) ||
    !isObject(data['input']['planningPolicy']) ||
    typeof data['input']['candidates']['requestedAt'] !== 'string' ||
    !Array.isArray(data['input']['candidates']['entries']) ||
    !Array.isArray(data['input']['temporalRules']) ||
    !Array.isArray(data['input']['acceptedMeals']) ||
    !Array.isArray(data['explanations'])
  )
    throw new TypeError('A stored next-meal run is invalid.');
  const input = data['input'] as unknown as NextMealStoredInputV1;
  const replayArtifact = PlanningReplayArtifactV1Schema.parse(
    replayRecord.payload,
  );
  const feedbackTrial = PlanningFeedbackTrialV1Schema.parse(
    feedbackTrialRecord.payload,
  );
  const shadowComparison = PlanningShadowComparisonV1Schema.parse(
    shadowRecord.payload,
  );
  const result = NextMealCompactRankingResultV1Schema.parse(data['result']);
  const temporalPolicy = NextMealTemporalPolicyReleaseV1Schema.parse(
    data['temporalPolicy'],
  );
  const appliedTemporalRules =
    NextMealAppliedTemporalRuleV1Schema.array().parse(
      data['appliedTemporalRules'],
    );
  const explanations = data[
    'explanations'
  ] as unknown as NextMealCandidateExplanationV1[];
  const explanationKeys = new Set(
    explanations.map((explanation) => explanation.candidateKey),
  );
  const rankedExplanations = new Map(
    explanations
      .filter((explanation) => explanation.classification === 'COMPARABLE')
      .map((explanation) => [explanation.candidateKey, explanation]),
  );
  const explanationCounts = explanations.reduce(
    (counts, explanation) => {
      counts[explanation.classification]++;
      return counts;
    },
    {
      COMPARABLE: 0,
      EVIDENCE_LIMITED: 0,
      UNAVAILABLE: 0,
      EXCLUDED: 0,
      REQUIRES_PREPARATION: 0,
    },
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
    (await sha256Canonical(
      canonicalizeJson(
        JsonValueSchema.parse(
          (() => {
            const { contentSha256: _contentSha256, ...content } =
              replayArtifact;
            return content;
          })(),
        ),
      ),
    )) !== replayArtifact.contentSha256 ||
    replayArtifact.context.runId !== data['runId'] ||
    replayArtifact.context.problemId !== data['decisionModel']['problemId'] ||
    replayArtifact.context.subjectKey !== data['ownerSubjectId'] ||
    replayArtifact.expected.requestSha256 !== data['inputHash'] ||
    replayArtifact.expected.decisionChainSha256 !==
      data['decisionModel']['decisionChainHash'] ||
    replayArtifact.expected.stateKey !== data['decisionModel']['stateKey'] ||
    feedbackTrial.runId !== data['runId'] ||
    feedbackTrial.problemId !== data['decisionModel']['problemId'] ||
    feedbackTrial.stateKey !== data['decisionModel']['stateKey'] ||
    feedbackTrial.subjectKey !== data['ownerSubjectId'] ||
    feedbackTrial.presentedAt !== data['createdAt'] ||
    feedbackTrial.validUntil !== data['validUntil'] ||
    feedbackTrial.versions.rankingPolicy !==
      input.planningPolicy.policyVersion ||
    feedbackTrial.versions.domainModel !== PLANNING_DOMAIN_MODEL_VERSION_V1 ||
    feedbackTrial.versions.domainAdapter !==
      NEXT_MEAL_DOMAIN_ADAPTER_VERSION_V1 ||
    feedbackTrial.versions.independentValidator !==
      replayArtifact.versions.independentValidator ||
    feedbackTrial.comparableCandidateCount !== result.counts.COMPARABLE ||
    feedbackTrial.recommended.candidateKey !== result.ranked[0]?.candidateKey ||
    feedbackTrial.recommended.portionId !==
      rankedExplanations.get(result.ranked[0]?.candidateKey ?? '')?.portionId ||
    feedbackTrial.recommended.suggestedEdibleGrams !==
      rankedExplanations.get(result.ranked[0]?.candidateKey ?? '')
        ?.edibleGrams ||
    feedbackTrial.recommended.score.numerator !==
      result.ranked[0]?.score.numerator ||
    feedbackTrial.recommended.score.denominator !==
      result.ranked[0]?.score.denominator ||
    shadowComparison.runId !== data['runId'] ||
    shadowComparison.problemId !== data['decisionModel']['problemId'] ||
    shadowComparison.stateKey !== data['decisionModel']['stateKey'] ||
    shadowComparison.primary.decisionChainSha256 !==
      data['decisionModel']['decisionChainHash'] ||
    shadowComparison.publicationAuthority !== 'PRIMARY_ONLY' ||
    shadowComparison.shadowAffectsPublication !== false ||
    data['shadowEvaluation']['comparisonVersion'] !==
      shadowComparison.comparisonVersion ||
    data['shadowEvaluation']['solverVersion'] !==
      shadowComparison.shadow.solverVersion ||
    data['shadowEvaluation']['engine'] !==
      shadowComparison.shadowExecution.engine ||
    data['shadowEvaluation']['engineVersion'] !==
      shadowComparison.shadowExecution.engineVersion ||
    data['shadowEvaluation']['modelVersion'] !==
      shadowComparison.shadowExecution.modelVersion ||
    data['shadowEvaluation']['modelSha256'] !==
      shadowComparison.shadowExecution.modelSha256 ||
    data['shadowEvaluation']['outcome'] !== shadowComparison.outcome ||
    data['shadowEvaluation']['severity'] !== shadowComparison.severity ||
    data['shadowEvaluation']['recommendationAgreement'] !==
      shadowComparison.metrics.recommendationAgreement ||
    data['shadowEvaluation']['completeOrderAgreement'] !==
      shadowComparison.metrics.completeOrderAgreement ||
    canonicalizeJson(
      JsonValueSchema.parse(data['shadowEvaluation']['topKOverlap']),
    ) !==
      canonicalizeJson(
        JsonValueSchema.parse(shadowComparison.metrics.topKOverlap),
      ) ||
    (await sha256Canonical(canonicalizeJson(JsonValueSchema.parse(result)))) !==
      data['resultHash'] ||
    explanations.length !== result.total ||
    explanationKeys.size !== explanations.length ||
    Object.entries(result.counts).some(
      ([classification, count]) =>
        explanationCounts[classification as keyof typeof explanationCounts] !==
        count,
    ) ||
    result.ranked.some((row) => {
      const explanation = rankedExplanations.get(row.candidateKey);
      return explanation?.rank !== row.rank;
    })
  )
    throw new TypeError('Stored next-meal evidence failed independent review.');
  const hydrated: Record<string, unknown> = { ...data, replayArtifact };
  delete hydrated['replayArtifactId'];
  return hydrated as unknown as NextMealRunV1;
}

function storedRun(run: NextMealRunV1) {
  const { replayArtifact, ...value } = run;
  return {
    ...value,
    replayArtifactId: replayArtifact.context.problemId,
  };
}

function storedInput(
  input: NextMealRankingRequest,
  result: NextMealCompactRankingResultV1,
): NextMealStoredInputV1 {
  const rankedKeys = new Set(result.ranked.map((row) => row.candidateKey));
  const nutrientIds = new Set(
    input.temporalRules.map((rule) => rule.nutrientId),
  );
  return {
    planningPolicy: input.planningPolicy,
    temporalRules: input.temporalRules,
    acceptedMeals: input.acceptedMeals.map(({ mealId, consumedAt }) => ({
      mealId,
      consumedAt,
    })),
    candidates: {
      requestedAt: input.candidates.requestedAt,
      entries: input.candidates.entries
        .filter((candidate) =>
          rankedKeys.has(nextMealSourceKey(candidate.reference)),
        )
        .map((candidate) => ({
          reference: candidate.reference,
          displayName: candidate.displayName,
          preparationState: candidate.preparationState,
          nutrientsPer100EdibleGrams:
            candidate.nutrientsPer100EdibleGrams.filter((nutrient) =>
              nutrientIds.has(nutrient.nutrientId),
            ),
        })),
    },
  };
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

function readFeedbackTrial(record: CanonicalRecordV1): PlanningFeedbackTrialV1 {
  const trial = PlanningFeedbackTrialV1Schema.parse(record.payload);
  if (
    record.recordType !== FEEDBACK_TRIAL_TYPE ||
    record.recordId !== trial.trialId ||
    record.subjectId !== trial.subjectKey
  )
    throw new TypeError('A planning feedback trial envelope is invalid.');
  return trial;
}

function readFeedbackEvent(record: CanonicalRecordV1): PlanningFeedbackEventV1 {
  const event = PlanningFeedbackEventV1Schema.parse(record.payload);
  if (
    record.recordType !== FEEDBACK_EVENT_TYPE ||
    record.recordId !== event.eventId ||
    record.subjectId !== event.subjectKey
  )
    throw new TypeError('A planning feedback event envelope is invalid.');
  return event;
}

function sumCanonicalDecimals(values: readonly string[]): string {
  const parsed = values.map((value) => {
    const [whole, digits = ''] = value.split('.');
    return { digits: `${whole}${digits}`, scale: digits.length };
  });
  const scale = Math.max(0, ...parsed.map((value) => value.scale));
  const addIntegers = (left: string, right: string): string => {
    const width = Math.max(left.length, right.length);
    const a = left.padStart(width, '0');
    const b = right.padStart(width, '0');
    let carry = 0;
    let result = '';
    for (let index = width - 1; index >= 0; index--) {
      const sum = Number(a[index]) + Number(b[index]) + carry;
      result = String(sum % 10) + result;
      carry = Math.floor(sum / 10);
    }
    return `${carry || ''}${result}`.replace(/^0+(?=\d)/, '');
  };
  const total = parsed.reduce(
    (sum, value) =>
      addIntegers(
        sum,
        value.digits.padEnd(value.digits.length + scale - value.scale, '0'),
      ),
    '0',
  );
  if (scale === 0) return total;
  const padded = total.padStart(scale + 1, '0');
  const canonical = `${padded.slice(0, -scale)}.${padded.slice(-scale)}`
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1');
  return canonical;
}

export class BrowserPlanningStore {
  public constructor(
    private readonly compute: (
      request: NextMealRankingRequest,
      onProgress?: (progress: NextMealRankingChunkProgressV1) => void,
      initialChunkSizes?: NextMealRankingChunkHintsV1,
    ) => Promise<NextMealRankingReviewV1> = async (
      request,
      onProgress,
      initialChunkSizes,
    ) =>
      reviewNextMealRankingV1(
        request,
        await rankNextMealCandidatesChunkedV1(request, {
          ...(onProgress ? { onProgress } : {}),
          ...(initialChunkSizes ? { initialChunkSizes } : {}),
          yieldControl: () =>
            new Promise<void>((resolve) => setTimeout(resolve, 0)),
        }),
      ),
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
    private readonly solveShadow: (input: {
      readonly primaryChain: unknown;
      readonly digest: typeof sha256Canonical;
    }) => Promise<HighsShadowResultV1> = solvePlanningHighsShadowV1,
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
      .map((record): [string, string] => [
        record.recordId,
        record.integrity.value,
      ])
      .sort((a, b) => a[0].localeCompare(b[0]));
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

  private async reconcileConsumedFeedback(
    repository: IndexedDbCanonicalRecordRepository,
    owner: string,
  ): Promise<void> {
    const records = await repository.listBySubject(owner);
    const eventRecords = records.filter(
      ({ recordType }) => recordType === FEEDBACK_EVENT_TYPE,
    );
    const events = eventRecords.map(readFeedbackEvent);
    const consumedTrialIds = new Set(
      events
        .filter(({ eventType }) => eventType === 'CONSUMED')
        .map(({ trialId }) => trialId),
    );
    const selections = events
      .filter(
        (
          event,
        ): event is Extract<
          PlanningFeedbackEventV1,
          { eventType: 'SELECTED' }
        > => event.eventType === 'SELECTED',
      )
      .sort(
        (left, right) =>
          right.observedAt.localeCompare(left.observedAt) ||
          right.intentionId.localeCompare(left.intentionId),
      );
    if (selections.length === 0) return;
    const meals = await this.foods.listMeals();
    const mealByIntention = new Map(
      meals
        .filter(
          (meal) =>
            meal.state === 'recorded' && meal.planningIntentionId !== undefined,
        )
        .map((meal) => [meal.planningIntentionId!, meal]),
    );
    const pending: CanonicalRecordV1[] = [];
    for (const selection of selections) {
      if (consumedTrialIds.has(selection.trialId)) continue;
      const meal = mealByIntention.get(selection.intentionId);
      if (!meal) continue;
      const matchedGrams = meal.items
        .filter(
          ({ reference }) =>
            nextMealSourceKey(reference) === selection.candidateKey,
        )
        .map(({ edibleGramWeight }) => edibleGramWeight);
      if (matchedGrams.length === 0) continue;
      const event = PlanningFeedbackEventV1Schema.parse({
        format: 'nutrixx.planning-feedback-event',
        schemaVersion: 1,
        feedbackVersion: PLANNING_OUTCOME_FEEDBACK_VERSION_V1,
        eventId: crypto.randomUUID(),
        trialId: selection.trialId,
        subjectKey: owner,
        runId: selection.runId,
        observedAt: meal.recordedAt,
        eventType: 'CONSUMED',
        intentionId: selection.intentionId,
        mealId: meal.mealId,
        candidateKey: selection.candidateKey,
        portionId: selection.portionId,
        consumedAt: meal.occurredAt,
        actualEdibleGrams: sumCanonicalDecimals(matchedGrams),
      });
      pending.push(
        await this.record(
          event.eventId,
          owner,
          FEEDBACK_EVENT_TYPE,
          event,
          event.observedAt,
          'user-entered',
        ),
      );
      consumedTrialIds.add(selection.trialId);
    }
    if (pending.length > 0)
      await repository.commit({
        commandId: `reconcile-planning-feedback:${crypto.randomUUID()}`,
        occurredAt: new Date().toISOString(),
        mutations: pending.map((record) => ({ kind: 'put' as const, record })),
      });
  }

  public async loadCalibrationReport(): Promise<PlanningCalibrationReportV1> {
    return this.withRepository(async (repository, owner) => {
      await this.reconcileConsumedFeedback(repository, owner);
      const records = await repository.listBySubject(owner);
      const trialRecords = records.filter(
        ({ recordType }) => recordType === FEEDBACK_TRIAL_TYPE,
      );
      const eventRecords = records.filter(
        ({ recordType }) => recordType === FEEDBACK_EVENT_TYPE,
      );
      return buildPlanningCalibrationReportV1({
        trials: trialRecords.map(readFeedbackTrial),
        events: eventRecords.map(readFeedbackEvent),
        asOf: new Date().toISOString(),
      });
    });
  }

  public async createRecommendation(
    options: {
      readonly inventory: readonly DeclaredInventoryItemV1[] | null;
      readonly rankingChunkHints?: NextMealRankingChunkHintsV1;
    },
    onStage?: (
      stage: NextMealRecommendationStageV1,
      detail?: NextMealRecommendationStageDetailV1,
    ) => void,
  ): Promise<
    | { readonly status: 'READY'; readonly runId: string }
    | {
        readonly status: 'NEEDS_INPUT';
        readonly reasonCodes: readonly string[];
        readonly diagnosis?: PlanningFeasibilityDiagnosisV1;
      }
    | {
        readonly status: 'INFEASIBLE';
        readonly reasonCodes: readonly string[];
        readonly diagnosis: PlanningFeasibilityDiagnosisV1;
      }
  > {
    const profile = await this.onboarding.load();
    if (!profile) throw new TypeError('Complete the starting profile first.');
    onStage?.('clearing-prior-run');
    await this.withRepository(async (repository, owner) => {
      await this.reconcileConsumedFeedback(repository, owner);
      const records = await repository.listBySubject(owner);
      const obsolete = records.filter((record) =>
        ACTIVE_PLANNING_RECORD_TYPES.has(record.recordType),
      );
      if (obsolete.length === 0) return;
      const now = new Date().toISOString();
      const existingSupersededTrials = new Set(
        records
          .filter(({ recordType }) => recordType === FEEDBACK_EVENT_TYPE)
          .map(readFeedbackEvent)
          .filter(({ eventType }) => eventType === 'SUPERSEDED')
          .map(({ trialId }) => trialId),
      );
      const supersededRecords = await Promise.all(
        obsolete
          .filter(({ recordType }) => recordType === RUN_TYPE)
          .flatMap((record) => {
            const trialId = isObject(record.payload)
              ? record.payload['feedbackTrialId']
              : undefined;
            const trialRecord =
              typeof trialId === 'string'
                ? records.find(({ recordId }) => recordId === trialId)
                : undefined;
            if (!trialRecord || existingSupersededTrials.has(trialId as string))
              return [];
            return [readFeedbackTrial(trialRecord)];
          })
          .map(async (trial) => {
            const event = PlanningFeedbackEventV1Schema.parse({
              format: 'nutrixx.planning-feedback-event',
              schemaVersion: 1,
              feedbackVersion: PLANNING_OUTCOME_FEEDBACK_VERSION_V1,
              eventId: crypto.randomUUID(),
              trialId: trial.trialId,
              subjectKey: owner,
              runId: trial.runId,
              observedAt: now,
              eventType: 'SUPERSEDED',
              cause: 'NEW_PLANNING_REQUEST',
            });
            return this.record(
              event.eventId,
              owner,
              FEEDBACK_EVENT_TYPE,
              event,
              now,
              'calculated',
            );
          }),
      );
      await repository.commit({
        commandId: `replace-next-meal:${crypto.randomUUID()}`,
        occurredAt: now,
        mutations: [
          ...supersededRecords.map((record) => ({
            kind: 'put' as const,
            record,
          })),
          ...obsolete.map((record) => ({
            kind: 'delete' as const,
            recordId: record.recordId,
          })),
        ],
      });
    });
    const before = await this.withRepository((repository, owner) =>
      this.freshnessHash(repository, owner),
    );
    onStage?.('loading-inputs');
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
    onStage?.('ranking-catalog');
    const computed = await this.compute(
      built.request,
      (progress) =>
        onStage?.(
          progress.phase === 'classifying'
            ? 'classifying-catalog'
            : 'scoring-catalog',
          {
            processed: progress.processed,
            total: progress.total,
            recommendedChunkSize: progress.recommendedChunkSize,
          },
        ),
      options.rankingChunkHints,
    );
    if (computed.status !== 'APPROVED')
      throw new TypeError(
        `Independent ranking validation failed: ${computed.reasonCodes.join(', ')}.`,
      );
    const review = reviewNextMealRankingV1(built.request, computed.ranking);
    if (
      review.status !== 'APPROVED' ||
      JSON.stringify(review.explanations) !==
        JSON.stringify(computed.explanations)
    )
      throw new TypeError('The next-meal result failed independent review.');
    if (review.diagnosis.status !== 'READY')
      return {
        status: review.diagnosis.status,
        reasonCodes: review.diagnosis.conflictSet.reasonCodes,
        diagnosis: review.diagnosis,
      };
    const compactResult = compactNextMealRankingResultV1(review.ranking);
    const runId = crypto.randomUUID();
    const problemId = crypto.randomUUID();
    const feedbackTrialId = crypto.randomUUID();
    const shadowComparisonId = crypto.randomUUID();
    const completedAt = new Date().toISOString();
    const replayArtifact = await createPlanningReplayArtifactV1(
      built.request,
      review.ranking,
      {
        problemId,
        runId,
        subjectKey: profile.ownerSubjectId,
        capturedAt: built.request.candidates.requestedAt,
        validatedAt: completedAt,
      },
      sha256Canonical,
    );
    const primaryChain = createNextMealPlanningDecisionChainV1(
      built.request,
      review.ranking,
      {
        problemId,
        runId,
        subjectKey: profile.ownerSubjectId,
        capturedAt: built.request.candidates.requestedAt,
        validatedAt: completedAt,
      },
    );
    onStage?.('solving-shadow-milp');
    const shadow = await this.solveShadow({
      primaryChain,
      digest: sha256Canonical,
    });
    const shadowComparison = await comparePlanningShadowSolversV1({
      comparisonId: shadowComparisonId,
      evaluatedAt: completedAt,
      primarySolverVersion: built.request.planningPolicy.policyVersion,
      shadowSolverVersion: HIGHS_SHADOW_SOLVER_VERSION_V1,
      primaryChain,
      shadowChain: shadow.chain,
      shadowExecution: shadow.execution,
      digest: sha256Canonical,
    });
    if (
      shadowComparison.primary.decisionChainSha256 !==
      replayArtifact.expected.decisionChainSha256
    )
      throw new TypeError(
        'Shadow comparison and replay evidence describe different primary decisions.',
      );
    const validUntil = nextMealValidUntilV1(
      built.request,
      built.temporalPolicy,
    );
    onStage?.('saving-recommendation');
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
        inputHash: replayArtifact.expected.requestSha256,
        resultHash: await sha256Canonical(
          canonicalizeJson(JsonValueSchema.parse(compactResult)),
        ),
        feedbackTrialId,
        shadowEvaluation: {
          comparisonId: shadowComparison.comparisonId,
          comparisonVersion: shadowComparison.comparisonVersion,
          solverVersion: HIGHS_SHADOW_SOLVER_VERSION_V1,
          engine: shadowComparison.shadowExecution.engine,
          engineVersion: shadowComparison.shadowExecution.engineVersion,
          modelVersion: HIGHS_SHADOW_MODEL_VERSION_V1,
          modelSha256: shadowComparison.shadowExecution.modelSha256,
          outcome: shadowComparison.outcome,
          severity: shadowComparison.severity,
          recommendationAgreement:
            shadowComparison.metrics.recommendationAgreement,
          completeOrderAgreement:
            shadowComparison.metrics.completeOrderAgreement,
          topKOverlap: shadowComparison.metrics.topKOverlap,
        },
        decisionModel: {
          modelVersion: PLANNING_DOMAIN_MODEL_VERSION_V1,
          adapterVersion: NEXT_MEAL_DOMAIN_ADAPTER_VERSION_V1,
          problemId,
          stateKey: replayArtifact.expected.stateKey,
          decisionChainHash: replayArtifact.expected.decisionChainSha256,
        },
        replayArtifact,
        input: storedInput(built.request, compactResult),
        result: compactResult,
        explanations: review.explanations,
        temporalPolicy: built.temporalPolicy,
        appliedTemporalRules: built.appliedTemporalRules,
      };
      const recommended = review.ranking.ranked[0];
      const recommendationEvidence = review.explanations.find(
        ({ candidateKey }) => candidateKey === recommended?.candidateKey,
      );
      if (
        !recommended ||
        recommendationEvidence?.classification !== 'COMPARABLE' ||
        !recommendationEvidence.portionId ||
        !recommendationEvidence.edibleGrams
      )
        throw new TypeError(
          'A ready recommendation needs complete top-ranked evidence.',
        );
      const feedbackTrial = PlanningFeedbackTrialV1Schema.parse({
        format: 'nutrixx.planning-feedback-trial',
        schemaVersion: 1,
        feedbackVersion: PLANNING_OUTCOME_FEEDBACK_VERSION_V1,
        trialId: feedbackTrialId,
        subjectKey: owner,
        runId,
        problemId,
        stateKey: replayArtifact.expected.stateKey,
        versions: {
          rankingPolicy: built.request.planningPolicy.policyVersion,
          domainModel: PLANNING_DOMAIN_MODEL_VERSION_V1,
          domainAdapter: NEXT_MEAL_DOMAIN_ADAPTER_VERSION_V1,
          independentValidator: computed.validatorVersion,
        },
        presentedAt: completedAt,
        validUntil,
        comparableCandidateCount: review.ranking.counts.COMPARABLE,
        recommended: {
          candidateKey: recommended.candidateKey,
          portionId: recommendationEvidence.portionId,
          rank: 1,
          suggestedEdibleGrams: recommendationEvidence.edibleGrams,
          score: recommended.weightedDistance,
        },
      });
      const [runRecord, replayRecord, feedbackTrialRecord, shadowRecord] =
        await Promise.all([
          this.record(
            runId,
            owner,
            RUN_TYPE,
            storedRun(run),
            completedAt,
            'calculated',
          ),
          this.record(
            problemId,
            owner,
            REPLAY_TYPE,
            replayArtifact,
            completedAt,
            'calculated',
          ),
          this.record(
            feedbackTrialId,
            owner,
            FEEDBACK_TRIAL_TYPE,
            feedbackTrial,
            completedAt,
            'calculated',
          ),
          this.record(
            shadowComparisonId,
            owner,
            SHADOW_COMPARISON_TYPE,
            shadowComparison,
            completedAt,
            'calculated',
          ),
        ]);
      await repository.commit({
        commandId: `publish-next-meal:${runId}`,
        occurredAt: completedAt,
        mutations: [
          { kind: 'put', record: replayRecord },
          { kind: 'put', record: feedbackTrialRecord },
          { kind: 'put', record: shadowRecord },
          { kind: 'put', record: runRecord },
        ],
      });
      try {
        await savePlanningView(indexedDB, {
          owner,
          sequence: await repository.latestTransactionSequence(),
          activeReleaseId: await this.foods.activeCatalogRelease(),
          snapshot: projectPlanningSnapshot({
            run,
            fresh: true,
            intention: null,
            loggedMealId: null,
          }),
        });
      } catch {
        // The canonical run remains valid; a later load can rebuild this view.
      }
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
      const replayArtifactId = isObject(latest.payload)
        ? latest.payload['replayArtifactId']
        : null;
      const feedbackTrialId = isObject(latest.payload)
        ? latest.payload['feedbackTrialId']
        : null;
      const shadowComparisonId =
        isObject(latest.payload) && isObject(latest.payload['shadowEvaluation'])
          ? latest.payload['shadowEvaluation']['comparisonId']
          : null;
      const replayRecord = records.find(
        (record) =>
          record.recordType === REPLAY_TYPE &&
          record.recordId === replayArtifactId,
      );
      if (
        !replayRecord ||
        !(await verifyCanonicalRecordV1(replayRecord, sha256Canonical))
      )
        throw new TypeError(
          'Stored next-meal replay artifact integrity check failed.',
        );
      const feedbackTrialRecord = records.find(
        (record) =>
          record.recordType === FEEDBACK_TRIAL_TYPE &&
          record.recordId === feedbackTrialId,
      );
      if (
        !feedbackTrialRecord ||
        !(await verifyCanonicalRecordV1(feedbackTrialRecord, sha256Canonical))
      )
        throw new TypeError(
          'Stored next-meal feedback trial integrity check failed.',
        );
      const shadowRecord = records.find(
        (record) =>
          record.recordType === SHADOW_COMPARISON_TYPE &&
          record.recordId === shadowComparisonId,
      );
      if (
        !shadowRecord ||
        !(await verifyCanonicalRecordV1(shadowRecord, sha256Canonical))
      )
        throw new TypeError(
          'Stored next-meal shadow comparison integrity check failed.',
        );
      const run = await readRun(
        latest,
        replayRecord,
        feedbackTrialRecord,
        shadowRecord,
      );
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
        .sort(
          (a, b) =>
            b.selectedAt.localeCompare(a.selectedAt) ||
            b.intentionId.localeCompare(a.intentionId),
        );
      const intention = currentIntentions[0] ?? null;
      if (
        intention &&
        (!run.result.ranked.some(
          (row) => row.candidateKey === intention.candidateKey,
        ) ||
          !run.explanations.some(
            (explanation) =>
              explanation.candidateKey === intention.candidateKey &&
              explanation.classification === 'COMPARABLE' &&
              explanation.portionId === intention.portionId,
          ))
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

  public async loadExplanation(
    runId: string,
    candidateKey: string,
  ): Promise<NextMealCandidateExplanationV1> {
    const snapshot = await this.load();
    if (!snapshot.run || snapshot.run.runId !== runId)
      throw new TypeError('The saved recommendation changed.');
    const explanation = snapshot.run.explanations.find(
      (item) => item.candidateKey === candidateKey,
    );
    if (!explanation)
      throw new TypeError('The requested ranking explanation is unavailable.');
    return explanation;
  }

  public async selectIntention(
    runId: string,
    candidateKey: string,
    onStage?: (stage: NextMealSelectionStageV1) => void,
  ): Promise<NextMealIntentionV1> {
    const owner = (await this.onboarding.load())?.ownerSubjectId;
    if (!owner) throw new TypeError('Complete the starting profile first.');
    if (!navigator.locks)
      throw new TypeError('A secure browser context is required.');
    onStage?.('validating');
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
        const evidence = snapshot.run.explanations.find(
          (item) => item.candidateKey === candidateKey,
        );
        if (
          !row ||
          evidence?.classification !== 'COMPARABLE' ||
          !evidence.portionId
        )
          throw new TypeError('Choose a validated, comparable food or recipe.');
        const portionId = evidence.portionId;
        const intentionId = crypto.randomUUID();
        const selectedAt = new Date().toISOString();
        return this.withRepository(async (repository, currentOwner) => {
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
            portionId,
            selectedAt,
          };
          const trialRecord = await repository.getById(
            snapshot.run!.feedbackTrialId,
          );
          if (!trialRecord)
            throw new TypeError('The planning feedback trial is unavailable.');
          const trial = readFeedbackTrial(trialRecord);
          if (trial.runId !== runId || trial.subjectKey !== currentOwner)
            throw new TypeError(
              'The planning feedback trial changed before selection.',
            );
          const feedbackEvent = PlanningFeedbackEventV1Schema.parse({
            format: 'nutrixx.planning-feedback-event',
            schemaVersion: 1,
            feedbackVersion: PLANNING_OUTCOME_FEEDBACK_VERSION_V1,
            eventId: crypto.randomUUID(),
            trialId: trial.trialId,
            subjectKey: currentOwner,
            runId,
            observedAt: selectedAt,
            eventType: 'SELECTED',
            intentionId,
            candidateKey,
            portionId,
            rank: row.rank,
            suggestedEdibleGrams: evidence.edibleGrams,
          });
          onStage?.('saving');
          const [intentionRecord, feedbackRecord] = await Promise.all([
            this.record(
              intentionId,
              currentOwner,
              INTENTION_TYPE,
              intention,
              selectedAt,
              'user-entered',
            ),
            this.record(
              feedbackEvent.eventId,
              currentOwner,
              FEEDBACK_EVENT_TYPE,
              feedbackEvent,
              selectedAt,
              'user-entered',
            ),
          ]);
          await repository.commit({
            commandId: `select-next-meal:${intentionId}`,
            occurredAt: selectedAt,
            mutations: [
              { kind: 'put', record: intentionRecord },
              { kind: 'put', record: feedbackRecord },
            ],
          });
          return intention;
        });
      },
    );
  }

  public async select(runId: string, candidateKey: string): Promise<string> {
    return (await this.selectIntention(runId, candidateKey)).intentionId;
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
        const evidence = snapshot.run.explanations.find(
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
          evidence?.classification !== 'COMPARABLE' ||
          !evidence.edibleGrams ||
          !candidate ||
          !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(options.edibleGrams) ||
          !Number.isFinite(Number(options.edibleGrams)) ||
          Number(options.edibleGrams) <= 0
        )
          throw new TypeError(
            'Confirm a positive edible quantity for the selected food.',
          );
        const occurredAt = Date.parse(options.occurredAt);
        if (
          !Number.isFinite(occurredAt) ||
          occurredAt < Date.parse(snapshot.intention.selectedAt) ||
          occurredAt > Date.now()
        )
          throw new TypeError(
            'The consumption time must follow selection and remain current.',
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
          defaultGramWeight: evidence.edibleGrams,
          preparationState: candidate.preparationState,
          provenance: 'validated-local-catalog',
          completeness: 'source-backed',
        };
        const mealId = await this.foods.saveMeal({
          mealType: options.mealType,
          occurredAt: options.occurredAt,
          planningIntentionId: options.intentionId,
          items: [{ choice, gramWeight: options.edibleGrams }],
        });
        await this.withRepository((repository, currentOwner) =>
          this.reconcileConsumedFeedback(repository, currentOwner),
        ).catch(() => undefined);
        return mealId;
      },
    );
  }
}
