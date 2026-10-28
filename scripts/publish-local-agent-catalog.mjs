import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  atomicJson,
  clearLocalCatalogCurationSessionV1,
  ensureLocalCatalogCurationSessionV1,
  localCatalogDraftPaths,
} from './local-catalog-draft.mjs';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

export class CatalogPublicationError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'CatalogPublicationError';
    this.statusCode = statusCode;
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function githubRequest(fetcher, token, url, init = {}) {
  const response = await fetcher(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(10 * 60 * 1000),
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Nutrixx-Local-Catalog-Publisher',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  });
  if (response.status === 403)
    throw new CatalogPublicationError(
      'GitHub rejected catalog publication with HTTP 403. Publication stopped without retry.',
      403,
    );
  return response;
}

async function githubJson(fetcher, token, url, init = {}) {
  const response = await githubRequest(fetcher, token, url, init);
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new CatalogPublicationError(
      result.message ?? `GitHub returned HTTP ${response.status}.`,
      response.status,
    );
  return result;
}

async function releaseForTag(fetcher, token, apiBase, tag) {
  const response = await githubRequest(
    fetcher,
    token,
    `${apiBase}/releases/tags/${encodeURIComponent(tag)}`,
  );
  if (response.status === 404) return null;
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new CatalogPublicationError(
      result.message ?? `GitHub returned HTTP ${response.status}.`,
      response.status,
    );
  return result;
}

async function verifyExistingAsset(fetcher, token, asset, expected) {
  if (asset.size !== expected.bytes)
    throw new CatalogPublicationError(
      `The existing GitHub asset differs in size: ${expected.name}`,
      409,
    );
  if (asset.digest) {
    if (asset.digest !== `sha256:${expected.sha256}`)
      throw new CatalogPublicationError(
        `The existing GitHub asset differs in digest: ${expected.name}`,
        409,
      );
    return asset;
  }
  const response = await githubRequest(fetcher, token, asset.url, {
    headers: { Accept: 'application/octet-stream' },
  });
  if (!response.ok)
    throw new CatalogPublicationError(
      `The existing GitHub asset could not be verified: ${expected.name}`,
      response.status,
    );
  const content = Buffer.from(await response.arrayBuffer());
  if (sha256(content) !== expected.sha256)
    throw new CatalogPublicationError(
      `The existing GitHub asset differs in digest: ${expected.name}`,
      409,
    );
  return asset;
}

async function uploadAsset(fetcher, token, release, expected) {
  const existing = release.assets?.find(
    (asset) => asset.name === expected.name,
  );
  if (existing) return verifyExistingAsset(fetcher, token, existing, expected);
  const uploadBase = release.upload_url.replace(/\{.*$/u, '');
  return githubJson(
    fetcher,
    token,
    `${uploadBase}?name=${encodeURIComponent(expected.name)}`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        'Content-Type': expected.contentType,
      },
      body: expected.content,
    },
  );
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
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository))
    throw new CatalogPublicationError('The GitHub repository is invalid.', 500);

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
  const receiptPath = path.join(
    rootPath,
    'apps/web/public/catalog',
    receiptName,
  );
  const [artifact, receiptContent] = await Promise.all([
    readFile(artifactPath),
    readFile(receiptPath),
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
      'The active local catalog or receipt failed verification.',
      409,
    );

  const [owner, name] = repository.split('/');
  const apiBase = `https://api.github.com/repos/${owner}/${name}`;
  let release = await releaseForTag(
    fetcher,
    token.trim(),
    apiBase,
    descriptor.releaseId,
  );
  if (!release)
    release = await githubJson(fetcher, token.trim(), `${apiBase}/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: descriptor.releaseId,
        name: `Nutrixx Food Catalog ${descriptor.releaseId}`,
        body: `Immutable Nutrixx food-catalog release ${descriptor.releaseId}.`,
        draft: true,
        prerelease: false,
        generate_release_notes: false,
      }),
    });

  const artifactAsset = await uploadAsset(fetcher, token.trim(), release, {
    name: descriptor.artifactName,
    content: artifact,
    bytes: artifact.length,
    sha256: sha256(artifact),
    contentType: 'application/gzip',
  });
  const receiptAsset = await uploadAsset(fetcher, token.trim(), release, {
    name: receiptName,
    content: receiptContent,
    bytes: receiptContent.length,
    sha256: sha256(receiptContent),
    contentType: 'application/json',
  });
  if (release.draft)
    release = await githubJson(
      fetcher,
      token.trim(),
      `${apiBase}/releases/${release.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: false }),
      },
    );

  const publishedDescriptor = {
    ...descriptor,
    artifactUrl: artifactAsset.browser_download_url,
    receiptUrl: receiptAsset.browser_download_url,
  };
  const localClaims = JSON.parse(await readFile(paths.claims, 'utf8'));
  await Promise.all([
    atomicJson(paths.activeDescriptor, publishedDescriptor),
    atomicJson(paths.trackedClaims, localClaims),
  ]);
  await clearLocalCatalogCurationSessionV1({ rootPath });
  return {
    releaseId: descriptor.releaseId,
    releaseUrl: release.html_url,
    artifactUrl: artifactAsset.browser_download_url,
    receiptUrl: receiptAsset.browser_download_url,
    artifactSha256: descriptor.artifactSha256,
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
