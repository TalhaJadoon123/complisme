# CompliSME Specification

## Overview
**Project:** CompliSME — Multi-framework compliance for European SMEs  
**Vision:** One tool covering EU AI Act + CSRD/ESRS + GDPR + e-invoicing at €49/month or free self-hosted  
**Target:** 9-person companies without compliance departments  
**Differentiator:** Codebase scanner mapped to compliance articles + deterministic document generation + open regulatory content

---

## User Stories

### US-1: Company Onboarding
**As a** compliance officer at an SME  
**I want to** create a company profile with sector, size, country, and AI systems  
**So that** the tool knows which regulations apply and what questions to ask

**Acceptance Criteria:**
- [ ] `complisme init --demo` creates a realistic demo company
- [ ] `complisme init --name --country --sector --employees --revenue` creates custom profile
- [ ] Profile includes: name, legalName, country, sector, employees, revenueEUR, aiSystems[], processingActivities[]
- [ ] Applicability analysis runs automatically (which frameworks/articles apply)
- [ ] Fine exposure calculated per framework
- [ ] Profile stored in workspace (local `.complisme/` or global `~/.complisme/`)

### US-2: Questionnaire Completion
**As a** compliance officer  
**I want to** answer weighted questions per applicable article  
**So that** I get an explainable compliance score

**Acceptance Criteria:**
- [ ] 125 questions across 41 articles, weighted by regulatory criticality
- [ ] Answer values: `pass` (full weight), `fail` (0), `na` (excluded from denominator), `unknown` (penalized)
- [ ] `complisme answer framework.question=value` CLI and interactive mode
- [ ] Evidence can be linked to answers (`complisme evidence add`)
- [ ] Missing evidence reduces article score up to 10%
- [ ] `complisme status` shows per-framework score, grade, gaps, deadlines

### US-3: Codebase Scanning
**As a** developer/compliance officer  
**I want to** scan my codebase for compliance-relevant patterns  
**So that** I find obligations I cannot see manually

**Acceptance Criteria:**
- [ ] `complisme scan ./src` runs TS/JS AST, Python tokenizer, Go tokenizer
- [ ] 16 detection rules mapped to specific articles (e.g., `ai-act/pii-to-model` → AI Act Art. 10, GDPR Art. 5)
- [ ] Findings include: file, line, rule, severity, confidence, article mappings, remediation
- [ ] Scanner maps findings → compliance gaps automatically
- [ ] `complisme gap --scan ./src` merges scanner gaps with questionnaire gaps
- [ ] Path confinement: `SCAN_ROOT` enforced, symlinks refused, realpath re-check

### US-4: Gap Analysis & Roadmap
**As a** compliance officer  
**I want to** see prioritized gaps with remediation and a 90-day plan  
**So that** I know what to do and when

**Acceptance Criteria:**
- [ ] Gaps include: article, severity, remediation text, effort estimate, deadline, fine exposure
- [ ] `complisme gap` lists all gaps with filters (severity, framework, limit)
- [ ] `complisme roadmap --horizon 90` produces 3 phases (Immediate/Ongoing/Strategic)
- [ ] Phases sequenced by: statutory deadline → fine exposure → effort
- [ ] Capacity rebalancing: over-capacity phases spill into ongoing
- [ ] Gap status tracking: `open` → `in_progress` → `resolved` (via `complisme gap` or API)

### US-5: Document Generation
**As a** compliance officer  
**I want to** generate audit-ready documents  
**So that** I can submit to regulators or share with stakeholders

**Acceptance Criteria:**
- [ ] 13 document kinds: AI Act Annex IV, Risk Register, Conformity Declaration; GDPR ROPA, DPIA, DSR Response, TOM, Consent Notice, NDA/DPA; CSRD Report, ESRS Datapoint; E-invoice Validation Report; Compliance Roadmap
- [ ] Formats: PDF (Puppeteer, print-ready), DOCX (raw OOXML, editable), HTML (always available)
- [ ] `complisme generate --kind gdpr-ropa --format pdf --out ./out`
- [ ] Deterministic structure/tables/citations; narrative drafted by LLM if key provided
- [ ] Unprovided facts marked `TO BE COMPLETED` (never invented)
- [ ] Branding: company name, logo, custom CSS variables
- [ ] Version history with checksums (`complisme documents`)

### US-6: LLM-Assisted Drafting (BYOK)
**As a** compliance officer  
**I want to** use my own LLM key for gap analysis and narrative drafting  
**So that** I control cost, privacy, and model choice

**Acceptance Criteria:**
- [ ] Providers: OpenAI, Anthropic, Ollama (local)
- [ ] `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OLLAMA_BASE_URL` env vars
- [ ] Redaction: company identifiers stripped before prompt (`<company_context>` delimiters)
- [ ] Rate limited: `RATE_LIMIT_AI=20` per window
- [ ] Graceful degradation: works offline, UI shows degraded status
- [ ] `complisme gap --ai` enriches gaps with LLM analysis
- [ ] `complisme generate --ai` drafts narrative sections

### US-7: GitHub Integration
**As a** compliance officer  
**I want to** file gaps as GitHub issues  
**So that** my team can track remediation in our workflow

**Acceptance Criteria:**
- [ ] `complisme publish --repo owner/repo --dry-run` previews issues
- [ ] Idempotent: stable issue key per gap prevents duplicates
- [ ] `GITHUB_TOKEN` with `issues:write` scope
- [ ] API: `POST /api/v1/github/issues`, `GET /api/v1/github/status`
- [ ] CI workflow publishes on schedule/dispatch (`compliance-scan.yml`)

### US-8: API & Web Dashboard
**As a** team  
**We want** a REST API and web dashboard  
**So that** we can integrate and collaborate

**Acceptance Criteria:**
- [ ] API: 40 routes, auth gate, rate limiting, in-memory or Postgres
- [ ] Web: Next.js 15, marketing + onboarding + dashboard + documents + roadmap
- [ ] Docs: Next.js prerendered (12 pages), API reference, framework reference, scanner docs
- [ ] Desktop GUI: local HTTP server + SPA (no Electron/Tauri)

---

## Non-Functional Requirements

| ID | Requirement | Target | Verification |
|------|-------------|--------|--------------|
| NFR-1 | Cold start | < 5s | `/health` in CI |
| NFR-2 | Assessment latency | < 2s | 125 questions, in-memory |
| NFR-3 | Scan throughput | 10k files < 30s | `packages/scanner` benchmarks |
| NFR-4 | PDF generation | < 10s/doc | Puppeteer headless |
| NFR-5 | Memory (API) | < 512MB | Docker stats |
| NFR-6 | Test coverage (core) | ≥80% lines/functions | CI threshold |
| NFR-7 | Security audit | 0 reachable CVEs | `pnpm run audit` |
| NFR-7 | Auth gate | 24 private routes → 401 | `security:posture` sweep |
| NFR-8 | Tenant isolation | 0 cross-tenant leaks | `tenant-isolation.test.ts` |
| NFR-9 | Cold Docker build | < 5 min | CI `build-web` job |
| NFR-10 | Offline operation | Full functionality | No env vars required |

---

## Constraints & Assumptions

### Constraints
- **Self-hosted first:** No SaaS dependencies required
- **Single-tenant per user:** One company per account (isolation enforced)
- **No email/password reset:** Out of scope (self-hosted simplicity)
- **No OAuth/SSO:** Out of scope
- **Stripe optional:** Plan changes apply directly; webhook not implemented

### Assumptions
- User has Node.js ≥20.10 and pnpm ≥9
- Chromium available for PDF (system or Docker)
- PostgreSQL optional (in-memory fallback works)
- GitHub token with `issues:write` for publishing
- LLM keys optional (BYOK model)

---

## Out of Scope (Explicit)

- Multi-company per user
- Password reset / email verification
- OAuth / SSO / SAML
- Stripe webhook handler
- Scheduled re-assessment webhooks
- Signed desktop installer (Electron/Tauri)
- Multi-region deployment
- Real-time collaboration

---

*This specification reflects the implemented feature set at commit `HEAD`. It serves as the single source of truth for the `plan.md`, `tasks.md`, and `checklist.md` artifacts.*