import type { NextMealIntentionV1 } from './browser-planning-core';
import type { NextMealDisplaySnapshotV1 } from './next-meal-display-cache';
import type { DeclaredInventoryItemV1 } from './next-meal-input';
import type { StartingProfileV1 } from '@nutrixx/user-context';

export type NextMealPreparationRequestV1 =
  | {
      readonly kind: 'LOCAL_RECOMMENDATION';
      readonly profile: StartingProfileV1;
      readonly inventory: readonly DeclaredInventoryItemV1[] | null;
    }
  | { readonly kind: 'LOCAL_LOAD'; readonly profile: StartingProfileV1 }
  | {
      readonly kind: 'LOCAL_SELECT';
      readonly profile: StartingProfileV1;
      readonly runId: string;
      readonly candidateKey: string;
    };

export interface NextMealPreparationProgressV1 {
  readonly status: 'PROGRESS';
  readonly stage:
    | 'clearing-prior-run'
    | 'loading-planning-inputs'
    | 'ranking-catalog'
    | 'saving-recommendation'
    | 'validating-selection'
    | 'saving-selection'
    | 'preparing-meal-form';
  readonly message: string;
}

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
  | {
      readonly status: 'SNAPSHOT';
      readonly snapshot: NextMealDisplaySnapshotV1;
    }
  | {
      readonly status: 'SELECTION';
      readonly intention: NextMealIntentionV1;
    }
  | { readonly status: 'FAILED'; readonly reasonCode: string };

export type NextMealPreparationMessageV1 =
  | NextMealPreparationProgressV1
  | NextMealPreparationResultV1;

let pending = Promise.resolve();

/** Runs one bounded operation per worker so large catalog graphs are released immediately. */
export function prepareNextMealInWorker(
  request: NextMealPreparationRequestV1,
  onProgress?: (progress: NextMealPreparationProgressV1) => void,
): Promise<NextMealPreparationResultV1> {
  const result = pending.then(
    () =>
      new Promise<NextMealPreparationResultV1>((resolve, reject) => {
        const worker = new Worker(
          new URL(
            '../workers/next-meal-preparation.worker.ts',
            import.meta.url,
          ),
          { type: 'module' },
        );
        const fail = (message: string) => {
          clearTimeout(timer);
          worker.terminate();
          reject(new TypeError(message));
        };
        const timer = setTimeout(
          () => fail('Local preparation exceeded its 90-second limit.'),
          90_000,
        );
        worker.onmessage = (
          event: MessageEvent<NextMealPreparationMessageV1>,
        ) => {
          if (event.data.status === 'PROGRESS') {
            onProgress?.(event.data);
            return;
          }
          clearTimeout(timer);
          worker.terminate();
          resolve(event.data);
        };
        worker.onerror = () =>
          fail('The local preparation worker could not complete.');
        worker.postMessage(request);
      }),
  );
  pending = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
