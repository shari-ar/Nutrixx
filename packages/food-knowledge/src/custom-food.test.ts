import { createHash } from 'node:crypto';

import {
  verifyCanonicalRecordV1,
  type CanonicalRecordV1,
} from '@nutrixx/canonical-schema';
import { IndexedDbCanonicalRecordRepository } from '@nutrixx/persistence-indexeddb';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import { CustomFoodLedgerV1 } from './custom-food.js';

const OWNER = '10000000-0000-4000-8000-000000000001';
const FOOD = '20000000-0000-4000-8000-000000000001';
const PORTION = '30000000-0000-4000-8000-000000000001';
const VERSION_ONE = '40000000-0000-4000-8000-000000000001';
const VERSION_TWO = '40000000-0000-4000-8000-000000000002';
const FIRST_TIME = '2026-10-05T10:00:00.000Z';
const SECOND_TIME = '2026-10-05T10:05:00.000Z';
const digest = (input: string) =>
  createHash('sha256').update(input, 'utf8').digest('hex');
const verify = (record: CanonicalRecordV1) =>
  verifyCanonicalRecordV1(record, digest);

async function harness() {
  const repository = await IndexedDbCanonicalRecordRepository.create({
    databaseName: 'custom-food-ledger',
    indexedDB: new IDBFactory(),
    keyRange: IDBKeyRange,
    verifyRecord: verify,
  });
  return {
    repository,
    ledger: new CustomFoodLedgerV1({
      repository,
      digestSha256Hex: digest,
    }),
  };
}

describe('Custom food ledger', () => {
  it('retains immutable versions while advancing one active head', async () => {
    const { ledger, repository } = await harness();
    const food = {
      foodId: FOOD,
      ownerSubjectId: OWNER,
      revision: 1,
      name: 'Label cereal',
      approximatePriceUsdPer100g: '0.35',
      preparationState: 'as-sold',
      portions: [{ portionId: PORTION, label: '1 cup', gramWeight: '45' }],
      composition: [
        {
          nutrientId: 'nutrient.protein',
          value: {
            state: 'known' as const,
            amount: '5',
            unit: { system: 'ucum' as const, code: 'g' },
            basis: 'per-serving' as const,
          },
        },
        {
          nutrientId: 'nutrient.iron',
          value: { state: 'unknown' as const, reason: 'not-provided' as const },
        },
      ],
      publishedAt: FIRST_TIME,
    };
    await ledger.save({
      commandId: 'custom-food-1',
      versionRecordId: VERSION_ONE,
      food,
    });
    await ledger.save({
      commandId: 'custom-food-2',
      versionRecordId: VERSION_TWO,
      expectedPreviousVersionRecordId: VERSION_ONE,
      food: {
        ...food,
        revision: 2,
        name: 'Updated cereal',
        publishedAt: SECOND_TIME,
      },
    });

    await expect(ledger.listCurrent(OWNER)).resolves.toMatchObject([
      {
        revision: 2,
        name: 'Updated cereal',
        approximatePriceUsdPer100g: '0.35',
      },
    ]);
    await expect(ledger.history(OWNER, FOOD)).resolves.toMatchObject([
      { revision: 1, name: 'Label cereal' },
      { revision: 2, name: 'Updated cereal' },
    ]);
    await repository.close();
  });
});
