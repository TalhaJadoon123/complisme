/** Severity, grading and answer-normalisation helpers. */

import { SEVERITY_RANK, SEVERITY_WEIGHT } from './constants';
import type {
  AnswerValue,
  Answers,
  FrameworkArticleRef,
  Grade,
  Question,
  QuestionOption,
  Severity,
} from './types';
import { clamp } from './utils';

export const NOT_APPLICABLE_VALUES = new Set(['n/a', 'na', 'not-applicable', 'not_applicable', 'none']);

export function isNotApplicable(value: AnswerValue | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value !== 'string') return false;
  return NOT_APPLICABLE_VALUES.has(value.trim().toLowerCase());
}

export function isAnswered(value: AnswerValue | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Resolve whether a single answer satisfies its question.
 * Returns one of:
 *  - `unknown`   no answer given
 *  - `na`        answered as not applicable
 *  - `pass`      answered in a compliant way
 *  - `fail`      answered in a non-compliant way
 */
export type AnswerVerdict = 'pass' | 'fail' | 'na' | 'unknown';

export function evaluateAnswer(question: Question, value: AnswerValue | undefined): AnswerVerdict {
  if (!isAnswered(value)) return 'unknown';
  if (isNotApplicable(value)) return 'na';

  switch (question.type) {
    case 'boolean': {
      const options = question.options?.length ? question.options : optionsOf(question);
      const candidates = answerCandidates(value);
      const match = candidates
        .map((candidate) => options.find((o) => String(o.value).toLowerCase() === candidate))
        .find((o): o is QuestionOption => !!o);
      if (!match) {
        // No matching option: fall back to plain truthiness, accepting the
        // usual spellings of yes and no.
        return candidates.some((candidate) => TRUTHY.includes(candidate)) ? 'pass' : 'fail';
      }
      if (match.notApplicable) return 'na';
      return match.satisfies === false ? 'fail' : 'pass';
    }
    case 'single':
    case 'multi': {
      const options = optionsOf(question);
      const selected = answerCandidates(value);
      if (selected.length === 0) return 'unknown';
      const matched = options.filter((o) => selected.includes(String(o.value).toLowerCase()));
      if (matched.length === 0) return 'fail';
      if (matched.some((o) => o.notApplicable)) return 'na';
      const allSatisfying = matched.every((o) => o.satisfies !== false);
      return allSatisfying ? 'pass' : 'fail';
    }
    case 'number':
    case 'text':
      return Array.isArray(value) ? (value.length ? 'pass' : 'unknown') : 'pass';
    default:
      return 'unknown';
  }
}

const TRUTHY = ['true', 'yes', 'y', '1', 'on'];

/**
 * Booleans and their string forms are interchangeable on the wire: the API may
 * receive `true` while the questionnaire option is `"yes"`. Expand a raw answer
 * into every spelling it could match.
 */
function answerCandidates(value: AnswerValue | undefined): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).toLowerCase());
  const raw = String(value).trim().toLowerCase();
  const truthy = ['true', 'yes', 'y', '1', 'on'];
  const falsy = ['false', 'no', 'n', '0', 'off'];
  const extra: string[] = [];
  if (truthy.includes(raw) || falsy.includes(raw)) {
    extra.push(raw === 'true' || truthy.includes(raw) ? 'yes' : 'no');
    extra.push(raw === 'true' || truthy.includes(raw) ? 'true' : 'false');
  }
  return [raw, ...extra];
}

export function optionsOf(question: Question): QuestionOption[] {
  if (question.options && question.options.length) return question.options;
  if (question.type === 'boolean') {
    return [
      { value: 'yes', label: 'Yes', satisfies: true },
      { value: 'no', label: 'No', satisfies: false },
    ];
  }
  return [];
}

/** Severity derived from the fine exposure and the article weight. */
export function severityFromExposure(fineExposure: number | undefined, weight = 1): Severity {
  const exposure = fineExposure ?? 0;
  if (exposure >= 1_000_000 || weight >= 2) return 'error';
  if (exposure >= 50_000 || weight >= 1.25) return 'warning';
  if (exposure > 0) return 'info';
  return 'warning';
}

export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITY_RANK[a] - SEVERITY_RANK[b];
}

export function severityWeight(severity: Severity): number {
  return SEVERITY_WEIGHT[severity];
}

/** Weighted coverage (0-100) from per-item scores in the 0..1 range. */
export function weightedScore(items: Array<{ score: number; weight: number }>): number {
  const totalWeight = items.reduce((acc, i) => acc + i.weight, 0);
  if (totalWeight <= 0) return 0;
  const acc = items.reduce((acc2, i) => acc2 + i.score * i.weight, 0);
  return clamp((acc / totalWeight) * 100, 0, 100);
}

export function gradeFor(score: number): Grade {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

/** Whether a question should be shown given the answers collected so far. */
export function questionApplies(question: Question, all: Answers, frameworkId: string): boolean {
  if (!question.showIf) return true;
  const value = all[frameworkId]?.[question.showIf.questionId];
  const expected = question.showIf.equals;
  if (value === undefined || value === null) return true;
  if (Array.isArray(expected)) {
    const actual = Array.isArray(value) ? value.map(String) : [String(value)];
    return actual.some((v) => expected.map(String).includes(v));
  }
  if (typeof expected === 'boolean') {
    return value === expected || String(value) === String(expected);
  }
  return String(value) === String(expected);
}

export function dedupeRefs(refs: FrameworkArticleRef[]): FrameworkArticleRef[] {
  const seen = new Set<string>();
  const out: FrameworkArticleRef[] = [];
  for (const ref of refs) {
    const key = `${ref.frameworkId}:${ref.articleId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

/** Human readable label for an answer, used in generated documents. */
export function describeAnswer(question: Question, value: AnswerValue | undefined): string {
  if (!isAnswered(value)) return 'Not answered';
  if (isNotApplicable(value)) return 'Not applicable';
  const options = optionsOf(question);
  const candidates = answerCandidates(value);
  const match = candidates
    .map((candidate) => options.find((o) => String(o.value).toLowerCase() === candidate))
    .find((o): o is QuestionOption => !!o);
  if (match) return match.label;
  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : 'None';
  }
  return String(value);
}