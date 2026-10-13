import {
  rankNextMealCandidatesV1,
  reviewNextMealRankingV1,
  type NextMealRankingRequest,
  type NextMealRankingReviewV1,
} from '@nutrixx/optimizer-engine';

export type NextMealWorkerResultV1 =
  | Extract<NextMealRankingReviewV1, { status: 'APPROVED' }>
  | { readonly status: 'REJECTED'; readonly reasonCodes: readonly string[] };

export function computeNextMealV1(
  request: NextMealRankingRequest,
): NextMealWorkerResultV1 {
  return reviewNextMealRankingV1(request, rankNextMealCandidatesV1(request));
}

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<NextMealRankingRequest>) => void;
  postMessage: (result: NextMealWorkerResultV1) => void;
};

scope.onmessage = (event) => {
  try {
    scope.postMessage(computeNextMealV1(event.data));
  } catch {
    scope.postMessage({
      status: 'REJECTED',
      reasonCodes: ['next-meal-worker-error'],
    });
  }
};
