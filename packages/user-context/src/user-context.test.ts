import { createHash } from 'node:crypto';

import {
  verifyCanonicalRecordV1,
  type CanonicalRecordV1,
} from '@nutrixx/canonical-schema';
import { IndexedDbCanonicalRecordRepository } from '@nutrixx/persistence-indexeddb';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import { StartingProfileServiceV1 } from './service.js';

const PROFILE_ID = '10000000-0000-4000-8000-000000000001';
const SUBJECT_ID = '20000000-0000-4000-8000-000000000001';
const FIRST_TIME = '2026-10-04T10:00:00.000Z';
const SECOND_TIME = '2026-10-04T10:05:00.000Z';
const digest = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');
const verify = (record: CanonicalRecordV1) =>
  verifyCanonicalRecordV1(record, digest);

function command(savedAt = FIRST_TIME) {
  return {
    profileId: PROFILE_ID,
    ownerSubjectId: SUBJECT_ID,
    ageYears: 32,
    heightCentimeters: '172',
    weightKilograms: '68',
    physiologicalReference: 'female' as const,
    primaryGoal: 'maintain' as const,
    foodRestrictions: ['peanut allergy'],
    timeZone: 'America/New_York',
    adultConfirmedAt: FIRST_TIME,
    savedAt,
  };
}

async function repository(indexedDB: IDBFactory) {
  return IndexedDbCanonicalRecordRepository.create({
    databaseName: 'nutrixx-user-context-test',
    indexedDB,
    keyRange: IDBKeyRange,
    verifyRecord: verify,
  });
}

describe('Starting profile service', () => {
  it('persists the minimal profile as one canonical revision', async () => {
    const database = new IDBFactory();
    const store = await repository(database);
    const service = new StartingProfileServiceV1({
      repository: store,
      digestSha256Hex: digest,
    });
    await expect(service.save(command())).resolves.toMatchObject({
      profile: { revision: 1, primaryGoal: 'maintain' },
      writeResult: 'inserted',
    });
    await expect(service.get(PROFILE_ID)).resolves.toMatchObject({
      ownerSubjectId: SUBJECT_ID,
      ageYears: 32,
      foodRestrictions: ['peanut allergy'],
    });
    await store.close();
  });

  it('updates the stable profile instead of repeating onboarding', async () => {
    const database = new IDBFactory();
    const store = await repository(database);
    const service = new StartingProfileServiceV1({
      repository: store,
      digestSha256Hex: digest,
    });
    await service.save(command());
    await expect(
      service.save({
        ...command(SECOND_TIME),
        weightKilograms: '67.5',
        primaryGoal: 'lose',
      }),
    ).resolves.toMatchObject({
      profile: {
        revision: 2,
        weightKilograms: '67.5',
        primaryGoal: 'lose',
        createdAt: FIRST_TIME,
        updatedAt: SECOND_TIME,
      },
      writeResult: 'updated',
    });
    await store.close();
  });

  it('survives repository reload while rejecting stale updates', async () => {
    const database = new IDBFactory();
    const firstStore = await repository(database);
    await new StartingProfileServiceV1({
      repository: firstStore,
      digestSha256Hex: digest,
    }).save(command());
    await firstStore.close();

    const secondStore = await repository(database);
    const service = new StartingProfileServiceV1({
      repository: secondStore,
      digestSha256Hex: digest,
    });
    await expect(service.get(PROFILE_ID)).resolves.toMatchObject({
      revision: 1,
    });
    await expect(
      service.save({
        ...command('2026-10-04T09:59:59.000Z'),
        adultConfirmedAt: '2026-10-04T09:59:59.000Z',
      }),
    ).rejects.toThrow(/backward in time/u);
    await secondStore.close();
  });
});
