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
  web/          Next.js app: marketing, onboarding, dashboard, documents, roadmap
  docs/         Next.js documentation site (markdown from packages/docs/content)
```

Dependency direction is strictly downward: `shared → frameworks → core → {generator, scanner, llm} → {cli, api} → {web, docs}`.

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
| `API_STATIC_KEYS` | — | Comma-separated integration keys for machine access |
| `STORAGE_DIR` | `.data/documents` | Where generated documents are written |
| `SCAN_ROOT` | API cwd | The scanner refuses any path outside this |
| `RATE_LIMIT_MAX` | `300` | Requests per window |
| `RATE_LIMIT_WINDOW` | `1 minute` | |
| `NODE_ENV` | — | `production` enables strict auth checks |

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
complisme status-all
```

Global: `--dir <path>`, `--global`, `--json`, `--yes`.

Document kinds: `ai-act-annex-iv`, `ai-act-risk-register`, `ai-act-conformity-declaration`, `gdpr-ropa`, `gdpr-dpia`, `gdpr-dsr-response`, `gdpr-tom`, `consent-notice`, `nda-dpa`, `csrd-report`, `esrs-datapoint`, `einvoice-validation-report`, `compliance-roadmap`.

CI usage:

```bash
complisme --json gap > gaps.json
complisme scan ./src --fail-on critical --write scan.json || exit 1
```

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
| POST | `/api/v1/assess/preview` | — | Score without persisting |
| GET | `/api/v1/companies/:id/status` | ✓ | Scores, gaps, deadlines, countdowns |
| GET | `/api/v1/companies/:id/roadmap` | ✓ | The phased plan (`?horizon=90`) |
| PATCH | `/api/v1/gaps/:id` | ✓ | `{ "status": "in_progress" }` |
| POST | `/api/v1/generate` | ✓ | Produce a document |
| GET | `/api/v1/documents` | ✓ | Library with version history |
| POST | `/api/v1/scan` | ✓ | Scan a path, return findings and gaps |
| GET/POST | `/api/v1/companies/:id/evidence` | ✓ | Evidence library |
| DELETE | `/api/v1/companies/:id/evidence/:id` | ✓ | Remove evidence |
| POST | `/api/v1/ai/ask` | ✓ | Free-form compliance question |
| POST | `/api/v1/subscription` | ✓ | Change plan |

Authenticate with `Authorization: Bearer <token>`. Machine access: set `API_STATIC_KEYS` and send the key as a bearer token with `x-company-id` for scoping.

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

## Testing

```bash
pnpm test                      # 227 tests across 9 files
pnpm test:coverage             # with coverage and thresholds
pnpm test:core                 # core package only, with its 80% floor
pnpm test:e2e                  # 55 assertions against a running API
```

| Suite | Tests | Covers |
|---|---|---|
| `core` | 42 | Engine, scoring, gap analysis, roadmap, profile helpers |
| `api` | 36 | Every route, auth, repository, seed |
| `llm` | 27 | Redaction, prompts, all three providers, graceful degradation |
| `shared` | 30 | Constants, utils, scoring semantics, markdown, schemas |
| `frameworks` | 28 | Registry, YAML validation, applicability, penalty model |
| `generator` | 24 | All 13 document kinds, HTML, DOCX, branding |
| `cli` | 21 | Workspace, answer parsing, output rendering, program definition |
| `scanner` | 19 | Parsers, all rules, data flow, gap derivation |

Measured coverage: **84.6% statements, 73.1% branches, 77.1% functions overall**; the compliance engine specifically is at **96.5% statements / 93.8% functions**, enforced by an 80% floor.

The E2E script runs against a live server:

```bash
pnpm dev:api &
node packages/api/scripts/e2e.mjs http://localhost:4000
```

---

## Project status

**Working and tested end to end:**

- All 10 packages build from a clean checkout
- 227 unit/integration tests pass; 55 E2E assertions pass against a running server
- The CLI runs the full flow: init → answer → status → gap → roadmap → scan → generate
- Real PDFs (140–166 KB) and valid OOXML DOCX files are produced on disk
- The scanner parses TypeScript, Python and Go and maps findings to articles
- The API serves all 22 endpoints with auth, rate limiting and quota enforcement
- The web app builds 10 static routes; the docs site prerenders 7 pages
- Docker Compose defines 4 services with healthchecks

**Not built — deliberately scoped out:**

- Stripe webhook handler. The plan-change endpoint works and applies plans directly; the webhook that syncs subscription state is not implemented.
- Password reset, email verification and transactional email.
- OAuth / SSO. Email + password only.
- Server-side sessions. JWT in `localStorage`; appropriate for a single-tenant self-hosted install, not for a shared multi-tenant SaaS without adding refresh tokens and httpOnly cookies.
- Multi-tenancy beyond one company per user.
- Webhooks and scheduled re-assessment.

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
