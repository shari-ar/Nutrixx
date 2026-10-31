import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ACTIVE_FOOD_CATALOG } from '@/config/active-food-catalog';

import { DevelopmentCatalogInstaller as CatalogInstaller } from './catalog-installer.dev';

const draftLoader = vi.hoisted(() => vi.fn());

vi.mock('@/lib/local-catalog-draft', async () => {
  const actual = await vi.importActual('@/lib/local-catalog-draft');
  return { ...actual, loadLocalFoodCatalogDraft: draftLoader };
});

const draftReleaseId = 'food-catalog-nutrixx-local-draft';
const localDraft = {
  format: 'nutrixx.local-food-catalog-draft' as const,
  schemaVersion: 1 as const,
  sessionId: '10000000-0000-4000-8000-000000000001',
  draftRevision: 7,
  baseCatalog: {
    releaseId: ACTIVE_FOOD_CATALOG.releaseId,
    artifactSha256: ACTIVE_FOOD_CATALOG.artifactSha256,
  },
  catalog: {
    ...ACTIVE_FOOD_CATALOG,
    releaseId: draftReleaseId,
    artifactName: `${draftReleaseId}.v1.json.gz`,
    artifactSha256:
      '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
    compressedByteLength: 3,
    artifactUrl: null,
    receiptUrl: null,
    candidateId: '10000000-0000-4000-8000-000000000002',
  },
  updatedAt: '2026-10-27T10:00:00.000Z',
};

beforeEach(() => {
  draftLoader.mockReset();
  draftLoader.mockResolvedValue(localDraft);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('catalog installer local draft status', () => {
  it('marks the locally installed draft as active', async () => {
    render(
      <CatalogInstaller
        store={{
          activeCatalogRelease: vi.fn().mockResolvedValue(draftReleaseId),
          installCatalog: vi.fn(),
        }}
      />,
    );

    expect(await screen.findByText('Using Local Draft')).toBeInTheDocument();
    expect(screen.getByText('Revision 7')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Use local draft' }),
    ).not.toBeInTheDocument();
  });

  it('automatically activates an advancing local draft', async () => {
    const installCatalog = vi.fn().mockResolvedValue(draftReleaseId);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'content-length': '3' },
        }),
      ),
    );
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });

    render(
      <CatalogInstaller
        store={{
          activeCatalogRelease: vi
            .fn()
            .mockResolvedValue(ACTIVE_FOOD_CATALOG.releaseId),
          installCatalog,
        }}
      />,
    );

    expect(await screen.findByText('Using Local Draft')).toBeInTheDocument();
    expect(installCatalog).toHaveBeenCalledWith(
      expect.any(File),
      draftReleaseId,
    );
    expect(
      screen.queryByRole('button', { name: 'Use local draft' }),
    ).not.toBeInTheDocument();
  });

  it('reports success when the catalog committed before a trailing error', async () => {
    const activeCatalogRelease = vi
      .fn()
      .mockResolvedValueOnce(ACTIVE_FOOD_CATALOG.releaseId)
      .mockResolvedValue(draftReleaseId);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'content-length': '3' },
        }),
      ),
    );
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });

    render(
      <CatalogInstaller
        store={{
          activeCatalogRelease,
          installCatalog: vi
            .fn()
            .mockRejectedValue(new Error('Trailing IndexedDB error')),
        }}
      />,
    );

    expect(await screen.findByText('Using Local Draft')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        `Catalog ${draftReleaseId} is verified and active offline.`,
      ),
    ).toBeInTheDocument();
  });
});
