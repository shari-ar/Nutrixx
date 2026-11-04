export interface NextMealAcceptanceMeasurementV1 {
  readonly catalogEntries: number;
  readonly comparable: number;
  readonly comparisonNutrients: number;
  readonly artifactSha256: string;
  readonly loadMs: number;
  readonly mapMs: number;
  readonly inputMs: number;
  readonly workerSamplesMs: readonly number[];
  readonly workerP95Ms: number;
}

type NextMealAcceptanceResultV1 =
  | {
      readonly status: 'BENCHMARK';
      readonly measurement: NextMealAcceptanceMeasurementV1;
    }
  | { readonly status: 'FAILED'; readonly reasonCode: string };

function cancellationError(): Error {
  const error = new Error('The acceptance measurement was canceled.');
  error.name = 'AbortError';
  return error;
}

/** Starts the development-only full-catalog benchmark worker. */
export function measureNextMealAcceptanceInWorker(
  signal?: AbortSignal,
): Promise<NextMealAcceptanceResultV1> {
  if (signal?.aborted) return Promise.reject(cancellationError());
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/next-meal-acceptance.worker.dev.ts', import.meta.url),
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
      () => fail('The acceptance worker exceeded its 90-second limit.'),
      90_000,
    );
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<NextMealAcceptanceResultV1>) => {
      finish(() => resolve(event.data));
    };
    worker.onerror = () => fail('The acceptance worker could not complete.');
    worker.postMessage({ kind: 'ACCEPTANCE' });
  });
}
