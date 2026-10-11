import type { Metadata } from 'next';

import './globals.css';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';

export const metadata: Metadata = {
  title: {
    default: 'CompliSME — EU compliance for SMEs',
    template: '%s · CompliSME',
  },
  description:
    'EU AI Act, CSRD, GDPR and e-invoicing in one tool. Codebase scanning mapped to compliance articles, LLM-assisted document drafting and a 90-day remediation roadmap. €49/month.',
  keywords: [
    'EU AI Act',
    'CSRD',
    'GDPR',
    'e-invoicing',
    'compliance',
    'SME',
    'ViDA',
    'ESRS',
  ],
  openGraph: {
    title: 'CompliSME — EU compliance for SMEs',
    description: 'Multi-framework compliance without the €50K consultant.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}