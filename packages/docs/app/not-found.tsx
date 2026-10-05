import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <p className="text-sm font-semibold text-slate-400">404</p>
      <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-600">
        That documentation page does not exist, or it moved.
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/docs" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Documentation
        </Link>
        <Link href="/" className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800">
          Home
        </Link>
      </div>
    </div>
  );
}