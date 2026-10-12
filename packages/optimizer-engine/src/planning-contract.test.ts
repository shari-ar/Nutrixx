import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  FREE_SEARCH_PROFILE_V1,
  PlanningInputV1Schema,
  PlanningRunV1Schema,
  fingerprintPlanningInputV1,
  fingerprintPlanningOutcomeV1,
  sealPlanningRunRecordV1,
  verifyPlanningRunRecordV1,
} from './planning-contract.js';

const digest = (input: string): string =>
  createHash('sha256').update(input).digest('hex');

const owner = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const runId = '33333333-3333-4333-8333-333333333333';
const slotId = '44444444-4444-4444-8444-444444444444';
const candidateId = '55555555-5555-4555-8555-555555555555';
const source = {
  kind: 'dataset',
  sourceId: 'catalog-fixture',
  sourceVersion: '1',
} as const;

function inputFixture() {
  return {
    format: 'nutrixx.local-planning-input',
    schemaVersion: 1,
    requestId,
    ownerSubjectId: owner,
    capturedAt: '2026-10-12T09:00:00.000Z',
    day: {
      periodId: 'period-fixture',
      zonePolicyVersion: 'zone-v1',
      zoneSequence: 0,
      timeZone: 'UTC',
      localDate: '2026-10-12',
      startsAt: '2026-10-12T00:00:00.000Z',
      endsAt: '2026-10-13T00:00:00.000Z',
      travelAdjusted: false,
    },
    eligibility: {
      status: 'READY',
      healthRuleVersion: 'health-context-v1',
      profileId: '66666666-6666-4666-8666-666666666666',
      profileRevision: 1,
      assessedAt: '2026-10-12T08:00:00.000Z',
      reasonCodes: [],
    },
    restrictions: {
      sourceRecordId: '77777777-7777-4777-8777-777777777777',
      sourceRevision: 1,
      excludedIngredientIds: [],
      excludedAllergenCodes: [],
    },
    recordedIntake: {
      nutritionSnapshotId: '88888888-8888-4888-8888-888888888888',
      nutritionRuleVersion: 'nutrition-state-v2',
      nutrients: [
        {
          state: 'known',
          nutrientId: 'energy',
          amount: '0',
          unit: { system: 'ucum', code: 'kcal' },
          source,
        },
      ],
    },
    targetPolicyVersion: 'target-v1',
    targets: [
      {
        ruleId: 'energy-reference',
        nutrientId: 'energy',
        type: 'RDA',
        value: { kind: 'point', amount: '2000' },
        unit: { system: 'ucum', code: 'kcal' },
        horizon: 'daily-average',
        sourceScope: 'all-intake',
        sourceReleaseId: 'fixture-release',
        hardLimitApproved: false,
      },
    ],
    referenceReleases: [
      { component: 'food-catalog', releaseId: 'fixture-release' },
    ],
    slots: [
      {
        state: 'open',
        slotId,
        position: 1,
        label: 'Dinner',
        candidates: [
          {
            candidateId,
            semanticKey: 'fixture.rice',
            displayNameSnapshot: 'Cooked rice',
            sourceReference: {
              kind: 'food',
              foodId: '99999999-9999-4999-8999-999999999999',
              foodRevision: 1,
              catalogReleaseId: 'fixture-release',
            },
            baseServingGrams: '100',
            portions: [{ portionId: 'base', edibleGrams: '100' }],
            nutrientsPer100EdibleGrams: [
              {
                state: 'known',
                nutrientId: 'energy',
                amount: '130',
                unit: { system: 'ucum', code: 'kcal' },
                source,
              },
              {
                state: 'unknown',
                nutrientId: 'vitamin.c',
                reason: 'not-measured',
              },
            ],
            restrictionEvidence: {
              state: 'verified',
              ingredientIds: [],
              allergenCodes: [],
              source,
            },
            pinnedByUser: false,
          },
        ],
      },
    ],
    searchProfile: FREE_SEARCH_PROFILE_V1,
  };
}

const readyOutcome = {
  format: 'nutrixx.local-planning-outcome',
  schemaVersion: 1,
  status: 'READY',
  solverOutcome: 'FEASIBLE',
  optimalityGap: null,
  draft: { selections: [{ slotId, candidateId, portionId: 'base' }] },
  validation: {
    status: 'passed',
    validatorVersion: 'independent-validator-v1',
    validatedAt: '2026-10-12T09:00:02.000Z',
    reportCodes: [],
  },
  limitationCodes: ['vitamin-c-unknown'],
} as const;

async function runFixture() {
  const input = PlanningInputV1Schema.parse(inputFixture());
  return {
    format: 'nutrixx.local-planning-run',
    schemaVersion: 1,
    runId,
    ownerSubjectId: owner,
    startedAt: '2026-10-12T09:00:00.000Z',
    completedAt: '2026-10-12T09:00:02.000Z',
    engineVersion: 'local-beam-v1',
    constraintPolicyVersion: 'constraints-v1',
    scoringPolicyVersion: 'scoring-v1',
    seed: 0,
    input,
    inputHash: await fingerprintPlanningInputV1(input, digest),
    trace: {
      termination: 'feasible',
      expandedStates: 1,
      elapsedMilliseconds: 2_000,
    },
    outcome: readyOutcome,
    outputHash: await fingerprintPlanningOutcomeV1(readyOutcome, digest),
  };
}

describe('Free planning contract v1', () => {
  it('round-trips an immutable, fingerprinted planning run', async () => {
    const run = await runFixture();
    const record = await sealPlanningRunRecordV1(
      {
        format: 'nutrixx.canonical-record',
        schemaVersion: 1,
        recordType: 'planning-run',
        recordVersion: 1,
        recordId: runId,
        subjectId: owner,
        owningContext: 'planning',
        logicalVersion: 1,
        createdAt: run.startedAt,
        updatedAt: run.completedAt,
        provenance: {
          method: 'calculated',
          source: {
            kind: 'calculation',
            sourceId: 'local-planner',
            sourceVersion: '1',
          },
          recordedAt: run.completedAt,
        },
        payload: run,
      },
      digest,
    );
    expect(await verifyPlanningRunRecordV1(record, digest)).toBe(true);
    expect(
      await verifyPlanningRunRecordV1(
        { ...record, payload: { ...record.payload, seed: 1 } },
        digest,
      ),
    ).toBe(false);
  });

  it('keeps an unknown nutrient distinct from a measured zero', () => {
    const input = PlanningInputV1Schema.parse(inputFixture());
    const candidate = input.slots[0];
    expect(candidate?.state).toBe('open');
    if (candidate?.state === 'open') {
      expect(
        candidate.candidates[0]?.nutrientsPer100EdibleGrams[1],
      ).toMatchObject({ state: 'unknown' });
    }
  });

  it('rejects duplicate or unsorted candidates and invalid portion weights', () => {
    const input = inputFixture();
    const slot = input.slots[0];
    if (slot?.state !== 'open') throw new Error('Fixture slot is open.');
    slot.candidates.push({
      ...slot.candidates[0]!,
      candidateId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    expect(PlanningInputV1Schema.safeParse(input).success).toBe(false);
    slot.candidates.pop();
    slot.candidates[0]!.portions[0]!.edibleGrams = '0';
    expect(PlanningInputV1Schema.safeParse(input).success).toBe(false);
  });

  it('requires a real candidate and portion for each open slot', async () => {
    const run = await runFixture();
    expect(PlanningRunV1Schema.safeParse(run).success).toBe(true);
    const invalid = {
      ...run,
      outcome: {
        ...readyOutcome,
        draft: { selections: [{ slotId, candidateId, portionId: 'missing' }] },
      },
    };
    expect(PlanningRunV1Schema.safeParse(invalid).success).toBe(false);
  });

  it('distinguishes search limits from proven infeasibility', async () => {
    const run = await runFixture();
    const limited = {
      ...run,
      trace: { ...run.trace, termination: 'watchdog' },
      outcome: {
        format: 'nutrixx.local-planning-outcome',
        schemaVersion: 1,
        status: 'SEARCH_LIMIT',
        limit: 'watchdog',
        reasonCodes: ['worker-time-limit'],
      },
    };
    expect(PlanningRunV1Schema.safeParse(limited).success).toBe(true);
    const unproven = {
      ...limited,
      outcome: {
        format: 'nutrixx.local-planning-outcome',
        schemaVersion: 1,
        status: 'INFEASIBLE',
        proof: 'finite-exhaustion',
        reasonCodes: ['no-plan'],
      },
    };
    expect(PlanningRunV1Schema.safeParse(unproven).success).toBe(false);
  });

  it('changes the fingerprint when a frozen candidate fact changes', async () => {
    const input = inputFixture();
    const original = await fingerprintPlanningInputV1(input, digest);
    const slot = input.slots[0];
    if (slot?.state !== 'open') throw new Error('Fixture slot is open.');
    slot.candidates[0]!.nutrientsPer100EdibleGrams[0]!.amount = '140';
    expect(await fingerprintPlanningInputV1(input, digest)).not.toBe(original);
  });
});
