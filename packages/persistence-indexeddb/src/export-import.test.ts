import { createHash, randomUUID } from 'node:crypto';

import {
  sealCanonicalRecordV1,
  verifyCanonicalRecordV1,
  type CanonicalRecordV1,
} from '@nutrixx/canonical-schema';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import { IndexedDbCanonicalRecordRepository } from './indexeddb-repository.js';

const NOW = '2026-10-03T12:00:00.000Z';
const digest = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');
const verify = (record: CanonicalRecordV1) =>
  verifyCanonicalRecordV1(record, digest);

async function record(label: string): Promise<CanonicalRecordV1> {
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
        source: { kind: 'user', sourceId: 'export-import-test' },
        recordedAt: NOW,
      },
      payload: { label },
    },
    digest,
  );
}

function options(
  indexedDB: IDBFactory,
  databaseName: string,
  beforeImportCommit?: () => void,
) {
  return {
    databaseName,
    indexedDB,
    keyRange: IDBKeyRange,
    verifyRecord: verify,
    now: () => NOW,
    createId: () => randomUUID(),
    ...(beforeImportCommit === undefined ? {} : { beforeImportCommit }),
  } as const;
}

describe('versioned local export and import', () => {
  it('exports, validates, replaces, and restores idempotency receipts', async () => {
    const indexedDB = new IDBFactory();
    const source = await IndexedDbCanonicalRecordRepository.create(
      options(indexedDB, `nutrixx-export-source-${randomUUID()}`),
    );
    const retained = await record('Retained');
    const deleted = await record('Deleted');
    const retainedCommand = {
      commandId: randomUUID(),
      occurredAt: NOW,
      mutations: [{ kind: 'put' as const, record: retained }],
    };
    await source.commit(retainedCommand);
    await source.put(deleted);
    await source.deleteById(deleted.recordId);
    const artifact = await source.exportLocalData();
    expect(artifact.manifest).toMatchObject({
      format: 'nutrixx.local-export',
      exportVersion: 1,
      recordCount: 1,
      transactionCount: 3,
      lastSequence: 3,
    });
    expect(artifact.manifest.payloadSha256).toMatch(/^[a-f0-9]{64}$/);

    const target = await IndexedDbCanonicalRecordRepository.create(
      options(indexedDB, `nutrixx-export-target-${randomUUID()}`),
    );
    const replaced = await record('Replace me');
    await target.put(replaced);
    await expect(target.importLocalData(artifact)).resolves.toEqual(
      artifact.manifest,
    );
    await expect(target.getById(replaced.recordId)).resolves.toBeNull();
    await expect(target.getById(retained.recordId)).resolves.toEqual(retained);
    await expect(target.listTransactions()).resolves.toEqual(
      artifact.transactions,
    );

    const replay = await target.commit(retainedCommand);
    expect(replay).toMatchObject({ replayed: true, entry: { sequence: 1 } });
    await expect(target.listTransactions()).resolves.toHaveLength(3);
    await source.close();
    await target.close();
  });

  it('rejects tampered manifests and payloads before replacing local data', async () => {
    const indexedDB = new IDBFactory();
    const repository = await IndexedDbCanonicalRecordRepository.create(
      options(indexedDB, `nutrixx-export-tamper-${randomUUID()}`),
    );
    const existing = await record('Existing');
    await repository.put(existing);
    const artifact = await repository.exportLocalData();

    const badCount = structuredClone(artifact);
    Object.assign(badCount.manifest, { recordCount: 99 });
    await expect(repository.importLocalData(badCount)).rejects.toMatchObject({
      code: 'invalid-export',
    });

    const badHash = structuredClone(artifact);
    Object.assign(badHash.manifest, { payloadSha256: '0'.repeat(64) });
    await expect(repository.importLocalData(badHash)).rejects.toMatchObject({
      code: 'invalid-export',
    });
    await expect(repository.getById(existing.recordId)).resolves.toEqual(
      existing,
    );
    await repository.close();
  });

  it('rolls back an interrupted replacement import', async () => {
    const indexedDB = new IDBFactory();
    const source = await IndexedDbCanonicalRecordRepository.create(
      options(indexedDB, `nutrixx-import-source-${randomUUID()}`),
    );
    await source.put(await record('Imported'));
    const artifact = await source.exportLocalData();

    const targetName = `nutrixx-import-rollback-${randomUUID()}`;
    const existing = await record('Preserved');
    const initial = await IndexedDbCanonicalRecordRepository.create(
      options(indexedDB, targetName),
    );
    await initial.put(existing);
    await initial.close();

    const failing = await IndexedDbCanonicalRecordRepository.create(
      options(indexedDB, targetName, () => {
        throw new Error('Simulated interrupted import.');
      }),
    );
    await expect(failing.importLocalData(artifact)).rejects.toThrow(
      'Simulated interrupted import',
    );
    await failing.close();

    const recovered = await IndexedDbCanonicalRecordRepository.create(
      options(indexedDB, targetName),
    );
    await expect(recovered.getById(existing.recordId)).resolves.toEqual(
      existing,
    );
    const afterFailure = await recovered.exportLocalData();
    expect(afterFailure.manifest.recordCount).toBe(1);
    await source.close();
    await recovered.close();
  });

  it('rejects structurally unsupported artifacts', async () => {
    const indexedDB = new IDBFactory();
    const repository = await IndexedDbCanonicalRecordRepository.create(
      options(indexedDB, `nutrixx-export-invalid-${randomUUID()}`),
    );
    const unsupported = {
      manifest: { format: 'nutrixx.local-export', exportVersion: 2 },
      records: [],
      transactions: [],
    };
    await expect(repository.importLocalData(unsupported)).rejects.toMatchObject(
      {
        code: 'invalid-export',
      },
    );
    await repository.close();
  });
});
