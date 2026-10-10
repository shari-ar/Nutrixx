import { canonicalizeJson, type JsonValue } from '@nutrixx/canonical-schema';
import type {
  CanonicalPayloadHasher,
  ReferenceDatasetCache,
  ReferenceReleaseInputV1,
} from '@nutrixx/persistence';

import {
  FoodCatalogManifestV1Schema,
  FoodCatalogPayloadV1Schema,
  type FoodCatalogManifestV1,
  type FoodCatalogPayloadV1,
  type FoodCompositionObservationV1,
  type FoodPortionV1,
  type FoodV1,
} from './model.js';

export interface CreateFoodCatalogReleaseV1Options {
  readonly manifest: FoodCatalogManifestV1;
  readonly payload: FoodCatalogPayloadV1;
  readonly hash: CanonicalPayloadHasher;
}

export interface FoodSearchResultV1 {
  readonly food: FoodV1;
  readonly matchedDescription: FoodV1['descriptions'][number];
  readonly match: 'exact' | 'prefix' | 'contains' | 'category';
}

export interface FoodCatalogReleaseRepositoryV1 {
  loadActiveCatalog(): Promise<FoodCatalogIndexV1>;
}

function ratio(numerator: number, denominator: number): string {
  if (denominator === 0) return '0';
  const value = numerator / denominator;
  if (value === 1) return '1';
  return value.toFixed(6).replace(/0+$/u, '').replace(/\.$/u, '');
}

export function deriveFoodCatalogManifestV1(
  input: Omit<FoodCatalogManifestV1, 'counts' | 'coverage'>,
  payloadInput: FoodCatalogPayloadV1,
): FoodCatalogManifestV1 {
  const payload = FoodCatalogPayloadV1Schema.parse(payloadInput);
  const foodKeys = new Set(
    payload.foods.map(({ foodId, revision }) => `${foodId}:${revision}`),
  );
  const portionFoodKeys = new Set(
    payload.portions.map(
      ({ foodId, foodRevision }) => `${foodId}:${foodRevision}`,
    ),
  );
  const compositionFoodKeys = new Set(
    payload.composition.map(
      ({ foodId, foodRevision }) => `${foodId}:${foodRevision}`,
    ),
  );
  const knownObservations = payload.composition.filter(
    ({ value }) => value.state === 'known',
  ).length;

  return FoodCatalogManifestV1Schema.parse({
    ...input,
    counts: {
      sources: payload.sources.length,
      foods: payload.foods.length,
      portions: payload.portions.length,
      compositionObservations: payload.composition.length,
    },
    coverage: {
      foodsWithPortions: ratio(portionFoodKeys.size, foodKeys.size),
      foodsWithComposition: ratio(compositionFoodKeys.size, foodKeys.size),
      observationsWithKnownValues: ratio(
        knownObservations,
        payload.composition.length,
      ),
    },
  });
}

export async function createFoodCatalogReleaseV1(
  options: CreateFoodCatalogReleaseV1Options,
): Promise<ReferenceReleaseInputV1> {
  const manifest = FoodCatalogManifestV1Schema.parse(options.manifest);
  const payload = FoodCatalogPayloadV1Schema.parse(options.payload);
  if (
    manifest.counts.sources !== payload.sources.length ||
    manifest.counts.foods !== payload.foods.length ||
    manifest.counts.portions !== payload.portions.length ||
    manifest.counts.compositionObservations !== payload.composition.length
  ) {
    throw new TypeError('The catalog manifest and payload counts must match.');
  }
  const manifestJson = manifest as unknown as JsonValue;
  const payloadJson = payload as unknown as JsonValue;
  const payloadText = canonicalizeJson(payloadJson);
  return {
    format: 'nutrixx.reference-release',
    referenceSchemaVersion: 1,
    releaseId: manifest.releaseId,
    publishedAt: manifest.publishedAt,
    byteLength: new TextEncoder().encode(payloadText).byteLength,
    manifest: manifestJson,
    manifestSha256: await options.hash(canonicalizeJson(manifestJson)),
    payload: payloadJson,
    payloadSha256: await options.hash(payloadText),
  };
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Mark}+/gu, '')
    .trim()
    .toLocaleLowerCase('und');
}

export class FoodCatalogIndexV1 {
  readonly #payload: FoodCatalogPayloadV1;

  public constructor(input: unknown) {
    this.#payload = FoodCatalogPayloadV1Schema.parse(input);
  }

  public get payload(): FoodCatalogPayloadV1 {
    return structuredClone(this.#payload);
  }

  public getFood(foodId: string, revision?: number): FoodV1 | null {
    const matches = this.#payload.foods.filter(
      (food) =>
        food.foodId === foodId &&
        (revision === undefined || food.revision === revision),
    );
    const food = matches.sort(
      (left, right) => right.revision - left.revision,
    )[0];
    return food === undefined ? null : structuredClone(food);
  }

  public listPortions(
    foodId: string,
    revision: number,
  ): readonly FoodPortionV1[] {
    return structuredClone(
      this.#payload.portions.filter(
        (portion) =>
          portion.foodId === foodId && portion.foodRevision === revision,
      ),
    );
  }

  public listComposition(
    foodId: string,
    revision: number,
  ): readonly FoodCompositionObservationV1[] {
    return structuredClone(
      this.#payload.composition.filter(
        (observation) =>
          observation.foodId === foodId &&
          observation.foodRevision === revision,
      ),
    );
  }

  public search(
    query: string,
    options: { readonly locale?: string; readonly limit?: number } = {},
  ): readonly FoodSearchResultV1[] {
    const normalizedQuery = normalizeSearchText(query);
    if (normalizedQuery.length === 0) return [];
    const limit = options.limit ?? 20;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new RangeError('The food search limit must be between 1 and 100.');
    }
    const locale =
      options.locale === undefined
        ? undefined
        : Intl.getCanonicalLocales(options.locale)[0];
    const matches: Array<FoodSearchResultV1 & { score: number }> = [];

    for (const food of this.#payload.foods) {
      for (const description of food.descriptions) {
        const value = normalizeSearchText(description.value);
        const kind =
          value === normalizedQuery
            ? 'exact'
            : value.startsWith(normalizedQuery)
              ? 'prefix'
              : value.includes(normalizedQuery)
                ? 'contains'
                : null;
        if (kind === null) continue;
        const localePenalty =
          locale === undefined || description.locale === locale ? 0 : 10;
        const kindScore = kind === 'exact' ? 0 : kind === 'prefix' ? 1 : 2;
        const primaryPenalty = description.kind === 'primary' ? 0 : 1;
        matches.push({
          food,
          matchedDescription: description,
          match: kind,
          score: localePenalty + kindScore + primaryPenalty,
        });
      }
      if (
        food.categories.some((category) =>
          normalizeSearchText(category.description).includes(normalizedQuery),
        )
      ) {
        const description =
          food.descriptions.find(
            (value) =>
              value.kind === 'primary' &&
              (locale === undefined || value.locale === locale),
          ) ?? food.descriptions[0];
        if (description) {
          matches.push({
            food,
            matchedDescription: description,
            match: 'category',
            score: 20,
          });
        }
      }
    }

    const selected = new Map<string, (typeof matches)[number]>();
    for (const match of matches.sort(
      (left, right) =>
        left.score - right.score ||
        left.matchedDescription.value.localeCompare(
          right.matchedDescription.value,
          'en',
        ),
    )) {
      const key = `${match.food.foodId}:${match.food.revision}`;
      if (!selected.has(key)) selected.set(key, match);
    }
    return [...selected.values()]
      .slice(0, limit)
      .map(({ score: _score, ...result }) => structuredClone(result));
  }
}

export class CachedFoodKnowledgeRepositoryV1
  implements FoodCatalogReleaseRepositoryV1
{
  public constructor(private readonly cache: ReferenceDatasetCache) {}

  public async loadActiveCatalog(): Promise<FoodCatalogIndexV1> {
    const active = (await this.cache.listReleases()).find(
      (release) => release.active,
    );
    if (active === undefined) {
      throw new Error('An active food catalog release is required.');
    }
    const release = await this.cache.getRelease(active.releaseId);
    if (release === null) {
      throw new Error('The active food catalog release is unavailable.');
    }
    const manifest = FoodCatalogManifestV1Schema.parse(release.manifest);
    if (manifest.releaseId !== release.releaseId) {
      throw new Error('The active food catalog manifest identity is invalid.');
    }
    return new FoodCatalogIndexV1(release.payload);
  }
}
