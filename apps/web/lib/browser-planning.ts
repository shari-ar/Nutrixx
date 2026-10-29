import { BrowserNutritionStateStore } from './browser-nutrition-state';
import { BrowserOnboardingStore } from './browser-onboarding';
import { BrowserPlanningStore as InProcessPlanningStore } from './browser-planning-core';
import { BrowserStageTwoStore } from './browser-stage-two';
import { prepareNextMealInWorker } from './next-meal-preparation-client';

import type { SaveMealInput } from './browser-stage-two';
import type { NextMealDisplaySnapshotV1 } from './next-meal-display-cache';
import type { DeclaredInventoryItemV1 } from './next-meal-input';

export type { NextMealRunV1 } from './browser-planning-core';
export type {
  NextMealDisplayRunV1,
  NextMealDisplaySnapshotV1,
} from './next-meal-display-cache';
export type LocalPlanningSnapshotV1 = NextMealDisplaySnapshotV1;

/** The UI only receives a compact outcome; the worker owns the full run. */
export class BrowserPlanningStore {
  private readonly core: InProcessPlanningStore;
  public constructor(
    compute?: ConstructorParameters<typeof InProcessPlanningStore>[0],
    private readonly browserOnboarding: Pick<
      BrowserOnboardingStore,
      'load'
    > = new BrowserOnboardingStore(),
    browserNutrition: Pick<
      BrowserNutritionStateStore,
      'load'
    > = new BrowserNutritionStateStore(),
    foods: ConstructorParameters<
      typeof InProcessPlanningStore
    >[3] = new BrowserStageTwoStore(),
    private readonly runOffThread = true,
  ) {
    this.core = new InProcessPlanningStore(
      compute,
      browserOnboarding,
      browserNutrition,
      foods,
    );
  }

  public async createRecommendation(options: {
    readonly inventory: readonly DeclaredInventoryItemV1[] | null;
  }): Promise<
    Awaited<ReturnType<InProcessPlanningStore['createRecommendation']>>
  > {
    if (!this.runOffThread) return this.core.createRecommendation(options);
    const profile = await this.browserOnboarding.load();
    if (!profile) throw new TypeError('Complete the starting profile first.');
    const completed = await prepareNextMealInWorker({
      kind: 'LOCAL_RECOMMENDATION',
      profile,
      inventory: options.inventory,
    });
    if (completed.status !== 'RECOMMENDATION')
      throw new TypeError('Local recommendation could not complete.');
    return completed.result;
  }

  public async load(): Promise<NextMealDisplaySnapshotV1> {
    if (!this.runOffThread) {
      const { projectPlanningSnapshot } = await import(
        './next-meal-display-cache'
      );
      return projectPlanningSnapshot(await this.core.load());
    }
    const profile = await this.browserOnboarding.load();
    if (!profile) throw new TypeError('Complete the starting profile first.');
    const loaded = await prepareNextMealInWorker({
      kind: 'LOCAL_LOAD',
      profile,
    });
    if (loaded.status !== 'SNAPSHOT')
      throw new TypeError('The saved local recommendation could not open.');
    return loaded.snapshot;
  }

  public select(runId: string, candidateKey: string): Promise<string> {
    return this.core.select(runId, candidateKey);
  }

  public logAsEaten(options: {
    readonly intentionId: string;
    readonly mealType: SaveMealInput['mealType'];
    readonly occurredAt: string;
    readonly edibleGrams: string;
  }): Promise<string> {
    return this.core.logAsEaten(options);
  }
}
