import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Home from './page';

vi.mock('@/components/starter-form', () => ({
  StarterForm: () => (
    <form aria-label="Nutrition starting profile">
      <button type="submit">Preview my dashboard</button>
    </form>
  ),
}));

describe('Home', () => {
  it('introduces the Nutrixx product', () => {
    render(<Home />);

    expect(
      screen.getByRole('heading', {
        name: /eat with clarity, not complexity/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('form', { name: /nutrition starting profile/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /preview my dashboard/i }),
    ).toBeInTheDocument();
  });
});
