'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  applyReviewedEditableLocalFile,
  clearAllLocalData,
  downloadEditableLocalFile,
  downloadVerifiedLocalExport,
  identifyLocalFile,
  inspectEditableLocalFile,
  inspectLocalExport,
  readBrowserStorageSnapshot,
  requestBrowserPersistence,
  restoreVerifiedLocalExport,
  type BrowserStorageSnapshot,
  type LocalFileIdentityV1,
  type VerifiedLocalRestoreV1,
} from '@/lib/browser-storage';

import type {
  EditableChangeKind,
  EditableImportPreviewV1,
} from '@nutrixx/persistence';

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

const CHANGE_KINDS: readonly EditableChangeKind[] = [
  'add',
  'correct',
  'delete',
  'unchanged',
  'conflict',
];

function changeCounts(preview: EditableImportPreviewV1) {
  return Object.fromEntries(
    CHANGE_KINDS.map((kind) => [
      kind,
      preview.changes.filter((change) => change.kind === kind).length,
    ]),
  ) as Record<EditableChangeKind, number>;
}

export function StorageStatusPanel() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<BrowserStorageSnapshot | null>(null);
  const [busy, setBusy] = useState<
    'clear' | 'export' | 'inspect' | 'persist' | 'restore' | null
  >(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [exportKind, setExportKind] = useState<
    'editable-data' | 'complete-backup'
  >('editable-data');
  const [encryptExport, setEncryptExport] = useState(false);
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [confirmExportPassphrase, setConfirmExportPassphrase] = useState('');
  const [selectedImportFile, setSelectedImportFile] = useState<File | null>(
    null,
  );
  const [selectedImportIdentity, setSelectedImportIdentity] =
    useState<LocalFileIdentityV1 | null>(null);
  const [importPassphrase, setImportPassphrase] = useState('');
  const [editablePreview, setEditablePreview] =
    useState<EditableImportPreviewV1 | null>(null);
  const [restorePreview, setRestorePreview] =
    useState<VerifiedLocalRestoreV1 | null>(null);
  const [confirmReplacement, setConfirmReplacement] = useState(false);
  const [confirmDeletions, setConfirmDeletions] = useState(false);
  const [visibleChanges, setVisibleChanges] = useState(25);
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

  async function selectImportFile(file: File) {
    setBusy('inspect');
    setMessage(null);
    setEditablePreview(null);
    setRestorePreview(null);
    setSelectedImportIdentity(null);
    setSelectedImportFile(null);
    setImportPassphrase('');
    setConfirmReplacement(false);
    setConfirmDeletions(false);
    try {
      setSelectedImportIdentity(await identifyLocalFile(file));
      setSelectedImportFile(file);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'The selected file could not be identified.',
      );
    } finally {
      setBusy(null);
    }
  }

  async function reviewImport() {
    if (selectedImportFile === null || selectedImportIdentity === null) return;
    setBusy('inspect');
    setMessage(null);
    setEditablePreview(null);
    setRestorePreview(null);
    setConfirmReplacement(false);
    setConfirmDeletions(false);
    setVisibleChanges(25);
    try {
      const passphrase =
        selectedImportIdentity.protection === 'password-encrypted'
          ? importPassphrase
          : undefined;
      if (selectedImportIdentity.kind === 'editable-data') {
        setEditablePreview(
          await inspectEditableLocalFile(selectedImportFile, passphrase),
        );
      } else {
        setRestorePreview(
          await inspectLocalExport(selectedImportFile, passphrase),
        );
      }
      setImportPassphrase('');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'The selected file could not be verified.',
      );
    } finally {
      setBusy(null);
    }
  }

  async function exportSelected() {
    await run('export', async () => {
      const passphrase = encryptExport ? exportPassphrase : undefined;
      if (encryptExport) {
        if (exportPassphrase.length < 12) {
          throw new TypeError(
            'Use a file passphrase of at least 12 characters.',
          );
        }
        if (exportPassphrase !== confirmExportPassphrase) {
          throw new TypeError('The file passphrases do not match.');
        }
      }
      if (exportKind === 'editable-data') {
        await downloadEditableLocalFile(passphrase);
      } else {
        await downloadVerifiedLocalExport(passphrase);
      }
      setExportPassphrase('');
      setConfirmExportPassphrase('');
      return 'The local file was handed to your browser for download.';
    });
  }

  async function applyEditable() {
    if (editablePreview === null) return;
    const counts = changeCounts(editablePreview);
    if (
      counts.conflict > 0 ||
      counts.add + counts.correct + counts.delete === 0 ||
      (counts.delete > 0 && !confirmDeletions)
    ) {
      return;
    }
    setBusy('restore');
    setMessage(null);
    try {
      await applyReviewedEditableLocalFile(editablePreview);
      setEditablePreview(null);
      window.dispatchEvent(new Event('nutrixx:onboarding-profile-saved'));
      router.replace('/dashboard');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'The reviewed edits could not be applied. Existing data remains available.',
      );
    } finally {
      setBusy(null);
    }
  }

  async function restoreBackup() {
    if (restorePreview === null || !confirmReplacement) return;
    setBusy('restore');
    setMessage(null);
    try {
      await restoreVerifiedLocalExport(restorePreview);
      window.dispatchEvent(new Event('nutrixx:onboarding-profile-saved'));
      router.replace('/dashboard');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'The backup could not be restored. Existing data remains available.',
      );
    } finally {
      setBusy(null);
    }
  }

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
  const editableCounts = editablePreview ? changeCounts(editablePreview) : null;
  const reviewableChanges =
    editablePreview?.changes.filter((change) => change.kind !== 'unchanged') ??
    [];

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
          <p className="mt-2 text-sm text-muted">Complete backup</p>
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
        <article
          className="rounded-[1.5rem] border border-separator bg-surface/75 p-5 sm:p-6"
          id="export-local-files"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">
            Your portable files
          </p>
          <h2 className="mt-3 text-xl font-semibold">Export local data</h2>
          <fieldset className="mt-4 space-y-3">
            <legend className="text-sm font-semibold">
              Choose file purpose
            </legend>
            <label className="flex gap-3 rounded-xl border border-separator p-3 text-sm">
              <input
                checked={exportKind === 'editable-data'}
                disabled={busy !== null}
                name="export-kind"
                onChange={() => setExportKind('editable-data')}
                type="radio"
                value="editable-data"
              />
              <span>
                <strong className="block">Editable data</strong>
                <span className="text-muted">
                  User facts without transaction history. Edit the plain JSON
                  deliberately, then review changes before importing.
                </span>
              </span>
            </label>
            <label className="flex gap-3 rounded-xl border border-separator p-3 text-sm">
              <input
                checked={exportKind === 'complete-backup'}
                disabled={busy !== null}
                name="export-kind"
                onChange={() => setExportKind('complete-backup')}
                type="radio"
                value="complete-backup"
              />
              <span>
                <strong className="block">Complete backup</strong>
                <span className="text-muted">
                  Canonical records and transaction history for full recovery.
                </span>
              </span>
            </label>
          </fieldset>
          <label className="mt-5 flex items-start gap-3 text-sm">
            <input
              checked={encryptExport}
              className="mt-1"
              disabled={busy !== null}
              onChange={(event) => {
                setEncryptExport(event.target.checked);
                setExportPassphrase('');
                setConfirmExportPassphrase('');
              }}
              type="checkbox"
            />
            <span>
              <strong className="block">Encrypt this file</strong>
              <span className="text-muted">
                The passphrase stays on this device. Losing it makes the file
                unrecoverable. Encrypted files are opened through Nutrixx.
              </span>
            </span>
          </label>
          {encryptExport ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                File passphrase
                <input
                  autoComplete="new-password"
                  className="mt-2 block w-full rounded-xl border border-separator p-2"
                  disabled={busy !== null}
                  onChange={(event) => setExportPassphrase(event.target.value)}
                  type="password"
                  value={exportPassphrase}
                />
              </label>
              <label className="text-sm font-semibold">
                Confirm file passphrase
                <input
                  autoComplete="new-password"
                  className="mt-2 block w-full rounded-xl border border-separator p-2"
                  disabled={busy !== null}
                  onChange={(event) =>
                    setConfirmExportPassphrase(event.target.value)
                  }
                  type="password"
                  value={confirmExportPassphrase}
                />
              </label>
            </div>
          ) : null}
          <button
            className="mt-5 rounded-xl border border-separator px-4 py-2.5 text-sm font-semibold transition hover:border-accent/50 disabled:opacity-50"
            disabled={busy !== null}
            onClick={() => {
              exportSelected().catch(() => undefined);
            }}
            type="button"
          >
            {busy === 'export' ? 'Preparing…' : 'Download local file'}
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
                <a
                  className="rounded-lg border border-separator px-3 py-2 text-sm font-semibold"
                  href="#export-local-files"
                >
                  Choose a backup first
                </a>
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

      <section className="rounded-[1.5rem] border border-separator bg-surface/75 p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Import a local file</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Nutrixx identifies the file purpose and protection. Review editable
          changes or complete-backup replacement before any data is written. The
          separate offline food catalog may need installation afterward.
        </p>
        <label
          className="mt-5 block text-sm font-semibold"
          htmlFor="import-file"
        >
          Nutrixx local JSON file
        </label>
        <input
          accept=".json,application/json"
          className="mt-2 block w-full max-w-xl rounded-xl border border-separator p-2 text-sm"
          disabled={busy !== null}
          id="import-file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) selectImportFile(file).catch(() => undefined);
            event.target.value = '';
          }}
          type="file"
        />
        {selectedImportIdentity && selectedImportFile ? (
          <div className="mt-4 space-y-3 rounded-xl border border-separator p-4">
            <p className="text-sm">
              <span className="font-semibold">{selectedImportFile.name}</span>
              {' · '}
              {selectedImportIdentity.kind === 'editable-data'
                ? 'Editable data'
                : 'Complete backup'}
              {' · '}
              {selectedImportIdentity.protection === 'password-encrypted'
                ? 'Encrypted'
                : 'Plain JSON'}
            </p>
            {selectedImportIdentity.protection === 'password-encrypted' ? (
              <label className="block max-w-xl text-sm font-semibold">
                File passphrase
                <input
                  autoComplete="off"
                  className="mt-2 block w-full rounded-xl border border-separator p-2"
                  disabled={busy !== null}
                  onChange={(event) => setImportPassphrase(event.target.value)}
                  type="password"
                  value={importPassphrase}
                />
              </label>
            ) : null}
            <button
              className="rounded-xl border border-separator px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              disabled={
                busy !== null ||
                editablePreview !== null ||
                restorePreview !== null
              }
              onClick={() => {
                reviewImport().catch(() => undefined);
              }}
              type="button"
            >
              {busy === 'inspect' ? 'Reviewing…' : 'Review file'}
            </button>
          </div>
        ) : null}
        {busy === 'inspect' ? (
          <p className="mt-3 text-sm" role="status">
            Verifying local file…
          </p>
        ) : null}
        {editablePreview && editableCounts ? (
          <div className="mt-5 rounded-xl border border-accent/30 bg-accent/5 p-4">
            <h3 className="font-semibold">Review editable changes</h3>
            <p className="mt-2 text-sm text-muted">
              {editablePreview.targetWasEmpty
                ? 'Importing into an empty local profile.'
                : 'Comparing with this browser’s current local facts.'}{' '}
              Omitted facts remain unchanged. Approved edits create new
              transaction entries; existing history stays intact.
            </p>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-5">
              {CHANGE_KINDS.map((kind) => (
                <div
                  key={kind}
                  className="rounded-lg border border-separator p-2"
                >
                  <dt className="capitalize text-muted">{kind}</dt>
                  <dd className="font-semibold">{editableCounts[kind]}</dd>
                </div>
              ))}
            </dl>
            {editableCounts.conflict > 0 ? (
              <p className="mt-4 text-sm font-semibold text-red-700 dark:text-red-300">
                Resolve conflicts in the file or current browser data, then
                review the file again. No changes can be applied yet.
              </p>
            ) : null}
            <div className="mt-4 space-y-3">
              {reviewableChanges.slice(0, visibleChanges).map((change) => (
                <article
                  className="rounded-lg border border-separator bg-background/60 p-3 text-sm"
                  key={`${change.recordType}:${change.recordId}`}
                >
                  <p className="font-semibold capitalize">
                    {change.kind} · {change.recordType}
                  </p>
                  <p className="break-all text-xs text-muted">
                    {change.recordId}
                  </p>
                  {change.changedFields?.length ? (
                    <p className="mt-1 text-xs">
                      Fields: {change.changedFields.join(', ')}
                    </p>
                  ) : null}
                  {change.reason ? (
                    <p className="mt-1 text-xs">Reason: {change.reason}</p>
                  ) : null}
                  <details className="mt-2">
                    <summary className="cursor-pointer font-medium">
                      Inspect before and after
                    </summary>
                    {change.beforePayload !== undefined ? (
                      <div className="mt-2">
                        <p className="font-medium">Before</p>
                        <pre className="max-h-64 overflow-auto rounded-lg bg-surface p-2 text-xs">
                          {JSON.stringify(change.beforePayload, null, 2)}
                        </pre>
                      </div>
                    ) : null}
                    {change.afterPayload !== undefined ? (
                      <div className="mt-2">
                        <p className="font-medium">After</p>
                        <pre className="max-h-64 overflow-auto rounded-lg bg-surface p-2 text-xs">
                          {JSON.stringify(change.afterPayload, null, 2)}
                        </pre>
                      </div>
                    ) : null}
                  </details>
                </article>
              ))}
            </div>
            {reviewableChanges.length > visibleChanges ? (
              <button
                className="mt-3 rounded-lg border border-separator px-3 py-2 text-sm font-semibold"
                onClick={() => setVisibleChanges((count) => count + 25)}
                type="button"
              >
                Show 25 more changes
              </button>
            ) : null}
            {editableCounts.delete > 0 ? (
              <label className="mt-4 flex gap-2 text-sm">
                <input
                  checked={confirmDeletions}
                  disabled={busy !== null}
                  onChange={(event) =>
                    setConfirmDeletions(event.target.checked)
                  }
                  type="checkbox"
                />
                I confirm the {editableCounts.delete} explicit deletion
                request(s) shown above.
              </label>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
                disabled={
                  busy !== null ||
                  editableCounts.conflict > 0 ||
                  editableCounts.add +
                    editableCounts.correct +
                    editableCounts.delete ===
                    0 ||
                  (editableCounts.delete > 0 && !confirmDeletions)
                }
                onClick={() => {
                  applyEditable().catch(() => undefined);
                }}
                type="button"
              >
                {busy === 'restore' ? 'Applying…' : 'Apply reviewed changes'}
              </button>
              <button
                className="rounded-xl border border-separator px-4 py-2.5 text-sm font-semibold"
                disabled={busy !== null}
                onClick={() => setEditablePreview(null)}
                type="button"
              >
                Cancel review
              </button>
            </div>
          </div>
        ) : null}
        {restorePreview ? (
          <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <h3 className="font-semibold">Verified backup ready to restore</h3>
            <p className="mt-2 text-sm text-muted">
              Exported{' '}
              {formatDate(restorePreview.artifact.content.manifest.exportedAt)}
              {' · '}
              {restorePreview.artifact.content.manifest.recordCount} records
              {' · '}
              {restorePreview.artifact.content.manifest.transactionCount}{' '}
              transactions.
            </p>
            <p className="mt-3 text-sm">
              This replaces every current Nutrixx user record and its
              transaction history in this browser. Download a current complete
              backup first if you want to keep them.
            </p>
            <label className="mt-4 flex gap-2 text-sm">
              <input
                checked={confirmReplacement}
                disabled={busy !== null}
                onChange={(event) =>
                  setConfirmReplacement(event.target.checked)
                }
                type="checkbox"
              />
              I understand this replaces all current local user data and
              history.
            </label>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
                disabled={busy !== null || !confirmReplacement}
                onClick={() => {
                  restoreBackup().catch(() => undefined);
                }}
                type="button"
              >
                {busy === 'restore'
                  ? 'Restoring…'
                  : 'Replace local data with this backup'}
              </button>
              <button
                className="rounded-xl border border-separator px-4 py-2.5 text-sm font-semibold"
                disabled={busy !== null}
                onClick={() => setRestorePreview(null)}
                type="button"
              >
                Cancel restore
              </button>
            </div>
          </div>
        ) : null}
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
