import {
  baseCoverageConfig,
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
      ...baseCoverageConfig,
      reportsDirectory: './coverage/unit',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts'],
    },
  },
});
