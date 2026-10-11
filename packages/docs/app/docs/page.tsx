import Link from 'next/link';

import { getPage, listSections } from '@/lib/content';

export default function DocsIndexPage() {
  const sections = listSections();

  return (
    <div>
      <h1>Documentation</h1>
      <p className="mt-2 text-slate-600">
        Everything needed to run CompliSME: the CLI, the REST API, the regulatory framework
        definitions, the codebase scanner and self-hosting.
      </p>

      <div className="mt-10 grid gap-8 sm:grid-cols-2">
        {sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            <ul className="mt-3 space-y-2">
              {section.pages.map((page) => (
                <li key={page.slug}>
                  <Link href={`/docs/${page.slug}`}>{page.title}</Link>
                  {page.description && (
                    <p className="mt-0.5 text-sm text-slate-500">{page.description}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-12 rounded-lg bg-slate-900 p-6 text-slate-100">
        <h2 className="mt-0 border-0 pb-0 text-white">Quick start</h2>
        <pre className="my-0 bg-transparent p-0 text-sm">
          <code>{`pnpm install
pnpm build
node packages/cli/dist/cli.js --dir ./demo init --demo
node packages/cli/dist/cli.js --dir ./demo status`}</code>
        </pre>
      </div>
    </div>
  );
}

export function generateStaticParams() {
  return listSections().flatMap((section) =>
    section.pages.map((page) => ({ slug: page.slug })),
  );
}