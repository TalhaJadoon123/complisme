/**
 * DOCX generation.
 *
 * Written directly against the OOXML (ECMA-376) spec rather than through a
 * document library, so the produced file is a normal, fully editable .docx that
 * Word, LibreOffice and Google Docs all open — which matters because the target
 * user is a lawyer or an accountant who will edit the annexes by hand.
 *
 * Implemented parts: [Content_Types].xml, _rels/.rels, word/document.xml,
 * word/styles.xml, word/numbering.xml, word/_rels/document.xml.rels and a
 * docProps/core.xml with the document control metadata.
 */

import fs from 'node:fs';
import path from 'node:path';

import JSZip from 'jszip';

import type { Branding, DocumentContext, Section } from './types';
import { DEFAULT_DISCLAIMER } from './types';

// ---------------------------------------------------------------------------
// Low level helpers
// ---------------------------------------------------------------------------

function esc(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

type Run = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  size?: number; // half-points
  color?: string;
};

function run(r: Run): string {
  const props = [
    r.bold ? '<w:b/>' : '',
    r.italic ? '<w:i/>' : '',
    r.size ? `<w:sz w:val="${r.size}"/><w:szCs w:val="${r.size}"/>` : '',
    r.color ? `<w:color w:val="${r.color.replace('#', '')}"/>` : '',
  ].join('');
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(r.text)}</w:t></w:r>`;
}

function paragraph(
  runs: Run | Run[],
  opts: { style?: string; align?: string; spacingBefore?: number; spacingAfter?: number } = {},
): string {
  const list = Array.isArray(runs) ? runs : [runs];
  const props = [
    opts.style ? `<w:pStyle w:val="${opts.style}"/>` : '',
    opts.align ? `<w:jc w:val="${opts.align}"/>` : '',
    opts.spacingBefore || opts.spacingAfter
      ? `<w:spacing${opts.spacingBefore ? ` w:before="${opts.spacingBefore}"` : ''}${
          opts.spacingAfter ? ` w:after="${opts.spacingAfter}"` : ''
        }/>`
      : '',
  ].join('');
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${list.map(run).join('')}</w:p>`;
}

type TableCell = { text: string; bold?: boolean; shading?: string; width?: number };

function table(rows: TableCell[][], opts: { header?: boolean; widths?: number[] } = {}): string {
  const cols = Math.max(...rows.map((r) => r.length), 1);
  const widths =
    opts.widths ??
    new Array(cols).fill(Math.floor(9000 / cols));
  const grid = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('');

  const body = rows
    .map((cells, rowIndex) => {
      const isHeader = opts.header !== false && rowIndex === 0;
      const cellXml = cells
        .map((cell, index) => {
          const shading = cell.shading ?? (isHeader ? 'F1F5F9' : undefined);
          return `<w:tc><w:tcPr>${
            widths[index] ? `<w:tcW w:w="${widths[index]}" w:type="dxa"/>` : ''
          }${shading ? `<w:shd w:val="clear" w:color="auto" w:fill="${shading}"/>` : ''}</w:tcPr>${paragraph(
            [{ text: cell.text, bold: cell.bold ?? isHeader, size: 18 }],
            { spacingAfter: 40 },
          )}</w:tc>`;
        })
        .join('');
      return `<w:tr>${cellXml}</w:tr>`;
    })
    .join('');

  const borders = [
    'top',
    'left',
    'bottom',
    'right',
    'insideH',
    'insideV',
  ]
    .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>`)
    .join('');

  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${`<w:tblBorders>${borders}</w:tblBorders>`}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`;
}

function pageBreak(): string {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
}

function tocField(): string {
  // A real TOC field: Word prompts to update it, LibreOffice renders it on open.
  return (
    '<w:p><w:pPr><w:pStyle w:val="TOCHeading"/></w:pPr><w:r><w:t>Table of contents</w:t></w:r></w:p>' +
    '<w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>' +
    '<w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>' +
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
    '<w:r><w:t>Right-click and choose "Update field" to build the table of contents.</w:t></w:r>' +
    '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>'
  );
}

// ---------------------------------------------------------------------------
// HTML -> DOCX conversion
// ---------------------------------------------------------------------------

/**
 * Convert a section's HTML body into WordprocessingML.
 *
 * The templates only emit a controlled subset of HTML (h3/h4, p, ul/ol, table,
 * strong, em, code, span.badge, div.kpis, div.kv), so a focused parser is both
 * smaller and safer than a general HTML-to-DOCX pipeline.
 */
export function htmlToDocxBody(html: string): string {
  const out: string[] = [];
  let index = 0;

  while (index < html.length) {
    if (html.startsWith('<section', index)) {
      const end = html.indexOf('</section>', index);
      const inner = html.slice(html.indexOf('>', index) + 1, end === -1 ? html.length : end);
      out.push(htmlToDocxBody(inner));
      index = end === -1 ? html.length : end + 10;
      continue;
    }

    if (html.startsWith('<h3', index) || html.startsWith('<h4', index)) {
      const tag = html.startsWith('<h3', index) ? 'h3' : 'h4';
      const end = html.indexOf(`</${tag}>`, index);
      const text = html.slice(html.indexOf('>', index) + 1, end);
      out.push(paragraph([{ text: stripTags(text), bold: true, size: tag === 'h3' ? 24 : 22 }], { spacingBefore: 200 }));
      index = end + tag.length + 3;
      continue;
    }

    if (html.startsWith('<ul', index) || html.startsWith('<ol', index)) {
      const tag = html.startsWith('<ul', index) ? 'ul' : 'ol';
      const end = html.indexOf(`</${tag}>`, index);
      const items = [...html.slice(index, end).matchAll(/<li>([\s\S]*?)<\/li>/g)];
      for (const item of items) {
        out.push(
          paragraph([{ text: `• ${stripTags(item[1]) }`, size: 20 }], { style: 'ListParagraph', spacingAfter: 40 }),
        );
      }
      index = end + tag.length + 3;
      continue;
    }

    if (html.startsWith('<table', index)) {
      const end = html.indexOf('</table>', index);
      out.push(htmlTableToDocx(html.slice(index, end + 8)));
      index = end + 8;
      continue;
    }

    if (html.startsWith('<div class="kpis"', index)) {
      const end = html.indexOf('</div></div>', index);
      const block = html.slice(index, end + 12);
      const items = [...block.matchAll(/<div class="value">([\s\S]*?)<\/div><div class="label">([\s\S]*?)<\/div>/g)];
      out.push(
        table(
          items.map((m) => [{ text: stripTags(m[1]), bold: true, width: 3000 }, { text: stripTags(m[2]) }]),
          { header: false },
        ),
      );
      index = end + 12;
      continue;
    }

    if (html.startsWith('<p', index)) {
      const end = html.indexOf('</p>', index);
      const text = html.slice(html.indexOf('>', index) + 1, end);
      if (text.includes('<table')) {
        const tableEnd = html.indexOf('</table>', index);
        out.push(paragraph([{ text: stripTags(html.slice(index, tableEnd)), size: 18, italic: true, color: '64748B' }]));
        index = tableEnd;
        continue;
      }
      out.push(paragraph([{ text: stripTags(text), size: 20 }], { spacingAfter: 120 }));
      index = end + 4;
      continue;
    }

    index++;
  }

  return out.join('');
}

function htmlTableToDocx(fragment: string): string {
  const rowsXml = [...fragment.matchAll(/<tr>([\s\S]*?)<\/tr>/g)];
  const parsed: TableCell[][] = rowsXml.map((rowMatch) => {
    const cells = [...rowMatch[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)];
    return cells.map((cellMatch) => ({ text: stripTags(cellMatch[1]) }));
  });
  if (!parsed.length) return '';
  const header = parsed[0].map((c) => ({ ...c, bold: true, shading: 'F1F5F9' }));
  return table([header, ...parsed.slice(1)], { header: false });
}

function stripTags(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Package assembly
// ---------------------------------------------------------------------------

export interface DocxOptions {
  outputPath?: string;
  /** Author recorded in the file properties. */
  author?: string;
  title?: string;
  subject?: string;
  company?: string;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

function stylesXml(branding: Branding): string {
  const primary = branding.primaryColor.replace('#', '').toUpperCase();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="44"/><w:szCs w:val="44"/><w:color w:val="${primary}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/><w:spacing w:before="320" w:after="140"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/><w:spacing w:before="260" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/><w:color w:val="${primary}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:pPr><w:outlineLvl w:val="2"/><w:spacing w:before="200" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:pPr><w:spacing w:after="160"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:pPr><w:ind w:left="360"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:rPr><w:i/><w:sz w:val="18"/><w:color w:val="64748B"/></w:rPr></w:style>
</w:styles>`;
}

const NUMBERING_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="200"/></w:pPr></w:lvl>
</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;

function coreXml(options: DocxOptions, context: DocumentContext): string {
  const title = options.title ?? context.title;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${esc(title)}</dc:title>
<dc:subject>${esc(options.subject ?? context.subtitle ?? '')}</dc:subject>
<dc:creator>${esc(options.author ?? context.branding.preparedBy ?? context.branding.productName)}</dc:creator>
<cp:lastModifiedBy>${esc(context.branding.productName)}</cp:lastModifiedBy>
<cp:keywords>compliance, ${esc(context.kind)}</cp:keywords>
<dcterms:created xsi:type="dcterms:W3CDTF">${esc(context.generatedAt)}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${esc(context.generatedAt)}</dcterms:modified>
<cp:revision>${context.changeLog?.length ?? 1}</cp:revision>
</cp:coreProperties>`;
}

const APP_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>CompliSME</Application><Company>CompliSME</Company>
</Properties>`;

function documentXml(context: DocumentContext, options: DocxOptions): string {
  const parts: string[] = [];

  // Cover
  parts.push(paragraph([{ text: context.branding.productName.toUpperCase(), bold: true, size: 18, color: context.branding.primaryColor.replace('#', '').toUpperCase() }]));
  parts.push(paragraph([{ text: context.title, bold: true, size: 44 }], { style: 'Title' }));
  if (context.subtitle) parts.push(paragraph([{ text: context.subtitle, size: 26, color: '475569' }]));
  parts.push(
    table(
      context.metadata.map((m) => [
        { text: m.label, bold: true, shading: 'F8FAFC', width: 2800 },
        { text: m.value },
      ]),
      { header: false, widths: [2800, 6200] },
    ),
  );
  parts.push(pageBreak());

  // TOC
  if (context.toc.length) {
    parts.push(tocField());
    parts.push(pageBreak());
  }

  // Sections
  for (const section of context.sections) {
    parts.push(renderDocxSection(section, context));
  }

  // Document history
  if (context.changeLog?.length) {
    parts.push(paragraph([{ text: 'Document history', bold: true, size: 26 }], { style: 'Heading2' }));
    parts.push(
      table(
        [
          [
            { text: 'Version', bold: true, shading: 'F1F5F9' },
            { text: 'Date', bold: true, shading: 'F1F5F9' },
            { text: 'Author', bold: true, shading: 'F1F5F9' },
            { text: 'Change', bold: true, shading: 'F1F5F9' },
          ],
          ...context.changeLog.map((c) => [{ text: String(c.version) }, { text: c.date }, { text: c.author ?? '—' }, { text: c.summary }]),
        ],
        { header: false },
      ),
    );
  }

  const disclaimer = context.disclaimer ?? DEFAULT_DISCLAIMER;
  parts.push(paragraph([{ text: `Notice: ${disclaimer}`, italic: true, size: 16, color: '64748B' }], { spacingBefore: 240 }));

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${parts.join('')}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>
</w:body></w:document>`;
}

function renderDocxSection(section: Section, context: DocumentContext): string {
  const level = section.level ?? 2;
  const style = level <= 1 ? 'Heading1' : level === 2 ? 'Heading2' : 'Heading3';
  const parts = [paragraph([{ text: section.heading, bold: true }], { style })];

  const narrative = context.narrative?.[section.id];
  if (narrative && !section.body.includes('TO BE COMPLETED')) {
    parts.push(paragraph([{ text: narrative, size: 20 }]));
  }
  parts.push(htmlToDocxBody(section.body));
  return parts.join('');
}

/** Build a .docx as a Node Buffer. */
export async function renderDocx(context: DocumentContext, options: DocxOptions = {}): Promise<Buffer> {
  const zip = new JSZip();

  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', ROOT_RELS);
  zip.file('docProps/core.xml', coreXml(options, context));
  zip.file('docProps/app.xml', APP_XML);
  zip.file('word/document.xml', documentXml(context, options));
  zip.file('word/styles.xml', stylesXml(context.branding));
  zip.file('word/numbering.xml', NUMBERING_XML);
  zip.file('word/_rels/document.xml.rels', DOCUMENT_RELS);

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
  return buffer;
}

/** Build and write a .docx to disk. */
export async function writeDocx(
  context: DocumentContext,
  outputPath: string,
  options: DocxOptions = {},
): Promise<string> {
  const buffer = await renderDocx(context, options);
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, buffer);
  return resolved;
}

/** DOCX generation always works: it has no external dependency. */
export async function docxAvailable(): Promise<boolean> {
  return true;
}