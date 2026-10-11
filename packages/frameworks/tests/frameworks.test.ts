import { describe, expect, it } from 'vitest';

import {
  FrameworkDefinitionError,
  clearRegistryCache,
  definitionsDir,
  estimateAll,
  estimatePenalty,
  frameworkStats,
  getArticle,
  getFramework,
  getQuestion,
  hasFramework,
  listFrameworks,
  loadFramework,
  questionIndex,
  questionKey,
  registerFramework,
  totalFineExposure,
} from '../src/index';
import {
  applicableFrameworks,
  csrdWave,
  euAiActApplies,
  gdprApplies,
  einvoicingApplies,
  selectedFrameworks,
} from '../src/applicability';
import type { CompanyProfile } from '@complisme/shared';

// Local fixtures rather than @complisme/core: core depends on frameworks, so
// importing its fixtures here would create a require cycle.
const acme: CompanyProfile = {
  id: 'acme-saas',
  name: 'Acme Analytics BV',
  country: 'NL',
  sector: 'software',
  employees: 9,
  revenueEUR: 1_250_000,
  size: 'micro',
  aiSystems: [
    { id: 'ai-1', name: 'Support Copilot', purpose: 'Support replies', domain: 'customer-service', deployed: true },
  ],
  processingActivities: [
    { id: 'd1', name: 'Customers', purpose: 'Contract', legalBasis: 'contract', dataSubjects: ['customers'] },
  ],
  usesCookies: true,
};

const nordwerk: CompanyProfile = {
  id: 'nordwerk',
  name: 'Nordwerk AG',
  country: 'DE',
  sector: 'manufacturing',
  employees: 140,
  revenueEUR: 34_000_000,
  size: 'small',
  aiSystems: [
    { id: 'ai-2', name: 'Vision QC', purpose: 'Defect detection', domain: 'safety-component', deployed: true },
  ],
  processingActivities: [
    { id: 'd2', name: 'Employees', purpose: 'Payroll', legalBasis: 'contract', specialCategory: true },
  ],
};

const brazil: CompanyProfile = {
  id: 'vista-sul',
  name: 'Vista Sul',
  country: 'BR',
  sector: 'consulting',
  employees: 4,
  revenueEUR: 320_000,
  size: 'micro',
  aiSystems: [],
  processingActivities: [
    { id: 'd3', name: 'Clients', purpose: 'Contract', legalBasis: 'contract', dataSubjects: ['customers'] },
  ],
};

const vistaSul = (): CompanyProfile => brazil;

describe('framework registry', () => {
  it('loads all four bundled definitions', () => {
    const frameworks = listFrameworks();
    expect(frameworks.map((f) => f.id)).toEqual(['gdpr', 'eu-ai-act', 'csrd', 'e-invoicing']);
  });

  it('normalises defaults on load', () => {
    const gdpr = getFramework('gdpr');
    for (const article of gdpr.articles) {
      expect(article.weight).toBeGreaterThan(0);
      expect(article.evidenceRequired.length).toBeGreaterThan(0);
      for (const question of article.questionnaire) {
        expect(question.weight).toBeGreaterThan(0);
        expect(question.remediation?.length ?? 0).toBeGreaterThan(5);
      }
    }
  });

  it('includes the EU AI Act articles the specification calls for', () => {
    const ids = getFramework('eu-ai-act').articles.map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'art-9-risk-management',
        'art-10-data-governance',
        'art-13-transparency',
        'art-15-accuracy-robustness',
        'art-50-transparency-obligations',
      ]),
    );
  });

  it('includes the GDPR ROPA, DPIA and DSR articles', () => {
    const ids = getFramework('gdpr').articles.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['art-30-ropa', 'art-35-dpia', 'art-7-repudation']));
  });

  it('includes the ESRS standards', () => {
    const titles = getFramework('csrd').articles.map((a) => a.title).join(' ');
    for (const standard of ['E1', 'E2', 'E3', 'E4', 'E5', 'S1', 'S2', 'G1']) {
      expect(titles).toContain(standard);
    }
  });

  it('includes both the ViDA and Brazilian NFS-e tracks', () => {
    const ids = getFramework('e-invoicing').articles.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['vida-ep-14-invoicing', 'brazil-nfe']));
  });

  it('exposes the definition directory', () => {
    expect(definitionsDir()).toContain('definitions');
  });

  it('throws a helpful error for an unknown framework', () => {
    expect(() => getFramework('gdpr-v2')).toThrow(FrameworkDefinitionError);
    expect(() => getFramework('gdpr-v2')).toThrow(/available:/);
  });

  it('reports framework availability', () => {
    expect(hasFramework('gdpr')).toBe(true);
    expect(hasFramework('nope')).toBe(false);
  });

  it('looks up articles and questions', () => {
    expect(getArticle('gdpr', 'art-30-ropa')?.article.title).toContain('Article 30');
    expect(getArticle('gdpr', 'nope')).toBeUndefined();
    expect(getQuestion('gdpr', 'art-30-ropa', 'a30-q1')?.question.text).toBeTruthy();
    expect(getQuestion('gdpr', 'art-30-ropa', 'nope')).toBeUndefined();
  });

  it('indexes every question under a compound key', () => {
    const index = questionIndex();
    expect(index.size).toBeGreaterThan(100);
    expect(index.has('gdpr:a30-q1')).toBe(true);
    expect(questionKey('gdpr', 'a30-q1')).toBe('gdpr:a30-q1');
  });

  it('reports statistics', () => {
    const stats = frameworkStats();
    expect(stats).toHaveLength(4);
    for (const entry of stats) {
      expect(entry.articles).toBeGreaterThan(5);
      expect(entry.questions).toBeGreaterThan(15);
      expect(entry.evidenceItems).toBeGreaterThan(5);
    }
  });

  it('rejects a malformed definition', () => {
    expect(() =>
      registerFramework({ id: 'broken', name: 'Broken', articles: [] } as never),
    ).toThrow();
    clearRegistryCache();
  });

  it('loads a definition by id from disk', () => {
    expect(loadFramework('csrd').id).toBe('csrd');
  });
});

describe('applicability', () => {
  it('places a 9-person Dutch SaaS company in GDPR, AI Act and e-invoicing scope, not CSRD', () => {
    const result = applicableFrameworks(acme);
    const byId = Object.fromEntries(result.map((r) => [r.frameworkId, r]));
    expect(byId.gdpr.applies).toBe(true);
    expect(byId['eu-ai-act'].applies).toBe(true);
    expect(byId.csrd.applies).toBe(false);
    expect(byId['e-invoicing'].applies).toBe(true);
    expect(byId.csrd.reason).toMatch(/below the CSRD thresholds/i);
  });

  it('keeps a 140-employee manufacturer below the post-Omnibus thresholds', () => {
    const byId = Object.fromEntries(applicableFrameworks(nordwerk).map((r) => [r.frameworkId, r]));
    // After Directive (EU) 2025/794 the main wave is >1750 employees / >€500M,
    // so 140 employees and €34M sit below every wave.
    expect(byId.csrd.applies).toBe(false);
    expect(byId.csrd.reason).toMatch(/below the CSRD thresholds/i);
    expect(byId.gdpr.applies).toBe(true);
    expect(byId['eu-ai-act'].applies).toBe(true);
  });

  it('brings a company above the second-wave threshold into CSRD scope', () => {
    const bigger = { ...nordwerk, employees: 800, revenueEUR: 160_000_000 };
    const byId = Object.fromEntries(applicableFrameworks(bigger).map((r) => [r.frameworkId, r]));
    expect(byId.csrd.applies).toBe(true);
    expect(byId.csrd.reason).toMatch(/Second wave/i);
  });

  it('places a Brazilian consultancy in mandatory NFS-e scope', () => {
    const byId = Object.fromEntries(applicableFrameworks(vistaSul()).map((r) => [r.frameworkId, r]));
    expect(byId['e-invoicing'].applies).toBe(true);
    expect(byId['e-invoicing'].reason).toMatch(/Brazilian operations/);
    expect(byId.gdpr.applies).toBe(true);
  });

  it('gives an action for each applicable framework', () => {
    for (const entry of applicableFrameworks(acme)) {
      if (entry.applies) expect(entry.action).toBeTruthy();
      expect(entry.confidence).toBeGreaterThan(0);
      expect(entry.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('falls back to GDPR and the AI Act for an empty profile', () => {
    const empty = {
      id: 'empty',
      name: 'Empty',
      country: 'NL',
      sector: 'other',
      employees: 0,
      revenueEUR: 0,
      size: 'micro' as const,
    };
    expect(selectedFrameworks(empty)).toEqual(['gdpr', 'eu-ai-act']);
  });

  it('respects an explicit framework selection', () => {
    expect(selectedFrameworks({ ...acme, frameworks: ['gdpr'] })).toEqual(['gdpr']);
  });

  it('handles the individual predicates', () => {
    expect(gdprApplies(acme).applies).toBe(true);
    // No processing activities and no cookies: nothing personal to declare.
    expect(
      gdprApplies({ ...acme, processingActivities: [], usesCookies: false }).applies,
    ).toBe(false);
    expect(euAiActApplies({ ...acme, aiSystems: [] }).applies).toBe(false);
    expect(einvoicingApplies(acme).applies).toBe(true);
    expect(einvoicingApplies(brazil).applies).toBe(true);
    expect(einvoicingApplies({ ...acme, sector: 'construction' }).applies).toBe(false);
  });

  it('computes the CSRD wave from headcount and turnover', () => {
    expect(csrdWave(nordwerk).applies).toBe(false);
    expect(csrdWave(acme).applies).toBe(false);
    expect(csrdWave({ ...acme, employees: 2000, revenueEUR: 600_000_000 }).applies).toBe(true);
    expect(csrdWave({ ...acme, employees: 800, revenueEUR: 160_000_000 }).applies).toBe(true);
  });
});

describe('penalty model', () => {
  it('applies the GDPR fixed-or-turnover cap', () => {
    const estimate = estimatePenalty('gdpr', 500_000_000);
    expect(estimate.fixedCap).toBe(20_000_000);
    expect(estimate.turnoverRate).toBe(0.04);
    expect(estimate.turnoverShare).toBe(20_000_000);
    expect(estimate.theoreticalMax).toBe(20_000_000);
  });

  it('uses 7% for the AI Act prohibited-practice tier', () => {
    const estimate = estimatePenalty('eu-ai-act', 1_000_000_000);
    expect(estimate.fixedCap).toBe(35_000_000);
    expect(estimate.turnoverShare).toBe(70_000_000);
    expect(estimate.theoreticalMax).toBe(70_000_000);
    // Realistic exposure is the lower of the two caps.
    expect(estimate.realisticMax).toBe(35_000_000);
  });

  it('keeps a small company below the turnover share', () => {
    const estimate = estimatePenalty('gdpr', 10_000_000);
    expect(estimate.realisticMax).toBe(400_000);
  });

  it('handles CSRD and e-invoicing, which have no turnover share', () => {
    expect(estimatePenalty('csrd', 1_000_000_000).realisticMax).toBe(3_000_000);
    expect(estimatePenalty('e-invoicing', 1_000_000_000).realisticMax).toBe(50_000);
  });

  it('estimates across frameworks and sums', () => {
    const all = estimateAll(['gdpr', 'eu-ai-act'], 100_000_000);
    expect(all).toHaveLength(2);
    expect(totalFineExposure(['gdpr'])).toBeGreaterThan(0);
    expect(totalFineExposure(['does-not-exist'])).toBe(0);
  });
});