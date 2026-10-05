/**
 * Company profile helpers: defaults, normalisation and derived facts.
 */

import {
  companyProfileSchema,
  gapId as makeGapId,
  nowIso,
  stableId,
  uuid,
} from '@complisme/shared';
import type {
  AISystemDescriptor,
  CompanyProfile,
  CompanySize,
  DataProcessingActivity,
  FrameworkId,
} from '@complisme/shared';

export function deriveSize(employees: number, revenueEUR: number): CompanySize {
  // EU SME definition (Recommendation 2003/361): headcount AND turnover ceilings.
  const headcountMedium = employees >= 250;
  const turnoverMedium = revenueEUR >= 50_000_000;
  if (headcountMedium || turnoverMedium) return 'medium';
  const headcountSmall = employees >= 50;
  const turnoverSmall = revenueEUR >= 10_000_000;
  if (headcountSmall || turnoverSmall) return 'small';
  return 'micro';
}

/** Validate and normalise a raw profile, filling ids, timestamps and size. */
export function normaliseProfile(input: unknown): CompanyProfile {
  // `id` and `size` are derived when absent, so they are optional here.
  const parsed = companyProfileSchema.parse(input) as CompanyProfile;
  const revenueEUR = parsed.revenueEUR ?? 0;
  return {
    ...parsed,
    id: parsed.id || stableId('company', parsed.name ?? 'unknown', parsed.country ?? 'EU'),
    size: parsed.size ?? deriveSize(parsed.employees ?? 0, revenueEUR),
    aiSystems: (parsed.aiSystems ?? []).map((s, i) => normaliseAiSystem(s, i)),
    processingActivities: (parsed.processingActivities ?? []).map((a, i) =>
      normaliseActivity(a, i),
    ),
    createdAt: parsed.createdAt ?? nowIso(),
    updatedAt: parsed.updatedAt ?? nowIso(),
  };
}

function normaliseAiSystem(system: AISystemDescriptor, index: number): AISystemDescriptor {
  return {
    ...system,
    id: system.id || stableId('ai', system.name ?? `system-${index}`),
    name: system.name ?? `AI system ${index + 1}`,
    purpose: system.purpose ?? '',
    domain: system.domain ?? 'other',
    deployed: system.deployed ?? false,
    vendors: system.vendors ?? [],
  };
}

function normaliseActivity(
  activity: DataProcessingActivity,
  index: number,
): DataProcessingActivity {
  return {
    ...activity,
    id: activity.id || stableId('dpa', activity.name ?? `activity-${index}`),
    name: activity.name ?? `Processing activity ${index + 1}`,
    purpose: activity.purpose ?? '',
    specialCategory: activity.specialCategory ?? false,
    dataSubjects: activity.dataSubjects ?? [],
    dataCategories: activity.dataCategories ?? [],
    processors: activity.processors ?? [],
    thirdCountryTransfers: activity.thirdCountryTransfers ?? [],
    automatedDecisionMaking: activity.automatedDecisionMaking ?? false,
  };
}

/** Derived facts used by the engine and the documents. */
export interface ProfileFacts {
  aiSystemCount: number;
  highRiskAiCount: number;
  processingActivityCount: number;
  specialCategoryCount: number;
  transferCountryCount: number;
  processorCount: number;
  cookiesUsed: boolean;
  automatedDecisions: number;
  totalEmployees: number;
  revenueEUR: number;
  isSme: boolean;
  frameworks: FrameworkId[];
}

const HIGH_RISK_DOMAINS = new Set([
  'biometrics',
  'critical-infrastructure',
  'education',
  'employment',
  'hr',
  'recruitment',
  'credit',
  'creditworthiness',
  'essential-services',
  'insurance',
  'law-enforcement',
  'migration',
  'justice',
  'elections',
]);

export function profileFacts(profile: CompanyProfile): ProfileFacts {
  const activities = profile.processingActivities ?? [];
  const systems = profile.aiSystems ?? [];
  return {
    aiSystemCount: systems.length,
    highRiskAiCount: systems.filter(
      (s) => HIGH_RISK_DOMAINS.has(s.domain) || s.automatedDecisionMaking,
    ).length,
    processingActivityCount: activities.length,
    specialCategoryCount: activities.filter((a) => a.specialCategory).length,
    transferCountryCount: new Set(activities.flatMap((a) => a.thirdCountryTransfers ?? [])).size,
    processorCount: new Set(activities.flatMap((a) => a.processors ?? [])).size,
    cookiesUsed: profile.usesCookies ?? false,
    automatedDecisions:
      activities.filter((a) => a.automatedDecisionMaking).length +
      systems.filter((s) => s.automatedDecisionMaking).length,
    totalEmployees: profile.employees ?? 0,
    revenueEUR: profile.revenueEUR ?? 0,
    isSme: (profile.employees ?? 0) < 250 && (profile.revenueEUR ?? 0) < 50_000_000,
    frameworks: profile.frameworks ?? [],
  };
}

export function isHighRiskDomain(domain: string): boolean {
  return HIGH_RISK_DOMAINS.has(domain?.toLowerCase());
}

/** Seed gap ids for evidence, so evidence ids are stable per company/article. */
export function evidenceId(
  companyId: string,
  frameworkId: FrameworkId,
  articleId: string,
  index = 0,
): string {
  return makeGapId(companyId, frameworkId, articleId, `evidence-${index}`);
}

export function newCompanyId(): string {
  return uuid();
}