// Locate which package tree actually contains extract-zip, and whether any
// declared dependency pulls it in. Used to justify the security report.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const store = path.join(root, 'node_modules', '.pnpm');

const vulnerable = 'extract-zip';

// 1. Where does it physically live?
const locations = [];
for (const entry of fs.readdirSync(store)) {
  if (!entry.startsWith(`${vulnerable}@`)) continue;
  const pkgDir = path.join(store, entry, 'node_modules');
  locations.push({
    storeEntry: entry,
    present: fs.existsSync(path.join(pkgDir, vulnerable)),
  });
}
console.log('store entries:', locations);

// 2. Which packages declare it (any dependency field)?
const users = new Map();
for (const entry of fs.readdirSync(store)) {
  const nm = path.join(store, entry, 'node_modules');
  if (!fs.existsSync(nm)) continue;
  for (const sub of fs.readdirSync(nm)) {
    const manifest = path.join(nm, sub, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    } catch {
      continue;
    }
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      if (pkg[field] && pkg[field][vulnerable]) {
        const key = `${pkg.name}@${pkg.version ?? '?'} (${field})`;
        users.set(key, (users.get(key) ?? 0) + 1);
      }
    }
  }
}
console.log('\ndeclared dependents:');
if (users.size === 0) console.log('  none — the package is present in the store but nothing declares it');
for (const [name] of users) console.log(`  ${name}`);
