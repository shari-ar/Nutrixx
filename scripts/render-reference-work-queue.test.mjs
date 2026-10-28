import assert from 'node:assert/strict';
import test from 'node:test';

import { renderReferenceWorkQueueHtml } from './render-reference-work-queue.mjs';

test('renders the browser agent task-packet workflow', () => {
  const html = renderReferenceWorkQueueHtml();

  assert.match(html, /id="names-file"/u);
  assert.match(html, /id="create-packet"/u);
  assert.match(html, /fetch\('\/agent-task-packet'/u);
  assert.match(html, /agent-task-packet\.json/u);
  assert.match(html, /href="\/agent-prompt\.md" download/u);
  assert.match(html, /id="agent-result-file"/u);
  assert.match(html, /fetch\('\/agent-curation-runs'/u);
  assert.match(html, /followRun\(result\.runId\)/u);
  assert.match(html, /id="agent-run-report"/u);
  assert.match(html, /fetch\('\/agent-curation-runs\/latest'/u);
  assert.match(html, /Accepted/u);
  assert.match(html, /Rejected/u);
  assert.match(html, /Comparable cells/u);
  assert.match(html, /coverageSnapshot/u);
  assert.match(html, /id="publish-catalog"/u);
  assert.match(html, /fetch\('\/catalog-release'/u);
  assert.match(html, /Prepare catalog release/u);
  assert.match(html, /awaiting-ci/u);
  assert.match(html, /open pull request/u);
  assert.match(html, /window\.confirm/u);
  assert.match(html, /window\.location\.reload\(\)/u);
  assert.match(html, /Model Knowledge/u);
  assert.match(html, /validates the batch against the session base/u);
  assert.match(html, /advances the local draft/u);
  assert.match(html, /Local draft revision/u);
});
