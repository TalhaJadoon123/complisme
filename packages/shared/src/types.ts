/**
 * Core domain model shared by every CompliSME package.
 *
 * The four interfaces in the specification (`Framework`, `Article`, `Gap`,
 * `ComplianceScore`) are the contract between the framework definition files,
 * the compliance engine, the document generator, the API and the web app. They
 * are extended here with optional fields so that a definition file only *has* to
 * provide the required parts, while the engine can attach richer data at runtime.
 */

// ---------------------------------------------------------------------------
// Enumerations / unions
// ---------------------------------------------------------------------------

/** Regulatory frameworks covered by CompliSME. `id` is stable and machine readable. */
export type FrameworkId =
  | 'eu-ai-act'
  | 'csrd'
  | 'gdpr'
  | 'e-invoicing'
  /** allow forward compatibility with custom/enterprise frameworks */
  | (string & {});

export type Severity = 'error' | 'warning' | 'info';

export type QuestionType = 'boolean' | 'single' | 'multi' | 'number' | 'text';

export type GapStatus = 'open' | 'in_progress' | 'resolved' | 'accepted_risk';

export type GapSource = 'rules' | 'scanner' | 'llm';

export type CompanySize = 'micro' | 'small' | 'medium';

export type SubscriptionPlan = 'free' | 'starter' | 'business' | 'enterprise';

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled';

export type DocumentKind =
  | 'ai-act-annex-iv'
  | 'ai-act-risk-register'
  | 'ai-act-conformity-declaration'
  | 'gdpr-ropa'
  | 'gdpr-dpia'
  | 'gdpr-dsr-response'
  | 'gdpr-tom'
  | 'csrd-report'
  | 'esrs-datapoint'
  | 'einvoice-validation-report'
  | 'compliance-roadmap'
  | 'nda-dpa'
  | 'consent-notice';

export type AnswerValue = string | number | boolean | string[] | null;

export type Answers = Record<string, Record<string, AnswerValue>>;

// ---------------------------------------------------------------------------
// Framework definitions
// ---------------------------------------------------------------------------

export interface QuestionOption {
  value: string;
  label: string;
  /** When true this option fully discharges the requirement (scored as compliant). */
  satisfies?: boolean;
  /** When true the question/article does not apply to this company. */
  notApplicable?: boolean;
  help?: string;
}

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  /** Relative importance inside the article (default 1). */
  weight?: number;
  required?: boolean;
  help?: string;
  options?: QuestionOption[];
  /** Concrete action the user must take when the answer is not compliant. */
  remediation?: string;
  /** Estimate in person-days to remediate this single answer. */
  effort?: number;
  /** Legal citation shown in generated documents. */
  citation?: string;
  /** Questions that only matter when the answer to `questionId` is `value`. */
  showIf?: { questionId: string; equals: string | boolean | string[] };
  tags?: string[];
}

export interface Article {
  id: string;
  title: string;
  description?: string;
  evidenceRequired: string[];
  questionnaire: Question[];
  /** Relative importance of the article inside the framework (default 1). */
  weight?: number;
  /** Legal deadline for compliance, if the regulation is phased in. */
  deadline?: string;
  /** Maximum theoretical fine exposure in EUR attributable to this article. */
  fineExposure?: number;
  /** Source article/section reference, e.g. "Regulation (EU) 2024/1689, Art. 9(3)". */
  reference?: string;
  tags?: string[];
}

export interface Framework {
  id: string;
  name: string;
  articles: Article[];
  // --- optional metadata -------------------------------------------------
  shortName?: string;
  version?: string;
  description?: string;
  jurisdiction?: string;
  regulator?: string;
  authorityUrl?: string;
  /** ISO date after which the framework must be fully enforced. */
  enforcementDate?: string;
  /** True when the framework only applies to companies above a size threshold. */
  smeApplicable?: boolean;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Company profile
// ---------------------------------------------------------------------------

export interface AISystemDescriptor {
  id: string;
  name: string;
  purpose: string;
  /** e.g. "hr", "credit", "medical", "marketing", "safety-component" */
  domain: string;
  /** Is the system already deployed to users? */
  deployed: boolean;
  providesOutputToNaturalPersons?: boolean;
  interactsDirectlyWithNaturalPersons?: boolean;
  /** Was the AI system trained on data supplied by the company? */
  customTrained?: boolean;
  /** Free-form list of vendors/models (OpenAI, Mistral, own model...). */
  vendors?: string[];
  /** Automated decision-making with legal or similarly significant effect (Art. 22). */
  automatedDecisionMaking?: boolean;
  notes?: string;
}

export interface DataProcessingActivity {
  id: string;
  name: string;
  purpose: string;
  /** Legal basis under GDPR Art. 6. */
  legalBasis?: string;
  /** Art. 9 special category data involved. */
  specialCategory?: boolean;
  /** Known categories are suggested; any string is accepted so custom taxonomies work. */
  dataSubjects?: Array<DataSubjectCategory | (string & {})>;
  dataCategories?: string[];
  retentionMonths?: number;
  processors?: string[];
  thirdCountryTransfers?: string[];
  automatedDecisionMaking?: boolean;
}

export type DataSubjectCategory =
  | 'customers'
  | 'prospects'
  | 'employees'
  | 'applicants'
  | 'contractors'
  | 'minors'
  | 'health'
  | 'other';

export interface SustainabilityMetrics {
  scope1TonnesCO2e?: number;
  scope2TonnesCO2e?: number;
  scope3TonnesCO2e?: number;
  energyMWh?: number;
  waterM3?: number;
  wasteTonnes?: number;
  renewableSharePct?: number;
  /** ESRS S1 own workforce headcount. */
  employeesFTE?: number;
  womenInLeadershipPct?: number;
  incidentsRecorded?: number;
  revenueEUR?: number;
  /** Assurance provider engaged (limited / reasonable). */
  assuranceLevel?: 'none' | 'limited' | 'reasonable';
  valueChainPolicies?: boolean;
}

export interface CompanyProfile {
  id: string;
  name: string;
  legalName?: string;
  country: string;
  sector: string;
  employees: number;
  revenueEUR: number;
  size: CompanySize;
  /** Which frameworks this company is in scope for. */
  frameworks?: FrameworkId[];
  aiSystems?: AISystemDescriptor[];
  processingActivities?: DataProcessingActivity[];
  hasDpo?: boolean;
  hasRopa?: boolean;
  hasDpia?: boolean;
  hasSecurityPolicies?: boolean;
  hasIncidentResponse?: boolean;
  hasConsentMechanism?: boolean;
  hostsDataInEu?: boolean;
  usesCookies?: boolean;
  sustainability?: SustainabilityMetrics;
  /** Free text used by the LLM document drafting. */
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Evidence & documents
// ---------------------------------------------------------------------------

export interface Evidence {
  id: string;
  companyId: string;
  frameworkId: FrameworkId;
  articleId: string;
  title: string;
  /** e.g. "policy", "contract", "log", "certificate", "screenshot" */
  type?: string;
  description?: string;
  url?: string;
  /** Arbitrary path/hash when self-hosted. */
  locator?: string;
  collectedAt?: string;
  validUntil?: string;
  verified?: boolean;
  /** Where the evidence came from. */
  source?: 'manual' | 'scanner' | 'generator';
}

export interface DocumentVersion {
  version: number;
  createdAt: string;
  createdBy?: string;
  changeLog?: string;
  /** Hash of the rendered payload, used for the changelog. */
  checksum?: string;
}

export interface GeneratedDocument {
  id: string;
  companyId: string;
  kind: DocumentKind;
  title: string;
  frameworkIds: FrameworkId[];
  format: 'pdf' | 'html' | 'docx' | 'md' | 'json';
  /** File path or URL of the artefact. */
  path?: string;
  html?: string;
  checksum?: string;
  versions?: DocumentVersion[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Gaps & scores
// ---------------------------------------------------------------------------

export interface Gap {
  id: string;
  frameworkId: string;
  articleId: string;
  severity: Severity;
  remediation: string;
  /** Estimated effort in person-days. */
  effort: number;
  deadline?: Date;
  fineExposure?: number;
  // --- optional enrichment ------------------------------------------------
  questionId?: string;
  title?: string;
  description?: string;
  status?: GapStatus;
  source?: GapSource;
  confidence?: number;
  /** Code locations that triggered the gap (scanner findings). */
  findings?: Finding[];
  citation?: string;
  /** ISO date, mirrors `deadline` but survives JSON round-trips. */
  deadlineIso?: string;
  phase?: RoadmapPhase;
  order?: number;
}

export interface ComplianceScore {
  frameworkId: string;
  score: number;
  gaps: Gap[];
  // --- optional enrichment ------------------------------------------------
  grade?: Grade;
  answered?: number;
  applicable?: number;
  total?: number;
  evidenceCoverage?: number;
  blockers?: number;
  updatedAt?: string;
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export type RoadmapPhase = 'quick-wins' | 'foundations' | 'hardening' | 'ongoing';

/** A dated remediation step in the 90-day plan. */
export interface RoadmapItem {
  id: string;
  title: string;
  description?: string;
  phase: RoadmapPhase;
  frameworkIds: FrameworkId[];
  articleIds: string[];
  gapIds: string[];
  severity: Severity;
  /** ISO date (YYYY-MM-DD). */
  startDate: string;
  /** ISO date (YYYY-MM-DD). */
  dueDate: string;
  /** Person-days. */
  effort: number;
  fineExposure?: number;
  citation?: string;
  done?: boolean;
  automated?: boolean;
}

export interface RoadmapPhaseSummary {
  phase: RoadmapPhase;
  label: string;
  window: string;
  startDate: string;
  endDate: string;
  items: RoadmapItem[];
  effort: number;
  riskReduction: number;
}

export interface Roadmap {
  companyId?: string;
  generatedAt: string;
  horizonDays: number;
  startDate: string;
  endDate: string;
  phases: RoadmapPhaseSummary[];
  items: RoadmapItem[];
  totalEffort: number;
  /** Fine exposure eliminated if everything is done. */
  totalFineExposure: number;
  /** Weighted score if all roadmap items are completed. */
  projectedScore?: number;
  quickWins: RoadmapItem[];
  disclaimer?: string;
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

export type FindingCategory =
  | 'pii-collection'
  | 'sensitive-data'
  | 'consent'
  | 'retention'
  | 'personal-data-logging'
  | 'ai-api-call'
  | 'data-transfer'
  | 'encryption'
  | 'access-control'
  | 'cookie-consent'
  | 'profiling'
  | 'biometric'
  | 'unstructured-storage';

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Finding {
  id: string;
  ruleId: string;
  category: FindingCategory;
  severity: FindingSeverity;
  message: string;
  file: string;
  line: number;
  column?: number;
  endLine?: number;
  /** The source line, truncated. */
  snippet?: string;
  /** Confidence of the detector, 0..1. */
  confidence: number;
  /** Which frameworks/articles this finding maps onto. */
  mappings: FrameworkArticleRef[];
  /** Symbol/function the finding lives in, when known. */
  symbol?: string;
  remediation?: string;
}

export interface FrameworkArticleRef {
  frameworkId: FrameworkId;
  articleId: string;
  /** Human readable reason for the mapping. */
  reason: string;
}

export interface DataFlowNode {
  id: string;
  label: string;
  file: string;
  line: number;
  kind: 'source' | 'transform' | 'sink' | 'store';
}

export interface DataFlowEdge {
  from: string;
  to: string;
  /** Personal data traverses this edge. */
  personalData?: boolean;
  crossesBorder?: boolean;
  label?: string;
}

export interface DataFlow {
  nodes: DataFlowNode[];
  edges: DataFlowEdge[];
}

export interface ScanOptions {
  root: string;
  include?: string[];
  exclude?: string[];
  languages?: Array<'typescript' | 'javascript' | 'python' | 'go'>;
  maxFileSizeBytes?: number;
  maxFiles?: number;
  /** Prefer the tree-sitter WASM grammars when they are installed. */
  useTreeSitter?: boolean;
  ruleset?: 'gdpr' | 'ai-act' | 'all';
  failOn?: FindingSeverity;
}

export interface ScanResult {
  root: string;
  startedAt: string;
  finishedAt: string;
  filesScanned: number;
  bytesScanned: number;
  languages: Record<string, number>;
  findings: Finding[];
  dataFlow: DataFlow;
  /** Derive compliance gaps from findings. */
  gaps: Gap[];
  /** Which parser backend actually ran. */
  parsers: Record<string, string>;
  truncated?: boolean;
  errors?: string[];
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  name?: string;
  companyId?: string;
  role?: 'owner' | 'admin' | 'member';
  createdAt: string;
  lastLoginAt?: string;
}

export interface Subscription {
  id: string;
  companyId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  seats: number;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
}

export interface Assessment {
  id: string;
  companyId: string;
  frameworkId: FrameworkId;
  answers: Answers;
  scores: ComplianceScore[];
  evidence: Evidence[];
  createdAt: string;
  updatedAt: string;
  completedBy?: string;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  details?: unknown;
}