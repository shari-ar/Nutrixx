import { BrowserStageTwoStore } from '../lib/browser-stage-two';
import {
  nutrientProminenceEntryV1,
  selectMealSignatureNutrientsV1,
} from '../lib/nutrient-prominence';
import { loadOrBuildNutrientProminenceIndexV1 } from '../lib/nutrient-prominence-cache';

import type {
  NutrientProminenceRequestV1,
  NutrientProminenceResultV1,
} from '../lib/nutrient-prominence-client';

self.onmessage = (event: MessageEvent<NutrientProminenceRequestV1>) => {
  (async () => {
    try {
      const store = new BrowserStageTwoStore({
        indexedDB,
        keyRange: IDBKeyRange,
        createId: () => crypto.randomUUID(),
        now: () => new Date().toISOString(),
        timeZone: () =>
          Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        onboarding: { load: async () => event.data.profile },
      });
      const catalog = await store.enumerateNextMealCatalog();
      const index = await loadOrBuildNutrientProminenceIndexV1(catalog);
      const result: NutrientProminenceResultV1 =
        event.data.kind === 'MEAL_SIGNATURES'
          ? {
              status: 'MEAL_SIGNATURES',
              highlights: selectMealSignatureNutrientsV1(
                event.data.rows,
                index,
              ),
            }
          : {
              status: 'NUTRIENT_FOODS',
              nutrient: nutrientProminenceEntryV1(index, event.data.slug),
              catalogEntryCount: index.catalogEntryCount,
            };
      self.postMessage(result);
    } catch {
      if (event.data.kind === 'MEAL_SIGNATURES') {
        self.postMessage({
          status: 'MEAL_SIGNATURES',
          highlights: selectMealSignatureNutrientsV1(event.data.rows),
        } satisfies NutrientProminenceResultV1);
        return;
      }
      self.postMessage({
        status: 'FAILED',
        reasonCode: 'nutrient-prominence-unavailable',
      } satisfies NutrientProminenceResultV1);
    }
  })().catch(() => {
    self.postMessage({
      status: 'FAILED',
      reasonCode: 'nutrient-prominence-unavailable',
    } satisfies NutrientProminenceResultV1);
  });
};
