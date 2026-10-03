import { randomUUID } from 'node:crypto';

import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import {
  CANONICAL_RECORD_STORE,
  COMMAND_RECEIPT_STORE,
  INDEXED_DB_SCHEMA_VERSION,
  METADATA_STORE,
  TRANSACTION_LOG_STORE,
  openIndexedDb,
  planIndexedDbSchemaUpgrade,
  type IndexedDbSchemaMetadataV1,
} from './schema.js';

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

describe('IndexedDB schema runner', () => {
  it('exposes only the version 1 baseline before the first release', () => {
    expect(planIndexedDbSchemaUpgrade(0, 1)).toEqual({
      fromVersion: 0,
      toVersion: 1,
      steps: [1],
    });
    expect(planIndexedDbSchemaUpgrade(1, 1)).toEqual({
      fromVersion: 1,
      toVersion: 1,
      steps: [],
    });
    expect(() => planIndexedDbSchemaUpgrade(0, 2)).toThrow(
      'Unsupported IndexedDB schema transition',
    );
    expect(() => planIndexedDbSchemaUpgrade(1, 2)).toThrow(
      'Unsupported IndexedDB schema transition',
    );
  });

  it('installs the complete version 1 schema and metadata atomically', async () => {
    const indexedDB = new IDBFactory();
    const database = await openIndexedDb(
      indexedDB,
      `nutrixx-schema-${randomUUID()}`,
    );
    expect(database.version).toBe(INDEXED_DB_SCHEMA_VERSION);
    expect(Array.from(database.objectStoreNames).sort()).toEqual(
      [
        CANONICAL_RECORD_STORE,
        COMMAND_RECEIPT_STORE,
        METADATA_STORE,
        TRANSACTION_LOG_STORE,
      ].sort(),
    );

    const transaction = database.transaction(METADATA_STORE, 'readonly');
    const metadata = (await requestResult(
      transaction.objectStore(METADATA_STORE).get('schema'),
    )) as IndexedDbSchemaMetadataV1;
    expect(metadata).toEqual({
      key: 'schema',
      databaseSchemaVersion: 1,
      canonicalSchemaVersion: 1,
    });
    database.close();
  });

  it('rejects an incomplete version 1 database instead of silently using it', async () => {
    const indexedDB = new IDBFactory();
    const databaseName = `nutrixx-incomplete-${randomUUID()}`;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.addEventListener('upgradeneeded', () => {
        request.result.createObjectStore(CANONICAL_RECORD_STORE, {
          keyPath: 'recordId',
        });
      });
      request.addEventListener(
        'success',
        () => {
          request.result.close();
          resolve();
        },
        { once: true },
      );
      request.addEventListener(
        'error',
        () => reject(request.error ?? new Error('Fixture creation failed.')),
        { once: true },
      );
    });

    await expect(openIndexedDb(indexedDB, databaseName)).rejects.toMatchObject({
      code: 'unsupported-schema',
    });
  });
});
