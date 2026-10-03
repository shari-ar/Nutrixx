import { randomUUID } from 'node:crypto';

import { canonicalizeJson, type JsonValue } from '@nutrixx/canonical-schema';
import type { ReferenceReleaseInputV1 } from '@nutrixx/persistence';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import { sha256Canonical } from './crypto.js';
import { IndexedDbCanonicalRecordRepository } from './indexeddb-repository.js';
import { IndexedDbReferenceDatasetCache } from './reference-cache.js';

const NOW = '2026-10-03T12:00:00.000Z';

async function release(
  releaseId: string,
  byteLength: number,
): Promise<ReferenceReleaseInputV1> {
  const manifest: JsonValue = { releaseId, files: 1 };
  const payload: JsonValue = { foods: [{ id: `${releaseId}-food` }] };
  return {
    format: 'nutrixx.reference-release',
    referenceSchemaVersion: 1,
    releaseId,
    publishedAt: NOW,
    byteLength,
    manifest,
    manifestSha256: await sha256Canonical(canonicalizeJson(manifest)),
    payload,
    payloadSha256: await sha256Canonical(canonicalizeJson(payload)),
  };
}

describe('separate IndexedDB reference dataset cache', () => {
  it('keeps immutable releases outside the user authority database', async () => {
    const indexedDB = new IDBFactory();
    const cacheName = `nutrixx-reference-cache-${randomUUID()}`;
    const cache = await IndexedDbReferenceDatasetCache.create({
      databaseName: cacheName,
      indexedDB,
      now: () => NOW,
    });
    const input = await release('foods-2026-10', 128);
    await expect(cache.putRelease(input)).resolves.toBe('inserted');
    await expect(cache.putRelease(structuredClone(input))).resolves.toBe(
      'unchanged',
    );

    const userDatabaseName = `nutrixx-user-${randomUUID()}`;
    const user = await IndexedDbCanonicalRecordRepository.create({
      databaseName: userDatabaseName,
      indexedDB,
      keyRange: IDBKeyRange,
      verifyRecord: async () => true,
      deleteOnClose: true,
    });
    await user.close();

    await expect(cache.getRelease(input.releaseId)).resolves.toMatchObject({
      releaseId: input.releaseId,
      payloadSha256: input.payloadSha256,
    });
    await cache.close();
  });

  it('validates hashes and rejects conflicting immutable release identities', async () => {
    const indexedDB = new IDBFactory();
    const cache = await IndexedDbReferenceDatasetCache.create({
      databaseName: `nutrixx-reference-validation-${randomUUID()}`,
      indexedDB,
      now: () => NOW,
    });
    const input = await release('foods-stable', 128);
    await cache.putRelease(input);

    const conflicting = await release('foods-stable', 256);
    await expect(cache.putRelease(conflicting)).rejects.toMatchObject({
      code: 'reference-conflict',
    });

    const tampered = structuredClone(input);
    Object.assign(tampered, { payloadSha256: '0'.repeat(64) });
    await expect(cache.putRelease(tampered)).rejects.toMatchObject({
      code: 'invalid-reference-release',
    });
    await cache.close();
  });

  it('prunes least-recently-used inactive releases and preserves the active one', async () => {
    const indexedDB = new IDBFactory();
    let tick = 0;
    const cache = await IndexedDbReferenceDatasetCache.create({
      databaseName: `nutrixx-reference-prune-${randomUUID()}`,
      indexedDB,
      now: () => `2026-10-03T12:00:0${tick++}.000Z`,
    });
    await cache.putRelease(await release('old', 100));
    await cache.putRelease(await release('active', 100));
    await cache.putRelease(await release('new', 100));
    await cache.activateRelease('active');
    await cache.getRelease('new');

    await expect(cache.pruneTo(200)).resolves.toEqual({
      evictedReleaseIds: ['old'],
      bytesBefore: 300,
      bytesAfter: 200,
      targetBytes: 200,
    });
    await expect(cache.listReleases()).resolves.toMatchObject([
      { releaseId: 'active', active: true },
      { releaseId: 'new', active: false },
    ]);
    await cache.close();
  });

  it('clears only disposable reference data and resets active metadata', async () => {
    const indexedDB = new IDBFactory();
    const cache = await IndexedDbReferenceDatasetCache.create({
      databaseName: `nutrixx-reference-clear-${randomUUID()}`,
      indexedDB,
      now: () => NOW,
    });
    await cache.putRelease(await release('active', 64));
    await cache.activateRelease('active');
    await cache.clear();
    await expect(cache.listReleases()).resolves.toEqual([]);
    await cache.close();
  });
});
