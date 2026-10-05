/**
 * Codebase scanner.
 *
 * Walks a directory, parses each supported file, applies the rule set and
 * returns findings, a reconstructed data-flow graph and compliance gaps.
 *
 * Design constraints:
 *  - No network access, no code execution, no native compilation.
 *  - Bounded: file count, file size and total bytes are capped.
 *  - Deterministic: findings are sorted, ids are content-derived.
 */

import fs from 'node:fs';
import path from 'node:path';

import { findingsToGaps } from '@complisme/core';
import { nowIso, relativePath, stableId, uniq } from '@complisme/shared';
import type {
  DataFlow,
  DataFlowEdge,
  DataFlowNode,
  Finding,
  FindingCategory,
  ScanOptions,
  ScanResult,
} from '@complisme/shared';

import {
  TreeSitterParser,
  defaultParsers,
  languageOf,
  treeSitterAvailable,
  type Language,
  type ParsedFile,
  type Parser,
} from './parser';
import { isWithin } from './path-safety';
import { RULES, finding as makeFinding, type Rule, type RuleContext } from './rules';

export const DEFAULT_EXCLUDES = [
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'out',
  'coverage',
  'vendor',
  'venv',
  '.venv',
  '__pycache__',
  '.mypy_cache',
  '.pytest_cache',
  'target',
  'bin',
  'obj',
  '.gradle',
  '.idea',
  '.vscode',
  'bower_components',
  '.tmp',
  '.data',
  'migrations',
  '*.min.js',
  '*.lock',
  '*.snap',
];

export interface ScanResultInternal extends ScanResult {
  /** Files that could not be parsed, or that were skipped for a safety reason. */
  skipped: Array<{ file: string; reason: string }>;
}

/** `realpathSync` that degrades to the resolved path instead of throwing. */
function safeRealpath(target: string): string {
  try {
    return fs.realpathSync(target);
  } catch {
    return path.resolve(target);
  }
}

export class CodeScanner {
  private readonly parsers: Parser[];

  constructor(options: { treeSitter?: TreeSitterParser } = {}) {
    this.parsers = defaultParsers(options.treeSitter);
  }

  /** Scan a directory tree (or a single file). */
  async scan(options: ScanOptions): Promise<ScanResultInternal> {
    const startedAt = nowIso();
    const root = path.resolve(options.root);
    const maxFiles = options.maxFiles ?? 5000;
    const maxFileSize = options.maxFileSizeBytes ?? 1_500_000;

    if (!fs.existsSync(root)) {
      throw new Error(`scan root does not exist: ${root}`);
    }

    // Defence in depth: even though the API validates the path before calling
    // in, the scanner itself must never read outside the root it was given.
    const realRoot = safeRealpath(root);

    const files = this.collectFiles(root, options, maxFiles);
    const fileListTruncated = files.length >= maxFiles;
    const findings: Finding[] = [];
    const dataFlow: DataFlow = { nodes: [], edges: [] };
    const languages: Record<string, number> = {};
    const parsersUsed: Record<string, string> = {};
    const errors: string[] = [];
    const skipped: Array<{ file: string; reason: string }> = [];

    let filesScanned = 0;
    let bytesScanned = 0;
    let truncated = false;

    for (const file of files) {
      const language = languageOf(file);
      if (language === 'unknown') continue;
      if (options.languages && !options.languages.includes(language as never)) continue;

      let stat: fs.Stats;
      try {
        stat = fs.statSync(file);
      } catch {
        skipped.push({ file: relativePath(root, file), reason: 'stat failed' });
        continue;
      }
      // Re-check containment on the resolved path before reading anything.
      if (!isWithin(realRoot, safeRealpath(file))) {
        skipped.push({ file: relativePath(root, file), reason: 'resolves outside the scan root' });
        continue;
      }
      if (stat.size > maxFileSize) {
        skipped.push({ file: relativePath(root, file), reason: `larger than ${maxFileSize} bytes` });
        continue;
      }
      if (filesScanned >= maxFiles) {
        truncated = true;
        break;
      }

      let source: string;
      try {
        source = fs.readFileSync(file, 'utf8');
      } catch (error) {
        skipped.push({ file: relativePath(root, file), reason: (error as Error).message });
        continue;
      }

      const parser = this.parsers.find((p) => p.supports(language));
      if (!parser) {
        skipped.push({ file: relativePath(root, file), reason: `no parser for ${language}` });
        continue;
      }

      let parsed: ParsedFile;
      try {
        parsed = parser.parse(file, source);
      } catch (error) {
        errors.push(`${relativePath(root, file)}: ${(error as Error).message}`);
        skipped.push({ file: relativePath(root, file), reason: 'parse error' });
        continue;
      }

      filesScanned += 1;
      bytesScanned += stat.size;
      languages[language] = (languages[language] ?? 0) + 1;
      parsersUsed[language] = parsed.parser;

      const relFile = relativePath(root, file);
      const context: RuleContext = { file, relFile, source, parsed, language };

      for (const rule of this.rulesFor(options.ruleset ?? 'all')) {
        let matches: ReturnType<Rule['match']> = [];
        try {
          matches = rule.match(context);
        } catch (error) {
          errors.push(`rule ${rule.id} failed on ${relFile}: ${(error as Error).message}`);
          continue;
        }
        for (const match of matches) {
          findings.push(makeFinding(rule, context, match.event, match.confidence, match.note));
        }
      }

      collectDataFlow(relFile, parsed, dataFlow);
    }

    const deduped = dedupeFindings(findings);
    const filtered = options.failOn
      ? deduped.filter((f) => severityRank(f.severity) <= severityRank(options.failOn!))
      : deduped;

    const finishedAt = nowIso();

    return {
      root,
      startedAt,
      finishedAt,
      filesScanned,
      bytesScanned,
      languages,
      parsers: parsersUsed,
      findings: filtered,
      dataFlow,
      gaps: findingsToGaps(filtered, { ruleset: options.ruleset }),
      truncated: truncated || fileListTruncated,
      errors: errors.length ? errors.slice(0, 50) : undefined,
      skipped,
    };
  }

  /** Rule set filtered by ruleset option. */
  rulesFor(ruleset: 'gdpr' | 'ai-act' | 'all' = 'all'): Rule[] {
    if (ruleset === 'all') return RULES;
    const allowed: FindingCategory[] =
      ruleset === 'gdpr'
        ? ['pii-collection', 'sensitive-data', 'consent', 'retention', 'personal-data-logging', 'data-transfer', 'encryption', 'access-control', 'cookie-consent', 'profiling', 'biometric', 'unstructured-storage']
        : ['ai-api-call', 'profiling', 'biometric', 'pii-collection', 'sensitive-data', 'data-transfer', 'encryption', 'unstructured-storage'];
    return RULES.filter((rule) => allowed.includes(rule.category));
  }

  /** Enumerate scannable files honouring include/exclude globs. */
  private collectFiles(root: string, options: ScanOptions, maxFiles: number): string[] {
    const include = options.include?.length ? options.include : undefined;
    const exclude = [...DEFAULT_EXCLUDES, ...(options.exclude ?? [])];
    const out: string[] = [];

    const matches = (rel: string): boolean => {
      const base = rel.split('/').pop() ?? rel;
      const excluded = exclude.some((pattern) => matchesPattern(rel, pattern) || matchesPattern(base, pattern));
      if (excluded) return false;
      if (!include) return true;
      return include.some((pattern) => matchesPattern(rel, pattern) || matchesPattern(base, pattern));
    };

    /**
     * Symlinks are not followed. A link inside the tree pointing at /etc or at
     * the user's home directory would turn a read-only scanner into a filesystem
     * oracle, and there is no compliance reason to follow one out of the tree.
     */
    const walk = (dir: string): void => {
      if (out.length >= maxFiles) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (out.length >= maxFiles) return;
        if (entry.isSymbolicLink()) continue;
        const full = path.join(dir, entry.name);
        const rel = relativePath(root, full);
        if (entry.isDirectory()) {
          if (exclude.some((p: string) => matchesPattern(entry.name, p))) continue;
          walk(full);
          continue;
        }
        if (!entry.isFile()) continue;
        if (!matches(rel)) continue;
        out.push(full);
      }
    };

    let rootStat: fs.Stats;
    try {
      rootStat = fs.statSync(root);
    } catch {
      return [];
    }
    if (rootStat.isFile()) return [root];
    walk(root);
    return out;
  }
}

/**
 * Glob matching for include/exclude patterns.
 *
 * Compiled patterns are cached: the walk calls this once per file per pattern,
 * and recompiling a regex on a large tree is a measurable cost. Patterns come
 * from operator configuration, not from end users, but caching also keeps a
 * pathological pattern from being recompiled thousands of times.
 */
const patternCache = new Map<string, RegExp>();

function matchesPattern(value: string, pattern: string): boolean {
  if (pattern === value) return true;
  let regex = patternCache.get(pattern);
  if (!regex) {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*\//g, '(?:.*/)?')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.');
    regex = new RegExp(`^${escaped}$`);
    // Bound the cache so a dynamic caller cannot grow it without limit.
    if (patternCache.size > 500) patternCache.clear();
    patternCache.set(pattern, regex);
  }
  return regex.test(value);
}

function severityRank(severity: string): number {
  return { critical: 0, high: 1, medium: 2, low: 3, info: 4 }[severity] ?? 5;
}

function dedupeFindings(findings: Finding[]): Finding[] {
  const seen = new Map<string, Finding>();
  for (const f of findings) {
    const key = `${f.file}:${f.line}:${f.ruleId}`;
    const existing = seen.get(key);
    if (!existing || f.confidence > existing.confidence) seen.set(key, f);
  }
  return [...seen.values()].sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.ruleId.localeCompare(b.ruleId),
  );
}

/**
 * Reconstruct a coarse data-flow graph: identifiers that carry personal data
 * become sources, AI/storage/API calls become sinks, and assignments link them.
 */
function collectDataFlow(relFile: string, parsed: ParsedFile, flow: DataFlow): void {
  const piiNames = new Set<string>();
  const nodesById = new Map<string, DataFlowNode>();

  const addNode = (node: DataFlowNode): void => {
    if (nodesById.has(node.id)) return;
    nodesById.set(node.id, node);
    flow.nodes.push(node);
  };
  const addEdge = (edge: DataFlowEdge): void => {
    const key = `${edge.from}->${edge.to}`;
    if (flow.edges.some((e) => `${e.from}->${e.to}` === key)) return;
    flow.edges.push(edge);
  };

  for (const event of parsed.events) {
    const looksPii = /email|phone|name|address|birth|ssn|user_?id|customer_?id|location|ip|gender|salary/i.test(event.name);

    if (event.kind === 'assignment' || event.kind === 'declaration') {
      const id = stableId('node', relFile, event.line, event.name).slice(0, 12);
      if (looksPii) {
        piiNames.add(event.name);
        addNode({ id, label: event.name, file: relFile, line: event.line, kind: 'source' });
      } else {
        addNode({ id, label: event.name, file: relFile, line: event.line, kind: 'transform' });
      }
      continue;
    }

    if (event.kind === 'call') {
      const tail = (event.name.split('.').pop() ?? event.name).toLowerCase();
      const id = stableId('node', relFile, event.line, event.name).slice(0, 12);
      const kind = /post|get|fetch|request|send|upload|insert|create|save|set|log|print|write|put|add/.test(tail)
        ? 'sink'
        : /transform|map|reduce|filter|parse|format|clean|enrich|aggregate/.test(tail)
          ? 'transform'
          : 'store';
      addNode({ id, label: event.name, file: relFile, line: event.line, kind });
    }
  }

  // Link PII-bearing identifiers to sinks referenced in the same file.
  const sinkIds = flow.nodes
    .filter((n) => n.file === relFile && n.kind === 'sink')
    .map((n) => n.id);
  const sourceIds = flow.nodes
    .filter((n) => n.file === relFile && n.kind === 'source')
    .map((n) => n.id);

  const aiSinks = flow.nodes.filter((n) => /openai|anthropic|embedding|classify|complete|chat|generate/i.test(n.label));
  for (const ai of aiSinks) {
    for (const source of sourceIds) {
      addEdge({ from: source, to: ai.id, personalData: true, crossesBorder: true, label: 'sent to AI provider' });
    }
  }
  if (sourceIds.length && sinkIds.length) {
    for (const source of sourceIds.slice(0, 20)) {
      addEdge({ from: source, to: sinkIds[0], personalData: true });
    }
  }
}

/** Summarise a scan result for CLI output. */
export function summariseScan(result: ScanResult): {
  total: number;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  frameworks: Record<string, number>;
  filesWithFindings: number;
} {
  const bySeverity: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const frameworks: Record<string, number> = {};
  const files = new Set<string>();

  for (const f of result.findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
    files.add(f.file);
    for (const m of f.mappings) {
      frameworks[m.frameworkId] = (frameworks[m.frameworkId] ?? 0) + 1;
    }
  }

  return {
    total: result.findings.length,
    bySeverity,
    byCategory,
    frameworks,
    filesWithFindings: files.size,
  };
}

/** Build a tree-sitter parser when the WASM runtime and grammars are present. */
export async function tryTreeSitter(options: ScanOptions): Promise<TreeSitterParser | undefined> {
  if (!options.useTreeSitter) return undefined;
  const wasmDir = process.env.TREE_SITTER_WASM_DIR;
  if (!wasmDir || !treeSitterAvailable({ wasmDir })) return undefined;
  const parser = new TreeSitterParser({
    wasmDir,
    grammars: {
      typescript: path.join(wasmDir, 'tree-sitter-typescript.wasm'),
      javascript: path.join(wasmDir, 'tree-sitter-javascript.wasm'),
      python: path.join(wasmDir, 'tree-sitter-python.wasm'),
      go: path.join(wasmDir!, 'tree-sitter-go.wasm'),
    },
  });
  return parser;
}

/** Convenience one-shot scan. */
export async function scanCodebase(options: ScanOptions): Promise<ScanResultInternal> {
  const treeSitter = await tryTreeSitter(options);
  return new CodeScanner({ treeSitter }).scan(options);
}

export type { Language, Parser, ParsedFile };
export { RULES, languageOf, uniq };