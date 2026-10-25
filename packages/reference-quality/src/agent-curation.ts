import { z } from 'zod';

const IdentifierSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const DecimalSchema = z
  .string()
  .max(48)
  .regex(/^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u);
const UnitSchema = z.strictObject({
  system: z.literal('ucum'),
  code: z.enum(['kcal', 'g', 'mg', 'ug']),
});
const AgentCurationCatalogIdentityV1Schema = z.strictObject({
  releaseId: IdentifierSchema,
  artifactSha256: DigestSchema,
});
const AgentCurationAgentIdentityV1Schema = z.strictObject({
  agentId: IdentifierSchema,
  model: z.string().trim().min(1).max(200),
  instructionSha256: DigestSchema,
});

export const AgentFoodCompositionClaimV1Schema = z.strictObject({
  claimId: IdentifierSchema,
  foodId: IdentifierSchema,
  foodRevision: z.number().int().positive(),
  preparationState: IdentifierSchema,
  componentId: IdentifierSchema,
  value: z.strictObject({
    amount: DecimalSchema,
    unit: UnitSchema,
    basis: z.literal('per-100-gram-edible'),
  }),
  evidence: z.strictObject({
    sourceTitle: z.string().trim().min(1).max(300),
    publisher: z.string().trim().min(1).max(200),
    sourceUrl: z.url().refine((value) => value.startsWith('https://')),
    sourceEdition: z.string().trim().min(1).max(128),
    licenseId: z.string().trim().min(1).max(128),
    locator: z.string().trim().min(1).max(500),
    retrievedAt: z.iso.datetime({ precision: 3 }),
    sourceContentSha256: DigestSchema,
    method: z.enum([
      'direct-transcription',
      'unit-conversion',
      'calculation',
      'evidence-synthesis',
    ]),
    note: z.string().trim().min(1).max(1000).optional(),
  }),
});

export const AgentCurationBatchV1Schema = z.strictObject({
  format: z.literal('nutrixx.agent-curation-batch'),
  schemaVersion: z.literal(1),
  batchId: IdentifierSchema,
  generatedAt: z.iso.datetime({ precision: 3 }),
  catalog: AgentCurationCatalogIdentityV1Schema,
  agent: AgentCurationAgentIdentityV1Schema,
  claims: z.array(z.unknown()).min(1).max(5000),
});

export const AgentCuratedFoodCompositionRecordV1Schema = z.strictObject({
  claim: AgentFoodCompositionClaimV1Schema,
  batchId: IdentifierSchema,
  generatedAt: z.iso.datetime({ precision: 3 }),
  submittedAgainst: AgentCurationCatalogIdentityV1Schema,
  agent: AgentCurationAgentIdentityV1Schema,
});

export type AgentFoodCompositionClaimV1 = z.infer<
  typeof AgentFoodCompositionClaimV1Schema
>;
export type AgentCurationBatchV1 = z.infer<typeof AgentCurationBatchV1Schema>;
export type AgentCuratedFoodCompositionRecordV1 = z.infer<
  typeof AgentCuratedFoodCompositionRecordV1Schema
>;

export interface AgentCurationContextV1 {
  readonly catalog: {
    readonly releaseId: string;
    readonly artifactSha256: string;
  };
  readonly foods: readonly {
    readonly foodId: string;
    readonly revision: number;
    readonly preparationStates: readonly string[];
  }[];
  readonly components: readonly {
    readonly componentId: string;
    readonly unit: string;
  }[];
}

export interface ValidatedAgentCurationBatchV1 {
  readonly metadata: Omit<AgentCurationBatchV1, 'claims'>;
  readonly accepted: readonly AgentFoodCompositionClaimV1[];
  readonly quarantined: readonly {
    readonly index: number;
    readonly reason: string;
  }[];
}

export function agentFoodCompositionClaimKeyV1(
  claim: Pick<
    AgentFoodCompositionClaimV1,
    'foodId' | 'foodRevision' | 'preparationState' | 'componentId'
  >,
): string {
  return [
    claim.foodId,
    String(claim.foodRevision),
    claim.preparationState,
    claim.componentId,
  ]
    .map(encodeURIComponent)
    .join('/');
}

/**
 * Validate each claim independently. A malformed claim cannot block unrelated
 * values in the same agent batch.
 */
export function validateAgentCurationBatchV1(
  input: unknown,
  context: AgentCurationContextV1,
): ValidatedAgentCurationBatchV1 {
  const batch = AgentCurationBatchV1Schema.parse(input);
  if (
    batch.catalog.releaseId !== context.catalog.releaseId ||
    batch.catalog.artifactSha256 !== context.catalog.artifactSha256
  ) {
    throw new TypeError('The batch targets a different catalog release.');
  }

  const foods = new Map(
    context.foods.map((food) => [
      `${food.foodId}:${food.revision}`,
      new Set(food.preparationStates),
    ]),
  );
  const components = new Map(
    context.components.map((component) => [
      component.componentId,
      component.unit,
    ]),
  );
  const candidates: Array<{
    readonly index: number;
    readonly claim: AgentFoodCompositionClaimV1;
    readonly key: string;
  }> = [];
  const quarantined: Array<{ index: number; reason: string }> = [];

  for (const [index, rawClaim] of batch.claims.entries()) {
    const parsed = AgentFoodCompositionClaimV1Schema.safeParse(rawClaim);
    if (!parsed.success) {
      quarantined.push({
        index,
        reason: parsed.error.issues.map((issue) => issue.message).join('; '),
      });
      continue;
    }
    const claim = parsed.data;
    const preparationStates = foods.get(
      `${claim.foodId}:${claim.foodRevision}`,
    );
    const expectedUnit = components.get(claim.componentId);
    let reason: string | undefined;
    if (!preparationStates)
      reason = 'The food revision is outside the pinned catalog.';
    else if (!preparationStates.has(claim.preparationState))
      reason = 'The preparation state does not belong to the food revision.';
    else if (!expectedUnit)
      reason = 'The component is outside the active registry.';
    else if (claim.value.unit.code !== expectedUnit)
      reason = 'The value unit differs from the active component registry.';

    if (reason) quarantined.push({ index, reason });
    else
      candidates.push({
        index,
        claim,
        key: agentFoodCompositionClaimKeyV1(claim),
      });
  }

  const keyCounts = new Map<string, number>();
  const claimIds = new Map<string, number>();
  for (const candidate of candidates) {
    keyCounts.set(candidate.key, (keyCounts.get(candidate.key) ?? 0) + 1);
    claimIds.set(
      candidate.claim.claimId,
      (claimIds.get(candidate.claim.claimId) ?? 0) + 1,
    );
  }
  const accepted: AgentFoodCompositionClaimV1[] = [];
  for (const candidate of candidates) {
    const repeatedTarget = (keyCounts.get(candidate.key) ?? 0) > 1;
    const repeatedId = (claimIds.get(candidate.claim.claimId) ?? 0) > 1;
    if (repeatedTarget || repeatedId) {
      quarantined.push({
        index: candidate.index,
        reason: repeatedTarget
          ? 'Multiple claims target the same food component in this batch.'
          : 'The claim identifier is repeated in this batch.',
      });
    } else accepted.push(candidate.claim);
  }

  const { claims: _claims, ...metadata } = batch;
  return {
    metadata,
    accepted,
    quarantined: quarantined.sort((left, right) => left.index - right.index),
  };
}
