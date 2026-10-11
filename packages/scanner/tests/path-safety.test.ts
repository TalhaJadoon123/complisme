import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CodeScanner } from '../src/scanner';
import { displayPath, isWithin, resolveWithin } from '../src/path-safety';

let root: string;
let sibling: string;

beforeAll(() => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'complisme-path-'));
  root = path.join(base, 'workspace');
  sibling = `${root}-secrets`; // The exact prefix-confusion case.
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(sibling, { recursive: true });

  fs.writeFileSync(
    path.join(root, 'src', 'app.ts'),
    "const email = 'a@b.com';\nexport const openaiKey = 'x';\n",
    'utf8',
  );
  fs.writeFileSync(path.join(sibling, 'secret.ts'), "const password = 'hunter2';\n", 'utf8');
});

afterAll(() => {
  fs.rmSync(path.dirname(root), { recursive: true, force: true });
});

describe('isWithin', () => {
  it('accepts the root itself and its descendants', () => {
    expect(isWithin('/srv/app', '/srv/app')).toBe(true);
    expect(isWithin('/srv/app', '/srv/app/src/index.ts')).toBe(true);
    expect(isWithin('/srv/app', '/srv/app/deep/nested/file.ts')).toBe(true);
  });

  it('rejects a sibling directory that shares a string prefix', () => {
    // This is the bug that startsWith() misses:
    // '/srv/app-secrets' starts with '/srv/app'.
    expect(isWithin('/srv/app', '/srv/app-secrets')).toBe(false);
    expect(isWithin('/srv/app', '/srv/app-secrets/secret.ts')).toBe(false);
    expect('/srv/app-secrets/secret.ts'.startsWith('/srv/app')).toBe(true); // the trap
  });

  it('rejects traversal and parent escapes', () => {
    expect(isWithin('/srv/app', '/srv/app/../etc/passwd')).toBe(false);
    expect(isWithin('/srv/app', '/etc/passwd')).toBe(false);
    expect(isWithin('/srv/app', '/srv')).toBe(false);
  });

  it('is not fooled by a directory named like the root plus a dot', () => {
    expect(isWithin('/srv/app', '/srv/app.old/x')).toBe(false);
    expect(isWithin('/srv/app', '/srv/application')).toBe(false);
  });
});

describe('resolveWithin', () => {
  it('resolves a relative path against the root', () => {
    const resolved = resolveWithin(root, 'src');
    expect(resolved).toBe(path.join(root, 'src'));
  });

  it('resolves an absolute path that is inside the root', () => {
    expect(resolveWithin(root, path.join(root, 'src', 'app.ts'))).not.toBeNull();
  });

  it('refuses the sibling-prefix escape', () => {
    expect(resolveWithin(root, sibling)).toBeNull();
    expect(resolveWithin(root, path.join(sibling, 'secret.ts'))).toBeNull();
  });

  it('refuses traversal out of the root', () => {
    expect(resolveWithin(root, '../..')).toBeNull();
    expect(resolveWithin(root, path.join(root, '..', '..', 'etc', 'passwd'))).toBeNull();
  });

  it('refuses a path that does not exist', () => {
    expect(resolveWithin(root, 'does-not-exist')).toBeNull();
  });

  it('refuses a symlink that escapes the root', () => {
    const link = path.join(root, 'escape-link');
    try {
      fs.symlinkSync(path.join(sibling, 'secret.ts'), link, 'file');
    } catch {
      // Symlink creation can fail without developer mode on Windows; the
      // remaining assertions still cover the traversal cases.
      return;
    }
    expect(resolveWithin(root, link)).toBeNull();
    fs.unlinkSync(link);
  });

  it('allows a symlink that stays inside the root when explicitly permitted', () => {
    const link = path.join(root, 'inside-link');
    try {
      fs.symlinkSync(path.join(root, 'src', 'app.ts'), link, 'file');
    } catch {
      return;
    }
    expect(resolveWithin(root, link, { allowSymlinks: true })).not.toBeNull();
    fs.unlinkSync(link);
  });
});

describe('displayPath', () => {
  it('shows a relative path for contained targets', () => {
    expect(displayPath('/srv/app', '/srv/app/src/app.ts')).toBe('src/app.ts');
  });

  it('falls back to the basename for escapes', () => {
    expect(displayPath('/srv/app', '/etc/passwd')).toBe('passwd');
  });
});

describe('scanner confinement', () => {
  it('never reads a file outside the root it was given', async () => {
    const result = await new CodeScanner().scan({ root });
    const files = result.findings.map((f) => f.file);
    expect(files.some((f) => f.includes('secret.ts'))).toBe(false);
    expect(files.some((f) => f.includes('workspace-secrets'))).toBe(false);
  });

  it('records the root it actually scanned', async () => {
    const result = await new CodeScanner().scan({ root });
    expect(path.resolve(result.root)).toBe(path.resolve(root));
  });
});
