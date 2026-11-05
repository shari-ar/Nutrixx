import { BrowserNutritionStateStore } from './browser-nutrition-state';
import { BrowserOnboardingStore } from './browser-onboarding';
import { BrowserPlanningStore as InProcessPlanningStore } from './browser-planning-core';
import { BrowserStageTwoStore } from './browser-stage-two';
import {
  prepareNextMealInWorker,
  type NextMealPreparationProgressV1,
} from './next-meal-preparation-client';

import type { NextMealIntentionV1 } from './browser-planning-core';
import type { SaveMealInput } from './browser-stage-two';
import type { NextMealDisplaySnapshotV1 } from './next-meal-display-cache';
import type { DeclaredInventoryItemV1 } from './next-meal-input';
import type { NextMealCandidateExplanationV1 } from '@nutrixx/optimizer-engine';

export type {
  NextMealDisplayExplanationV1,
  NextMealDisplayRunV1,
  NextMealDisplaySnapshotV1,
} from './next-meal-display-cache';
export type LocalPlanningSnapshotV1 = NextMealDisplaySnapshotV1;

/** The UI only receives a compact outcome; the worker owns the full run. */
export class BrowserPlanningStore {
  private readonly core: InProcessPlanningStore;
  private recommendationController: AbortController | null = null;
  private loadController: AbortController | null = null;
  private readonly workerControllers = new Set<AbortController>();
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

  private startWorkerOperation(signal?: AbortSignal): {
    readonly controller: AbortController;
    readonly release: () => void;
  } {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener('abort', abort, { once: true });
    this.workerControllers.add(controller);
    return {
      controller,
      release: () => {
        signal?.removeEventListener('abort', abort);
        this.workerControllers.delete(controller);
      },
    };
  }

  public cancelActiveWorkers(): void {
    this.workerControllers.forEach((controller) => controller.abort());
    this.workerControllers.clear();
    this.recommendationController = null;
    this.loadController = null;
  }

  public async createRecommendation(
    options: {
      readonly inventory: readonly DeclaredInventoryItemV1[] | null;
    },
    onProgress?: (progress: NextMealPreparationProgressV1) => void,
    signal?: AbortSignal,
  ): Promise<
    Awaited<ReturnType<InProcessPlanningStore['createRecommendation']>>
  > {
    if (!this.runOffThread) return this.core.createRecommendation(options);
    this.recommendationController?.abort();
    this.loadController?.abort();
    const operation = this.startWorkerOperation(signal);
    const { controller } = operation;
    this.recommendationController = controller;
    try {
      const profile = await this.browserOnboarding.load();
      if (!profile) throw new TypeError('Complete the starting profile first.');
      const completed = await prepareNextMealInWorker(
        {
          kind: 'LOCAL_RECOMMENDATION',
          profile,
          inventory: options.inventory,
        },
        onProgress,
        controller.signal,
      );
      if (completed.status !== 'RECOMMENDATION')
        throw new TypeError('Local recommendation could not complete.');
      return completed.result;
    } finally {
      operation.release();
      if (this.recommendationController === controller)
        this.recommendationController = null;
    }
  }

  public async load(signal?: AbortSignal): Promise<NextMealDisplaySnapshotV1> {
    if (!this.runOffThread) {
      signal?.throwIfAborted();
      const { projectPlanningSnapshot } = await import(
        './next-meal-display-cache'
      );
      return projectPlanningSnapshot(await this.core.load());
    }
    this.loadController?.abort();
    const operation = this.startWorkerOperation(signal);
    const { controller } = operation;
    this.loadController = controller;
    try {
      const profile = await this.browserOnboarding.load();
      if (!profile) throw new TypeError('Complete the starting profile first.');
      const loaded = await prepareNextMealInWorker(
        {
          kind: 'LOCAL_LOAD',
          profile,
        },
        undefined,
        controller.signal,
      );
      if (loaded.status !== 'SNAPSHOT')
        throw new TypeError('The saved local recommendation could not open.');
      return loaded.snapshot;
    } finally {
      operation.release();
      if (this.loadController === controller) this.loadController = null;
    }
  }

  public async selectForDisplay(
    runId: string,
    candidateKey: string,
    onProgress?: (progress: NextMealPreparationProgressV1) => void,
    signal?: AbortSignal,
  ): Promise<NextMealIntentionV1> {
    if (!this.runOffThread) {
      signal?.throwIfAborted();
      return this.core.selectIntention(runId, candidateKey);
    }
    const operation = this.startWorkerOperation(signal);
    try {
      const profile = await this.browserOnboarding.load();
      if (!profile) throw new TypeError('Complete the starting profile first.');
      const completed = await prepareNextMealInWorker(
        {
          kind: 'LOCAL_SELECT',
          profile,
          runId,
          candidateKey,
        },
        onProgress,
        operation.controller.signal,
      );
      if (completed.status !== 'SELECTION')
        throw new TypeError('The selected recommendation could not be saved.');
      return completed.intention;
    } finally {
      operation.release();
    }
  }

  public async loadExplanation(
    runId: string,
    candidateKey: string,
    signal?: AbortSignal,
  ): Promise<NextMealCandidateExplanationV1> {
    if (!this.runOffThread) {
      signal?.throwIfAborted();
      return this.core.loadExplanation(runId, candidateKey);
    }
    const operation = this.startWorkerOperation(signal);
    try {
      const profile = await this.browserOnboarding.load();
      if (!profile) throw new TypeError('Complete the starting profile first.');
      const completed = await prepareNextMealInWorker(
        {
          kind: 'LOCAL_EXPLANATION',
          profile,
          runId,
          candidateKey,
        },
        undefined,
        operation.controller.signal,
      );
      if (completed.status !== 'EXPLANATION')
        throw new TypeError('The ranking explanation could not be loaded.');
      return completed.explanation;
    } finally {
      operation.release();
    }
  }

  public async select(runId: string, candidateKey: string): Promise<string> {
    return (await this.selectForDisplay(runId, candidateKey)).intentionId;
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
