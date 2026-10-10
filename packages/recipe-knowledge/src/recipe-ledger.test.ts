import { createHash } from 'node:crypto';

import {
  verifyCanonicalRecordV1,
  type CanonicalRecordV1,
} from '@nutrixx/canonical-schema';
import { IndexedDbCanonicalRecordRepository } from '@nutrixx/persistence-indexeddb';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import { RecipeLedgerV1 } from './recipe-ledger.js';

const OWNER = '10000000-0000-4000-8000-000000000001';
const RECIPE = '20000000-0000-4000-8000-000000000001';
const IDENTITY_RECORD = '30000000-0000-4000-8000-000000000001';
const VERSION_ONE = '40000000-0000-4000-8000-000000000001';
const VERSION_TWO = '40000000-0000-4000-8000-000000000002';
const INGREDIENT = '50000000-0000-4000-8000-000000000001';
const FOOD = '60000000-0000-4000-8000-000000000001';
const FIRST_TIME = '2026-10-05T10:00:00.000Z';
const SECOND_TIME = '2026-10-05T10:05:00.000Z';
const digest = (input: string) =>
  createHash('sha256').update(input, 'utf8').digest('hex');
const verify = (record: CanonicalRecordV1) =>
  verifyCanonicalRecordV1(record, digest);

async function harness() {
  const repository = await IndexedDbCanonicalRecordRepository.create({
    databaseName: 'recipe-ledger',
    indexedDB: new IDBFactory(),
    keyRange: IDBKeyRange,
    verifyRecord: verify,
  });
  return {
    repository,
    ledger: new RecipeLedgerV1({ repository, digestSha256Hex: digest }),
  };
}

describe('Recipe ledger', () => {
  it('publishes sequential immutable recipe versions atomically', async () => {
    const { ledger, repository } = await harness();
    const identity = {
      recipeId: RECIPE,
      ownerSubjectId: OWNER,
      origin: 'user' as const,
      createdAt: FIRST_TIME,
    };
    const version = {
      recipeId: RECIPE,
      version: 1,
      names: [{ locale: 'en', value: 'Rice bowl', kind: 'primary' as const }],
      ingredients: [
        {
          ingredientId: INGREDIENT,
          position: 1,
          label: 'Rice',
          reference: {
            kind: 'food' as const,
            catalogReleaseId: 'food-catalog-fixture-1',
            foodId: FOOD,
            foodRevision: 1,
          },
          inputQuantity: {
            amount: '200',
            unit: { system: 'ucum' as const, code: 'g' },
          },
          edibleGramWeight: '200',
          retentionFactors: [],
        },
      ],
      preparationSteps: [{ position: 1, instruction: 'Combine.' }],
      yield: {
        finalEdibleGramWeight: '200',
        servings: '2',
        determination: 'user-entered' as const,
      },
      calculationRule: {
        component: 'recipe-calculation' as const,
        version: '1',
      },
      provenance: {
        method: 'user-entered' as const,
        source: { kind: 'user' as const, sourceId: OWNER },
      },
      publishedAt: FIRST_TIME,
    };
    await ledger.publish({
      commandId: 'recipe-1',
      identityRecordId: IDENTITY_RECORD,
      versionRecordId: VERSION_ONE,
      identity,
      version,
      publishedAt: FIRST_TIME,
    });
    await ledger.publish({
      commandId: 'recipe-2',
      identityRecordId: IDENTITY_RECORD,
      versionRecordId: VERSION_TWO,
      expectedPreviousVersionRecordId: VERSION_ONE,
      identity,
      version: {
        ...version,
        version: 2,
        names: [{ ...version.names[0]!, value: 'Rice and herb bowl' }],
        publishedAt: SECOND_TIME,
      },
      publishedAt: SECOND_TIME,
    });

    await expect(ledger.listCurrent(OWNER)).resolves.toMatchObject([
      { version: { version: 2, names: [{ value: 'Rice and herb bowl' }] } },
    ]);
    await expect(ledger.history(OWNER, RECIPE)).resolves.toHaveLength(2);
    await repository.close();
  });
});
