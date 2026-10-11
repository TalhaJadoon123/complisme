import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { acme, vistaSul } from '@complisme/core';

import {
  STATE_DIR_NAME,
  addEvidence,
  appendHistory,
  ensureWorkspace,
  loadAnswers,
  loadDocuments,
  loadEvidence,
  loadHistory,
  loadProfile,
  outputDir,
  parseAnswerArgs,
  parseValue,
  recordDocument,
  requireProfile,
  resolveWorkspace,
  saveAnswers,
  saveProfile,
  setAnswers,
} from '../src/workspace';
import { bar, heading, kv, renderGaps, renderRoadmap, renderScores, renderTable, severityLabel } from '../src/output';
import { buildProgram } from '../src/index';

let dir: string;
let workspace: ReturnType<typeof resolveWorkspace>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'complisme-cli-'));
  workspace = ensureWorkspace(resolveWorkspace({ dir }));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('workspace', () => {
  it('creates the expected layout', () => {
    expect(fs.existsSync(workspace.dir)).toBe(true);
    expect(fs.existsSync(workspace.reportsPath)).toBe(true);
    expect(path.basename(workspace.dir)).toBe(STATE_DIR_NAME);
  });

  it('round-trips a profile', () => {
    const saved = saveProfile(workspace, { ...acme, id: '' });
    expect(saved.id).toBeTruthy();
    expect(loadProfile(workspace)?.name).toBe(acme.name);
  });

  it('explains a missing profile', () => {
    expect(() => requireProfile(workspace)).toThrow(/complisme init/);
  });

  it('round-trips answers', () => {
    saveAnswers(workspace, { gdpr: { 'a5-q1': 'documented' } });
    expect(loadAnswers(workspace).gdpr['a5-q1']).toBe('documented');
  });

  it('merges answer updates', () => {
    saveAnswers(workspace, { gdpr: { 'a5-q1': 'documented' } });
    setAnswers(workspace, [{ frameworkId: 'gdpr', questionId: 'a30-q1', value: 'complete' }]);
    const answers = loadAnswers(workspace);
    expect(answers.gdpr['a5-q1']).toBe('documented');
    expect(answers.gdpr['a30-q1']).toBe('complete');
  });

  it('stores evidence and documents with version history', () => {
    addEvidence(workspace, {
      companyId: 'c1',
      frameworkId: 'gdpr',
      articleId: 'art-30-ropa',
      title: 'ROPA v1',
    });
    expect(loadEvidence(workspace)).toHaveLength(1);

    recordDocument(workspace, {
      companyId: 'c1',
      kind: 'gdpr-ropa',
      title: 'ROPA',
      frameworkIds: ['gdpr'],
      format: 'pdf',
      checksum: 'abc',
    });
    recordDocument(workspace, {
      companyId: 'c1',
      kind: 'gdpr-ropa',
      title: 'ROPA',
      frameworkIds: ['gdpr'],
      format: 'pdf',
      checksum: 'def',
    });
    const documents = loadDocuments(workspace);
    expect(documents).toHaveLength(1);
    expect(documents[0].versions).toHaveLength(2);
    expect(documents[0].versions[1].checksum).toBe('def');
  });

  it('records history', () => {
    appendHistory(workspace, 'init', 'Acme');
    expect(loadHistory(workspace)[0]).toMatchObject({ command: 'init', detail: 'Acme' });
  });

  it('creates the output directory', () => {
    const target = outputDir(workspace);
    expect(fs.existsSync(target)).toBe(true);
  });
});

describe('answer parsing', () => {
  it('parses values into the right types', () => {
    expect(parseValue('true')).toBe(true);
    expect(parseValue('no')).toBe(false);
    expect(parseValue('documented')).toBe('documented');
    expect(parseValue('42')).toBe(42);
    expect(parseValue('3.5')).toBe(3.5);
    expect(parseValue('')).toBeNull();
    expect(parseValue('null')).toBeNull();
    expect(parseValue('["a","b"]')).toEqual(['a', 'b']);
  });

  it('parses framework.question=value arguments', () => {
    expect(parseAnswerArgs(['gdpr.a5-q1=documented'])).toEqual([
      { frameworkId: 'gdpr', questionId: 'a5-q1', value: 'documented' },
    ]);
  });

  it('rejects malformed arguments', () => {
    expect(() => parseAnswerArgs(['nonsense'])).toThrow(/expected framework.question=value/);
    expect(() => parseAnswerArgs(['nokey=value'])).toThrow(/expected framework.question/);
  });
});

describe('output rendering', () => {
  it('renders scores with bars', () => {
    const lines = renderScores(
      [{ frameworkId: 'gdpr', score: 72, grade: 'C', gaps: [{} as never] }],
      { gdpr: 'GDPR' },
    );
    expect(lines.join('\n')).toContain('GDPR');
    expect(lines.join('\n')).toContain('72.0');
  });

  it('renders gaps with remediation and effort', () => {
    const lines = renderGaps([
      {
        id: 'g1',
        frameworkId: 'gdpr',
        articleId: 'art-30-ropa',
        severity: 'error',
        remediation: 'Write the ROPA and link it as evidence.',
        effort: 5,
        title: 'ROPA missing',
      },
    ]);
    const text = lines.join('\n');
    expect(text).toContain('ROPA missing');
    expect(text).toContain('Write the ROPA');
    expect(text).toContain('5d');
  });

  it('says so when there are no gaps', () => {
    expect(renderGaps([]).join('\n')).toContain('No open gaps');
  });

  it('renders a roadmap with phases', () => {
    const lines = renderRoadmap({
      companyId: 'c1',
      generatedAt: new Date().toISOString(),
      horizonDays: 90,
      startDate: '2026-01-01',
      endDate: '2026-04-01',
      phases: [
        {
          phase: 'quick-wins',
          label: 'Days 1-30',
          window: '2026-01-01 → 2026-01-31',
          startDate: '2026-01-01',
          endDate: '2026-01-31',
          items: [
            {
              id: 'RM-001',
              title: 'Publish a privacy notice',
              description: 'Do the thing',
              phase: 'quick-wins',
              frameworkIds: ['gdpr'],
              articleIds: ['art-13-14-transparency'],
              gapIds: ['g1'],
              severity: 'error',
              startDate: '2026-01-01',
              dueDate: '2026-01-10',
              effort: 3,
            },
          ],
          effort: 3,
          riskReduction: 0,
        },
      ],
      items: [],
      totalEffort: 3,
      totalFineExposure: 0,
      quickWins: [],
    });
    const text = lines.join('\n');
    expect(text).toContain('Days 1-30');
    expect(text).toContain('Publish a privacy notice');
  });

  it('renders tables and labels', () => {
    expect(renderTable(['A', 'B'], [['1', '2']]).join('\n')).toContain('A');
    expect(heading('Title').length).toBeGreaterThan(5);
    expect(kv('Label', 'value')).toContain('value');
    expect(bar(50)).toContain('█');
    expect(bar(0)).not.toContain('█');
    // Values above 100 clamp to a full bar rather than overflowing.
    expect(bar(150)).toBe(bar(100));
    expect(bar(150).length).toBe(28);
    expect(severityLabel('error')).toContain('ERROR');
    expect(severityLabel('info')).toContain('INFO');
  });
});

describe('program definition', () => {
  it('exposes every documented command', () => {
    const program = buildProgram();
    const names = program.commands.map((c) => c.name());
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
      'status-all',
    ]) {
      expect(names).toContain(command);
    }
  });

  it('declares the global options', () => {
    const flags = buildProgram()
      .options.map((o) => o.long)
      .filter(Boolean);
    expect(flags).toEqual(expect.arrayContaining(['--dir', '--global', '--json', '--yes']));
  });

  it('lists the document kinds on generate', () => {
    const generate = buildProgram().commands.find((c) => c.name() === 'generate');
    const kind = generate?.options.find((o) => o.long === '--kind');
    // Commander exposes the accepted values as `argChoices`; `choices` is the
    // method that sets them.
    expect(kind).toBeDefined();
    expect(kind?.argChoices?.length ?? 0).toBeGreaterThan(10);
    expect(kind?.argChoices).toContain('gdpr-dpia');
    expect(kind?.defaultValue).toBe('compliance-roadmap');
  });
});

describe('end-to-end via the CLI surface', () => {
  it('init -> answer -> roadmap produces a usable workspace', async () => {
    saveProfile(workspace, { ...acme, id: '' });
    setAnswers(workspace, parseAnswerArgs(['gdpr.a5-q1=documented', 'gdpr.a30-q1=complete']));

    const { ComplianceEngine } = await import('@complisme/core');
    const profile = requireProfile(workspace);
    const result = new ComplianceEngine().plan(profile, loadAnswers(workspace));
    expect(result.gaps.length).toBeGreaterThan(0);
    expect(result.roadmap.items.length).toBeGreaterThan(0);
  });

  it('handles a company with no AI systems', () => {
    saveProfile(workspace, { ...vistaSul(), id: '' });
    const profile = requireProfile(workspace);
    expect(profile.aiSystems).toHaveLength(0);
  });
});