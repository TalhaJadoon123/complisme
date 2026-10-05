/**
 * Database access with a repository seam.
 *
 * The API runs against PostgreSQL in production and against an in-memory store
 * when `DATABASE_URL` is unset. The repository interface is what routes depend
 * on, so the whole test suite runs without a database and a self-hoster can
 * start the server with zero configuration.
 */

import { randomUUID } from 'node:crypto';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { nowIso, stableId } from '@complisme/shared';
import type {
  Answers,
  Assessment,
  ComplianceScore,
  CompanyProfile,
  DocumentKind,
  DocumentVersion,
  Evidence,
  Gap,
  Roadmap,
  Subscription,
  SubscriptionPlan,
  User,
} from '@complisme/shared';

import * as schema from './schema';

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface Repository {
  readonly kind: 'postgres' | 'memory';
  init(): Promise<void>;
  close(): Promise<void>;

  createUser(input: {
    email: string;
    passwordHash: string;
    name?: string;
    companyId?: string;
  }): Promise<User>;
  findUserByEmail(email: string): Promise<(User & { passwordHash: string }) | undefined>;
  findUserById(id: string): Promise<User | undefined>;

  createCompany(profile: CompanyProfile): Promise<CompanyProfile>;
  updateCompany(id: string, profile: Partial<CompanyProfile>): Promise<CompanyProfile | undefined>;
  findCompany(id: string): Promise<CompanyProfile | undefined>;
  listCompanies(): Promise<CompanyProfile[]>;

  saveAssessment(input: {
    companyId: string;
    frameworkId: string;
    answers: Answers;
    scores: ComplianceScore[];
    evidence: Evidence[];
    overallScore: number;
    roadmap?: Roadmap;
    completedBy?: string;
  }): Promise<Assessment>;
  latestAssessment(companyId: string): Promise<Assessment | undefined>;
  listAssessments(companyId: string, limit?: number): Promise<Assessment[]>;

  upsertGaps(companyId: string, gaps: Gap[]): Promise<Gap[]>;
  listGaps(companyId: string, filter?: { status?: string; frameworkId?: string }): Promise<Gap[]>;
  updateGapStatus(companyId: string, naturalId: string, status: Gap['status']): Promise<Gap | undefined>;

  listEvidence(companyId: string): Promise<Evidence[]>;
  addEvidence(input: Omit<Evidence, 'id' | 'collectedAt'> & { id?: string; collectedAt?: string }): Promise<Evidence>;
  removeEvidence(companyId: string, id: string): Promise<boolean>;

  saveDocument(input: {
    companyId: string;
    kind: DocumentKind;
    title: string;
    frameworkIds: string[];
    format: 'pdf' | 'html' | 'docx' | 'md' | 'json';
    path?: string;
    checksum?: string;
    bytes?: number;
    metadata?: Record<string, unknown>;
    createdBy?: string;
  }): Promise<{ id: string; version: number }>;
  listDocuments(companyId: string): Promise<
    Array<{
      id: string;
      kind: DocumentKind;
      title: string;
      frameworkIds: string[];
      format: string;
      path?: string;
      checksum?: string;
      version: number;
      bytes: number;
      createdAt: string;
      updatedAt: string;
      versions: DocumentVersion[];
    }>
  >;

  getSubscription(companyId: string): Promise<Subscription>;
  setSubscription(companyId: string, plan: SubscriptionPlan, seats?: number): Promise<Subscription>;

  recordUsage(companyId: string, kind: string, quantity?: number, metadata?: Record<string, unknown>): Promise<void>;
  usageInMonth(companyId: string, kind: string): Promise<number>;
}

// ---------------------------------------------------------------------------
// Memory implementation
// ---------------------------------------------------------------------------

interface MemoryState {
  users: Array<User & { passwordHash: string }>;
  companies: CompanyProfile[];
  assessments: Assessment[];
  gaps: Array<Gap & { companyId: string }>;
  evidence: Evidence[];
  documents: Array<{
    id: string;
    companyId: string;
    kind: DocumentKind;
    title: string;
    frameworkIds: string[];
    format: string;
    path?: string;
    checksum?: string;
    version: number;
    bytes: number;
    metadata: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
    versions: DocumentVersion[];
  }>;
  subscriptions: Subscription[];
  usage: Array<{ companyId: string; kind: string; quantity: number; at: string; metadata: Record<string, unknown> }>;
}

export class MemoryRepository implements Repository {
  readonly kind = 'memory' as const;
  private state: MemoryState = {
    users: [],
    companies: [],
    assessments: [],
    gaps: [],
    evidence: [],
    documents: [],
    subscriptions: [],
    usage: [],
  };

  async init(): Promise<void> {
    /* nothing to migrate */
  }

  async close(): Promise<void> {
    /* no connection */
  }

  /** Test helper. */
  reset(): void {
    this.state = {
      users: [],
      companies: [],
      assessments: [],
      gaps: [],
      evidence: [],
      documents: [],
      subscriptions: [],
      usage: [],
    };
  }

  async createUser(input: {
    email: string;
    passwordHash: string;
    name?: string;
    companyId?: string;
  }): Promise<User> {
    const user: User & { passwordHash: string } = {
      id: randomUUID(),
      email: input.email.toLowerCase(),
      name: input.name,
      companyId: input.companyId,
      role: 'owner',
      createdAt: nowIso(),
      passwordHash: input.passwordHash,
    };
    this.state.users.push(user);
    return stripHash(user);
  }

  async findUserByEmail(email: string) {
    return this.state.users.find((u) => u.email === email.toLowerCase());
  }

  async findUserById(id: string) {
    const user = this.state.users.find((u) => u.id === id);
    return user ? stripHash(user) : undefined;
  }

  async createCompany(profile: CompanyProfile): Promise<CompanyProfile> {
    const stored: CompanyProfile = {
      ...profile,
      id: profile.id || randomUUID(),
      createdAt: profile.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    this.state.companies.push(stored);
    return stored;
  }

  async updateCompany(id: string, profile: Partial<CompanyProfile>) {
    const index = this.state.companies.findIndex((c) => c.id === id);
    if (index === -1) return undefined;
    this.state.companies[index] = { ...this.state.companies[index], ...profile, updatedAt: nowIso() };
    return this.state.companies[index];
  }

  async findCompany(id: string) {
    return this.state.companies.find((c) => c.id === id);
  }

  async listCompanies() {
    return [...this.state.companies];
  }

  async saveAssessment(input: {
    companyId: string;
    frameworkId: string;
    answers: Answers;
    scores: ComplianceScore[];
    evidence: Evidence[];
    overallScore: number;
    roadmap?: Roadmap;
    completedBy?: string;
  }): Promise<Assessment> {
    const assessment: Assessment = {
      id: randomUUID(),
      companyId: input.companyId,
      frameworkId: input.frameworkId,
      answers: input.answers,
      scores: input.scores,
      evidence: input.evidence,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      completedBy: input.completedBy,
    };
    this.state.assessments.unshift(assessment);
    return assessment;
  }

  async latestAssessment(companyId: string) {
    return this.state.assessments.find((a) => a.companyId === companyId);
  }

  async listAssessments(companyId: string, limit = 20) {
    return this.state.assessments.filter((a) => a.companyId === companyId).slice(0, limit);
  }

  async upsertGaps(companyId: string, gaps: Gap[]): Promise<Gap[]> {
    const stored: Gap[] = [];
    for (const gap of gaps) {
      const naturalId = gap.id || stableId('gap', companyId, gap.frameworkId, gap.articleId, gap.questionId);
      const existing = this.state.gaps.find((g) => g.companyId === companyId && g.id === naturalId);
      const record: Gap & { companyId: string } = {
        ...gap,
        id: naturalId,
        status: existing?.status ?? gap.status ?? 'open',
        companyId,
      };
      if (existing) Object.assign(existing, record);
      else this.state.gaps.push(record);
      stored.push(record);
    }
    return stored;
  }

  async listGaps(companyId: string, filter: { status?: string; frameworkId?: string } = {}) {
    return this.state.gaps.filter(
      (g) =>
        companyId === g.companyId &&
        (!filter.status || g.status === filter.status) &&
        (!filter.frameworkId || g.frameworkId === filter.frameworkId),
    );
  }

  async updateGapStatus(companyId: string, naturalId: string, status: Gap['status']) {
    const gap = this.state.gaps.find((g) => g.companyId === companyId && g.id === naturalId);
    if (!gap) return undefined;
    gap.status = status;
    return gap;
  }

  async listEvidence(companyId: string) {
    return this.state.evidence.filter((e) => e.companyId === companyId);
  }

  async addEvidence(
    input: Omit<Evidence, 'id' | 'collectedAt'> & { id?: string; collectedAt?: string },
  ) {
    const item: Evidence = { ...input, id: input.id ?? randomUUID(), collectedAt: input.collectedAt ?? nowIso() };
    this.state.evidence.push(item);
    return item;
  }

  async removeEvidence(companyId: string, id: string) {
    const before = this.state.evidence.length;
    this.state.evidence = this.state.evidence.filter((e) => !(e.companyId === companyId && e.id === id));
    return this.state.evidence.length < before;
  }

  async saveDocument(input: {
    companyId: string;
    kind: DocumentKind;
    title: string;
    frameworkIds: string[];
    format: 'pdf' | 'html' | 'docx' | 'md' | 'json';
    path?: string;
    checksum?: string;
    bytes?: number;
    metadata?: Record<string, unknown>;
    createdBy?: string;
  }) {
    const existing = this.state.documents.find(
      (d) => d.companyId === input.companyId && d.kind === input.kind,
    );
    const version = (existing?.version ?? 0) + 1;
    const record = {
      id: existing?.id ?? randomUUID(),
      companyId: input.companyId,
      kind: input.kind,
      title: input.title,
      frameworkIds: input.frameworkIds,
      format: input.format,
      path: input.path,
      checksum: input.checksum,
      version,
      bytes: input.bytes ?? 0,
      metadata: input.metadata ?? {},
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
      versions: [
        ...(existing?.versions ?? []),
        { version, createdAt: nowIso(), changeLog: `Generated ${input.format.toUpperCase()}`, checksum: input.checksum },
      ],
    };
    if (existing) this.state.documents[this.state.documents.indexOf(existing)] = record;
    else this.state.documents.push(record);
    return { id: record.id, version };
  }

  async listDocuments(companyId: string) {
    return this.state.documents
      .filter((d) => d.companyId === companyId)
      .map(({ companyId: _companyId, metadata: _metadata, ...rest }) => rest);
  }

  async getSubscription(companyId: string): Promise<Subscription> {
    const existing = this.state.subscriptions.find((s) => s.companyId === companyId);
    if (existing) return existing;
    const created: Subscription = {
      id: randomUUID(),
      companyId,
      plan: 'free',
      status: 'active',
      seats: 1,
    };
    this.state.subscriptions.push(created);
    return created;
  }

  async setSubscription(companyId: string, plan: SubscriptionPlan, seats = 1): Promise<Subscription> {
    const index = this.state.subscriptions.findIndex((s) => s.companyId === companyId);
    if (index === -1) {
      const created: Subscription = { id: randomUUID(), companyId, plan, status: 'active', seats };
      this.state.subscriptions.push(created);
      return created;
    }
    this.state.subscriptions[index] = { ...this.state.subscriptions[index], plan, seats };
    return this.state.subscriptions[index];
  }

  async recordUsage(companyId: string, kind: string, quantity = 1, metadata: Record<string, unknown> = {}) {
    this.state.usage.push({ companyId, kind, quantity, at: nowIso(), metadata });
  }

  async usageInMonth(companyId: string, kind: string) {
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);
    const cutoff = since.getTime();
    return this.state.usage
      .filter((u) => u.companyId === companyId && u.kind === kind && new Date(u.at).getTime() >= cutoff)
      .reduce((acc, u) => acc + u.quantity, 0);
  }
}

function stripHash(user: User & { passwordHash: string }): User {
  const { passwordHash: _hash, ...rest } = user;
  return rest;
}

// ---------------------------------------------------------------------------
// Postgres implementation
// ---------------------------------------------------------------------------

type Db = ReturnType<typeof drizzle<typeof schema>>;

/**
 * PostgreSQL repository. Uses raw Drizzle queries rather than the query
 * builder so the same code paths work with both drivers.
 */
export class PostgresRepository implements Repository {
  readonly kind = 'postgres' as const;
  private db!: Db;
  private sql!: ReturnType<typeof postgres>;

  constructor(private readonly url: string) {}

  async init(): Promise<void> {
    this.sql = postgres(this.url, { max: 10, onnotice: () => undefined, prepare: false });
    this.db = drizzle(this.sql, { schema });
  }

  async close(): Promise<void> {
    await this.sql?.end({ timeout: 5 });
  }

  /** Exposed for drizzle-kit and tests. */
  get client(): Db {
    return this.db;
  }

  async createUser(input: { email: string; passwordHash: string; name?: string; companyId?: string }) {
    const rows = await this.sql`
      insert into users (email, password_hash, name, company_id)
      values (${input.email.toLowerCase()}, ${input.passwordHash}, ${input.name ?? null}, ${input.companyId ?? null})
      returning id, email, name, role, company_id, created_at, last_login_at
    `;
    return mapUser(rows[0]);
  }

  async findUserByEmail(email: string) {
    const rows = await this.sql`
      select id, email, name, role, company_id, created_at, last_login_at, password_hash
      from users where email = ${email.toLowerCase()} limit 1
    `;
    if (!rows[0]) return undefined;
    const row = rows[0];
    return {
      ...mapUser(row),
      passwordHash: String(row.password_hash),
    };
  }

  async findUserById(id: string) {
    const rows = await this.sql`
      select id, email, name, role, company_id, created_at, last_login_at
      from users where id = ${id} limit 1
    `;
    return rows[0] ? mapUser(rows[0]) : undefined;
  }

  async createCompany(profile: CompanyProfile) {
    const rows = await this.sql`
      insert into companies (name, legal_name, country, sector, employees, revenue_eur, size, profile)
      values (
        ${profile.name}, ${profile.legalName ?? null}, ${profile.country}, ${profile.sector},
        ${profile.employees ?? 0}, ${profile.revenueEUR ?? 0}, ${profile.size ?? 'micro'},
        ${this.sql.json(profile as never)}
      )
      returning id
    `;
    return { ...profile, id: String(rows[0].id) };
  }

  async updateCompany(id: string, profile: Partial<CompanyProfile>) {
    const rows = await this.sql`
      update companies
      set name = coalesce(${profile.name ?? null}, name),
          legal_name = coalesce(${profile.legalName ?? null}, legal_name),
          sector = coalesce(${profile.sector ?? null}, sector),
          employees = coalesce(${profile.employees ?? null}, employees),
          revenue_eur = coalesce(${profile.revenueEUR ?? null}, revenue_eur),
          size = coalesce(${profile.size ?? null}, size),
          profile = coalesce(${profile ? this.sql.json(profile as never) : null}, profile),
          updated_at = now()
      where id = ${id}
      returning id
    `;
    if (!rows[0]) return undefined;
    return this.findCompany(id);
  }

  async findCompany(id: string) {
    const rows = await this.sql`select profile, created_at, updated_at from companies where id = ${id} limit 1`;
    if (!rows[0]) return undefined;
    return { ...(rows[0].profile as unknown as CompanyProfile), id };
  }

  async listCompanies() {
    const rows = await this.sql`select profile from companies order by created_at desc`;
    return rows.map((r) => r.profile as unknown as CompanyProfile);
  }

  async saveAssessment(input: {
    companyId: string;
    frameworkId: string;
    answers: Answers;
    scores: ComplianceScore[];
    evidence: Evidence[];
    overallScore: number;
    roadmap?: Roadmap;
    completedBy?: string;
  }): Promise<Assessment> {
    const rows = await this.sql`
      insert into assessments (company_id, framework_id, answers, scores, overall_score, roadmap, completed_by)
      values (
        ${input.companyId}, ${input.frameworkId},
        ${this.sql.json(input.answers as never)}, ${this.sql.json(input.scores as never)},
        ${input.overallScore},
        ${input.roadmap ? this.sql.json(input.roadmap as never) : null},
        ${input.completedBy ?? null}
      )
      returning id, created_at, updated_at
    `;
    return {
      id: String(rows[0].id),
      companyId: input.companyId,
      frameworkId: input.frameworkId,
      answers: input.answers,
      scores: input.scores,
      evidence: input.evidence,
      createdAt: new Date(rows[0].created_at).toISOString(),
      updatedAt: new Date(rows[0].updated_at).toISOString(),
      completedBy: input.completedBy,
    };
  }

  async latestAssessment(companyId: string) {
    const rows = await this.sql`
      select id, framework_id, answers, scores, created_at, updated_at, completed_by
      from assessments where company_id = ${companyId}
      order by created_at desc limit 1
    `;
    if (!rows[0]) return undefined;
    const row = rows[0];
    return {
      id: String(row.id),
      companyId,
      frameworkId: String(row.framework_id),
      answers: row.answers as unknown as Answers,
      scores: row.scores as unknown as ComplianceScore[],
      evidence: [],
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      completedBy: row.completed_by ? String(row.completed_by) : undefined,
    };
  }

  async listAssessments(companyId: string, limit = 20) {
    const rows = await this.sql`
      select id, framework_id, answers, scores, created_at, updated_at
      from assessments where company_id = ${companyId}
      order by created_at desc limit ${limit}
    `;
    return rows.map((row) => ({
      id: String(row.id),
      companyId,
      frameworkId: String(row.framework_id),
      answers: row.answers as unknown as Answers,
      scores: row.scores as unknown as ComplianceScore[],
      evidence: [],
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
  }

  async upsertGaps(companyId: string, gapList: Gap[]) {
    if (!gapList.length) return [];
    const stored: Gap[] = [];
    for (const gap of gapList) {
      const naturalId = gap.id || stableId('gap', companyId, gap.frameworkId, gap.articleId, gap.questionId);
      const rows = await this.sql`
        insert into gaps (
          natural_id, company_id, framework_id, article_id, question_id, title, description,
          severity, status, remediation, effort, fine_exposure, citation, source, confidence,
          findings, deadline
        )
        values (
          ${naturalId}, ${companyId}, ${gap.frameworkId}, ${gap.articleId}, ${gap.questionId ?? null},
          ${gap.title ?? null}, ${gap.description ?? null}, ${gap.severity}, ${gap.status ?? 'open'},
          ${gap.remediation}, ${gap.effort ?? 1}, ${gap.fineExposure ?? null}, ${gap.citation ?? null},
          ${gap.source ?? 'rules'}, ${gap.confidence ?? null},
          ${this.sql.json((gap.findings ?? []) as never)}, ${gap.deadline ?? null}
        )
        on conflict (company_id, natural_id) do update set
          title = excluded.title,
          description = excluded.description,
          severity = excluded.severity,
          remediation = excluded.remediation,
          effort = excluded.effort,
          fine_exposure = excluded.fine_exposure,
          citation = excluded.citation,
          confidence = excluded.confidence,
          findings = excluded.findings,
          updated_at = now()
        returning natural_id, framework_id, article_id, question_id, title, description, severity,
                  status, remediation, effort, fine_exposure, citation, source, confidence, findings, deadline
      `;
      if (rows[0]) stored.push(schema.toGap(rows[0] as never));
    }
    return stored;
  }

  async listGaps(companyId: string, filter: { status?: string; frameworkId?: string } = {}) {
    const rows = filter.status && filter.frameworkId
      ? await this.sql`select * from gaps where company_id = ${companyId} and status = ${filter.status} and framework_id = ${filter.frameworkId}`
      : filter.status
        ? await this.sql`select * from gaps where company_id = ${companyId} and status = ${filter.status}`
        : filter.frameworkId
          ? await this.sql`select * from gaps where company_id = ${companyId} and framework_id = ${filter.frameworkId}`
          : await this.sql`select * from gaps where company_id = ${companyId}`;
    return rows.map((row) => schema.toGap(row as never));
  }

  async updateGapStatus(companyId: string, naturalId: string, status: Gap['status']) {
    const statusValue: Gap['status'] = status ?? 'open';
    const rows = await this.sql`
      update gaps set status = ${statusValue},
        resolved_at = case when ${statusValue} = 'resolved' then now() else null end,
        updated_at = now()
      where company_id = ${companyId} and natural_id = ${naturalId}
      returning *
    `;
    return rows[0] ? schema.toGap(rows[0] as never) : undefined;
  }

  async listEvidence(companyId: string) {
    const rows = await this.sql`select * from evidence where company_id = ${companyId} order by collected_at desc`;
    return rows.map((row) => schema.toEvidence(row as never));
  }

  async addEvidence(
    input: Omit<Evidence, 'id' | 'collectedAt'> & { id?: string; collectedAt?: string },
  ) {
    const naturalId = input.id ?? stableId('evidence', input.companyId, input.frameworkId, input.articleId, input.title);
    const rows = await this.sql`
      insert into evidence (
        natural_id, company_id, framework_id, article_id, title, type, description, url, locator, source
      )
      values (
        ${naturalId}, ${input.companyId}, ${input.frameworkId}, ${input.articleId}, ${input.title},
        ${input.type ?? null}, ${input.description ?? null}, ${input.url ?? null}, ${input.locator ?? null},
        ${input.source ?? 'manual'}
      )
      on conflict (company_id, natural_id) do update set
        title = excluded.title, description = excluded.description, url = excluded.url
      returning *
    `;
    return schema.toEvidence(rows[0] as never);
  }

  async removeEvidence(companyId: string, id: string) {
    const rows = await this.sql`delete from evidence where company_id = ${companyId} and id = ${id} returning id`;
    return rows.length > 0;
  }

  async saveDocument(input: {
    companyId: string;
    kind: DocumentKind;
    title: string;
    frameworkIds: string[];
    format: 'pdf' | 'html' | 'docx' | 'md' | 'json';
    path?: string;
    checksum?: string;
    bytes?: number;
    metadata?: Record<string, unknown>;
    createdBy?: string;
  }) {
    const existing = await this.sql`
      select id, version from documents
      where company_id = ${input.companyId} and kind = ${input.kind} limit 1
    `;
    const documentId = existing[0] ? String(existing[0].id) : randomUUID();
    const version = existing[0] ? Number(existing[0].version) + 1 : 1;

    await this.sql`
      insert into documents (
        id, company_id, kind, title, framework_ids, format, path, checksum, version, bytes, metadata, created_by
      )
      values (
        ${documentId}, ${input.companyId}, ${input.kind}, ${input.title},
        ${this.sql.json(input.frameworkIds as never)}, ${input.format}, ${input.path ?? null},
        ${input.checksum ?? null}, ${version}, ${input.bytes ?? 0},
        ${this.sql.json((input.metadata ?? {}) as never)}, ${input.createdBy ?? null}
      )
      on conflict (id) do update set
        title = excluded.title, path = excluded.path, checksum = excluded.checksum,
        version = excluded.version, bytes = excluded.bytes, metadata = excluded.metadata, updated_at = now()
    `;

    await this.sql`
      insert into document_versions (document_id, version, format, path, checksum, change_log, created_by)
      values (${documentId}, ${version}, ${input.format}, ${input.path ?? null}, ${input.checksum ?? null},
              ${`Generated ${input.format.toUpperCase()}`}, ${input.createdBy ?? null})
      on conflict (document_id, version) do nothing
    `;

    return { id: documentId, version };
  }

  async listDocuments(companyId: string) {
    const docs = await this.sql`
      select id, kind, title, framework_ids, format, path, checksum, version, bytes, created_at, updated_at
      from documents where company_id = ${companyId} order by updated_at desc
    `;
    const versions = await this.sql`
      select dv.document_id, dv.version, dv.format, dv.path, dv.checksum, dv.change_log, dv.created_at
      from document_versions dv
      join documents d on d.id = dv.document_id
      where d.company_id = ${companyId}
      order by dv.version desc
    `;
    return docs.map((row) => ({
      id: String(row.id),
      kind: row.kind as DocumentKind,
      title: String(row.title),
      frameworkIds: (row.framework_ids ?? []) as string[],
      format: String(row.format),
      path: row.path ? String(row.path) : undefined,
      checksum: row.checksum ? String(row.checksum) : undefined,
      version: Number(row.version),
      bytes: Number(row.bytes),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      versions: versions
        .filter((v) => String(v.document_id) === String(row.id))
        .map((v) => ({
          version: Number(v.version),
          createdAt: new Date(v.created_at).toISOString(),
          changeLog: v.change_log ? String(v.change_log) : undefined,
          checksum: v.checksum ? String(v.checksum) : undefined,
        })),
    }));
  }

  async getSubscription(companyId: string): Promise<Subscription> {
    const rows = await this.sql`select * from subscriptions where company_id = ${companyId} limit 1`;
    if (!rows[0]) {
      await this.sql`
        insert into subscriptions (company_id, plan, status, seats)
        values (${companyId}, 'free', 'active', 1) on conflict (company_id) do nothing
      `;
      return { id: randomUUID(), companyId, plan: 'free', status: 'active', seats: 1 };
    }
    const row = rows[0];
    return {
      id: String(row.id),
      companyId,
      plan: row.plan as SubscriptionPlan,
      status: row.status as Subscription['status'],
      seats: Number(row.seats),
      currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end).toISOString() : undefined,
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    };
  }

  async setSubscription(companyId: string, plan: SubscriptionPlan, seats = 1) {
    await this.sql`
      insert into subscriptions (company_id, plan, status, seats)
      values (${companyId}, ${plan}, 'active', ${seats})
      on conflict (company_id) do update set plan = excluded.plan, seats = excluded.seats, updated_at = now()
    `;
    return this.getSubscription(companyId);
  }

  async recordUsage(companyId: string, kind: string, quantity = 1, metadata: Record<string, unknown> = {}) {
    await this.sql`
      insert into usage_events (company_id, kind, quantity, metadata)
      values (${companyId}, ${kind}, ${quantity}, ${this.sql.json(metadata as never)})
    `;
  }

  async usageInMonth(companyId: string, kind: string) {
    const rows = await this.sql`
      select coalesce(sum(quantity), 0) as total
      from usage_events
      where company_id = ${companyId} and kind = ${kind}
        and created_at >= date_trunc('month', now())
    `;
    return Number(rows[0]?.total ?? 0);
  }
}

function mapUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    email: String(row.email),
    name: row.name ? String(row.name) : undefined,
    role: (row.role as User['role']) ?? 'owner',
    companyId: row.company_id ? String(row.company_id) : undefined,
    createdAt: new Date(row.created_at as string).toISOString(),
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at as string).toISOString() : undefined,
  } as User;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createRepository(databaseUrl = process.env.DATABASE_URL): Repository {
  if (!databaseUrl) return new MemoryRepository();
  return new PostgresRepository(databaseUrl);
}

/** Emit the DDL for a fresh database (`npm run db:push` equivalent, no external tooling). */
export async function describeSchema(): Promise<string> {
  const tables = [
    'users',
    'companies',
    'subscriptions',
    'assessments',
    'gaps',
    'evidence',
    'documents',
    'document_versions',
    'api_keys',
    'usage_events',
  ];
  return tables.join('\n');
}

export { schema };