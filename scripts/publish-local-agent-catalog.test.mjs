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
    format: 'nutrixx.active-food-catalog',
    schemaVersion: 1,
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
  return {
    root,
    releaseId,
    artifactName,
    receiptName,
    descriptorPath,
    sessionDirectory,
  };
}

test('publishes both verified assets before activating immutable URLs', async () => {
  const setup = await fixture();
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET' });
    if (String(url).includes('/releases/tags/'))
      return new Response('{}', { status: 404 });
    if (String(url).endsWith('/releases') && init.method === 'POST')
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
    if (String(url).startsWith('https://uploads.github.test/')) {
      const name = new URL(String(url)).searchParams.get('name');
      return Response.json(
        {
          name,
          browser_download_url: `https://github.test/download/${name}`,
        },
        { status: 201 },
      );
    }
    if (String(url).endsWith('/releases/7') && init.method === 'PATCH')
      return Response.json({
        id: 7,
        draft: false,
        html_url: 'https://github.test/releases/7',
      });
    throw new Error(`Unexpected request: ${String(url)}`);
  };

  try {
    const result = await publishLocalAgentCatalog({
      rootPath: setup.root,
      token: 'test-token',
      repository: 'shari-ar/Nutrixx',
      fetcher,
    });
    const descriptor = JSON.parse(await readFile(setup.descriptorPath, 'utf8'));

    assert.equal(result.releaseId, setup.releaseId);
    assert.equal(
      descriptor.artifactUrl,
      `https://github.test/download/${setup.artifactName}`,
    );
    assert.equal(
      descriptor.receiptUrl,
      `https://github.test/download/${setup.receiptName}`,
    );
    await assert.rejects(
      readFile(path.join(setup.sessionDirectory, 'session.v1.json')),
      /ENOENT/u,
    );
    assert.deepEqual(
      calls.map(({ method }) => method),
      ['GET', 'POST', 'POST', 'POST', 'PATCH'],
    );
  } finally {
    await rm(setup.root, { recursive: true, force: true });
  }
});

test('stops immediately on GitHub HTTP 403', async () => {
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
