import {
  UtcInstantSchema,
  canonicalizeJson,
  type JsonValue,
} from '@nutrixx/canonical-schema';
import {
  PersistenceError,
  type CachedReferenceReleaseV1,
  type CanonicalPayloadHasher,
  type ReferenceCachePruneResult,
  type ReferenceCacheWriteResult,
  type ReferenceDatasetCache,
  type ReferenceReleaseInputV1,
  type ReferenceReleaseSummaryV1,
} from '@nutrixx/persistence';

import { sha256Canonical } from './crypto.js';

export const REFERENCE_CACHE_SCHEMA_VERSION = 1;
const RELEASE_STORE = 'reference-releases';
const CACHE_METADATA_STORE = 'cache-metadata';
const ACTIVE_RELEASE_KEY = 'active-release';
const SHA256_HEX = /^[a-f0-9]{64}$/;

interface ActiveReleaseMetadata {
  readonly key: typeof ACTIVE_RELEASE_KEY;
  readonly releaseId: string | null;
}

export interface IndexedDbReferenceCacheOptions {
  readonly databaseName: string;
  readonly indexedDB: IDBFactory;
  readonly now?: () => string;
  readonly hash?: CanonicalPayloadHasher;
  readonly deleteOnClose?: boolean;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), {
      once: true,
    });
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('IndexedDB request failed.')),
      { once: true },
    );
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener(
      'abort',
      () =>
        reject(
          transaction.error ?? new Error('IndexedDB transaction aborted.'),
        ),
      { once: true },
    );
    transaction.addEventListener(
      'error',
      () =>
        reject(transaction.error ?? new Error('IndexedDB transaction failed.')),
      { once: true },
    );
  });
}

function openReferenceCache(
  indexedDB: IDBFactory,
  databaseName: string,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      databaseName,
      REFERENCE_CACHE_SCHEMA_VERSION,
    );
    request.addEventListener('upgradeneeded', (event) => {
      if (event.oldVersion !== 0 || event.newVersion !== 1) {
        request.transaction?.abort();
        return;
      }
      request.result.createObjectStore(RELEASE_STORE, { keyPath: 'releaseId' });
      const metadata = request.result.createObjectStore(CACHE_METADATA_STORE, {
        keyPath: 'key',
      });
      metadata.put({
        key: ACTIVE_RELEASE_KEY,
        releaseId: null,
      } satisfies ActiveReleaseMetadata);
    });
    request.addEventListener(
      'success',
      () => {
        const database = request.result;
        if (
          !database.objectStoreNames.contains(RELEASE_STORE) ||
          !database.objectStoreNames.contains(CACHE_METADATA_STORE)
        ) {
          database.close();
          reject(
            new PersistenceError(
              'unsupported-schema',
              'The reference cache schema is incomplete.',
            ),
          );
          return;
        }
        resolve(database);
      },
      { once: true },
    );
    request.addEventListener(
      'error',
      () =>
        reject(
          request.error ?? new Error('Reference cache open request failed.'),
        ),
      { once: true },
    );
    request.addEventListener(
      'blocked',
      () => reject(new Error('Reference cache upgrade was blocked.')),
      { once: true },
    );
  });
}

function releaseContent(input: ReferenceReleaseInputV1): JsonValue {
  return {
    format: input.format,
    referenceSchemaVersion: input.referenceSchemaVersion,
    releaseId: input.releaseId,
    publishedAt: input.publishedAt,
    byteLength: input.byteLength,
    manifest: input.manifest,
    manifestSha256: input.manifestSha256,
    payload: input.payload,
    payloadSha256: input.payloadSha256,
  };
}

function summary(
  release: CachedReferenceReleaseV1,
  activeReleaseId: string | null,
): ReferenceReleaseSummaryV1 {
  return {
    releaseId: release.releaseId,
    publishedAt: release.publishedAt,
    byteLength: release.byteLength,
    manifestSha256: release.manifestSha256,
    payloadSha256: release.payloadSha256,
    cachedAt: release.cachedAt,
    lastAccessedAt: release.lastAccessedAt,
    active: release.releaseId === activeReleaseId,
  };
}

export class IndexedDbReferenceDatasetCache implements ReferenceDatasetCache {
  readonly #database: IDBDatabase;
  readonly #options: IndexedDbReferenceCacheOptions;
  readonly #now: () => string;
  readonly #hash: CanonicalPayloadHasher;
  #closed = false;

  private constructor(
    database: IDBDatabase,
    options: IndexedDbReferenceCacheOptions,
  ) {
    this.#database = database;
    this.#options = options;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#hash = options.hash ?? sha256Canonical;
  }

  public static async create(
    options: IndexedDbReferenceCacheOptions,
  ): Promise<IndexedDbReferenceDatasetCache> {
    return new IndexedDbReferenceDatasetCache(
      await openReferenceCache(options.indexedDB, options.databaseName),
      options,
    );
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new PersistenceError('closed', 'The reference cache is closed.');
    }
  }

  async #validateRelease(input: ReferenceReleaseInputV1): Promise<void> {
    if (
      input.format !== 'nutrixx.reference-release' ||
      input.referenceSchemaVersion !== 1 ||
      input.releaseId.trim() !== input.releaseId ||
      input.releaseId.length === 0 ||
      input.releaseId.length > 200 ||
      !UtcInstantSchema.safeParse(input.publishedAt).success ||
      !Number.isSafeInteger(input.byteLength) ||
      input.byteLength < 0 ||
      !SHA256_HEX.test(input.manifestSha256) ||
      !SHA256_HEX.test(input.payloadSha256)
    ) {
      throw new PersistenceError(
        'invalid-reference-release',
        'The reference release metadata is malformed or unsupported.',
      );
    }
    const [manifestSha256, payloadSha256] = await Promise.all([
      this.#hash(canonicalizeJson(input.manifest)),
      this.#hash(canonicalizeJson(input.payload)),
    ]);
    if (
      manifestSha256 !== input.manifestSha256 ||
      payloadSha256 !== input.payloadSha256
    ) {
      throw new PersistenceError(
        'invalid-reference-release',
        'The reference release hash validation failed.',
      );
    }
  }

  public async putRelease(
    input: ReferenceReleaseInputV1,
  ): Promise<ReferenceCacheWriteResult> {
    this.#assertOpen();
    await this.#validateRelease(input);
    const transaction = this.#database.transaction(RELEASE_STORE, 'readwrite', {
      durability: 'relaxed',
    });
    const completion = transactionComplete(transaction);
    const store = transaction.objectStore(RELEASE_STORE);
    try {
      const existing = (await requestResult(store.get(input.releaseId))) as
        | CachedReferenceReleaseV1
        | undefined;
      if (existing !== undefined) {
        if (
          canonicalizeJson(releaseContent(existing)) !==
          canonicalizeJson(releaseContent(input))
        ) {
          throw new PersistenceError(
            'reference-conflict',
            'A different immutable reference release uses this identifier.',
          );
        }
        await completion;
        return 'unchanged';
      }
      const now = this.#now();
      await requestResult(
        store.add({
          ...structuredClone(input),
          cachedAt: now,
          lastAccessedAt: now,
        } satisfies CachedReferenceReleaseV1),
      );
      await completion;
      return 'inserted';
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already be aborting.
      }
      await completion.catch(() => undefined);
      throw error;
    }
  }

  public async getRelease(
    releaseId: string,
  ): Promise<CachedReferenceReleaseV1 | null> {
    this.#assertOpen();
    const transaction = this.#database.transaction(RELEASE_STORE, 'readwrite', {
      durability: 'relaxed',
    });
    const completion = transactionComplete(transaction);
    const store = transaction.objectStore(RELEASE_STORE);
    const existing = (await requestResult(store.get(releaseId))) as
      | CachedReferenceReleaseV1
      | undefined;
    if (existing === undefined) {
      await completion;
      return null;
    }
    const accessed = { ...existing, lastAccessedAt: this.#now() };
    await requestResult(store.put(accessed));
    await completion;
    return structuredClone(accessed);
  }

  public async activateRelease(releaseId: string | null): Promise<void> {
    this.#assertOpen();
    const transaction = this.#database.transaction(
      [RELEASE_STORE, CACHE_METADATA_STORE],
      'readwrite',
      { durability: 'strict' },
    );
    const completion = transactionComplete(transaction);
    if (
      releaseId !== null &&
      (await requestResult(
        transaction.objectStore(RELEASE_STORE).getKey(releaseId),
      )) === undefined
    ) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already be aborting.
      }
      await completion.catch(() => undefined);
      throw new PersistenceError(
        'invalid-reference-release',
        'The active reference release must already be cached.',
      );
    }
    await requestResult(
      transaction.objectStore(CACHE_METADATA_STORE).put({
        key: ACTIVE_RELEASE_KEY,
        releaseId,
      } satisfies ActiveReleaseMetadata),
    );
    await completion;
  }

  public async listReleases(): Promise<readonly ReferenceReleaseSummaryV1[]> {
    this.#assertOpen();
    const transaction = this.#database.transaction(
      [RELEASE_STORE, CACHE_METADATA_STORE],
      'readonly',
    );
    const completion = transactionComplete(transaction);
    const [releases, active] = await Promise.all([
      requestResult(transaction.objectStore(RELEASE_STORE).getAll()),
      requestResult(
        transaction.objectStore(CACHE_METADATA_STORE).get(ACTIVE_RELEASE_KEY),
      ),
    ]);
    await completion;
    const activeReleaseId =
      (active as ActiveReleaseMetadata | undefined)?.releaseId ?? null;
    return (releases as CachedReferenceReleaseV1[])
      .map((release) => summary(release, activeReleaseId))
      .sort((left, right) => left.releaseId.localeCompare(right.releaseId));
  }

  public async pruneTo(
    targetBytes: number,
  ): Promise<ReferenceCachePruneResult> {
    this.#assertOpen();
    if (!Number.isSafeInteger(targetBytes) || targetBytes < 0) {
      throw new PersistenceError(
        'invalid-reference-release',
        'The reference cache target must be a nonnegative safe integer.',
      );
    }
    const transaction = this.#database.transaction(
      [RELEASE_STORE, CACHE_METADATA_STORE],
      'readwrite',
      { durability: 'relaxed' },
    );
    const completion = transactionComplete(transaction);
    const releasesStore = transaction.objectStore(RELEASE_STORE);
    const [releases, active] = await Promise.all([
      requestResult(releasesStore.getAll()),
      requestResult(
        transaction.objectStore(CACHE_METADATA_STORE).get(ACTIVE_RELEASE_KEY),
      ),
    ]);
    const cached = releases as CachedReferenceReleaseV1[];
    const activeReleaseId =
      (active as ActiveReleaseMetadata | undefined)?.releaseId ?? null;
    const bytesBefore = cached.reduce(
      (total, release) => total + release.byteLength,
      0,
    );
    let bytesAfter = bytesBefore;
    const evictedReleaseIds: string[] = [];
    const candidates = cached
      .filter(({ releaseId }) => releaseId !== activeReleaseId)
      .sort(
        (left, right) =>
          left.lastAccessedAt.localeCompare(right.lastAccessedAt) ||
          left.releaseId.localeCompare(right.releaseId),
      );
    for (const release of candidates) {
      if (bytesAfter <= targetBytes) break;
      await requestResult(releasesStore.delete(release.releaseId));
      bytesAfter -= release.byteLength;
      evictedReleaseIds.push(release.releaseId);
    }
    await completion;
    return { evictedReleaseIds, bytesBefore, bytesAfter, targetBytes };
  }

  public async clear(): Promise<void> {
    this.#assertOpen();
    const transaction = this.#database.transaction(
      [RELEASE_STORE, CACHE_METADATA_STORE],
      'readwrite',
      { durability: 'relaxed' },
    );
    const completion = transactionComplete(transaction);
    await requestResult(transaction.objectStore(RELEASE_STORE).clear());
    await requestResult(
      transaction.objectStore(CACHE_METADATA_STORE).put({
        key: ACTIVE_RELEASE_KEY,
        releaseId: null,
      } satisfies ActiveReleaseMetadata),
    );
    await completion;
  }

  public async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#database.close();
    if (this.#options.deleteOnClose === true) {
      await requestResult(
        this.#options.indexedDB.deleteDatabase(this.#options.databaseName),
      );
    }
  }
}
