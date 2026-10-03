import { describe, expect, it } from 'vitest';

import {
  MINIMUM_OPERATIONAL_HEADROOM_BYTES,
  assessStoragePressure,
} from './storage-status.js';

const MIB = 1024 * 1024;

describe('browser storage pressure policy', () => {
  it('reports unknown when the browser estimate is absent or invalid', () => {
    expect(assessStoragePressure(null)).toMatchObject({
      state: 'unknown',
      usageBytes: null,
      quotaBytes: null,
    });
    expect(assessStoragePressure({ usage: 10, quota: 0 }).state).toBe(
      'unknown',
    );
  });

  it('keeps the ADR-0006 minimum rollback and export headroom', () => {
    expect(
      assessStoragePressure({ usage: 100 * MIB, quota: 1024 * MIB }),
    ).toMatchObject({
      state: 'healthy',
      requiredHeadroomBytes: MINIMUM_OPERATIONAL_HEADROOM_BYTES,
    });
  });

  it('classifies warning and critical pressure deterministically', () => {
    expect(
      assessStoragePressure({ usage: 700 * MIB, quota: 1000 * MIB }).state,
    ).toBe('warning');
    expect(
      assessStoragePressure({ usage: 850 * MIB, quota: 1000 * MIB }).state,
    ).toBe('critical');
    expect(
      assessStoragePressure(
        { usage: 900 * MIB, quota: 1024 * MIB },
        { canonicalUserDataBytes: 128 * MIB, nextOperationBytes: 8 * MIB },
      ),
    ).toMatchObject({
      state: 'critical',
      requiredHeadroomBytes: 136 * MIB,
    });
  });

  it('rejects invalid operation estimates', () => {
    expect(() =>
      assessStoragePressure(
        { usage: 0, quota: 1024 * MIB },
        { nextOperationBytes: -1 },
      ),
    ).toThrow('nonnegative');
  });
});
