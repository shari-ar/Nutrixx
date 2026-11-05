import { JsonValueSchema, canonicalizeJson } from '@nutrixx/canonical-schema';
import { getAdultDriBaselineReleaseV1 } from '@nutrixx/nutrition-engine';
import {
  NEXT_MEAL_RANKING_POLICY_VERSION_V1,
  nextMealSourceKey,
  type NextMealCandidateExplanationV1,
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
const PLANNING_VIEW_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export type NextMealDisplayExplanationV1 = Omit<
  NextMealCandidateExplanationV1,
  'comparisons'
> & {
  readonly comparisonCount: number;
};

export type NextMealDisplayRunV1 = Omit<NextMealRunV1, 'explanations'> & {
  readonly explanations: readonly NextMealDisplayExplanationV1[];
};

export type NextMealDisplaySnapshotV1 =
  LocalPlanningSnapshotV1<NextMealDisplayRunV1>;

interface StoredView {
  readonly owner: string;
  readonly sequence: number;
  readonly activeReleaseId: string | null;
  readonly policyKey: string;
  readonly cachedAt: string;
  readonly expiresAt: string;
  readonly snapshot: NextMealDisplaySnapshotV1;
  readonly digest: string;
}

function currentPlanningViewPolicyKey(): string {
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
  if (!snapshot.run)
    return {
      run: null,
      fresh: snapshot.fresh,
      intention: snapshot.intention,
      loggedMealId: snapshot.loggedMealId,
    };
  const rankedKeys = new Set(
    snapshot.run.result.ranked.map((row) => row.candidateKey),
  );
  const nutrientIds = new Set(
    snapshot.run.input.temporalRules.map((rule) => rule.nutrientId),
  );
  return {
    ...snapshot,
    run: {
      ...snapshot.run,
      explanations: snapshot.run.explanations.map((entry) => {
        const existingCount =
          'comparisonCount' in entry ? entry.comparisonCount : undefined;
        const { comparisons, ...explanation } = entry;
        return {
          ...explanation,
          comparisonCount:
            typeof existingCount === 'number'
              ? existingCount
              : (comparisons?.length ?? 0),
        };
      }),
      input: {
        ...snapshot.run.input,
        candidates: {
          requestedAt: snapshot.run.input.candidates.requestedAt,
          entries: snapshot.run.input.candidates.entries
            .filter((candidate) =>
              rankedKeys.has(nextMealSourceKey(candidate.reference)),
            )
            .map((candidate) => ({
              reference: candidate.reference,
              displayName: candidate.displayName,
              preparationState: candidate.preparationState,
              nutrientsPer100EdibleGrams:
                candidate.nutrientsPer100EdibleGrams.filter((nutrient) =>
                  nutrientIds.has(nutrient.nutrientId),
                ),
            })),
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
  view: Omit<StoredView, 'digest' | 'policyKey' | 'cachedAt' | 'expiresAt'>,
  now = Date.now(),
): Promise<void> {
  const cachedAt = new Date(now).toISOString();
  const value = {
    ...view,
    policyKey: currentPlanningViewPolicyKey(),
    cachedAt,
    expiresAt: new Date(
      Date.parse(cachedAt) + PLANNING_VIEW_TTL_MS,
    ).toISOString(),
  };
  const stored: StoredView = { ...value, digest: await viewDigest(value) };
  const database = await openViewDatabase(factory);
  try {
    const transaction = database.transaction(STORE, 'readwrite');
    const done = completion(transaction);
    try {
      const store = transaction.objectStore(STORE);
      await requestValue(store.clear());
      await requestValue(store.put(stored));
      await done;
    } catch (error) {
      await done.catch(() => undefined);
      throw error;
    }
  } finally {
    database.close();
  }
}

async function deletePlanningViewIfUnchanged(
  factory: IDBFactory,
  stale: StoredView,
): Promise<void> {
  const database = await openViewDatabase(factory);
  try {
    const transaction = database.transaction(STORE, 'readwrite');
    const done = completion(transaction);
    const store = transaction.objectStore(STORE);
    try {
      const current = await requestValue(
        store.get(stale.owner) as IDBRequest<StoredView | undefined>,
      );
      if (
        current?.digest === stale.digest &&
        current.sequence === stale.sequence &&
        current.activeReleaseId === stale.activeReleaseId &&
        current.policyKey === stale.policyKey &&
        current.expiresAt === stale.expiresAt
      )
        await requestValue(store.delete(stale.owner));
      await done;
    } catch (error) {
      await done.catch(() => undefined);
      throw error;
    }
  } finally {
    database.close();
  }
}

/** Releases disposable planning projections before a catalog replacement. */
export async function clearPlanningViews(factory: IDBFactory): Promise<void> {
  const database = await openViewDatabase(factory);
  try {
    const transaction = database.transaction(STORE, 'readwrite');
    const done = completion(transaction);
    try {
      await requestValue(transaction.objectStore(STORE).clear());
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
  now = Date.now(),
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
    if (!stored) return null;
    const valid =
      stored.owner === owner &&
      stored.sequence === sequence &&
      stored.activeReleaseId === activeReleaseId &&
      stored.policyKey === currentPlanningViewPolicyKey() &&
      Number.isFinite(Date.parse(stored.expiresAt)) &&
      Date.parse(stored.expiresAt) > now &&
      stored.digest ===
        (await viewDigest({
          owner: stored.owner,
          sequence: stored.sequence,
          activeReleaseId: stored.activeReleaseId,
          policyKey: stored.policyKey,
          cachedAt: stored.cachedAt,
          expiresAt: stored.expiresAt,
          snapshot: stored.snapshot,
        }));
    if (!valid) {
      await deletePlanningViewIfUnchanged(factory, stored).catch(
        () => undefined,
      );
      return null;
    }
    return stored.snapshot;
  } catch {
    return null;
  }
}
