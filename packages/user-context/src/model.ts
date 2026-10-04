import * as z from 'zod';

import {
  CanonicalIdSchema,
  IanaTimeZoneSchema,
  NonnegativeCanonicalDecimalSchema,
  UtcInstantSchema,
  createCanonicalRecordDraftV1Schema,
  createCanonicalRecordV1Schema,
} from '@nutrixx/canonical-schema';

function decimalRange(minimum: number, maximum: number) {
  return NonnegativeCanonicalDecimalSchema.refine((value) => {
    const number = Number(value);
    return number >= minimum && number <= maximum;
  }, `The value must be between ${minimum} and ${maximum}.`);
}

const StartingProfileFieldsV1Schema = z.strictObject({
  ageYears: z.int().min(18).max(120),
  heightCentimeters: decimalRange(100, 250),
  weightKilograms: decimalRange(30, 350),
  physiologicalReference: z.enum(['female', 'male', 'unsure']),
  primaryGoal: z.enum(['maintain', 'lose', 'gain']),
  foodRestrictions: z.array(z.string().trim().min(1).max(200)).max(20),
  timeZone: IanaTimeZoneSchema,
  adultConfirmedAt: UtcInstantSchema,
});

export const StartingProfileV1Schema = StartingProfileFieldsV1Schema.extend({
  profileId: CanonicalIdSchema,
  ownerSubjectId: CanonicalIdSchema,
  revision: z.int().positive(),
  createdAt: UtcInstantSchema,
  updatedAt: UtcInstantSchema,
}).superRefine((profile, context) => {
  if (Date.parse(profile.updatedAt) < Date.parse(profile.createdAt)) {
    context.addIssue({
      code: 'custom',
      path: ['updatedAt'],
      message: 'Profile update time cannot precede profile creation.',
    });
  }
  if (Date.parse(profile.adultConfirmedAt) > Date.parse(profile.updatedAt)) {
    context.addIssue({
      code: 'custom',
      path: ['adultConfirmedAt'],
      message: 'Adult confirmation cannot occur after the profile update.',
    });
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: profile.timeZone }).format();
  } catch {
    context.addIssue({
      code: 'custom',
      path: ['timeZone'],
      message: 'The time zone must resolve through the active IANA data.',
    });
  }
});

export const SaveStartingProfileCommandV1Schema =
  StartingProfileFieldsV1Schema.extend({
    profileId: CanonicalIdSchema,
    ownerSubjectId: CanonicalIdSchema,
    savedAt: UtcInstantSchema,
  }).superRefine((command, context) => {
    if (Date.parse(command.adultConfirmedAt) > Date.parse(command.savedAt)) {
      context.addIssue({
        code: 'custom',
        path: ['adultConfirmedAt'],
        message: 'Adult confirmation cannot occur after the save time.',
      });
    }
  });

function validProfileEnvelope(record: {
  recordId: string;
  subjectId: string;
  owningContext: string;
  logicalVersion: number;
  payload: {
    profileId: string;
    ownerSubjectId: string;
    revision: number;
  };
}): boolean {
  return (
    record.recordId === record.payload.profileId &&
    record.subjectId === record.payload.ownerSubjectId &&
    record.owningContext === 'user-context' &&
    record.logicalVersion === record.payload.revision
  );
}

export const StartingProfileRecordDraftV1Schema =
  createCanonicalRecordDraftV1Schema(
    'user-context.starting-profile',
    1,
    StartingProfileV1Schema,
  ).refine(validProfileEnvelope, {
    message: 'Starting profile envelope identity or version is invalid.',
  });

export const StartingProfileRecordV1Schema = createCanonicalRecordV1Schema(
  'user-context.starting-profile',
  1,
  StartingProfileV1Schema,
).refine(validProfileEnvelope, {
  message: 'Starting profile envelope identity or version is invalid.',
});

export type StartingProfileV1 = z.infer<typeof StartingProfileV1Schema>;
export type SaveStartingProfileCommandV1 = z.infer<
  typeof SaveStartingProfileCommandV1Schema
>;
export type StartingProfileRecordV1 = z.infer<
  typeof StartingProfileRecordV1Schema
>;
