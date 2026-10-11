import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { BrowserNutritionSnapshotV1 } from '@/lib/browser-nutrition-state';

import { NutritionDashboardSummary } from './nutrition-dashboard-summary';

describe('nutrition dashboard summary', () => {
  it('uses recorded meal and composition counts rather than preview values', async () => {
    const value = {
      market: null,
      window: {
        current: {
          recordedMealCount: 2,
          nutrients: [
            { evidence: 'known-for-recorded-meals' },
            { evidence: 'incomplete' },
          ],
        },
      },
    } as unknown as BrowserNutritionSnapshotV1;
    render(<NutritionDashboardSummary store={{ load: async () => value }} />);
    expect(
      await screen.findByText(/2 meal\(s\) recorded today/),
    ).toHaveTextContent('1 of 2 food components have complete composition');
    expect(screen.getByText(/Choose a reference region/i)).toBeInTheDocument();
  });
});
