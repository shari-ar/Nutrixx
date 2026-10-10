import { verifyCanonicalRecordV1 } from '@nutrixx/canonical-schema';
import {
  ConsumptionLedgerV1,
  MealHeadRecordV1Schema,
  type MealRevisionV1,
} from '@nutrixx/consumption';
import {
  CachedFoodKnowledgeRepositoryV1,
  CustomFoodLedgerV1,
  createFoodCatalogReleaseV1,
  type CustomFoodVersionV1,
  type FoodCatalogPayloadV1,
} from '@nutrixx/food-knowledge';
import {
  IndexedDbCanonicalRecordRepository,
  IndexedDbReferenceDatasetCache,
  sha256Canonical,
} from '@nutrixx/persistence-indexeddb';
import {
  calculateIngredientNutritionV1,
  calculateRecipeNutritionV1,
  RecipeHeadRecordV1Schema,
  RecipeLedgerV1,
  RecipeNutritionCalculationV1Schema,
  RecipeOutputFoodVersionRecordV1Schema,
  type CurrentRecipeV1,
  type RecipeVersionV1,
} from '@nutrixx/recipe-knowledge';

import { BrowserOnboardingStore } from './browser-onboarding';
import { exampleUsdPricePer100g } from './food-price-examples';
import { loadNutritionContextV1 } from './nutrition-context';
import {
  LOCAL_USER_DATABASE_NAME,
  REFERENCE_CACHE_DATABASE_NAME,
} from './storage-constants';
import { usdaFoodGroupFromCategory } from './usda-food-group';

export interface StageTwoDependencies {
  readonly indexedDB: IDBFactory;
  readonly keyRange: typeof IDBKeyRange;
  readonly createId: () => string;
  readonly now: () => string;
  readonly timeZone: () => string;
  readonly onboarding: Pick<BrowserOnboardingStore, 'load'>;
}

export interface FoodChoice {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly reference:
    | {
        readonly kind: 'food';
        readonly catalogReleaseId: string;
        readonly foodId: string;
        readonly foodRevision: number;
      }
    | {
        readonly kind: 'recipe';
        readonly recipeId: string;
        readonly recipeVersion: number;
      };
  readonly defaultGramWeight: string;
  readonly approximatePriceUsdPer100g?: string;
  readonly preparationState: string;
  readonly usdaFoodGroup?: string;
  readonly sourceNdbNumber?: string;
  readonly provenance: string;
  readonly completeness: string;
  readonly categories?: readonly string[];
  readonly portions?: readonly { label: string; gramWeight: string }[];
  readonly nutrients?: readonly {
    id?: string;
    nutrientId: string;
    sourceNutrientNumber?: string;
    value: string;
  }[];
}

export interface SaveCustomFoodInput {
  readonly foodId?: string;
  readonly name: string;
  readonly approximatePriceUsdPer100g?: string;
  readonly preparationState: string;
  readonly portionLabel: string;
  readonly gramWeight: string;
  readonly categories?: readonly string[];
  readonly portions?: readonly { label: string; gramWeight: string }[];
  readonly nutrients: readonly {
    nutrientId: string;
    amount?: string;
    unit?: string;
  }[];
}

export interface SaveRecipeInput {
  readonly recipeId?: string;
  readonly name: string;
  readonly servings: string;
  readonly finalEdibleGramWeight: string;
  readonly weightDetermination?: 'measured' | 'usda-estimated';
  readonly ingredients: readonly {
    choice: FoodChoice;
    gramWeight: string;
    retentionFactors?: readonly {
      nutrientId: string;
      factor: string;
      rule?: { component: string; version: string };
    }[];
    usdaTreatmentCode?: string;
    usdaYieldRowId?: string;
    cookingYieldFactor?: string;
    cookingYieldRule?: { component: string; version: string };
  }[];
  readonly steps: readonly {
    instruction: string;
    ingredientIndexes: readonly number[];
  }[];
}

export interface SaveMealInput {
  readonly mealId?: string;
  readonly mealType: MealRevisionV1['mealType'];
  readonly occurredAt: string;
  readonly note?: string;
  readonly items: readonly {
    choice: FoodChoice;
    gramWeight: string;
  }[];
}

function defaults(): StageTwoDependencies {
  return {
    indexedDB,
    keyRange: IDBKeyRange,
    createId: () => crypto.randomUUID(),
    now: () => new Date().toISOString(),
    timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    onboarding: new BrowserOnboardingStore(),
  };
}

function localDate(instant: string, timeZone: string): string {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  return `${values['year']}-${values['month']}-${values['day']}`;
}

async function readArtifact(file: File): Promise<Record<string, unknown>> {
  const gzip = file.name.toLocaleLowerCase('en').endsWith('.gz');
  const stream = gzip
    ? file.stream().pipeThrough(new DecompressionStream('gzip'))
    : file.stream();
  const value: unknown = JSON.parse(await new Response(stream).text());
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('The catalog artifact must be a JSON object.');
  }
  return value as Record<string, unknown>;
}

export class BrowserStageTwoStore {
  private readonly dependencies: StageTwoDependencies;

  public constructor(dependencies: StageTwoDependencies = defaults()) {
    this.dependencies = dependencies;
  }

  private async ownerSubjectId(): Promise<string> {
    const profile = await this.dependencies.onboarding.load();
    if (profile === null) throw new Error('A starting profile is required.');
    return profile.ownerSubjectId;
  }

  private async withRepository<T>(
    operation: (
      repository: IndexedDbCanonicalRecordRepository,
      ownerSubjectId: string,
    ) => Promise<T>,
  ): Promise<T> {
    const ownerSubjectId = await this.ownerSubjectId();
    const repository = await IndexedDbCanonicalRecordRepository.create({
      databaseName: LOCAL_USER_DATABASE_NAME,
      indexedDB: this.dependencies.indexedDB,
      keyRange: this.dependencies.keyRange,
      verifyRecord: (record) =>
        verifyCanonicalRecordV1(record, sha256Canonical),
    });
    try {
      return await operation(repository, ownerSubjectId);
    } finally {
      await repository.close();
    }
  }

  public async installCatalog(file: File): Promise<string> {
    const artifact = await readArtifact(file);
    const verified = await createFoodCatalogReleaseV1({
      manifest: artifact['manifest'] as never,
      payload: artifact['payload'] as FoodCatalogPayloadV1,
      hash: sha256Canonical,
    });
    for (const field of [
      'releaseId',
      'publishedAt',
      'byteLength',
      'manifestSha256',
      'payloadSha256',
    ] as const) {
      if (artifact[field] !== verified[field]) {
        throw new TypeError(`Catalog ${field} integrity check failed.`);
      }
    }
    const cache = await IndexedDbReferenceDatasetCache.create({
      databaseName: REFERENCE_CACHE_DATABASE_NAME,
      indexedDB: this.dependencies.indexedDB,
    });
    try {
      await cache.putRelease(verified);
      await cache.activateRelease(verified.releaseId);
      return verified.releaseId;
    } finally {
      await cache.close();
    }
  }

  public async activeCatalogRelease(): Promise<string | null> {
    const cache = await IndexedDbReferenceDatasetCache.create({
      databaseName: REFERENCE_CACHE_DATABASE_NAME,
      indexedDB: this.dependencies.indexedDB,
    });
    try {
      return (
        (await cache.listReleases()).find((release) => release.active)
          ?.releaseId ?? null
      );
    } finally {
      await cache.close();
    }
  }

  public async searchFoods(
    query: string,
    includeLegacyRecipes = false,
  ): Promise<readonly FoodChoice[]> {
    const custom = await this.withRepository(async (repository, owner) =>
      new CustomFoodLedgerV1({
        repository,
        digestSha256Hex: sha256Canonical,
      }).listCurrent(owner),
    );
    const normalized = query.trim().toLocaleLowerCase('und');
    const customChoices = custom
      .filter(
        (food) =>
          food.name.toLocaleLowerCase('und').includes(normalized) ||
          (food.categories ?? []).some((category) =>
            category.toLocaleLowerCase('und').includes(normalized),
          ),
      )
      .map((food) => this.customFoodChoice(food));
    const recipeChoices = (await this.recipeChoices()).filter(
      (choice) =>
        (choice.reference.kind === 'food' || includeLegacyRecipes) &&
        (choice.name.toLocaleLowerCase('und').includes(normalized) ||
          (choice.categories ?? []).some((category) =>
            category.toLocaleLowerCase('und').includes(normalized),
          )),
    );
    if (normalized.length === 0) return [...customChoices, ...recipeChoices];

    const cache = await IndexedDbReferenceDatasetCache.create({
      databaseName: REFERENCE_CACHE_DATABASE_NAME,
      indexedDB: this.dependencies.indexedDB,
    });
    try {
      const release = (await cache.listReleases()).find((item) => item.active);
      if (release === undefined) return [...customChoices, ...recipeChoices];
      const catalog = await new CachedFoodKnowledgeRepositoryV1(
        cache,
      ).loadActiveCatalog();
      const ndbCrosswalk = (await import('./usda-ndb-crosswalk.json')).default
        .fdcToNdb as Record<string, string>;
      const catalogChoices = catalog
        .search(query, { locale: 'en', limit: 30 })
        .map(({ food, matchedDescription }) => {
          const portion = catalog.listPortions(food.foodId, food.revision)[0];
          const composition = catalog.listComposition(
            food.foodId,
            food.revision,
          );
          const known = composition.filter(
            (observation) => observation.value.state === 'known',
          ).length;
          const source = catalog.payload.sources.find(
            (candidate) => candidate.sourceId === food.sourceId,
          );
          const usdaFoodGroup = food.foodClass.startsWith('usda.sr-legacy')
            ? usdaFoodGroupFromCategory(food.categories[0]?.description ?? '')
            : undefined;
          const sourceNdbNumber =
            source?.dataset === 'sr-legacy'
              ? ndbCrosswalk[source.sourceRecordId]
              : undefined;
          const approximatePriceUsdPer100g =
            food.approximatePriceUsdPer100g ??
            exampleUsdPricePer100g(release.releaseId, food.foodId);
          return {
            key: `food:${release.releaseId}:${food.foodId}:${food.revision}`,
            name: matchedDescription.value,
            description: portion?.description.value ?? '100 g edible portion',
            reference: {
              kind: 'food' as const,
              catalogReleaseId: release.releaseId,
              foodId: food.foodId,
              foodRevision: food.revision,
            },
            defaultGramWeight: portion?.gramWeight ?? '100',
            ...(approximatePriceUsdPer100g === undefined
              ? {}
              : { approximatePriceUsdPer100g }),
            preparationState: food.preparationStates[0] ?? 'unspecified',
            ...(usdaFoodGroup ? { usdaFoodGroup } : {}),
            ...(sourceNdbNumber ? { sourceNdbNumber } : {}),
            provenance: source
              ? `${source.provider} · ${source.dataset} · ${source.sourceRelease}`
              : 'Published catalog source',
            completeness: `${known} known · ${composition.length - known} explicitly unknown`,
            categories: food.categories.map((category) => category.description),
            portions: catalog
              .listPortions(food.foodId, food.revision)
              .map((value) => ({
                label: value.description.value,
                gramWeight: value.gramWeight,
              })),
            nutrients: composition.map((observation) => ({
              id: observation.observationId,
              nutrientId: observation.nutrientId,
              ...(observation.sourceNutrientNumber
                ? { sourceNutrientNumber: observation.sourceNutrientNumber }
                : {}),
              value:
                observation.value.state === 'known'
                  ? `${observation.value.amount} ${observation.value.unit.code} / 100 g`
                  : `Unknown (${observation.value.reason})`,
            })),
          };
        });
      return [...customChoices, ...recipeChoices, ...catalogChoices];
    } finally {
      await cache.close();
    }
  }

  private customFoodChoice(food: CustomFoodVersionV1): FoodChoice {
    const portion = food.portions[0]!;
    return {
      key: `food:user-custom:${food.foodId}:${food.revision}`,
      name: food.name,
      description: `${portion.label} · ${portion.gramWeight} g`,
      reference: {
        kind: 'food',
        catalogReleaseId: 'user-custom-v1',
        foodId: food.foodId,
        foodRevision: food.revision,
      },
      defaultGramWeight: portion.gramWeight,
      ...(food.approximatePriceUsdPer100g
        ? { approximatePriceUsdPer100g: food.approximatePriceUsdPer100g }
        : {}),
      preparationState: food.preparationState,
      provenance: 'User-entered label or custom food',
      completeness: `${food.composition.filter(({ value }) => value.state === 'known').length} known · ${food.composition.filter(({ value }) => value.state === 'unknown').length} explicitly unknown`,
      categories: food.categories ?? [],
      portions: food.portions.map((value) => ({
        label: value.label,
        gramWeight: value.gramWeight,
      })),
      nutrients: food.composition.map((component) => ({
        nutrientId: component.nutrientId,
        value:
          component.value.state === 'known'
            ? `${component.value.amount} ${component.value.unit.code} / ${portion.label}`
            : `Unknown (${component.value.reason})`,
      })),
    };
  }

  public async listCustomFoods(): Promise<readonly CustomFoodVersionV1[]> {
    return this.withRepository((repository, owner) =>
      new CustomFoodLedgerV1({
        repository,
        digestSha256Hex: sha256Canonical,
      }).listCurrent(owner),
    );
  }

  public async saveCustomFood(input: SaveCustomFoodInput): Promise<string> {
    return this.withRepository(async (repository, owner) => {
      const ledger = new CustomFoodLedgerV1({
        repository,
        digestSha256Hex: sha256Canonical,
      });
      const current = await ledger.listCurrent(owner);
      const existing = current.find((food) => food.foodId === input.foodId);
      const foodId =
        existing?.foodId ?? input.foodId ?? this.dependencies.createId();
      const publishedAt = this.dependencies.now();
      const headInput = await repository.getById(foodId);
      const previousRecordId =
        headInput === null
          ? undefined
          : (headInput.payload as { activeVersionRecordId: string })
              .activeVersionRecordId;
      await ledger.save({
        commandId: `custom-food:${this.dependencies.createId()}`,
        versionRecordId: this.dependencies.createId(),
        ...(previousRecordId === undefined
          ? {}
          : { expectedPreviousVersionRecordId: previousRecordId }),
        food: {
          foodId,
          ownerSubjectId: owner,
          revision: (existing?.revision ?? 0) + 1,
          name: input.name,
          ...(input.approximatePriceUsdPer100g === undefined
            ? {}
            : { approximatePriceUsdPer100g: input.approximatePriceUsdPer100g }),
          preparationState: input.preparationState,
          categories: [...(input.categories ?? [])],
          portions: [
            { label: input.portionLabel, gramWeight: input.gramWeight },
            ...(input.portions ?? []),
          ].map((portion) => ({
            portionId: this.dependencies.createId(),
            ...portion,
          })),
          composition: input.nutrients.map((nutrient) => ({
            nutrientId: nutrient.nutrientId,
            value:
              nutrient.amount?.trim() && nutrient.unit?.trim()
                ? {
                    state: 'known' as const,
                    amount: nutrient.amount,
                    unit: { system: 'ucum' as const, code: nutrient.unit },
                    basis: 'per-serving' as const,
                  }
                : {
                    state: 'unknown' as const,
                    reason: 'not-provided' as const,
                  },
          })),
          publishedAt,
        },
      });
      return foodId;
    });
  }

  public async listRecipes(): Promise<readonly CurrentRecipeV1[]> {
    return this.withRepository((repository, owner) =>
      new RecipeLedgerV1({
        repository,
        digestSha256Hex: sha256Canonical,
      }).listCurrent(owner),
    );
  }

  public async recipeChoices(): Promise<readonly FoodChoice[]> {
    return this.withRepository(async (repository, owner) => {
      const recipes = await new RecipeLedgerV1({
        repository,
        digestSha256Hex: sha256Canonical,
      }).listCurrent(owner);
      const outputs = (await repository.listBySubject(owner)).flatMap(
        (record) => {
          const parsed =
            RecipeOutputFoodVersionRecordV1Schema.safeParse(record);
          return parsed.success ? [parsed.data.payload] : [];
        },
      );
      return recipes.map(({ version }) => {
        const output = outputs.find(
          (food) =>
            food.recipeId === version.recipeId &&
            food.recipeVersion === version.version,
        );
        const nutrition = output?.nutrition ?? version.outputFood?.nutrition;
        return {
          key: output
            ? `food:user-recipe-v1:${output.foodId}:${output.revision}`
            : `recipe:${version.recipeId}:${version.version}`,
          name:
            output?.catalog.foods[0]?.descriptions[0]?.value ??
            version.names[0]?.value ??
            'Untitled recipe',
          description: `${version.yield.servings} servings · ${version.yield.finalEdibleGramWeight} g yield`,
          reference: output
            ? {
                kind: 'food' as const,
                catalogReleaseId: 'user-recipe-v1',
                foodId: output.foodId,
                foodRevision: output.revision,
              }
            : {
                kind: 'recipe' as const,
                recipeId: version.recipeId,
                recipeVersion: version.version,
              },
          defaultGramWeight:
            output?.catalog.portions[0]?.gramWeight ??
            String(
              Number(version.yield.finalEdibleGramWeight) /
                Number(version.yield.servings),
            ),
          preparationState: 'prepared',
          provenance: output
            ? 'User-authored recipe output · exact published version'
            : 'User-authored legacy recipe version',
          completeness: nutrition
            ? `${nutrition.nutrients.filter((value) => value.state === 'known').length} known nutrients · ${nutrition.nutrients.filter((value) => value.state === 'incomplete').length} incomplete`
            : 'Nutrition snapshot unavailable',
          categories: output?.catalog.foods[0]?.categories.map(
            (category) => category.description,
          ) ?? ['Recipes'],
          portions:
            output?.catalog.portions.map((portion) => ({
              label: portion.description.value,
              gramWeight: portion.gramWeight,
            })) ?? [],
          nutrients:
            nutrition?.nutrients.map((component) => ({
              nutrientId: component.nutrientId,
              value:
                component.state === 'known'
                  ? `${component.per100Gram.amount} ${component.per100Gram.unit.code} / 100 g`
                  : 'Incomplete evidence',
            })) ?? [],
        };
      });
    });
  }

  public async saveRecipe(input: SaveRecipeInput): Promise<string> {
    const {
      estimateUsdaFinalWeight,
      inferCookingMethod,
      suggestUsdaCooking,
      usdaCookingMethodsCompatible,
      usdaRetentionFactors,
      usdaYieldFactor,
    } = await import('./usda-cooking');
    return this.withRepository(async (repository, owner) => {
      const ledger = new RecipeLedgerV1({
        repository,
        digestSha256Hex: sha256Canonical,
      });
      const current = (await ledger.listCurrent(owner)).find(
        (recipe) => recipe.identity.recipeId === input.recipeId,
      );
      const recipeId =
        current?.identity.recipeId ??
        input.recipeId ??
        this.dependencies.createId();
      const now = this.dependencies.now();
      const identity =
        current?.identity ??
        ({
          recipeId,
          ownerSubjectId: owner,
          origin: 'user' as const,
          createdAt: now,
        } as const);
      const headInput = await repository.getById(recipeId);
      const head =
        headInput === null ? null : RecipeHeadRecordV1Schema.parse(headInput);
      const ingredients = input.ingredients.map((ingredient, index) => {
        const method = inferCookingMethod(
          input.steps
            .filter((step) => step.ingredientIndexes.includes(index))
            .map((step) => step.instruction),
        );
        const suggested = suggestUsdaCooking(ingredient.choice, method);
        const treatmentCode =
          ingredient.usdaTreatmentCode === 'none'
            ? undefined
            : ingredient.usdaTreatmentCode ||
              (ingredient.retentionFactors?.length
                ? undefined
                : suggested.treatmentCode);
        const yieldRowId =
          ingredient.usdaYieldRowId === 'none'
            ? undefined
            : ingredient.usdaYieldRowId ||
              (ingredient.cookingYieldFactor
                ? undefined
                : suggested.yieldRowId);
        if (
          treatmentCode &&
          yieldRowId &&
          !usdaCookingMethodsCompatible(
            ingredient.choice,
            treatmentCode,
            yieldRowId,
          )
        ) {
          throw new TypeError(
            'USDA nutrient retention and weight yield must use the same cooking method.',
          );
        }
        const cookingYield = yieldRowId
          ? usdaYieldFactor(ingredient.choice, yieldRowId)
          : ingredient.usdaYieldRowId !== 'none' &&
              ingredient.cookingYieldFactor &&
              ingredient.cookingYieldRule
            ? {
                factor: ingredient.cookingYieldFactor,
                rule: ingredient.cookingYieldRule,
              }
            : undefined;
        return {
          ingredientId: this.dependencies.createId(),
          position: index + 1,
          label: ingredient.choice.name,
          reference: ingredient.choice.reference,
          inputQuantity: {
            amount: ingredient.gramWeight,
            unit: { system: 'ucum' as const, code: 'g' },
          },
          edibleGramWeight: ingredient.gramWeight,
          retentionFactors: treatmentCode
            ? usdaRetentionFactors(ingredient.choice, treatmentCode)
            : (ingredient.usdaTreatmentCode === 'none'
                ? []
                : (ingredient.retentionFactors ?? [])
              ).map((factor) => ({
                nutrientId: factor.nutrientId,
                factor: factor.factor,
                rule: factor.rule ?? {
                  component: 'user-entered-retention',
                  version: '1',
                },
              })),
          ...(cookingYield
            ? {
                cookingYieldFactor: cookingYield.factor,
                cookingYieldRule: cookingYield.rule,
              }
            : {}),
        };
      });
      const estimatedWeight =
        input.weightDetermination === 'usda-estimated'
          ? estimateUsdaFinalWeight(
              ingredients.map((ingredient) => ({
                gramWeight: ingredient.edibleGramWeight,
                ...(ingredient.cookingYieldFactor
                  ? { yieldFactor: ingredient.cookingYieldFactor }
                  : {}),
              })),
            )
          : undefined;
      const inputWeight = ingredients.reduce(
        (total, ingredient) => total + Number(ingredient.edibleGramWeight),
        0,
      );
      const version: RecipeVersionV1 = {
        recipeId,
        version: (current?.version.version ?? 0) + 1,
        names: [{ locale: 'en', value: input.name, kind: 'primary' }],
        ingredients,
        preparationSteps: input.steps.map((step, index) => ({
          position: index + 1,
          instruction: step.instruction,
          ingredientIds: step.ingredientIndexes.map((ingredientIndex) => {
            const ingredient = ingredients[ingredientIndex];
            if (!ingredient) {
              throw new TypeError(
                'A preparation step references a missing ingredient.',
              );
            }
            return ingredient.ingredientId;
          }),
        })),
        yield: {
          finalEdibleGramWeight: estimatedWeight ?? input.finalEdibleGramWeight,
          servings: input.servings,
          determination: estimatedWeight ? 'calculated' : 'user-entered',
          ...(estimatedWeight && inputWeight > 0
            ? {
                yieldFactor: String(
                  Number((Number(estimatedWeight) / inputWeight).toFixed(12)),
                ),
                yieldRule: {
                  component: 'usda-cooking-yield-composite',
                  version: '1',
                },
              }
            : {}),
        },
        calculationRule: {
          component: 'recipe-calculation',
          version: '1',
        },
        provenance: {
          method: 'user-entered',
          source: { kind: 'user', sourceId: owner },
        },
        publishedAt: now,
      };
      const context = await loadNutritionContextV1({
        references: ingredients.map(({ reference }) => reference),
        repository,
        ownerSubjectId: owner,
        indexedDB: this.dependencies.indexedDB,
      });
      const nutrition =
        context.nutrientIds.length > 0
          ? calculateRecipeNutritionV1(
              version,
              context.nutrientIds,
              context.resolver,
              {
                rule: version.calculationRule,
                decimalPlaces: 12,
                rounding: 'half-even',
              },
            )
          : RecipeNutritionCalculationV1Schema.parse({
              recipeId,
              recipeVersion: version.version,
              finalEdibleGramWeight: version.yield.finalEdibleGramWeight,
              servings: version.yield.servings,
              calculationRule: version.calculationRule,
              nutrients: [],
            });
      await ledger.publish({
        commandId: `recipe:${this.dependencies.createId()}`,
        identityRecordId:
          head?.payload.identityRecordId ?? this.dependencies.createId(),
        versionRecordId: this.dependencies.createId(),
        outputFoodRecordId: this.dependencies.createId(),
        outputFoodObservationIds: nutrition.nutrients.map(() =>
          this.dependencies.createId(),
        ),
        ...(head === null
          ? {}
          : {
              expectedPreviousVersionRecordId:
                head.payload.activeVersionRecordId,
            }),
        identity,
        version: {
          ...version,
          outputFood: {
            foodId:
              current?.version.outputFood?.foodId ??
              this.dependencies.createId(),
            nutrition,
          },
        },
        publishedAt: now,
      });
      return recipeId;
    });
  }

  public async listMeals(): Promise<readonly MealRevisionV1[]> {
    return this.withRepository((repository, owner) =>
      new ConsumptionLedgerV1({
        repository,
        digestSha256Hex: sha256Canonical,
      }).listCurrentMeals(owner),
    );
  }

  public async mealHistory(mealId: string): Promise<readonly MealRevisionV1[]> {
    return this.withRepository((repository, owner) =>
      new ConsumptionLedgerV1({
        repository,
        digestSha256Hex: sha256Canonical,
      }).getMealHistory(owner, mealId),
    );
  }

  public async saveMeal(input: SaveMealInput): Promise<string> {
    return this.withRepository(async (repository, owner) => {
      const ledger = new ConsumptionLedgerV1({
        repository,
        digestSha256Hex: sha256Canonical,
      });
      const mealId = input.mealId ?? this.dependencies.createId();
      const history = await ledger.getMealHistory(owner, mealId);
      const previous = history.at(-1);
      const now = this.dependencies.now();
      const timeZone = this.dependencies.timeZone();
      const occurredAt = new Date(input.occurredAt).toISOString();
      const items = input.items.map((item, index) => ({
        itemId: this.dependencies.createId(),
        position: index + 1,
        displayNameSnapshot: item.choice.name,
        preparationState: item.choice.preparationState,
        reference: item.choice.reference,
        consumedQuantity: {
          amount: item.gramWeight,
          unit: { system: 'ucum' as const, code: 'g' },
        },
        edibleGramWeight: item.gramWeight,
        provenance: {
          method: 'user-entered' as const,
          source: { kind: 'user' as const, sourceId: owner },
          recordedAt: now,
        },
      }));
      const context = await loadNutritionContextV1({
        references: items.map(({ reference }) => reference),
        repository,
        ownerSubjectId: owner,
        indexedDB: this.dependencies.indexedDB,
      });
      const nutrition =
        context.nutrientIds.length === 0
          ? []
          : calculateIngredientNutritionV1({
              ingredients: items.map((item) => ({
                ingredientId: item.itemId,
                position: item.position,
                label: item.displayNameSnapshot,
                reference: item.reference,
                inputQuantity: item.consumedQuantity,
                edibleGramWeight: item.edibleGramWeight,
                retentionFactors: [],
              })),
              nutrientIds: context.nutrientIds,
              finalEdibleGramWeight: '1',
              servings: '1',
              resolver: context.resolver,
              decimalPlaces: 6,
            }).map((component) =>
              component.state === 'known'
                ? {
                    state: 'known' as const,
                    nutrientId: component.nutrientId,
                    amount: component.total.amount,
                    unit: component.total.unit,
                  }
                : {
                    state: 'incomplete' as const,
                    nutrientId: component.nutrientId,
                    ...(component.knownTotal
                      ? {
                          knownAmount: component.knownTotal.amount,
                          unit: component.knownTotal.unit,
                        }
                      : {}),
                    missingItemIds: component.missingIngredientIds,
                  },
            );
      const meal: MealRevisionV1 = {
        mealId,
        ownerSubjectId: owner,
        revision: (previous?.revision ?? 0) + 1,
        state: 'recorded',
        occurredAt,
        localDate: localDate(occurredAt, timeZone),
        timeZone,
        mealType: input.mealType,
        items,
        nutrition,
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        provenance: {
          method: 'user-entered',
          source: { kind: 'user', sourceId: owner },
          recordedAt: now,
        },
        recordedAt: now,
      };
      const mealRecordId = this.dependencies.createId();
      const eventRecordId = this.dependencies.createId();
      const eventId = this.dependencies.createId();
      if (previous === undefined) {
        await ledger.recordMeal({
          commandId: `meal:${this.dependencies.createId()}`,
          mealRecordId,
          eventRecordId,
          eventId,
          meal,
        });
      } else {
        const headInput = await repository.getById(mealId);
        const head = MealHeadRecordV1Schema.parse(headInput);
        await ledger.correctMeal({
          commandId: `meal:${this.dependencies.createId()}`,
          expectedPreviousMealRecordId: head.payload.activeMealRecordId,
          mealRecordId,
          eventRecordId,
          eventId,
          meal,
        });
      }
      return mealId;
    });
  }

  public async voidMeal(mealId: string, reason: string): Promise<void> {
    await this.withRepository(async (repository, owner) => {
      const ledger = new ConsumptionLedgerV1({
        repository,
        digestSha256Hex: sha256Canonical,
      });
      const history = await ledger.getMealHistory(owner, mealId);
      const previous = history.at(-1);
      const headInput = await repository.getById(mealId);
      if (previous === undefined || headInput === null) {
        throw new Error('The meal is unavailable.');
      }
      const head = MealHeadRecordV1Schema.parse(headInput);
      const now = this.dependencies.now();
      await ledger.correctMeal({
        commandId: `void-meal:${this.dependencies.createId()}`,
        expectedPreviousMealRecordId: head.payload.activeMealRecordId,
        mealRecordId: this.dependencies.createId(),
        eventRecordId: this.dependencies.createId(),
        eventId: this.dependencies.createId(),
        meal: {
          ...previous,
          revision: previous.revision + 1,
          state: 'voided',
          items: [],
          nutrition: [],
          note: reason,
          provenance: { ...previous.provenance, recordedAt: now },
          recordedAt: now,
        },
      });
    });
  }
}
