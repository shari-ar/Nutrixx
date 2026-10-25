import * as z from 'zod';

import type { FoodV1 } from './model.js';

export const FOOD_SOURCE_ORDER_V1 = [
  'usda-fdc',
  'health-canada',
  'fsanz',
  'public-health-england',
  'anses-ciqual',
] as const;

export const FOOD_SOURCE_PRIORITY_V1: Readonly<Record<string, number>> =
  Object.fromEntries(
    FOOD_SOURCE_ORDER_V1.map((provider, index) => [provider, index]),
  );

export const NUTRIXX_FALLBACK_PROVIDER_V1 = 'nutrixx-curated' as const;

/**
 * Every external provider, including providers added in the future, outranks
 * Nutrixx-curated fallback values. Known external providers retain their
 * declared order; new external providers sort after them and before Nutrixx.
 */
export function compareFoodSourcePriorityV1(
  leftProvider: string,
  rightProvider: string,
): number {
  if (leftProvider === rightProvider) return 0;
  if (leftProvider === NUTRIXX_FALLBACK_PROVIDER_V1) return 1;
  if (rightProvider === NUTRIXX_FALLBACK_PROVIDER_V1) return -1;
  return (
    (FOOD_SOURCE_PRIORITY_V1[leftProvider] ?? FOOD_SOURCE_ORDER_V1.length) -
    (FOOD_SOURCE_PRIORITY_V1[rightProvider] ?? FOOD_SOURCE_ORDER_V1.length)
  );
}

const IdentityMemberSchema = z.strictObject({
  provider: z.enum(FOOD_SOURCE_ORDER_V1),
  sourceRecordId: z.string().trim().min(1).max(128),
  sourceName: z.string().trim().min(1).max(500),
});

const ReviewedIdentityGroupsSchema = z.strictObject({
  format: z.literal('nutrixx.reviewed-food-identity-links'),
  schemaVersion: z.literal(1),
  groups: z.array(
    z.strictObject({
      name: z.string().trim().min(1).max(500),
      members: z.array(IdentityMemberSchema).min(2),
    }),
  ),
});

type IdentityMember = z.infer<typeof IdentityMemberSchema>;

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
  readonly #groupCount: number;

  public constructor(input: unknown) {
    const reviewed = ReviewedIdentityGroupsSchema.parse(input);
    this.#groupCount = reviewed.groups.length;
    const names = new Set<string>();
    reviewed.groups.forEach((group, groupIndex) => {
      const normalized = normalizeName(group.name);
      if (names.has(normalized)) {
        throw new TypeError(`Repeated reviewed food identity: ${group.name}.`);
      }
      names.add(normalized);
      let previousPriority = -1;
      for (const member of group.members) {
        const priority = FOOD_SOURCE_ORDER_V1.indexOf(member.provider);
        const key = memberKey(member.provider, member.sourceRecordId);
        if (
          priority <= previousPriority ||
          normalizeName(member.sourceName) !== normalized ||
          this.#members.has(key)
        ) {
          throw new TypeError(`Invalid reviewed food identity: ${key}.`);
        }
        previousPriority = priority;
        this.#members.set(key, { groupIndex, member });
      }
    });
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

  public assertComplete(): {
    readonly reviewedGroups: number;
    readonly reviewedSourceRecords: number;
  } {
    if (
      this.#observed.size !== this.#members.size ||
      this.#resolved.size !== this.#groupCount
    ) {
      const missing = [...this.#members.keys()].find(
        (key) => !this.#observed.has(key),
      );
      throw new TypeError(`Unresolved reviewed food identity: ${missing}.`);
    }
    return {
      reviewedGroups: this.#groupCount,
      reviewedSourceRecords: this.#observed.size,
    };
  }
}
