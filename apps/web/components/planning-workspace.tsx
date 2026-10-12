'use client';

import { useEffect, useMemo, useState } from 'react';

import { FoodPicker } from '@/components/food-picker';
import {
  BrowserPlanningStore,
  type LocalPlanningSnapshotV1,
} from '@/lib/browser-planning';
import { BrowserStageTwoStore, type FoodChoice } from '@/lib/browser-stage-two';

import type { PlanningRunV1 } from '@nutrixx/optimizer-engine';

const defaultLabels = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const slotKeys = ['breakfast-slot', 'lunch-slot', 'dinner-slot', 'snack-slot'];

function selectedMeals(run: PlanningRunV1) {
  if (run.outcome.status !== 'READY') return [];
  return run.outcome.draft.selections.flatMap((selection) => {
    const slot = run.input.slots.find(
      (item) => item.slotId === selection.slotId,
    );
    const candidate =
      slot?.state === 'open'
        ? slot.candidates.find(
            (item) => item.candidateId === selection.candidateId,
          )
        : undefined;
    const portion = candidate?.portions.find(
      (item) => item.portionId === selection.portionId,
    );
    return slot && candidate && portion
      ? [
          {
            ...selection,
            slotLabel: slot.label,
            name: candidate.displayNameSnapshot,
            grams: portion.edibleGrams,
          },
        ]
      : [];
  });
}

export function PlanningWorkspace() {
  const planning = useMemo(() => new BrowserPlanningStore(), []);
  const foods = useMemo(
    () => ({
      searchFoods: (query: string, includeRecipes?: boolean) =>
        new BrowserStageTwoStore().searchFoods(query, includeRecipes),
    }),
    [],
  );
  const [snapshot, setSnapshot] = useState<LocalPlanningSnapshotV1 | null>(
    null,
  );
  const [choices, setChoices] = useState<FoodChoice[]>([]);
  const [day, setDay] = useState<'today' | 'tomorrow'>('today');
  const [labels, setLabels] = useState(defaultLabels.slice(0, 3));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void planning
      .load()
      .then((value) => {
        if (active) setSnapshot(value);
      })
      .catch(() => {
        if (active)
          setError(
            'Local plans could not be opened. Retry or review Storage Settings.',
          );
      });
    return () => {
      active = false;
    };
  }, [planning]);

  async function refresh() {
    setSnapshot(await planning.load());
  }

  async function perform(operation: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await operation();
      await refresh();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Local planning is unavailable.',
      );
    } finally {
      setBusy(false);
    }
  }

  function run(operation: () => Promise<void>): void {
    perform(operation).catch((failure: unknown) => {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Local planning is unavailable.',
      );
      setBusy(false);
    });
  }

  const draftMeals = snapshot?.draftRun ? selectedMeals(snapshot.draftRun) : [];
  const activeMeals = snapshot?.activeRun
    ? selectedMeals(snapshot.activeRun)
    : [];

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-separator bg-surface p-6 sm:p-8">
        <h2 className="text-2xl font-semibold">Request a local day plan</h2>
        <p className="mt-2 text-sm text-muted">
          Select a day and some foods or recipes you would consider. The planner
          checks local nutrient evidence and proposes one validated option per
          open slot.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <label className="text-sm font-medium">
            Planning day
            <select
              className="mt-2 block rounded-xl border border-separator bg-background px-3 py-2"
              value={day}
              onChange={(event) =>
                setDay(event.target.value as 'today' | 'tomorrow')
              }
            >
              <option value="today">Today</option>
              <option value="tomorrow">Tomorrow</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Open meal slots
            <select
              className="mt-2 block rounded-xl border border-separator bg-background px-3 py-2"
              value={labels.length}
              onChange={(event) =>
                setLabels((current) =>
                  defaultLabels
                    .slice(0, Number(event.target.value))
                    .map((label, index) => current[index] ?? label),
                )
              }
            >
              {[1, 2, 3, 4].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {labels.map((label, index) => (
            <label className="text-sm font-medium" key={slotKeys[index]}>
              Slot {index + 1}
              <input
                className="mt-2 block w-full rounded-xl border border-separator bg-background px-3 py-2"
                maxLength={80}
                onChange={(event) =>
                  setLabels((current) =>
                    current.map((value, position) =>
                      position === index ? event.target.value : value,
                    ),
                  )
                }
                value={label}
              />
            </label>
          ))}
        </div>
        <div className="mt-6">
          <FoodPicker
            includeRecipes
            label="Search candidate foods or recipes"
            onSelect={(choice) =>
              setChoices((current) =>
                current.some((item) => item.key === choice.key)
                  ? current
                  : [...current, choice].slice(0, 24),
              )
            }
            store={foods}
          />
        </div>
        {choices.length > 0 ? (
          <ul
            aria-label="Selected planning candidates"
            className="mt-5 flex flex-wrap gap-2"
          >
            {choices.map((choice) => (
              <li
                className="flex items-center gap-2 rounded-xl border border-separator px-3 py-2 text-sm"
                key={choice.key}
              >
                {choice.name}
                <button
                  aria-label={`Remove ${choice.name}`}
                  className="font-bold text-muted"
                  onClick={() =>
                    setChoices((current) =>
                      current.filter((item) => item.key !== choice.key),
                    )
                  }
                  type="button"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <button
          className="mt-6 rounded-xl bg-accent px-5 py-3 font-semibold text-accent-foreground disabled:opacity-50"
          disabled={busy || choices.length === 0}
          onClick={() =>
            run(async () => {
              const result = await planning.createDraft({
                day,
                openSlotLabels: labels,
                choices,
              });
              if (result.status !== 'READY') {
                setNotice(
                  `A validated plan is unavailable: ${result.reasonCodes.join(', ')}.`,
                );
              }
            })
          }
          type="button"
        >
          {busy ? 'Checking local plan…' : 'Build local plan'}
        </button>
      </section>

      {error ? (
        <p
          className="rounded-xl border border-danger/30 p-4 text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-xl border border-separator p-4" role="status">
          {notice}
        </p>
      ) : null}

      {snapshot?.draft && snapshot.draftRun ? (
        <section className="rounded-[2rem] border border-accent/40 bg-surface p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">
            Validated draft
          </p>
          <h2 className="mt-2 text-2xl font-semibold">
            Review your proposed meals
          </h2>
          {!snapshot.draftFresh ? (
            <p className="mt-3 text-danger">
              This draft is stale. Request a new plan before accepting it.
            </p>
          ) : null}
          <ul className="mt-5 space-y-3">
            {draftMeals.map((meal) => (
              <li className="rounded-xl bg-background/60 p-4" key={meal.slotId}>
                <strong>
                  {meal.slotLabel}: {meal.name}
                </strong>
                <span className="ml-2 text-sm text-muted">
                  {meal.grams} g edible
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted">
            One feasible option from a bounded local search. Nutrient amounts
            are shown only when source evidence is complete.
          </p>
          {snapshot.draft.review.explanation.nutrientClaims.length > 0 ? (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {snapshot.draft.review.explanation.nutrientClaims
                .slice(0, 8)
                .map((claim) => (
                  <li
                    className="rounded-xl border border-separator p-3 text-sm"
                    key={claim.ruleId}
                  >
                    {claim.nutrientId}: {claim.observedAmount} {claim.unit.code}{' '}
                    {claim.relation} {claim.targetAmount} {claim.unit.code}
                  </li>
                ))}
            </ul>
          ) : null}
          {snapshot.draft.review.explanation.limitationCodes.length > 0 ? (
            <p className="mt-4 text-sm text-muted">
              Evidence limits:{' '}
              {snapshot.draft.review.explanation.limitationCodes
                .slice(0, 8)
                .join(', ')}
            </p>
          ) : null}
          {snapshot.draft.review.alternatives.length > 0 ? (
            <div className="mt-5">
              <h3 className="font-semibold">Validated alternatives</h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {snapshot.draft.review.alternatives.map((item) => {
                  const slot = snapshot.draftRun!.input.slots.find(
                    (entry) => entry.slotId === item.slotId,
                  );
                  const candidate =
                    slot?.state === 'open'
                      ? slot.candidates.find(
                          (entry) =>
                            entry.candidateId === item.replacement.candidateId,
                        )
                      : undefined;
                  return (
                    <li
                      key={`${item.slotId}:${item.replacement.candidateId}:${item.replacement.portionId}`}
                    >
                      <button
                        className="rounded-xl border border-separator px-3 py-2 text-sm"
                        disabled={busy || !snapshot.draftFresh}
                        onClick={() =>
                          run(async () => {
                            await planning.substitute(
                              snapshot.draft!.draftId,
                              item.slotId,
                              item.replacement.candidateId,
                              item.replacement.portionId,
                            );
                          })
                        }
                        type="button"
                      >
                        Use {candidate?.displayNameSnapshot ?? 'alternative'}{' '}
                        instead
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          <div className="mt-6 flex gap-3">
            <button
              className="rounded-xl bg-accent px-5 py-3 font-semibold text-accent-foreground disabled:opacity-50"
              disabled={busy || !snapshot.draftFresh}
              onClick={() =>
                run(() => planning.accept(snapshot.draft!.draftId))
              }
              type="button"
            >
              Accept plan
            </button>
            <button
              className="rounded-xl border border-separator px-5 py-3 font-semibold"
              disabled={busy}
              onClick={() =>
                run(() => planning.discard(snapshot.draft!.draftId))
              }
              type="button"
            >
              Discard draft
            </button>
          </div>
        </section>
      ) : null}

      {snapshot?.active && snapshot.activeRun ? (
        <section className="rounded-[2rem] border border-separator bg-surface p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">
            Accepted plan · revision {snapshot.active.revision}
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Your day plan</h2>
          {!snapshot.activeFresh ? (
            <p className="mt-3 text-danger">
              This plan is historical because the day or source data changed.
              Build a new plan for a current suggestion.
            </p>
          ) : null}
          <ul className="mt-5 space-y-3">
            {activeMeals.map((meal) => (
              <li className="rounded-xl bg-background/60 p-4" key={meal.slotId}>
                {meal.slotLabel}: <strong>{meal.name}</strong> · {meal.grams} g
                edible
              </li>
            ))}
          </ul>
          {snapshot.activeFresh &&
          snapshot.activeReview?.alternatives.length ? (
            <div className="mt-5">
              <h3 className="font-semibold">Change a proposed meal</h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {snapshot.activeReview.alternatives.map((item) => {
                  const slot = snapshot.activeRun!.input.slots.find(
                    (entry) => entry.slotId === item.slotId,
                  );
                  const candidate =
                    slot?.state === 'open'
                      ? slot.candidates.find(
                          (entry) =>
                            entry.candidateId === item.replacement.candidateId,
                        )
                      : undefined;
                  return (
                    <li
                      key={`${item.slotId}:${item.replacement.candidateId}:${item.replacement.portionId}`}
                    >
                      <button
                        className="rounded-xl border border-separator px-3 py-2 text-sm"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await planning.substitute(
                              snapshot.active!.draftId,
                              item.slotId,
                              item.replacement.candidateId,
                              item.replacement.portionId,
                            );
                          })
                        }
                        type="button"
                      >
                        Review {candidate?.displayNameSnapshot ?? 'alternative'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          <p className="mt-4 text-sm text-muted">
            Logging a meal records what you actually ate in the separate meal
            ledger.
          </p>
        </section>
      ) : null}
      {snapshot && snapshot.history.length > 1 ? (
        <p className="text-sm text-muted">
          {snapshot.history.length} accepted plan revisions are retained in
          local history and export.
        </p>
      ) : null}
    </div>
  );
}
