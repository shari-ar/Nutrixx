import { verifyCanonicalRecordV1 } from '@nutrixx/canonical-schema';
import {
  validateEditableDataFileV1,
  validateLocalDataExportV1,
  type EditableChangeV1,
  type EditableDataFileV1,
  type EditableImportPreviewV1,
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
import {
  StartingProfileRecordV1Schema,
  StartingProfileV1Schema,
} from '@nutrixx/user-context';

import {
  validateBrowserEditableDataset,
  validateBrowserEditableRecord,
} from './browser-editable-validator';
import { encryptLocalFile, openLocalFile } from './browser-local-file-crypto';
import { BrowserOnboardingStore } from './browser-onboarding';
import {
  LAST_EXPORT_STORAGE_KEY,
  LOCAL_USER_DATABASE_NAME,
  ONBOARDING_LOCATOR_STORAGE_KEY,
  PLANNING_CATALOG_CACHE_DATABASE_NAME,
  PLANNING_VIEW_DATABASE_NAME,
  REFERENCE_CACHE_DATABASE_NAME,
} from './storage-constants';

export {
  LOCAL_USER_DATABASE_NAME,
  PLANNING_CATALOG_CACHE_DATABASE_NAME,
  PLANNING_VIEW_DATABASE_NAME,
  REFERENCE_CACHE_DATABASE_NAME,
};

type RetentionStatus = 'persistent' | 'best-effort' | 'unavailable' | 'unknown';

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

export interface LocalFileIdentityV1 {
  readonly kind: 'editable-data' | 'complete-backup';
  readonly protection: 'plain' | 'password-encrypted';
}

export async function identifyLocalFile(
  file: File,
): Promise<LocalFileIdentityV1> {
  let input: unknown;
  try {
    input = JSON.parse(await file.text());
  } catch {
    throw new TypeError('Choose a valid Nutrixx local JSON file.');
  }
  if (
    typeof input !== 'object' ||
    input === null ||
    Array.isArray(input) ||
    !('format' in input) ||
    input.format !== 'nutrixx.local-file' ||
    !('formatVersion' in input) ||
    input.formatVersion !== 1 ||
    !('kind' in input) ||
    (input.kind !== 'editable-data' && input.kind !== 'complete-backup') ||
    !('protection' in input) ||
    (input.protection !== 'plain' && input.protection !== 'password-encrypted')
  ) {
    throw new TypeError('Choose a supported Nutrixx local file.');
  }
  return { kind: input.kind, protection: input.protection };
}

function editableProfile(preview: EditableImportPreviewV1) {
  const profiles = preview.file.content.facts.filter(
    (fact) =>
      fact.recordType === 'user-context.starting-profile' &&
      fact.action === 'upsert',
  );
  const parsed =
    profiles.length === 1
      ? StartingProfileV1Schema.safeParse(profiles[0]?.payload)
      : null;
  if (
    parsed === null ||
    !parsed.success ||
    profiles[0]?.recordId !== parsed.data.profileId ||
    parsed.data.ownerSubjectId !== preview.file.content.manifest.subjectId
  ) {
    throw new TypeError(
      'The editable file must contain one complete local profile.',
    );
  }
  return parsed.data;
}

export async function createEditableLocalFile(): Promise<EditableDataFileV1> {
  const profile = await new BrowserOnboardingStore().load();
  if (profile === null)
    throw new TypeError('Complete the local profile before exporting data.');
  const repository = await IndexedDbCanonicalRecordRepository.create({
    databaseName: LOCAL_USER_DATABASE_NAME,
    indexedDB,
    keyRange: IDBKeyRange,
    verifyRecord: (record) => verifyCanonicalRecordV1(record, sha256Canonical),
  });
  try {
    return await repository.exportEditableData(profile.ownerSubjectId);
  } finally {
    await repository.close();
  }
}

function downloadLocalJsonFile(value: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.hidden = true;
  try {
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export async function downloadEditableLocalFile(
  passphrase?: string,
): Promise<void> {
  const plain = validateEditableDataFileV1(await createEditableLocalFile());
  if (new TextEncoder().encode(JSON.stringify(plain)).byteLength > 50_000_000) {
    throw new TypeError(
      'The editable data payload exceeds the 50 MB review limit.',
    );
  }
  const file =
    passphrase === undefined
      ? plain
      : await encryptLocalFile(plain, passphrase);
  downloadLocalJsonFile(
    file,
    `nutrixx-editable-data${passphrase === undefined ? '' : '-encrypted'}-${plain.content.manifest.exportedAt.slice(0, 10)}.json`,
  );
}

export async function inspectEditableLocalFile(
  file: File,
  passphrase?: string,
): Promise<EditableImportPreviewV1> {
  if (typeof file.size === 'number' && file.size > 70_000_000) {
    throw new TypeError(
      'The editable data file exceeds the 70 MB encrypted-file limit.',
    );
  }
  let input: unknown;
  try {
    input = JSON.parse(await file.text());
  } catch {
    throw new TypeError('Choose a valid Nutrixx editable data JSON file.');
  }
  const plain = await openLocalFile(input, passphrase);
  if (new TextEncoder().encode(JSON.stringify(plain)).byteLength > 50_000_000) {
    throw new TypeError(
      'The editable data payload exceeds the 50 MB review limit.',
    );
  }
  const repository = await IndexedDbCanonicalRecordRepository.create({
    databaseName: LOCAL_USER_DATABASE_NAME,
    indexedDB,
    keyRange: IDBKeyRange,
    verifyRecord: (record) => verifyCanonicalRecordV1(record, sha256Canonical),
    validatePortableRecord: validateBrowserEditableRecord,
    validatePortableDataset: validateBrowserEditableDataset,
  });
  try {
    const preview = await repository.previewEditableData(plain);
    editableProfile(preview);
    return preview;
  } finally {
    await repository.close();
  }
}

export async function applyReviewedEditableLocalFile(
  preview: EditableImportPreviewV1,
): Promise<readonly EditableChangeV1[]> {
  const profile = editableProfile(preview);
  const locator = JSON.stringify({
    profileId: profile.profileId,
    ownerSubjectId: profile.ownerSubjectId,
  });
  assertLocatorWritable(locator);
  const repository = await IndexedDbCanonicalRecordRepository.create({
    databaseName: LOCAL_USER_DATABASE_NAME,
    indexedDB,
    keyRange: IDBKeyRange,
    verifyRecord: (record) => verifyCanonicalRecordV1(record, sha256Canonical),
    validatePortableRecord: validateBrowserEditableRecord,
    validatePortableDataset: validateBrowserEditableDataset,
  });
  try {
    await deleteIndexedDbDatabase(
      indexedDB,
      PLANNING_CATALOG_CACHE_DATABASE_NAME,
    );
    await deleteIndexedDbDatabase(indexedDB, PLANNING_VIEW_DATABASE_NAME);
    const changes = await repository.importEditableData(preview);
    localStorage.setItem(ONBOARDING_LOCATOR_STORAGE_KEY, locator);
    return changes;
  } finally {
    await repository.close();
  }
}

function assertLocatorWritable(locator: string): void {
  const previousLocator = localStorage.getItem(ONBOARDING_LOCATOR_STORAGE_KEY);
  localStorage.setItem(ONBOARDING_LOCATOR_STORAGE_KEY, locator);
  if (previousLocator === null) {
    localStorage.removeItem(ONBOARDING_LOCATOR_STORAGE_KEY);
  } else {
    localStorage.setItem(ONBOARDING_LOCATOR_STORAGE_KEY, previousLocator);
  }
}

export async function inspectLocalExport(
  file: File,
  passphrase?: string,
): Promise<VerifiedLocalRestoreV1> {
  let input: unknown;
  try {
    input = JSON.parse(await file.text());
  } catch {
    throw new TypeError('Choose a valid Nutrixx export JSON file.');
  }
  const artifact = await validateLocalDataExportV1(
    await openLocalFile(input, passphrase),
    {
      hash: sha256Canonical,
      verifyRecord: (record) =>
        verifyCanonicalRecordV1(record, sha256Canonical),
    },
  );
  const profiles = artifact.content.records.flatMap((record) => {
    const result = StartingProfileRecordV1Schema.safeParse(record);
    return result.success ? [result.data.payload] : [];
  });
  const profile = profiles[0];
  if (
    profiles.length !== 1 ||
    profile === undefined ||
    artifact.content.manifest.subjectIds.length !== 1 ||
    artifact.content.manifest.subjectIds[0] !== profile.ownerSubjectId
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
  assertLocatorWritable(locator);
  const repository = await IndexedDbCanonicalRecordRepository.create({
    databaseName: LOCAL_USER_DATABASE_NAME,
    indexedDB,
    keyRange: IDBKeyRange,
    verifyRecord: (record) => verifyCanonicalRecordV1(record, sha256Canonical),
  });
  try {
    await deleteIndexedDbDatabase(
      indexedDB,
      PLANNING_CATALOG_CACHE_DATABASE_NAME,
    );
    await deleteIndexedDbDatabase(indexedDB, PLANNING_VIEW_DATABASE_NAME);
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

export async function downloadVerifiedLocalExport(
  passphrase?: string,
): Promise<void> {
  const repository = await IndexedDbCanonicalRecordRepository.create({
    databaseName: LOCAL_USER_DATABASE_NAME,
    indexedDB,
    verifyRecord: (record) => verifyCanonicalRecordV1(record, sha256Canonical),
  });
  try {
    const artifact = await repository.exportLocalData();
    const file =
      passphrase === undefined
        ? artifact
        : await encryptLocalFile(artifact, passphrase);
    downloadLocalJsonFile(
      file,
      `nutrixx-complete-backup${passphrase === undefined ? '' : '-encrypted'}-${artifact.content.manifest.exportedAt.slice(0, 10)}.json`,
    );
    writeLastVerifiedExportAt(artifact.content.manifest.exportedAt);
  } finally {
    await repository.close();
  }
}

export async function clearAllLocalData(): Promise<void> {
  await deleteIndexedDbDatabase(
    indexedDB,
    PLANNING_CATALOG_CACHE_DATABASE_NAME,
  );
  await deleteIndexedDbDatabase(indexedDB, PLANNING_VIEW_DATABASE_NAME);
  await deleteIndexedDbDatabase(indexedDB, REFERENCE_CACHE_DATABASE_NAME);
  await deleteIndexedDbDatabase(indexedDB, LOCAL_USER_DATABASE_NAME);
  try {
    localStorage.removeItem(LAST_EXPORT_STORAGE_KEY);
    localStorage.removeItem(ONBOARDING_LOCATOR_STORAGE_KEY);
  } catch {
    // The databases are the authority; metadata cleanup is best effort.
  }
}
