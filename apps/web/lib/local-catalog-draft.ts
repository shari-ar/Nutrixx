import {
  validateActiveFoodCatalog,
  type ActiveFoodCatalog,
} from '@/config/active-food-catalog';

export interface LocalFoodCatalogDraft {
  readonly format: 'nutrixx.local-food-catalog-draft';
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly draftRevision: number;
  readonly baseCatalog: {
    readonly releaseId: string;
    readonly artifactSha256: string;
  };
  readonly catalog: ActiveFoodCatalog;
  readonly updatedAt: string;
}

export type LocalCatalogDraftFetcher = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export function validateLocalFoodCatalogDraft(
  input: unknown,
): LocalFoodCatalogDraft {
  if (typeof input !== 'object' || input === null)
    throw new TypeError('The local catalog draft descriptor is missing.');
  const value = input as Partial<LocalFoodCatalogDraft>;
  if (
    value.format !== 'nutrixx.local-food-catalog-draft' ||
    value.schemaVersion !== 1 ||
    typeof value.sessionId !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(value.sessionId) ||
    typeof value.draftRevision !== 'number' ||
    !Number.isSafeInteger(value.draftRevision) ||
    value.draftRevision < 1 ||
    typeof value.baseCatalog !== 'object' ||
    value.baseCatalog === null ||
    typeof value.baseCatalog.releaseId !== 'string' ||
    typeof value.baseCatalog.artifactSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.baseCatalog.artifactSha256) ||
    typeof value.updatedAt !== 'string' ||
    Number.isNaN(Date.parse(value.updatedAt))
  )
    throw new TypeError('The local catalog draft descriptor is invalid.');
  return {
    ...value,
    catalog: validateActiveFoodCatalog(value.catalog),
  } as LocalFoodCatalogDraft;
}

export async function loadLocalFoodCatalogDraft(
  fetcher: LocalCatalogDraftFetcher = fetch,
): Promise<LocalFoodCatalogDraft | null> {
  if (process.env.NODE_ENV === 'production') return null;
  const response = await fetcher('/catalog/local-draft.json', {
    cache: 'no-store',
  });
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(
      `Local catalog draft lookup failed with HTTP ${response.status}.`,
    );
  return validateLocalFoodCatalogDraft(await response.json());
}
