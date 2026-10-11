// Adds the executable shebang and the executable bit to the compiled entrypoint.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'dist', 'cli.js');

if (!fs.existsSync(target)) {
  console.error(`[desktop] compiled entrypoint not found at ${target}`);
  process.exit(1);
}

const source = fs.readFileSync(target, 'utf8');
if (!source.startsWith('#!')) {
  fs.writeFileSync(target, `#!/usr/bin/env node\n${source}`);
}
try {
  fs.chmodSync(target, 0o755);
} catch {
  // no-op on Windows
}
console.log(`[desktop] executable ready: ${path.relative(path.resolve(root, '..'), target)}`);