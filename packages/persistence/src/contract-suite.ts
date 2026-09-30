import { createHash, randomUUID } from 'node:crypto';

import {
  sealCanonicalRecordV1,
  verifyCanonicalRecordV1,
  type CanonicalRecordV1,
} from '@nutrixx/canonical-schema';
import { describe, expect, it } from 'vitest';

import {
  PersistenceError,
  type CanonicalRecordRepository,
  type CanonicalRecordVerifier,
} from './repository.js';

export interface CanonicalRepositoryContractHarness {
  readonly name: string;
  createRepository(
    verifyRecord: CanonicalRecordVerifier,
  ): Promise<CanonicalRecordRepository>;
}

const digest = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');

const verify: CanonicalRecordVerifier = (record) =>
  verifyCanonicalRecordV1(record, digest);

async function record(
  overrides: Partial<CanonicalRecordV1> = {},
): Promise<CanonicalRecordV1> {
  const now = '2026-09-30T10:00:00.000Z';
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
      createdAt: now,
      updatedAt: now,
      provenance: {
        method: 'user-entered',
        source: {
          kind: 'user',
          sourceId: 'contract-suite',
        },
        recordedAt: now,
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

export function defineCanonicalRepositoryContract(
  harness: CanonicalRepositoryContractHarness,
): void {
  describe(`${harness.name} canonical repository contract`, () => {
    async function useRepository(
      verifier: CanonicalRecordVerifier = verify,
    ): Promise<CanonicalRecordRepository> {
      return harness.createRepository(verifier);
    }

    it('returns null for a missing record', async () => {
      const repository = await useRepository();
      try {
        await expect(repository.getById(randomUUID())).resolves.toBeNull();
      } finally {
        await repository.close();
      }
    });

    it('round-trips an isolated clone and treats an identical write as unchanged', async () => {
      const repository = await useRepository();
      const input = await record();
      try {
        await expect(repository.put(input)).resolves.toBe('inserted');
        await expect(repository.put(input)).resolves.toBe('unchanged');
        const stored = await repository.getById(input.recordId);
        expect(stored).toEqual(input);
        expect(stored).not.toBe(input);
      } finally {
        await repository.close();
      }
    });

    it('accepts a newer logical version and rejects stale or divergent writes', async () => {
      const repository = await useRepository();
      const first = await record();
      const second = await reseal(first, {
        logicalVersion: 2,
        updatedAt: '2026-09-30T10:01:00.000Z',
        payload: { label: 'Lunch' },
      });
      const divergent = await reseal(second, { payload: { label: 'Dinner' } });
      try {
        await repository.put(first);
        await expect(repository.put(second)).resolves.toBe('updated');
        await expect(repository.put(first)).rejects.toMatchObject({
          code: 'stale-write',
        });
        await expect(repository.put(divergent)).rejects.toMatchObject({
          code: 'version-conflict',
        });
      } finally {
        await repository.close();
      }
    });

    it('rejects a stable identity change', async () => {
      const repository = await useRepository();
      const first = await record();
      const changed = await reseal(first, {
        logicalVersion: 2,
        subjectId: randomUUID(),
        updatedAt: '2026-09-30T10:01:00.000Z',
      });
      try {
        await repository.put(first);
        await expect(repository.put(changed)).rejects.toMatchObject({
          code: 'identity-conflict',
        });
      } finally {
        await repository.close();
      }
    });

    it('isolates subjects, orders deterministically, and deletes idempotently', async () => {
      const repository = await useRepository();
      const subjectId = randomUUID();
      const later = await record({ subjectId });
      const earlier = await record({ subjectId });
      const other = await record();
      try {
        await repository.put(later);
        await repository.put(earlier);
        await repository.put(other);
        const listed = await repository.listBySubject(subjectId);
        expect(listed.map(({ recordId }) => recordId)).toEqual(
          [later.recordId, earlier.recordId].sort(),
        );
        await expect(repository.deleteById(later.recordId)).resolves.toBe(true);
        await expect(repository.deleteById(later.recordId)).resolves.toBe(
          false,
        );
      } finally {
        await repository.close();
      }
    });

    it('rejects malformed, unverified, and post-close operations', async () => {
      const valid = await record();
      const repository = await useRepository();
      await expect(
        repository.put({ ...valid, recordId: 'not-a-uuid' }),
      ).rejects.toBeInstanceOf(PersistenceError);
      await repository.close();
      await expect(repository.getById(valid.recordId)).rejects.toMatchObject({
        code: 'closed',
      });

      const rejectingRepository = await useRepository(async () => false);
      try {
        await expect(rejectingRepository.put(valid)).rejects.toMatchObject({
          code: 'invalid-record',
        });
      } finally {
        await rejectingRepository.close();
      }
    });

    it('serializes concurrent divergent writes at one logical version', async () => {
      const repository = await useRepository();
      const first = await record();
      const left = await reseal(first, {
        logicalVersion: 2,
        updatedAt: '2026-09-30T10:01:00.000Z',
        payload: { label: 'Left' },
      });
      const right = await reseal(first, {
        logicalVersion: 2,
        updatedAt: '2026-09-30T10:01:00.000Z',
        payload: { label: 'Right' },
      });
      try {
        await repository.put(first);
        const outcomes = await Promise.allSettled([
          repository.put(left),
          repository.put(right),
        ]);
        expect(
          outcomes.filter(({ status }) => status === 'fulfilled'),
        ).toHaveLength(1);
        const rejected = outcomes.find(({ status }) => status === 'rejected');
        expect(rejected).toMatchObject({
          reason: { code: 'version-conflict' },
        });
      } finally {
        await repository.close();
      }
    });
  });
}
