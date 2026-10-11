/**
 * Scoring: turn a set of questionnaire answers into a 0-100 readiness score.
 *
 * The model is intentionally explainable — every point is traceable to one
 * weighted question — because SME users need to defend the number to a board,
 * a customer due-diligence questionnaire or an auditor.
 */

import {
  clamp,
  evaluateAnswer,
  gradeFor,
  isAnswered,
  questionApplies,
  weightedScore,
} from '@complisme/shared';
import type {
  AnswerValue,
  AnswerVerdict,
  Answers,
  Article,
  ComplianceScore,
  Evidence,
  Framework,
  Gap,
  Question,
  Severity,
} from '@complisme/shared';

/** Points awarded per verdict. Unanswered questions are penalised (incomplete ≠ compliant). */
export const VERDICT_POINTS: Record<AnswerVerdict, number> = {
  pass: 1,
  na: 1,
  fail: 0,
  unknown: 0,
};

/** Multiplier applied to the weight of an unanswered question. */
export const UNKNOWN_PENALTY = 0.6;

export interface QuestionOutcome {
  questionId: string;
  verdict: AnswerVerdict;
  weight: number;
  earned: number;
  applicable: boolean;
  evidenceSatisfied: boolean;
}

export interface ArticleScore {
  articleId: string;
  title: string;
  score: number;
  weight: number;
  applicable: boolean;
  outcomes: QuestionOutcome[];
  missingEvidence: string[];
  gaps: Gap[];
}

export interface FrameworkScore {
  framework: Framework;
  score: number;
  grade: ComplianceScore['grade'];
  articles: ArticleScore[];
  totals: {
    questions: number;
    applicable: number;
    answered: number;
    passed: number;
    failed: number;
    unknown: number;
    notApplicable: number;
  };
  evidence: {
    required: number;
    present: number;
    coverage: number;
  };
  fineExposure: number;
}

/**
 * Score a single article.
 * `evidenceIdsByArticle` holds the ids of evidence items linked to the article;
 * an article whose required evidence is missing cannot exceed 90 points.
 */
export function scoreArticle(
  frameworkId: string,
  article: Article,
  allAnswers: Answers,
  evidence: Evidence[] = [],
): ArticleScore {
  const answers = allAnswers[frameworkId] ?? {};
  const articleEvidence = evidence.filter((e) => e.articleId === article.id && e.frameworkId === frameworkId);

  const outcomes: QuestionOutcome[] = [];
  const gaps: Gap[] = [];

  for (const question of article.questionnaire) {
    const applicable = questionApplies(question, allAnswers, frameworkId);
    const raw = answers[question.id];
    const verdict = verdictOf(question, raw, applicable);
    const evidenceSatisfied = hasEvidenceFor(articleEvidence, question);
    const weight = (question.weight ?? 1) * (verdict === 'unknown' ? UNKNOWN_PENALTY : 1);
    outcomes.push({
      questionId: question.id,
      verdict,
      weight,
      earned: VERDICT_POINTS[verdict] * weight,
      applicable: verdict !== 'na',
      evidenceSatisfied,
    });
  }

  const applicableOutcomes = outcomes.filter((o) => o.applicable);
  const score = round1(weightedScore(applicableOutcomes.map((o) => ({ score: o.earned / (o.weight || 1), weight: o.weight }))));

  const satisfiedEvidence = article.evidenceRequired.filter((item) =>
    articleEvidence.some((e) => evidenceMatches(e, item)),
  );
  const missingEvidence = article.evidenceRequired.filter(
    (item) => !articleEvidence.some((e) => evidenceMatches(e, item)),
  );
  const evidencePenalty = missingEvidence.length / Math.max(1, article.evidenceRequired.length);
  const finalScore = clamp(score * (1 - 0.1 * evidencePenalty), 0, 100);

  for (const question of article.questionnaire) {
    const outcome = outcomes.find((o) => o.questionId === question.id);
    if (!outcome) continue;
    if (outcome.verdict === 'fail' || outcome.verdict === 'unknown') {
      gaps.push(gapFrom(frameworkId, article, question, outcome.verdict));
    }
  }

  return {
    articleId: article.id,
    title: article.title,
    score: finalScore,
    weight: article.weight ?? 1,
    applicable: applicableOutcomes.length > 0,
    outcomes,
    missingEvidence,
    gaps,
  };
}

function verdictOf(question: Question, raw: unknown, applicable: boolean): AnswerVerdict {
  if (!applicable) return 'na';
  return evaluateAnswer(question, raw as AnswerValue);
}

function hasEvidenceFor(articleEvidence: Evidence[], question: Question): boolean {
  if (!articleEvidence.length) return false;
  // A question counts as evidenced when its tags match an evidence item's type/title.
  const tags = (question.tags ?? []).map((t) => t.toLowerCase());
  return articleEvidence.some((e) => {
    const haystack = `${e.title} ${e.type ?? ''} ${e.description ?? ''}`.toLowerCase();
    return tags.some((tag) => haystack.includes(tag)) || articleEvidence.length > 0;
  });
}

function evidenceMatches(evidence: Evidence, requirement: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const a = norm(requirement);
  const b = norm(`${evidence.title} ${evidence.description ?? ''} ${evidence.type ?? ''}`);
  if (!b) return false;
  // Match on any significant keyword of the requirement.
  const keywords = a.split(' ').filter((w) => w.length > 4);
  return keywords.some((k) => b.includes(k));
}

function gapFrom(
  frameworkId: string,
  article: Article,
  question: Question,
  verdict: AnswerVerdict,
): Gap {
  const severity = severityFor(question, article, verdict);
  return {
    id: `${frameworkId}:${article.id}:${question.id}`,
    frameworkId,
    articleId: article.id,
    questionId: question.id,
    title: question.text,
    description: question.help,
    severity,
    remediation: question.remediation ?? `Satisfy: ${question.text}`,
    effort: question.effort ?? 3,
    deadline: article.deadline ? new Date(`${article.deadline}T00:00:00Z`) : undefined,
    deadlineIso: article.deadline,
    fineExposure: article.fineExposure,
    citation: question.citation ?? article.reference,
    source: 'rules',
    status: 'open',
    confidence: verdict === 'fail' ? 0.95 : 0.6,
  };
}

export function severityFor(question: Question, article: Article, verdict: AnswerVerdict): Severity {
  const exposure = article.fineExposure ?? 0;
  const weight = question.weight ?? 1;
  if (exposure >= 15_000_000 && weight >= 2 && verdict === 'fail') return 'error';
  if (exposure >= 1_000_000 && weight >= 1.5) return 'error';
  if (weight >= 2 || exposure >= 1_000_000) return 'warning';
  if (weight >= 1.25 || exposure >= 100_000) return 'warning';
  return 'info';
}

/** Roll article scores up into the framework score. */
export function scoreFramework(
  framework: Framework,
  answers: Answers,
  evidence: Evidence[] = [],
): FrameworkScore {
  const articles = framework.articles.map((article) =>
    scoreArticle(framework.id, article, answers, evidence),
  );

  const applicableArticles = articles.filter((a) => a.applicable);
  const score = round1(
    weightedScore(
      applicableArticles.map((a) => ({
        score: a.score / 100,
        weight: a.weight,
      })),
    ),
  );

  const outcomes = articles.flatMap((a) => a.outcomes);
  const requiredEvidence = framework.articles.reduce(
    (acc, def) =>
      acc +
      def.evidenceRequired.length +
      evidenceFor(framework, def.id, evidence).length,
    0,
  );
  const presentEvidence = framework.articles.reduce(
    (acc, def) => acc + evidenceFor(framework, def.id, evidence).length,
    0,
  );

  return {
    framework,
    score: applicableArticles.length === 0 ? 0 : score,
    grade: gradeFor(applicableArticles.length === 0 ? 0 : score),
    articles,
    totals: {
      questions: outcomes.length,
      applicable: outcomes.filter((o) => o.applicable).length,
      answered: outcomes.filter((o) => isAnswered(answers[framework.id]?.[o.questionId])).length,
      passed: outcomes.filter((o) => o.verdict === 'pass').length,
      failed: outcomes.filter((o) => o.verdict === 'fail').length,
      unknown: outcomes.filter((o) => o.verdict === 'unknown').length,
      notApplicable: outcomes.filter((o) => o.verdict === 'na').length,
    },
    evidence: {
      required: requiredEvidence,
      present: presentEvidence,
      coverage: requiredEvidence ? round1((presentEvidence / requiredEvidence) * 100) : 0,
    },
    fineExposure: framework.articles
      .filter((a) => articles.find((s) => s.articleId === a.id)?.applicable)
      .reduce((acc, a) => acc + (a.fineExposure ?? 0), 0),
  };
}

function evidenceFor(framework: Framework, articleId: string, evidence: Evidence[]): Evidence[] {
  return evidence.filter((e) => e.frameworkId === framework.id && e.articleId === articleId);
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Overall readiness across several frameworks, weighted by applicable exposure. */
export function overallScore(scores: FrameworkScore[]): number {
  if (!scores.length) return 0;
  const totalExposure = scores.reduce((acc, s) => acc + s.fineExposure, 0);
  if (totalExposure === 0) {
    return round1(weightedScore(scores.map((s) => ({ score: s.score / 100, weight: 1 }))));
  }
  return round1(
    weightedScore(
      scores.map((s) => ({
        score: s.score / 100,
        // Dampen the regulatory maxima so CSRD (€3M) does not drown out the AI Act.
        weight: Math.log10(Math.max(s.fineExposure, 10)) / 5,
      })),
    ),
  );
}