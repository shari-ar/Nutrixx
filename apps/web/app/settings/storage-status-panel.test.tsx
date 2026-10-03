import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageStatusPanel } from './storage-status-panel';

const storage = vi.hoisted(() => ({
  clearAllLocalData: vi.fn(),
  downloadVerifiedLocalExport: vi.fn(),
  readBrowserStorageSnapshot: vi.fn(),
  requestBrowserPersistence: vi.fn(),
}));

vi.mock('@/lib/browser-storage', () => storage);

const snapshot = {
  authorityMode: 'Local',
  browserProfileScope: 'This browser profile',
  online: false,
  retention: 'best-effort',
  pressure: {
    state: 'warning',
    usageBytes: 75 * 1024 * 1024,
    quotaBytes: 100 * 1024 * 1024,
    availableBytes: 25 * 1024 * 1024,
    usageRatio: 0.75,
    requiredHeadroomBytes: 64 * 1024 * 1024,
  },
  canonicalSchemaVersion: 1,
  databaseSchemaVersion: 1,
  referenceCacheSchemaVersion: 1,
  activeReferenceRelease: 'foods-2026-10',
  lastVerifiedExportAt: null,
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  storage.readBrowserStorageSnapshot.mockResolvedValue(snapshot);
  storage.requestBrowserPersistence.mockResolvedValue('granted');
  storage.downloadVerifiedLocalExport.mockResolvedValue(undefined);
  storage.clearAllLocalData.mockResolvedValue(undefined);
});

describe('StorageStatusPanel', () => {
  it('shows local authority, offline readiness, pressure, and versions', async () => {
    render(<StorageStatusPanel />);

    expect(await screen.findByText('This browser profile only')).toBeVisible();
    expect(
      screen.getByText('Offline now · local data available'),
    ).toBeVisible();
    expect(screen.getByText('warning')).toBeVisible();
    expect(screen.getByText('foods-2026-10')).toBeVisible();
    expect(screen.getByText('No verified export yet')).toBeVisible();
  });

  it('requests persistence only after the user activates the control', async () => {
    render(<StorageStatusPanel />);
    const button = await screen.findByRole('button', { name: 'Protect data' });
    expect(storage.requestBrowserPersistence).not.toHaveBeenCalled();

    fireEvent.click(button);
    await waitFor(() =>
      expect(storage.requestBrowserPersistence).toHaveBeenCalledOnce(),
    );
    expect(
      await screen.findByText('Persistent storage was granted.'),
    ).toBeVisible();
  });

  it('exports on demand and requires a second explicit action before clear', async () => {
    render(<StorageStatusPanel />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Download verified export',
      }),
    );
    await waitFor(() =>
      expect(storage.downloadVerifiedLocalExport).toHaveBeenCalledOnce(),
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Review clear operation' }),
    );
    expect(storage.clearAllLocalData).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Permanently clear local data' }),
    );
    await waitFor(() =>
      expect(storage.clearAllLocalData).toHaveBeenCalledOnce(),
    );
    expect(
      await screen.findByText(
        'All Nutrixx local data was cleared from this browser.',
      ),
    ).toBeVisible();
  });
});
