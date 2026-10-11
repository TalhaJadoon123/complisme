import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'desktop',
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});