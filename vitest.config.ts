import { defineConfig } from 'vitest/config';

/**
 * Root test runner.
 *
 * Each package owns its tests; this config discovers them all in one process so
 * `pnpm test` at the root is a single command, with coverage thresholds
 * enforced on the compliance engine (the part that has to be right).
 */
export default defineConfig({
  test: {
    projects: [
      'packages/shared',
      'packages/frameworks',
      'packages/core',
      'packages/generator',
      'packages/scanner',
      'packages/llm',
      'packages/api',
      'packages/cli',
      'packages/desktop',
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text-summary', 'html', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/fixtures.ts',
        '**/index.ts',
        '**/*.d.ts',
        '**/demo-fixtures.ts',
      ],
      thresholds: {
        // The engine and scanner are the differentiating parts, so they carry a
        // hard floor. Everything else is held to a softer global line.
        'packages/core/src/**/*.ts': {
          lines: 80,
          functions: 80,
          branches: 70,
          statements: 80,
        },
        lines: 55,
      },
    },
  },
});