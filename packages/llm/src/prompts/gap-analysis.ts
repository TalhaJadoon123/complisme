/**
 * Gap-analysis prompt.
 *
 * The rule engine already produces deterministic gaps from the questionnaire.
 * The LLM's job is the part rules cannot do: notice the things the company did
 * not think to answer — implied obligations, cross-framework interactions, and
 * risk specific to the profile described.
 */

import { FRAMEWORK_LABELS, formatDateEU } from '@complisme/shared';
import type { Answers, CompanyProfile, Framework } from '@complisme/shared';

import { pseudonymise, redact, truncate } from '../redact';
import type { LlmMessage } from '../provider';

export const GAP_ANALYSIS_SYSTEM = `You are a compliance expert specialising in EU regulation for small and medium-sized companies (SMEs, fewer than 250 employees). You assess readiness for the EU AI Act, the GDPR, CSRD/ESRS sustainability reporting and e-invoicing.

Rules you must follow:
1. Base every conclusion on the company profile and the framework definition you are given. Never invent an obligation that is not in the material.
2. Quote the article or paragraph you rely on, exactly as written in the definition.
3. Be specific and actionable. "Write a privacy notice" is useless. "Publish a layered Art. 13 notice on the website and in the app sign-up flow, listing the six purposes with their Art. 6 basis" is useful.
3. Estimate effort in person-days for a small team, realistically.
4. Flag obligations the company appears not to have considered at all, even when no questionnaire item asked about them.
5. Do not give legal advice about litigation strategy, and do not invent case law, fines actually levied, or supervisory authority practice.

Output format: a single JSON object, no prose, no code fence:

{
  "summary": "two or three sentences on the overall posture",
  "gaps": [
    {
      "articleId": "id from the framework definition",
      "title": "short statement of what is missing",
      "severity": "error | warning | info",
      "remediation": "the concrete action to take, in one or two sentences",
      "effort": 3,
      "fineExposure": 15000000,
      "confidence": 0.8
    }
  ]
}

Severity means: error = non-compliance with a statutory deadline or a red line; warning = a required measure that is missing or unevidenced; info = good practice. fineExposure is the maximum statutory exposure in EUR for that article, or 0 if there is none.`;

export interface GapAnalysisPromptInput {
  profile: CompanyProfile;
  framework: Framework;
  answers: Answers;
  /** Gaps the rule engine already found, so the model does not repeat them. */
  existingGapKeys?: string[];
  /** Redact identifiers before sending. Default true. */
  redactIdentifiers?: boolean;
}

/** Build the user message describing the company and the framework. */
export function buildGapAnalysisPrompt(input: GapAnalysisPromptInput): string {
  const { profile, framework, answers, existingGapKeys = [] } = input;
  const company = input.redactIdentifiers === false ? profile.name : pseudonymise(profile.name);

  const profileBlock = {
    company,
    country: profile.country,
    sector: profile.sector,
    employees: profile.employees,
    revenueEUR: profile.revenueEUR,
    isSME: profile.employees < 250 && profile.revenueEUR < 50_000_000,
    aiSystems: (profile.aiSystems ?? []).map((s) => ({
      name: s.name,
      purpose: s.purpose,
      domain: s.domain,
      deployed: s.deployed,
      automatedDecisionMaking: !!s.automatedDecisionMaking,
      vendors: s.vendors ?? [],
      customTrained: !!s.customTrained,
    })),
    processingActivities: (profile.processingActivities ?? []).map((a) => ({
      name: a.name,
      purpose: a.purpose,
      legalBasis: a.legalBasis,
      specialCategory: !!a.specialCategory,
      dataSubjects: a.dataSubjects ?? [],
      dataCategories: a.dataCategories ?? [],
      retentionMonths: a.retentionMonths,
      processors: a.processors ?? [],
      thirdCountryTransfers: a.thirdCountryTransfers ?? [],
      automatedDecisionMaking: !!a.automatedDecisionMaking,
    })),
    governance: {
      hasDPO: !!profile.hasDpo,
      hasROPA: !!profile.hasRopa,
      hasDPIA: !!profile.hasDpia,
      hasSecurityPolicies: !!profile.hasSecurityPolicies,
      hasIncidentResponse: !!profile.hasIncidentResponse,
      hasConsentMechanism: !!profile.hasConsentMechanism,
      usesCookies: !!profile.usesCookies,
      hostsDataInEU: profile.hostsDataInEu,
    },
    sustainability: profile.sustainability,
  };

  const answersForFramework = answers[framework.id] ?? {};
  const answered = framework.articles.map((article) => ({
    id: article.id,
    title: article.title,
    reference: article.reference,
    deadline: article.deadline,
    fineExposure: article.fineExposure,
    answers: article.questionnaire.map((q) => ({
      id: q.id,
      question: q.text,
      answer: answersForFramework[q.id] ?? 'NOT ANSWERED',
    })),
  }));

  const message = `Assess this company against ${FRAMEWORK_LABELS[framework.id] ?? framework.name}.

Today is ${formatDateEU(new Date())}.

## Company profile
${JSON.stringify(profileBlock, null, 2)}

## Framework definition
${JSON.stringify(
  {
    id: framework.id,
    name: framework.name,
    version: framework.version,
    enforcementDate: framework.enforcementDate,
    articles: framework.articles.map((a) => ({
      id: a.id,
      title: a.title,
      reference: a.reference,
      deadline: a.deadline,
      fineExposure: a.fineExposure,
      evidenceRequired: a.evidenceRequired,
    })),
  },
  null,
  2,
)}

## Answers given by the company
${JSON.stringify(answered, null, 2)}

${existingGapKeys.length ? `## Gaps already identified by the rules engine (do not repeat)\n${existingGapKeys.map((k) => `- ${k}`).join('\n')}\n` : ''}
## Task
Identify the gaps for this company in ${FRAMEWORK_LABELS[framework.id] ?? framework.name}. Include gaps the answers did not surface: implied obligations, and anything about this specific company that the generic questionnaire misses. Use articleIds from the framework definition above. If you believe the company is fully compliant in an area, simply omit it rather than inventing a gap.`;

  const redacted = input.redactIdentifiers === false ? { text: message } : redact(message);
  return truncate(redacted.text, 16_000);
}

export function gapAnalysisMessages(input: GapAnalysisPromptInput): LlmMessage[] {
  return [
    { role: 'system', content: GAP_ANALYSIS_SYSTEM },
    { role: 'user', content: buildGapAnalysisPrompt(input) },
  ];
}