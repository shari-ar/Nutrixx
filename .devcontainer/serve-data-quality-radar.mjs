import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const outputDirectory = path.join(workspace, '.temp/data-quality-radar');
const port = 3002;

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

const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  if (request.url === '/_health') {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(request.method === 'HEAD' ? undefined : 'nutrixx-radar-v1');
    return;
  }
  const routes = {
    '/': 'index.html',
    '/report.json': 'report.json',
    '/queue': 'queue.html',
    '/queue.json': 'queue.json',
  };
  const filename = routes[request.url];
  if (filename === undefined) {
    response.writeHead(404).end();
    return;
  }
  try {
    const status = JSON.parse(
      await readFile(path.join(outputDirectory, 'startup-status.json'), 'utf8'),
    );
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
