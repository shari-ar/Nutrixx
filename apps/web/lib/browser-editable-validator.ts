import {
  ConsumptionEventRecordV1Schema,
  MealHeadRecordV1Schema,
  MealRevisionRecordV1Schema,
} from '@nutrixx/consumption';
import {
  CustomFoodHeadRecordV1Schema,
  CustomFoodVersionRecordV1Schema,
} from '@nutrixx/food-knowledge';
import { NutritionDayPolicyV1Schema } from '@nutrixx/nutrition-engine';
import { EDITABLE_RECORD_TYPES } from '@nutrixx/persistence';
import {
  RecipeHeadRecordV1Schema,
  RecipeIdentityRecordV1Schema,
  RecipeOutputFoodVersionRecordV1Schema,
  RecipeVersionRecordV1Schema,
} from '@nutrixx/recipe-knowledge';
import {
  OutcomeObservationRecordV1Schema,
  StartingProfileRecordV1Schema,
} from '@nutrixx/user-context';

import type { CanonicalRecordV1 } from '@nutrixx/canonical-schema';

function exactPayload(
  payload: CanonicalRecordV1['payload'],
  key: string,
  values: readonly string[],
): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    !Array.isArray(payload) &&
    Object.keys(payload).length === 1 &&
    values.includes(String(payload[key]))
  );
}

export function validateBrowserEditableRecord(
  record: CanonicalRecordV1,
): boolean {
  switch (record.recordType) {
    case 'user-context.starting-profile':
      return StartingProfileRecordV1Schema.safeParse(record).success;
    case 'user-context.outcome-observation':
      return OutcomeObservationRecordV1Schema.safeParse(record).success;
    case 'user-context.nutrition-market':
      return (
        record.owningContext === 'user-context' &&
        exactPayload(record.payload, 'market', ['US', 'CA'])
      );
    case 'user-context.activity-level':
      return (
        record.owningContext === 'user-context' &&
        exactPayload(record.payload, 'activityLevel', [
          'inactive',
          'low',
          'active',
          'very-active',
        ])
      );
    case 'user-context.nutrition-day-policy':
      return (
        record.owningContext === 'user-context' &&
        NutritionDayPolicyV1Schema.safeParse(record.payload).success
      );
    case 'food.custom-version':
      return CustomFoodVersionRecordV1Schema.safeParse(record).success;
    case 'food.custom-head':
      return CustomFoodHeadRecordV1Schema.safeParse(record).success;
    case 'food.recipe-output-version':
      return RecipeOutputFoodVersionRecordV1Schema.safeParse(record).success;
    case 'recipe.identity':
      return RecipeIdentityRecordV1Schema.safeParse(record).success;
    case 'recipe.version':
      return RecipeVersionRecordV1Schema.safeParse(record).success;
    case 'recipe.head':
      return RecipeHeadRecordV1Schema.safeParse(record).success;
    case 'consumption.meal-revision':
      return MealRevisionRecordV1Schema.safeParse(record).success;
    case 'consumption.meal-head':
      return MealHeadRecordV1Schema.safeParse(record).success;
    case 'consumption.event':
      return ConsumptionEventRecordV1Schema.safeParse(record).success;
    default:
      return false;
  }
}

export function validateBrowserEditableDataset(
  records: readonly CanonicalRecordV1[],
): boolean {
  const byId = new Map(records.map((record) => [record.recordId, record]));
  const profiles = records.filter(
    (record) => record.recordType === 'user-context.starting-profile',
  );
  if (profiles.length !== 1) return false;
  const subjectId = profiles[0]?.subjectId;
  if (
    subjectId === undefined ||
    records.some((record) => record.subjectId !== subjectId)
  )
    return false;

  for (const record of records) {
    if (!EDITABLE_RECORD_TYPES.has(record.recordType)) continue;
    if (!validateBrowserEditableRecord(record)) return false;
    switch (record.recordType) {
      case 'food.custom-head': {
        const head = CustomFoodHeadRecordV1Schema.parse(record).payload;
        const version = CustomFoodVersionRecordV1Schema.safeParse(
          byId.get(head.activeVersionRecordId),
        );
        if (
          !version.success ||
          version.data.payload.foodId !== head.foodId ||
          version.data.payload.revision !== head.activeRevision
        )
          return false;
        break;
      }
      case 'recipe.head': {
        const head = RecipeHeadRecordV1Schema.parse(record).payload;
        const identity = RecipeIdentityRecordV1Schema.safeParse(
          byId.get(head.identityRecordId),
        );
        const version = RecipeVersionRecordV1Schema.safeParse(
          byId.get(head.activeVersionRecordId),
        );
        if (
          !identity.success ||
          !version.success ||
          identity.data.payload.recipeId !== head.recipeId ||
          version.data.payload.recipeId !== head.recipeId ||
          version.data.payload.version !== head.activeVersion
        )
          return false;
        break;
      }
      case 'consumption.meal-head': {
        const head = MealHeadRecordV1Schema.parse(record).payload;
        const revision = MealRevisionRecordV1Schema.safeParse(
          byId.get(head.activeMealRecordId),
        );
        if (
          !revision.success ||
          revision.data.payload.mealId !== head.mealId ||
          revision.data.payload.revision !== head.activeRevision
        )
          return false;
        break;
      }
      case 'consumption.event': {
        const event = ConsumptionEventRecordV1Schema.parse(record).payload;
        const revision = MealRevisionRecordV1Schema.safeParse(
          byId.get(event.mealRecordId),
        );
        if (
          !revision.success ||
          revision.data.payload.mealId !== event.mealId ||
          revision.data.payload.revision !== event.mealRevision
        )
          return false;
        break;
      }
      case 'food.recipe-output-version': {
        const output =
          RecipeOutputFoodVersionRecordV1Schema.parse(record).payload;
        if (
          !records.some((candidate) => {
            const version = RecipeVersionRecordV1Schema.safeParse(candidate);
            return (
              version.success &&
              version.data.payload.recipeId === output.recipeId &&
              version.data.payload.version === output.recipeVersion &&
              version.data.payload.outputFood?.foodId === output.foodId
            );
          })
        )
          return false;
        break;
      }
    }
  }
  return true;
}
