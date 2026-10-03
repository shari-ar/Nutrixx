import { PersistenceError } from '@nutrixx/persistence';

export const INDEXED_DB_SCHEMA_VERSION = 1;
export const CANONICAL_RECORD_STORE = 'canonical-records';
export const TRANSACTION_LOG_STORE = 'transaction-log';
export const COMMAND_RECEIPT_STORE = 'command-receipts';
export const METADATA_STORE = 'metadata';
export const SUBJECT_INDEX = 'by-subject';
export const COMMAND_INDEX = 'by-command';

export interface IndexedDbSchemaMetadataV1 {
  readonly key: 'schema';
  readonly databaseSchemaVersion: 1;
  readonly canonicalSchemaVersion: 1;
}

export interface IndexedDbSchemaUpgradePlan {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly steps: readonly [1] | readonly [];
}

export function planIndexedDbSchemaUpgrade(
  fromVersion: number,
  toVersion: number,
): IndexedDbSchemaUpgradePlan {
  if (fromVersion === toVersion && toVersion === INDEXED_DB_SCHEMA_VERSION) {
    return { fromVersion, toVersion, steps: [] };
  }
  if (fromVersion === 0 && toVersion === INDEXED_DB_SCHEMA_VERSION) {
    return { fromVersion, toVersion, steps: [1] };
  }
  throw new PersistenceError(
    'unsupported-schema',
    `Unsupported IndexedDB schema transition: ${fromVersion} -> ${toVersion}.`,
  );
}

function installSchemaV1(database: IDBDatabase, transaction: IDBTransaction) {
  if (transaction.mode !== 'versionchange') {
    throw new PersistenceError(
      'unsupported-schema',
      'Schema installation requires a versionchange transaction.',
    );
  }

  const records = database.createObjectStore(CANONICAL_RECORD_STORE, {
    keyPath: 'recordId',
  });
  records.createIndex(SUBJECT_INDEX, 'subjectId', { unique: false });

  const log = database.createObjectStore(TRANSACTION_LOG_STORE, {
    autoIncrement: true,
    keyPath: 'sequence',
  });
  log.createIndex(COMMAND_INDEX, 'commandId', { unique: true });

  database.createObjectStore(COMMAND_RECEIPT_STORE, {
    keyPath: 'commandId',
  });
  const metadata = database.createObjectStore(METADATA_STORE, {
    keyPath: 'key',
  });
  metadata.put({
    key: 'schema',
    databaseSchemaVersion: 1,
    canonicalSchemaVersion: 1,
  } satisfies IndexedDbSchemaMetadataV1);
}

function validateInstalledSchemaV1(database: IDBDatabase): Promise<void> {
  const requiredStores = [
    CANONICAL_RECORD_STORE,
    TRANSACTION_LOG_STORE,
    COMMAND_RECEIPT_STORE,
    METADATA_STORE,
  ];
  const missingStores = requiredStores.filter(
    (store) => !database.objectStoreNames.contains(store),
  );
  if (missingStores.length > 0) {
    return Promise.reject(
      new PersistenceError(
        'unsupported-schema',
        `IndexedDB schema version 1 is incomplete: ${missingStores.join(', ')}.`,
      ),
    );
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(METADATA_STORE, 'readonly');
    const request = transaction.objectStore(METADATA_STORE).get('schema');
    request.addEventListener(
      'success',
      () => {
        const metadata = request.result as
          | IndexedDbSchemaMetadataV1
          | undefined;
        if (
          metadata?.databaseSchemaVersion !== 1 ||
          metadata.canonicalSchemaVersion !== 1
        ) {
          reject(
            new PersistenceError(
              'unsupported-schema',
              'IndexedDB schema metadata is missing or incompatible.',
            ),
          );
          return;
        }
        resolve();
      },
      { once: true },
    );
    request.addEventListener(
      'error',
      () =>
        reject(
          request.error ?? new Error('IndexedDB schema validation failed.'),
        ),
      { once: true },
    );
  });
}

export function runIndexedDbSchemaUpgrade(
  database: IDBDatabase,
  transaction: IDBTransaction,
  fromVersion: number,
  toVersion: number,
): void {
  const plan = planIndexedDbSchemaUpgrade(fromVersion, toVersion);
  for (const step of plan.steps) {
    if (step === 1) installSchemaV1(database, transaction);
  }
}

export function openIndexedDb(
  indexedDB: IDBFactory,
  databaseName: string,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, INDEXED_DB_SCHEMA_VERSION);
    let upgradeError: unknown;

    request.addEventListener('upgradeneeded', (event) => {
      try {
        const transaction = request.transaction;
        if (transaction === null) {
          throw new PersistenceError(
            'unsupported-schema',
            'IndexedDB did not provide an upgrade transaction.',
          );
        }
        runIndexedDbSchemaUpgrade(
          request.result,
          transaction,
          event.oldVersion,
          event.newVersion ?? INDEXED_DB_SCHEMA_VERSION,
        );
      } catch (error) {
        upgradeError = error;
        request.transaction?.abort();
      }
    });
    request.addEventListener(
      'success',
      () => {
        const database = request.result;
        void validateInstalledSchemaV1(database).then(
          () => resolve(database),
          (error: unknown) => {
            database.close();
            reject(error);
          },
        );
      },
      { once: true },
    );
    request.addEventListener(
      'error',
      () =>
        reject(
          upgradeError ??
            request.error ??
            new Error('IndexedDB open request failed.'),
        ),
      { once: true },
    );
    request.addEventListener(
      'blocked',
      () => reject(new Error('IndexedDB schema upgrade was blocked.')),
      { once: true },
    );
  });
}
