import { afterEach, describe, expect, it, vi } from 'vitest';

import { measureNextMealAcceptanceInWorker } from './next-meal-acceptance-client.dev';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('development next-meal acceptance worker', () => {
  it('terminates immediately when its workspace aborts the measurement', async () => {
    let terminated = 0;
    class WorkerStub {
      public onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
      public onerror: ((event: ErrorEvent) => void) | null = null;

      public postMessage(): void {}

      public terminate(): void {
        terminated += 1;
      }
    }
    vi.stubGlobal('Worker', WorkerStub);
    const controller = new AbortController();
    const measurement = measureNextMealAcceptanceInWorker(controller.signal);
    controller.abort();
    await expect(measurement).rejects.toMatchObject({ name: 'AbortError' });
    expect(terminated).toBe(1);
  });
});
