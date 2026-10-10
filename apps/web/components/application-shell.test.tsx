import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApplicationShell } from './application-shell';

const navigation = vi.hoisted(() => ({
  pathname: '/meals',
  replace: vi.fn(),
  load: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
}));

vi.mock('@/lib/browser-onboarding', () => ({
  BrowserOnboardingStore: class {
    load = navigation.load;
  },
}));

vi.mock('@/components/navbar', () => ({
  Navbar: ({ onboardingComplete }: { onboardingComplete: boolean }) => (
    <nav>{onboardingComplete ? <span>Meals</span> : <span>Start</span>}</nav>
  ),
}));

beforeEach(() => {
  navigation.pathname = '/meals';
  navigation.load.mockReset();
  navigation.replace.mockReset();
});

describe('ApplicationShell', () => {
  it('keeps private routes unavailable until the starting profile exists', async () => {
    navigation.load.mockResolvedValueOnce(null);
    render(
      <ApplicationShell>
        <p>Private meal content</p>
      </ApplicationShell>,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      /starting your local profile/i,
    );
    expect(screen.queryByText('Private meal content')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('/start'),
    );
  });

  it('opens private navigation after the one-time profile is present', async () => {
    navigation.load.mockResolvedValueOnce({
      ownerSubjectId: 'profile-present',
    });
    render(
      <ApplicationShell>
        <p>Private meal content</p>
      </ApplicationShell>,
    );

    expect(await screen.findByText('Private meal content')).toBeInTheDocument();
    expect(screen.getByText('Meals')).toBeInTheDocument();
  });

  it('unlocks the dashboard immediately after the starting profile is saved', async () => {
    navigation.load.mockResolvedValueOnce(null);
    render(
      <ApplicationShell>
        <p>Private meal content</p>
      </ApplicationShell>,
    );

    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('/start'),
    );
    window.dispatchEvent(new Event('nutrixx:onboarding-profile-saved'));

    expect(await screen.findByText('Private meal content')).toBeInTheDocument();
    expect(screen.getByText('Meals')).toBeInTheDocument();
  });
});
