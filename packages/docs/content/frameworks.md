---
title: Framework definitions
order: 4
description: The regulatory content, its YAML format, and how to fork it.
---

# Framework definitions

All regulatory content lives as YAML in `packages/frameworks/definitions/`. It is the single source of truth for the engine, the documents and the scanner mappings — and it is designed to be forked.

| File | Framework |
|---|---|
| `eu-ai-act.yaml` | EU AI Act (Regulation (EU) 2024/1689) |
| `csrd.yaml` | CSRD / ESRS |
| `gdpr.yaml` | GDPR (Regulation (EU) 2016/679) |
| `e-invoicing.yaml` | ViDA + Brazilian NF-e / NFS-e |

## Structure

```yaml
id: gdpr
name: General Data Protection Regulation
shortName: GDPR
version: "Regulation (EU) 2016/679"
jurisdiction: European Union / EEA
enforcementDate: "2018-05-25"

articles:
  - id: art-30-ropa
    title: "Article 30 — Records of processing activities (ROPA)"
    description: >
      A controller must maintain a written record of processing activities…
    reference: "Regulation (EU) 2016/679, Art. 30"
    deadline: "2018-05-25"
    fineExposure: 10000000
    weight: 2.25

    evidenceRequired:
      - ROPA covering every processing activity with purposes and retention
      - Evidence of regular review (date, reviewer)

    questionnaire:
      - id: a30-q1
        text: Does a complete record of processing activities exist?
        type: single
        weight: 3
        citation: Art. 30
        effort: 5
        remediation: Generate the ROPA from your company profile…
        options:
          - value: complete-and-reviewed
            label: Complete and reviewed
            satisfies: true
          - value: complete
            label: Complete, never reviewed
            satisfies: false
          - value: no
            label: Does not exist
            satisfies: false
          - value: not-required
            label: Not applicable
            notApplicable: true
```

## Fields

### Article

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Stable identifier, referenced by scanner mappings |
| `title` | yes | Human readable, used in documents |
| `description` | no | Explanatory prose |
| `evidenceRequired` | yes | Artefacts an auditor will ask for |
| `questionnaire` | yes | The questions |
| `weight` | no | Importance inside the framework (default 1) |
| `deadline` | no | ISO date; drives roadmap sequencing |
| `fineExposure` | no | Maximum statutory exposure in EUR |
| `reference` | no | Citation used in generated documents |

### Question

| Field | Meaning |
|---|---|
| `id` | Unique within the framework |
| `text` | The question as asked |
| `type` | `boolean`, `single`, `multi`, `number`, `text` |
| `weight` | Importance inside the article (default 1) |
| `options` | For `single`/`multi`; `satisfies: false` marks non-compliance, `notApplicable: true` excludes the article |
| `remediation` | Concrete action when unanswered or non-compliant |
| `effort` | Person-days to remediate (default 3) |
| `citation` | Article reference shown in output |
| `showIf` | Conditional display |

## Scoring

Each answer resolves to a verdict: `pass`, `fail`, `na` or `unknown`.

- **Pass** earns the full question weight.
- **Not applicable** is treated as compliant and removes the question from the denominator — but only if the article has at least one applicable question left, otherwise the article is excluded entirely.
- **Unanswered** is penalised: the question keeps its weight but scores zero, and the gap is created at reduced severity. This is deliberate. An unanswered question is not a compliant one, and pretending otherwise is how SMEs get surprised.

Article scores are weighted averages, then reduced by up to 10% in proportion to missing evidence — an article you cannot evidence cannot score full marks. Framework scores are weighted averages of applicable articles, and the overall score damps the weighting logarithmically so the AI Act's €15M caps do not drown out CSRD's €3M.

## Adding a framework

1. Create `packages/frameworks/definitions/<id>.yaml`.
2. Rebuild: `pnpm --filter @complisme/frameworks run build` (this validates and copies the definitions).
3. Confirm: `complisme frameworks --json`.

The loader validates every file against a Zod schema at import time and throws on the first problem, naming the file and the failing path. Invalid YAML fails fast rather than silently scoring zero.

## Adding an article to an existing framework

Just edit the YAML. The engine, the dashboard, the roadmap and the document templates all read from the definition, so a new article immediately appears in the questionnaire, the scoring and the generated documents.

## Penalty model

`packages/frameworks/src/fines.ts` implements the "higher of fixed amount or turnover percentage" caps:

| Framework | Fixed cap | Turnover rate |
|---|---|---|
| EU AI Act (prohibited) | €35M | 7% |
| GDPR | €20M | 4% |
| CSRD | €3M | — |
| E-invoicing | €50,000 | — |

Adjust these when a regulation changes.