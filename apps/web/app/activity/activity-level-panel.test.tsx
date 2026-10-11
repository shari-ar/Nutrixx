import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ActivityLevelPanel } from './activity-level-panel';

describe('activity level panel', () => {
  it('requests the optional category and then shows a sourced maintenance estimate', async () => {
    const selectActivityLevel = vi.fn(async () => undefined);
    const loadEnergyRequirement = vi
      .fn()
      .mockResolvedValueOnce({
        activityLevel: null,
        result: { status: 'NEEDS_INPUT', fields: ['activity-level'] },
      })
      .mockResolvedValueOnce({
        activityLevel: 'low',
        result: {
          status: 'READY',
          ruleVersion: 'nasem-eer-2023-v1',
          source: {
            authority: 'National Academies',
            edition: '2023',
            url: 'https://www.nationalacademies.org/read/26818/chapter/7',
          },
          activityLevel: 'low',
          maintenanceKilocaloriesPerDay: { minimum: 2050, maximum: 2050 },
          limitationCodes: [],
        },
      });
    render(
      <ActivityLevelPanel
        store={{ loadEnergyRequirement, selectActivityLevel }}
      />,
    );
    expect(
      await screen.findByText(/Choose an activity category/),
    ).toBeVisible();
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Activity category' }),
      {
        target: { value: 'low' },
      },
    );
    await waitFor(() =>
      expect(selectActivityLevel).toHaveBeenCalledWith('low'),
    );
    expect(await screen.findByText(/2050 kcal\/day/)).toBeVisible();
    expect(
      screen.getByRole('link', { name: /National Academies/ }),
    ).toHaveAttribute(
      'href',
      'https://www.nationalacademies.org/read/26818/chapter/7',
    );
  });
});
