/**
 * CLI regression tests for the command surface and for where generated
 * artefacts actually land on disk.
 *
 * Kept apart from the general CLI suite because these are the failures that
 * are invisible in a unit test and only show up when a user runs the binary:
 * an option that exists but is ignored, a document written into the wrong
 * directory, a command that is declared but not wired up.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ComplianceEngine, acme } from '@complisme/core';
import { DocumentGenerator } from '@complisme/generator';

import { buildProgram } from '../src/index';
import { parseValue } from '../src/workspace';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'complisme-cli-paths-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('command surface', () => {
  it('declares every documented command', () => {
    const names = buildProgram().commands.map((c) => c.name());
    for (const command of [
      'init',
      'answer',
      'status',
      'gap',
      'roadmap',
      'scan',
      'generate',
      'evidence',
      'documents',
      'frameworks',
      'publish',
      'status-all',
    ]) {
      expect(names).toContain(command);
    }
  });

  it('accepts every document kind as a --kind choice', () => {
    const generate = buildProgram().commands.find((c) => c.name() === 'generate');
    const kind = generate?.options.find((o) => o.long === '--kind');
    // Commander stores accepted values in `argChoices`; `choices` is the method.
    expect(kind).toBeDefined();
    expect(kind?.argChoices?.length ?? 0).toBeGreaterThan(10);
    expect(kind?.argChoices).toContain('gdpr-dpia');
    expect(kind?.argChoices).toContain('compliance-roadmap');
    expect(kind?.defaultValue).toBe('compliance-roadmap');
  });

  it('exposes the publish flags the GitHub integration needs', () => {
    const publish = buildProgram().commands.find((c) => c.name() === 'publish');
    expect(publish).toBeDefined();
    const flags = publish!.options.map((o) => o.long);
    expect(flags).toEqual(expect.arrayContaining(['--repo', '--scan', '--dry-run', '--limit']));
  });

  it('keeps --scan pointed at a positional path argument', () => {
    const scan = buildProgram().commands.find((c) => c.name() === 'scan');
    const args = (scan as unknown as { registeredArguments: Array<{ name(): string }> })
      .registeredArguments;
    expect(args.map((a) => a.name())).toEqual(['path']);
  });
});

describe('generated artefact locations', () => {
  const gaps = new ComplianceEngine().gapAnalyze(acme, {});

  it('writes into a supplied directory', async () => {
    const outDir = path.join(dir, 'reports');
    const result = await new DocumentGenerator().generate({
      kind: 'compliance-roadmap',
      profile: acme,
      gaps,
      format: 'html',
      outputPath: outDir,
    });

    expect(result.path).toBeTruthy();
    expect(path.dirname(result.path!)).toBe(outDir);
    expect(fs.existsSync(result.path!)).toBe(true);
    expect(fs.statSync(result.path!).size).toBeGreaterThan(1000);
  });

  it('writes to an explicit file path verbatim', async () => {
    const explicit = path.join(dir, 'explicit.html');
    const result = await new DocumentGenerator().generate({
      kind: 'gdpr-dpia',
      profile: acme,
      format: 'html',
      outputPath: explicit,
    });

    expect(result.path).toBe(explicit);
    expect(fs.existsSync(explicit)).toBe(true);
  });

  it('never writes outside the requested directory', async () => {
    const outDir = path.join(dir, 'nested', 'deep');
    const result = await new DocumentGenerator().generate({
      kind: 'gdpr-ropa',
      profile: acme,
      format: 'html',
      outputPath: outDir,
    });

    expect(path.resolve(result.path!).startsWith(path.resolve(outDir))).toBe(true);
    // The parent directory holds exactly the one file we asked for.
    expect(fs.readdirSync(outDir)).toHaveLength(1);
  });

  it('derives a dated filename when no output path is given', () => {
    const name = new DocumentGenerator().filename(
      { kind: 'gdpr-ropa', profile: acme } as never,
      'pdf',
    );
    expect(name).toMatch(/^gdpr-ropa-acme-analytics-bv-\d{4}-\d{2}-\d{2}\.pdf$/);
  });
});

describe('answer value parsing', () => {
  it('maps the CLI spellings onto the domain types', () => {
    expect(parseValue('true')).toBe(true);
    expect(parseValue('no')).toBe(false);
    expect(parseValue('42')).toBe(42);
    expect(parseValue('documented')).toBe('documented');
    expect(parseValue('')).toBeNull();
  });
});
