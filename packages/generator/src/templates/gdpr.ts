/**
 * GDPR templates:
 *  - Record of processing activities (Art. 30)
 *  - Data protection impact assessment (Art. 35)
 *  - Data subject request response (Arts. 12-22)
 *  - Technical and organisational measures (Art. 32)
 *  - Privacy notice (Arts. 13-14) and DPA (Art. 28(3))
 */

import { profileFacts, roadmap as sortGaps } from '@complisme/core';
import { GDPR_MAX_FINE, formatDateEU, formatEuro } from '@complisme/shared';
import type { Answers, CompanyProfile, DataProcessingActivity,  Gap } from '@complisme/shared';

import { html } from './shell';
import { TBC, createContext, rows, type BuildInput } from './common';
import type { DocumentContext } from '../types';

function esc(value: string | undefined): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function retentionLabel(months?: number): string {
  if (!months) return TBC('define a retention period');
  if (months >= 120) return `${months} months (${Math.round(months / 12)} years)`;
  return `${months} months`;
}

function activityRows(activities: DataProcessingActivity[]) {
  return activities.map((a) => [
    esc(a.name),
    esc(a.purpose),
    esc(a.legalBasis ?? TBC('no legal basis recorded')),
    esc((a.dataSubjects ?? []).join(', ')) || TBC('data subjects'),
    esc((a.dataCategories ?? []).join(', ')) || TBC('data categories'),
    retentionLabel(a.retentionMonths),
    esc((a.processors ?? []).join(', ')) || '—',
    esc((a.thirdCountryTransfers ?? []).join(', ')) || 'None',
  ]);
}

export function ropa(input: {
  profile: CompanyProfile;
  gaps?: Gap[];
  branding?: BuildInput['branding'];
}): DocumentContext {
  const { profile, gaps = [] } = input;
  const activities = profile.processingActivities ?? [];
  const facts = profileFacts(profile);
  const gdprGaps = sortGaps(gaps.filter((g) => g.frameworkId === 'gdpr'));

  const sections: DocumentContext['sections'] = [
    {
      id: 'ropa-1',
      heading: '1. Controller identity',
      level: 2,
      body: html.kv(
        rows([
          ['Controller', esc(profile.legalName ?? profile.name)],
          ['Contact (DPO)', profile.hasDpo ? TBC('DPO name and contact') : 'No DPO appointed — Art. 37 review required'],
          ['Representative (Art. 27)', TBC('assess the Art. 27 requirement')],
          ['Scope of this record', 'All processing activities under the responsibility of the controller'],
          ['Last review', TBC('date and reviewer')],
        ]),
      ),
    },
    {
      id: 'ropa-2',
      heading: '2. Record of processing activities (Art. 30)',
      level: 2,
      body: activities.length
        ? html.table(
            ['Activity', 'Purpose', 'Legal basis', 'Data subjects', 'Data categories', 'Retention', 'Processors', 'Transfers'],
            activityRows(activities),
            `Table 1 — ${activities.length} processing activities`,
          )
        : html.p(`${TBC('Add at least one processing activity')} — the Art. 30 record is mandatory whenever processing is not occasional or is likely to risk individuals' rights.`),
    },
    {
      id: 'ropa-3',
      heading: '3. Special categories and criminal conviction data (Arts. 9-10)',
      level: 2,
      body: facts.specialCategoryCount
        ? html.table(
            ['Activity', 'Special categories', 'Art. 9(2) exception', 'Safeguards'],
            (profile.processingActivities ?? [])
              .filter((a) => a.specialCategory)
              .map((a) => [
                esc(a.name),
                TBC('list the categories'),
                TBC('cite the exception, e.g. explicit consent'),
                TBC('encryption, access control, pseudonymisation'),
              ]),
            'Table 2 — Art. 9 processing requiring an additional exception',
          )
        : html.p('No special category data is declared. Re-check when new sources of data are added.'),
    },
    {
      id: 'ropa-4',
      heading: '4. International transfers (Chapter V)',
      level: 2,
      body: facts.transferCountryCount
        ? html.table(
            ['Activity', 'Country', 'Recipient', 'Tool', 'TIA'],
            (profile.processingActivities ?? [])
              .filter((a) => (a.thirdCountryTransfers ?? []).length)
              .flatMap((a) =>
                (a.thirdCountryTransfers ?? []).map((country) => [
                  esc(a.name),
                  esc(country),
                  esc((a.processors ?? []).join(', ')),
                  country === 'US'
                    ? 'EU-US Data Privacy Framework (if certified) or SCCs 2021/914'
                    : 'SCCs 2021/914 / adequacy decision',
                  TBC('reference'),
                ]),
              ),
            'Table 3 — Transfer register',
          )
        : html.p('No international transfers are declared.'),
    },
    {
      id: 'ropa-5',
      heading: '5. Open compliance items',
      level: 2,
      body: gdprGaps.length
        ? html.table(
            ['Article', 'Gap', 'Severity', 'Remediation', 'Effort (days)', 'Due'],
            gdprGaps.slice(0, 20).map((g) => [
              esc(g.articleId),
              esc(g.title ?? ''),
              g.severity,
              esc(g.remediation),
              String(Math.round(g.effort * 10) / 10),
              esc(g.deadlineIso ?? 'TBC'),
            ]),
            'Table 4 — GDPR gaps identified in the latest assessment',
          )
        : html.p('No open GDPR gaps were identified in the latest assessment.'),
    },
    {
      id: 'ropa-6',
      heading: '6. Security and accountability',
      level: 2,
      body: html.ul([
        `Maximum GDPR fine exposure: ${formatEuro(GDPR_MAX_FINE)} or 4% of worldwide annual turnover, whichever is higher.`,
        'Technical and organisational measures are recorded in the TOMs document (Art. 32).',
        'Breaches are recorded in the breach register with a 72-hour notification decision (Arts. 33-34).',
        'Data subject requests are tracked in the DSR log with a one-month SLA (Art. 12(3)).',
      ]),
    },
  ];

  return createContext({
    kind: 'gdpr-ropa',
    title: 'Record of Processing Activities (ROPA)',
    subtitle: `${profile.name} · GDPR Art. 30`,
    sections,
    profile,
    gaps: gdprGaps,
    branding: input.branding,
    extraMetadata: [
      ['Activities recorded', String(activities.length)],
      ['Processors', String(facts.processorCount)],
      ['Transfer countries', String(facts.transferCountryCount)],
    ],
    disclaimer:
      'Prepared to satisfy Article 30 GDPR. The controller remains responsible for the accuracy and completeness of the record. This document is a compliance working document, not legal advice.',
  });
}

export function dpia(input: {
  profile: CompanyProfile;
  answers?: Answers;
  branding?: BuildInput['branding'];
  narrative?: Record<string, string>;
}): DocumentContext {
  const { profile, narrative = {} } = input;
  const facts = profileFacts(profile);
  const highRisk =
    facts.highRiskAiCount > 0 || facts.automatedDecisions > 0 || facts.specialCategoryCount > 0;

  const sections: DocumentContext['sections'] = [
    {
      id: 'dpia-1',
      heading: '1. Systematic description of the processing',
      level: 2,
      body:
        html.p(
          narrative.description ??
            `This assessment covers the processing activities of ${
              profile.legalName ?? profile.name
            } that are likely to result in a high risk to individuals: ${
              facts.automatedDecisions > 0 ? 'the use of automated decision-making, ' : ''
            }${facts.specialCategoryCount > 0 ? 'the processing of special category data, ' : ''}${
              facts.aiSystemCount > 0 ? 'the deployment of AI systems used on people. ' : ''
            }It follows the structure of Article 35(7).`,
        ) +
        html.table(
          ['Activity', 'Purpose', 'Data subjects', 'Scale', 'Special categories', 'Automated decisions'],
          (profile.processingActivities ?? []).map((a) => [
            esc(a.name),
            esc(a.purpose),
            esc((a.dataSubjects ?? []).join(', ')) || '—',
            TBC('number of individuals'),
            a.specialCategory ? 'Yes' : 'No',
            a.automatedDecisionMaking ? 'Yes' : 'No',
          ]),
          'Table 1 — Processing in scope of this DPIA',
        ),
    },
    {
      id: 'dpia-2',
      heading: '2. Necessity and proportionality',
      level: 2,
      body: html.ol([
        'Purpose test: each purpose is specified, explicit and legitimate (Art. 5(1)(b)).',
        'Data minimisation: only the fields required for the purpose are collected (Art. 5(1)(c)).',
        'Lawful basis: a basis under Art. 6 is documented; consent is used only where it is freely given.',
        'Retention: periods are defined and enforced per category (Art. 5(1)(e)).',
        'Transparency: the privacy notice contains the full Art. 13 information set.',
        'Security: measures appropriate to the risk are in place (Art. 32).',
      ]),
    },
    {
      id: 'dpia-3',
      heading: '3. Risks to the rights and freedoms of individuals',
      level: 2,
      body: html.table(
        ['Risk', 'Likelihood', 'Impact', 'Score', 'Mitigation', 'Residual'],
        [
          ['Unlawful or excessive processing', 'Medium', 'High', '12', 'Documented lawful basis per activity', TBC('score')],
          ['Inaccurate data leading to unfair decisions', 'Medium', 'High', '12', 'Validation, review, correction route', TBC('score')],
          ['Discriminatory outcomes from automated processing', 'Medium', 'Very high', '15', 'Bias testing, human review, contestability', TBC('score')],
          ['Data breach of personal data', 'Medium', 'High', '12', 'Encryption, access control, incident response', TBC('score')],
          ['Unlawful international transfer', 'Low', 'High', '8', 'SCCs, transfer impact assessment, supplementary measures', TBC('score')],
          ['Failure to honour data subject rights', 'Medium', 'Medium', '6', 'DSR procedure with SLA and log', TBC('score')],
          ['Loss of transparency (no notice)', 'Low', 'Medium', '4', 'Layered privacy notice published', TBC('score')],
        ],
        'Table 2 — Risk assessment (likelihood x impact on a 1-5 scale)',
      ),
    },
    {
      id: 'dpia-4',
      heading: '4. Measures and safeguards',
      level: 2,
      body: html.ul([
        'Privacy by design: data minimisation reviewed at every feature release (Art. 25).',
        'Human oversight of any automated decision with legal or similar effect (Art. 22).',
        'Encryption in transit and at rest, with pseudonymisation where feasible (Art. 32).',
        'Access control based on need-to-know with periodic review.',
        'Retention automation and deletion at the end of the period.',
        'Breach detection and a documented 72-hour notification path.',
      ]),
    },
    {
      id: 'dpia-5',
      heading: '5. Consultation with the DPO (Art. 35(2))',
      level: 2,
      body: html.kv(
        rows([
          ['DPO consulted', profile.hasDpo ? 'Yes — opinion below' : 'No DPO appointed — consult the management body instead'],
          ['DPO opinion', TBC('date, advice, whether adopted')],
          ['Data subject consultation', TBC('method and outcome, where feasible')],
        ]),
      ),
    },
    {
      id: 'dpia-6',
      heading: '6. Residual risk and conclusion',
      level: 2,
      body: html.p(
        highRisk
          ? 'Residual risk remains at the level shown in table 2 after the measures in section 4 are implemented. Because automated processing is involved, the residual risk is re-assessed whenever the model, the logic or the data categories change.'
          : 'The processing assessed here does not, on the basis of the information provided, meet the Art. 35(3) high-risk criteria. This assessment is retained as evidence and must be revisited when the processing changes.',
      ) + html.kv(rows([['Approved by', TBC('name, role, date')]])),
    },
  ];

  return createContext({
    kind: 'gdpr-dpia',
    title: 'Data Protection Impact Assessment (DPIA)',
    subtitle: `${profile.name} · GDPR Art. 35`,
    sections,
    profile,
    answers: input.answers,
    narrative,
    branding: input.branding,
    extraMetadata: [
      ['DPIA required', highRisk ? 'Yes' : 'Reviewed — not required on current facts'],
      ['High-risk AI systems', String(facts.highRiskAiCount)],
      ['Special category activities', String(facts.specialCategoryCount)],
    ],
    disclaimer:
      'A DPIA must be reviewed and signed by the data protection officer or, where no DPO is appointed, by the management body. This generated draft is a compliance working document, not legal advice.',
  });
}

export function dsrResponse(input: {
  profile: CompanyProfile;
  request?: {
    requester?: string;
    requestId?: string;
    type?: 'access' | 'erasure' | 'rectification' | 'restriction' | 'portability' | 'objection';
    receivedAt?: string;
    dataCategories?: string[];
    systems?: string[];
    responseDays?: number;
  };
  branding?: BuildInput['branding'];
}): DocumentContext {
  const { profile, request = {} } = input;
  const type = request.type ?? 'access';
  const received = request.receivedAt ?? formatDateEU(new Date());
  const days = request.responseDays ?? 30;

  const typeText: Record<string, { heading: string; article: string; body: string }> = {
    access: {
      heading: 'Right of access (Art. 15)',
      article: 'Article 15',
      body: 'We confirm that we have processed your personal data as follows and provide a copy of it in a commonly used, machine-readable format.',
    },
    erasure: {
      heading: 'Right to erasure (Art. 17)',
      article: 'Article 17',
      body: 'We have reviewed your request and erased the personal data listed below. Where data had to be retained, the legal obligation requiring retention is identified.',
    },
    rectification: {
      heading: 'Right to rectification (Art. 16)',
      article: 'Article 16',
      body: 'We have corrected the inaccurate or incomplete personal data identified below and informed the recipients where applicable.',
    },
    restriction: {
      heading: 'Right to restriction of processing (Art. 18)',
      article: 'Article 18',
      body: 'We have restricted the processing of the personal data listed below while its accuracy is verified or a legal claim is assessed.',
    },
    portability: {
      heading: 'Right to data portability (Art. 20)',
      article: 'Article 20',
      body: 'We provide the personal data you provided in a structured, commonly used and machine-readable format.',
    },
    objection: {
      heading: 'Right to object (Art. 21)',
      article: 'Article 21',
      body: 'We have stopped the processing you objected to and informed you of the reasons where applicable.',
    },
  };

  const selected = typeText[type] ?? typeText.access;

  const sections: DocumentContext['sections'] = [
    {
      id: 'dsr-1',
      heading: '1. Request details',
      level: 2,
      body: html.kv(
        rows([
          ['Reference', esc(request.requestId ?? TBC('reference'))],
          ['Requester', esc(request.requester ?? TBC('name'))],
          ['Date received', esc(received)],
          ['Type of request', selected.heading],
          ['Statutory deadline', `${days} days (Art. 12(3))`],
          ['Handler', TBC('name and role')],
        ]),
      ),
    },
    {
      id: 'dsr-2',
      heading: '2. Identity verification',
      level: 2,
      body: html.p(
        'In accordance with Article 12(6), we verified the identity of the requester before disclosing personal data. The verification method used is recorded below so that the response can be audited later.',
      ) + html.kv(rows([['Verification method', TBC('e.g. signed-in session, ID document, bank confirmation')]])),
    },
    {
      id: 'dsr-3',
      heading: `3. ${selected.heading}`,
      level: 2,
      body:
        html.p(selected.body) +
        html.table(
          ['Category', 'Systems', 'Action taken'],
          (request.dataCategories ?? []).map((category) => [
            esc(category),
            esc((request.systems ?? []).join(', ')) || TBC('list systems'),
            TBC('action'),
          ]),
          `Table 1 — Data covered by the response (${selected.article})`,
        ),
    },
    {
      id: 'dsr-4',
      heading: '4. Recipients informed (Art. 19)',
      level: 2,
      body: html.p(
        'Where personal data has been disclosed to processors or other recipients, they have been informed of the erasure, rectification or restriction as required by Article 19.',
      ) + html.ul([TBC('list processors and recipients notified, with dates')]),
    },
    {
      id: 'dsr-5',
      heading: '5. Your rights',
      level: 2,
      body: html.p(
        `You may lodge a complaint with your national supervisory authority if you believe your rights have not been respected. This response is issued under ${selected.article} of Regulation (EU) 2016/679.`,
      ) + html.kv(rows([['Supervisory authority', TBC('name and website')], ['Signed', TBC('name, role, date')]])),
    },
  ];

  return createContext({
    kind: 'gdpr-dsr-response',
    title: `Data subject request response — ${type}`,
    subtitle: `${profile.name} · GDPR ${selected.article}`,
    sections,
    profile,
    branding: input.branding,
    extraMetadata: [['Request type', type]],
  });
}

export function privacyNotice(input: {
  profile: CompanyProfile;
  branding?: BuildInput['branding'];
  kind?: 'consent-notice' | 'gdpr-tom';
}): DocumentContext {
  const { profile, kind = 'consent-notice' } = input;
  const activities = profile.processingActivities ?? [];

  if (kind === 'gdpr-tom') return tomDocument(profile, input.branding);

  const sections: DocumentContext['sections'] = [
    {
      id: 'pn-1',
      heading: '1. Who we are',
      level: 2,
      body: html.kv(
        rows([
          ['Controller', esc(profile.legalName ?? profile.name)],
          ['Address', TBC('registered address')],
          ['Data protection contact', profile.hasDpo ? TBC('DPO contact details') : TBC('privacy contact')],
          ['Supervisory authority', TBC('national DPA')],
        ]),
      ),
    },
    {
      id: 'pn-2',
      heading: '2. What we collect and why',
      level: 2,
      body: activities.length
        ? html.table(
            ['Data', 'Purpose', 'Legal basis', 'Retention', 'Recipients'],
            activities.flatMap((a) =>
              (a.dataCategories ?? []).map((category) => [
                esc(category),
                esc(a.purpose),
                esc(a.legalBasis ?? TBC('legal basis')),
                retentionLabel(a.retentionMonths),
                esc((a.processors ?? []).join(', ')) || '—',
              ]),
            ),
            'Table 1 — Processing covered by this notice (Arts. 13-14)',
          )
        : html.p(TBC('List the data categories, purposes and legal bases')),
    },
    {
      id: 'pn-3',
      heading: '3. International transfers',
      level: 2,
      body: html.p(
        'Where personal data is transferred outside the EEA, the transfer is covered by an adequacy decision or by the Standard Contractual Clauses adopted by the European Commission (Decision (EU) 2021/914), together with a transfer impact assessment.',
      ),
    },
    {
      id: 'pn-4',
      heading: '4. Your rights',
      level: 2,
      body: html.ul([
        'Access (Art. 15), rectification (Art. 16), erasure (Art. 17), restriction (Art. 18), portability (Art. 20)',
        'Object to direct marketing and profiling-based decisions (Art. 21)',
        'Withdraw consent at any time without affecting the lawfulness of processing before withdrawal (Art. 7(3))',
        'Not to be subject to an automated decision with legal or similarly significant effects (Art. 22)',
        'Lodge a complaint with a supervisory authority (Art. 77)',
      ]),
    },
    {
      id: 'pn-5',
      heading: '5. Cookies and similar technologies',
      level: 2,
      body: profile.usesCookies
        ? html.p(
            'We use cookies and similar technologies. Strictly necessary cookies are set without consent; all others are set only after you give consent, which you can withdraw at any time through the cookie settings.',
          )
        : html.p('We do not set cookies that require consent. This section is retained for completeness and must be updated if that changes.'),
    },
  ];

  return createContext({
    kind: 'consent-notice',
    title: 'Privacy notice and consent information',
    subtitle: `${profile.name} · GDPR Arts. 13-14`,
    sections,
    profile,
    branding: input.branding,
  });
}

function tomDocument(profile: CompanyProfile, branding?: BuildInput['branding']): DocumentContext {
  const sections: DocumentContext['sections'] = [
    {
      id: 'tom-1',
      heading: '1. Policy statement',
      level: 2,
      body: html.p(
        `${profile.legalName ?? profile.name} applies appropriate technical and organisational measures (TOMs) to personal data, as required by Article 32 GDPR. The measures below reflect the risks identified in the record of processing activities and are reviewed at least annually.`,
      ),
    },
    {
      id: 'tom-2',
      heading: '2. Confidentiality',
      level: 2,
      body: html.ul([
        'Encryption in transit (TLS 1.2 or higher) on every interface that carries personal data',
        'Encryption at rest for databases, backups and file storage',
        'Role-based access control with least privilege and quarterly access reviews',
        'Multi-factor authentication for administrative access',
        'Confidentiality clauses in employment contracts and confidentiality training',
      ]),
    },
    {
      id: 'tom-3',
      heading: '3. Integrity',
      level: 2,
      body: html.ul([
        'Version control and change management for systems processing personal data',
        'Input validation and integrity checks on data flows',
        'Backup and restoration procedures with periodic restore testing',
        'Logging of access to personal data with retention limits',
      ]),
    },
    {
      id: 'tom-4',
      heading: '4. Availability and resilience',
      level: 2,
      body: html.ul([
        'Documented recovery time and recovery point objectives',
        'Redundancy for systems that hold personal data',
        'Capacity monitoring and alerting',
        'Business continuity plan covering the personal data processing activities',
      ]),
    },
    {
      id: 'tom-5',
      heading: '5. Testing and review',
      level: 2,
      body: html.ul([
        'Vulnerability scanning at least quarterly and penetration testing annually',
        'Restoration testing at least annually',
        'Incident response plan exercised at least annually, including the 72-hour notification decision path',
        'This document reviewed annually and after any significant change or breach',
      ]),
    },
  ];

  return createContext({
    kind: 'gdpr-tom',
    title: 'Technical and Organisational Measures (TOMs)',
    subtitle: `${profile.name} · GDPR Art. 32`,
    sections,
    profile,
    branding,
  });
}

export function dpaTemplate(input: {
  profile: CompanyProfile;
  processorName?: string;
  branding?: BuildInput['branding'];
}): DocumentContext {
  const { profile, processorName = TBC('processor legal name') } = input;
  const clauses = [
    'Subject matter and duration of the processing',
    'Nature and purpose of the processing',
    'Types of personal data and categories of data subjects',
    'Obligations of the controller',
    'Obligations of the processor',
    'Sub-processors and prior specific or general written authorisation',
    'International transfers and appropriate safeguards',
    'Security measures under Article 32',
    'Assistance with data subject requests and with Articles 32-36',
    'Notification of a personal data breach without undue delay',
    'Deletion or return of the data at the end of the engagement',
    'Audit rights and inspection obligations',
    'Liability and governing law',
  ];

  const sections: DocumentContext['sections'] = [
    {
      id: 'dpa-1',
      heading: 'Parties',
      level: 2,
      body: html.kv(
        rows([
          ['Controller', esc(profile.legalName ?? profile.name)],
          ['Processor', esc(processorName)],
          ['Effective date', TBC('date')],
          ['Governing law', TBC('member state and jurisdiction')],
        ]),
      ),
    },
    {
      id: 'dpa-2',
      heading: 'Clauses',
      level: 2,
      body: html.ol(
        clauses.map((c) => `${esc(c)} — <span class="muted">${TBC('agree the final wording')}</span>`),
      ),
    },
  ];

  return createContext({
    kind: 'nda-dpa',
    title: 'Data Processing Agreement (Art. 28(3) GDPR)',
    subtitle: `${profile.name} ↔ ${processorName}`,
    sections,
    profile,
    branding: input.branding,
    disclaimer:
      'This is a working template based on Article 28(3) GDPR, not a reviewed contract. Have your counsel adapt it before signing.',
  });
}