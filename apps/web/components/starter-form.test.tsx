import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StarterForm } from './starter-form';

import type { StartingProfileV1 } from '@nutrixx/user-context';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
}));

const profile: StartingProfileV1 = {
  profileId: '10000000-0000-4000-8000-000000000001',
  ownerSubjectId: '20000000-0000-4000-8000-000000000001',
  revision: 1,
  ageYears: 32,
  heightCentimeters: '172',
  weightKilograms: '68',
  physiologicalReference: 'female',
  primaryGoal: 'maintain',
  foodRestrictions: [],
  timeZone: 'America/New_York',
  adultConfirmedAt: '2026-10-04T10:00:00.000Z',
  createdAt: '2026-10-04T10:00:00.000Z',
  updatedAt: '2026-10-04T10:00:00.000Z',
};

beforeEach(() => {
  navigation.push.mockReset();
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: true,
  });
});

describe('StarterForm', () => {
  it('offers one accessible form containing only the essential starting fields', async () => {
    render(
      <StarterForm
        store={{ load: vi.fn().mockResolvedValue(null), save: vi.fn() }}
      />,
    );

    await screen.findByRole('form', { name: /nutrition starting profile/i });
    expect(screen.getByLabelText(/^age$/i)).toBeRequired();
    expect(screen.getByLabelText(/height/i)).toBeRequired();
    expect(screen.getByLabelText(/weight/i)).toBeRequired();
    expect(screen.getByLabelText(/physiological reference/i)).toBeRequired();
    expect(screen.getByLabelText(/primary goal/i)).toBeRequired();
    expect(screen.getByLabelText(/food restrictions/i)).not.toBeRequired();
  });

  it('collapses completed onboarding into a dashboard continuation', async () => {
    render(
      <StarterForm
        store={{ load: vi.fn().mockResolvedValue(profile), save: vi.fn() }}
      />,
    );

    expect(
      await screen.findByRole('link', { name: /continue to dashboard/i }),
    ).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('saves offline and opens the dashboard without a network request', async () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    const save = vi.fn().mockResolvedValue(profile);
    render(
      <StarterForm
        collapseWhenComplete={false}
        store={{ load: vi.fn().mockResolvedValue(null), save }}
      />,
    );
    const form = await screen.findByRole('form');
    fireEvent.change(screen.getByLabelText(/^age$/i), {
      target: { value: '32' },
    });
    fireEvent.change(screen.getByLabelText(/height/i), {
      target: { value: '172' },
    });
    fireEvent.change(screen.getByLabelText(/weight/i), {
      target: { value: '68' },
    });
    fireEvent.change(screen.getByLabelText(/physiological reference/i), {
      target: { value: 'female' },
    });
    fireEvent.change(screen.getByLabelText(/primary goal/i), {
      target: { value: 'maintain' },
    });
    fireEvent.submit(form);

    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(navigation.push).toHaveBeenCalledWith('/dashboard');
    expect(screen.getByText(/offline mode is active/i)).toBeInTheDocument();
  });

  it('preserves entered values and exposes recovery after a failed save', async () => {
    render(
      <StarterForm
        store={{
          load: vi.fn().mockResolvedValue(null),
          save: vi.fn().mockRejectedValue(new Error('storage blocked')),
        }}
      />,
    );
    const age = await screen.findByLabelText(/^age$/i);
    fireEvent.change(age, { target: { value: '40' } });
    fireEvent.submit(screen.getByRole('form'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /profile remains unchanged/i,
    );
    expect(age).toHaveValue(40);
    expect(
      screen.getByRole('link', { name: /open storage settings/i }),
    ).toHaveAttribute('href', '/settings');
  });
});
