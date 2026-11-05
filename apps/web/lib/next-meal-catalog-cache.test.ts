import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import {
  clearMappedCatalog,
  readMappedCatalog,
  saveMappedCatalog,
} from './next-meal-catalog-cache';
import { PLANNING_CATALOG_CACHE_DATABASE_NAME } from './storage-constants';

import type { NextMealCandidateSource } from '@nutrixx/optimizer-engine';

describe('disposable mapped catalog cache', () => {
  it('reuses only the matching verified release and retains one release', async () => {
    const factory = new IDBFactory();
    const entry = (releaseId: string) =>
      ({
        reference: {
          kind: 'food',
          catalogReleaseId: releaseId,
          foodId: 'food-1',
          foodRevision: 1,
        },
        displayName: 'Food',
      }) as unknown as NextMealCandidateSource;
    const entries = [entry('release-1')];
    await saveMappedCatalog(factory, 'release-1', entries);
    expect(await readMappedCatalog(factory, 'release-1')).toEqual(entries);
    expect(await readMappedCatalog(factory, 'release-2')).toBeNull();
    await saveMappedCatalog(factory, 'release-2', [entry('release-2')]);
    expect(await readMappedCatalog(factory, 'release-1')).toBeNull();
    expect(await readMappedCatalog(factory, 'release-2')).toHaveLength(1);
    await clearMappedCatalog(factory);
    expect(await readMappedCatalog(factory, 'release-2')).toBeNull();
  });

  it('evicts a corrupted mapped release instead of retaining dead data', async () => {
    const factory = new IDBFactory();
    const entries = [
      {
        reference: {
          kind: 'food',
          catalogReleaseId: 'release-1',
          foodId: 'food-1',
          foodRevision: 1,
        },
        displayName: 'Food',
      } as unknown as NextMealCandidateSource,
    ];
    await saveMappedCatalog(factory, 'release-1', entries);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(PLANNING_CATALOG_CACHE_DATABASE_NAME, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction('mapped-releases', 'readwrite');
    const stored = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        const request = transaction
          .objectStore('mapped-releases')
          .get('release-1');
        request.onsuccess = () =>
          resolve(request.result as Record<string, unknown>);
        request.onerror = () => reject(request.error);
      },
    );
    transaction.objectStore('mapped-releases').put({
      ...stored,
      digest: '0'.repeat(64),
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();

    await expect(readMappedCatalog(factory, 'release-1')).resolves.toBeNull();

    const evictedDatabase = await new Promise<IDBDatabase>(
      (resolve, reject) => {
        const request = factory.open(PLANNING_CATALOG_CACHE_DATABASE_NAME, 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    const evictedTransaction = evictedDatabase.transaction(
      'mapped-releases',
      'readonly',
    );
    const evicted = await new Promise<unknown>((resolve, reject) => {
      const request = evictedTransaction
        .objectStore('mapped-releases')
        .get('release-1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    evictedDatabase.close();
    expect(evicted).toBeUndefined();
  });
});
