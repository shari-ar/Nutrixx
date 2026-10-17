import { resolveFoodComponentV1 } from '@nutrixx/nutrition-engine';
import {
  NextMealCandidateSourceSchema,
  nextMealSourceKey,
  type NextMealCandidateSource,
} from '@nutrixx/optimizer-engine';

import type {
  CustomFoodVersionV1,
  FoodCatalogPayloadV1,
} from '@nutrixx/food-knowledge';
import type { CurrentRecipeV1 } from '@nutrixx/recipe-knowledge';

export interface NextMealCatalogSnapshot {
  readonly manifest: { readonly entryKeys: readonly string[] };
  readonly entries: readonly NextMealCandidateSource[];
}

export interface NextMealCatalogSources {
  readonly activeReleaseId: string | null;
  readonly catalog: FoodCatalogPayloadV1 | null;
  readonly customFoods: readonly CustomFoodVersionV1[];
  readonly recipes: readonly CurrentRecipeV1[];
}

function canonicalProduct(left: string, right: string): string {
  const factors = [left, right].map((value) => {
    const [whole = '0', fraction = ''] = value.split('.');
    return { value: BigInt(`${whole}${fraction}`), places: fraction.length };
  });
  const result = factors[0]!.value * factors[1]!.value;
  const places = factors[0]!.places + factors[1]!.places;
  if (places === 0) return result.toString();
  const padded = result.toString().padStart(places + 1, '0');
  return `${padded.slice(0, -places)}.${padded.slice(-places)}`
    .replace(/0+$/, '')
    .replace(/\.$/, '');
}

function mapCatalogFoods(
  releaseId: string,
  payload: FoodCatalogPayloadV1,
): readonly NextMealCandidateSource[] {
  const portions = new Map<string, FoodCatalogPayloadV1['portions']>();
  const composition = new Map<string, FoodCatalogPayloadV1['composition']>();
  for (const portion of payload.portions) {
    const key = `${portion.foodId}:${portion.foodRevision}`;
    portions.set(key, [...(portions.get(key) ?? []), portion]);
  }
  for (const observation of payload.composition) {
    const key = `${observation.foodId}:${observation.foodRevision}`;
    composition.set(key, [...(composition.get(key) ?? []), observation]);
  }
  const sources = new Map(
    payload.sources.map((source) => [source.sourceId, source]),
  );
  return payload.foods.map((food) => {
    const key = `${food.foodId}:${food.revision}`;
    const source = sources.get(food.sourceId)!;
    const evidence = {
      kind: 'dataset' as const,
      sourceId: food.sourceId,
      sourceVersion: source.sourceRelease,
      sourceRecordId: source.sourceRecordId,
      licenseId: source.licenseId,
    };
    const nutrientFacts = new Map<
      string,
      NextMealCandidateSource['nutrientsPer100EdibleGrams'][number]
    >();
    for (const observation of composition.get(key) ?? []) {
      const value = observation.value;
      if (value.state !== 'known' || value.basis !== 'per-100-gram-edible')
        continue;
      const nutrientId = resolveFoodComponentV1(
        observation.nutrientId,
        value.unit.code,
      );
      if (nutrientId === null) continue;
      const next = {
        state: 'known' as const,
        nutrientId,
        amountPer100EdibleGrams: value.amount,
        unit: value.unit,
        source: evidence,
      };
      const previous = nutrientFacts.get(nutrientId);
      if (
        previous !== undefined &&
        (previous.state === 'unknown' ||
          previous.amountPer100EdibleGrams !== next.amountPer100EdibleGrams ||
          previous.unit.code !== next.unit.code)
      ) {
        nutrientFacts.set(nutrientId, {
          state: 'unknown',
          nutrientId,
          reasonCode: 'ambiguous-composition',
        });
      } else if (previous === undefined) {
        nutrientFacts.set(nutrientId, next);
      }
    }
    const availablePortions = (portions.get(key) ?? [])
      .map((portion) => ({
        portionId: portion.portionId,
        edibleGrams: canonicalProduct(
          portion.gramWeight,
          portion.edibleFraction,
        ),
        source: {
          ...evidence,
          sourceRecordId: portion.portionId,
        },
      }))
      .filter((portion) => portion.edibleGrams !== '0');
    const rawAnimalFood =
      food.preparationStates.some(
        (state) => state === 'raw' || state.startsWith('raw.'),
      ) &&
      /\b(?:egg|eggs|meat|poultry|seafood|fish|shellfish)\b/i.test(
        `${food.foodClass} ${food.categories.map((item) => item.description).join(' ')} ${food.descriptions.map((item) => item.value).join(' ')}`,
      );
    return NextMealCandidateSourceSchema.parse({
      reference: {
        kind: 'food',
        catalogReleaseId: releaseId,
        foodId: food.foodId,
        foodRevision: food.revision,
      },
      displayName:
        food.descriptions.find((item) => item.kind === 'primary')?.value ??
        food.descriptions[0]!.value,
      preparationState: food.preparationStates[0]!,
      edibleResolution: rawAnimalFood ? 'requires-preparation' : 'resolved',
      portions: availablePortions,
      nutrientsPer100EdibleGrams: Array.from(nutrientFacts.values()),
      restrictionEvidence: {
        state: 'unknown',
        reasonCode: 'ingredient-and-allergen-evidence-unavailable',
      },
    });
  });
}

function mapCustomFoods(
  foods: readonly CustomFoodVersionV1[],
): readonly NextMealCandidateSource[] {
  return foods.map((food) =>
    NextMealCandidateSourceSchema.parse({
      reference: {
        kind: 'food',
        catalogReleaseId: 'user-custom-v1',
        foodId: food.foodId,
        foodRevision: food.revision,
      },
      displayName: food.name,
      preparationState: food.preparationState,
      edibleResolution: 'resolved',
      portions: food.portions.map((portion) => ({
        portionId: portion.portionId,
        edibleGrams: portion.gramWeight,
        source: {
          kind: 'user',
          sourceId: food.foodId,
          sourceVersion: String(food.revision),
          sourceRecordId: portion.portionId,
        },
      })),
      nutrientsPer100EdibleGrams: food.composition.map((item) =>
        item.value.state === 'known' &&
        item.value.basis === 'per-100-gram-edible'
          ? {
              state: 'known' as const,
              nutrientId:
                resolveFoodComponentV1(item.nutrientId, item.value.unit.code) ??
                item.nutrientId,
              amountPer100EdibleGrams: item.value.amount,
              unit: item.value.unit,
              source: {
                kind: 'user' as const,
                sourceId: food.foodId,
                sourceVersion: String(food.revision),
              },
            }
          : {
              state: 'unknown' as const,
              nutrientId: item.nutrientId,
              reasonCode: 'composition-basis-unresolved',
            },
      ),
      restrictionEvidence: {
        state: 'unknown',
        reasonCode: 'ingredient-and-allergen-evidence-unavailable',
      },
    }),
  );
}

function mapRecipes(
  recipes: readonly CurrentRecipeV1[],
): readonly NextMealCandidateSource[] {
  return recipes.map(({ version }) => {
    const output = version.outputFood?.nutrition;
    return NextMealCandidateSourceSchema.parse({
      reference: {
        kind: 'recipe',
        recipeId: version.recipeId,
        recipeVersion: version.version,
      },
      displayName: version.names[0]?.value ?? 'Untitled recipe',
      preparationState: 'prepared',
      edibleResolution:
        output === undefined ? 'requires-preparation' : 'resolved',
      portions: [
        {
          portionId: version.recipeId,
          edibleGrams: version.yield.finalEdibleGramWeight,
          source: {
            kind: 'calculation',
            sourceId: version.recipeId,
            sourceVersion: String(version.version),
          },
        },
      ],
      nutrientsPer100EdibleGrams:
        output?.nutrients.map((item) =>
          item.state === 'known'
            ? {
                state: 'known' as const,
                nutrientId: item.nutrientId,
                amountPer100EdibleGrams: item.per100Gram.amount,
                unit: item.per100Gram.unit,
                source: {
                  kind: 'calculation' as const,
                  sourceId: version.recipeId,
                  sourceVersion: String(version.version),
                },
              }
            : {
                state: 'unknown' as const,
                nutrientId: item.nutrientId,
                reasonCode: 'recipe-composition-incomplete',
              },
        ) ?? [],
      restrictionEvidence: {
        state: 'unknown',
        reasonCode: 'complete-allergen-evidence-unavailable',
      },
      recipe: {
        yieldEdibleGrams: version.yield.finalEdibleGramWeight,
        ingredients: version.ingredients.map((ingredient) => ({
          reference: ingredient.reference,
          edibleGramsForYield: ingredient.edibleGramWeight,
          preparationState: 'unspecified',
        })),
      },
    });
  });
}

export function buildNextMealCatalogSnapshot(
  sources: NextMealCatalogSources,
): NextMealCatalogSnapshot {
  if ((sources.catalog === null) !== (sources.activeReleaseId === null)) {
    throw new TypeError('The active release and catalog payload must match.');
  }
  const entries = [
    ...(sources.catalog === null
      ? []
      : mapCatalogFoods(sources.activeReleaseId!, sources.catalog)),
    ...mapCustomFoods(sources.customFoods),
    ...mapRecipes(sources.recipes),
  ];
  const entryKeys = entries
    .map((entry) => nextMealSourceKey(entry.reference))
    .sort();
  if (new Set(entryKeys).size !== entryKeys.length) {
    throw new TypeError(
      'The active catalog contains duplicate source revisions.',
    );
  }
  return { manifest: { entryKeys }, entries };
}

/** Reuses immutable release mapping and only remaps changed local revisions. */
export class IncrementalNextMealCatalog {
  private owner: string | null = null;
  private releaseId: string | null = null;
  private catalogEntries: readonly NextMealCandidateSource[] = [];
  private readonly customEntries = new Map<
    string,
    { readonly fingerprint: string; readonly source: NextMealCandidateSource }
  >();
  private readonly recipeEntries = new Map<
    string,
    { readonly fingerprint: string; readonly source: NextMealCandidateSource }
  >();

  public useOwner(owner: string): void {
    if (this.owner === owner) return;
    this.owner = owner;
    this.releaseId = null;
    this.catalogEntries = [];
    this.customEntries.clear();
    this.recipeEntries.clear();
  }

  public hasRelease(releaseId: string | null): boolean {
    return this.releaseId === releaseId;
  }

  public useMappedRelease(
    releaseId: string,
    entries: readonly NextMealCandidateSource[],
  ): void {
    if (
      entries.some(
        (entry) =>
          entry.reference.kind !== 'food' ||
          entry.reference.catalogReleaseId !== releaseId,
      )
    )
      throw new TypeError('The mapped catalog release is inconsistent.');
    this.releaseId = releaseId;
    this.catalogEntries = entries;
  }

  public mappedReleaseEntries(): readonly NextMealCandidateSource[] {
    return this.catalogEntries;
  }

  public build(sources: NextMealCatalogSources): NextMealCatalogSnapshot {
    if (
      (sources.catalog === null) !== (sources.activeReleaseId === null) &&
      this.releaseId !== sources.activeReleaseId
    ) {
      throw new TypeError('The active release and catalog payload must match.');
    }
    if (this.releaseId !== sources.activeReleaseId) {
      if (sources.activeReleaseId !== null && sources.catalog === null)
        throw new TypeError('The changed catalog release needs its payload.');
      this.catalogEntries =
        sources.catalog === null
          ? []
          : mapCatalogFoods(sources.activeReleaseId!, sources.catalog);
      this.releaseId = sources.activeReleaseId;
    }
    const customKeys = new Set<string>();
    for (const food of sources.customFoods) {
      const key = `${food.foodId}:${food.revision}`;
      const fingerprint = JSON.stringify(food);
      customKeys.add(key);
      if (this.customEntries.get(key)?.fingerprint !== fingerprint)
        this.customEntries.set(key, {
          fingerprint,
          source: mapCustomFoods([food])[0]!,
        });
    }
    for (const key of Array.from(this.customEntries.keys()))
      if (!customKeys.has(key)) this.customEntries.delete(key);
    const recipeKeys = new Set<string>();
    for (const recipe of sources.recipes) {
      const key = `${recipe.version.recipeId}:${recipe.version.version}`;
      const fingerprint = JSON.stringify(recipe.version);
      recipeKeys.add(key);
      if (this.recipeEntries.get(key)?.fingerprint !== fingerprint)
        this.recipeEntries.set(key, {
          fingerprint,
          source: mapRecipes([recipe])[0]!,
        });
    }
    for (const key of Array.from(this.recipeEntries.keys()))
      if (!recipeKeys.has(key)) this.recipeEntries.delete(key);
    const entries = [
      ...this.catalogEntries,
      ...Array.from(this.customEntries.values(), (item) => item.source),
      ...Array.from(this.recipeEntries.values(), (item) => item.source),
    ];
    const entryKeys = entries
      .map((entry) => nextMealSourceKey(entry.reference))
      .sort();
    if (new Set(entryKeys).size !== entryKeys.length)
      throw new TypeError(
        'The active catalog contains duplicate source revisions.',
      );
    return { manifest: { entryKeys }, entries };
  }
}
