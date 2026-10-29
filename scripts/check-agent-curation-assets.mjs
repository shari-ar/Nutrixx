import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AGENT_CURATION_RUNS_ROUTE } from '@nutrixx/config/application';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const promptPath = path.join(root, 'docs/data/agent-curation-prompt.md');
const checksumPath = path.join(root, 'docs/data/agent-curation-prompt.sha256');
const radarServerPath = path.join(
  root,
  '.devcontainer/serve-data-quality-radar.mjs',
);
const queueRendererPath = path.join(
  root,
  'scripts/render-reference-work-queue.mjs',
);
const apiControllerPath = path.join(
  root,
  'apps/api/src/agent-curation.controller.ts',
);

const [prompt, checksumText, radarServer, queueRenderer, apiController] =
  await Promise.all([
    readFile(promptPath),
    readFile(checksumPath, 'utf8'),
    readFile(radarServerPath, 'utf8'),
    readFile(queueRendererPath, 'utf8'),
    readFile(apiControllerPath, 'utf8'),
  ]);
const promptSha256 = createHash('sha256').update(prompt).digest('hex');
const recordedPromptSha256 = checksumText.trim().split(/\s+/u)[0];
if (recordedPromptSha256 !== promptSha256)
  throw new TypeError('The agent curation prompt checksum is stale.');

if (
  !radarServer.includes(
    "request.url === '/agent-curation-runs' && request.method === 'POST'",
  ) ||
  !radarServer.includes('/^\\/agent-curation-runs\\/([a-f0-9-]{36})$/u') ||
  !queueRenderer.includes('id="agent-result-file"') ||
  !queueRenderer.includes("fetch('/agent-curation-runs'") ||
  AGENT_CURATION_RUNS_ROUTE !== 'internal/curation/runs' ||
  !apiController.includes('@Controller(AGENT_CURATION_RUNS_ROUTE)') ||
  !apiController.includes('@Post()') ||
  !apiController.includes("@Get(':runId')")
)
  throw new TypeError(
    'The browser-only agent curation upload workflow is incomplete.',
  );

console.log('Agent curation prompt and browser upload workflow: valid');
