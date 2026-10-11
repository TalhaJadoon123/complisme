export { ComplianceEngine, runAssessment, gradeOf } from './engine';
export type { AssessOptions, AssessResult, FrameworkResolver } from './engine';

export { gapAnalyze, findingsToGaps, mergeGaps, dedupe, summariseGaps, gapDeadline } from './gap-analyzer';
export type { GapAnalysisOptions } from './gap-analyzer';

export { scoreArticle, scoreFramework, overallScore, severityFor, round1, VERDICT_POINTS, UNKNOWN_PENALTY } from './scoring';
export type { ArticleScore, FrameworkScore, QuestionOutcome } from './scoring';

export {
  roadmap,
  buildRoadmap,
  sortGaps,
  urgentGaps,
  overdueGaps,
  projectScores,
  rebalanceCapacity,
  PHASE_LABELS,
} from './roadmap';
export type { RoadmapOptions } from './roadmap';

export {
  normaliseProfile,
  deriveSize,
  profileFacts,
  isHighRiskDomain,
  evidenceId,
  newCompanyId,
} from './profile';
export type { ProfileFacts } from './profile';

export * from './fixtures';

export * from '@complisme/shared';