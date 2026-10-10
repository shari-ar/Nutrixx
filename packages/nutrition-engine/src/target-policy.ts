import * as z from 'zod';

import type { HealthContextSnapshotV1 } from './health-context.js';

const CanonicalAmountSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/);
const InstantSchema = z.iso.datetime({ precision: 3 });

export const TargetRuleV1Schema = z
  .strictObject({
    ruleId: z.string().min(1).max(128),
    nutrientId: z.string().min(1).max(128),
    type: z.enum(['RDA', 'AI', 'EAR', 'UL', 'AMDR']),
    value: z.discriminatedUnion('kind', [
      z.strictObject({
        kind: z.literal('point'),
        amount: CanonicalAmountSchema,
      }),
      z
        .strictObject({
          kind: z.literal('range'),
          lower: CanonicalAmountSchema,
          upper: CanonicalAmountSchema,
        })
        .refine((value) => Number(value.lower) <= Number(value.upper), {
          message: 'The target range must be ordered.',
        }),
    ]),
    unit: z.strictObject({
      system: z.enum(['ucum', 'nutrixx']),
      code: z.string().min(1).max(64),
    }),
    horizon: z.enum(['daily-average', 'daily-limit', 'energy-share']),
    sourceScope: z.enum([
      'all-intake',
      'fortified-and-supplemental',
      'preformed-vitamin-a',
    ]),
    population: z
      .strictObject({
        minimumAgeYears: z.int().min(18).max(120),
        maximumAgeYears: z.int().min(18).max(120),
        physiologicalReference: z.enum(['any', 'female', 'male']),
        lifeStage: z.enum(['any', 'adult', 'pregnancy', 'lactation']),
      })
      .refine((value) => value.minimumAgeYears <= value.maximumAgeYears, {
        message: 'The population age range must be ordered.',
      }),
    effectiveFrom: InstantSchema,
    effectiveUntil: InstantSchema.optional(),
    source: z.strictObject({
      authority: z.string().min(1).max(128),
      title: z.string().min(1).max(256),
      edition: z.string().min(1).max(128),
      url: z.url(),
    }),
  })
  .superRefine((rule, context) => {
    const expectedHorizon =
      rule.type === 'UL'
        ? 'daily-limit'
        : rule.type === 'AMDR'
          ? 'energy-share'
          : 'daily-average';
    if (rule.horizon !== expectedHorizon) {
      context.addIssue({
        code: 'custom',
        path: ['horizon'],
        message: 'The target horizon does not match its type.',
      });
    }
    if ((rule.type === 'AMDR') !== (rule.value.kind === 'range')) {
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'AMDR requires a range; other targets require a point.',
      });
    }
    if (
      rule.effectiveUntil !== undefined &&
      Date.parse(rule.effectiveUntil) <= Date.parse(rule.effectiveFrom)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['effectiveUntil'],
        message: 'The effective interval must have positive duration.',
      });
    }
  });

export const TargetPolicyReleaseV1Schema = z
  .strictObject({
    releaseId: z.string().min(1).max(128),
    policyVersion: z.string().min(1).max(128),
    effectiveFrom: InstantSchema,
    effectiveUntil: InstantSchema.optional(),
    applicableMarkets: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1),
    publication: z.discriminatedUnion('status', [
      z.strictObject({ status: z.literal('draft') }),
      z.strictObject({
        status: z.literal('provisional'),
        authorId: z.string().min(1).max(128),
        publishedAt: InstantSchema,
      }),
      z.strictObject({
        status: z.literal('reviewed'),
        reviewerId: z.string().min(1).max(128),
        reviewedAt: InstantSchema,
      }),
    ]),
    rules: z.array(TargetRuleV1Schema),
  })
  .superRefine((release, context) => {
    const ids = new Set<string>();
    for (const [index, rule] of release.rules.entries()) {
      if (ids.has(rule.ruleId)) {
        context.addIssue({
          code: 'custom',
          path: ['rules', index, 'ruleId'],
          message: 'Target rule IDs must be unique within a release.',
        });
      }
      ids.add(rule.ruleId);
    }
    if (
      release.effectiveUntil !== undefined &&
      Date.parse(release.effectiveUntil) <= Date.parse(release.effectiveFrom)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['effectiveUntil'],
        message: 'The release interval must have positive duration.',
      });
    }
  });

export type TargetRuleV1 = z.infer<typeof TargetRuleV1Schema>;
export type TargetPolicyReleaseV1 = z.infer<typeof TargetPolicyReleaseV1Schema>;
export type TargetQueryV1 = 'intake-reference' | 'EAR' | 'UL' | 'AMDR';

export type TargetSelectionV1 =
  | {
      readonly status: 'READY';
      readonly releaseId: string;
      readonly policyVersion: string;
      readonly publicationStatus: 'provisional' | 'reviewed';
      readonly profileRevision: number;
      readonly rule: TargetRuleV1;
      readonly equivalentRuleIds: readonly string[];
    }
  | {
      readonly status: 'NEEDS_INPUT';
      readonly fields: readonly string[];
      readonly reason: string;
    }
  | {
      readonly status: 'OUT_OF_SCOPE';
      readonly reason: string;
    };

function effective(
  instant: string,
  interval: {
    readonly effectiveFrom: string;
    readonly effectiveUntil?: string | undefined;
  },
): boolean {
  return (
    Date.parse(instant) >= Date.parse(interval.effectiveFrom) &&
    (interval.effectiveUntil === undefined ||
      Date.parse(instant) < Date.parse(interval.effectiveUntil))
  );
}

function selectForPopulation(
  rules: readonly TargetRuleV1[],
  query: TargetQueryV1,
  age: number,
  physiology: 'female' | 'male',
  lifeStage: 'adult' | 'pregnancy' | 'lactation',
): TargetRuleV1 | null | 'conflict' {
  const matching = rules.filter(
    (rule) =>
      rule.population.minimumAgeYears <= age &&
      age <= rule.population.maximumAgeYears &&
      (rule.population.physiologicalReference === 'any' ||
        rule.population.physiologicalReference === physiology) &&
      (rule.population.lifeStage === 'any' ||
        rule.population.lifeStage === lifeStage),
  );
  const candidates =
    query === 'intake-reference'
      ? matching.filter((rule) => rule.type === 'RDA').length > 0
        ? matching.filter((rule) => rule.type === 'RDA')
        : matching.filter((rule) => rule.type === 'AI')
      : matching.filter((rule) => rule.type === query);
  return candidates.length > 1 ? 'conflict' : (candidates[0] ?? null);
}

function decisionSignature(rule: TargetRuleV1): string {
  return JSON.stringify({
    nutrientId: rule.nutrientId,
    type: rule.type,
    value: rule.value,
    unit: rule.unit,
    horizon: rule.horizon,
    sourceScope: rule.sourceScope,
    source: rule.source,
  });
}

export function selectTargetV1(options: {
  readonly release: TargetPolicyReleaseV1;
  readonly context: HealthContextSnapshotV1;
  readonly nutrientId: string;
  readonly query: TargetQueryV1;
  readonly marketCode?: string;
}): TargetSelectionV1 {
  const release = TargetPolicyReleaseV1Schema.parse(options.release);
  const context = options.context;
  if (context.status === 'OUT_OF_SCOPE') {
    return { status: 'OUT_OF_SCOPE', reason: 'health-context-out-of-scope' };
  }
  if (context.status === 'NEEDS_INPUT') {
    return {
      status: 'NEEDS_INPUT',
      fields: context.neededInput,
      reason: 'health-context-needs-input',
    };
  }
  if (
    release.publication.status === 'draft' ||
    !effective(context.assessedAt, release)
  ) {
    return { status: 'OUT_OF_SCOPE', reason: 'target-release-unavailable' };
  }
  if (options.marketCode === undefined) {
    return {
      status: 'NEEDS_INPUT',
      fields: ['market'],
      reason: 'target-market-unconfirmed',
    };
  }
  if (!release.applicableMarkets.includes(options.marketCode)) {
    return { status: 'OUT_OF_SCOPE', reason: 'target-market-unavailable' };
  }
  const rules = release.rules.filter(
    (rule) =>
      rule.nutrientId === options.nutrientId &&
      effective(context.assessedAt, rule),
  );
  if (rules.length === 0) {
    return { status: 'OUT_OF_SCOPE', reason: 'target-unavailable' };
  }

  const physiologies: readonly ('female' | 'male')[] =
    context.physiologicalReference === 'unsure'
      ? ['female', 'male']
      : [context.physiologicalReference];
  const selected = new Map<string, TargetRuleV1>();
  let hasGap = false;
  for (
    let age = context.ageYears.minimum;
    age <= context.ageYears.maximum;
    age += 1
  ) {
    for (const physiology of physiologies) {
      const lifeStages: readonly ('adult' | 'pregnancy' | 'lactation')[] =
        context.lifeStage === 'unspecified'
          ? ['adult', 'pregnancy', 'lactation']
          : [context.lifeStage];
      for (const lifeStage of lifeStages) {
        const rule = selectForPopulation(
          rules,
          options.query,
          age,
          physiology,
          lifeStage,
        );
        if (rule === 'conflict') {
          return { status: 'OUT_OF_SCOPE', reason: 'target-policy-conflict' };
        }
        if (rule === null) {
          hasGap = true;
        } else {
          selected.set(rule.ruleId, rule);
        }
      }
    }
  }
  if (selected.size === 0) {
    return { status: 'OUT_OF_SCOPE', reason: 'target-unavailable' };
  }
  const selectedRules = [...selected.values()];
  const equivalentDecisions =
    new Set(selectedRules.map(decisionSignature)).size === 1;
  if (!equivalentDecisions || hasGap) {
    const fields: string[] = [];
    if (context.ageYears.minimum !== context.ageYears.maximum) {
      fields.push('birth-date-or-current-age');
    }
    if (context.physiologicalReference === 'unsure') {
      fields.push('physiological-reference');
    }
    if (context.lifeStage === 'unspecified') {
      fields.push('life-stage');
    }
    return fields.length > 0
      ? {
          status: 'NEEDS_INPUT',
          fields,
          reason: 'target-applicability-ambiguous',
        }
      : { status: 'OUT_OF_SCOPE', reason: 'target-policy-coverage-gap' };
  }
  const rule = selected.values().next().value;
  if (rule === undefined) {
    return { status: 'OUT_OF_SCOPE', reason: 'target-unavailable' };
  }
  return {
    status: 'READY',
    releaseId: release.releaseId,
    policyVersion: release.policyVersion,
    publicationStatus: release.publication.status,
    profileRevision: context.profileRevision,
    rule,
    equivalentRuleIds: selectedRules.map((candidate) => candidate.ruleId),
  };
}
