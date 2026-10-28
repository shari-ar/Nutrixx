import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createAgentCurationTaskPacketV1,
  parseAgentCurationFoodNames,
} from '../scripts/create-agent-curation-packet.mjs';
import {
  CatalogPublicationError,
  publishLocalAgentCatalog,
} from '../scripts/publish-local-agent-catalog.mjs';
import { ensureLocalCatalogCurationSessionV1 } from '../scripts/local-catalog-draft.mjs';

const workspace = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const outputDirectory = path.join(workspace, '.temp/data-quality-radar');
const curationRunsDirectory = path.join(
  workspace,
  'reference-workbench/agent-curation/runs',
);
const port = 3002;
const maximumNamesFileBytes = 256 * 1024;
const maximumAgentBatchBytes = 16 * 1024 * 1024;
const curationApiBaseUrl =
  process.env['NUTRIXX_CURATION_API_URL'] ?? 'http://api:3001/api/v1';
let catalogPublicationActive = false;

class CurationConfigurationError extends Error {}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/gu, (character) => {
    const replacements = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return replacements[character];
  });
}

function statusPage(message) {
  return `<!doctype html><html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nutrixx Data Quality Radar</title><style>body{max-width:48rem;margin:10vh auto;padding:2rem;font-family:system-ui;background:#0b1421;color:#e7eff6}p{line-height:1.5;color:#adbece}</style></head><body><h1>Data Quality Radar</h1><p>${escapeHtml(message)}</p><p>Review the Dev Container startup log, then reopen or rebuild the container after resolving the issue.</p></body></html>`;
}

async function readRequestText(request, maximumBytes, sizeError) {
  const chunks = [];
  let byteLength = 0;
  for await (const chunk of request) {
    byteLength += chunk.length;
    if (byteLength > maximumBytes) throw new RangeError(sizeError);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function curationAuthorization() {
  if (process.env['NUTRIXX_CURATION_ENABLED'] !== 'true')
    throw new CurationConfigurationError(
      'Enable local curation with NUTRIXX_CURATION_ENABLED=true in the root .env file.',
    );
  let token = process.env['NUTRIXX_CURATION_TOKEN']?.trim();
  const tokenPath = process.env['NUTRIXX_CURATION_TOKEN_FILE'];
  if (!token && tokenPath) token = (await readFile(tokenPath, 'utf8')).trim();
  if (!token)
    throw new CurationConfigurationError(
      'Configure NUTRIXX_CURATION_TOKEN in the root .env file.',
    );
  return `Bearer ${token}`;
}

async function githubPublicationToken() {
  const configured = process.env['NUTRIXX_GITHUB_TOKEN']?.trim();
  if (configured) return configured;
  const tokenPath = process.env['NUTRIXX_GITHUB_TOKEN_FILE'];
  if (!tokenPath) return undefined;
  return readFile(tokenPath, 'utf8')
    .then((value) => value.trim() || undefined)
    .catch(() => undefined);
}

async function catalogPublicationState() {
  const session = await ensureLocalCatalogCurationSessionV1({
    rootPath: workspace,
  });
  const descriptor = session.draftCatalog ?? session.baseCatalog;
  const hasDraft = session.draftCatalog !== null;
  return {
    sessionId: session.sessionId,
    draftRevision: session.draftRevision,
    baseReleaseId: session.baseCatalog.releaseId,
    draftId: session.draftCatalog?.candidateId ?? null,
    releaseId: descriptor.releaseId,
    artifactSha256: descriptor.artifactSha256,
    publicationState:
      !hasDraft &&
      descriptor.artifactUrl?.startsWith('https://') &&
      descriptor.receiptUrl?.startsWith('https://')
        ? 'published'
        : hasDraft
          ? 'local-draft'
          : 'base',
    artifactUrl: descriptor.artifactUrl ?? null,
    receiptUrl: descriptor.receiptUrl ?? null,
    publicationConfigured: Boolean(await githubPublicationToken()),
    publicationActive: catalogPublicationActive,
  };
}

async function forwardCuration(pathname, init = {}) {
  return fetch(`${curationApiBaseUrl}${pathname}`, {
    ...init,
    headers: {
      Authorization: await curationAuthorization(),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
}

async function radarIsReady() {
  const status = JSON.parse(
    await readFile(path.join(outputDirectory, 'startup-status.json'), 'utf8'),
  );
  return status;
}

async function latestCurationRun() {
  const entries = await readdir(curationRunsDirectory, { withFileTypes: true });
  const statuses = await Promise.all(
    entries
      .filter(
        (entry) => entry.isDirectory() && /^[a-f0-9-]{36}$/u.test(entry.name),
      )
      .map(async (entry) => {
        try {
          return JSON.parse(
            await readFile(
              path.join(curationRunsDirectory, entry.name, 'status.json'),
              'utf8',
            ),
          );
        } catch {
          return null;
        }
      }),
  );
  return statuses
    .filter(
      (status) =>
        status?.format === 'nutrixx.agent-curation-run' &&
        typeof status.runId === 'string',
    )
    .sort((left, right) => {
      const leftTime = Date.parse(
        left.completedAt ??
          left.failedAt ??
          left.startedAt ??
          left.queuedAt ??
          '',
      );
      const rightTime = Date.parse(
        right.completedAt ??
          right.failedAt ??
          right.startedAt ??
          right.queuedAt ??
          '',
      );
      return (
        (Number.isNaN(rightTime) ? 0 : rightTime) -
        (Number.isNaN(leftTime) ? 0 : leftTime)
      );
    })[0];
}

function jsonError(response, statusCode, error) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(`${JSON.stringify({ error: message })}\n`);
}

async function sendUpstreamResponse(response, upstream) {
  const content = await upstream.text();
  response.writeHead(upstream.status, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(content);
}

const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  if (request.url === '/agent-task-packet' && request.method === 'POST') {
    try {
      const status = await radarIsReady();
      if (status.state !== 'ready') {
        jsonError(
          response,
          503,
          new Error(status.message ?? 'The report is being prepared.'),
        );
        return;
      }
      const names = parseAgentCurationFoodNames(
        await readRequestText(
          request,
          maximumNamesFileBytes,
          'The food-names file exceeds 256 KiB.',
        ),
      );
      const { packet } = await createAgentCurationTaskPacketV1({
        names,
        queuePath: path.join(outputDirectory, 'queue.json'),
      });
      const content = `${JSON.stringify(packet, null, 2)}\n`;
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="agent-task-packet.json"',
      });
      response.end(content);
    } catch (error) {
      jsonError(response, error instanceof RangeError ? 413 : 400, error);
    }
    return;
  }
  if (request.url === '/agent-curation-runs' && request.method === 'POST') {
    try {
      const input = await readRequestText(
        request,
        maximumAgentBatchBytes,
        'The agent result file exceeds 16 MiB.',
      );
      const batch = JSON.parse(input);
      if (
        batch?.format !== 'nutrixx.agent-curation-batch' ||
        batch.schemaVersion !== 1 ||
        !Array.isArray(batch.claims) ||
        batch.claims.length === 0
      )
        throw new TypeError(
          'The file must be a version 1 Nutrixx agent-curation batch with at least one claim.',
        );
      const upstream = await forwardCuration('/internal/curation/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: input,
      });
      await sendUpstreamResponse(response, upstream);
    } catch (error) {
      const statusCode =
        error instanceof RangeError
          ? 413
          : error instanceof SyntaxError || error instanceof TypeError
            ? 400
            : error instanceof CurationConfigurationError
              ? 503
              : 502;
      jsonError(response, statusCode, error);
    }
    return;
  }
  if (request.url === '/catalog-release' && request.method === 'GET') {
    try {
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      response.end(`${JSON.stringify(await catalogPublicationState())}\n`);
    } catch (error) {
      jsonError(response, 500, error);
    }
    return;
  }
  if (request.url === '/catalog-release' && request.method === 'POST') {
    if (catalogPublicationActive) {
      jsonError(
        response,
        409,
        new Error('A catalog publication is already running.'),
      );
      return;
    }
    catalogPublicationActive = true;
    try {
      const result = await publishLocalAgentCatalog({
        rootPath: workspace,
        token: await githubPublicationToken(),
        repository:
          process.env['NUTRIXX_GITHUB_REPOSITORY'] ?? 'shari-ar/Nutrixx',
      });
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      response.end(`${JSON.stringify(result)}\n`);
    } catch (error) {
      jsonError(
        response,
        error instanceof CatalogPublicationError ? error.statusCode : 500,
        error,
      );
    } finally {
      catalogPublicationActive = false;
    }
    return;
  }
  if (
    request.url === '/agent-curation-runs/latest' &&
    request.method === 'GET'
  ) {
    try {
      const latest = await latestCurationRun();
      if (!latest) {
        response.writeHead(404, {
          'Content-Type': 'application/json; charset=utf-8',
        });
        response.end(
          `${JSON.stringify({ error: 'No curation run exists.' })}\n`,
        );
      } else {
        response.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
        });
        response.end(`${JSON.stringify(latest)}\n`);
      }
    } catch (error) {
      jsonError(response, 500, error);
    }
    return;
  }
  const runStatusMatch = request.url?.match(
    /^\/agent-curation-runs\/([a-f0-9-]{36})$/u,
  );
  if (runStatusMatch && request.method === 'GET') {
    try {
      const upstream = await forwardCuration(
        `/internal/curation/runs/${runStatusMatch[1]}`,
      );
      await sendUpstreamResponse(response, upstream);
    } catch (error) {
      jsonError(
        response,
        error instanceof CurationConfigurationError ? 503 : 502,
        error,
      );
    }
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD, POST' }).end();
    return;
  }
  if (request.url === '/_health') {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(request.method === 'HEAD' ? undefined : 'nutrixx-radar-v1');
    return;
  }
  if (
    request.url === '/agent-prompt.md' &&
    (request.method === 'GET' || request.method === 'HEAD')
  ) {
    try {
      const content = await readFile(
        path.join(workspace, 'docs/data/agent-curation-prompt.md'),
      );
      response.writeHead(200, {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': 'attachment; filename="agent-prompt.md"',
      });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      jsonError(response, 503, error);
    }
    return;
  }
  const routes = {
    '/': 'index.html',
    '/report.json': 'report.json',
    '/queue': 'queue.html',
    '/queue.json': 'queue.json',
    '/identity-review': 'identity-review.html',
    '/identity-review.json': 'identity-review.json',
  };
  const filename = routes[request.url];
  if (filename === undefined) {
    response.writeHead(404).end();
    return;
  }
  try {
    const status = await radarIsReady();
    if (status.state !== 'ready') {
      response.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(
        request.method === 'HEAD'
          ? undefined
          : statusPage(status.message ?? 'The report is being prepared.'),
      );
      return;
    }
    const isJson = filename.endsWith('.json');
    const content = await readFile(path.join(outputDirectory, filename));
    response.writeHead(200, {
      'Content-Type': isJson
        ? 'application/json; charset=utf-8'
        : 'text/html; charset=utf-8',
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    response.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(
      request.method === 'HEAD'
        ? undefined
        : statusPage('The local report is unavailable.'),
    );
  }
});

server.listen(port, '0.0.0.0');
