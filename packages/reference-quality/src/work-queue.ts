import {
  REFERENCE_GAP_PRIORITY_POLICY_V1,
  ReferenceGapV1Schema,
  referenceGapKeyV1,
  type ReferenceGapV1,
} from './priority.js';

export interface FoodCompositionQueueInputV1 {
  readonly releaseId: string;
  readonly artifactSha256: string;
  readonly evaluatedAt: string;
  readonly foods: readonly {
    readonly foodId: string;
    readonly revision: number;
    readonly name: string;
    readonly sourceRecordId: string;
  }[];
  readonly observations: readonly {
    readonly foodId: string;
    readonly foodRevision: number;
    readonly nutrientId: string;
    readonly sourceNutrientId: string;
    readonly value:
      | {
          readonly state: 'known';
          readonly amount: string;
          readonly unit: { readonly system: string; readonly code: string };
          readonly basis: string;
        }
      | { readonly state: 'unknown' };
  }[];
  readonly components: readonly {
    readonly componentId: string;
    readonly name: string;
    readonly unit: string;
    readonly usdaFdcNutrientIds: readonly string[];
  }[];
  readonly baselineTargetIds: readonly string[];
}

export interface FoodCompositionWorkItemV1 {
  readonly gapKey: string;
  readonly gap: ReferenceGapV1;
  readonly status: 'coverage-candidate';
  readonly priorityBand: 'unmeasured';
  readonly priorityScore: null;
  readonly foodName: string;
  readonly sourceRecordId: string;
  readonly knownComponentCount: number;
  readonly totalComponentCount: number;
  readonly missingBaselineComponentIds: readonly string[];
  readonly absentComponentIds: readonly string[];
  readonly explicitlyUnknownComponentIds: readonly string[];
  readonly unitIncompatibleComponentIds: readonly string[];
}

export interface FoodCompositionWorkQueueV1 {
  readonly format: 'nutrixx.reference-work-queue';
  readonly schemaVersion: 1;
  readonly priorityPolicyId: typeof REFERENCE_GAP_PRIORITY_POLICY_V1.policyId;
  readonly reviewOrder: 'missing-baseline-then-total-coverage';
  readonly releaseId: string;
  readonly artifactSha256: string;
  readonly evaluatedAt: string;
  readonly totalFoods: number;
  readonly totalComponents: number;
  readonly candidateFoods: number;
  readonly items: readonly FoodCompositionWorkItemV1[];
}

interface FoodState {
  readonly foodId: string;
  readonly revision: number;
  readonly name: string;
  readonly sourceRecordId: string;
  readonly known: Set<string>;
  readonly unknown: Set<string>;
  readonly incompatible: Set<string>;
}

function revisionKey(foodId: string, revision: number): string {
  return `${foodId}:${revision}`;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Build one inspectable work unit per food, with exact component gaps attached. */
export function buildFoodCompositionWorkQueueV1(
  input: FoodCompositionQueueInputV1,
): FoodCompositionWorkQueueV1 {
  if (!Number.isFinite(Date.parse(input.evaluatedAt)))
    throw new TypeError('The evaluation instant must be valid.');
  const components = new Map(
    input.components.map((component) => [component.componentId, component]),
  );
  if (components.size !== input.components.length)
    throw new TypeError('Food component IDs must be unique.');
  const byObservationId = new Map<string, string>();
  for (const component of input.components) {
    const aliases = [
      component.componentId,
      ...component.usdaFdcNutrientIds.map((id) => `source.usda-fdc.${id}`),
    ];
    for (const alias of aliases) {
      const previous = byObservationId.get(alias);
      if (previous && previous !== component.componentId)
        throw new TypeError(`Ambiguous component mapping: ${alias}.`);
      byObservationId.set(alias, component.componentId);
    }
  }
  const latest = new Map<string, FoodState>();
  for (const food of input.foods) {
    const previous = latest.get(food.foodId);
    if (previous && previous.revision >= food.revision) continue;
    latest.set(food.foodId, {
      ...food,
      known: new Set(),
      unknown: new Set(),
      incompatible: new Set(),
    });
  }
  const latestByRevision = new Map(
    [...latest.values()].map((food) => [
      revisionKey(food.foodId, food.revision),
      food,
    ]),
  );
  for (const observation of input.observations) {
    const food = latestByRevision.get(
      revisionKey(observation.foodId, observation.foodRevision),
    );
    if (!food) continue;
    const componentId =
      byObservationId.get(observation.nutrientId) ??
      byObservationId.get(`source.usda-fdc.${observation.sourceNutrientId}`);
    if (!componentId) continue;
    const component = components.get(componentId);
    if (!component) continue;
    if (observation.value.state === 'unknown') {
      food.unknown.add(componentId);
    } else if (
      observation.value.unit.system === 'ucum' &&
      observation.value.unit.code === component.unit &&
      observation.value.basis === 'per-100-gram-edible'
    ) {
      food.known.add(componentId);
    } else {
      food.incompatible.add(componentId);
    }
  }

  const baseline = new Set(input.baselineTargetIds);
  const candidates: FoodCompositionWorkItemV1[] = [];
  for (const food of latest.values()) {
    const absentComponentIds: string[] = [];
    const explicitlyUnknownComponentIds: string[] = [];
    const unitIncompatibleComponentIds: string[] = [];
    const missingBaselineComponentIds: string[] = [];
    for (const component of input.components) {
      const id = component.componentId;
      if (food.known.has(id)) continue;
      if (baseline.has(id)) missingBaselineComponentIds.push(id);
      if (food.incompatible.has(id)) unitIncompatibleComponentIds.push(id);
      else if (food.unknown.has(id)) explicitlyUnknownComponentIds.push(id);
      else absentComponentIds.push(id);
    }
    if (
      absentComponentIds.length +
        explicitlyUnknownComponentIds.length +
        unitIncompatibleComponentIds.length ===
      0
    )
      continue;
    const gap: ReferenceGapV1 = {
      subject: { kind: 'food-composition-coverage', foodId: food.foodId },
      deficiency: 'incomplete-coverage',
      detectedIn: {
        releaseId: input.releaseId,
        artifactSha256: input.artifactSha256,
      },
      impact: null,
      safety: { level: 'routine' },
    };
    ReferenceGapV1Schema.parse(gap);
    candidates.push({
      gapKey: referenceGapKeyV1(gap),
      gap,
      status: 'coverage-candidate',
      priorityBand: 'unmeasured',
      priorityScore: null,
      foodName: food.name,
      sourceRecordId: food.sourceRecordId,
      knownComponentCount: food.known.size,
      totalComponentCount: input.components.length,
      missingBaselineComponentIds,
      absentComponentIds,
      explicitlyUnknownComponentIds,
      unitIncompatibleComponentIds,
    });
  }
  candidates.sort(
    (left, right) =>
      right.missingBaselineComponentIds.length -
        left.missingBaselineComponentIds.length ||
      right.totalComponentCount -
        right.knownComponentCount -
        (left.totalComponentCount - left.knownComponentCount) ||
      compareText(left.foodName, right.foodName) ||
      compareText(left.gapKey, right.gapKey),
  );
  return {
    format: 'nutrixx.reference-work-queue',
    schemaVersion: 1,
    priorityPolicyId: REFERENCE_GAP_PRIORITY_POLICY_V1.policyId,
    reviewOrder: 'missing-baseline-then-total-coverage',
    releaseId: input.releaseId,
    artifactSha256: input.artifactSha256,
    evaluatedAt: input.evaluatedAt,
    totalFoods: latest.size,
    totalComponents: input.components.length,
    candidateFoods: candidates.length,
    items: candidates,
  };
}
