#!/usr/bin/env node
/**
 * Publish a scan report's gaps as GitHub issues.
 *
 *   node packages/scanner/scripts/publish-findings.js scan.json
 *
 * Idempotent by design: each issue carries a stable key derived from the
 * framework, article and rule, and an existing issue with that key is skipped.
 * Re-running the workflow therefore produces no duplicate issues.
 */

async function main() {
  const reportPath = process.argv[2] ?? 'scan.json';
  const fs = require('node:fs');

  if (!fs.existsSync(reportPath)) {
    process.stderr.write(`report not found: ${reportPath}\n`);
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { findingsToIssues, publishIssues } = require('../dist/index.js');

  const issues = findingsToIssues(report.findings ?? [], {
    prefix: process.env.GITHUB_TITLE_PREFIX ?? '[compliance]',
  });

  const result = await publishIssues(issues, {
    repo: process.env.GITHUB_REPOSITORY ?? '',
    token: process.env.GITHUB_TOKEN,
  });

  process.stdout.write(
    `\n${result.published ? 'published' : 'not published'}: ` +
      `${result.created.length} created, ${result.skipped} skipped, ${issues.length} considered\n` +
      `${result.reason ? `reason: ${result.reason}\n` : ''}\n`,
  );

  if (!result.published) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`publish failed: ${error.message}\n`);
  process.exit(1);
});