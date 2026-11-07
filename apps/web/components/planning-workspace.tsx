'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { FoodPicker } from '@/components/food-picker';
import {
  NextMealExplanation,
  NextMealRunOverview,
} from '@/components/next-meal-explanation';
import { PaginationControls } from '@/components/pagination-controls';
import {
  BrowserPlanningStore,
  type LocalPlanningSnapshotV1,
} from '@/lib/browser-planning';
import { BrowserStageTwoStore } from '@/lib/browser-stage-two';
import type { DeclaredInventoryItemV1 } from '@/lib/next-meal-input';

import type { NextMealCandidateExplanationV1 } from '@nutrixx/optimizer-engine';

const PAGE_SIZE = 30;

function explanationLabel(explanation: NextMealCandidateExplanationV1): string {
  return explanation.reasonCodes.join(', ').replaceAll('-', ' ');
}

function inputGuidance(reasonCodes: readonly string[]): string {
  const guidance: Record<string, string> = {
    'nutrition-market-required':
      'Choose your nutrition reference region before requesting a recommendation.',
    'local-catalog-required':
      'Install the offline food catalog from the dashboard first.',
    'unverified-food-restrictions':
      'Your food restrictions require verified ingredient and allergen evidence before a safe ranking can be shown.',
    'travel-day-reference-unavailable':
      'Review the pending travel-day nutrition reference before ranking.',
    'comparable-nutrient-evidence-required':
      'The recorded meals or local catalog lack enough comparable nutrient evidence for a ranked recommendation.',
    'inventory-source-changed':
      'An available ingredient changed. Select it again from the current catalog.',
  };
  return reasonCodes
    .map((code) => guidance[code] ?? code.replaceAll('-', ' '))
    .join(' ');
}

function inputDestination(
  reasonCodes: readonly string[],
): 'nutrition' | 'dashboard' | null {
  if (reasonCodes.includes('local-catalog-required')) return 'dashboard';
  return reasonCodes.some(
    (code) =>
      code === 'nutrition-market-required' ||
      code === 'travel-day-reference-unavailable',
  )
    ? 'nutrition'
    : null;
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
  const [inventoryOnly, setInventoryOnly] = useState(false);
  const [inventory, setInventory] = useState<DeclaredInventoryItemV1[]>([]);
  const [pagination, setPagination] = useState<{
    readonly runId: string | null;
    readonly ranked: number;
    readonly unranked: number;
  }>({ runId: null, ranked: 0, unranked: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [planningProgress, setPlanningProgress] = useState<string | null>(null);
  const [inputLink, setInputLink] = useState<'nutrition' | 'dashboard' | null>(
    null,
  );
  const [mealType, setMealType] = useState<
    'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other'
  >('other');
  const [actualGrams, setActualGrams] = useState('');
  const activeOperation = useRef<AbortController | null>(null);

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
            'The saved recommendation could not be opened. Review Storage Settings.',
          );
      });
    return () => {
      active = false;
      activeOperation.current?.abort();
      activeOperation.current = null;
      planning.cancelActiveWorkers();
    };
  }, [planning]);

  useEffect(() => {
    const validUntil = snapshot?.run?.validUntil;
    if (!validUntil || !snapshot?.fresh) return;
    const timer = window.setTimeout(
      () =>
        setSnapshot((current) =>
          current?.run?.validUntil === validUntil
            ? { ...current, fresh: false }
            : current,
        ),
      Math.max(0, Date.parse(validUntil) - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [snapshot?.fresh, snapshot?.run?.validUntil]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible')
        void planning
          .load()
          .then(setSnapshot)
          .catch(() => {
            setError('The saved recommendation could not be opened.');
          });
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [planning]);

  async function perform(
    action: (signal: AbortSignal) => Promise<void>,
    refreshSnapshot = true,
  ): Promise<void> {
    activeOperation.current?.abort();
    const controller = new AbortController();
    activeOperation.current = controller;
    setBusy(true);
    setError(null);
    setNotice(null);
    setInputLink(null);
    try {
      await action(controller.signal);
      controller.signal.throwIfAborted();
      if (refreshSnapshot) setSnapshot(await planning.load(controller.signal));
    } catch (failure) {
      if (failure instanceof Error && failure.name === 'AbortError') {
        setPlanningProgress('Operation canceled.');
        return;
      }
      setPlanningProgress(null);
      setError(
        failure instanceof Error
          ? failure.message
          : 'Local planning is unavailable.',
      );
    } finally {
      if (activeOperation.current === controller) {
        activeOperation.current = null;
        setBusy(false);
      }
    }
  }

  function cancelActiveOperation(): void {
    activeOperation.current?.abort();
    planning.cancelActiveWorkers();
    setPlanningProgress('Canceling the active operation…');
  }

  const run = snapshot?.run;
  const ranked = run?.result.ranked ?? [];
  const explanations = new Map(
    run?.explanations.map((item) => [item.candidateKey, item]) ?? [],
  );
  const unranked =
    run?.explanations.filter((item) => item.classification !== 'COMPARABLE') ??
    [];
  const rankedPageCount = Math.max(1, Math.ceil(ranked.length / PAGE_SIZE));
  const unrankedPageCount = Math.max(1, Math.ceil(unranked.length / PAGE_SIZE));
  const currentPages =
    pagination.runId === (run?.runId ?? null)
      ? pagination
      : { runId: run?.runId ?? null, ranked: 0, unranked: 0 };
  const activeRankedPage = Math.min(currentPages.ranked, rankedPageCount - 1);
  const activeUnrankedPage = Math.min(
    currentPages.unranked,
    unrankedPageCount - 1,
  );
  const rankedPageRows = ranked.slice(
    activeRankedPage * PAGE_SIZE,
    (activeRankedPage + 1) * PAGE_SIZE,
  );
  const unrankedPageRows = unranked.slice(
    activeUnrankedPage * PAGE_SIZE,
    (activeUnrankedPage + 1) * PAGE_SIZE,
  );
  const selected = ranked.find(
    (row) => row.candidateKey === snapshot?.intention?.candidateKey,
  );

  function changePage(kind: 'ranked' | 'unranked', pageIndex: number): void {
    setPagination((current) => {
      const sameRun = current.runId === (run?.runId ?? null);
      return {
        runId: run?.runId ?? null,
        ranked: kind === 'ranked' ? pageIndex : sameRun ? current.ranked : 0,
        unranked:
          kind === 'unranked' ? pageIndex : sameRun ? current.unranked : 0,
      };
    });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-separator bg-surface p-6 sm:p-8">
        <h2 className="text-2xl font-semibold">Find your next meal</h2>
        <p className="mt-2 text-sm text-muted">
          Nutrixx ranks the installed local catalog using your recorded meals
          and available reference targets.
        </p>
        <label className="mt-5 flex items-center gap-3 text-sm">
          <input
            checked={inventoryOnly}
            onChange={(event) => setInventoryOnly(event.target.checked)}
            type="checkbox"
          />
          Use only ingredients I have available
        </label>
        {inventoryOnly ? (
          <div className="mt-5 space-y-4">
            <FoodPicker
              includeRecipes
              label="Add a food or ingredient you have"
              onSelect={(choice) =>
                setInventory((current) =>
                  current.some((item) => item.choice.key === choice.key)
                    ? current
                    : [
                        ...current,
                        { choice, edibleGrams: choice.defaultGramWeight },
                      ],
                )
              }
              store={foods}
            />
            <ul className="space-y-2" aria-label="Available ingredients">
              {inventory.map((item) => (
                <li
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-separator p-3"
                  key={item.choice.key}
                >
                  <span className="min-w-32 flex-1">{item.choice.name}</span>
                  <label className="text-sm">
                    Available edible grams
                    <input
                      className="ml-2 w-28 rounded-lg border border-separator bg-background px-2 py-1"
                      inputMode="decimal"
                      value={item.edibleGrams}
                      onChange={(event) =>
                        setInventory((current) =>
                          current.map((entry) =>
                            entry.choice.key === item.choice.key
                              ? { ...entry, edibleGrams: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    className="text-sm text-muted underline"
                    type="button"
                    onClick={() =>
                      setInventory((current) =>
                        current.filter(
                          (entry) => entry.choice.key !== item.choice.key,
                        ),
                      )
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <button
          className="mt-6 rounded-xl bg-accent px-5 py-3 font-semibold text-accent-foreground disabled:opacity-50"
          disabled={busy || (inventoryOnly && inventory.length === 0)}
          type="button"
          onClick={() => {
            setPlanningProgress('Starting the local ranking worker…');
            perform(async (signal) => {
              const result = await planning.createRecommendation(
                { inventory: inventoryOnly ? inventory : null },
                (progress) => setPlanningProgress(progress.message),
                signal,
              );
              if (result.status !== 'READY') {
                setNotice(inputGuidance(result.reasonCodes));
                setInputLink(inputDestination(result.reasonCodes));
              }
              setPlanningProgress(
                result.status === 'READY'
                  ? 'Ranking ready. Review the ordered foods below.'
                  : 'More information is needed before ranking can continue.',
              );
              setPagination({ runId: null, ranked: 0, unranked: 0 });
            }).catch(() => setError('Local planning is unavailable.'));
          }}
        >
          {busy ? 'Ranking the local catalog…' : 'Find my next meal'}
        </button>
        <p className="mt-3 text-xs text-muted">
          Nutrixx assumes you have logged everything consumed. A short or
          incomplete history makes the general-wellness estimate less reliable;
          more recorded history can improve it. Review the actual food and
          amount before recording a meal.
        </p>
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
          {notice}{' '}
          {inputLink ? (
            <Link className="underline" href={`/${inputLink}`}>
              Open {inputLink === 'nutrition' ? 'Nutrition' : 'Dashboard'}
            </Link>
          ) : null}
        </p>
      ) : null}
      {planningProgress ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/10 p-4 text-sm">
          <p role="status">{planningProgress}</p>
          {busy ? (
            <button
              className="rounded-lg border border-separator px-3 py-1.5 font-semibold"
              onClick={cancelActiveOperation}
              type="button"
            >
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}

      {run ? (
        <section className="rounded-[2rem] border border-separator bg-surface p-6 sm:p-8">
          <h2 className="text-2xl font-semibold">
            Ranked foods for your next meal
          </h2>
          <p className="mt-2 text-sm text-muted">
            {run.result.processed} of {run.result.total} catalog entries
            reviewed · {ranked.length} comparable.
          </p>
          {!snapshot?.fresh ? (
            <p className="mt-3 text-danger">
              Your recorded data, catalog, or the recommendation time window
              changed. Request a fresh recommendation.
            </p>
          ) : null}
          <NextMealRunOverview run={run} />
          {ranked.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              Available evidence did not support a comparable option. Review the
              reasons below.
            </p>
          ) : null}
          <ol className="mt-5 space-y-3">
            {rankedPageRows.map((row) => {
              const explanation = explanations.get(row.candidateKey);
              return (
                <li
                  className="rounded-xl border border-separator bg-background/60 p-4"
                  key={row.candidateKey}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">
                        {row.rank}.{' '}
                        {explanation?.displayName ?? row.candidateKey}
                      </h3>
                      <p className="mt-1 text-sm text-muted">
                        Suggested portion: {explanation?.edibleGrams ?? '—'} g
                        edible
                      </p>
                    </div>
                    <button
                      className="rounded-xl border border-separator px-4 py-2 text-sm font-semibold disabled:opacity-50"
                      disabled={
                        busy ||
                        !snapshot?.fresh ||
                        snapshot.loggedMealId !== null
                      }
                      onClick={() => {
                        setPlanningProgress(
                          'Starting the local selection worker…',
                        );
                        perform(async (signal) => {
                          const intention = await planning.selectForDisplay(
                            run.runId,
                            row.candidateKey,
                            (progress) => setPlanningProgress(progress.message),
                            signal,
                          );
                          setSnapshot((current) =>
                            current?.run?.runId === run.runId
                              ? { ...current, intention }
                              : current,
                          );
                          setActualGrams(explanation?.edibleGrams ?? '');
                          setPlanningProgress(
                            'Selection saved. Confirm what you actually ate below.',
                          );
                        }, false).catch(() =>
                          setError('The selected food could not be saved.'),
                        );
                      }}
                      type="button"
                    >
                      {snapshot?.intention?.candidateKey === row.candidateKey
                        ? 'Selected'
                        : 'Choose this food'}
                    </button>
                  </div>
                  {explanation?.comparisonCount ? (
                    <NextMealExplanation
                      explanation={explanation}
                      loadExplanation={(signal) =>
                        planning.loadExplanation(
                          run.runId,
                          row.candidateKey,
                          signal,
                        )
                      }
                      row={row}
                      run={run}
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>
          <PaginationControls
            label="Ranked foods"
            onPageChange={(pageIndex) => changePage('ranked', pageIndex)}
            pageIndex={activeRankedPage}
            pageSize={PAGE_SIZE}
            total={ranked.length}
          />
          {unranked.length ? (
            <details className="mt-6">
              <summary className="cursor-pointer font-semibold">
                Other catalog entries and evidence limits ({unranked.length})
              </summary>
              <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto text-sm">
                {unrankedPageRows.map((item) => (
                  <li
                    key={item.candidateKey}
                    className="rounded-lg border border-separator p-3"
                  >
                    {explanations.get(item.candidateKey)?.displayName ??
                      item.candidateKey}{' '}
                    · {item.classification.toLowerCase().replaceAll('_', ' ')}
                    <span className="ml-2 text-muted">
                      {explanationLabel(
                        explanations.get(item.candidateKey) ?? {
                          candidateKey: item.candidateKey,
                          displayName: item.candidateKey,
                          classification: item.classification,
                          reasonCodes: item.reasonCodes,
                        },
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <PaginationControls
                label="Other catalog entries"
                onPageChange={(pageIndex) => changePage('unranked', pageIndex)}
                pageIndex={activeUnrankedPage}
                pageSize={PAGE_SIZE}
                total={unranked.length}
              />
            </details>
          ) : null}
        </section>
      ) : null}

      {selected &&
      snapshot?.intention &&
      snapshot.fresh &&
      !snapshot.loggedMealId ? (
        <section className="rounded-[2rem] border border-accent/40 bg-surface p-6 sm:p-8">
          <h2 className="text-xl font-semibold">
            Record what you actually ate
          </h2>
          <p className="mt-2 text-sm text-muted">
            Selected: {explanations.get(selected.candidateKey)?.displayName} ·
            suggested {explanations.get(selected.candidateKey)?.edibleGrams} g.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <label className="text-sm">
              Meal type
              <select
                className="mt-1 block rounded-xl border border-separator bg-background px-3 py-2"
                value={mealType}
                onChange={(event) =>
                  setMealType(event.target.value as typeof mealType)
                }
              >
                {['breakfast', 'lunch', 'dinner', 'snack', 'other'].map(
                  (kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="text-sm">
              Actual edible grams
              <input
                className="mt-1 block rounded-xl border border-separator bg-background px-3 py-2"
                inputMode="decimal"
                value={actualGrams}
                onChange={(event) => setActualGrams(event.target.value)}
              />
            </label>
          </div>
          <button
            className="mt-5 rounded-xl bg-accent px-5 py-3 font-semibold text-accent-foreground disabled:opacity-50"
            disabled={busy || !actualGrams}
            onClick={() => {
              perform(async (signal) => {
                const mealId = await planning.logAsEaten({
                  intentionId: snapshot.intention!.intentionId,
                  mealType,
                  occurredAt: new Date().toISOString(),
                  edibleGrams: actualGrams,
                });
                setPlanningProgress(
                  'Meal recorded. Recalculating the next recommendation…',
                );
                let result;
                try {
                  result = await planning.createRecommendation(
                    { inventory: inventoryOnly ? inventory : null },
                    (progress) => setPlanningProgress(progress.message),
                    signal,
                  );
                } catch (failure) {
                  if (failure instanceof Error && failure.name === 'AbortError')
                    throw failure;
                  setNotice(`Meal recorded: ${mealId}`);
                  setError(
                    'The meal was recorded, but the next recommendation could not be recalculated.',
                  );
                  setPlanningProgress(null);
                  return;
                }
                if (result.status === 'READY') {
                  setNotice(
                    `Meal recorded: ${mealId}. Your next recommendation is ready.`,
                  );
                  setPlanningProgress(
                    'Feedback applied. Review the recalculated ranking below.',
                  );
                  setPagination({ runId: null, ranked: 0, unranked: 0 });
                  return;
                }
                setNotice(
                  `Meal recorded: ${mealId}. ${inputGuidance(result.reasonCodes)}`,
                );
                setInputLink(inputDestination(result.reasonCodes));
                setPlanningProgress(
                  'The meal was recorded. More information is needed before the next ranking can continue.',
                );
              }).catch(() =>
                setError('The meal operation could not be completed.'),
              );
            }}
            type="button"
          >
            Record as eaten
          </button>
        </section>
      ) : null}
      {snapshot?.loggedMealId ? (
        <p
          className="rounded-xl border border-separator p-4 text-sm"
          role="status"
        >
          Your actual meal was recorded.{' '}
          <Link className="underline" href={`/meals/${snapshot.loggedMealId}`}>
            View the meal
          </Link>
        </p>
      ) : null}
    </div>
  );
}
