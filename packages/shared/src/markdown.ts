/**
 * Minimal Markdown renderer (headings, lists, tables, code, quotes, rules).
 * Used by the docs site, the CLI `--format md` output and DOCX/HTML generation.
 * Deliberately dependency-free and XSS-safe: raw HTML in the source is escaped.
 */

export interface MarkdownToken {
  type: 'heading' | 'paragraph' | 'list' | 'table' | 'code' | 'quote' | 'hr' | 'html';
  text?: string;
  level?: number;
  items?: Array<{ text: string; ordered: boolean; depth: number }>;
  rows?: string[][];
  lang?: string;
  tokens?: MarkdownToken[];
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  out = out.replace(/  \n/g, '<br/>');
  return out;
}

export function renderInline(text: string): string {
  return inline(text);
}

export function tokenizeMarkdown(markdown: string): MarkdownToken[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const tokens: MarkdownToken[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i++;
      continue;
    }

    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const lang = fence[1] || undefined;
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      tokens.push({ type: 'code', text: body.join('\n'), lang });
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      tokens.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      i++;
      continue;
    }

    if (/^(---|\*\*\*|___)\s*$/.test(line)) {
      tokens.push({ type: 'hr' });
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      tokens.push({ type: 'quote', text: body.join('\n') });
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [header];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(splitRow(lines[i++]));
      tokens.push({ type: 'table', rows });
      continue;
    }

    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const items: Array<{ text: string; ordered: boolean; depth: number }> = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        const raw = lines[i];
        const indent = raw.length - raw.trimStart().length;
        const ordered = /^\s*\d+\./.test(raw);
        items.push({
          text: raw.replace(/^\s*([-*+]|\d+\.)\s+/, '').trim(),
          ordered,
          depth: Math.min(3, Math.floor(indent / 2)),
        });
        i++;
      }
      tokens.push({ type: 'list', items });
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+\.)\s)/.test(lines[i])) {
      paragraph.push(lines[i++]);
    }
    tokens.push({ type: 'paragraph', text: paragraph.join('\n') });
  }

  return tokens;
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

export function renderMarkdown(markdown: string): string {
  const tokens = tokenizeMarkdown(markdown);
  const out: string[] = [];

  let inList: 'ul' | 'ol' | null = null;
  const closeList = () => {
    if (inList) {
      out.push(`</${inList}>`);
      inList = null;
    }
  };

  for (const token of tokens) {
    switch (token.type) {
      case 'heading': {
        closeList();
        const level = token.level ?? 1;
        out.push(`<h${level} id="${slug(token.text ?? '')}">${inline(token.text ?? '')}</h${level}>`);
        break;
      }
      case 'paragraph':
        closeList();
        out.push(`<p>${inline(token.text ?? '')}</p>`);
        break;
      case 'list': {
        const kind = token.items?.[0]?.ordered ? 'ol' : 'ul';
        if (inList !== kind) {
          closeList();
          out.push(`<${kind}>`);
          inList = kind;
        }
        for (const item of token.items ?? []) {
          out.push(`<li>${inline(item.text)}</li>`);
        }
        break;
      }
      case 'table': {
        closeList();
        const [header, ...rows] = token.rows ?? [];
        out.push('<table><thead><tr>');
        for (const cell of header) out.push(`<th>${inline(cell)}</th>`);
        out.push('</tr></thead><tbody>');
        for (const row of rows) {
          out.push('<tr>');
          for (const cell of row) out.push(`<td>${inline(cell)}</td>`);
          out.push('</tr>');
        }
        out.push('</tbody></table>');
        break;
      }
      case 'code':
        closeList();
        out.push(
          `<pre><code${token.lang ? ` class="language-${escapeHtml(token.lang)}"` : ''}>${escapeHtml(
            token.text ?? '',
          )}</code></pre>`,
        );
        break;
      case 'quote':
        closeList();
        out.push(`<blockquote>${inline(token.text ?? '')}</blockquote>`);
        break;
      case 'hr':
        closeList();
        out.push('<hr/>');
        break;
      default:
        break;
    }
  }
  closeList();
  return out.join('\n');
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function extractHeadings(markdown: string): Array<{ level: number; text: string; slug: string }> {
  return tokenizeMarkdown(markdown)
    .filter((t): t is MarkdownToken & { text: string; level: number } => t.type === 'heading' && !!t.text)
    .map((t) => ({ level: t.level, text: t.text, slug: slug(t.text) }));
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}