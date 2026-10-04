import * as z from 'zod';

import {
  CanonicalCodeSchema,
  NonnegativeCanonicalDecimalSchema,
  type CanonicalId,
} from '@nutrixx/canonical-schema';

import {
  FoodCatalogPayloadV1Schema,
  type FoodCatalogPayloadV1,
} from './model.js';

const PositiveDecimalSchema = NonnegativeCanonicalDecimalSchema.refine(
  (value) => value !== '0',
);

const StagedUsdaSourceV1Schema = z.strictObject({
  dataset: z.enum(['foundation', 'sr-legacy']),
  sourceRelease: z.string().trim().min(1).max(128),
  retrievedAt: z.iso.datetime({ precision: 3 }),
});

const StagedUsdaPortionV1Schema = z.strictObject({
  sourcePortionId: z.string().trim().min(1),
  description: z.string().trim().min(1),
  amount: PositiveDecimalSchema,
  measureUnitCode: z.string().trim().min(1).max(64),
  gramWeight: PositiveDecimalSchema,
});

const StagedUsdaNutrientV1Schema = z.strictObject({
  sourceNutrientId: z.string().trim().min(1),
  sourceNutrientName: z.string().trim().min(1),
  sourceNutrientNumber: z.string().trim().min(1).optional(),
  nutrientId: CanonicalCodeSchema,
  unitCode: z.string().trim().min(1).max(64),
  derivationCode: z.string().trim().min(1).optional(),
  dataPoints: z.int().nonnegative().optional(),
  amount: NonnegativeCanonicalDecimalSchema.optional(),
  unknownReason: z
    .enum([
      'not-measured',
      'not-provided',
      'not-applicable',
      'not-resolvable',
      'withheld',
      'unsupported',
    ])
    .optional(),
});

export const StagedUsdaFoodV1Schema = z.strictObject({
  fdcId: z.int().positive(),
  description: z.string().trim().min(1),
  preparationState: CanonicalCodeSchema,
  category: z
    .strictObject({
      sourceCategoryId: z.string().trim().min(1).optional(),
      description: z.string().trim().min(1),
    })
    .optional(),
  source: StagedUsdaSourceV1Schema,
  portions: z.array(StagedUsdaPortionV1Schema),
  nutrients: z.array(StagedUsdaNutrientV1Schema),
});

export type StagedUsdaFoodV1 = z.infer<typeof StagedUsdaFoodV1Schema>;

export interface UsdaFoodDataCentralIdFactory {
  (
    kind: 'source' | 'food' | 'portion' | 'observation',
    sourceId: string,
  ): CanonicalId;
}

export function normalizeUsdaFoodDataCentralV1(
  input: readonly StagedUsdaFoodV1[],
  idFor: UsdaFoodDataCentralIdFactory,
): FoodCatalogPayloadV1 {
  const sources: FoodCatalogPayloadV1['sources'][number][] = [];
  const foods: FoodCatalogPayloadV1['foods'][number][] = [];
  const portions: FoodCatalogPayloadV1['portions'][number][] = [];
  const composition: FoodCatalogPayloadV1['composition'][number][] = [];

  for (const rawInput of input) {
    const raw = StagedUsdaFoodV1Schema.parse(rawInput);
    const sourceRecordId = String(raw.fdcId);
    const sourceId = idFor('source', sourceRecordId);
    const source = {
      sourceId,
      provider: 'usda-fdc' as const,
      dataset: raw.source.dataset,
      sourceRelease: raw.source.sourceRelease,
      sourceRecordId,
      licenseId: 'CC0-1.0' as const,
      retrievedAt: raw.source.retrievedAt,
    };
    sources.push(source);
    const foodId = idFor('food', sourceRecordId);
    foods.push({
      foodId,
      revision: 1,
      foodClass: `usda.${raw.source.dataset}`,
      descriptions: [{ locale: 'en', value: raw.description, kind: 'primary' }],
      categories:
        raw.category === undefined
          ? []
          : [
              {
                ...raw.category,
                locale: 'en',
              },
            ],
      preparationStates: [raw.preparationState],
      sourceId,
    });
    for (const portion of raw.portions) {
      portions.push({
        portionId: idFor(
          'portion',
          `${sourceRecordId}:${portion.sourcePortionId}`,
        ),
        foodId,
        foodRevision: 1,
        description: {
          locale: 'en',
          value: portion.description,
          kind: 'primary',
        },
        amount: portion.amount,
        measureUnit: { system: 'ucum', code: portion.measureUnitCode },
        gramWeight: portion.gramWeight,
        edibleFraction: '1',
        sourceId,
      });
    }
    for (const nutrient of raw.nutrients) {
      const hasAmount = nutrient.amount !== undefined;
      const hasUnknownReason = nutrient.unknownReason !== undefined;
      if (hasAmount === hasUnknownReason) {
        throw new TypeError(
          'Each staged nutrient requires exactly one amount or unknown reason.',
        );
      }
      composition.push({
        observationId: idFor(
          'observation',
          `${sourceRecordId}:${nutrient.sourceNutrientId}`,
        ),
        foodId,
        foodRevision: 1,
        nutrientId: nutrient.nutrientId,
        sourceNutrientId: nutrient.sourceNutrientId,
        sourceNutrientName: nutrient.sourceNutrientName,
        ...(nutrient.sourceNutrientNumber === undefined
          ? {}
          : { sourceNutrientNumber: nutrient.sourceNutrientNumber }),
        ...(nutrient.derivationCode === undefined
          ? {}
          : { derivationCode: nutrient.derivationCode }),
        ...(nutrient.dataPoints === undefined
          ? {}
          : { dataPoints: nutrient.dataPoints }),
        preparationState: raw.preparationState,
        value: hasAmount
          ? {
              state: 'known',
              amount: nutrient.amount!,
              unit: { system: 'ucum', code: nutrient.unitCode },
              basis: 'per-100-gram-edible',
            }
          : { state: 'unknown', reason: nutrient.unknownReason! },
        sourceId,
        quality: [],
      });
    }
  }

  return FoodCatalogPayloadV1Schema.parse({
    format: 'nutrixx.food-catalog',
    schemaVersion: 1,
    sources,
    foods,
    portions,
    composition,
  });
}

const RawUsdaNutrientV1Schema = z.object({
  id: z.int().positive(),
  nutrient: z.object({
    id: z.int().positive(),
    number: z.string().max(128).optional(),
    name: z.string().trim().min(1),
    unitName: z.string().trim().min(1),
  }),
  amount: z.number().finite().nullish(),
  dataPoints: z.int().nonnegative().optional(),
  foodNutrientDerivation: z
    .object({ code: z.string().trim().min(1).optional() })
    .optional(),
});

const RawUsdaPortionV1Schema = z.object({
  id: z.int().positive(),
  amount: z.number().finite().optional(),
  value: z.number().finite().optional(),
  modifier: z.string().nullish(),
  gramWeight: z.number().finite().positive(),
  measureUnit: z
    .object({
      name: z.string().trim().min(1).optional(),
      abbreviation: z.string().trim().min(1).optional(),
    })
    .optional(),
});

const RawUsdaFoodV1Schema = z.object({
  fdcId: z.int().positive(),
  foodClass: z.string().trim().min(1),
  description: z.string().trim().min(1),
  foodCategory: z
    .object({
      id: z.int().positive().optional(),
      description: z.string().trim().min(1),
    })
    .nullish(),
  foodNutrients: z.array(z.unknown()).default([]),
  foodPortions: z.array(z.unknown()).default([]),
});

export interface RawUsdaNormalizationOptionsV1 {
  readonly dataset: 'foundation' | 'sr-legacy';
  readonly sourceRelease: string;
  readonly retrievedAt: string;
  readonly idFor: UsdaFoodDataCentralIdFactory;
}

export interface FoodCatalogNormalizationReportV1 {
  readonly sourceEntries: number;
  readonly quarantinedEntries: number;
  readonly sourceComponents: number;
  readonly quarantinedComponents: number;
  readonly quarantineReasonCounts: Readonly<Record<string, number>>;
}

export interface RawUsdaNormalizationResultV1 {
  readonly payload: FoodCatalogPayloadV1;
  readonly report: FoodCatalogNormalizationReportV1;
}

function canonicalDecimalFromNumber(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError('A finite nonnegative source number is required.');
  }
  if (value === 0) return '0';
  const text = value.toString().toLowerCase();
  const [mantissa = '', exponentText] = text.split('e');
  if (exponentText === undefined) return text;
  const exponent = Number(exponentText);
  const [integer = '', fraction = ''] = mantissa.split('.');
  const digits = `${integer}${fraction}`;
  const decimalIndex = integer.length + exponent;
  if (decimalIndex <= 0) {
    return `0.${'0'.repeat(-decimalIndex)}${digits}`;
  }
  if (decimalIndex >= digits.length) {
    return `${digits}${'0'.repeat(decimalIndex - digits.length)}`;
  }
  return `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}

function sourceUnit(unitName: string): {
  system: 'ucum' | 'nutrixx';
  code: string;
} {
  const nutrientUnits: Readonly<Record<string, string>> = {
    g: 'g',
    mg: 'mg',
    µg: 'ug',
    kJ: 'kJ',
    kcal: 'kcal',
    IU: '[IU]',
  };
  const code = nutrientUnits[unitName];
  return code === undefined
    ? { system: 'nutrixx', code: `usda.${slug(unitName)}` }
    : { system: 'ucum', code };
}

function portionUnit(
  input: z.infer<typeof RawUsdaPortionV1Schema>['measureUnit'],
): { system: 'ucum' | 'nutrixx'; code: string } {
  const key = input?.abbreviation?.toLocaleLowerCase('en') ?? '';
  const known: Readonly<Record<string, string>> = {
    ml: 'mL',
    oz: '[oz_av]',
    cup: '[cup_us]',
    tbsp: '[tbs_us]',
    tsp: '[tsp_us]',
  };
  const code = known[key];
  if (code !== undefined) return { system: 'ucum', code };
  return {
    system: 'nutrixx',
    code: `portion.${slug(input?.abbreviation ?? input?.name ?? 'item')}`,
  };
}

function slug(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/\p{Mark}+/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return normalized.length === 0 ? 'unknown' : normalized;
}

function incrementReason(
  reasons: Record<string, number>,
  reason: string,
): void {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
}

export function normalizeRawUsdaFoodDataCentralV1(
  input: readonly unknown[],
  options: RawUsdaNormalizationOptionsV1,
): RawUsdaNormalizationResultV1 {
  const sources: FoodCatalogPayloadV1['sources'][number][] = [];
  const foods: FoodCatalogPayloadV1['foods'][number][] = [];
  const portions: FoodCatalogPayloadV1['portions'][number][] = [];
  const composition: FoodCatalogPayloadV1['composition'][number][] = [];
  const reasons: Record<string, number> = {};
  let quarantinedEntries = 0;
  let sourceComponents = 0;
  let quarantinedComponents = 0;

  for (const rawInput of input) {
    if (rawInput === null) {
      quarantinedEntries += 1;
      incrementReason(reasons, 'null-source-entry');
      continue;
    }
    const parsedFood = RawUsdaFoodV1Schema.safeParse(rawInput);
    if (!parsedFood.success) {
      quarantinedEntries += 1;
      incrementReason(reasons, 'invalid-source-entry');
      continue;
    }
    const raw = parsedFood.data;
    const sourceRecordId = String(raw.fdcId);
    const sourceId = options.idFor(
      'source',
      `usda-fdc:${options.dataset}:${sourceRecordId}`,
    );
    sources.push({
      sourceId,
      provider: 'usda-fdc',
      dataset: options.dataset,
      sourceRelease: options.sourceRelease,
      sourceRecordId,
      licenseId: 'CC0-1.0',
      retrievedAt: options.retrievedAt,
    });
    const foodId = options.idFor('food', `usda-fdc:${sourceRecordId}`);
    foods.push({
      foodId,
      revision: 1,
      foodClass: `usda.${options.dataset}.${slug(raw.foodClass)}`,
      descriptions: [{ locale: 'en', value: raw.description, kind: 'primary' }],
      categories:
        raw.foodCategory === null || raw.foodCategory === undefined
          ? []
          : [
              {
                ...(raw.foodCategory.id === undefined
                  ? {}
                  : { sourceCategoryId: String(raw.foodCategory.id) }),
                locale: 'en',
                description: raw.foodCategory.description,
              },
            ],
      preparationStates: ['unspecified'],
      sourceId,
    });

    sourceComponents += raw.foodPortions.length + raw.foodNutrients.length;
    for (const rawPortion of raw.foodPortions) {
      const parsedPortion = RawUsdaPortionV1Schema.safeParse(rawPortion);
      if (!parsedPortion.success) {
        quarantinedComponents += 1;
        incrementReason(reasons, 'invalid-portion');
        continue;
      }
      const portion = parsedPortion.data;
      const portionAmount = portion.amount ?? portion.value ?? 1;
      if (portionAmount <= 0) {
        quarantinedComponents += 1;
        incrementReason(reasons, 'nonpositive-portion-amount');
        continue;
      }
      const modifier = portion.modifier?.trim();
      const description =
        (modifier === undefined || modifier.length === 0
          ? undefined
          : modifier) ??
        portion.measureUnit?.name ??
        portion.measureUnit?.abbreviation ??
        'item';
      portions.push({
        portionId: options.idFor(
          'portion',
          `usda-fdc:${sourceRecordId}:${portion.id}`,
        ),
        foodId,
        foodRevision: 1,
        description: { locale: 'en', value: description, kind: 'primary' },
        amount: canonicalDecimalFromNumber(portionAmount),
        measureUnit: portionUnit(portion.measureUnit),
        gramWeight: canonicalDecimalFromNumber(portion.gramWeight),
        edibleFraction: '1',
        sourceId,
      });
    }

    for (const rawNutrient of raw.foodNutrients) {
      const parsedNutrient = RawUsdaNutrientV1Schema.safeParse(rawNutrient);
      if (!parsedNutrient.success) {
        quarantinedComponents += 1;
        incrementReason(reasons, 'invalid-nutrient');
        continue;
      }
      const nutrient = parsedNutrient.data;
      if (
        nutrient.amount !== null &&
        nutrient.amount !== undefined &&
        nutrient.amount < 0
      ) {
        quarantinedComponents += 1;
        incrementReason(reasons, 'negative-nutrient-amount');
        continue;
      }
      const sourceNutrientNumber = nutrient.nutrient.number?.trim();
      composition.push({
        observationId: options.idFor(
          'observation',
          `usda-fdc:${sourceRecordId}:${nutrient.id}`,
        ),
        foodId,
        foodRevision: 1,
        nutrientId: `source.usda-fdc.${nutrient.nutrient.id}`,
        sourceNutrientId: String(nutrient.nutrient.id),
        sourceNutrientName: nutrient.nutrient.name,
        ...(sourceNutrientNumber === undefined ||
        sourceNutrientNumber.length === 0
          ? {}
          : { sourceNutrientNumber }),
        ...(nutrient.foodNutrientDerivation?.code === undefined
          ? {}
          : { derivationCode: nutrient.foodNutrientDerivation.code }),
        ...(nutrient.dataPoints === undefined
          ? {}
          : { dataPoints: nutrient.dataPoints }),
        preparationState: 'unspecified',
        value:
          nutrient.amount === null || nutrient.amount === undefined
            ? { state: 'unknown', reason: 'not-provided' }
            : {
                state: 'known',
                amount: canonicalDecimalFromNumber(nutrient.amount),
                unit: sourceUnit(nutrient.nutrient.unitName),
                basis: 'per-100-gram-edible',
              },
        sourceId,
        quality: [],
      });
    }
  }

  return {
    payload: FoodCatalogPayloadV1Schema.parse({
      format: 'nutrixx.food-catalog',
      schemaVersion: 1,
      sources,
      foods,
      portions,
      composition,
    }),
    report: {
      sourceEntries: input.length,
      quarantinedEntries,
      sourceComponents,
      quarantinedComponents,
      quarantineReasonCounts: reasons,
    },
  };
}
