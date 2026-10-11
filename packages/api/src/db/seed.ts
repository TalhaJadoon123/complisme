/**
 * Database seed.
 *
 * Creates a demo company with a partially complete assessment so the dashboard,
 * the roadmap and the document library all have something to show on a fresh
 * install. Safe to run repeatedly: every insert is idempotent.
 *
 *   pnpm --filter @complisme/api run seed
 */

import { randomUUID } from 'node:crypto';

import { ComplianceEngine, acme, acmeMatureAnswers } from '@complisme/core';
import { hashPassword } from '../auth';
import { createRepository, type Repository } from './index';
import type { CompanyProfile } from '@complisme/shared';

export interface SeedResult {
  mode: 'postgres' | 'memory';
  user: { email: string; password: string; id: string };
  company: { id: string; name: string };
  gaps: number;
  evidence: number;
  assessmentId: string;
}

export async function seed(repository: Repository): Promise<SeedResult> {
  await repository.init();

  const email = process.env.SEED_USER_EMAIL ?? 'demo@complisme.eu';
  const password = process.env.SEED_USER_PASSWORD ?? 'Demo12345';

  // 1. User
  const existingUser = await repository.findUserByEmail(email);
  const user =
    existingUser ??
    (await repository.createUser({ email, passwordHash: hashPassword(password), name: 'Demo User' }));
  const userId = user.id;

  // 2. Company — Acme Analytics, the 9-person Dutch SaaS from the fixtures.
  const profile: CompanyProfile = {
    ...acme,
    id: acme.id,
    createdAt: acme.createdAt,
    updatedAt: acme.updatedAt,
  };
  let company = await repository.findCompany(profile.id);
  if (!company) {
    company = await repository.createCompany(profile);
  } else {
    company = (await repository.updateCompany(profile.id, profile)) ?? company;
  }

  // 3. Link the user to the company and give it a plan.
  const subscription = await repository.setSubscription(company.id, 'business', 5);

  // 4. Evidence — show the "compliant but unevidenced" path working.
  const evidenceSeed = [
    { frameworkId: 'gdpr', articleId: 'art-30-ropa', title: 'ROPA v3 (2026 Q2)', type: 'record' },
    { frameworkId: 'gdpr', articleId: 'art-6-legal-basis', title: 'DPA signed with Zendesk', type: 'contract' },
    { frameworkId: 'gdpr', articleId: 'art-13-14-transparency', title: 'Privacy notice v4', type: 'policy' },
    { frameworkId: 'eu-ai-act', articleId: 'art-4-ai-literacy', title: 'AI literacy training log Q3', type: 'record' },
    { frameworkId: 'eu-ai-act', articleId: 'art-6-classification', title: 'AI inventory with Annex III check', type: 'record' },
    { frameworkId: 'e-invoicing', articleId: 'einvoice-technical-conformity', title: 'Peppol validation report', type: 'report' },
  ];
  const existingEvidence = await repository.listEvidence(company.id);
  if (existingEvidence.length === 0) {
    for (const item of evidenceSeed) {
      await repository.addEvidence({ ...item, companyId: company.id, source: 'manual' });
    }
  }

  // 5. Assessment
  const engine = new ComplianceEngine();
  const evidence = await repository.listEvidence(company.id);
  const result = engine.assessDetailed(profile, acmeMatureAnswers, {
    companyId: company.id,
    evidence,
  });
  const roadmap = engine.buildRoadmap(profile, result.gaps, { currentScore: result.overall });

  const existingAssessments = await repository.listAssessments(company.id, 1);
  const assessment =
    existingAssessments[0] ??
    (await repository.saveAssessment({
      companyId: company.id,
      frameworkId: result.scores[0]?.frameworkId ?? 'eu-ai-act',
      answers: acmeMatureAnswers,
      scores: result.scores,
      evidence,
      overallScore: result.overall,
      roadmap,
      completedBy: userId,
    }));

  // 6. Gaps
  const storedGaps = await repository.upsertGaps(company.id, result.gaps);

  // 7. A generated document, so the library is not empty.
  await repository.saveDocument({
    companyId: company.id,
    kind: 'compliance-roadmap',
    title: '90-Day Compliance Roadmap',
    frameworkIds: result.scores.map((s) => s.frameworkId),
    format: 'html',
    checksum: randomUUID().slice(0, 16),
    bytes: 0,
    metadata: { seeded: true, overall: result.overall },
    createdBy: userId,
  });

  return {
    mode: repository.kind,
    user: { email, password, id: userId },
    company: { id: company.id, name: company.name },
    gaps: storedGaps.length,
    evidence: (await repository.listEvidence(company.id)).length,
    assessmentId: assessment.id,
    ...(subscription ? {} : {}),
  };
}

async function main(): Promise<void> {
  const repository = createRepository(process.env.DATABASE_URL);
  const result = await seed(repository);
  await repository.close();

  console.log('');
  console.log('  CompliSME demo data seeded');
  console.log('  ────────────────────────────────────────────');
  console.log(`  storage     ${result.mode}`);
  console.log(`  login       ${result.user.email} / ${result.user.password}`);
  console.log(`  company     ${result.company.name} (${result.company.id})`);
  console.log(`  gaps        ${result.gaps}`);
  console.log(`  evidence    ${result.evidence}`);
  console.log(`  assessment  ${result.assessmentId}`);
  if (result.mode === 'memory') {
    console.log('');
    console.log('  Note: DATABASE_URL is not set, so the seed ran in memory and will');
    console.log('  disappear when the process exits. Set DATABASE_URL for a persistent seed.');
  }
  console.log('');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`seed failed: ${error.message}`);
    process.exit(1);
  });
}