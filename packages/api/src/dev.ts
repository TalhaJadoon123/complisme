/** Dev entrypoint with hot reload (`pnpm --filter @complisme/api dev`). */

import { start } from './main';

start().catch((error) => {
  console.error(`failed to start: ${error.message}`);
  process.exit(1);
});