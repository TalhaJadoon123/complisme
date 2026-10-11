---
title: REST API
order: 3
description: Endpoints, authentication and request/response shapes.
---

# REST API

Base URL: `http://localhost:4000` by default.

Every response is JSON. Errors share one shape:

```json
{ "error": "validation_error", "message": "…", "statusCode": 400, "details": {} }
```

## Authentication

```bash
TOKEN=$(curl -s -X POST localhost:4000/api/v1/auth/signup \
  -H 'content-type: application/json' \
  -d '{"email":"a@b.eu","password":"Test12345","companyName":"Acme BV","country":"NL"}' \
  | jq -r .token)

curl localhost:4000/api/v1/auth/me -H "Authorization: Bearer $TOKEN"
```

Tokens are HMAC-SHA256 signed and expire in seven days.

For machine access, set `API_STATIC_KEYS` to a comma-separated list and send the key as a bearer token, with `x-company-id` for scoping:

```bash
curl localhost:4000/api/v1/scan \
  -H "Authorization: Bearer $INTEGRATION_KEY" \
  -H "x-company-id: $COMPANY_ID" \
  -H 'content-type: application/json' \
  -d '{"path":"src"}'
```

## Endpoints

### Public

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness, database kind, capabilities |
| GET | `/api/v1/frameworks` | Framework summaries (`?full=true` for everything) |
| GET | `/api/v1/frameworks/:id` | One framework with deadlines |
| GET | `/api/v1/rules` | Every scanner rule and the articles it maps to |
| GET | `/api/v1/pricing` | Plan matrix and upcoming deadlines |
| GET | `/api/v1/ai/status` | LLM provider configuration and reachability |

### Auth

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/auth/signup` | Create account and company, returns a token |
| POST | `/api/v1/auth/login` | Exchange credentials for a token |
| GET | `/api/v1/auth/me` | Current user, company and subscription |

### Assessment

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/assess` | Run the engine; persists scores and gaps |
| POST | `/api/v1/assess/preview` | Score without persisting (onboarding) |
| GET | `/api/v1/companies/:id/status` | Scores, gaps, deadlines, countdowns |
| GET | `/api/v1/companies/:id/roadmap` | The phased plan (`?horizon=90`) |
| PATCH | `/api/v1/gaps/:id` | `{ "status": "in_progress" }` |

`POST /api/v1/assess` requires either `companyId` or `profile`.

```bash
curl -X POST localhost:4000/api/v1/assess \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{
        "companyId": "acme-saas",
        "answers": { "gdpr": { "a5-q1": "documented", "a30-q1": "complete-and-reviewed" } },
        "useLLM": false
      }'
```

The response carries `overall`, `grade`, `scores[]`, `gaps[]`, a `summary` and the company `facts` used for scoring.

### Documents

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/generate` | Produce a document |
| GET | `/api/v1/documents?companyId=` | Library with version history |

```bash
curl -X POST localhost:4000/api/v1/generate \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"companyId":"acme-saas","kind":"gdpr-dpia","format":"pdf","save":true}'
```

`kind` is one of: `ai-act-annex-iv`, `ai-act-risk-register`, `ai-act-conformity-declaration`, `gdpr-ropa`, `gdpr-dpia`, `gdpr-dsr-response`, `gdpr-tom`, `consent-notice`, `nda-dpa`, `csrd-report`, `esrs-datapoint`, `einvoice-validation-report`, `compliance-roadmap`.

### Scanner

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/scan` | Scan a path, return findings and derived gaps |

```bash
curl -X POST localhost:4000/api/v1/scan \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"path":"src","ruleset":"all"}'
```

The path must resolve inside `SCAN_ROOT` (defaults to the API working directory); traversal outside it is rejected.

### Evidence

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/companies/:id/evidence` | List evidence |
| POST | `/api/v1/companies/:id/evidence` | Add evidence |
| DELETE | `/api/v1/companies/:id/evidence/:evidenceId` | Remove evidence |

### AI

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/ai/status` | Provider status |
| POST | `/api/v1/ai/ask` | Free-form compliance question |

`/api/v1/ai/ask` returns `503` with a clear message when no provider is configured. Everything else works without one.

### Subscription

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/subscription` | Change plan |

Without `STRIPE_SECRET_KEY` the plan is applied directly, which is the intended behaviour for self-hosted installs.

## Limits

Rate limiting is 300 requests per minute by default (`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW`). Plan quotas are enforced per company per calendar month; exceeding one returns `429 quota_exceeded` or `402 plan_limit`.

## Running the end-to-end test

```bash
node packages/api/scripts/e2e.mjs http://localhost:4000
```

55 assertions covering health, catalogue, auth, assessment, roadmap, evidence, gaps, generation, scanning, AI status, subscription and error handling.