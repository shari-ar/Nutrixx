import {
  baseCoverageThresholds,
  baseVitestTestConfig,
} from '@nutrixx/config/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    ...baseVitestTestConfig,
    name: 'api:unit',
    root: import.meta.dirname,
    dir: 'src',
    include: ['**/*.spec.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage/unit',
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts'],
      reportOnFailure: true,
      excludeAfterRemap: true,
      thresholds: baseCoverageThresholds,
    },
  },
});
