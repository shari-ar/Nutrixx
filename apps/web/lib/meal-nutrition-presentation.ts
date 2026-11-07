import {
  FOOD_COMPONENTS_V1,
  findFoodComponentObservationV1,
} from '@nutrixx/nutrition-engine';

import type { MealRevisionV1 } from '@nutrixx/consumption';

type MealNutrientV1 = NonNullable<MealRevisionV1['nutrition']>[number];

export interface MealNutritionPresentationRowV1 {
  readonly componentId: string;
  readonly accessCode: string;
  readonly name: string;
  readonly category: string;
  readonly state: 'known' | 'incomplete';
  readonly amount?: string;
  readonly knownAmount?: string;
  readonly unit: string;
  readonly missingItemCount: number;
}

export interface MealNutritionPresentationV1 {
  readonly rows: readonly MealNutritionPresentationRowV1[];
  readonly recognizedObservationCount: number;
  readonly hiddenTechnicalObservationCount: number;
  readonly collapsedEquivalentObservationCount: number;
}

function observationRank(
  nutrient: MealNutrientV1,
  sourceIds: readonly string[],
): readonly [number, number] {
  const knownRank = nutrient.state === 'known' ? 0 : 1;
  const sourceIndex = sourceIds.findIndex(
    (sourceId) => nutrient.nutrientId === `source.usda-fdc.${sourceId}`,
  );
  return [knownRank, sourceIndex === -1 ? sourceIds.length : sourceIndex];
}

function compareObservations(
  left: MealNutrientV1,
  right: MealNutrientV1,
  sourceIds: readonly string[],
): number {
  const leftRank = observationRank(left, sourceIds);
  const rightRank = observationRank(right, sourceIds);
  return leftRank[0] - rightRank[0] || leftRank[1] - rightRank[1];
}

export function presentMealNutritionV1(
  nutrition: MealRevisionV1['nutrition'],
): MealNutritionPresentationV1 {
  const grouped = new Map<string, MealNutrientV1[]>();
  let recognizedObservationCount = 0;
  let hiddenTechnicalObservationCount = 0;

  for (const nutrient of nutrition ?? []) {
    const component = findFoodComponentObservationV1(nutrient.nutrientId);
    const { unit } = nutrient;
    if (
      component === undefined ||
      (unit !== undefined && unit.code !== component.unit)
    ) {
      hiddenTechnicalObservationCount += 1;
      continue;
    }
    recognizedObservationCount += 1;
    grouped.set(component.componentId, [
      ...(grouped.get(component.componentId) ?? []),
      nutrient,
    ]);
  }

  let collapsedEquivalentObservationCount = 0;
  const rows = FOOD_COMPONENTS_V1.flatMap((component) => {
    const matches = grouped.get(component.componentId);
    if (matches === undefined || matches.length === 0) return [];
    const ordered = [...matches].sort((left, right) =>
      compareObservations(left, right, component.usdaFdcNutrientIds),
    );
    const selected = ordered[0]!;
    collapsedEquivalentObservationCount += ordered.length - 1;
    return [
      {
        componentId: component.componentId,
        accessCode: component.accessCode,
        name: component.name,
        category: component.category,
        state: selected.state,
        ...(selected.state === 'known'
          ? { amount: selected.amount }
          : selected.knownAmount === undefined
            ? {}
            : { knownAmount: selected.knownAmount }),
        unit:
          selected.state === 'known'
            ? selected.unit.code
            : (selected.unit?.code ?? component.unit),
        missingItemCount:
          selected.state === 'incomplete' ? selected.missingItemIds.length : 0,
      } satisfies MealNutritionPresentationRowV1,
    ];
  });

  return {
    rows,
    recognizedObservationCount,
    hiddenTechnicalObservationCount,
    collapsedEquivalentObservationCount,
  };
}
