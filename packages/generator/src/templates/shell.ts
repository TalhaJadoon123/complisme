/**
 * HTML shell: professional print-ready layout used by every template.
 *
 * Design goals:
 *  - A4 page geometry with real print margins so Puppeteer output is submittable.
 *  - A cover page, an automatic table of contents, a document control block,
 *    numbered sections and a version history.
 *  - Print-safe colours (no dark full-bleed headers that eat toner).
 */

import { escapeHtml } from '../types';
import type { Branding } from '../types';

export interface ShellOptions {
  title: string;
  subtitle?: string;
  branding: Branding;
  toc: Array<{ id: string; heading: string; level: number }>;
  body: string;
  metadata?: Array<{ label: string; value: string }>;
  disclaimer?: string;
  changeLog?: Array<{ version: number; date: string; author?: string; summary: string }>;
  /** Extra CSS scoped to one template. */
  styles?: string;
  /** Include the page footer with the page number. */
  footer?: boolean;
}

export function renderShell(options: ShellOptions): string {
  const { branding } = options;
  const primary = branding.primaryColor || '#4338ca';
  const accent = branding.accentColor || '#0f172a';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(options.title)}</title>
<meta name="generator" content="${escapeHtml(branding.productName)}"/>
<meta name="author" content="${escapeHtml(branding.preparedBy ?? branding.productName)}"/>
<style>
:root {
  --primary: ${primary};
  --accent: ${accent};
  --muted: #475569;
  --line: #e2e8f0;
  --soft: #f8fafc;
}
@page { size: A4; margin: 22mm 18mm 20mm 18mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  font-family: "Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
  font-size: 10.5pt; line-height: 1.55; color: #0f172a; margin: 0; background: #fff;
}
h1, h2, h3, h4 { color: var(--accent); line-height: 1.25; page-break-after: avoid; }
h1 { font-size: 22pt; margin: 0 0 6pt; }
h2 { font-size: 14pt; margin: 20pt 0 6pt; border-bottom: 1.5px solid var(--line); padding-bottom: 3pt; }
h3 { font-size: 11.5pt; margin: 14pt 0 4pt; color: var(--primary); }
h4 { font-size: 10.5pt; margin: 10pt 0 3pt; }
p { margin: 0 0 8pt; text-align: justify; }
a { color: var(--primary); text-decoration: none; }
ul, ol { margin: 0 0 8pt 0; padding-left: 18pt; }
li { margin-bottom: 3pt; }
table { width: 100%; border-collapse: collapse; margin: 8pt 0 12pt; font-size: 9pt; page-break-inside: auto; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
th { background: var(--soft); text-align: left; font-weight: 600; }
th, td { border: 1px solid var(--line); padding: 5pt 6pt; vertical-align: top; }
td.num { text-align: right; font-variant-numeric: tabular-nums; }
code { background: var(--soft); padding: 1pt 3pt; border-radius: 3px; font-size: 9pt; }
pre { background: var(--soft); border: 1px solid var(--line); padding: 8pt; font-size: 8.5pt; overflow-x: auto; }
blockquote { border-left: 3px solid var(--primary); margin: 8pt 0; padding: 4pt 10pt; background: var(--soft); }
.cover { page-break-after: always; padding-top: 30mm; }
.cover .eyebrow { text-transform: uppercase; letter-spacing: .14em; font-size: 8.5pt; color: var(--primary); font-weight: 700; }
.cover h1 { margin-top: 10pt; }
.cover .subtitle { font-size: 13pt; color: var(--muted); margin-bottom: 26pt; }
.cover .rule { height: 4px; width: 68px; background: var(--primary); margin: 16pt 0 22pt; }
.meta { margin-top: 18pt; font-size: 9.5pt; }
.meta table { font-size: 9pt; }
.toc { page-break-after: always; }
.toc ol { list-style: none; padding-left: 0; counter-reset: toc; }
.toc li { counter-increment: toc; margin-bottom: 3pt; font-size: 9.5pt; }
.toc li::before { content: counter(toc) ". "; color: var(--primary); font-weight: 600; }
.toc li.lvl2 { padding-left: 14pt; font-size: 9pt; color: var(--muted); }
.toc li.lvl3 { padding-left: 28pt; font-size: 8.5pt; color: var(--muted); }
.status { display: inline-block; padding: 1pt 6pt; border-radius: 999px; font-size: 8pt; font-weight: 700; }
.status.ok { background: #dcfce7; color: #166534; }
.status.partial { background: #fef3c7; color: #92400e; }
.status.missing { background: #fee2e2; color: #991b1b; }
.badge { display: inline-block; background: var(--soft); border: 1px solid var(--line); border-radius: 4px; padding: 1pt 6pt; font-size: 8.5pt; }
.muted { color: var(--muted); }
.small { font-size: 8.5pt; }
.disclaimer { margin-top: 20pt; padding: 10pt; background: var(--soft); border: 1px solid var(--line); font-size: 8.5pt; color: var(--muted); page-break-inside: avoid; }
.changelog td { font-size: 8.5pt; }
.section { page-break-inside: auto; }
.page-break { page-break-before: always; }
.footer { position: fixed; bottom: -12mm; left: 0; right: 0; font-size: 7.5pt; color: var(--muted); border-top: 1px solid var(--line); padding-top: 4pt; display: flex; justify-content: space-between; }
.kpis { display: flex; gap: 8pt; margin: 10pt 0 14pt; }
.kpi { flex: 1; border: 1px solid var(--line); border-radius: 6px; padding: 8pt; }
.kpi .value { font-size: 18pt; font-weight: 700; color: var(--primary); }
.kpi .label { font-size: 8pt; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
.bar { height: 6px; background: var(--soft); border-radius: 999px; overflow: hidden; border: 1px solid var(--line); }
.bar > span { display: block; height: 100%; background: var(--primary); }
${options.styles ?? ''}
</style>
</head>
<body>
${options.footer === false ? '' : `<div class="footer"><span>${escapeHtml(branding.website ?? branding.productName)}</span><span>${escapeHtml(options.title)}</span></div>`}
<header class="cover">
  <div class="eyebrow">${escapeHtml(branding.productName)}${branding.tagline ? ` · ${escapeHtml(branding.tagline)}` : ''}</div>
  <h1>${escapeHtml(options.title)}</h1>
  ${options.subtitle ? `<div class="subtitle">${escapeHtml(options.subtitle)}</div>` : ''}
  <div class="rule"></div>
  ${
    options.metadata && options.metadata.length
      ? `<div class="meta"><table><tbody>${options.metadata
          .map(
            (m) =>
              `<tr><th style="width:32%">${escapeHtml(m.label)}</th><td>${escapeHtml(m.value)}</td></tr>`,
          )
          .join('')}</tbody></table></div>`
      : ''
  }
</header>
${
  options.toc.length
    ? `<nav class="toc"><h2>Table of contents</h2><ol>${options.toc
        .map(
          (entry) =>
            `<li class="lvl${entry.level}" id="toc-${escapeHtml(entry.id)}">${escapeHtml(entry.heading)}</li>`,
        )
        .join('')}</ol></nav>`
    : ''
}
<main>
${options.body}
</main>
${
  options.changeLog && options.changeLog.length
    ? `<section class="changelog"><h2>Document history</h2><table><thead><tr><th>Version</th><th>Date</th><th>Author</th><th>Change</th></tr></thead><tbody>${options.changeLog
        .map(
          (c) =>
            `<tr><td>${c.version}</td><td>${escapeHtml(c.date)}</td><td>${escapeHtml(c.author ?? '—')}</td><td>${escapeHtml(c.summary)}</td></tr>`,
        )
        .join('')}</tbody></table></section>`
    : ''
}
${
  options.disclaimer
    ? `<div class="disclaimer"><strong>Notice.</strong> ${escapeHtml(options.disclaimer)}</div>`
    : ''
}
</body>
</html>`;
}

/** Small helpers shared by the templates. */
export const html = {
  p: (text: string) => `<p>${text}</p>`,
  h3: (text: string) => `<h3>${text}</h3>`,
  ul: (items: string[]) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`,
  ol: (items: string[]) => `<ol>${items.map((i) => `<li>${i}</li>`).join('')}</ol>`,
  table: (headers: string[], rows: string[][], caption?: string) =>
    `${caption ? `<p class="small muted">${caption}</p>` : ''}<table><thead><tr>${headers
      .map((h) => `<th>${h}</th>`)
      .join('')}</tr></thead><tbody>${rows
      .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
      .join('')}</tbody></table>`,
  kv: (entries: string[][]) =>
    `<table><tbody>${entries
      .map(([k, v]) => `<tr><th style="width:32%">${k}</th><td>${v}</td></tr>`)
      .join('')}</tbody></table>`,
  status: (state: 'ok' | 'partial' | 'missing', label: string) =>
    `<span class="status ${state}">${escapeHtml(label)}</span>`,
  todo: (what: string) => `<span class="badge">TO BE COMPLETED: ${escapeHtml(what)}</span>`,
  bar: (percent: number) =>
    `<div class="bar"><span style="width:${Math.max(0, Math.min(100, Math.round(percent)))}%"></span></div>`,
  kpis: (items: Array<{ label: string; value: string }>) =>
    `<div class="kpis">${items
      .map((i) => `<div class="kpi"><div class="value">${escapeHtml(i.value)}</div><div class="label">${escapeHtml(i.label)}</div></div>`)
      .join('')}</div>`,
};