import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  nextMealSourceKey,
  type NextMealCandidateSource,
} from './next-meal-candidates.js';
import {
  NextMealRankingRequestSchema,
  rankNextMealCandidatesV1,
  type NextMealRankingRequest,
} from './next-meal-ranking.js';
import {
  PLANNING_REPLAY_ARTIFACT_VERSION_V1,
  PlanningReplayArtifactV1Schema,
  createPlanningReplayArtifactV1,
  replayPlanningDecisionV1,
} from './planning-replay-artifact.js';

const id = (number: number): string =>
  `00000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
const source = {
  kind: 'dataset',
  sourceId: 'replay-fixture',
  sourceVersion: '1',
} as const;
const unit = { system: 'ucum', code: 'mg' } as const;
const digest = async (value: string): Promise<string> =>
  createHash('sha256').update(value).digest('hex');

function food(number: number, amount: string): NextMealCandidateSource {
  return {
    reference: {
      kind: 'food',
      catalogReleaseId: 'fixture-release',
      foodId: id(number),
      foodRevision: 1,
    },
    displayName: `Food ${number}`,
    preparationState: 'prepared',
    edibleResolution: 'resolved',
    portions: [{ portionId: id(number + 100), edibleGrams: '100', source }],
    nutrientsPer100EdibleGrams: [
      {
        state: 'known',
        nutrientId: 'nutrient.iron',
        amountPer100EdibleGrams: amount,
        unit,
        source,
      },
    ],
    restrictionEvidence: {
      state: 'verified',
      ingredientFoodIds: [],
      allergenCodes: [],
      source,
    },
  };
}

function request(
  entries: readonly NextMealCandidateSource[],
): NextMealRankingRequest {
  return NextMealRankingRequestSchema.parse({
    candidates: {
      requestedAt: '2026-11-08T12:00:00.000Z',
      manifest: {
        entryKeys: entries
          .map((entry) => nextMealSourceKey(entry.reference))
          .sort(),
      },
      entries,
      exclusions: {
        foodIds: [],
        recipeIds: [],
        ingredientFoodIds: [],
        allergenCodes: [],
      },
      inventory: { mode: 'ALL_CATALOG' as const },
      comparisonNutrients: [{ nutrientId: 'nutrient.iron', unit }],
      hardLimits: [],
    },
    acceptedMeals: [],
    temporalRules: [
      {
        ruleId: 'iron-current-day',
        ruleVersion: 'fixture-v1',
        nutrientId: 'nutrient.iron',
        unit,
        sourceScope: 'all-intake' as const,
        timeBasis: 'elapsed-time' as const,
        windowStartInclusive: '2026-11-08T00:00:00.000Z',
        windowEndExclusive: '2026-11-09T00:00:00.000Z',
        coverage: { state: 'complete' as const, source },
        target: {
          amount: '20',
          mode: 'minimum' as const,
          referenceType: 'planning-target',
          releaseId: 'fixture-release',
          source,
        },
        forecastTargetPerDay: '20',
        weight: 1,
      },
    ],
  });
}

const context = {
  problemId: id(900),
  runId: id(901),
  subjectKey: id(902),
  capturedAt: '2026-11-08T12:00:00.000Z',
  validatedAt: '2026-11-08T12:00:01.000Z',
};

describe('planning replay artifact', () => {
  it('reconstructs an independently validated decision from exact frozen evidence', async () => {
    const entries = [food(1, '20'), food(2, '5')];
    const input = request(entries);
    const ranking = rankNextMealCandidatesV1(input);
    const artifact = await createPlanningReplayArtifactV1(
      input,
      ranking,
      context,
      digest,
    );

    expect(artifact.versions.replayArtifact).toBe(
      PLANNING_REPLAY_ARTIFACT_VERSION_V1,
    );
    expect(artifact.candidateCorpus).toMatchObject({
      entryCount: 2,
      catalogReleaseIds: ['fixture-release'],
      recipeRevisions: [],
    });
    await expect(
      replayPlanningDecisionV1(artifact, entries, digest),
    ).resolves.toMatchObject({
      status: 'MATCH',
      contentSha256: artifact.contentSha256,
      requestSha256: artifact.expected.requestSha256,
      rankingSha256: artifact.expected.rankingSha256,
      decisionChainSha256: artifact.expected.decisionChainSha256,
    });
  });

  it('detects any changed candidate fact even when its identity is unchanged', async () => {
    const entries = [food(1, '20'), food(2, '5')];
    const input = request(entries);
    const artifact = await createPlanningReplayArtifactV1(
      input,
      rankNextMealCandidatesV1(input),
      context,
      digest,
    );

    await expect(
      replayPlanningDecisionV1(artifact, [food(1, '21'), food(2, '5')], digest),
    ).resolves.toEqual({
      status: 'MISMATCH',
      reasonCodes: ['candidate-corpus-digest-mismatch'],
    });
  });

  it('detects a modified artifact before trusting its expected output', async () => {
    const entries = [food(1, '20'), food(2, '5')];
    const input = request(entries);
    const artifact = await createPlanningReplayArtifactV1(
      input,
      rankNextMealCandidatesV1(input),
      context,
      digest,
    );
    const changed = {
      ...artifact,
      context: { ...artifact.context, validatedAt: '2026-11-08T12:00:02.000Z' },
    };

    const replay = await replayPlanningDecisionV1(changed, entries, digest);
    expect(replay).toEqual({
      status: 'MISMATCH',
      reasonCodes: ['artifact-content-digest-mismatch'],
    });
  });

  it('rejects an incomplete or noncanonical candidate manifest', async () => {
    const entries = [food(1, '20'), food(2, '5')];
    const input = request(entries);
    const artifact = await createPlanningReplayArtifactV1(
      input,
      rankNextMealCandidatesV1(input),
      context,
      digest,
    );

    expect(() =>
      PlanningReplayArtifactV1Schema.parse({
        ...artifact,
        candidateCorpus: {
          ...artifact.candidateCorpus,
          entryKeys: [artifact.candidateCorpus.entryKeys[0]],
        },
      }),
    ).toThrow(/complete, unique, and sorted/);
  });
});
