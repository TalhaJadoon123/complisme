// Maintenance helper: ensure each template file imports DocumentContext from ../types.
const fs = require('node:fs');
const path = require('node:path');

const dir = path.resolve(__dirname, '..', 'src', 'templates');
const marker = "import type { DocumentContext } from '../types';";
const files = ['ai-act.ts', 'csrd.ts', 'e-invoicing.ts', 'gdpr.ts'];

for (const file of files) {
  const target = path.join(dir, file);
  let source = fs.readFileSync(target, 'utf8');
  if (source.includes(marker)) {
    console.log(`${file}: already imports DocumentContext`);
    continue;
  }
  const lines = source.split('\n');
  let last = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^import\b.*;\s*$/.test(lines[i]) || /^} from '.*';\s*$/.test(lines[i])) last = i;
  }
  if (last === -1) {
    console.error(`${file}: no import block found`);
    continue;
  }
  lines.splice(last + 1, 0, marker);
  fs.writeFileSync(target, lines.join('\n'));
  console.log(`${file}: inserted import at line ${last + 2}`);
}