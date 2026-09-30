import type { CanonicalRecordV1 } from '@nutrixx/canonical-schema';
import {
  PersistenceError,
  classifyCanonicalWrite,
  validateCanonicalRecord,
  type CanonicalRecordRepository,
  type CanonicalRecordVerifier,
  type CanonicalWriteResult,
} from '@nutrixx/persistence';

const STORE = 'canonical-records';
const SUBJECT_INDEX = 'by-subject';

export interface IndexedDbRepositoryOptions {
  readonly databaseName: string;
  readonly indexedDB: IDBFactory;
  readonly verifyRecord: CanonicalRecordVerifier;
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

async function openDatabase(
  indexedDB: IDBFactory,
  databaseName: string,
): Promise<IDBDatabase> {
  const request = indexedDB.open(databaseName, 1);
  request.addEventListener('upgradeneeded', () => {
    const store = request.result.createObjectStore(STORE, {
      keyPath: 'recordId',
    });
    store.createIndex(SUBJECT_INDEX, 'subjectId', { unique: false });
  });
  return requestResult(request);
}

export class IndexedDbCanonicalRecordRepository
  implements CanonicalRecordRepository
{
  readonly #database: IDBDatabase;
  readonly #options: IndexedDbRepositoryOptions;
  #closed = false;

  private constructor(
    database: IDBDatabase,
    options: IndexedDbRepositoryOptions,
  ) {
    this.#database = database;
    this.#options = options;
  }

  public static async create(
    options: IndexedDbRepositoryOptions,
  ): Promise<IndexedDbCanonicalRecordRepository> {
    return new IndexedDbCanonicalRecordRepository(
      await openDatabase(options.indexedDB, options.databaseName),
      options,
    );
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new PersistenceError('closed', 'The repository is closed.');
    }
  }

  public async put(input: CanonicalRecordV1): Promise<CanonicalWriteResult> {
    this.#assertOpen();
    const record = await validateCanonicalRecord(
      input,
      this.#options.verifyRecord,
    );
    const transaction = this.#database.transaction(STORE, 'readwrite', {
      durability: 'strict',
    });
    const store = transaction.objectStore(STORE);
    try {
      const existing = (await requestResult(store.get(record.recordId))) as
        | CanonicalRecordV1
        | undefined;
      const result = classifyCanonicalWrite(existing ?? null, record);
      if (result !== 'unchanged') {
        await requestResult(store.put(structuredClone(record)));
      }
      await transactionComplete(transaction);
      return result;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already be complete after a failed policy check.
      }
      throw error;
    }
  }

  public async getById(recordId: string): Promise<CanonicalRecordV1 | null> {
    this.#assertOpen();
    const transaction = this.#database.transaction(STORE, 'readonly');
    const value = (await requestResult(
      transaction.objectStore(STORE).get(recordId),
    )) as CanonicalRecordV1 | undefined;
    await transactionComplete(transaction);
    return value === undefined ? null : structuredClone(value);
  }

  public async listBySubject(
    subjectId: string,
  ): Promise<readonly CanonicalRecordV1[]> {
    this.#assertOpen();
    const transaction = this.#database.transaction(STORE, 'readonly');
    const values = (await requestResult(
      transaction.objectStore(STORE).index(SUBJECT_INDEX).getAll(subjectId),
    )) as CanonicalRecordV1[];
    await transactionComplete(transaction);
    return structuredClone(
      values.sort((left, right) => left.recordId.localeCompare(right.recordId)),
    );
  }

  public async deleteById(recordId: string): Promise<boolean> {
    this.#assertOpen();
    const transaction = this.#database.transaction(STORE, 'readwrite', {
      durability: 'strict',
    });
    const store = transaction.objectStore(STORE);
    const existed = (await requestResult(store.getKey(recordId))) !== undefined;
    if (existed) await requestResult(store.delete(recordId));
    await transactionComplete(transaction);
    return existed;
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
