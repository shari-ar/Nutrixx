import {
  sealCanonicalRecordV1,
  type JsonValue,
  type Sha256HexDigest,
} from '@nutrixx/canonical-schema';
import type {
  CanonicalRecordRepository,
  CanonicalWriteResult,
} from '@nutrixx/persistence';

import {
  SaveStartingProfileCommandV1Schema,
  StartingProfileRecordV1Schema,
  StartingProfileV1Schema,
  type SaveStartingProfileCommandV1,
  type StartingProfileV1,
} from './model.js';

export interface StartingProfileServiceV1Options {
  readonly repository: CanonicalRecordRepository;
  readonly digestSha256Hex: Sha256HexDigest;
}

export interface SaveStartingProfileResultV1 {
  readonly profile: StartingProfileV1;
  readonly writeResult: CanonicalWriteResult;
}

export class StartingProfileServiceV1 {
  readonly #repository: CanonicalRecordRepository;
  readonly #digestSha256Hex: Sha256HexDigest;

  public constructor(options: StartingProfileServiceV1Options) {
    this.#repository = options.repository;
    this.#digestSha256Hex = options.digestSha256Hex;
  }

  public async get(profileId: string): Promise<StartingProfileV1 | null> {
    const record = await this.#repository.getById(profileId);
    return record === null
      ? null
      : StartingProfileRecordV1Schema.parse(record).payload;
  }

  public async save(
    commandInput: SaveStartingProfileCommandV1,
  ): Promise<SaveStartingProfileResultV1> {
    const command = SaveStartingProfileCommandV1Schema.parse(commandInput);
    const existingInput = await this.#repository.getById(command.profileId);
    const existing =
      existingInput === null
        ? null
        : StartingProfileRecordV1Schema.parse(existingInput);
    if (
      existing !== null &&
      existing.payload.ownerSubjectId !== command.ownerSubjectId
    ) {
      throw new TypeError('A starting profile cannot change ownership.');
    }
    if (
      existing !== null &&
      Date.parse(command.savedAt) < Date.parse(existing.payload.updatedAt)
    ) {
      throw new TypeError(
        'A starting profile update cannot move backward in time.',
      );
    }

    const profile = StartingProfileV1Schema.parse({
      profileId: command.profileId,
      ownerSubjectId: command.ownerSubjectId,
      revision: (existing?.payload.revision ?? 0) + 1,
      ageYears: command.ageYears,
      heightCentimeters: command.heightCentimeters,
      weightKilograms: command.weightKilograms,
      physiologicalReference: command.physiologicalReference,
      primaryGoal: command.primaryGoal,
      foodRestrictions: command.foodRestrictions,
      timeZone: command.timeZone,
      adultConfirmedAt: command.adultConfirmedAt,
      createdAt: existing?.payload.createdAt ?? command.savedAt,
      updatedAt: command.savedAt,
    });
    const record = await sealCanonicalRecordV1(
      {
        format: 'nutrixx.canonical-record',
        schemaVersion: 1,
        recordType: 'user-context.starting-profile',
        recordVersion: 1,
        recordId: profile.profileId,
        subjectId: profile.ownerSubjectId,
        owningContext: 'user-context',
        logicalVersion: profile.revision,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
        provenance: {
          method: 'user-entered',
          source: { kind: 'user', sourceId: profile.ownerSubjectId },
          recordedAt: profile.updatedAt,
        },
        payload: profile as unknown as JsonValue,
      },
      this.#digestSha256Hex,
    );
    const writeResult = await this.#repository.put(record);
    return { profile, writeResult };
  }
}
