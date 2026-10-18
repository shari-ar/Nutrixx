import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageStatusPanel } from './storage-status-panel';

const storage = vi.hoisted(() => ({
  applyReviewedEditableLocalFile: vi.fn(),
  clearAllLocalData: vi.fn(),
  downloadEditableLocalFile: vi.fn(),
  downloadVerifiedLocalExport: vi.fn(),
  identifyLocalFile: vi.fn(),
  inspectEditableLocalFile: vi.fn(),
  readBrowserStorageSnapshot: vi.fn(),
  requestBrowserPersistence: vi.fn(),
  inspectLocalExport: vi.fn(),
  restoreVerifiedLocalExport: vi.fn(),
}));

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => navigation }));

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
  storage.downloadEditableLocalFile.mockResolvedValue(undefined);
  storage.applyReviewedEditableLocalFile.mockResolvedValue([]);
  storage.clearAllLocalData.mockResolvedValue(undefined);
  storage.restoreVerifiedLocalExport.mockResolvedValue(undefined);
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

  it.each([
    { kind: 'editable-data', encrypted: false },
    { kind: 'editable-data', encrypted: true },
    { kind: 'complete-backup', encrypted: false },
    { kind: 'complete-backup', encrypted: true },
  ])(
    'exports $kind with encryption=$encrypted on demand',
    async ({ kind, encrypted }) => {
      render(<StorageStatusPanel />);
      if (kind === 'complete-backup') {
        fireEvent.click(
          await screen.findByRole('radio', { name: /Complete backup/ }),
        );
      } else {
        await screen.findByRole('radio', { name: /Editable data/ });
      }
      if (encrypted) {
        fireEvent.click(
          screen.getByRole('checkbox', { name: /Encrypt this file/ }),
        );
        fireEvent.change(screen.getByLabelText('File passphrase'), {
          target: { value: 'a private export passphrase' },
        });
        fireEvent.change(screen.getByLabelText('Confirm file passphrase'), {
          target: { value: 'a private export passphrase' },
        });
      }
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Download local file',
        }),
      );
      const expected = encrypted ? 'a private export passphrase' : undefined;
      await waitFor(() =>
        expect(
          kind === 'editable-data'
            ? storage.downloadEditableLocalFile
            : storage.downloadVerifiedLocalExport,
        ).toHaveBeenCalledWith(expected),
      );
      expect(
        kind === 'editable-data'
          ? storage.downloadVerifiedLocalExport
          : storage.downloadEditableLocalFile,
      ).not.toHaveBeenCalled();
    },
  );

  it('requires matching passphrases and a second explicit action before clear', async () => {
    render(<StorageStatusPanel />);
    await screen.findByRole('button', { name: 'Download local file' });
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Encrypt this file/ }),
    );
    fireEvent.change(screen.getByLabelText('File passphrase'), {
      target: { value: 'a private export passphrase' },
    });
    fireEvent.change(screen.getByLabelText('Confirm file passphrase'), {
      target: { value: 'different passphrase' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Download local file' }),
    );
    expect(
      await screen.findByText('The file passphrases do not match.'),
    ).toBeVisible();
    expect(storage.downloadEditableLocalFile).not.toHaveBeenCalled();

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

  it('verifies a complete backup, previews replacement, and restores only after confirmation', async () => {
    const preview = {
      artifact: {
        content: {
          manifest: {
            exportedAt: '2026-10-10T12:00:00.000Z',
            recordCount: 12,
            transactionCount: 15,
          },
        },
      },
      profileId: 'profile',
      ownerSubjectId: 'owner',
    };
    storage.identifyLocalFile.mockResolvedValue({
      kind: 'complete-backup',
      protection: 'plain',
    });
    storage.inspectLocalExport.mockResolvedValue(preview);
    render(<StorageStatusPanel />);
    const file = new File(['{}'], 'nutrixx-backup.json', {
      type: 'application/json',
    });
    fireEvent.change(await screen.findByLabelText('Nutrixx local JSON file'), {
      target: { files: [file] },
    });
    expect(storage.restoreVerifiedLocalExport).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Review file' }));
    expect(await screen.findByText(/12 records/)).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: 'Replace local data with this backup',
      }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /replaces all current local user data/,
      }),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Replace local data with this backup',
      }),
    );
    await waitFor(() =>
      expect(storage.restoreVerifiedLocalExport).toHaveBeenCalledWith(preview),
    );
    expect(navigation.replace).toHaveBeenCalledWith('/dashboard');
  });

  it('reviews editable additions and applies them only after confirmation', async () => {
    const preview = {
      file: { content: { manifest: { subjectId: 'owner' } } },
      targetWasEmpty: true,
      changes: [
        {
          kind: 'add',
          recordType: 'user-context.starting-profile',
          recordId: 'profile',
          afterPayload: { ageYears: 33 },
        },
      ],
    };
    storage.identifyLocalFile.mockResolvedValue({
      kind: 'editable-data',
      protection: 'plain',
    });
    storage.inspectEditableLocalFile.mockResolvedValue(preview);
    render(<StorageStatusPanel />);
    const file = new File(['{}'], 'editable.json', {
      type: 'application/json',
    });
    fireEvent.change(await screen.findByLabelText('Nutrixx local JSON file'), {
      target: { files: [file] },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Review file' }));
    expect(await screen.findByText('Review editable changes')).toBeVisible();
    expect(storage.applyReviewedEditableLocalFile).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Apply reviewed changes' }),
    );
    await waitFor(() =>
      expect(storage.applyReviewedEditableLocalFile).toHaveBeenCalledWith(
        preview,
      ),
    );
    expect(navigation.replace).toHaveBeenCalledWith('/dashboard');
  });

  it('requires deletion confirmation and blocks conflicting editable imports', async () => {
    storage.identifyLocalFile.mockResolvedValue({
      kind: 'editable-data',
      protection: 'plain',
    });
    storage.inspectEditableLocalFile.mockResolvedValue({
      targetWasEmpty: false,
      changes: [
        { kind: 'delete', recordType: 'food.custom-head', recordId: 'food' },
      ],
    });
    render(<StorageStatusPanel />);
    const file = new File(['{}'], 'editable.json', {
      type: 'application/json',
    });
    fireEvent.change(await screen.findByLabelText('Nutrixx local JSON file'), {
      target: { files: [file] },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Review file' }));
    expect(await screen.findByText('Review editable changes')).toBeVisible();
    const apply = screen.getByRole('button', {
      name: 'Apply reviewed changes',
    });
    expect(apply).toBeDisabled();
    fireEvent.click(
      screen.getByRole('checkbox', { name: /explicit deletion/ }),
    );
    expect(apply).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel review' }));
    storage.inspectEditableLocalFile.mockResolvedValue({
      targetWasEmpty: false,
      changes: [
        { kind: 'conflict', recordType: 'food.custom-head', recordId: 'food' },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review file' }));
    expect(await screen.findByText(/Resolve conflicts/)).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Apply reviewed changes' }),
    ).toBeDisabled();
  });

  it('requests a passphrase for encrypted files and leaves data untouched on failure', async () => {
    storage.identifyLocalFile.mockResolvedValue({
      kind: 'complete-backup',
      protection: 'password-encrypted',
    });
    storage.inspectLocalExport.mockRejectedValue(
      new Error(
        'The passphrase is incorrect or the encrypted file has changed.',
      ),
    );
    render(<StorageStatusPanel />);
    const file = new File(['{}'], 'backup-encrypted.json', {
      type: 'application/json',
    });
    fireEvent.change(await screen.findByLabelText('Nutrixx local JSON file'), {
      target: { files: [file] },
    });
    fireEvent.change(await screen.findByLabelText('File passphrase'), {
      target: { value: 'wrong passphrase' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review file' }));
    expect(
      await screen.findByText(
        'The passphrase is incorrect or the encrypted file has changed.',
      ),
    ).toBeVisible();
    expect(storage.restoreVerifiedLocalExport).not.toHaveBeenCalled();
  });
});
