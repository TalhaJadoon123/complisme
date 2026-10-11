#!/usr/bin/env node
/**
 * Adds the executable shebang and the executable bit to the compiled CLI
 * entrypoint. TypeScript does not emit either.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'dist', 'cli.js');

if (!fs.existsSync(target)) {
  console.error(`[cli] compiled entrypoint not found at ${target}`);
  console.error('[cli] run "tsc -b tsconfig.json" first');
  process.exit(1);
}

const source = fs.readFileSync(target, 'utf8');
if (!source.startsWith('#!')) {
  fs.writeFileSync(target, `#!/usr/bin/env node\n${source}`);
}

try {
  fs.chmodSync(target, 0o755);
} catch {
  // chmod is a no-op on Windows; harmless.
}

console.log(`[cli] executable ready: ${path.relative(path.resolve(root, '..'), target)}`);