import type { NextMealDisplaySnapshotV1 } from './next-meal-display-cache';
import type { DeclaredInventoryItemV1 } from './next-meal-input';
import type { StartingProfileV1 } from '@nutrixx/user-context';

export type NextMealPreparationRequestV1 =
  | {
      readonly kind: 'LOCAL_RECOMMENDATION';
      readonly profile: StartingProfileV1;
      readonly inventory: readonly DeclaredInventoryItemV1[] | null;
    }
  | { readonly kind: 'LOCAL_LOAD'; readonly profile: StartingProfileV1 };

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
  | { readonly status: 'FAILED'; readonly reasonCode: string };

let sharedWorker: Worker | null = null;
let pending = Promise.resolve();
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/** Keeps the mapped catalog alive across requests in the same page. */
export function prepareNextMealInWorker(
  request: NextMealPreparationRequestV1,
): Promise<NextMealPreparationResultV1> {
  const result = pending.then(
    () =>
      new Promise<NextMealPreparationResultV1>((resolve, reject) => {
        if (idleTimer !== null) clearTimeout(idleTimer);
        idleTimer = null;
        const worker =
          sharedWorker ??
          new Worker(
            new URL(
              '../workers/next-meal-preparation.worker.ts',
              import.meta.url,
            ),
            { type: 'module' },
          );
        sharedWorker = worker;
        const fail = (message: string) => {
          clearTimeout(timer);
          worker.terminate();
          if (sharedWorker === worker) sharedWorker = null;
          reject(new TypeError(message));
        };
        const timer = setTimeout(
          () => fail('Local preparation exceeded its 90-second limit.'),
          90_000,
        );
        worker.onmessage = (
          event: MessageEvent<NextMealPreparationResultV1>,
        ) => {
          clearTimeout(timer);
          if (event.data.status === 'FAILED') {
            worker.terminate();
            if (sharedWorker === worker) sharedWorker = null;
            resolve(event.data);
            return;
          }
          idleTimer = setTimeout(() => {
            if (sharedWorker === worker) {
              worker.terminate();
              sharedWorker = null;
            }
            idleTimer = null;
          }, 120_000);
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
