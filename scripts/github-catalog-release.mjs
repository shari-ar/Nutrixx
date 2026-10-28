import { createHash } from 'node:crypto';

export class CatalogPublicationError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'CatalogPublicationError';
    this.statusCode = statusCode;
  }
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function repositoryContext(repository) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository ?? ''))
    throw new CatalogPublicationError('The GitHub repository is invalid.', 500);
  const [owner, name] = repository.split('/');
  return {
    owner,
    name,
    apiBase: `https://api.github.com/repos/${owner}/${name}`,
  };
}

export function canonicalReleaseAssetUrl(repository, releaseId, assetName) {
  return `https://github.com/${repository}/releases/download/${encodeURIComponent(releaseId)}/${encodeURIComponent(assetName)}`;
}

export async function githubRequest(fetcher, token, url, init = {}) {
  const response = await fetcher(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(10 * 60 * 1000),
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Nutrixx-Catalog-Release',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  });
  if (response.status === 403)
    throw new CatalogPublicationError(
      'GitHub returned HTTP 403. Catalog publication stopped without retry.',
      403,
    );
  return response;
}

export async function githubJson(fetcher, token, url, init = {}) {
  const response = await githubRequest(fetcher, token, url, init);
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new CatalogPublicationError(
      result.message ?? `GitHub returned HTTP ${response.status}.`,
      response.status,
    );
  return result;
}

export async function githubJsonOrNull(fetcher, token, url, init = {}) {
  const response = await githubRequest(fetcher, token, url, init);
  if (response.status === 404) return null;
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new CatalogPublicationError(
      result.message ?? `GitHub returned HTTP ${response.status}.`,
      response.status,
    );
  return result;
}

export async function releaseForTag(fetcher, token, apiBase, tag) {
  const published = await githubJsonOrNull(
    fetcher,
    token,
    `${apiBase}/releases/tags/${encodeURIComponent(tag)}`,
  );
  if (published) return published;
  const releases = await githubJson(
    fetcher,
    token,
    `${apiBase}/releases?per_page=100`,
  );
  return releases.find((release) => release.tag_name === tag) ?? null;
}

export async function githubGraphql(fetcher, token, query, variables) {
  const result = await githubJson(
    fetcher,
    token,
    'https://api.github.com/graphql',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    },
  );
  if (result.errors?.length)
    throw new CatalogPublicationError(
      result.errors.map((error) => error.message).join(' '),
      409,
    );
  return result.data;
}

export async function verifyReleaseAsset(fetcher, token, asset, expected) {
  if (!asset || asset.size !== expected.bytes)
    throw new CatalogPublicationError(
      `The GitHub asset differs in size: ${expected.name}`,
      409,
    );
  if (asset.digest) {
    if (asset.digest !== `sha256:${expected.sha256}`)
      throw new CatalogPublicationError(
        `The GitHub asset differs in digest: ${expected.name}`,
        409,
      );
    return asset;
  }
  const response = await githubRequest(fetcher, token, asset.url, {
    headers: { Accept: 'application/octet-stream' },
  });
  if (!response.ok)
    throw new CatalogPublicationError(
      `The GitHub asset could not be verified: ${expected.name}`,
      response.status,
    );
  const content = Buffer.from(await response.arrayBuffer());
  if (sha256(content) !== expected.sha256)
    throw new CatalogPublicationError(
      `The GitHub asset differs in digest: ${expected.name}`,
      409,
    );
  return asset;
}

export async function uploadReleaseAsset(fetcher, token, release, expected) {
  const existing = release.assets?.find(
    (asset) => asset.name === expected.name,
  );
  if (existing) return verifyReleaseAsset(fetcher, token, existing, expected);
  const uploadBase = release.upload_url.replace(/\{.*$/u, '');
  return githubJson(
    fetcher,
    token,
    `${uploadBase}?name=${encodeURIComponent(expected.name)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': expected.contentType },
      body: expected.content,
    },
  );
}
