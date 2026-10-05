// Report the resolved version of the security-relevant dev dependencies.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'node_modules');
const names = ['vite', 'vitest', 'postcss', 'esbuild', '@vitest/coverage-v8'];

for (const name of names) {
  const manifest = path.join(root, name, 'package.json');
  if (fs.existsSync(manifest)) {
    console.log(`${name.padEnd(24)} ${JSON.parse(fs.readFileSync(manifest, 'utf8')).version}`);
    continue;
  }
  // Look in the pnpm store when not hoisted.
  const store = path.join(root, '.pnpm');
  const match = fs
    .readdirSync(store)
    .filter((entry) => entry.startsWith(`${name.replace('/', '+')}@`))
    .pop();
  if (match) {
    const nested = path.join(store, match, 'node_modules', name, 'package.json');
    if (fs.existsSync(nested)) {
      console.log(`${name.padEnd(24)} ${JSON.parse(fs.readFileSync(nested, 'utf8')).version} (nested)`);
      continue;
    }
  }
  console.log(`${name.padEnd(24)} not found`);
}