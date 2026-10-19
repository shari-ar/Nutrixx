import raw from './active-food-catalog.json';

export interface ActiveFoodCatalog {
  readonly format: 'nutrixx.active-food-catalog';
  readonly schemaVersion: 1;
  readonly releaseId: string;
  readonly artifactName: string;
  readonly artifactSha256: string;
  readonly compressedByteLength: number;
  readonly candidateId: string | null;
  readonly artifactUrl: string | null;
  readonly receiptUrl: string | null;
  readonly reviewedClaimCount: number;
}

/** Deployment changes this single descriptor only after release verification. */
export function validateActiveFoodCatalog(input: unknown): ActiveFoodCatalog {
  if (typeof input !== 'object' || input === null)
    throw new TypeError('The active catalog descriptor is missing.');
  const item = input as { [K in keyof ActiveFoodCatalog]?: unknown };
  if (
    item.format !== 'nutrixx.active-food-catalog' ||
    item.schemaVersion !== 1 ||
    typeof item.releaseId !== 'string' ||
    !/^[a-z0-9][a-z0-9.-]{0,199}$/.test(item.releaseId) ||
    item.artifactName !== `${item.releaseId}.v1.json.gz` ||
    typeof item.artifactSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(item.artifactSha256) ||
    typeof item.compressedByteLength !== 'number' ||
    !Number.isSafeInteger(item.compressedByteLength) ||
    item.compressedByteLength <= 0 ||
    !(
      item.candidateId === null ||
      (typeof item.candidateId === 'string' &&
        /^[a-f0-9]{64}$/.test(item.candidateId))
    ) ||
    !(
      item.artifactUrl === null ||
      (typeof item.artifactUrl === 'string' &&
        item.artifactUrl.startsWith('https://'))
    ) ||
    !(
      item.receiptUrl === null ||
      (typeof item.receiptUrl === 'string' &&
        item.receiptUrl.startsWith('https://'))
    ) ||
    typeof item.reviewedClaimCount !== 'number' ||
    !Number.isSafeInteger(item.reviewedClaimCount) ||
    item.reviewedClaimCount < 0 ||
    (item.candidateId === null && item.reviewedClaimCount !== 0) ||
    (item.candidateId !== null &&
      (item.reviewedClaimCount === 0 ||
        item.artifactUrl === null ||
        item.receiptUrl === null))
  )
    throw new TypeError('The active catalog descriptor is invalid.');
  return item as unknown as ActiveFoodCatalog;
}

export const ACTIVE_FOOD_CATALOG = validateActiveFoodCatalog(raw);
