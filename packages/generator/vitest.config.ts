import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'generator',
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});