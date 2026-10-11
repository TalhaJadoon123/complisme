/**
 * Document-drafting prompts.
 *
 * The templates provide structure, facts and the compliance scaffolding; the
 * model writes the narrative that a human would otherwise spend an afternoon
 * writing: the purpose and scope prose, the risk descriptions, the measures,
 * the rationale for accepting residual risk.
 */

import { FRAMEWORK_LABELS, formatDateEU } from '@complisme/shared';
import type { Answers, CompanyProfile, DocumentKind, Framework, Gap } from '@complisme/shared';

import { pseudonymise, redact, truncate } from '../redact';
import type { LlmMessage } from '../provider';

export const DOCUMENT_SYSTEM = `You write compliance documents for small and medium-sized European companies. Your reader is the founder, the operations manager or the external accountant — a competent professional, not a lawyer, who needs a document they can hand to a customer, an auditor or a regulator.

Rules:
1. Write in plain English. Short sentences. No legalese, no "hereinbefore", no "in the event that".
2. Be concrete. Name the actual system, the actual data, the actual people, the actual dates given in the input.
3. Cite the article you are relying on inline, naturally: "GDPR Article 35(1) requires a DPIA where processing is likely to result in a high risk".
4. Never state that something is compliant when the input says it is not. If a fact is missing, write "TO BE COMPLETED: <what is needed>" rather than inventing it.
5. Do not invent facts about the company. Only use the information provided.
6. Do not give legal advice or promise that a document makes the company compliant.
7. Return a single JSON object, no prose, no code fence.

Output format:
{
  "sections": [
    { "heading": "Section heading", "body": "2-5 paragraphs of prose, separated by \\n\\n", "wordCount": 180 }
  ]
}`;

export type DraftSectionId =
  | 'intro'
  | 'scope'
  | 'data'
  | 'monitoring'
  | 'oversight'
  | 'risk'
  | 'measures'
  | 'conclusion'
  | 'description'
  | 'materiality'
  | 'valueChain'
  | 'basis'
  | 'summary';

export interface DocumentDraftInput {
  kind: DocumentKind;
  profile: CompanyProfile;
  framework?: Framework;
  answers?: Answers;
  gaps?: Gap[];
  scores?: Array<{ frameworkId: string; score: number; grade?: string }>;
  /** Section ids the template asked for, with the guidance for each. */
  sections?: Array<{ id: DraftSectionId; instruction: string; minWords?: number }>;
  redactIdentifiers?: boolean;
}

/** Per-document-kind section plan with instructions. */
export const SECTION_PLANS: Record<string, Array<{ id: DraftSectionId; instruction: string; minWords: number }>> = {
  'ai-act-annex-iv': [
    {
      id: 'intro',
      instruction:
        'Purpose and scope: why this technical documentation exists, which AI Act obligations it evidences, and the simplified Annex IV model used for SMEs. Explain why a small company can document proportionally.',
      minWords: 120,
    },
    {
      id: 'data',
      instruction:
        'Design specifications and data: describe where the data comes from, how it is used for the model, what quality controls exist, and what happens to it afterwards. Cover the Art. 10 obligations.',
      minWords: 150,
    },
    {
      id: 'monitoring',
      instruction:
        'Monitoring and logging: describe what is logged on each inference, why, who can read it, and for how long. Connect it to the six-year traceability duty.',
      minWords: 120,
    },
    {
      id: 'oversight',
      instruction:
        'Human oversight: describe concretely who reviews output, what they check, and how they can override or stop the system.',
      minWords: 120,
    },
    {
      id: 'risk',
      instruction:
        'Risk management: summarise the risk management approach, the main risks identified for this system, and the mitigations applied.',
      minWords: 150,
    },
  ],
  'gdpr-dpia': [
    {
      id: 'description',
      instruction:
        'Systematic description: describe the processing in plain language, including who the data subjects are, what data is involved, the volume where known, and why the processing is likely to result in high risk under Art. 35(3).',
      minWords: 180,
    },
    {
      id: 'risk',
      instruction:
        'Risks to individuals: for each risk listed in the input, explain in plain language what could go wrong and who would be harmed. Avoid abstraction.',
      minWords: 200,
    },
    {
      id: 'measures',
      instruction:
        'Measures: describe the safeguards, why each one addresses a named risk, and how effectiveness would be evidenced.',
      minWords: 150,
    },
    {
      id: 'conclusion',
      instruction:
        'Conclusion: state the residual risk position and the conditions under which this assessment must be revisited.',
      minWords: 100,
    },
  ],
  'csrd-report': [
    {
      id: 'basis',
      instruction:
        'Basis of preparation: explain which ESRS standards are applied, what the reporting perimeter is, and how estimates were handled. Keep it factual and readable by a non-expert.',
      minWords: 150,
    },
    {
      id: 'materiality',
      instruction:
        'Double materiality: explain the two materiality directions in plain language and describe the process that was followed, including stakeholder input.',
      minWords: 200,
    },
    {
      id: 'valueChain',
      instruction:
        'Value chain: describe the upstream and downstream relationships that matter and how value-chain information was obtained or estimated.',
      minWords: 150,
    },
  ],
  'ai-act-risk-register': [
    {
      id: 'risk',
      instruction:
        'Describe the risk management approach, how risks were scored, and the thinking behind the highest-scoring risks for this company.',
      minWords: 200,
    },
  ],
  'compliance-roadmap': [
    {
      id: 'summary',
      instruction:
        'Write an executive summary of where this company stands against the EU AI Act, GDPR, CSRD and e-invoicing: what is the biggest risk, what should happen in the first month, and why the sequencing is what it is. Address the reader directly as "you".',
      minWords: 220,
    },
  ],
};

export function buildDocumentPrompt(input: DocumentDraftInput): string {
  const plan = input.sections ?? SECTION_PLANS[input.kind] ?? [];
  const company = input.redactIdentifiers === false ? input.profile.name : pseudonymise(input.profile.name);

  const facts = {
    company,
    kind: input.kind,
    country: input.profile.country,
    sector: input.profile.sector,
    employees: input.profile.employees,
    revenueEUR: input.profile.revenueEUR,
    aiSystems: (input.profile.aiSystems ?? []).map((s) => ({
      name: s.name,
      purpose: s.purpose,
      domain: s.domain,
      deployed: s.deployed,
      vendors: s.vendors ?? [],
    })),
    processingActivities: (input.profile.processingActivities ?? []).map((a) => ({
      name: a.name,
      purpose: a.purpose,
      legalBasis: a.legalBasis,
      specialCategory: !!a.specialCategory,
      dataCategories: a.dataCategories ?? [],
      retentionMonths: a.retentionMonths,
      thirdCountryTransfers: a.thirdCountryTransfers ?? [],
    })),
    governance: {
      hasDPO: !!input.profile.hasDpo,
      hasROPA: !!input.profile.hasRopa,
      hasDPIA: !!input.profile.hasDpia,
      hasIncidentResponse: !!input.profile.hasIncidentResponse,
      hasConsentMechanism: !!input.profile.hasConsentMechanism,
    },
    sustainability: input.profile.sustainability,
    notes: input.profile.notes,
  };

  const gaps = (input.gaps ?? [])
    .filter((g) => !input.framework || g.frameworkId === input.framework.id)
    .slice(0, 25)
    .map((g) => ({
      articleId: g.articleId,
      title: g.title,
      severity: g.severity,
      effort: g.effort,
      deadline: g.deadlineIso,
    }));

  const message = `Draft the narrative sections of a ${input.kind.replace(/-/g, ' ')} for the company described below.

Today is ${formatDateEU(new Date())}.

## Company
${JSON.stringify(facts, null, 2)}

${input.framework ? `## Framework\n${FRAMEWORK_LABELS[input.framework.id] ?? input.framework.name} (${input.framework.version ?? ''})\n` : ''}${
    input.scores?.length
      ? `## Current readiness scores\n${input.scores.map((s) => `- ${FRAMEWORK_LABELS[s.frameworkId] ?? s.frameworkId}: ${s.score}% (grade ${s.grade ?? 'n/a'})`).join('\n')}\n`
      : ''
  }
${gaps.length ? `## Open gaps\n${JSON.stringify(gaps, null, 2)}\n` : ''}
## Sections to write
${JSON.stringify(
  plan.map((p) => ({ id: p.id, instruction: p.instruction, minWords: p.minWords })),
  null,
  2,
)}

Return one entry in "sections" for each id requested, in the same order, using the requested id as the heading.`;

  const redacted = input.redactIdentifiers === false ? { text: message } : redact(message);
  return truncate(redacted.text, 16_000);
}

export function documentDraftMessages(input: DocumentDraftInput): LlmMessage[] {
  return [
    { role: 'system', content: DOCUMENT_SYSTEM },
    { role: 'user', content: buildDocumentPrompt(input) },
  ];
}