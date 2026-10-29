import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  API_BASE_PATH,
  API_HEALTH_PATH,
  DEFAULT_API_PORT,
  DEFAULT_GITHUB_REPOSITORY,
  DEFAULT_PUBLIC_API_URL,
  DEFAULT_RADAR_PORT,
  DEFAULT_WEB_ORIGIN,
  DEFAULT_WEB_PORT,
} from '@nutrixx/config/application';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiPort = String(DEFAULT_API_PORT);
const webPort = String(DEFAULT_WEB_PORT);
const radarPort = String(DEFAULT_RADAR_PORT);

const expectations = new Map([
  [
    '.env.example',
    [
      `API_PORT=${apiPort}`,
      `WEB_PORT=${webPort}`,
      `WEB_ORIGIN=${DEFAULT_WEB_ORIGIN}`,
      `NEXT_PUBLIC_API_URL=${DEFAULT_PUBLIC_API_URL}`,
      `NUTRIXX_GITHUB_REPOSITORY=${DEFAULT_GITHUB_REPOSITORY}`,
    ],
  ],
  [
    '.devcontainer/devcontainer.json',
    [`"forwardPorts": [${webPort}, ${apiPort}, ${radarPort}]`],
  ],
  [
    'infra/docker/Dockerfile',
    [`ARG NEXT_PUBLIC_API_URL=${DEFAULT_PUBLIC_API_URL}`],
  ],
  [
    'infra/compose/compose.yaml',
    [DEFAULT_WEB_ORIGIN, DEFAULT_PUBLIC_API_URL, API_HEALTH_PATH],
  ],
  [
    'infra/compose/compose.dev.yaml',
    [
      `http://api:${apiPort}${API_BASE_PATH}`,
      DEFAULT_GITHUB_REPOSITORY,
      `127.0.0.1:${radarPort}:${radarPort}`,
    ],
  ],
  [
    'packages/contracts/openapi/nutrixx.openapi.yaml',
    [`url: ${API_BASE_PATH}`],
  ],
  ['.github/workflows/ci.yml', [API_HEALTH_PATH, `127.0.0.1:${webPort}`]],
]);

const violations = [];
for (const [relativePath, fragments] of expectations) {
  const content = await readFile(path.join(root, relativePath), 'utf8');
  for (const fragment of fragments) {
    if (!content.includes(fragment))
      violations.push(`${relativePath} is missing ${JSON.stringify(fragment)}`);
  }
}

if (violations.length > 0)
  throw new TypeError(
    `Static configuration differs from @nutrixx/config:\n${violations.join('\n')}`,
  );

console.log('Cross-format configuration consistency: valid');
