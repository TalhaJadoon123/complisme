/**
 * Document generation facade.
 *
 *   const gen = new DocumentGenerator();
 *   const result = await gen.generate({
 *     kind: 'gdpr-dpia',
 *     profile,
 *     format: 'pdf',
 *     outputPath: 'out/dpia.pdf',
 *   });
 */

import fs from 'node:fs';
import path from 'node:path';

import { ComplianceEngine, buildRoadmap } from '@complisme/core';
import { checksum, nowIso, stableId, wordCount } from '@complisme/shared';
import type {
  Answers,
  CompanyProfile,
  DocumentKind,
  DocumentVersion,
  Evidence,
  Finding,
  Gap,
  Roadmap,
} from '@complisme/shared';

import { docxAvailable, renderDocx, writeDocx } from './docx-generator';
import { PdfUnavailableError, pdfAvailable, renderHtml, renderPdf, writePdf } from './pdf-generator';
import * as aiAct from './templates/ai-act';
import * as csrd from './templates/csrd';
import * as gdpr from './templates/gdpr';
import * as einv from './templates/e-invoicing';
import { resolveBranding, slug } from './templates/common';
import { DISCLAIMERS, type Branding, type DocumentContext } from './types';

export interface GenerateOptions {
  kind: DocumentKind;
  profile: CompanyProfile;
  answers?: Answers;
  evidence?: Evidence[];
  findings?: Finding[];
  gaps?: Gap[];
  roadmap?: Roadmap;
  /** LLM-drafted narrative keyed by section id. */
  narrative?: Record<string, string>;
  format?: 'pdf' | 'docx' | 'html' | 'md' | 'json';
  /** Where to write the artefact. Required for pdf/docx. */
  outputPath?: string;
  branding?: Partial<Branding>;
  /** Previous versions, to build the change log. */
  previousVersions?: DocumentVersion[];
  author?: string;
}

export interface GenerateResult {
  kind: DocumentKind;
  format: string;
  title: string;
  path?: string;
  buffer?: Buffer;
  html?: string;
  checksum: string;
  bytes: number;
  wordCount: number;
  sections: number;
  generatedAt: string;
  warning?: string;
}

export class DocumentGenerator {
  private readonly engine = new ComplianceEngine();

  /** Build the document context for a kind without rendering it. */
  buildContext(options: GenerateOptions): DocumentContext {
    const branding = resolveBranding(options.branding);
    const profile = options.profile;
    const gaps = options.gaps ?? [];
    const evidence = options.evidence ?? [];
    const answers = options.answers ?? {};

    let context: DocumentContext;
    switch (options.kind) {
      case 'ai-act-annex-iv':
        context = aiAct.annexIV({ profile, answers, gaps, branding, narrative: options.narrative });
        break;
      case 'ai-act-risk-register':
        context = aiAct.riskRegister({ profile, gaps, branding });
        break;
      case 'ai-act-conformity-declaration':
        context = aiAct.declarationOfConformity({ profile, branding });
        break;
      case 'gdpr-ropa':
        context = gdpr.ropa({ profile, gaps, branding });
        break;
      case 'gdpr-dpia':
        context = gdpr.dpia({ profile, answers, branding, narrative: options.narrative });
        break;
      case 'gdpr-dsr-response':
        context = gdpr.dsrResponse({
          profile,
          branding,
          request: (options.narrative?.dsr as never) ?? undefined,
        });
        break;
      case 'gdpr-tom':
        context = gdpr.privacyNotice({ profile, branding, kind: 'gdpr-tom' });
        break;
      case 'consent-notice':
        context = gdpr.privacyNotice({ profile, branding });
        break;
      case 'nda-dpa':
        context = gdpr.dpaTemplate({ profile, branding });
        break;
      case 'csrd-report':
        context = csrd.csrdReport({ profile, branding, narrative: options.narrative });
        break;
      case 'esrs-datapoint':
        context = csrd.esrsDatapointRegister({ profile, branding });
        break;
      case 'einvoice-validation-report':
        context = einv.einvoiceValidationReport({
          profile,
          answers: answers['e-invoicing'] as never,
          gaps,
          findings: options.findings,
          evidence,
          branding,
        });
        break;
      case 'compliance-roadmap': {
        const roadmap =
          options.roadmap ??
          this.engine.buildRoadmap(profile, gaps, {
            currentScore: this.engine.assess(profile, answers)[0]?.score,
          });
        context = einv.roadmapDocument({ profile, roadmap, gaps, branding });
        break;
      }
      default:
        throw new Error(`unsupported document kind: ${options.kind}`);
    }

    context.branding = { ...branding, preparedBy: options.author ?? branding.preparedBy };
    if (!context.disclaimer && DISCLAIMERS[options.kind]) {
      context.disclaimer = DISCLAIMERS[options.kind];
    }
    if (options.previousVersions?.length) {
      // The newest existing version, not the first entry: a caller may pass an
      // unordered history.
      const highest = options.previousVersions.reduce(
        (max, v) => Math.max(max, v.version ?? 0),
        0,
      );
      context.changeLog = [
        ...options.previousVersions.map((v) => ({
          version: v.version,
          date: (v.createdAt ?? nowIso()).slice(0, 10),
          author: v.createdBy,
          summary: v.changeLog ?? 'Updated',
        })),
        {
          version: highest + 1,
          date: nowIso().slice(0, 10),
          author: options.author ?? branding.productName,
          summary: `Regenerated with ${options.gaps?.length ?? 0} current gaps`,
        },
      ];
    }
    return context;
  }

  /** Build and render a document. */
  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const format = options.format ?? 'html';
    const context = this.buildContext(options);
    const checksumValue = checksum(
      JSON.stringify({ kind: options.kind, sections: context.sections, generatedAt: context.generatedAt }),
    );

    if (format === 'html' || format === 'json') {
      const html = renderHtml(context);
      if (options.outputPath) {
        const target = this.resolveTarget(options, 'html');
        fs.writeFileSync(target, html);
        return {
          kind: options.kind,
          format,
          title: context.title,
          path: target,
          html,
          checksum: checksumValue,
          bytes: Buffer.byteLength(html),
          wordCount: this.countWords(context),
          sections: context.sections.length,
          generatedAt: context.generatedAt,
        };
      }
      return {
        kind: options.kind,
        format,
        title: context.title,
        path: undefined,
        html,
        checksum: checksumValue,
        bytes: Buffer.byteLength(html),
        wordCount: this.countWords(context),
        sections: context.sections.length,
        generatedAt: context.generatedAt,
      };
    }

    if (format === 'docx') {
      const target = options.outputPath
        ? this.resolveTarget(options, 'docx')
        : path.resolve(this.filename(options, 'docx'));
      await writeDocx(context, target, { author: options.author });
      const buffer = fs.readFileSync(target);
      return {
        kind: options.kind,
        format,
        title: context.title,
        path: target,
        checksum: checksumValue,
        bytes: buffer.length,
        wordCount: this.countWords(context),
        sections: context.sections.length,
        generatedAt: context.generatedAt,
      };
    }

    // PDF
    const target = options.outputPath
      ? this.resolveTarget(options, 'pdf')
      : path.resolve(this.filename(options, 'pdf'));
    try {
      await writePdf(context, target);
    } catch (error) {
      if (error instanceof PdfUnavailableError) {
        // Graceful degradation: leave an HTML file next to the requested PDF path.
        const fallback = target.replace(/\.pdf$/i, '.html');
        fs.mkdirSync(path.dirname(path.resolve(fallback)), { recursive: true });
        fs.writeFileSync(fallback, renderHtml(context));
        return {
          kind: options.kind,
          format: 'html',
          title: context.title,
          path: fallback,
          checksum: checksumValue,
          bytes: fs.statSync(fallback).size,
          wordCount: this.countWords(context),
          sections: context.sections.length,
          generatedAt: context.generatedAt,
          warning: `PDF generation unavailable — wrote HTML instead. ${(error as Error).message}`,
        };
      }
      throw error;
    }
    return {
      kind: options.kind,
      format: 'pdf',
      title: context.title,
      path: target,
      checksum: checksumValue,
      bytes: fs.statSync(target).size,
      wordCount: this.countWords(context),
      sections: context.sections.length,
      generatedAt: context.generatedAt,
    };
  }

  /** Convenience: assess, then build the roadmap, then render it. */
  async generateRoadmapDocument(
    profile: CompanyProfile,
    answers: Answers = {},
    options: Partial<GenerateOptions> = {},
  ): Promise<GenerateResult> {
    const plan = this.engine.plan(profile, answers);
    return this.generate({
      kind: 'compliance-roadmap',
      profile,
      answers,
      gaps: plan.gaps,
      roadmap: plan.roadmap,
      ...options,
    });
  }

  /** All document kinds this generator can produce. */
  static kinds(): DocumentKind[] {
    return [
      'ai-act-annex-iv',
      'ai-act-risk-register',
      'ai-act-conformity-declaration',
      'gdpr-ropa',
      'gdpr-dpia',
      'gdpr-dsr-response',
      'gdpr-tom',
      'consent-notice',
      'nda-dpa',
      'csrd-report',
      'esrs-datapoint',
      'einvoice-validation-report',
      'compliance-roadmap',
    ];
  }

  static capabilities() {
    return {
      pdf: 'optional (puppeteer)',
      docx: 'always',
      html: 'always',
      md: 'always',
      json: 'always',
    };
  }

  /**
   * Resolve `outputPath` to a concrete file.
   *
   * Callers pass either a directory (the usual case) or a full file path. The
   * distinction is made by extension, so `out/reports` means "put it in this
   * directory" and `out/annex.pdf` means "write exactly this file". Getting this
   * wrong previously produced a 500 when a directory was passed for a PDF.
   */
  private resolveTarget(options: GenerateOptions, extension: string): string {
    const requested = options.outputPath as string;
    const target = hasFileExtension(requested) ? requested : path.join(requested, this.filename(options, extension));
    fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
    return target;
  }

  filename(options: GenerateOptions, extension: string): string {
    const stamp = nowIso().slice(0, 10);
    return `${slug(options.kind)}-${slug(options.profile.name)}-${stamp}.${extension}`;
  }

  private countWords(context: DocumentContext): number {
    const text = context.sections
      .map((s) => `${s.heading} ${s.body}`)
      .join(' ')
      .replace(/<[^>]+>/g, ' ');
    return wordCount(text);
  }

  /** Stable id used by the API to key documents. */
  documentId(companyId: string, kind: DocumentKind): string {
    return stableId('doc', companyId, kind);
  }
}

function hasFileExtension(target: string): boolean {
  return /\.[a-z0-9]{2,5}$/i.test(path.basename(target));
}

export { renderHtml, renderPdf, writePdf, pdfAvailable, PdfUnavailableError };
export { renderDocx, writeDocx, docxAvailable, htmlToDocxBody } from './docx-generator';
export { resolveBranding };
export * from './types';