import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  baseCoverageThresholds,
  baseVitestTestConfig,
} from '@nutrixx/config/vitest';
import { defineConfig } from 'vitest/config';

const appDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': appDirectory,
    },
  },
  test: {
    ...baseVitestTestConfig,
    name: 'web:unit',
    root: appDirectory,
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost:3000',
      },
    },
    include: ['**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage/unit',
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      include: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}'],
      reportOnFailure: true,
      excludeAfterRemap: true,
      thresholds: baseCoverageThresholds,
    },
  },
});
