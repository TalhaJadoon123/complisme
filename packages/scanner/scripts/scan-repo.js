#!/usr/bin/env node
/**
 * Scan a directory and write the result as JSON.
 *
 * Used by the compliance-scan workflow and available locally:
 *
 *   node packages/scanner/scripts/scan-repo.js . scan.json
 *
 * Exits non-zero when `--fail-on` is given and findings meet that severity, so
 * it can gate a pipeline. Without `--fail-on` it always exits 0, because a
 * compliance report is informational by nature.
 */

const path = require('node:path');

async function main() {
  const argv = process.argv.slice(2);

  // Positional form: `scan-repo.js <root> [out]`. `--out` wins if both given.
  // Flags are filtered out first so `--out x` is never mistaken for a root.
  const positionals = argv.filter((a, i) => {
    if (a.startsWith('--')) return false;
    // Skip the value belonging to a preceding --flag.
    const flag = argv[i - 1];
    return !flag || !flag.startsWith('--');
  });
  const root = positionals[0] ?? '.';
  const outFlagIndex = argv.indexOf('--out');
  const out = outFlagIndex !== -1 ? argv[outFlagIndex + 1] : positionals[1] ?? 'scan.json';
  const failIndex = argv.indexOf('--fail-on');
  const failOn = failIndex !== -1 ? argv[failIndex + 1] : undefined;
  const rulesetIndex = argv.indexOf('--ruleset');
  const ruleset = rulesetIndex !== -1 ? argv[rulesetIndex + 1] : 'all';
  if (!out) {
    process.stderr.write('--out was given without a value\n');
    process.exit(2);
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { CodeScanner, summariseScan } = require('../dist/index.js');

  const scanner = new CodeScanner();
  const result = await scanner.scan({ root: path.resolve(root), ruleset });

  const summary = summariseScan(result);
  const report = {
    root: result.root,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    filesScanned: result.filesScanned,
    languages: result.languages,
    parsers: result.parsers,
    summary,
    findings: result.findings,
    gaps: result.gaps,
    truncated: result.truncated,
    errors: result.errors,
  };

  // Create the parent directory: CI writes to a nested path that does not exist
  // yet, and failing there is a confusing way to lose a report.
  require('node:fs').mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  require('node:fs').writeFileSync(out, JSON.stringify(report, null, 2), 'utf8');

  process.stdout.write(
    `\nScanned ${result.filesScanned} files — ${summary.total} findings ` +
      `(${Object.entries(summary.bySeverity)
        .map(([k, v]) => `${v} ${k}`)
        .join(', ')})\n` +
      `${result.gaps.length} compliance gap(s) derived.\n` +
      `Report written to ${out}\n\n`,
  );

  if (failOn) {
    const rank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    const limit = rank[failOn];
    const matched = result.findings.filter((f) => (rank[f.severity] ?? 9) <= limit);
    if (matched.length) {
      process.stderr.write(`${matched.length} finding(s) at or above ${failOn}\n`);
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  process.stderr.write(`scan failed: ${error.message}\n`);
  process.exit(1);
});