import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_GITHUB_REPOSITORY } from '@nutrixx/config/application';

import {
  CatalogPublicationError,
  canonicalReleaseAssetUrl,
  githubGraphql,
  githubJson,
  githubRequest,
  releaseForTag,
  repositoryContext,
  sha256,
  verifyReleaseAsset,
} from './github-catalog-release.mjs';

export { CatalogPublicationError } from './github-catalog-release.mjs';

const allowedFiles = new Set([
  'apps/web/config/active-food-catalog.json',
  'reference-data/nutrixx-curated/claims.v1.json',
]);

function decodeContent(value) {
  return Buffer.from(value.replace(/\n/gu, ''), 'base64').toString('utf8');
}

async function waitForDocumentation({
  fetcher,
  token,
  apiBase,
  headSha,
  sleep,
  timeoutMs,
}) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const result = await githubJson(
      fetcher,
      token,
      `${apiBase}/actions/runs?head_sha=${encodeURIComponent(headSha)}&event=pull_request&per_page=100`,
    );
    const runs = result.workflow_runs?.filter(
      (run) => run.name === 'Documentation',
    );
    const completed = runs?.find((run) => run.status === 'completed');
    if (completed?.conclusion === 'success') return completed;
    if (completed)
      throw new CatalogPublicationError(
        `Documentation completed with ${completed.conclusion}. The draft Release remains unpublished.`,
        409,
      );
    if (Date.now() >= deadline)
      throw new CatalogPublicationError(
        'Documentation did not complete before the catalog finalization timeout.',
        408,
      );
    await sleep(10_000);
  }
}

async function readReleasePullRequest({
  fetcher,
  token,
  apiBase,
  repository,
  workflowRunId,
}) {
  const run = await githubJson(
    fetcher,
    token,
    `${apiBase}/actions/runs/${workflowRunId}`,
  );
  if (run.event !== 'pull_request' || run.conclusion !== 'success')
    throw new CatalogPublicationError(
      'Catalog finalization requires a successful pull-request CI run.',
      409,
    );
  const pullRequests = await githubJson(
    fetcher,
    token,
    `${apiBase}/actions/runs/${workflowRunId}/pull_requests`,
  );
  const pullRequest = pullRequests.find(
    (candidate) =>
      candidate.head?.repo?.full_name === repository &&
      candidate.head?.ref?.startsWith('catalog-release/'),
  );
  if (!pullRequest)
    throw new CatalogPublicationError(
      'The CI run is not associated with a trusted catalog-release pull request.',
      409,
    );
  return { run, pullRequest };
}

async function verifyPullRequest({
  fetcher,
  token,
  apiBase,
  pullRequestNumber,
}) {
  const pullRequest = await githubJson(
    fetcher,
    token,
    `${apiBase}/pulls/${pullRequestNumber}`,
  );
  if (
    pullRequest.state !== 'open' ||
    pullRequest.base?.ref !== 'main' ||
    !pullRequest.head?.ref?.startsWith('catalog-release/')
  )
    throw new CatalogPublicationError(
      'The catalog-release pull request is no longer eligible for finalization.',
      409,
    );
  const files = await githubJson(
    fetcher,
    token,
    `${apiBase}/pulls/${pullRequestNumber}/files?per_page=100`,
  );
  if (
    files.length !== allowedFiles.size ||
    files.some((file) => !allowedFiles.has(file.filename))
  )
    throw new CatalogPublicationError(
      'The catalog-release pull request changes files outside the approved catalog pointer and claims.',
      409,
    );
  return pullRequest;
}

async function descriptorAtHead({ fetcher, token, apiBase, headSha }) {
  const result = await githubJson(
    fetcher,
    token,
    `${apiBase}/contents/apps/web/config/active-food-catalog.json?ref=${encodeURIComponent(headSha)}`,
  );
  return JSON.parse(decodeContent(result.content));
}

async function verifyPreparedRelease({
  fetcher,
  token,
  repository,
  apiBase,
  descriptor,
}) {
  const release = await releaseForTag(
    fetcher,
    token,
    apiBase,
    descriptor.releaseId,
  );
  if (!release)
    throw new CatalogPublicationError(
      'The prepared GitHub Release does not exist.',
      409,
    );
  const receiptName = descriptor.artifactName.replace(
    /\.v1\.json\.gz$/u,
    '.receipt.json',
  );
  if (
    descriptor.artifactUrl !==
      canonicalReleaseAssetUrl(
        repository,
        descriptor.releaseId,
        descriptor.artifactName,
      ) ||
    descriptor.receiptUrl !==
      canonicalReleaseAssetUrl(repository, descriptor.releaseId, receiptName)
  )
    throw new CatalogPublicationError(
      'The catalog descriptor does not use canonical immutable Release URLs.',
      409,
    );
  const artifactAsset = release.assets?.find(
    (asset) => asset.name === descriptor.artifactName,
  );
  await verifyReleaseAsset(fetcher, token, artifactAsset, {
    name: descriptor.artifactName,
    bytes: descriptor.compressedByteLength,
    sha256: descriptor.artifactSha256,
  });
  const receiptAsset = release.assets?.find(
    (asset) => asset.name === receiptName,
  );
  if (!receiptAsset)
    throw new CatalogPublicationError(
      'The catalog receipt asset is missing.',
      409,
    );
  const receiptResponse = await githubRequest(
    fetcher,
    token,
    receiptAsset.url,
    {
      headers: { Accept: 'application/octet-stream' },
    },
  );
  if (!receiptResponse.ok)
    throw new CatalogPublicationError(
      'The catalog receipt could not be downloaded for final verification.',
      receiptResponse.status,
    );
  const receiptContent = Buffer.from(await receiptResponse.arrayBuffer());
  if (
    receiptAsset.digest &&
    receiptAsset.digest !== `sha256:${sha256(receiptContent)}`
  )
    throw new CatalogPublicationError(
      'The catalog receipt digest differs from the GitHub asset digest.',
      409,
    );
  const receipt = JSON.parse(receiptContent.toString('utf8'));
  if (
    receipt.releaseId !== descriptor.releaseId ||
    receipt.artifactSha256 !== descriptor.artifactSha256 ||
    receipt.compressedByteLength !== descriptor.compressedByteLength
  )
    throw new CatalogPublicationError(
      'The catalog receipt differs from the pull-request descriptor.',
      409,
    );
  return release;
}

export async function finalizeCatalogRelease({
  token,
  repository = DEFAULT_GITHUB_REPOSITORY,
  workflowRunId,
  fetcher = fetch,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  documentationTimeoutMs = 10 * 60 * 1000,
}) {
  if (!token?.trim())
    throw new CatalogPublicationError(
      'GitHub finalization requires a repository token.',
      503,
    );
  if (!Number.isSafeInteger(Number(workflowRunId)))
    throw new CatalogPublicationError(
      'The CI workflow run ID is invalid.',
      400,
    );
  const cleanToken = token.trim();
  const { apiBase } = repositoryContext(repository);
  const { run, pullRequest: associatedPullRequest } =
    await readReleasePullRequest({
      fetcher,
      token: cleanToken,
      apiBase,
      repository,
      workflowRunId,
    });
  const pullRequest = await verifyPullRequest({
    fetcher,
    token: cleanToken,
    apiBase,
    pullRequestNumber: associatedPullRequest.number,
  });
  if (pullRequest.head.sha !== run.head_sha)
    throw new CatalogPublicationError(
      'The pull-request head changed after the successful CI run.',
      409,
    );
  await waitForDocumentation({
    fetcher,
    token: cleanToken,
    apiBase,
    headSha: pullRequest.head.sha,
    sleep,
    timeoutMs: documentationTimeoutMs,
  });
  const descriptor = await descriptorAtHead({
    fetcher,
    token: cleanToken,
    apiBase,
    headSha: pullRequest.head.sha,
  });
  let release = await verifyPreparedRelease({
    fetcher,
    token: cleanToken,
    repository,
    apiBase,
    descriptor,
  });
  if (release.draft)
    release = await githubJson(
      fetcher,
      cleanToken,
      `${apiBase}/releases/${release.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: false }),
      },
    );
  if (pullRequest.draft)
    await githubGraphql(
      fetcher,
      cleanToken,
      `mutation MarkCatalogReleaseReady($pullRequestId: ID!) {
        markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
          pullRequest { id isDraft }
        }
      }`,
      { pullRequestId: pullRequest.node_id },
    );
  const merge = await githubJson(
    fetcher,
    cleanToken,
    `${apiBase}/pulls/${pullRequest.number}/merge`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sha: pullRequest.head.sha,
        merge_method: 'squash',
        commit_title: `data(catalog): activate ${descriptor.releaseId}`,
      }),
    },
  );
  if (!merge.merged)
    throw new CatalogPublicationError(
      merge.message ?? 'The catalog-release pull request could not be merged.',
      409,
    );
  const branchPath = pullRequest.head.ref
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  const branch = await githubRequest(
    fetcher,
    cleanToken,
    `${apiBase}/git/refs/heads/${branchPath}`,
    { method: 'DELETE' },
  );
  if (!branch.ok && branch.status !== 404)
    throw new CatalogPublicationError(
      `The merged catalog release branch could not be removed (HTTP ${branch.status}).`,
      branch.status,
    );
  return {
    releaseId: descriptor.releaseId,
    releaseUrl: release.html_url,
    pullRequestNumber: pullRequest.number,
    mergedCommitSha: merge.sha,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await finalizeCatalogRelease({
    token: process.env.GITHUB_TOKEN,
    repository: process.env.GITHUB_REPOSITORY,
    workflowRunId: process.env.NUTRIXX_CI_RUN_ID,
  });
  console.log(JSON.stringify(result, null, 2));
}
