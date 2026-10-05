import fs from 'node:fs';
import path from 'node:path';

import { extractHeadings, renderMarkdown } from '@complisme/shared';

const CONTENT_DIR = path.join(process.cwd(), 'content');

export interface DocPage {
  slug: string;
  title: string;
  description: string;
  html: string;
  headings: Array<{ level: number; text: string; slug: string }>;
  order: number;
}

/**
 * Slugs come from the URL and are used to build a filesystem path, so they
 * must be restricted to the character set the content files actually use.
 * Without this, `%2e%2e%2f%2e%2e%2fetc%2fpasswd` style input would escape the
 * content directory.
 */
const SAFE_SLUG = /^[a-z0-9][a-z0-9-/]*$/i;

export function isValidSlug(slug: string): boolean {
  if (!slug || slug.length > 120) return false;
  if (slug.includes('..')) return false;
  if (slug.includes('\\') || slug.includes('\0')) return false;
  return SAFE_SLUG.test(slug);
}

function read(slug: string): string {
  if (!isValidSlug(slug)) throw new Error(`invalid documentation slug: ${slug}`);
  const candidates = [path.join(CONTENT_DIR, `${slug}.md`), path.join(CONTENT_DIR, `${slug}.mdx`)];
  for (const candidate of candidates) {
    // Belt and braces: confirm the resolved path is still inside the content dir.
    if (!path.resolve(candidate).startsWith(path.resolve(CONTENT_DIR) + path.sep)) {
      throw new Error(`refusing to read outside the content directory: ${slug}`);
    }
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8');
  }
  throw new Error(`documentation page not found: ${slug}`);
}

/** Parse the optional front matter (a tiny YAML subset, no dependency). */
function frontMatter(source: string): { data: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { data: {}, body: source };
  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const index = line.indexOf(':');
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    if (key) data[key] = value;
  }
  return { data, body: source.slice(match[0].length) };
}

export function getPage(slug: string): DocPage {
  const source = read(slug);
  const { data, body } = frontMatter(source);
  const headings = extractHeadings(body);
  return {
    slug,
    title: data.title ?? headings.find((h) => h.level === 1)?.text ?? slug,
    description: data.description ?? '',
    html: renderMarkdown(body),
    headings: headings.filter((h) => h.level > 1),
    order: Number(data.order ?? 100),
  };
}

/** Sidebar tree, ordered by the `order` front-matter key. */
export function listPages(): DocPage[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((file) => /\.mdx?$/.test(file))
    .map((file) => file.replace(/\.mdx?$/, ''))
    // Defend against a stray symlink or oddly-named file in the content dir.
    .filter(isValidSlug)
    .map(getPage)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export function listSections(): Array<{ title: string; pages: DocPage[] }> {
  const pages = listPages();
  const sections = new Map<string, DocPage[]>();
  for (const page of pages) {
    const section = page.slug.split('/')[0];
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section)!.push(page);
  }
  const order = ['introduction', 'cli', 'api', 'frameworks', 'scanner', 'deploy', 'legal'];
  return [...sections.entries()]
    .sort((a, b) => {
      const ai = order.indexOf(a[0]);
      const bi = order.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .map(([title, sectionPages]) => ({ title, pages: sectionPages }));
}