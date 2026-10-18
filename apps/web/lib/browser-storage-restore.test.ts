import { webcrypto } from 'node:crypto';

import {
  sealCanonicalRecordV1,
  verifyCanonicalRecordV1,
} from '@nutrixx/canonical-schema';
import {
  IndexedDbCanonicalRecordRepository,
  sha256Canonical,
} from '@nutrixx/persistence-indexeddb';
import { StartingProfileServiceV1 } from '@nutrixx/user-context';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { validateBrowserEditableDataset } from './browser-editable-validator';
import { encryptLocalFile } from './browser-local-file-crypto';
import {
  applyReviewedEditableLocalFile,
  createEditableLocalFile,
  downloadEditableLocalFile,
  downloadVerifiedLocalExport,
  identifyLocalFile,
  inspectEditableLocalFile,
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
  it('rejects the superseded pre-release envelope without a compatibility branch', async () => {
    await expect(
      identifyLocalFile(
        jsonFile({
          format: 'nutrixx.local-export',
          formatVersion: 1,
          kind: 'complete-backup',
          protection: 'plain',
        }),
      ),
    ).rejects.toThrow('Choose a supported Nutrixx local file.');
  });

  it.each([
    { kind: 'editable-data', encrypted: false },
    { kind: 'editable-data', encrypted: true },
    { kind: 'complete-backup', encrypted: false },
    { kind: 'complete-backup', encrypted: true },
  ] as const)(
    'downloads and reopens $kind with encryption=$encrypted entirely in the browser',
    async ({ kind, encrypted }) => {
      vi.stubGlobal('crypto', webcrypto);
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const indexedDB = new IDBFactory();
      vi.stubGlobal('indexedDB', indexedDB);
      vi.stubGlobal('IDBKeyRange', IDBKeyRange);
      const source = await repository(indexedDB, LOCAL_USER_DATABASE_NAME);
      await addProfile(source, SOURCE_PROFILE, SOURCE_OWNER);
      await source.close();
      localStorage.setItem(
        ONBOARDING_LOCATOR_STORAGE_KEY,
        JSON.stringify({
          profileId: SOURCE_PROFILE,
          ownerSubjectId: SOURCE_OWNER,
        }),
      );
      let downloaded: Blob | null = null;
      Object.defineProperties(URL, {
        createObjectURL: {
          configurable: true,
          value: vi.fn((blob: Blob) => {
            downloaded = blob;
            return 'blob:nutrixx-portability-test';
          }),
        },
        revokeObjectURL: { configurable: true, value: vi.fn() },
      });
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
        () => {},
      );
      const passphrase = encrypted ? 'a private export passphrase' : undefined;
      if (kind === 'editable-data') {
        await downloadEditableLocalFile(passphrase);
      } else {
        await downloadVerifiedLocalExport(passphrase);
      }
      expect(downloaded).not.toBeNull();
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(downloaded!);
      });
      const parsed = JSON.parse(text) as unknown;
      expect(await identifyLocalFile(jsonFile(parsed))).toEqual({
        kind,
        protection: encrypted ? 'password-encrypted' : 'plain',
      });
      if (encrypted) {
        expect(text).not.toContain(SOURCE_OWNER);
      }
      if (kind === 'editable-data') {
        const preview = await inspectEditableLocalFile(
          jsonFile(parsed),
          passphrase,
        );
        expect(preview.changes).toMatchObject([{ kind: 'unchanged' }]);
      } else {
        const preview = await inspectLocalExport(jsonFile(parsed), passphrase);
        expect(preview.profileId).toBe(SOURCE_PROFILE);
      }
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('opens an encrypted backup locally before validating the restore', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const indexedDB = new IDBFactory();
    vi.stubGlobal('indexedDB', indexedDB);
    vi.stubGlobal('IDBKeyRange', IDBKeyRange);
    const source = await repository(indexedDB, 'nutrixx-protected-source');
    await addProfile(source, SOURCE_PROFILE, SOURCE_OWNER);
    const encrypted = await encryptLocalFile(
      await source.exportLocalData(),
      'my private export passphrase',
    );
    await expect(inspectLocalExport(jsonFile(encrypted))).rejects.toMatchObject(
      {
        code: 'passphrase-required',
      },
    );
    await expect(
      inspectLocalExport(jsonFile(encrypted), 'wrong passphrase'),
    ).rejects.toMatchObject({ code: 'decryption-failed' });
    const preview = await inspectLocalExport(
      jsonFile(encrypted),
      'my private export passphrase',
    );
    expect(preview.profileId).toBe(SOURCE_PROFILE);
    expect(fetch).not.toHaveBeenCalled();
    await source.close();
  });

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
    Object.assign(tampered.content.manifest, { payloadSha256: '0'.repeat(64) });
    await expect(inspectLocalExport(jsonFile(tampered))).rejects.toThrow();
    const before = await repository(indexedDB, LOCAL_USER_DATABASE_NAME);
    expect(await before.getById(OLD_PROFILE)).not.toBeNull();
    await before.close();

    const preview = await inspectLocalExport(jsonFile(artifact));
    expect(preview.artifact.content.manifest.recordCount).toBe(1);
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

describe('editable local data', () => {
  it('decrypts editable facts before review without network access', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const indexedDB = new IDBFactory();
    vi.stubGlobal('indexedDB', indexedDB);
    vi.stubGlobal('IDBKeyRange', IDBKeyRange);
    const source = await repository(indexedDB, 'nutrixx-protected-editable');
    await addProfile(source, SOURCE_PROFILE, SOURCE_OWNER);
    const encrypted = await encryptLocalFile(
      await source.exportEditableData(SOURCE_OWNER),
      'my private export passphrase',
    );
    const preview = await inspectEditableLocalFile(
      jsonFile(encrypted),
      'my private export passphrase',
    );
    expect(preview.changes).toMatchObject([{ kind: 'add' }]);
    expect(fetch).not.toHaveBeenCalled();
    await source.close();
  });

  it('transfers the profile into an empty browser as editable facts', async () => {
    const indexedDB = new IDBFactory();
    vi.stubGlobal('indexedDB', indexedDB);
    vi.stubGlobal('IDBKeyRange', IDBKeyRange);
    const source = await repository(indexedDB, 'nutrixx-editable-source');
    await addProfile(source, SOURCE_PROFILE, SOURCE_OWNER);
    const file = await source.exportEditableData(SOURCE_OWNER);
    const preview = await inspectEditableLocalFile(jsonFile(file));
    expect(preview).toMatchObject({
      targetWasEmpty: true,
      changes: [{ kind: 'add' }],
    });
    await applyReviewedEditableLocalFile(preview);
    expect(
      JSON.parse(localStorage.getItem(ONBOARDING_LOCATOR_STORAGE_KEY)!),
    ).toEqual({
      profileId: SOURCE_PROFILE,
      ownerSubjectId: SOURCE_OWNER,
    });
    const current = await repository(indexedDB, LOCAL_USER_DATABASE_NAME);
    expect(await current.getById(SOURCE_PROFILE)).not.toBeNull();
    expect(await current.listTransactions()).toHaveLength(1);
    await current.close();
    await source.close();
  });

  it('reviews a profile correction and imports it as a new transaction', async () => {
    const indexedDB = new IDBFactory();
    vi.stubGlobal('indexedDB', indexedDB);
    vi.stubGlobal('IDBKeyRange', IDBKeyRange);
    const current = await repository(indexedDB, LOCAL_USER_DATABASE_NAME);
    await addProfile(current, SOURCE_PROFILE, SOURCE_OWNER);
    await current.close();
    localStorage.setItem(
      ONBOARDING_LOCATOR_STORAGE_KEY,
      JSON.stringify({
        profileId: SOURCE_PROFILE,
        ownerSubjectId: SOURCE_OWNER,
      }),
    );
    const file = structuredClone(await createEditableLocalFile());
    const deletedProfile = structuredClone(file);
    const firstFact = deletedProfile.content.facts[0];
    if (!firstFact) {
      throw new Error('Expected the editable export to contain a profile.');
    }
    Object.assign(firstFact, { action: 'delete' });
    await expect(
      inspectEditableLocalFile(jsonFile(deletedProfile)),
    ).rejects.toThrow();
    const profile = file.content.facts.find(
      (fact) => fact.recordType === 'user-context.starting-profile',
    )!;
    Object.assign(profile.payload as object, { ageYears: 33 });
    const preview = await inspectEditableLocalFile(jsonFile(file));
    expect(preview.changes).toMatchObject([{ kind: 'correct' }]);
    await applyReviewedEditableLocalFile(preview);
    const reloaded = await repository(indexedDB, LOCAL_USER_DATABASE_NAME);
    const updated = await reloaded.getById(SOURCE_PROFILE);
    expect(updated?.payload).toMatchObject({ ageYears: 33, revision: 2 });
    expect(await reloaded.listTransactions()).toHaveLength(2);
    await reloaded.close();
  });

  it('rejects a head whose active version is absent from the imported dataset', async () => {
    const indexedDB = new IDBFactory();
    const source = await repository(indexedDB, 'nutrixx-link-validation');
    await addProfile(source, SOURCE_PROFILE, SOURCE_OWNER);
    const profile = (await source.listBySubject(SOURCE_OWNER))[0]!;
    const head = await sealCanonicalRecordV1(
      {
        format: 'nutrixx.canonical-record',
        schemaVersion: 1,
        recordType: 'food.custom-head',
        recordVersion: 1,
        recordId: '30000000-0000-4000-8000-000000000001',
        subjectId: SOURCE_OWNER,
        owningContext: 'food-knowledge',
        logicalVersion: 1,
        createdAt: NOW,
        updatedAt: NOW,
        provenance: {
          method: 'user-entered',
          source: { kind: 'user', sourceId: SOURCE_OWNER },
          recordedAt: NOW,
        },
        payload: {
          foodId: '30000000-0000-4000-8000-000000000001',
          ownerSubjectId: SOURCE_OWNER,
          activeRevision: 1,
          activeVersionRecordId: '30000000-0000-4000-8000-000000000002',
        },
      },
      sha256Canonical,
    );
    expect(validateBrowserEditableDataset([profile, head])).toBe(false);
    await source.close();
  });
});
