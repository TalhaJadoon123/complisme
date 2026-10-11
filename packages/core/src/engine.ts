/**
 * The compliance engine.
 *
 * Single entry point used by the CLI, the API and the web app:
 *
 *   const engine = new ComplianceEngine();
 *   const scores = engine.assess(profile, answers);
 *   const gaps   = engine.gapAnalyze(profile, answers);
 *   const plan   = engine.roadmap(gaps);
 */

import { nowIso } from '@complisme/shared';
import { selectedFrameworks } from '@complisme/frameworks';
import type {
  Answers,
  CompanyProfile,
  ComplianceScore,
  Evidence,
  Finding,
  Framework,
  FrameworkId,
  Gap,
  Roadmap,
  Severity,
} from '@complisme/shared';

import { findingsToGaps, gapAnalyze, mergeGaps, summariseGaps, type GapAnalysisOptions } from './gap-analyzer';
import { buildRoadmap, projectScores, roadmap as sortRoadmap, urgentGaps } from './roadmap';
import { overallScore, scoreFramework, type FrameworkScore } from './scoring';
import { normaliseProfile, profileFacts, type ProfileFacts } from './profile';

export interface AssessOptions extends GapAnalysisOptions {
  /** Only score these frameworks; defaults to the ones applicable to the profile. */
  frameworkIds?: FrameworkId[];
  evidence?: Evidence[];
  /** Include scanner findings converted to gaps. */
  findings?: Finding[];
  /** Which rule families to include when converting findings. */
  ruleset?: 'gdpr' | 'ai-act' | 'all';
}

export interface AssessResult {
  profile: CompanyProfile;
  facts: ProfileFacts;
  scores: ComplianceScore[];
  detailed: FrameworkScore[];
  gaps: Gap[];
  overall: number;
  grade: ComplianceScore['grade'];
  summary: ReturnType<typeof summariseGaps>;
  deadlines: Array<{ frameworkId: string; articleId: string; title: string; deadline: string }>;
  generatedAt: string;
}

/** Minimal registry seam so the engine can be tested without touching disk. */
export interface FrameworkResolver {
  (id: FrameworkId): Framework;
}

export class ComplianceEngine {
  private readonly resolve: FrameworkResolver;
  private readonly registry: Framework[];

  constructor(options: { resolve?: FrameworkResolver; frameworks?: Framework[] } = {}) {
    if (options.frameworks) {
      this.registry = options.frameworks;
      const map = new Map(options.frameworks.map((f) => [f.id, f] as const));
      this.resolve = options.resolve ?? ((id) => {
        const found = map.get(id);
        if (!found) throw new Error(`unknown framework "${id}"`);
        return found;
      });
      return;
    }
    // Lazy require keeps the package usable when the registry is not installed.
    const frameworksPkg = require('@complisme/frameworks') as typeof import('@complisme/frameworks');
    this.resolve = options.resolve ?? frameworksPkg.getFramework;
    this.registry = [];
  }

  /** Frameworks the engine will score for this profile. */
  frameworksFor(profile: CompanyProfile, frameworkIds?: FrameworkId[]): Framework[] {
    if (this.registry.length) {
      // With an injected registry the profile may still name frameworks the
      // registry does not contain; filter rather than throw.
      const wanted = frameworkIds?.length
        ? frameworkIds
        : selectedFrameworks(profile);
      return wanted
        .map((id) => this.registry.find((f) => f.id === id))
        .filter((f): f is Framework => !!f);
    }
    const wanted = frameworkIds?.length ? frameworkIds : selectedFrameworks(profile);
    return wanted.map((id) => this.resolve(id));
  }

  /** Score every applicable framework. */
  assess(profile: CompanyProfile, answers: Answers = {}, options: AssessOptions = {}): ComplianceScore[] {
    return this.assessDetailed(profile, answers, options).scores;
  }

  /** Full assessment with the intermediate detail kept for the dashboard. */
  assessDetailed(
    inputProfile: CompanyProfile,
    answers: Answers = {},
    options: AssessOptions = {},
  ): AssessResult {
    const profile = normaliseProfile(inputProfile);
    const frameworks = this.frameworksFor(profile, options.frameworkIds);
    const evidence = options.evidence ?? [];
    const detailed = frameworks.map((framework) =>
      scoreFramework(framework, answers, evidence),
    );

    const scores: ComplianceScore[] = detailed.map((detail) => ({
      frameworkId: detail.framework.id,
      score: detail.score,
      grade: detail.grade,
      gaps: detail.articles
        .filter((a) => a.applicable)
        .flatMap((a) => a.gaps),
      answered: detail.totals.answered,
      applicable: detail.totals.applicable,
      total: detail.totals.questions,
      evidenceCoverage: detail.evidence.coverage,
      blockers: detail.articles.reduce(
        (acc, a) => acc + a.gaps.filter((g) => g.severity === 'error').length,
        0,
      ),
      updatedAt: nowIso(),
    }));

    const gaps = mergeGaps(
      this.gapAnalyze(profile, answers, options),
      options.findings ? findingsToGaps(options.findings, { companyId: profile.id, ruleset: options.ruleset }) : [],
    );

    const overall = overallScore(detailed);

    return {
      profile,
      facts: profileFacts(profile),
      scores,
      detailed,
      gaps,
      overall,
      grade: gradeOf(overall),
      summary: summariseGaps(gaps),
      deadlines: this.collectDeadlines(frameworks),
      generatedAt: nowIso(),
    };
  }

  /** Every gap for a profile, rules plus optional scanner findings. */
  gapAnalyze(
    profile: CompanyProfile,
    answers: Answers = {},
    options: AssessOptions = {},
  ): Gap[] {
    const frameworks = this.frameworksFor(profile, options.frameworkIds);
    return gapAnalyze(frameworks, normaliseProfile(profile), answers, options);
  }

  /**
   * Gap list sorted for execution: statutory deadline first, then fine exposure,
   * then severity, then effort. Assigns `order` and `phase`.
   */
  roadmap(gaps: Gap[], options: { today?: Date; horizonDays?: number } = {}): Gap[] {
    return sortRoadmap(gaps, options);
  }

  /** The full phased 90-day plan with due dates and projected score. */
  buildRoadmap(
    profile: CompanyProfile,
    gaps: Gap[],
    options: { today?: Date; horizonDays?: number; currentScore?: number; capacityPerPhase?: number } = {},
  ): Roadmap {
    return buildRoadmap(gaps, {
      companyId: profile.id,
      currentScore: options.currentScore,
      horizonDays: options.horizonDays,
      today: options.today,
      capacityPerPhase: options.capacityPerPhase,
    });
  }

  /** End-to-end: assess, then plan. */
  plan(
    profile: CompanyProfile,
    answers: Answers = {},
    options: AssessOptions & { horizonDays?: number; capacityPerPhase?: number } = {},
  ): AssessResult & { roadmap: Roadmap } {
    const result = this.assessDetailed(profile, answers, options);
    return {
      ...result,
      roadmap: this.buildRoadmap(result.profile, result.gaps, {
        today: options.today,
        horizonDays: options.horizonDays,
        currentScore: result.overall,
        capacityPerPhase: options.capacityPerPhase,
      }),
    };
  }

  /** Answer sheet for one framework, pre-filled from the profile where possible. */
  questionnaire(
    frameworkId: FrameworkId,
    profile?: CompanyProfile,
    answers: Answers = {},
  ): {
    frameworkId: FrameworkId;
    articles: Framework['articles'];
    progress: { answered: number; total: number; percent: number };
  } {
    const framework = this.resolve(frameworkId);
    const values = answers[frameworkId] ?? {};
    const total = framework.articles.reduce((acc, a) => acc + a.questionnaire.length, 0);
    const answered = framework.articles.reduce(
      (acc, a) => acc + a.questionnaire.filter((q) => values[q.id] !== undefined).length,
      0,
    );
    return {
      frameworkId,
      articles: framework.articles,
      progress: { answered, total, percent: total ? (answered / total) * 100 : 0 },
    };
  }

  /** Gaps that become non-compliant within the horizon. */
  urgent(gaps: Gap[], days = 90, today = new Date()): Gap[] {
    return urgentGaps(gaps, days, today);
  }

  /** Scores projected forward once gaps are closed. */
  project(scores: ComplianceScore[], gaps: Gap[]): ComplianceScore[] {
    return projectScores(scores, gaps);
  }

  private collectDeadlines(frameworks: Framework[]) {
    const deadlines: AssessResult['deadlines'] = [];
    for (const framework of frameworks) {
      for (const article of framework.articles) {
        if (!article.deadline) continue;
        deadlines.push({
          frameworkId: framework.id,
          articleId: article.id,
          title: article.title,
          deadline: article.deadline,
        });
      }
    }
    return deadlines.sort((a, b) => a.deadline.localeCompare(b.deadline));
  }
}

export function gradeOf(score: number): ComplianceScore['grade'] {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

/** Convenience wrapper used by the CLI: assess + plan in one call. */
export function runAssessment(
  profile: CompanyProfile,
  answers: Answers = {},
  options: AssessOptions & { horizonDays?: number } = {},
) {
  const engine = new ComplianceEngine();
  return engine.plan(profile, answers, options);
}

export type { Severity };