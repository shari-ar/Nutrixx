import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardShell } from './dashboard-shell';

import type { StartingProfileV1 } from '@nutrixx/user-context';

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
}));

vi.mock('@/components/catalog-installer', () => ({
  CatalogInstaller: () => <section aria-label="Offline food knowledge" />,
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

beforeEach(() => navigation.replace.mockReset());

describe('DashboardShell', () => {
  it('opens the four focused areas after the starting profile exists', async () => {
    render(
      <DashboardShell store={{ load: vi.fn().mockResolvedValue(profile) }} />,
    );
    const overview = await screen.findByRole('region', {
      name: /daily overview/i,
    });
    const destinations = within(overview)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    expect(destinations).toEqual([
      '/meals',
      '/nutrition',
      '/activity',
      '/hydration',
    ]);
    expect(screen.getByText('Maintain weight')).toBeInTheDocument();
  });

  it('returns a first-time visitor to the one-time starting profile', async () => {
    render(
      <DashboardShell store={{ load: vi.fn().mockResolvedValue(null) }} />,
    );
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('/start'),
    );
  });

  it('shows retry and storage recovery when local data cannot be opened', async () => {
    render(
      <DashboardShell
        store={{ load: vi.fn().mockRejectedValue(new Error('blocked')) }}
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /profile remains in this browser/i,
    );
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /storage settings/i }),
    ).toHaveAttribute('href', '/settings');
  });
});
