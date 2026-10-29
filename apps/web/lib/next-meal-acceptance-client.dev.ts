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

/** Starts the development-only full-catalog benchmark worker. */
export function measureNextMealAcceptanceInWorker(): Promise<NextMealAcceptanceResultV1> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/next-meal-acceptance.worker.dev.ts', import.meta.url),
      { type: 'module' },
    );
    const fail = (message: string) => {
      clearTimeout(timer);
      worker.terminate();
      reject(new TypeError(message));
    };
    const timer = setTimeout(
      () => fail('The acceptance worker exceeded its 90-second limit.'),
      90_000,
    );
    worker.onmessage = (event: MessageEvent<NextMealAcceptanceResultV1>) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = () => fail('The acceptance worker could not complete.');
    worker.postMessage({ kind: 'ACCEPTANCE' });
  });
}
