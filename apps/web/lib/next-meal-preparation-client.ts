import type {
  NextMealIntentionV1,
  NextMealRankingChunkHintsV1,
} from './browser-planning-core';
import type { NextMealDisplaySnapshotV1 } from './next-meal-display-cache';
import type { DeclaredInventoryItemV1 } from './next-meal-input';
import type { NextMealCandidateExplanationV1 } from '@nutrixx/optimizer-engine';
import type { StartingProfileV1 } from '@nutrixx/user-context';

export type NextMealPreparationRequestV1 =
  | {
      readonly kind: 'LOCAL_RECOMMENDATION';
      readonly profile: StartingProfileV1;
      readonly inventory: readonly DeclaredInventoryItemV1[] | null;
      readonly rankingChunkHints?: NextMealRankingChunkHintsV1;
    }
  | { readonly kind: 'LOCAL_LOAD'; readonly profile: StartingProfileV1 }
  | {
      readonly kind: 'LOCAL_EXPLANATION';
      readonly profile: StartingProfileV1;
      readonly runId: string;
      readonly candidateKey: string;
    }
  | {
      readonly kind: 'LOCAL_SELECT';
      readonly profile: StartingProfileV1;
      readonly runId: string;
      readonly candidateKey: string;
    };

export interface NextMealPreparationProgressV1 {
  readonly status: 'PROGRESS';
  readonly stage:
    | 'clearing-prior-run'
    | 'loading-planning-inputs'
    | 'ranking-catalog'
    | 'classifying-catalog'
    | 'scoring-catalog'
    | 'saving-recommendation'
    | 'validating-selection'
    | 'saving-selection'
    | 'preparing-meal-form';
  readonly message: string;
  readonly processed?: number;
  readonly total?: number;
  readonly recommendedChunkSize?: number;
}

export type NextMealPreparationResultV1 =
  | {
      readonly status: 'RECOMMENDATION';
      readonly result:
        | { readonly status: 'READY'; readonly runId: string }
        | {
            readonly status: 'NEEDS_INPUT';
            readonly reasonCodes: readonly string[];
          };
    }
  | {
      readonly status: 'SNAPSHOT';
      readonly snapshot: NextMealDisplaySnapshotV1;
    }
  | {
      readonly status: 'EXPLANATION';
      readonly explanation: NextMealCandidateExplanationV1;
    }
  | {
      readonly status: 'SELECTION';
      readonly intention: NextMealIntentionV1;
    }
  | { readonly status: 'FAILED'; readonly reasonCode: string };

export type NextMealPreparationMessageV1 =
  | NextMealPreparationProgressV1
  | NextMealPreparationResultV1;

let pending = Promise.resolve();
const CHUNK_PROFILE_KEY = 'nutrixx:next-meal-chunk-profile:v1';
const MINIMUM_CHUNK_SIZE = 4;
const MAXIMUM_CHUNK_SIZE = 2_048;
const CHUNK_PROFILE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

interface StoredChunkProfileV1 {
  readonly schemaVersion: 1;
  readonly updatedAt: number;
  readonly classifying?: number;
  readonly scoring?: number;
}

function validChunkSize(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= MINIMUM_CHUNK_SIZE &&
    value <= MAXIMUM_CHUNK_SIZE
  );
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readStoredChunkProfile(storage: Storage): StoredChunkProfileV1 | null {
  try {
    const raw = storage.getItem(CHUNK_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed['schemaVersion'] !== 1) return null;
    const updatedAt = parsed['updatedAt'];
    if (
      typeof updatedAt !== 'number' ||
      !Number.isSafeInteger(updatedAt) ||
      updatedAt > Date.now() ||
      Date.now() - updatedAt > CHUNK_PROFILE_TTL_MS
    ) {
      storage.removeItem(CHUNK_PROFILE_KEY);
      return null;
    }
    const classifying = parsed['classifying'];
    const scoring = parsed['scoring'];
    if (
      (classifying !== undefined && !validChunkSize(classifying)) ||
      (scoring !== undefined && !validChunkSize(scoring))
    )
      return null;
    return {
      schemaVersion: 1,
      updatedAt,
      ...(classifying === undefined ? {} : { classifying }),
      ...(scoring === undefined ? {} : { scoring }),
    };
  } catch {
    return null;
  }
}

function initialChunkHints(): NextMealRankingChunkHintsV1 | undefined {
  const storage = browserStorage();
  if (!storage) return undefined;
  const profile = readStoredChunkProfile(storage);
  if (!profile) return undefined;
  const conservative = (size: number) =>
    Math.max(MINIMUM_CHUNK_SIZE, Math.floor(size / 2));
  return {
    ...(profile.classifying === undefined
      ? {}
      : { classifying: conservative(profile.classifying) }),
    ...(profile.scoring === undefined
      ? {}
      : { scoring: conservative(profile.scoring) }),
  };
}

function retainChunkRecommendation(
  stage: 'classifying-catalog' | 'scoring-catalog',
  size: number,
): void {
  if (!validChunkSize(size)) return;
  const storage = browserStorage();
  if (!storage) return;
  const current = readStoredChunkProfile(storage) ?? {
    schemaVersion: 1,
    updatedAt: Date.now(),
  };
  const phase = stage === 'classifying-catalog' ? 'classifying' : 'scoring';
  try {
    storage.setItem(
      CHUNK_PROFILE_KEY,
      JSON.stringify({ ...current, updatedAt: Date.now(), [phase]: size }),
    );
  } catch {
    // Performance hints are disposable; planning continues without persistence.
  }
}

function cancellationError(): Error {
  const error = new Error('The previous local planning request was replaced.');
  error.name = 'AbortError';
  return error;
}

/** Runs one bounded operation per worker so large catalog graphs are released immediately. */
export function prepareNextMealInWorker(
  request: NextMealPreparationRequestV1,
  onProgress?: (progress: NextMealPreparationProgressV1) => void,
  signal?: AbortSignal,
): Promise<NextMealPreparationResultV1> {
  const result = pending.then(() => {
    if (signal?.aborted) throw cancellationError();
    return new Promise<NextMealPreparationResultV1>((resolve, reject) => {
      const worker = new Worker(
        new URL('../workers/next-meal-preparation.worker.ts', import.meta.url),
        { type: 'module' },
      );
      let settled = false;
      const finish = (completion: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        worker.onmessage = null;
        worker.onerror = null;
        worker.terminate();
        completion();
      };
      const fail = (message: string) =>
        finish(() => reject(new TypeError(message)));
      const abort = () => finish(() => reject(cancellationError()));
      const timer = setTimeout(
        () => fail('Local preparation exceeded its 90-second limit.'),
        90_000,
      );
      signal?.addEventListener('abort', abort, { once: true });
      worker.onmessage = (
        event: MessageEvent<NextMealPreparationMessageV1>,
      ) => {
        if (settled) return;
        const message = event.data;
        if (message.status === 'PROGRESS') {
          if (
            (message.stage === 'classifying-catalog' ||
              message.stage === 'scoring-catalog') &&
            message.processed !== undefined &&
            message.processed > 0 &&
            message.recommendedChunkSize !== undefined
          )
            retainChunkRecommendation(
              message.stage,
              message.recommendedChunkSize,
            );
          onProgress?.(message);
          return;
        }
        finish(() => resolve(message));
      };
      worker.onerror = () =>
        fail('The local preparation worker could not complete.');
      const hints =
        request.kind === 'LOCAL_RECOMMENDATION'
          ? initialChunkHints()
          : undefined;
      worker.postMessage(
        request.kind === 'LOCAL_RECOMMENDATION' && hints
          ? { ...request, rankingChunkHints: hints }
          : request,
      );
    });
  });
  pending = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
