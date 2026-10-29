import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_WEB_ORIGIN } from '@nutrixx/config/application';
import {
  baseCoverageConfig,
  baseVitestTestConfig,
} from '@nutrixx/config/vitest';
import { defineConfig } from 'vitest/config';

const appDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceDirectory = path.resolve(appDirectory, '../..');

export default defineConfig({
  resolve: {
    alias: [
      { find: '@', replacement: appDirectory },
      {
        find: /^react$/,
        replacement: path.join(
          workspaceDirectory,
          'node_modules/react/index.js',
        ),
      },
      {
        find: /^react\/jsx-dev-runtime$/,
        replacement: path.join(
          workspaceDirectory,
          'node_modules/react/jsx-dev-runtime.js',
        ),
      },
      {
        find: /^react\/jsx-runtime$/,
        replacement: path.join(
          workspaceDirectory,
          'node_modules/react/jsx-runtime.js',
        ),
      },
    ],
  },
  test: {
    ...baseVitestTestConfig,
    name: 'web:unit',
    root: appDirectory,
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: DEFAULT_WEB_ORIGIN,
      },
    },
    include: ['**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      ...baseCoverageConfig,
      reportsDirectory: './coverage/unit',
      include: [
        'app/**/*.{ts,tsx}',
        'components/**/*.{ts,tsx}',
        'lib/**/*.{ts,tsx}',
      ],
      exclude: ['**/*.test.{ts,tsx}'],
    },
  },
});
