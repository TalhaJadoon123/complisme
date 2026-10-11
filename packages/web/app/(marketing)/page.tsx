import Link from 'next/link';

import { DeadlineCountdown } from '@/components/deadline-countdown';
import { euro } from '@/lib/format';
import type { DocumentKind } from '@complisme/shared';

// Static marketing content. Kept in this file (rather than fetched from the API)
// so the landing page renders with no backend running — important for SEO and
// for a first impression on a slow connection.

const DEADLINES = [
  {
    id: 'ai-act-general',
    label: 'EU AI Act fully applicable',
    date: '2026-08-02',
    frameworkId: 'eu-ai-act' as const,
    description:
      'High-risk AI systems in Annex III must be registered, documented, risk-assessed and CE-marked. Non-compliance can cost up to €15M or 3% of global turnover.',
  },
  {
    id: 'ai-act-embedded',
    label: 'EU AI Act embedded high-risk deadline',
    date: '2027-08-02',
    frameworkId: 'eu-ai-act' as const,
    description:
      'High-risk AI embedded in regulated products — machinery, medical devices, toys — must be compliant.',
  },
  {
    id: 'csrd-wave2',
    label: 'CSRD second wave (companies >150 employees)',
    date: '2026-01-01',
    frameworkId: 'csrd' as const,
    description:
      'Groups above 150 employees and more than €50M net turnover report under ESRS for FY2026, with limited assurance on sustainability statements.',
  },
];

const FEATURES = [
  {
    title: 'Four frameworks, one assessment',
    body: 'EU AI Act, CSRD/ESRS, GDPR and e-invoicing are scored together. One answer sheet, one readiness number, one plan — instead of four consultants who never talk to each other.',
    icon: '◧',
  },
  {
    title: 'Your codebase, mapped to articles',
    body: 'Point the scanner at your repository. It finds personal data flowing into logs, into databases without a retention rule, and into AI APIs — then names the GDPR and AI Act articles each one engages.',
    icon: '⌘',
  },
  {
    title: 'Documents, not templates',
    body: 'Generate an Annex IV technical documentation, a ROPA, a DPIA, a CSRD statement or a Brazilian NFS-e validation report. Add your own BYOK API key and the narrative is drafted for you.',
    icon: '✎',
  },
  {
    title: 'A 90-day plan you can execute',
    body: 'Every gap is sequenced by statutory deadline, then by fine exposure, then by effort. Quick wins land in week one; the expensive work is scheduled around the date it actually matters.',
    icon: '◷',
  },
  {
    title: 'Evidence, not claims',
    body: 'Every framework article lists the artefacts an auditor will ask for. Link them once and the gap closes — because the obligation is documented, not asserted.',
    icon: '✓',
  },
  {
    title: 'Open-source framework definitions',
    body: 'The regulatory content is YAML in a public repository. Fork it, adjust it for your sector, and your changes survive every upgrade.',
    icon: '⌥',
  },
];

const COMPARISON = [
  { feature: 'Frameworks covered', complisme: '4 (AI Act, CSRD, GDPR, e-invoicing)', enterprise: 'Often 1–2', consultant: 'As scoped' },
  { feature: 'Codebase analysis', complisme: 'Article-mapped scanner', enterprise: 'Rarely', consultant: 'Rarely' },
  { feature: 'Document generation', complisme: 'PDF + editable DOCX', enterprise: 'Template library', consultant: 'Manual' },
  { feature: 'Time to first output', complisme: 'Minutes', enterprise: 'Weeks', consultant: '6–12 weeks' },
  { feature: 'Price', complisme: 'From €49/mo', enterprise: '€10K+/yr', consultant: '€5K–€50K' },
];

const FAQ = [
  {
    q: 'Is this legal advice?',
    a: 'No. CompliSME produces compliance working documents from your own answers. Have them reviewed by a qualified lawyer or DPO before relying on them. Every generated document carries that notice.',
  },
  {
    q: 'Do I need to give my data to an AI provider?',
    a: 'No. The whole product works without any AI key. If you add one (your own OpenAI, Anthropic or local Ollama key), the company name is pseudonymised and direct identifiers are stripped before anything is sent.',
  },
  {
    q: 'What happens to my codebase?',
    a: 'The scanner runs locally. It reads files and never executes your code, makes no network calls and uploads nothing. You can run the whole thing self-hosted.',
  },
  {
    q: 'Which of the deadlines apply to me?',
    a: 'Tell us your country, headcount, turnover and sector and the tool tells you. A 4-person Dutch SaaS and a 140-person German supplier get very different answers.',
  },
  {
    q: 'Can I export my data?',
    a: 'Yes. Your profile, answers, evidence and generated documents are yours. The CLI writes them to plain JSON in a folder you control.',
  },
];

const PRICING = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    cadence: 'forever',
    description: 'Assess one framework and see where you stand.',
    features: ['1 framework', 'Full questionnaire', 'Readiness score', 'Gap list with remediation'],
    cta: 'Start free',
    highlight: false,
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 49,
    cadence: 'per month',
    description: 'The whole product for a small team. Cancel anytime.',
    features: [
      'All 4 frameworks',
      '3 seats',
      '25 codebase scans / month',
      'PDF + DOCX documents',
      '90-day roadmap',
      '50 AI drafts / month',
    ],
    cta: 'Start 14-day trial',
    highlight: true,
  },
  {
    id: 'business',
    name: 'Business',
    price: 149,
    cadence: 'per month',
    description: 'For teams that need seats, history and evidence tracking.',
    features: [
      'Everything in Starter',
      '15 seats',
      '200 scans / month',
      'Unlimited documents',
      'Evidence library',
      '500 AI drafts / month',
      'Priority support',
    ],
    cta: 'Talk to us',
    highlight: false,
  },
  {
    id: 'enterprise',
    name: 'Self-hosted',
    price: 0,
    cadence: 'your server',
    description: 'Run it on your own infrastructure. No data leaves your network.',
    features: [
      'Unlimited frameworks & seats',
      'Unlimited scans',
      'PostgreSQL or in-memory',
      'Local Ollama support',
      'Custom framework definitions',
      'Docker compose bundle',
    ],
    cta: 'Get the compose file',
    highlight: false,
  },
];

const DOCUMENTS: Array<{ kind: DocumentKind; label: string; description: string }> = [
  { kind: 'ai-act-annex-iv', label: 'Annex IV technical documentation', description: 'EU AI Act, Annex IV points 1–6, SME simplified model' },
  { kind: 'ai-act-risk-register', label: 'AI risk register', description: 'Article 9 risk management system with monitoring plan' },
  { kind: 'ai-act-conformity-declaration', label: 'Declaration of conformity', description: 'Article 47 declaration, ready to sign' },
  { kind: 'gdpr-ropa', label: 'Record of processing activities', description: 'Article 30 ROPA, transfers and special categories' },
  { kind: 'gdpr-dpia', label: 'Data protection impact assessment', description: 'Article 35 DPIA with residual-risk conclusion' },
  { kind: 'gdpr-tom', label: 'TOMs document', description: 'Article 32 technical and organisational measures' },
  { kind: 'gdpr-dsr-response', label: 'DSR response letter', description: 'Arts. 12–22 access, erasure, objection response' },
  { kind: 'csrd-report', label: 'Sustainability statement', description: 'ESRS 1, 2, E1–E5, S1–S2, G1' },
  { kind: 'esrs-datapoint', label: 'ESRS datapoint register', description: 'Data lineage, sources and estimation methods' },
  { kind: 'einvoice-validation-report', label: 'E-invoicing validation report', description: 'EN 16931, Peppol, NF-e/NFS-e readiness' },
  { kind: 'compliance-roadmap', label: '90-day roadmap', description: 'Phased plan with owners, dates and effort' },
];

export default function MarketingPage() {
  return (
    <main>
      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                                 */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="animate-fade-up">
              <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-semibold text-brand-700">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
                EU AI Act · CSRD · GDPR · e-invoicing
              </div>

              <h1 className="mt-5 text-4xl font-black leading-[1.1] tracking-tight text-ink sm:text-5xl lg:text-6xl">
                EU compliance for SMEs.
                <br />
                <span className="text-brand-700">Without the €50K consultant.</span>
              </h1>

              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-muted">
                Four regulatory frameworks are converging on your business at once, and they are written
                for companies with compliance departments. CompliSME scores you against all of them,
                scans your codebase for the obligations you cannot see, and gives you a 90-day plan you
                can actually execute.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/signup" className="btn-primary px-6 py-3 text-base">
                  Start free — no card
                </Link>
                <Link href="#pricing" className="btn-secondary px-6 py-3 text-base">
                  See pricing
                </Link>
              </div>

              <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-slate-200 pt-6">
                {[
                  { value: '41', label: 'articles tracked' },
                  { value: '125', label: 'questions' },
                  { value: '€49', label: 'per month' },
                ].map((stat) => (
                  <div key={stat.label}>
                    <dt className="text-2xl font-black text-ink">{stat.value}</dt>
                    <dd className="text-xs text-ink-muted">{stat.label}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Dashboard preview */}
            <div className="animate-fade-up lg:pl-6" style={{ animationDelay: '120ms' }}>
              <div className="card overflow-hidden shadow-lift">
                <div className="flex items-center justify-between border-b border-slate-200 bg-surface px-4 py-3">
                  <span className="text-xs font-semibold text-ink">Readiness</span>
                  <span className="badge badge-ok">Live</span>
                </div>
                <div className="space-y-3 p-4">
                  {[
                    { label: 'EU AI Act', score: 58, colour: 'bg-amber-500' },
                    { label: 'GDPR', score: 82, colour: 'bg-emerald-500' },
                    { label: 'CSRD / ESRS', score: 31, colour: 'bg-red-500' },
                    { label: 'E-invoicing', score: 67, colour: 'bg-amber-500' },
                  ].map((row) => (
                    <div key={row.label}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-ink">{row.label}</span>
                        <span className="font-bold tabular-nums text-ink-muted">{row.score}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                        <div className={`h-full rounded-full ${row.colour}`} style={{ width: `${row.score}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-slate-200 bg-surface px-4 py-3">
                  <p className="text-xs text-ink-muted">
                    <span className="font-semibold text-ink">Day 1–30:</span> Annex IV documentation ·
                    Annex III classification · AI literacy policy
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Deadlines                                                           */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-b border-slate-200 bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-black tracking-tight text-ink">The dates are the problem</h2>
            <p className="mt-3 text-lg text-ink-muted">
              These deadlines do not move. Penalties are set by regulation: up to €35M or 7% of global
              turnover for prohibited AI practices, €20M or 4% for GDPR breaches, €3M for CSRD
              non-compliance. The plan is what changes the outcome.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {DEADLINES.map((deadline) => (
              <DeadlineCountdown key={deadline.id} {...deadline} />
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* How it works                                                        */}
      {/* ------------------------------------------------------------------ */}
      <section id="how" className="border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-black tracking-tight text-ink">Four steps, one afternoon</h2>
            <p className="mt-3 text-lg text-ink-muted">
              No implementation project. No change-management programme. Answer some questions and see
              where you stand.
            </p>
          </div>

          <ol className="mt-12 grid gap-8 md:grid-cols-4">
            {[
              {
                step: '01',
                title: 'Describe the company',
                body: 'Country, headcount, turnover, sector, your AI systems and what personal data you process. Two minutes.',
              },
              {
                step: '02',
                title: 'Answer the questionnaires',
                body: '125 questions across four frameworks, written for SMEs rather than lawyers. Unanswered items count against you, which is honest.',
              },
              {
                step: '03',
                title: 'Scan the codebase',
                body: 'The scanner finds personal data in logs, stores without retention rules, and AI calls carrying identifiers — and names the article each one breaks.',
              },
              {
                step: '04',
                title: 'Execute the plan',
                body: 'A 90-day roadmap with owners, dates and effort, plus the documents you need to prove each item is done.',
              },
            ].map((step) => (
              <li key={step.step} className="relative">
                <div className="text-4xl font-black text-brand-200">{step.step}</div>
                <h3 className="mt-2 text-lg font-bold text-ink">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Features                                                            */}
      {/* ------------------------------------------------------------------ */}
      <section id="features" className="border-b border-slate-200 bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-black tracking-tight text-ink">
              What OneTrust will not do for €49
            </h2>
            <p className="mt-3 text-lg text-ink-muted">
              Enterprise suites assume you have a compliance department. This assumes you have one
              person, an afternoon, and a hard deadline.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="card p-6 transition-shadow hover:shadow-lift">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-lg text-brand-700">
                  {feature.icon}
                </div>
                <h3 className="mt-4 text-base font-bold text-ink">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Frameworks                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section id="frameworks" className="border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-black tracking-tight text-ink">
              Four frameworks that all point at the same company
            </h2>
            <p className="mt-3 text-lg text-ink-muted">
              A chatbot that reads customer emails is simultaneously an Annex IV documentation problem,
              a DPIA problem, an Art. 50 transparency problem and a Chapter V transfer problem. Most
              tools only see one of them.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {[
              {
                code: 'AI',
                title: 'EU AI Act',
                law: 'Regulation (EU) 2024/1689',
                body: 'Risk classification, Article 9 risk management, Article 10 data governance, Annex IV technical documentation, Article 50 transparency, post-market monitoring.',
                facts: ['16 articles', '43 questions', 'Annex IV · Art. 9/10/13/15/50'],
                deadline: 'Full application 2 Aug 2026',
              },
              {
                code: 'CS',
                title: 'CSRD / ESRS',
                law: 'Directive (EU) 2022/2464',
                body: 'Double materiality, ESRS E1 climate, E2–E5 resources and circular economy, S1 own workforce, S2 value chain workers, G1 governance, assurance and digital tagging.',
                facts: ['8 articles', '29 questions', 'ESRS 1, 2, E1–E5, S1–S2, G1'],
                deadline: 'Phased from FY2027',
              },
              {
                code: 'DP',
                title: 'GDPR',
                law: 'Regulation (EU) 2016/679',
                body: 'Lawful basis, ROPA, DPIA, data subject rights, processor contracts, security and breach notification, international transfers, penalties.',
                facts: ['10 articles', '32 questions', 'Arts. 5–6, 25, 30, 35, 44, 83'],
                deadline: 'In force since 2018',
              },
              {
                code: 'EI',
                title: 'E-invoicing',
                law: 'Directive (EU) 2024/2831 (ViDA)',
                body: 'Structured e-invoicing without exemption from 2030, cross-border B2C reporting, 10-year machine-readable retention, EN 16931 conformance, and the Brazilian NF-e/NFS-e national model.',
                facts: ['7 articles', '21 questions', 'ViDA + NFS-e'],
                deadline: '1 Jul 2030 · Brazil already live',
              },
            ].map((framework) => (
              <div key={framework.title} className="card p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ink text-sm font-black text-white">
                    {framework.code}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-ink">{framework.title}</h3>
                    <p className="text-xs text-ink-muted">{framework.law}</p>
                    <p className="mt-3 text-sm leading-relaxed text-ink-muted">{framework.body}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {framework.facts.map((fact) => (
                        <span key={fact} className="badge-info">
                          {fact}
                        </span>
                      ))}
                    </div>
                    <p className="mt-3 text-xs font-semibold text-brand-700">{framework.deadline}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Documents                                                           */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-b border-slate-200 bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-black tracking-tight text-ink">
              Documents you can hand to an auditor
            </h2>
            <p className="mt-3 text-lg text-ink-muted">
              Print-ready PDFs and editable DOCX. Every document has a table of contents, a document
              control block, a version history and the evidence each section expects.
            </p>
          </div>

          <ul className="mt-12 grid gap-x-8 gap-y-3 md:grid-cols-2">
            {DOCUMENTS.map((doc) => (
              <li key={doc.kind} className="flex items-start gap-3 border-b border-slate-200 py-3">
                <span className="mt-0.5 text-emerald-600">✓</span>
                <div>
                  <p className="text-sm font-semibold text-ink">{doc.label}</p>
                  <p className="text-xs text-ink-muted">{doc.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Comparison                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-black tracking-tight text-ink">
              Built for the other 95% of the market
            </h2>
            <p className="mt-3 text-lg text-ink-muted">
              Enterprise trust centres start around €10,000 a year. Consultants start around €5,000 per
              engagement. Neither is designed for a nine-person company that still uses a shared inbox.
            </p>
          </div>

          <div className="mt-12 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-surface">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-ink">Capability</th>
                  <th className="px-4 py-3 text-left font-semibold text-brand-700">CompliSME</th>
                  <th className="px-4 py-3 text-left font-semibold text-ink">Enterprise GRC</th>
                  <th className="px-4 py-3 text-left font-semibold text-ink">Consultant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {COMPARISON.map((row) => (
                  <tr key={row.feature}>
                    <td className="px-4 py-3 font-medium text-ink">{row.feature}</td>
                    <td className="bg-brand-50/50 px-4 py-3 font-semibold text-brand-800">{row.complisme}</td>
                    <td className="px-4 py-3 text-ink-muted">{row.enterprise}</td>
                    <td className="px-4 py-3 text-ink-muted">{row.consultant}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Pricing                                                             */}
      {/* ------------------------------------------------------------------ */}
      <section id="pricing" className="border-b border-slate-200 bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-black tracking-tight text-ink">
              €49/month, not €50,000
            </h2>
            <p className="mt-3 text-lg text-ink-muted">
              Start free. Upgrade when the deadlines get closer. Self-host it for nothing, forever.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {PRICING.map((plan) => (
              <div
                key={plan.id}
                className={`card flex flex-col p-6 ${plan.highlight ? 'ring-2 ring-brand-600 lg:-mt-4 lg:mb-[-1rem]' : ''}`}
              >
                {plan.highlight && (
                  <div className="mb-3 inline-flex w-fit rounded-full bg-brand-700 px-2.5 py-0.5 text-xs font-bold text-white">
                    Most popular
                  </div>
                )}
                <h3 className="text-base font-bold text-ink">{plan.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-black tracking-tight text-ink">
                    {plan.price === 0 ? (plan.id === 'enterprise' ? 'Free' : '€0') : `€${plan.price}`}
                  </span>
                  <span className="text-sm text-ink-muted">{plan.cadence}</span>
                </div>
                <p className="mt-3 text-sm text-ink-muted">{plan.description}</p>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-ink-muted">
                      <span className="mt-0.5 text-emerald-600">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.id === 'enterprise' ? '/docs/deploy' : '/signup'}
                  className={`mt-6 w-full ${plan.highlight ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-xs text-ink-muted">
            Prices exclude VAT. Enterprise compliance tooling priced per module typically exceeds{' '}
            {euro(10000)} per year. Self-hosting has no seat limit.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* FAQ                                                                 */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <h2 className="text-center text-3xl font-black tracking-tight text-ink">
            Questions worth asking
          </h2>
          <dl className="mt-10 space-y-6">
            {FAQ.map((item) => (
              <div key={item.q} className="card p-6">
                <dt className="text-base font-bold text-ink">{item.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-ink-muted">{item.a}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-14 rounded-2xl bg-ink px-8 py-10 text-center">
            <h3 className="text-2xl font-black text-white">The deadline is not going to move.</h3>
            <p className="mx-auto mt-3 max-w-xl text-sm text-slate-300">
              Find out where you stand in five minutes. No card, no sales call, no implementation
              project.
            </p>
            <Link href="/signup" className="btn-primary mt-6 px-6 py-3 text-base">
              Start free
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}