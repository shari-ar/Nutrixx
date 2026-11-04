import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PaginationControls } from './pagination-controls';

describe('pagination controls', () => {
  it('moves through a bounded result page without accumulating prior rows', () => {
    const onPageChange = vi.fn();
    const { rerender } = render(
      <PaginationControls
        label="Ranked foods"
        onPageChange={onPageChange}
        pageIndex={0}
        pageSize={30}
        total={65}
      />,
    );

    expect(screen.getByText(/1–30 of 65/)).toHaveTextContent('Page 1 of 3');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(1);

    rerender(
      <PaginationControls
        label="Ranked foods"
        onPageChange={onPageChange}
        pageIndex={2}
        pageSize={30}
        total={65}
      />,
    );
    expect(screen.getByText(/61–65 of 65/)).toHaveTextContent('Page 3 of 3');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('omits controls when one page contains the complete result', () => {
    const { container } = render(
      <PaginationControls
        label="Ranked foods"
        onPageChange={() => undefined}
        pageIndex={0}
        pageSize={30}
        total={30}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
