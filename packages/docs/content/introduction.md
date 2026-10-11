---
title: Introduction
order: 1
description: What CompliSME is, and what it deliberately is not.
---

# CompliSME

Multi-framework compliance for European SMEs. Four regulations, one assessment, one plan.

CompliSME is built for companies with fewer than 250 employees that now face EU AI Act, CSRD, GDPR and e-invoicing obligations simultaneously and have no compliance department. It exists because the enterprise tools assume you have one, and because the alternative — a €5,000–€50,000 consultancy engagement — is priced for companies that do.

## What it does

- **Scores you** against 41 regulatory articles across four frameworks, using 125 questions written for SMEs rather than lawyers.
- **Scans your codebase** and maps what it finds to the specific articles it engages: personal data written to logs, personal data stored without a retention rule, an AI API call carrying a customer's email address.
- **Generates documents** — Annex IV technical documentation, a ROPA, a DPIA, a CSRD sustainability statement, an e-invoicing validation report — as print-ready PDFs and editable DOCX.
- **Plans the work**: a 90-day roadmap sequenced by statutory deadline, then fine exposure, then effort.

## What it is not

CompliSME is not legal advice, and it does not try to be. Every generated document carries that notice. Have the output reviewed by a qualified lawyer or data protection officer before relying on it.

It also does not run your code, call out to your infrastructure, or upload your repository anywhere. The scanner reads files. That is all.

## The four frameworks

| Framework | Law | Scope | Articles |
|---|---|---|---|
| EU AI Act | Regulation (EU) 2024/1689 | Any AI system placed on the Union market | 16 |
| CSRD / ESRS | Directive (EU) 2022/2464 | Groups above the size thresholds | 8 |
| GDPR | Regulation (EU) 2016/679 | Any organisation processing personal data | 10 |
| E-invoicing | Directive (EU) 2024/2831 + NF-e | Cross-border EU and Brazilian operations | 7 |

Applicability is decided from your country, headcount, turnover and sector — a four-person Brazilian consultancy and a 140-person German supplier get different answers, and the tool tells you which.

## Three ways to use it

1. **CLI**, offline, no account: `complisme init && complisme roadmap`
2. **Self-hosted**, Docker Compose, your own database and your own LLM key
3. **Hosted**, €49/month with a web dashboard

All three run the same engine. The CLI and self-hosted modes need no API keys at all.

## Where to next

- [CLI reference](/docs/cli) — the fastest way to see the product working
- [REST API](/docs/api) — for integrations and CI
- [Framework definitions](/docs/frameworks) — the regulatory content, and how to fork it
- [The scanner](/docs/scanner) — what the codebase analysis actually detects
- [Deployment](/docs/deploy) — self-hosting, environment variables, Docker