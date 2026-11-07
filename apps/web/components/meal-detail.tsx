'use client';

import { FOOD_COMPONENTS_V1 } from '@nutrixx/nutrition-engine';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { BrowserStageTwoStore } from '@/lib/browser-stage-two';
import {
  presentMealNutritionV1,
  type MealNutritionPresentationRowV1,
} from '@/lib/meal-nutrition-presentation';

import type { MealRevisionV1 } from '@nutrixx/consumption';

type MealHistoryStore = Pick<BrowserStageTwoStore, 'mealHistory'>;

const featuredAccessCodes = new Set([
  'ENERC_KCAL',
  'PROCNT',
  'CHOCDF',
  'FAT',
  'FIBTG',
  'NA',
]);

function NutrientValue({
  nutrient,
}: {
  nutrient: MealNutritionPresentationRowV1;
}) {
  const value =
    nutrient.state === 'known'
      ? `${nutrient.amount} ${nutrient.unit}`
      : nutrient.knownAmount === undefined
        ? 'Amount unavailable'
        : `${nutrient.knownAmount} ${nutrient.unit} known subtotal`;
  const evidence =
    nutrient.state === 'incomplete'
      ? `Incomplete composition for ${nutrient.missingItemCount} consumed item${nutrient.missingItemCount === 1 ? '' : 's'}`
      : nutrient.amount === '0'
        ? 'Recorded zero; distinct from missing data'
        : 'Complete for the retained meal items';

  return (
    <div className="rounded-xl bg-background/60 p-4">
      <dt className="font-medium">{nutrient.name}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
      <dd className="mt-1 text-xs text-muted">{evidence}</dd>
    </div>
  );
}

export function MealDetail({
  mealId,
  store,
}: {
  mealId: string;
  store?: MealHistoryStore;
}) {
  const [runtime] = useState<MealHistoryStore>(
    () =>
      store ?? {
        mealHistory: (id) => new BrowserStageTwoStore().mealHistory(id),
      },
  );
  const [history, setHistory] = useState<readonly MealRevisionV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void runtime
      .mealHistory(mealId)
      .then((result) => {
        if (active) setHistory(result);
      })
      .catch(() => {
        if (active) setError('This local meal could not be opened.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mealId, runtime]);

  if (loading)
    return (
      <p className="py-16" role="status">
        Opening meal history…
      </p>
    );
  if (error !== null || history.length === 0) {
    return (
      <section className="py-16" role="alert">
        <h1 className="text-3xl font-semibold">Meal unavailable</h1>
        <p className="mt-3 text-muted">
          {error ?? 'No local record matches this meal.'}
        </p>
        <Link
          className="mt-5 inline-block font-semibold text-accent"
          href="/meals"
        >
          Back to meals
        </Link>
      </section>
    );
  }

  const current = history.at(-1)!;
  const nutrition = presentMealNutritionV1(current.nutrition);
  const featuredNutrition = nutrition.rows.filter((nutrient) =>
    featuredAccessCodes.has(nutrient.accessCode),
  );
  const categoryGroups = Array.from(
    nutrition.rows.reduce((groups, nutrient) => {
      groups.set(nutrient.category, [
        ...(groups.get(nutrient.category) ?? []),
        nutrient,
      ]);
      return groups;
    }, new Map<string, MealNutritionPresentationRowV1[]>()),
  );
  return (
    <div className="py-12 sm:py-16">
      <Link className="text-sm font-semibold text-accent" href="/meals">
        ← Back to meals
      </Link>
      <header className="mt-7 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
          {current.localDate} · {current.mealType} · revision {current.revision}
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          {current.state === 'voided'
            ? 'Removed meal'
            : current.items
                .map(({ displayNameSnapshot }) => displayNameSnapshot)
                .join(', ')}
        </h1>
        <p className="mt-4 text-lg leading-7 text-muted">
          {current.note ?? 'No note was added.'}
        </p>
      </header>

      <section className="mt-8 rounded-[1.5rem] border border-separator bg-surface/75 p-6">
        <h2 className="text-2xl font-semibold">Consumed items</h2>
        {current.items.length === 0 ? (
          <p className="mt-4 text-muted">
            This revision is a retained removal record.
          </p>
        ) : null}
        <dl className="mt-5 grid gap-3">
          {current.items.map((item) => (
            <div className="rounded-2xl bg-background/60 p-4" key={item.itemId}>
              <dt className="font-semibold">{item.displayNameSnapshot}</dt>
              <dd className="mt-1 text-sm text-muted">
                {item.edibleGramWeight} g · {item.preparationState} ·{' '}
                {item.reference.kind} version retained
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-6 rounded-[1.5rem] border border-separator bg-surface/75 p-6">
        <h2 className="text-2xl font-semibold">Meal nutrition</h2>
        {current.nutrition === undefined ? (
          <p className="mt-4 text-muted">
            This older revision was saved before nutrition snapshots were
            available.
          </p>
        ) : current.nutrition.length === 0 ? (
          <p className="mt-4 text-muted">
            No nutrient evidence is available for the selected items.
          </p>
        ) : nutrition.rows.length === 0 ? (
          <p className="mt-4 text-muted">
            The retained source observations do not map to the recognized
            Nutrixx food-component register.
          </p>
        ) : (
          <>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
              Totals use the exact food and recipe versions retained with this
              meal. Recognized source observations are normalized to the Nutrixx
              food-component register before presentation.
            </p>
            {featuredNutrition.length > 0 ? (
              <div className="mt-5">
                <h3 className="font-semibold">Nutrition highlights</h3>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {featuredNutrition.map((nutrient) => (
                    <NutrientValue
                      key={nutrient.componentId}
                      nutrient={nutrient}
                    />
                  ))}
                </dl>
              </div>
            ) : null}
            <details className="mt-6 border-t border-separator pt-5">
              <summary className="cursor-pointer font-semibold">
                Browse all {nutrition.rows.length} recorded food components
              </summary>
              <div className="mt-5 space-y-7">
                {categoryGroups.map(([category, nutrients]) => (
                  <section
                    aria-labelledby={`meal-nutrition-${category.toLowerCase().replaceAll(' ', '-')}`}
                    key={category}
                  >
                    <h3
                      className="text-lg font-semibold"
                      id={`meal-nutrition-${category.toLowerCase().replaceAll(' ', '-')}`}
                    >
                      {category}
                    </h3>
                    <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {nutrients.map((nutrient) => (
                        <NutrientValue
                          key={nutrient.componentId}
                          nutrient={nutrient}
                        />
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
            </details>
            <details className="mt-5 border-t border-separator pt-5 text-sm">
              <summary className="cursor-pointer font-semibold">
                Data interpretation and traceability
              </summary>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
                <li>
                  {nutrition.recognizedObservationCount} recognized source
                  observations were consolidated into {nutrition.rows.length} of{' '}
                  {FOOD_COMPONENTS_V1.length} food components.
                </li>
                <li>
                  A recorded zero is shown as zero. Missing or partial evidence
                  is labeled incomplete and is never converted to zero.
                </li>
                {nutrition.collapsedEquivalentObservationCount > 0 ? (
                  <li>
                    {nutrition.collapsedEquivalentObservationCount} equivalent
                    source observations were consolidated instead of shown as
                    duplicate nutrients.
                  </li>
                ) : null}
                {nutrition.hiddenTechnicalObservationCount > 0 ? (
                  <li>
                    {nutrition.hiddenTechnicalObservationCount} technical source
                    observations remain retained for audit but are outside the
                    112-component consumer view.
                  </li>
                ) : null}
              </ul>
            </details>
          </>
        )}
      </section>

      <section className="mt-6 rounded-[1.5rem] border border-separator bg-surface/75 p-6">
        <h2 className="text-2xl font-semibold">Revision history</h2>
        <ol className="mt-5 space-y-3">
          {[...history].reverse().map((revision) => (
            <li
              className="rounded-2xl bg-background/60 p-4"
              key={revision.revision}
            >
              <p className="font-semibold">
                Revision {revision.revision} · {revision.state}
              </p>
              <p className="mt-1 text-sm text-muted">
                Recorded {new Date(revision.recordedAt).toLocaleString()} ·{' '}
                {revision.items.length} items
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
