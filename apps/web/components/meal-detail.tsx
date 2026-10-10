'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { BrowserStageTwoStore } from '@/lib/browser-stage-two';

import type { MealRevisionV1 } from '@nutrixx/consumption';

type MealHistoryStore = Pick<BrowserStageTwoStore, 'mealHistory'>;

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
        ) : (
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            {current.nutrition.map((nutrient) => (
              <div
                className="rounded-xl bg-background/60 p-4"
                key={nutrient.nutrientId}
              >
                <dt className="font-medium">{nutrient.nutrientId}</dt>
                <dd className="mt-1 text-sm text-muted">
                  {nutrient.state === 'known'
                    ? `${nutrient.amount} ${nutrient.unit.code}`
                    : `Incomplete evidence${nutrient.knownAmount && nutrient.unit ? ` · known part ${nutrient.knownAmount} ${nutrient.unit.code}` : ''}`}
                </dd>
              </div>
            ))}
          </dl>
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
