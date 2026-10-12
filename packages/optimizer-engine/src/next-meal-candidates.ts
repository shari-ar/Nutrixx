import * as z from 'zod';

import {
  CanonicalCodeSchema,
  CanonicalIdSchema,
  EvidenceSourceV1Schema,
  NonnegativeCanonicalDecimalSchema,
  UnitV1Schema,
  UtcInstantSchema,
} from '@nutrixx/canonical-schema';

const AmountSchema = NonnegativeCanonicalDecimalSchema.max(64);
const PositiveAmountSchema = AmountSchema.refine(
  (value) => value !== '0',
  'An edible amount must be positive.',
);

export const NextMealSourceReferenceSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('food'),
    catalogReleaseId: z.string().min(1).max(200),
    foodId: CanonicalIdSchema,
    foodRevision: z.int().positive(),
  }),
  z.strictObject({
    kind: z.literal('recipe'),
    recipeId: CanonicalIdSchema,
    recipeVersion: z.int().positive(),
  }),
]);

export type NextMealSourceReference = z.infer<
  typeof NextMealSourceReferenceSchema
>;

export function nextMealSourceKey(reference: NextMealSourceReference): string {
  return reference.kind === 'food'
    ? `food:${reference.catalogReleaseId}:${reference.foodId}:${reference.foodRevision}`
    : `recipe:${reference.recipeId}:${reference.recipeVersion}`;
}

const NutrientSchema = z.discriminatedUnion('state', [
  z.strictObject({
    state: z.literal('known'),
    nutrientId: CanonicalCodeSchema,
    amountPer100EdibleGrams: AmountSchema,
    unit: UnitV1Schema,
    source: EvidenceSourceV1Schema,
  }),
  z.strictObject({
    state: z.literal('unknown'),
    nutrientId: CanonicalCodeSchema,
    reasonCode: CanonicalCodeSchema,
  }),
]);

const PortionSchema = z.strictObject({
  portionId: CanonicalIdSchema,
  edibleGrams: PositiveAmountSchema,
  source: EvidenceSourceV1Schema,
});

const IngredientSchema = z.strictObject({
  reference: NextMealSourceReferenceSchema,
  edibleGramsForYield: PositiveAmountSchema,
  preparationState: CanonicalCodeSchema,
});

export const NextMealCandidateSourceSchema = z
  .strictObject({
    reference: NextMealSourceReferenceSchema,
    displayName: z.string().trim().min(1).max(500),
    preparationState: CanonicalCodeSchema,
    edibleResolution: z.enum(['resolved', 'requires-preparation']),
    portions: z.array(PortionSchema),
    nutrientsPer100EdibleGrams: z.array(NutrientSchema).max(112),
    restrictionEvidence: z.discriminatedUnion('state', [
      z.strictObject({
        state: z.literal('verified'),
        ingredientFoodIds: z.array(CanonicalIdSchema),
        allergenCodes: z.array(CanonicalCodeSchema),
        source: EvidenceSourceV1Schema,
      }),
      z.strictObject({
        state: z.literal('unknown'),
        reasonCode: CanonicalCodeSchema,
      }),
    ]),
    recipe: z
      .strictObject({
        yieldEdibleGrams: PositiveAmountSchema,
        ingredients: z.array(IngredientSchema).min(1),
      })
      .optional(),
  })
  .superRefine((candidate, context) => {
    if (
      (candidate.reference.kind === 'recipe') !==
      (candidate.recipe !== undefined)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['recipe'],
        message: 'Recipe candidates require exact ingredient and yield facts.',
      });
    }
    for (const [field, values] of [
      ['portions', candidate.portions.map((portion) => portion.portionId)],
      [
        'nutrientsPer100EdibleGrams',
        candidate.nutrientsPer100EdibleGrams.map((item) => item.nutrientId),
      ],
    ] as const) {
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'Candidate facts require unique identities.',
        });
      }
    }
  });

export type NextMealCandidateSource = z.infer<
  typeof NextMealCandidateSourceSchema
>;

const InventoryEntrySchema = z.strictObject({
  reference: NextMealSourceReferenceSchema,
  edibleGrams: AmountSchema,
  preparationState: CanonicalCodeSchema,
  expiresAt: UtcInstantSchema.optional(),
});

export const NextMealCandidateRequestSchema = z
  .strictObject({
    requestedAt: UtcInstantSchema,
    manifest: z.strictObject({
      entryKeys: z.array(z.string().min(1)),
    }),
    entries: z.array(NextMealCandidateSourceSchema),
    exclusions: z.strictObject({
      foodIds: z.array(CanonicalIdSchema),
      recipeIds: z.array(CanonicalIdSchema),
      ingredientFoodIds: z.array(CanonicalIdSchema),
      allergenCodes: z.array(CanonicalCodeSchema),
    }),
    inventory: z.discriminatedUnion('mode', [
      z.strictObject({ mode: z.literal('ALL_CATALOG') }),
      z.strictObject({
        mode: z.literal('AVAILABLE_ONLY'),
        revision: z.int().positive(),
        entries: z.array(InventoryEntrySchema),
      }),
    ]),
    comparisonNutrients: z.array(
      z.strictObject({
        nutrientId: CanonicalCodeSchema,
        unit: UnitV1Schema,
      }),
    ),
    hardLimits: z.array(
      z.strictObject({
        ruleId: CanonicalCodeSchema,
        nutrientId: CanonicalCodeSchema,
        unit: UnitV1Schema,
        maximum: AmountSchema,
        recordedIntake: z.discriminatedUnion('state', [
          z.strictObject({ state: z.literal('known'), amount: AmountSchema }),
          z.strictObject({
            state: z.literal('unknown'),
            reasonCode: CanonicalCodeSchema,
          }),
        ]),
        sourceScope: z.enum(['all-intake', 'source-specific']),
      }),
    ),
  })
  .superRefine((request, context) => {
    const manifest = request.manifest.entryKeys;
    const actual = request.entries.map((entry) =>
      nextMealSourceKey(entry.reference),
    );
    const sortedActual = [...actual].sort();
    if (
      new Set(manifest).size !== manifest.length ||
      new Set(actual).size !== actual.length ||
      manifest.length !== actual.length ||
      manifest.some((key, index) => key !== sortedActual[index])
    ) {
      context.addIssue({
        code: 'custom',
        path: ['manifest'],
        message:
          'The complete, sorted manifest must match every catalog entry.',
      });
    }
    if (
      request.inventory.mode === 'AVAILABLE_ONLY' &&
      new Set(
        request.inventory.entries.map(
          (entry) =>
            `${nextMealSourceKey(entry.reference)}:${entry.preparationState}`,
        ),
      ).size !== request.inventory.entries.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['inventory', 'entries'],
        message: 'Inventory lots must be aggregated by exact source and state.',
      });
    }
  });

export type NextMealCandidateRequest = z.infer<
  typeof NextMealCandidateRequestSchema
>;

export type NextMealCandidateClassification =
  | 'COMPARABLE'
  | 'EVIDENCE_LIMITED'
  | 'UNAVAILABLE'
  | 'EXCLUDED'
  | 'REQUIRES_PREPARATION';

export interface NextMealCandidateDecision {
  readonly candidateKey: string;
  readonly classification: NextMealCandidateClassification;
  readonly reasonCodes: readonly string[];
  readonly supportedPortionIds: readonly string[];
}

export interface NextMealCandidateCensus {
  readonly total: number;
  readonly processed: number;
  readonly counts: Readonly<Record<NextMealCandidateClassification, number>>;
  readonly decisions: readonly NextMealCandidateDecision[];
}

interface Fraction {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

function decimal(value: string): Fraction {
  const [whole = '0', fraction = ''] = value.split('.');
  return {
    numerator: BigInt(`${whole}${fraction}`),
    denominator: 10n ** BigInt(fraction.length),
  };
}

function compare(left: Fraction, right: Fraction): number {
  const difference =
    left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function enough(available: string, required: Fraction): boolean {
  return compare(decimal(available), required) >= 0;
}

function add(left: Fraction, right: Fraction): Fraction {
  return {
    numerator:
      left.numerator * right.denominator + right.numerator * left.denominator,
    denominator: left.denominator * right.denominator,
  };
}

function sameUnit(
  left: { system: string; code: string },
  right: { system: string; code: string },
): boolean {
  return left.system === right.system && left.code === right.code;
}

function inventoryPortions(
  candidate: NextMealCandidateSource,
  request: NextMealCandidateRequest,
  portionIds: readonly string[],
  stock: ReadonlyMap<string, string>,
): readonly string[] {
  if (request.inventory.mode === 'ALL_CATALOG') return portionIds;
  const direct = stock.get(
    `${nextMealSourceKey(candidate.reference)}:${candidate.preparationState}`,
  );
  return candidate.portions
    .filter((portion) => portionIds.includes(portion.portionId))
    .filter((portion) => {
      if (direct !== undefined && enough(direct, decimal(portion.edibleGrams)))
        return true;
      if (candidate.recipe === undefined) return false;
      const serving = decimal(portion.edibleGrams);
      const yieldAmount = decimal(candidate.recipe.yieldEdibleGrams);
      const required = new Map<string, Fraction>();
      for (const ingredient of candidate.recipe.ingredients) {
        const key = `${nextMealSourceKey(ingredient.reference)}:${ingredient.preparationState}`;
        const amount = decimal(ingredient.edibleGramsForYield);
        const portionAmount = {
          numerator:
            amount.numerator * serving.numerator * yieldAmount.denominator,
          denominator:
            amount.denominator * serving.denominator * yieldAmount.numerator,
        };
        required.set(
          key,
          required.has(key)
            ? add(required.get(key)!, portionAmount)
            : portionAmount,
        );
      }
      return Array.from(required).every(([key, amount]) => {
        const available = stock.get(key);
        return available !== undefined && enough(available, amount);
      });
    })
    .map((portion) => portion.portionId);
}

function excludes(
  candidate: NextMealCandidateSource,
  request: NextMealCandidateRequest,
): string | null {
  const excluded = request.exclusions;
  const reference = candidate.reference;
  if (reference.kind === 'food' && excluded.foodIds.includes(reference.foodId))
    return 'excluded-food';
  if (
    reference.kind === 'recipe' &&
    excluded.recipeIds.includes(reference.recipeId)
  )
    return 'excluded-recipe';
  if (
    candidate.recipe?.ingredients.some(
      (ingredient) =>
        ingredient.reference.kind === 'food' &&
        (excluded.foodIds.includes(ingredient.reference.foodId) ||
          excluded.ingredientFoodIds.includes(ingredient.reference.foodId)),
    )
  )
    return 'excluded-ingredient';
  if (candidate.restrictionEvidence.state === 'verified') {
    if (
      candidate.restrictionEvidence.ingredientFoodIds.some(
        (id) =>
          excluded.foodIds.includes(id) ||
          excluded.ingredientFoodIds.includes(id),
      )
    )
      return 'excluded-ingredient';
    if (
      candidate.restrictionEvidence.allergenCodes.some((code) =>
        excluded.allergenCodes.includes(code),
      )
    )
      return 'excluded-allergen';
  }
  return null;
}

function classify(
  candidate: NextMealCandidateSource,
  request: NextMealCandidateRequest,
  stock: ReadonlyMap<string, string>,
): NextMealCandidateDecision {
  const candidateKey = nextMealSourceKey(candidate.reference);
  const exclusion = excludes(candidate, request);
  if (exclusion)
    return {
      candidateKey,
      classification: 'EXCLUDED',
      reasonCodes: [exclusion],
      supportedPortionIds: [],
    };
  if (
    candidate.edibleResolution === 'requires-preparation' ||
    candidate.portions.length === 0
  )
    return {
      candidateKey,
      classification: 'REQUIRES_PREPARATION',
      reasonCodes: ['edible-portion-unresolved'],
      supportedPortionIds: [],
    };
  const portionIds = inventoryPortions(
    candidate,
    request,
    candidate.portions.map((portion) => portion.portionId),
    stock,
  );
  if (portionIds.length === 0)
    return {
      candidateKey,
      classification: 'UNAVAILABLE',
      reasonCodes: ['inventory-insufficient'],
      supportedPortionIds: [],
    };
  const restrictionsDeclared =
    request.exclusions.foodIds.length +
      request.exclusions.recipeIds.length +
      request.exclusions.ingredientFoodIds.length +
      request.exclusions.allergenCodes.length >
    0;
  if (restrictionsDeclared && candidate.restrictionEvidence.state === 'unknown')
    return {
      candidateKey,
      classification: 'EVIDENCE_LIMITED',
      reasonCodes: ['restriction-evidence-unresolved'],
      supportedPortionIds: portionIds,
    };
  const nutrients = new Map(
    candidate.nutrientsPer100EdibleGrams.map((item) => [item.nutrientId, item]),
  );
  const limited: string[] = [];
  let safePortions = [...portionIds];
  for (const rule of request.hardLimits) {
    const observation = nutrients.get(rule.nutrientId);
    if (
      rule.sourceScope !== 'all-intake' ||
      rule.recordedIntake.state !== 'known' ||
      observation?.state !== 'known' ||
      !sameUnit(rule.unit, observation.unit)
    ) {
      limited.push(`hard-limit-evidence-unresolved:${rule.ruleId}`);
      continue;
    }
    const recordedAmount = rule.recordedIntake.amount;
    safePortions = safePortions.filter((id) => {
      const portion = candidate.portions.find((item) => item.portionId === id)!;
      const intake = decimal(recordedAmount);
      const composition = decimal(observation.amountPer100EdibleGrams);
      const grams = decimal(portion.edibleGrams);
      const maximum = decimal(rule.maximum);
      return (
        compare(
          {
            numerator:
              intake.numerator *
                composition.denominator *
                grams.denominator *
                100n +
              composition.numerator * grams.numerator * intake.denominator,
            denominator:
              intake.denominator *
              composition.denominator *
              grams.denominator *
              100n,
          },
          maximum,
        ) <= 0
      );
    });
    if (safePortions.length === 0)
      return {
        candidateKey,
        classification: 'EXCLUDED',
        reasonCodes: [`hard-limit-exceeded:${rule.ruleId}`],
        supportedPortionIds: [],
      };
  }
  for (const rule of request.comparisonNutrients) {
    const observation = nutrients.get(rule.nutrientId);
    if (
      observation?.state !== 'known' ||
      !sameUnit(rule.unit, observation.unit)
    )
      limited.push(`comparison-evidence-unresolved:${rule.nutrientId}`);
  }
  return limited.length > 0
    ? {
        candidateKey,
        classification: 'EVIDENCE_LIMITED',
        reasonCodes: limited,
        supportedPortionIds: safePortions,
      }
    : {
        candidateKey,
        classification: 'COMPARABLE',
        reasonCodes: [],
        supportedPortionIds: safePortions,
      };
}

export function classifyNextMealCatalog(raw: unknown): NextMealCandidateCensus {
  const request = NextMealCandidateRequestSchema.parse(raw);
  const stock = new Map<string, string>(
    request.inventory.mode === 'AVAILABLE_ONLY'
      ? request.inventory.entries
          .filter(
            (entry) =>
              entry.expiresAt === undefined ||
              entry.expiresAt > request.requestedAt,
          )
          .map(
            (entry) =>
              [
                `${nextMealSourceKey(entry.reference)}:${entry.preparationState}`,
                entry.edibleGrams,
              ] as const,
          )
      : [],
  );
  const byKey = new Map(
    request.entries.map((entry) => [nextMealSourceKey(entry.reference), entry]),
  );
  const decisions = request.manifest.entryKeys.map((key) =>
    classify(byKey.get(key)!, request, stock),
  );
  const counts: Record<NextMealCandidateClassification, number> = {
    COMPARABLE: 0,
    EVIDENCE_LIMITED: 0,
    UNAVAILABLE: 0,
    EXCLUDED: 0,
    REQUIRES_PREPARATION: 0,
  };
  for (const decision of decisions) counts[decision.classification]++;
  return {
    total: decisions.length,
    processed: decisions.length,
    counts,
    decisions,
  };
}
