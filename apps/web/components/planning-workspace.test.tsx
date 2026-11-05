import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PlanningWorkspace } from './planning-workspace';

const planning = vi.hoisted(() => ({
  cancelActiveWorkers: vi.fn(),
  receivedSignals: [] as AbortSignal[],
}));

vi.mock('@/lib/browser-planning', () => ({
  BrowserPlanningStore: class {
    public load() {
      return Promise.resolve({
        run: null,
        fresh: false,
        intention: null,
        loggedMealId: null,
      });
    }

    public createRecommendation(
      _options: unknown,
      onProgress: (progress: { readonly message: string }) => void,
      signal: AbortSignal,
    ) {
      planning.receivedSignals.push(signal);
      onProgress({ message: 'Ranking catalog…' });
      return new Promise<never>((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            const error = new Error('Canceled');
            error.name = 'AbortError';
            reject(error);
          },
          { once: true },
        );
      });
    }

    public cancelActiveWorkers() {
      planning.cancelActiveWorkers();
    }
  },
}));

describe('planning workspace cancellation', () => {
  it('shows Cancel and aborts the active ranking operation', async () => {
    planning.cancelActiveWorkers.mockClear();
    planning.receivedSignals.length = 0;
    render(<PlanningWorkspace />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Find my next meal' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(planning.receivedSignals[0]?.aborted).toBe(true);
    expect(planning.cancelActiveWorkers).toHaveBeenCalled();
    expect(await screen.findByText('Operation canceled.')).toBeInTheDocument();
  });
});
