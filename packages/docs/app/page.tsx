import Link from 'next/link';

export default function DocsHome() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-lg text-center">
        <h1 className="text-3xl font-black tracking-tight text-slate-900">CompliSME documentation</h1>
        <p className="mt-3 text-slate-600">
          CLI reference, REST API, framework definitions, the codebase scanner and self-hosting.
        </p>
        <Link href="/docs" className="mt-6 inline-block rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-800">
          Read the docs
        </Link>
      </div>
    </div>
  );
}