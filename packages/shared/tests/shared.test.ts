import { describe, expect, it } from 'vitest';

import {
  FRAMEWORK_ACCENT,
  FRAMEWORK_LABELS,
  FRAMEWORK_ORDER,
  PRICING,
  SEVERITY_RANK,
  SEVERITY_WEIGHT,
} from '../src/constants';
import {
  EU_AI_ACT_PHASES,
  GDPR_MAX_FINE,
  AI_ACT_MAX_FINE,
} from '../src/constants';
import {
  addDays,
  addMonths,
  clamp,
  daysBetween,
  extractJsonBlock,
  formatDateEU,
  formatEuro,
  formatNumber,
  isoDate,
  round,
  safeJsonParse,
  slugify,
  stableId,
  toDate,
  unique,
  uuid,
} from '../src/utils';
import {
  describeAnswer,
  evaluateAnswer,
  gradeFor,
  isNotApplicable,
  optionsOf,
  questionApplies,
  weightedScore,
} from '../src/semantics';
import { extractHeadings, renderMarkdown, wordCount } from '../src/markdown';
import { assessRequestSchema, companyProfileSchema, documentKindSchema } from '../src/schemas';
import type { Question } from '../src/types';

describe('constants', () => {
  it('orders the four frameworks canonically', () => {
    expect(FRAMEWORK_ORDER).toEqual(['gdpr', 'eu-ai-act', 'csrd', 'e-invoicing']);
    expect(Object.keys(FRAMEWORK_LABELS)).toHaveLength(4);
    expect(Object.keys(FRAMEWORK_ACCENT)).toHaveLength(4);
  });

  it('uses the real EU AI Act phased dates', () => {
    expect(EU_AI_ACT_PHASES.prohibitions).toBe('2025-02-02');
    expect(EU_AI_ACT_PHASES.governance).toBe('2025-08-02');
    expect(EU_AI_ACT_PHASES.generalApplication).toBe('2026-08-02');
    expect(EU_AI_ACT_PHASES.embeddedHighRisk).toBe('2027-08-02');
  });

  it('quotes the statutory penalty ceilings', () => {
    expect(GDPR_MAX_FINE).toBe(20_000_000);
    expect(AI_ACT_MAX_FINE.prohibited).toBe(35_000_000);
  });

  it('prices Starter at EUR 49 and grants the more capable plans more limits', () => {
    expect(PRICING.starter.monthly).toBe(49);
    expect(PRICING.business.monthly).toBe(149);
    expect(PRICING.free.monthly).toBe(0);
    expect(PRICING.business.seats).toBeGreaterThan(PRICING.starter.seats);
    expect(PRICING.business.scansPerMonth).toBeGreaterThan(PRICING.starter.scansPerMonth);
    expect(PRICING.enterprise.seats).toBeGreaterThan(PRICING.business.seats);
  });

  it('ranks severities in the right order', () => {
    expect(SEVERITY_RANK.error).toBeLessThan(SEVERITY_RANK.warning);
    expect(SEVERITY_RANK.warning).toBeLessThan(SEVERITY_RANK.info);
    expect(SEVERITY_WEIGHT.error).toBeGreaterThan(SEVERITY_WEIGHT.info);
  });
});

describe('utils', () => {
  it('produces stable and unique ids', () => {
    expect(stableId('a', 'b')).toBe(stableId('a', 'b'));
    expect(stableId('a', 'b')).not.toBe(stableId('a', 'c'));
    expect(uuid()).not.toBe(uuid());
    expect(stableId('gap', 'x')).toHaveLength(16);
  });

  it('clamps and rounds', () => {
    expect(clamp(150)).toBe(100);
    expect(clamp(-5)).toBe(0);
    expect(clamp(Number.NaN)).toBe(0);
    expect(round(1.2345, 2)).toBe(1.23);
    expect(round(1.5)).toBe(2);
  });

  it('does date arithmetic in UTC', () => {
    const start = new Date('2026-01-31T00:00:00.000Z');
    expect(addDays(start, 1).toISOString().slice(0, 10)).toBe('2026-02-01');
    expect(addMonths(new Date('2026-01-15T00:00:00.000Z'), 1).toISOString().slice(0, 10)).toBe('2026-02-15');
    expect(daysBetween(new Date('2026-01-01T00:00:00Z'), new Date('2026-01-11T00:00:00Z'))).toBe(10);
  });

  it('parses dates defensively', () => {
    expect(toDate('nonsense')).toBeUndefined();
    expect(toDate(undefined)).toBeUndefined();
    expect(isoDate(new Date('2026-08-02T10:00:00Z'))).toBe('2026-08-02');
    expect(formatDateEU('2026-08-02T00:00:00Z')).toBe('02/08/2026');
    expect(formatDateEU(undefined)).toBe('—');
  });

  it('formats currency and numbers for European use', () => {
    expect(formatEuro(20_000_000)).toContain('€');
    expect(formatEuro(1_250_000)).toContain('1,250,000');
    expect(formatEuro(undefined)).toBe('—');
    expect(formatNumber(1_234.567, 1)).toBe('1,234.6');
  });

  it('slugifies safely', () => {
    expect(slugify('Acme Analytics B.V.')).toBe('acme-analytics-b-v');
    expect(slugify('  Ünïcode & Symbols! ')).toBe('unicode-symbols');
  });

  it('extracts JSON from model output', () => {
    expect(extractJsonBlock('{"a":1}')).toBe('{"a":1}');
    expect(extractJsonBlock('here you go: ```json\n{"a":[1,2]}\n``` done')).toBe('{"a":[1,2]}');
    expect(extractJsonBlock('{"s":"} not the end"}')).toBe('{"s":"} not the end"}');
    expect(extractJsonBlock('no json')).toBeUndefined();
  });

  it('parses JSON safely', () => {
    expect(safeJsonParse('{"a":1}', null)).toEqual({ a: 1 });
    expect(safeJsonParse('broken', 'fallback')).toBe('fallback');
  });
});

describe('semantics', () => {
  const booleanQuestion: Question = {
    id: 'q1',
    text: 'Is it done?',
    type: 'boolean',
  };
  const singleQuestion: Question = {
    id: 'q2',
    text: 'How complete?',
    type: 'single',
    options: [
      { value: 'complete', label: 'Complete', satisfies: true },
      { value: 'partial', label: 'Partial', satisfies: false },
      { value: 'n/a', label: 'Not applicable', notApplicable: true },
    ],
  };

  it('evaluates booleans across their spellings', () => {
    for (const truthy of [true, 'true', 'yes', 'y', '1']) {
      expect(evaluateAnswer(booleanQuestion, truthy)).toBe('pass');
    }
    for (const falsy of [false, 'false', 'no', 'n', '0']) {
      expect(evaluateAnswer(booleanQuestion, falsy)).toBe('fail');
    }
    expect(evaluateAnswer(booleanQuestion, undefined)).toBe('unknown');
  });

  it('evaluates single-choice questions', () => {
    expect(evaluateAnswer(singleQuestion, 'complete')).toBe('pass');
    expect(evaluateAnswer(singleQuestion, 'partial')).toBe('fail');
    expect(evaluateAnswer(singleQuestion, 'n/a')).toBe('na');
    expect(evaluateAnswer(singleQuestion, 'nonsense')).toBe('fail');
    expect(evaluateAnswer(singleQuestion, [])).toBe('unknown');
  });

  it('treats an all-matching multi-selection as compliant', () => {
    const multi: Question = { ...singleQuestion, type: 'multi' };
    expect(evaluateAnswer(multi, ['complete'])).toBe('pass');
    expect(evaluateAnswer(multi, ['complete', 'partial'])).toBe('fail');
  });

  it('recognises not-applicable values', () => {
    expect(isNotApplicable('n/a')).toBe(true);
    expect(isNotApplicable('NOT_APPLICABLE')).toBe(true);
    expect(isNotApplicable('yes')).toBe(false);
    expect(isNotApplicable(true)).toBe(false);
  });

  it('supplies default boolean options', () => {
    expect(optionsOf(booleanQuestion).map((o) => o.value)).toEqual(['yes', 'no']);
    expect(optionsOf(singleQuestion)).toHaveLength(3);
  });

  it('respects showIf conditions', () => {
    const conditional: Question = {
      id: 'q3',
      text: 'follow-up',
      type: 'boolean',
      showIf: { questionId: 'q1', equals: 'yes' },
    };
    expect(questionApplies(conditional, { gdpr: { q1: 'yes' } }, 'gdpr')).toBe(true);
    expect(questionApplies(conditional, { gdpr: { q1: 'no' } }, 'gdpr')).toBe(false);
    expect(questionApplies(conditional, {}, 'gdpr')).toBe(true); // unanswered: still show
  });

  it('describes answers for humans', () => {
    expect(describeAnswer(singleQuestion, 'complete')).toBe('Complete');
    expect(describeAnswer(singleQuestion, 'n/a')).toBe('Not applicable');
    expect(describeAnswer(singleQuestion, undefined)).toBe('Not answered');
    expect(describeAnswer(booleanQuestion, true)).toBe('Yes');
  });

  it('weights scores', () => {
    expect(weightedScore([{ score: 1, weight: 1 }])).toBe(100);
    expect(weightedScore([])).toBe(0);
    expect(weightedScore([{ score: 1, weight: 3 }, { score: 0, weight: 1 }])).toBe(75);
  });

  it('grades scores', () => {
    expect(gradeFor(95)).toBe('A');
    expect(gradeFor(80)).toBe('B');
    expect(gradeFor(65)).toBe('C');
    expect(gradeFor(45)).toBe('D');
    expect(gradeFor(5)).toBe('F');
  });
});

describe('markdown', () => {
  it('renders the constructs the docs rely on', () => {
    const html = renderMarkdown(
      '# Title\n\nSome **bold** and `code`.\n\n- one\n- two\n\n> quote\n\n```ts\nconst x = 1;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |',
    );
    expect(html).toContain('<h1 id="title">Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>a</th>');
  });

  it('escapes raw HTML', () => {
    expect(renderMarkdown('<script>alert(1)</script>')).toContain('&lt;script&gt;');
    expect(renderMarkdown('<script>alert(1)</script>')).not.toContain('<script>alert');
  });

  it('extracts headings for the sidebar', () => {
    const headings = extractHeadings('# One\n\ntext\n\n## Two\n\n### Three');
    expect(headings.map((h) => h.text)).toEqual(['One', 'Two', 'Three']);
    expect(headings[0].slug).toBe('one');
  });

  it('counts words', () => {
    expect(wordCount('one two three')).toBe(3);
    expect(wordCount('  ')).toBe(0);
  });
});

describe('schemas', () => {
  const validProfile = {
    id: 'test',
    name: 'Test BV',
    country: 'NL',
    sector: 'software',
    employees: 9,
    revenueEUR: 1_000_000,
    size: 'micro' as const,
  };

  it('accepts a valid company profile', () => {
    expect(companyProfileSchema.safeParse(validProfile).success).toBe(true);
  });

  it('rejects a missing name and a bad country code', () => {
    expect(companyProfileSchema.safeParse({ ...validProfile, name: undefined }).success).toBe(false);
    expect(companyProfileSchema.safeParse({ ...validProfile, country: 'NLD' }).success).toBe(false);
  });

  it('requires companyId or profile on an assessment', () => {
    expect(assessRequestSchema.safeParse({ answers: {} }).success).toBe(false);
    expect(assessRequestSchema.safeParse({ companyId: 'x', answers: {} }).success).toBe(true);
    expect(assessRequestSchema.safeParse({ profile: validProfile, answers: {} }).success).toBe(true);
  });

  it('validates document kinds', () => {
    expect(documentKindSchema.safeParse('gdpr-dpia').success).toBe(true);
    expect(documentKindSchema.safeParse('nonsense').success).toBe(false);
  });
});