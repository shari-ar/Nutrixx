import type { HealthContextSnapshotV1 } from './health-context.js';

export const ENERGY_RULE_VERSION_V1 = 'nasem-eer-2023-v1' as const;
export const ENERGY_RULE_SOURCE_V1 = {
  authority: 'National Academies of Sciences, Engineering, and Medicine',
  title: 'Dietary Reference Intakes for Energy',
  edition: '2023, Tables 5-15 and 5-16',
  url: 'https://www.nationalacademies.org/read/26818/chapter/7',
} as const;

type ActivityLevel = 'inactive' | 'low' | 'active' | 'very-active';
type Physiology = 'female' | 'male';
type AgeGroup = '18' | '19-plus';

interface Equation {
  readonly intercept: number;
  readonly age: number;
  readonly height: number;
  readonly weight: number;
  readonly growth: number;
}

// Age in years, height in centimeters, weight in kilograms; result in kcal/day.
const EQUATIONS: Record<
  AgeGroup,
  Record<Physiology, Record<ActivityLevel, Equation>>
> = {
  '18': {
    male: {
      inactive: {
        intercept: -447.51,
        age: 3.68,
        height: 13.01,
        weight: 13.15,
        growth: 20,
      },
      low: {
        intercept: 19.12,
        age: 3.68,
        height: 8.62,
        weight: 20.28,
        growth: 20,
      },
      active: {
        intercept: -388.19,
        age: 3.68,
        height: 12.66,
        weight: 20.46,
        growth: 20,
      },
      'very-active': {
        intercept: -671.75,
        age: 3.68,
        height: 15.38,
        weight: 23.25,
        growth: 20,
      },
    },
    female: {
      inactive: {
        intercept: 55.59,
        age: -22.25,
        height: 8.43,
        weight: 17.07,
        growth: 20,
      },
      low: {
        intercept: -297.54,
        age: -22.25,
        height: 12.77,
        weight: 14.73,
        growth: 20,
      },
      active: {
        intercept: -189.55,
        age: -22.25,
        height: 11.74,
        weight: 18.34,
        growth: 20,
      },
      'very-active': {
        intercept: -709.59,
        age: -22.25,
        height: 18.22,
        weight: 14.25,
        growth: 20,
      },
    },
  },
  '19-plus': {
    male: {
      inactive: {
        intercept: 753.07,
        age: -10.83,
        height: 6.5,
        weight: 14.1,
        growth: 0,
      },
      low: {
        intercept: 581.47,
        age: -10.83,
        height: 8.3,
        weight: 14.94,
        growth: 0,
      },
      active: {
        intercept: 1004.82,
        age: -10.83,
        height: 6.52,
        weight: 15.91,
        growth: 0,
      },
      'very-active': {
        intercept: -517.88,
        age: -10.83,
        height: 15.61,
        weight: 19.11,
        growth: 0,
      },
    },
    female: {
      inactive: {
        intercept: 584.9,
        age: -7.01,
        height: 5.72,
        weight: 11.71,
        growth: 0,
      },
      low: {
        intercept: 575.77,
        age: -7.01,
        height: 6.6,
        weight: 12.14,
        growth: 0,
      },
      active: {
        intercept: 710.25,
        age: -7.01,
        height: 6.54,
        weight: 12.34,
        growth: 0,
      },
      'very-active': {
        intercept: 511.83,
        age: -7.01,
        height: 9.07,
        weight: 12.56,
        growth: 0,
      },
    },
  },
};

export type EnergyRequirementResultV1 =
  | {
      readonly status: 'READY';
      readonly ruleVersion: typeof ENERGY_RULE_VERSION_V1;
      readonly source: typeof ENERGY_RULE_SOURCE_V1;
      readonly activityLevel: ActivityLevel;
      readonly maintenanceKilocaloriesPerDay: {
        readonly minimum: number;
        readonly maximum: number;
      };
      readonly limitationCodes: readonly string[];
    }
  | {
      readonly status: 'NEEDS_INPUT';
      readonly fields: readonly string[];
    }
  | {
      readonly status: 'OUT_OF_SCOPE';
      readonly reason: string;
    };

function evaluate(
  age: number,
  heightCentimeters: number,
  weightKilograms: number,
  physiology: Physiology,
  activity: ActivityLevel,
): number {
  const equation =
    EQUATIONS[age === 18 ? '18' : '19-plus'][physiology][activity];
  return (
    equation.intercept +
    equation.age * age +
    equation.height * heightCentimeters +
    equation.weight * weightKilograms +
    equation.growth
  );
}

export function estimateEnergyRequirementV1(
  context: HealthContextSnapshotV1,
): EnergyRequirementResultV1 {
  if (context.status === 'OUT_OF_SCOPE') {
    return { status: 'OUT_OF_SCOPE', reason: 'health-context-out-of-scope' };
  }
  if (context.status === 'NEEDS_INPUT') {
    return { status: 'NEEDS_INPUT', fields: context.neededInput };
  }
  const fields: string[] = [];
  if (context.physiologicalReference === 'unsure') {
    fields.push('physiological-reference');
  }
  if (context.lifeStage === 'unspecified') {
    fields.push('life-stage');
  }
  if (context.activityLevel === 'unreported') {
    fields.push('activity-level');
  }
  if (fields.length > 0) return { status: 'NEEDS_INPUT', fields };
  if (
    context.physiologicalReference === 'unsure' ||
    context.activityLevel === 'unreported'
  ) {
    throw new TypeError('Required energy inputs were not resolved.');
  }

  const values: number[] = [];
  for (
    let age = context.ageYears.minimum;
    age <= context.ageYears.maximum;
    age += 1
  ) {
    values.push(
      evaluate(
        age,
        Number(context.heightCentimeters),
        Number(context.weightKilograms),
        context.physiologicalReference,
        context.activityLevel,
      ),
    );
  }
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    return { status: 'OUT_OF_SCOPE', reason: 'energy-estimate-invalid' };
  }
  return {
    status: 'READY',
    ruleVersion: ENERGY_RULE_VERSION_V1,
    source: ENERGY_RULE_SOURCE_V1,
    activityLevel: context.activityLevel,
    maintenanceKilocaloriesPerDay: {
      minimum: Math.round(Math.min(...values)),
      maximum: Math.round(Math.max(...values)),
    },
    limitationCodes: [
      ...context.limitationCodes,
      'predictive-energy-estimate-not-personal-measurement',
    ],
  };
}
