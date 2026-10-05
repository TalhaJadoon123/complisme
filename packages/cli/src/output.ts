/**
 * Terminal output.
 *
 * No colour library: ANSI is emitted directly and disabled when NO_COLOR is set
 * or stdout is not a TTY, so piping to a file or a CI log stays readable.
 */

import {
  formatDateEU,
  formatEuro,
  formatNumber,
} from '@complisme/shared';
import type { ComplianceScore, Finding, Gap, Roadmap, Severity } from '@complisme/shared';

const useColor = (): boolean =>
  !process.env.NO_COLOR && process.env.TERM !== 'dumb' && process.stdout.isTTY === true;

const wrap = (code: string) => (text: string) => (useColor() ? `[${code}m${text}[0m` : text);

export const c = {
  bold: wrap('1'),
  dim: wrap('2'),
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  blue: wrap('34'),
  magenta: wrap('35'),
  cyan: wrap('36'),
  grey: wrap('90'),
  boldGreen: wrap('1;32'),
  boldRed: wrap('1;31'),
  boldYellow: wrap('1;33'),
  boldCyan: wrap('1;36'),
};

export const SYMBOLS = {
  error: '✖',
  warning: '▲',
  info: '•',
  ok: '✔',
  arrow: '→',
};

/** Person-days for humans: `5d`, not `5.0d`. */
function days(value: number | undefined): string {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.round((value ?? 0) * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}d`;
}

export function severityLabel(severity: Severity): string {
  switch (severity) {
    case 'error':
      return c.boldRed(`${SYMBOLS.error} ERROR`);
    case 'warning':
      return c.boldYellow(`${SYMBOLS.warning} WARN `);
    default:
      return c.cyan(`${SYMBOLS.info} INFO `);
  }
}

export function severityOfFinding(severity: string): string {
  switch (severity) {
    case 'critical':
      return c.boldRed('CRITICAL');
    case 'high':
      return c.red('HIGH    ');
    case 'medium':
      return c.yellow('MEDIUM  ');
    case 'low':
      return c.cyan('LOW     ');
    default:
      return c.grey('INFO    ');
  }
}

/** Horizontal bar used for scores and completion percentages. */
export function bar(percent: number, width = 28): string {
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * width);
  const done = '█'.repeat(filled);
  const rest = '░'.repeat(Math.max(0, width - filled));
  const color = percent >= 80 ? c.green : percent >= 50 ? c.yellow : c.red;
  return `${color(done)}${c.grey(rest)}`;
}

/** Pick a colour band for a percentage, returned as a text painter. */
export function scoreColor(score: number): (text: string) => string {
  if (score >= 80) return c.boldGreen;
  if (score >= 60) return c.boldYellow;
  return c.boldRed;
}

export function heading(text: string): string {
  return `\n${c.boldCyan(text)}\n${c.grey('─'.repeat(Math.min(78, text.length + 8)))}`;
}

export function kv(label: string, value: string): string {
  return `  ${c.grey(label.padEnd(22))} ${value}`;
}

export function print(text = ''): void {
  process.stdout.write(`${text}\n`);
}

export function printError(text: string): void {
  process.stderr.write(`${c.boldRed('error')} ${text}\n`);
}

export function printWarning(text: string): void {
  process.stderr.write(`${c.boldYellow('warning')} ${text}\n`);
}

export function printJson(value: unknown): void {
  print(JSON.stringify(value, null, 2));
}

// ---------------------------------------------------------------------------
// Domain renderers
// ---------------------------------------------------------------------------

export interface ScoreView {
  frameworkId: string;
  label: string;
  score: number;
  grade?: string;
  gaps: number;
  blockers: number;
}

export function renderScores(scores: ComplianceScore[], labels: Record<string, string>): string[] {
  const out: string[] = [];
  const overall = scores.length ? scores.reduce((a, s) => a + s.score, 0) / scores.length : 0;

  out.push(heading('Readiness'));
  out.push(`  ${scoreColor(overall)(bar(overall))}  ${scoreColor(overall)(String(overall.toFixed(1)).padStart(5))}%  overall`);

  for (const score of scores) {
    const label = labels[score.frameworkId] ?? score.frameworkId;
    const blockers = score.gaps.filter((g) => g.severity === 'error').length;
    out.push('');
    out.push(
      `  ${label.padEnd(18)} ${scoreColor(score.score)(bar(score.score, 20))} ` +
        `${scoreColor(score.score)(String(score.score.toFixed(1)).padStart(5))}%` +
        (score.grade ? `  grade ${c.bold(score.grade)}` : '') +
        `  ${c.grey(`${score.gaps.length} gaps`)}` +
        (blockers ? `  ${c.red(`${blockers} blocking`)}` : ''),
    );
  }
  return out;
}

export function renderGaps(gaps: Gap[], limit = 20): string[] {
  const out: string[] = [heading(`Top ${Math.min(limit, gaps.length)} gaps`)];
  if (!gaps.length) {
    out.push(c.green('  No open gaps. Well done.'));
    return out;
  }
  for (const gap of gaps.slice(0, limit)) {
    out.push('');
    out.push(`  ${severityLabel(gap.severity)}  ${c.bold(gap.title ?? `${gap.frameworkId}/${gap.articleId}`)}`);
    if (gap.citation) out.push(c.grey(`             ${gap.citation}`));
    out.push(`             ${gap.remediation}`);
    out.push(
      c.grey(
        `             effort ${days(gap.effort)}` +
          (gap.deadlineIso ? ` · due ${formatDateEU(gap.deadlineIso)}` : '') +
          (gap.fineExposure ? ` · exposure ${formatEuro(gap.fineExposure)}` : '') +
          (gap.source ? ` · source ${gap.source}` : ''),
      ),
    );
  }
  if (gaps.length > limit) out.push('', c.grey(`  … ${gaps.length - limit} more (use --limit to show more)`));
  return out;
}

export function renderFindings(findings: Finding[], limit = 20): string[] {
  const out: string[] = [heading(`Findings (${findings.length})`)];
  if (!findings.length) {
    out.push(c.green('  Nothing found.'));
    return out;
  }
  for (const finding of findings.slice(0, limit)) {
    out.push('');
    out.push(`  ${severityOfFinding(finding.severity)}  ${c.bold(finding.message)}`);
    out.push(c.grey(`            ${finding.file}:${finding.line}  [${finding.ruleId}]`));
    if (finding.snippet) out.push(c.grey(`            ${finding.snippet.slice(0, 110)}`));
    const refs = finding.mappings.map((m) => `${m.frameworkId}/${m.articleId}`).join(', ');
    out.push(c.grey(`            maps to ${refs}`));
    out.push(`            ${finding.remediation}`);
  }
  if (findings.length > limit) out.push('', c.grey(`  … ${findings.length - limit} more`));
  return out;
}

export function renderRoadmap(roadmap: Roadmap): string[] {
  const out: string[] = [];
  out.push(heading('90-day roadmap'));
  out.push(
    `  ${c.grey(`${roadmap.startDate} → ${roadmap.endDate}`)}   ` +
      `${c.bold(formatNumber(roadmap.totalEffort, 1))} person-days` +
      (roadmap.projectedScore ? `   score ${c.grey('→')} ${scoreColor(roadmap.projectedScore)(roadmap.projectedScore.toFixed(1))}` : ''),
  );

  for (const phase of roadmap.phases) {
    if (!phase.items.length) continue;
    out.push('');
    out.push(`  ${c.bold(phase.label)}  ${c.grey(`(${phase.window}, ${formatNumber(phase.effort, 1)}d)`)}`);
    for (const item of phase.items.slice(0, 12)) {
      out.push(`    ${severityLabel(item.severity)}  ${item.title}`);
      out.push(
        c.grey(
          `             ${item.frameworkIds.join(', ')} · ${formatNumber(item.effort, 1)}d · ${item.startDate} → ${item.dueDate}`,
        ),
      );
    }
    if (phase.items.length > 12) out.push(c.grey(`    … ${phase.items.length - 12} more`));
  }

  if (roadmap.quickWins.length) {
    out.push('');
    out.push(`  ${c.bold('Quick wins')} ${c.grey('(complete in the first two weeks)')}`);
    for (const item of roadmap.quickWins.slice(0, 8)) out.push(`    ${c.green(SYMBOLS.ok)} ${item.title}`);
  }
  return out;
}

export function renderTable(headers: string[], rows: string[][], widths?: number[]): string[] {
  const cols = headers.length;
  const w = widths ?? headers.map((_, i) => Math.max(headers[i].length, ...rows.map((r) => (r[i] ?? '').length)));
  const line = (cells: string[]) =>
    '  ' + cells.map((cell, i) => (cell ?? '').padEnd(w[i])).join('  ');
  return [c.bold(line(headers)), c.grey('  ' + w.map((n) => '─'.repeat(n)).join('  ')), ...rows.map(line)];
}

export { formatDateEU, formatEuro, formatNumber };