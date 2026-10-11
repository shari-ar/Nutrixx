import { getAdultDriBaselineReleaseV1 } from '@nutrixx/nutrition-engine';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { BrowserNutritionSnapshotV1 } from '@/lib/browser-nutrition-state';

import { NutritionWorkspace } from './nutrition-workspace';

const release = getAdultDriBaselineReleaseV1();
const proteinRule = release.rules.find(
  (rule) => rule.nutrientId === 'nutrient.protein' && rule.type === 'RDA',
)!;
const ironLimit = release.rules.find(
  (rule) =>
    rule.nutrientId === 'nutrient.iron' &&
    rule.type === 'UL' &&
    rule.population.minimumAgeYears <= 32 &&
    rule.population.maximumAgeYears >= 32,
)!;

function snapshot(options: {
  market: 'US' | null;
  incomplete?: boolean;
}): BrowserNutritionSnapshotV1 {
  const nutrient = {
    nutrientId: 'nutrient.protein',
    unit: 'g',
    knownRecordedSubtotal: '10',
    evidence: options.incomplete
      ? ('incomplete' as const)
      : ('known-for-recorded-meals' as const),
    contributingMeals: [
      {
        mealId: '10000000-0000-4000-8000-000000000002',
        revision: 1,
        amount: '10',
      },
    ],
    missingMealIds: options.incomplete
      ? ['10000000-0000-4000-8000-000000000003']
      : [],
    missingItemIds: options.incomplete
      ? ['10000000-0000-4000-8000-000000000004']
      : [],
    target:
      options.market === null
        ? ({
            status: 'NEEDS_INPUT' as const,
            fields: ['market'],
            reason: 'target-market-unconfirmed',
          } as const)
        : ({
            status: 'READY' as const,
            releaseId: release.releaseId,
            policyVersion: release.policyVersion,
            publicationStatus: 'provisional' as const,
            profileRevision: 1,
            rule: proteinRule,
            equivalentRuleIds: [proteinRule.ruleId],
          } as const),
    comparison:
      options.market === null || options.incomplete
        ? ('indeterminate' as const)
        : ('recorded-below-reference' as const),
    upperLimit: {
      status: 'OUT_OF_SCOPE' as const,
      reason: 'target-unavailable',
    },
    upperLimitComparison: 'indeterminate' as const,
    energyShareTarget: {
      status: 'OUT_OF_SCOPE' as const,
      reason: 'target-unavailable',
    },
    energyShareComparison: 'indeterminate' as const,
    limitationCodes: [],
  };
  const period = {
    periodId: 'today',
    zonePolicyVersion: 'test-v1',
    zoneSequence: 0,
    timeZone: 'UTC',
    localDate: '2026-10-10',
    startsAt: '2026-10-10T00:00:00.000Z',
    endsAt: '2026-10-11T00:00:00.000Z',
    travelAdjusted: false,
  };
  const day = {
    ruleVersion: 'recorded-intake-v1' as const,
    ownerSubjectId: '10000000-0000-4000-8000-000000000001',
    period,
    calculatedAt: '2026-10-10T12:00:00.000Z',
    status: 'PARTIAL' as const,
    recordedMealCount: 1,
    mealRevisions: [],
    targetReleaseId: release.releaseId,
    healthContextRevision: 1,
    nutrients: [nutrient],
    limitationCodes: [],
  };
  return {
    market: options.market,
    dayPolicy: {
      policyVersion: 'nutrition-day-zone-v1',
      initialTimeZone: 'UTC',
      changes: [],
    },
    deviceTimeZone: 'Asia/Tokyo',
    window: {
      current: day,
      completed: Array.from({ length: 7 }, (_, index) => ({
        ...day,
        period: {
          ...period,
          periodId: `completed-${index}`,
          localDate: `2026-10-0${index + 3}`,
        },
        recordedMealCount: 0,
      })),
      rolling: {
        ruleVersion: 'recorded-intake-v1',
        ownerSubjectId: day.ownerSubjectId,
        completedPeriodIds: [],
        status: 'PARTIAL',
        trends: [],
      },
      newSnapshotCount: 0,
    },
    meals: [],
  };
}

describe('nutrition workspace', () => {
  it('shows recorded values, then a real reference only after region selection', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(snapshot({ market: null }))
      .mockResolvedValueOnce(snapshot({ market: 'US' }));
    const selectMarket = vi.fn(async () => undefined);
    render(
      <NutritionWorkspace
        store={{
          load,
          selectMarket,
          scheduleTimeZoneChange: async () => undefined,
        }}
      />,
    );

    expect(await screen.findByText('10 g recorded')).toBeInTheDocument();
    expect(
      screen.getByText('Choose a reference region to see a target.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('82%')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: /daily reference/i }),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Reference region'), {
      target: { value: 'US' },
    });
    await waitFor(() => expect(selectMarket).toHaveBeenCalledWith('US'));
    expect(
      await screen.findByRole('img', { name: /daily reference/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/RDA .* National Academies/i)).toBeInTheDocument();
  });

  it('withholds percentage for incomplete meal composition', async () => {
    render(
      <NutritionWorkspace
        store={{
          load: async () => snapshot({ market: 'US', incomplete: true }),
          selectMarket: async () => undefined,
          scheduleTimeZoneChange: async () => undefined,
        }}
      />,
    );
    expect(await screen.findByText('10 g known subtotal')).toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: /daily reference/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Evidence, meals, and seven-day trend'));
    expect(screen.getByText(/missing composition/i)).toBeInTheDocument();
  });

  it('requires a review and explicit confirmation before scheduling the detected travel zone', async () => {
    const load = vi.fn(async () => snapshot({ market: 'US' }));
    const scheduleTimeZoneChange = vi.fn(async () => undefined);
    render(
      <NutritionWorkspace
        store={{
          load,
          selectMarket: async () => undefined,
          scheduleTimeZoneChange,
        }}
      />,
    );
    expect(await screen.findByText(/Device: Asia\/Tokyo/)).toBeInTheDocument();
    expect(scheduleTimeZoneChange).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Review time zone change' }),
    );
    expect(screen.getByText(/Earlier days stay/)).toBeInTheDocument();
    expect(scheduleTimeZoneChange).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Keep current time zone' }),
    );
    expect(scheduleTimeZoneChange).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Review time zone change' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm for next nutrition day' }),
    );
    await waitFor(() =>
      expect(scheduleTimeZoneChange).toHaveBeenCalledWith(
        'Asia/Tokyo',
        '2026-10-11T00:00:00.000Z',
      ),
    );
  });

  it('S3-UX-001 explains scope and exposes the source of an upper-limit observation', async () => {
    const initial = snapshot({ market: 'US' });
    const first = initial.window.current.nutrients[0]!;
    const observed: BrowserNutritionSnapshotV1 = {
      ...initial,
      window: {
        ...initial.window,
        current: {
          ...initial.window.current,
          nutrients: [
            {
              ...first,
              nutrientId: 'nutrient.iron',
              unit: 'mg',
              knownRecordedSubtotal: '46',
              upperLimit: {
                status: 'READY',
                releaseId: release.releaseId,
                policyVersion: release.policyVersion,
                publicationStatus: 'provisional',
                profileRevision: 1,
                rule: ironLimit,
                equivalentRuleIds: [ironLimit.ruleId],
              },
              upperLimitComparison: 'recorded-above-upper-limit',
            },
          ],
        },
      },
    };
    render(
      <NutritionWorkspace
        store={{
          load: async () => observed,
          selectMarket: async () => undefined,
          scheduleTimeZoneChange: async () => undefined,
        }}
      />,
    );
    expect(
      await screen.findByText(
        /general-wellness estimates describe only meals recorded/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Recorded amount above the applicable upper-limit/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText('Evidence, meals, and seven-day trend'));
    expect(
      screen.getByText(/Upper-limit reference: 45 mg per day/),
    ).toBeInTheDocument();
    expect(screen.getByText(/toxicity diagnosis/)).toBeInTheDocument();
  });
});
