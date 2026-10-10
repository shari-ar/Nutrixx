import * as z from 'zod';

import type { StartingProfileV1 } from '@nutrixx/user-context';

export const HEALTH_CONTEXT_RULE_VERSION_V1 = 'health-context-v1' as const;

const CanonicalDecimalSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/);

const ProfileEvidenceV1Schema = z
  .object({
    profileId: z.uuid(),
    revision: z.int().positive(),
    updatedAt: z.iso.datetime({ precision: 3 }),
    adultConfirmedAt: z.iso.datetime({ precision: 3 }),
    ageYears: z.int().min(18).max(120),
    heightCentimeters: CanonicalDecimalSchema.refine(
      (value) => Number(value) >= 100 && Number(value) <= 250,
    ),
    weightKilograms: CanonicalDecimalSchema.refine(
      (value) => Number(value) >= 30 && Number(value) <= 350,
    ),
    physiologicalReference: z.enum(['female', 'male', 'unsure']),
    primaryGoal: z.enum(['maintain', 'lose', 'gain']),
    timeZone: z.string().min(1),
  })
  .passthrough();

const HealthContextInputV1Schema = z.strictObject({
  profile: ProfileEvidenceV1Schema,
  assessedAt: z.iso.datetime({ precision: 3 }),
  birthDate: z.iso.date().optional(),
  lifeStage: z
    .enum(['adult', 'pregnancy', 'lactation', 'unspecified'])
    .optional(),
  activityLevel: z
    .enum(['inactive', 'low', 'active', 'very-active'])
    .optional(),
  declaredHigherRiskContext: z.boolean().optional(),
});

export interface HealthContextInputV1 {
  readonly profile: StartingProfileV1;
  readonly assessedAt: string;
  readonly birthDate?: string;
  readonly lifeStage?: 'adult' | 'pregnancy' | 'lactation' | 'unspecified';
  readonly activityLevel?: 'inactive' | 'low' | 'active' | 'very-active';
  readonly declaredHigherRiskContext?: boolean;
}

export interface HealthContextSnapshotV1 {
  readonly ruleVersion: typeof HEALTH_CONTEXT_RULE_VERSION_V1;
  readonly profileId: string;
  readonly profileRevision: number;
  readonly assessedAt: string;
  readonly status: 'READY' | 'NEEDS_INPUT' | 'OUT_OF_SCOPE';
  readonly ageYears: { readonly minimum: number; readonly maximum: number };
  readonly physiologicalReference: 'female' | 'male' | 'unsure';
  readonly lifeStage: 'adult' | 'pregnancy' | 'lactation' | 'unspecified';
  readonly lifeStageEvidence: 'assumed' | 'reported' | 'unknown';
  readonly activityLevel:
    | 'inactive'
    | 'low'
    | 'active'
    | 'very-active'
    | 'unreported';
  readonly primaryGoal: 'maintain' | 'lose' | 'gain';
  readonly heightCentimeters: string;
  readonly weightKilograms: string;
  readonly timeZone: string;
  readonly neededInput: readonly string[];
  readonly limitationCodes: readonly string[];
}

function localDate(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant));
  const value = (kind: string): string =>
    parts.find((part) => part.type === kind)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function ageOnDate(birthDate: string, currentDate: string): number {
  const [birthYear = 0, birthMonth = 0, birthDay = 0] = birthDate
    .split('-')
    .map(Number);
  const [year = 0, month = 0, day = 0] = currentDate.split('-').map(Number);
  return (
    year -
    birthYear -
    (month < birthMonth || (month === birthMonth && day < birthDay) ? 1 : 0)
  );
}

export function assessHealthContextV1(
  inputValue: HealthContextInputV1,
): HealthContextSnapshotV1 {
  const input = HealthContextInputV1Schema.parse(inputValue);
  const { profile } = input;
  if (Date.parse(profile.adultConfirmedAt) > Date.parse(profile.updatedAt)) {
    throw new TypeError('Adult confirmation follows the profile revision.');
  }
  new Intl.DateTimeFormat('en-US', { timeZone: profile.timeZone }).format();
  const elapsedMilliseconds =
    Date.parse(input.assessedAt) - Date.parse(profile.updatedAt);
  if (elapsedMilliseconds < 0) {
    throw new TypeError('The assessment precedes the profile revision.');
  }

  const elapsedDays = elapsedMilliseconds / 86_400_000;
  const reportedAgeRange = {
    minimum: profile.ageYears + Math.floor(elapsedDays / 366),
    maximum: profile.ageYears + Math.ceil(elapsedDays / 365),
  };
  const exactAge = input.birthDate
    ? ageOnDate(input.birthDate, localDate(input.assessedAt, profile.timeZone))
    : null;
  const futureBirthDate =
    input.birthDate !== undefined &&
    input.birthDate > localDate(input.assessedAt, profile.timeZone);
  const ageYears =
    exactAge === null
      ? reportedAgeRange
      : { minimum: exactAge, maximum: exactAge };
  const ageConflict =
    exactAge !== null &&
    (exactAge < reportedAgeRange.minimum ||
      exactAge > reportedAgeRange.maximum);
  const neededInput: string[] = [];
  const limitationCodes: string[] = [];
  if (ageConflict || futureBirthDate || ageYears.maximum > 120) {
    neededInput.push('age-confirmation');
  }
  if (exactAge === null && ageYears.minimum !== ageYears.maximum) {
    limitationCodes.push('reported-age-may-have-changed');
  }
  if (profile.physiologicalReference === 'unsure') {
    limitationCodes.push('physiological-reference-unspecified');
  }
  if (input.lifeStage === undefined) {
    limitationCodes.push('adult-life-stage-assumed');
  } else if (input.lifeStage === 'unspecified') {
    limitationCodes.push('life-stage-unconfirmed');
  }
  if (input.activityLevel === undefined) {
    limitationCodes.push('activity-unreported');
  }

  let status: HealthContextSnapshotV1['status'] = 'READY';
  if (futureBirthDate) {
    status = 'NEEDS_INPUT';
  } else if (
    ageYears.minimum < 18 ||
    input.lifeStage === 'pregnancy' ||
    input.lifeStage === 'lactation' ||
    input.declaredHigherRiskContext === true
  ) {
    status = 'OUT_OF_SCOPE';
  } else if (neededInput.length > 0) {
    status = 'NEEDS_INPUT';
  }

  return {
    ruleVersion: HEALTH_CONTEXT_RULE_VERSION_V1,
    profileId: profile.profileId,
    profileRevision: profile.revision,
    assessedAt: input.assessedAt,
    status,
    ageYears,
    physiologicalReference: profile.physiologicalReference,
    lifeStage: input.lifeStage ?? 'adult',
    lifeStageEvidence:
      input.lifeStage === undefined
        ? 'assumed'
        : input.lifeStage === 'unspecified'
          ? 'unknown'
          : 'reported',
    activityLevel: input.activityLevel ?? 'unreported',
    primaryGoal: profile.primaryGoal,
    heightCentimeters: profile.heightCentimeters,
    weightKilograms: profile.weightKilograms,
    timeZone: profile.timeZone,
    neededInput,
    limitationCodes,
  };
}
