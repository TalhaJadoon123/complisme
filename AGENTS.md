# AGENTS.md — AI Agent Context for CompliSME

This file provides context for AI agents working on the CompliSME codebase. It describes the project structure, conventions, and important patterns.

## Project Overview

**CompliSME** — Multi-framework compliance for European SMEs
- EU AI Act + CSRD/ESRS + GDPR + e-invoicing in one tool
- €49/month or free self-hosted
- Codebase scanner → compliance articles
- 13 document types (PDF/DOCX/HTML)
- 90-day remediation roadmap
- BYOK LLM (OpenAI/Anthropic/Ollama)

## Architecture

### Monorepo Structure (pnpm workspaces)
```
packages/
  shared/       # Domain types, Zod schemas, scoring, markdown, utils
  frameworks/   # YAML regulatory definitions + loader, applicability
  core/         # ComplianceEngine: assess, gapAnalyze, scoring, roadmap
  generator/    # 13 templates, HTML shell, Puppeteer PDF, OOXML DOCX
  scanner/      # TS/JS AST, Python/Go tokenizers, 16 rules, GitHub
  llm/          # BYOK providers, prompts, redaction
  cli/          # `complisme` command line interface
  api/          # Fastify REST API, Drizzle ORM, auth, seed
  desktop/      # Local HTTP server + SPA (no Electron)
  web/          # Next.js: marketing, onboarding, dashboard
  docs/         # Next.js documentation site
```

### Dependency Direction (Strict)
```
shared → frameworks → core → {generator, scanner, llm} → {cli, api} → {web, docs}
                                              ↘ desktop (depends on api)
```

### Key Principles
1. **Privacy First** — No data leaves machine unless explicitly configured
2. **Honest Degradation** — Works offline, PDF→HTML fallback, in-memory DB
3. **Open Content** — Regulatory YAML is single source of truth
4. **Tenant Isolation** — Session users pinned to own company
5. **Deterministic Documents** — Structure deterministic, narrative by LLM

## Key Files & Patterns

### TypeScript
- Strict mode enabled everywhere
- Project references (`tsconfig.base.json` + package `tsconfig.json`)
- `tsc -b` for incremental builds
- Zod schemas as source of truth → `z.infer<typeof schema>`
- No `any` in core packages

### Testing
- Vitest with project references
- Coverage thresholds: core ≥80% lines/functions
- Integration tests via Fastify `inject()`
- E2E tests against live server (`packages/api/scripts/e2e.mjs`)

### Security
- Global auth gate in Fastify `onRequest` hook
- Tenant isolation: session users pinned to own company
- Constant-time key comparison for API keys
- Path traversal protection: `resolveWithin()` + realpath re-check
- LLM prompt injection protection: `<company_context>` delimiters

### Database
- Repository pattern: `MemoryRepository` (default) ↔ `PostgresRepository`
- Drizzle ORM for PostgreSQL
- In-memory fallback when `DATABASE_URL` not set

### LLM Integration
- BYOK: OpenAI, Anthropic, Ollama
- Redaction: identifiers stripped before prompt
- `<company_context>` delimiters prevent prompt injection
- Rate limited: `RATE_LIMIT_AI=20`
- Graceful degradation: works offline

## Common Tasks

### Adding a New Framework
1. Add YAML to `packages/frameworks/definitions/`
2. Follow schema in `packages/frameworks/src/schemas.ts`
3. Rebuild: `pnpm --filter @complisme/frameworks run build`

### Adding a Document Template
1. Create template in `packages/generator/src/templates/`
2. Register in `packages/generator/src/index.ts`
4. Add CLI command in `packages/cli/src/commands/generate.ts`

### Adding a Scanner Rule
1. Add rule to `packages/scanner/src/rules.ts`
2. Map to article IDs in `mappings` array
3. Add test in `packages/scanner/tests/scanner.test.ts`

### Adding an API Route
1. Add route in `packages/api/src/server.ts`
2. Use `requireCompany` for tenant isolation
3. Add Zod schema for validation
4. Add test in `packages/api/tests/api.test.ts`

## Commands

```bash
# Development
pnpm install --frozen-lockfile --ignore-scripts
pnpm dev:api      # API on :4000
pnpm dev:web      # Web on :3000
pnpm dev:docs     # Docs on :3001

# Building
pnpm run clean
pnpm run build

# Testing
pnpm test                    # 311 unit/integration tests
pnpm run test:coverage       # With coverage
pnpm run test:e2e            # 57 E2E assertions (needs live server)

# Security
pnpm run security:posture    # Auth gate + public surface
pnpm run security:posture:prod  # Production checks (needs NODE_ENV=production)
pnpm run audit               # Dependency audit (0 reachable CVEs)
pnpm run scan:secrets        # Secret scanning

# CLI
pnpm complisme --help
pnpm desktop                  # Local GUI on :4317

# Docker
docker compose up -d --build
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_SECRET` | Yes (prod) | `openssl rand -hex 32` |
| `DATABASE_URL` | No | Postgres URL (in-memory fallback) |
| `API_CORS_ORIGIN` | Yes | Comma-separated origins |
| `OPENAI_API_KEY` | No | BYOK LLM |
| `ANTHROPIC_API_KEY` | No | BYOK LLM |
| `OLLAMA_BASE_URL` | No | Local LLM |
| `GITHUB_TOKEN` | No | GitHub issue publishing |
| `GITHUB_REPOSITORY` | No | `owner/repo` |
| `STRIPE_SECRET_KEY` | No | Billing |

## GitHub Actions

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | push/PR | Build, test, security, E2E |
| `compliance-scan.yml` | push, schedule, dispatch | Weekly scan + GitHub issues |
| `release.yml` | tag `v*`, dispatch | Build + smoke test + release |

## Important Notes for Agents

1. **Never modify existing code without explicit instruction** — This is a read-only audit/codebase
2. **All changes must be additive** — No refactoring, no deletions
3. **Respect the dependency direction** — Never create cycles
4. **Use Zod schemas** — For all external boundaries
5. **Respect tenant isolation** — Session users cannot access other tenants
6. **Security first** — All inputs validated, secrets scanned, rate limited
7. **Test everything** — 311 tests must pass, coverage thresholds met

## Useful File References

| File | Purpose |
|------|---------|
| `constitution.md` | Project principles & standards |
| `spec.md` | User stories & acceptance criteria |
| `plan.md` | Technical architecture & contracts |
| `tasks.md` | 80 tasks mapped to user stories |
| `checklist.md` | Machine-verifiable acceptance criteria |
| `AUDIT-SPEC-KIT-COMPLIANCE.md` | Full audit report |

## Quick Verification Commands

```bash
# Quick health check
pnpm test                          # 311 tests
pnpm run security:posture          # Auth gate + public surface
pnpm run security:posture:prod     # Production checks
pnpm run audit                     # 0 reachable CVEs
pnpm run build                     # Clean build
pnpm run test:e2e                  # Live server E2E
```

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Build fails with "cannot find module" | Remove `tsconfig.tsbuildinfo` files, rebuild |
| Tests timeout | Increase `BOOT_TIMEOUT` in test files (180s) |
| Scanner misses files | Check `SCAN_ROOT` and path confinement |
| PDF generation fails | Install Chromium, check `PUPPETEER_EXECUTABLE_PATH` |
| GitHub push fails | Check DNS, try SSH URL, verify credentials |

---

*This file is for AI agents working on CompliSME. Keep it updated as the project evolves.*