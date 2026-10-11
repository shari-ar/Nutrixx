'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import {
  BrowserNutritionStateStore,
  type BrowserEnergyRequirementV1,
  type NutritionActivityLevelV1,
} from '@/lib/browser-nutrition-state';

type EnergyStore = Pick<
  BrowserNutritionStateStore,
  'loadEnergyRequirement' | 'selectActivityLevel'
>;

const levels = [
  { value: 'inactive', label: 'Inactive' },
  { value: 'low', label: 'Low active' },
  { value: 'active', label: 'Active' },
  { value: 'very-active', label: 'Very active' },
] as const;

export function ActivityLevelPanel({ store }: { store?: EnergyStore }) {
  const runtime = useMemo<EnergyStore>(
    () => store ?? new BrowserNutritionStateStore(),
    [store],
  );
  const [snapshot, setSnapshot] = useState<BrowserEnergyRequirementV1 | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void runtime
      .loadEnergyRequirement()
      .then(
        (result) => {
          if (active) setSnapshot(result);
        },
        () => {
          if (active) setError('Activity context could not be opened locally.');
        },
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [runtime]);

  async function select(level: NutritionActivityLevelV1) {
    setSaving(true);
    setError(null);
    try {
      await runtime.selectActivityLevel(level);
      setSnapshot(await runtime.loadEnergyRequirement());
    } catch {
      setError('Your activity level could not be saved. Please retry.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p role="status">Opening your local activity context…</p>;

  const result = snapshot?.result;
  return (
    <section className="max-w-3xl rounded-[1.5rem] border border-separator bg-surface/75 p-6 sm:p-8">
      <h2 className="text-2xl font-semibold">Usual physical activity</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Choose your usual overall category, rather than a single workout. This
        optional detail stays in this browser and can be changed later.
      </p>
      <label
        className="mt-5 block text-sm font-semibold"
        htmlFor="usual-activity-level"
      >
        Activity category
      </label>
      <select
        className="mt-2 w-full max-w-sm rounded-xl border border-separator bg-background px-3 py-2.5"
        disabled={saving || snapshot === null}
        id="usual-activity-level"
        onChange={(event) => {
          const value = event.target.value;
          if (levels.some((level) => level.value === value)) {
            select(value as NutritionActivityLevelV1).catch(() => undefined);
          }
        }}
        value={snapshot?.activityLevel ?? ''}
      >
        <option value="">Choose when ready</option>
        {levels.map((level) => (
          <option key={level.value} value={level.value}>
            {level.label}
          </option>
        ))}
      </select>
      {saving ? (
        <p className="mt-3 text-sm" role="status">
          Updating estimate…
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {result?.status === 'READY' ? (
        <div className="mt-7 rounded-2xl bg-background/60 p-5">
          <p className="text-sm font-semibold text-muted">
            Estimated weight-maintenance energy
          </p>
          <p className="mt-2 text-3xl font-semibold">
            {result.maintenanceKilocaloriesPerDay.minimum ===
            result.maintenanceKilocaloriesPerDay.maximum
              ? result.maintenanceKilocaloriesPerDay.minimum
              : `${result.maintenanceKilocaloriesPerDay.minimum}–${result.maintenanceKilocaloriesPerDay.maximum}`}{' '}
            kcal/day
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            This is a provisional population-equation estimate for maintaining
            weight, based on your starting profile and selected activity
            category. It is separate from a weight-change plan or a personal
            measurement of energy expenditure.
          </p>
          <p className="mt-3 text-sm text-muted">
            Source:{' '}
            <a
              className="text-accent underline"
              href={result.source.url}
              rel="noreferrer"
              target="_blank"
            >
              {result.source.authority}, {result.source.edition}
            </a>
            {' · '}Rule {result.ruleVersion}
          </p>
        </div>
      ) : result?.status === 'NEEDS_INPUT' ? (
        <p className="mt-6 rounded-xl bg-background/60 p-4 text-sm">
          {result.fields.includes('activity-level')
            ? 'Choose an activity category to calculate a maintenance estimate.'
            : 'The estimate needs a more specific starting profile.'}{' '}
          {result.fields.includes('activity-level') ? null : (
            <Link className="text-accent underline" href="/start">
              Review your profile
            </Link>
          )}
        </p>
      ) : result?.status === 'OUT_OF_SCOPE' ? (
        <p className="mt-6 rounded-xl bg-background/60 p-4 text-sm">
          This provisional energy equation does not cover the current context.
        </p>
      ) : null}
      <p className="mt-5 text-sm leading-6 text-muted">
        Activity and sleep events will have their own local logging workflow in
        a later stage; this setting describes a usual category for the energy
        equation.
      </p>
    </section>
  );
}
