import * as z from 'zod';

import { JsonValueSchema, canonicalizeJson } from '@nutrixx/canonical-schema';

import {
  NextMealCandidateSourceSchema,
  nextMealSourceKey,
  type NextMealCandidateSource,
} from './next-meal-candidates.js';
import {
  NEXT_MEAL_DOMAIN_ADAPTER_VERSION_V1,
  createNextMealPlanningDecisionChainV1,
  type NextMealDomainAdapterContextV1,
} from './next-meal-domain-adapter.js';
import {
  NEXT_MEAL_HARD_CONSTRAINT_POLICY_VERSION_V1,
  NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1,
  NEXT_MEAL_TERMINAL_VALUE_POLICY_VERSION_V1,
  NEXT_MEAL_UNCERTAINTY_POLICY_VERSION_V1,
} from './next-meal-decision-policy.js';
import {
  NEXT_MEAL_RANKING_POLICY_VERSION_V1,
  NextMealRankingRequestSchema,
  rankNextMealCandidatesV1,
  type NextMealRankingRequest,
  type NextMealRankingResult,
} from './next-meal-ranking.js';
import {
  NEXT_MEAL_VALIDATOR_VERSION_V1,
  NextMealRankingResultSchema,
  reviewNextMealRankingV1,
} from './next-meal-validation.js';
import {
  PLANNING_DOMAIN_MODEL_VERSION_V1,
  PlanningDecisionChainV1Schema,
} from './planning-domain-model.js';
import { PLANNING_DECISION_VALIDATOR_VERSION_V1 } from './planning-decision-validator.js';

export const PLANNING_REPLAY_ARTIFACT_VERSION_V1 =
  'planning-replay-artifact-v1' as const;

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const ReplayContextSchema = z.strictObject({
  problemId: z.string().min(1),
  runId: z.string().min(1),
  subjectKey: z.string().min(1),
  capturedAt: z.iso.datetime({ offset: true }),
  validatedAt: z.iso.datetime({ offset: true }),
});
const ReplayVersionsSchema = z.strictObject({
  replayArtifact: z.literal(PLANNING_REPLAY_ARTIFACT_VERSION_V1),
  domainModel: z.literal(PLANNING_DOMAIN_MODEL_VERSION_V1),
  domainAdapter: z.literal(NEXT_MEAL_DOMAIN_ADAPTER_VERSION_V1),
  rankingPolicy: z.literal(NEXT_MEAL_RANKING_POLICY_VERSION_V1),
  hardConstraintPolicy: z.literal(NEXT_MEAL_HARD_CONSTRAINT_POLICY_VERSION_V1),
  objectiveHierarchy: z.literal(NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1),
  uncertaintyPolicy: z.literal(NEXT_MEAL_UNCERTAINTY_POLICY_VERSION_V1),
  terminalValuePolicy: z.literal(NEXT_MEAL_TERMINAL_VALUE_POLICY_VERSION_V1),
  independentValidator: z.literal(NEXT_MEAL_VALIDATOR_VERSION_V1),
  decisionValidator: z.literal(PLANNING_DECISION_VALIDATOR_VERSION_V1),
});

const ReplayRequestSnapshotSchema = z.strictObject({
  planningPolicy: NextMealRankingRequestSchema.shape.planningPolicy,
  candidates: z.strictObject({
    requestedAt:
      NextMealRankingRequestSchema.shape.candidates.shape.requestedAt,
    exclusions: NextMealRankingRequestSchema.shape.candidates.shape.exclusions,
    inventory: NextMealRankingRequestSchema.shape.candidates.shape.inventory,
    comparisonNutrients:
      NextMealRankingRequestSchema.shape.candidates.shape.comparisonNutrients,
    hardLimits: NextMealRankingRequestSchema.shape.candidates.shape.hardLimits,
  }),
  acceptedMeals: NextMealRankingRequestSchema.shape.acceptedMeals,
  temporalRules: NextMealRankingRequestSchema.shape.temporalRules,
});

const CandidateCorpusReferenceSchema = z
  .strictObject({
    entryCount: z.int().nonnegative(),
    entryKeys: z.array(z.string().min(1)),
    sha256: Sha256Schema,
    catalogReleaseIds: z.array(z.string().min(1)),
    recipeRevisions: z.array(
      z.strictObject({
        recipeId: z.string().min(1),
        recipeVersion: z.int().positive(),
      }),
    ),
  })
  .superRefine((corpus, context) => {
    const sortedKeys = [...corpus.entryKeys].sort();
    const sortedReleases = [...corpus.catalogReleaseIds].sort();
    const recipeKeys = corpus.recipeRevisions.map(
      ({ recipeId, recipeVersion }) => `${recipeId}:${recipeVersion}`,
    );
    const sortedRecipes = [...corpus.recipeRevisions].sort(
      (left, right) =>
        left.recipeId.localeCompare(right.recipeId) ||
        left.recipeVersion - right.recipeVersion,
    );
    if (
      corpus.entryCount !== corpus.entryKeys.length ||
      new Set(corpus.entryKeys).size !== corpus.entryKeys.length ||
      corpus.entryKeys.some((key, index) => key !== sortedKeys[index])
    )
      context.addIssue({
        code: 'custom',
        path: ['entryKeys'],
        message: 'Candidate corpus keys must be complete, unique, and sorted.',
      });
    if (
      new Set(corpus.catalogReleaseIds).size !==
        corpus.catalogReleaseIds.length ||
      corpus.catalogReleaseIds.some(
        (release, index) => release !== sortedReleases[index],
      )
    )
      context.addIssue({
        code: 'custom',
        path: ['catalogReleaseIds'],
        message: 'Catalog release identities must be unique and sorted.',
      });
    if (
      new Set(recipeKeys).size !== recipeKeys.length ||
      corpus.recipeRevisions.some(
        (recipe, index) =>
          recipe.recipeId !== sortedRecipes[index]?.recipeId ||
          recipe.recipeVersion !== sortedRecipes[index]?.recipeVersion,
      )
    )
      context.addIssue({
        code: 'custom',
        path: ['recipeRevisions'],
        message: 'Recipe revisions must be unique and sorted.',
      });
  });

const ReplayExpectedEvidenceSchema = z.strictObject({
  requestSha256: Sha256Schema,
  rankingSha256: Sha256Schema,
  decisionChainSha256: Sha256Schema,
  stateKey: z.string().min(1),
});

const PlanningReplayArtifactContentV1Schema = z.strictObject({
  format: z.literal('nutrixx.planning-replay-artifact'),
  schemaVersion: z.literal(1),
  versions: ReplayVersionsSchema,
  context: ReplayContextSchema,
  request: ReplayRequestSnapshotSchema,
  candidateCorpus: CandidateCorpusReferenceSchema,
  expected: ReplayExpectedEvidenceSchema,
});

export const PlanningReplayArtifactV1Schema =
  PlanningReplayArtifactContentV1Schema.extend({
    contentSha256: Sha256Schema,
  });

export type PlanningReplayArtifactV1 = z.infer<
  typeof PlanningReplayArtifactV1Schema
>;

export type PlanningReplayDigestV1 = (canonicalJson: string) => Promise<string>;

export type PlanningReplayMismatchReasonV1 =
  | 'artifact-content-digest-mismatch'
  | 'candidate-corpus-digest-mismatch'
  | 'candidate-corpus-identity-mismatch'
  | 'request-digest-mismatch'
  | 'ranking-digest-mismatch'
  | 'independent-validator-rejected'
  | 'decision-chain-digest-mismatch';

export type PlanningReplayResultV1 =
  | {
      readonly status: 'MATCH';
      readonly contentSha256: string;
      readonly requestSha256: string;
      readonly rankingSha256: string;
      readonly decisionChainSha256: string;
    }
  | {
      readonly status: 'MISMATCH';
      readonly reasonCodes: readonly PlanningReplayMismatchReasonV1[];
    };

function json(value: unknown): string {
  return canonicalizeJson(JsonValueSchema.parse(value));
}

function requestSnapshot(
  request: NextMealRankingRequest,
): z.infer<typeof ReplayRequestSnapshotSchema> {
  return ReplayRequestSnapshotSchema.parse({
    planningPolicy: request.planningPolicy,
    candidates: {
      requestedAt: request.candidates.requestedAt,
      exclusions: request.candidates.exclusions,
      inventory: request.candidates.inventory,
      comparisonNutrients: request.candidates.comparisonNutrients,
      hardLimits: request.candidates.hardLimits,
    },
    acceptedMeals: request.acceptedMeals,
    temporalRules: request.temporalRules,
  });
}

function corpusIdentity(entries: readonly NextMealCandidateSource[]) {
  const entryKeys = entries
    .map((entry) => nextMealSourceKey(entry.reference))
    .sort();
  const catalogReleaseIds = [
    ...new Set(
      entries.flatMap((entry) =>
        entry.reference.kind === 'food'
          ? [entry.reference.catalogReleaseId]
          : [],
      ),
    ),
  ].sort();
  const recipeRevisions = entries
    .flatMap((entry) =>
      entry.reference.kind === 'recipe'
        ? [
            {
              recipeId: entry.reference.recipeId,
              recipeVersion: entry.reference.recipeVersion,
            },
          ]
        : [],
    )
    .sort(
      (left, right) =>
        left.recipeId.localeCompare(right.recipeId) ||
        left.recipeVersion - right.recipeVersion,
    );
  return { entryKeys, catalogReleaseIds, recipeRevisions };
}

async function corpusReference(
  entries: readonly NextMealCandidateSource[],
  digest: PlanningReplayDigestV1,
) {
  const identity = corpusIdentity(entries);
  return CandidateCorpusReferenceSchema.parse({
    entryCount: entries.length,
    ...identity,
    sha256: await digest(json(entries)),
  });
}

function completeRequest(
  snapshot: z.infer<typeof ReplayRequestSnapshotSchema>,
  corpus: PlanningReplayArtifactV1['candidateCorpus'],
  entries: readonly NextMealCandidateSource[],
): NextMealRankingRequest {
  return NextMealRankingRequestSchema.parse({
    ...snapshot,
    candidates: {
      ...snapshot.candidates,
      manifest: { entryKeys: corpus.entryKeys },
      entries,
    },
  });
}

/**
 * Creates the immutable receipt needed to reconstruct a published decision.
 * The large candidate corpus is content-addressed instead of duplicated into
 * every run; callers retain or resolve that immutable corpus independently.
 */
export async function createPlanningReplayArtifactV1(
  rawRequest: NextMealRankingRequest,
  rawRanking: NextMealRankingResult,
  context: NextMealDomainAdapterContextV1,
  digest: PlanningReplayDigestV1,
): Promise<PlanningReplayArtifactV1> {
  const request = NextMealRankingRequestSchema.parse(rawRequest);
  const ranking = NextMealRankingResultSchema.parse(rawRanking);
  const review = reviewNextMealRankingV1(request, ranking);
  if (review.status !== 'APPROVED')
    throw new TypeError(
      'A replay artifact requires an independently approved ranking.',
    );
  const decisionChain = createNextMealPlanningDecisionChainV1(
    request,
    ranking,
    context,
  );
  const content = PlanningReplayArtifactContentV1Schema.parse({
    format: 'nutrixx.planning-replay-artifact',
    schemaVersion: 1,
    versions: {
      replayArtifact: PLANNING_REPLAY_ARTIFACT_VERSION_V1,
      domainModel: PLANNING_DOMAIN_MODEL_VERSION_V1,
      domainAdapter: NEXT_MEAL_DOMAIN_ADAPTER_VERSION_V1,
      rankingPolicy: NEXT_MEAL_RANKING_POLICY_VERSION_V1,
      hardConstraintPolicy: NEXT_MEAL_HARD_CONSTRAINT_POLICY_VERSION_V1,
      objectiveHierarchy: NEXT_MEAL_OBJECTIVE_HIERARCHY_VERSION_V1,
      uncertaintyPolicy: NEXT_MEAL_UNCERTAINTY_POLICY_VERSION_V1,
      terminalValuePolicy: NEXT_MEAL_TERMINAL_VALUE_POLICY_VERSION_V1,
      independentValidator: NEXT_MEAL_VALIDATOR_VERSION_V1,
      decisionValidator: PLANNING_DECISION_VALIDATOR_VERSION_V1,
    },
    context,
    request: requestSnapshot(request),
    candidateCorpus: await corpusReference(request.candidates.entries, digest),
    expected: {
      requestSha256: await digest(json(request)),
      rankingSha256: await digest(json(ranking)),
      decisionChainSha256: await digest(json(decisionChain)),
      stateKey: decisionChain.problem.state.stateKey,
    },
  });
  return PlanningReplayArtifactV1Schema.parse({
    ...content,
    contentSha256: await digest(json(content)),
  });
}

/** Recomputes and validates a decision without trusting the stored outcome. */
export async function replayPlanningDecisionV1(
  rawArtifact: PlanningReplayArtifactV1,
  rawCandidateCorpus: readonly NextMealCandidateSource[],
  digest: PlanningReplayDigestV1,
): Promise<PlanningReplayResultV1> {
  const artifact = PlanningReplayArtifactV1Schema.parse(rawArtifact);
  const entries = z
    .array(NextMealCandidateSourceSchema)
    .parse(rawCandidateCorpus);
  const reasons = new Set<PlanningReplayMismatchReasonV1>();
  const { contentSha256: _storedContentDigest, ...content } = artifact;
  if ((await digest(json(content))) !== artifact.contentSha256)
    reasons.add('artifact-content-digest-mismatch');

  const identity = corpusIdentity(entries);
  if (
    entries.length !== artifact.candidateCorpus.entryCount ||
    json(identity) !==
      json({
        entryKeys: artifact.candidateCorpus.entryKeys,
        catalogReleaseIds: artifact.candidateCorpus.catalogReleaseIds,
        recipeRevisions: artifact.candidateCorpus.recipeRevisions,
      })
  )
    reasons.add('candidate-corpus-identity-mismatch');
  if ((await digest(json(entries))) !== artifact.candidateCorpus.sha256)
    reasons.add('candidate-corpus-digest-mismatch');
  if (reasons.size > 0)
    return { status: 'MISMATCH', reasonCodes: [...reasons] };

  const request = completeRequest(
    artifact.request,
    artifact.candidateCorpus,
    entries,
  );
  const requestSha256 = await digest(json(request));
  if (requestSha256 !== artifact.expected.requestSha256)
    reasons.add('request-digest-mismatch');
  const ranking = rankNextMealCandidatesV1(request);
  const rankingSha256 = await digest(json(ranking));
  if (rankingSha256 !== artifact.expected.rankingSha256)
    reasons.add('ranking-digest-mismatch');
  const review = reviewNextMealRankingV1(request, ranking);
  if (review.status !== 'APPROVED')
    reasons.add('independent-validator-rejected');
  const decisionChain = PlanningDecisionChainV1Schema.parse(
    createNextMealPlanningDecisionChainV1(request, ranking, artifact.context),
  );
  const decisionChainSha256 = await digest(json(decisionChain));
  if (decisionChainSha256 !== artifact.expected.decisionChainSha256)
    reasons.add('decision-chain-digest-mismatch');
  return reasons.size > 0
    ? { status: 'MISMATCH', reasonCodes: [...reasons] }
    : {
        status: 'MATCH',
        contentSha256: artifact.contentSha256,
        requestSha256,
        rankingSha256,
        decisionChainSha256,
      };
}
