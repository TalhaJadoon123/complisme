import Link from 'next/link';

/** Marketing/app header. Server component: no interactivity needed. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur no-print">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-sm font-black text-white">
            C
          </span>
          <span className="text-base font-bold tracking-tight text-ink">CompliSME</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <Link href="/#how" className="nav-link">
            How it works
          </Link>
          <Link href="/#frameworks" className="nav-link">
            Frameworks
          </Link>
          <Link href="/#pricing" className="nav-link">
            Pricing
          </Link>
          <Link href="/docs" className="nav-link">
            Docs
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/login" className="btn-ghost">
            Sign in
          </Link>
          <Link href="/signup" className="btn-primary">
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}