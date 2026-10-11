/**
 * Path containment.
 *
 * `String.prototype.startsWith` is not a safe containment check: with
 * `SCAN_ROOT=/workspace`, the path `/workspace-secrets/passwd` starts with
 * `/workspace` and would be accepted. Everything that accepts a path from a
 * caller goes through `isWithin` instead, which compares path *segments* and
 * additionally rejects symlinks that resolve outside the root.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * True when `target` is `root` itself or lives underneath it.
 * Both arguments are resolved first; absolute paths are honoured.
 */
export function isWithin(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);

  if (resolvedTarget === resolvedRoot) return true;

  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (!relative) return true;
  // `..` leading means it escaped; an absolute result means a different drive.
  if (relative.startsWith('..')) return false;
  if (path.isAbsolute(relative)) return false;
  return true;
}

/**
 * Resolve a caller-supplied path and confirm it stays inside `root`.
 * Returns `null` when the path escapes, so callers cannot forget to check.
 *
 * `allowSymlinks` defaults to false: a symlink inside the root pointing at
 * `/etc/passwd` is a classic escape and there is no legitimate reason for a
 * compliance scanner to follow one out of the scanned tree.
 */
export function resolveWithin(
  root: string,
  candidate: string,
  options: { allowSymlinks?: boolean } = {},
): string | null {
  const base = path.isAbsolute(candidate) ? candidate : path.resolve(root, candidate);
  const resolved = path.resolve(base);

  if (!isWithin(root, resolved)) return null;

  if (!fs.existsSync(resolved)) return null;

  if (!options.allowSymlinks) {
    let real: string;
    try {
      real = fs.realpathSync(resolved);
    } catch {
      return null;
    }
    // Compare real paths as well, so a symlink cannot step outside.
    let realRoot: string;
    try {
      realRoot = fs.realpathSync(path.resolve(root));
    } catch {
      realRoot = path.resolve(root);
    }
    if (!isWithin(realRoot, real)) return null;
    return resolved;
  }

  return resolved;
}

/**
 * Normalise a path for display and error messages, without leaking absolutes.
 * Separators are normalised to `/` so a finding's file path is identical on
 * Windows and Linux — these strings end up in JSON, in CI diffs and in the
 * compliance documents.
 */
export function displayPath(root: string, target: string): string {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (!relative || relative.startsWith('..')) return path.basename(target);
  return relative.split(path.sep).join('/');
}