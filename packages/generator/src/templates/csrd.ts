/**
 * CSRD / ESRS templates:
 *  - Sustainability statement (double materiality, all ESRS datapoints)
 *  - ESRS datapoint register (the data lineage table auditors ask for)
 */

import { profileFacts } from '@complisme/core';
import { CSRD_MAX_FINE, formatDateEU, formatNumber, formatEuro } from '@complisme/shared';
import type { CompanyProfile,  SustainabilityMetrics } from '@complisme/shared';

import { html } from './shell';
import { TBC, createContext, rows, type BuildInput } from './common';
import type { DocumentContext } from '../types';

function esc(value: string | number | undefined): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function num(value: number | undefined, unit = ''): string {
  return value === undefined || value === null ? TBC('value') : `${formatNumber(value)}${unit ? ` ${unit}` : ''}`;
}

function energyMix(m: SustainabilityMetrics | undefined): string {
  if (!m || m.energyMWh === undefined) return TBC('energy by source');
  const nonRenewable = Math.max(0, Math.round(m.energyMWh * (1 - (m.renewableSharePct ?? 0) / 100)));
  return `${formatNumber(m.renewableSharePct ?? 0, 0)}% renewable (${formatNumber(
    m.energyMWh - nonRenewable,
  )} MWh), ${nonRenewable} MWh fossil`;
}

export function csrdReport(input: {
  profile: CompanyProfile;
  branding?: BuildInput['branding'];
  narrative?: Record<string, string>;
}): DocumentContext {
  const { profile, narrative = {} } = input;
  const m = profile.sustainability ?? {};
  const facts = profileFacts(profile);

  const sections: DocumentContext['sections'] = [
    {
      id: 'csrd-1',
      heading: '1. Basis of preparation and reporting perimeter',
      level: 2,
      body: html.p(
        narrative.basis ??
          `This sustainability statement covers ${profile.legalName ?? profile.name} and its controlled entities, prepared in accordance with the European Sustainability Reporting Standards (ESRS) as adopted by Commission Delegated Regulation (EU) 2023/2772 and amended following Directive (EU) 2022/2464 (CSRD). The financial year covered is the last completed calendar year. Value chain information outside our control is reported with an explicit estimate method.`,
      ) +
        html.kv(
          rows([
            ['Reporting entity', esc(profile.legalName ?? profile.name)],
            ['Consolidation method', TBC('equity / proportional, list excluded entities')],
            ['Value chain perimeter', TBC('upstream and downstream inclusions and exclusions')],
            ['Financial year', TBC('FY reference')],
            ['Standards applied', 'ESRS 1, ESRS 2, ESRS E1-E5, ESRS S1-S2, ESRS G1'],
            ['Assurance level', m.assuranceLevel ? esc(m.assuranceLevel) : TBC('limited assurance engagement')],
            ['Reference point for disclosures', TBC('index of datapoints with page references')],
          ]),
        ),
    },
    {
      id: 'csrd-2',
      heading: '2. Double materiality assessment (ESRS 2 IRO-1, ESRS 1 SBM)',
      level: 2,
      body:
        html.p(
          narrative.materiality ??
            'Materiality is assessed in two directions. Impact materiality identifies where the company has (or may have) a material effect on people and the environment. Financial materiality identifies where external sustainability risks and opportunities have a material effect on cash flows, access to finance and enterprise value. Topics are scored on magnitude and likelihood and are validated with a stakeholder record.',
        ) +
        html.table(
          ['Topic', 'Impact materiality', 'Financial materiality', 'Material?', 'Owner'],
          [
            ['Climate change (E1)', 'Scope 1-2 emissions, energy intensity', 'Energy prices, carbon pricing, transition risk', 'Yes', TBC('assign')],
            ['Circular economy (E2)', 'Waste and material use', 'Resource cost, extended producer responsibility', 'Yes', TBC('assign')],
            ['Water (E3)', 'Water withdrawal in stressed areas', 'Operational continuity', TBC('assess'), TBC('assign')],
            ['Own workforce (S1)', 'Health and safety, working conditions', 'Talent attraction, absenteeism, litigation', 'Yes', TBC('assign')],
            ['Value chain workers (S2)', 'Labour conditions in the supply chain', 'Reputational and legal exposure', TBC('assess'), TBC('assign')],
            ['Governance (G1)', 'Anti-corruption, whistleblowing', 'Fines, contract termination', 'Yes', TBC('assign')],
          ],
          'Table 1 — Materiality matrix',
        ) + html.kv(rows([['Stakeholder engagement', TBC('method, participants, key messages')]])),
    },
    {
      id: 'csrd-3',
      heading: '3. Value chain and sustainability-related risks and opportunities',
      level: 2,
      body: html.p(
        narrative.valueChain ??
          'The value chain is described for upstream (suppliers, logistics, cloud and hosting) and downstream (customers, end users, distribution). Value chain policies and screening procedures are documented below.',
      ) +
        html.ul([
          `Value chain policies in place: ${m.valueChainPolicies ? 'Yes' : 'No — to be implemented'}`,
          'Supplier code of conduct incorporating environmental and labour requirements',
          'Screening and due diligence procedure for high-risk suppliers',
          TBC('list the material value chain relationships'),
        ]),
    },
    {
      id: 'csrd-4',
      heading: '4. ESRS E1 — Climate change',
      level: 2,
      body: html.kv(
          rows([
            ['Scope 1 GHG emissions', num(m.scope1TonnesCO2e, 'tCO2e')],
            ['Scope 2 GHG emissions (location based)', num(m.scope2TonnesCO2e, 'tCO2e')],
            ['Scope 3 GHG emissions (material categories)', num(m.scope3TonnesCO2e, 'tCO2e')],
            ['Energy consumption', num(m.energyMWh, 'MWh')],
            ['Energy mix', esc(energyMix(m))],
            ['Renewable share', m.renewableSharePct !== undefined ? `${formatNumber(m.renewableSharePct, 0)}%` : TBC('share')],
            ['Climate transition plan', TBC('targets, baseline year, milestones')],
            ['Climate scenario analysis', TBC('NGFS scenarios used and outcome')],
            ['Internal carbon price', TBC('€/tCO2e applied to investments')],
            ['Climate targets', TBC('absolute and intensity targets with interim milestones')],
          ]),
        ) +
        html.p('Table 2 — Climate metrics. Sources and emission factors must be stated in the datapoint register (section 7).'),
    },
    {
      id: 'csrd-5',
      heading: '5. ESRS E2-E5 — Resources, water, circular economy and resource efficiency',
      level: 2,
      body: html.kv(
        rows([
          ['Materials used (E2-4)', TBC('tonnes by material type')],
          ['Waste generated (E2-5)', num(m.wasteTonnes, 't')],
          ['Recycling / reuse rate', TBC('% diverted from landfill')],
          ['Water withdrawal (E3-2)', num(m.waterM3, 'm³')],
          ['Water discharge and stressed areas (E3-4)', TBC('discharge and Aqueduct exposure')],
          ['Resource use and energy mix (E4)', esc(energyMix(m))],
          ['Circularity KPI for the main product (E5-1)', TBC('metric and value')],
        ]),
      ),
    },
    {
      id: 'csrd-6',
      heading: '6. ESRS S1 and S2 — Own workforce and value chain workers',
      level: 2,
      body: html.kv(
        rows([
          ['Employees (FTE)', num(m.employeesFTE ?? profile.employees)],
          ['Total headcount', String(profile.employees)],
          ['Women in leadership', m.womenInLeadershipPct !== undefined ? `${formatNumber(m.womenInLeadershipPct, 0)}%` : TBC('share')],
          ['Turnover rate', TBC('%')],
          ['Training hours per employee', TBC('hours')],
          ['Health and safety incidents', num(m.incidentsRecorded)],
          ['Recordable incident frequency rate', TBC('rate per 1M hours')],
          ['Collective bargaining coverage', TBC('% of workforce)')],
          ['Value chain worker conditions (S2)', TBC('assessment, data or contractual clauses')],
          ['Diversity of governance body', TBC('gender, independence, tenure')],
        ]),
      ),
    },
    {
      id: 'csrd-7',
      heading: '7. ESRS G1 and internal controls',
      level: 2,
      body: html.ul([
        'Governance structure and sustainability responsibilities of the highest body (G1-1)',
        'Sustainability expertise of the governing body (G1-1)',
        'Code of conduct, anti-corruption policy and whistleblowing channel (G1-3)',
        'Confirmed misconducts and their remediation (G1-3)',
        'Data ownership and source systems per datapoint (ESRS 2 BP-2)',
        'Consistency check with the financial statements (CSRD Art. 28(2))',
      ]) + html.kv(rows([['Double-check with financial statements', TBC('who performed it and the outcome')]])),
    },
    {
      id: 'csrd-8',
      heading: '8. External assurance and reporting timetable',
      level: 2,
      body: html.kv(
        rows([
          ['Assurance provider', TBC('name and engagement scope')],
          ['Assurance level', m.assuranceLevel === 'none' ? 'Not yet engaged — limited assurance required' : esc(m.assuranceLevel)],
          ['Digital tagging (Art. 32)', TBC('ESRS datapoints tagged in a machine-readable format')],
          ['Publication date', TBC('date of publication in the company report')],
          ['Board approval', TBC('date and minute reference')],
          ['Penalties reference', `CSRD national penalties: up to ${formatEuro(CSRD_MAX_FINE)} reference ceiling`],
        ]),
      ),
    },
    {
      id: 'csrd-9',
      heading: '9. Company context',
      level: 2,
      body: html.kv(
        rows([
          ['Sector', esc(profile.sector)],
          ['Employees', String(profile.employees)],
          ['Revenue', esc(formatEuro(profile.revenueEUR))],
          ['SME status', facts.isSme ? 'SME (under 250 employees, under €50M turnover)' : 'Not an SME'],
          ['Country of establishment', esc(profile.country)],
        ]),
      ),
    },
  ];

  return createContext({
    kind: 'csrd-report',
    title: 'Sustainability Statement (CSRD / ESRS)',
    subtitle: `${profile.name} · ESRS 1, ESRS 2, E1-E5, S1-S2, G1`,
    sections,
    profile,
    narrative,
    branding: input.branding,
    extraMetadata: [
      ['Reporting year', TBC('FY')],
      ['Employee FTE', String(m.employeesFTE ?? profile.employees)],
      ['Scope 1+2 emissions', `${formatNumber((m.scope1TonnesCO2e ?? 0) + (m.scope2TonnesCO2e ?? 0))} tCO2e`],
      ['Generated', formatDateEU(new Date())],
    ],
    disclaimer:
      'Sustainability reporting requires assurance and the accuracy of the reported data. This draft must be validated against the underlying records and is not legal or assurance advice.',
  });
}

/** The datapoint register: one row per ESRS metric with source, method and owner. */
export function esrsDatapointRegister(input: {
  profile: CompanyProfile;
  branding?: BuildInput['branding'];
}): DocumentContext {
  const { profile } = input;
  const m = profile.sustainability ?? {};

  const points = [
    ['E1-5', 'Scope 1 GHG emissions', 'tCO2e', num(m.scope1TonnesCO2e), 'Fuel invoices, refrigerant log', 'GHG Protocol', TBC('assign')],
    ['E1-5', 'Scope 2 GHG emissions (location based)', 'tCO2e', num(m.scope2TonnesCO2e), 'Electricity invoices', 'GHG Protocol', TBC('assign')],
    ['E1-6', 'Scope 3 GHG emissions', 'tCO2e', num(m.scope3TonnesCO2e), 'Supplier data, spend-based estimates', 'GHG Protocol', TBC('assign')],
    ['E1-7', 'Energy consumption', 'MWh', num(m.energyMWh), 'Utility statements', 'Direct measurement', TBC('assign')],
    ['E1-8', 'Energy mix and renewable share', '%', m.renewableSharePct !== undefined ? `${formatNumber(m.renewableSharePct, 0)}%` : TBC('value'), 'Utility statements, guarantees of origin', 'Direct measurement', TBC('assign')],
    ['E1-14', 'Water withdrawal', 'm³', num(m.waterM3), 'Water meter', 'Direct measurement', TBC('assign')],
    ['E2-5', 'Waste generated', 't', num(m.wasteTonnes), 'Waste transfer notes', 'Direct measurement', TBC('assign')],
    ['S1-6', 'Total employees', 'FTE', num(m.employeesFTE ?? profile.employees), 'HRIS', 'Direct measurement', 'HR'],
    ['S1-13', 'Training hours per employee', 'hours', TBC('value'), 'LMS', 'Direct measurement', 'HR'],
    ['S1-14', 'Health and safety incidents', 'count', num(m.incidentsRecorded), 'Incident register', 'Direct measurement', 'HSE'],
    ['S1-17', 'Diversity of governance body', '%', m.womenInLeadershipPct !== undefined ? `${formatNumber(m.womenInLeadershipPct, 0)}%` : TBC('value'), 'Governance records', 'Direct measurement', 'Legal'],
    ['G1-1', 'Sustainability expertise of the governing body', 'yes/no', TBC('value'), 'Board minutes, training records', 'Assessment', 'Legal'],
  ];

  const sections: DocumentContext['sections'] = [
    {
      id: 'dp-1',
      heading: 'Datapoint register (ESRS 2 BP-2)',
      level: 2,
      body: html.p(
        'Every disclosed datapoint must be traceable to a source system, a collection method, an owner and a review status. This register is the internal control auditors test first: if a row has no source, the disclosure cannot be assured.',
      ) +
        html.table(
          ['ID', 'Datapoint', 'Unit', 'Value', 'Source', 'Method', 'Owner'],
          points.map((row) => row.map((cell) => esc(cell))),
          'Table 1 — ESRS datapoint register',
        ),
    },
    {
      id: 'dp-2',
      heading: 'Estimation methods',
      level: 2,
      body: html.ul([
        'Each estimated value states the method, the assumptions and the error margin.',
        'Estimates by analogy to a comparable entity are labelled as such.',
        'Estimates are replaced by actual data as soon as it becomes available.',
        'Material estimation changes between reporting periods are disclosed in the datapoint register.',
      ]),
    },
    {
      id: 'dp-3',
      heading: 'Review and approval',
      level: 2,
      body: html.kv(
        rows([
          ['Prepared by', TBC('name and role')],
          ['Reviewed by', TBC('name and role')],
          ['Approved by the board', TBC('date and minute reference')],
          ['Next review', TBC('date')],
        ]),
      ),
    },
  ];

  return createContext({
    kind: 'esrs-datapoint',
    title: 'ESRS Datapoint Register and Data Lineage',
    subtitle: profile.name,
    sections,
    profile,
    branding: input.branding,
    disclaimer:
      'This register supports, but does not replace, the assurance process. Values must be reconciled with the general ledger and with the previous year before publication.',
  });
}