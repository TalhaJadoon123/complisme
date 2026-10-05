/**
 * E-invoicing templates:
 *  - Validation report (EN 16931 / Peppol / ViDA / NF-e readiness)
 *  - Compliance roadmap (the cross-framework 90-day plan)
 */

import { profileFacts } from '@complisme/core';
import { formatDateEU, formatNumber } from '@complisme/shared';
import type { CompanyProfile,  Evidence, Finding, Gap, Roadmap } from '@complisme/shared';

import { html } from './shell';
import { TBC, createContext, rows, type BuildInput } from './common';
import type { DocumentContext } from '../types';

function esc(value: string | number | undefined): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function einvoiceValidationReport(input: {
  profile: CompanyProfile;
  answers?: Record<string, unknown>;
  gaps?: Gap[];
  findings?: Finding[];
  evidence?: Evidence[];
  branding?: BuildInput['branding'];
}): DocumentContext {
  const { profile, gaps = [], findings = [], evidence = [] } = input;
  const isBrazil = profile.country?.toUpperCase() === 'BR';

  const euChecks = [
    ['EN 16931 syntax conformance', 'Structured invoice contains all mandatory BT-1..BT-24 elements', 'Required for cross-border exchange'],
    ['Peppol BIS Billing 3.0', 'Message conforms to the Peppol business semantic model', 'Default network for EU B2B exchange'],
    ['UBL / Factur-X (ZUGFeRD)', 'Hybrid PDF + XML for Germany', 'Required by German recipients'],
    ['FatturaPA', 'Italian national transmission', 'Required for Italian recipients'],
    ['VAT data profile', 'Buyer VAT number, country codes, rates and reverse charge flags', 'ViDA Art. 14(5), 14(7)'],
    ['Sequential numbering', 'No gaps in the numbering series', 'Control requirement'],
    ['Archiving', 'XML retained 10 years in immutable storage', 'ViDA Art. 14(8), VAT Directive Art. 233'],
    ['Contingency', 'Offline issuance and later transmission procedure defined', 'Service continuity'],
  ];

  const brChecks = [
    ['NF-e autorização', 'Products invoiced as authorised XML in the SEFAZ portal', 'Mandatory'],
    ['NFS-e nacional', 'Services invoiced with the national XML schema and municipal validation', 'Mandatory'],
    ['XMLDSig signature', 'Digital signature valid and certificate in date', 'Mandatory'],
    ['Contingência fiscal', 'Offline issuance with later transmission when SEFAZ is unavailable', 'Mandatory'],
    ['Eventos', 'Cancelamento and substituição events handled within deadlines', 'Mandatory'],
    ['Arquivamento', 'XML archived with signature for 5 years', 'Mandatory'],
    ['Regras estaduais', 'State-specific rules (Radar habilitação, protocol, contingência)', 'Per state'],
  ];

  const findingsByCategory = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.category] = (acc[f.category] ?? 0) + 1;
    return acc;
  }, {});

  const sections: DocumentContext['sections'] = [
    {
      id: 'einv-1',
      heading: '1. Scope',
      level: 2,
      body: html.p(
        isBrazil
          ? 'This report assesses the readiness of the invoicing process for the Brazilian national electronic invoicing model (NF-e for goods, NFS-e national for services), including XML structure, digital signature, authorisation, contingency and archiving, and the EU requirements that apply to cross-border customers.'
          : 'This report assesses the readiness of the invoicing process for EU structured electronic invoicing under ViDA (Directive (EU) 2024/2831), the EN 16931 standard and the relevant national platforms.',
      ) +
        html.kv(
          rows([
            ['Country of establishment', esc(profile.country)],
            ['Sector', esc(profile.sector)],
            ['Cross-border B2B', TBC('yes/no — destination countries')],
            ['Brazilian operations', isBrazil ? 'Yes' : 'No'],
            ['Applicable deadline', isBrazil ? 'National model already in force (phased by state to 2026)' : '1 July 2030 (ViDA Art. 14(5))'],
          ]),
        ),
    },
    {
      id: 'einv-2',
      heading: '2. European requirements',
      level: 2,
      body: html.table(
        ['Requirement', 'What must be true', 'Status'],
        euChecks.map(([req, detail, note]) => [
          esc(req),
          esc(detail),
          TBC(note),
        ]),
        'Table 1 — EN 16931 / Peppol / ViDA checklist',
      ),
    },
    {
      id: 'einv-3',
      heading: '3. Brazilian requirements',
      level: 2,
      body: isBrazil
        ? html.table(
            ['Requirement', 'What must be true', 'Note'],
            brChecks.map(([req, detail, note]) => [esc(req), esc(detail), esc(note)]),
            'Table 2 — NF-e / NFS-e national checklist',
          )
        : html.p('No Brazilian operations are declared, so the NF-e and NFS-e requirements do not apply to this entity. They are included for reference only.'),
    },
    {
      id: 'einv-4',
      heading: '4. Codebase findings',
      level: 2,
      body: findings.length
        ? html.table(
            ['Category', 'Findings', 'Interpretation'],
            Object.entries(findingsByCategory).map(([category, count]) => [
              esc(category),
              String(count),
              esc(interpretCategory(category)),
            ]),
            'Table 3 — Findings from the codebase scan related to invoicing',
          )
        : html.p('No invoice-related codebase findings were reported by the scanner.'),
    },
    {
      id: 'einv-5',
      heading: '5. Open items',
      level: 2,
      body: gaps.filter((g) => g.frameworkId === 'e-invoicing').length
        ? html.table(
            ['Article', 'Gap', 'Severity', 'Remediation', 'Effort (days)'],
            gaps
              .filter((g) => g.frameworkId === 'e-invoicing')
              .slice(0, 20)
              .map((g) => [esc(g.articleId), esc(g.title ?? ''), g.severity, esc(g.remediation), formatNumber(Math.round(g.effort * 10) / 10, 1)]),
            'Table 4 — Open e-invoicing gaps',
          )
        : html.p('No open e-invoicing gaps.'),
    },
    {
      id: 'einv-6',
      heading: '6. Evidence on file',
      level: 2,
      body: evidence.filter((e) => e.frameworkId === 'e-invoicing').length
        ? html.table(
            ['Evidence', 'Type', 'Collected', 'Verified'],
            evidence
              .filter((e) => e.frameworkId === 'e-invoicing')
              .map((e) => [esc(e.title), esc(e.type ?? '—'), esc(e.collectedAt?.slice(0, 10) ?? '—'), e.verified ? 'Yes' : 'No']),
            'Table 5 — Evidence retained for e-invoicing',
          )
        : html.p('No e-invoicing evidence has been uploaded yet. Evidence such as a validation report against the applicable profile, a signed sample invoice and a protocol receipt is expected.'),
    },
  ];

  return createContext({
    kind: 'einvoice-validation-report',
    title: 'E-invoicing Validation Report',
    subtitle: `${profile.name} · EN 16931 / Peppol / NF-e`,
    sections,
    profile,
    gaps,
    branding: input.branding,
    extraMetadata: [
      ['Scan findings', String(findings.length)],
      ['Evidence items', String(evidence.length)],
      ['Generated', formatDateEU(new Date())],
    ],
    disclaimer:
      'Validation results describe the configuration observed at the time of the assessment. Tax authority acceptance must be confirmed against the current national rules. This document is a compliance working document, not tax or legal advice.',
  });
}

function interpretCategory(category: string): string {
  const map: Record<string, string> = {
    'pii-collection': 'Personal data in invoice flows must have a documented legal basis and retention period.',
    'personal-data-logging': 'Invoice logs inherit personal data rules; redact or limit them.',
    'data-transfer': 'Cross-border data flows for e-invoicing need a transfer tool.',
    encryption: 'Invoices in transit and at rest must be encrypted.',
    'access-control': 'Issuing rights must follow least privilege.',
    retention: 'Invoices must be retained for the statutory period in readable form.',
    'cookie-consent': 'Self-service portals need consent management.',
    'unstructured-storage': 'Invoice payloads must be stored in a structured, queryable form.',
  };
  return map[category] ?? 'Review the finding and record the compliance decision.';
}

/** Cross-framework 90-day roadmap as a document. */
export function roadmapDocument(input: {
  profile: CompanyProfile;
  roadmap: Roadmap;
  gaps?: Gap[];
  branding?: BuildInput['branding'];
}): DocumentContext {
  const { profile, roadmap } = input;
  const facts = profileFacts(profile);

  const sections: DocumentContext['sections'] = [
    {
      id: 'rm-1',
      heading: '1. Where you stand',
      level: 2,
      body: html.kpis([
        { label: 'Total items', value: String(roadmap.items.length) },
        { label: 'Person-days', value: formatNumber(roadmap.totalEffort, 1) },
        { label: 'Days to AI Act deadline', value: daysUntil('2026-08-02') },
        { label: 'Employees', value: String(profile.employees) },
      ]) +
        html.p(
          `This plan covers every open compliance item across the frameworks in scope: ${facts.aiSystemCount > 0 ? 'the EU AI Act, ' : ''}${profile.processingActivities?.length ? 'the GDPR, ' : ''}${profile.revenueEUR > 150_000_000 || profile.employees > 750 ? 'CSRD/ESRS' : 'e-invoicing'}. Items are sequenced by statutory deadline first, then by fine exposure, then by effort, so the work that removes the most risk happens first.`,
        ),
    },
    ...roadmap.phases.map((phase) => ({
      id: `rm-${phase.phase}`,
      heading: `${phase.label}`,
      level: 2 as const,
      body:
        html.kv(
          rows([
            ['Window', esc(phase.window)],
            ['Items', String(phase.items.length)],
            ['Effort', `${formatNumber(phase.effort, 1)} person-days`],
            ['Risk reduction', phase.riskReduction ? `${phase.riskReduction.toLocaleString('en-IE')} EUR of exposure addressed` : '—'],
          ]),
        ) +
        (phase.items.length
          ? html.table(
              ['ID', 'Action', 'Framework', 'Severity', 'Effort', 'Start', 'Due'],
              phase.items.map((item) => [
                item.id,
                esc(item.title),
                esc(item.frameworkIds.join(', ')),
                item.severity,
                formatNumber(item.effort, 1),
                item.startDate,
                item.dueDate,
              ]),
              `Table — ${phase.label}`,
            )
          : html.p('No items are scheduled in this phase.')),
    })),
    {
      id: 'rm-quick',
      heading: 'Quick wins (complete in the first two weeks)',
      level: 2,
      body: roadmap.quickWins.length
        ? html.ol(
            roadmap.quickWins.map((item) =>
              `${esc(item.title)} <span class="muted">(${item.frameworkIds.join(', ')}, ${formatNumber(item.effort, 1)} days)</span>`,
            ),
          )
        : html.p('No quick wins were identified — your open items are all substantial projects.'),
    },
    {
      id: 'rm-2',
      heading: 'How to run the plan',
      level: 2,
      body: html.ul([
        'Assign a named owner to every item. An unowned compliance item is not being done.',
        'Work the phases in order; the phases are ordered so that later items depend on earlier ones.',
        'Upload evidence as each item closes. Evidence, not claims, is what an auditor accepts.',
        'Re-run the assessment quarterly: scores and deadlines update automatically.',
        'Escalate to management anything that slips past its due date — a missed AI Act or GDPR deadline is a board-level issue.',
      ]),
    },
  ];

  return createContext({
    kind: 'compliance-roadmap',
    title: '90-Day Compliance Roadmap',
    subtitle: `${profile.name} · generated ${formatDateEU(roadmap.generatedAt)}`,
    sections,
    profile,
    roadmap,
    branding: input.branding,
    extraMetadata: [
      ['Plan window', `${roadmap.startDate} → ${roadmap.endDate}`],
      ['Total effort', `${formatNumber(roadmap.totalEffort, 1)} person-days`],
      ['Projected score', roadmap.projectedScore ? `${formatNumber(roadmap.projectedScore, 1)}%` : '—'],
    ],
    disclaimer: roadmap.disclaimer,
  });
}

function daysUntil(iso: string): string {
  const diff = Math.ceil((new Date(`${iso}T00:00:00Z`).getTime() - Date.now()) / 86_400_000);
  return diff >= 0 ? String(diff) : `${Math.abs(diff)} past`;
}