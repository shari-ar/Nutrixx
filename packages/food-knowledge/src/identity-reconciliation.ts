import type {
  FoodCatalogPayloadV1,
  FoodCompositionObservationV1,
  FoodPortionV1,
  FoodV1,
} from './model.js';
import {
  NUTRIXX_FALLBACK_PROVIDER_V1,
  createFoodSourcePriorityV1,
} from './identity.js';

export interface ExactFoodIdentityLinkV1 {
  readonly canonicalFoodId: string;
  readonly canonicalFoodRevision: number;
  readonly canonicalName: string;
  readonly mergedFoodIds: readonly string[];
  readonly sourceRecordIds: readonly string[];
}

export interface ReconciledFoodIdentitiesV1 {
  readonly payload: FoodCatalogPayloadV1;
  readonly exactLinks: readonly ExactFoodIdentityLinkV1[];
}

export interface ReconcileExactFoodIdentitiesOptionsV1 {
  readonly sourceOrder: readonly string[];
  readonly canonicalFoodId: (identitySignature: string) => string;
}

function normalizeIdentityText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}

function primaryName(food: FoodV1): string {
  const description =
    food.descriptions.find((description) => description.kind === 'primary') ??
    food.descriptions[0];
  if (!description) throw new TypeError('Food description is required.');
  return description.value;
}

function foodKey(foodId: string, revision: number): string {
  return `${foodId}:${revision}`;
}

export function reconcileExactFoodIdentitiesV1(
  payloadInput: FoodCatalogPayloadV1,
  options: ReconcileExactFoodIdentitiesOptionsV1,
): ReconciledFoodIdentitiesV1 {
  const payload = structuredClone(payloadInput);
  const { sourceOrder, canonicalFoodId } = options;
  const providerPriority = createFoodSourcePriorityV1(sourceOrder);
  const sourceIndex = new Map(
    payload.sources.map((source, index) => [source.sourceId, index]),
  );
  const sourceById = new Map(
    payload.sources.map((source) => [source.sourceId, source]),
  );
  const sourceRank = (sourceId: string): readonly [number, number] => {
    const source = sourceById.get(sourceId);
    const provider = source?.provider ?? '';
    return [
      provider === NUTRIXX_FALLBACK_PROVIDER_V1
        ? Number.MAX_SAFE_INTEGER
        : (providerPriority.get(provider) ?? sourceOrder.length),
      sourceIndex.get(sourceId) ?? Number.MAX_SAFE_INTEGER,
    ];
  };
  const compareSources = (left: string, right: string): number => {
    const leftRank = sourceRank(left);
    const rightRank = sourceRank(right);
    return leftRank[0] - rightRank[0] || leftRank[1] - rightRank[1];
  };
  const groups = new Map<string, FoodV1[]>();
  for (const food of payload.foods) {
    const key = normalizeIdentityText(primaryName(food));
    const group = groups.get(key) ?? [];
    group.push(food);
    groups.set(key, group);
  }
  const redirect = new Map<
    string,
    { readonly foodId: string; readonly revision: number }
  >();
  const removed = new Set<string>();
  const exactLinks: ExactFoodIdentityLinkV1[] = [];
  for (const [identitySignature, group] of groups) {
    const ordered = [...group].sort(
      (left, right) =>
        compareSources(left.sourceId, right.sourceId) ||
        left.foodId.localeCompare(right.foodId, 'en'),
    );
    const canonical = ordered[0];
    if (!canonical) continue;
    const originalCanonicalFoodId = canonical.foodId;
    const stableFoodId = canonicalFoodId(identitySignature);
    for (const food of ordered)
      redirect.set(foodKey(food.foodId, food.revision), {
        foodId: stableFoodId,
        revision: 1,
      });
    canonical.foodId = stableFoodId;
    canonical.revision = 1;
    const merged = ordered.slice(1);
    const links = new Map(
      (canonical.sourceIdentityLinks ?? []).map((link) => [
        link.sourceId,
        link,
      ]),
    );
    const descriptionKeys = new Set(
      canonical.descriptions.map((description) =>
        normalizeIdentityText(description.value),
      ),
    );
    const categoryKeys = new Set(
      canonical.categories.map(
        (category) =>
          `${category.locale}:${normalizeIdentityText(category.description)}`,
      ),
    );
    for (const food of merged) {
      const key = foodKey(food.foodId, food.revision);
      removed.add(key);
      for (const sourceId of [
        food.sourceId,
        ...(food.sourceIdentityLinks ?? []).map((link) => link.sourceId),
      ]) {
        if (sourceId !== canonical.sourceId && !links.has(sourceId))
          links.set(sourceId, {
            sourceId,
            matchBasis: 'exact-identity-signature',
          });
      }
      for (const description of food.descriptions) {
        const descriptionKey = normalizeIdentityText(description.value);
        if (descriptionKeys.has(descriptionKey)) continue;
        canonical.descriptions.push({ ...description, kind: 'alias' });
        descriptionKeys.add(descriptionKey);
      }
      for (const category of food.categories) {
        const categoryKey = `${category.locale}:${normalizeIdentityText(category.description)}`;
        if (categoryKeys.has(categoryKey)) continue;
        canonical.categories.push(category);
        categoryKeys.add(categoryKey);
      }
      canonical.preparationStates = [
        ...new Set([...canonical.preparationStates, ...food.preparationStates]),
      ];
      if (
        canonical.approximatePriceUsdPer100g === undefined &&
        food.approximatePriceUsdPer100g !== undefined
      )
        canonical.approximatePriceUsdPer100g = food.approximatePriceUsdPer100g;
    }
    canonical.sourceIdentityLinks = [...links.values()].sort((left, right) =>
      compareSources(left.sourceId, right.sourceId),
    );
    if (group.length > 1)
      exactLinks.push({
        canonicalFoodId: canonical.foodId,
        canonicalFoodRevision: canonical.revision,
        canonicalName: primaryName(canonical),
        mergedFoodIds: [
          originalCanonicalFoodId,
          ...merged.map((food) => food.foodId),
        ],
        sourceRecordIds: ordered
          .map((food) => sourceById.get(food.sourceId)?.sourceRecordId)
          .filter((value): value is string => value !== undefined),
      });
  }
  payload.foods = payload.foods.filter(
    (food) => !removed.has(foodKey(food.foodId, food.revision)),
  );
  const redirectFood = <T extends FoodPortionV1 | FoodCompositionObservationV1>(
    value: T,
  ): T => {
    const target = redirect.get(foodKey(value.foodId, value.foodRevision));
    return target
      ? { ...value, foodId: target.foodId, foodRevision: target.revision }
      : value;
  };
  const portions = payload.portions
    .map(redirectFood)
    .sort((left, right) => compareSources(left.sourceId, right.sourceId));
  const portionKeys = new Set<string>();
  payload.portions = portions.filter((portion) => {
    const key = [
      portion.foodId,
      portion.foodRevision,
      normalizeIdentityText(portion.description.value),
      portion.amount,
      portion.measureUnit.code,
      portion.gramWeight,
      portion.edibleFraction,
    ].join(':');
    if (portionKeys.has(key)) return false;
    portionKeys.add(key);
    return true;
  });
  const observations = payload.composition
    .map(redirectFood)
    .sort((left, right) => {
      const knownOrder =
        Number(right.value.state === 'known') -
        Number(left.value.state === 'known');
      return knownOrder || compareSources(left.sourceId, right.sourceId);
    });
  const observationKeys = new Set<string>();
  payload.composition = observations.filter((observation) => {
    const key = [
      observation.foodId,
      observation.foodRevision,
      observation.nutrientId,
      observation.preparationState,
    ].join(':');
    if (observationKeys.has(key)) return false;
    observationKeys.add(key);
    return true;
  });
  return { payload, exactLinks };
}
