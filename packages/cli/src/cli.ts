#!/usr/bin/env node
/**
 * complisme CLI entrypoint.
 * All logic lives in index.ts so it can be tested; this file only wires up
 * process-level concerns (unhandled rejections, exit codes).
 */

import { main } from './index';

main(process.argv).catch((error) => {
  process.stderr.write(`error ${(error as Error).message}\n`);
  process.exitCode = 1;
});