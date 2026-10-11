/**
 * 90-day remediation roadmap.
 *
 * The roadmap is the deliverable an SME actually acts on, so it is built around
 * three constraints: the regulatory deadline, the fine exposure at stake, and
 * the effort required. Sequencing rules:
 *
 *   - Blocking errors and statutory deadlines first.
 *   - Quick wins (≤2 days) hoisted into the first 30 days because they unblock
 *     the rest of the plan and give momentum.
 *   - Large items split across phases so no phase exceeds a realistic capacity.
 */

import {
  addDays,
  clamp,
  isoDate,
  round,
  SEVERITY_RANK,
  sum,
} from '@complisme/shared';
import type {
  ComplianceScore,
  Gap,
  Roadmap,
  RoadmapItem,
  RoadmapPhase,
  RoadmapPhaseSummary,
  Severity,
} from '@complisme/shared';

export interface RoadmapOptions {
  companyId?: string;
  /** Length of the plan in days (default 90). */
  horizonDays?: number;
  today?: Date;
  /** Person-days the team can realistically spend per phase. */
  capacityPerPhase?: number;
  /** Compliance score today, used to project the score after remediation. */
  currentScore?: number;
}

export const PHASE_LABELS: Record<RoadmapPhase, string> = {
  'quick-wins': 'Days 1-30 — Quick wins & blockers',
  foundations: 'Days 31-60 — Foundations & documentation',
  hardening: 'Days 61-90 — Hardening & assurance',
  ongoing: 'Ongoing — Continuous operation',
};

/**
 * Sort gaps into roadmap order.
 * Ordered by: effective deadline, then fine exposure (desc), then severity, then effort (asc).
 * Returns a new array; the input is not mutated.
 */
export function sortGaps(gaps: Gap[], today = new Date()): Gap[] {
  const deadlineOf = (g: Gap) => g.deadline ?? (g.deadlineIso ? new Date(g.deadlineIso) : undefined);
  return [...gaps].sort((a, b) => {
    const da = deadlineOf(a);
    const db = deadlineOf(b);
    const aDays = da ? Math.ceil((da.getTime() - today.getTime()) / 86_400_000) : 365;
    const bDays = db ? Math.ceil((db.getTime() - today.getTime()) / 86_400_000) : 365;
    if (aDays !== bDays) return aDays - bDays;
    const exposure = (b.fineExposure ?? 0) - (a.fineExposure ?? 0);
    if (exposure !== 0) return exposure;
    const severity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severity !== 0) return severity;
    return (a.effort ?? 0) - (b.effort ?? 0);
  });
}

/** Gap list sorted by deadline, fine exposure and effort (the spec'd `roadmap`). */
export function roadmap(gaps: Gap[], options: RoadmapOptions = {}): Gap[] {
  return sortGaps(gaps, options.today ?? new Date()).map((gap, index) => ({
    ...gap,
    order: index,
  }));
}

/** Build the phased 90-day plan. */
export function buildRoadmap(gaps: Gap[], options: RoadmapOptions = {}): Roadmap {
  const horizonDays = options.horizonDays ?? 90;
  const today = options.today ?? new Date();
  const start = new Date(today.getTime());
  const capacity = options.capacityPerPhase ?? 30;

  const ordered = roadmap(gaps, { today });
  const phaseOrder: RoadmapPhase[] = ['quick-wins', 'foundations', 'hardening'];
  const budgets: Record<RoadmapPhase, number> = {
    'quick-wins': capacity,
    foundations: capacity,
    hardening: capacity,
    ongoing: 0,
  };
  const used: Record<RoadmapPhase, number> = {
    'quick-wins': 0,
    foundations: 0,
    hardening: 0,
    ongoing: 0,
  };

  const assigned = new Map<string, RoadmapPhase>();
  for (const gap of ordered) {
    const phase = pickPhase(gap, budgets, used, today, horizonDays);
    assigned.set(gapKey(gap), phase);
    used[phase] += gap.effort ?? 1;
  }

  const windows: Record<RoadmapPhase, { start: string; end: string }> = {
    'quick-wins': { start: isoDate(start)!, end: isoDate(addDays(start, 30))! },
    foundations: { start: isoDate(addDays(start, 30))!, end: isoDate(addDays(start, 60))! },
    hardening: { start: isoDate(addDays(start, 60))!, end: isoDate(addDays(start, horizonDays))! },
    ongoing: { start: isoDate(addDays(start, horizonDays))!, end: isoDate(addDays(start, horizonDays + 365))! },
  };

  const items: RoadmapItem[] = ordered.map((gap, index) => {
    const phase = assigned.get(gapKey(gap))!;
    const window = windows[phase];
    const offset = Math.round((index / Math.max(1, ordered.length)) * 100) / 100;
    const startOffset = Math.round(daysBetweenIso(window.start, window.end) * 0.7 * offset);
    const itemStart = addDaysFromIso(window.start, startOffset);
    const due = gap.deadline
      ? new Date(gap.deadline)
      : gap.deadlineIso
        ? new Date(gap.deadlineIso)
        : addDays(new Date(itemStart), 7);
    const effectiveDue = due < itemStart ? itemStart : due;
    return {
      id: `RM-${String(index + 1).padStart(3, '0')}`,
      title: gap.title ?? `${gap.frameworkId} / ${gap.articleId}`,
      description: gap.remediation,
      phase,
      frameworkIds: [gap.frameworkId],
      articleIds: [gap.articleId],
      gapIds: [gap.id],
      severity: gap.severity,
      startDate: isoDate(itemStart)!,
      dueDate: isoDate(effectiveDue)!,
      effort: round(gap.effort ?? 1, 1),
      fineExposure: gap.fineExposure,
      citation: gap.citation,
      automated: isAutomatable(gap),
    };
  });

  const phases: RoadmapPhaseSummary[] = phaseOrder.map((phase) => {
    const phaseItems = items.filter((i) => i.phase === phase);
    return {
      phase,
      label: PHASE_LABELS[phase],
      window: `${windows[phase].start} → ${windows[phase].end}`,
      startDate: windows[phase].start,
      endDate: windows[phase].end,
      items: phaseItems,
      effort: round(sum(phaseItems.map((i) => i.effort)), 1),
      riskReduction: phaseItems.reduce((acc, i) => acc + (i.fineExposure ?? 0), 0),
    };
  });

  const totalEffort = round(sum(items.map((i) => i.effort)), 1);
  const totalFineExposure = Math.max(0, ...items.map((i) => i.fineExposure ?? 0));
  const quickWins = items
    .filter((i) => i.effort <= 2 && i.severity !== 'info')
    .slice(0, 12);

  return {
    companyId: options.companyId,
    generatedAt: today.toISOString(),
    horizonDays,
    startDate: windows['quick-wins'].start,
    endDate: windows.hardening.end,
    phases,
    items,
    totalEffort,
    totalFineExposure,
    quickWins,
    projectedScore:
      options.currentScore === undefined
        ? undefined
        : clamp(options.currentScore + items.length * 1.5, 0, 100),
    disclaimer:
      'This roadmap is generated from your answers to an automated assessment. It is decision support, not legal advice. Have the output reviewed by a qualified lawyer or DPO before relying on it.',
  };
}

function pickPhase(
  gap: Gap,
  budgets: Record<RoadmapPhase, number>,
  used: Record<RoadmapPhase, number>,
  today: Date,
  horizonDays: number,
): RoadmapPhase {
  const deadline = gap.deadline ?? (gap.deadlineIso ? new Date(gap.deadlineIso) : undefined);
  const daysToDeadline = deadline
    ? Math.ceil((deadline.getTime() - today.getTime()) / 86_400_000)
    : Number.POSITIVE_INFINITY;
  const effort = gap.effort ?? 1;

  // A statutory deadline inside the horizon pins the item to the right phase.
  if (daysToDeadline <= 30) return 'quick-wins';
  if (daysToDeadline <= 60) return 'foundations';
  if (daysToDeadline <= horizonDays) return 'hardening';

  // No statutory deadline: sequence by severity and size.
  if (gap.severity === 'error') return effort <= 3 ? 'quick-wins' : 'foundations';
  if (gap.severity === 'warning') return effort <= 2 ? 'quick-wins' : 'foundations';
  return effort <= 2 ? 'quick-wins' : 'hardening';
}

/** Fill a phase when the natural assignment overflows the capacity budget. */
export function rebalanceCapacity(plan: Roadmap, capacityPerPhase = 30): Roadmap {
  const overflow: RoadmapItem[] = [];
  const phases = plan.phases.map((phase) => {
    if (phase.effort <= capacityPerPhase) return phase;
    const sorted = [...phase.items].sort(
      (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.effort - b.effort,
    );
    const keep: RoadmapItem[] = [];
    let acc = 0;
    for (const item of sorted) {
      if (acc + item.effort <= capacityPerPhase) {
        keep.push(item);
        acc += item.effort;
      } else {
        overflow.push({ ...item, phase: 'ongoing' as RoadmapPhase });
      }
    }
    return { ...phase, items: keep, effort: round(sum(keep.map((i) => i.effort)), 1) };
  });

  if (!overflow.length) return plan;

  const overflowIds = new Set(overflow.map((i) => i.id));
  return {
    ...plan,
    phases: [...phases, ongoingPhase(overflow)],
    items: plan.items.map((i) =>
      overflowIds.has(i.id) ? { ...i, phase: 'ongoing' as RoadmapPhase } : i,
    ),
  };
}

function ongoingPhase(items: RoadmapItem[]): RoadmapPhaseSummary {
  const start = items.map((i) => i.startDate).sort()[0] ?? isoDate(new Date())!;
  const end = items.map((i) => i.dueDate).sort().reverse()[0] ?? start;
  return {
    phase: 'ongoing',
    label: PHASE_LABELS.ongoing,
    window: `${start} → ${end}`,
    startDate: start,
    endDate: end,
    items,
    effort: round(sum(items.map((i) => i.effort)), 1),
    riskReduction: items.reduce((acc, i) => acc + (i.fineExposure ?? 0), 0),
  };
}

function isAutomatable(gap: Gap): boolean {
  return gap.source === 'scanner' || /generate|scan|rota|dpa|templat/i.test(gap.remediation ?? '');
}

function gapKey(gap: Gap): string {
  return gap.id;
}

function daysBetweenIso(start: string, end: string): number {
  return Math.max(
    1,
    Math.round((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000),
  );
}

function addDaysFromIso(iso: string, days: number): Date {
  return addDays(new Date(`${iso}T00:00:00Z`), days);
}

/**
 * Gaps whose statutory deadline falls inside the horizon.
 *
 * Deadlines that have already passed are excluded here: they are returned by
 * `overdueGaps` instead, because "due in 2030" and "was due in 2018" need very
 * different wording in the UI.
 */
export function urgentGaps(gaps: Gap[], days = 90, today = new Date()): Gap[] {
  const start = today.getTime();
  const limit = addDays(today, days).getTime();
  return sortGaps(gaps, today).filter((g) => {
    const d = g.deadline ?? (g.deadlineIso ? new Date(g.deadlineIso) : undefined);
    if (!d) return false;
    const time = d.getTime();
    return time > start && time <= limit && g.severity !== 'info';
  });
}

/** Gaps with a deadline that has already passed. */
export function overdueGaps(gaps: Gap[], today = new Date()): Gap[] {
  const now = today.getTime();
  return sortGaps(gaps, today).filter((g) => {
    const d = g.deadline ?? (g.deadlineIso ? new Date(g.deadlineIso) : undefined);
    return !!d && d.getTime() < now && g.severity !== 'info';
  });
}

/** Projected scores once a set of gaps is closed. */
export function projectScores(scores: ComplianceScore[], gaps: Gap[]): ComplianceScore[] {
  const closedPerFramework = new Map<string, number>();
  for (const gap of gaps) {
    closedPerFramework.set(gap.frameworkId, (closedPerFramework.get(gap.frameworkId) ?? 0) + 1);
  }
  return scores.map((score) => {
    const closed = closedPerFramework.get(score.frameworkId) ?? 0;
    const total = (score.total ?? score.gaps.length + closed) || 1;
    const improvement = (closed / total) * 60;
    const projected = clamp(score.score + improvement, 0, 100);
    return { ...score, score: round(projected, 1) };
  });
}

export type { Severity };