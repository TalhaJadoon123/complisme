import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CodeScanner, RULES, hasPii, hasSensitive, isAiProvider, languageOf, summariseScan } from '../src/index';
import { DEMO_FILES, DEMO_GOOD_FILE } from '../src/demo-fixtures';

let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'complisme-scan-'));
  for (const file of [...DEMO_FILES, DEMO_GOOD_FILE]) {
    const target = path.join(root, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content, 'utf8');
  }
  // Something that must be ignored.
  fs.mkdirSync(path.join(root, 'node_modules', 'pkg'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'pkg', 'index.ts'), 'const email = "x@y.com";');
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('language detection', () => {
  it('maps extensions to languages', () => {
    expect(languageOf('a/b.ts')).toBe('typescript');
    expect(languageOf('a/b.tsx')).toBe('typescript');
    expect(languageOf('a/b.py')).toBe('python');
    expect(languageOf('a/b.go')).toBe('go');
    expect(languageOf('a/b.txt')).toBe('unknown');
  });
});

describe('vocabulary helpers', () => {
  it('detects PII field names', () => {
    expect(hasPii('email_address')).toContain('email');
    expect(hasPii('customerId')).toContain('customer_id');
    expect(hasPii('order_total')).toHaveLength(0);
  });

  it('detects special categories', () => {
    expect(hasSensitive('medical_record')).toContain('medical');
    expect(hasSensitive('fingerprint_template')).toContain('fingerprint');
    expect(hasSensitive('invoice_number')).toHaveLength(0);
  });

  it('detects AI providers', () => {
    expect(isAiProvider('openai')).toBe('OpenAI');
    expect(isAiProvider('anthropic.messages')).toBe('Anthropic');
    expect(isAiProvider('lodash.merge')).toBeUndefined();
  });
});

describe('CodeScanner.scan', () => {
  it('scans the tree and reports findings with framework mappings', async () => {
    const scanner = new CodeScanner();
    const result = await scanner.scan({ root });

    expect(result.filesScanned).toBeGreaterThanOrEqual(5);
    expect(result.findings.length).toBeGreaterThan(10);
    for (const finding of result.findings) {
      expect(finding.ruleId).toBeTruthy();
      expect(finding.file).toBeTruthy();
      expect(finding.line).toBeGreaterThan(0);
      expect(finding.confidence).toBeGreaterThan(0);
      expect(finding.confidence).toBeLessThanOrEqual(1);
      expect(finding.mappings.length).toBeGreaterThan(0);
      expect(finding.remediation.length).toBeGreaterThan(20);
    }
  });

  it('never scans node_modules', async () => {
    const result = await new CodeScanner().scan({ root });
    expect(result.findings.every((f) => !f.file.includes('node_modules'))).toBe(true);
  });

  it('flags personal data sent to an AI provider as critical', async () => {
    const result = await new CodeScanner().scan({ root });
    const critical = result.findings.filter(
      (f) => f.ruleId === 'ai-act/pii-to-model' && f.severity === 'critical',
    );
    expect(critical.length).toBeGreaterThan(0);
    expect(critical[0].mappings.some((m) => m.frameworkId === 'eu-ai-act')).toBe(true);
    expect(critical[0].mappings.some((m) => m.frameworkId === 'gdpr')).toBe(true);
  });

  it('flags special category data handling', async () => {
    const result = await new CodeScanner().scan({ root });
    const sensitive = result.findings.filter((f) => f.category === 'sensitive-data');
    expect(sensitive.length).toBeGreaterThan(0);
    expect(sensitive.every((f) => f.severity === 'critical')).toBe(true);
  });

  it('flags logging of personal data', async () => {
    const result = await new CodeScanner().scan({ root });
    const logs = result.findings.filter((f) => f.category === 'personal-data-logging');
    expect(logs.length).toBeGreaterThan(0);
  });

  it('parses Python and Go', async () => {
    const result = await new CodeScanner().scan({ root });
    expect(result.languages.python).toBeGreaterThan(0);
    expect(result.languages.go).toBeGreaterThan(0);
    const py = result.findings.filter((f) => f.file.endsWith('.py'));
    const go = result.findings.filter((f) => f.file.endsWith('.go'));
    expect(py.length).toBeGreaterThan(0);
    expect(go.length).toBeGreaterThan(0);
  });

  it('detects a hardcoded credential in Go', async () => {
    const result = await new CodeScanner().scan({ root });
    const secrets = result.findings.filter((f) => f.ruleId === 'security/hardcoded-secret');
    expect(secrets.length).toBeGreaterThan(0);
  });

  it('produces compliance gaps with stable ids', async () => {
    const first = await new CodeScanner().scan({ root });
    const second = await new CodeScanner().scan({ root });
    expect(first.gaps.map((g) => g.id)).toEqual(second.gaps.map((g) => g.id));
    expect(first.gaps.length).toBeGreaterThan(0);
    for (const gap of first.gaps) {
      expect(gap.source).toBe('scanner');
      expect(gap.remediation.length).toBeGreaterThan(10);
    }
  });

  it('builds a data-flow graph with sources and sinks', async () => {
    const result = await new CodeScanner().scan({ root });
    expect(result.dataFlow.nodes.length).toBeGreaterThan(0);
    expect(result.dataFlow.nodes.some((n) => n.kind === 'source')).toBe(true);
    expect(result.dataFlow.nodes.some((n) => n.kind === 'sink')).toBe(true);
    expect(result.dataFlow.edges.length).toBeGreaterThan(0);
  });

  it('respects the ruleset filter', async () => {
    const gdpr = await new CodeScanner().scan({ root, ruleset: 'gdpr' });
    const ai = await new CodeScanner().scan({ root, ruleset: 'ai-act' });
    expect(gdpr.findings.every((f) => !f.ruleId.startsWith('ai-act/'))).toBe(true);
    expect(gdpr.findings.length).toBeGreaterThan(0);
    expect(ai.findings.length).toBeGreaterThan(0);
    expect(ai.findings.length).toBeLessThan(gdpr.findings.length + 100);
  });

  it('does not flag the compliant file for missing consent', async () => {
    const result = await new CodeScanner().scan({ root });
    const bad = result.findings.filter(
      (f) => f.file.includes('compliant') && f.ruleId === 'consent/missing-before-processing',
    );
    expect(bad).toHaveLength(0);
  });

  it('summarises findings', async () => {
    const result = await new CodeScanner().scan({ root });
    const summary = summariseScan(result);
    expect(summary.total).toBe(result.findings.length);
    expect(Object.keys(summary.byCategory).length).toBeGreaterThan(3);
    expect(summary.frameworks['gdpr']).toBeGreaterThan(0);
  });

  it('throws on a missing root', async () => {
    await expect(new CodeScanner().scan({ root: '/does/not/exist' })).rejects.toThrow();
  });

  it('honours maxFiles', async () => {
    const result = await new CodeScanner().scan({ root, maxFiles: 1 });
    expect(result.filesScanned).toBeLessThanOrEqual(1);
    expect(result.truncated).toBe(true);
  });

  it('has unique rule ids', () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});