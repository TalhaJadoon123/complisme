// Determine which packages pull in the remaining unpatched advisories, so we
// can confirm they are build-time only and never reach the production image.
const fs = require('node:fs');
const path = require('node:path');

const store = path.resolve(__dirname, '..', 'node_modules', '.pnpm');
const targets = ['extract-zip', 'braces', 'basic-ftp'];

for (const target of targets) {
  const dependents = new Set();
  for (const entry of fs.readdirSync(store)) {
    const nm = path.join(store, entry, 'node_modules');
    if (!fs.existsSync(nm)) continue;
    const manifest = path.join(nm, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    } catch {
      continue;
    }
    const deps = { ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.devDependencies };
    for (const field of Object.keys(deps)) {
      if (field === target) dependents.add(`${pkg.name} (${field})`);
    }
  }
  console.log(`${target}:`);
  if (dependents.size === 0) console.log('  (no dependents found)');
  for (const d of [...dependents].sort()) console.log(`  <- ${d}`);
  console.log('');
}