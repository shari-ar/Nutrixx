import { z } from 'zod';

import {
  ReferenceClaimV1Schema,
  type ReferenceClaimV1,
  type StagedReferenceClaimV1,
} from './intake.js';

const IdentifierSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/u);

export const ReferenceReviewV1Schema = z.strictObject({
  format: z.literal('nutrixx.reference-review'),
  schemaVersion: z.literal(1),
  runId: DigestSchema,
  reviewerId: IdentifierSchema,
  reviewedAt: z.iso.datetime({ precision: 3 }),
  decisions: z.array(
    z.discriminatedUnion('disposition', [
      z.strictObject({
        claimKey: z.string().min(1),
        disposition: z.literal('accepted'),
        rationale: z.string().trim().min(1).max(2000),
        checks: z.strictObject({
          sourceEvidence: z.literal(true),
          usageRights: z.literal(true),
          unitsAndMethod: z.literal(true),
        }),
      }),
      z.strictObject({
        claimKey: z.string().min(1),
        disposition: z.literal('rejected'),
        rationale: z.string().trim().min(1).max(2000),
      }),
    ]),
  ),
});

export type ReferenceReviewV1 = z.infer<typeof ReferenceReviewV1Schema>;

export interface ReviewedClaimV1 {
  readonly claimKey: string;
  readonly claim: ReferenceClaimV1;
  readonly sourceId: string;
  readonly sourceSha256: string;
  readonly reviewerId: string;
  readonly reviewedAt: string;
  readonly rationale: string;
}

/** Require an explicit, complete disposition before a staged claim can enter a candidate. */
export function selectReviewedClaimsV1(
  runId: string,
  staged: readonly StagedReferenceClaimV1[],
  rawReview: unknown,
): readonly ReviewedClaimV1[] {
  const review = ReferenceReviewV1Schema.parse(rawReview);
  if (review.runId !== runId)
    throw new TypeError('The review belongs to another staged run.');
  const byKey = new Map(staged.map((item) => [item.claimKey, item]));
  if (byKey.size !== staged.length)
    throw new TypeError('The staged run contains duplicate claim keys.');
  if (
    review.decisions.length !== staged.length ||
    new Set(review.decisions.map((item) => item.claimKey)).size !==
      review.decisions.length
  )
    throw new TypeError(
      'Every staged claim needs exactly one review decision.',
    );
  const accepted: ReviewedClaimV1[] = [];
  for (const decision of review.decisions) {
    const stagedClaim = byKey.get(decision.claimKey);
    if (!stagedClaim || stagedClaim.reviewStatus !== 'pending-review')
      throw new TypeError('The review includes an unknown staged claim.');
    if (decision.disposition === 'accepted') {
      accepted.push({
        claimKey: decision.claimKey,
        claim: ReferenceClaimV1Schema.parse(stagedClaim.claim),
        sourceId: stagedClaim.sourceId,
        sourceSha256: stagedClaim.sourceSha256,
        reviewerId: review.reviewerId,
        reviewedAt: review.reviewedAt,
        rationale: decision.rationale,
      });
    }
  }
  return accepted.sort((left, right) =>
    left.claimKey < right.claimKey
      ? -1
      : left.claimKey > right.claimKey
        ? 1
        : 0,
  );
}

export interface ReferenceProjectionV1 {
  readonly format: 'nutrixx.reference-calculation-projection';
  readonly schemaVersion: 1;
  readonly baseCatalog: { readonly releaseId: string; readonly sha256: string };
  readonly reviewedRunId: string;
  readonly foodIndex: Readonly<
    Record<string, { readonly start: number; readonly count: number }>
  >;
  readonly foodComposition: readonly {
    readonly foodId: string;
    readonly componentId: string;
    readonly value: Extract<
      ReferenceClaimV1,
      { kind: 'food-composition' }
    >['value'];
    readonly provenance: {
      readonly sourceId: string;
      readonly sourceSha256: string;
      readonly locator: string;
      readonly reviewerId: string;
      readonly reviewedAt: string;
    };
  }[];
  readonly cookingRetention: readonly ReviewedClaimV1[];
  readonly cookingYield: readonly ReviewedClaimV1[];
  readonly intakeReferences: readonly ReviewedClaimV1[];
}

/** Sorted, compact override index; baseline data stays in the pinned catalog. */
export function buildReferenceProjectionV1(
  baseCatalog: { readonly releaseId: string; readonly sha256: string },
  reviewedRunId: string,
  accepted: readonly ReviewedClaimV1[],
): ReferenceProjectionV1 {
  const foodComposition: ReferenceProjectionV1['foodComposition'][number][] =
    [];
  const cookingRetention: ReviewedClaimV1[] = [];
  const cookingYield: ReviewedClaimV1[] = [];
  const intakeReferences: ReviewedClaimV1[] = [];
  const keys = new Set<string>();
  for (const item of accepted) {
    if (keys.has(item.claimKey))
      throw new TypeError('A reviewed claim appears more than once.');
    keys.add(item.claimKey);
    switch (item.claim.kind) {
      case 'food-composition':
        foodComposition.push({
          foodId: item.claim.foodId,
          componentId: item.claim.componentId,
          value: item.claim.value,
          provenance: {
            sourceId: item.sourceId,
            sourceSha256: item.sourceSha256,
            locator: item.claim.locator,
            reviewerId: item.reviewerId,
            reviewedAt: item.reviewedAt,
          },
        });
        break;
      case 'cooking-retention':
        cookingRetention.push(item);
        break;
      case 'cooking-yield':
        cookingYield.push(item);
        break;
      case 'intake-reference':
        intakeReferences.push(item);
        break;
    }
  }
  foodComposition.sort(
    (left, right) =>
      left.foodId.localeCompare(right.foodId) ||
      left.componentId.localeCompare(right.componentId),
  );
  const indexByFood = new Map<string, { start: number; count: number }>();
  for (const [index, item] of foodComposition.entries()) {
    const previous = indexByFood.get(item.foodId);
    if (previous) previous.count += 1;
    else indexByFood.set(item.foodId, { start: index, count: 1 });
  }
  const foodIndex = Object.fromEntries(indexByFood);
  return {
    format: 'nutrixx.reference-calculation-projection',
    schemaVersion: 1,
    baseCatalog,
    reviewedRunId,
    foodIndex,
    foodComposition,
    cookingRetention,
    cookingYield,
    intakeReferences,
  };
}
