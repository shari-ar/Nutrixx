import { afterEach, describe, expect, it, vi } from 'vitest';

import { ACTIVE_FOOD_CATALOG } from '@/config/active-food-catalog';

import {
  loadLocalFoodCatalogDraft,
  validateLocalFoodCatalogDraft,
  type LocalCatalogDraftFetcher,
} from './local-catalog-draft';

const draft = {
  format: 'nutrixx.local-food-catalog-draft' as const,
  schemaVersion: 1 as const,
  sessionId: '11111111-1111-4111-a111-111111111111',
  draftRevision: 3,
  baseCatalog: {
    releaseId: ACTIVE_FOOD_CATALOG.releaseId,
    artifactSha256: ACTIVE_FOOD_CATALOG.artifactSha256,
  },
  catalog: ACTIVE_FOOD_CATALOG,
  updatedAt: '2026-10-27T10:00:00.000Z',
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('local catalog draft descriptor', () => {
  it('accepts an identity-bearing local draft', () => {
    expect(validateLocalFoodCatalogDraft(draft)).toEqual(draft);
  });

  it('treats a missing local descriptor as no draft', async () => {
    const fetcher = vi
      .fn<LocalCatalogDraftFetcher>()
      .mockResolvedValue(new Response(null, { status: 404 }));
    await expect(loadLocalFoodCatalogDraft(fetcher)).resolves.toBeNull();
  });

  it('loads and validates the runtime draft descriptor', async () => {
    const fetcher = vi
      .fn<LocalCatalogDraftFetcher>()
      .mockResolvedValue(Response.json(draft));
    await expect(loadLocalFoodCatalogDraft(fetcher)).resolves.toEqual(draft);
  });

  it('keeps local drafts outside production builds', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const fetcher = vi.fn<LocalCatalogDraftFetcher>();
    await expect(loadLocalFoodCatalogDraft(fetcher)).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
