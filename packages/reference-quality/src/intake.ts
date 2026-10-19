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
const RatioSchema = DecimalSchema.refine(
  (value) => Number(value) <= 1,
  'A retention factor must be between zero and one.',
);
const PositiveRatioSchema = DecimalSchema.refine(
  (value) => Number(value) > 0,
  'A yield factor must be greater than zero.',
);
const UnitSchema = z.strictObject({
  system: z.enum(['ucum', 'nutrixx']),
  code: z.string().min(1).max(64),
});
const EvidenceSchema = {
  locator: z.string().trim().min(1).max(300),
  note: z.string().trim().min(1).max(1000).optional(),
};

export const ReferenceProposalV1Schema = z.strictObject({
  format: z.literal('nutrixx.reference-proposal'),
  schemaVersion: z.literal(1),
  catalog: z.strictObject({
    releaseId: IdentifierSchema,
    artifactSha256: DigestSchema,
  }),
  source: z.strictObject({
    sourceId: IdentifierSchema,
    title: z.string().trim().min(1).max(300),
    publisher: z.string().trim().min(1).max(200),
    sourceUrl: z.url().refine((value) => value.startsWith('https://')),
    licenseId: z.string().trim().min(1).max(128),
    edition: z.string().trim().min(1).max(128),
    retrievedAt: z.iso.datetime({ precision: 3 }),
    expectedSha256: DigestSchema,
  }),
  extraction: z.strictObject({
    operatorId: IdentifierSchema,
    extractedAt: z.iso.datetime({ precision: 3 }),
    method: z.enum([
      'manual-transcription',
      'structured-extraction',
      'ai-assisted-extraction',
    ]),
  }),
  claims: z.array(z.unknown()).min(1).max(1000),
});

const PopulationSchema = z
  .strictObject({
    minimumAgeYears: z.number().int().min(0).max(120),
    maximumAgeYears: z.number().int().min(0).max(120),
    physiologicalReference: z.enum(['any', 'female', 'male']),
    lifeStage: z.enum(['any', 'adult', 'pregnancy', 'lactation']),
  })
  .refine((value) => value.minimumAgeYears <= value.maximumAgeYears);

export const ReferenceClaimV1Schema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('food-composition'),
    foodId: IdentifierSchema,
    componentId: IdentifierSchema,
    value: z.discriminatedUnion('state', [
      z.strictObject({
        state: z.literal('known'),
        amount: DecimalSchema,
        unit: UnitSchema,
        basis: z.literal('per-100-gram-edible'),
      }),
      z.strictObject({
        state: z.literal('unknown'),
        reason: z.enum([
          'not-measured',
          'not-provided',
          'not-applicable',
          'not-resolvable',
          'withheld',
          'unsupported',
        ]),
      }),
    ]),
    ...EvidenceSchema,
  }),
  z.strictObject({
    kind: z.literal('cooking-retention'),
    foodId: IdentifierSchema,
    methodId: IdentifierSchema,
    componentId: IdentifierSchema,
    retainedFraction: RatioSchema,
    ...EvidenceSchema,
  }),
  z.strictObject({
    kind: z.literal('cooking-yield'),
    foodId: IdentifierSchema,
    methodId: IdentifierSchema,
    cookedToRawMassRatio: PositiveRatioSchema,
    ...EvidenceSchema,
  }),
  z.strictObject({
    kind: z.literal('intake-reference'),
    componentId: IdentifierSchema,
    referenceType: z.enum(['RDA', 'AI', 'EAR', 'UL', 'AMDR']),
    sourceScope: z.enum([
      'all-intake',
      'fortified-and-supplemental',
      'preformed-vitamin-a',
    ]),
    market: z.string().regex(/^[A-Z]{2}$/u),
    population: PopulationSchema,
    value: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('point'), amount: DecimalSchema }),
      z
        .strictObject({
          kind: z.literal('range'),
          lower: DecimalSchema,
          upper: DecimalSchema,
        })
        .refine((value) => Number(value.lower) <= Number(value.upper)),
    ]),
    unit: UnitSchema,
    horizon: z.enum(['daily-average', 'daily-limit', 'energy-share']),
    ...EvidenceSchema,
  }),
]);

export type ReferenceProposalV1 = z.infer<typeof ReferenceProposalV1Schema>;
export type ReferenceClaimV1 = z.infer<typeof ReferenceClaimV1Schema>;

export interface ReferenceIntakeContextV1 {
  readonly sourceSha256: string;
  readonly catalog: {
    readonly releaseId: string;
    readonly artifactSha256: string;
  };
  readonly foodIds: ReadonlySet<string>;
  readonly components: readonly {
    readonly componentId: string;
    readonly unit: string;
  }[];
}

export interface StagedReferenceClaimV1 {
  readonly claimKey: string;
  readonly claim: ReferenceClaimV1;
  readonly sourceId: string;
  readonly sourceSha256: string;
  readonly reviewStatus: 'pending-review';
}

export interface QuarantinedReferenceClaimV1 {
  readonly index: number;
  readonly reason: string;
}

export interface ReferenceIntakeResultV1 {
  readonly format: 'nutrixx.reference-intake-result';
  readonly schemaVersion: 1;
  readonly proposal: Omit<ReferenceProposalV1, 'claims'>;
  readonly proposed: readonly StagedReferenceClaimV1[];
  readonly quarantined: readonly QuarantinedReferenceClaimV1[];
}

function claimKey(claim: ReferenceClaimV1): string {
  const parts: string[] = [claim.kind];
  if (claim.kind === 'food-composition')
    parts.push(claim.foodId, claim.componentId);
  else if (claim.kind === 'cooking-retention')
    parts.push(claim.foodId, claim.methodId, claim.componentId);
  else if (claim.kind === 'cooking-yield')
    parts.push(claim.foodId, claim.methodId);
  else
    parts.push(
      claim.componentId,
      claim.referenceType,
      claim.sourceScope,
      claim.market,
      String(claim.population.minimumAgeYears),
      String(claim.population.maximumAgeYears),
      claim.population.physiologicalReference,
      claim.population.lifeStage,
    );
  return parts.map(encodeURIComponent).join('/');
}

/** Validate operator proposals without promoting them to an active release. */
export function validateReferenceProposalV1(
  raw: unknown,
  context: ReferenceIntakeContextV1,
): ReferenceIntakeResultV1 {
  const proposal = ReferenceProposalV1Schema.parse(raw);
  if (proposal.source.expectedSha256 !== context.sourceSha256)
    throw new TypeError('The source file digest differs from the proposal.');
  if (
    proposal.catalog.releaseId !== context.catalog.releaseId ||
    proposal.catalog.artifactSha256 !== context.catalog.artifactSha256
  )
    throw new TypeError('The proposal targets a different catalog release.');

  const units = new Map(
    context.components.map((entry) => [entry.componentId, entry.unit]),
  );
  if (units.size !== context.components.length)
    throw new TypeError('Component identifiers must be unique.');
  const parsed: { index: number; claim: ReferenceClaimV1; key: string }[] = [];
  const quarantined: QuarantinedReferenceClaimV1[] = [];
  for (const [index, rawClaim] of proposal.claims.entries()) {
    const result = ReferenceClaimV1Schema.safeParse(rawClaim);
    if (!result.success) {
      quarantined.push({
        index,
        reason: result.error.issues.map((issue) => issue.message).join('; '),
      });
      continue;
    }
    const claim = result.data;
    const expectedUnit =
      'componentId' in claim ? units.get(claim.componentId) : undefined;
    let reason: string | undefined;
    if ('componentId' in claim && expectedUnit === undefined)
      reason = 'The component is outside the active registry.';
    else if ('foodId' in claim && !context.foodIds.has(claim.foodId))
      reason = 'The food is outside the pinned catalog.';
    else if (
      claim.kind === 'food-composition' &&
      claim.value.state === 'known' &&
      (claim.value.unit.system !== 'ucum' ||
        claim.value.unit.code !== expectedUnit)
    )
      reason = 'The food-composition unit differs from the active registry.';
    else if (claim.kind === 'intake-reference') {
      const expectedHorizon =
        claim.referenceType === 'UL'
          ? 'daily-limit'
          : claim.referenceType === 'AMDR'
            ? 'energy-share'
            : 'daily-average';
      if (claim.horizon !== expectedHorizon)
        reason = 'The reference horizon differs from its type.';
      else if (
        (claim.referenceType === 'AMDR') !==
        (claim.value.kind === 'range')
      )
        reason = 'AMDR requires a range; other references require a point.';
      else if (
        claim.referenceType === 'AMDR' &&
        (claim.unit.system !== 'nutrixx' ||
          claim.unit.code !== 'percent-energy' ||
          Number(claim.value.kind === 'range' ? claim.value.upper : '0') > 100)
      )
        reason = 'AMDR requires a percent-energy range within 0–100.';
      else if (
        claim.referenceType !== 'AMDR' &&
        (claim.unit.system !== 'ucum' || claim.unit.code !== expectedUnit)
      )
        reason = 'The intake-reference unit differs from the active registry.';
    }
    if (reason !== undefined) quarantined.push({ index, reason });
    else parsed.push({ index, claim, key: claimKey(claim) });
  }

  const counts = new Map<string, number>();
  for (const item of parsed)
    counts.set(item.key, (counts.get(item.key) ?? 0) + 1);
  const proposed: StagedReferenceClaimV1[] = [];
  for (const item of parsed) {
    if ((counts.get(item.key) ?? 0) !== 1) {
      quarantined.push({
        index: item.index,
        reason: 'Multiple claims target the same subject in this proposal.',
      });
      continue;
    }
    proposed.push({
      claimKey: item.key,
      claim: item.claim,
      sourceId: proposal.source.sourceId,
      sourceSha256: context.sourceSha256,
      reviewStatus: 'pending-review',
    });
  }
  quarantined.sort((left, right) => left.index - right.index);
  const { claims: _claims, ...metadata } = proposal;
  return {
    format: 'nutrixx.reference-intake-result',
    schemaVersion: 1,
    proposal: metadata,
    proposed,
    quarantined,
  };
}
