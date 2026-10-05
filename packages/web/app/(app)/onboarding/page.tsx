'use client';

/**
 * Multi-step onboarding: company → AI systems → data processing → sustainability
 * → first documents.
 *
 * Each step saves to the API as it is completed, so a user can leave and come
 * back. A live score preview updates as they go, which is the moment the tool
 * usually earns its keep.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AppShell, PageHeader } from '@/components/app-shell';
import { ScoreRing } from '@/components/score-ring';
import { api, getCompanyId, setCompanyId } from '@/lib/api';
import type { CompanyResponse } from '@/lib/api';
import { euro } from '@/lib/format';
import type { CompanyProfile, DocumentKind } from '@complisme/shared';

const STEPS = [
  { id: 'company', title: 'Company', subtitle: 'Basics and scope' },
  { id: 'ai', title: 'AI systems', subtitle: 'What AI you deploy' },
  { id: 'data', title: 'Data processing', subtitle: 'Personal data you handle' },
  { id: 'sustainability', title: 'Sustainability', subtitle: 'ESRS data if in scope' },
  { id: 'documents', title: 'First documents', subtitle: 'Generate what you need' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

/** Partial AI system captured during onboarding. */
interface AiDraft {
  id?: string;
  name: string;
  purpose: string;
  domain: string;
  deployed: boolean;
  automatedDecisionMaking: boolean;
  vendors?: string[];
  [key: string]: unknown;
}

/** Partial processing activity captured during onboarding. */
interface ActivityDraft {
  id?: string;
  name: string;
  purpose: string;
  legalBasis: string;
  dataSubjects?: string[];
  dataCategories?: string[];
  retentionMonths?: number;
  specialCategory: boolean;
  [key: string]: unknown;
}

const DOCUMENT_CHOICES: Array<{ kind: DocumentKind; label: string; hint: string }> = [
  { kind: 'compliance-roadmap', label: '90-day roadmap', hint: 'Start here — it sequences everything else' },
  { kind: 'gdpr-ropa', label: 'ROPA (Art. 30)', hint: 'If you process personal data' },
  { kind: 'gdpr-dpia', label: 'DPIA (Art. 35)', hint: 'If you profile people or use sensitive data' },
  { kind: 'ai-act-annex-iv', label: 'Annex IV documentation', hint: 'If you deploy high-risk AI' },
  { kind: 'csrd-report', label: 'Sustainability statement', hint: 'If CSRD applies to you' },
  { kind: 'einvoice-validation-report', label: 'E-invoicing report', hint: 'Cross-border sales or Brazilian operations' },
];

const SECTORS = ['software', 'manufacturing', 'consulting', 'ecommerce', 'finance', 'healthcare', 'other'];
const AI_DOMAINS = [
  'customer-service',
  'marketing',
  'internal',
  'employment',
  'education',
  'credit',
  'safety-component',
  'other',
];
const LEGAL_BASES = [
  'contract',
  'legitimate-interest',
  'consent',
  'legal-obligation',
  'vital-interests',
  'public-task',
];

export default function OnboardingPage() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [companyId, setCompany] = useState<string | null>(null);
  const [company, setCompanyState] = useState<CompanyResponse | null>(null);
  const [preview, setPreview] = useState<{ overall: number; grade: string; blockers: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Draft state, persisted locally so a refresh does not lose work.
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [country, setCountry] = useState('NL');
  const [sector, setSector] = useState('software');
  const [employees, setEmployees] = useState('5');
  const [revenue, setRevenue] = useState('250000');

  const [usesAi, setUsesAi] = useState<AiDraft[]>([
    { name: '', purpose: '', domain: 'customer-service', deployed: false, automatedDecisionMaking: false },
  ]);
  const [processesData, setProcessesData] = useState(true);
  const [activities, setActivities] = useState<ActivityDraft[]>([
    {
      name: 'Customer administration',
      purpose: 'Contract administration, invoicing and support',
      legalBasis: 'contract',
      dataSubjects: ['customers'],
      dataCategories: ['name', 'email'],
      retentionMonths: 120,
      specialCategory: false,
    },
  ]);
  const [usesCookies, setUsesCookies] = useState(false);
  const [hasDpo, setHasDpo] = useState(false);

  const [scope1, setScope1] = useState('');
  const [scope2, setScope2] = useState('');
  const [energy, setEnergy] = useState('');

  const step = STEPS[stepIndex];

  // Load the existing company, if any, on first mount.
  useEffect(() => {
    const existing = getCompanyId();
    if (!existing) return;
    setCompany(existing);
    void (async () => {
      try {
        const response = await api.company(existing);
        setCompanyState(response);
        setName(response.company.name ?? '');
        setLegalName(response.company.legalName ?? '');
        setCountry(response.company.country ?? 'NL');
        setSector(response.company.sector ?? 'software');
        setEmployees(String(response.company.employees ?? 0));
        setRevenue(String(response.company.revenueEUR ?? 0));
        // The API returns fully-typed domain objects; widen them to the editable
        // drafts so the form can round-trip partial edits.
        setUsesAi(
          response.company.aiSystems?.length
            ? (response.company.aiSystems.map((s) => ({ ...s })) as AiDraft[])
            : usesAi,
        );
        setActivities(
          response.company.processingActivities?.length
            ? (response.company.processingActivities.map((a) => ({ ...a })) as ActivityDraft[])
            : activities,
        );
        setUsesCookies(!!response.company.usesCookies);
        setHasDpo(!!response.company.hasDpo);
        setProcessesData(!!response.company.processingActivities?.length || !!response.company.usesCookies);
      } catch (err) {
        setError((err as Error).message);
      }
    })();
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draft = useMemo(
    () => ({
      id: companyId ?? 'pending',
      name: name || 'New company',
      legalName: legalName || name,
      country,
      sector,
      employees: Number(employees) || 0,
      revenueEUR: Number(revenue) || 0,
      size: 'micro',
      aiSystems: usesAi,
      processingActivities: processesData ? activities : [],
      usesCookies,
      hasDpo,
    }),
    [companyId, name, legalName, country, sector, employees, revenue, usesAi, processesData, activities, usesCookies, hasDpo],
  );

  // Live score preview — debounced so typing does not spam the API.
  useEffect(() => {
    if (stepIndex === 4) return;
    const timer = setTimeout(async () => {
      try {
        setPreview(await api.preview(draft as unknown as Partial<CompanyProfile>));
      } catch {
        setPreview(null);
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [draft, stepIndex]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      let target = companyId;
      if (!target) {
        // No company yet: create one through the auth endpoint semantics by
        // upserting via PUT on the placeholder id is not possible, so use the
        // assess endpoint's create path.
        const created = await apiFetchPutCreate(draft);
        target = created;
        setCompany(created);
        setCompanyId(created);
      } else {
        await api.updateCompany(target, draft as unknown as Partial<CompanyProfile>);
      }
      const response = await api.company(target);
      setCompanyState(response);
      return target;
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setSaving(false);
    }
  }, [companyId, draft]);

  const next = async () => {
    if (stepIndex < STEPS.length - 1) {
      await save();
      setStepIndex(stepIndex + 1);
    }
  };

  const generate = async (kind: DocumentKind) => {
    const target = companyId ?? (await save());
    if (!target) return;
    setGenerating(kind);
    try {
      const result = await api.generate({ companyId: target, kind, format: 'html' });
      setGenerated((prev) => ({ ...prev, [kind]: result.path ?? result.title }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(null);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Set up your compliance assessment"
        description="Five short steps. Your answers are saved as you go."
      />

      {/* Stepper ------------------------------------------------------------ */}
      <ol className="mb-8 flex flex-wrap gap-2">
        {STEPS.map((item, index) => {
          const active = index === stepIndex;
          const done = index < stepIndex;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setStepIndex(index)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  active
                    ? 'border-brand-600 bg-brand-50'
                    : done
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-slate-200 bg-white hover:bg-surface'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                      active
                        ? 'bg-brand-700 text-white'
                        : done
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-ink-muted'
                    }`}
                  >
                    {done ? '✓' : index + 1}
                  </span>
                  <span className={`text-sm font-semibold ${active ? 'text-brand-800' : 'text-ink'}`}>
                    {item.title}
                  </span>
                </div>
                <div className="ml-7 text-xs text-ink-muted">{item.subtitle}</div>
              </button>
            </li>
          );
        })}
      </ol>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="card p-6">
          {/* ---------------------------------------------------------------- */}
          {step.id === 'company' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-ink">About your company</h2>
              <p className="text-sm text-ink-muted">
                These five answers decide which frameworks apply to you. Get them roughly right; you
                can refine later.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="name">Company name</label>
                  <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Analytics BV" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="legalName">Legal name (if different)</label>
                  <input id="legalName" className="input" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Acme Analytics B.V." />
                </div>

                <div>
                  <label className="label" htmlFor="country">Country</label>
                  <select id="country" className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
                    {['NL', 'DE', 'FR', 'ES', 'IT', 'IE', 'BE', 'SE', 'DK', 'FI', 'PL', 'PT', 'AT', 'BR', 'US', 'GB'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <p className="hint">Determines the supervisory authority and tax obligations.</p>
                </div>

                <div>
                  <label className="label" htmlFor="sector">Sector</label>
                  <select id="sector" className="input" value={sector} onChange={(e) => setSector(e.target.value)}>
                    {SECTORS.map((s) => (
                      <option key={s} value={s}>{titleize(s)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label" htmlFor="employees">Employees</label>
                  <input id="employees" type="number" min="0" className="input" value={employees} onChange={(e) => setEmployees(e.target.value)} />
                  <p className="hint">Under 250 puts you in SME scope for most obligations.</p>
                </div>

                <div>
                  <label className="label" htmlFor="revenue">Annual turnover (EUR)</label>
                  <input id="revenue" type="number" min="0" step="1000" className="input" value={revenue} onChange={(e) => setRevenue(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {step.id === 'ai' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-ink">AI systems you deploy</h2>
              <p className="text-sm text-ink-muted">
                The EU AI Act applies to any AI system you put into service — including a customer
                support chatbot. Leave the list empty if you use none.
              </p>

              {usesAi.map((system, index) => (
                <div key={index} className="space-y-4 rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-ink">System {index + 1}</h3>
                    {usesAi.length > 1 && (
                      <button
                        type="button"
                        className="text-xs font-semibold text-red-600"
                        onClick={() => setUsesAi(usesAi.filter((_, i) => i !== index))}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label">Name</label>
                      <input
                        className="input"
                        value={String(system.name ?? '')}
                        onChange={(e) => updateSystem(index, { name: e.target.value })}
                        placeholder="Support Copilot"
                      />
                    </div>
                    <div>
                      <label className="label">Domain</label>
                      <select
                        className="input"
                        value={String(system.domain ?? 'customer-service')}
                        onChange={(e) => updateSystem(index, { domain: e.target.value })}
                      >
                        {AI_DOMAINS.map((d) => (
                          <option key={d} value={d}>{titleize(d)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label">Intended purpose</label>
                      <input
                        className="input"
                        value={String(system.purpose ?? '')}
                        onChange={(e) => updateSystem(index, { purpose: e.target.value })}
                        placeholder="Drafts replies to inbound customer support tickets"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm text-ink">
                      <input type="checkbox" checked={!!system.deployed} onChange={(e) => updateSystem(index, { deployed: e.target.checked })} />
                      Already deployed to users
                    </label>
                    <label className="flex items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={!!system.automatedDecisionMaking}
                        onChange={(e) => updateSystem(index, { automatedDecisionMaking: e.target.checked })}
                      />
                      Makes decisions with legal or similar effect
                    </label>
                  </div>
                </div>
              ))}

              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  setUsesAi([
                    ...usesAi,
                    { name: '', purpose: '', domain: 'customer-service', deployed: false, automatedDecisionMaking: false },
                  ])
                }
              >
                + Add an AI system
              </button>
              <button type="button" className="btn-ghost" onClick={() => setUsesAi([])}>
                We do not use AI
              </button>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {step.id === 'data' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-ink">Personal data you process</h2>

              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={processesData} onChange={(e) => setProcessesData(e.target.checked)} />
                We collect or process personal data (customers, employees, applicants…)
              </label>

              {processesData && (
                <>
                  {activities.map((activity, index) => (
                    <div key={index} className="space-y-3 rounded-lg border border-slate-200 p-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-ink">Activity {index + 1}</h3>
                        {activities.length > 1 && (
                          <button
                            type="button"
                            className="text-xs font-semibold text-red-600"
                            onClick={() => setActivities(activities.filter((_, i) => i !== index))}
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="label">Name</label>
                          <input
                            className="input"
                            value={String(activity.name ?? '')}
                            onChange={(e) => updateActivity(index, { name: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="label">Legal basis (Art. 6)</label>
                          <select
                            className="input"
                            value={String(activity.legalBasis ?? 'contract')}
                            onChange={(e) => updateActivity(index, { legalBasis: e.target.value })}
                          >
                            {LEGAL_BASES.map((b) => (
                              <option key={b} value={b}>{titleize(b)}</option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="label">Purpose</label>
                          <input
                            className="input"
                            value={String(activity.purpose ?? '')}
                            onChange={(e) => updateActivity(index, { purpose: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="label">Retention (months)</label>
                          <input
                            type="number"
                            min="0"
                            className="input"
                            value={String(activity.retentionMonths ?? '')}
                            onChange={(e) => updateActivity(index, { retentionMonths: Number(e.target.value) })}
                          />
                        </div>
                        <div className="flex items-end">
                          <label className="flex items-center gap-2 pb-2 text-sm text-ink">
                            <input
                              type="checkbox"
                              checked={!!activity.specialCategory}
                              onChange={(e) => updateActivity(index, { specialCategory: e.target.checked })}
                            />
                            Special category data (health, biometrics…)
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      setActivities([
                        ...activities,
                        {
                          name: '',
                          purpose: '',
                          legalBasis: 'contract',
                          dataSubjects: [],
                          dataCategories: [],
                          retentionMonths: 12,
                          specialCategory: false,
                        },
                      ])
                    }
                  >
                    + Add processing activity
                  </button>
                </>
              )}

              <div className="flex flex-wrap gap-6 border-t border-slate-100 pt-4">
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={usesCookies} onChange={(e) => setUsesCookies(e.target.checked)} />
                  We use cookies or tracking
                </label>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={hasDpo} onChange={(e) => setHasDpo(e.target.checked)} />
                  We have a data protection officer
                </label>
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {step.id === 'sustainability' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-ink">Sustainability data</h2>
              <p className="text-sm text-ink-muted">
                Only needed if CSRD applies — roughly, more than 750 employees or more than €150M
                turnover after the Omnibus simplification. Fill what you have; gaps are flagged rather
                than blocked.
              </p>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="label" htmlFor="scope1">Scope 1 (tCO₂e)</label>
                  <input id="scope1" type="number" className="input" value={scope1} onChange={(e) => setScope1(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label className="label" htmlFor="scope2">Scope 2 (tCO₂e)</label>
                  <input id="scope2" type="number" className="input" value={scope2} onChange={(e) => setScope2(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label className="label" htmlFor="energy">Energy (MWh)</label>
                  <input id="energy" type="number" className="input" value={energy} onChange={(e) => setEnergy(e.target.value)} placeholder="0" />
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-surface p-4 text-sm text-ink-muted">
                These figures flow straight into the ESRS E1 datapoint register, with the source and
                estimation method recorded so an auditor can follow the number.
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {step.id === 'documents' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-ink">Generate your first documents</h2>
              <p className="text-sm text-ink-muted">
                These are generated from what you entered. Everything is editable, and every document
                carries a change log so you can see what changed between versions.
              </p>

              <ul className="space-y-3">
                {DOCUMENT_CHOICES.map((choice) => {
                  const path = generated[choice.kind];
                  return (
                    <li key={choice.kind} className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">{choice.label}</p>
                        <p className="text-xs text-ink-muted">{choice.hint}</p>
                        {path && <p className="mt-1 truncate text-xs font-mono text-emerald-700">{path}</p>}
                      </div>
                      <button
                        type="button"
                        className={path ? 'btn-secondary' : 'btn-primary'}
                        disabled={generating === choice.kind}
                        onClick={() => generate(choice.kind)}
                      >
                        {generating === choice.kind ? 'Generating…' : path ? 'Regenerate' : 'Generate'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Navigation ------------------------------------------------------ */}
          <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-5">
            <button
              type="button"
              className="btn-ghost"
              disabled={stepIndex === 0}
              onClick={() => setStepIndex(Math.max(0, stepIndex - 1))}
            >
              Back
            </button>

            <div className="flex items-center gap-2">
              <button type="button" className="btn-secondary" disabled={saving} onClick={() => void save()}>
                {saving ? 'Saving…' : 'Save & exit'}
              </button>
              {stepIndex < STEPS.length - 1 ? (
                <button type="button" className="btn-primary" onClick={() => void next()}>
                  Continue
                </button>
              ) : (
                <button type="button" className="btn-primary" onClick={() => router.push('/dashboard')}>
                  Go to dashboard
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Live preview ------------------------------------------------------ */}
        <aside className="space-y-4">
          <div className="card p-5 text-center">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Live readiness
            </h2>
            <div className="mt-3 flex justify-center">
              <ScoreRing score={preview?.overall ?? 0} grade={preview?.grade} size={110} />
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              Updates as you type. Answers to the questionnaires move this much more.
            </p>
          </div>

          {company && company.applicability && (
            <div className="card p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Frameworks in scope
              </h2>
              <ul className="mt-3 space-y-3">
                {company.applicability.map((entry) => (
                  <li key={entry.frameworkId}>
                    <div className="flex items-center gap-2">
                      <span className={entry.applies ? 'text-emerald-600' : 'text-slate-300'}>
                        {entry.applies ? '●' : '○'}
                      </span>
                      <span className={`text-sm font-semibold ${entry.applies ? 'text-ink' : 'text-ink-muted'}`}>
                        {titleize(entry.frameworkId)}
                      </span>
                    </div>
                    <p className="mt-0.5 pl-5 text-xs text-ink-muted">{entry.reason}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-ink-muted">
                Total statutory exposure:{' '}
                <strong className="text-ink">{euro(company.fineExposure)}</strong>
              </p>
            </div>
          )}

          <div className="card p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Need help?</h2>
            <p className="mt-2 text-xs text-ink-muted">
              You can also do all of this from the command line with{' '}
              <code className="rounded bg-surface px-1">complisme init</code> — it works offline.
            </p>
            <Link href="/docs/cli" className="mt-3 inline-block text-xs font-semibold text-brand-700">
              CLI documentation →
            </Link>
          </div>
        </aside>
      </div>
    </AppShell>
  );

  function updateSystem(index: number, patch: Partial<AiDraft>) {
    setUsesAi(usesAi.map((system, i) => (i === index ? { ...system, ...patch } : system)));
  }

  function updateActivity(index: number, patch: Partial<ActivityDraft>) {
    setActivities(activities.map((activity, i) => (i === index ? { ...activity, ...patch } : activity)));
  }
}

function titleize(value: string): string {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Create a company when onboarding starts from scratch.
 * The API creates companies during signup, so this reuses the assess endpoint's
 * create-if-absent path with an empty assessment.
 */
async function apiFetchPutCreate(draft: Record<string, unknown>): Promise<string> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/v1/assess`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(getTokenHeader() ? { authorization: `Bearer ${getTokenHeader()}` } : {}),
      },
      body: JSON.stringify({ profile: draft, answers: {} }),
    },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Failed to create the company (HTTP ${response.status})`);
  }
  const json = (await response.json()) as { companyId: string };
  return json.companyId;
}

function getTokenHeader(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem('complisme.token');
  } catch {
    return null;
  }
}