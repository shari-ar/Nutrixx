import {
  sealCanonicalRecordV1,
  type JsonValue,
  type Sha256HexDigest,
} from '@nutrixx/canonical-schema';
import type { CanonicalRecordRepository } from '@nutrixx/persistence';

import {
  OutcomeObservationRecordV1Schema,
  OutcomeObservationV1Schema,
  type OutcomeObservationV1,
  type SaveOutcomeObservationV1,
} from './outcome-observation.js';

export class OutcomeObservationServiceV1 {
  public constructor(
    private readonly repository: CanonicalRecordRepository,
    private readonly digestSha256Hex: Sha256HexDigest,
  ) {}

  public async list(
    subjectId: string,
  ): Promise<readonly OutcomeObservationV1[]> {
    const records = await this.repository.listBySubject(subjectId);
    return records
      .filter(
        (record) => record.recordType === 'user-context.outcome-observation',
      )
      .map((record) => OutcomeObservationRecordV1Schema.parse(record).payload)
      .sort(
        (left, right) =>
          left.observedOn.localeCompare(right.observedOn) ||
          left.recordedAt.localeCompare(right.recordedAt),
      );
  }

  public async save(
    input: SaveOutcomeObservationV1,
    recordedAt: string,
  ): Promise<OutcomeObservationV1> {
    const observation = OutcomeObservationV1Schema.parse({
      ...input,
      recordedAt,
    });
    if (await this.repository.getById(observation.observationId))
      throw new TypeError('An outcome observation ID already exists.');
    const record = await sealCanonicalRecordV1(
      {
        format: 'nutrixx.canonical-record',
        schemaVersion: 1,
        recordType: 'user-context.outcome-observation',
        recordVersion: 1,
        recordId: observation.observationId,
        subjectId: observation.ownerSubjectId,
        owningContext: 'user-context',
        logicalVersion: 1,
        createdAt: observation.recordedAt,
        updatedAt: observation.recordedAt,
        provenance: {
          method: 'user-entered',
          source: { kind: 'user', sourceId: observation.ownerSubjectId },
          recordedAt: observation.recordedAt,
        },
        payload: observation as unknown as JsonValue,
      },
      this.digestSha256Hex,
    );
    await this.repository.put(record);
    return observation;
  }

  public async delete(
    observationId: string,
    ownerSubjectId: string,
  ): Promise<boolean> {
    const existing = await this.repository.getById(observationId);
    if (existing === null) return false;
    const observation =
      OutcomeObservationRecordV1Schema.parse(existing).payload;
    if (observation.ownerSubjectId !== ownerSubjectId)
      throw new TypeError('An outcome observation cannot change ownership.');
    return this.repository.deleteById(observationId);
  }
}
