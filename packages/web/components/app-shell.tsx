'use client';

/** Shared dashboard shell for the authenticated area. */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { getCompanyId, getToken } from '@/lib/api';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/onboarding', label: 'Onboarding' },
  { href: '/roadmap', label: 'Roadmap' },
  { href: '/documents', label: 'Documents' },
  { href: '/scan', label: 'Scanner' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // The app is a static deploy with a token in localStorage: guard the routes
    // on the client, since there is no server session to check.
    if (!getToken()) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [pathname, router]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col px-4 py-8 sm:px-6 lg:flex-row lg:gap-8">
      <aside className="mb-6 shrink-0 lg:w-56 no-print">
        <div className="card p-3 lg:sticky lg:top-24">
          <nav className="flex gap-1 overflow-x-auto lg:flex-col">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:bg-surface hover:text-ink'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-ink-muted">
            {getCompanyId() ? (
              <p>Company: {getCompanyId()}</p>
            ) : (
              <p>No company selected</p>
            )}
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="card flex items-center justify-center gap-3 p-12 text-sm text-ink-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="card border-red-200 bg-red-50 p-6">
      <h2 className="text-sm font-bold text-red-900">Something went wrong</h2>
      <p className="mt-1 text-sm text-red-800">{error}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary mt-4">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center p-12 text-center">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-ink-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}