/**
 * Gap analysis.
 *
 * A "gap" is one actionable, addressable deficiency. Gaps come from four sources
 * and every gap keeps a stable id so it can be tracked over time across
 * re-assessments:
 *
 *  1. unanswered or failed questionnaire items (source: `rules`)
 *  2. missing evidence for an otherwise compliant article (source: `rules`)
 *  3. codebase findings from the scanner (source: `scanner`)
 *  4. LLM-identified gaps (source: `llm`), always merged with a lower priority
 */

import {
  addDays,
  compareSeverity,
  gapId as makeGapId,
  groupBy,
  severityFromExposure,
  toDate,
  uniq,
} from '@complisme/shared';
import type {
  Answers,
  Article,
  CompanyProfile,
  Evidence,
  Finding,
  Framework,
  FrameworkId,
  Gap,
  GapSource,
  Question,
  Severity,
} from '@complisme/shared';

import { severityFor, scoreArticle } from './scoring';

export interface GapAnalysisOptions {
  companyId?: string;
  /** Only analyse these frameworks (defaults to the framework list). */
  frameworkIds?: FrameworkId[];
  evidence?: Evidence[];
  /** Treat unanswered questions as warnings instead of errors. */
  lenientOnUnanswered?: boolean;
  /** Today, injectable for deterministic tests. */
  today?: Date;
  /** Deadline assigned to gaps with no article deadline. */
  defaultHorizonDays?: number;
}

/**
 * Analyse the answers for a set of frameworks and return every gap.
 * Gaps are deduplicated by `${frameworkId}:${articleId}:${questionId}`.
 */
export function gapAnalyze(
  frameworks: Framework[],
  profile: CompanyProfile,
  answers: Answers,
  options: GapAnalysisOptions = {},
): Gap[] {
  const today = options.today ?? new Date();
  const horizon = addDays(today, options.defaultHorizonDays ?? 180);
  const companyId = options.companyId ?? profile.id;
  const evidence = options.evidence ?? [];
  const gaps: Gap[] = [];

  for (const framework of frameworks) {
    for (const article of framework.articles) {
      const score = scoreArticle(framework.id, article, answers, evidence);
      if (!score.applicable) continue;

      const frameworkAnswers = answers[framework.id] ?? {};

      for (const question of article.questionnaire) {
        const outcome = score.outcomes.find((o) => o.questionId === question.id);
        if (!outcome) continue;
        if (outcome.verdict !== 'fail' && outcome.verdict !== 'unknown') continue;

        const unanswered = outcome.verdict === 'unknown';
        const severity: Severity =
          unanswered && options.lenientOnUnanswered
            ? downgrade(severityFor(question, article, outcome.verdict))
            : severityFor(question, article, outcome.verdict);

        gaps.push({
          id: makeGapId(companyId, framework.id, article.id, question.id),
          frameworkId: framework.id,
          articleId: article.id,
          questionId: question.id,
          title: question.text,
          description: buildDescription(article, question, unanswered),
          severity,
          remediation: buildRemediation(article, question),
          effort: Math.max(0.5, (question.effort ?? 3) * (unanswered ? 0.6 : 1)),
          deadline: article.deadline ? new Date(`${article.deadline}T00:00:00Z`) : horizon,
          deadlineIso: article.deadline ?? horizon.toISOString().slice(0, 10),
          fineExposure: article.fineExposure,
          citation: question.citation ?? article.reference,
          source: 'rules',
          status: 'open',
          confidence: unanswered ? 0.55 : 0.95,
        });
      }

      // Missing evidence for an article whose questions are answered: still a gap,
      // because "we comply" without a document is not audit-proof.
      if (score.missingEvidence.length && score.score >= 60) {
        for (const item of score.missingEvidence) {
          gaps.push({
            id: makeGapId(companyId, framework.id, article.id, `evidence:${slug(item)}`),
            frameworkId: framework.id,
            articleId: article.id,
            title: `Missing evidence: ${item}`,
            description: `Article ${article.title} requires "${item}" but no evidence is linked.`,
            severity: 'warning',
            remediation: `Produce or upload: ${item}.`,
            effort: 4,
            deadline: article.deadline ? new Date(`${article.deadline}T00:00:00Z`) : horizon,
            deadlineIso: article.deadline ?? horizon.toISOString().slice(0, 10),
            fineExposure: Math.round((article.fineExposure ?? 0) * 0.2),
            citation: article.reference,
            source: 'rules',
            status: 'open',
            confidence: 0.7,
          });
        }
      }
    }
  }

  return dedupe(gaps);
}

function buildDescription(article: Article, question: Question, unanswered: boolean): string {
  const prefix = unanswered
    ? 'Not yet answered in the assessment — assumed not implemented: '
    : 'Declared as not compliant: ';
  return `${prefix}${question.text} (${article.title})`;
}

function buildRemediation(article: Article, question: Question): string {
  const base = question.remediation ?? `Implement the requirements of ${article.title}.`;
  const evidence = article.evidenceRequired[0];
  return evidence ? `${base} Evidence to retain: ${evidence}.` : base;
}

function downgrade(severity: Severity): Severity {
  return severity === 'error' ? 'warning' : severity === 'warning' ? 'info' : 'info';
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40);
}

/** Merge gaps from different sources, keeping the most severe/confident entry. */
export function mergeGaps(...groups: Gap[][]): Gap[] {
  const byId = new Map<string, Gap>();
  for (const gap of groups.flat()) {
    const key = gapKey(gap);
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, gap);
      continue;
    }
    byId.set(key, pickDominant(existing, gap));
  }
  return [...byId.values()];
}

function gapKey(gap: Gap): string {
  return `${gap.frameworkId}:${gap.articleId}:${gap.questionId ?? gap.title ?? gap.id}`;
}

function pickDominant(a: Gap, b: Gap): Gap {
  const bySeverity = compareSeverity(a.severity, b.severity);
  if (bySeverity !== 0) return bySeverity < 0 ? a : b;
  const bySource = sourcePriority(a.source) - sourcePriority(b.source);
  if (bySource !== 0) return bySource > 0 ? a : b;
  return (b.confidence ?? 0) > (a.confidence ?? 0) ? b : a;
}

function sourcePriority(source: GapSource | undefined): number {
  return source === 'rules' ? 3 : source === 'scanner' ? 2 : source === 'llm' ? 1 : 0;
}

export function dedupe(gaps: Gap[]): Gap[] {
  const seen = new Set<string>();
  const out: Gap[] = [];
  for (const gap of gaps) {
    const key = gapKey(gap);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(gap);
  }
  return out;
}

/**
 * Convert codebase findings into compliance gaps. One gap per (rule, article)
 * pair so a finding repeated 40 times in the codebase does not produce 40 rows.
 */
export function findingsToGaps(
  findings: Finding[],
  options: { companyId?: string; ruleset?: 'gdpr' | 'ai-act' | 'all' } = {},
): Gap[] {
  const filtered =
    options.ruleset && options.ruleset !== 'all'
      ? findings.filter((f) => f.mappings.some((m) => m.frameworkId === options.ruleset))
      : findings;
  const grouped = groupBy(filtered, (f) => `${f.category}`);
  const gaps: Gap[] = [];

  for (const [category, group] of Object.entries(grouped)) {
    const fileCount = uniq(group.map((f) => f.file)).length;
    const refs = dedupeRefs(group.flatMap((f) => f.mappings));
    for (const ref of refs) {
      gaps.push({
        id: makeGapId(options.companyId, ref.frameworkId, ref.articleId, `scanner:${category}`),
        frameworkId: ref.frameworkId,
        articleId: ref.articleId,
        questionId: undefined,
        title: `Codebase: ${group[0].message}`,
        description: `${group.length} finding(s) of type "${category}" across ${fileCount} file(s). ${ref.reason}`,
        severity: severityFromFinding(group),
        remediation: buildScannerRemediation(category, ref.frameworkId),
        effort: Math.min(15, 2 + Math.ceil(group.length / 4)),
        deadline: undefined,
        fineExposure: undefined,
        source: 'scanner',
        status: 'open',
        confidence: Math.max(...group.map((f) => f.confidence)),
        findings: group.slice(0, 25),
        citation: undefined,
      });
    }
  }
  return gaps;
}

function dedupeRefs(refs: Finding['mappings']): Finding['mappings'] {
  const seen = new Set<string>();
  const out: Finding['mappings'] = [];
  for (const ref of refs) {
    const key = `${ref.frameworkId}:${ref.articleId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

function severityFromFinding(group: Finding[]): Severity {
  const worst = group.map((f) => f.severity);
  if (worst.includes('critical') || worst.includes('high')) return 'error';
  if (worst.includes('medium')) return 'warning';
  return 'info';
}

function buildScannerRemediation(category: string, frameworkId: string): string {
  const map: Record<string, string> = {
    'pii-collection':
      'Document the legal basis for this personal data collection in the ROPA and add it to the privacy notice.',
    'sensitive-data':
      'Add an Art. 9(2) exception analysis for this special-category data, and consider whether the collection can be avoided entirely.',
    consent:
      'Replace implied or bundled consent with a granular, freely given consent flow, and record consent receipts.',
    retention:
      'Define and enforce a retention period for this data, with automatic deletion at the end of the period.',
    'personal-data-logging':
      'Stop logging personal data, or redact/tokenise it. Logs inherit the retention and access rules of the source data.',
    'ai-api-call':
      'Record this AI call in the AI inventory, classify it under the AI Act, and disclose the AI interaction to end users.',
    'data-transfer':
      'Put the transfer on the register, sign the appropriate SCCs and complete a transfer impact assessment.',
    encryption:
      'Encrypt this data at rest and in transit, and document the key management responsibility split.',
    'access-control':
      'Restrict access to least privilege and add this resource to the periodic access review.',
    'cookie-consent':
      'Implement a consent banner that blocks non-essential cookies and non-essential trackers until consent is given.',
    profiling:
      'Document the profiling logic and add the required Art. 13/14 information plus an objection channel.',
    biometric:
      'Stop processing biometric data without an Art. 9(2) exception and, where applicable, an Art. 5 prohibition review.',
    'unstructured-storage':
      'Move personal data out of free-form logs/files into a structured store with defined access and retention.',
  };
  const base =
    map[category] ??
    `Review the ${category} findings and document the compliance decision for ${frameworkId}.`;
  return `${base} Fix: ${group_fix_hint(category)}`;
}

function group_fix_hint(category: string): string {
  const hints: Record<string, string> = {
    'personal-data-logging': 'replace the value with a hashed or redacted token in the log call',
    'pii-collection': 'route the field through an explicit schema and a documented lawful basis',
    consent: 'capture an explicit consent event before the processing call',
    'cookie-consent': 'initialise the consent manager before any tracker script runs',
    'ai-api-call': 'wrap the call with a compliance context object (model, purpose, system id)',
  };
  return hints[category] ?? 'add the corresponding control and record it as evidence';
}

/** Aggregate summary of a gap list, used by the CLI and the dashboard. */
export function summariseGaps(gaps: Gap[]): {
  total: number;
  bySeverity: Record<Severity, number>;
  byFramework: Record<string, number>;
  effort: number;
  fineExposure: number;
  blockers: number;
} {
  const bySeverity: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  const byFramework: Record<string, number> = {};
  let effort = 0;
  let fineExposure = 0;
  for (const gap of gaps) {
    bySeverity[gap.severity] += 1;
    byFramework[gap.frameworkId] = (byFramework[gap.frameworkId] ?? 0) + 1;
    effort += gap.effort ?? 0;
    fineExposure = Math.max(fineExposure, gap.fineExposure ?? 0);
  }
  return {
    total: gaps.length,
    bySeverity,
    byFramework,
    effort: Math.round(effort * 10) / 10,
    fineExposure,
    blockers: bySeverity.error,
  };
}

/** Resolve a gap deadline as a Date, tolerating both `deadline` and `deadlineIso`. */
export function gapDeadline(gap: Gap): Date | undefined {
  return toDate(gap.deadline) ?? toDate(gap.deadlineIso);
}