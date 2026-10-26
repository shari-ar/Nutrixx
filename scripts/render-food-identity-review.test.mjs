import assert from 'node:assert/strict';
import test from 'node:test';

import {
  emptyFoodIdentityReview,
  renderFoodIdentityReviewHtml,
} from './render-food-identity-review.mjs';

test('renders a separate nonblocking identity review list', () => {
  const review = emptyFoodIdentityReview(
    'food-catalog-test',
    '2026-10-25T00:00:00.000Z',
  );
  review.items.push({
    provider: 'future-source',
    sourceRecordId: '42',
    sourceName: 'Cucumber, unspecified',
    reason: 'Edible part is ambiguous.',
    candidateSourceRecords: [],
  });
  const html = renderFoodIdentityReviewHtml(review);

  assert.match(html, /1 ambiguous source records/u);
  assert.match(html, /Publication blocking: No/u);
  assert.match(html, /Cucumber, unspecified/u);
});
