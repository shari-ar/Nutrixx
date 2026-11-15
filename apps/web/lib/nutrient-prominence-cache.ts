import { canonicalizeJson } from '@nutrixx/canonical-schema';
import { sha256Canonical } from '@nutrixx/persistence-indexeddb';

import {
  NUTRIENT_PROMINENCE_POLICY_VERSION_V1,
  buildNutrientProminenceIndexV1,
  type NutrientProminenceIndexV1,
} from './nutrient-prominence';

import type { NextMealCatalogSnapshot } from './next-meal-catalog';

const DATABASE_NAME = 'nutrixx-nutrient-prominence-v1';
const STORE = 'indexes';
const ACTIVE_KEY = 'active';

interface StoredIndexV1 {
  readonly key: typeof ACTIVE_KEY;
  readonly manifestDigest: string;
  readonly policyVersion: typeof NUTRIENT_PROMINENCE_POLICY_VERSION_V1;
  readonly index: NutrientProminenceIndexV1;
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

async function manifestDigest(
  catalog: NextMealCatalogSnapshot,
): Promise<string> {
  return sha256Canonical(
    canonicalizeJson({
      policyVersion: NUTRIENT_PROMINENCE_POLICY_VERSION_V1,
      entryKeys: [...catalog.manifest.entryKeys],
    }),
  );
}

export async function loadOrBuildNutrientProminenceIndexV1(
  catalog: NextMealCatalogSnapshot,
  factory: IDBFactory = indexedDB,
): Promise<NutrientProminenceIndexV1> {
  const digest = await manifestDigest(catalog);
  let database: IDBDatabase | null = null;
  try {
    database = await openDatabase(factory);
    const read = database.transaction(STORE, 'readonly');
    const existing = await requestResult<StoredIndexV1 | undefined>(
      read.objectStore(STORE).get(ACTIVE_KEY),
    );
    if (
      existing?.manifestDigest === digest &&
      existing.policyVersion === NUTRIENT_PROMINENCE_POLICY_VERSION_V1
    )
      return existing.index;

    const index = buildNutrientProminenceIndexV1(catalog);
    const write = database.transaction(STORE, 'readwrite');
    write.objectStore(STORE).put({
      key: ACTIVE_KEY,
      manifestDigest: digest,
      policyVersion: NUTRIENT_PROMINENCE_POLICY_VERSION_V1,
      index,
    } satisfies StoredIndexV1);
    await transactionDone(write);
    return index;
  } catch {
    return buildNutrientProminenceIndexV1(catalog);
  } finally {
    database?.close();
  }
}
