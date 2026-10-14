import type { FoodCatalogManifestV1, FoodCatalogPayloadV1 } from './model.js';

export const FOOD_DATA_QUALITY_RADAR_VERSION_V1 =
  'food-data-quality-radar-v1' as const;
export const FRESH_SOURCE_WINDOW_DAYS_V1 = 1095;

export interface AuditedFoodComponentV1 {
  readonly componentId: string;
  readonly accessCode: string;
  readonly name: string;
  readonly category: string;
  readonly kind: string;
  readonly unit: string;
  readonly usdaFdcNutrientIds: readonly string[];
}

export interface FoodComponentQualityRowV1 {
  readonly componentId: string;
  readonly accessCode: string;
  readonly name: string;
  readonly category: string;
  readonly kind: string;
  readonly unit: string;
  readonly knownFoods: number;
  readonly explicitlyUnknownFoods: number;
  readonly foodsMissingKnownValue: number;
  readonly foodsWithKnownValueAndPortion: number;
  readonly knownObservations: number;
  readonly tracedObservations: number;
  readonly methodDocumentedObservations: number;
  readonly explicitlyGradedObservations: number;
  readonly freshSourceObservations: number;
  readonly sourceDateUnknownObservations: number;
  readonly unitMismatchObservations: number;
  readonly hasBaselineTarget: boolean;
  readonly coverageScore: number | null;
}

export interface FoodDataQualityReportV1 {
  readonly radarVersion: typeof FOOD_DATA_QUALITY_RADAR_VERSION_V1;
  readonly releaseId: string;
  readonly catalogPublishedAt: string;
  readonly evaluatedAt: string;
  readonly freshSourceWindowDays: typeof FRESH_SOURCE_WINDOW_DAYS_V1;
  readonly totalComponents: number;
  readonly latestFoods: number;
  readonly foodsWithPortions: number;
  readonly knownFoodComponentPairs: number;
  readonly possibleFoodComponentPairs: number;
  readonly coverageScore: number | null;
  readonly knownObservations: number;
  readonly tracedObservations: number;
  readonly methodDocumentedObservations: number;
  readonly explicitlyGradedObservations: number;
  readonly freshSourceObservations: number;
  readonly sourceDateUnknownObservations: number;
  readonly baselineTargetComponents: number;
  readonly unmappedBaselineTargetIds: readonly string[];
  readonly catalogComparableFoodsForBaselineSet: number | null;
  readonly rows: readonly FoodComponentQualityRowV1[];
}

interface RowAccumulator {
  readonly definition: AuditedFoodComponentV1;
  readonly knownFoods: Set<string>;
  readonly unknownFoods: Set<string>;
  knownObservations: number;
  tracedObservations: number;
  methodDocumentedObservations: number;
  explicitlyGradedObservations: number;
  freshSourceObservations: number;
  sourceDateUnknownObservations: number;
  unitMismatchObservations: number;
}

function foodKey(foodId: string, revision: number): string {
  return `${foodId}:${revision}`;
}

function coverageScore(known: number, possible: number): number | null {
  return possible === 0 ? null : Math.round((known / possible) * 10000) / 100;
}

function releaseAgeDays(release: string, evaluatedAt: string): number | null {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(release);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = match[3] === undefined ? 1 : Number(match[3]);
  const instant = Date.UTC(year, month - 1, day);
  const parsed = new Date(instant);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  )
    return null;
  const age = Math.floor((Date.parse(evaluatedAt) - instant) / 86_400_000);
  return age < 0 ? null : age;
}

/** A catalog-only audit. User-specific history, exclusions, and final ranking are outside this report. */
export function auditFoodDataQualityV1(input: {
  readonly manifest: FoodCatalogManifestV1;
  readonly payload: FoodCatalogPayloadV1;
  readonly components: readonly AuditedFoodComponentV1[];
  readonly baselineTargetIds: readonly string[];
  readonly evaluatedAt: string;
}): FoodDataQualityReportV1 {
  if (!Number.isFinite(Date.parse(input.evaluatedAt)))
    throw new TypeError('The evaluation instant must be a valid date.');
  const componentIds = new Set(
    input.components.map((item) => item.componentId),
  );
  if (componentIds.size !== input.components.length)
    throw new TypeError('Audited component IDs must be unique.');

  const latest = new Map<string, number>();
  for (const food of input.payload.foods) {
    latest.set(
      food.foodId,
      Math.max(latest.get(food.foodId) ?? 0, food.revision),
    );
  }
  const latestKeys = new Set(
    [...latest].map(([foodId, revision]) => foodKey(foodId, revision)),
  );
  const portionKeys = new Set(
    input.payload.portions
      .map((portion) => foodKey(portion.foodId, portion.foodRevision))
      .filter((key) => latestKeys.has(key)),
  );
  const datasetKeys = new Set(
    input.manifest.sourceDatasets.map(
      (dataset) =>
        `${dataset.provider}:${dataset.dataset}:${dataset.sourceRelease}:${dataset.licenseId}`,
    ),
  );
  const sources = new Map(
    input.payload.sources.map((source) => [source.sourceId, source]),
  );
  const rows = new Map<string, RowAccumulator>();
  const byObservationId = new Map<string, RowAccumulator>();
  for (const definition of input.components) {
    const row: RowAccumulator = {
      definition,
      knownFoods: new Set(),
      unknownFoods: new Set(),
      knownObservations: 0,
      tracedObservations: 0,
      methodDocumentedObservations: 0,
      explicitlyGradedObservations: 0,
      freshSourceObservations: 0,
      sourceDateUnknownObservations: 0,
      unitMismatchObservations: 0,
    };
    rows.set(definition.componentId, row);
    byObservationId.set(definition.componentId, row);
    for (const id of definition.usdaFdcNutrientIds)
      byObservationId.set(`source.usda-fdc.${id}`, row);
  }
  for (const observation of input.payload.composition) {
    const key = foodKey(observation.foodId, observation.foodRevision);
    if (!latestKeys.has(key)) continue;
    const row =
      byObservationId.get(observation.nutrientId) ??
      byObservationId.get(`source.usda-fdc.${observation.sourceNutrientId}`);
    if (row === undefined) continue;
    if (observation.value.state === 'unknown') {
      row.unknownFoods.add(key);
      continue;
    }
    if (
      observation.value.unit.system !== 'ucum' ||
      observation.value.unit.code !== row.definition.unit ||
      observation.value.basis !== 'per-100-gram-edible'
    ) {
      row.unitMismatchObservations += 1;
      continue;
    }
    row.knownFoods.add(key); // An observed zero is known, never missing.
    row.knownObservations += 1;
    const source = sources.get(observation.sourceId);
    if (source !== undefined) {
      if (
        source.sourceRecordId &&
        source.retrievedAt &&
        datasetKeys.has(
          `${source.provider}:${source.dataset}:${source.sourceRelease}:${source.licenseId}`,
        )
      )
        row.tracedObservations += 1;
      const age = releaseAgeDays(source.sourceRelease, input.evaluatedAt);
      if (age === null) row.sourceDateUnknownObservations += 1;
      else if (age <= FRESH_SOURCE_WINDOW_DAYS_V1)
        row.freshSourceObservations += 1;
    } else {
      row.sourceDateUnknownObservations += 1;
    }
    if (observation.derivationCode || (observation.dataPoints ?? 0) > 0)
      row.methodDocumentedObservations += 1;
    if (observation.quality.length > 0) row.explicitlyGradedObservations += 1;
  }

  const baselineTargetIds = [...new Set(input.baselineTargetIds)];
  const mappedTargets = baselineTargetIds.filter((id) => rows.has(id));
  const reportRows = [...rows.values()].map(
    (row): FoodComponentQualityRowV1 => {
      const knownFoods = row.knownFoods.size;
      return {
        componentId: row.definition.componentId,
        accessCode: row.definition.accessCode,
        name: row.definition.name,
        category: row.definition.category,
        kind: row.definition.kind,
        unit: row.definition.unit,
        knownFoods,
        explicitlyUnknownFoods: [...row.unknownFoods].filter(
          (key) => !row.knownFoods.has(key),
        ).length,
        foodsMissingKnownValue: latest.size - knownFoods,
        foodsWithKnownValueAndPortion: [...row.knownFoods].filter((key) =>
          portionKeys.has(key),
        ).length,
        knownObservations: row.knownObservations,
        tracedObservations: row.tracedObservations,
        methodDocumentedObservations: row.methodDocumentedObservations,
        explicitlyGradedObservations: row.explicitlyGradedObservations,
        freshSourceObservations: row.freshSourceObservations,
        sourceDateUnknownObservations: row.sourceDateUnknownObservations,
        unitMismatchObservations: row.unitMismatchObservations,
        hasBaselineTarget: mappedTargets.includes(row.definition.componentId),
        coverageScore: coverageScore(knownFoods, latest.size),
      };
    },
  );
  reportRows.sort(
    (left, right) =>
      (left.coverageScore ?? -1) - (right.coverageScore ?? -1) ||
      left.name.localeCompare(right.name, 'en'),
  );
  type NumericField =
    | 'knownObservations'
    | 'tracedObservations'
    | 'methodDocumentedObservations'
    | 'explicitlyGradedObservations'
    | 'freshSourceObservations'
    | 'sourceDateUnknownObservations';
  const total = (field: NumericField): number =>
    [...rows.values()].reduce((sum, row) => sum + row[field], 0);
  const comparableFoods =
    baselineTargetIds.length === 0 ||
    mappedTargets.length !== baselineTargetIds.length
      ? null
      : [...portionKeys].filter((key) =>
          mappedTargets.every((id) => rows.get(id)!.knownFoods.has(key)),
        ).length;
  const knownPairs = reportRows.reduce((sum, row) => sum + row.knownFoods, 0);
  const possiblePairs = latest.size * input.components.length;
  return {
    radarVersion: FOOD_DATA_QUALITY_RADAR_VERSION_V1,
    releaseId: input.manifest.releaseId,
    catalogPublishedAt: input.manifest.publishedAt,
    evaluatedAt: input.evaluatedAt,
    freshSourceWindowDays: FRESH_SOURCE_WINDOW_DAYS_V1,
    totalComponents: input.components.length,
    latestFoods: latest.size,
    foodsWithPortions: portionKeys.size,
    knownFoodComponentPairs: knownPairs,
    possibleFoodComponentPairs: possiblePairs,
    coverageScore: coverageScore(knownPairs, possiblePairs),
    knownObservations: total('knownObservations'),
    tracedObservations: total('tracedObservations'),
    methodDocumentedObservations: total('methodDocumentedObservations'),
    explicitlyGradedObservations: total('explicitlyGradedObservations'),
    freshSourceObservations: total('freshSourceObservations'),
    sourceDateUnknownObservations: total('sourceDateUnknownObservations'),
    baselineTargetComponents: mappedTargets.length,
    unmappedBaselineTargetIds: baselineTargetIds.filter((id) => !rows.has(id)),
    catalogComparableFoodsForBaselineSet: comparableFoods,
    rows: reportRows,
  };
}
