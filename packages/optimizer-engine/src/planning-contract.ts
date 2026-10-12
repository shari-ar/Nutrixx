import * as z from 'zod';

import {
  CanonicalCodeSchema,
  CanonicalIdSchema,
  EvidenceSourceV1Schema,
  IanaTimeZoneSchema,
  NonnegativeCanonicalDecimalSchema,
  UnitV1Schema,
  UtcInstantSchema,
  canonicalizeJson,
  createCanonicalRecordDraftV1Schema,
  createCanonicalRecordV1Schema,
  sealCanonicalRecordV1,
  verifyCanonicalRecordV1,
  type JsonValue,
  type Sha256HexDigest,
} from '@nutrixx/canonical-schema';

export const FREE_SEARCH_PROFILE_V1 = {
  policyVersion: 'free-beam-search-v1',
  candidateLimitPerSlot: 24,
  portionLimitPerCandidate: 4,
  beamWidth: 128,
  expansionLimit: 30_000,
  workerWatchdogMilliseconds: 5_000,
} as const;

const PositiveAmountSchema = NonnegativeCanonicalDecimalSchema.refine(
  (value) => value !== '0',
  'The amount must be positive.',
);
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const ReasonCodesSchema = z.array(CanonicalCodeSchema).min(1).max(32);
const UniqueCodesSchema = z
  .array(CanonicalCodeSchema)
  .max(128)
  .refine(
    (values) => new Set(values).size === values.length,
    'Codes must be unique.',
  );

const NutrientObservationV1Schema = z.discriminatedUnion('state', [
  z.strictObject({
    state: z.literal('known'),
    nutrientId: CanonicalCodeSchema,
    amount: NonnegativeCanonicalDecimalSchema,
    unit: UnitV1Schema,
    source: EvidenceSourceV1Schema,
  }),
  z.strictObject({
    state: z.literal('unknown'),
    nutrientId: CanonicalCodeSchema,
    reason: z.enum([
      'not-measured',
      'not-provided',
      'not-resolvable',
      'unsupported',
    ]),
  }),
]);

const NutrientsSchema = z
  .array(NutrientObservationV1Schema)
  .max(112)
  .refine(
    (values) =>
      new Set(values.map((value) => value.nutrientId)).size === values.length,
    'Nutrient IDs must be unique within one observation set.',
  );

const SourceReferenceV1Schema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('food'),
    foodId: CanonicalIdSchema,
    foodRevision: z.int().positive(),
    catalogReleaseId: z.string().min(1).max(200),
  }),
  z.strictObject({
    kind: z.literal('recipe'),
    recipeId: CanonicalIdSchema,
    recipeVersion: z.int().positive(),
  }),
]);

const RestrictionEvidenceV1Schema = z.discriminatedUnion('state', [
  z.strictObject({
    state: z.literal('verified'),
    ingredientIds: z.array(CanonicalIdSchema).max(256),
    allergenCodes: UniqueCodesSchema,
    source: EvidenceSourceV1Schema,
  }),
  z.strictObject({
    state: z.literal('unknown'),
    reasonCode: CanonicalCodeSchema,
  }),
]);

const PortionOptionV1Schema = z.strictObject({
  portionId: CanonicalCodeSchema,
  edibleGrams: PositiveAmountSchema,
});

const CandidateV1Schema = z
  .strictObject({
    candidateId: CanonicalIdSchema,
    semanticKey: CanonicalCodeSchema,
    displayNameSnapshot: z.string().trim().min(1).max(500),
    sourceReference: SourceReferenceV1Schema,
    baseServingGrams: PositiveAmountSchema,
    portions: z.array(PortionOptionV1Schema).min(1).max(4),
    nutrientsPer100EdibleGrams: NutrientsSchema,
    restrictionEvidence: RestrictionEvidenceV1Schema,
    preparationMinutes: z.int().nonnegative().optional(),
    approximatePriceUsd: NonnegativeCanonicalDecimalSchema.optional(),
    pinnedByUser: z.boolean(),
  })
  .superRefine((candidate, context) => {
    if (
      new Set(candidate.portions.map((portion) => portion.portionId)).size !==
      candidate.portions.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['portions'],
        message: 'Portion IDs must be unique.',
      });
    }
    if (
      new Set(candidate.portions.map((portion) => portion.edibleGrams)).size !==
      candidate.portions.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['portions'],
        message: 'Portion weights must be unique.',
      });
    }
  });

const PlanningSlotV1Schema = z.discriminatedUnion('state', [
  z.strictObject({
    state: z.literal('recorded'),
    slotId: CanonicalIdSchema,
    position: z.int().min(1).max(4),
    label: z.string().trim().min(1).max(80),
    mealId: CanonicalIdSchema,
    mealRevision: z.int().positive(),
  }),
  z.strictObject({
    state: z.literal('open'),
    slotId: CanonicalIdSchema,
    position: z.int().min(1).max(4),
    label: z.string().trim().min(1).max(80),
    candidates: z.array(CandidateV1Schema).max(24),
  }),
]);

const PlanningDayV1Schema = z.strictObject({
  periodId: z.string().min(1).max(256),
  zonePolicyVersion: z.string().min(1).max(128),
  zoneSequence: z.int().nonnegative(),
  timeZone: IanaTimeZoneSchema,
  localDate: z.iso.date(),
  startsAt: UtcInstantSchema,
  endsAt: UtcInstantSchema,
  travelAdjusted: z.boolean(),
});

const ApplicableTargetV1Schema = z.strictObject({
  ruleId: z.string().min(1).max(128),
  nutrientId: CanonicalCodeSchema,
  type: z.enum(['RDA', 'AI', 'EAR', 'UL', 'AMDR']),
  value: z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('point'),
      amount: NonnegativeCanonicalDecimalSchema,
    }),
    z.strictObject({
      kind: z.literal('range'),
      lower: NonnegativeCanonicalDecimalSchema,
      upper: NonnegativeCanonicalDecimalSchema,
    }),
  ]),
  unit: UnitV1Schema,
  horizon: z.enum(['daily-average', 'daily-limit', 'energy-share']),
  sourceScope: z.enum([
    'all-intake',
    'fortified-and-supplemental',
    'preformed-vitamin-a',
  ]),
  sourceReleaseId: z.string().min(1).max(128),
  hardLimitApproved: z.boolean(),
});

export const PlanningInputV1Schema = z
  .strictObject({
    format: z.literal('nutrixx.local-planning-input'),
    schemaVersion: z.literal(1),
    requestId: CanonicalIdSchema,
    ownerSubjectId: CanonicalIdSchema,
    capturedAt: UtcInstantSchema,
    day: PlanningDayV1Schema,
    eligibility: z.strictObject({
      status: z.enum(['READY', 'NEEDS_INPUT', 'OUT_OF_SCOPE']),
      healthRuleVersion: z.string().min(1).max(128),
      profileId: CanonicalIdSchema,
      profileRevision: z.int().positive(),
      assessedAt: UtcInstantSchema,
      reasonCodes: UniqueCodesSchema,
    }),
    restrictions: z.strictObject({
      sourceRecordId: CanonicalIdSchema,
      sourceRevision: z.int().positive(),
      excludedIngredientIds: z.array(CanonicalIdSchema).max(256),
      excludedAllergenCodes: UniqueCodesSchema,
    }),
    recordedIntake: z.strictObject({
      nutritionSnapshotId: CanonicalIdSchema,
      nutritionRuleVersion: z.string().min(1).max(128),
      nutrients: NutrientsSchema,
    }),
    targetPolicyVersion: z.string().min(1).max(128),
    targets: z.array(ApplicableTargetV1Schema).max(112),
    referenceReleases: z
      .array(
        z.strictObject({
          component: CanonicalCodeSchema,
          releaseId: z.string().min(1).max(200),
        }),
      )
      .min(1)
      .max(32),
    slots: z.array(PlanningSlotV1Schema).min(1).max(4),
    searchProfile: z.strictObject({
      policyVersion: z.literal(FREE_SEARCH_PROFILE_V1.policyVersion),
      candidateLimitPerSlot: z.literal(
        FREE_SEARCH_PROFILE_V1.candidateLimitPerSlot,
      ),
      portionLimitPerCandidate: z.literal(
        FREE_SEARCH_PROFILE_V1.portionLimitPerCandidate,
      ),
      beamWidth: z.literal(FREE_SEARCH_PROFILE_V1.beamWidth),
      expansionLimit: z.literal(FREE_SEARCH_PROFILE_V1.expansionLimit),
      workerWatchdogMilliseconds: z.literal(
        FREE_SEARCH_PROFILE_V1.workerWatchdogMilliseconds,
      ),
    }),
  })
  .superRefine((input, context) => {
    if (Date.parse(input.day.endsAt) <= Date.parse(input.day.startsAt)) {
      context.addIssue({
        code: 'custom',
        path: ['day', 'endsAt'],
        message: 'The planning day must have positive duration.',
      });
    }
    const slotIds = new Set<string>();
    const candidateIds = new Set<string>();
    for (const [index, slot] of input.slots.entries()) {
      if (slot.position !== index + 1 || slotIds.has(slot.slotId)) {
        context.addIssue({
          code: 'custom',
          path: ['slots', index],
          message: 'Slots require unique IDs and consecutive positions.',
        });
      }
      slotIds.add(slot.slotId);
      if (slot.state === 'open') {
        let previousKey = '';
        for (const [candidateIndex, candidate] of slot.candidates.entries()) {
          if (
            candidateIds.has(candidate.candidateId) ||
            candidate.semanticKey <= previousKey
          ) {
            context.addIssue({
              code: 'custom',
              path: ['slots', index, 'candidates', candidateIndex],
              message:
                'Candidates require unique IDs and stable semantic-key ordering.',
            });
          }
          candidateIds.add(candidate.candidateId);
          previousKey = candidate.semanticKey;
        }
      }
    }
    if (
      new Set(input.targets.map((target) => target.ruleId)).size !==
      input.targets.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['targets'],
        message: 'Target rule IDs must be unique.',
      });
    }
    if (
      new Set(input.referenceReleases.map((release) => release.component))
        .size !== input.referenceReleases.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['referenceReleases'],
        message: 'Reference components must be unique.',
      });
    }
  });

const DraftSelectionV1Schema = z.strictObject({
  slotId: CanonicalIdSchema,
  candidateId: CanonicalIdSchema,
  portionId: CanonicalCodeSchema,
});

const SearchTraceV1Schema = z.strictObject({
  termination: z.enum([
    'feasible',
    'direct-contradiction',
    'finite-exhaustion',
    'expansion-limit',
    'watchdog',
    'eligibility',
    'error',
  ]),
  expandedStates: z.int().min(0).max(FREE_SEARCH_PROFILE_V1.expansionLimit),
  elapsedMilliseconds: z.int().nonnegative(),
});

export const PlanningOutcomeV1Schema = z.discriminatedUnion('status', [
  z.strictObject({
    format: z.literal('nutrixx.local-planning-outcome'),
    schemaVersion: z.literal(1),
    status: z.literal('READY'),
    solverOutcome: z.literal('FEASIBLE'),
    optimalityGap: z.null(),
    draft: z.strictObject({
      selections: z.array(DraftSelectionV1Schema).min(1).max(4),
    }),
    validation: z.strictObject({
      status: z.literal('passed'),
      validatorVersion: z.string().min(1).max(128),
      validatedAt: UtcInstantSchema,
      reportCodes: z.array(CanonicalCodeSchema).max(128),
    }),
    limitationCodes: z.array(CanonicalCodeSchema).max(128),
  }),
  z.strictObject({
    format: z.literal('nutrixx.local-planning-outcome'),
    schemaVersion: z.literal(1),
    status: z.literal('NEEDS_INPUT'),
    reasonCodes: ReasonCodesSchema,
  }),
  z.strictObject({
    format: z.literal('nutrixx.local-planning-outcome'),
    schemaVersion: z.literal(1),
    status: z.literal('OUT_OF_SCOPE'),
    reasonCodes: ReasonCodesSchema,
  }),
  z.strictObject({
    format: z.literal('nutrixx.local-planning-outcome'),
    schemaVersion: z.literal(1),
    status: z.literal('INFEASIBLE'),
    proof: z.enum(['direct-contradiction', 'finite-exhaustion']),
    reasonCodes: ReasonCodesSchema,
  }),
  z.strictObject({
    format: z.literal('nutrixx.local-planning-outcome'),
    schemaVersion: z.literal(1),
    status: z.literal('SEARCH_LIMIT'),
    limit: z.enum(['expansion-limit', 'watchdog']),
    reasonCodes: ReasonCodesSchema,
  }),
  z.strictObject({
    format: z.literal('nutrixx.local-planning-outcome'),
    schemaVersion: z.literal(1),
    status: z.literal('ERROR'),
    reasonCodes: ReasonCodesSchema,
  }),
]);

export const PlanningRunV1Schema = z
  .strictObject({
    format: z.literal('nutrixx.local-planning-run'),
    schemaVersion: z.literal(1),
    runId: CanonicalIdSchema,
    ownerSubjectId: CanonicalIdSchema,
    startedAt: UtcInstantSchema,
    completedAt: UtcInstantSchema,
    engineVersion: z.string().min(1).max(128),
    constraintPolicyVersion: z.string().min(1).max(128),
    scoringPolicyVersion: z.string().min(1).max(128),
    seed: z.int().nonnegative(),
    input: PlanningInputV1Schema,
    inputHash: HashSchema,
    trace: SearchTraceV1Schema,
    outcome: PlanningOutcomeV1Schema,
    outputHash: HashSchema,
  })
  .superRefine((run, context) => {
    if (run.ownerSubjectId !== run.input.ownerSubjectId) {
      context.addIssue({
        code: 'custom',
        path: ['ownerSubjectId'],
        message: 'Run and input owners must match.',
      });
    }
    if (Date.parse(run.completedAt) < Date.parse(run.startedAt)) {
      context.addIssue({
        code: 'custom',
        path: ['completedAt'],
        message: 'Completion must follow start.',
      });
    }
    const openSlots = run.input.slots.filter((slot) => slot.state === 'open');
    if (run.outcome.status === 'READY') {
      if (
        run.trace.termination !== 'feasible' ||
        run.outcome.draft.selections.length !== openSlots.length
      ) {
        context.addIssue({
          code: 'custom',
          path: ['outcome'],
          message: 'A feasible draft must cover every open slot.',
        });
      }
      const usedSlots = new Set<string>();
      for (const [index, selection] of run.outcome.draft.selections.entries()) {
        const slot = openSlots.find((item) => item.slotId === selection.slotId);
        const candidate =
          slot?.state === 'open'
            ? slot.candidates.find(
                (item) => item.candidateId === selection.candidateId,
              )
            : undefined;
        if (
          usedSlots.has(selection.slotId) ||
          !candidate?.portions.some(
            (item) => item.portionId === selection.portionId,
          )
        ) {
          context.addIssue({
            code: 'custom',
            path: ['outcome', 'draft', 'selections', index],
            message:
              'A selection must resolve to one open-slot candidate and portion.',
          });
        }
        usedSlots.add(selection.slotId);
      }
    } else if (
      run.outcome.status === 'INFEASIBLE' &&
      run.trace.termination !== run.outcome.proof
    ) {
      context.addIssue({
        code: 'custom',
        path: ['trace'],
        message: 'The infeasibility proof must match termination.',
      });
    } else if (
      run.outcome.status === 'SEARCH_LIMIT' &&
      run.trace.termination !== run.outcome.limit
    ) {
      context.addIssue({
        code: 'custom',
        path: ['trace'],
        message: 'The search limit must match termination.',
      });
    } else if (
      (run.outcome.status === 'NEEDS_INPUT' ||
        run.outcome.status === 'OUT_OF_SCOPE') &&
      run.trace.termination !== 'eligibility'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['trace'],
        message: 'Eligibility outcomes require eligibility termination.',
      });
    } else if (
      run.outcome.status === 'ERROR' &&
      run.trace.termination !== 'error'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['trace'],
        message: 'Error outcomes require error termination.',
      });
    }
    if (
      run.input.eligibility.status !== 'READY' &&
      run.outcome.status !== run.input.eligibility.status
    ) {
      context.addIssue({
        code: 'custom',
        path: ['outcome'],
        message: 'An ineligible input retains its eligibility outcome.',
      });
    }
  });

const RunRecordDraftBase = createCanonicalRecordDraftV1Schema(
  'planning-run',
  1,
  PlanningRunV1Schema,
);
const RunRecordBase = createCanonicalRecordV1Schema(
  'planning-run',
  1,
  PlanningRunV1Schema,
);

function matchingEnvelope(
  record: {
    recordId: string;
    subjectId: string;
    owningContext: string;
    logicalVersion: number;
    payload: { runId: string; ownerSubjectId: string };
  },
  context: z.RefinementCtx,
): void {
  if (
    record.owningContext !== 'planning' ||
    record.logicalVersion !== 1 ||
    record.recordId !== record.payload.runId ||
    record.subjectId !== record.payload.ownerSubjectId
  ) {
    context.addIssue({
      code: 'custom',
      path: ['payload'],
      message: 'The planning envelope must identify the same run and owner.',
    });
  }
}

export const PlanningRunRecordDraftV1Schema =
  RunRecordDraftBase.superRefine(matchingEnvelope);
export const PlanningRunRecordV1Schema =
  RunRecordBase.superRefine(matchingEnvelope);

export type PlanningInputV1 = z.infer<typeof PlanningInputV1Schema>;
export type PlanningOutcomeV1 = z.infer<typeof PlanningOutcomeV1Schema>;
export type PlanningRunV1 = z.infer<typeof PlanningRunV1Schema>;

export async function fingerprintPlanningInputV1(
  input: unknown,
  digest: Sha256HexDigest,
): Promise<string> {
  return HashSchema.parse(
    await digest(
      canonicalizeJson(PlanningInputV1Schema.parse(input) as JsonValue),
    ),
  );
}

export async function fingerprintPlanningOutcomeV1(
  outcome: unknown,
  digest: Sha256HexDigest,
): Promise<string> {
  return HashSchema.parse(
    await digest(
      canonicalizeJson(PlanningOutcomeV1Schema.parse(outcome) as JsonValue),
    ),
  );
}

async function hashesMatch(
  run: PlanningRunV1,
  digest: Sha256HexDigest,
): Promise<boolean> {
  return (
    run.inputHash === (await fingerprintPlanningInputV1(run.input, digest)) &&
    run.outputHash === (await fingerprintPlanningOutcomeV1(run.outcome, digest))
  );
}

export async function sealPlanningRunRecordV1(
  input: unknown,
  digest: Sha256HexDigest,
) {
  const draft = PlanningRunRecordDraftV1Schema.parse(input);
  if (!(await hashesMatch(draft.payload, digest))) {
    throw new TypeError('Planning input or output fingerprint mismatch.');
  }
  return PlanningRunRecordV1Schema.parse(
    await sealCanonicalRecordV1(draft, digest),
  );
}

export async function verifyPlanningRunRecordV1(
  input: unknown,
  digest: Sha256HexDigest,
): Promise<boolean> {
  const parsed = PlanningRunRecordV1Schema.safeParse(input);
  return (
    parsed.success &&
    (await hashesMatch(parsed.data.payload, digest)) &&
    (await verifyCanonicalRecordV1(parsed.data, digest))
  );
}
