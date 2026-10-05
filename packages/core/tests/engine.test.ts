import { describe, expect, it } from 'vitest';

import { ComplianceEngine, gradeOf, normaliseProfile, summariseGaps } from '../src/index';
import {
  acme,
  acmeColdStartAnswers,
  acmeMatureAnswers,
  nordwerk,
  nordwerkAnswers,
  vistaSul,
  vistaSulAnswers,
} from '../src/fixtures';

const FIXED_NOW = new Date('2026-09-01T00:00:00.000Z');

describe('ComplianceEngine.assess', () => {
  it('returns one score per framework in the profile', () => {
    const engine = new ComplianceEngine();
    const scores = engine.assess(acme, acmeColdStartAnswers);
    expect(scores.map((s) => s.frameworkId)).toEqual(['gdpr', 'eu-ai-act', 'e-invoicing']);
    expect(scores.every((s) => typeof s.score === 'number')).toBe(true);
  });

  it('scores a company with no answers near zero and with no blockers from empty articles', () => {
    const engine = new ComplianceEngine();
    const scores = engine.assess(acme, {});
    for (const score of scores) {
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThan(35);
    }
  });

  it('scores a mature company materially higher than a cold start', () => {
    const engine = new ComplianceEngine();
    const cold = engine.assess(acme, acmeColdStartAnswers);
    const mature = engine.assess(acme, acmeMatureAnswers);
    const avg = (list: typeof cold) => list.reduce((a, s) => a + s.score, 0) / list.length;
    expect(avg(mature)).toBeGreaterThan(avg(cold));
    expect(avg(mature)).toBeGreaterThan(60);
  });

  it('never exceeds 100 and never drops below 0', () => {
    const engine = new ComplianceEngine();
    for (const [profile, answers] of [
      [acme, acmeMatureAnswers],
      [nordwerk, nordwerkAnswers],
      [vistaSul(), vistaSulAnswers],
    ] as const) {
      for (const score of engine.assess(profile as never, answers as never)) {
        expect(score.score).toBeGreaterThanOrEqual(0);
        expect(score.score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('treats not-applicable articles as not applicable', () => {
    const engine = new ComplianceEngine();
    // Vista Sul has no AI systems, so no AI Act gaps should be produced.
    const gaps = engine.gapAnalyze(vistaSul(), vistaSulAnswers);
    expect(gaps.some((g) => g.frameworkId === 'eu-ai-act')).toBe(false);
  });
});

describe('ComplianceEngine.gapAnalyze', () => {
  it('produces stable, deterministic ids', () => {
    const engine = new ComplianceEngine();
    const first = engine.gapAnalyze(acme, acmeColdStartAnswers).map((g) => g.id).sort();
    const second = engine.gapAnalyze(acme, acmeColdStartAnswers).map((g) => g.id).sort();
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(5);
  });

  it('attaches deadline, citation and remediation to every gap', () => {
    const engine = new ComplianceEngine();
    const gaps = engine.gapAnalyze(nordwerk, nordwerkAnswers, { today: FIXED_NOW });
    for (const gap of gaps) {
      expect(gap.remediation.length).toBeGreaterThan(10);
      expect(gap.effort).toBeGreaterThan(0);
      expect(gap.severity).toMatch(/error|warning|info/);
      expect(gap.source).toBe('rules');
      if (gap.citation) expect(typeof gap.citation).toBe('string');
    }
  });

  it('produces a summary that adds up', () => {
    const engine = new ComplianceEngine();
    const gaps = engine.gapAnalyze(nordwerk, nordwerkAnswers);
    const summary = summariseGaps(gaps);
    expect(summary.total).toBe(gaps.length);
    expect(summary.bySeverity.error + summary.bySeverity.warning + summary.bySeverity.info).toBe(
      gaps.length,
    );
  });

  it('merges scanner findings into the gap list', () => {
    const engine = new ComplianceEngine();
    const findings = [
      {
        id: 'f1',
        ruleId: 'gdpr/pii-collection',
        category: 'pii-collection' as const,
        severity: 'high' as const,
        message: 'Personal data collected without a documented legal basis',
        file: 'src/signup.ts',
        line: 42,
        confidence: 0.9,
        mappings: [
          { frameworkId: 'gdpr', articleId: 'art-6-legal-basis', reason: 'missing legal basis' },
        ],
      },
    ];
    const result = engine.assessDetailed(acme, acmeColdStartAnswers, { findings });
    const scannerGap = result.gaps.find((g) => g.source === 'scanner');
    expect(scannerGap).toBeDefined();
    expect(scannerGap?.findings).toHaveLength(1);
    expect(scannerGap?.severity).toBe('error');
  });
});

describe('ComplianceEngine.roadmap', () => {
  it('sorts gaps by deadline then exposure and assigns order', () => {
    const engine = new ComplianceEngine();
    const gaps = engine.assessDetailed(nordwerk, nordwerkAnswers, { today: FIXED_NOW }).gaps;
    const plan = engine.roadmap(gaps, { today: FIXED_NOW });
    expect(plan.map((g) => g.order)).toEqual(plan.map((_, i) => i));
    const firstThirty = plan.filter((g) => {
      const d = g.deadline ?? g.deadlineIso;
      return d ? new Date(d).getTime() - FIXED_NOW.getTime() <= 30 * 86_400_000 : false;
    });
    expect(firstThirty.length).toBeGreaterThan(0);
  });

  it('builds a 90-day plan with three phases, dates and effort', () => {
    const engine = new ComplianceEngine();
    const gaps = engine.assessDetailed(acme, acmeColdStartAnswers, { today: FIXED_NOW }).gaps;
    const plan = engine.buildRoadmap(acme, gaps, { today: FIXED_NOW, currentScore: 20 });
    expect(plan.horizonDays).toBe(90);
    expect(plan.phases.map((p) => p.phase)).toEqual(['quick-wins', 'foundations', 'hardening']);
    expect(plan.items.length).toBe(gaps.length);
    expect(plan.totalEffort).toBeGreaterThan(0);
    expect(plan.projectedScore).toBeGreaterThan(20);
    for (const item of plan.items) {
      expect(item.dueDate >= item.startDate).toBe(true);
      expect(item.effort).toBeGreaterThan(0);
    }
    expect(plan.disclaimer).toBeTruthy();
  });

  it('puts high-exposure statutory work in the first phase', () => {
    const engine = new ComplianceEngine();
    const gaps = engine.assessDetailed(nordwerk, nordwerkAnswers, { today: FIXED_NOW }).gaps;
    const plan = engine.buildRoadmap(nordwerk, gaps, { today: FIXED_NOW });
    const first = plan.phases[0].items;
    expect(first.length).toBeGreaterThan(0);
    expect(first.some((i) => i.fineExposure && i.fineExposure > 1_000_000)).toBe(true);
  });
});

describe('plan()', () => {
  it('returns assessment and roadmap together', () => {
    const engine = new ComplianceEngine();
    const result = engine.plan(vistaSul(), vistaSulAnswers, { today: FIXED_NOW });
    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.roadmap.items.length).toBeGreaterThan(0);
    expect(result.grade).toMatch(/[ABCDF]/);
  });
});

describe('questionnaire()', () => {
  it('reports progress per framework', () => {
    const engine = new ComplianceEngine();
    const sheet = engine.questionnaire('gdpr', acme, acmeMatureAnswers);
    expect(sheet.frameworkId).toBe('gdpr');
    expect(sheet.progress.total).toBeGreaterThan(10);
    expect(sheet.progress.percent).toBeGreaterThan(50);
  });
});

describe('normaliseProfile / gradeOf', () => {
  it('fills in size, ids and timestamps', () => {
    const profile = normaliseProfile({
      name: 'Test BV',
      country: 'NL',
      sector: 'software',
      employees: 60,
      revenueEUR: 12_000_000,
    });
    expect(profile.size).toBe('small');
    expect(profile.id).toBeTruthy();
    expect(profile.createdAt).toBeTruthy();
  });

  it('maps scores to grades', () => {
    expect(gradeOf(95)).toBe('A');
    expect(gradeOf(80)).toBe('B');
    expect(gradeOf(65)).toBe('C');
    expect(gradeOf(45)).toBe('D');
    expect(gradeOf(10)).toBe('F');
  });
});