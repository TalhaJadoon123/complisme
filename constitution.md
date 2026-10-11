# CompliSME Constitution

## Project Principles

### 1. Privacy First
- **No data leaves the machine** unless explicitly configured (BYOK LLM, GitHub publishing, Stripe billing).
- Codebase scanning is local-only; findings are never uploaded without explicit user action.
- All identifiers are redacted before any LLM prompt is built.

### 2. Honest Degradation
- Features degrade gracefully when optional dependencies are missing.
- No LLM key → gap analysis and drafting disabled; rules-based compliance still works.
- No Chromium → PDF generation falls back to HTML/DOCX with clear messaging.
- No database → in-memory store works for single-user installs.

### 3. Open Regulatory Content
- Framework definitions (`packages/frameworks/definitions/*.yaml`) are the single source of truth.
- Corrections are a pull request away, not a vendor roadmap item.
- YAML is validated against Zod schemas at load time.

### 4. Multi-Tenant Isolation by Default
- A signed-in user is pinned to their own company; foreign `companyId` in path/query/body/header is ignored.
- Integration keys are server-wide and must explicitly name the tenant via `x-company-id`.
- Global auth gate rejects anonymous callers on closed deployments.

### 5. Deterministic Document Generation
- Structure, tables, citations are deterministic; narrative is drafted by user's LLM key.
- Unprovided facts are marked `TO BE COMPLETED` rather than invented.
- PDF via Puppeteer (print-ready), DOCX via raw OOXML (editable), HTML always available.

### 6. SME-Centric Pricing & Scope
- €49/month or free self-hosted; no per-seat pricing.
- Covers 4 frameworks (EU AI Act, CSRD/ESRS, GDPR, e-invoicing) in one tool.
- Written for 9-person companies, not compliance departments.

---

## Technology Standards

| Layer | Standard | Version Pinning |
|-------|----------|-----------------|
| Runtime | Node.js | ≥20.10 (tested on 22) |
| Package Manager | pnpm | 9.15.9 (enforced via `packageManager`) |
| Language | TypeScript | 5.6.3, strict mode, project references |
| Test Framework | Vitest | 4.1.11 with v8 coverage |
| API Framework | Fastify | Latest stable |
| Frontend | Next.js | 15 (App Router) |
| Database | Drizzle ORM + PostgreSQL | Optional (in-memory fallback) |
| PDF Generation | Puppeteer + Chromium | System Chromium in Docker |
| Validation | Zod | All external boundaries |

### Dependency Management
- `pnpm.overrides` for 7 security-critical packages (vite, vitest, postcss, postcss-selector-parser, esbuild, drizzle-orm, basic-ftp)
- `pnpm install --frozen-lockfile --ignore-scripts` in CI
- Dependency audit classifies reachability: **0 reachable CVEs** required for release

### Build & Type Safety
- `tsc -b` with project references for incremental builds
- Strict mode: `strict: true`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`
- Type check runs in CI before tests

---

## Security Requirements

### Authentication & Authorization
- **Global auth gate** in Fastify `onRequest` hook — rejects anonymous on closed deployments
- JWT tokens (HMAC-SHA256) with 32-byte `AUTH_SECRET` (required in production)
- Passwords: Argon2id via `@node-rs/argon2` with per-user salts
- API keys: SHA-256 hashed at rest, constant-time comparison
- CORS restricted to `API_CORS_ORIGIN` (comma-separated)

### Tenant Isolation
- Session users **pinned to own company** — foreign `companyId` ignored in path/query/body/header
- Integration keys: server-wide, must specify `x-company-id`
- Regression tests enforce: distinct signup IDs, foreign ID ignored in path/query/body/header

### Input Validation
- All external boundaries validated with Zod schemas
- Path traversal protection: `resolveWithin()` + realpath re-check (`packages/scanner/src/path-safety.ts`)
- LLM prompt injection protection: `<company_context>` delimiters
- Prompt length limit: 4000 chars

### Secrets Management
- `.env` gitignored; `.env.example` with placeholders only
- Custom secret scanner (`scripts/scan-secrets.js`) runs in CI (staged + `--all`)
- No hardcoded credentials in source, tests, or history

### Rate Limiting
- Global budget: `RATE_LIMIT_MAX=300` / `RATE_LIMIT_WINDOW=1 minute`
- Per-route budgets: AI (20), Scan (10), Generate (15), Publish (10), Preview (20)

---

## Performance Expectations

| Metric | Target | Measurement |
|--------|--------|-------------|
| API cold start | < 5s | `/health` endpoint |
| Assessment (125 questions) | < 2s | In-memory engine |
| Codebase scan (10k files) | < 30s | TS AST + tokenizers |
| PDF generation (13 doc types) | < 10s | Puppeteer headless |
| E2E test suite | < 60s | 57 assertions |
| CI pipeline | < 30 min | Full verify + build-web |

### Coverage Thresholds (Enforced in CI)
| Package | Lines | Functions | Branches | Statements |
|---------|-------|-----------|----------|------------|
| `core` | ≥80% | ≥80% | ≥70% | ≥80% |
| Global | ≥55% | — | — | — |

---

## Coding Conventions

### TypeScript
- Prefer `type` over `interface` for domain types
- Zod schemas as source of truth; infer types via `z.infer<typeof schema>`
- No `any` in core packages; `unknown` with narrowing preferred
- Explicit return types on public APIs

### Error Handling
- Structured error shape: `{ error, message, statusCode, details? }`
- No stack traces in production responses
- Errors logged with correlation IDs (request ID)

### Testing
- Unit tests per package in `packages/*/tests/`
- Integration tests via Fastify `inject()` (no network)
- E2E tests against live server (`packages/api/scripts/e2e.mjs`)
- Property-based testing for scoring internals

### Documentation
- Public APIs documented via JSDoc
- README as single source of truth for operators
- Per-package `README.md` for internal APIs (optional)

---

## Compliance Needs

### Regulatory Scope
| Framework | Regulation | Articles | Questions |
|-----------|------------|----------|-----------|
| EU AI Act | Regulation (EU) 2024/1689 | 16 | 43 |
| GDPR | Regulation (EU) 2016/679 | 10 | 32 |
| CSRD/ESRS | Directive (EU) 2022/2464 | 8 | 29 |
| E-invoicing | ViDA + NF-e/NFS-e | 7 | 21 |

### Data Handling
- Codebase read locally, never uploaded
- Company data pseudonymized; direct identifiers stripped before LLM prompts
- Evidence stored locally; user controls retention

### Audit Readiness
- Evidence library linked to framework articles
- Versioned document history with checksums
- 90-day roadmap sequenced by statutory deadline → fine exposure → effort

---

## Governance

### Release Process
- Version tags (`v*`) trigger release workflow
- Release runs: typecheck, security audit, tests, build, security posture, smoke test (PDF/DOCX)
- Assets: PDF + DOCX uploaded to GitHub Release

### Compliance Scanning
- Weekly scheduled scan of own repository
- Idempotent GitHub issue publishing (stable issue keys)
- Manual dispatch for on-demand scans

### Dependency Policy
- Security audit must report 0 reachable CVEs
- Overrides for unpatchable dev-only tooling acceptable
- Post-install scripts disabled in CI (`--ignore-scripts`)

---

*This constitution reflects the architecture and principles as implemented in the codebase at commit `HEAD`. Amendments require updating this document and verifying alignment with code.*