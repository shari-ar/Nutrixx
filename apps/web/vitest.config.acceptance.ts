import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { baseVitestTestConfig } from '@nutrixx/config/vitest';
import { defineConfig } from 'vitest/config';

const appDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: '@', replacement: appDirectory }],
  },
  test: {
    ...baseVitestTestConfig,
    name: 'web:stage-4-acceptance',
    root: appDirectory,
    environment: 'node',
    include: ['lib/*.acceptance.ts'],
    maxWorkers: 1,
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
