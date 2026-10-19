'use client';

import { useEffect, useMemo, useState } from 'react';

import { ACTIVE_FOOD_CATALOG } from '@/config/active-food-catalog';
import { BrowserStageTwoStore } from '@/lib/browser-stage-two';

const catalogArtifactName = ACTIVE_FOOD_CATALOG.artifactName;
const catalogArtifactUrl = `/catalog/${catalogArtifactName}`;

type CatalogStore = Pick<
  BrowserStageTwoStore,
  'activeCatalogRelease' | 'installCatalog'
>;

export function CatalogInstaller({ store }: { store?: CatalogStore }) {
  const runtime = useMemo<CatalogStore>(
    () =>
      store ?? {
        activeCatalogRelease: () =>
          new BrowserStageTwoStore().activeCatalogRelease(),
        installCatalog: (file, expectedReleaseId) =>
          new BrowserStageTwoStore().installCatalog(file, expectedReleaseId),
      },
    [store],
  );
  const [release, setRelease] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [installationPhase, setInstallationPhase] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    runtime
      .activeCatalogRelease()
      .then((value) => {
        if (active) setRelease(value);
      })
      .catch(() => {
        if (active) setError('Catalog status is unavailable.');
      });
    return () => {
      active = false;
    };
  }, [runtime]);

  async function installArtifact(file: File) {
    if (file.size !== ACTIVE_FOOD_CATALOG.compressedByteLength)
      throw new TypeError('The catalog download has an unexpected length.');
    const bytes = await file.arrayBuffer();
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('');
    if (digest !== ACTIVE_FOOD_CATALOG.artifactSha256)
      throw new TypeError(
        'The catalog download failed its pinned SHA-256 check.',
      );
    const releaseId = await runtime.installCatalog(
      file,
      ACTIVE_FOOD_CATALOG.releaseId,
    );
    if (releaseId !== ACTIVE_FOOD_CATALOG.releaseId)
      throw new TypeError(
        'The installed catalog has an unexpected release ID.',
      );
    setRelease(releaseId);
    setStatus(`Catalog ${releaseId} is verified and active offline.`);
  }

  async function downloadCatalog(response: Response): Promise<File> {
    const contentLength = Number(response.headers.get('content-length'));
    if (
      !response.body ||
      !Number.isFinite(contentLength) ||
      contentLength <= 0
    ) {
      setInstallationPhase('Downloading catalog…');
      return new File([await response.blob()], catalogArtifactName, {
        type: 'application/gzip',
      });
    }

    const reader = response.body.getReader();
    const chunks: BlobPart[] = [];
    let downloadedBytes = 0;
    setInstallationPhase('Downloading catalog…');
    setDownloadProgress(0);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        downloadedBytes += value.byteLength;
        setDownloadProgress(
          Math.min(100, Math.round((downloadedBytes / contentLength) * 100)),
        );
      }
    }

    return new File(chunks, catalogArtifactName, {
      type: 'application/gzip',
    });
  }

  async function installBundledCatalog() {
    setInstalling(true);
    setError(null);
    setStatus(null);
    setDownloadProgress(null);
    try {
      const response = await fetch(catalogArtifactUrl, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(
          `Catalog download failed with HTTP ${response.status}.`,
        );
      }
      const artifact = await downloadCatalog(response);
      setDownloadProgress(100);
      setInstallationPhase(
        'Verifying, decompressing, and indexing locally… This can take a moment.',
      );
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      await installArtifact(artifact);
    } catch {
      setError(
        'The offline catalog could not be installed. Check your connection and available browser storage, then retry.',
      );
    } finally {
      setInstalling(false);
      setInstallationPhase(null);
    }
  }

  return (
    <section
      aria-labelledby="catalog-installation-heading"
      className="mt-6 rounded-[2rem] border border-separator bg-surface/75 p-6 sm:p-8"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
        Offline food knowledge
      </p>
      <h2
        className="mt-3 text-2xl font-semibold tracking-tight"
        id="catalog-installation-heading"
      >
        Reference catalog
      </h2>
      <p className="mt-2 text-sm text-muted">
        Active release: {release ?? 'No catalog installed'}
      </p>

      {release !== ACTIVE_FOOD_CATALOG.releaseId ? (
        <div className="mt-5 rounded-2xl bg-background/60 p-4">
          <p className="font-semibold">
            {release === null
              ? 'Install the offline food catalog'
              : 'Update the offline food catalog'}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted">
            This download is about{' '}
            {Math.ceil(ACTIVE_FOOD_CATALOG.compressedByteLength / 1_000_000)}{' '}
            MB. Nutrixx checks its pinned SHA-256 digest and release integrity
            before storing it in this browser.
          </p>
          <button
            className="mt-4 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-60"
            disabled={installing}
            onClick={() => {
              installBundledCatalog().catch(() => undefined);
            }}
            type="button"
          >
            {installing
              ? 'Installing locally…'
              : release === null
                ? 'Install offline catalog'
                : 'Update offline catalog'}
          </button>
          {installationPhase ? (
            <div className="mt-4 text-sm" role="status">
              <p>{installationPhase}</p>
              {downloadProgress !== null ? (
                <div className="mt-2 flex items-center gap-3">
                  <progress
                    aria-label="Catalog download progress"
                    className="h-2 w-52 overflow-hidden rounded-full"
                    max={100}
                    value={downloadProgress}
                  />
                  <span className="font-semibold tabular-nums">
                    {downloadProgress}%
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {status ? (
        <p className="mt-5 rounded-xl bg-success/10 p-4 text-sm" role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="mt-5 rounded-xl bg-danger/10 p-4 text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
