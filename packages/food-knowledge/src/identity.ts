import * as z from 'zod';

import type { FoodV1 } from './model.js';

export const NUTRIXX_FALLBACK_PROVIDER_V1 = 'nutrixx-curated' as const;

const ProviderCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u);

export function createFoodSourcePriorityV1(
  sourceOrder: readonly string[],
): ReadonlyMap<string, number> {
  const parsed = z.array(ProviderCodeSchema).min(1).parse(sourceOrder);
  if (new Set(parsed).size !== parsed.length)
    throw new TypeError('Food source policy contains a repeated provider.');
  if (parsed.includes(NUTRIXX_FALLBACK_PROVIDER_V1))
    throw new TypeError(
      'Nutrixx fallback remains implicit and last in source policy.',
    );
  return new Map(parsed.map((provider, index) => [provider, index]));
}

/**
 * Every external provider, including providers added in the future, outranks
 * Nutrixx-curated fallback values. Known external providers retain their
 * declared order; new external providers sort after them and before Nutrixx.
 */
export function compareFoodSourcePriorityV1(
  leftProvider: string,
  rightProvider: string,
  sourceOrder: readonly string[],
): number {
  if (leftProvider === rightProvider) return 0;
  if (leftProvider === NUTRIXX_FALLBACK_PROVIDER_V1) return 1;
  if (rightProvider === NUTRIXX_FALLBACK_PROVIDER_V1) return -1;
  const priority = createFoodSourcePriorityV1(sourceOrder);
  return (
    (priority.get(leftProvider) ?? sourceOrder.length) -
    (priority.get(rightProvider) ?? sourceOrder.length)
  );
}

const IdentityMemberSchema = z.strictObject({
  provider: ProviderCodeSchema,
  sourceRecordId: z.string().trim().min(1).max(128),
  sourceName: z.string().trim().min(1).max(500),
});

const ReviewedIdentityGroupsSchema = z.strictObject({
  format: z.literal('nutrixx.reviewed-food-identity-links'),
  schemaVersion: z.literal(1),
  sourceOrder: z.array(ProviderCodeSchema).min(1),
  groups: z.array(
    z.strictObject({
      name: z.string().trim().min(1).max(500),
      members: z.array(IdentityMemberSchema).min(2),
    }),
  ),
  pending: z.array(
    IdentityMemberSchema.extend({
      reason: z.string().trim().min(1).max(1_000),
      candidateSourceRecords: z
        .array(
          z.strictObject({
            provider: ProviderCodeSchema,
            sourceRecordId: z.string().trim().min(1).max(128),
            sourceName: z.string().trim().min(1).max(500),
          }),
        )
        .default([]),
    }),
  ),
});

type IdentityMember = z.infer<typeof IdentityMemberSchema>;
export type PendingFoodIdentityV1 = z.infer<
  typeof ReviewedIdentityGroupsSchema
>['pending'][number];

function normalizeName(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('und');
}

function memberKey(provider: string, sourceRecordId: string): string {
  return `${provider}:${sourceRecordId}`;
}

export class ReviewedFoodIdentityResolverV1 {
  readonly #members = new Map<
    string,
    { readonly groupIndex: number; readonly member: IdentityMember }
  >();
  readonly #resolved = new Map<number, FoodV1>();
  readonly #observed = new Set<string>();
  readonly #sourceOrder: readonly string[];
  readonly #pending = new Map<string, PendingFoodIdentityV1>();

  public constructor(input: unknown) {
    const reviewed = ReviewedIdentityGroupsSchema.parse(input);
    createFoodSourcePriorityV1(reviewed.sourceOrder);
    this.#sourceOrder = reviewed.sourceOrder;
    const names = new Set<string>();
    reviewed.groups.forEach((group, groupIndex) => {
      const normalized = normalizeName(group.name);
      if (names.has(normalized)) {
        throw new TypeError(`Repeated reviewed food identity: ${group.name}.`);
      }
      names.add(normalized);
      let previousPriority = -1;
      for (const member of group.members) {
        const priority = this.#sourceOrder.indexOf(member.provider);
        const key = memberKey(member.provider, member.sourceRecordId);
        if (
          priority < previousPriority ||
          priority === -1 ||
          normalizeName(member.sourceName) !== normalized ||
          this.#members.has(key)
        ) {
          throw new TypeError(`Invalid reviewed food identity: ${key}.`);
        }
        previousPriority = priority;
        this.#members.set(key, { groupIndex, member });
      }
    });
    for (const pending of reviewed.pending) {
      const key = memberKey(pending.provider, pending.sourceRecordId);
      if (
        !this.#sourceOrder.includes(pending.provider) ||
        this.#members.has(key) ||
        this.#pending.has(key)
      )
        throw new TypeError(`Invalid pending food identity: ${key}.`);
      this.#pending.set(key, pending);
    }
  }

  public get sourceOrder(): readonly string[] {
    return [...this.#sourceOrder];
  }

  public get pending(): readonly PendingFoodIdentityV1[] {
    return [...this.#pending.values()];
  }

  public pendingIdentity(
    provider: string,
    sourceRecordId: string,
    sourceName: string,
  ): PendingFoodIdentityV1 | null {
    const pending = this.#pending.get(memberKey(provider, sourceRecordId));
    if (!pending) return null;
    if (pending.sourceName !== sourceName)
      throw new TypeError(
        `The pending food description changed: ${provider}:${sourceRecordId}.`,
      );
    return pending;
  }

  #reviewedMember(
    provider: string,
    sourceRecordId: string,
    sourceName: string,
  ): { readonly groupIndex: number; readonly member: IdentityMember } | null {
    const entry = this.#members.get(memberKey(provider, sourceRecordId));
    if (!entry) return null;
    if (entry.member.sourceName !== sourceName) {
      throw new TypeError(
        `The reviewed food description changed: ${provider}:${sourceRecordId}.`,
      );
    }
    return entry;
  }

  public resolve(
    provider: string,
    sourceRecordId: string,
    sourceName: string,
  ): FoodV1 | null {
    const entry = this.#reviewedMember(provider, sourceRecordId, sourceName);
    return entry ? (this.#resolved.get(entry.groupIndex) ?? null) : null;
  }

  public register(
    provider: string,
    sourceRecordId: string,
    sourceName: string,
    food: FoodV1,
  ): void {
    const entry = this.#reviewedMember(provider, sourceRecordId, sourceName);
    if (!entry) return;
    const key = memberKey(provider, sourceRecordId);
    if (this.#observed.has(key)) {
      throw new TypeError(`Repeated reviewed source record: ${key}.`);
    }
    const existing = this.#resolved.get(entry.groupIndex);
    if (existing && existing.foodId !== food.foodId) {
      throw new TypeError(`Conflicting reviewed food identity: ${key}.`);
    }
    this.#observed.add(key);
    this.#resolved.set(entry.groupIndex, food);
  }

  public assertComplete(
    activeProviders: ReadonlySet<string> = new Set(this.#sourceOrder),
  ): {
    readonly reviewedGroups: number;
    readonly reviewedSourceRecords: number;
  } {
    const requiredMembers = [...this.#members.entries()].filter(([, entry]) =>
      activeProviders.has(entry.member.provider),
    );
    const requiredGroups = new Set(
      requiredMembers.map(([, entry]) => entry.groupIndex),
    );
    const missing = requiredMembers.find(
      ([key]) => !this.#observed.has(key),
    )?.[0];
    if (
      missing !== undefined ||
      [...requiredGroups].some((groupIndex) => !this.#resolved.has(groupIndex))
    ) {
      throw new TypeError(`Unresolved reviewed food identity: ${missing}.`);
    }
    return {
      reviewedGroups: requiredGroups.size,
      reviewedSourceRecords: requiredMembers.length,
    };
  }
}
