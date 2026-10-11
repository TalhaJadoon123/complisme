/**
 * Shared helpers used by all document templates: context assembly, escaping and
 * the "complete or flag" convention.
 */

import {
  COUNTDOWN_EVENTS,
  DEFAULT_BRANDING,
  describeAnswer,
  formatDateEU,
  formatEuro,
  formatNumber,
  nowIso,
  stableId,
} from '@complisme/shared';
import type { Answers, CompanyProfile, DocumentKind } from '@complisme/shared';

import { escapeHtml } from '../types';
import type { Branding, DocumentContext, Section, TocEntry } from '../types';

export { escapeHtml };

export const TBC = (what: string) =>
  `<span class="badge">TO BE COMPLETED: ${escapeHtml(what)}</span>`;

export function resolveBranding(input?: Partial<Branding>): Branding {
  return {
    ...DEFAULT_BRANDING,
    ...(input ?? {}),
    productName: input?.productName ?? DEFAULT_BRANDING.productName,
    primaryColor: input?.primaryColor ?? DEFAULT_BRANDING.primaryColor,
  } as Branding;
}

/** Build the document control block shown on the cover page. */
export function coverMetadata(
  kind: DocumentKind,
  profile?: CompanyProfile,
  extra: Array<[string, string]> = [],
): Array<{ label: string; value: string }> {
  const rows: Array<[string, string]> = [
    ['Document type', kind],
    ['Company', profile?.legalName ?? profile?.name ?? 'Not provided'],
    ['Registration / ID', profile?.country ? `Country: ${profile.country}` : 'Not provided'],
    ['Generated', formatDateEU(nowIso())],
    ['Version', '1.0'],
    ['Status', 'Draft for review'],
  ];
  for (const [k, v] of extra) rows.push([k, v]);
  return rows.map(([label, value]) => ({ label, value }));
}

/** Wrap sections into a TOC and a body string. */
export function renderSections(sections: Section[]): { toc: TocEntry[]; body: string } {
  const toc = sections
    .filter((s) => !s.skipToc)
    .map((s) => ({ id: s.id, heading: s.heading, level: s.level ?? 2 }));
  const body = sections
    .map((s) => {
      const level = s.level ?? 2;
      return `<section class="section" id="sec-${escapeHtml(s.id)}"><h${level}>${escapeHtml(
        s.heading,
      )}</h${level}>${s.body}</section>`;
    })
    .join('\n');
  return { toc, body };
}

export interface BuildInput {
  kind: DocumentKind;
  title: string;
  subtitle?: string;
  sections: Section[];
  profile?: CompanyProfile;
  answers?: Answers;
  branding?: Partial<Branding>;
  extraMetadata?: Array<[string, string]>;
  disclaimer?: string;
  styles?: string;
  changeLog?: DocumentContext['changeLog'];
  scores?: DocumentContext['scores'];
  gaps?: DocumentContext['gaps'];
  roadmap?: DocumentContext['roadmap'];
  narrative?: Record<string, string>;
  tables?: DocumentContext['tables'];
}

export function createContext(input: BuildInput): DocumentContext {
  const { toc, body } = renderSections(input.sections);
  return {
    kind: input.kind,
    title: input.title,
    subtitle: input.subtitle,
    metadata: coverMetadata(input.kind, input.profile, input.extraMetadata ?? []),
    sections: input.sections,
    toc,
    branding: resolveBranding(input.branding),
    generatedAt: nowIso(),
    company: input.profile,
    frameworks: [],
    answers: input.answers,
    scores: input.scores,
    gaps: input.gaps,
    roadmap: input.roadmap,
    narrative: input.narrative,
    disclaimer: input.disclaimer,
    changeLog: input.changeLog ?? [
      { version: 1, date: nowIso().slice(0, 10), author: input.branding?.preparedBy ?? 'CompliSME', summary: 'Initial generated version' },
    ],
    tables: input.tables,
  };
}

// ---------------------------------------------------------------------------
// Formatting shorthands re-exported so templates stay short
// ---------------------------------------------------------------------------

export const fmt = {
  date: formatDateEU,
  euro: formatEuro,
  num: formatNumber,
  esc: escapeHtml,
};

/** Answer value rendered for human readers, e.g. "Documented programme…". */
export function answerLabel(
  answers: Answers | undefined,
  frameworkId: string,
  question: Parameters<typeof describeAnswer>[0],
): string {
  return escapeHtml(describeAnswer(question, answers?.[frameworkId]?.[question.id]));
}

/** Upcoming regulatory deadlines relevant to the company. */
export function upcomingDeadlines(limit = 4) {
  return COUNTDOWN_EVENTS.slice(0, limit);
}

/** Stable id for section anchors and filenames. */
export function sectionId(input: string): string {
  return stableId('sec', input).slice(0, 8);
}

export function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Percent with no decimals. */
export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Convert key/value pairs into a two-column table body. Labels are escaped,
 * values are trusted HTML (they may contain markup from the templates).
 */
export function rows(entries: Array<readonly [string, string]>): string[][] {
  return entries.map(([key, value]) => [escapeHtml(key), value]);
}