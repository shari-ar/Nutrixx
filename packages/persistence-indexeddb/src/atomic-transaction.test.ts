import { createHash, randomUUID } from 'node:crypto';

import {
  sealCanonicalRecordV1,
  verifyCanonicalRecordV1,
  type CanonicalRecordV1,
} from '@nutrixx/canonical-schema';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import { IndexedDbCanonicalRecordRepository } from './indexeddb-repository.js';

const NOW = '2026-10-03T10:00:00.000Z';
const digest = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');
const verify = (record: CanonicalRecordV1) =>
  verifyCanonicalRecordV1(record, digest);

async function record(
  overrides: Partial<CanonicalRecordV1> = {},
): Promise<CanonicalRecordV1> {
  const { integrity: _integrity, ...draftOverrides } = overrides;
  return sealCanonicalRecordV1(
    {
      format: 'nutrixx.canonical-record',
      schemaVersion: 1,
      recordType: 'meal.entry',
      recordVersion: 1,
      recordId: randomUUID(),
      subjectId: randomUUID(),
      owningContext: 'consumption',
      logicalVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
      provenance: {
        method: 'user-entered',
        source: { kind: 'user', sourceId: 'atomic-transaction-test' },
        recordedAt: NOW,
      },
      payload: { label: 'Breakfast' },
      ...draftOverrides,
    },
    digest,
  );
}

async function reseal(
  source: CanonicalRecordV1,
  overrides: Partial<CanonicalRecordV1>,
): Promise<CanonicalRecordV1> {
  const { integrity: _integrity, ...draft } = source;
  return sealCanonicalRecordV1({ ...draft, ...overrides }, digest);
}

function options(indexedDB: IDBFactory, databaseName: string) {
  return {
    databaseName,
    indexedDB,
    keyRange: IDBKeyRange,
    verifyRecord: verify,
    now: () => NOW,
    createId: () => randomUUID(),
  } as const;
}

describe('IndexedDB atomic transaction log', () => {
  it('commits multiple records and one durable log entry atomically', async () => {
    const indexedDB = new IDBFactory();
    const databaseName = `nutrixx-atomic-${randomUUID()}`;
    const first = await record();
    const second = await record({ subjectId: first.subjectId });
    const command = {
      commandId: randomUUID(),
      occurredAt: NOW,
      mutations: [
        { kind: 'put' as const, record: first },
        { kind: 'put' as const, record: second },
      ],
    };

    const repository = await IndexedDbCanonicalRecordRepository.create(
      options(indexedDB, databaseName),
    );
    const result = await repository.commit(command);
    expect(result).toMatchObject({
      replayed: false,
      entry: { sequence: 1, commandId: command.commandId },
    });
    expect(await repository.listBySubject(first.subjectId)).toHaveLength(2);
    await repository.close();

    const reopened = await IndexedDbCanonicalRecordRepository.create(
      options(indexedDB, databaseName),
    );
    await expect(reopened.listTransactions()).resolves.toEqual([result.entry]);
    await reopened.close();
  });

  it('replays an identical command without duplicating data or log entries', async () => {
    const indexedDB = new IDBFactory();
    const repository = await IndexedDbCanonicalRecordRepository.create(
      options(indexedDB, `nutrixx-replay-${randomUUID()}`),
    );
    const input = await record();
    const command = {
      commandId: randomUUID(),
      occurredAt: NOW,
      mutations: [{ kind: 'put' as const, record: input }],
    };

    const first = await repository.commit(command);
    const replay = await repository.commit(structuredClone(command));
    expect(replay).toEqual({ entry: first.entry, replayed: true });
    await expect(repository.listTransactions()).resolves.toHaveLength(1);
    await repository.close();
  });

  it('rejects a command identifier reused with different content', async () => {
    const indexedDB = new IDBFactory();
    const repository = await IndexedDbCanonicalRecordRepository.create(
      options(indexedDB, `nutrixx-conflict-${randomUUID()}`),
    );
    const commandId = randomUUID();
    const first = await record();
    const second = await record();

    await repository.commit({
      commandId,
      occurredAt: NOW,
      mutations: [{ kind: 'put', record: first }],
    });
    await expect(
      repository.commit({
        commandId,
        occurredAt: NOW,
        mutations: [{ kind: 'put', record: second }],
      }),
    ).rejects.toMatchObject({ code: 'command-conflict' });
    await expect(repository.getById(second.recordId)).resolves.toBeNull();
    await repository.close();
  });

  it('rolls back record writes when log append is interrupted', async () => {
    const indexedDB = new IDBFactory();
    const databaseName = `nutrixx-rollback-${randomUUID()}`;
    const input = await record();
    const failing = await IndexedDbCanonicalRecordRepository.create({
      ...options(indexedDB, databaseName),
      beforeLogAppend: () => {
        throw new Error('Simulated interruption before log append.');
      },
    });

    await expect(
      failing.commit({
        commandId: randomUUID(),
        occurredAt: NOW,
        mutations: [{ kind: 'put', record: input }],
      }),
    ).rejects.toThrow('Simulated interruption');
    await failing.close();

    const recovered = await IndexedDbCanonicalRecordRepository.create(
      options(indexedDB, databaseName),
    );
    await expect(recovered.getById(input.recordId)).resolves.toBeNull();
    await expect(recovered.listTransactions()).resolves.toEqual([]);
    await recovered.close();
  });

  it('rolls back earlier mutations when a later mutation conflicts', async () => {
    const indexedDB = new IDBFactory();
    const repository = await IndexedDbCanonicalRecordRepository.create(
      options(indexedDB, `nutrixx-multi-rollback-${randomUUID()}`),
    );
    const firstVersion = await record();
    const secondVersion = await reseal(firstVersion, {
      logicalVersion: 2,
      updatedAt: '2026-10-03T10:01:00.000Z',
      payload: { label: 'Updated' },
    });
    const unrelated = await record();
    await repository.put(secondVersion);

    await expect(
      repository.commit({
        commandId: randomUUID(),
        occurredAt: NOW,
        mutations: [
          { kind: 'put', record: unrelated },
          { kind: 'put', record: firstVersion },
        ],
      }),
    ).rejects.toMatchObject({ code: 'stale-write' });
    await expect(repository.getById(unrelated.recordId)).resolves.toBeNull();
    await expect(repository.listTransactions()).resolves.toHaveLength(1);
    await repository.close();
  });

  it('rejects duplicate record mutations before opening a write transaction', async () => {
    const indexedDB = new IDBFactory();
    const repository = await IndexedDbCanonicalRecordRepository.create(
      options(indexedDB, `nutrixx-invalid-${randomUUID()}`),
    );
    const input = await record();

    await expect(
      repository.commit({
        commandId: randomUUID(),
        occurredAt: NOW,
        mutations: [
          { kind: 'put', record: input },
          { kind: 'delete', recordId: input.recordId },
        ],
      }),
    ).rejects.toMatchObject({ code: 'invalid-command' });
    await expect(repository.listTransactions()).resolves.toEqual([]);
    await repository.close();
  });
});
