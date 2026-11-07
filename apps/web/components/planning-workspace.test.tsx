import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PlanningWorkspace } from './planning-workspace';

const planning = vi.hoisted(() => ({
  cancelActiveWorkers: vi.fn(),
  createRecommendation: vi.fn(),
  load: vi.fn(),
  logAsEaten: vi.fn(),
  recommendationIsPending: true,
  receivedSignals: [] as AbortSignal[],
}));

vi.mock('@/lib/browser-planning', () => ({
  BrowserPlanningStore: class {
    public load() {
      return planning.load();
    }

    public createRecommendation(
      _options: unknown,
      onProgress: (progress: { readonly message: string }) => void,
      signal: AbortSignal,
    ) {
      planning.receivedSignals.push(signal);
      onProgress({ message: 'Ranking catalog…' });
      planning.createRecommendation();
      if (!planning.recommendationIsPending)
        return Promise.resolve({ status: 'READY', runId: 'recalculated-run' });
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

    public logAsEaten() {
      planning.logAsEaten();
      return Promise.resolve('00000000-0000-4000-8000-000000000010');
    }
  },
}));

function selectedSnapshot() {
  const candidateKey =
    'food:fixture-release:00000000-0000-4000-8000-000000000001:1';
  return {
    fresh: true,
    loggedMealId: null,
    intention: {
      intentionId: '00000000-0000-4000-8000-000000000020',
      candidateKey,
    },
    run: {
      runId: 'fixture-run',
      validUntil: new Date(Date.now() + 60_000).toISOString(),
      input: {
        planningPolicy: {
          horizonDays: 3,
          opportunitiesPerDay: 3,
          robustScenarios: [
            { scenarioId: 'expected-schedule', missedFutureOpportunities: 0 },
            {
              scenarioId: 'one-opportunity-lost',
              missedFutureOpportunities: 1,
            },
          ],
        },
        candidates: { requestedAt: '2026-10-12T12:00:00.000Z' },
        temporalRules: [{ ruleId: 'iron-current-day' }],
      },
      appliedTemporalRules: [
        {
          ruleId: 'iron-current-day',
          decision: 'FULL_HORIZON_AVAILABLE',
        },
      ],
      result: {
        processed: 1,
        total: 1,
        ranked: [
          {
            candidateKey,
            rank: 1,
            score: { numerator: '1', denominator: '2' },
          },
        ],
      },
      explanations: [
        {
          candidateKey,
          classification: 'COMPARABLE',
          displayName: 'Test food',
          reasonCodes: ['validated-comparable'],
          edibleGrams: '100',
          comparisonCount: 0,
        },
      ],
    },
  };
}

describe('planning workspace cancellation', () => {
  it('shows Cancel and aborts the active ranking operation', async () => {
    planning.recommendationIsPending = true;
    planning.load.mockResolvedValue({
      run: null,
      fresh: false,
      intention: null,
      loggedMealId: null,
    });
    planning.cancelActiveWorkers.mockClear();
    planning.createRecommendation.mockClear();
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

  it('recalculates immediately after the actual meal is recorded', async () => {
    planning.recommendationIsPending = false;
    planning.load.mockResolvedValue(selectedSnapshot());
    planning.createRecommendation.mockClear();
    planning.logAsEaten.mockClear();
    render(<PlanningWorkspace />);

    fireEvent.change(await screen.findByLabelText('Actual edible grams'), {
      target: { value: '85' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record as eaten' }));

    await waitFor(() => expect(planning.logAsEaten).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(planning.createRecommendation).toHaveBeenCalledOnce(),
    );
    expect(
      await screen.findByText(/Your next recommendation is ready\./),
    ).toBeInTheDocument();
  });
});
