import { verifyCanonicalRecordV1 } from '@nutrixx/canonical-schema';
import {
  IndexedDbCanonicalRecordRepository,
  sha256Canonical,
} from '@nutrixx/persistence-indexeddb';
import {
  OutcomeObservationServiceV1,
  type OutcomeObservationV1,
} from '@nutrixx/user-context';

import { BrowserOnboardingStore } from './browser-onboarding';
import { LOCAL_USER_DATABASE_NAME } from './storage-constants';

export type WeightObservationV1 = Extract<
  OutcomeObservationV1,
  { kind: 'weight' }
>;
export type LabObservationV1 = Extract<OutcomeObservationV1, { kind: 'lab' }>;

function canonicalDecimal(input: string): string {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(input.trim());
  if (match === null) throw new TypeError('Enter a decimal number.');
  const integer = match[2]!.replace(/^0+(?=\d)/, '');
  const fractional = (match[3] ?? '').replace(/0+$/, '');
  const magnitude = fractional ? `${integer}.${fractional}` : integer;
  return match[1] === '-' && magnitude !== '0' ? `-${magnitude}` : magnitude;
}

async function withService<T>(
  operation: (service: OutcomeObservationServiceV1) => Promise<T>,
): Promise<T> {
  const repository = await IndexedDbCanonicalRecordRepository.create({
    databaseName: LOCAL_USER_DATABASE_NAME,
    indexedDB,
    keyRange: IDBKeyRange,
    verifyRecord: (record) => verifyCanonicalRecordV1(record, sha256Canonical),
  });
  try {
    return await operation(
      new OutcomeObservationServiceV1(repository, sha256Canonical),
    );
  } finally {
    await repository.close();
  }
}

async function subjectId(): Promise<string> {
  const profile = await new BrowserOnboardingStore().load();
  if (profile === null)
    throw new TypeError(
      'Complete the starting profile before saving feedback.',
    );
  return profile.ownerSubjectId;
}

export class BrowserOutcomeFeedbackStore {
  public async list(): Promise<readonly OutcomeObservationV1[]> {
    const ownerSubjectId = await subjectId();
    return withService((service) => service.list(ownerSubjectId));
  }

  public async saveWeight(input: {
    observedOn: string;
    weightKilograms: string;
  }): Promise<WeightObservationV1> {
    const ownerSubjectId = await subjectId();
    const saved = await withService((service) =>
      service.save(
        {
          kind: 'weight',
          observationId: crypto.randomUUID(),
          ownerSubjectId,
          observedOn: input.observedOn,
          weightKilograms: canonicalDecimal(input.weightKilograms),
        },
        new Date().toISOString(),
      ),
    );
    if (saved.kind !== 'weight')
      throw new TypeError('Unexpected feedback kind.');
    return saved;
  }

  public async saveLab(input: {
    observedOn: string;
    testName: string;
    result: string;
    unit: string;
    laboratory: string;
  }): Promise<LabObservationV1> {
    const ownerSubjectId = await subjectId();
    const saved = await withService((service) =>
      service.save(
        {
          kind: 'lab',
          observationId: crypto.randomUUID(),
          ownerSubjectId,
          observedOn: input.observedOn,
          testName: input.testName.trim(),
          result: canonicalDecimal(input.result),
          unit: input.unit.trim(),
          laboratory: input.laboratory.trim(),
        },
        new Date().toISOString(),
      ),
    );
    if (saved.kind !== 'lab') throw new TypeError('Unexpected feedback kind.');
    return saved;
  }

  public async delete(observationId: string): Promise<boolean> {
    const ownerSubjectId = await subjectId();
    return withService((service) =>
      service.delete(observationId, ownerSubjectId),
    );
  }
}

export interface OutcomeFeedbackSummaryV1 {
  readonly weights: readonly WeightObservationV1[];
  readonly weightChangeKilograms: number | null;
  readonly labSeries: readonly {
    readonly testName: string;
    readonly unit: string;
    readonly laboratory: string;
    readonly observations: readonly LabObservationV1[];
  }[];
}

export function summarizeOutcomeFeedbackV1(
  observations: readonly OutcomeObservationV1[],
): OutcomeFeedbackSummaryV1 {
  const weights = observations
    .filter((entry): entry is WeightObservationV1 => entry.kind === 'weight')
    .sort(
      (left, right) =>
        left.observedOn.localeCompare(right.observedOn) ||
        left.recordedAt.localeCompare(right.recordedAt),
    );
  const weightChangeKilograms =
    weights.length < 2
      ? null
      : Math.round(
          (Number(weights.at(-1)!.weightKilograms) -
            Number(weights[0]!.weightKilograms)) *
            100,
        ) / 100;
  const labGroups = new Map<string, LabObservationV1[]>();
  for (const entry of observations) {
    if (entry.kind !== 'lab') continue;
    const key = JSON.stringify([entry.testName, entry.unit, entry.laboratory]);
    const group = labGroups.get(key) ?? [];
    group.push(entry);
    labGroups.set(key, group);
  }
  const labSeries = Array.from(labGroups.values()).map((group) => {
    group.sort(
      (left, right) =>
        left.observedOn.localeCompare(right.observedOn) ||
        left.recordedAt.localeCompare(right.recordedAt),
    );
    const first = group[0]!;
    return {
      testName: first.testName,
      unit: first.unit,
      laboratory: first.laboratory,
      observations: group,
    };
  });
  labSeries.sort((left, right) => left.testName.localeCompare(right.testName));
  return { weights, weightChangeKilograms, labSeries };
}
