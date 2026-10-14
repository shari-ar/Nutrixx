'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';

import {
  BrowserOutcomeFeedbackStore,
  summarizeOutcomeFeedbackV1,
} from '@/lib/browser-outcome-feedback';

import type { OutcomeObservationV1 } from '@nutrixx/user-context';

function localToday(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'The local record could not be saved.';
}

const store = new BrowserOutcomeFeedbackStore();

export function OutcomeFeedbackWorkspace() {
  const [observations, setObservations] = useState<
    readonly OutcomeObservationV1[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [weightDate, setWeightDate] = useState(localToday);
  const [weight, setWeight] = useState('');
  const [labDate, setLabDate] = useState(localToday);
  const [testName, setTestName] = useState('');
  const [result, setResult] = useState('');
  const [unit, setUnit] = useState('');
  const [laboratory, setLaboratory] = useState('');
  const summary = useMemo(
    () => summarizeOutcomeFeedbackV1(observations),
    [observations],
  );

  useEffect(() => {
    let active = true;
    store.list().then(
      (records) => {
        if (active) {
          setObservations(records);
          setLoading(false);
        }
      },
      (error: unknown) => {
        if (active) {
          setMessage(errorMessage(error));
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, []);

  async function refresh() {
    setObservations(await store.list());
  }

  async function saveWeight(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await store.saveWeight({
        observedOn: weightDate,
        weightKilograms: weight,
      });
      await refresh();
      setWeight('');
      setMessage('Weight observation saved on this device.');
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveLab(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await store.saveLab({
        observedOn: labDate,
        testName,
        result,
        unit,
        laboratory,
      });
      await refresh();
      setTestName('');
      setResult('');
      setUnit('');
      setLaboratory('');
      setMessage('Lab result saved on this device.');
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove(observationId: string) {
    setBusy(true);
    setMessage(null);
    try {
      await store.delete(observationId);
      await refresh();
      setPendingDeleteId(null);
      setMessage('Observation deleted.');
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="outcome-feedback-heading"
      className="mt-12 space-y-6"
    >
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">
          Optional feedback
        </p>
        <h2
          className="mt-2 text-2xl font-semibold"
          id="outcome-feedback-heading"
        >
          Weight and lab observations
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Keep a personal history of measurements on this device. These entries
          remain separate from recorded food intake and never change the
          next-meal ranking. Lab values are user-transcribed, unverified, and
          shown without diagnosis or treatment advice. Review results with your
          clinician.
        </p>
      </div>

      {message ? (
        <p
          aria-live="polite"
          className="rounded-xl border border-separator p-3 text-sm"
          role="status"
        >
          {message}
        </p>
      ) : null}
      {loading ? (
        <p className="text-sm text-muted">Loading local observations…</p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-[1.5rem] border border-separator bg-surface/75 p-5">
          <h3 className="text-lg font-semibold">Weight trend</h3>
          <p className="mt-2 text-sm text-muted">
            {summary.weightChangeKilograms === null
              ? 'Add two dated measurements to see the recorded change.'
              : `Recorded change from first to latest: ${summary.weightChangeKilograms > 0 ? '+' : ''}${summary.weightChangeKilograms} kg. This is a measurement trend, not a body-composition estimate.`}
          </p>
          <form
            className="mt-5 grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              saveWeight(event).catch((error: unknown) => {
                setMessage(errorMessage(error));
              });
            }}
          >
            <label className="text-sm font-medium">
              Measurement date
              <input
                className="mt-1 block w-full rounded-xl border border-separator bg-background px-3 py-2"
                max={localToday()}
                onChange={(event) => setWeightDate(event.target.value)}
                required
                type="date"
                value={weightDate}
              />
            </label>
            <label className="text-sm font-medium">
              Weight (kg)
              <input
                className="mt-1 block w-full rounded-xl border border-separator bg-background px-3 py-2"
                inputMode="decimal"
                onChange={(event) => setWeight(event.target.value)}
                placeholder="72.5"
                required
                type="text"
                value={weight}
              />
            </label>
            <button
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-background sm:col-span-2"
              disabled={busy || loading}
              type="submit"
            >
              Save weight
            </button>
          </form>
          <ol aria-label="Recorded weights" className="mt-5 space-y-2">
            {summary.weights.map((entry) => (
              <li
                className="flex items-center justify-between gap-3 rounded-xl bg-background/70 p-3 text-sm"
                key={entry.observationId}
              >
                <span>
                  {entry.observedOn} · {entry.weightKilograms} kg
                </span>
                {pendingDeleteId === entry.observationId ? (
                  <span className="flex gap-2">
                    <button
                      className="text-accent underline"
                      disabled={busy}
                      onClick={() => {
                        remove(entry.observationId).catch((error: unknown) => {
                          setMessage(errorMessage(error));
                        });
                      }}
                      type="button"
                    >
                      Confirm delete
                    </button>
                    <button
                      className="underline"
                      disabled={busy}
                      onClick={() => setPendingDeleteId(null)}
                      type="button"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    className="text-accent underline"
                    disabled={busy}
                    onClick={() => setPendingDeleteId(entry.observationId)}
                    type="button"
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-[1.5rem] border border-separator bg-surface/75 p-5">
          <h3 className="text-lg font-semibold">Lab result history</h3>
          <p className="mt-2 text-sm text-muted">
            Repeated results are grouped only when test name, unit, and
            laboratory match exactly. Methods and reference ranges may still
            differ.
          </p>
          <form
            className="mt-5 grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              saveLab(event).catch((error: unknown) => {
                setMessage(errorMessage(error));
              });
            }}
          >
            <label className="text-sm font-medium">
              Report date
              <input
                className="mt-1 block w-full rounded-xl border border-separator bg-background px-3 py-2"
                max={localToday()}
                onChange={(event) => setLabDate(event.target.value)}
                required
                type="date"
                value={labDate}
              />
            </label>
            <label className="text-sm font-medium">
              Test name
              <input
                className="mt-1 block w-full rounded-xl border border-separator bg-background px-3 py-2"
                maxLength={120}
                onChange={(event) => setTestName(event.target.value)}
                placeholder="Ferritin"
                required
                type="text"
                value={testName}
              />
            </label>
            <label className="text-sm font-medium">
              Reported value
              <input
                className="mt-1 block w-full rounded-xl border border-separator bg-background px-3 py-2"
                inputMode="decimal"
                onChange={(event) => setResult(event.target.value)}
                placeholder="45"
                required
                type="text"
                value={result}
              />
            </label>
            <label className="text-sm font-medium">
              Unit as reported
              <input
                className="mt-1 block w-full rounded-xl border border-separator bg-background px-3 py-2"
                maxLength={40}
                onChange={(event) => setUnit(event.target.value)}
                placeholder="ng/mL"
                required
                type="text"
                value={unit}
              />
            </label>
            <label className="text-sm font-medium sm:col-span-2">
              Laboratory as reported
              <input
                className="mt-1 block w-full rounded-xl border border-separator bg-background px-3 py-2"
                maxLength={120}
                onChange={(event) => setLaboratory(event.target.value)}
                required
                type="text"
                value={laboratory}
              />
            </label>
            <button
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-background sm:col-span-2"
              disabled={busy || loading}
              type="submit"
            >
              Save lab result
            </button>
          </form>
          <div className="mt-5 space-y-4">
            {summary.labSeries.map((series) => (
              <div
                className="rounded-xl bg-background/70 p-3"
                key={JSON.stringify([
                  series.testName,
                  series.unit,
                  series.laboratory,
                ])}
              >
                <h4 className="text-sm font-semibold">
                  {series.testName} · {series.unit}
                </h4>
                <p className="text-xs text-muted">
                  {series.laboratory} · {series.observations.length} recorded
                  result(s)
                </p>
                <ol className="mt-2 space-y-2">
                  {series.observations.map((entry) => (
                    <li
                      className="flex items-center justify-between gap-3 text-sm"
                      key={entry.observationId}
                    >
                      <span>
                        {entry.observedOn} · {entry.result} {entry.unit}
                      </span>
                      {pendingDeleteId === entry.observationId ? (
                        <span className="flex gap-2">
                          <button
                            className="text-accent underline"
                            disabled={busy}
                            onClick={() => {
                              remove(entry.observationId).catch(
                                (error: unknown) => {
                                  setMessage(errorMessage(error));
                                },
                              );
                            }}
                            type="button"
                          >
                            Confirm delete
                          </button>
                          <button
                            className="underline"
                            disabled={busy}
                            onClick={() => setPendingDeleteId(null)}
                            type="button"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          className="text-accent underline"
                          disabled={busy}
                          onClick={() =>
                            setPendingDeleteId(entry.observationId)
                          }
                          type="button"
                        >
                          Delete
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
