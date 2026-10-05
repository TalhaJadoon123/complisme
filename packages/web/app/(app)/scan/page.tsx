'use client';

import Link from 'next/link';

import { AppShell, PageHeader } from '@/components/app-shell';
import { api, getCompanyId } from '@/lib/api';
import type { ScanResponse } from '@/lib/api';
import { titleCase } from '@/lib/format';
import { useState } from 'react';

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'badge-error',
  high: 'badge-error',
  medium: 'badge-warning',
  low: 'badge-info',
  info: 'badge-info',
};

export default function ScanPage() {
  const [path, setPath] = useState('packages');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState('all');

  const run = async () => {
    setScanning(true);
    setError(null);
    try {
      setResult(await api.scan(path));
    } catch (err) {
      setError((err as Error).message);
      setResult(null);
    } finally {
      setScanning(false);
    }
  };

  const findings = (result?.findings ?? []).filter(
    (finding) => severityFilter === 'all' || finding.severity === severityFilter,
  );

  return (
    <AppShell>
      <PageHeader
        title="Codebase scanner"
        description="Find the obligations you cannot see: personal data in logs, stores without retention rules, AI calls carrying identifiers."
      />

      <section className="card p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[280px] flex-1">
            <label className="label" htmlFor="path">
              Path to scan (relative to the API server)
            </label>
            <input
              id="path"
              className="input font-mono text-sm"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="./src"
            />
            <p className="hint">
              The scan runs on the server. It reads files, never executes your code, and makes no
              network calls.
            </p>
          </div>
          <button type="button" className="btn-primary" disabled={scanning} onClick={run}>
            {scanning ? 'Scanning…' : 'Run scan'}
          </button>
        </div>

        {getCompanyId() && (
          <p className="mt-3 text-xs text-ink-muted">
            Findings are added to your gap list automatically.{' '}
            <Link href="/roadmap" className="font-semibold text-brand-700">
              See the roadmap
            </Link>
          </p>
        )}
      </section>

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-6 space-y-6">
          {/* Summary ---------------------------------------------------------- */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Files scanned" value={String(result.filesScanned)} />
            <Metric label="Findings" value={String(result.summary.total)} />
            <Metric label="Files affected" value={String(Object.keys(result.languages).length)} />
            <Metric label="Gaps created" value={String(result.gaps.length)} />
          </section>

          <section className="card p-5">
            <h2 className="text-sm font-bold text-ink">By severity</h2>
            <div className="mt-3 flex flex-wrap gap-3">
              {Object.entries(result.summary.bySeverity).map(([severity, count]) => (
                <button
                  key={severity}
                  type="button"
                  onClick={() => setSeverityFilter(severityFilter === severity ? 'all' : severity)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    severityFilter === severity ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:bg-surface'
                  }`}
                >
                  <div className="text-lg font-black text-ink">{count}</div>
                  <div className="text-xs uppercase tracking-wide text-ink-muted">{severity}</div>
                </button>
              ))}
            </div>

            <h2 className="mt-5 text-sm font-bold text-ink">Articles engaged</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(result.summary.frameworks).map(([framework, count]) => (
                <span key={framework} className="badge-info">
                  {titleCase(framework)} · {count}
                </span>
              ))}
            </div>
          </section>

          {/* Findings ---------------------------------------------------------- */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
              Findings ({findings.length})
            </h2>

            {findings.length === 0 ? (
              <div className="card p-10 text-center text-sm text-ink-muted">
                No findings match this filter. Either the code is clean, or the path is wrong.
              </div>
            ) : (
              <div className="space-y-3">
                {findings.slice(0, 60).map((finding) => (
                  <article key={finding.id} className="card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={SEVERITY_STYLE[finding.severity] ?? 'badge-info'}>
                            {finding.severity}
                          </span>
                          <span className="text-xs text-ink-muted">{titleCase(finding.category)}</span>
                          <span className="text-xs text-ink-muted">
                            confidence {(finding.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                        <h3 className="mt-1.5 text-sm font-bold text-ink">{finding.message}</h3>
                        <p className="mt-1 font-mono text-xs text-ink-muted">
                          {finding.file}:{finding.line}
                        </p>
                        {finding.snippet && (
                          <pre className="mt-2 overflow-x-auto rounded bg-surface px-3 py-2 text-xs text-ink-muted">
                            {finding.snippet}
                          </pre>
                        )}
                        <p className="mt-2 text-sm text-ink-muted">{finding.remediation}</p>
                      </div>

                      <div className="shrink-0 space-y-1 text-right">
                        {finding.mappings.map((mapping) => (
                          <div key={`${mapping.frameworkId}-${mapping.articleId}`}>
                            <span className="badge-info">
                              {titleCase(mapping.frameworkId)} · {mapping.articleId}
                            </span>
                            <p className="mt-0.5 max-w-[16rem] text-[10px] text-ink-muted">
                              {mapping.reason}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {findings.length > 60 && (
              <p className="mt-3 text-center text-xs text-ink-muted">
                Showing 60 of {findings.length}. Use the severity filter to narrow it down.
              </p>
            )}
          </section>

          {result.truncated && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              The scan hit the file limit, so results are partial. Narrow the path or raise the limit.
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-ink">{value}</p>
    </div>
  );
}