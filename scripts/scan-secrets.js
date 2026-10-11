#!/usr/bin/env node
/**
 * Pre-commit secret gate.
 *
 * Scans for credential shapes that GitHub's own secret scanning would flag, so a
 * real token never reaches history. Committing a secret is unrecoverable —
 * removing it later still leaves it in the log — so this runs before the commit
 * rather than after.
 *
 *   node scripts/scan-secrets.js        staged changes only (pre-commit)
 *   node scripts/scan-secrets.js --all  every tracked file (CI)
 */
const { execSync } = require('node:child_process');

const PATTERNS = [
  { name: 'GitHub PAT', re: /ghp_[A-Za-z0-9]{20,}/g },
  { name: 'GitHub fine-grained PAT', re: /github_pat_[A-Za-z0-9_]{20,}/g },
  { name: 'OpenAI key', re: /sk-[A-Za-z0-9]{32,}/g },
  { name: 'AWS access key id', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'Slack token', re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: 'Private key block', re: /BEGIN [A-Z ]*PRIVATE KEY/g },
];

// Documentation and fixtures that legitimately describe a shape without
// holding a credential. Keep this list short and justify every entry.
const ALLOW = [
  'README.md',
  '.env.example',
  'packages/scanner/src/demo-fixtures.ts',
];

const scanAll = process.argv.includes('--all');

let lines;
if (scanAll) {
  // CI has nothing staged, so walk every tracked file instead. Binary and
  // generated paths are skipped by the extension allowlist below.
  const files = execSync('git ls-files', { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((f) => /\.(ts|tsx|js|mjs|cjs|json|ya?ml|md|sh|ps1|env.*|example|txt)$/.test(f) || f === '.env.example');

  lines = [];
  for (const file of files) {
    if (ALLOW.includes(file)) continue;
    let content;
    try {
      content = execSync(`git show HEAD:${file}`, {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      // Not in HEAD yet (newly added file): read it from the index instead.
      try {
        content = execSync(`git show :${file}`, {
          encoding: 'utf8',
          maxBuffer: 32 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
      } catch {
        continue;
      }
    }
    for (const line of content.split('\n')) lines.push({ file, text: line });
  }
} else {
  let diff;
  try {
    diff = execSync('git diff --cached --unified=0', {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    process.stderr.write(`could not read staged diff: ${error.message}\n`);
    process.exit(2);
  }

  // Track which file each added line belongs to, so findings are attributable.
  let current = '';
  lines = [];
  for (const line of diff.split('\n')) {
    const fileMatch = line.match(/^\+\+\+ b\/(.*)$/);
    if (fileMatch) {
      current = fileMatch[1];
      continue;
    }
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    lines.push({ file: current, text: line });
  }
}

const findings = [];

for (const { file, text } of lines) {
  if (ALLOW.includes(file)) continue;
  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0;
    const hit = text.match(re);
    if (!hit) continue;
    findings.push({ file, name, sample: hit[0].slice(0, 12) });
  }
}

if (findings.length === 0) {
  process.stdout.write(
    `secret scan: clean (${scanAll ? 'all tracked files' : 'staged changes'})\n`,
  );
  process.exit(0);
}

process.stderr.write(`secret scan: ${findings.length} potential secret(s)\n`);
for (const f of findings) {
  process.stderr.write(`  ${f.name} in ${f.file} (${f.sample}...)\n`);
}
process.exit(1);