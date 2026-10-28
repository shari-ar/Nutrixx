import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function localCatalogDraftPaths(rootPath) {
  return {
    activeDescriptor: path.join(
      rootPath,
      'apps/web/config/active-food-catalog.json',
    ),
    trackedClaims: path.join(
      rootPath,
      'reference-data/nutrixx-curated/claims.v1.json',
    ),
    session: path.join(rootPath, '.temp/agent-curation/session.v1.json'),
    claims: path.join(rootPath, '.temp/agent-curation/claims.v1.json'),
    browserDraft: path.join(
      rootPath,
      'apps/web/public/catalog/local-draft.json',
    ),
    catalogDirectory: path.join(rootPath, 'apps/web/public/catalog'),
  };
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export async function atomicJson(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.next`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, filename);
}

async function readJsonIfPresent(filename) {
  try {
    return JSON.parse(await readFile(filename, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export function validateCatalogDescriptorV1(input) {
  if (
    typeof input !== 'object' ||
    input === null ||
    input.format !== 'nutrixx.active-food-catalog' ||
    input.schemaVersion !== 1 ||
    !/^[a-z0-9][a-z0-9.-]{0,199}$/u.test(input.releaseId ?? '') ||
    input.artifactName !== `${input.releaseId}.v1.json.gz` ||
    !/^[a-f0-9]{64}$/u.test(input.artifactSha256 ?? '') ||
    !Number.isSafeInteger(input.compressedByteLength) ||
    input.compressedByteLength <= 0 ||
    !(
      input.candidateId === null ||
      (typeof input.candidateId === 'string' &&
        /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u.test(input.candidateId))
    ) ||
    !Number.isSafeInteger(input.reviewedClaimCount) ||
    input.reviewedClaimCount < 0 ||
    !(
      input.artifactUrl === null ||
      (typeof input.artifactUrl === 'string' &&
        input.artifactUrl.startsWith('https://'))
    ) ||
    !(
      input.receiptUrl === null ||
      (typeof input.receiptUrl === 'string' &&
        input.receiptUrl.startsWith('https://'))
    ) ||
    (input.artifactUrl === null) !== (input.receiptUrl === null)
  )
    throw new TypeError('The catalog descriptor is invalid.');
  return input;
}

function validateSession(input) {
  if (
    typeof input !== 'object' ||
    input === null ||
    input.format !== 'nutrixx.local-catalog-curation-session' ||
    input.schemaVersion !== 1 ||
    !/^[a-f0-9-]{36}$/u.test(input.sessionId ?? '') ||
    !Number.isSafeInteger(input.draftRevision) ||
    input.draftRevision < 0
  )
    throw new TypeError('The local catalog curation session is invalid.');
  validateCatalogDescriptorV1(input.baseCatalog);
  if (input.draftCatalog !== null)
    validateCatalogDescriptorV1(input.draftCatalog);
  return input;
}

async function verifyLocalArtifact(rootPath, descriptor) {
  const filename = path.join(
    rootPath,
    'apps/web/public/catalog',
    descriptor.artifactName,
  );
  const content = await readFile(filename);
  if (
    content.length !== descriptor.compressedByteLength ||
    sha256(content) !== descriptor.artifactSha256
  )
    throw new TypeError(
      `Catalog artifact verification failed: ${descriptor.artifactName}`,
    );
  return content;
}

async function descriptorForIdentity(rootPath, identity) {
  if (
    typeof identity?.releaseId !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(identity?.artifactSha256 ?? '')
  )
    throw new TypeError('The base catalog identity is invalid.');
  const artifactName = `${identity.releaseId}.v1.json.gz`;
  const artifactPath = path.join(
    rootPath,
    'apps/web/public/catalog',
    artifactName,
  );
  const size = (await stat(artifactPath)).size;
  const descriptor = {
    format: 'nutrixx.active-food-catalog',
    schemaVersion: 1,
    releaseId: identity.releaseId,
    artifactName,
    artifactSha256: identity.artifactSha256,
    compressedByteLength: size,
    artifactUrl: null,
    receiptUrl: null,
    candidateId: null,
    reviewedClaimCount: 0,
  };
  await verifyLocalArtifact(rootPath, descriptor);
  return descriptor;
}

function browserDraftProjection(session) {
  if (session.draftCatalog === null) return null;
  return {
    format: 'nutrixx.local-food-catalog-draft',
    schemaVersion: 1,
    sessionId: session.sessionId,
    draftRevision: session.draftRevision,
    baseCatalog: {
      releaseId: session.baseCatalog.releaseId,
      artifactSha256: session.baseCatalog.artifactSha256,
    },
    catalog: session.draftCatalog,
    updatedAt: session.updatedAt,
  };
}

async function writeBrowserDraft(paths, session) {
  const projection = browserDraftProjection(session);
  if (projection === null) {
    await rm(paths.browserDraft, { force: true });
    return;
  }
  await atomicJson(paths.browserDraft, projection);
}

export async function ensureLocalCatalogCurationSessionV1({
  rootPath,
  now = () => new Date().toISOString(),
  createId = randomUUID,
}) {
  const paths = localCatalogDraftPaths(rootPath);
  const existing = await readJsonIfPresent(paths.session);
  if (existing !== null) {
    const session = validateSession(existing);
    await writeBrowserDraft(paths, session);
    return session;
  }

  const active = validateCatalogDescriptorV1(
    JSON.parse(await readFile(paths.activeDescriptor, 'utf8')),
  );
  await verifyLocalArtifact(rootPath, active);
  let baseCatalog = active;
  let draftCatalog = null;
  let draftRevision = 0;

  if (
    active.candidateId !== null &&
    active.artifactUrl === null &&
    active.receiptUrl === null
  ) {
    const receiptName = active.artifactName.replace(
      /\.v1\.json\.gz$/u,
      '.receipt.json',
    );
    const receipt = await readJsonIfPresent(
      path.join(paths.catalogDirectory, receiptName),
    );
    if (receipt?.baseCatalog) {
      baseCatalog = await descriptorForIdentity(rootPath, receipt.baseCatalog);
      draftCatalog = active;
      draftRevision = 1;
    }
  }

  const claims = JSON.parse(await readFile(paths.trackedClaims, 'utf8'));
  const timestamp = now();
  const session = validateSession({
    format: 'nutrixx.local-catalog-curation-session',
    schemaVersion: 1,
    sessionId: createId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    baseCatalog,
    draftRevision,
    draftCatalog,
  });
  await Promise.all([
    atomicJson(paths.claims, claims),
    atomicJson(paths.session, session),
    writeBrowserDraft(paths, session),
  ]);
  return session;
}

export async function readOperationalCatalogDescriptorV1({ rootPath }) {
  const session = await ensureLocalCatalogCurationSessionV1({ rootPath });
  return session.draftCatalog ?? session.baseCatalog;
}

export async function activateLocalCatalogDraftV1({
  rootPath,
  session,
  descriptor,
  updatedAt = new Date().toISOString(),
}) {
  validateSession(session);
  validateCatalogDescriptorV1(descriptor);
  const paths = localCatalogDraftPaths(rootPath);
  await verifyLocalArtifact(rootPath, descriptor);
  const updated = validateSession({
    ...session,
    updatedAt,
    draftRevision: session.draftRevision + 1,
    draftCatalog: descriptor,
  });
  await Promise.all([
    atomicJson(paths.session, updated),
    writeBrowserDraft(paths, updated),
  ]);
  return updated;
}

export async function clearLocalCatalogCurationSessionV1({ rootPath }) {
  const paths = localCatalogDraftPaths(rootPath);
  await Promise.all([
    rm(paths.session, { force: true }),
    rm(paths.claims, { force: true }),
    rm(paths.browserDraft, { force: true }),
  ]);
}
