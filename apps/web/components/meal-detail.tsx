'use client';

import { FOOD_COMPONENTS_V1 } from '@nutrixx/nutrition-engine';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { BrowserStageTwoStore } from '@/lib/browser-stage-two';
import {
  presentMealNutritionV1,
  type MealNutritionPresentationRowV1,
} from '@/lib/meal-nutrition-presentation';
import {
  nutrientSlugV1,
  selectMealSignatureNutrientsV1,
  type MealSignatureNutrientV1,
} from '@/lib/nutrient-prominence';
import { loadMealSignatureNutrientsV1 } from '@/lib/nutrient-prominence-client';

import type { MealRevisionV1 } from '@nutrixx/consumption';

interface MealDetailStore extends Pick<BrowserStageTwoStore, 'mealHistory'> {
  readonly mealSignatureNutrients: (
    rows: readonly MealNutritionPresentationRowV1[],
    signal?: AbortSignal,
  ) => Promise<readonly MealSignatureNutrientV1[]>;
}

const featuredAccessCodes = new Set(['ENERC_KCAL', 'PROCNT', 'CHOCDF', 'FAT']);

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
      <Link
        aria-label={`See foods notable for ${nutrient.name}`}
        className="group block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent"
        href={`/nutrients/${nutrientSlugV1(nutrient.componentId, nutrient.accessCode)}`}
      >
        <dt className="font-medium group-hover:text-accent">{nutrient.name}</dt>
        <dd className="mt-1 font-semibold">{value}</dd>
        <dd className="mt-1 text-xs text-muted">{evidence}</dd>
      </Link>
    </div>
  );
}

function SignatureNutrientValue({
  nutrient,
}: {
  nutrient: MealSignatureNutrientV1;
}) {
  const labelClassName =
    nutrient.label === 'Watch-out'
      ? 'bg-warning/10 text-warning'
      : nutrient.label === 'Distinctive source'
        ? 'bg-accent/10 text-accent'
        : 'bg-success/10 text-success';
  return (
    <div className="rounded-xl bg-background/60 p-4">
      <Link
        aria-label={`See foods notable for ${nutrient.name}`}
        className="group block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent"
        href={`/nutrients/${nutrient.slug}`}
      >
        {nutrient.label ? (
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-wider ${labelClassName}`}
          >
            {nutrient.label}
          </span>
        ) : null}
        <dt
          className={`${nutrient.label ? 'mt-3 ' : ''}font-medium group-hover:text-accent`}
        >
          {nutrient.name}
        </dt>
        <dd className="mt-1 font-semibold">
          {nutrient.amount} {nutrient.unit}
        </dd>
        <dd className="mt-1 text-xs text-muted">{nutrient.basis}</dd>
      </Link>
    </div>
  );
}

export function MealDetail({
  mealId,
  store,
}: {
  mealId: string;
  store?: Partial<MealDetailStore> & Pick<MealDetailStore, 'mealHistory'>;
}) {
  const [runtime] = useState<MealDetailStore>(
    () =>
      ({
        mealHistory:
          store?.mealHistory ??
          ((id) => new BrowserStageTwoStore().mealHistory(id)),
        mealSignatureNutrients:
          store?.mealSignatureNutrients ?? loadMealSignatureNutrientsV1,
      }) satisfies MealDetailStore,
  );
  const [signatureRefinement, setSignatureRefinement] = useState<{
    readonly key: string;
    readonly highlights: readonly MealSignatureNutrientV1[];
  } | null>(null);
  const [history, setHistory] = useState<readonly MealRevisionV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentHistory = history.at(-1);
  const signatureKey = currentHistory
    ? `${currentHistory.mealId}:${currentHistory.revision}`
    : null;
  const immediateSignatureNutrients = useMemo(() => {
    const current = history.at(-1);
    if (!current?.nutrition || current.nutrition.length === 0) return [];
    return selectMealSignatureNutrientsV1(
      presentMealNutritionV1(current.nutrition).rows,
    );
  }, [history]);
  const signatureNutrients =
    signatureRefinement?.key === signatureKey
      ? signatureRefinement.highlights
      : immediateSignatureNutrients;

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

  useEffect(() => {
    const current = history.at(-1);
    if (!current?.nutrition || current.nutrition.length === 0) return;
    const rows = presentMealNutritionV1(current.nutrition).rows;
    const immediateHighlights = selectMealSignatureNutrientsV1(rows);
    const refinementKey = `${current.mealId}:${current.revision}`;
    const controller = new AbortController();
    void runtime
      .mealSignatureNutrients(rows, controller.signal)
      .then((refinedHighlights) => {
        setSignatureRefinement({
          key: refinementKey,
          highlights:
            refinedHighlights.length > 0
              ? refinedHighlights
              : immediateHighlights,
        });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [history, runtime]);

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
            {featuredNutrition.length > 0 || signatureNutrients.length > 0 ? (
              <div className="mt-5">
                <h3 className="font-semibold">Nutrition highlights</h3>
                <p className="mt-2 max-w-3xl text-xs leading-5 text-muted">
                  Smart labels compare this meal with FDA Daily Values and the
                  active catalog: Strong means a high contribution, Distinctive
                  means useful and uncommon, and Watch-out marks a high limiting
                  nutrient. Unlabeled cards show the strongest remaining
                  signals. Select any card to explore its notable foods.
                </p>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {featuredNutrition.map((nutrient) => (
                    <NutrientValue
                      key={nutrient.componentId}
                      nutrient={nutrient}
                    />
                  ))}
                  {signatureNutrients.map((nutrient) => (
                    <SignatureNutrientValue
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
