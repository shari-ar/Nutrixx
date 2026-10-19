import { z } from 'zod';

const IdentifierV1Schema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const DigestV1Schema = z.string().regex(/^[a-f0-9]{64}$/u);

const ReferenceGapSubjectV1Schema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('food-composition-coverage'),
    foodId: IdentifierV1Schema,
  }),
  z.strictObject({
    kind: z.literal('food-composition'),
    foodId: IdentifierV1Schema,
    componentId: IdentifierV1Schema,
  }),
  z.strictObject({
    kind: z.literal('cooking-retention'),
    foodId: IdentifierV1Schema,
    methodId: IdentifierV1Schema,
    componentId: IdentifierV1Schema,
  }),
  z.strictObject({
    kind: z.literal('cooking-yield'),
    foodId: IdentifierV1Schema,
    methodId: IdentifierV1Schema,
  }),
  z.strictObject({
    kind: z.literal('intake-reference'),
    componentId: IdentifierV1Schema,
    referenceType: z.enum(['RDA', 'AI', 'EAR', 'UL', 'AMDR']),
    sourceScope: z.enum([
      'all-intake',
      'fortified-and-supplemental',
      'preformed-vitamin-a',
    ]),
    populationId: IdentifierV1Schema,
    market: z.string().regex(/^[A-Z]{2}$/u),
  }),
]);

const ImpactEvidenceV1Schema = z
  .strictObject({
    corpusId: IdentifierV1Schema,
    corpusSha256: DigestV1Schema,
    evaluatedCases: z.number().int().positive(),
    affectedCases: z.number().int().nonnegative(),
    blockedCases: z.number().int().nonnegative(),
  })
  .refine(
    (value) =>
      value.blockedCases <= value.affectedCases &&
      value.affectedCases <= value.evaluatedCases,
    { message: 'Impact counts must satisfy blocked <= affected <= evaluated.' },
  );

export const ReferenceGapV1Schema = z.strictObject({
  subject: ReferenceGapSubjectV1Schema,
  deficiency: z.enum([
    'incomplete-coverage',
    'absent',
    'explicitly-unknown',
    'unit-incompatible',
    'lineage-missing',
  ]),
  detectedIn: z.strictObject({
    releaseId: IdentifierV1Schema,
    artifactSha256: DigestV1Schema,
  }),
  impact: ImpactEvidenceV1Schema.nullable(),
  safety: z.discriminatedUnion('level', [
    z.strictObject({ level: z.literal('routine') }),
    z.strictObject({
      level: z.literal('critical'),
      rationale: z.string().trim().min(1),
      evidenceId: IdentifierV1Schema,
    }),
  ]),
});

export type ReferenceGapV1 = z.infer<typeof ReferenceGapV1Schema>;

/** A stable identity across source releases; release evidence stays on the gap. */
export function referenceGapKeyV1(gap: ReferenceGapV1): string {
  const subject = gap.subject;
  const parts: string[] = [subject.kind];
  switch (subject.kind) {
    case 'food-composition-coverage':
      parts.push(subject.foodId);
      break;
    case 'food-composition':
      parts.push(subject.foodId, subject.componentId);
      break;
    case 'cooking-retention':
      parts.push(subject.foodId, subject.methodId, subject.componentId);
      break;
    case 'cooking-yield':
      parts.push(subject.foodId, subject.methodId);
      break;
    case 'intake-reference':
      parts.push(
        subject.componentId,
        subject.referenceType,
        subject.sourceScope,
        subject.populationId,
        subject.market,
      );
      break;
  }
  parts.push(gap.deficiency);
  return parts.map(encodeURIComponent).join('/');
}

export const REFERENCE_GAP_PRIORITY_POLICY_V1 = {
  policyId: 'reference-gap-priority-v1',
  blockedWeight: 70,
  affectedWeight: 30,
} as const;

export interface PrioritizedReferenceGapV1 {
  readonly gapKey: string;
  readonly gap: ReferenceGapV1;
  readonly band: 'critical' | 'measured' | 'unmeasured';
  /** Decision-coverage score in [0, 100], not a health-risk estimate. */
  readonly score: number | null;
}

/** Compare gaps only against an identical, pinned replay corpus. */
export function prioritizeReferenceGapsV1(
  candidates: readonly unknown[],
): readonly PrioritizedReferenceGapV1[] {
  const gaps = candidates.map((candidate) =>
    ReferenceGapV1Schema.parse(candidate),
  );
  const keys = new Set<string>();
  let corpus: string | undefined;
  const ranked = gaps.map((gap): PrioritizedReferenceGapV1 => {
    const gapKey = referenceGapKeyV1(gap);
    if (keys.has(gapKey))
      throw new TypeError(`Duplicate reference gap: ${gapKey}.`);
    keys.add(gapKey);
    if (gap.impact) {
      const identity = `${gap.impact.corpusId}:${gap.impact.corpusSha256}:${gap.impact.evaluatedCases}`;
      if (corpus !== undefined && corpus !== identity)
        throw new TypeError(
          'Impact evidence must use one pinned corpus and denominator.',
        );
      corpus = identity;
    }
    const score = gap.impact
      ? Math.round(
          (REFERENCE_GAP_PRIORITY_POLICY_V1.blockedWeight *
            gap.impact.blockedCases +
            REFERENCE_GAP_PRIORITY_POLICY_V1.affectedWeight *
              gap.impact.affectedCases) /
            gap.impact.evaluatedCases,
        )
      : null;
    return {
      gapKey,
      gap,
      band:
        gap.safety.level === 'critical'
          ? 'critical'
          : score === null
            ? 'unmeasured'
            : 'measured',
      score,
    };
  });
  const bandOrder = { critical: 0, measured: 1, unmeasured: 2 } as const;
  return ranked.sort(
    (left, right) =>
      bandOrder[left.band] - bandOrder[right.band] ||
      (right.score ?? -1) - (left.score ?? -1) ||
      (left.gapKey < right.gapKey ? -1 : left.gapKey > right.gapKey ? 1 : 0),
  );
}
