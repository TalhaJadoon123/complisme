---
title: CLI reference
order: 2
description: Every complisme command, with examples.
---

# CLI reference

The CLI works entirely offline against a local workspace. No account, no server, no API key.

```bash
pnpm install
pnpm build
node packages/cli/dist/cli.js --help
```

For global use:

```bash
pnpm link --global   # or: npm install -g @complisme/cli
complisme --help
```

## Global options

| Option | Effect |
|---|---|
| `--dir <path>` | Workspace directory (default: current directory) |
| `--global` | Use `~/.complisme` instead of `./.complisme` |
| `--json` | Machine-readable output |
| `-y, --yes` | Skip interactive prompts |

State lives in `.complisme/` as plain JSON, so you can inspect it, diff it and commit it.

## init

Create a workspace and describe your company.

```bash
complisme init                              # interactive
complisme init --name "Acme BV" -c NL -e 9 --revenue 1250000
complisme init --demo                       # load a demo company
```

Prints which frameworks you are in scope for, with the reasoning, so you can sanity-check the answer immediately.

## answer

Record questionnaire answers.

```bash
complisme answer gdpr.a5-q1=documented gdpr.a30-q1=complete-and-reviewed
complisme answer --interactive --framework gdpr
complisme answer --clear gdpr.a5-q1
```

Answer syntax is `framework.question=value`. Boolean questions accept `true`/`yes` and `false`/`no`. Single-choice questions accept the option value or its 1-based index from the interactive prompt. Unknown question ids are stored but warned about, so a typo never silently disappears.

## status

Readiness scores, blocking gaps and deadlines.

```bash
complisme status
complisme status --json
complisme status --limit 25
```

## gap

List gaps, optionally enriched by the scanner and the LLM.

```bash
complisme gap --limit 40
complisme gap --severity error --framework eu-ai-act
complisme gap --scan ./src
complisme gap --ai                          # requires an LLM provider
```

## roadmap

Build the 90-day remediation plan.

```bash
complisme roadmap
complisme roadmap --horizon 180 --capacity 40
complisme roadmap --write plan.json --json
```

## scan

Scan a codebase and map findings to articles.

```bash
complisme scan ./src
complisme scan ./src --ruleset gdpr
complisme scan ./src --gaps
complisme scan ./src --fail-on high        # exit code 1 in CI
complisme scan ./src --write findings.json
```

## generate

Produce a document.

```bash
complisme generate --list
complisme generate --kind gdpr-dpia --format pdf
complisme generate --kind ai-act-annex-iv --format docx --ai
complisme generate --kind compliance-roadmap --scan ./src --out ./reports
```

Without Puppeteer, `--format pdf` falls back to HTML and tells you so. DOCX and HTML never need a browser.

## evidence

Attach evidence to framework articles.

```bash
complisme evidence list
complisme evidence add --framework gdpr --article art-30-ropa \
  --title "ROPA v3" --type record --note "Reviewed 2026-09"
```

## documents

List generated documents with their version history.

```bash
complisme documents
```

## frameworks

Inspect the bundled regulatory content.

```bash
complisme frameworks
complisme frameworks --json
```

## status-all

Environment diagnostics: workspace, PDF support, LLM provider, pricing.

```bash
complisme status-all
```

This is the first command to run if something is not behaving as expected.

## CI usage

```bash
complisme --json gap > gaps.json
complisme scan ./src --fail-on critical --write scan.json || echo "critical findings present"
```

## Environment variables

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Enable AI gap analysis and drafting |
| `ANTHROPIC_API_KEY` | Same, via Anthropic |
| `OLLAMA_BASE_URL` | Same, locally |
| `LLM_PROVIDER` | Force a provider: `openai`, `anthropic` or `ollama` |
| `PUPPETEER_EXECUTABLE_PATH` | Use an existing Chrome/Chromium for PDF |
| `TREE_SITTER_WASM_DIR` | Optional tree-sitter grammars directory |