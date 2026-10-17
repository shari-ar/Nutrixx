import { JsonValueSchema, canonicalizeJson } from '@nutrixx/canonical-schema';
import { getAdultDriBaselineReleaseV1 } from '@nutrixx/nutrition-engine';
import {
  NEXT_MEAL_RANKING_POLICY_VERSION_V1,
  nextMealSourceKey,
  type NextMealCandidateSource,
} from '@nutrixx/optimizer-engine';
import { sha256Canonical } from '@nutrixx/persistence-indexeddb';

import { NEXT_MEAL_DAILY_BASELINE_POLICY_VERSION_V1 } from './next-meal-input';
import { PLANNING_VIEW_DATABASE_NAME } from './storage-constants';

import type {
  LocalPlanningSnapshotV1,
  NextMealRunV1,
} from './browser-planning-core';

export { PLANNING_VIEW_DATABASE_NAME } from './storage-constants';

const STORE = 'views';

export interface NextMealDisplayRunV1 extends Omit<NextMealRunV1, 'input'> {
  readonly input: {
    readonly temporalRules: NextMealRunV1['input']['temporalRules'];
    readonly candidates: {
      readonly requestedAt: string;
      readonly entries: readonly NextMealCandidateSource[];
    };
  };
}

export type NextMealDisplaySnapshotV1 =
  LocalPlanningSnapshotV1<NextMealDisplayRunV1>;

interface StoredView {
  readonly owner: string;
  readonly sequence: number;
  readonly activeReleaseId: string | null;
  readonly policyKey: string;
  readonly snapshot: NextMealDisplaySnapshotV1;
  readonly digest: string;
}

export function currentPlanningViewPolicyKey(): string {
  const reference = getAdultDriBaselineReleaseV1();
  return [
    'display-v1',
    NEXT_MEAL_RANKING_POLICY_VERSION_V1,
    NEXT_MEAL_DAILY_BASELINE_POLICY_VERSION_V1,
    reference.releaseId,
    reference.policyVersion,
  ].join(':');
}

export function projectPlanningSnapshot(
  snapshot: LocalPlanningSnapshotV1,
): NextMealDisplaySnapshotV1 {
  if (!snapshot.run) return { ...snapshot, run: null };
  const run = snapshot.run;
  const rankedKeys = new Set(run.result.ranked.map((row) => row.candidateKey));
  return {
    ...snapshot,
    run: {
      ...run,
      input: {
        temporalRules: run.input.temporalRules,
        candidates: {
          requestedAt: run.input.candidates.requestedAt,
          entries: run.input.candidates.entries.filter((entry) =>
            rankedKeys.has(nextMealSourceKey(entry.reference)),
          ),
        },
      },
    },
  };
}

function openViewDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(PLANNING_VIEW_DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'owner' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function completion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function viewDigest(view: Omit<StoredView, 'digest'>): Promise<string> {
  return sha256Canonical(canonicalizeJson(JsonValueSchema.parse(view)));
}

/** A disposable projection. The canonical run and transaction log remain authoritative. */
export async function savePlanningView(
  factory: IDBFactory,
  view: Omit<StoredView, 'digest' | 'policyKey'>,
): Promise<void> {
  const value = { ...view, policyKey: currentPlanningViewPolicyKey() };
  const stored: StoredView = { ...value, digest: await viewDigest(value) };
  const database = await openViewDatabase(factory);
  try {
    const transaction = database.transaction(STORE, 'readwrite');
    const done = completion(transaction);
    try {
      await requestValue(transaction.objectStore(STORE).put(stored));
      await done;
    } catch (error) {
      await done.catch(() => undefined);
      throw error;
    }
  } finally {
    database.close();
  }
}

export async function readPlanningView(
  factory: IDBFactory,
  owner: string,
  sequence: number,
  activeReleaseId: string | null,
): Promise<NextMealDisplaySnapshotV1 | null> {
  try {
    const database = await openViewDatabase(factory);
    let stored: StoredView | undefined;
    try {
      const transaction = database.transaction(STORE, 'readonly');
      const done = completion(transaction);
      stored = await requestValue(
        transaction.objectStore(STORE).get(owner) as IDBRequest<
          StoredView | undefined
        >,
      );
      await done;
    } finally {
      database.close();
    }
    if (
      !stored ||
      stored.owner !== owner ||
      stored.sequence !== sequence ||
      stored.activeReleaseId !== activeReleaseId ||
      stored.policyKey !== currentPlanningViewPolicyKey() ||
      stored.digest !==
        (await viewDigest({
          owner: stored.owner,
          sequence: stored.sequence,
          activeReleaseId: stored.activeReleaseId,
          policyKey: stored.policyKey,
          snapshot: stored.snapshot,
        }))
    )
      return null;
    return stored.snapshot;
  } catch {
    return null;
  }
}
