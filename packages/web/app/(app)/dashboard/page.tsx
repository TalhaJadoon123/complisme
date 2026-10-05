'use client';

import Link from 'next/link';

import { AppShell, ErrorBox, Loading, PageHeader } from '@/components/app-shell';
import { DeadlineCountdown } from '@/components/deadline-countdown';
import { ScoreBar, ScoreRing } from '@/components/score-ring';
import { api, getCompanyId } from '@/lib/api';
import type { StatusResponse } from '@/lib/api';
import { days, euro, titleCase } from '@/lib/format';
import { useCallback, useEffect, useState } from 'react';

export default function DashboardPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    const companyId = getCompanyId();
    if (!companyId) {
      setError('No company selected yet. Complete onboarding first.');
      setLoading(false);
      return;
    }
    try {
      setError(null);
      setStatus(await api.status(companyId));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runAssessment = async () => {
    const companyId = getCompanyId();
    if (!companyId) return;
    setAssessing(true);
    try {
      await api.assess(companyId);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAssessing(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Compliance dashboard"
        description="Readiness across every framework you are in scope for, with the gaps that matter first."
        action={
          <button type="button" onClick={runAssessment} disabled={assessing} className="btn-primary">
            {assessing ? 'Assessing…' : 'Run assessment'}
          </button>
        }
      />

      {loading && <Loading label="Loading your compliance status…" />}
      {error && <ErrorBox error={error} onRetry={load} />}

      {status && (
        <div className="space-y-6">
          {!status.hasAssessment && (
            <div className="card border-amber-200 bg-amber-50 p-5">
              <h2 className="text-sm font-bold text-amber-900">No assessment recorded yet</h2>
              <p className="mt-1 text-sm text-amber-800">
                Scores below use your company profile only. Answer the questionnaires to get an
                accurate readiness picture.
              </p>
              <Link href="/onboarding" className="btn-primary mt-4">
                Start the questionnaire
              </Link>
            </div>
          )}

          {/* Overall ---------------------------------------------------------- */}
          <section className="card p-6">
            <div className="flex flex-wrap items-center gap-8">
              <ScoreRing score={status.overall} grade={status.grade} size={128} label="Overall readiness" />
              <div className="min-w-[240px] flex-1">
                <h2 className="text-lg font-bold text-ink">
                  {status.grade === 'A' || status.grade === 'B'
                    ? 'In good shape'
                    : status.grade === 'C'
                      ? 'Workable, with gaps'
                      : 'Material work outstanding'}
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  {status.summary.total} open gaps · {status.summary.bySeverity.error ?? 0} blocking ·{' '}
                  {status.summary.effort} person-days to close them all
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Blockers" value={String(status.summary.bySeverity.error ?? 0)} tone="error" />
                  <Stat label="Due in 90d" value={String(status.urgent)} tone="warning" />
                  <Stat label="Past deadline" value={String(status.overdue)} tone="error" />
                  <Stat label="Evidence" value={String(status.evidenceCount)} tone="neutral" />
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-ink-muted">Worst-case exposure</p>
                <p className="text-2xl font-black text-red-600">
                  {euro(status.summary.fineExposure)}
                </p>
                <p className="mt-1 max-w-[14rem] text-xs text-ink-muted">
                  Statutory maximum for a single breached article
                </p>
              </div>
            </div>
          </section>

          {/* Countdowns -------------------------------------------------------- */}
          {status.countdowns.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
                Upcoming deadlines
              </h2>
              <div className="grid gap-4 md:grid-cols-3">
                {status.countdowns.map((event) => (
                  <DeadlineCountdown
                    key={event.id}
                    date={event.date}
                    label={event.label}
                    frameworkId={event.frameworkId}
                    description={event.description}
                    compact
                  />
                ))}
              </div>
            </section>
          )}

          {/* Per-framework ----------------------------------------------------- */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
              Readiness by framework
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {status.scores.map((score) => {
                const blockers = score.gaps.filter((g) => g.severity === 'error').length;
                return (
                  <div key={score.frameworkId} className="card p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-ink">
                          {status.applicability.find((a) => a.frameworkId === score.frameworkId)
                            ? titleCase(score.frameworkId)
                            : titleCase(score.frameworkId)}
                        </h3>
                        <p className="mt-1 text-xs text-ink-muted">
                          {score.answered ?? 0}/{score.total ?? 0} questions answered
                          {score.evidenceCoverage !== undefined && ` · ${Math.round(score.evidenceCoverage)}% evidence`}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-2xl font-black tabular-nums text-ink">
                          {score.score.toFixed(0)}%
                        </div>
                        <div className="text-xs font-semibold text-ink-muted">grade {score.grade ?? '—'}</div>
                      </div>
                    </div>

                    <ScoreBar score={score.score} className="mt-3" />

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
                      <span className="badge-error">{score.gaps.length} gaps</span>
                      {blockers > 0 && <span className="badge-warning">{blockers} blocking</span>}
                      {score.gaps.length === 0 && <span className="badge-ok">nothing outstanding</span>}
                    </div>

                    {/* Top three gaps for this framework */}
                    {score.gaps.length > 0 && (
                      <ul className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                        {score.gaps.slice(0, 3).map((gap) => (
                          <li key={gap.id} className="text-xs">
                            <span
                              className={`badge mr-2 ${
                                gap.severity === 'error'
                                  ? 'badge-error'
                                  : gap.severity === 'warning'
                                    ? 'badge-warning'
                                    : 'badge-info'
                              }`}
                            >
                              {gap.severity}
                            </span>
                            <span className="text-ink">{gap.title ?? gap.articleId}</span>
                            {gap.deadlineIso && (
                              <span className="ml-2 text-ink-muted">due {gap.deadlineIso}</span>
                            )}
                          </li>
                        ))}
                        {score.gaps.length > 3 && (
                          <li className="text-xs text-ink-muted">
                            … {score.gaps.length - 3} more in the roadmap
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Deadlines by article ---------------------------------------------- */}
          {status.deadlines.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
                Statutory deadlines
              </h2>
              <div className="card divide-y divide-slate-100">
                {status.deadlines.slice(0, 10).map((deadline) => {
                  const remaining = Math.ceil(
                    (new Date(deadline.deadline).getTime() - Date.now()) / 86_400_000,
                  );
                  return (
                    <div key={`${deadline.frameworkId}-${deadline.articleId}`} className="flex items-center justify-between gap-4 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{deadline.title}</p>
                        <p className="text-xs text-ink-muted">{titleCase(deadline.frameworkId)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-ink">{deadline.deadline}</p>
                        <p
                          className={`text-xs ${
                            remaining < 0
                              ? 'font-bold text-red-600'
                              : remaining < 180
                                ? 'text-amber-700'
                                : 'text-ink-muted'
                          }`}
                        >
                          {remaining < 0 ? 'in force' : `${days(remaining)} left`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <div className="flex flex-wrap gap-3">
            <Link href="/roadmap" className="btn-primary">
              See the 90-day plan
            </Link>
            <Link href="/documents" className="btn-secondary">
              Generate documents
            </Link>
            <Link href="/scan" className="btn-secondary">
              Scan the codebase
            </Link>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'error' | 'warning' | 'neutral';
}) {
  const colour =
    tone === 'error' ? 'text-red-600' : tone === 'warning' ? 'text-amber-600' : 'text-ink';
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <div className={`text-xl font-black tabular-nums ${colour}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</div>
    </div>
  );
}