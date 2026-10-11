---
title: Deployment
order: 6
description: Self-hosting with Docker, environment variables, and the deployment checklist.
---

# Deployment

CompliSME self-hosts cleanly. Nothing leaves your network, and no third-party account is required.

## The fastest path

```bash
git clone <your-fork> complisme
cd complisme
cp .env.example .env
docker compose up -d
```

The API is on `http://localhost:4000`, the web app on `http://localhost:3000`, the docs on `http://localhost:3001`.

## Without Docker

```bash
pnpm install
pnpm build

# API
pnpm --filter @complisme/api run start

# Web
NEXT_PUBLIC_API_URL=http://localhost:4000 pnpm --filter @complisme/web run start
```

The API works with no database at all — set no `DATABASE_URL` and it runs on an in-memory store, which is correct for a single-user CLI-grade install and useless for a real deployment. Use PostgreSQL for anything persistent.

## Database

```bash
docker run -d --name complisme-db -p 5432:5432 \
  -e POSTGRES_USER=complisme -e POSTGRES_PASSWORD=complisme \
  -e POSTGRES_DB=complisme postgres:16-alpine

# Apply the schema
pnpm --filter @complisme/api exec drizzle-kit push

# Optional demo data
pnpm run seed
```

The schema lives in `packages/api/src/db/schema.ts`: `users`, `companies`, `subscriptions`, `assessments`, `gaps`, `evidence`, `documents`, `document_versions`, `api_keys`, `usage_events`.

For migrations under version control, use `drizzle-kit generate` instead of `push`.

## Environment variables

### Required in production

| Variable | Notes |
|---|---|
| `AUTH_SECRET` | Signs session tokens. Generate with `openssl rand -hex 32`. The API warns loudly if you leave the default. |
| `DATABASE_URL` | `postgres://user:pass@host:5432/db`. Omit for the in-memory store. |
| `API_CORS_ORIGIN` | Comma-separated allowed origins. |

### Recommended

| Variable | Notes |
|---|---|
| `API_PORT` | Default `4000` |
| `API_HOST` | Default `0.0.0.0` |
| `API_STATIC_KEYS` | Comma-separated integration keys |
| `STORAGE_DIR` | Where generated documents are written |
| `SCAN_ROOT` | Directory the scanner is confined to (defaults to cwd) |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW` | Default `300` / `1 minute` |
| `NODE_ENV` | `production` enables strict auth checks |

### Optional — AI

| Variable | Notes |
|---|---|
| `OPENAI_API_KEY` | Also works with any OpenAI-compatible base URL via `OPENAI_BASE_URL` |
| `OPENAI_MODEL` | Default `gpt-4o-mini` |
| `ANTHROPIC_API_KEY` | Default model `claude-3-5-sonnet-latest` |
| `OLLAMA_BASE_URL` | Local models, default `http://localhost:11434` |
| `LLM_PROVIDER` | Force `openai`, `anthropic` or `ollama` |

Detection order is explicit override, then OpenAI, then Anthropic, then Ollama. Everything works without any of them.

### Optional — PDF

| Variable | Notes |
|---|---|
| `PUPPETEER_EXECUTABLE_PATH` | Path to an existing Chrome/Chromium |

The Docker image ships Chromium, so this is only needed for a bare-metal install. Without it, PDF generation falls back to HTML and DOCX, which need no browser.

### Optional — billing

| Variable | Notes |
|---|---|
| `STRIPE_SECRET_KEY` | Enables real billing |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification |
| `STRIPE_PRICE_STARTER` / `_BUSINESS` / `_ENTERPRISE` | Price ids |

Without these, `POST /api/v1/subscription` applies the plan directly and reports `billingEnabled: false`. That is deliberate: it is the correct behaviour for a self-hosted install where the operator is the billing department.

## Docker services

`docker-compose.yml` defines:

| Service | Port | Notes |
|---|---|---|
| `postgres` | 5432 | Persistent volume |
| `api` | 4000 | Depends on postgres healthcheck |
| `web` | 3000 | `NEXT_PUBLIC_API_URL` baked at build time |
| `docs` | 3001 | Static documentation |

## Production checklist

- [ ] `AUTH_SECRET` set to a random 32-byte value
- [ ] `NODE_ENV=production`
- [ ] `DATABASE_URL` pointing at a real PostgreSQL with backups
- [ ] `API_CORS_ORIGIN` restricted to your actual domain
- [ ] `API_STATIC_KEYS` configured if you use integrations
- [ ] TLS terminated in front of the API
- [ ] `STORAGE_DIR` on a volume with the retention policy you want
- [ ] `SCAN_ROOT` restricted so the scanner cannot be pointed at `/`
- [ ] `pnpm test` and `node packages/api/scripts/e2e.mjs` passing in CI
- [ ] Rate limits tuned for your traffic

## Resource requirements

The API is small: it needs ~256 MB of memory, plus Chromium when rendering PDFs. The web app is a static export with a ~103 kB shared bundle. Two `alpine`-sized containers plus PostgreSQL is a comfortable small-production deployment.

The resource-intensive part is the scanner: parsing thousands of files is CPU-bound and single-threaded. For a monorepo, scan the relevant packages rather than the root.

## Backups

Two things matter:

1. **The database.** Everything the product stores. `pg_dump` is sufficient.
2. **`STORAGE_DIR`.** Generated documents. A generated document is reproducible from the company profile and answers, but keeping the files means keeping the exact version you sent to a customer.

## Monitoring

`GET /health` returns the database kind, capabilities and the loaded framework list — suitable as a container healthcheck:

```yaml
healthcheck:
  test: ['CMD', 'node', '-e', "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
  interval: 30s
  timeout: 5s
  retries: 3
```