import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CatalogPublicationError,
  publishLocalAgentCatalog,
} from './publish-local-agent-catalog.mjs';
import {
  readLocalCatalogPublicationV1,
  reconcilePublishedLocalCatalogV1,
} from './local-catalog-draft.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'nutrixx-catalog-release-'));
  const catalogDirectory = path.join(root, 'apps/web/public/catalog');
  const configDirectory = path.join(root, 'apps/web/config');
  const claimsDirectory = path.join(root, 'reference-data/nutrixx-curated');
  const sessionDirectory = path.join(root, '.temp/agent-curation');
  await Promise.all([
    mkdir(catalogDirectory, { recursive: true }),
    mkdir(configDirectory, { recursive: true }),
    mkdir(claimsDirectory, { recursive: true }),
    mkdir(sessionDirectory, { recursive: true }),
  ]);
  const releaseId = 'food-catalog-nutrixx-test';
  const artifactName = `${releaseId}.v1.json.gz`;
  const receiptName = `${releaseId}.receipt.json`;
  const artifact = Buffer.from('verified-catalog');
  const artifactSha256 = sha256(artifact);
  const receipt = Buffer.from(
    `${JSON.stringify({
      releaseId,
      artifactSha256,
      compressedByteLength: artifact.length,
    })}\n`,
  );
  const descriptorPath = path.join(configDirectory, 'active-food-catalog.json');
  const baseReleaseId = 'food-catalog-published-base';
  const baseArtifactName = `${baseReleaseId}.v1.json.gz`;
  const baseArtifact = Buffer.from('published-base');
  const baseDescriptor = {
    format: 'nutrixx.active-food-catalog',
    schemaVersion: 1,
    releaseId: baseReleaseId,
    artifactName: baseArtifactName,
    artifactSha256: sha256(baseArtifact),
    compressedByteLength: baseArtifact.length,
    candidateId: null,
    artifactUrl: 'https://github.test/download/base.json.gz',
    receiptUrl: 'https://github.test/download/base.receipt.json',
    reviewedClaimCount: 0,
  };
  const draftDescriptor = {
    ...baseDescriptor,
    releaseId,
    artifactName,
    artifactSha256,
    compressedByteLength: artifact.length,
    candidateId: '11111111-1111-4111-a111-111111111111',
    artifactUrl: null,
    receiptUrl: null,
    reviewedClaimCount: 1,
  };
  const claims = {
    format: 'nutrixx.agent-curated-food-composition',
    schemaVersion: 1,
    claims: [{ claim: { claimId: 'fixture' } }],
  };
  await Promise.all([
    writeFile(path.join(catalogDirectory, artifactName), artifact),
    writeFile(path.join(catalogDirectory, baseArtifactName), baseArtifact),
    writeFile(path.join(catalogDirectory, receiptName), receipt),
    writeFile(descriptorPath, `${JSON.stringify(baseDescriptor)}\n`),
    writeFile(
      path.join(claimsDirectory, 'claims.v1.json'),
      `${JSON.stringify({ ...claims, claims: [] })}\n`,
    ),
    writeFile(
      path.join(sessionDirectory, 'claims.v1.json'),
      `${JSON.stringify(claims)}\n`,
    ),
    writeFile(
      path.join(sessionDirectory, 'session.v1.json'),
      `${JSON.stringify({
        format: 'nutrixx.local-catalog-curation-session',
        schemaVersion: 1,
        sessionId: '22222222-2222-4222-a222-222222222222',
        createdAt: '2026-10-27T10:00:00.000Z',
        updatedAt: '2026-10-27T10:01:00.000Z',
        baseCatalog: baseDescriptor,
        draftRevision: 1,
        draftCatalog: draftDescriptor,
      })}\n`,
    ),
  ]);
  return { root, releaseId, artifactName, descriptorPath, sessionDirectory };
}

function successfulGitHub(calls) {
  let blobNumber = 0;
  return async (url, init = {}) => {
    const target = String(url);
    const method = init.method ?? 'GET';
    calls.push({ url: target, method, body: init.body });
    if (target.includes('/releases/tags/'))
      return new Response('{}', { status: 404 });
    if (target.endsWith('/releases?per_page=100') && method === 'GET')
      return Response.json([]);
    if (target.endsWith('/releases') && method === 'POST')
      return Response.json(
        {
          id: 7,
          draft: true,
          html_url: 'https://github.test/releases/7',
          upload_url:
            'https://uploads.github.test/releases/7/assets{?name,label}',
          assets: [],
        },
        { status: 201 },
      );
    if (target.startsWith('https://uploads.github.test/')) {
      const name = new URL(target).searchParams.get('name');
      return Response.json({ name }, { status: 201 });
    }
    if (target.endsWith('/git/ref/heads/main'))
      return Response.json({ object: { sha: 'main-sha' } });
    if (target.endsWith('/git/blobs') && method === 'POST') {
      blobNumber += 1;
      return Response.json({ sha: `blob-${blobNumber}` }, { status: 201 });
    }
    if (target.endsWith('/git/commits/main-sha'))
      return Response.json({ tree: { sha: 'base-tree' } });
    if (target.endsWith('/git/trees') && method === 'POST')
      return Response.json({ sha: 'release-tree' }, { status: 201 });
    if (target.includes('/git/ref/heads/catalog-release/'))
      return new Response('{}', { status: 404 });
    if (target.endsWith('/git/commits') && method === 'POST')
      return Response.json({ sha: 'release-commit' }, { status: 201 });
    if (target.endsWith('/git/refs') && method === 'POST')
      return Response.json(
        { object: { sha: 'release-commit' } },
        { status: 201 },
      );
    if (target.includes('/pulls?')) return Response.json([]);
    if (target.endsWith('/pulls') && method === 'POST')
      return Response.json(
        {
          number: 19,
          html_url: 'https://github.test/pulls/19',
        },
        { status: 201 },
      );
    throw new Error(`Unexpected request: ${method} ${target}`);
  };
}

test('prepares immutable assets and a release PR without activating main', async () => {
  const setup = await fixture();
  const calls = [];
  try {
    const result = await publishLocalAgentCatalog({
      rootPath: setup.root,
      token: 'test-token',
      repository: 'shari-ar/Nutrixx',
      fetcher: successfulGitHub(calls),
    });
    const descriptor = JSON.parse(await readFile(setup.descriptorPath, 'utf8'));
    const publication = JSON.parse(
      await readFile(
        path.join(setup.sessionDirectory, 'publication.v1.json'),
        'utf8',
      ),
    );
    assert.equal(descriptor.releaseId, 'food-catalog-published-base');
    assert.equal(result.publicationState, 'awaiting-ci');
    assert.equal(result.pullRequestNumber, 19);
    assert.equal(publication.releaseId, setup.releaseId);
    assert.deepEqual(
      await readLocalCatalogPublicationV1({ rootPath: setup.root }),
      publication,
    );
    assert.equal(publication.state, 'awaiting-validation');
    assert.equal(
      JSON.parse(
        await readFile(
          path.join(setup.sessionDirectory, 'session.v1.json'),
          'utf8',
        ),
      ).draftCatalog.releaseId,
      setup.releaseId,
    );
    assert.equal(
      calls.some(
        ({ url, method }) => url.endsWith('/releases/7') && method === 'PATCH',
      ),
      false,
    );
    const descriptorBlob = calls.find(
      ({ url, method }) => url.endsWith('/git/blobs') && method === 'POST',
    );
    const pending = JSON.parse(
      Buffer.from(JSON.parse(descriptorBlob.body).content, 'base64').toString(
        'utf8',
      ),
    );
    assert.equal(
      pending.artifactUrl,
      `https://github.com/shari-ar/Nutrixx/releases/download/${setup.releaseId}/${setup.artifactName}`,
    );
  } finally {
    await rm(setup.root, { recursive: true, force: true });
  }
});

test('reconciles a published local draft and clears its transient session', async () => {
  const setup = await fixture();
  try {
    const session = JSON.parse(
      await readFile(
        path.join(setup.sessionDirectory, 'session.v1.json'),
        'utf8',
      ),
    );
    await writeFile(
      setup.descriptorPath,
      `${JSON.stringify({
        ...session.draftCatalog,
        artifactUrl: 'https://github.test/download/catalog.json.gz',
        receiptUrl: 'https://github.test/download/catalog.receipt.json',
      })}\n`,
    );

    assert.equal(
      await reconcilePublishedLocalCatalogV1({ rootPath: setup.root }),
      true,
    );
    await assert.rejects(
      readFile(path.join(setup.sessionDirectory, 'session.v1.json'), 'utf8'),
      { code: 'ENOENT' },
    );
  } finally {
    await rm(setup.root, { recursive: true, force: true });
  }
});

test('stops immediately on GitHub HTTP 403 and preserves the local draft', async () => {
  const setup = await fixture();
  let requests = 0;
  try {
    await assert.rejects(
      publishLocalAgentCatalog({
        rootPath: setup.root,
        token: 'test-token',
        repository: 'shari-ar/Nutrixx',
        fetcher: async () => {
          requests += 1;
          return Response.json({ message: 'Forbidden' }, { status: 403 });
        },
      }),
      (error) =>
        error instanceof CatalogPublicationError && error.statusCode === 403,
    );
    assert.equal(requests, 1);
    const descriptor = JSON.parse(await readFile(setup.descriptorPath, 'utf8'));
    assert.equal(descriptor.releaseId, 'food-catalog-published-base');
    assert.equal(
      JSON.parse(
        await readFile(
          path.join(setup.sessionDirectory, 'session.v1.json'),
          'utf8',
        ),
      ).draftCatalog.releaseId,
      setup.releaseId,
    );
  } finally {
    await rm(setup.root, { recursive: true, force: true });
  }
});
