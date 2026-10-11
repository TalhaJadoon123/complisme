/**
 * PDF generation with Puppeteer.
 *
 * Puppeteer is an *optional* runtime dependency: the CLI and API work fully
 * without it (they return HTML and DOCX instead) and PDF generation fails with
 * an actionable message rather than crashing at import time.
 */

import fs from 'node:fs';
import path from 'node:path';

import type { DocumentContext } from './types';
import { renderShell } from './templates/shell';
import { DEFAULT_DISCLAIMER } from './types';

export interface PdfOptions {
  /** Where to write the PDF. Omit to return the buffer instead. */
  outputPath?: string;
  format?: 'A4' | 'Letter';
  landscape?: boolean;
  marginMm?: number;
  printBackground?: boolean;
  /** Generate a document outline (PDF bookmarks) from the section headings. */
  outline?: boolean;
  timeoutMs?: number;
  /** Inject a header/footer. Defaults to true. */
  displayHeaderFooter?: boolean;
}

export class PdfUnavailableError extends Error {
  constructor(cause: string) {
    super(
      'PDF rendering requires Puppeteer and a Chromium binary. Install it with ' +
        '`pnpm add puppeteer` (or set PUPPETEER_EXECUTABLE_PATH to an existing Chrome/Chromium), ' +
        'then re-run. You can also generate DOCX or HTML, which need no browser. ' +
        `Underlying error: ${cause}`,
    );
    this.name = 'PdfUnavailableError';
  }
}

type PuppeteerModule = {
  launch: (options: Record<string, unknown>) => Promise<PuppeteerBrowser>;
  default?: unknown;
};
type PuppeteerBrowser = {
  newPage: () => Promise<PuppeteerPage>;
  close: () => Promise<void>;
};
type PuppeteerPage = {
  setContent: (html: string, options?: Record<string, unknown>) => Promise<void>;
  setExtraHTTPHeaders?: (headers: Record<string, string>) => Promise<void>;
  pdf: (options: Record<string, unknown>) => Promise<Uint8Array>;
  addScriptTag: (options: { content: string }) => Promise<void>;
  evaluate?: (fn: string) => Promise<unknown>;
};

async function loadPuppeteer(): Promise<PuppeteerModule> {
  try {
    // Lazy require keeps the generator importable in environments without Chromium.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('puppeteer') as PuppeteerModule;
    return mod;
  } catch (error) {
    throw new PdfUnavailableError((error as Error).message);
  }
}

/** Render a document context to HTML. */
export function renderHtml(context: DocumentContext): string {
  return renderShell({
    title: context.title,
    subtitle: context.subtitle,
    branding: context.branding,
    toc: context.toc,
    body: context.sections.map((section) => renderSection(section, context)).join('\n'),
    metadata: context.metadata,
    disclaimer: context.disclaimer ?? DEFAULT_DISCLAIMER,
    changeLog: context.changeLog,
  });
}

function renderSection(section: DocumentContext['sections'][number], context: DocumentContext): string {
  const narrative = context.narrative?.[section.id];
  const body = narrative && !section.body.includes('TO BE COMPLETED')
    ? `<p>${escapeText(narrative)}</p>${section.body}`
    : section.body;
  const level = section.level ?? 2;
  return `<section class="section" id="sec-${section.id}"><h${level}>${escapeText(section.heading)}</h${level}>${body}</section>`;
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Render a document context to a PDF buffer. */
export async function renderPdf(context: DocumentContext, options: PdfOptions = {}): Promise<Buffer> {
  const puppeteer = await loadPuppeteer();
  const html = renderHtml(context);
  const marginMm = options.marginMm ?? 0;
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

  let browser: PuppeteerBrowser | undefined;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      // Long default: a cold Chromium start plus font loading can exceed 30s on
      // CI and on Windows machines with an AV scanner.
      timeout: options.timeoutMs ?? 120_000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        // Windows containers have no usable zygote sandbox; --no-zygote plus
        // --no-sandbox is what makes headless Chromium start reliably there.
        '--no-zygote',
        '--font-render-hinting=none',
        // Bound memory and renderer count: a document with pathological table
        // content must not be able to exhaust the host.
        '--js-flags=--max-old-space-size=512',
        '--renderer-process-limit=1',
        '--disable-extensions',
      ],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs ?? 60_000 });

    // Let fonts settle so the printed layout matches the on-screen layout.
    await page
      .evaluate?.('document.fonts && document.fonts.ready')
      .catch(() => undefined);

    const bytes = await page.pdf({
      format: options.format ?? 'A4',
      landscape: options.landscape ?? false,
      printBackground: options.printBackground ?? true,
      displayHeaderFooter: options.displayHeaderFooter ?? false,
      margin: {
        top: `${marginMm}mm`,
        right: `${marginMm}mm`,
        bottom: `${marginMm}mm`,
        left: `${marginMm}mm`,
      },
      preferCSSPageSize: true,
      tagged: true,
      outline: false,
    });
    return Buffer.from(bytes);
  } catch (error) {
    if (error instanceof PdfUnavailableError) throw error;
    throw new PdfUnavailableError((error as Error).message);
  } finally {
    // Close with a short leash: a wedged Chromium must not hold the event loop
    // open and starve the API's other work.
    await Promise.race([
      browser?.close().catch(() => undefined) ?? Promise.resolve(),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]).catch(() => undefined);
  }
}

/** Render and write the PDF to disk. */
export async function writePdf(
  context: DocumentContext,
  outputPath: string,
  options: PdfOptions = {},
): Promise<string> {
  const buffer = await renderPdf(context, options);
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

/** Is PDF rendering available in this environment? */
export async function pdfAvailable(): Promise<boolean> {
  try {
    await loadPuppeteer();
    return true;
  } catch {
    return false;
  }
}

/** Chapter outline for PDF bookmarks, derived from the TOC. */
export function generateOutline(context: DocumentContext): Array<{ title: string; children: Array<{ title: string }> }> {
  const children = context.toc.map((entry) => ({ title: entry.heading }));
  return [{ title: context.title, children }];
}