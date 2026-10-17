import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import {
  readMappedCatalog,
  saveMappedCatalog,
} from './next-meal-catalog-cache';

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
  });
});
