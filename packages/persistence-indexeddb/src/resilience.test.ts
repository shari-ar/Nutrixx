import { createHash, randomUUID } from 'node:crypto';

import {
  sealCanonicalRecordV1,
  verifyCanonicalRecordV1,
  type CanonicalRecordV1,
} from '@nutrixx/canonical-schema';
import type { LocalDataExportArtifactV1 } from '@nutrixx/persistence';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { deleteIndexedDbDatabase } from './database-admin.js';
import { IndexedDbCanonicalRecordRepository } from './indexeddb-repository.js';
import {
  INDEXED_DB_SCHEMA_VERSION,
  openIndexedDb,
  runIndexedDbSchemaUpgrade,
} from './schema.js';

const NOW = '2026-10-03T12:00:00.000Z';
const EMPTY_V1_EXPORT = {
  manifest: {
    format: 'nutrixx.local-export',
    exportVersion: 1,
    canonicalSchemaVersion: 1,
    databaseSchemaVersion: 1,
    exportedAt: NOW,
    recordCount: 0,
    transactionCount: 0,
    lastSequence: 0,
    subjectIds: [],
    payloadSha256:
      '59fe87130cc6b0414e699edb61b713ab987c79cf614a5cf60928cd2eb6a24cc3',
  },
  records: [],
  transactions: [],
} as const satisfies LocalDataExportArtifactV1;

const digest = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');
const verify = (record: CanonicalRecordV1) =>
  verifyCanonicalRecordV1(record, digest);

async function record(): Promise<CanonicalRecordV1> {
  return sealCanonicalRecordV1(
    {
      format: 'nutrixx.canonical-record',
      schemaVersion: 1,
      recordType: 'meal.entry',
      recordVersion: 1,
      recordId: randomUUID(),
      subjectId: randomUUID(),
      owningContext: 'consumption',
      logicalVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
      provenance: {
        method: 'user-entered',
        source: { kind: 'user', sourceId: 'resilience-test' },
        recordedAt: NOW,
      },
      payload: { label: 'Offline meal' },
    },
    digest,
  );
}

function options(indexedDB: IDBFactory, databaseName: string) {
  return {
    databaseName,
    indexedDB,
    keyRange: IDBKeyRange,
    verifyRecord: verify,
    now: () => NOW,
    createId: () => randomUUID(),
  } as const;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('local data resilience fixtures', () => {
  it('survives reload and works while every network request fails', async () => {
    const fetch = vi.fn(() => Promise.reject(new TypeError('Offline')));
    vi.stubGlobal('fetch', fetch);
    const indexedDB = new IDBFactory();
    const databaseName = `nutrixx-offline-reload-${randomUUID()}`;
    const input = await record();

    const initial = await IndexedDbCanonicalRecordRepository.create(
      options(indexedDB, databaseName),
    );
    await initial.put(input);
    await initial.close();

    const reloaded = await IndexedDbCanonicalRecordRepository.create(
      options(indexedDB, databaseName),
    );
    await expect(reloaded.getById(input.recordId)).resolves.toEqual(input);
    await expect(reloaded.exportLocalData()).resolves.toMatchObject({
      manifest: { recordCount: 1, transactionCount: 1 },
    });
    expect(fetch).not.toHaveBeenCalled();
    await reloaded.close();
  });

  it('rolls back a write that encounters quota exhaustion', async () => {
    const indexedDB = new IDBFactory();
    const databaseName = `nutrixx-quota-${randomUUID()}`;
    const input = await record();
    const failing = await IndexedDbCanonicalRecordRepository.create({
      ...options(indexedDB, databaseName),
      beforeLogAppend: () => {
        throw new DOMException(
          'Storage quota exhausted.',
          'QuotaExceededError',
        );
      },
    });

    await expect(failing.put(input)).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
    await failing.close();

    const recovered = await IndexedDbCanonicalRecordRepository.create(
      options(indexedDB, databaseName),
    );
    await expect(recovered.getById(input.recordId)).resolves.toBeNull();
    await expect(recovered.listTransactions()).resolves.toEqual([]);
    await recovered.close();
  });

  it('leaves no partial schema after an interrupted migration', async () => {
    const indexedDB = new IDBFactory();
    const databaseName = `nutrixx-migration-rollback-${randomUUID()}`;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(databaseName, INDEXED_DB_SCHEMA_VERSION);
      request.addEventListener('upgradeneeded', (event) => {
        const transaction = request.transaction;
        if (transaction === null) {
          reject(new Error('Missing versionchange transaction.'));
          return;
        }
        runIndexedDbSchemaUpgrade(
          request.result,
          transaction,
          event.oldVersion,
          event.newVersion ?? INDEXED_DB_SCHEMA_VERSION,
        );
        transaction.abort();
      });
      request.addEventListener('error', () => resolve(), { once: true });
      request.addEventListener(
        'success',
        () =>
          reject(
            new Error('The interrupted migration unexpectedly committed.'),
          ),
        { once: true },
      );
    });

    const recovered = await openIndexedDb(indexedDB, databaseName);
    expect(recovered.version).toBe(INDEXED_DB_SCHEMA_VERSION);
    expect(recovered.objectStoreNames).toHaveLength(4);
    recovered.close();
  });

  it('imports the committed version 1 compatibility fixture', async () => {
    const indexedDB = new IDBFactory();
    const repository = await IndexedDbCanonicalRecordRepository.create(
      options(indexedDB, `nutrixx-export-v1-${randomUUID()}`),
    );
    await expect(repository.importLocalData(EMPTY_V1_EXPORT)).resolves.toEqual(
      EMPTY_V1_EXPORT.manifest,
    );
    await expect(repository.exportLocalData()).resolves.toMatchObject({
      manifest: {
        exportVersion: 1,
        canonicalSchemaVersion: 1,
        databaseSchemaVersion: 1,
        payloadSha256: EMPTY_V1_EXPORT.manifest.payloadSha256,
      },
    });
    await repository.close();
  });

  it('clears a local authority database without affecting its next baseline', async () => {
    const indexedDB = new IDBFactory();
    const databaseName = `nutrixx-clear-${randomUUID()}`;
    const input = await record();
    const repository = await IndexedDbCanonicalRecordRepository.create(
      options(indexedDB, databaseName),
    );
    await repository.put(input);
    await repository.close();

    await deleteIndexedDbDatabase(indexedDB, databaseName);
    const recreated = await IndexedDbCanonicalRecordRepository.create(
      options(indexedDB, databaseName),
    );
    await expect(recreated.getById(input.recordId)).resolves.toBeNull();
    await expect(recreated.listTransactions()).resolves.toEqual([]);
    await recreated.close();
  });
});
