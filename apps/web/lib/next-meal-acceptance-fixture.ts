import { getAdultDriBaselineReleaseV1 } from '@nutrixx/nutrition-engine';

import type { BrowserNutritionSnapshotV1 } from './browser-nutrition-state';

export const STAGE_4_ACCEPTANCE_INSTANT = '2026-10-14T12:00:00.000Z';
export const STAGE_4_CATALOG_SHA256 =
  '06397f3f38e0b60aed4c677e24224b3f0835f632930fbd8afdab3ef084eaa591';
export const STAGE_4_CATALOG_PATH =
  '/catalog/food-catalog-usda-2026-04-30.1.v1.json.gz';

/** A pinned adult corpus shared by the Node and development-browser audits. */
export function stage4NutritionFixture(): BrowserNutritionSnapshotV1 {
  const release = getAdultDriBaselineReleaseV1();
  const targets = release.rules.filter(
    (rule) =>
      rule.population.minimumAgeYears <= 30 &&
      rule.population.maximumAgeYears >= 30 &&
      rule.population.physiologicalReference === 'female' &&
      (rule.type === 'RDA' || rule.type === 'AI') &&
      rule.value.kind === 'point',
  );
  return {
    market: 'US',
    deviceTimeZone: 'UTC',
    meals: [],
    dayPolicy: {
      policyVersion: 'nutrition-day-zone-v1',
      initialTimeZone: 'UTC',
      changes: [],
    },
    window: {
      current: {
        period: {
          startsAt: '2026-10-14T00:00:00.000Z',
          endsAt: '2026-10-15T00:00:00.000Z',
          travelAdjusted: false,
        },
        nutrients: targets.map((rule) => ({
          nutrientId: rule.nutrientId,
          unit: rule.unit.code,
          target: {
            status: 'READY',
            policyVersion: release.policyVersion,
            releaseId: release.releaseId,
            rule,
          },
          upperLimit: { status: 'UNAVAILABLE' },
        })),
      },
    },
  } as unknown as BrowserNutritionSnapshotV1;
}
