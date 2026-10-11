import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'scanner',
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});