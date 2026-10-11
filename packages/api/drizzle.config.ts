/**
 * Drizzle Kit configuration.
 *
 *   pnpm --filter @complisme/api exec drizzle-kit push     # apply the schema
 *   pnpm --filter @complisme/api exec drizzle-kit generate # emit SQL migrations
 *
 * `push` is the right command for a self-hosted SME install; `generate` is for
 * deployments that want migrations under version control.
 */

import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://complisme:complisme@localhost:5432/complisme',
  },
  verbose: true,
  strict: false,
} satisfies Config;