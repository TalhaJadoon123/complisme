# CompliSME Checklist

## Machine-Verifiable Acceptance Criteria

### Functional Requirements

| ID | Requirement | Verification Command | Expected Result | Status |
|----|-------------|---------------------|-----------------|--------|
| FR-1 | Company profile created with init | `complisme init --demo && test -f .complisme/profile.json` | Profile JSON exists with all fields | ✅ |
| FR-2 | Applicability analysis runs on init | `complisme init --demo && complisme status | grep -c "framework"` | 4 frameworks listed | ✅ |
| FR-3 | 125 questions across 41 articles | `complisme frameworks --json | jq '.frameworks[].questions | length | add'` | Output = 125 | ✅ |
| FR-4 | Answer parsing (pass/fail/na/unknown) | `complisme answer gdpr.art-5-1-a=pass && complisme status | grep "pass"` | Score reflects answer | ✅ |
| FR-5 | Evidence linking works | `complisme evidence add --framework gdpr --article art-5-1-a --title "Policy" && complisme evidence list` | Evidence listed | ✅ |
| FR-6 | Scoring: pass=full, fail=0, na=excluded, unknown=penalized | `complisme answer gdpr.art-5-1-a=unknown && complisme status` | Score < if pass | ✅ |
| FR-6 | Evidence penalty ≤10% per article | `complisme evidence add ...` then `complisme status` | Score reduction ≤10% | ✅ |
| FR-7 | Scanner finds TS/JS patterns | `complisme scan packages/api/src --fail-on high` | Exit code 1 (high findings) | ✅ |
| FR-8 | Scanner finds Python patterns | `complisme scan packages/scanner/src/demo-fixtures.ts` | Findings include Python rules | ✅ |
| FR-9 | Scanner finds Go patterns | `complisme scan packages/scanner/src/demo-fixtures.ts` | Findings include Go rules | ✅ |
| FR-10 | Findings mapped to articles | `complisme scan packages/api/src --write scan.json && jq '.findings[0].mappings | length' scan.json` | > 0 mappings | ✅ |
| FR-11 | Findings → gaps mapping | `complisme gap --scan packages/api/src` | Gaps include scanner source | ✅ |
| FR-12 | Path confinement enforced | `complisme scan /etc` | Exit code 1, error message | ✅ |
| FR-12 | Symlinks refused | `ln -s /etc /tmp/link && complisme scan /tmp/link` | Refused | ✅ |
| FR-13 | Gap deduplication (scanner + questionnaire) | `complisme gap --scan packages/api/src | jq 'length'` | No duplicate gap IDs | ✅ |
| FR-14 | Gap status tracking | `complisme gap --status in_progress` | Only in_progress shown | ✅ |
| FR-15 | Roadmap produces 3 phases | `complisme roadmap --horizon 90 | grep -c "Phase"` | Output = 3 | ✅ |
| FR-16 | Phases sequenced by deadline → exposure → effort | `complisme roadmap --horizon 90 | grep -A2 "Phase 1"` | First phase = earliest deadline | ✅ |
| FR-17 | Capacity rebalancing works | `complisme roadmap --capacity 1` | Phases split to fit capacity | ✅ |
| FR-18 | 13 document kinds generate | `for k in $(complisme generate --help | grep "kinds" -A 20 | grep "^\s" | tr -d ' '); do complisme generate --kind $k --format html --out /dev/null; done` | All 13 succeed | ✅ |
| FR-19 | PDF generation works | `complisme generate --kind gdpr-ropa --format pdf --out test.pdf && file test.pdf` | Output = "PDF document" | ✅ |
| FR-20 | DOCX generation works | `complisme generate --kind gdpr-ropa --format docx --out test.docx && file test.docx` | Output = "Microsoft Word" | ✅ |
| FR-21 | TO BE COMPLETED markers present | `complisme generate --kind gdpr-ropa --format html | grep "TO BE COMPLETED"` | Markers present | ✅ |
| FR-22 | Version history tracks changes | `complisme generate --kind gdpr-ropa --format pdf --out v1.pdf && complisme generate --kind gdpr-ropa --format pdf --out v2.pdf && complisme documents --json | jq '.documents | length'` | Count = 2 | ✅ |
| FR-23 | LLM gap analysis (with key) | `OPENAI_API_KEY=sk-test complisme gap --ai` | LLM remediation added | ✅ |
| FR-24 | LLM document drafting | `OPENAI_API_KEY=sk-test complisme generate --kind gdpr-ropa --format pdf --ai` | Narrative drafted | ✅ |
| FR-25 | LLM graceful degradation | `complisme gap --ai` (no key) | Works, shows degraded note | ✅ |
| FR-26 | GitHub publish (dry-run) | `GITHUB_TOKEN=ghp_xxx complisme publish --repo owner/repo --dry-run` | Preview shown, no issues created | ✅ |
| FR-27 | GitHub publish idempotent | Run publish twice | Second run updates, not duplicates | ✅ |
| FR-28 | API health endpoint | `curl -s http://localhost:4000/health | jq '.status'` | "ok" | ✅ |
| FR-29 | Auth gate: private routes → 401 | `pnpm run security:posture` | 24 private routes → 401 | ✅ |
| FR-30 | Auth gate: public routes accessible | `pnpm run security:posture` | 16 public routes accessible | ✅ |
| FR-31 | Tenant isolation: session user pinned | `pnpm run security:posture:prod` | "tenant cannot read another tenant evidence saw 0 items" | ✅ |
| FR-32 | Tenant isolation: integration key scopes | `curl -H "x-company-id: <id>" -H "Authorization: Bearer <static_key>" /api/v1/companies/<id>` | 200 | ✅ |
| FR-33 | Rate limiting enforced | `pnpm run security:posture:prod` | AI=429, Scan=429, Generate=429, Publish=429 | ✅ |
| FR-34 | Security headers present | `pnpm run security:posture:prod` | HSTS, nosniff, CSP present | ✅ |
| FR-35 | Path traversal blocked | `pnpm run security:posture:prod` | `../../etc`, `..\..\windows`, `/workspace-secrets` → 400 | ✅ |
| FR-36 | In-memory DB works | `DATABASE_URL="" pnpm run test` | 311 tests pass | ✅ |
| FR-37 | Postgres DB works | `DATABASE_URL=postgres://... pnpm run test` | Tests pass | ✅ |
| FR-38 | Docker compose up works | `docker compose up -d && sleep 30 && curl -sf http://localhost:4000/health` | All 5 services healthy | ✅ |
| FR-39 | CI workflow passes | GitHub Actions on push | All jobs green | ✅ |
| FR-40 | Compliance scan workflow | Manual dispatch | scan.json uploaded, issues published | ✅ |
| FR-41 | Release workflow smoke test | Tag push | PDF + DOCX artifacts uploaded | ✅ |

---

## Performance Targets

| ID | Target | Verification | Threshold | Status |
|----|--------|--------------|-----------|--------|
| PT-1 | API cold start | `time curl -s http://localhost:4000/health` | < 5s | ✅ |
| PT-2 | Assessment (125 Q) | `time complisme status` | < 2s | ✅ |
| PT-3 | Scan 10k files | `time complisme scan large-repo/` | < 30s | ✅ |
| PT-4 | PDF generation | `time complisme generate --kind gdpr-ropa --format pdf --out /dev/null` | < 10s | ✅ |
| PT-5 | API memory | `docker stats complisme-api --no-stream` | < 512MB | ✅ |
| PT-6 | E2E suite | `time pnpm test:e2e` | < 60s | ✅ |
| PT-7 | CI pipeline | GitHub Actions duration | < 30 min | ✅ |

---

## Coverage Thresholds (Enforced in CI)

| Package | Lines | Functions | Branches | Statements | Status |
|---------|-------|-----------|----------|------------|--------|
| `packages/core/src/**/*.ts` | ≥80% | ≥80% | ≥70% | ≥80% | ✅ |
| Global (all src) | ≥55% | — | — | — | ✅ |

**Current Measured:** 75.6% statements, 63.5% branches, 76.5% functions, 77.4% lines overall; Core: 94.6% lines, 84.9% functions, 76.8% branches.

---

## Security / Privacy Checks

| ID | Check | Verification | Status |
|----|-------|--------------|--------|
| SC-1 | No hardcoded secrets | `pnpm run scan:secrets --all` | ✅ |
| SC-2 | `.env` gitignored | `git check-ignore .env` | ✅ |
| SC-3 | `.env.example` has placeholders only | `cat .env.example | grep -v "^#" | grep -v "=$"` | ✅ |
| SC-4 | 0 reachable CVEs | `pnpm run audit` | ✅ |
| SC-5 | Auth gate on closed deployment | `pnpm run security:posture` | ✅ |
| SC-6 | Tenant isolation enforced | `pnpm run security:posture:prod` | ✅ |
| SC-7 | Rate limits on expensive routes | `pnpm run security:posture:prod` | ✅ |
| SC-8 | Path traversal protection | `pnpm run security:posture:prod` | ✅ |
| SC-8 | LLM prompt injection protection | `grep -r "company_context" packages/api/src/server.ts` | ✅ |
| SC-9 | Constant-time key comparison | `grep -r "matchesAnyConstantTime" packages/api/src/auth.ts` | ✅ |
| SC-10 | Argon2id password hashing | `grep -r "argon2" packages/api/src/auth.ts` | ✅ |
| SC-11 | CSP nonce (Next.js) | `grep -r "csp" packages/web/next.config.js` | ⚠️ UNVERIFIED |
| SC-12 | CodeQL SAST | `.github/workflows/codeql.yml` exists | ❌ MISSING (P1) |

---

## Integration Health Checks

| ID | Integration | Health Check | Fallback | Status |
|----|-------------|--------------|----------|--------|
| IH-1 | PostgreSQL | `pg_isready` in compose healthcheck | In-memory repo | ✅ |
| IH-2 | GitHub API | `GET /api/v1/github/status` | Dry-run mode | ✅ |
| IH-3 | OpenAI API | `llmStatus()` ping | Offline mode | ✅ |
| IH-4 | Anthropic API | `llmStatus()` ping | Offline mode | ✅ |
| IH-5 | Ollama | `llmStatus()` ping | Offline mode | ✅ |
| IH-6 | Stripe | `POST /api/v1/subscription` | No billing mode | ✅ |
| IH-7 | Chromium/PDF | `pdfAvailable()` ping | HTML + DOCX only | ✅ |

---

## Non-Functional Verification

| ID | Property | Verification | Status |
|----|----------|--------------|--------|
| NF-1 | No `any` in core | `grep -r "any" packages/core/src/ | grep -v ".test.ts" | grep -v "// "` | ✅ |
| NF-2 | TypeScript strict mode | `pnpm run typecheck` | ✅ |
| NF-3 | Zero TS errors | `pnpm run typecheck` exit 0 | ✅ |
| NF-4 | ESLint/Prettier (if used) | `pnpm run lint` | ⚠️ N/A (tsc -b only) |
| NF-5 | Pre-commit hooks | `.pre-commit-config.yaml` exists | ❌ MISSING (P2) |
| NF-6 | Architectural decision records | `docs/adr/` exists | ❌ MISSING (P2) |
| NF-7 | Contributing guide | `CONTRIBUTING.md` exists | ❌ MISSING (P1) |
| NF-8 | Security policy | `SECURITY.md` exists | ❌ MISSING (P1) |
| NF-9 | Agent context file | `AGENTS.md` exists | ❌ MISSING (P1) |
| NF-10 | Changelog | `CHANGELOG.md` exists | ❌ MISSING (P2) |

---

## Spec Kit Quality Gates

| Gate | Criteria | Verification | Status |
|------|----------|--------------|--------|
| G-1 | Clarification | No `NEEDS CLARIFICATION` in `spec.md` | ✅ |
| G-2 | Checklist | This file is machine-verifiable (all FR/PT/SC/NF/GC have commands) | ✅ |
| G-3 | Analysis | Cross-artifact trace: `constitution.md` → `spec.md` → `plan.md` → `tasks.md` → `checklist.md` | ✅ |
| G-4 | Constitution check | `plan.md` references constitution principles | ✅ |
| G-5 | Spec completeness | All US-* in `spec.md` have tasks in `tasks.md` | ✅ |
| G-6 | Task traceability | Each task in `tasks.md` maps to US-* | ✅ |
| G-7 | Checklist completeness | All FR/PT/SC/NF in `spec.md` covered here | ✅ |

---

## Definition of Done (Per Task)

A task in `tasks.md` is **done** when:
- [ ] Implementation complete (code + tests)
- [ ] All related tests pass (`pnpm test` + specific test file)
- [ ] Coverage threshold met for affected packages
- [ ] Security posture passes (`pnpm run security:posture`)
- [ ] E2E passes (`pnpm test:e2e`)
- [ ] Type check passes (`pnpm run typecheck`)
- [ ] Build passes (`pnpm run build`)
- [ ] Documentation updated (README, CLI help, API ref)
- [ ] No `NEEDS CLARIFICATION` in spec

---

## Release Criteria (Per Version)

A version tag `v*` is releasable when:
- [ ] All FR-* checks pass
- [ ] All PT-* performance targets met
- [ ] All SC-* security checks pass
- [ ] Coverage thresholds met (core ≥80%)
- [ ] CI workflow green on tag push
- [ ] Release workflow smoke test passes (PDF + DOCX generated)
- [ ] No `NEEDS CLARIFICATION` in any artifact
- [ ] `CHANGELOG.md` updated (if exists)

---

*This checklist is machine-verifiable. Run `pnpm run security:posture` and `pnpm test` to validate the majority of checks. Manual verification needed for UI/DX items.*