'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { FoodPicker } from '@/components/food-picker';
import { BrowserStageTwoStore, type FoodChoice } from '@/lib/browser-stage-two';

import type { CustomFoodVersionV1 } from '@nutrixx/food-knowledge';

type FoodStore = Pick<
  BrowserStageTwoStore,
  'recipeChoices' | 'saveCustomFood' | 'searchFoods' | 'listCustomFoods'
>;

export function FoodWorkspace({ store }: { store?: FoodStore }) {
  const runtime = useMemo<FoodStore>(
    () =>
      store ?? {
        saveCustomFood: (input) =>
          new BrowserStageTwoStore().saveCustomFood(input),
        searchFoods: (query, includeRecipes) =>
          new BrowserStageTwoStore().searchFoods(query, includeRecipes),
        recipeChoices: () => new BrowserStageTwoStore().recipeChoices(),
        listCustomFoods: () => new BrowserStageTwoStore().listCustomFoods(),
      },
    [store],
  );
  const [selected, setSelected] = useState<FoodChoice | null>(null);
  const [customFoods, setCustomFoods] = useState<
    readonly CustomFoodVersionV1[]
  >([]);
  const [editing, setEditing] = useState<CustomFoodVersionV1 | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void runtime
      .listCustomFoods()
      .then(setCustomFoods)
      .catch(() => {
        setError('Custom foods could not be loaded.');
      });
  }, [runtime]);

  async function saveCustomFood(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const nutrients = String(form.get('nutrients') ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [nutrientId = '', amount = '', unit = ''] = line
          .split(',')
          .map((value) => value.trim());
        return {
          nutrientId,
          ...(amount ? { amount } : {}),
          ...(unit ? { unit } : {}),
        };
      });
    const portions = String(form.get('extraPortions') ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label = '', gramWeight = ''] = line
          .split(',')
          .map((value) => value.trim());
        return { label, gramWeight };
      });
    const price = String(form.get('approximatePriceUsdPer100g') ?? '').trim();
    try {
      await runtime.saveCustomFood({
        ...(editing ? { foodId: editing.foodId } : {}),
        name: String(form.get('name')),
        ...(price
          ? { approximatePriceUsdPer100g: Number(price).toString() }
          : {}),
        preparationState: String(form.get('preparationState')),
        portionLabel: String(form.get('portionLabel')),
        gramWeight: String(form.get('gramWeight')),
        categories: String(form.get('categories') ?? '')
          .split('\n')
          .map((value) => value.trim())
          .filter(Boolean),
        portions,
        nutrients,
      });
      setCustomFoods(await runtime.listCustomFoods());
      setEditing(null);
      setStatus('Custom food version saved locally with explicit provenance.');
      event.currentTarget.reset();
    } catch {
      setError('The custom food could not be validated or saved.');
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[1.5rem] border border-separator bg-surface/75 p-6">
        <h2 className="text-2xl font-semibold">Search foods</h2>
        <p className="mt-2 text-sm text-muted">
          Results expose source lineage and known-versus-unknown composition.
        </p>
        <div className="mt-5">
          <FoodPicker includeRecipes onSelect={setSelected} store={runtime} />
        </div>
        {selected ? (
          <dl className="mt-5 grid gap-3 rounded-xl bg-background/60 p-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">Selected food</dt>
              <dd className="font-semibold">{selected.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Default quantity</dt>
              <dd className="font-semibold">{selected.defaultGramWeight} g</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">
                Approximate price (USD / 100 g)
              </dt>
              <dd className="font-semibold">
                {selected.approximatePriceUsdPer100g === undefined
                  ? 'Not set'
                  : `$${selected.approximatePriceUsdPer100g}`}
              </dd>
              {selected.approximatePriceUsdPer100g !== undefined ? (
                <p className="text-xs text-muted">
                  Illustrative estimate, not a live market quote.
                </p>
              ) : null}
            </div>
            <div>
              <dt className="text-xs text-muted">Provenance</dt>
              <dd>{selected.provenance}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Completeness</dt>
              <dd>{selected.completeness}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Preparation state</dt>
              <dd>{selected.preparationState}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Categories</dt>
              <dd>{selected.categories?.join(', ') || 'Uncategorized'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Portions</dt>
              <dd>
                {selected.portions
                  ?.map(
                    (portion) => `${portion.label}: ${portion.gramWeight} g`,
                  )
                  .join('; ') || '100 g edible portion'}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted">Nutrient composition</dt>
              <dd>
                {selected.nutrients?.length ? (
                  <ul className="mt-2 grid max-h-56 gap-1 overflow-auto sm:grid-cols-2">
                    {selected.nutrients.map((nutrient) => (
                      <li key={nutrient.id ?? nutrient.nutrientId}>
                        {nutrient.nutrientId}: {nutrient.value}
                      </li>
                    ))}
                  </ul>
                ) : (
                  'No nutrient evidence available'
                )}
              </dd>
            </div>
          </dl>
        ) : null}
        {selected?.reference.kind === 'food' &&
        selected.reference.catalogReleaseId === 'user-custom-v1' ? (
          <button
            className="mt-3 text-sm font-semibold text-accent"
            type="button"
            onClick={() => {
              setEditing(
                customFoods.find(
                  (food) =>
                    food.foodId ===
                    (selected.reference.kind === 'food'
                      ? selected.reference.foodId
                      : ''),
                ) ?? null,
              );
            }}
          >
            Edit this custom food
          </button>
        ) : null}
      </section>

      <section className="rounded-[1.5rem] border border-separator bg-surface/75 p-6">
        <h2 className="text-2xl font-semibold">
          {editing
            ? 'Publish a custom food correction'
            : 'Create a custom food'}
        </h2>
        <p className="mt-2 text-sm text-muted">
          Enter label facts as nutrient code, amount, unit—one per line. Leave
          amount and unit blank to preserve an explicitly unknown value. A
          measured zero stays zero.
        </p>
        <form
          key={`${editing?.foodId ?? 'new'}:${editing?.revision ?? 0}`}
          className="mt-5 grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            saveCustomFood(event).catch(() => undefined);
          }}
        >
          <label className="text-sm font-medium">
            Food name
            <input
              required
              className="mt-2 w-full rounded-xl border border-separator bg-background/70 px-3 py-2.5"
              name="name"
              defaultValue={editing?.name}
            />
          </label>
          <label className="text-sm font-medium">
            Approximate price (USD / 100 g)
            <input
              className="mt-2 w-full rounded-xl border border-separator bg-background/70 px-3 py-2.5"
              defaultValue={editing?.approximatePriceUsdPer100g}
              min="0"
              name="approximatePriceUsdPer100g"
              step="0.01"
              type="number"
            />
          </label>
          <label className="text-sm font-medium">
            Preparation state
            <input
              required
              className="mt-2 w-full rounded-xl border border-separator bg-background/70 px-3 py-2.5"
              defaultValue={editing?.preparationState ?? 'as-sold'}
              name="preparationState"
            />
          </label>
          <label className="text-sm font-medium">
            Portion label
            <input
              required
              className="mt-2 w-full rounded-xl border border-separator bg-background/70 px-3 py-2.5"
              defaultValue={editing?.portions[0]?.label ?? '1 serving'}
              name="portionLabel"
            />
          </label>
          <label className="text-sm font-medium">
            Portion weight (g)
            <input
              required
              className="mt-2 w-full rounded-xl border border-separator bg-background/70 px-3 py-2.5"
              min="0.01"
              name="gramWeight"
              defaultValue={editing?.portions[0]?.gramWeight}
              step="0.01"
              type="number"
            />
          </label>
          <label className="text-sm font-medium sm:col-span-2">
            Categories (one per line)
            <textarea
              className="mt-2 min-h-20 w-full rounded-xl border border-separator bg-background/70 px-3 py-2.5"
              name="categories"
              defaultValue={editing?.categories?.join('\n')}
            />
          </label>
          <label className="text-sm font-medium sm:col-span-2">
            Additional portions (label, grams; one per line)
            <textarea
              className="mt-2 min-h-20 w-full rounded-xl border border-separator bg-background/70 px-3 py-2.5"
              name="extraPortions"
              defaultValue={editing?.portions
                .slice(1)
                .map((portion) => `${portion.label}, ${portion.gramWeight}`)
                .join('\n')}
              placeholder={'1 cup, 240\n1 tablespoon, 15'}
            />
          </label>
          <label className="text-sm font-medium sm:col-span-2">
            Nutrient facts
            <textarea
              className="mt-2 min-h-28 w-full rounded-xl border border-separator bg-background/70 px-3 py-2.5"
              name="nutrients"
              defaultValue={editing?.composition
                .map((component) =>
                  component.value.state === 'known'
                    ? `${component.nutrientId}, ${component.value.amount}, ${component.value.unit.code}`
                    : `${component.nutrientId}, ,`,
                )
                .join('\n')}
              placeholder={'nutrient.protein, 5, g\nnutrient.iron, ,'}
            />
          </label>
          <button
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground sm:col-span-2"
            type="submit"
          >
            {editing ? 'Publish food correction' : 'Save custom food'}
          </button>
        </form>
      </section>

      {status ? (
        <p className="rounded-xl bg-success/10 p-4 text-sm" role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl bg-danger/10 p-4 text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
