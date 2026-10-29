'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  CatalogInstaller,
  type CatalogInstallerPresentation,
  type CatalogStore,
} from '@/components/catalog-installer';
import {
  loadLocalFoodCatalogDraft,
  type LocalFoodCatalogDraft,
} from '@/lib/local-catalog-draft';

export function DevelopmentCatalogInstaller({
  store,
}: {
  store?: CatalogStore;
}) {
  const [draft, setDraft] = useState<LocalFoodCatalogDraft | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      loadLocalFoodCatalogDraft()
        .then((next) => {
          if (active) setDraft(next);
        })
        .catch(() => undefined);
    };
    refresh();
    const poll = window.setInterval(refresh, 3_000);
    return () => {
      active = false;
      window.clearInterval(poll);
    };
  }, []);

  const presentation = useMemo<CatalogInstallerPresentation | undefined>(
    () =>
      draft === null
        ? undefined
        : {
            status: ({ release, target, installing, error }) => (
              <div
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent"
                role="status"
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full bg-accent"
                />
                {release === target.releaseId
                  ? 'Using Local Draft'
                  : installing
                    ? 'Syncing Local Draft'
                    : error
                      ? 'Local Draft sync failed'
                      : 'Local Draft detected'}
                <span className="font-normal text-muted">
                  Revision {draft.draftRevision}
                </span>
              </div>
            ),
            pendingTitle: () => 'Synchronizing the local draft',
            pendingDescription: () => (
              <>
                The development workbench produced revision{' '}
                {draft.draftRevision}. Nutrixx is verifying and activating it in
                this browser automatically.
              </>
            ),
            buttonLabel: ({ error }) =>
              error ? 'Retry local draft sync' : 'Synchronizing local draft…',
            disableButton: ({ error }) => error === null,
          },
    [draft],
  );

  const storeProperties = store === undefined ? {} : { store };
  if (draft === null) return <CatalogInstaller {...storeProperties} />;

  return (
    <CatalogInstaller
      {...storeProperties}
      automaticInstallKey={`${draft.sessionId}:${String(draft.draftRevision)}`}
      presentation={presentation ?? {}}
      target={draft.catalog}
    />
  );
}
