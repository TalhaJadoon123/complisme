// One-off maintenance script: quote plain-scalar YAML list items that contain
// ": " so the `yaml` parser does not read them as mappings.
const fs = require('node:fs');
const path = require('node:path');

const dir = path.resolve(__dirname, '..', 'definitions');
const identifier = /^[A-Za-z_][A-Za-z0-9_-]*$/;

for (const file of fs.readdirSync(dir)) {
  if (!/\.ya?ml$/.test(file)) continue;
  const lines = fs.readFileSync(path.join(dir, file), 'utf8').split(/\r?\n/);
  let changed = 0;
  const out = lines.map((line) => {
    const m = /^(\s*-\s+)(?!['"])(.*)$/.exec(line);
    if (!m) return line;
    const body = m[2];
    const colon = body.indexOf(': ');
    if (colon === -1) return line;
    const head = body.slice(0, colon);
    if (identifier.test(head)) return line; // genuine mapping item
    changed++;
    return `${m[1]}"${body.replace(/"/g, '\\"')}"`;
  });
  if (changed) {
    fs.writeFileSync(path.join(dir, file), out.join('\n'));
    console.log(`${file}: quoted ${changed} scalar list item(s)`);
  }
}