#!/usr/bin/env node
/**
 * Copies the YAML framework definitions next to the compiled output so that the
 * loader works identically from `src` (tsx / tests) and from `dist` (production).
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'definitions');
const dest = path.join(root, 'dist', 'definitions');

if (!fs.existsSync(src)) {
  console.error(`[frameworks] no definitions directory at ${src}`);
  process.exit(1);
}
fs.mkdirSync(dest, { recursive: true });
let count = 0;
for (const file of fs.readdirSync(src)) {
  if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;
  fs.copyFileSync(path.join(src, file), path.join(dest, file));
  count++;
}
console.log(`[frameworks] copied ${count} definition file(s) -> ${path.relative(root, dest)}`);