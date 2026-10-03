import { randomUUID } from 'node:crypto';

import { defineCanonicalRepositoryContract } from '@nutrixx/persistence/testing';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

import { IndexedDbCanonicalRecordRepository } from './indexeddb-repository.js';

defineCanonicalRepositoryContract({
  name: 'IndexedDB',
  createRepository: (verifyRecord) =>
    IndexedDbCanonicalRecordRepository.create({
      databaseName: `nutrixx-contract-${randomUUID()}`,
      indexedDB: new IDBFactory(),
      keyRange: IDBKeyRange,
      verifyRecord,
      deleteOnClose: true,
    }),
});
