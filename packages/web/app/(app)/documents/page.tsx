'use client';

import Link from 'next/link';

import { AppShell, ErrorBox, Loading, PageHeader } from '@/components/app-shell';
import { api, getCompanyId } from '@/lib/api';
import type { DocumentSummary } from '@/lib/api';
import { bytes, dateLabel, relative, titleCase } from '@/lib/format';
import { useCallback, useEffect, useState } from 'react';
import type { DocumentKind } from '@complisme/shared';

const KINDS: Array<{ kind: DocumentKind; label: string; description: string; frameworks: string[] }> = [
  {
    kind: 'ai-act-annex-iv',
    label: 'Annex IV technical documentation',
    description: 'EU AI Act Annex IV points 1–6, SME simplified model. Start here for any high-risk system.',
    frameworks: ['eu-ai-act'],
  },
  {
    kind: 'ai-act-risk-register',
    label: 'AI risk register',
    description: 'Article 9 risk management system with likelihood/impact scoring and a monitoring plan.',
    frameworks: ['eu-ai-act'],
  },
  {
    kind: 'ai-act-conformity-declaration',
    label: 'Declaration of conformity',
    description: 'Article 47 declaration of conformity, ready to sign.',
    frameworks: ['eu-ai-act'],
  },
  {
    kind: 'gdpr-ropa',
    label: 'Record of processing activities',
    description: 'Article 30 ROPA with legal bases, transfers and special categories.',
    frameworks: ['gdpr'],
  },
  {
    kind: 'gdpr-dpia',
    label: 'Data protection impact assessment',
    description: 'Article 35 DPIA with risk scoring, measures and residual-risk conclusion.',
    frameworks: ['gdpr'],
  },
  {
    kind: 'gdpr-dsr-response',
    label: 'DSR response letter',
    description: 'Arts. 12–22 access, erasure, rectification, restriction or objection response.',
    frameworks: ['gdpr'],
  },
  {
    kind: 'gdpr-tom',
    label: 'Technical & organisational measures',
    description: 'Article 32 TOMs document: confidentiality, integrity, availability, testing.',
    frameworks: ['gdpr'],
  },
  {
    kind: 'consent-notice',
    label: 'Privacy notice',
    description: 'Arts. 13–14 information notice generated from your processing activities.',
    frameworks: ['gdpr'],
  },
  {
    kind: 'nda-dpa',
    label: 'Data processing agreement',
    description: 'Article 28(3) DPA template for a sub-processor.',
    frameworks: ['gdpr'],
  },
  {
    kind: 'csrd-report',
    label: 'Sustainability statement',
    description: 'ESRS 1, 2, E1–E5, S1–S2 and G1 reporting pack.',
    frameworks: ['csrd'],
  },
  {
    kind: 'esrs-datapoint',
    label: 'ESRS datapoint register',
    description: 'Data lineage, sources, estimation methods and owners — the audit control document.',
    frameworks: ['csrd'],
  },
  {
    kind: 'einvoice-validation-report',
    label: 'E-invoicing validation report',
    description: 'EN 16931 / Peppol / NF-e readiness with open items.',
    frameworks: ['e-invoicing'],
  },
  {
    kind: 'compliance-roadmap',
    label: '90-day roadmap',
    description: 'The phased remediation plan, as a document you can circulate.',
    frameworks: [],
  },
];

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<DocumentKind | null>(null);
  const [format, setFormat] = useState('pdf');
  const [useLLM, setUseLLM] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [notice, setNotice] = useState<{ kind: string; tone: 'ok' | 'warn' } | null>(null);

  const load = useCallback(async () => {
    const companyId = getCompanyId();
    if (!companyId) {
      setError('No company selected. Complete onboarding first.');
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const response = await api.documents(companyId);
      setDocuments(response.documents);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void (async () => {
      try {
        const status = await api.aiStatus();
        setAiAvailable(status.configured);
      } catch {
        setAiAvailable(false);
      }
    })();
  }, [load]);

  const generate = async (kind: DocumentKind) => {
    const companyId = getCompanyId();
    if (!companyId) return;
    setGenerating(kind);
    setNotice(null);
    try {
      const result = await api.generate({ companyId, kind, format, useLLM });
      if (result.warning || result.llmNote) {
        setNotice({ kind: result.warning ?? result.llmNote ?? '', tone: 'warn' });
      } else {
        setNotice({ kind: `${result.title} generated`, tone: 'ok' });
      }
      await load();
    } catch (err) {
      setNotice({ kind: (err as Error).message, tone: 'warn' });
    } finally {
      setGenerating(null);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Document library"
        description="Generate compliance documents from your current assessment. Every regeneration creates a new version."
        action={
          <div className="flex items-center gap-3">
            <select className="input w-auto" value={format} onChange={(e) => setFormat(e.target.value)} aria-label="Format">
              <option value="pdf">PDF</option>
              <option value="docx">DOCX (editable)</option>
              <option value="html">HTML</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-ink" title={aiAvailable ? undefined : 'No LLM provider configured'}>
              <input
                type="checkbox"
                checked={useLLM}
                disabled={!aiAvailable}
                onChange={(e) => setUseLLM(e.target.checked)}
              />
              AI-draft narrative
            </label>
          </div>
        }
      />

      {!aiAvailable && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-surface px-4 py-3 text-xs text-ink-muted">
          AI drafting is off because no LLM provider is configured on the server. Everything else —
          the full document structure, tables, citations and evidence lists — works without it. Add
          <code className="mx-1 rounded bg-white px-1">OPENAI_API_KEY</code>,
          <code className="mx-1 rounded bg-white px-1">ANTHROPIC_API_KEY</code> or
          <code className="mx-1 rounded bg-white px-1">OLLAMA_BASE_URL</code> to enable it.
        </div>
      )}

      {notice && (
        <div
          className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
            notice.tone === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          {notice.kind}
        </div>
      )}

      {loading && <Loading label="Loading your documents…" />}
      {error && <ErrorBox error={error} onRetry={load} />}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Library ------------------------------------------------------------ */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Generated documents
          </h2>

          {documents.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="text-sm font-semibold text-ink">Nothing generated yet</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
                Pick a document from the list on the right. The 90-day roadmap is the best place to
                start — it shows which documents you actually need first.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {documents.map((document) => (
                <article key={document.id} className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="badge-info">{titleCase(document.kind)}</span>
                        <span className="badge-ok">{document.format.toUpperCase()}</span>
                        <span className="text-xs text-ink-muted">v{document.version}</span>
                      </div>
                      <h3 className="mt-2 text-sm font-bold text-ink">{document.title}</h3>
                      <p className="mt-1 text-xs text-ink-muted">
                        {document.frameworkIds.map(titleCase).join(', ') || 'Cross-framework'} ·{' '}
                        {bytes(document.bytes)} · updated {relative(document.updatedAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={generating !== null}
                      onClick={() => generate(document.kind)}
                    >
                      {generating === document.kind ? 'Generating…' : 'New version'}
                    </button>
                  </div>

                  {document.versions.length > 0 && (
                    <details className="mt-4 border-t border-slate-100 pt-3">
                      <summary className="cursor-pointer text-xs font-semibold text-ink-muted">
                        Version history ({document.versions.length})
                      </summary>
                      <ul className="mt-2 space-y-1">
                        {document.versions.map((version) => (
                          <li key={version.version} className="flex items-center gap-2 text-xs text-ink-muted">
                            <span className="font-mono text-ink">v{version.version}</span>
                            <span>{dateLabel(version.createdAt)}</span>
                            <span>{version.changeLog ?? '—'}</span>
                            {version.checksum && (
                              <span className="ml-auto font-mono text-slate-400">
                                {version.checksum.slice(0, 10)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Catalogue ---------------------------------------------------------- */}
        <aside>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Available documents
          </h2>
          <ul className="space-y-2">
            {KINDS.map((entry) => (
              <li key={entry.kind} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{entry.label}</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-muted">{entry.description}</p>
                    {entry.frameworks.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {entry.frameworks.map((f) => (
                          <span key={f} className="text-[10px] uppercase tracking-wide text-ink-muted">
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-primary shrink-0"
                    disabled={generating !== null}
                    onClick={() => generate(entry.kind)}
                  >
                    {generating === entry.kind ? '…' : 'Generate'}
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="card mt-4 p-4 text-xs text-ink-muted">
            <p className="font-semibold text-ink">About AI drafting</p>
            <p className="mt-1">
              With a key configured, the model writes the narrative sections in plain English while
              the structure, tables and legal citations stay deterministic. Your company name is
              pseudonymised and identifiers are stripped before anything is sent.
            </p>
            <Link href="/docs" className="mt-2 inline-block font-semibold text-brand-700">
              Documentation →
            </Link>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}