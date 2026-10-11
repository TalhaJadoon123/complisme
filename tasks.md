# CompliSME Tasks

## Task Format
Each task maps to a user story (US-*) from `spec.md` and includes:
- **ID**: Unique task identifier
- **User Story**: Reference to `spec.md`
- **Description**: What to implement
- **Dependencies**: Tasks that must complete first
- **Testable Outcome**: How to verify completion (CLI command, test, etc.)
- **Files**: Primary files to create/modify
- **Status**: `pending` | `in-progress` | `done` | `blocked`

---

## US-1: Company Onboarding

| ID | Description | Dependencies | Testable Outcome | Files | Status |
|----|-------------|--------------|------------------|-------|--------|
| T-1.1 | Workspace management (local/global) | — | `complisme init --demo` creates `.complisme/` with profile | `packages/cli/src/workspace.ts`, `packages/cli/src/commands/init.ts` | done |
| T-1.2 | Profile schema validation (Zod) | T-1.1 | Invalid profile rejected with clear errors | `packages/shared/src/schemas.ts`, `packages/shared/src/types.ts` | done |
| T-1.3 | Applicability analysis engine | T-1.2 | `complisme status` shows which frameworks/articles apply | `packages/frameworks/src/index.ts`, `packages/core/src/engine.ts` | done |
| T-1.4 | Fine exposure calculation | T-1.3 | `complisme status` shows € exposure per framework | `packages/frameworks/src/index.ts`, `packages/core/src/engine.ts` | done |
| T-1.5 | CLI `init` command (interactive + flags) | T-1.1 | `complisme init --name Acme --country DE --sector tech --employees 50 --revenue 5000000` works | `packages/cli/src/commands/init.ts`, `packages/cli/src/prompts.ts` | done |
| T-1.6 | Demo profile generator | T-1.1 | `complisme init --demo` creates realistic test company | `packages/cli/src/commands/init.ts` | done |
| T-1.7 | Global workspace (`~/.complisme`) support | T-1.1 | `complisme --global init` uses home directory | `packages/cli/src/workspace.ts` | done |

---

## US-2: Questionnaire Completion

| ID | Description | Dependencies | Testable Outcome | Files | Status |
|----|-------------|--------------|------------------|-------|--------|
| T-2.1 | Question registry (125 questions, 41 articles) | T-1.3 | `complisme frameworks --json` shows all questions | `packages/frameworks/src/definitions/*.yaml`, `packages/frameworks/src/index.ts` | done |
| T-2.2 | Answer parsing & validation | T-2.1 | `complisme answer gdpr.art-5-1-a=pass` accepted; invalid rejected | `packages/cli/src/commands/answer.ts`, `packages/shared/src/schemas.ts` | done |
| T-2.3 | Interactive answer mode | T-2.2 | `complisme answer --interactive` prompts per framework | `packages/cli/src/commands/answer.ts`, `packages/cli/src/prompts.ts` | done |
| T-2.4 | Answer persistence (workspace JSON) | T-2.2 | Answers survive restart; `complisme status` reflects them | `packages/cli/src/workspace.ts`, `packages/cli/src/commands/answer.ts` | done |
| T-2.5 | Evidence linking to answers | T-2.4 | `complisme evidence add --framework gdpr --article art-5-1-a --title "Privacy Policy"` | `packages/cli/src/commands/evidence.ts`, `packages/cli/src/workspace.ts` | done |
| T-2.6 | Scoring engine (weights, penalties, grades) | T-2.1 | `complisme status` shows per-framework score, grade, gaps | `packages/core/src/engine.ts`, `packages/core/src/semantics.ts` | done |
| T-2.7 | Evidence penalty (up to 10% per article) | T-2.5, T-2.6 | Missing evidence reduces article score | `packages/core/src/engine.ts`, `packages/core/src/semantics.ts` | done |
| T-2.8 | CLI `status` command | T-2.6 | `complisme status --limit 10` shows top gaps, deadlines | `packages/cli/src/commands/status.ts`, `packages/cli/src/output.ts` | done |

---

## US-3: Codebase Scanning

| ID | Description | Dependencies | Testable Outcome | Files | Status |
|----|-------------|--------------|------------------|-------|--------|
| T-3.1 | TypeScript AST parser (TS compiler API) | — | `complisme scan ./src` finds TS/JS patterns | `packages/scanner/src/parser.ts`, `packages/scanner/src/scanner.ts` | done |
| T-3.2 | Python tokenizer (regex-based) | — | `complisme scan ./src` finds Python patterns | `packages/scanner/src/parser.ts` | done |
| T-3.3 | Go tokenizer (regex-based) | — | `complisme scan ./src` finds Go patterns | `packages/scanner/src/parser.ts` | done |
| T-3.4 | Tree-sitter optional WASM support | T-3.1 | `TREE_SITTER_WASM_DIR` enables advanced parsing | `packages/scanner/src/parser.ts` | done |
| T-3.5 | 16 detection rules + article mappings | T-3.1 | `complisme scan ./src` outputs findings with article refs | `packages/scanner/src/rules.ts`, `packages/scanner/src/scanner.ts` | done |
| T-3.6 | Findings → gaps mapping | T-3.5, T-2.1 | `complisme gap --scan ./src` merges scanner gaps | `packages/scanner/src/scanner.ts`, `packages/core/src/engine.ts` | done |
| T-3.7 | Path confinement (`SCAN_ROOT`) | — | `complisme scan /etc` refused; symlinks refused | `packages/scanner/src/path-safety.ts`, `packages/scanner/src/scanner.ts` | done |
| T-3.8 | CLI `scan` command (flags, fail-on) | T-3.1 | `complisme scan ./src --fail-on critical --write scan.json` exits 1 on critical | `packages/cli/src/commands/scan.ts` | done |
| T-3.9 | Scanner `scan-repo.js` script (CI) | T-3.1 | `node packages/scanner/scripts/scan-repo.js . scan.json` produces JSON | `packages/scanner/scripts/scan-repo.js` | done |
| T-3.10 | Gap deduplication (scanner vs questionnaire) | T-3.6, T-2.6 | Same gap from scanner + questionnaire merged | `packages/core/src/engine.ts` (gap merging) | done |

---

## US-4: Gap Analysis & Roadmap

| ID | Description | Dependencies | Testable Outcome | Files | Status |
|----|-------------|--------------|------------------|-------|--------|
| T-4.1 | Gap data structure (stable IDs) | T-2.1 | `makeGapId()` produces deterministic IDs | `packages/shared/src/utils.ts` | done |
| T-4.2 | Gap analysis engine (merge sources) | T-3.6, T-2.6 | `complisme gap` shows merged, deduplicated gaps | `packages/core/src/engine.ts` | done |
| T-4.3 | Gap status tracking (open/in_progress/resolved) | T-4.1 | `complisme gap` shows status; `complisme gap --status in_progress` filters | `packages/cli/src/commands/gap.ts`, `packages/cli/src/workspace.ts` | done |
| T-4.4 | Roadmap engine (3 phases, deadline → exposure → effort) | T-4.1 | `complisme roadmap --horizon 90` produces 3 phases | `packages/core/src/engine.ts` | done |
| T-4.5 | Capacity rebalancing (spill over-capacity) | T-4.4 | Over-capacity phase spills to ongoing | `packages/core/src/engine.ts` | done |
| T-4.6 | CLI `gap` command (filters, AI enrichment) | T-4.2 | `complisme gap --severity high --framework gdpr --ai` works | `packages/cli/src/commands/gap.ts` | done |
| T-4.7 | CLI `roadmap` command (write to file) | T-4.4 | `complisme roadmap --write roadmap.md` outputs markdown | `packages/cli/src/commands/roadmap.ts`, `packages/cli/src/output.ts` | done |
| T-4.8 | Gap status API (PATCH /api/v1/gaps/:id) | T-4.3 | `curl -X PATCH /api/v1/gaps/:id -d '{"status":"resolved"}'` works | `packages/api/src/server.ts` | done |
| T-4.9 | Roadmap API (GET /api/v1/companies/:id/roadmap) | T-4.4 | `curl /api/v1/companies/:id/roadmap?horizon=90` returns phases | `packages/api/src/server.ts` | done |

---

## US-5: Document Generation

| ID | Description | Dependencies | Testable Outcome | Files | Status |
|----|-------------|--------------|------------------|-------|--------|
| T-5.1 | HTML shell + section rendering | T-2.1 | `complisme generate --kind gdpr-ropa --format html` outputs valid HTML | `packages/generator/src/index.ts`, `packages/generator/src/render.ts` | done |
| T-5.2 | PDF generation (Puppeteer) | T-5.1 | `complisme generate --kind gdpr-ropa --format pdf --out out.pdf` produces valid PDF | `packages/generator/src/pdf-generator.ts` | done |
| T-5.3 | DOCX generation (raw OOXML via JSZip) | T-5.1 | `complisme generate --kind gdpr-ropa --format docx --out out.docx` opens in Word | `packages/generator/src/docx-generator.ts` | done |
| T-5.4 | 13 document kind templates | T-5.1 | All 13 `--kind` values produce valid output | `packages/generator/src/templates/*.ts` | done |
| T-5.4 | Branding (logo, CSS variables, company name) | T-5.1 | `complisme generate --kind gdpr-ropa --format pdf` includes branding | `packages/generator/src/templates/*.ts`, `packages/generator/src/branding.ts` | done |
| T-5.5 | `TO BE COMPLETED` markers for missing facts | T-5.1 | Unprovided facts show placeholder in output | `packages/generator/src/templates/*.ts` | done |
| T-5.6 | Version history + checksums | T-5.1 | `complisme documents --json` shows versioned library | `packages/cli/src/commands/documents.ts`, `packages/cli/src/workspace.ts` | done |
| T-5.7 | CLI `generate` command (all flags) | T-5.1 | `complisme generate --kind gdpr-ropa --format pdf --ai --out ./out` works | `packages/cli/src/commands/generate.ts` | done |
| T-5.8 | PDF availability detection | T-5.2 | `pnpm run status-all` shows "PDF rendering: available/unavailable" | `packages/generator/src/pdf-generator.ts`, `packages/cli/src/commands/status-all.ts` | done |
| T-5.9 | Document API (POST /api/v1/generate, GET /api/v1/documents) | T-5.1 | `curl -X POST /api/v1/generate -d '{"kind":"gdpr-ropa","format":"pdf"}'` returns file | `packages/api/src/server.ts` | done |

---

## US-6: LLM-Assisted Drafting (BYOK)

| ID | Description | Dependencies | Testable Outcome | Files | Status |
|----|-------------|--------------|------------------|-------|--------|
| T-6.1 | OpenAI provider (chat completions) | — | `OPENAI_API_KEY` enables AI features | `packages/llm/src/provider.ts`, `packages/llm/src/client.ts` | done |
| T-6.2 | Anthropic provider (messages API) | T-6.1 | `ANTHROPIC_API_KEY` enables AI features | `packages/llm/src/provider.ts` | done |
| T-6.3 | Ollama provider (local) | T-6.1 | `OLLAMA_BASE_URL` enables local models | `packages/llm/src/provider.ts` | done |
| T-6.4 | Provider auto-detection + override | T-6.1 | `LLM_PROVIDER=openai` forces provider | `packages/llm/src/client.ts` | done |
| T-6.5 | Redaction of identifiers before prompt | T-6.1 | `<company_context>` delimiters wrap profile data | `packages/llm/src/redact.ts`, `packages/api/src/server.ts:1070` | done |
| T-6.5 | Gap analysis prompt + parsing | T-6.1 | `complisme gap --ai` adds LLM remediation | `packages/llm/src/prompts/gap-analysis.ts`, `packages/cli/src/commands/gap.ts` | done |
| T-6.6 | Document drafting prompt + parsing | T-6.1, T-5.1 | `complisme generate --ai` drafts narrative | `packages/llm/src/prompts/document-draft.ts`, `packages/cli/src/commands/generate.ts` | done |
| T-6.7 | Rate limiting (RATE_LIMIT_AI=20) | T-6.1 | `pnpm run security:posture` shows AI rate limit works | `packages/api/src/server.ts:198` | done |
| T-6.8 | Graceful degradation (no key = offline) | T-6.1 | `pnpm run security:posture:prod` shows AI degraded | `packages/llm/src/client.ts`, `packages/api/src/server.ts:1068` | done |
| T-6.9 | Token/cost tracking (NEW) | T-6.1 | **P1**: Track tokens/cost per request | `packages/llm/src/telemetry.ts` (new) | pending |

---

## US-7: GitHub Integration

| ID | Description | Dependencies | Testable Outcome | Files | Status |
|----|-------------|--------------|------------------|-------|--------|
| T-7.1 | GitHub issue mapping (gap → issue) | T-4.1 | `gapToIssue()` creates issue with stable key | `packages/scanner/src/github.ts` | done |
| T-7.2 | Idempotent publishing (stable issue keys) | T-7.1 | Re-running `publish` updates existing issues | `packages/scanner/src/github.ts` | done |
| T-7.3 | CLI `publish` command | T-7.1 | `complisme publish --repo owner/repo --dry-run` previews | `packages/cli/src/commands/publish.ts` | done |
| T-7.4 | API `POST /api/v1/github/issues` | T-7.1 | `curl -X POST /api/v1/github/issues -d '{"scan":true}'` creates issues | `packages/api/src/server.ts` | done |
| T-7.5 | API `GET /api/v1/github/status` | T-7.1 | `curl /api/v1/github/status` shows config | `packages/api/src/server.ts` | done |
| T-7.6 | CI workflow publishes on schedule/dispatch | T-7.4 | `compliance-scan.yml` runs `publish-findings.js` | `.github/workflows/compliance-scan.yml` | done |

---

## US-8: API & Web Dashboard

| ID | Description | Dependencies | Testable Outcome | Files | Status |
|----|-------------|--------------|------------------|-------|--------|
| T-8.1 | Fastify server + auth gate | — | `pnpm run security:posture` passes (24 private → 401) | `packages/api/src/server.ts` | done |
| T-8.2 | In-memory repository (default) | T-8.1 | API works without PostgreSQL | `packages/api/src/db/index.ts` | done |
| T-8.3 | Postgres repository (Drizzle) | T-8.2 | `DATABASE_URL` enables persistence | `packages/api/src/db/index.ts` | done |
| T-8.4 | All 40 API routes implemented | T-8.1 | `pnpm test:e2e` passes 57/57 | `packages/api/src/server.ts` | done |
| T-8.5 | Rate limiting (global + 5 per-route) | T-8.1 | `security:posture:prod` shows limits enforced | `packages/api/src/server.ts:195` | done |
| T-8.6 | Security headers (HSTS, CSP, nosniff) | T-8.1 | `security:posture:prod` checks headers | `packages/api/src/server.ts:423` | done |
| T-8.7 | Next.js web app (marketing, onboarding, dashboard) | T-8.1 | `pnpm dev:web` serves on :3000 | `packages/web/` | done |
| T-8.8 | Next.js docs site (12 prerendered pages) | T-8.1 | `pnpm dev:docs` serves on :3001 | `packages/docs/` | done |
| T-8.9 | Desktop GUI (local HTTP + SPA) | T-8.1 | `pnpm desktop` opens browser on :4317 | `packages/desktop/` | done |
| T-8.10 | Seed script (demo company) | T-8.2 | `pnpm run seed` creates demo@complisme.eu / Demo12345 | `packages/api/scripts/seed.ts` | done |

---

## Cross-Cutting / Infrastructure

| ID | Description | Dependencies | Testable Outcome | Files | Status |
|----|-------------|--------------|------------------|-------|--------|
| T-INFRA-1 | pnpm workspace + project references | — | `pnpm run build` compiles all 12 packages | `pnpm-workspace.yaml`, `tsconfig.base.json` | done |
| T-INFRA-2 | TypeScript strict config + project refs | T-INFRA-1 | `pnpm run typecheck` passes (0 errors) | `tsconfig.base.json`, `packages/*/tsconfig.json` | done |
| T-INFRA-3 | Vitest config + coverage thresholds | T-INFRA-2 | `pnpm test` 311 pass; core ≥80% | `vitest.config.ts` | done |
| T-INFRA-4 | Docker multi-stage (7 targets) | — | `docker compose up -d` brings up stack | `Dockerfile`, `docker-compose.yml` | done |
| T-INFRA-5 | CI workflow (ci.yml) | T-INFRA-3 | GitHub Actions green on push | `.github/workflows/ci.yml` | done |
| T-INFRA-6 | Compliance scan workflow | T-3.9 | Weekly scan + GitHub issue publishing | `.github/workflows/compliance-scan.yml` | done |
| T-INFRA-7 | Release workflow (tagged) | T-INFRA-5 | `release.yml` builds + smoke tests PDF/DOCX | `.github/workflows/release.yml` | done |
| T-INFRA-8 | Secret scanner (CI + local) | — | `pnpm run scan:secrets` clean | `scripts/scan-secrets.js` | done |
| T-INFRA-9 | Dependency audit (reachability) | — | `pnpm run audit` → 0 reachable | `scripts/report-advisories.js` | done |
| T-INFRA-10 | Security posture scripts (3 gates) | T-8.1 | `pnpm run security:posture` passes | `packages/api/scripts/*.js` | done |
| T-INFRA-11 | Spec Kit artifacts (NEW) | — | `constitution.md`, `spec.md`, `plan.md`, `tasks.md`, `checklist.md` | Root | done (this session) |

---

## Summary
| Category | Total | Done | Pending |
|----------|-------|------|---------|
| US-1 Onboarding | 7 | 7 | 0 |
| US-2 Questionnaire | 8 | 8 | 0 |
| US-3 Scanning | 10 | 10 | 0 |
| US-4 Gap/Roadmap | 9 | 9 | 0 |
| US-5 Documents | 9 | 9 | 0 |
| US-6 LLM/AI | 9 | 8 | 1 (T-6.9) |
| US-7 GitHub | 6 | 6 | 0 |
| US-8 API/Web | 10 | 10 | 0 |
| Infrastructure | 11 | 11 | 0 |
| **Total** | **80** | **79** | **1** |

**P1 Pending:** T-6.9 (Token/cost tracking for LLM) — tracked in improvement plan as P1.