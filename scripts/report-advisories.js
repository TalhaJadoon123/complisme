/**
 * Security report.
 *
 * `pnpm audit` produces JSON on stdout; this summarises it, explains which
 * advisories are reachable from our own code, and exits non-zero only for
 * advisories we can actually fix. Unpatched transitive advisories in
 * build-time-only packages are reported, not silently ignored.
 *
 *   pnpm audit
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

/**
 * Packages that never reach the production runtime image. Anything only they
 * depend on is build- or download-time code.
 */
const DEV_ONLY_ROOTS = new Set([
  'chokidar',
  'micromatch',
  'puppeteer',
  'puppeteer-core',
  'drizzle-kit',
  'tsx',
  'vitest',
  'vite',
  '@vitest/mocker',
  'esbuild',
  'rollup',
]);

function runAudit() {
  try {
    const raw = execSync('pnpm audit --json', { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const start = raw.indexOf('{');
    return JSON.parse(start > 0 ? raw.slice(start) : raw);
  } catch (error) {
    // pnpm exits non-zero when advisories exist; stdout still holds the JSON.
    const stdout = error.stdout;
    if (stdout) {
      const start = stdout.indexOf('{');
      if (start !== -1) return JSON.parse(stdout.slice(start));
    }
    console.error('Could not run pnpm audit:', error.message);
    return null;
  }
}

/** Map every installed package to the deps that pull it in, for the explanation. */
function buildDependents() {
  const store = path.join(root, 'node_modules', '.pnpm');
  if (!fs.existsSync(store)) return new Map();
  const dependents = new Map();
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
      const deps = { ...pkg.dependencies, ...pkg.optionalDependencies };
      for (const name of Object.keys(deps)) {
        if (!dependents.has(name)) dependents.set(name, new Set());
        dependents.get(name).add(pkg.name);
      }
    }
  }
  return dependents;
}

/**
 * Classify a vulnerable module by how a deployed process could reach it:
 *
 *  - `reachable` — something in our dependency graph declares it, so it can be
 *    required at runtime.
 *  - `dev-only`  — every path to it starts in build/watch tooling.
 *  - `unreachable` — nothing in the graph declares it. The audit sees it in the
 *    store, but no `require()` can resolve it from our source.
 *
 * The distinction matters: an unpatched advisory in a package nothing imports
 * is not a vulnerability in this product, and pretending otherwise trains people
 * to ignore the report.
 */
function classify(moduleName, dependents) {
  const parents = dependents.get(moduleName);
  if (!parents || parents.size === 0) return { level: 'unreachable', parents: [] };
  if ([...parents].every((parent) => DOWNLOAD_ONLY_PARENTS.has(parent))) {
    return { level: 'dev-only', parents: [...parents] };
  }
  if ([...parents].every((parent) => DEV_ONLY_ROOTS.has(parent))) {
    return { level: 'dev-only', parents: [...parents] };
  }
  return { level: 'reachable', parents: [...parents] };
}

/** Puppeteer's postinstall browser download: a script, not a runtime import. */
const DOWNLOAD_ONLY_PARENTS = new Set(['puppeteer', 'puppeteer-core']);

function main() {
  const audit = runAudit();
  if (!audit) process.exit(1);

  const counts = audit.metadata?.vulnerabilities ?? {};
  const advisories = Object.values(audit.advisories ?? {});
  const dependents = buildDependents();

  console.log('');
  console.log('CompliSME security report');
  console.log('=========================');
  console.log(
    `critical ${counts.critical ?? 0}  high ${counts.high ?? 0}  ` +
      `moderate ${counts.moderate ?? 0}  low ${counts.low ?? 0}  info ${counts.info ?? 0}`,
  );

  if (advisories.length === 0) {
    console.log('\nNo known advisories.\n');
    process.exit(0);
  }

  const rows = advisories.map((advisory) => {
    const { level, parents } = classify(advisory.module_name, dependents);
    const fixable = advisory.patched_versions && advisory.patched_versions !== '<0.0.0>';
    return { advisory, level, fixable, parents: parents.slice(0, 3) };
  });

  const levelRank = { reachable: 0, 'dev-only': 1, unreachable: 2 };
  const rank = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };
  rows.sort(
    (a, b) =>
      levelRank[a.level] - levelRank[b.level] ||
      rank[a.advisory.severity] - rank[b.advisory.severity] ||
      a.advisory.module_name.localeCompare(b.advisory.module_name),
  );

  console.log('');
  for (const { advisory, level, fixable, parents } of rows) {
    const label = {
      reachable: 'REACHABLE',
      'dev-only': 'DEV/BUILD ONLY',
      unreachable: 'NOT IN DEP GRAPH',
    }[level];
    const tags = [
      advisory.severity.toUpperCase(),
      advisory.module_name,
      fixable ? `fixable -> ${advisory.patched_versions}` : 'NO PATCH AVAILABLE',
      label,
    ];
    console.log(`  [${tags.join('] [')}]`);
    console.log(`      ${advisory.title}`);
    if (parents.length) console.log(`      via: ${parents.join(', ')}`);
  }

  const reachable = rows.filter((r) => r.level === 'reachable');
  const devOnly = rows.filter((r) => r.level === 'dev-only');
  const unreachable = rows.filter((r) => r.level === 'unreachable');
  const actionable = reachable.filter((r) => r.fixable);

  console.log('');
  console.log(`  ${reachable.length} reachable from application code.`);
  console.log(`  ${devOnly.length} confined to dev/build tooling.`);
  console.log(`  ${unreachable.length} present in the store but not in our dependency graph.`);
  const unpatched = advisories.filter((a) => a.patched_versions === '<0.0.0>').length;
  console.log(`  ${unpatched} have no upstream patch.`);
  console.log('');

  if (actionable.length) {
    console.log('  Action required: run `pnpm audit fix`, then re-verify.');
    process.exit(1);
  }
  console.log('  Nothing actionable. Remaining advisories are unpatched dev-only tooling.');
  console.log('');
}

main();