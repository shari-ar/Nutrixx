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

function cancellationError(): Error {
  const error = new Error('The previous local planning request was replaced.');
  error.name = 'AbortError';
  return error;
}

/** Runs one bounded operation per worker so large catalog graphs are released immediately. */
export function prepareNextMealInWorker(
  request: NextMealPreparationRequestV1,
  onProgress?: (progress: NextMealPreparationProgressV1) => void,
  signal?: AbortSignal,
): Promise<NextMealPreparationResultV1> {
  const result = pending.then(() => {
    if (signal?.aborted) throw cancellationError();
    return new Promise<NextMealPreparationResultV1>((resolve, reject) => {
      const worker = new Worker(
        new URL('../workers/next-meal-preparation.worker.ts', import.meta.url),
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
      const fail = (message: string) =>
        finish(() => reject(new TypeError(message)));
      const abort = () => finish(() => reject(cancellationError()));
      const timer = setTimeout(
        () => fail('Local preparation exceeded its 90-second limit.'),
        90_000,
      );
      signal?.addEventListener('abort', abort, { once: true });
      worker.onmessage = (
        event: MessageEvent<NextMealPreparationMessageV1>,
      ) => {
        if (settled) return;
        const message = event.data;
        if (message.status === 'PROGRESS') {
          onProgress?.(message);
          return;
        }
        finish(() => resolve(message));
      };
      worker.onerror = () =>
        fail('The local preparation worker could not complete.');
      worker.postMessage(request);
    });
  });
  pending = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
