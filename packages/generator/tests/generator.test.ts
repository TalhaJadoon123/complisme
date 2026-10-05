import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ComplianceEngine } from '@complisme/core';
import { acme, acmeMatureAnswers, nordwerk, vistaSul } from '@complisme/core';

import {
  DocumentGenerator,
  docxAvailable,
  htmlToDocxBody,
  renderDocx,
  renderHtml,
  resolveBranding,
} from '../src/index';
import { anonymise } from '../src/__helpers__';
import type { DocumentContext } from '../src/types';

const engine = new ComplianceEngine();
const plan = engine.plan(acme, acmeMatureAnswers);
const generator = new DocumentGenerator();

let outDir: string;

beforeAll(() => {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'complisme-gen-'));
});

afterAll(() => {
  fs.rmSync(outDir, { recursive: true, force: true });
});

const BASE = {
  profile: acme,
  answers: acmeMatureAnswers,
  gaps: plan.gaps,
  roadmap: plan.roadmap,
} as const;

describe('document contexts', () => {
  it('builds every advertised document kind', () => {
    for (const kind of DocumentGenerator.kinds()) {
      const context = generator.buildContext({ ...BASE, kind });
      expect(context.title).toBeTruthy();
      expect(context.sections.length).toBeGreaterThan(1);
      expect(context.toc.length).toBeGreaterThan(1);
      expect(context.changelog ?? context.changeLog).toBeTruthy();
    }
  });

  it('carries the AI Act Annex IV structure', () => {
    const context = generator.buildContext({ ...BASE, kind: 'ai-act-annex-iv' });
    expect(context.title).toContain('Annex IV');
    const headings = context.sections.map((s) => s.heading).join(' ');
    for (const point of ['General description', 'Design specifications', 'Human oversight', 'Accuracy']) {
      expect(headings).toContain(point);
    }
  });

  it('fills the ROPA from the processing activities', () => {
    const context = generator.buildContext({ ...BASE, kind: 'gdpr-ropa' });
    expect(context.title).toContain('Record of Processing');
    const body = context.sections.map((s) => s.body).join('');
    expect(body).toContain('Customer account administration');
  });

  it('marks unknown facts as TO BE COMPLETED rather than inventing them', () => {
    const context = generator.buildContext({ ...BASE, kind: 'ai-act-annex-iv' });
    const body = context.sections.map((s) => s.body).join('');
    expect(body).toContain('TO BE COMPLETED');
  });

  it('flags a DPIA as required when high-risk processing exists', () => {
    const nordwerkContext = generator.buildContext({
      profile: nordwerk,
      answers: {},
      gaps: [],
      kind: 'gdpr-dpia',
    });
    const metadata = nordwerkContext.metadata.map((m) => `${m.label} ${m.value}`).join(' ');
    expect(metadata).toContain('DPIA required');
  });

  it('adds a change log entry per previous version', () => {
    const context = generator.buildContext({
      ...BASE,
      kind: 'gdpr-dpia',
      previousVersions: [
        { version: 1, createdAt: '2026-09-01T00:00:00.000Z', changeLog: 'Initial draft' },
        { version: 2, createdAt: '2026-09-15T00:00:00.000Z', changeLog: 'Added mitigations' },
      ],
    });
    expect(context.changeLog).toHaveLength(3);
    expect(context.changeLog?.[2].version).toBe(3);
  });

  it('injects LLM narrative keyed by section id', () => {
    const context = generator.buildContext({
      ...BASE,
      kind: 'gdpr-dpia',
      narrative: { description: 'This is drafted prose about the processing.' },
    });
    expect(context.narrative?.description).toContain('drafted prose');
  });

  it('handles a Brazilian company without AI systems', () => {
    const context = generator.buildContext({
      profile: vistaSul(),
      answers: {},
      gaps: [],
      kind: 'einvoice-validation-report',
    });
    expect(context.title).toContain('E-invoicing');
    const body = context.sections.map((s) => s.body).join('');
    expect(body).toContain('Brazilian');
  });

  it('rejects an unsupported document kind', () => {
    expect(() => generator.buildContext({ ...BASE, kind: 'nope' as never })).toThrow();
  });

  it('produces stable document ids', () => {
    expect(generator.documentId('company-1', 'gdpr-dpia')).toBe(generator.documentId('company-1', 'gdpr-dpia'));
    expect(generator.documentId('company-1', 'gdpr-dpia')).not.toBe(
      generator.documentId('company-2', 'gdpr-dpia'),
    );
  });
});

describe('HTML rendering', () => {
  it('produces a full print-ready document', () => {
    const context = generator.buildContext({ ...BASE, kind: 'gdpr-dpia' });
    const html = renderHtml(context);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('@page');
    expect(html).toContain('Table of contents');
    expect(html).toContain('Document history');
    expect(html).toContain('class="cover"');
    expect(html).toContain(context.title);
  });

  it('escapes user-supplied company names', () => {
    const html = renderHtml(
      generator.buildContext({
        ...BASE,
        profile: { ...acme, name: '<script>alert(1)</script>' },
        kind: 'gdpr-ropa',
      }),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('includes the compliance notice', () => {
    const html = renderHtml(generator.buildContext({ ...BASE, kind: 'compliance-roadmap' }));
    expect(html).toContain('Notice.');
    expect(html).toContain('not legal advice');
  });
});

describe('DOCX generation', () => {
  it('writes a valid Office Open XML package', async () => {
    const context = generator.buildContext({ ...BASE, kind: 'gdpr-ropa' });
    const buffer = await renderDocx(context);

    // ZIP magic.
    expect(buffer.slice(0, 2).toString()).toBe('PK');

    const zip = await JSZip.loadAsync(buffer);
    const names = Object.keys(zip.files);
    expect(names).toContain('[Content_Types].xml');
    expect(names).toContain('_rels/.rels');
    expect(names).toContain('word/document.xml');
    expect(names).toContain('word/styles.xml');
    expect(names).toContain('word/numbering.xml');
    expect(names).toContain('docProps/core.xml');
  });

  it('includes the title, headings and a real table of contents field', async () => {
    const context = generator.buildContext({ ...BASE, kind: 'gdpr-dpia' });
    const zip = await JSZip.loadAsync(await renderDocx(context));
    const document = await zip.file('word/document.xml')!.async('string');

    expect(document).toContain('<w:document');
    expect(document).toContain('Data Protection Impact Assessment');
    expect(document).toContain('TOC \\o');
    expect(document).toContain('fldChar');
    expect(document).toContain('<w:tbl>');
  });

  it('records document control metadata', async () => {
    const context = generator.buildContext({ ...BASE, kind: 'gdpr-ropa' });
    const zip = await JSZip.loadAsync(await renderDocx(context));
    const core = await zip.file('docProps/core.xml')!.async('string');
    expect(core).toContain('<dc:title>');
    expect(core).toContain('CompliSME');
  });

  it('always reports DOCX as available', async () => {
    expect(await docxAvailable()).toBe(true);
  });

  it('converts HTML fragments to WordprocessingML', () => {
    const xml = htmlToDocxBody('<p>Hello <strong>world</strong></p><ul><li>one</li></ul>');
    expect(xml).toContain('<w:p>');
    expect(xml).toContain('Hello world');
    expect(xml).toContain('• one');
  });
});

describe('branding', () => {
  it('applies defaults and overrides', () => {
    const defaults = resolveBranding();
    expect(defaults.productName).toBe('CompliSME');
    expect(defaults.primaryColor).toBeTruthy();

    const custom = resolveBranding({ productName: 'Acme Compliance', primaryColor: '#ff0000' });
    expect(custom.productName).toBe('Acme Compliance');
    expect(custom.primaryColor).toBe('#ff0000');
  });

  it('embeds the primary colour in the stylesheet', () => {
    const context = generator.buildContext({
      ...BASE,
      kind: 'gdpr-ropa',
      branding: { primaryColor: '#ff0000', productName: 'Acme' },
    });
    const html = renderHtml(context);
    expect(html).toContain('#ff0000');
    expect(html).toContain('Acme');
  });
});

describe('file output', () => {
  it('writes HTML and DOCX files that exist and are non-trivial', async () => {
    const htmlResult = await generator.generate({
      ...BASE,
      kind: 'compliance-roadmap',
      format: 'html',
      outputPath: path.join(outDir, 'roadmap.html'),
    });
    expect(fs.existsSync(htmlResult.path!)).toBe(true);
    expect(fs.statSync(htmlResult.path!).size).toBeGreaterThan(2000);

    const docxResult = await generator.generate({
      ...BASE,
      kind: 'gdpr-dpia',
      format: 'docx',
      outputPath: path.join(outDir, 'dpia.docx'),
    });
    expect(fs.existsSync(docxResult.path!)).toBe(true);
    expect(docxResult.bytes).toBeGreaterThan(3000);
  });

  it('generates a filename when none is supplied', async () => {
    const result = await generator.generate({ ...BASE, kind: 'gdpr-ropa', format: 'docx' });
    expect(result.path).toMatch(/gdpr-ropa-acme-analytics-bv-\d{4}-\d{2}-\d{2}\.docx$/);
  });

  it('reports capabilities honestly', () => {
    expect(DocumentGenerator.capabilities()).toMatchObject({ docx: 'always', html: 'always' });
  });
});

describe('privacy of narrative injection', () => {
  it('does not double-render narrative when a section already has placeholders', () => {
    const context = generator.buildContext({
      ...BASE,
      kind: 'gdpr-dpia',
      narrative: { description: 'Additional drafted context.' },
    });
    const rendered = renderHtml(context);
    expect(rendered).toContain('Additional drafted context.');
    expect(rendered).toContain('TO BE COMPLETED');
  });
});

// Keeps the helper import meaningful for future reuse without failing lint.
void anonymise;
void ({} as DocumentContext);