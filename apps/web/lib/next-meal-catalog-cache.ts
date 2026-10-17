import { JsonValueSchema, canonicalizeJson } from '@nutrixx/canonical-schema';
import { sha256Canonical } from '@nutrixx/persistence-indexeddb';

import { PLANNING_CATALOG_CACHE_DATABASE_NAME } from './storage-constants';

import type { NextMealCandidateSource } from '@nutrixx/optimizer-engine';

const STORE = 'mapped-releases';
const MAPPING_VERSION = 1;

interface MappedRelease {
  readonly releaseId: string;
  readonly mappingVersion: number;
  readonly entries: readonly NextMealCandidateSource[];
  readonly digest: string;
}

function openCache(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(PLANNING_CATALOG_CACHE_DATABASE_NAME, 1);
    request.onupgradeneeded = () =>
      void request.result.createObjectStore(STORE, { keyPath: 'releaseId' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function completion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function digest(
  releaseId: string,
  entries: readonly NextMealCandidateSource[],
): Promise<string> {
  return sha256Canonical(
    canonicalizeJson(
      JsonValueSchema.parse({
        releaseId,
        mappingVersion: MAPPING_VERSION,
        entries,
      }),
    ),
  );
}

/** This cache is disposable; the verified reference release is the authority. */
export async function readMappedCatalog(
  factory: IDBFactory,
  releaseId: string,
): Promise<readonly NextMealCandidateSource[] | null> {
  try {
    const database = await openCache(factory);
    let item: MappedRelease | undefined;
    try {
      const transaction = database.transaction(STORE, 'readonly');
      const done = completion(transaction);
      item = await requestValue(
        transaction.objectStore(STORE).get(releaseId) as IDBRequest<
          MappedRelease | undefined
        >,
      );
      await done;
    } finally {
      database.close();
    }
    if (
      !item ||
      item.releaseId !== releaseId ||
      item.mappingVersion !== MAPPING_VERSION ||
      item.entries.some(
        (entry) =>
          entry.reference.kind !== 'food' ||
          entry.reference.catalogReleaseId !== releaseId,
      ) ||
      item.digest !== (await digest(releaseId, item.entries))
    )
      return null;
    return item.entries;
  } catch {
    return null;
  }
}

export async function saveMappedCatalog(
  factory: IDBFactory,
  releaseId: string,
  entries: readonly NextMealCandidateSource[],
): Promise<void> {
  const item: MappedRelease = {
    releaseId,
    mappingVersion: MAPPING_VERSION,
    entries,
    digest: await digest(releaseId, entries),
  };
  const database = await openCache(factory);
  try {
    const transaction = database.transaction(STORE, 'readwrite');
    const done = completion(transaction);
    const store = transaction.objectStore(STORE);
    try {
      await requestValue(store.clear());
      await requestValue(store.put(item));
      await done;
    } catch (error) {
      await done.catch(() => undefined);
      throw error;
    }
  } finally {
    database.close();
  }
}
