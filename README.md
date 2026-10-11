# CompliSME

**Multi-framework compliance for European SMEs. EU AI Act + CSRD/ESRS + GDPR + e-invoicing in one tool, at €49/month.**

Four regulations are converging on small companies simultaneously, and they are written for organisations with compliance departments. CompliSME scores you against all four, scans your codebase for the obligations you cannot see, generates the documents you have to produce, and gives you a 90-day plan you can actually execute.

```bash
pnpm install && pnpm build
node packages/cli/dist/cli.js --dir ./demo init --demo
node packages/cli/dist/cli.js --dir ./demo status
```

No account. No server. No API key. Works offline.

---

## Contents

- [What it does](#what-it-does)
- [Differentiators](#differentiators)
- [Monorepo layout](#monorepo-layout)
- [Quick start](#quick-start)
- [Running with Docker](#running-with-docker)
- [Environment variables](#environment-variables)
- [Manual steps checklist](#manual-steps-checklist)
- [API keys you need](#api-keys-you-need)
- [What you do NOT need](#what-you-do-not-need)
- [CLI reference](#cli-reference)
- [API reference](#api-reference)
- [Framework definitions](#framework-definitions)
- [The scanner](#the-scanner)
- [Testing](#testing)
- [Project status](#project-status)
- [Legal](#legal)

---

## What it does

| Capability | Detail |
|---|---|
| **Assessment** | 41 regulatory articles, 125 questions, weighted scoring with explainable per-question verdicts |
| **Codebase scanning** | TS/JS via the TypeScript compiler AST, Python and Go via a tokeniser; 16 rules mapped to specific articles |
| **Documents** | 13 document types, print-ready PDF (Puppeteer) and editable DOCX (written against OOXML directly) |
| **Roadmap** | 90-day phased plan sequenced by statutory deadline, then fine exposure, then effort |
| **LLM assist** | BYOK (OpenAI, Anthropic, Ollama) for gap analysis and narrative drafting; identifiers redacted before sending |
| **Open content** | All regulatory content is YAML in a public repository — fork it, change it, keep the changes |

### Scoring model

Every answer resolves to `pass`, `fail`, `na` or `unknown`.

- `pass` earns the full question weight.
- `na` is treated as compliant and leaves the denominator — but an article with nothing left to answer is excluded entirely.
- `unknown` is **penalised**. An unanswered question is not a compliant one, and pretending otherwise is exactly how SMEs get surprised by a supervisory authority.
- Article scores are reduced by up to 10% in proportion to missing evidence. You cannot evidence compliance you have not recorded.
- Framework scores are weighted averages of applicable articles; the overall score damps the weighting logarithmically so the AI Act's €15M caps do not drown out CSRD's €3M.

---

## Differentiators

**Multi-framework in one tool.** OneTrust and TrustArc are €10K+/yr enterprise suites covering one or two frameworks and assuming a compliance team. CompliSME covers four, written for nine-person companies, at €49/month or free self-hosted.

**Codebase scanner mapped to compliance articles.** "You call OpenAI with a customer's email address" is a code smell. "That engages EU AI Act Art. 6 classification, Art. 50 transparency, Art. 10 data governance, GDPR Art. 5(1)(c) minimisation and Chapter V transfers" is a compliance finding you can assign to someone. Nobody else ships this.

**Documents, not templates.** Generate an Annex IV technical documentation, a ROPA, a DPIA, a CSRD sustainability statement or a Brazilian NFS-e validation report. Structure, tables and citations are deterministic; the narrative is drafted by your own LLM key if you supply one. Facts you have not provided are marked `TO BE COMPLETED` rather than invented.

**Open-source regulatory content.** `packages/frameworks/definitions/*.yaml` is the single source of truth. Corrections are a pull request away from being live, rather than a roadmap item.

**Degrades honestly.** No LLM key → everything else works, and the UI says so. No Chromium → PDF falls back to HTML with a clear message. No database → in-memory store, correct for a single-user install.

---

## Monorepo layout

```
packages/
  shared/       Domain types, Zod schemas, scoring semantics, markdown renderer
  frameworks/   YAML regulatory definitions + loader, applicability, penalty model
  core/         ComplianceEngine: assess, gapAnalyze, scoring, roadmap, fixtures
  generator/    Document templates, HTML shell, Puppeteer PDF, OOXML DOCX writer
  scanner/      Parsers (TS AST, Python, Go, tree-sitter), 16 detection rules
  llm/          BYOK providers (OpenAI/Anthropic/Ollama), prompts, redaction
  cli/          `complisme` command line interface
  api/          Fastify REST API, Drizzle schema, auth, seed
  desktop/      Local GUI: a 127.0.0.1 server plus a self-contained HTML page
  web/          Next.js app: marketing, onboarding, dashboard, documents, roadmap
  docs/         Next.js documentation site (markdown from packages/docs/content)
```

Dependency direction is strictly downward: `shared → frameworks → core → {generator, scanner, llm} → {cli, api} → {web, docs}`, with `desktop` sitting on `api`.

The desktop app is a plain local HTTP server and one HTML file, not Electron or
Tauri. That keeps the toolchain to `pnpm install` with no per-platform native
build, at the cost of not shipping a signed installer.

---

## Quick start

### Prerequisites

- Node.js ≥ 20.10 (tested on 22)
- pnpm ≥ 9 (`corepack enable`)
- Chromium, only if you want PDF output

### Install and build

```bash
pnpm install
pnpm build
```

### Use the CLI offline

```bash
# Interactive setup
node packages/cli/dist/cli.js init

# Or non-interactively
node packages/cli/dist/cli.js init --name "Acme Analytics BV" -c NL -e 9 --revenue 1250000

# Answer the questionnaires
node packages/cli/dist/cli.js answer gdpr.a5-q1=documented gdpr.a30-q1=complete-and-reviewed

# See where you stand
node packages/cli/dist/cli.js status

# Get the plan
node packages/cli/dist/cli.js roadmap

# Scan your codebase
node packages/cli/dist/cli.js scan ./src --gaps

# Produce documents
node packages/cli/dist/cli.js generate --kind gdpr-dpia --format pdf
node packages/cli/dist/cli.js generate --kind ai-act-annex-iv --format docx
```

State lives in `.complisme/` as plain JSON. Use `--global` for `~/.complisme`, `--json` for machine output.

### Run the API and web app

```bash
# Terminal 1 — API on :4000 (in-memory store, no database needed)
pnpm dev:api

# Terminal 2 — web app on :3000
pnpm dev:web

# Terminal 3 — docs on :3001
pnpm dev:docs
```

Open <http://localhost:3000>. Sign up, or seed the demo:

```bash
pnpm run seed          # in-memory demo
# demo@complisme.eu / Demo12345
```

---

## Running with Docker

```bash
cp .env.example .env
# Set AUTH_SECRET — the API warns loudly if you leave the default
docker compose up -d --build
```

| Service | URL | Notes |
|---|---|---|
| Web app | <http://localhost:3000> | Next.js |
| API | <http://localhost:4000> | Fastify, ships Chromium so PDF works |
| Docs | <http://localhost:3001> | Static site |
| PostgreSQL | `localhost:5432` | Named volume, healthchecked |

Mount the code you want scanned at `./workspace`; it is mounted read-only and `SCAN_ROOT` is pinned to it.

```bash
docker compose exec api node /app/packages/cli/dist/cli.js scan /workspace --gaps
docker compose exec api node /app/packages/api/dist/main.js   # API entrypoint
```

---

## Environment variables

Copy `.env.example` to `.env`. Only `AUTH_SECRET` and `DATABASE_URL` are genuinely required in production.

### Required in production

| Variable | Why |
|---|---|
| `AUTH_SECRET` | Signs session tokens. `openssl rand -hex 32`. The API warns on startup if you leave the default. |
| `DATABASE_URL` | `postgres://user:pass@host:5432/db`. Omit for the in-memory store. |
| `API_CORS_ORIGIN` | Comma-separated allowed origins. |

### Recommended

| Variable | Default | Notes |
|---|---|---|
| `API_HOST` | `0.0.0.0` | |
| `API_PORT` | `4000` | |
| `API_STATIC_KEYS` | — | Comma-separated integration keys for machine access. Server-wide: name the tenant with `x-company-id` |
| `STORAGE_DIR` | `.data/documents` | Where generated documents are written |
| `SCAN_ROOT` | API cwd | The scanner refuses any path outside this |
| `RATE_LIMIT_MAX` | `300` | Requests per window |
| `RATE_LIMIT_WINDOW` | `1 minute` | |
| `NODE_ENV` | — | `production` enables the global auth gate. **The API refuses to boot with the default `AUTH_SECRET` when this is set** |

Per-route rate budgets override the global limit. Lower them for a shared or
public deployment:

| Variable | Default | Guards |
|---|---|---|
| `RATE_LIMIT_AI` | `20` | `POST /api/v1/ai/ask` — outbound LLM spend |
| `RATE_LIMIT_SCAN` | `10` | `POST /api/v1/scan` — CPU and filesystem walk |
| `RATE_LIMIT_GENERATE` | `15` | `POST /api/v1/generate` — PDF/DOCX rendering |
| `RATE_LIMIT_PUBLISH` | `10` | `POST /api/v1/github/issues` — outbound writes |

### Optional — GitHub integration

`complisme publish` and `POST /api/v1/github/issues` turn unresolved compliance
gaps into GitHub issues. Without these the rest of the tool works unchanged.

| Variable | Notes |
|---|---|
| `GITHUB_TOKEN` | Fine-grained PAT, needs `issues: write` on the target repo |
| `GITHUB_REPOSITORY` | `owner/repo`. Defaults to the `GITHUB_REPOSITORY` CI variable |
| `GITHUB_API_URL` | Only for GitHub Enterprise |

Publishing is idempotent: each gap maps to a stable issue key, so re-running
updates the existing issue instead of creating duplicates. Use `dryRun: true` to
preview. `GET /api/v1/github/status` reports whether publishing is configured.

### Optional — AI (BYOK)

| Variable | Notes |
|---|---|
| `OPENAI_API_KEY` | Also works with any OpenAI-compatible endpoint via `OPENAI_BASE_URL` |
| `OPENAI_MODEL` | Default `gpt-4o-mini` |
| `ANTHROPIC_API_KEY` | Default model `claude-3-5-sonnet-latest` |
| `OLLAMA_BASE_URL` | Local models, default `http://localhost:11434` |
| `LLM_PROVIDER` | Force `openai`, `anthropic` or `ollama` |
| `TREE_SITTER_WASM_DIR` | Optional tree-sitter grammar `.wasm` files |

Detection order: explicit override → OpenAI → Anthropic → Ollama. Everything works without any of them.

### Optional — PDF

| Variable | Notes |
|---|---|
| `PUPPETEER_EXECUTABLE_PATH` | Path to an existing Chrome/Chromium |

The Docker image ships Chromium. On a bare-metal install:

```bash
pnpm exec puppeteer browsers install chrome
export PUPPETEER_EXECUTABLE_PATH="$(node -e "console.log(require('puppeteer').executablePath())")"
```

### Optional — billing

| Variable | Notes |
|---|---|
| `STRIPE_SECRET_KEY` | Enables real billing |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification |
| `STRIPE_PRICE_STARTER` / `_BUSINESS` / `_ENTERPRISE` | Price ids |

Without these, `POST /api/v1/subscription` applies the plan directly and reports `billingEnabled: false`. That is the correct behaviour for self-hosted installs, where the operator is the billing department.

---

## Manual steps checklist

Everything below is optional. None of it is required to run the product.

### To run locally

- [ ] `pnpm install`
- [ ] `pnpm build`
- [ ] `pnpm test`
- [ ] Try `complisme init --demo` and `complisme status`

### To run with persistence

- [ ] Provision PostgreSQL 16+
- [ ] `pnpm run db:push` (or `pnpm run db:generate` for migrations under version control)
- [ ] Set `DATABASE_URL`
- [ ] `pnpm run seed` for demo data

### To enable PDF output

- [ ] Install Chromium (baked into the Docker image) or set `PUPPETEER_EXECUTABLE_PATH`
- [ ] Verify: `curl localhost:4000/health` → `capabilities.pdf: true`

### To enable AI features

- [ ] Get an OpenAI / Anthropic API key, or run Ollama locally
- [ ] Set the corresponding variable
- [ ] Verify: `curl localhost:4000/api/v1/ai/status` → `configured: true`

### Before production

- [ ] `AUTH_SECRET=$(openssl rand -hex 32)`
- [ ] `NODE_ENV=production`
- [ ] `API_CORS_ORIGIN=https://your-domain`
- [ ] TLS terminated in front of the API
- [ ] `STORAGE_DIR` on a volume with your retention policy
- [ ] `SCAN_ROOT` restricted
- [ ] `pg_dump` scheduled
- [ ] `curl /health` wired as the container healthcheck

### To take payments

- [ ] Stripe account and keys
- [ ] Create three products (Starter €49, Business €149, Enterprise custom)
- [ ] Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_*`
- [ ] Implement the webhook handler at `POST /api/v1/billing/webhook` (not built — see below)

### Domain and email

- [ ] Point DNS at your host
- [ ] TLS certificate (Let's Encrypt or a load balancer)
- [ ] Set `NEXT_PUBLIC_API_URL` and rebuild the web app — it is baked in at build time
- [ ] Transactional email for password reset and DSR notifications (not built)

---

## API keys you need

| Key | Required? | What it does |
|---|---|---|
| **None** | — | The entire rules-based product: scoring, gap analysis, roadmap, document generation, scanning. Fully offline. |
| `OPENAI_API_KEY` | Optional | AI-assisted gap analysis and narrative drafting |
| `ANTHROPIC_API_KEY` | Optional | Same, via Anthropic |
| `OLLAMA_BASE_URL` | Optional | Same, locally, no data leaves your network |
| `PUPPETEER_EXECUTABLE_PATH` | Optional | PDF rendering; the Docker image already has Chromium |
| `STRIPE_SECRET_KEY` | Optional | Subscription billing |
| `DATABASE_URL` | Optional in dev | PostgreSQL; omit for the in-memory store |
| `AUTH_SECRET` | **Required in production** | Token signing; generate your own |

**Minimum viable production setup:** `AUTH_SECRET` + `DATABASE_URL` + TLS. That is it.

---

## What you do NOT need

To be explicit, because "bring your own key" products are often misleading about this:

- **No AI key.** The 125-question assessment, the roadmap, all 13 document types and the codebase scanner work without any model provider. AI only improves the narrative prose and catches gaps the questionnaire did not think to ask about.
- **No Chromium** for DOCX or HTML. Those never need a browser. Only PDF does.
- **No database** for single-user or evaluation use.
- **No Docker.** Bare `pnpm build` works.
- **No domain or TLS** for internal use behind a VPN.

---

## CLI reference

```
complisme init       [--name] [--country] [--sector] [--employees] [--revenue] [--demo]
complisme answer     [framework.question=value ...] [--interactive] [--framework <id>] [--clear]
complisme status     [--limit <n>]
complisme gap        [--scan <path>] [--ai] [--severity] [--framework] [--limit]
complisme roadmap    [--horizon <days>] [--capacity <days>] [--write <file>]
complisme scan       <path> [--ruleset gdpr|ai-act|all] [--gaps] [--fail-on <level>] [--write <file>]
complisme generate   --kind <kind> [--format pdf|docx|html] [--ai] [--scan <path>] [--out <dir>]
complisme evidence   add|list [--framework] [--article] [--title] [--type] [--note]
complisme documents  [--json]
complisme frameworks [--json]
complisme publish    [--repo owner/name] [--title-prefix <text>] [--limit <n>] [--scan <path>] [--dry-run]
complisme status-all
```

Global: `--dir <path>`, `--global`, `--json`, `--yes`.

Document kinds: `ai-act-annex-iv`, `ai-act-risk-register`, `ai-act-conformity-declaration`, `gdpr-ropa`, `gdpr-dpia`, `gdpr-dsr-response`, `gdpr-tom`, `consent-notice`, `nda-dpa`, `csrd-report`, `esrs-datapoint`, `einvoice-validation-report`, `compliance-roadmap`.

`publish` turns unresolved gaps into GitHub issues. It needs `GITHUB_TOKEN`; each gap maps to a stable issue key so re-running updates the existing issue instead of creating duplicates. `--dry-run` prints what it would create. Combine with `--scan` to publish straight from a fresh scan.

```bash
complisme scan ./src --write scan.json
complisme publish --scan ./src --dry-run     # preview
GITHUB_TOKEN=ghp_xxx complisme publish --repo owner/name
```

CI usage:

```bash
complisme --json gap > gaps.json
complisme scan ./src --fail-on critical --write scan.json || exit 1
```

### Desktop GUI

A local GUI for people who do not want a terminal. It starts a server bound to
`127.0.0.1` and serves a single self-contained HTML page — no Electron, no
Tauri, no per-platform native toolchain.

```bash
pnpm run build
pnpm desktop            # prints the URL and opens it; default port 4317
pnpm desktop -- --port 5000 --no-open
```

Override the port with `--port` or `COMPLEISME_PORT`. Add `--json` for a
machine-readable summary.

Six views: company profile, questionnaire, assessment status, gap analysis,
roadmap and document generation. It talks to the local API in-process, so it
works with no database and no external service.

---

## API reference

Base URL `http://localhost:4000`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | Liveness, storage kind, capabilities |
| GET | `/api/v1/frameworks` | — | Summaries (`?full=true` for everything) |
| GET | `/api/v1/frameworks/:id` | — | One framework with deadlines |
| GET | `/api/v1/rules` | — | Every scanner rule and its article mapping |
| GET | `/api/v1/pricing` | — | Plan matrix and deadlines |
| GET | `/api/v1/ai/status` | — | Provider configuration and reachability |
| POST | `/api/v1/auth/signup` | — | Create account + company, returns a token |
| POST | `/api/v1/auth/login` | — | Exchange credentials for a token |
| GET | `/api/v1/auth/me` | ✓ | User, company, subscription |
| GET | `/api/v1/companies/:id` | ✓ | Profile, applicability, fine exposure |
| PUT | `/api/v1/companies/:id` | ✓ | Update the profile (onboarding) |
| POST | `/api/v1/assess` | ✓ | Run the engine; persists scores and gaps |
| POST | `/api/v1/assess/preview` | — | Score without persisting (pre-signup trial, rate limited) |
| GET | `/api/v1/companies/:id/status` | ✓ | Scores, gaps, deadlines, countdowns |
| GET | `/api/v1/companies/:id/roadmap` | ✓ | The phased plan (`?horizon=90`) |
| PATCH | `/api/v1/gaps/:id` | ✓ | `{ "status": "in_progress" }` |
| POST | `/api/v1/generate` | ✓ | Produce a document |
| GET | `/api/v1/documents` | ✓ | Library with version history |
| POST | `/api/v1/scan` | ✓ | Scan a path, return findings and gaps |
| GET/POST | `/api/v1/companies/:id/evidence` | ✓ | Evidence library |
| DELETE | `/api/v1/companies/:id/evidence/:id` | ✓ | Remove evidence |
| POST | `/api/v1/ai/ask` | ✓ | Free-form compliance question |
| GET | `/api/v1/github/status` | ✓ | Whether GitHub publishing is configured |
| POST | `/api/v1/github/issues` | ✓ | Publish gaps as issues (`dryRun` to preview) |
| POST | `/api/v1/subscription` | ✓ | Change plan |

Authenticate with `Authorization: Bearer <token>`. Machine access: set `API_STATIC_KEYS` and send the key as a bearer token with `x-company-id` for scoping.

A signed-in user is pinned to their own company — a `companyId` in the path, query, body or `x-company-id` is ignored for session tokens. Integration keys are server-wide and must name the company they act on. See [Security](#security).

Errors share one shape: `{ error, message, statusCode, details? }`.

Full reference with curl examples: <http://localhost:3001/docs/api>.

---

## Framework definitions

`packages/frameworks/definitions/` — 4 YAML files, the single source of truth for the engine, the documents and the scanner mappings.

| File | Framework | Articles | Questions |
|---|---|---|---|
| `eu-ai-act.yaml` | Regulation (EU) 2024/1689 | 16 | 43 |
| `gdpr.yaml` | Regulation (EU) 2016/679 | 10 | 32 |
| `csrd.yaml` | Directive (EU) 2022/2464 + ESRS | 8 | 29 |
| `e-invoicing.yaml` | ViDA + Brazilian NF-e/NFS-e | 7 | 21 |

Each article carries its legal reference, an ISO deadline, a fine exposure in EUR, the evidence an auditor will ask for, and its questions with weights, remediation text and effort estimates.

To change the regulatory content, edit the YAML and rebuild:

```bash
pnpm --filter @complisme/frameworks run build
```

The loader validates every file against a Zod schema at import time and throws on the first problem, naming the file and the failing path. Invalid content fails fast rather than silently scoring zero.

Details: <http://localhost:3001/docs/frameworks>.

---

## The scanner

```bash
complisme scan ./src --gaps
```

**Safety:** the scanner reads files and nothing else. It never executes your code, never resolves dependencies, makes no network calls and uploads nothing. `node_modules`, build output, vendored code and lockfiles are excluded by default. The API confines scans to `SCAN_ROOT`.

**Languages:** TypeScript/JavaScript use the TypeScript compiler AST (real parsing). Python and Go use a tokeniser that understands strings, comments and triple quotes. Tree-sitter WASM is supported optionally via `TREE_SITTER_WASM_DIR`.

**16 rules**, each mapped to the articles it engages:

| Rule | Detects | Maps to |
|---|---|---|
| `consent/missing-before-processing` | Personal data collected with no consent gate or lawful-basis check | GDPR Art. 6, Art. 5 |
| `pii/collection` | Personal data fields collected or persisted | GDPR Art. 5, Art. 30, Art. 13 |
| `pii/special-category` | Health, biometric, union, political data | GDPR Art. 6, Art. 35; AI Act Art. 10 |
| `gdpr/biometric` | Biometric processing | GDPR Art. 6, Art. 35; AI Act Art. 5 |
| `ai-act/pii-to-model` | **Personal data sent to an AI provider** | AI Act Art. 10, Art. 9; GDPR Art. 5, Chapter V |
| `ai-act/api-call` | Any AI model API call | AI Act Art. 6, Art. 50, Art. 4; GDPR Art. 6, Chapter V |
| `gdpr/personal-data-logging` | Personal data serialised into logs | GDPR Art. 32, Art. 5, Art. 30 |
| `gdpr/unstructured-logging` | Whole objects logged | GDPR Art. 5, Art. 32 |
| `gdpr/no-retention-on-store` | Personal data written with no TTL or deletion rule | GDPR Art. 5, Art. 30 |
| `gdpr/external-transfer` | Personal data sent to a third-party service | GDPR Art. 28, Chapter V, Art. 30 |
| `gdpr/cookie-consent` | Trackers installed with no consent gate | GDPR Art. 6, Art. 5 |
| `gdpr/profiling` | Scores, ranks, recommendations | GDPR Art. 5, Art. 35; AI Act Art. 5 |
| `security/no-encryption` | Data store with no visible encryption | GDPR Art. 32; AI Act Art. 15 |
| `security/hardcoded-secret` | Credential in source near personal data | GDPR Art. 32 |
| `consent/capture` | Consent mechanisms present (positive signal) | GDPR Art. 7, Art. 5 |
| `gdpr/retention` | Retention periods defined (positive signal) | GDPR Art. 5, Art. 30 |

Every finding carries a **confidence score** and a severity. Treat anything below 0.6 as a prompt to look, not a finding to file — a scanner that presents every heuristic as a certainty is worse than useless.

**Limits, stated plainly:** it does not follow values across modules, does not resolve dynamic dispatch, cannot prove absence of a control, and says nothing about runtime behaviour or organisational process. A large part of GDPR compliance is organisational, and no static analyser can see that.

Details: <http://localhost:3001/docs/scanner>.

---

## Security

### Authentication

A single global gate in the `onRequest` hook decides whether a request is
authenticated at all. This matters more than it sounds: without it, safety
depends on every individual handler remembering to check, and one that forgets
is a public data leak. Three endpoints answer anonymously, and only these three
groups:

| Public | Why |
|---|---|
| `GET /health` | Container `HEALTHCHECK` and load-balancer probes carry no credentials |
| `POST /api/v1/auth/signup`, `POST /api/v1/auth/login` | Self-service onboarding |
| `GET /api/v1/frameworks`, `/api/v1/frameworks/:id`, `/api/v1/rules`, `/api/v1/pricing`, `/api/v1/ai/status` | Open-source framework content; the marketing site needs it before signup |

Everything else requires a valid session token or an integration key. In
development (`NODE_ENV` unset) the gate is off, so the CLI and the local workflow
work without a login.

### Tenant isolation

A signed-in user is pinned to their own company. A `companyId` in the path,
query string, request body or `x-company-id` header is **ignored** for session
credentials, because honouring it would let any signed-in user read another
tenant's assessments, evidence and documents by editing a URL.

Integration keys are the one exception: they are server-wide by design, so they
must name the company they act on via `x-company-id`.

### Verifying the above

Three checks run in CI and can be run locally. All three need `pnpm run build`
first, and none needs a listening socket — they inject requests in-process.

```bash
pnpm run security:posture
```

| Check | Asserts |
|---|---|
| `check-auth-secret.js` | The API refuses to boot with the built-in development secret when `NODE_ENV=production` |
| `sweep-unauthenticated.js` | Walks Fastify's own route tree and fails if **any** private route answers an anonymous caller with 2xx |
| `sweep-public.js` | The public surface above still answers anonymously, plus CORS preflight |

`sweep-unauthenticated.js` is the important one. Because it derives its route
list from the runtime route table, a route added later without an auth check
fails CI automatically instead of shipping quietly.

Two deeper suites run against a production-configured server:

```bash
pnpm run security:posture:prod   # headers, auth, cross-tenant isolation, traversal
```

### Other hardening

- **Secrets.** `AUTH_SECRET` must be at least 32 bytes; the API refuses to start on the default value in production. API keys are compared in constant time. `.env` is gitignored and no credential-shaped strings are committed. `pnpm run scan:secrets` scans staged content for credential shapes — use `--all` to scan every tracked file, as CI does.
- **Rate limits.** A global budget plus tighter per-route budgets on the four expensive operations (`RATE_LIMIT_AI`, `_SCAN`, `_GENERATE`, `_PUBLISH`).
- **Path confinement.** `packages/scanner/src/path-safety.ts` resolves every path against `SCAN_ROOT`, refuses symlinks, and re-checks containment on the realpath — a prefix check alone accepted `/workspace-secrets` for a root of `/workspace`.
- **Prompt injection.** Caller-supplied company context is wrapped in `<company_context>` delimiters so text inside a profile cannot be read as instructions, and LLM errors are sanitised before they reach a client.
- **Response headers.** HSTS, `X-Content-Type-Options`, frame and referrer policies, and a CSP on the web app.
- **Rendering.** Puppeteer runs with memory and renderer limits and a close timeout.

### Dependency audit

`pnpm run audit` classifies every advisory by whether it is actually reachable:

```bash
pnpm run audit
```

Current posture: **0 advisories reachable from application code.** Three remain —
`braces` (build tooling only, via chokidar/micromatch) and two `extract-zip`
(present in the pnpm store, but no package declares them). None has an upstream
patch. Overrides for vitest, vite, esbuild, postcss, drizzle-orm and basic-ftp
are pinned in `package.json` under `pnpm.overrides`.

---

## Testing

```bash
pnpm test                      # 311 tests across 14 files
pnpm test:coverage             # with coverage and thresholds
pnpm test:core                 # core package only, with its 80% floor
pnpm test:e2e                  # 56 assertions against a running API
pnpm run security:posture      # auth gate, public surface, dev-secret refusal
```

| Suite | Covers |
|---|---|
| `core` | Engine, scoring, gap analysis, roadmap, profile helpers |
| `api` | Every route, auth, repository, seed, **tenant isolation** |
| `llm` | Redaction, prompts, all three providers, graceful degradation |
| `shared` | Constants, utils, scoring semantics, markdown, schemas |
| `frameworks` | Registry, YAML validation, applicability, penalty model |
| `generator` | All 13 document kinds, HTML, DOCX, branding |
| `cli` | Workspace, answer parsing, output rendering, program definition, `publish` |
| `desktop` | GUI server, views, real PDF generation |
| `scanner` | Parsers, all rules, data flow, gap derivation, GitHub publishing |

Measured on the full suite: **75.9% statements, 64.1% branches, 76.5% functions, 77.7% lines overall**. The compliance engine — the part that has to be right — is held to a hard floor and sits well above it: **94.6% lines, 84.9% functions, 76.8% branches**. Thresholds are enforced in `vitest.config.ts`, so a drop fails the build rather than being reported and ignored.

The E2E script runs against a live server:

```bash
pnpm dev:api &
node packages/api/scripts/e2e.mjs http://localhost:4000
```

---

## Project status

**Working and tested end to end:**

- All 11 packages build from a clean checkout
- 311 unit/integration tests pass; 56 E2E assertions pass against a running server
- 17 production-posture assertions and 12 public-surface assertions pass in CI
- The CLI runs the full flow: init → answer → status → gap → roadmap → scan → generate → publish
- Real PDFs (140–166 KB) and valid OOXML DOCX files are produced on disk
- The scanner parses TypeScript, Python and Go and maps findings to articles
- The API serves 40 routes behind a single global auth gate, with rate limiting and quota enforcement
- Tenant isolation is enforced and regression-tested: a signed-in user cannot address another company by path, query, body or header
- The web app builds 11 static routes; the docs site prerenders 12 pages
- Docker Compose defines 5 services; the API image runs as a non-root user

**Not built — deliberately scoped out:**

- Stripe webhook handler. The plan-change endpoint works and applies plans directly; the webhook that syncs subscription state is not implemented.
- Password reset, email verification and transactional email.
- OAuth / SSO. Email + password only.
- Server-side sessions. JWT in `localStorage`; appropriate for a single-tenant self-hosted install, not for a shared multi-tenant SaaS without adding refresh tokens and httpOnly cookies.
- Multi-tenancy beyond one company per user. Isolation between tenants is enforced; a user still cannot belong to more than one.
- Webhooks and scheduled re-assessment.
- A signed desktop installer. `pnpm desktop` runs a local server instead; see [Desktop GUI](#desktop-gui).

**Known limitations:**

- The scanner does not do cross-module taint analysis (see [The scanner](#the-scanner)).
- CSRD applicability uses headcount and turnover only; the balance-sheet criterion is not modelled, and national transposition of Directive (EU) 2025/794 varies.
- The AI Act GPAI article coverage is the downstream-obligations slice, not the full Art. 51–55 provider duties.
- The web app is a static deploy with a `localStorage` token, so route guards are client-side.

---

## Legal

CompliSME produces **compliance working documents, not legal advice**. Every generated document carries that notice. Have the output reviewed by a qualified lawyer or data protection officer before relying on it.

Framework definitions were written from the published regulations and available guidance. Regulation moves: the Omnibus simplification, AI Act service-desk guidelines, national CSRD transpositions and ViDA delegated acts are all still developing. Check a citation before putting it in front of a regulator.

**Data handling:** your codebase is read locally and never uploaded. Company data is pseudonymised and direct identifiers are stripped before any LLM prompt is built. Without an LLM key, nothing leaves your infrastructure. Passwords are scrypt-hashed with per-user salts; session tokens are HMAC-SHA256 signed; API keys are stored as SHA-256 hashes.

Licence: MIT, including the framework YAML definitions. Correct them, fork them, remove what you do not need.

---

## Contributing

The highest-value contribution is a **correction to a framework YAML file**. If you believe an article, deadline, citation or remediation is wrong, open a pull request with the reference — that is faster than any vendor roadmap.

```bash
pnpm install && pnpm build && pnpm test
```
