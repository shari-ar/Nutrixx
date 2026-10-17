import type { LocalPlanningSnapshotV1 } from './browser-planning-core';
import type { DeclaredInventoryItemV1 } from './next-meal-input';
import type { StartingProfileV1 } from '@nutrixx/user-context';

export type NextMealPreparationRequestV1 =
  | {
      readonly kind: 'LOCAL_RECOMMENDATION';
      readonly profile: StartingProfileV1;
      readonly inventory: readonly DeclaredInventoryItemV1[] | null;
    }
  | { readonly kind: 'LOCAL_LOAD'; readonly profile: StartingProfileV1 }
  | { readonly kind: 'ACCEPTANCE' };

export type NextMealPreparationResultV1 =
  | {
      readonly status: 'RECOMMENDATION';
      readonly result:
        | { readonly status: 'READY'; readonly runId: string }
        | {
            readonly status: 'NEEDS_INPUT';
            readonly reasonCodes: readonly string[];
          };
    }
  | { readonly status: 'SNAPSHOT'; readonly snapshot: LocalPlanningSnapshotV1 }
  | {
      readonly status: 'BENCHMARK';
      readonly measurement: {
        readonly catalogEntries: number;
        readonly comparable: number;
        readonly comparisonNutrients: number;
        readonly artifactSha256: string;
        readonly loadMs: number;
        readonly mapMs: number;
        readonly inputMs: number;
        readonly workerSamplesMs: readonly number[];
        readonly workerP95Ms: number;
      };
    }
  | { readonly status: 'FAILED'; readonly reasonCode: string };

/** Keeps catalog preparation, ranking, review, and persistence off the UI thread. */
export function prepareNextMealInWorker(
  request: NextMealPreparationRequestV1,
): Promise<NextMealPreparationResultV1> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/next-meal-preparation.worker.ts', import.meta.url),
      { type: 'module' },
    );
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new TypeError('Local preparation exceeded its 90-second limit.'));
    }, 90_000);
    worker.onmessage = (event: MessageEvent<NextMealPreparationResultV1>) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      reject(new TypeError('The local preparation worker could not complete.'));
    };
    worker.postMessage(request);
  });
}
