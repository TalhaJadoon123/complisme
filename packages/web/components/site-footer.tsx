import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-surface no-print">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-700 text-xs font-black text-white">
              C
            </span>
            <span className="text-sm font-bold text-ink">CompliSME</span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-ink-muted">
            Multi-framework compliance for European SMEs. EU AI Act, CSRD, GDPR and e-invoicing in one
            place, at SME prices.
          </p>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink">Product</h3>
          <ul className="mt-3 space-y-2 text-sm text-ink-muted">
            <li>
              <Link href="/#features" className="hover:text-ink">Features</Link>
            </li>
            <li>
              <Link href="/#pricing" className="hover:text-ink">Pricing</Link>
            </li>
            <li>
              <Link href="/dashboard" className="hover:text-ink">Dashboard</Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink">Frameworks</h3>
          <ul className="mt-3 space-y-2 text-sm text-ink-muted">
            <li>EU AI Act</li>
            <li>CSRD / ESRS</li>
            <li>GDPR</li>
            <li>E-invoicing (ViDA &amp; NFS-e)</li>
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink">Resources</h3>
          <ul className="mt-3 space-y-2 text-sm text-ink-muted">
            <li>
              <Link href="/docs" className="hover:text-ink">Documentation</Link>
            </li>
            <li>
              <Link href="/docs/api" className="hover:text-ink">API reference</Link>
            </li>
            <li>
              <Link href="/docs/cli" className="hover:text-ink">CLI</Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-ink-muted sm:px-6">
          <p>
            CompliSME produces compliance working documents, not legal advice. Have generated
            documents reviewed by a qualified lawyer or DPO before relying on them.
          </p>
          <p className="mt-2">© {new Date().getFullYear()} CompliSME. Open-source framework definitions.</p>
        </div>
      </div>
    </footer>
  );
}