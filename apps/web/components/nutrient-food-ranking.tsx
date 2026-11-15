'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { NutrientProminenceEntryV1 } from '@/lib/nutrient-prominence';
import { loadNutrientFoodsV1 } from '@/lib/nutrient-prominence-client';

import { PaginationControls } from './pagination-controls';

const PAGE_SIZE = 25;

export interface NutrientFoodRankingLoaderResultV1 {
  readonly nutrient: NutrientProminenceEntryV1 | null;
  readonly catalogEntryCount: number;
}

export function NutrientFoodRanking({
  slug,
  loadFoods = loadNutrientFoodsV1,
}: {
  readonly slug: string;
  readonly loadFoods?: (
    requestedSlug: string,
    signal?: AbortSignal,
  ) => Promise<NutrientFoodRankingLoaderResultV1>;
}) {
  const [loaded, setLoaded] = useState<{
    readonly slug: string;
    readonly result: NutrientFoodRankingLoaderResultV1;
  } | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [failedSlug, setFailedSlug] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void loadFoods(slug, controller.signal)
      .then((result) => setLoaded({ slug, result }))
      .catch((failure: unknown) => {
        if (
          !controller.signal.aborted &&
          !(failure instanceof Error && failure.name === 'AbortError')
        )
          setFailedSlug(slug);
      });
    return () => controller.abort();
  }, [loadFoods, slug]);

  if (failedSlug === slug)
    return (
      <section className="py-16" role="alert">
        <h1 className="text-3xl font-semibold">Food ranking unavailable</h1>
        <p className="mt-3 text-muted">
          The local catalog could not prepare this nutrient ranking.
        </p>
        <Link
          className="mt-5 inline-block font-semibold text-accent"
          href="/meals"
        >
          Back to meals
        </Link>
      </section>
    );

  const result = loaded?.slug === slug ? loaded.result : null;
  if (result === null)
    return (
      <p className="py-16" role="status">
        Ranking the local catalog…
      </p>
    );

  if (result.nutrient === null)
    return (
      <section className="py-16">
        <h1 className="text-3xl font-semibold">Nutrient unavailable</h1>
        <p className="mt-3 text-muted">
          The active catalog has no comparable records for this food component.
        </p>
        <Link
          className="mt-5 inline-block font-semibold text-accent"
          href="/meals"
        >
          Back to meals
        </Link>
      </section>
    );

  const { nutrient } = result;
  const visibleFoods = nutrient.topFoods.slice(
    pageIndex * PAGE_SIZE,
    (pageIndex + 1) * PAGE_SIZE,
  );
  const limiting = nutrient.direction === 'LIMIT';
  const referenceOnly = nutrient.direction === 'REFERENCE';
  const unspecified = nutrient.direction === 'UNSPECIFIED';
  const comparisonLabel = referenceOnly
    ? 'FDA reference amount'
    : 'FDA Daily Value';
  return (
    <div className="py-12 sm:py-16">
      <Link className="text-sm font-semibold text-accent" href="/meals">
        ← Back to meals
      </Link>
      <header className="mt-7 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
          Catalog nutrient ranking
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          Foods notable for {nutrient.name}
        </h1>
        <p className="mt-4 text-lg leading-7 text-muted">
          {limiting
            ? `Higher-ranked foods contribute more ${nutrient.name}; use this list as a watch-out, not a recommendation.`
            : referenceOnly
              ? `Higher-ranked foods contain more ${nutrient.name} on the standardized comparison basis.`
              : unspecified
                ? `Higher-ranked foods contain a larger recorded amount of ${nutrient.name}.`
                : `Higher-ranked foods make a stronger ${nutrient.name} contribution.`}
        </p>
      </header>

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        <Metric label="Foods with known data" value={nutrient.knownFoodCount} />
        {nutrient.highSourceCount === null ? (
          <>
            <Metric
              label="Ranked foods shown"
              value={nutrient.topFoods.length}
            />
            <Metric label="Comparison basis" value="Per 100 g" />
          </>
        ) : (
          <>
            <Metric label="High sources" value={nutrient.highSourceCount} />
            <Metric
              label="Catalog high-source share"
              value={`${((nutrient.highSourceShare ?? 0) * 100).toFixed(1)}%`}
            />
          </>
        )}
      </section>

      <section className="mt-6 rounded-[1.5rem] border border-separator bg-surface/75 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">
              {limiting
                ? 'Highest-contributing foods'
                : unspecified
                  ? 'Highest recorded amounts'
                  : 'High-source foods'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              {unspecified
                ? `Ranked by recorded ${nutrient.unit} per 100 g edible because this component has no FDA Daily Value.`
                : `Ranked by percent of the ${comparisonLabel} per 100 g edible.`}{' '}
              The standardized 100 g basis supports catalog comparison and is
              not a personalized serving recommendation.
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${limiting ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}
          >
            {limiting
              ? 'Watch-out'
              : referenceOnly
                ? 'Reference comparison'
                : unspecified
                  ? 'Amount ranking'
                  : 'Strong contribution'}
          </span>
        </div>

        {visibleFoods.length === 0 ? (
          <p className="mt-6 text-muted">
            {unspecified
              ? 'No food has a known amount for this component in the active catalog.'
              : `No food reaches 20% of the ${comparisonLabel} per 100 g in the active catalog.`}
          </p>
        ) : (
          <ol className="mt-6 grid gap-3">
            {visibleFoods.map((food, index) => (
              <li
                className="grid gap-2 rounded-2xl bg-background/60 p-4 sm:grid-cols-[3rem_1fr_auto] sm:items-center"
                key={food.candidateKey}
              >
                <span className="text-sm font-semibold text-muted">
                  #{pageIndex * PAGE_SIZE + index + 1}
                </span>
                <div>
                  <p className="font-semibold">{food.displayName}</p>
                  <p className="mt-1 text-xs text-muted">
                    {food.amountPer100Grams} {food.unit} per 100 g · source{' '}
                    {food.sourceId}
                  </p>
                </div>
                <p className="font-semibold">
                  {food.percentDailyValuePer100Grams === null
                    ? `${food.amountPer100Grams} ${food.unit}`
                    : `${food.percentDailyValuePer100Grams.toFixed(1)}% ${referenceOnly ? 'reference' : 'DV'}`}
                </p>
              </li>
            ))}
          </ol>
        )}
        <PaginationControls
          label={`${nutrient.name} food ranking`}
          onPageChange={setPageIndex}
          pageIndex={pageIndex}
          pageSize={PAGE_SIZE}
          total={nutrient.topFoods.length}
        />
      </section>

      <p className="mt-5 max-w-3xl text-xs leading-5 text-muted">
        Coverage: {nutrient.knownFoodCount.toLocaleString('en-US')} foods with
        known {nutrient.name} data across{' '}
        {result.catalogEntryCount.toLocaleString('en-US')} active catalog
        entries.{' '}
        {unspecified
          ? 'This amount ranking carries no Daily Value or personalized adequacy claim.'
          : `The high-source threshold is 20% of the ${comparisonLabel}.`}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number | string;
}) {
  return (
    <div className="rounded-2xl border border-separator bg-surface/75 p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold">
        {typeof value === 'number' ? value.toLocaleString('en-US') : value}
      </p>
    </div>
  );
}
