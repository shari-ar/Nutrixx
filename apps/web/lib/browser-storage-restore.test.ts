import { verifyCanonicalRecordV1 } from '@nutrixx/canonical-schema';
import {
  IndexedDbCanonicalRecordRepository,
  sha256Canonical,
} from '@nutrixx/persistence-indexeddb';
import { StartingProfileServiceV1 } from '@nutrixx/user-context';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  inspectLocalExport,
  restoreVerifiedLocalExport,
} from './browser-storage';
import {
  LOCAL_USER_DATABASE_NAME,
  ONBOARDING_LOCATOR_STORAGE_KEY,
} from './storage-constants';

const NOW = '2026-10-11T12:00:00.000Z';
const SOURCE_PROFILE = '10000000-0000-4000-8000-000000000001';
const SOURCE_OWNER = '10000000-0000-4000-8000-000000000002';
const OLD_PROFILE = '20000000-0000-4000-8000-000000000001';
const OLD_OWNER = '20000000-0000-4000-8000-000000000002';

function repository(indexedDB: IDBFactory, databaseName: string) {
  return IndexedDbCanonicalRecordRepository.create({
    databaseName,
    indexedDB,
    keyRange: IDBKeyRange,
    verifyRecord: (record) => verifyCanonicalRecordV1(record, sha256Canonical),
    now: () => NOW,
  });
}

async function addProfile(
  target: IndexedDbCanonicalRecordRepository,
  profileId: string,
  ownerSubjectId: string,
) {
  await new StartingProfileServiceV1({
    repository: target,
    digestSha256Hex: sha256Canonical,
  }).save({
    profileId,
    ownerSubjectId,
    ageYears: 32,
    heightCentimeters: '170',
    weightKilograms: '70',
    physiologicalReference: 'female',
    primaryGoal: 'maintain',
    foodRestrictions: [],
    timeZone: 'UTC',
    adultConfirmedAt: NOW,
    savedAt: NOW,
  });
}

function jsonFile(value: unknown): File {
  return { text: async () => JSON.stringify(value) } as File;
}

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('verified local backup restore', () => {
  it('verifies before confirmation, replaces data, and reconnects the imported profile', async () => {
    const indexedDB = new IDBFactory();
    vi.stubGlobal('indexedDB', indexedDB);
    vi.stubGlobal('IDBKeyRange', IDBKeyRange);
    const source = await repository(indexedDB, 'nutrixx-restore-source');
    await addProfile(source, SOURCE_PROFILE, SOURCE_OWNER);
    const artifact = await source.exportLocalData();
    const current = await repository(indexedDB, LOCAL_USER_DATABASE_NAME);
    await addProfile(current, OLD_PROFILE, OLD_OWNER);
    await current.close();
    localStorage.setItem(
      ONBOARDING_LOCATOR_STORAGE_KEY,
      JSON.stringify({ profileId: OLD_PROFILE, ownerSubjectId: OLD_OWNER }),
    );

    const tampered = structuredClone(artifact);
    Object.assign(tampered.manifest, { payloadSha256: '0'.repeat(64) });
    await expect(inspectLocalExport(jsonFile(tampered))).rejects.toThrow();
    const before = await repository(indexedDB, LOCAL_USER_DATABASE_NAME);
    expect(await before.getById(OLD_PROFILE)).not.toBeNull();
    await before.close();

    const preview = await inspectLocalExport(jsonFile(artifact));
    expect(preview.artifact.manifest.recordCount).toBe(1);
    expect(
      JSON.parse(localStorage.getItem(ONBOARDING_LOCATOR_STORAGE_KEY)!),
    ).toMatchObject({
      profileId: OLD_PROFILE,
    });
    await restoreVerifiedLocalExport(preview);

    const restored = await repository(indexedDB, LOCAL_USER_DATABASE_NAME);
    expect(await restored.getById(SOURCE_PROFILE)).not.toBeNull();
    expect(await restored.getById(OLD_PROFILE)).toBeNull();
    expect(
      JSON.parse(localStorage.getItem(ONBOARDING_LOCATOR_STORAGE_KEY)!),
    ).toEqual({
      profileId: SOURCE_PROFILE,
      ownerSubjectId: SOURCE_OWNER,
    });
    await restored.close();
    await source.close();
  });
});
