import { describe, expect, it } from 'vitest';

import {
  ComplianceEngine,
  dedupe,
  deriveSize,
  evidenceId,
  gapDeadline,
  isHighRiskDomain,
  mergeGaps,
  newCompanyId,
  overdueGaps,
  profileFacts,
  rebalanceCapacity,
  scoreArticle,
  scoreFramework,
  severityFor,
  summariseGaps,
  urgentGaps,
} from '../src/index';
import { getFramework } from '@complisme/frameworks';
import { ComplianceEngine as EngineFromRoot } from '../src/engine';
import { acme, nordwerk, vistaSul } from '../src/fixtures';
import type { Gap } from '@complisme/shared';

const NOW = new Date('2026-09-01T00:00:00.000Z');

function gap(overrides: Partial<Gap> = {}): Gap {
  return {
    id: 'g1',
    frameworkId: 'gdpr',
    articleId: 'art-30-ropa',
    severity: 'warning',
    remediation: 'do the thing',
    effort: 3,
    ...overrides,
  };
}

describe('scoring internals', () => {
  const gdpr = getFramework('gdpr');
  const ropa = gdpr.articles.find((a) => a.id === 'art-30-ropa')!;

  it('treats an article with no answers as fully unanswered, not fully compliant', () => {
    const score = scoreArticle('gdpr', ropa, {});
    expect(score.score).toBeLessThan(10);
    expect(score.outcomes.every((o) => o.verdict === 'unknown')).toBe(true);
  });

  it('raises the score as answers come in', () => {
    const none = scoreArticle('gdpr', ropa, {});
    // 'complete' is explicitly non-compliant (never reviewed), so use the
    // fully-compliant option here.
    const partial = scoreArticle('gdpr', ropa, { gdpr: { 'a30-q1': 'complete-and-reviewed' } });
    const complete = scoreArticle('gdpr', ropa, {
      gdpr: { 'a30-q1': 'complete-and-reviewed', 'a30-q2': 'yes' },
    });
    expect(partial.score).toBeGreaterThan(none.score);
    expect(complete.score).toBeGreaterThan(partial.score);
    expect(complete.score).toBeGreaterThan(50);
  });

  it('excludes an article whose questions are all not-applicable', () => {
    const csrd = getFramework('csrd');
    const article = csrd.articles[0];
    const allNotApplicable = Object.fromEntries(
      article.questionnaire.map((q) => [q.id, 'n/a']),
    );
    const score = scoreArticle('csrd', article, { csrd: allNotApplicable });
    expect(score.applicable).toBe(false);
  });

  it('returns a zero score for a framework with no applicable articles', () => {
    const framework = getFramework('eu-ai-act');
    const allNa = Object.fromEntries(
      framework.articles.flatMap((a) => a.questionnaire.map((q) => [q.id, 'n/a'])),
    );
    const score = scoreFramework(framework, { 'eu-ai-act': allNa });
    expect(score.score).toBe(0);
    expect(score.totals.applicable).toBe(0);
  });

  it('maps exposure and weight to a severity', () => {
    // Art. 5 carries the full €20M ceiling, so even a light question is a warning.
    const heavy = gdpr.articles[0];
    expect(
      severityFor({ id: 'q', text: 'q', type: 'boolean', weight: 3 }, heavy, 'fail'),
    ).toBe('error');
    expect(
      severityFor({ id: 'q', text: 'q', type: 'boolean', weight: 0.5 }, heavy, 'fail'),
    ).toBe('warning');

    // An article with negligible exposure only escalates on its own weight.
    const light = { ...gdpr.articles[0], fineExposure: 5_000 };
    expect(
      severityFor({ id: 'q', text: 'q', type: 'boolean', weight: 0.5 }, light, 'fail'),
    ).toBe('info');
    expect(
      severityFor({ id: 'q', text: 'q', type: 'boolean', weight: 2.5 }, light, 'fail'),
    ).toBe('warning');
  });
});

describe('gap merging', () => {
  it('keeps the most severe entry for the same question', () => {
    const merged = mergeGaps(
      [gap({ severity: 'info', source: 'rules', confidence: 0.9 })],
      [gap({ severity: 'error', source: 'llm', confidence: 0.4 })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].severity).toBe('error');
  });

  it('prefers rules over scanner over llm at equal severity', () => {
    const merged = mergeGaps(
      [gap({ questionId: 'q', source: 'llm' })],
      [gap({ questionId: 'q', source: 'scanner' })],
      [gap({ questionId: 'q', source: 'rules' })],
    );
    expect(merged[0].source).toBe('rules');
  });

  it('falls back to the higher confidence when sources tie', () => {
    const merged = mergeGaps(
      [gap({ questionId: 'q', source: 'llm', confidence: 0.2 })],
      [gap({ questionId: 'q', source: 'llm', confidence: 0.8 })],
    );
    expect(merged[0].confidence).toBe(0.8);
  });

  it('dedupes within a single list', () => {
    expect(dedupe([gap({ questionId: 'a' }), gap({ questionId: 'a' })])).toHaveLength(1);
    expect(dedupe([gap({ questionId: 'a' }), gap({ questionId: 'b' })])).toHaveLength(2);
  });

  it('summarises a gap list', () => {
    const summary = summariseGaps([
      gap({ id: '1', severity: 'error', questionId: 'a', frameworkId: 'gdpr', effort: 2 }),
      gap({ id: '2', severity: 'warning', questionId: 'b', frameworkId: 'gdpr', effort: 3 }),
      gap({ id: '3', severity: 'info', questionId: 'c', frameworkId: 'csrd', effort: 1 }),
    ]);
    expect(summary.total).toBe(3);
    expect(summary.bySeverity.error).toBe(1);
    expect(summary.byFramework.gdpr).toBe(2);
    expect(summary.effort).toBe(6);
    expect(summary.blockers).toBe(1);
  });

  it('resolves a deadline from either representation', () => {
    expect(gapDeadline(gap({ deadline: new Date('2026-12-01T00:00:00Z') }))?.getUTCFullYear()).toBe(2026);
    expect(gapDeadline(gap({ deadlineIso: '2027-03-01' }))?.getUTCFullYear()).toBe(2027);
    expect(gapDeadline(gap())).toBeUndefined();
  });
});

describe('urgency and overdue', () => {
  const list = [
    gap({ id: 'past', severity: 'error', deadlineIso: '2026-01-01' }),
    gap({ id: 'soon', severity: 'error', deadlineIso: '2026-10-01' }),
    gap({ id: 'far', severity: 'error', deadlineIso: '2029-01-01' }),
    gap({ id: 'none', severity: 'error' }),
    gap({ id: 'info-past', severity: 'info', deadlineIso: '2026-01-01' }),
  ];

  it('separates upcoming deadlines from already-passed ones', () => {
    expect(urgentGaps(list, 90, NOW).map((g) => g.id)).toEqual(['soon']);
    expect(overdueGaps(list, NOW).map((g) => g.id)).toEqual(['past']);
  });

  it('ignores items with no deadline and info-level items', () => {
    expect(urgentGaps(list, 3650, NOW).map((g) => g.id)).not.toContain('none');
    expect(overdueGaps(list, NOW).map((g) => g.id)).not.toContain('info-past');
  });
});

describe('capacity rebalancing', () => {
  it('spills an over-capacity phase into ongoing', () => {
    const engine = new EngineFromRoot();
    const many = Array.from({ length: 30 }, (_, i) =>
      gap({ id: `g${i}`, questionId: `q${i}`, severity: 'error', effort: 3 }),
    );
    const plan = engine.buildRoadmap(acme, many, { today: NOW, capacityPerPhase: 10 });

    const before = plan.phases.reduce((acc, p) => acc + p.items.length, 0);
    const rebalanced = rebalanceCapacity(plan, 10);

    expect(before).toBe(many.length);
    expect(rebalanced.items).toHaveLength(many.length);
    const overflow = rebalanced.phases.find((p) => p.phase === 'ongoing');
    expect(overflow).toBeDefined();
    expect(overflow!.items.length).toBeGreaterThan(0);
  });

  it('is a no-op when every phase fits', () => {
    const engine = new EngineFromRoot();
    const plan = engine.buildRoadmap(acme, [gap({ deadlineIso: '2027-01-01' })], { today: NOW });
    const same = rebalanceCapacity(plan, 1000);
    expect(same.phases).toHaveLength(plan.phases.length);
    expect(same.items).toHaveLength(plan.items.length);
  });
});

describe('profile helpers', () => {
  it('derives SME size from the EU thresholds', () => {
    expect(deriveSize(3, 100_000)).toBe('micro');
    expect(deriveSize(60, 100_000)).toBe('small');
    expect(deriveSize(10, 60_000_000)).toBe('medium');
    expect(deriveSize(300, 100_000)).toBe('medium');
  });

  it('derives facts from a profile', () => {
    const facts = profileFacts(nordwerk);
    expect(facts.aiSystemCount).toBe(2);
    expect(facts.highRiskAiCount).toBeGreaterThan(0);
    expect(facts.specialCategoryCount).toBe(1);
    expect(facts.automatedDecisions).toBeGreaterThan(0);
    expect(facts.isSme).toBe(true);
    expect(facts.transferCountryCount).toBeGreaterThan(0);
  });

  it('handles a profile with no AI and no processing', () => {
    const facts = profileFacts({ ...vistaSul(), aiSystems: [], processingActivities: [] });
    expect(facts.aiSystemCount).toBe(0);
    expect(facts.processingActivityCount).toBe(0);
    expect(facts.cookiesUsed).toBe(false);
  });

  it('knows the high-risk domains', () => {
    expect(isHighRiskDomain('employment')).toBe(true);
    expect(isHighRiskDomain('CREDIT')).toBe(true);
    expect(isHighRiskDomain('marketing')).toBe(false);
  });

  it('creates stable ids', () => {
    expect(evidenceId('c', 'gdpr', 'art-30-ropa')).toBe(evidenceId('c', 'gdpr', 'art-30-ropa'));
    expect(newCompanyId()).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('engine seams', () => {
  it('accepts an injected framework list', () => {
    const frameworks = [getFramework('gdpr')];
    const engine = new ComplianceEngine({ frameworks });
    const scores = engine.assess(acme, {});
    expect(scores).toHaveLength(1);
    expect(scores[0].frameworkId).toBe('gdpr');
  });

  it('honours an explicit framework selection', () => {
    const engine = new ComplianceEngine();
    const scores = engine.assess(acme, {}, { frameworkIds: ['gdpr'] });
    expect(scores.map((s) => s.frameworkId)).toEqual(['gdpr']);
  });

  it('throws for an unknown framework', () => {
    const engine = new ComplianceEngine();
    expect(() => engine.assess(acme, {}, { frameworkIds: ['nope'] })).toThrow();
  });

  it('exposes urgent and project helpers', () => {
    const engine = new ComplianceEngine();
    const plan = engine.plan(acme, {}, { today: NOW });
    expect(Array.isArray(engine.urgent(plan.gaps, 90, NOW))).toBe(true);

    const projected = engine.project(plan.scores, plan.gaps);
    expect(projected.every((s, i) => s.score >= plan.scores[i].score)).toBe(true);
  });

  it('builds a roadmap from an explicit horizon', () => {
    const engine = new ComplianceEngine();
    const gaps = engine.gapAnalyze(acme, {}, { today: NOW });
    const plan = engine.buildRoadmap(acme, gaps, { today: NOW, horizonDays: 180 });
    expect(plan.horizonDays).toBe(180);
    expect(plan.endDate).toBeTruthy();
  });

  it('reports progress from a partially answered questionnaire', () => {
    const engine = new ComplianceEngine();
    const sheet = engine.questionnaire('gdpr', acme, { gdpr: { 'a5-q1': 'documented' } });
    expect(sheet.progress.answered).toBe(1);
    expect(sheet.progress.total).toBeGreaterThan(20);
    expect(sheet.progress.percent).toBeLessThan(10);
  });
});