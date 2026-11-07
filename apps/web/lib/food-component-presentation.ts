import { findFoodComponentObservationV1 } from '@nutrixx/nutrition-engine';

function humanizeCode(value: string): string | null {
  if (value.startsWith('source.') || /^[0-9]/.test(value)) return null;
  const words = value.split('.').at(-1)?.replaceAll(/[-_]+/g, ' ').trim();
  if (!words || !/[a-z]/i.test(words)) return null;
  return words.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function foodComponentDisplayNameV1(
  nutrientId: string,
  sourceNutrientName?: string,
): string {
  return (
    findFoodComponentObservationV1(nutrientId)?.name ??
    sourceNutrientName?.trim() ??
    humanizeCode(nutrientId) ??
    'Additional source component'
  );
}
