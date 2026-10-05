/**
 * Typed API client.
 *
 * Every call goes through `apiFetch` so auth, error shapes and the base URL are
 * handled in one place. On failure it throws an `ApiRequestError` carrying the
 * server's structured error, which the UI renders rather than a stack trace.
 */

import type {
  Answers,
  CompanyProfile,
  ComplianceScore,
  DocumentKind,
  Evidence,
  Framework,
  Gap,
  Roadmap,
} from '@complisme/shared';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '') ?? 'http://localhost:4000';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const token = options.token ?? getToken();
  if (token) headers.authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    throw new ApiRequestError(
      `Cannot reach the CompliSME API at ${API_URL}. Is it running? (${(error as Error).message})`,
      0,
      'network_error',
    );
  }

  const text = await response.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    const body = json as { error?: string; message?: string; details?: unknown };
    throw new ApiRequestError(
      body.message ?? `Request failed with HTTP ${response.status}`,
      response.status,
      body.error ?? 'error',
      body.details,
    );
  }

  return json as T;
}

// ---------------------------------------------------------------------------
// Auth token storage (localStorage so the app is a static deploy)
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'complisme.token';
const COMPANY_KEY = 'complisme.companyId';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(COMPANY_KEY, '');
}

export function clearToken(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(COMPANY_KEY);
}

export function setCompanyId(companyId: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(COMPANY_KEY, companyId);
}

export function getCompanyId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(COMPANY_KEY) || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Typed endpoints
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: string;
  version: string;
  database: string;
  openAccess: boolean;
  capabilities: { pdf: boolean; docx: boolean; llm: boolean };
  frameworks: string[];
}

export interface FrameworkSummary {
  id: string;
  name: string;
  shortName?: string;
  label: string;
  version?: string;
  description?: string;
  jurisdiction?: string;
  regulator?: string;
  authorityUrl?: string;
  enforcementDate?: string;
  tags?: string[];
  stats: { id: string; articles: number; questions: number; evidenceItems: number; fineExposure: number };
}

export interface Applicability {
  frameworkId: string;
  applies: boolean;
  confidence: number;
  reason: string;
  action?: string;
}

export interface CompanyResponse {
  company: CompanyProfile;
  applicability: Applicability[];
  frameworks: string[];
  fineExposure: number;
}

export interface AssessResponse {
  assessmentId?: string;
  companyId: string;
  overall: number;
  grade: string;
  scores: ComplianceScore[];
  gaps: Gap[];
  summary: {
    total: number;
    bySeverity: Record<string, number>;
    byFramework: Record<string, number>;
    effort: number;
    fineExposure: number;
    blockers: number;
  };
  facts: Record<string, number | boolean>;
  deadlines: Array<{ frameworkId: string; articleId: string; title: string; deadline: string }>;
  aiGaps?: Gap[];
  llmNote?: string;
  generatedAt: string;
}

export interface StatusResponse {
  company: { id: string; name: string; country: string; employees: number };
  overall: number;
  grade: string;
  scores: ComplianceScore[];
  summary: AssessResponse['summary'];
  facts: Record<string, number | boolean>;
  applicability: Applicability[];
  deadlines: AssessResponse['deadlines'];
  countdowns: Array<{
    id: string;
    label: string;
    date: string;
    frameworkId: string;
    description: string;
    daysRemaining: number;
  }>;
  overdue: number;
  urgent: number;
  evidenceCount: number;
  hasAssessment: boolean;
  assessmentId?: string;
  generatedAt: string;
}

export interface RoadmapResponse {
  roadmap: Roadmap;
  gaps: Gap[];
  overall: number;
}

export interface DocumentSummary {
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
  versions: Array<{ version: number; createdAt: string; changeLog?: string; checksum?: string }>;
}

export interface GenerateResponse {
  documentId?: string;
  version?: number;
  kind: DocumentKind;
  title: string;
  format: string;
  path?: string;
  bytes: number;
  sections: number;
  words: number;
  checksum: string;
  warning?: string;
  llmNote?: string;
  html?: string;
  generatedAt: string;
}

export interface ScanResponse {
  filesScanned: number;
  bytesScanned: number;
  languages: Record<string, number>;
  findings: Array<{
    id: string;
    ruleId: string;
    category: string;
    severity: string;
    message: string;
    file: string;
    line: number;
    snippet?: string;
    confidence: number;
    mappings: Array<{ frameworkId: string; articleId: string; reason: string }>;
    remediation: string;
  }>;
  gaps: Gap[];
  summary: { total: number; bySeverity: Record<string, number>; frameworks: Record<string, number> };
  truncated?: boolean;
}

export const api = {
  health: () => apiFetch<HealthResponse>('/health'),

  frameworks: () => apiFetch<{ frameworks: FrameworkSummary[] }>('/api/v1/frameworks'),
  framework: (id: string) => apiFetch<Framework & { deadlines: unknown[] }>(`/api/v1/frameworks/${id}`),
  rules: () =>
    apiFetch<{ rules: Array<{ id: string; title: string; category: string; severity: string; mapsTo: Array<{ frameworkId: string; articleId: string; reason: string }> }> }>(
      '/api/v1/rules',
    ),

  signup: (body: { email: string; password: string; companyName: string; country: string }) =>
    apiFetch<{ token: string; user: { id: string; email: string }; company: CompanyProfile }>(
      '/api/v1/auth/signup',
      { method: 'POST', body },
    ),
  login: (body: { email: string; password: string }) =>
    apiFetch<{ token: string; user: { id: string; email: string } }>('/api/v1/auth/login', {
      method: 'POST',
      body,
    }),
  me: () => apiFetch<{ user: { id: string; email: string }; company?: CompanyProfile; subscription?: { plan: string } }>('/api/v1/auth/me'),

  company: (id: string) => apiFetch<CompanyResponse>(`/api/v1/companies/${id}`),
  updateCompany: (id: string, profile: Partial<CompanyProfile>) =>
    apiFetch<CompanyResponse>(`/api/v1/companies/${id}`, { method: 'PUT', body: profile }),

  preview: (profile: Partial<CompanyProfile>, answers: Answers = {}) =>
    apiFetch<{ overall: number; grade: string; scores: Array<{ frameworkId: string; score: number; grade: string }>; gapCount: number; blockers: number }>(
      '/api/v1/assess/preview',
      { method: 'POST', body: { profile, answers } },
    ),

  assess: (companyId: string, answers: Answers = {}, useLLM = false) =>
    apiFetch<AssessResponse>('/api/v1/assess', { method: 'POST', body: { companyId, answers, useLLM } }),

  status: (companyId: string) => apiFetch<StatusResponse>(`/api/v1/companies/${companyId}/status`),
  roadmap: (companyId: string, horizon = 90) =>
    apiFetch<RoadmapResponse>(`/api/v1/companies/${companyId}/roadmap?horizon=${horizon}`),

  setGapStatus: (gapId: string, status: Gap['status']) =>
    apiFetch<{ gap: Gap }>(`/api/v1/gaps/${gapId}`, { method: 'PATCH', body: { status } }),

  generate: (body: { companyId: string; kind: DocumentKind; format: string; useLLM?: boolean }) =>
    apiFetch<GenerateResponse>('/api/v1/generate', { method: 'POST', body }),

  documents: (companyId: string) => apiFetch<{ documents: DocumentSummary[] }>(`/api/v1/documents?companyId=${companyId}`),

  scan: (path: string) => apiFetch<ScanResponse>('/api/v1/scan', { method: 'POST', body: { path } }),

  evidence: (companyId: string) => apiFetch<{ evidence: Evidence[] }>(`/api/v1/companies/${companyId}/evidence`),
  addEvidence: (companyId: string, body: { frameworkId: string; articleId: string; title: string; type?: string; description?: string }) =>
    apiFetch<{ evidence: Evidence }>(`/api/v1/companies/${companyId}/evidence`, { method: 'POST', body }),

  pricing: () =>
    apiFetch<{
      currency: string;
      plans: Array<{ id: string; priceMonthly: number; seats: number; frameworks: number; scansPerMonth: number; llmDraftsPerMonth: number; selfHosted: boolean }>;
      deadlines: Array<{ id: string; label: string; date: string; frameworkId: string; description: string }>;
    }>('/api/v1/pricing'),

  aiStatus: () => apiFetch<{ configured: boolean; provider?: string; model?: string; reachable?: boolean; note: string }>('/api/v1/ai/status'),

  subscription: (plan: string) =>
    apiFetch<{ subscription: { plan: string }; billingEnabled: boolean; note: string }>('/api/v1/subscription', {
      method: 'POST',
      body: { plan },
    }),
};

export type { Answers, CompanyProfile, ComplianceScore, DocumentKind, Evidence, Framework, Gap, Roadmap };