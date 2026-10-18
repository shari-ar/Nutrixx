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

async function editableRecord(
  label: string,
  subjectId: string,
): Promise<CanonicalRecordV1> {
  const original = await record(label);
  const { integrity: _integrity, ...draft } = original;
  return sealCanonicalRecordV1(
    {
      ...draft,
      recordType: 'user-context.outcome-observation',
      owningContext: 'user-context',
      subjectId,
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
    expect(artifact).toMatchObject({
      format: 'nutrixx.local-file',
      formatVersion: 1,
      kind: 'complete-backup',
      protection: 'plain',
    });
    expect(artifact.content.manifest).toMatchObject({
      recordCount: 1,
      transactionCount: 3,
      lastSequence: 3,
    });
    expect(artifact.content.manifest.payloadSha256).toMatch(/^[a-f0-9]{64}$/);

    const target = await IndexedDbCanonicalRecordRepository.create(
      options(indexedDB, `nutrixx-export-target-${randomUUID()}`),
    );
    const replaced = await record('Replace me');
    await target.put(replaced);
    await expect(target.importLocalData(artifact)).resolves.toEqual(
      artifact.content.manifest,
    );
    await expect(target.getById(replaced.recordId)).resolves.toBeNull();
    await expect(target.getById(retained.recordId)).resolves.toEqual(retained);
    await expect(target.listTransactions()).resolves.toEqual(
      artifact.content.transactions,
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
    Object.assign(badCount.content.manifest, { recordCount: 99 });
    await expect(repository.importLocalData(badCount)).rejects.toMatchObject({
      code: 'invalid-export',
    });

    const badHash = structuredClone(artifact);
    Object.assign(badHash.content.manifest, { payloadSha256: '0'.repeat(64) });
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
    expect(afterFailure.content.manifest.recordCount).toBe(1);
    await source.close();
    await recovered.close();
  });

  it('rejects structurally unsupported artifacts', async () => {
    const indexedDB = new IDBFactory();
    const repository = await IndexedDbCanonicalRecordRepository.create(
      options(indexedDB, `nutrixx-export-invalid-${randomUUID()}`),
    );
    const unsupported = {
      format: 'nutrixx.local-file',
      formatVersion: 2,
      kind: 'complete-backup',
      protection: 'plain',
      content: { manifest: {}, records: [], transactions: [] },
    };
    await expect(repository.importLocalData(unsupported)).rejects.toMatchObject(
      {
        code: 'invalid-export',
      },
    );
    await repository.close();
  });
});

describe('editable local data', () => {
  const portableValidator = (candidate: CanonicalRecordV1) =>
    typeof candidate.payload === 'object' &&
    candidate.payload !== null &&
    !Array.isArray(candidate.payload) &&
    typeof candidate.payload['label'] === 'string';

  it('previews corrections and omissions, then appends a fresh canonical transaction', async () => {
    const indexedDB = new IDBFactory();
    const subjectId = randomUUID();
    const repository = await IndexedDbCanonicalRecordRepository.create({
      ...options(indexedDB, `nutrixx-editable-${randomUUID()}`),
      validatePortableRecord: portableValidator,
    });
    const changed = await editableRecord('Before', subjectId);
    const omitted = await editableRecord('Unchanged', subjectId);
    await repository.put(changed);
    await repository.put(omitted);
    const file = structuredClone(
      await repository.exportEditableData(subjectId),
    );
    expect(file).toMatchObject({
      format: 'nutrixx.local-file',
      formatVersion: 1,
      kind: 'editable-data',
      protection: 'plain',
      content: { manifest: { factCount: 2, subjectId } },
    });
    const target = file.content.facts.find(
      (fact) => fact.recordId === changed.recordId,
    )!;
    Object.assign(target, { payload: { label: 'After' } });
    Object.assign(file.content.manifest, { factCount: 1 });
    Object.assign(file.content, { facts: [target] });
    const preview = await repository.previewEditableData(file);
    expect(preview.changes).toMatchObject([
      {
        recordId: changed.recordId,
        recordType: changed.recordType,
        kind: 'correct',
        beforePayload: { label: 'Before' },
        afterPayload: { label: 'After' },
        changedFields: ['label'],
      },
    ]);
    await repository.importEditableData(preview);
    expect((await repository.getById(changed.recordId))?.payload).toEqual({
      label: 'After',
    });
    expect((await repository.getById(changed.recordId))?.logicalVersion).toBe(
      2,
    );
    expect(await repository.getById(omitted.recordId)).toEqual(omitted);
    expect(await repository.listTransactions()).toHaveLength(3);
    await repository.close();
  });

  it('rejects stale revisions and invalid edited payloads before any write', async () => {
    const indexedDB = new IDBFactory();
    const subjectId = randomUUID();
    const repository = await IndexedDbCanonicalRecordRepository.create({
      ...options(indexedDB, `nutrixx-edit-conflict-${randomUUID()}`),
      validatePortableRecord: portableValidator,
    });
    const original = await editableRecord('Original', subjectId);
    await repository.put(original);
    const stale = structuredClone(
      await repository.exportEditableData(subjectId),
    );
    Object.assign(stale.content.facts[0]!, { payload: { label: 'Edited' } });
    const { integrity: _integrity, ...draft } = original;
    const newer = await sealCanonicalRecordV1(
      {
        ...draft,
        logicalVersion: 2,
        payload: { label: 'Newer' },
      },
      digest,
    );
    await repository.put(newer);
    expect(
      (await repository.previewEditableData(stale)).changes[0],
    ).toMatchObject({ kind: 'conflict', reason: 'stale-source' });
    await expect(
      repository.importEditableData(
        await repository.previewEditableData(stale),
      ),
    ).rejects.toMatchObject({ code: 'invalid-export' });

    const invalid = structuredClone(
      await repository.exportEditableData(subjectId),
    );
    Object.assign(invalid.content.facts[0]!, { payload: { label: 42 } });
    await expect(repository.previewEditableData(invalid)).rejects.toMatchObject(
      { code: 'invalid-export' },
    );
    expect((await repository.getById(original.recordId))?.payload).toEqual({
      label: 'Newer',
    });
    await repository.close();
  });

  it('supports explicit deletion and addition while preserving prior history', async () => {
    const indexedDB = new IDBFactory();
    const subjectId = randomUUID();
    const repository = await IndexedDbCanonicalRecordRepository.create({
      ...options(indexedDB, `nutrixx-edit-actions-${randomUUID()}`),
      validatePortableRecord: portableValidator,
    });
    const original = await editableRecord('Remove', subjectId);
    await repository.put(original);
    const file = structuredClone(
      await repository.exportEditableData(subjectId),
    );
    Object.assign(file.content.facts[0]!, { action: 'delete' });
    const added = await editableRecord('Add', subjectId);
    Object.assign(file.content, {
      facts: [
        ...file.content.facts,
        {
          action: 'upsert',
          recordId: added.recordId,
          subjectId,
          recordType: added.recordType,
          recordVersion: 1,
          logicalVersion: 1,
          owningContext: added.owningContext,
          createdAt: NOW,
          updatedAt: NOW,
          provenance: added.provenance,
          sourceRevision: null,
          payload: { label: 'Add' },
        },
      ],
    });
    Object.assign(file.content.manifest, { factCount: 2 });
    expect(
      (await repository.previewEditableData(file)).changes.map(
        (change) => change.kind,
      ),
    ).toEqual(['delete', 'add']);
    await repository.importEditableData(
      await repository.previewEditableData(file),
    );
    expect(await repository.getById(original.recordId)).toBeNull();
    expect((await repository.getById(added.recordId))?.payload).toEqual({
      label: 'Add',
    });
    expect(await repository.listTransactions()).toHaveLength(2);
    await repository.close();
  });

  it('transfers an editable file into an empty local authority without copying the source log', async () => {
    const indexedDB = new IDBFactory();
    const subjectId = randomUUID();
    const source = await IndexedDbCanonicalRecordRepository.create({
      ...options(indexedDB, `nutrixx-edit-source-${randomUUID()}`),
      validatePortableRecord: portableValidator,
    });
    const original = await editableRecord('Portable', subjectId);
    await source.put(original);
    const file = await source.exportEditableData(subjectId);
    const target = await IndexedDbCanonicalRecordRepository.create({
      ...options(indexedDB, `nutrixx-edit-target-${randomUUID()}`),
      validatePortableRecord: portableValidator,
    });
    const preview = await target.previewEditableData(file);
    expect(preview.targetWasEmpty).toBe(true);
    expect(preview.changes[0]?.kind).toBe('add');
    await target.importEditableData(preview);
    expect((await target.getById(original.recordId))?.payload).toEqual(
      original.payload,
    );
    expect(await target.listTransactions()).toHaveLength(1);
    await source.close();
    await target.close();
  });

  it('rejects a changed review and rolls back an interrupted editable import', async () => {
    const indexedDB = new IDBFactory();
    const subjectId = randomUUID();
    const name = `nutrixx-edit-rollback-${randomUUID()}`;
    const original = await editableRecord('Before', subjectId);
    const initial = await IndexedDbCanonicalRecordRepository.create({
      ...options(indexedDB, name),
      validatePortableRecord: portableValidator,
    });
    await initial.put(original);
    const file = structuredClone(await initial.exportEditableData(subjectId));
    Object.assign(file.content.facts[0]!, { payload: { label: 'After' } });
    const reviewed = await initial.previewEditableData(file);
    await initial.close();

    const failing = await IndexedDbCanonicalRecordRepository.create({
      ...options(indexedDB, name, () => {
        throw new Error('Interrupted import.');
      }),
      validatePortableRecord: portableValidator,
    });
    const forged = structuredClone(reviewed);
    Object.assign(forged.changes[0]!, { kind: 'unchanged' });
    await expect(failing.importEditableData(forged)).rejects.toMatchObject({
      code: 'invalid-export',
    });
    const editedAfterReview = structuredClone(reviewed);
    Object.assign(editedAfterReview.file.content.facts[0]!, {
      payload: { label: 'Changed after review' },
    });
    await expect(
      failing.importEditableData(editedAfterReview),
    ).rejects.toMatchObject({
      code: 'invalid-export',
    });
    await expect(failing.importEditableData(reviewed)).rejects.toThrow(
      'Interrupted import.',
    );
    await failing.close();
    const recovered = await IndexedDbCanonicalRecordRepository.create({
      ...options(indexedDB, name),
      validatePortableRecord: portableValidator,
    });
    expect(await recovered.getById(original.recordId)).toEqual(original);
    expect(await recovered.listTransactions()).toHaveLength(1);
    await recovered.close();
  });
});
