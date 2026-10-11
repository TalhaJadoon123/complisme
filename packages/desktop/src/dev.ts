/** Dev entrypoint: `pnpm --filter @complisme/desktop dev`. */
import { launch } from './cli';

launch().catch((error: Error) => {
  process.stderr.write(`failed to start: ${error.message}\n`);
  process.exit(1);
});