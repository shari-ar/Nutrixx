import {
  prepareLocalCandidateSetV1,
  reviewLocalSearchDraftV1,
  searchLocalPlanV1,
  type CandidatePoolRequestV1,
  type LocalPlanReviewV1,
  type LocalSearchResultV1,
  type PlanningInputV1,
} from '@nutrixx/optimizer-engine';

export type LocalPlannerWorkerResultV1 =
  | {
      readonly status: 'APPROVED';
      readonly input: PlanningInputV1;
      readonly search: LocalSearchResultV1 & { status: 'DRAFT' };
      readonly review: LocalPlanReviewV1 & { status: 'APPROVED' };
    }
  | {
      readonly status: 'UNAVAILABLE';
      readonly reasonCodes: readonly string[];
    };

export function computeLocalPlanV1(
  request: CandidatePoolRequestV1,
  validatedAt: string,
): LocalPlannerWorkerResultV1 {
  const preparation = prepareLocalCandidateSetV1(request);
  if (preparation.status !== 'READY' || !preparation.preparedInput) {
    return { status: 'UNAVAILABLE', reasonCodes: preparation.reasonCodes };
  }
  const search = searchLocalPlanV1(preparation.preparedInput);
  if (search.status !== 'DRAFT') {
    return { status: 'UNAVAILABLE', reasonCodes: search.reasonCodes };
  }
  const review = reviewLocalSearchDraftV1(
    preparation.preparedInput,
    search,
    validatedAt,
  );
  if (review.status !== 'APPROVED') {
    return { status: 'UNAVAILABLE', reasonCodes: review.reasonCodes };
  }
  return {
    status: 'APPROVED',
    input: preparation.preparedInput,
    search,
    review,
  };
}

const workerScope = globalThis as unknown as {
  onmessage: (
    event: MessageEvent<{
      request: CandidatePoolRequestV1;
      validatedAt: string;
    }>,
  ) => void;
  postMessage: (message: LocalPlannerWorkerResultV1) => void;
};

workerScope.onmessage = (event) => {
  try {
    workerScope.postMessage(
      computeLocalPlanV1(event.data.request, event.data.validatedAt),
    );
  } catch {
    workerScope.postMessage({
      status: 'UNAVAILABLE',
      reasonCodes: ['planner-error'],
    });
  }
};
