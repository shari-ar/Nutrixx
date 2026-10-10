'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import { FoodPicker } from '@/components/food-picker';
import {
  BrowserStageTwoStore,
  type SaveRecipeInput,
} from '@/lib/browser-stage-two';
import {
  estimateUsdaFinalWeight,
  inferCookingMethod,
  suggestUsdaCooking,
  usdaCookingMethodsCompatible,
  usdaRetentionOptions,
  usdaYieldFactor,
  usdaYieldOptions,
} from '@/lib/usda-cooking';

import type { CurrentRecipeV1 } from '@nutrixx/recipe-knowledge';

type RecipeStore = Pick<
  BrowserStageTwoStore,
  'listRecipes' | 'recipeChoices' | 'saveRecipe' | 'searchFoods'
>;

type IngredientDraft = SaveRecipeInput['ingredients'][number] & {
  readonly draftId: string;
  readonly cookingLossText: string;
  readonly usdaTreatmentCode?: string;
  readonly usdaYieldRowId?: string;
};

function cookingLossFactors(
  text: string,
): readonly { nutrientId: string; factor: string }[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [nutrientId = '', lossText = ''] = line
        .split(',')
        .map((value) => value.trim());
      const lossPercent = Number(lossText);
      if (
        !nutrientId ||
        !/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(lossText) ||
        lossPercent > 100
      ) {
        throw new TypeError(
          'Cooking loss must be a nutrient code and a percentage from 0 to 100.',
        );
      }
      return {
        nutrientId,
        factor: String(Number(((100 - lossPercent) / 100).toFixed(6))),
      };
    });
}

type StepDraft = {
  readonly draftId: string;
  readonly instruction: string;
  readonly ingredientDraftIds: readonly string[];
};

export function RecipeWorkspace({ store }: { store?: RecipeStore }) {
  const runtime = useMemo<RecipeStore>(
    () =>
      store ?? {
        listRecipes: () => new BrowserStageTwoStore().listRecipes(),
        recipeChoices: () => new BrowserStageTwoStore().recipeChoices(),
        saveRecipe: (input) => new BrowserStageTwoStore().saveRecipe(input),
        searchFoods: (query, includeRecipes) =>
          new BrowserStageTwoStore().searchFoods(query, includeRecipes),
      },
    [store],
  );
  const [recipes, setRecipes] = useState<readonly CurrentRecipeV1[]>([]);
  const nextDraftId = useRef(0);
  const [ingredients, setIngredients] = useState<readonly IngredientDraft[]>(
    [],
  );
  const [steps, setSteps] = useState<readonly StepDraft[]>([]);
  const [editing, setEditing] = useState<CurrentRecipeV1 | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [weightDetermination, setWeightDetermination] = useState<
    'measured' | 'usda-estimated'
  >('measured');
  const suggestions = useMemo(
    () =>
      new Map(
        ingredients.map(
          (item) =>
            [
              item.draftId,
              suggestUsdaCooking(
                item.choice,
                inferCookingMethod(
                  steps
                    .filter((step) =>
                      step.ingredientDraftIds.includes(item.draftId),
                    )
                    .map((step) => step.instruction),
                ),
              ),
            ] as const,
        ),
      ),
    [ingredients, steps],
  );
  const estimatedWeight = useMemo(() => {
    if (ingredients.length === 0) return null;
    const selected = ingredients.map((item) => {
      const rowId =
        item.usdaYieldRowId === 'none'
          ? undefined
          : item.usdaYieldRowId || suggestions.get(item.draftId)?.yieldRowId;
      return rowId
        ? {
            gramWeight: item.gramWeight,
            yieldFactor: usdaYieldFactor(item.choice, rowId).factor,
          }
        : { gramWeight: item.gramWeight };
    });
    return selected.some((item) => !item.yieldFactor)
      ? null
      : estimateUsdaFinalWeight(selected);
  }, [ingredients, suggestions]);

  const refresh = useCallback(async () => {
    setRecipes(await runtime.listRecipes());
  }, [runtime]);

  useEffect(() => {
    let active = true;
    void runtime
      .listRecipes()
      .then((result) => {
        if (active) setRecipes(result);
      })
      .catch(() => {
        if (active) setError('Local recipes could not be opened.');
      });
    return () => {
      active = false;
    };
  }, [runtime]);

  function edit(recipe: CurrentRecipeV1) {
    setEditing(recipe);
    setWeightDetermination('measured');
    setIngredients(
      recipe.version.ingredients.map((ingredient) => ({
        draftId: ingredient.ingredientId,
        cookingLossText: ingredient.retentionFactors
          .filter(
            (factor) => factor.rule.component === 'user-entered-retention',
          )
          .map(
            (factor) =>
              `${factor.nutrientId}, ${Number(((1 - Number(factor.factor)) * 100).toFixed(4))}`,
          )
          .join('\n'),
        choice: {
          key:
            ingredient.reference.kind === 'food'
              ? `food:${ingredient.reference.catalogReleaseId}:${ingredient.reference.foodId}:${ingredient.reference.foodRevision}`
              : `recipe:${ingredient.reference.recipeId}:${ingredient.reference.recipeVersion}`,
          name: ingredient.label,
          description: `${ingredient.edibleGramWeight} g in version ${recipe.version.version}`,
          reference: ingredient.reference,
          defaultGramWeight: ingredient.edibleGramWeight,
          preparationState: 'prepared',
          provenance: 'Exact reference preserved from the prior recipe version',
          completeness: 'Inherited reference; recalculated on publication',
        },
        gramWeight: ingredient.edibleGramWeight,
        retentionFactors: ingredient.retentionFactors,
        ...(ingredient.cookingYieldFactor && ingredient.cookingYieldRule
          ? {
              cookingYieldFactor: ingredient.cookingYieldFactor,
              cookingYieldRule: ingredient.cookingYieldRule,
            }
          : {}),
      })),
    );
    setSteps(
      recipe.version.preparationSteps.map((step) => ({
        draftId: `saved-step-${step.position}`,
        instruction: step.instruction,
        ingredientDraftIds: step.ingredientIds ?? [],
      })),
    );
  }

  function addIngredient(choice: IngredientDraft['choice']) {
    nextDraftId.current += 1;
    setIngredients((values) => [
      ...values,
      {
        draftId: `recipe-draft-${nextDraftId.current}`,
        choice,
        gramWeight: choice.defaultGramWeight,
        cookingLossText: '',
      },
    ]);
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    save(event).catch(() => undefined);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await runtime.saveRecipe({
        ...(editing ? { recipeId: editing.identity.recipeId } : {}),
        name: String(form.get('name')),
        servings: String(form.get('servings')),
        finalEdibleGramWeight: String(form.get('yieldWeight')),
        weightDetermination,
        ingredients: ingredients.map(
          ({
            choice,
            gramWeight,
            cookingLossText,
            retentionFactors,
            usdaTreatmentCode,
            usdaYieldRowId,
            cookingYieldFactor,
            cookingYieldRule,
          }) => ({
            choice,
            gramWeight,
            ...(cookingLossText.trim() || retentionFactors
              ? {
                  retentionFactors: cookingLossText.trim()
                    ? cookingLossFactors(cookingLossText)
                    : retentionFactors!,
                }
              : {}),
            ...(usdaTreatmentCode ? { usdaTreatmentCode } : {}),
            ...(usdaYieldRowId ? { usdaYieldRowId } : {}),
            ...(cookingYieldFactor && cookingYieldRule
              ? { cookingYieldFactor, cookingYieldRule }
              : {}),
          }),
        ),
        steps: steps
          .filter((step) => step.instruction.trim().length > 0)
          .map((step) => ({
            instruction: step.instruction.trim(),
            ingredientIndexes: ingredients.flatMap((ingredient, index) =>
              step.ingredientDraftIds.includes(ingredient.draftId)
                ? [index]
                : [],
            ),
          })),
      });
      setStatus(
        editing
          ? 'A new immutable recipe version was published.'
          : 'Recipe saved locally.',
      );
      setEditing(null);
      setIngredients([]);
      setSteps([]);
      setWeightDetermination('measured');
      event.currentTarget.reset();
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof TypeError
          ? cause.message
          : 'The recipe could not be validated or saved. Add at least one exact ingredient.',
      );
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-[1.5rem] border border-separator bg-surface/75 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Your recipes</h2>
            <p className="mt-2 text-sm text-muted">
              Each update publishes an immutable version.
            </p>
          </div>
          <button
            className="rounded-xl border border-separator px-3 py-2 text-sm font-semibold"
            onClick={() => {
              setEditing(null);
              setIngredients([]);
              setSteps([]);
            }}
            type="button"
          >
            New recipe
          </button>
        </div>
        {recipes.length === 0 ? (
          <p className="mt-6 rounded-xl bg-background/60 p-4 text-sm text-muted">
            No recipes yet.
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {recipes.map((recipe) => (
              <li
                key={recipe.identity.recipeId}
                className="rounded-xl border border-separator p-4"
              >
                <p className="font-semibold">
                  {recipe.version.names[0]?.value}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Version {recipe.version.version} ·{' '}
                  {recipe.version.yield.servings} servings ·{' '}
                  {recipe.version.ingredients.length} ingredients
                </p>
                {recipe.version.outputFood ? (
                  <div className="mt-3 rounded-lg bg-background/60 p-3 text-sm">
                    <p className="font-semibold">
                      Output food: {recipe.version.names[0]?.value}
                    </p>
                    <p className="text-muted">
                      {recipe.version.yield.finalEdibleGramWeight} g yield ·
                      available in food search
                    </p>
                    <details className="mt-2">
                      <summary className="cursor-pointer font-medium">
                        Nutrition per serving
                      </summary>
                      {recipe.version.outputFood.nutrition.nutrients.length ===
                      0 ? (
                        <p className="mt-2 text-muted">
                          No nutrient evidence is available for these
                          ingredients.
                        </p>
                      ) : (
                        <ul className="mt-2 max-h-52 space-y-1 overflow-auto">
                          {recipe.version.outputFood.nutrition.nutrients.map(
                            (nutrient) => (
                              <li key={nutrient.nutrientId}>
                                {nutrient.nutrientId}:{' '}
                                {nutrient.state === 'known'
                                  ? `${nutrient.perServing.amount} ${nutrient.perServing.unit.code}`
                                  : 'Incomplete evidence'}
                              </li>
                            ),
                          )}
                        </ul>
                      )}
                    </details>
                  </div>
                ) : null}
                {recipe.version.preparationSteps.length > 0 ? (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer font-medium">
                      Preparation steps
                    </summary>
                    <ol className="mt-2 list-inside list-decimal space-y-2">
                      {recipe.version.preparationSteps.map((step) => (
                        <li key={step.position}>
                          {step.instruction}
                          {(step.ingredientIds?.length ?? 0) > 0 ? (
                            <span className="block pl-5 text-xs text-muted">
                              Uses:{' '}
                              {step.ingredientIds
                                ?.map(
                                  (id) =>
                                    recipe.version.ingredients.find(
                                      (ingredient) =>
                                        ingredient.ingredientId === id,
                                    )?.label,
                                )
                                .filter(Boolean)
                                .join(', ')}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
                <button
                  className="mt-3 text-sm font-semibold text-accent"
                  onClick={() => edit(recipe)}
                  type="button"
                >
                  Publish next version
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-[1.5rem] border border-separator bg-surface/75 p-6">
        <h2 className="text-2xl font-semibold">
          {editing
            ? `New version of ${editing.version.names[0]?.value}`
            : 'Create a recipe'}
        </h2>
        <form
          key={`${editing?.identity.recipeId ?? 'new'}:${editing?.version.version ?? 0}`}
          className="mt-5 space-y-5"
          onSubmit={handleSave}
        >
          <label className="block text-sm font-medium">
            Recipe name
            <input
              required
              className="mt-2 w-full rounded-xl border border-separator bg-background/70 px-3 py-2.5"
              defaultValue={editing?.version.names[0]?.value}
              name="name"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Servings
              <input
                required
                className="mt-2 w-full rounded-xl border border-separator bg-background/70 px-3 py-2.5"
                defaultValue={editing?.version.yield.servings ?? '1'}
                min="0.01"
                name="servings"
                step="0.01"
                type="number"
              />
            </label>
            <label className="text-sm font-medium">
              Final edible yield (g)
              <input
                required={weightDetermination === 'measured'}
                className="mt-2 w-full rounded-xl border border-separator bg-background/70 px-3 py-2.5"
                defaultValue={editing?.version.yield.finalEdibleGramWeight}
                disabled={weightDetermination === 'usda-estimated'}
                min="0.01"
                name="yieldWeight"
                step="0.01"
                type="number"
              />
            </label>
          </div>
          <label className="block text-sm font-medium">
            Final weight source
            <select
              className="mt-2 w-full rounded-xl border border-separator bg-background/70 px-3 py-2.5"
              onChange={(event) =>
                setWeightDetermination(
                  event.target.value as 'measured' | 'usda-estimated',
                )
              }
              value={weightDetermination}
            >
              <option value="measured">
                Measured or entered final recipe weight
              </option>
              <option
                value="usda-estimated"
                disabled={estimatedWeight === null}
              >
                USDA estimated ingredient yields
                {estimatedWeight
                  ? ` · ${estimatedWeight} g`
                  : ' · select an exact USDA yield for every ingredient'}
              </option>
            </select>
          </label>
          <FoodPicker
            includeRecipes
            label="Add an exact food or recipe ingredient"
            onSelect={addIngredient}
            store={runtime}
          />
          <ul aria-label="Recipe ingredients" className="space-y-2">
            {ingredients.map((ingredient, index) => (
              <li
                key={ingredient.draftId}
                className="rounded-xl bg-background/60 p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {ingredient.choice.name}
                    </span>
                    <span className="text-xs text-muted">
                      {ingredient.choice.provenance}
                    </span>
                  </span>
                  {(ingredient.choice.portions?.length ?? 0) > 0 ? (
                    <label className="text-xs">
                      Portion
                      <select
                        aria-label={`${ingredient.choice.name} portion`}
                        className="ml-2 max-w-40 rounded-lg border border-separator bg-background px-2 py-1.5"
                        defaultValue=""
                        onChange={(event) => {
                          if (event.target.value === '') return;
                          const portion =
                            ingredient.choice.portions?.[
                              Number(event.target.value)
                            ];
                          if (!portion) return;
                          setIngredients((values) =>
                            values.map((value, itemIndex) =>
                              itemIndex === index
                                ? { ...value, gramWeight: portion.gramWeight }
                                : value,
                            ),
                          );
                        }}
                      >
                        <option value="">Custom grams</option>
                        {ingredient.choice.portions?.map(
                          (portion, portionIndex) => (
                            <option
                              key={`${portion.label}:${portion.gramWeight}`}
                              value={portionIndex}
                            >
                              {portion.label} ({portion.gramWeight} g)
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  ) : null}
                  <label className="text-xs">
                    Grams
                    <input
                      aria-label={`${ingredient.choice.name} grams`}
                      className="ml-2 w-24 rounded-lg border border-separator bg-background px-2 py-1.5"
                      min="0.01"
                      onChange={(event) =>
                        setIngredients((values) =>
                          values.map((value, itemIndex) =>
                            itemIndex === index
                              ? { ...value, gramWeight: event.target.value }
                              : value,
                          ),
                        )
                      }
                      step="0.01"
                      type="number"
                      value={ingredient.gramWeight}
                    />
                  </label>
                  <button
                    aria-label={`Remove ${ingredient.choice.name}`}
                    className="text-sm text-danger"
                    onClick={() =>
                      setIngredients((values) =>
                        values.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    type="button"
                  >
                    Remove
                  </button>
                </div>
                {usdaRetentionOptions(ingredient.choice).length > 0 ? (
                  <label className="mt-3 block text-xs">
                    USDA nutrient retention treatment
                    <select
                      aria-label={`${ingredient.choice.name} USDA retention`}
                      className="mt-1 w-full rounded-lg border border-separator bg-background px-2 py-1.5"
                      value={ingredient.usdaTreatmentCode ?? ''}
                      onChange={(event) => {
                        setWeightDetermination('measured');
                        setIngredients((values) =>
                          values.map((value, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...value,
                                  usdaTreatmentCode: event.target.value,
                                  usdaYieldRowId: '',
                                  cookingLossText: '',
                                }
                              : value,
                          ),
                        );
                      }}
                    >
                      <option value="">
                        Auto from linked preparation steps
                        {suggestions.get(ingredient.draftId)?.treatmentCode
                          ? ` · ${suggestions.get(ingredient.draftId)?.treatmentCode}`
                          : ''}
                      </option>
                      <option value="none">No USDA treatment</option>
                      {usdaRetentionOptions(ingredient.choice).map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.description} · USDA code {option.code}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {usdaYieldOptions(ingredient.choice).length > 0 ? (
                  <label className="mt-3 block text-xs">
                    USDA cooking yield for this exact raw food and method
                    <select
                      aria-label={`${ingredient.choice.name} USDA yield`}
                      className="mt-1 w-full rounded-lg border border-separator bg-background px-2 py-1.5"
                      value={ingredient.usdaYieldRowId ?? ''}
                      onChange={(event) =>
                        setIngredients((values) =>
                          values.map((value, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...value,
                                  usdaYieldRowId: event.target.value,
                                }
                              : value,
                          ),
                        )
                      }
                    >
                      <option value="">
                        Auto from linked preparation steps
                        {suggestions.get(ingredient.draftId)?.yieldRowId
                          ? ` · ${suggestions.get(ingredient.draftId)?.yieldRowId}`
                          : ''}
                      </option>
                      <option value="none">No USDA yield</option>
                      {usdaYieldOptions(ingredient.choice)
                        .filter(
                          (option) =>
                            !(ingredient.usdaTreatmentCode === 'none'
                              ? undefined
                              : ingredient.usdaTreatmentCode ||
                                suggestions.get(ingredient.draftId)
                                  ?.treatmentCode) ||
                            usdaCookingMethodsCompatible(
                              ingredient.choice,
                              ingredient.usdaTreatmentCode ||
                                suggestions.get(ingredient.draftId)
                                  ?.treatmentCode ||
                                '',
                              option.id,
                            ),
                        )
                        .map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.description} · {option.method} ·{' '}
                            {option.source === 'handbook-102'
                              ? 'USDA AH-102'
                              : 'USDA Release 2'}{' '}
                            · {Number(option.factor) * 100}%
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null}
                <label className="mt-3 block text-xs">
                  Advanced manual cooking loss by nutrient (code, loss %; one
                  per line)
                  <textarea
                    aria-label={`${ingredient.choice.name} cooking loss`}
                    className="mt-1 min-h-16 w-full rounded-lg border border-separator bg-background px-2 py-1.5"
                    placeholder={'nutrient.vitamin-c, 20\nnutrient.folate, 15'}
                    disabled={Boolean(
                      ingredient.usdaTreatmentCode &&
                        ingredient.usdaTreatmentCode !== 'none',
                    )}
                    value={ingredient.cookingLossText}
                    onChange={(event) =>
                      setIngredients((values) =>
                        values.map((value, itemIndex) =>
                          itemIndex === index
                            ? { ...value, cookingLossText: event.target.value }
                            : value,
                        ),
                      )
                    }
                  />
                </label>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">
            USDA Release 6 retention and USDA Release 2 or curated Handbook 102
            weight yields apply to matching raw foods and cooking methods.
            Linked preparation steps suggest unique matches. Ambiguous methods
            require your selection. The USDA weight estimate needs a matching
            yield for every ingredient; a measured final weight covers other
            recipes. Already-cooked foods retain their published values.
          </p>
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">
              Preparation steps and ingredients
            </legend>
            {steps.map((step, stepIndex) => (
              <div
                className="rounded-xl bg-background/60 p-4"
                key={step.draftId}
              >
                <label className="block text-sm font-medium">
                  Step {stepIndex + 1}
                  <textarea
                    className="mt-2 min-h-20 w-full rounded-xl border border-separator bg-background/70 px-3 py-2.5"
                    onChange={(event) =>
                      setSteps((current) =>
                        current.map((value) =>
                          value.draftId === step.draftId
                            ? { ...value, instruction: event.target.value }
                            : value,
                        ),
                      )
                    }
                    value={step.instruction}
                  />
                </label>
                <p className="mt-3 text-xs text-muted">
                  Ingredients used in this step
                </p>
                <div className="mt-2 flex flex-wrap gap-3">
                  {ingredients.map((ingredient) => (
                    <label
                      className="flex items-center gap-2 text-sm"
                      key={ingredient.draftId}
                    >
                      <input
                        checked={step.ingredientDraftIds.includes(
                          ingredient.draftId,
                        )}
                        onChange={(event) =>
                          setSteps((current) =>
                            current.map((value) =>
                              value.draftId === step.draftId
                                ? {
                                    ...value,
                                    ingredientDraftIds: event.target.checked
                                      ? [
                                          ...value.ingredientDraftIds,
                                          ingredient.draftId,
                                        ]
                                      : value.ingredientDraftIds.filter(
                                          (id) => id !== ingredient.draftId,
                                        ),
                                  }
                                : value,
                            ),
                          )
                        }
                        type="checkbox"
                      />
                      {ingredient.choice.name}
                    </label>
                  ))}
                </div>
                <button
                  className="mt-3 text-sm font-semibold text-danger"
                  onClick={() =>
                    setSteps((current) =>
                      current.filter((value) => value.draftId !== step.draftId),
                    )
                  }
                  type="button"
                >
                  Remove step
                </button>
              </div>
            ))}
            <button
              className="rounded-xl border border-separator px-4 py-2 text-sm font-semibold"
              onClick={() => {
                nextDraftId.current += 1;
                setSteps((current) => [
                  ...current,
                  {
                    draftId: `step-draft-${nextDraftId.current}`,
                    instruction: '',
                    ingredientDraftIds: [],
                  },
                ]);
              }}
              type="button"
            >
              Add preparation step
            </button>
          </fieldset>
          <button
            className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground"
            type="submit"
          >
            {editing ? 'Publish next version' : 'Save recipe'}
          </button>
        </form>
        {status ? (
          <p
            className="mt-4 rounded-xl bg-success/10 p-3 text-sm"
            role="status"
          >
            {status}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-xl bg-danger/10 p-3 text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
