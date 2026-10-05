import Link from 'next/link';

import { listSections } from '@/lib/content';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const sections = listSections();

  return (
    <div className="mx-auto flex max-w-7xl flex-col lg:flex-row">
      <aside className="shrink-0 border-b border-slate-200 p-6 lg:w-64 lg:border-b-0 lg:border-r">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-700 text-xs font-black text-white">
            C
          </span>
          <span className="text-sm font-bold">CompliSME docs</span>
        </Link>

        <nav className="mt-6 space-y-6">
          {sections.map((section) => (
            <div key={section.title}>
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {section.title}
              </h2>
              <ul className="mt-2 space-y-1">
                {section.pages.map((page) => (
                  <li key={page.slug}>
                    <Link
                      href={`/docs/${page.slug}`}
                      className="block rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    >
                      {page.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 px-6 py-10 lg:px-12">
        <div className="prose-docs">{children}</div>
      </main>
    </div>
  );
}