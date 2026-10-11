#!/usr/bin/env node
/**
 * Remove build output.
 *
 * The previous `rimraf` glob form fails on Windows here with "Illegal characters
 * in path" and silently deletes nothing, which left stale `dist` directories in
 * place. Stale artifacts are worse than no artifacts: `tsc -b` will not
 * recompile a project whose output it believes is current, so a rebuild can
 * ship code that does not match the source. This script is plain fs, so it
 * behaves identically on every platform.
 *
 * tsbuildinfo is removed as well as dist. Keeping it is what allows the stale
 * build above to happen in the first place.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packagesDir = path.join(root, 'packages');

const removed = [];

/** Delete a file or directory tree. Missing paths are not an error. */
function remove(target) {
  if (!fs.existsSync(target)) return false;
  fs.rmSync(target, { recursive: true, force: true });
  removed.push(path.relative(root, target));
  return true;
}

if (fs.existsSync(packagesDir)) {
  for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkg = path.join(packagesDir, entry.name);
    remove(path.join(pkg, 'dist'));
    remove(path.join(pkg, '.next'));
    remove(path.join(pkg, 'tsconfig.tsbuildinfo'));
  }
}

remove(path.join(root, 'coverage'));
remove(path.join(root, 'tsconfig.tsbuildinfo'));

process.stdout.write(
  removed.length
    ? `clean: removed ${removed.length} path(s)\n${removed.map((p) => `  ${p}`).join('\n')}\n`
    : 'clean: nothing to remove\n',
);