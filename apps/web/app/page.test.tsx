import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Home from './page';

describe('Home', () => {
  it('introduces the Nutrixx product', () => {
    render(<Home />);

    expect(
      screen.getByRole('heading', {
        name: /nutrition intelligence built around real life/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Nutrixx' })).toBeInTheDocument();
  });
});
