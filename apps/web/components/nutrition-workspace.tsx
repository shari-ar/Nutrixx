'use client';

import {
  NUTRIENT_CROSSWALK_V1,
  type NutrientIntakeStateV1,
  type TargetSelectionV1,
} from '@nutrixx/nutrition-engine';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import {
  BrowserNutritionStateStore,
  type BrowserNutritionSnapshotV1,
  type NutritionTargetMarketV1,
} from '@/lib/browser-nutrition-state';

type NutritionStore = Pick<
  BrowserNutritionStateStore,
  'load' | 'selectMarket' | 'scheduleTimeZoneChange'
>;

const featuredNutrients = new Set([
  'nutrient.protein',
  'nutrient.dietary-fiber',
  'nutrient.calcium',
  'nutrient.iron',
  'nutrient.vitamin-d',
  'nutrient.magnesium',
]);

function nutrientName(nutrientId: string): string {
  const entry = NUTRIENT_CROSSWALK_V1.find(
    (candidate) => candidate.nutrientId === nutrientId,
  );
  return entry?.usdaFdcName ?? nutrientId;
}

function targetLabel(target: TargetSelectionV1, unit: string): string {
  if (target.status === 'NEEDS_INPUT') {
    return target.fields.includes('market')
      ? 'Choose a reference region to see a target.'
      : 'More profile detail is needed for a target.';
  }
  if (target.status === 'OUT_OF_SCOPE') {
    return 'A matching target is unavailable.';
  }
  const value = target.rule.value;
  if (value.kind !== 'point') return 'A point target is unavailable.';
  return `${target.rule.type} ${value.amount} ${unit} · ${target.rule.source.authority}`;
}

function progressPercent(
  nutrient: NutrientIntakeStateV1,
  recordedMealCount: number,
  travelAdjusted: boolean,
): number | null {
  if (
    recordedMealCount === 0 ||
    travelAdjusted ||
    nutrient.evidence !== 'known-for-recorded-meals' ||
    nutrient.comparison === 'indeterminate' ||
    nutrient.target.status !== 'READY' ||
    nutrient.target.rule.value.kind !== 'point' ||
    nutrient.target.rule.unit.code !== nutrient.unit
  ) {
    return null;
  }
  const amount = Number(nutrient.knownRecordedSubtotal);
  const target = Number(nutrient.target.rule.value.amount);
  return target > 0 && Number.isFinite(amount)
    ? Math.round((amount / target) * 100)
    : null;
}

function relationLabel(nutrient: NutrientIntakeStateV1): string {
  if (nutrient.upperLimitComparison === 'recorded-above-upper-limit') {
    return 'Recorded amount above the applicable upper-limit intake reference';
  }
  if (nutrient.comparison === 'recorded-at-or-above-reference') {
    return 'Recorded intake reaches the selected reference';
  }
  if (nutrient.comparison === 'recorded-below-reference') {
    return 'Recorded intake below the selected reference';
  }
  return 'Comparison remains indeterminate';
}

function NutritionCard({
  nutrient,
  snapshot,
}: {
  nutrient: NutrientIntakeStateV1;
  snapshot: BrowserNutritionSnapshotV1;
}) {
  const { current, completed, rolling } = snapshot.window;
  const percent = progressPercent(
    nutrient,
    current.recordedMealCount,
    current.period.travelAdjusted,
  );
  const rollingSegments = rolling.trends.filter(
    (trend) => trend.nutrientId === nutrient.nutrientId,
  );
  const observed = rollingSegments.reduce(
    (sum, trend) => sum + trend.comparableDayCount,
    0,
  );
  const stableTrend =
    rollingSegments.length === 1 ? (rollingSegments[0] ?? null) : null;
  const meals = new Map(snapshot.meals.map((meal) => [meal.mealId, meal]));
  const knownAmount =
    current.recordedMealCount === 0
      ? 'No meals recorded today'
      : nutrient.evidence === 'incomplete' &&
          nutrient.contributingMeals.length === 0
        ? 'Amount unavailable'
        : `${nutrient.knownRecordedSubtotal} ${nutrient.unit}${nutrient.evidence === 'incomplete' ? ' known subtotal' : ' recorded'}`;

  return (
    <article className="rounded-[1.5rem] border border-separator bg-surface/75 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-lg font-semibold">
          {nutrientName(nutrient.nutrientId)}
        </h3>
        <span className="rounded-full bg-background px-3 py-1 text-xs text-muted">
          {nutrient.evidence === 'incomplete'
            ? 'Composition incomplete'
            : 'Recorded composition known'}
        </span>
      </div>
      <p className="mt-4 text-2xl font-semibold">{knownAmount}</p>
      <p className="mt-2 text-sm text-muted">
        {targetLabel(nutrient.target, nutrient.unit)}
      </p>
      {percent !== null ? (
        <div className="mt-4">
          <div
            aria-label={`${percent}% of selected daily reference in recorded meals`}
            className="h-2 overflow-hidden rounded-full bg-background"
            role="img"
          >
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-muted">
            {percent}% of the daily reference in recorded meals
          </p>
        </div>
      ) : null}
      {current.recordedMealCount > 0 ? (
        <p className="mt-3 text-sm">{relationLabel(nutrient)}</p>
      ) : null}
      <details className="mt-5 border-t border-separator pt-4 text-sm">
        <summary className="cursor-pointer font-semibold">
          Evidence, meals, and seven-day trend
        </summary>
        <div className="mt-4 space-y-4 text-muted">
          <p>
            {observed} of 7 completed days have comparable recorded evidence.
            {stableTrend?.meanKnownRecordedPerObservedDay === null ||
            stableTrend === null
              ? ' A comparable seven-day mean is unavailable.'
              : ` Mean across those days: ${stableTrend.meanKnownRecordedPerObservedDay} ${nutrient.unit} per observed day.`}
          </p>
          <ul aria-label="Seven completed nutrition days" className="space-y-1">
            {completed.map((day) => {
              const value = day.nutrients.find(
                (entry) => entry.nutrientId === nutrient.nutrientId,
              );
              const comparable =
                day.recordedMealCount > 0 &&
                !day.period.travelAdjusted &&
                value?.evidence === 'known-for-recorded-meals';
              return (
                <li key={day.period.periodId}>
                  {day.period.localDate}:{' '}
                  {comparable
                    ? `${value.knownRecordedSubtotal} ${value.unit} recorded`
                    : day.recordedMealCount === 0
                      ? 'No meals recorded'
                      : 'Excluded from comparable mean'}
                </li>
              );
            })}
          </ul>
          {nutrient.contributingMeals.length > 0 ? (
            <div>
              <p className="font-semibold text-foreground">
                Contributing meals
              </p>
              <ul className="mt-2 space-y-1">
                {nutrient.contributingMeals.map((contribution) => {
                  const meal = meals.get(contribution.mealId);
                  return (
                    <li key={contribution.mealId}>
                      <Link
                        className="font-semibold text-accent underline-offset-2 hover:underline"
                        href={`/meals/${contribution.mealId}`}
                      >
                        {meal?.items
                          .map((item) => item.displayNameSnapshot)
                          .join(', ') || 'Recorded meal'}
                      </Link>{' '}
                      · {contribution.amount} {nutrient.unit}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {nutrient.missingMealIds.length > 0 ? (
            <div>
              <p>
                {nutrient.missingMealIds.length} recorded meal(s) have missing
                composition for this nutrient; the known subtotal can be lower
                than the true recorded amount.
              </p>
              <ul
                aria-label="Meals with missing composition"
                className="mt-2 space-y-1"
              >
                {nutrient.missingMealIds.map((mealId) => {
                  const meal = meals.get(mealId);
                  const missingItems = meal?.items.filter((item) =>
                    nutrient.missingItemIds.includes(item.itemId),
                  );
                  return (
                    <li key={mealId}>
                      <Link
                        className="text-accent underline"
                        href={`/meals/${mealId}`}
                      >
                        Review recorded meal
                      </Link>
                      {missingItems?.length
                        ? ` · ${missingItems.map((item) => item.displayNameSnapshot).join(', ')}`
                        : ''}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {nutrient.target.status === 'NEEDS_INPUT' &&
          !nutrient.target.fields.includes('market') ? (
            <p>
              <Link className="text-accent underline" href="/start">
                Update your starting profile
              </Link>{' '}
              to resolve an age or physiological-reference question.
            </p>
          ) : null}
          {nutrient.target.status === 'READY' ? (
            <p>
              Reference:{' '}
              <a
                className="text-accent underline"
                href={nutrient.target.rule.source.url}
                rel="noreferrer"
                target="_blank"
              >
                {nutrient.target.rule.source.title}
              </a>{' '}
              ({nutrient.target.rule.source.edition}; provisional Nutrixx
              mapping).
            </p>
          ) : null}
          {nutrient.upperLimit.status === 'READY' &&
          nutrient.upperLimit.rule.value.kind === 'point' ? (
            <p>
              Upper-limit reference: {nutrient.upperLimit.rule.value.amount}{' '}
              {nutrient.unit} per day (
              {nutrient.upperLimit.rule.sourceScope.replaceAll('-', ' ')}).{' '}
              <a
                className="text-accent underline"
                href={nutrient.upperLimit.rule.source.url}
                rel="noreferrer"
                target="_blank"
              >
                {nutrient.upperLimit.rule.source.title}
              </a>
              . A recorded exceedance calls for a review of the entries and,
              when relevant, qualified advice; it is not a toxicity diagnosis.
            </p>
          ) : null}
        </div>
      </details>
    </article>
  );
}

export function NutritionWorkspace({ store }: { store?: NutritionStore }) {
  const runtimeRef = useRef<NutritionStore | null>(store ?? null);
  const [snapshot, setSnapshot] = useState<BrowserNutritionSnapshotV1 | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [selectedTimeZone, setSelectedTimeZone] = useState<string | null>(null);
  const [reviewTimeZone, setReviewTimeZone] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const runtime = runtimeRef.current ?? new BrowserNutritionStateStore();
      runtimeRef.current = runtime;
      setSnapshot(await runtime.load());
    } catch {
      setError(
        'Recorded nutrition could not be opened. Retry or use Storage Settings for recovery.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => {
        const runtime =
          store ?? runtimeRef.current ?? new BrowserNutritionStateStore();
        runtimeRef.current = runtime;
        return runtime.load();
      })
      .then((result) => {
        if (active) setSnapshot(result);
      })
      .catch(() => {
        if (active) {
          setError(
            'Recorded nutrition could not be opened. Retry or use Storage Settings for recovery.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [store]);

  async function changeMarket(market: NutritionTargetMarketV1) {
    setUpdating(true);
    setError(null);
    try {
      const runtime = runtimeRef.current ?? new BrowserNutritionStateStore();
      runtimeRef.current = runtime;
      await runtime.selectMarket(market);
      setSnapshot(await runtime.load());
    } catch {
      setError('The reference region could not be saved or recalculated.');
    } finally {
      setUpdating(false);
    }
  }

  async function changeTimeZone(timeZone: string) {
    if (snapshot === null) return;
    setUpdating(true);
    setError(null);
    try {
      const runtime = runtimeRef.current ?? new BrowserNutritionStateStore();
      runtimeRef.current = runtime;
      await runtime.scheduleTimeZoneChange(
        timeZone,
        snapshot.window.current.period.endsAt,
      );
      setSnapshot(await runtime.load());
      setReviewTimeZone(null);
      setSelectedTimeZone(null);
    } catch {
      setError(
        'The time zone change could not be saved. Refresh and review the next day boundary before trying again.',
      );
    } finally {
      setUpdating(false);
    }
  }

  if (loading && snapshot === null) {
    return <p role="status">Calculating recorded nutrition locally…</p>;
  }

  const currentPeriod = snapshot?.window.current.period;
  const pendingChange = snapshot?.dayPolicy.changes.find(
    (change) => currentPeriod && change.effectiveAt >= currentPeriod.endsAt,
  );
  const chosenTimeZone = selectedTimeZone ?? snapshot?.deviceTimeZone ?? 'UTC';
  const timeZoneOptions = snapshot
    ? Array.from(
        new Set([
          'UTC',
          currentPeriod?.timeZone ?? 'UTC',
          snapshot.deviceTimeZone,
          chosenTimeZone,
          ...Intl.supportedValuesOf('timeZone'),
        ]),
      ).sort()
    : [];
  const nextBoundary = currentPeriod
    ? new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: currentPeriod.timeZone,
      }).format(new Date(currentPeriod.endsAt))
    : '';

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-2xl border border-danger/30 p-5" role="alert">
          <p>{error}</p>
          <button
            className="mt-3 rounded-xl border border-separator px-4 py-2 font-semibold"
            onClick={() => {
              refresh().catch(() => undefined);
            }}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : null}
      {snapshot ? (
        <>
          <section className="rounded-[1.5rem] border border-separator bg-surface/75 p-6">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <h2 className="text-2xl font-semibold">
                  Recorded intake · {snapshot.window.current.period.localDate}
                </h2>
                <p className="mt-2 text-sm text-muted">
                  {snapshot.window.current.recordedMealCount} meal(s) recorded
                  today · {snapshot.window.current.period.timeZone} · calculated
                  in this browser
                </p>
              </div>
              <div>
                <label
                  className="block text-sm font-semibold"
                  htmlFor="nutrition-market"
                >
                  Reference region
                </label>
                <select
                  className="mt-2 rounded-xl border border-separator bg-background px-3 py-2"
                  disabled={updating}
                  id="nutrition-market"
                  onChange={(event) => {
                    if (
                      event.target.value === 'US' ||
                      event.target.value === 'CA'
                    ) {
                      changeMarket(event.target.value).catch(() => undefined);
                    }
                  }}
                  value={snapshot.market ?? ''}
                >
                  <option disabled value="">
                    Choose a region
                  </option>
                  <option value="US">United States</option>
                  <option value="CA">Canada</option>
                </select>
              </div>
            </div>
            {updating ? (
              <p className="mt-4" role="status">
                Recalculating with the selected reference…
              </p>
            ) : null}
            <button
              className="mt-4 rounded-xl border border-separator px-4 py-2 text-sm font-semibold"
              disabled={loading || updating}
              onClick={() => {
                refresh().catch(() => undefined);
              }}
              type="button"
            >
              {loading ? 'Refreshing…' : 'Refresh calculations'}
            </button>
            <p className="mt-5 text-sm leading-6 text-muted">
              These general-wellness estimates describe only meals recorded
              here. Unlogged meals remain unknown. A day with one meal is a
              partial picture; nutrient stores, personal adequacy, and clinical
              health require separate assessment.
            </p>
            <p className="mt-2 text-sm leading-6 text-muted">
              The provisional adult reference assumes an adult life stage
              outside pregnancy and lactation. Higher-risk situations need
              qualified care. Rule {snapshot.window.current.ruleVersion} ·
              target release {snapshot.window.current.targetReleaseId} · profile
              revision {snapshot.window.current.healthContextRevision}.
            </p>
            {snapshot.window.current.period.travelAdjusted ? (
              <p className="mt-3 text-sm text-muted">
                This travel-adjusted day uses a shortened period; daily target
                comparisons are withheld.
              </p>
            ) : null}
            <div className="mt-5 border-t border-separator pt-5">
              <h3 className="font-semibold">Nutrition-day time zone</h3>
              <p className="mt-2 text-sm text-muted">
                Current: {currentPeriod?.timeZone}. Device:{' '}
                {snapshot.deviceTimeZone}. Travel never changes your nutrition
                day without your confirmation.
              </p>
              {pendingChange ? (
                <p className="mt-2 text-sm" role="status">
                  Confirmed change to {pendingChange.timeZone} starts at{' '}
                  {nextBoundary} ({currentPeriod?.timeZone}).
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div>
                  <label
                    className="block text-sm font-semibold"
                    htmlFor="nutrition-day-time-zone"
                  >
                    New time zone
                  </label>
                  <select
                    className="mt-2 max-w-full rounded-xl border border-separator bg-background px-3 py-2"
                    disabled={updating}
                    id="nutrition-day-time-zone"
                    onChange={(event) => {
                      setSelectedTimeZone(event.target.value);
                      setReviewTimeZone(null);
                    }}
                    value={chosenTimeZone}
                  >
                    {timeZoneOptions.map((zone) => (
                      <option key={zone} value={zone}>
                        {zone}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  className="rounded-xl border border-separator px-4 py-2 text-sm font-semibold"
                  disabled={
                    updating || chosenTimeZone === currentPeriod?.timeZone
                  }
                  onClick={() => setReviewTimeZone(chosenTimeZone)}
                  type="button"
                >
                  Review time zone change
                </button>
                {pendingChange ? (
                  <button
                    className="rounded-xl border border-separator px-4 py-2 text-sm font-semibold"
                    disabled={updating}
                    onClick={() => {
                      changeTimeZone(
                        snapshot.window.current.period.timeZone,
                      ).catch(() => undefined);
                    }}
                    type="button"
                  >
                    Cancel pending change
                  </button>
                ) : null}
              </div>
              {reviewTimeZone ? (
                <div
                  aria-label="Confirm time zone change"
                  className="mt-4 rounded-xl border border-accent/40 p-4"
                  role="group"
                >
                  <p className="text-sm">
                    {currentPeriod?.timeZone} → {reviewTimeZone}. The change
                    starts at the next nutrition-day boundary: {nextBoundary} in{' '}
                    {currentPeriod?.timeZone}. Earlier days stay in their
                    original time zone. The transition day may be shorter or
                    longer, so target comparisons are withheld for that day.
                  </p>
                  <div className="mt-3 flex gap-3">
                    <button
                      className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-background"
                      disabled={updating}
                      onClick={() => {
                        changeTimeZone(reviewTimeZone).catch(() => undefined);
                      }}
                      type="button"
                    >
                      Confirm for next nutrition day
                    </button>
                    <button
                      className="rounded-xl border border-separator px-4 py-2 text-sm font-semibold"
                      onClick={() => setReviewTimeZone(null)}
                      type="button"
                    >
                      Keep current time zone
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            {snapshot.window.current.recordedMealCount === 0 ? (
              <p className="mt-4 text-sm">
                Start with a{' '}
                <Link className="text-accent underline" href="/meals">
                  recorded meal
                </Link>
                . Empty days remain unobserved in the seven-day trend.
              </p>
            ) : null}
          </section>
          <section aria-labelledby="nutrition-results-heading">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2
                  className="text-2xl font-semibold"
                  id="nutrition-results-heading"
                >
                  Nutrients from recorded meals
                </h2>
                <p className="mt-2 text-sm text-muted">
                  {
                    snapshot.window.completed.filter(
                      (day) => day.recordedMealCount > 0,
                    ).length
                  }{' '}
                  of 7 completed days include a meal record. Each nutrient keeps
                  its own evidence coverage.
                </p>
              </div>
              <button
                className="rounded-xl border border-separator px-4 py-2 text-sm font-semibold"
                onClick={() => setShowAll((value) => !value)}
                type="button"
              >
                {showAll ? 'Show key nutrients' : 'Show all nutrients'}
              </button>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {snapshot.window.current.nutrients
                .filter(
                  (nutrient) =>
                    showAll || featuredNutrients.has(nutrient.nutrientId),
                )
                .map((nutrient) => (
                  <NutritionCard
                    key={nutrient.nutrientId}
                    nutrient={nutrient}
                    snapshot={snapshot}
                  />
                ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
