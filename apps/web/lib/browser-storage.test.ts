import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LOCAL_USER_DATABASE_NAME,
  REFERENCE_CACHE_DATABASE_NAME,
  clearAllLocalData,
  downloadVerifiedLocalExport,
  readBrowserStorageSnapshot,
  requestBrowserPersistence,
} from './browser-storage';

const adapter = vi.hoisted(() => ({
  assessStoragePressure: vi.fn(),
  createCache: vi.fn(),
  createRepository: vi.fn(),
  deleteDatabase: vi.fn(),
  sha256Canonical: vi.fn(),
}));

vi.mock('@nutrixx/canonical-schema', () => ({
  verifyCanonicalRecordV1: vi.fn(),
}));

vi.mock('@nutrixx/persistence-indexeddb', () => ({
  INDEXED_DB_SCHEMA_VERSION: 1,
  REFERENCE_CACHE_SCHEMA_VERSION: 1,
  IndexedDbCanonicalRecordRepository: { create: adapter.createRepository },
  IndexedDbReferenceDatasetCache: { create: adapter.createCache },
  assessStoragePressure: adapter.assessStoragePressure,
  deleteIndexedDbDatabase: adapter.deleteDatabase,
  sha256Canonical: adapter.sha256Canonical,
}));

const assessment = {
  state: 'healthy',
  usageBytes: 10,
  quotaBytes: 100,
  availableBytes: 90,
  usageRatio: 0.1,
  requiredHeadroomBytes: 64 * 1024 * 1024,
} as const;

function setStorageManager(value: Partial<StorageManager>) {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('indexedDB', {});
  localStorage.clear();
  adapter.assessStoragePressure.mockReturnValue(assessment);
  adapter.createCache.mockResolvedValue({
    close: vi.fn(),
    listReleases: vi
      .fn()
      .mockResolvedValue([{ active: true, releaseId: 'foods-2026-10' }]),
  });
  adapter.deleteDatabase.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('browser storage service', () => {
  it('reads persistence, capacity, connectivity, and reference status', async () => {
    setStorageManager({
      estimate: vi.fn().mockResolvedValue({ quota: 100, usage: 10 }),
      persisted: vi.fn().mockResolvedValue(true),
    });
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });

    await expect(readBrowserStorageSnapshot()).resolves.toMatchObject({
      authorityMode: 'Local',
      online: false,
      retention: 'persistent',
      pressure: assessment,
      activeReferenceRelease: 'foods-2026-10',
      lastVerifiedExportAt: null,
    });
    expect(adapter.assessStoragePressure).toHaveBeenCalledWith({
      quota: 100,
      usage: 10,
    });
  });

  it('reports the explicit result of a user-initiated persistence request', async () => {
    const persist = vi.fn().mockResolvedValue(false);
    setStorageManager({ persist });

    await expect(requestBrowserPersistence()).resolves.toBe('denied');
    expect(persist).toHaveBeenCalledOnce();
  });

  it('downloads only a verified repository artifact and records the handoff', async () => {
    const close = vi.fn();
    adapter.createRepository.mockResolvedValue({
      close,
      exportLocalData: vi.fn().mockResolvedValue({
        manifest: { exportedAt: '2026-10-03T12:00:00.000Z' },
        records: [],
        transactions: [],
      }),
    });
    const createObjectURL = vi.fn(() => 'blob:nutrixx-export');
    const revokeObjectURL = vi.fn();
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: createObjectURL },
      revokeObjectURL: { configurable: true, value: revokeObjectURL },
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await downloadVerifiedLocalExport();

    expect(adapter.createRepository).toHaveBeenCalledWith(
      expect.objectContaining({ databaseName: LOCAL_USER_DATABASE_NAME }),
    );
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(localStorage.getItem('nutrixx:last-verified-export')).toBe(
      '2026-10-03T12:00:00.000Z',
    );
  });

  it('clears disposable reference data before canonical user data', async () => {
    localStorage.setItem('nutrixx:last-verified-export', 'old');

    await clearAllLocalData();

    expect(adapter.deleteDatabase).toHaveBeenNthCalledWith(
      1,
      indexedDB,
      REFERENCE_CACHE_DATABASE_NAME,
    );
    expect(adapter.deleteDatabase).toHaveBeenNthCalledWith(
      2,
      indexedDB,
      LOCAL_USER_DATABASE_NAME,
    );
    expect(localStorage.getItem('nutrixx:last-verified-export')).toBeNull();
  });
});
