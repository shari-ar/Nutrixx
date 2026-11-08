import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type {
  NextMealDisplayExplanationV1,
  NextMealDisplayRunV1,
} from '@/lib/browser-planning';

import {
  NextMealExplanation,
  NextMealRunOverview,
} from './next-meal-explanation';

import type {
  NextMealCandidateExplanationV1,
  NextMealCompactRankingResultV1,
} from '@nutrixx/optimizer-engine';

const ruleId = 'iron-current-day';
const candidateKey =
  'food:fixture-release:00000000-0000-4000-8000-000000000001:1';
const mealId = '00000000-0000-4000-8000-000000000010';
const citation = {
  authority: 'National Academies',
  title: 'Dietary Reference Intakes',
  edition: '2026',
  url: 'https://example.org/reference',
  relevantSection: 'Iron reference table',
};
const row = {
  candidateKey,
  rank: 1,
  score: { numerator: '1', denominator: '2' },
} satisfies NextMealCompactRankingResultV1['ranked'][number];
const explanation = {
  candidateKey,
  classification: 'COMPARABLE',
  displayName: 'Test food',
  reasonCodes: ['validated-comparable'],
  comparisons: [
    {
      ruleId,
      nutrientId: 'nutrient.iron',
      unit: { system: 'ucum', code: 'mg' },
      windowStartInclusive: '2026-10-12T00:00:00.000Z',
      windowEndExclusive: '2026-10-13T00:00:00.000Z',
      targetAmount: '18',
      targetMode: 'minimum',
      referenceType: 'rda',
      referenceReleaseId: 'fixture-reference-release',
      recordedAmount: { numerator: '2', denominator: '1' },
      projectedAmount: { numerator: '9', denominator: '1' },
      normalizedDistance: { numerator: '1', denominator: '2' },
      acceptedMealIds: [mealId],
    },
  ],
} as NextMealCandidateExplanationV1;
const summary = {
  candidateKey,
  classification: 'COMPARABLE',
  displayName: 'Test food',
  reasonCodes: ['validated-comparable'],
  comparisonCount: 1,
} satisfies NextMealDisplayExplanationV1;

function run(provisional = false): NextMealDisplayRunV1 {
  return {
    validUntil: '2026-10-12T12:15:00.000Z',
    input: {
      planningPolicy: {
        policyVersion: 'next-meal-hierarchical-robust-v1',
        horizonDays: 3,
        opportunitiesPerDay: 3,
        continuationCandidateLimit: 12,
        continuationPortfolioSize: 8,
        robustScenarios: [
          { scenarioId: 'expected-schedule', missedFutureOpportunities: 0 },
          { scenarioId: 'one-opportunity-lost', missedFutureOpportunities: 1 },
        ],
      },
      candidates: {
        requestedAt: '2026-10-12T12:00:00.000Z',
        entries: [
          {
            reference: {
              kind: 'food',
              catalogReleaseId: 'fixture-release',
              foodId: '00000000-0000-4000-8000-000000000001',
              foodRevision: 1,
            },
            nutrientsPer100EdibleGrams: [
              {
                state: 'known',
                nutrientId: 'nutrient.iron',
                source: {
                  kind: 'dataset',
                  sourceId: 'fixture-food-data',
                  sourceVersion: '1',
                  sourceRecordId: 'food-1',
                },
              },
            ],
          },
        ],
      },
      temporalRules: [{ ruleId, weight: 1 }],
    },
    result: { ranked: [row] },
    temporalPolicy: {
      rules: [
        {
          ruleId,
          ruleVersion: 'fixture-v1',
          window: { basis: 'nutrition-day', periodCount: 1 },
          aggregation: 'sum',
          reference: { citation },
          horizonCitation: citation,
          limitations: 'This rule compares recorded intake.',
        },
      ],
    },
    appliedTemporalRules: [
      {
        ruleId,
        decision: provisional
          ? 'PROVISIONAL_SHORT_HISTORY'
          : 'FULL_HORIZON_AVAILABLE',
        configuredWindowStartInclusive: provisional
          ? '2026-10-11T00:00:00.000Z'
          : '2026-10-12T00:00:00.000Z',
      },
    ],
  } as unknown as NextMealDisplayRunV1;
}

describe('next-meal explanation', () => {
  it('shows a concise ranking summary and traceable nutrient, time, and sources', async () => {
    const current = run();
    const loadExplanation = vi.fn().mockResolvedValue(explanation);
    render(
      <>
        <NextMealRunOverview run={current} />
        <NextMealExplanation
          explanation={summary}
          loadExplanation={loadExplanation}
          row={row}
          run={current}
        />
      </>,
    );
    expect(screen.getByText(/one upcoming meal/)).toBeInTheDocument();
    expect(
      screen.getByText(/logged everything you consumed/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Rank 1 of 1 comparable options/),
    ).toHaveTextContent('combined target gap 0.5');
    expect(screen.queryByText(/Recorded 2 → projected 9 mg/)).toBeNull();
    expect(loadExplanation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Why this rank?'));
    expect(
      await screen.findByText(/Recorded 2 → projected 9 mg/),
    ).toHaveTextContent('Relative target gap: 50%. Weight in combined gap: 1.');
    expect(screen.getByText(/Applied window:/)).toHaveTextContent(
      '2026-10-12 00:00:00.000 UTC',
    );
    expect(
      screen.getByRole('link', { name: `Meal ${mealId}` }),
    ).toHaveAttribute('href', `/meals/${mealId}`);
    expect(screen.getAllByRole('link', { name: 'Open source' })).toHaveLength(
      2,
    );
    expect(screen.getByText(/Food composition:/)).toHaveTextContent(
      'fixture-food-data, version 1, record food-1',
    );
    expect(loadExplanation).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Why this rank?'));
    fireEvent.click(screen.getByText('Why this rank?'));
    expect(loadExplanation).toHaveBeenCalledTimes(1);
  });

  it('labels a provisional span and shows its configured start', async () => {
    const current = run(true);
    const loadExplanation = vi.fn().mockResolvedValue(explanation);
    render(
      <>
        <NextMealRunOverview run={current} />
        <NextMealExplanation
          explanation={summary}
          loadExplanation={loadExplanation}
          row={row}
          run={current}
        />
      </>,
    );
    expect(screen.getByText(/shorter recorded history/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Why this rank?'));
    expect(await screen.findByText(/Short history:/)).toHaveTextContent(
      '2026-10-11 00:00:00.000 UTC',
    );
  });

  it('aborts an unfinished explanation worker when its result row unmounts', async () => {
    let receivedSignal: AbortSignal | undefined;
    const loadExplanation = vi.fn((signal: AbortSignal) => {
      receivedSignal = signal;
      return new Promise<NextMealCandidateExplanationV1>((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            const error = new Error('The explanation request was replaced.');
            error.name = 'AbortError';
            reject(error);
          },
          { once: true },
        );
      });
    });
    const rendered = render(
      <NextMealExplanation
        explanation={summary}
        loadExplanation={loadExplanation}
        row={row}
        run={run()}
      />,
    );
    fireEvent.click(screen.getByText('Why this rank?'));
    await waitFor(() => expect(loadExplanation).toHaveBeenCalledOnce());
    expect(receivedSignal?.aborted).toBe(false);
    rendered.unmount();
    expect(receivedSignal?.aborted).toBe(true);
  });

  it('aborts unfinished evidence when the disclosure closes and restarts on reopen', async () => {
    const receivedSignals: AbortSignal[] = [];
    const loadExplanation = vi.fn((signal: AbortSignal) => {
      receivedSignals.push(signal);
      return new Promise<NextMealCandidateExplanationV1>((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            const error = new Error('The explanation disclosure closed.');
            error.name = 'AbortError';
            reject(error);
          },
          { once: true },
        );
      });
    });
    const rendered = render(
      <NextMealExplanation
        explanation={summary}
        loadExplanation={loadExplanation}
        row={row}
        run={run()}
      />,
    );
    const disclosure = screen.getByText('Why this rank?');
    fireEvent.click(disclosure);
    await waitFor(() => expect(loadExplanation).toHaveBeenCalledOnce());
    fireEvent.click(disclosure);
    await waitFor(() => expect(receivedSignals[0]?.aborted).toBe(true));
    fireEvent.click(disclosure);
    await waitFor(() => expect(loadExplanation).toHaveBeenCalledTimes(2));
    expect(receivedSignals[1]?.aborted).toBe(false);
    rendered.unmount();
    expect(receivedSignals[1]?.aborted).toBe(true);
  });
});
