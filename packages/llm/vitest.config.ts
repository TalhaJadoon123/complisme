import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'llm',
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
  },
});