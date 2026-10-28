import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CatalogPublicationError,
  canonicalReleaseAssetUrl,
  githubJson,
  githubJsonOrNull,
  releaseForTag,
  repositoryContext,
  sha256,
  uploadReleaseAsset,
} from './github-catalog-release.mjs';
import {
  ensureLocalCatalogCurationSessionV1,
  localCatalogDraftPaths,
  writeLocalCatalogPublicationV1,
} from './local-catalog-draft.mjs';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const activeDescriptorPath = 'apps/web/config/active-food-catalog.json';
const trackedClaimsPath = 'reference-data/nutrixx-curated/claims.v1.json';

export { CatalogPublicationError } from './github-catalog-release.mjs';

function refPath(branchName) {
  return branchName.split('/').map(encodeURIComponent).join('/');
}

async function createBlob(fetcher, token, apiBase, content) {
  return githubJson(fetcher, token, `${apiBase}/git/blobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: Buffer.from(content).toString('base64'),
      encoding: 'base64',
    }),
  });
}

async function prepareReleasePullRequest({
  fetcher,
  token,
  apiBase,
  owner,
  releaseId,
  descriptorContent,
  claimsContent,
}) {
  const branchName = `catalog-release/${releaseId}`;
  const branchEndpoint = `${apiBase}/git/ref/heads/${refPath(branchName)}`;
  const [mainRef, descriptorBlob, claimsBlob] = await Promise.all([
    githubJson(fetcher, token, `${apiBase}/git/ref/heads/main`),
    createBlob(fetcher, token, apiBase, descriptorContent),
    createBlob(fetcher, token, apiBase, claimsContent),
  ]);
  const baseCommit = await githubJson(
    fetcher,
    token,
    `${apiBase}/git/commits/${mainRef.object.sha}`,
  );
  const tree = await githubJson(fetcher, token, `${apiBase}/git/trees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base_tree: baseCommit.tree.sha,
      tree: [
        {
          path: activeDescriptorPath,
          mode: '100644',
          type: 'blob',
          sha: descriptorBlob.sha,
        },
        {
          path: trackedClaimsPath,
          mode: '100644',
          type: 'blob',
          sha: claimsBlob.sha,
        },
      ],
    }),
  });
  const existingRef = await githubJsonOrNull(fetcher, token, branchEndpoint);
  let headSha = existingRef?.object.sha;
  let existingTreeSha = null;
  if (headSha) {
    const existingCommit = await githubJson(
      fetcher,
      token,
      `${apiBase}/git/commits/${headSha}`,
    );
    existingTreeSha = existingCommit.tree.sha;
  }
  if (existingTreeSha !== tree.sha) {
    const commit = await githubJson(fetcher, token, `${apiBase}/git/commits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `data(catalog): activate ${releaseId}`,
        tree: tree.sha,
        parents: [mainRef.object.sha],
      }),
    });
    headSha = commit.sha;
    if (existingRef)
      await githubJson(fetcher, token, branchEndpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha: headSha, force: true }),
      });
    else
      await githubJson(fetcher, token, `${apiBase}/git/refs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: headSha,
        }),
      });
  }

  const pullRequests = await githubJson(
    fetcher,
    token,
    `${apiBase}/pulls?state=open&base=main&head=${encodeURIComponent(`${owner}:${branchName}`)}`,
  );
  const pullRequest =
    pullRequests[0] ??
    (await githubJson(fetcher, token, `${apiBase}/pulls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `Activate food catalog ${releaseId}`,
        head: branchName,
        base: 'main',
        body: [
          '<!-- nutrixx-catalog-release -->',
          `Activates the verified immutable food catalog \`${releaseId}\`.`,
          '',
          'The catalog finalization workflow publishes the prepared draft Release only after CI and Documentation succeed, then merges this pull request and removes the release branch.',
        ].join('\n'),
        maintainer_can_modify: false,
        draft: true,
      }),
    }));
  return { branchName, headSha, pullRequest };
}

export async function publishLocalAgentCatalog({
  rootPath = projectRoot,
  token,
  repository = 'shari-ar/Nutrixx',
  fetcher = fetch,
}) {
  if (!token?.trim())
    throw new CatalogPublicationError(
      'GitHub publication is not configured. Set NUTRIXX_GITHUB_TOKEN locally.',
      503,
    );
  const cleanToken = token.trim();
  const { owner, apiBase } = repositoryContext(repository);
  const paths = localCatalogDraftPaths(rootPath);
  const session = await ensureLocalCatalogCurationSessionV1({ rootPath });
  if (session.draftCatalog === null)
    throw new CatalogPublicationError(
      'No verified local catalog draft is ready for publication.',
      409,
    );
  const descriptor = session.draftCatalog;
  const artifactPath = path.join(
    rootPath,
    'apps/web/public/catalog',
    descriptor.artifactName,
  );
  const receiptName = descriptor.artifactName.replace(
    /\.v1\.json\.gz$/u,
    '.receipt.json',
  );
  if (receiptName === descriptor.artifactName)
    throw new CatalogPublicationError('The catalog artifact name is invalid.');
  const [artifact, receiptContent] = await Promise.all([
    readFile(artifactPath),
    readFile(path.join(rootPath, 'apps/web/public/catalog', receiptName)),
  ]);
  const receipt = JSON.parse(receiptContent.toString('utf8'));
  if (
    artifact.length !== descriptor.compressedByteLength ||
    sha256(artifact) !== descriptor.artifactSha256 ||
    receipt.releaseId !== descriptor.releaseId ||
    receipt.artifactSha256 !== descriptor.artifactSha256 ||
    receipt.compressedByteLength !== descriptor.compressedByteLength
  )
    throw new CatalogPublicationError(
      'The local catalog or receipt failed verification.',
      409,
    );

  let release = await releaseForTag(
    fetcher,
    cleanToken,
    apiBase,
    descriptor.releaseId,
  );
  if (!release)
    release = await githubJson(fetcher, cleanToken, `${apiBase}/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: descriptor.releaseId,
        target_commitish: 'main',
        name: `Nutrixx Food Catalog ${descriptor.releaseId}`,
        body: `Immutable Nutrixx food-catalog release ${descriptor.releaseId}.`,
        draft: true,
        prerelease: false,
        generate_release_notes: false,
      }),
    });
  await uploadReleaseAsset(fetcher, cleanToken, release, {
    name: descriptor.artifactName,
    content: artifact,
    bytes: artifact.length,
    sha256: descriptor.artifactSha256,
    contentType: 'application/gzip',
  });
  await uploadReleaseAsset(fetcher, cleanToken, release, {
    name: receiptName,
    content: receiptContent,
    bytes: receiptContent.length,
    sha256: sha256(receiptContent),
    contentType: 'application/json',
  });

  const pendingDescriptor = {
    ...descriptor,
    artifactUrl: canonicalReleaseAssetUrl(
      repository,
      descriptor.releaseId,
      descriptor.artifactName,
    ),
    receiptUrl: canonicalReleaseAssetUrl(
      repository,
      descriptor.releaseId,
      receiptName,
    ),
  };
  const localClaims = JSON.parse(await readFile(paths.claims, 'utf8'));
  const prepared = await prepareReleasePullRequest({
    fetcher,
    token: cleanToken,
    apiBase,
    owner,
    releaseId: descriptor.releaseId,
    descriptorContent: `${JSON.stringify(pendingDescriptor, null, 2)}\n`,
    claimsContent: `${JSON.stringify(localClaims, null, 2)}\n`,
  });
  const publication = {
    format: 'nutrixx.local-catalog-publication',
    schemaVersion: 1,
    releaseId: descriptor.releaseId,
    artifactSha256: descriptor.artifactSha256,
    pullRequestNumber: prepared.pullRequest.number,
    pullRequestUrl: prepared.pullRequest.html_url,
    releaseUrl: release.html_url,
    branchName: prepared.branchName,
    headSha: prepared.headSha,
    state: release.draft ? 'awaiting-validation' : 'awaiting-merge',
    preparedAt: new Date().toISOString(),
  };
  await writeLocalCatalogPublicationV1({ rootPath, value: publication });
  return {
    ...publication,
    publicationState: 'awaiting-ci',
    artifactUrl: pendingDescriptor.artifactUrl,
    receiptUrl: pendingDescriptor.receiptUrl,
    artifactBytes: artifact.length,
  };
}

async function tokenFromEnvironment() {
  const configured = process.env.NUTRIXX_GITHUB_TOKEN?.trim();
  if (configured) return configured;
  const tokenFile = process.env.NUTRIXX_GITHUB_TOKEN_FILE;
  if (!tokenFile) return undefined;
  return readFile(tokenFile, 'utf8')
    .then((value) => value.trim())
    .catch(() => undefined);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await publishLocalAgentCatalog({
    token: await tokenFromEnvironment(),
    repository: process.env.NUTRIXX_GITHUB_REPOSITORY,
  });
  console.log(JSON.stringify(result, null, 2));
}
