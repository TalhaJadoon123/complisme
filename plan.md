# CompliSME Technical Plan

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Monorepo (pnpm)                          │
├─────────────────────────────────────────────────────────────────┤
│  shared  →  frameworks  →  core  →  {generator, scanner, llm}  │
│                                        ↓                        │
│                                   {cli, api}  →  {web, docs}    │
│                                        ↓                        │
│                                   desktop (on api)              │
└─────────────────────────────────────────────────────────────────┘
```

**Dependency Direction:** Strictly downward. No cycles. Each package exports only via `index.ts`.

---

## Data Model

### Core Entities

```typescript
// CompanyProfile (packages/shared/src/types.ts)
interface CompanyProfile {
  id: string;                    // UUID v4
  name: string;
  legalName?: string;
  country: string;               // ISO 3166-1 alpha-2
  sector: string;                // NACE code or free text
  employees: number;
  revenueEUR: number;
  size: 'micro' | 'small' | 'medium' | 'large';  // EU thresholds
  aiSystems: AISystem[];         // For AI Act applicability
  processingActivities: ProcessingActivity[];     // For GDPR ROPA
  createdAt: string;             // ISO 8601
  updatedAt: string;
}

// Answer (packages/shared/src/types.ts)
interface Answer {
  questionId: string;            // e.g., "gdpr.art-5-1-a"
  value: 'pass' | 'fail' | 'na' | 'unknown';
  evidenceIds?: string[];        // Linked evidence
  updatedAt: string;
}

// Gap (packages/shared/src/types.ts)
interface Gap {
  id: string;                    // Stable: makeGapId(articleId, questionId, source)
  articleId: string;
  questionId?: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  remediation: string;
  effort: 'xs' | 's' | 'm' | 'l' | 'xl';
  deadline?: string;             // ISO 8601 (statutory)
  fineExposureEUR?: number;
  status: 'open' | 'in_progress' | 'resolved';
  source: 'questionnaire' | 'scanner' | 'llm';
  confidence: number;            // 0-1
  createdAt: string;
  updatedAt: string;
}
```

### Framework Definitions (YAML)
Located in `packages/frameworks/definitions/`:
- `eu-ai-act.yaml` (16 articles, 43 questions)
- `gdpr.yaml` (10 articles, 32 questions)
- `csrd.yaml` (8 articles, 29 questions)
- `e-invoicing.yaml` (7 articles, 21 questions)

Each article contains: legal reference, ISO deadline, fine exposure EUR, evidence list, questions with weights/remediation/effort.

---

## Interface Contracts

### CLI (`packages/cli/src/index.ts`)
| Command | Input | Output |
|---------|-------|--------|
| `init` | `--name, --country, --sector, --employees, --revenue, --demo` | Workspace + profile |
| `answer` | `framework.question=value` or interactive | Updated answers |
| `status` | `--limit` | Scores, gaps, deadlines |
| `gap` | `--scan, --ai, --severity, --framework, --limit` | Gap list |
| `roadmap` | `--horizon, --capacity, --write` | 3-phase plan |
| `scan` | `<path>, --ruleset, --gaps, --fail-on, --write` | Findings + gaps |
| `generate` | `--kind, --format, --ai, --scan, --out` | PDF/DOCX/HTML |
| `evidence` | `add/list, --framework, --article, --title, --type, --note` | Evidence library |
| `documents` | `--json` | Version history |
| `publish` | `--repo, --title-prefix, --limit, --scan, --dry-run` | GitHub issues |
| `status-all` | — | Environment summary |

### API (`packages/api/src/server.ts`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | Liveness, capabilities, frameworks |
| POST | `/api/v1/auth/signup` | — | Create account + company |
| POST | `/api/v1/auth/login` | — | Exchange credentials for token |
| GET | `/api/v1/auth/me` | ✓ | User, company, subscription |
| GET | `/api/v1/frameworks` | — | Summaries (`?full=true`) |
| POST | `/api/v1/assess` | ✓ | Run engine, persist scores/gaps |
| POST | `/api/v1/assess/preview` | — | Score without persisting |
| GET | `/api/v1/companies/:id/status` | ✓ | Scores, gaps, deadlines |
| GET | `/api/v1/companies/:id/roadmap` | ✓ | Phased plan (`?horizon=90`) |
| POST | `/api/v1/generate` | ✓ | Produce document |
| POST | `/api/v1/scan` | ✓ | Scan path, findings + gaps |
| POST | `/api/v1/github/issues` | ✓ | Publish gaps as issues |
| GET | `/api/v1/github/status` | ✓ | GitHub config status |

**Auth:** `Authorization: Bearer <token>` or static key (`API_STATIC_KEYS` + `x-company-id`)

### Document Kinds (13)
| Kind | Framework | Output |
|------|-----------|--------|
| `ai-act-annex-iv` | EU AI Act | Technical documentation |
| `ai-act-risk-register` | EU AI Act | Risk register |
| `ai-act-conformity-declaration` | EU AI Act | Conformity declaration |
| `gdpr-ropa` | GDPR | ROPA |
| `gdpr-dpia` | GDPR | DPIA |
| `gdpr-dsr-response` | GDPR | DSR response |
| `gdpr-tom` | GDPR | Technical & organizational measures |
| `consent-notice` | GDPR | Consent notice |
| `nda-dpa` | GDPR | NDA/DPA |
| `csrd-report` | CSRD | Sustainability report |
| `esrs-datapoint` | CSRD/ESRS | Datapoint mapping |
| `einvoice-validation-report` | E-invoicing | Validation report |
| `compliance-roadmap` | All | 90-day plan |

---

## Package Responsibilities

| Package | Responsibility | Key Exports |
|---------|---------------|-------------|
| `shared` | Domain types, Zod schemas, scoring semantics, markdown renderer, utils | Types, schemas, `makeGapId`, `round`, `nowIso`, `redact` |
| `frameworks` | YAML loader, applicability, penalty model, deadline/fine calculations | `listFrameworks`, `getFramework`, `applicableFrameworks`, `frameworkStats` |
| `core` | ComplianceEngine: assess, gapAnalyze, scoring, roadmap, fixtures | `ComplianceEngine`, `normaliseProfile`, `gradeOf` |
| `generator` | 13 templates, HTML shell, Puppeteer PDF, OOXML DOCX writer | `DocumentGenerator`, `pdfAvailable`, `renderHtml`, `renderPdf`, `renderDocx` |
| `scanner` | TS/JS AST, Python/Go tokenizers, 16 rules, GitHub publishing | `CodeScanner`, `findingsToIssues`, `gapToIssue`, `publishIssues` |
| `llm` | BYOK providers (OpenAI/Anthropic/Ollama), prompts, redaction | `LlmClient`, `llmStatus`, `buildGapAnalysisPrompt`, `buildDocumentPrompt` |
| `cli` | Command definitions, workspace management, output rendering | `buildProgram`, `workspaceFor`, `launch` |
| `api` | Fastify server, auth, repository, seed, all routes | `buildServer`, `createRepository`, `MemoryRepository`, `PostgresRepository` |
| `desktop` | Local HTTP server + SPA (no Electron) | `launch`, `startDesktop` |
| `web` | Next.js: marketing, onboarding, dashboard, documents, roadmap | — |
| `docs` | Next.js docs site (markdown from `packages/docs/content`) | — |

---

## Security Architecture

### Auth Gate (`packages/api/src/server.ts:256`)
```typescript
// Single global gate in onRequest hook
if (!openAccess && !isPublicRoute(request.method, request.url)) {
  if (!request.auth.apiKey && !request.auth.user) {
    return reply.code(401).send({ error: 'unauthorized', ... });
  }
}
```

### Tenant Isolation (`packages/api/src/server.ts:239`)
```typescript
function authoriseCompany(request, explicit?) {
  if (request.auth.apiKey) return explicit ?? header;  // Integration key: explicit
  const own = request.auth.companyId ?? request.auth.user?.companyId;
  if (own) return own;                                 // Session user: pinned
  if (openAccess) return explicit ?? header;           // Dev only
  return undefined;
}
```

### Rate Limiting (`packages/api/src/server.ts:195`)
```typescript
function budget(max, fallback, window = '1 minute') {
  return { rateLimit: { max: Number(max ?? fallback), timeWindow: window } };
}
// Applied per route: RATE_LIMIT_AI, _SCAN, _GENERATE, _PUBLISH, _PREVIEW
```

---

## Database Schema (Drizzle ORM)

| Table | Key Columns | Tenant Isolation |
|-------|-------------|------------------|
| `companies` | `id`, `name`, `country`, `sector`, `employees`, `revenue_eur`, `size`, `created_at` | `user_id` FK |
| `users` | `id`, `email`, `password_hash`, `company_id` | `company_id` FK |
| `assessments` | `id`, `company_id`, `overall`, `grade`, `scores_json`, `created_at` | `company_id` FK |
| `gaps` | `id`, `company_id`, `article_id`, `severity`, `title`, `remediation`, `status` | `company_id` FK |
| `evidence` | `id`, `company_id`, `framework_id`, `article_id`, `title`, `type`, `note` | `company_id` FK |
| `documents` | `id`, `company_id`, `kind`, `format`, `checksum`, `version`, `created_at` | `company_id` FK |
| `api_keys` | `id`, `key_hash`, `company_id`, `name`, `created_at` | `company_id` FK |
| `subscriptions` | `company_id`, `plan`, `status`, `current_period_end` | `company_id` PK |

**Repository Pattern:** `MemoryRepository` (default) ↔ `PostgresRepository` (when `DATABASE_URL` set). Interface in `packages/api/src/db/index.ts`.

---

## Infrastructure

### Docker Compose (5 Services)
| Service | Image | Ports | Healthcheck |
|---------|-------|-------|-------------|
| `postgres` | `postgres:16-alpine` | 5432 | `pg_isready` |
| `api` | Multi-stage (target: api) | 4000 | `fetch /health` |
| `web` | Multi-stage (target: web) | 3000 | Next.js ready |
| `docs` | Multi-stage (target: docs) | 3001 | Next.js ready |
| `documents` | Volume | — | — |

**API Image:** Non-root (`USER node`), Chromium via apt, dumb-init entrypoint, `HEALTHCHECK` on `/health`.

### CI/CD (GitHub Actions)
| Workflow | Trigger | Key Gates |
|----------|---------|-----------|
| `ci.yml` | push/PR to main | secret scan, audit, typecheck, tests, coverage, build, security posture, E2E |
| `compliance-scan.yml` | push, schedule (Mon 06:00), dispatch | build scanner, scan repo, upload findings, publish issues (idempotent) |
| `release.yml` | tag `v*`, dispatch | secret scan, typecheck, audit, tests, build, security posture, smoke test (PDF/DOCX) |

---

## Research Decisions (Constitution Check)

| Decision | Rationale | Constitution Alignment |
|----------|-----------|------------------------|
| In-memory default DB | Zero-config for single-user; Postgres optional | Honest Degradation |
| BYOK LLM (no default) | User controls cost/privacy; no vendor lock-in | Privacy First |
| Raw OOXML DOCX | No heavy deps; editable output | Deterministic Documents |
| Puppeteer + system Chromium | No binary download in CI; reliable PDF | Honest Degradation |
| Global auth gate | Single point of failure prevention | Multi-Tenant Isolation |
| `pnpm.overrides` for security | Proactive CVE mitigation | Security Requirements |
| Custom secret scanner | No external binary; runs in CI | Secrets Management |

---

## Open Questions / Future Work

1. **Multi-company per user** — Requires session redesign, UI changes
2. **Stripe webhook** — Subscription sync for SaaS mode
3. **OAuth/SSO** — Enterprise requirement
4. **Signed desktop installer** — Electron/Tauri build pipeline
5. **Scheduled re-assessment** — Cron + notification system
5. **Real-time collaboration** — WebSockets + conflict resolution
6. **OpenAPI spec generation** — From Zod schemas
7. **Plugin system** — Custom frameworks/rules/document kinds

---

*This plan reflects the implemented architecture at commit `HEAD`. It is derived from the specification (`spec.md`) and verified against the constitution (`constitution.md`).*