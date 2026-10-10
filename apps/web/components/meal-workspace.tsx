'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { FoodPicker } from '@/components/food-picker';
import { BrowserStageTwoStore, type FoodChoice } from '@/lib/browser-stage-two';

import type { MealRevisionV1 } from '@nutrixx/consumption';

type MealStore = Pick<
  BrowserStageTwoStore,
  'listMeals' | 'saveMeal' | 'voidMeal' | 'searchFoods' | 'recipeChoices'
>;

interface SelectedMealItem {
  readonly draftId: string;
  readonly choice: FoodChoice;
  readonly gramWeight: string;
}

function localDateTime(instant?: string): string {
  const date = instant === undefined ? new Date() : new Date(instant);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function itemsFromMeal(meal: MealRevisionV1): readonly SelectedMealItem[] {
  return meal.items.map((item) => ({
    draftId: item.itemId,
    choice: {
      key: `${item.reference.kind}:${item.itemId}`,
      name: item.displayNameSnapshot,
      description: `${item.edibleGramWeight} g consumed`,
      reference: item.reference,
      defaultGramWeight: item.edibleGramWeight,
      preparationState: item.preparationState,
      provenance: `${item.provenance.method} · retained meal snapshot`,
      completeness: 'Exact version reference retained',
    },
    gramWeight: item.edibleGramWeight,
  }));
}

export function MealWorkspace({ store }: { store?: MealStore }) {
  const [runtime] = useState<MealStore>(
    () =>
      store ?? {
        listMeals: () => new BrowserStageTwoStore().listMeals(),
        saveMeal: (input) => new BrowserStageTwoStore().saveMeal(input),
        voidMeal: (mealId, reason) =>
          new BrowserStageTwoStore().voidMeal(mealId, reason),
        searchFoods: (query, includeRecipes) =>
          new BrowserStageTwoStore().searchFoods(query, includeRecipes),
        recipeChoices: () => new BrowserStageTwoStore().recipeChoices(),
      },
  );
  const nextDraftId = useRef(0);
  const [meals, setMeals] = useState<readonly MealRevisionV1[]>([]);
  const [editing, setEditing] = useState<MealRevisionV1 | null>(null);
  const [items, setItems] = useState<readonly SelectedMealItem[]>([]);
  const [occurredAt, setOccurredAt] = useState(localDateTime());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setMeals(await runtime.listMeals());
  }

  useEffect(() => {
    let active = true;
    void runtime
      .listMeals()
      .then((result) => {
        if (active) setMeals(result);
      })
      .catch(() => {
        if (active) {
          setError(
            'Meals are unavailable. Retry or use Storage Settings for recovery.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [runtime]);

  function beginEdit(meal: MealRevisionV1) {
    setEditing(meal);
    setItems(itemsFromMeal(meal));
    setOccurredAt(localDateTime(meal.occurredAt));
    setStatus(null);
    setError(null);
    document
      .querySelector('#meal-editor')
      ?.scrollIntoView({ behavior: 'smooth' });
  }

  function beginCopy(meal: MealRevisionV1) {
    setEditing(null);
    setItems(itemsFromMeal(meal));
    setOccurredAt(localDateTime());
    setStatus('Meal copied. Review it, then save as a new meal.');
    setError(null);
    document
      .querySelector('#meal-editor')
      ?.scrollIntoView({ behavior: 'smooth' });
  }

  function clearEditor() {
    setEditing(null);
    setItems([]);
    setOccurredAt(localDateTime());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (items.length === 0) {
      setError('Add at least one food or recipe.');
      return;
    }
    setSaving(true);
    setStatus(null);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await runtime.saveMeal({
        ...(editing === null ? {} : { mealId: editing.mealId }),
        mealType: String(form.get('mealType')) as MealRevisionV1['mealType'],
        occurredAt,
        note: String(form.get('note') ?? ''),
        items,
      });
      await refresh();
      clearEditor();
      setStatus(
        editing === null
          ? 'Meal saved in this browser.'
          : 'Meal correction saved as a new revision.',
      );
      event.currentTarget.reset();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The meal could not be saved.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function voidMeal(meal: MealRevisionV1) {
    setError(null);
    setStatus(null);
    try {
      await runtime.voidMeal(meal.mealId, 'Removed by user');
      await refresh();
      if (editing?.mealId === meal.mealId) clearEditor();
      setStatus('Meal removed. Its revision history remains available.');
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The meal could not be removed.',
      );
    }
  }

  function addItem(choice: FoodChoice) {
    nextDraftId.current += 1;
    setItems((values) => [
      ...values,
      {
        draftId: `meal-draft-${nextDraftId.current}`,
        choice,
        gramWeight: choice.defaultGramWeight,
      },
    ]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    submit(event).catch(() => undefined);
  }

  function handleRemove(meal: MealRevisionV1) {
    voidMeal(meal).catch(() => undefined);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
      <section aria-labelledby="meal-list-heading">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold" id="meal-list-heading">
            Meal history
          </h2>
          <span className="text-sm text-muted">{meals.length} current</span>
        </div>
        {loading ? (
          <p className="mt-4" role="status">
            Opening local meals…
          </p>
        ) : null}
        {!loading && meals.length === 0 ? (
          <div className="mt-4 rounded-[1.5rem] border border-dashed border-separator p-6 text-muted">
            Your first manually logged meal will appear here.
          </div>
        ) : null}
        <ul className="mt-4 space-y-3">
          {meals.map((meal) => (
            <li
              className="rounded-[1.5rem] border border-separator bg-surface/75 p-5"
              key={meal.mealId}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                    {meal.mealType} ·{' '}
                    {new Date(meal.occurredAt).toLocaleString()}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold">
                    {meal.items
                      .map(({ displayNameSnapshot }) => displayNameSnapshot)
                      .join(', ')}
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    {meal.items.length}{' '}
                    {meal.items.length === 1 ? 'item' : 'items'} · revision{' '}
                    {meal.revision}
                  </p>
                  {meal.nutrition ? (
                    <p className="mt-1 text-xs text-muted">
                      {
                        meal.nutrition.filter(
                          (value) => value.state === 'known',
                        ).length
                      }{' '}
                      known nutrients ·{' '}
                      {
                        meal.nutrition.filter(
                          (value) => value.state === 'incomplete',
                        ).length
                      }{' '}
                      incomplete
                    </p>
                  ) : null}
                </div>
                <Link
                  className="text-sm font-semibold text-accent"
                  href={`/meals/${meal.mealId}`}
                >
                  Details
                </Link>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="rounded-xl border border-separator px-3 py-2 text-sm font-semibold"
                  onClick={() => beginEdit(meal)}
                  type="button"
                >
                  Correct
                </button>
                <button
                  className="rounded-xl border border-separator px-3 py-2 text-sm font-semibold"
                  onClick={() => beginCopy(meal)}
                  type="button"
                >
                  Copy as new
                </button>
                <button
                  className="rounded-xl border border-danger/30 px-3 py-2 text-sm font-semibold text-danger"
                  onClick={() => handleRemove(meal)}
                  type="button"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="rounded-[1.75rem] border border-separator bg-surface/75 p-6"
        id="meal-editor"
      >
        <h2 className="text-2xl font-semibold">
          {editing === null ? 'Log a meal' : 'Correct this meal'}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Manual logging is unlimited. Corrections preserve the earlier
          revision.
        </p>
        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Meal type
              <select
                className="mt-2 w-full rounded-xl border border-separator bg-background/70 px-3 py-2.5"
                defaultValue={editing?.mealType ?? 'other'}
                name="mealType"
              >
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="snack">Snack</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="text-sm font-medium">
              Date and time
              <input
                className="mt-2 w-full rounded-xl border border-separator bg-background/70 px-3 py-2.5"
                max={localDateTime()}
                onChange={(event) => setOccurredAt(event.target.value)}
                required
                type="datetime-local"
                value={occurredAt}
              />
            </label>
          </div>
          <FoodPicker
            includeRecipes
            label="Add a food or recipe"
            onSelect={addItem}
            store={runtime}
          />
          <ul aria-label="Meal items" className="space-y-2">
            {items.map((item, index) => (
              <li
                className="flex items-center gap-3 rounded-xl bg-background/60 p-3"
                key={item.draftId}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {item.choice.name}
                  </span>
                  <span className="text-xs text-muted">
                    {item.choice.provenance}
                  </span>
                </span>
                {(item.choice.portions?.length ?? 0) > 0 ? (
                  <label className="text-xs">
                    Portion
                    <select
                      aria-label={`${item.choice.name} portion`}
                      className="ml-2 max-w-40 rounded-lg border border-separator bg-background px-2 py-1.5"
                      defaultValue=""
                      onChange={(event) => {
                        if (event.target.value === '') return;
                        const portion =
                          item.choice.portions?.[Number(event.target.value)];
                        if (!portion) return;
                        setItems((values) =>
                          values.map((value, itemIndex) =>
                            itemIndex === index
                              ? { ...value, gramWeight: portion.gramWeight }
                              : value,
                          ),
                        );
                      }}
                    >
                      <option value="">Custom grams</option>
                      {item.choice.portions?.map((portion, portionIndex) => (
                        <option
                          key={`${portion.label}:${portion.gramWeight}`}
                          value={portionIndex}
                        >
                          {portion.label} ({portion.gramWeight} g)
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="text-xs">
                  Grams
                  <input
                    aria-label={`${item.choice.name} grams`}
                    className="ml-2 w-24 rounded-lg border border-separator bg-background px-2 py-1.5"
                    min="0.01"
                    onChange={(event) =>
                      setItems((values) =>
                        values.map((value, itemIndex) =>
                          itemIndex === index
                            ? { ...value, gramWeight: event.target.value }
                            : value,
                        ),
                      )
                    }
                    required
                    step="0.01"
                    type="number"
                    value={item.gramWeight}
                  />
                </label>
                <button
                  aria-label={`Remove ${item.choice.name}`}
                  className="text-sm text-danger"
                  onClick={() =>
                    setItems((values) =>
                      values.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  type="button"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <label className="block text-sm font-medium">
            Note
            <textarea
              className="mt-2 min-h-20 w-full rounded-xl border border-separator bg-background/70 px-3 py-2.5"
              defaultValue={editing?.note}
              maxLength={2000}
              name="note"
            />
          </label>
          <div className="flex gap-2">
            <button
              className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground"
              disabled={saving}
              type="submit"
            >
              {saving
                ? 'Saving…'
                : editing === null
                  ? 'Save meal'
                  : 'Save correction'}
            </button>
            {editing !== null || items.length > 0 ? (
              <button
                className="rounded-xl border border-separator px-4 py-2.5 text-sm font-semibold"
                onClick={clearEditor}
                type="button"
              >
                Reset
              </button>
            ) : null}
          </div>
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
          <div
            className="mt-4 rounded-xl bg-danger/10 p-3 text-sm"
            role="alert"
          >
            <p>{error}</p>
            <Link
              className="mt-2 inline-block font-semibold underline"
              href="/settings"
            >
              Open Storage Settings
            </Link>
          </div>
        ) : null}
      </section>
    </div>
  );
}
