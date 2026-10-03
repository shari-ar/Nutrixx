'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  clearAllLocalData,
  downloadVerifiedLocalExport,
  readBrowserStorageSnapshot,
  requestBrowserPersistence,
  type BrowserStorageSnapshot,
} from '@/lib/browser-storage';

const pressureStyles = {
  critical: 'bg-red-500/10 text-red-700 dark:text-red-300',
  healthy: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  unknown: 'bg-zinc-500/10 text-muted',
  warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
} as const;

function formatBytes(value: number | null): string {
  if (value === null) return 'Unknown';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let current = value / 1024;
  let unit = units[0];
  for (const candidate of units.slice(1)) {
    if (current < 1024) break;
    current /= 1024;
    unit = candidate;
  }
  return `${current.toFixed(current >= 10 ? 1 : 2)} ${unit}`;
}

function formatDate(value: string | null): string {
  if (value === null) return 'No verified export yet';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusCopy(snapshot: BrowserStorageSnapshot) {
  const retention = {
    'best-effort': 'Best effort',
    persistent: 'Persistent',
    unavailable: 'Unavailable',
    unknown: 'Unknown',
  }[snapshot.retention];
  return { retention, pressure: snapshot.pressure.state };
}

export function StorageStatusPanel() {
  const [snapshot, setSnapshot] = useState<BrowserStorageSnapshot | null>(null);
  const [busy, setBusy] = useState<'clear' | 'export' | 'persist' | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setSnapshot(await readBrowserStorageSnapshot());
  }, []);

  useEffect(() => {
    let active = true;
    readBrowserStorageSnapshot().then(
      (nextSnapshot) => {
        if (active) setSnapshot(nextSnapshot);
      },
      () => {
        if (active) {
          setMessage('Storage status could not be read in this browser.');
        }
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const run = async (
    operation: NonNullable<typeof busy>,
    action: () => Promise<string>,
  ) => {
    setBusy(operation);
    setMessage(null);
    try {
      setMessage(await action());
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'The storage operation could not be completed.',
      );
    } finally {
      setBusy(null);
    }
  };

  if (snapshot === null) {
    return (
      <div
        aria-live="polite"
        className="mt-10 rounded-[1.5rem] border border-separator bg-surface/75 p-6 text-muted"
      >
        Reading this browser&apos;s storage status…
      </div>
    );
  }

  const copy = statusCopy(snapshot);
  const capacity = `${formatBytes(snapshot.pressure.usageBytes)} of ${formatBytes(snapshot.pressure.quotaBytes)}`;

  return (
    <div className="mt-10 space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[1.5rem] border border-separator bg-surface/75 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">
            Authority
          </p>
          <h2 className="mt-3 text-xl font-semibold">Local</h2>
          <p className="mt-2 text-sm text-muted">This browser profile only</p>
        </article>
        <article className="rounded-[1.5rem] border border-separator bg-surface/75 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">
            Retention
          </p>
          <h2 className="mt-3 text-xl font-semibold">{copy.retention}</h2>
          <p className="mt-2 text-sm text-muted">
            {snapshot.online
              ? 'Online now'
              : 'Offline now · local data available'}
          </p>
        </article>
        <article className="rounded-[1.5rem] border border-separator bg-surface/75 p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">
              Capacity
            </p>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${pressureStyles[snapshot.pressure.state]}`}
            >
              {copy.pressure}
            </span>
          </div>
          <h2 className="mt-3 text-xl font-semibold">{capacity}</h2>
          <p className="mt-2 text-sm text-muted">
            Approximate browser estimate
          </p>
        </article>
        <article className="rounded-[1.5rem] border border-separator bg-surface/75 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">
            Last export
          </p>
          <h2 className="mt-3 text-base font-semibold">
            {formatDate(snapshot.lastVerifiedExportAt)}
          </h2>
          <p className="mt-2 text-sm text-muted">Verified before download</p>
        </article>
      </section>

      <section className="rounded-[1.5rem] border border-separator bg-surface/75 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <h2 className="text-xl font-semibold">
              Protect data on this device
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Ask the browser to reduce automatic eviction risk. This is not a
              backup and cannot protect against device loss or manual deletion.
            </p>
          </div>
          <button
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
            disabled={
              busy !== null ||
              snapshot.retention === 'persistent' ||
              snapshot.retention === 'unavailable'
            }
            onClick={() => {
              run('persist', async () => {
                const result = await requestBrowserPersistence();
                if (result === 'granted')
                  return 'Persistent storage was granted.';
                if (result === 'denied') {
                  return 'The browser did not grant persistent storage. Export regularly.';
                }
                return 'Persistent storage is unavailable in this browser.';
              }).catch(() => undefined);
            }}
            type="button"
          >
            {busy === 'persist' ? 'Requesting…' : 'Protect data'}
          </button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-[1.5rem] border border-separator bg-surface/75 p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">
            Recovery copy
          </p>
          <h2 className="mt-3 text-xl font-semibold">Export local data</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Download a versioned JSON artifact after its manifest, record seals,
            transaction replay, and SHA-256 digest pass validation.
          </p>
          <button
            className="mt-5 rounded-xl border border-separator px-4 py-2.5 text-sm font-semibold transition hover:border-accent/50 disabled:opacity-50"
            disabled={busy !== null}
            onClick={() => {
              run('export', async () => {
                await downloadVerifiedLocalExport();
                return 'A verified export was handed to your browser.';
              }).catch(() => undefined);
            }}
            type="button"
          >
            {busy === 'export' ? 'Verifying…' : 'Download verified export'}
          </button>
        </article>

        <article className="rounded-[1.5rem] border border-red-500/20 bg-red-500/5 p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-red-700 dark:text-red-300">
            Destructive action
          </p>
          <h2 className="mt-3 text-xl font-semibold">Clear local data</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Permanently remove canonical records, transaction history, reference
            cache, and local export status from this browser profile.
          </p>
          {!confirmingClear ? (
            <button
              className="mt-5 rounded-xl border border-red-500/30 px-4 py-2.5 text-sm font-semibold text-red-700 dark:text-red-300"
              disabled={busy !== null}
              onClick={() => setConfirmingClear(true)}
              type="button"
            >
              Review clear operation
            </button>
          ) : (
            <div className="mt-5 rounded-xl border border-red-500/25 bg-background/60 p-4">
              <p className="text-sm font-medium">
                This cannot be undone. Download an export first if you need a
                recovery copy.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  className="rounded-lg border border-separator px-3 py-2 text-sm font-semibold"
                  disabled={busy !== null}
                  onClick={() => {
                    run('export', async () => {
                      await downloadVerifiedLocalExport();
                      return 'A verified export was handed to your browser.';
                    }).catch(() => undefined);
                  }}
                  type="button"
                >
                  Export first
                </button>
                <button
                  className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={busy !== null}
                  onClick={() => {
                    run('clear', async () => {
                      await clearAllLocalData();
                      setConfirmingClear(false);
                      return 'All Nutrixx local data was cleared from this browser.';
                    }).catch(() => undefined);
                  }}
                  type="button"
                >
                  {busy === 'clear'
                    ? 'Clearing…'
                    : 'Permanently clear local data'}
                </button>
                <button
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-muted"
                  disabled={busy !== null}
                  onClick={() => setConfirmingClear(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </article>
      </section>

      <section className="rounded-[1.5rem] border border-separator bg-surface/50 p-5 text-sm text-muted">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt>Canonical schema</dt>
            <dd className="mt-1 font-semibold text-foreground">
              v{snapshot.canonicalSchemaVersion}
            </dd>
          </div>
          <div>
            <dt>Browser database</dt>
            <dd className="mt-1 font-semibold text-foreground">
              v{snapshot.databaseSchemaVersion}
            </dd>
          </div>
          <div>
            <dt>Reference release</dt>
            <dd className="mt-1 font-semibold text-foreground">
              {snapshot.activeReferenceRelease ??
                `None active · cache schema v${snapshot.referenceCacheSchemaVersion}`}
            </dd>
          </div>
        </dl>
      </section>

      <p
        aria-live="polite"
        className="min-h-6 text-sm text-muted"
        role="status"
      >
        {message}
      </p>
    </div>
  );
}
