/**
 * Applicability rules: which frameworks a given company must comply with.
 * Used by the CLI onboarding, the API and the web dashboard to avoid asking
 * questions that do not apply.
 */

import { EU_AI_ACT_PHASES } from '@complisme/shared';
import type { CompanyProfile, FrameworkId } from '@complisme/shared';

export interface Applicability {
  frameworkId: FrameworkId;
  applies: boolean;
  /** 0-1, how confident we are. Drives the "needs review" flag. */
  confidence: number;
  reason: string;
  /** Mandatory action to take when it applies. */
  action?: string;
}

/**
 * CSRD thresholds after the Omnibus simplification (Directive (EU) 2025/794):
 *  - main wave: > 1750 employees (group) OR > €500M net turnover
 *  - second wave: > 750 employees OR > €150M net turnover (FY2028)
 *  - small companies may opt in to the voluntary simplified standard
 */
export function csrdWave(profile: CompanyProfile): { applies: boolean; reason: string } {
  const { employees, revenueEUR } = profile;
  if (employees > 1750 || revenueEUR > 500_000_000) {
    return {
      applies: true,
      reason: `Above the main CSRD thresholds (${employees} employees / €${Math.round(
        revenueEUR / 1_000_000,
      )}M turnover): full ESRS reporting with assurance.`,
    };
  }
  if (employees > 750 || revenueEUR > 150_000_000) {
    return {
      applies: true,
      reason: `Second wave (${employees} employees / €${Math.round(
        revenueEUR / 1_000_000,
      )}M turnover): ESRS reporting from financial year 2028.`,
    };
  }
  if (employees > 250 || revenueEUR > 50_000_000) {
    return {
      applies: true,
      reason: `Above the pre-Omnibus thresholds (${employees} employees / €${Math.round(
        revenueEUR / 1_000_000,
      )}M turnover): confirm the transposition of Directive (EU) 2025/794 in your Member State.`,
    };
  }
  return {
    applies: false,
    reason: `Below the CSRD thresholds (${employees} employees, €${Math.round(
      revenueEUR / 1_000_000,
    )}M turnover). You can still opt in to the voluntary simplified SME standard.`,
  };
}

export function euAiActApplies(profile: CompanyProfile): { applies: boolean; reason: string } {
  const systems = profile.aiSystems ?? [];
  if (systems.length === 0) {
    return { applies: false, reason: 'No AI systems declared in your inventory.' };
  }
  const highRisk = systems.filter((s) =>
    ['employment', 'hr', 'education', 'credit', 'essential-services', 'biometrics', 'law'].includes(
      s.domain,
    ),
  );
  if (highRisk.length > 0) {
    return {
      applies: true,
      reason: `${highRisk.length} AI system(s) fall into Annex III high-risk use cases (${highRisk
        .map((s) => s.domain)
        .join(', ')}).`,
    };
  }
  return {
    applies: true,
    reason: `${systems.length} AI system(s) in use: transparency and AI literacy duties apply from ${EU_AI_ACT_PHASES.generalApplication}.`,
  };
}

export function gdprApplies(profile: CompanyProfile): { applies: boolean; reason: string } {
  const activities = profile.processingActivities ?? [];
  const personal = activities.length > 0 || profile.usesCookies === true;
  return {
    applies: personal,
    reason: personal
      ? `${activities.length} processing activity/activities declared; GDPR applies to all of them.`
      : 'No personal data processing declared. The GDPR still applies as soon as you collect any personal data or use cookies.',
  };
}

export function einvoicingApplies(profile: CompanyProfile): { applies: boolean; reason: string } {
  const brazil = profile.country?.toUpperCase() === 'BR';
  const crossBorder = profile.sector && /saas|software|marketplace|ecommerce|consulting/i.test(profile.sector);
  if (brazil) {
    return {
      applies: true,
      reason: 'Brazilian operations: NF-e / NFS-e national e-invoicing is mandatory and non-digital invoices no longer exist.',
    };
  }
  if (crossBorder && profile.revenueEUR > 100_000) {
    return {
      applies: true,
      reason: 'Cross-border services/ecommerce: ViDA structured e-invoicing becomes mandatory on 1 July 2030.',
    };
  }
  return {
    applies: false,
    reason: 'No Brazilian operations and no material cross-border EU B2B/B2C exposure detected. Re-evaluate before 2030.',
  };
}

export function applicableFrameworks(profile: CompanyProfile): Applicability[] {
  const csrd = csrdWave(profile);
  const aiAct = euAiActApplies(profile);
  const gdpr = gdprApplies(profile);
  const eInv = einvoicingApplies(profile);
  return [
    {
      frameworkId: 'gdpr',
      applies: gdpr.applies,
      confidence: 0.95,
      reason: gdpr.reason,
      action: gdpr.applies ? 'Complete the GDPR questionnaire and produce a ROPA.' : undefined,
    },
    {
      frameworkId: 'eu-ai-act',
      applies: aiAct.applies,
      confidence: 0.8,
      reason: aiAct.reason,
      action: aiAct.applies ? 'Screen every AI use case and classify it.' : undefined,
    },
    {
      frameworkId: 'csrd',
      applies: csrd.applies,
      confidence: 0.6,
      reason: csrd.reason,
      action: csrd.applies ? 'Start the double materiality assessment.' : undefined,
    },
    {
      frameworkId: 'e-invoicing',
      applies: eInv.applies,
      confidence: 0.7,
      reason: eInv.reason,
      action: eInv.applies ? 'Map required tax data and validate your XML profile.' : undefined,
    },
  ];
}

/** Framework ids the company should be scored on. */
export function selectedFrameworks(profile: CompanyProfile): FrameworkId[] {
  const explicit = profile.frameworks;
  if (explicit && explicit.length) return explicit;
  const applicable = applicableFrameworks(profile).filter((a) => a.applies).map((a) => a.frameworkId);
  // A brand-new profile has no AI systems and no declared processing, so
  // nothing is "applicable" yet. Returning nothing would give the user an empty
  // dashboard on first login, so fall back to the two frameworks every
  // European SME realistically touches.
  return applicable.length ? applicable : (['gdpr', 'eu-ai-act'] as FrameworkId[]);
}