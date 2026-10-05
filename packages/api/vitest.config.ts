import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'api',
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    // Fastify inject() is synchronous but the registry is process-global; keep
    // one worker so test order is deterministic.
    pool: 'forks',
    fileParallelism: false,
  },
});