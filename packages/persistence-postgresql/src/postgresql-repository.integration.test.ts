import { randomUUID } from 'node:crypto';

import { defineCanonicalRepositoryContract } from '@nutrixx/persistence/testing';

import { PostgreSqlCanonicalRecordRepository } from './postgresql-repository.js';

const connectionString = process.env.TEST_DATABASE_URL;
if (connectionString === undefined || connectionString.length === 0) {
  throw new Error(
    'TEST_DATABASE_URL is required for the PostgreSQL contract test.',
  );
}

defineCanonicalRepositoryContract({
  name: 'PostgreSQL',
  createRepository: (verifyRecord) =>
    PostgreSqlCanonicalRecordRepository.create({
      connectionString,
      schema: `contract_${randomUUID().replaceAll('-', '')}`,
      verifyRecord,
      dropSchemaOnClose: true,
    }),
});
