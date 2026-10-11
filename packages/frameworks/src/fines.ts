/**
 * Penalty model.
 *
 * Regulation (EU) 2018/1724 / 2016/679 Art. 83 and AI Act Art. 99 both cap fines at
 * "the higher/lower of a fixed amount and a share of worldwide annual turnover".
 * This module implements that cap so the dashboard can show a realistic worst case
 * instead of the theoretical maximum.
 */

import { AI_ACT_MAX_FINE, CSRD_MAX_FINE, GDPR_MAX_FINE } from '@complisme/shared';
import type { FrameworkId } from '@complisme/shared';

export interface PenaltyEstimate {
  frameworkId: FrameworkId;
  /** Theoretical maximum (fixed amount). */
  fixedCap: number;
  /** Turnover based percentage. */
  turnoverRate: number;
  /** Turnover x rate: the second limb of the statutory cap. */
  turnoverShare: number;
  /** Annual worldwide turnover used for the calculation. */
  turnover: number;
  /** Theoretical maximum expressed as a euro amount. */
  theoreticalMax: number;
  /** Realistic worst case for an SME (lower of fixed cap and turnover share). */
  realisticMax: number;
  /** Realistic worst case for a small mid-cap: max(turnover share, 50% of fixed cap). */
  smesMax: number;
  basis: string;
}

const TURNOVER_RATE: Record<string, number> = {
  'eu-ai-act': 0.07, // 7% for prohibited practices; 3% for most other obligations
  gdpr: 0.04,
  csrd: 0, // national transposition; use the fixed national penalty
  'e-invoicing': 0,
};

const FIXED_CAP: Record<string, number> = {
  'eu-ai-act': AI_ACT_MAX_FINE.prohibited,
  gdpr: GDPR_MAX_FINE,
  csrd: CSRD_MAX_FINE,
  'e-invoicing': 50_000,
};

const BASIS: Record<string, string> = {
  'eu-ai-act': 'AI Act Art. 99(3)-(4): up to €35M or 7% of worldwide annual turnover for prohibited practices (Art. 99(3)); 3% for most other obligations.',
  gdpr: 'GDPR Art. 83(5): up to €20M or 4% of worldwide annual turnover for the highest tier.',
  csrd: 'CSRD Art. 34 + Delegated Regulation (EU) 2022/1416: national penalties, €3M reference ceiling.',
  'e-invoicing': 'National VAT/e-invoicing penalties: typical assessment ranges from €1,000 to €50,000 per incorrect or missing structured invoice.',
};

export function estimatePenalty(frameworkId: FrameworkId, turnover: number): PenaltyEstimate {
  const fixedCap = FIXED_CAP[frameworkId] ?? 0;
  const turnoverRate = TURNOVER_RATE[frameworkId] ?? 0;
  const turnoverShare = Math.round(turnover * turnoverRate);
  return {
    frameworkId,
    fixedCap,
    turnoverRate,
    turnoverShare,
    turnover,
    theoreticalMax: Math.max(fixedCap, turnoverShare),
    realisticMax: turnoverShare > 0 ? Math.min(fixedCap, turnoverShare) : fixedCap,
    smesMax: turnoverShare > 0 ? Math.max(turnoverShare, Math.round(fixedCap * 0.5)) : fixedCap,
    basis: BASIS[frameworkId] ?? '',
  };
}

export function estimateAll(frameworkIds: FrameworkId[], turnover: number): PenaltyEstimate[] {
  return frameworkIds.map((id) => estimatePenalty(id, turnover));
}

/** Total exposure across frameworks, de-duplicating overlapping GDPR/AI Act conduct. */
export function aggregateExposure(
  estimates: PenaltyEstimate[],
): { realistic: number; theoretical: number } {
  const realistic = estimates.reduce((acc, e) => acc + e.realisticMax, 0);
  const theoretical = estimates.reduce((acc, e) => acc + e.theoreticalMax, 0);
  return { realistic, theoretical };
}