import { notFound } from 'next/navigation';

import { getPage, listSections } from '@/lib/content';

export function generateStaticParams() {
  return listSections().flatMap((section) =>
    section.pages.map((page) => ({ slug: page.slug })),
  );
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let page;
  try {
    page = getPage(slug);
  } catch {
    notFound();
  }

  return (
    <article>
      <div
        className="prose-docs"
        dangerouslySetInnerHTML={{ __html: page.html }}
      />
      <hr className="my-10 border-slate-200" />
      <p className="text-sm text-slate-500">
        Found an error? Correct the framework YAML or open an issue — the framework definitions are
        open source precisely so this is fixable by anyone.
      </p>
    </article>
  );
}