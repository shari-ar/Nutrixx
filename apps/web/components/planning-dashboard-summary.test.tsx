import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PlanningDashboardSummary } from './planning-dashboard-summary';

describe('planning dashboard summary', () => {
  it('cancels its snapshot worker when the dashboard unmounts', () => {
    let receivedSignal: AbortSignal | undefined;
    const cancelActiveWorkers = vi.fn();
    const store = {
      load: (signal?: AbortSignal) => {
        receivedSignal = signal;
        return new Promise<never>(() => undefined);
      },
      cancelActiveWorkers,
    };

    const view = render(<PlanningDashboardSummary store={store} />);
    expect(receivedSignal?.aborted).toBe(false);
    view.unmount();

    expect(receivedSignal?.aborted).toBe(true);
    expect(cancelActiveWorkers).toHaveBeenCalledOnce();
  });
});
