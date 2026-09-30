import { baseVitestTestConfig } from '@nutrixx/config/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    ...baseVitestTestConfig,
    name: 'persistence-indexeddb:contract',
    root: import.meta.dirname,
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
