import {
  CustomFoodVersionRecordV1Schema,
  type FoodCatalogPayloadV1,
  type FoodCompositionObservationV1,
} from '@nutrixx/food-knowledge';
import {
  IndexedDbReferenceDatasetCache,
  type IndexedDbCanonicalRecordRepository,
} from '@nutrixx/persistence-indexeddb';
import {
  RecipeVersionRecordV1Schema,
  RecipeOutputFoodVersionRecordV1Schema,
  per100GramAmountV1,
  type RecipeIngredientCompositionResolverV1,
  type RecipeIngredientReferenceV1,
  type ResolvedIngredientCompositionV1,
} from '@nutrixx/recipe-knowledge';

import { REFERENCE_CACHE_DATABASE_NAME } from './storage-constants';

function referenceKey(reference: RecipeIngredientReferenceV1): string {
  return reference.kind === 'recipe'
    ? `recipe:${reference.recipeId}:${reference.recipeVersion}`
    : `food:${reference.catalogReleaseId}:${reference.foodId}:${reference.foodRevision}`;
}

type NutrientMap = Map<string, ResolvedIngredientCompositionV1>;

export interface NutritionContextV1 {
  readonly nutrientIds: readonly string[];
  readonly resolver: RecipeIngredientCompositionResolverV1;
}

export async function loadNutritionContextV1(options: {
  readonly references: readonly RecipeIngredientReferenceV1[];
  readonly repository: IndexedDbCanonicalRecordRepository;
  readonly ownerSubjectId: string;
  readonly indexedDB: IDBFactory;
}): Promise<NutritionContextV1> {
  const values = new Map<string, NutrientMap>();
  const available = new Set<string>();
  const nutrientIds = new Set<string>();
  const references = Array.from(
    new Map(
      options.references.map((reference) => [
        referenceKey(reference),
        reference,
      ]),
    ).values(),
  );
  const ownerRecords = await options.repository.listBySubject(
    options.ownerSubjectId,
  );
  const customVersions = new Map<
    string,
    ReturnType<typeof CustomFoodVersionRecordV1Schema.parse>['payload']
  >();
  const recipeVersions = new Map<
    string,
    ReturnType<typeof RecipeVersionRecordV1Schema.parse>['payload']
  >();
  const outputFoods = new Map<
    string,
    ReturnType<typeof RecipeOutputFoodVersionRecordV1Schema.parse>['payload']
  >();
  for (const record of ownerRecords) {
    if (record.recordType === 'food.custom-version') {
      const food = CustomFoodVersionRecordV1Schema.parse(record).payload;
      customVersions.set(`${food.foodId}:${food.revision}`, food);
    } else if (record.recordType === 'recipe.version') {
      const recipe = RecipeVersionRecordV1Schema.parse(record).payload;
      recipeVersions.set(`${recipe.recipeId}:${recipe.version}`, recipe);
    } else if (record.recordType === 'food.recipe-output-version') {
      const food = RecipeOutputFoodVersionRecordV1Schema.parse(record).payload;
      outputFoods.set(`${food.foodId}:${food.revision}`, food);
    }
  }

  for (const reference of references) {
    const key = referenceKey(reference);
    if (
      reference.kind === 'food' &&
      reference.catalogReleaseId === 'user-custom-v1'
    ) {
      const custom = customVersions.get(
        `${reference.foodId}:${reference.foodRevision}`,
      );
      if (!custom) continue;
      available.add(key);
      const nutrients: NutrientMap = new Map();
      for (const component of custom.composition) {
        nutrientIds.add(component.nutrientId);
        const portion = custom.portions[0];
        nutrients.set(
          component.nutrientId,
          component.value.state === 'known' &&
            component.value.basis === 'per-serving' &&
            portion !== undefined
            ? {
                state: 'known',
                amountPer100Gram: per100GramAmountV1(
                  component.value.amount,
                  portion.gramWeight,
                ),
                unit: component.value.unit,
              }
            : { state: 'unknown', reason: 'not-resolvable' },
        );
      }
      values.set(key, nutrients);
      continue;
    }
    if (reference.kind === 'recipe') {
      const recipe = recipeVersions.get(
        `${reference.recipeId}:${reference.recipeVersion}`,
      );
      const nutrition = recipe?.outputFood?.nutrition;
      if (!nutrition) continue;
      available.add(key);
      const nutrients: NutrientMap = new Map();
      for (const component of nutrition.nutrients) {
        nutrientIds.add(component.nutrientId);
        nutrients.set(
          component.nutrientId,
          component.state === 'known'
            ? {
                state: 'known',
                amountPer100Gram: component.per100Gram.amount,
                unit: component.per100Gram.unit,
              }
            : { state: 'unknown', reason: 'not-resolvable' },
        );
      }
      values.set(key, nutrients);
      continue;
    }
    if (
      reference.kind === 'food' &&
      reference.catalogReleaseId === 'user-recipe-v1'
    ) {
      const food = outputFoods.get(
        `${reference.foodId}:${reference.foodRevision}`,
      );
      if (!food) continue;
      available.add(key);
      const nutrients: NutrientMap = new Map();
      for (const component of food.catalog.composition) {
        nutrientIds.add(component.nutrientId);
        nutrients.set(
          component.nutrientId,
          component.value.state === 'known' &&
            component.value.basis === 'per-100-gram-edible'
            ? {
                state: 'known',
                amountPer100Gram: component.value.amount,
                unit: component.value.unit,
              }
            : { state: 'unknown', reason: 'not-resolvable' },
        );
      }
      values.set(key, nutrients);
    }
  }

  const catalogReferences = references.filter(
    (
      reference,
    ): reference is Extract<RecipeIngredientReferenceV1, { kind: 'food' }> =>
      reference.kind === 'food' &&
      reference.catalogReleaseId !== 'user-custom-v1' &&
      reference.catalogReleaseId !== 'user-recipe-v1',
  );
  if (catalogReferences.length > 0) {
    const cache = await IndexedDbReferenceDatasetCache.create({
      databaseName: REFERENCE_CACHE_DATABASE_NAME,
      indexedDB: options.indexedDB,
    });
    try {
      const releases = new Set(
        catalogReferences.map((reference) => reference.catalogReleaseId),
      );
      for (const releaseId of Array.from(releases)) {
        const release = await cache.getRelease(releaseId);
        if (!release) continue;
        const payload = release.payload as FoodCatalogPayloadV1;
        const selected = catalogReferences.filter(
          (reference) => reference.catalogReleaseId === releaseId,
        );
        const foodKeys = new Set(
          selected.map(
            (reference) => `${reference.foodId}:${reference.foodRevision}`,
          ),
        );
        const observations = new Map<string, FoodCompositionObservationV1[]>();
        for (const observation of payload.composition) {
          const foodKey = `${observation.foodId}:${observation.foodRevision}`;
          if (!foodKeys.has(foodKey)) continue;
          const key = `${foodKey}:${observation.nutrientId}`;
          observations.set(key, [
            ...(observations.get(key) ?? []),
            observation,
          ]);
          nutrientIds.add(observation.nutrientId);
        }
        for (const reference of selected) {
          const key = referenceKey(reference);
          available.add(key);
          const nutrients: NutrientMap = new Map();
          const prefix = `${reference.foodId}:${reference.foodRevision}:`;
          for (const [observationKey, matches] of Array.from(observations)) {
            if (!observationKey.startsWith(prefix)) continue;
            const nutrientId = observationKey.slice(prefix.length);
            const match = matches[0];
            nutrients.set(
              nutrientId,
              matches.length === 1 &&
                match?.value.state === 'known' &&
                match.value.basis === 'per-100-gram-edible'
                ? {
                    state: 'known',
                    amountPer100Gram: match.value.amount,
                    unit: match.value.unit,
                  }
                : { state: 'unknown', reason: 'not-resolvable' },
            );
          }
          values.set(key, nutrients);
        }
      }
    } finally {
      await cache.close();
    }
  }

  return {
    nutrientIds: Array.from(nutrientIds).sort(),
    resolver: {
      resolve(reference, nutrientId) {
        const key = referenceKey(reference);
        return (
          values.get(key)?.get(nutrientId) ?? {
            state: 'unknown',
            reason: available.has(key) ? 'not-provided' : 'not-resolvable',
          }
        );
      },
    },
  };
}
