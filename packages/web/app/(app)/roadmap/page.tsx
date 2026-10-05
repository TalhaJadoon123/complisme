'use client';

import Link from 'next/link';

import { AppShell, ErrorBox, Loading, PageHeader } from '@/components/app-shell';
import { ScoreBar } from '@/components/score-ring';
import { api, getCompanyId } from '@/lib/api';
import type { RoadmapResponse } from '@/lib/api';
import { dateLabel, euro, titleCase } from '@/lib/format';
import { useCallback, useEffect, useState } from 'react';

const PHASE_STYLE: Record<string, { label: string; accent: string; badge: string }> = {
  'quick-wins': {
    label: 'Days 1–30 · Quick wins & blockers',
    accent: 'border-emerald-300 bg-emerald-50',
    badge: 'badge-ok',
  },
  foundations: {
    label: 'Days 31–60 · Foundations & documentation',
    accent: 'border-brand-300 bg-brand-50',
    badge: 'badge-info',
  },
  hardening: {
    label: 'Days 61–90 · Hardening & assurance',
    accent: 'border-amber-300 bg-amber-50',
    badge: 'badge-warning',
  },
  ongoing: {
    label: 'Ongoing',
    accent: 'border-slate-300 bg-surface',
    badge: 'badge-info',
  },
};

export default function RoadmapPage() {
  const [data, setData] = useState<RoadmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState(90);

  const load = useCallback(async (days: number) => {
    const companyId = getCompanyId();
    if (!companyId) {
      setError('No company selected. Complete onboarding first.');
      setLoading(false);
      return;
    }
    try {
      setError(null);
      setData(await api.roadmap(companyId, days));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(horizon);
  }, [horizon, load]);

  const roadmap = data?.roadmap;

  return (
    <AppShell>
      <PageHeader
        title="90-day remediation roadmap"
        description="Every open gap, sequenced by statutory deadline, then fine exposure, then effort."
        action={
          <div className="flex items-center gap-2">
            <select
              className="input w-auto"
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
              aria-label="Planning horizon"
            >
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
              <option value={365}>12 months</option>
            </select>
            <button type="button" className="btn-secondary" onClick={() => void load(horizon)}>
              Refresh
            </button>
          </div>
        }
      />

      {loading && <Loading label="Building your roadmap…" />}
      {error && <ErrorBox error={error} onRetry={() => void load(horizon)} />}

      {roadmap && (
        <div className="space-y-6">
          {/* Summary ---------------------------------------------------------- */}
          <section className="card p-6">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Overall readiness" value={`${data!.overall.toFixed(0)}%`} />
              <Metric label="Open items" value={String(roadmap.items.length)} />
              <Metric label="Total effort" value={`${roadmap.totalEffort} days`} />
              <Metric
                label="Projected score"
                value={roadmap.projectedScore ? `${roadmap.projectedScore.toFixed(0)}%` : '—'}
                hint="if everything is completed"
              />
            </div>
            <div className="mt-5">
              <div className="mb-1 flex justify-between text-xs text-ink-muted">
                <span>Today</span>
                <span>
                  {dateLabel(roadmap.startDate)} → {dateLabel(roadmap.endDate)}
                </span>
              </div>
              <ScoreBar score={data!.overall} />
            </div>
            {roadmap.disclaimer && (
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs text-ink-muted">
                {roadmap.disclaimer}
              </p>
            )}
          </section>

          {/* Quick wins ------------------------------------------------------- */}
          {roadmap.quickWins.length > 0 && (
            <section className="card border-emerald-200 bg-emerald-50/50 p-6">
              <h2 className="text-sm font-bold uppercase tracking-wide text-emerald-900">
                Quick wins — complete these in the first two weeks
              </h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {roadmap.quickWins.map((item) => (
                  <li key={item.id} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 text-emerald-600">✓</span>
                    <span className="text-ink">{item.title}</span>
                    <span className="ml-auto shrink-0 text-xs text-ink-muted">{item.effort}d</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Phases ----------------------------------------------------------- */}
          {roadmap.phases.map((phase) => {
            if (!phase.items.length) return null;
            const style = PHASE_STYLE[phase.phase] ?? PHASE_STYLE.ongoing;
            return (
              <section key={phase.phase}>
                <div className={`rounded-t-xl border border-b-0 px-5 py-3 ${style.accent}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-bold text-ink">{style.label}</h2>
                    <div className="flex items-center gap-2 text-xs text-ink-muted">
                      <span>{phase.items.length} items</span>
                      <span>·</span>
                      <span>{phase.effort} person-days</span>
                      {phase.riskReduction > 0 && (
                        <>
                          <span>·</span>
                          <span>{euro(phase.riskReduction)} exposure addressed</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="card divide-y divide-slate-100 rounded-t-none">
                  {phase.items.map((item) => (
                    <article key={item.id} className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`${style.badge}`}>{item.id}</span>
                            <span
                              className={`badge ${
                                item.severity === 'error'
                                  ? 'badge-error'
                                  : item.severity === 'warning'
                                    ? 'badge-warning'
                                    : 'badge-info'
                              }`}
                            >
                              {item.severity}
                            </span>
                            {item.frameworkIds.map((id) => (
                              <span key={id} className="text-xs text-ink-muted">
                                {titleCase(id)}
                              </span>
                            ))}
                          </div>

                          <h3 className="mt-2 text-sm font-bold text-ink">{item.title}</h3>
                          {item.description && (
                            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{item.description}</p>
                          )}
                          {item.citation && (
                            <p className="mt-1 text-xs font-mono text-ink-muted">{item.citation}</p>
                          )}
                        </div>

                        <div className="shrink-0 text-right text-xs text-ink-muted">
                          <div className="font-semibold text-ink">{item.effort} days</div>
                          <div>
                            {dateLabel(item.startDate)} → {dateLabel(item.dueDate)}
                          </div>
                          {item.fineExposure ? (
                            <div className="mt-1 text-red-600">{euro(item.fineExposure)} at stake</div>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}

          <div className="card p-6">
            <h2 className="text-sm font-bold text-ink">How to run this plan</h2>
            <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-ink-muted">
              <li>Assign a named owner to every item. An unowned compliance item is not being done.</li>
              <li>Work the phases in order — later items depend on earlier ones.</li>
              <li>
                Upload evidence as each item closes.{' '}
                <Link href="/documents" className="font-semibold text-brand-700">
                  Generate the documents
                </Link>{' '}
                that close them.
              </li>
              <li>Re-run the assessment quarterly. Scores and deadlines update automatically.</li>
              <li>Escalate anything that slips — a missed AI Act or GDPR deadline is a board-level issue.</li>
            </ul>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-ink">{value}</p>
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}