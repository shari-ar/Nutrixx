import { baseVitestTestConfig } from '@nutrixx/config/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    ...baseVitestTestConfig,
    name: 'persistence-postgresql:contract',
    root: import.meta.dirname,
    include: ['src/**/*.integration.test.ts'],
    environment: 'node',
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
