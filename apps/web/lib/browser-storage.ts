import { verifyCanonicalRecordV1 } from '@nutrixx/canonical-schema';
import {
  validateLocalDataExportV1,
  type LocalDataExportArtifactV1,
} from '@nutrixx/persistence';
import {
  INDEXED_DB_SCHEMA_VERSION,
  REFERENCE_CACHE_SCHEMA_VERSION,
  IndexedDbCanonicalRecordRepository,
  IndexedDbReferenceDatasetCache,
  assessStoragePressure,
  deleteIndexedDbDatabase,
  sha256Canonical,
  type StoragePressureAssessment,
} from '@nutrixx/persistence-indexeddb';
import { StartingProfileRecordV1Schema } from '@nutrixx/user-context';

import {
  LAST_EXPORT_STORAGE_KEY,
  LOCAL_USER_DATABASE_NAME,
  ONBOARDING_LOCATOR_STORAGE_KEY,
  REFERENCE_CACHE_DATABASE_NAME,
} from './storage-constants';

export { LOCAL_USER_DATABASE_NAME, REFERENCE_CACHE_DATABASE_NAME };

export type RetentionStatus =
  | 'persistent'
  | 'best-effort'
  | 'unavailable'
  | 'unknown';

export interface BrowserStorageSnapshot {
  readonly authorityMode: 'Local';
  readonly browserProfileScope: 'This browser profile';
  readonly online: boolean;
  readonly retention: RetentionStatus;
  readonly pressure: StoragePressureAssessment;
  readonly canonicalSchemaVersion: number;
  readonly databaseSchemaVersion: number;
  readonly referenceCacheSchemaVersion: number;
  readonly activeReferenceRelease: string | null;
  readonly lastVerifiedExportAt: string | null;
}

export type PersistenceRequestResult = 'granted' | 'denied' | 'unavailable';

export interface VerifiedLocalRestoreV1 {
  readonly artifact: LocalDataExportArtifactV1;
  readonly profileId: string;
  readonly ownerSubjectId: string;
}

export async function inspectLocalExport(
  file: File,
): Promise<VerifiedLocalRestoreV1> {
  let input: unknown;
  try {
    input = JSON.parse(await file.text());
  } catch {
    throw new TypeError('Choose a valid Nutrixx export JSON file.');
  }
  const artifact = await validateLocalDataExportV1(input, {
    hash: sha256Canonical,
    verifyRecord: (record) => verifyCanonicalRecordV1(record, sha256Canonical),
  });
  const profiles = artifact.records.flatMap((record) => {
    const result = StartingProfileRecordV1Schema.safeParse(record);
    return result.success ? [result.data.payload] : [];
  });
  const profile = profiles[0];
  if (
    profiles.length !== 1 ||
    profile === undefined ||
    artifact.manifest.subjectIds.length !== 1 ||
    artifact.manifest.subjectIds[0] !== profile.ownerSubjectId
  ) {
    throw new TypeError('The export must contain one complete local profile.');
  }
  return {
    artifact,
    profileId: profile.profileId,
    ownerSubjectId: profile.ownerSubjectId,
  };
}

export async function restoreVerifiedLocalExport(
  preview: VerifiedLocalRestoreV1,
): Promise<void> {
  const locator = JSON.stringify({
    profileId: preview.profileId,
    ownerSubjectId: preview.ownerSubjectId,
  });
  const previousLocator = localStorage.getItem(ONBOARDING_LOCATOR_STORAGE_KEY);
  // Confirm the browser can retain the locator before replacing canonical data.
  localStorage.setItem(ONBOARDING_LOCATOR_STORAGE_KEY, locator);
  if (previousLocator === null) {
    localStorage.removeItem(ONBOARDING_LOCATOR_STORAGE_KEY);
  } else {
    localStorage.setItem(ONBOARDING_LOCATOR_STORAGE_KEY, previousLocator);
  }
  const repository = await IndexedDbCanonicalRecordRepository.create({
    databaseName: LOCAL_USER_DATABASE_NAME,
    indexedDB,
    keyRange: IDBKeyRange,
    verifyRecord: (record) => verifyCanonicalRecordV1(record, sha256Canonical),
  });
  try {
    await repository.importLocalData(preview.artifact);
    localStorage.setItem(ONBOARDING_LOCATOR_STORAGE_KEY, locator);
    try {
      localStorage.removeItem(LAST_EXPORT_STORAGE_KEY);
    } catch {
      // Operational export metadata must not turn a completed restore into a failure.
    }
  } finally {
    await repository.close();
  }
}

function readLastVerifiedExportAt(): string | null {
  try {
    return localStorage.getItem(LAST_EXPORT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLastVerifiedExportAt(exportedAt: string): void {
  try {
    localStorage.setItem(LAST_EXPORT_STORAGE_KEY, exportedAt);
  } catch {
    // Export remains valid even when operational metadata cannot be retained.
  }
}

async function readRetentionStatus(): Promise<RetentionStatus> {
  const persisted = navigator.storage?.persisted;
  if (typeof persisted !== 'function') return 'unavailable';
  try {
    return (await persisted.call(navigator.storage))
      ? 'persistent'
      : 'best-effort';
  } catch {
    return 'unknown';
  }
}

async function readStorageEstimate(): Promise<StorageEstimate | null> {
  const estimate = navigator.storage?.estimate;
  if (typeof estimate !== 'function') return null;
  try {
    return await estimate.call(navigator.storage);
  } catch {
    return null;
  }
}

async function readActiveReferenceRelease(): Promise<string | null> {
  let cache: IndexedDbReferenceDatasetCache | undefined;
  try {
    cache = await IndexedDbReferenceDatasetCache.create({
      databaseName: REFERENCE_CACHE_DATABASE_NAME,
      indexedDB,
    });
    const releases = await cache.listReleases();
    return releases.find(({ active }) => active)?.releaseId ?? null;
  } catch {
    return null;
  } finally {
    await cache?.close();
  }
}

export async function readBrowserStorageSnapshot(): Promise<BrowserStorageSnapshot> {
  const [retention, estimate, activeReferenceRelease] = await Promise.all([
    readRetentionStatus(),
    readStorageEstimate(),
    readActiveReferenceRelease(),
  ]);
  return {
    authorityMode: 'Local',
    browserProfileScope: 'This browser profile',
    online: navigator.onLine,
    retention,
    pressure: assessStoragePressure(estimate),
    canonicalSchemaVersion: 1,
    databaseSchemaVersion: INDEXED_DB_SCHEMA_VERSION,
    referenceCacheSchemaVersion: REFERENCE_CACHE_SCHEMA_VERSION,
    activeReferenceRelease,
    lastVerifiedExportAt: readLastVerifiedExportAt(),
  };
}

export async function requestBrowserPersistence(): Promise<PersistenceRequestResult> {
  const persist = navigator.storage?.persist;
  if (typeof persist !== 'function') return 'unavailable';
  try {
    return (await persist.call(navigator.storage)) ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

export async function downloadVerifiedLocalExport(): Promise<void> {
  const repository = await IndexedDbCanonicalRecordRepository.create({
    databaseName: LOCAL_USER_DATABASE_NAME,
    indexedDB,
    verifyRecord: (record) => verifyCanonicalRecordV1(record, sha256Canonical),
  });
  try {
    const artifact = await repository.exportLocalData();
    const blob = new Blob([JSON.stringify(artifact, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `nutrixx-local-export-${artifact.manifest.exportedAt.slice(0, 10)}.json`;
    link.href = url;
    link.hidden = true;
    try {
      document.body.append(link);
      link.click();
    } finally {
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
    writeLastVerifiedExportAt(artifact.manifest.exportedAt);
  } finally {
    await repository.close();
  }
}

export async function clearAllLocalData(): Promise<void> {
  await deleteIndexedDbDatabase(indexedDB, REFERENCE_CACHE_DATABASE_NAME);
  await deleteIndexedDbDatabase(indexedDB, LOCAL_USER_DATABASE_NAME);
  try {
    localStorage.removeItem(LAST_EXPORT_STORAGE_KEY);
    localStorage.removeItem(ONBOARDING_LOCATOR_STORAGE_KEY);
  } catch {
    // The databases are the authority; metadata cleanup is best effort.
  }
}
