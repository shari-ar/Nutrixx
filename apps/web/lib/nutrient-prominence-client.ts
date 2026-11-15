import { BrowserOnboardingStore } from './browser-onboarding';

import type { MealNutritionPresentationRowV1 } from './meal-nutrition-presentation';
import type {
  MealSignatureNutrientV1,
  NutrientProminenceEntryV1,
} from './nutrient-prominence';
import type { StartingProfileV1 } from '@nutrixx/user-context';

export type NutrientProminenceRequestV1 =
  | {
      readonly kind: 'MEAL_SIGNATURES';
      readonly rows: readonly MealNutritionPresentationRowV1[];
      readonly profile: StartingProfileV1;
    }
  | {
      readonly kind: 'NUTRIENT_FOODS';
      readonly slug: string;
      readonly profile: StartingProfileV1;
    };

export type NutrientProminenceResultV1 =
  | {
      readonly status: 'MEAL_SIGNATURES';
      readonly highlights: readonly MealSignatureNutrientV1[];
    }
  | {
      readonly status: 'NUTRIENT_FOODS';
      readonly nutrient: NutrientProminenceEntryV1 | null;
      readonly catalogEntryCount: number;
    }
  | { readonly status: 'FAILED'; readonly reasonCode: string };

function abortError(): Error {
  const error = new Error('The nutrient prominence request was cancelled.');
  error.name = 'AbortError';
  return error;
}

function requestProminence(
  request: NutrientProminenceRequestV1,
  signal?: AbortSignal,
): Promise<NutrientProminenceResultV1> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/nutrient-prominence.worker.ts', import.meta.url),
      { type: 'module' },
    );
    let settled = false;
    const finish = (completion: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      completion();
    };
    const abort = () => finish(() => reject(abortError()));
    const timer = setTimeout(
      () =>
        finish(() =>
          reject(new TypeError('Nutrient prominence preparation timed out.')),
        ),
      90_000,
    );
    signal?.addEventListener('abort', abort, { once: true });
    worker.onerror = () =>
      finish(() => reject(new TypeError('Nutrient prominence failed.')));
    worker.onmessage = (event: MessageEvent<NutrientProminenceResultV1>) =>
      finish(() =>
        event.data.status === 'FAILED'
          ? reject(new TypeError(event.data.reasonCode))
          : resolve(event.data),
      );
    worker.postMessage(request);
  });
}

async function startingProfile(): Promise<StartingProfileV1> {
  const profile = await new BrowserOnboardingStore().load();
  if (profile === null) throw new TypeError('A starting profile is required.');
  return profile;
}

export async function loadMealSignatureNutrientsV1(
  rows: readonly MealNutritionPresentationRowV1[],
  signal?: AbortSignal,
): Promise<readonly MealSignatureNutrientV1[]> {
  const profile = await startingProfile();
  const result = await requestProminence(
    { kind: 'MEAL_SIGNATURES', rows, profile },
    signal,
  );
  if (result.status !== 'MEAL_SIGNATURES')
    throw new TypeError('Unexpected nutrient prominence response.');
  return result.highlights;
}

export async function loadNutrientFoodsV1(
  slug: string,
  signal?: AbortSignal,
): Promise<{
  readonly nutrient: NutrientProminenceEntryV1 | null;
  readonly catalogEntryCount: number;
}> {
  const profile = await startingProfile();
  const result = await requestProminence(
    { kind: 'NUTRIENT_FOODS', slug, profile },
    signal,
  );
  if (result.status !== 'NUTRIENT_FOODS')
    throw new TypeError('Unexpected nutrient prominence response.');
  return result;
}
