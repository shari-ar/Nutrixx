import { baseVitestTestConfig } from '@nutrixx/config/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    ...baseVitestTestConfig,
    name: 'api:e2e',
    root: import.meta.dirname,
    dir: 'test',
    include: ['**/*.e2e-spec.ts'],
    environment: 'node',
    pool: 'forks',
    fileParallelism: false,
    isolate: true,
    testTimeout: 15_000,
    hookTimeout: 30_000,
    teardownTimeout: 10_000,
    env: {
      NODE_ENV: 'test',
    },
  },
});
