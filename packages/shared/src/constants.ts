/** Regulatory constants and product configuration. */

import type { FrameworkId, Severity, SubscriptionPlan } from './types';

/** EU AI Act phased enforcement dates (Regulation (EU) 2024/1689 Art. 113). */
export const EU_AI_ACT_PHASES = {
  /** 2 Feb 2025 — prohibited practices + AI literacy. */
  prohibitions: '2025-02-02',
  /** 2 Aug 2025 — GPAI obligations, governance, penalties. */
  governance: '2025-08-02',
  /** 2 Aug 2026 — general application, incl. high-risk Annex III. */
  generalApplication: '2026-08-02',
  /** 2 Aug 2027 — Art. 6(1) high-risk systems in regulated products. */
  embeddedHighRisk: '2027-08-02',
} as const;

/** GDPR fines (Art. 83) — upper bounds in EUR. */
export const GDPR_MAX_FINE = 20_000_000;

/** EU AI Act fines (Art. 99) — upper bounds in EUR. */
export const AI_ACT_MAX_FINE = {
  prohibited: 35_000_000,
  mostOtherObligations: 15_000_000,
  incorrectInformation: 7_500_000,
  smesLowerCap: 7_500_000,
} as const;

/** CSRD / CS3D non-compliance fine (Delegated Reg. 2022/1416 Art. 3). */
export const CSRD_MAX_FINE = 3_000_000;

/** NPRA / NF-e (Brazil NFS-e) irregularity fine ceiling, in BRL. */
export const EINVOICING_MAX_FINE_BRL = 5_000;

/** Product pricing, in EUR per month. */
export const PRICING = {
  free: { monthly: 0, seats: 1, frameworks: 1, scansPerMonth: 1, llmDraftsPerMonth: 0 },
  starter: { monthly: 49, seats: 3, frameworks: 4, scansPerMonth: 25, llmDraftsPerMonth: 50 },
  business: { monthly: 149, seats: 15, frameworks: 4, scansPerMonth: 200, llmDraftsPerMonth: 500 },
  enterprise: { monthly: 0, seats: 100, frameworks: 4, scansPerMonth: 0, llmDraftsPerMonth: 0 },
} as const satisfies Record<SubscriptionPlan, {
  monthly: number;
  seats: number;
  frameworks: number;
  scansPerMonth: number;
  llmDraftsPerMonth: number;
}>;

export const PLAN_LIMITS = PRICING;

export const FRAMEWORK_LABELS: Record<string, string> = {
  'eu-ai-act': 'EU AI Act',
  csrd: 'CSRD / ESRS',
  gdpr: 'GDPR',
  'e-invoicing': 'E-invoicing',
};

export const FRAMEWORK_ORDER: FrameworkId[] = ['gdpr', 'eu-ai-act', 'csrd', 'e-invoicing'];

export const FRAMEWORK_ACCENT: Record<string, string> = {
  'eu-ai-act': '#4338ca',
  csrd: '#0f766e',
  gdpr: '#0369a1',
  'e-invoicing': '#b45309',
};

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  error: 1,
  warning: 0.5,
  info: 0.15,
};

export const SEVERITY_RANK: Record<Severity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

export const DEFAULT_BRANDING = {
  productName: 'CompliSME',
  tagline: 'Multi-framework compliance for SMEs',
  primaryColor: '#4338ca',
  accentColor: '#0f172a',
  supportEmail: 'support@complisme.eu',
  website: 'https://complisme.eu',
} as const;

/** Enforcement deadlines surfaced in the dashboard countdown. */
export const COUNTDOWN_EVENTS: Array<{
  id: string;
  label: string;
  date: string;
  frameworkId: FrameworkId;
  description: string;
}> = [
  {
    id: 'ai-act-general',
    label: 'EU AI Act fully applicable',
    date: EU_AI_ACT_PHASES.generalApplication,
    frameworkId: 'eu-ai-act',
    description:
      'High-risk systems in Annex III must be registered, documented, risk-assessed and CE-marked. Non-compliance can cost up to €15M or 3% of global turnover.',
  },
  {
    id: 'ai-act-embedded',
    label: 'EU AI Act embedded high-risk deadline',
    date: EU_AI_ACT_PHASES.embeddedHighRisk,
    frameworkId: 'eu-ai-act',
    description:
      'High-risk AI embedded in regulated products (machinery, medical devices, toys…) must be compliant.',
  },
  {
    id: 'csrd-wave2',
    label: 'CSRD second wave (companies >150 employees)',
    date: '2026-01-01',
    frameworkId: 'csrd',
    description:
      'Groups above 150 employees and >€50M net turnover report under ESRS for FY2026. Limited assurance on sustainability statements.',
  },
];