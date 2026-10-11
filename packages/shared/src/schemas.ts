/** Zod schemas: the single validation layer for the API, CLI and web forms. */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Framework definitions
// ---------------------------------------------------------------------------

export const questionOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  satisfies: z.boolean().optional(),
  notApplicable: z.boolean().optional(),
  help: z.string().optional(),
});

export const questionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  type: z.enum(['boolean', 'single', 'multi', 'number', 'text']),
  weight: z.number().positive().optional(),
  required: z.boolean().optional(),
  help: z.string().optional(),
  options: z.array(questionOptionSchema).optional(),
  remediation: z.string().optional(),
  effort: z.number().nonnegative().optional(),
  citation: z.string().optional(),
  showIf: z
    .object({
      questionId: z.string(),
      equals: z.union([z.string(), z.boolean(), z.array(z.string())]),
    })
    .optional(),
  tags: z.array(z.string()).optional(),
});

export const articleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  evidenceRequired: z.array(z.string()).default([]),
  questionnaire: z.array(questionSchema).default([]),
  weight: z.number().positive().optional(),
  deadline: z.string().optional(),
  fineExposure: z.number().nonnegative().optional(),
  reference: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const frameworkSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  articles: z.array(articleSchema).min(1),
  shortName: z.string().optional(),
  version: z.string().optional(),
  description: z.string().optional(),
  jurisdiction: z.string().optional(),
  regulator: z.string().optional(),
  authorityUrl: z.string().optional(),
  enforcementDate: z.string().optional(),
  smeApplicable: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Company profile
// ---------------------------------------------------------------------------

export const aiSystemSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  purpose: z.string().min(1),
  domain: z.string(),
  deployed: z.boolean().default(false),
  providesOutputToNaturalPersons: z.boolean().optional(),
  interactsDirectlyWithNaturalPersons: z.boolean().optional(),
  customTrained: z.boolean().optional(),
  vendors: z.array(z.string()).optional(),
  automatedDecisionMaking: z.boolean().optional(),
  notes: z.string().optional(),
});

export const dataProcessingActivitySchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  purpose: z.string().min(1),
  legalBasis: z.string().optional(),
  specialCategory: z.boolean().optional(),
  dataSubjects: z.array(z.string()).optional(),
  dataCategories: z.array(z.string()).optional(),
  retentionMonths: z.number().int().nonnegative().optional(),
  processors: z.array(z.string()).optional(),
  thirdCountryTransfers: z.array(z.string()).optional(),
  automatedDecisionMaking: z.boolean().optional(),
});

export const sustainabilityMetricsSchema = z.object({
  scope1TonnesCO2e: z.number().nonnegative().optional(),
  scope2TonnesCO2e: z.number().nonnegative().optional(),
  scope3TonnesCO2e: z.number().nonnegative().optional(),
  energyMWh: z.number().nonnegative().optional(),
  waterM3: z.number().nonnegative().optional(),
  wasteTonnes: z.number().nonnegative().optional(),
  renewableSharePct: z.number().min(0).max(100).optional(),
  employeesFTE: z.number().nonnegative().optional(),
  womenInLeadershipPct: z.number().min(0).max(100).optional(),
  incidentsRecorded: z.number().nonnegative().optional(),
  revenueEUR: z.number().nonnegative().optional(),
  assuranceLevel: z.enum(['none', 'limited', 'reasonable']).optional(),
  valueChainPolicies: z.boolean().optional(),
});

/**
 * Schema for a profile a human typed into a form.
 *
 * `id` and `size` are derived, not entered, so they are optional here and
 * filled in by the engine. The `strictCompanyProfileSchema` below is the
 * variant for payloads that are already persisted and must carry them.
 */
export const companyProfileSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Company name is required'),
  legalName: z.string().optional(),
  country: z.string().length(2, 'Use a 2-letter ISO country code'),
  sector: z.string().min(1),
  employees: z.number().int().nonnegative(),
  revenueEUR: z.number().nonnegative(),
  size: z.enum(['micro', 'small', 'medium']).optional(),
  frameworks: z.array(z.string()).optional(),
  aiSystems: z.array(aiSystemSchema).optional(),
  processingActivities: z.array(dataProcessingActivitySchema).optional(),
  hasDpo: z.boolean().optional(),
  hasRopa: z.boolean().optional(),
  hasDpia: z.boolean().optional(),
  hasSecurityPolicies: z.boolean().optional(),
  hasIncidentResponse: z.boolean().optional(),
  hasConsentMechanism: z.boolean().optional(),
  hostsDataInEu: z.boolean().optional(),
  usesCookies: z.boolean().optional(),
  sustainability: sustainabilityMetricsSchema.optional(),
  notes: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type CompanyProfileInput = z.input<typeof companyProfileSchema>;
export type CompanyProfileOutput = z.output<typeof companyProfileSchema>;

/** Same shape, but for stored profiles where `id` and `size` must already exist. */
export const storedCompanyProfileSchema = companyProfileSchema.extend({
  id: z.string().min(1),
  size: z.enum(['micro', 'small', 'medium']),
});

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export const answerValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.null(),
]);

export const answersSchema = z.record(
  z.string(),
  z.record(z.string(), answerValueSchema),
);

// ---------------------------------------------------------------------------
// Evidence / documents
// ---------------------------------------------------------------------------

export const evidenceSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  frameworkId: z.string(),
  articleId: z.string(),
  title: z.string(),
  type: z.string().optional(),
  description: z.string().optional(),
  url: z.string().url().optional(),
  locator: z.string().optional(),
  collectedAt: z.string().optional(),
  validUntil: z.string().optional(),
  verified: z.boolean().optional(),
  source: z.enum(['manual', 'scanner', 'generator']).optional(),
});

export const documentKindSchema = z.enum([
  'ai-act-annex-iv',
  'ai-act-risk-register',
  'ai-act-conformity-declaration',
  'gdpr-ropa',
  'gdpr-dpia',
  'gdpr-dsr-response',
  'gdpr-tom',
  'csrd-report',
  'esrs-datapoint',
  'einvoice-validation-report',
  'compliance-roadmap',
  'nda-dpa',
  'consent-notice',
]);

export const generateRequestSchema = z.object({
  companyId: z.string().optional(),
  kind: documentKindSchema,
  frameworkId: z.string().optional(),
  format: z.enum(['pdf', 'docx', 'html', 'md', 'json']).default('pdf'),
  profile: companyProfileSchema.optional(),
  answers: answersSchema.optional(),
  evidence: z.array(evidenceSchema).optional(),
  useLLM: z.boolean().default(false),
  save: z.boolean().default(false),
  branding: z
    .object({
      productName: z.string().optional(),
      tagline: z.string().optional(),
      primaryColor: z.string().optional(),
      supportEmail: z.string().optional(),
    })
    .optional(),
});

export const assessRequestSchema = z
  .object({
    companyId: z.string().optional(),
    profile: companyProfileSchema.optional(),
    frameworks: z.array(z.string()).optional(),
    answers: answersSchema.default({}),
    evidence: z.array(evidenceSchema).optional(),
    useLLM: z.boolean().default(false),
  })
  // Without this, `{}` would silently assess an empty company and persist a
  // meaningless assessment row.
  .refine((value) => !!value.companyId || !!value.profile, {
    message: 'Provide either companyId (assess a stored company) or a profile object.',
    path: ['companyId'],
  });

export const previewRequestSchema = z
  .object({
    profile: companyProfileSchema,
    frameworks: z.array(z.string()).optional(),
    answers: answersSchema.default({}),
  });

export const scanRequestSchema = z.object({
  path: z.string().min(1),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  ruleset: z.enum(['gdpr', 'ai-act', 'all']).default('all'),
  useTreeSitter: z.boolean().default(false),
  maxFiles: z.number().int().positive().max(20000).optional(),
});

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  companyName: z.string().min(1),
  country: z.string().length(2),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const subscriptionSchema = z.object({
  plan: z.enum(['free', 'starter', 'business', 'enterprise']),
  seats: z.number().int().positive().optional(),
});

// ---------------------------------------------------------------------------
// LLM
// ---------------------------------------------------------------------------

export const llmGapAnalysisSchema = z.object({
  summary: z.string().optional(),
  gaps: z
    .array(
      z.object({
        articleId: z.string(),
        title: z.string(),
        severity: z.enum(['error', 'warning', 'info']),
        remediation: z.string(),
        effort: z.number().nonnegative(),
        fineExposure: z.number().nonnegative().optional(),
        confidence: z.number().min(0).max(1).optional(),
      }),
    )
    .default([]),
});

export type LlmGapAnalysis = z.infer<typeof llmGapAnalysisSchema>;

export const llmDraftSchema = z.object({
  sections: z
    .array(
      z.object({
        heading: z.string(),
        body: z.string(),
        wordCount: z.number().nonnegative().optional(),
      }),
    )
    .default([]),
});

export type LlmDraft = z.infer<typeof llmDraftSchema>;