import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  CatalogPublicationError,
  finalizeCatalogRelease,
} from './finalize-catalog-release.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fixture() {
  const repository = 'shari-ar/Nutrixx';
  const releaseId = 'food-catalog-nutrixx-test';
  const artifactName = `${releaseId}.v1.json.gz`;
  const receiptName = `${releaseId}.receipt.json`;
  const artifact = Buffer.from('catalog');
  const artifactSha256 = sha256(artifact);
  const receipt = Buffer.from(
    `${JSON.stringify({
      releaseId,
      artifactSha256,
      compressedByteLength: artifact.length,
    })}\n`,
  );
  const descriptor = {
    format: 'nutrixx.active-food-catalog',
    schemaVersion: 1,
    releaseId,
    artifactName,
    artifactSha256,
    compressedByteLength: artifact.length,
    candidateId: 'candidate',
    artifactUrl: `https://github.com/${repository}/releases/download/${releaseId}/${artifactName}`,
    receiptUrl: `https://github.com/${repository}/releases/download/${releaseId}/${receiptName}`,
    reviewedClaimCount: 1,
  };
  return {
    repository,
    releaseId,
    artifactName,
    receiptName,
    artifact,
    artifactSha256,
    receipt,
    descriptor,
  };
}

function finalizerGitHub(setup, calls, documentationConclusion = 'success') {
  return async (url, init = {}) => {
    const target = String(url);
    const method = init.method ?? 'GET';
    calls.push({ url: target, method });
    if (target.endsWith('/actions/runs/42'))
      return Response.json({
        event: 'pull_request',
        conclusion: 'success',
        head_sha: 'release-head',
      });
    if (target.endsWith('/actions/runs/42/pull_requests'))
      return Response.json([
        {
          number: 8,
          head: {
            ref: `catalog-release/${setup.releaseId}`,
            repo: { full_name: setup.repository },
          },
        },
      ]);
    if (target.endsWith('/pulls/8'))
      return Response.json({
        number: 8,
        state: 'open',
        base: { ref: 'main' },
        head: {
          ref: `catalog-release/${setup.releaseId}`,
          sha: 'release-head',
        },
        draft: true,
        node_id: 'pull-request-node',
      });
    if (target.includes('/pulls/8/files'))
      return Response.json([
        { filename: 'apps/web/config/active-food-catalog.json' },
        { filename: 'reference-data/nutrixx-curated/claims.v1.json' },
      ]);
    if (target.includes('/actions/runs?'))
      return Response.json({
        workflow_runs: [
          {
            name: 'Documentation',
            status: 'completed',
            conclusion: documentationConclusion,
          },
        ],
      });
    if (target.includes('/contents/apps/web/config/active-food-catalog.json'))
      return Response.json({
        content: Buffer.from(JSON.stringify(setup.descriptor)).toString(
          'base64',
        ),
      });
    if (target.includes('/releases/tags/'))
      return Response.json({
        id: 7,
        draft: true,
        html_url: 'https://github.test/releases/7',
        assets: [
          {
            name: setup.artifactName,
            size: setup.artifact.length,
            digest: `sha256:${setup.artifactSha256}`,
          },
          {
            name: setup.receiptName,
            size: setup.receipt.length,
            digest: `sha256:${sha256(setup.receipt)}`,
            url: 'https://api.github.test/receipt',
          },
        ],
      });
    if (target === 'https://api.github.test/receipt')
      return new Response(setup.receipt);
    if (target.endsWith('/releases/7') && method === 'PATCH')
      return Response.json({
        id: 7,
        draft: false,
        html_url: 'https://github.test/releases/7',
      });
    if (target === 'https://api.github.com/graphql' && method === 'POST')
      return Response.json({
        data: {
          markPullRequestReadyForReview: {
            pullRequest: { id: 'pull-request-node', isDraft: false },
          },
        },
      });
    if (target.endsWith('/pulls/8/merge') && method === 'PUT')
      return Response.json({ merged: true, sha: 'merged-sha' });
    if (
      target.includes('/git/refs/heads/catalog-release/') &&
      method === 'DELETE'
    )
      return new Response(null, { status: 204 });
    throw new Error(`Unexpected request: ${method} ${target}`);
  };
}

test('publishes verified assets before merging and removes the release branch', async () => {
  const setup = fixture();
  const calls = [];
  const result = await finalizeCatalogRelease({
    token: 'test-token',
    repository: setup.repository,
    workflowRunId: 42,
    fetcher: finalizerGitHub(setup, calls),
    sleep: async () => {},
  });
  assert.equal(result.releaseId, setup.releaseId);
  assert.equal(result.mergedCommitSha, 'merged-sha');
  const publishIndex = calls.findIndex(
    ({ url, method }) => url.endsWith('/releases/7') && method === 'PATCH',
  );
  const mergeIndex = calls.findIndex(
    ({ url, method }) => url.endsWith('/pulls/8/merge') && method === 'PUT',
  );
  const readyIndex = calls.findIndex(
    ({ url }) => url === 'https://api.github.com/graphql',
  );
  const deleteIndex = calls.findIndex(({ method }) => method === 'DELETE');
  assert.ok(publishIndex >= 0);
  assert.ok(readyIndex > publishIndex);
  assert.ok(mergeIndex > readyIndex);
  assert.ok(deleteIndex > mergeIndex);
});

test('keeps the draft Release unpublished when Documentation fails', async () => {
  const setup = fixture();
  const calls = [];
  await assert.rejects(
    finalizeCatalogRelease({
      token: 'test-token',
      repository: setup.repository,
      workflowRunId: 42,
      fetcher: finalizerGitHub(setup, calls, 'failure'),
      sleep: async () => {},
    }),
    (error) =>
      error instanceof CatalogPublicationError && error.statusCode === 409,
  );
  assert.equal(
    calls.some(
      ({ url, method }) => url.endsWith('/releases/7') && method === 'PATCH',
    ),
    false,
  );
  assert.equal(
    calls.some(
      ({ url, method }) => url.endsWith('/pulls/8/merge') && method === 'PUT',
    ),
    false,
  );
});
