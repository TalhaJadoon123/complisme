---
title: Codebase scanner
order: 5
description: What the scanner detects, how findings map to articles, and its limits.
---

# Codebase scanner

The scanner reads your source files, detects patterns that carry regulatory consequences, and maps each one to the articles it engages.

This is the part competitors do not have. "You have an unreviewed data store" is a code smell; "your data store writes personal data with no retention rule, which engages GDPR Art. 5(1)(e) storage limitation, Art. 30 ROPA and Art. 32 security" is a compliance finding you can assign to someone.

## Running it

```bash
complisme scan ./src
complisme scan ./src --gaps
complisme scan ./src --ruleset gdpr --fail-on critical
```

Via the API:

```bash
curl -X POST localhost:4000/api/v1/scan \
  -H 'content-type: application/json' -d '{"path":"src"}'
```

The scanner **reads files and nothing else**. It never executes your code, never resolves your dependencies, makes no network calls, and sends nothing anywhere.

## Languages

| Language | Parser |
|---|---|
| TypeScript, JavaScript, TSX, JSX | TypeScript compiler API (real AST) |
| Python | Built-in tokeniser with string/comment/indent awareness |
| Go | Built-in tokeniser |
| Optional | tree-sitter WASM, if `TREE_SITTER_WASM_DIR` is configured |

The built-in parsers normalise to a single `SourceEvent` stream — calls, assignments, declarations, logs and literals — so a rule written once works across all three languages.

tree-sitter is supported through a `TreeSitterParser` that loads `web-tree-sitter` plus grammar `.wasm` files when available. It is optional by design: the scanner must run in a container with no native compilation step.

## Rules

| Rule id | Category | Severity | Maps to |
|---|---|---|---|
| `consent/missing-before-processing` | consent | high | GDPR Art. 6, Art. 5 |
| `consent/capture` | consent | info | GDPR Art. 7, Art. 5 |
| `pii/collection` | pii-collection | medium | GDPR Art. 5, Art. 30, Art. 13 |
| `pii/special-category` | sensitive-data | critical | GDPR Art. 6, Art. 35; AI Act Art. 10 |
| `gdpr/biometric` | biometric | critical | GDPR Art. 6, Art. 35; AI Act Art. 5 |
| `gdpr/profiling` | profiling | high | GDPR Art. 5, Art. 35; AI Act Art. 5 |
| `ai-act/pii-to-model` | ai-api-call | critical | AI Act Art. 10, Art. 9; GDPR Art. 5, Chapter V |
| `ai-act/api-call` | ai-api-call | info | AI Act Art. 6, Art. 50, Art. 4; GDPR Art. 6, Chapter V |
| `gdpr/personal-data-logging` | personal-data-logging | high | GDPR Art. 32, Art. 5, Art. 30 |
| `gdpr/unstructured-logging` | unstructured-storage | medium | GDPR Art. 5, Art. 32 |
| `gdpr/no-retention-on-store` | retention | medium | GDPR Art. 5, Art. 30 |
| `gdpr/retention` | retention | info | GDPR Art. 5, Art. 30 |
| `gdpr/external-transfer` | data-transfer | high | GDPR Art. 28, Chapter V, Art. 30 |
| `gdpr/cookie-consent` | cookie-consent | high | GDPR Art. 6, Art. 5 |
| `security/no-encryption` | encryption | medium | GDPR Art. 32; AI Act Art. 15 |
| `security/hardcoded-secret` | access-control | high | GDPR Art. 32 |

The full machine-readable set, including the confidence of each detector and the reason behind every mapping, is available at `GET /api/v1/rules`.

## Confidence

Every finding carries a confidence score, because a static scanner that presents every heuristic as a certainty is worse than useless.

- A direct AST match — a call to `openai.chat.completions.create` with an argument matching `/[a-z]{2,}@[a-z]/i` — scores around 0.8.
- An inferred match — no `encrypt` token anywhere in the file, but a database client with no SSL option — scores around 0.45.

Treat anything below 0.6 as a prompt to look, not a finding to file.

## Data-flow graph

The scanner reconstructs a coarse graph of PII-bearing identifiers, transforms and sinks. It is not a full taint analysis; it is a way to answer "where does this email actually go?" in one screen. Edges into AI providers are marked `crossesBorder: true`, because that is the question that matters.

## Limits

Be clear about what it does not do:

- It does not follow values across modules. A `Customer` type imported from another package is not traced to where its fields are written.
- It does not resolve dynamic dispatch. A call through a factory or a reflection-based ORM is invisible.
- It cannot prove absence. `security/no-encryption` fires because encryption is *not visible*, not because it is *absent* — which is why it is a medium-confidence finding.
- It says nothing about runtime behaviour, database contents or organisational process.

A large part of GDPR compliance is organisational: who decides, who reviews, what happens on a breach. No static analyser can see that. The scanner covers the codebase-shaped part and is explicit about the rest.

## Excludes

`node_modules`, `.git`, `.next`, `dist`, `build`, `out`, `coverage`, `vendor`, `venv`, `__pycache__`, `target`, `bin`, `obj`, migrations, lockfiles and snapshots are skipped by default. Add more with `--exclude`.

Scan volume is bounded by `maxFiles` (default 5000) and a 1.5 MB per-file limit, so pointing it at a monorepo root will not hang.