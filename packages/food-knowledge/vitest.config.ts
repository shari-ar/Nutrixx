import { baseVitestTestConfig } from '@nutrixx/config/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    ...baseVitestTestConfig,
    name: 'food-knowledge:unit',
    root: import.meta.dirname,
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
