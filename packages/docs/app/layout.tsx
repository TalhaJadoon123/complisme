import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'CompliSME documentation',
  description:
    'How to run CompliSME: CLI reference, REST API, framework definitions, the codebase scanner and self-hosting.',
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-900">{children}</body>
    </html>
  );
}