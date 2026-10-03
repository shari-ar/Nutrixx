import type { JsonValue } from '@nutrixx/canonical-schema';

export interface ReferenceReleaseInputV1 {
  readonly format: 'nutrixx.reference-release';
  readonly referenceSchemaVersion: 1;
  readonly releaseId: string;
  readonly publishedAt: string;
  readonly byteLength: number;
  readonly manifest: JsonValue;
  readonly manifestSha256: string;
  readonly payload: JsonValue;
  readonly payloadSha256: string;
}

export interface CachedReferenceReleaseV1 extends ReferenceReleaseInputV1 {
  readonly cachedAt: string;
  readonly lastAccessedAt: string;
}

export interface ReferenceReleaseSummaryV1 {
  readonly releaseId: string;
  readonly publishedAt: string;
  readonly byteLength: number;
  readonly manifestSha256: string;
  readonly payloadSha256: string;
  readonly cachedAt: string;
  readonly lastAccessedAt: string;
  readonly active: boolean;
}

export interface ReferenceCachePruneResult {
  readonly evictedReleaseIds: readonly string[];
  readonly bytesBefore: number;
  readonly bytesAfter: number;
  readonly targetBytes: number;
}

export type ReferenceCacheWriteResult = 'inserted' | 'unchanged';

export interface ReferenceDatasetCache {
  putRelease(
    input: ReferenceReleaseInputV1,
  ): Promise<ReferenceCacheWriteResult>;
  getRelease(releaseId: string): Promise<CachedReferenceReleaseV1 | null>;
  activateRelease(releaseId: string | null): Promise<void>;
  listReleases(): Promise<readonly ReferenceReleaseSummaryV1[]>;
  pruneTo(targetBytes: number): Promise<ReferenceCachePruneResult>;
  clear(): Promise<void>;
  close(): Promise<void>;
}
