import { createHash } from 'node:crypto';

import {
  verifyCanonicalRecordV1,
  type CanonicalRecordV1,
} from '@nutrixx/canonical-schema';
import { IndexedDbCanonicalRecordRepository } from '@nutrixx/persistence-indexeddb';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import { OutcomeObservationServiceV1 } from './outcome-observation-service.js';
import { OutcomeObservationRecordV1Schema } from './outcome-observation.js';

const SUBJECT_ID = '20000000-0000-4000-8000-000000000001';
const WEIGHT_ID = '30000000-0000-4000-8000-000000000001';
const LAB_ID = '30000000-0000-4000-8000-000000000002';
const NOW = '2026-10-14T10:00:00.000Z';
const digest = (input: string) =>
  createHash('sha256').update(input).digest('hex');

async function repository(indexedDB: IDBFactory) {
  return IndexedDbCanonicalRecordRepository.create({
    databaseName: 'nutrixx-outcome-feedback-test',
    indexedDB,
    keyRange: IDBKeyRange,
    verifyRecord: (record: CanonicalRecordV1) =>
      verifyCanonicalRecordV1(record, digest),
  });
}

describe('optional outcome observations', () => {
  it('persists weight and user-transcribed lab records separately from food intake', async () => {
    const database = new IDBFactory();
    let records = await repository(database);
    let service = new OutcomeObservationServiceV1(records, digest);
    await service.save(
      {
        kind: 'weight',
        observationId: WEIGHT_ID,
        ownerSubjectId: SUBJECT_ID,
        observedOn: '2026-10-13',
        weightKilograms: '72.5',
      },
      NOW,
    );
    await service.save(
      {
        kind: 'lab',
        observationId: LAB_ID,
        ownerSubjectId: SUBJECT_ID,
        observedOn: '2026-10-12',
        testName: 'Ferritin',
        result: '45',
        unit: 'ng/mL',
        laboratory: 'Example Lab',
      },
      NOW,
    );
    expect(
      OutcomeObservationRecordV1Schema.parse(await records.getById(LAB_ID))
        .payload.kind,
    ).toBe('lab');
    await records.close();

    records = await repository(database);
    service = new OutcomeObservationServiceV1(records, digest);
    expect((await service.list(SUBJECT_ID)).map((entry) => entry.kind)).toEqual(
      ['lab', 'weight'],
    );
    expect(await service.list('20000000-0000-4000-8000-000000000002')).toEqual(
      [],
    );
    await expect(
      service.delete(LAB_ID, '20000000-0000-4000-8000-000000000002'),
    ).rejects.toThrow('ownership');
    expect(await service.delete(LAB_ID, SUBJECT_ID)).toBe(true);
    expect((await service.list(SUBJECT_ID)).map((entry) => entry.kind)).toEqual(
      ['weight'],
    );
    await records.close();
  });

  it('rejects invalid values and duplicate observation IDs', async () => {
    const records = await repository(new IDBFactory());
    const service = new OutcomeObservationServiceV1(records, digest);
    const command = {
      kind: 'weight' as const,
      observationId: WEIGHT_ID,
      ownerSubjectId: SUBJECT_ID,
      observedOn: '2026-10-13',
      weightKilograms: '72.5',
    };
    await expect(
      service.save({ ...command, weightKilograms: '0' }, NOW),
    ).rejects.toThrow();
    await expect(service.save(command, NOW)).resolves.toMatchObject({
      kind: 'weight',
    });
    await expect(service.save(command, NOW)).rejects.toThrow('already exists');
    await expect(
      service.save(
        {
          kind: 'lab',
          observationId: LAB_ID,
          ownerSubjectId: SUBJECT_ID,
          observedOn: '2026-10-12',
          testName: 'Ferritin',
          result: 'not a number',
          unit: 'ng/mL',
          laboratory: 'Example Lab',
        },
        NOW,
      ),
    ).rejects.toThrow();
    await records.close();
  });
});
