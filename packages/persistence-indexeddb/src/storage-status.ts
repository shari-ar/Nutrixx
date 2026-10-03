export const MINIMUM_OPERATIONAL_HEADROOM_BYTES = 64 * 1024 * 1024;

export type StoragePressureState =
  | 'healthy'
  | 'warning'
  | 'critical'
  | 'unknown';

export interface BrowserStorageEstimate {
  readonly usage?: number;
  readonly quota?: number;
}

export interface StoragePressureAssessment {
  readonly state: StoragePressureState;
  readonly usageBytes: number | null;
  readonly quotaBytes: number | null;
  readonly availableBytes: number | null;
  readonly usageRatio: number | null;
  readonly requiredHeadroomBytes: number;
}

export interface StoragePressureOptions {
  readonly canonicalUserDataBytes?: number;
  readonly nextOperationBytes?: number;
}

function isNonnegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function assessStoragePressure(
  estimate: BrowserStorageEstimate | null,
  options: StoragePressureOptions = {},
): StoragePressureAssessment {
  const canonicalUserDataBytes = options.canonicalUserDataBytes ?? 0;
  const nextOperationBytes = options.nextOperationBytes ?? 0;
  if (
    !isNonnegativeFinite(canonicalUserDataBytes) ||
    !isNonnegativeFinite(nextOperationBytes)
  ) {
    throw new TypeError('Storage pressure inputs must be nonnegative numbers.');
  }

  const requiredHeadroomBytes =
    nextOperationBytes +
    Math.max(MINIMUM_OPERATIONAL_HEADROOM_BYTES, canonicalUserDataBytes);
  const usage = estimate?.usage;
  const quota = estimate?.quota;
  if (
    !isNonnegativeFinite(usage) ||
    !isNonnegativeFinite(quota) ||
    quota === 0 ||
    usage > quota
  ) {
    return {
      state: 'unknown',
      usageBytes: null,
      quotaBytes: null,
      availableBytes: null,
      usageRatio: null,
      requiredHeadroomBytes,
    };
  }

  const availableBytes = quota - usage;
  const usageRatio = usage / quota;
  let state: StoragePressureState = 'healthy';
  if (usageRatio >= 0.85 || availableBytes < requiredHeadroomBytes) {
    state = 'critical';
  } else if (
    usageRatio >= 0.7 ||
    (nextOperationBytes > 0 && availableBytes < nextOperationBytes * 2)
  ) {
    state = 'warning';
  }

  return {
    state,
    usageBytes: usage,
    quotaBytes: quota,
    availableBytes,
    usageRatio,
    requiredHeadroomBytes,
  };
}
