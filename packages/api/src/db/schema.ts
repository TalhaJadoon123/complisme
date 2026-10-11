/**
 * Drizzle schema (PostgreSQL).
 *
 * The schema is deliberately normalised around the domain rather than around
 * the UI: a company has assessments, assessments have gaps and evidence, and
 * documents carry their own version history so the change log survives.
 *
 * `jsonb` is used for framework payloads (answers, scores, findings) because
 * their shape is owned by the framework definitions and changes with them.
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import type { Answers, ComplianceScore, Evidence, Finding, Gap, Roadmap } from '@complisme/shared';

export const subscriptionPlanEnum = pgEnum('subscription_plan', [
  'free',
  'starter',
  'business',
  'enterprise',
]);
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'trialing',
  'past_due',
  'canceled',
]);
export const userRoleEnum = pgEnum('user_role', ['owner', 'admin', 'member']);
export const gapStatusEnum = pgEnum('gap_status', [
  'open',
  'in_progress',
  'resolved',
  'accepted_risk',
]);
export const gapSeverityEnum = pgEnum('gap_severity', ['error', 'warning', 'info']);
export const documentFormatEnum = pgEnum('document_format', ['pdf', 'html', 'docx', 'md', 'json']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name'),
    /** scrypt hash, never the password itself. */
    passwordHash: text('password_hash').notNull(),
    role: userRoleEnum('role').notNull().default('owner'),
    companyId: uuid('company_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (table) => ({
    emailIdx: uniqueIndex('users_email_idx').on(table.email),
    companyIdx: index('users_company_idx').on(table.companyId),
  }),
);

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    legalName: text('legal_name'),
    country: text('country').notNull(),
    sector: text('sector').notNull(),
    employees: integer('employees').notNull().default(0),
    revenueEur: real('revenue_eur').notNull().default(0),
    size: text('size').notNull().default('micro'),
    /** The full CompanyProfile, so onboarding can be resumed without loss. */
    profile: jsonb('profile').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
  },
  (table) => ({
    countryIdx: index('companies_country_idx').on(table.country),
  }),
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    plan: subscriptionPlanEnum('plan').notNull().default('free'),
    status: subscriptionStatusEnum('status').notNull().default('active'),
    seats: integer('seats').notNull().default(1),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    providerCustomerId: text('provider_customer_id'),
    providerSubscriptionId: text('provider_subscription_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: uniqueIndex('subscriptions_company_idx').on(table.companyId),
    providerIdx: index('subscriptions_provider_idx').on(table.providerSubscriptionId),
  }),
);

export const assessments = pgTable(
  'assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    frameworkId: text('framework_id').notNull(),
    answers: jsonb('answers').$type<Answers>().notNull().default({}),
    scores: jsonb('scores').$type<ComplianceScore[]>().notNull().default([]),
    /** Overall readiness at the time of the assessment. */
    overallScore: real('overall_score').notNull().default(0),
    roadmap: jsonb('roadmap').$type<Roadmap | null>(),
    completedBy: uuid('completed_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index('assessments_company_idx').on(table.companyId),
    frameworkIdx: index('assessments_framework_idx').on(table.frameworkId),
    createdIdx: index('assessments_created_idx').on(table.createdAt),
  }),
);

export const gaps = pgTable(
  'gaps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stable across re-assessments so progress can be tracked over time. */
    naturalId: text('natural_id').notNull(),
    assessmentId: uuid('assessment_id').references(() => assessments.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    frameworkId: text('framework_id').notNull(),
    articleId: text('article_id').notNull(),
    questionId: text('question_id'),
    title: text('title'),
    description: text('description'),
    severity: gapSeverityEnum('severity').notNull().default('info'),
    status: gapStatusEnum('status').notNull().default('open'),
    remediation: text('remediation').notNull(),
    effort: real('effort').notNull().default(1),
    fineExposure: real('fine_exposure'),
    citation: text('citation'),
    source: text('source').notNull().default('rules'),
    confidence: real('confidence'),
    findings: jsonb('findings').$type<Finding[]>().default([]),
    deadline: timestamp('deadline', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index('gaps_company_idx').on(table.companyId),
    naturalIdx: uniqueIndex('gaps_natural_idx').on(table.companyId, table.naturalId),
    severityIdx: index('gaps_severity_idx').on(table.severity),
    statusIdx: index('gaps_status_idx').on(table.status),
  }),
);

export const evidence = pgTable(
  'evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    naturalId: text('natural_id').notNull(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    frameworkId: text('framework_id').notNull(),
    articleId: text('article_id').notNull(),
    title: text('title').notNull(),
    type: text('type'),
    description: text('description'),
    url: text('url'),
    locator: text('locator'),
    source: text('source').notNull().default('manual'),
    verified: boolean('verified').notNull().default(false),
    collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
  },
  (table) => ({
    companyIdx: index('evidence_company_idx').on(table.companyId),
    articleIdx: index('evidence_article_idx').on(table.frameworkId, table.articleId),
    naturalIdx: uniqueIndex('evidence_natural_idx').on(table.companyId, table.naturalId),
  }),
);

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    frameworkIds: jsonb('framework_ids').$type<string[]>().notNull().default([]),
    format: documentFormatEnum('format').notNull().default('pdf'),
    /** Where the artefact lives: object storage key, or a local path. */
    path: text('path'),
    checksum: text('checksum'),
    /** Current major version. */
    version: integer('version').notNull().default(1),
    bytes: integer('bytes').notNull().default(0),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index('documents_company_idx').on(table.companyId),
    kindIdx: index('documents_kind_idx').on(table.kind),
  }),
);

export const documentVersions = pgTable(
  'document_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    format: documentFormatEnum('format').notNull().default('pdf'),
    path: text('path'),
    checksum: text('checksum'),
    changeLog: text('change_log'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    documentIdx: index('document_versions_document_idx').on(table.documentId),
    versionIdx: uniqueIndex('document_versions_version_idx').on(table.documentId, table.version),
  }),
);

/** API keys for machine access (CI, integrations). */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Only the hash is stored; the plaintext key is shown once at creation. */
    keyHash: text('key_hash').notNull(),
    prefix: text('prefix').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    hashIdx: uniqueIndex('api_keys_hash_idx').on(table.keyHash),
    prefixIdx: index('api_keys_prefix_idx').on(table.prefix),
  }),
);

/** Usage counters for plan limits (scans, AI drafts). */
export const usageEvents = pgTable(
  'usage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    quantity: integer('quantity').notNull().default(1),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index('usage_company_idx').on(table.companyId),
    kindIdx: index('usage_kind_idx').on(table.kind),
    createdIdx: index('usage_created_idx').on(table.createdAt),
  }),
);

export type UserRow = typeof users.$inferSelect;
export type CompanyRow = typeof companies.$inferSelect;
export type AssessmentRow = typeof assessments.$inferSelect;
export type GapRow = typeof gaps.$inferSelect;
export type EvidenceRow = typeof evidence.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type SubscriptionRow = typeof subscriptions.$inferSelect;

/** Convert a persisted evidence row into the shared domain type. */
export function toEvidence(row: EvidenceRow): Evidence {
  return {
    id: row.id,
    companyId: row.companyId,
    frameworkId: row.frameworkId,
    articleId: row.articleId,
    title: row.title,
    type: row.type ?? undefined,
    description: row.description ?? undefined,
    url: row.url ?? undefined,
    locator: row.locator ?? undefined,
    source: row.source as Evidence['source'],
    verified: row.verified,
    collectedAt: row.collectedAt.toISOString(),
    validUntil: row.validUntil?.toISOString(),
  };
}

/** Convert a persisted gap row into the shared domain type. */
export function toGap(row: GapRow): Gap {
  return {
    id: row.naturalId,
    frameworkId: row.frameworkId,
    articleId: row.articleId,
    questionId: row.questionId ?? undefined,
    title: row.title ?? undefined,
    description: row.description ?? undefined,
    severity: row.severity,
    status: row.status,
    remediation: row.remediation,
    effort: row.effort,
    fineExposure: row.fineExposure ?? undefined,
    citation: row.citation ?? undefined,
    source: row.source as Gap['source'],
    confidence: row.confidence ?? undefined,
    findings: row.findings ?? [],
    deadline: row.deadline ?? undefined,
  };
}

export type { Answers, ComplianceScore, Evidence, Finding, Gap, Roadmap };