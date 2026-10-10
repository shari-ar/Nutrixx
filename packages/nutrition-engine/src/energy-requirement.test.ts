import { describe, expect, it } from 'vitest';

import type { StartingProfileV1 } from '@nutrixx/user-context';

import { estimateEnergyRequirementV1 } from './energy-requirement.js';
import { assessHealthContextV1 } from './health-context.js';

const NOW = '2026-10-10T12:00:00.000Z';

function profile(
  ageYears: number,
  physiologicalReference: 'female' | 'male' | 'unsure',
  heightCentimeters: string,
  weightKilograms: string,
): StartingProfileV1 {
  return {
    profileId: '10000000-0000-4000-8000-000000000001',
    ownerSubjectId: '20000000-0000-4000-8000-000000000001',
    revision: 1,
    createdAt: NOW,
    updatedAt: NOW,
    adultConfirmedAt: NOW,
    ageYears,
    physiologicalReference,
    heightCentimeters,
    weightKilograms,
    primaryGoal: 'maintain',
    foodRestrictions: [],
    timeZone: 'America/New_York',
  };
}

describe('2023 National Academies maintenance-energy equations', () => {
  it('reproduces the published adult male inactive and active reference cases', () => {
    const base = profile(40, 'male', '176.3', '89.9');
    const inactive = estimateEnergyRequirementV1(
      assessHealthContextV1({
        profile: base,
        assessedAt: NOW,
        activityLevel: 'inactive',
      }),
    );
    const active = estimateEnergyRequirementV1(
      assessHealthContextV1({
        profile: base,
        assessedAt: NOW,
        activityLevel: 'active',
      }),
    );
    expect(inactive).toMatchObject({
      status: 'READY',
      maintenanceKilocaloriesPerDay: { minimum: 2733, maximum: 2733 },
    });
    expect(active).toMatchObject({
      status: 'READY',
      maintenanceKilocaloriesPerDay: { minimum: 3151, maximum: 3151 },
    });
  });

  it('reproduces the published adult female inactive reference case', () => {
    const result = estimateEnergyRequirementV1(
      assessHealthContextV1({
        profile: profile(40, 'female', '162.5', '75'),
        assessedAt: NOW,
        activityLevel: 'inactive',
      }),
    );
    expect(result).toMatchObject({
      status: 'READY',
      maintenanceKilocaloriesPerDay: { minimum: 2112, maximum: 2112 },
    });
  });

  it('uses the adolescent equation with growth energy at age 18', () => {
    const result = estimateEnergyRequirementV1(
      assessHealthContextV1({
        profile: profile(18, 'female', '170', '70'),
        assessedAt: NOW,
        activityLevel: 'inactive',
      }),
    );
    expect(result).toMatchObject({
      status: 'READY',
      maintenanceKilocaloriesPerDay: { minimum: 2303, maximum: 2303 },
    });
  });

  it('requests only the missing activity or physiological input when needed', () => {
    expect(
      estimateEnergyRequirementV1(
        assessHealthContextV1({
          profile: profile(40, 'female', '162.5', '75'),
          assessedAt: NOW,
        }),
      ),
    ).toEqual({ status: 'NEEDS_INPUT', fields: ['activity-level'] });
    expect(
      estimateEnergyRequirementV1(
        assessHealthContextV1({
          profile: profile(40, 'unsure', '162.5', '75'),
          assessedAt: NOW,
          activityLevel: 'inactive',
        }),
      ),
    ).toEqual({ status: 'NEEDS_INPUT', fields: ['physiological-reference'] });
  });

  it('represents age ambiguity as scenario bounds rather than false precision', () => {
    const result = estimateEnergyRequirementV1(
      assessHealthContextV1({
        profile: profile(40, 'female', '162.5', '75'),
        assessedAt: '2026-12-10T12:00:00.000Z',
        activityLevel: 'inactive',
      }),
    );
    expect(result).toMatchObject({
      status: 'READY',
      maintenanceKilocaloriesPerDay: { minimum: 2105, maximum: 2112 },
    });
  });

  it('keeps pregnancy outside the general-wellness equation', () => {
    const result = estimateEnergyRequirementV1(
      assessHealthContextV1({
        profile: profile(40, 'female', '162.5', '75'),
        assessedAt: NOW,
        activityLevel: 'inactive',
        lifeStage: 'pregnancy',
      }),
    );
    expect(result).toEqual({
      status: 'OUT_OF_SCOPE',
      reason: 'health-context-out-of-scope',
    });
  });
});
