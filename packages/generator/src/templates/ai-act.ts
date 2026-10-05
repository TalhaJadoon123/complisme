/**
 * EU AI Act templates:
 *  - Annex IV technical documentation (the SME simplified model, Annex IV(1)-(6))
 *  - Risk register (Art. 9)
 *  - Fundamental rights impact assessment (Art. 27 / Annex V)
 *  - Declaration of conformity (Art. 47)
 */

import { ComplianceEngine, profileFacts, roadmap as sortGaps } from '@complisme/core';
import {
  EU_AI_ACT_PHASES,
  formatDateEU,
  formatEuro,
  nowIso,
  stableId,
} from '@complisme/shared';
import type { Answers, CompanyProfile,  Gap } from '@complisme/shared';

import { html } from './shell';
import { TBC, createContext, rows, slug, type BuildInput } from './common';
import type { DocumentContext } from '../types';

const AI_SYSTEM_ROWS = (profile: CompanyProfile) =>
  (profile.aiSystems ?? []).map((system) => [
    escapeCell(system.name),
    escapeCell(system.purpose),
    escapeCell(system.domain),
    system.deployed ? 'Yes' : 'No',
    escapeCell((system.vendors ?? []).join(', ') || 'in-house'),
  ]);

function escapeCell(value: string): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Annex IV technical documentation
// ---------------------------------------------------------------------------

export function annexIV(input: {
  profile: CompanyProfile;
  answers?: Answers;
  gaps?: Gap[];
  systemName?: string;
  branding?: BuildInput['branding'];
  narrative?: Record<string, string>;
}): DocumentContext {
  const { profile, answers, gaps = [], narrative = {} } = input;
  const facts = profileFacts(profile);
  const system = (profile.aiSystems ?? [])[0];
  const relevant = gaps.filter((g) => g.frameworkId === 'eu-ai-act');

  const sections: DocumentContext['sections'] = [
    {
      id: 'annex4-intro',
      heading: 'Purpose and scope',
      level: 2,
      body:
        `<p>${narrative.intro ?? `This technical documentation is prepared under Annex IV, points 1 to 6, of Regulation (EU) 2024/1689 (the AI Act). It describes the AI system <strong>${escapeCell(input.systemName ?? system?.name ?? 'to be named')}</strong> as designed by ${escapeCell(profile.legalName ?? profile.name)}, for the purpose of <strong>${escapeCell(system?.purpose ?? TBC('intended purpose'))}</strong>. Where the AI Act offers a simplified technical documentation model for small mid-caps (Annex IV, point 1, second subparagraph), that model is used here: each section is kept proportional to the risk and complexity of the system rather than reproducing a template document unchanged.`}</p>`,
    },
    {
      id: 'annex4-1',
      heading: '1. General description of the AI system',
      level: 2,
      body: html.kv(
        rows([
          ['System name', escapeCell(system?.name ?? TBC('name'))],
          ['Intended purpose', escapeCell(system?.purpose ?? TBC('purpose'))],
          ['AI system identifier', `<code>${stableId('ais', system?.id ?? profile.id).slice(0, 12)}</code>`],
          ['Provider', escapeCell(profile.legalName ?? profile.name)],
          ['Place of establishment', escapeCell(profile.country)],
          ['Deployment status', system?.deployed ? 'In production' : 'Pre-deployment'],
          ['Third-party components', escapeCell((system?.vendors ?? []).join(', ') || 'None declared')],
          ['Custom training', system?.customTrained ? 'Yes' : 'No'],
          ['Classification (Art. 6)', relevant.some((g) => g.articleId === 'art-6-classification')
            ? `${html.status('partial', 'High-risk candidates identified')}`
            : html.status('ok', 'Not high-risk')],
        ]),
      ) +
        html.table(
          ['AI system', 'Purpose', 'Domain', 'Deployed', 'Vendors'],
          AI_SYSTEM_ROWS(profile),
          'Table 1 — AI systems covered by this documentation',
        ),
    },
    {
      id: 'annex4-2',
      heading: '2. Design specifications and data',
      level: 2,
      body:
        html.p(
          narrative.data ??
            `The system ${escapeCell(system?.customTrained ? 'is trained on data supplied by the provider.' : 'uses third-party models without provider-side training.')} Datasets used for training, validation and testing are documented under Article 10 with source, size, coverage, representativeness and cleansing steps.`,
        ) +
        html.kv(
          rows([
            ['Training data source', system?.customTrained ? 'Company-supplied data' : TBC('third-party model, no training by the provider')],
            ['Datasets referenced', TBC('dataset identifiers and datasheets')],
            ['Personal data in datasets', TBC('categories and legal basis')],
            ['Special categories (Art. 9 GDPR)', TBC('yes/no and Art. 9(2) exception')],
            ['Retention of datasets', TBC('period per dataset')],
          ]),
        ),
    },
    {
      id: 'annex4-3',
      heading: '3. Monitoring and logging',
      level: 2,
      body:
        html.p(
          narrative.monitoring ??
            `The system logs the input, the output, the model and prompt version, the user identity and the timestamp of each inference, retained for six years to satisfy Article 12 traceability. Logs that may contain personal data are treated as personal data themselves: they are access-controlled and their retention is limited.`,
        ) +
        html.ul([
          'Event type, timestamp and correlation identifier',
          'Model identifier and version, prompt template version',
          'Human override and acceptance events',
          'Error and fallback events',
          TBC('log storage location and access control matrix'),
        ]),
    },
    {
      id: 'annex4-4',
      heading: '4. Human oversight measures',
      level: 2,
      body:
        html.p(
          narrative.oversight ??
            `Human oversight is designed into the workflow: the reviewing person can see the system output together with its confidence and sources, can edit or reject the output, and can trigger a fallback to manual processing.`,
        ) +
        html.ul([
          'Named roles permitted to approve or reject an output',
          'Ability to stop the system (kill switch) and its location',
          'Training delivered to the overseeing personnel (AI literacy, Art. 4)',
          TBC('evidence of an override test'),
        ]),
    },
    {
      id: 'annex4-5',
      heading: '5. Accuracy, robustness and cybersecurity measures',
      level: 2,
      body:
        html.table(
          ['Property', 'Target', 'Evidence'],
          [
            ['Accuracy', TBC('metric and threshold per use case'), TBC('evaluation report')],
            ['Robustness', TBC('perturbation and out-of-distribution tests'), TBC('test report')],
            ['Prompt injection resistance', TBC('score from red-team pass'), TBC('security test report')],
            ['Availability', TBC('uptime objective'), TBC('monitoring dashboard')],
            ['Patch cadence', TBC('vulnerability remediation SLA'), TBC('patch log')],
          ],
          'Table 2 — Declared performance targets',
        ) +
        html.p('Results are measured on a documented evaluation set that did not participate in tuning.'),
    },
    {
      id: 'annex4-6',
      heading: '6. Risk management and post-market monitoring',
      level: 2,
      body:
        html.p(
          narrative.risk ??
            `The risk management system follows Article 9 and runs across the lifecycle: risks are identified at design, estimated, mitigated, and re-assessed when the model, the data or the intended purpose changes. Findings from post-market monitoring feed back into the register.`,
        ) +
        (relevant.length
          ? html.table(
              ['Article', 'Gap', 'Severity', 'Remediation', 'Owner / due'],
              relevant.slice(0, 12).map((g) => [
                escapeCell(g.articleId),
                escapeCell(g.title ?? ''),
                g.severity,
                escapeCell(g.remediation),
                TBC('assign'),
              ]),
              'Table 3 — Open high-risk items to close before placing the system on the market',
            )
          : html.p('No open Article 9-15 gaps were identified in the latest assessment.')),
    },
    {
      id: 'annex4-7',
      heading: '7. Declaration statements',
      level: 2,
      body: html.ul(
        [
          'The system described above was developed in accordance with Articles 9 to 15 of the AI Act.',
          'The system does not engage in a practice prohibited by Article 5.',
          'The documentation is kept up to date and will be re-issued on any substantial change.',
          TBC('signature block: name, role, date'),
        ],
      ),
    },
  ];

  return createContext({
    kind: 'ai-act-annex-iv',
    title: 'EU AI Act Annex IV — Technical documentation',
    subtitle: `${profile.name} · AI system: ${system?.name ?? 'to be named'}`,
    sections,
    profile,
    answers,
    gaps: relevant,
    narrative,
    branding: input.branding,
    extraMetadata: [
      ['AI Act general application', formatDateEU(EU_AI_ACT_PHASES.generalApplication)],
      ['Documentation model', facts.isSme ? 'Simplified (Annex IV, SMEs)' : 'Full'],
      ['Systems covered', String(facts.aiSystemCount)],
    ],
    disclaimer:
      input.branding?.footerNote ??
      'Prepared under Annex IV of Regulation (EU) 2024/1689. Items marked TO BE COMPLETED must be replaced with verified facts before the system is placed on the market. This document is a compliance working document, not legal advice.',
  });
}

// ---------------------------------------------------------------------------
// Risk register
// ---------------------------------------------------------------------------

export function riskRegister(input: {
  profile: CompanyProfile;
  gaps?: Gap[];
  branding?: BuildInput['branding'];
}): DocumentContext {
  const { profile, gaps = [] } = input;
  const systems = profile.aiSystems ?? [];
  const ordered = sortGaps(gaps.filter((g) => g.frameworkId === 'eu-ai-act'));
  const facts = profileFacts(profile);

  // Standard Art. 9 risk categories, seeded for every declared AI system.
  const seed: Array<{ title: string; desc: string; mitigation: string }> = [
    { title: 'Inaccurate or biased output', desc: 'The system produces incorrect or discriminatory outputs.', mitigation: 'Evaluation set, bias metrics per protected group, human review of edge cases.' },
    { title: 'Training data quality', desc: 'Datasets are incomplete, unrepresentative or contain errors.', mitigation: 'Datasheets, cleansing and deduping steps, documented data governance.' },
    { title: 'Human oversight failure', desc: 'Reviewers accept outputs without understanding their limitations.', mitigation: 'Approval workflow with training, override testing, sampling review.' },
    { title: 'Prompt injection and misuse', desc: 'Adversarial inputs manipulate the system behaviour.', mitigation: 'Input filtering, system-prompt hardening, red-team testing, rate limits.' },
    { title: 'Data leakage to third parties', desc: 'Personal data is sent to a sub-processor outside the EEA.', mitigation: 'DPAs, transfer register, SCCs and a transfer impact assessment.' },
    { title: 'Cybersecurity', desc: 'The system or its integration is compromised.', mitigation: 'Secure development lifecycle, patching SLA, access control, vulnerability disclosure.' },
    { title: 'Vendor dependency', desc: 'A third-party model is withdrawn, repriced or changes behaviour.', mitigation: 'Exit plan, abstraction layer, second provider evaluation.' },
    { title: 'Drift and performance decay', desc: 'Accuracy degrades as production data changes.', mitigation: 'Post-market monitoring with metrics, owners and a review cadence.' },
    { title: 'Automated decision-making harm', desc: 'Decisions with legal or similar significant effect affect individuals.', mitigation: 'Article 22 safeguards, meaningful information about the logic, human decision.' },
    { title: 'Reputational and regulatory', desc: 'Non-compliance is detected by a regulator or customer due diligence.', mitigation: 'Documentation, transparency disclosures, registration, incident reporting.' },
  ];

  const sections: DocumentContext['sections'] = [
    {
      id: 'rr-scope',
      heading: '1. Scope and methodology',
      level: 2,
      body: html.p(
        `This risk register implements the risk management system required by Article 9 of Regulation (EU) 2024/1689 for ${systems.length === 0 ? 'the AI systems' : `the ${systems.length} AI system(s) declared`} of ${profile.name}. Risks are scored for likelihood (1-5) and impact (1-5); the product gives the base risk, and residual risk is scored after mitigation. Risks rated high or very high require a management decision before the system goes into service.`,
      ) +
        html.kv(
          rows([
            ['Systems in scope', systems.map((s) => s.name).join(', ') || TBC('none declared')],
            ['High-risk candidates', String(facts.highRiskAiCount)],
            ['Register owner', TBC('name and role')],
            ['Review cadence', 'Quarterly and on any substantial change'],
            ['Last review', TBC('date')],
          ]),
        ),
    },
    {
      id: 'rr-risks',
      heading: '2. Risk register',
      level: 2,
      body: html.table(
        ['ID', 'Risk', 'Category', 'L', 'I', 'Base', 'Mitigation', 'Residual', 'Status'],
        seed.map((risk, index) => [
          `R-${String(index + 1).padStart(2, '0')}`,
          escapeCell(risk.title),
          escapeCell(risk.desc),
          String(likelihood(risk.title)),
          String(impact(risk.title)),
          riskLevel(likelihood(risk.title), impact(risk.title)),
          escapeCell(risk.mitigation),
          TBC('score'),
          TBC('open/closed'),
        ]),
        'Table 1 — Art. 9 risk register (L = likelihood, I = impact, 1-5)',
      ),
    },
    {
      id: 'rr-gaps',
      heading: '3. Compliance gaps feeding the register',
      level: 2,
      body: ordered.length
        ? html.table(
            ['ID', 'Article', 'Gap', 'Severity', 'Effort (days)', 'Due'],
            ordered.slice(0, 25).map((g, i) => [
              `G-${String(i + 1).padStart(2, '0')}`,
              escapeCell(g.articleId),
              escapeCell(g.title ?? ''),
              g.severity,
              String(Math.round(g.effort * 10) / 10),
              escapeCell(g.deadlineIso ?? 'TBC'),
            ]),
            'Table 2 — Assessment gaps that become risk register actions',
          )
        : html.p('No open gaps were found in the latest assessment.'),
    },
    {
      id: 'rr-postmarket',
      heading: '4. Post-market monitoring plan',
      level: 2,
      body: html.table(
        ['Metric', 'Definition', 'Threshold', 'Cadence', 'Owner'],
        [
          ['Override rate', 'Share of outputs edited or rejected by a reviewer', '> 15% triggers review', 'Weekly', TBC('assign')],
          ['Accuracy (eval set)', 'Score on the frozen evaluation set', 'Not below target - 3pp', 'Monthly', TBC('assign')],
          ['Complaint rate', 'User complaints related to AI output', '> 2 per month', 'Monthly', TBC('assign')],
          ['Drift indicator', 'Change in input distribution vs. baseline', '> 10% of a key feature', 'Weekly', TBC('assign')],
          ['Incidents', 'Serious incidents under Art. 73', 'Any', 'Continuous', TBC('assign')],
        ],
        'Table 3 — Monitoring metrics required by Art. 72',
      ),
    },
    {
      id: 'rr-signoff',
      heading: '5. Acceptance and review',
      level: 2,
      body: html.p(
        'Management accepts the residual risk profile recorded above. The register is reviewed at least quarterly and after any substantial change to the model, the data or the intended purpose.',
      ) + html.kv(rows([['Signed', TBC('name, role, date')]])),
    },
  ];

  return createContext({
    kind: 'ai-act-risk-register',
    title: 'AI Risk Register (EU AI Act Art. 9)',
    subtitle: `${profile.name} · AI system risk management system`,
    sections,
    profile,
    gaps: ordered,
    branding: input.branding,
  });
}

function likelihood(title: string): number {
  if (/accuracy|bias|injection|drift/.test(title)) return 4;
  if (/oversight|quality|leakage/.test(title)) return 3;
  if (/vendor|cyber/.test(title)) return 2;
  return 3;
}

function impact(title: string): number {
  if (/automated|harm|regulatory/.test(title)) return 5;
  if (/bias|accuracy|leakage/.test(title)) return 4;
  if (/oversight|cyber|injection/.test(title)) return 3;
  return 2;
}

function riskLevel(l: number, i: number): string {
  const score = l * i;
  if (score >= 15) return 'very high';
  if (score >= 10) return 'high';
  if (score >= 5) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Fundamental rights impact assessment
// ---------------------------------------------------------------------------

export function fria(input: { profile: CompanyProfile; branding?: BuildInput['branding'] }): DocumentContext {
  const { profile } = input;
  const facts = profileFacts(profile);
  const systems = profile.aiSystems ?? [];

  const sections: DocumentContext['sections'] = [
    {
      id: 'fria-1',
      heading: '1. Description of the deployment',
      level: 2,
      body: html.table(
        ['System', 'Purpose', 'People affected', 'Automated decision?', 'Deployed'],
        systems.map((s) => [
          escapeCell(s.name),
          escapeCell(s.purpose),
          escapeCell(s.domain),
          s.automatedDecisionMaking ? 'Yes' : 'No',
          s.deployed ? 'Yes' : 'No',
        ]),
        'Table 1 — Deployed AI systems and the persons they affect',
      ),
    },
    {
      id: 'fria-2',
      heading: '2. Applicable rights and obligations',
      level: 2,
      body: html.ul([
        'Right to non-discrimination (Ch. 21 EU Charter, Art. 4 and 9 GDPR)',
        'Right to dignity and privacy (Art. 8 EU Charter, Art. 5 GDPR)',
        'Right to transparency and information (Art. 7 and 8 EU Charter, Art. 13 GDPR, AI Act Art. 50)',
        'Right not to be subject to a decision with legal effect (Art. 22 GDPR)',
        'Right to an effective remedy and to fair working conditions (Art. 47 EU Charter)',
      ]),
    },
    {
      id: 'fria-3',
      heading: '3. Impact assessment',
      level: 2,
      body: html.p(
        'Each system is assessed against the rights above for severity and likelihood, taking into account the scale of deployment and whether decisions have legal or similarly significant effects for the people concerned.',
      ) +
        html.table(
          ['System', 'Right at risk', 'Severity', 'Affected groups', 'Mitigation'],
          [
            [
              escapeCell(systems[0]?.name ?? 'System'),
              'Non-discrimination; transparency; data protection',
              facts.highRiskAiCount > 0 ? 'High' : 'Medium',
              escapeCell((systems[0]?.domain ?? 'general')),
              'Human review, disclosure, bias testing, contestability route',
            ],
          ],
          'Table 2 — Impact assessment summary',
        ),
    },
    {
      id: 'fria-4',
      heading: '4. Consultation',
      level: 2,
      body: html.p(
        'Where the deployment concerns workers, their representatives are informed and consulted before the system is put into service (AI Act Art. 26(7)). Where data subjects are affected directly, their views are collected through the contact channel and the complaints log.',
      ) + html.kv(rows([['Consultation date', TBC('date')], ['Participants', TBC('who')], ['Outcome', TBC('summary')]])),
    },
    {
      id: 'fria-5',
      heading: '5. Mitigation and residual risk',
      level: 2,
      body: html.ol([
        'Disclose the AI nature of the interaction before the first use (AI Act Art. 50).',
        'Provide a route to a human decision and to contest the outcome.',
        'Test for disparate impact on protected groups and record the metrics.',
        'Restrict automated decisions with legal effect unless expressly authorised.',
        'Log decisions and inputs for traceability and for the exercise of rights.',
      ]),
    },
    {
      id: 'fria-6',
      heading: '6. Conclusion',
      level: 2,
      body: html.p(
        'Subject to the mitigations above being implemented and evidenced, the deployment does not infringe the fundamental rights identified in section 2. Residual risk is reviewed annually and on any substantial change.',
      ) + html.kv(rows([['Approved by', TBC('name, role, date')]])),
    },
  ];

  return createContext({
    kind: 'ai-act-annex-iv',
    title: 'Fundamental Rights Impact Assessment',
    subtitle: `${profile.name} · AI Act Art. 27 / Annex V`,
    sections,
    profile,
    branding: input.branding,
    extraMetadata: [['AI systems assessed', String(facts.aiSystemCount)]],
  });
}

// ---------------------------------------------------------------------------
// Declaration of conformity
// ---------------------------------------------------------------------------

export function declarationOfConformity(input: {
  profile: CompanyProfile;
  branding?: BuildInput['branding'];
}): DocumentContext {
  const { profile } = input;
  const system = (profile.aiSystems ?? [])[0];

  const sections: DocumentContext['sections'] = [
    {
      id: 'doc-1',
      heading: '1. Identification',
      level: 2,
      body: html.kv(
        rows([
          ['Provider', escapeCell(profile.legalName ?? profile.name)],
          ['Address', TBC('registered address')],
          ['AI system', escapeCell(system?.name ?? TBC('name'))],
          ['Model / version', TBC('model and version identifiers')],
          ['Date of this declaration', formatDateEU(nowIso())],
          ['Jurisdiction', escapeCell(profile.country)],
        ]),
      ),
    },
    {
      id: 'doc-2',
      heading: '2. Declaration',
      level: 2,
      body: html.p(
        'This declaration is issued under Article 47 of Regulation (EU) 2024/1689. The undersigned declares that the AI system described above has been designed, developed and tested in accordance with the AI Act and with the Union harmonisation legislation applicable to it.',
      ) +
        html.ul([
          'The risks referred to in Article 9 have been identified, estimated and mitigated.',
          'Data governance requirements of Article 10 are met.',
          'Automatic logging under Article 12 is enabled.',
          'Effective human oversight under Article 14 is in place.',
          'Accuracy, robustness and cybersecurity targets under Article 15 are met.',
          'The provider has complied with the obligations of Article 16.',
        ]),
    },
    {
      id: 'doc-3',
      heading: '3. Signature',
      level: 2,
      body: html.kv(
        rows([
          ['Name', TBC('full name')],
          ['Function', TBC('role')],
          ['Signature', ' '],
          ['Place and date', TBC('city, date')],
        ]),
      ),
    },
  ];

  return createContext({
    kind: 'ai-act-conformity-declaration',
    title: 'EU Declaration of Conformity (AI Act Art. 47)',
    subtitle: profile.name,
    sections,
    profile,
    branding: input.branding,
  });
}

/** Filename-safe slug for generated AI Act documents. */
export function aiActFilename(kind: string, profile: CompanyProfile): string {
  return `${slug(kind)}-${slug(profile.name)}.pdf`;
}