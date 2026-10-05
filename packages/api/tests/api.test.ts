import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildServer, matchesAnyConstantTime, MemoryRepository, seed } from '../src/index';
import { hashPassword, passwordIssues, signToken, verifyPassword, verifyToken } from '../src/auth';
import { createRepository } from '../src/db';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let scanRoot: string;
const repository = new MemoryRepository();

const email = 'test@complisme.eu';
const password = 'Test12345';

/** One shared account: a second signup with the same email would return 409. */
let token: string | null = null;
let companyId: string | null = null;

beforeAll(async () => {
  // Pin the scan root to the repository rather than the test runner's cwd, so
  // the scanner tests do not depend on where vitest was invoked from.
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  scanRoot = repoRoot;
  app = await buildServer({
    repository,
    logger: false,
    storageDir: path.join(os.tmpdir(), 'complisme-api-test'),
    scanRoot: repoRoot,
  });
  await app.ready();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/signup',
    payload: { email, password, companyName: 'Test BV', country: 'NL' },
  });
  const body = response.json();
  token = body.token;
  companyId = body.company?.id;
});

afterAll(async () => {
  await app.close();
});

/** Returns the shared token, signing up on first use. */
async function auth(): Promise<string> {
  if (!token) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: { email, password, companyName: 'Test BV', country: 'NL' },
    });
    token = response.json().token;
  }
  return token as string;
}

async function currentCompanyId(): Promise<string> {
  if (!companyId) await auth();
  return companyId as string;
}

describe('health', () => {
  it('reports status, storage kind and capabilities', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.database).toBe('memory');
    expect(body.frameworks).toHaveLength(4);
    expect(body.capabilities.docx).toBe(true);
  });
});

describe('public catalogue', () => {
  it('lists the four frameworks with statistics', async () => {
    const body = (await app.inject({ method: 'GET', url: '/api/v1/frameworks' })).json();
    expect(body.frameworks).toHaveLength(4);
    expect(body.frameworks[0].stats.questions).toBeGreaterThan(0);
  });

  it('returns one framework with its deadlines', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/frameworks/eu-ai-act' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.articles.length).toBeGreaterThan(10);
    expect(body.deadlines.length).toBeGreaterThan(5);
  });

  it('404s an unknown framework with a helpful message', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/frameworks/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('not_found');
  });

  it('lists the scanner rules and their article mappings', async () => {
    const body = (await app.inject({ method: 'GET', url: '/api/v1/rules' })).json();
    expect(body.rules.length).toBeGreaterThanOrEqual(15);
    expect(body.rules.every((r: { mapsTo: unknown[] }) => r.mapsTo.length > 0)).toBe(true);
  });

  it('publishes the pricing matrix', async () => {
    const body = (await app.inject({ method: 'GET', url: '/api/v1/pricing' })).json();
    expect(body.plans).toHaveLength(4);
    expect(body.plans.find((p: { id: string }) => p.id === 'starter').priceMonthly).toBe(49);
    expect(body.deadlines.length).toBeGreaterThan(0);
  });
});

describe('auth', () => {
  it('signs up, logs in and identifies the user', async () => {
    const token = await auth();

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe(email);
    expect(me.json().subscription.plan).toBe('free');

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().token).toBeTruthy();
  });

  it('rejects a wrong password and a weak one', async () => {
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'nope' },
    });
    expect(wrong.statusCode).toBe(401);

    const weak = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: { email: 'w@x.eu', password: 'abcdefghij', companyName: 'X', country: 'NL' },
    });
    expect(weak.statusCode).toBe(400);
    expect(weak.json().error).toBe('weak_password');
  });

  it('refuses a duplicate email', async () => {
    await auth();
    const again = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: { email, password, companyName: 'Test BV', country: 'NL' },
    });
    expect(again.statusCode).toBe(409);
  });

  it('rejects a malformed payload', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/signup', payload: {} });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('validation_error');
  });
});

describe('constant-time key comparison', () => {
  it('accepts an exact match and rejects near-misses', () => {
    const keys = ['key-one', 'key-two', 'key-three'];
    expect(matchesAnyConstantTime('key-two', keys)).toBe(true);
    expect(matchesAnyConstantTime('key-twoX', keys)).toBe(false);
    expect(matchesAnyConstantTime('key', keys)).toBe(false);
    expect(matchesAnyConstantTime('', keys)).toBe(false);
    expect(matchesAnyConstantTime('anything', [])).toBe(false);
  });

  it('handles a candidate longer than any key without throwing', () => {
    expect(matchesAnyConstantTime('a'.repeat(500), ['short'])).toBe(false);
    expect(matchesAnyConstantTime('a'.repeat(500), [])).toBe(false);
  });
});

describe('password and token primitives', () => {
  it('hashes and verifies passwords', () => {
    const hash = hashPassword(password);
    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain(password);
    expect(verifyPassword(password, hash)).toBe(true);
    expect(verifyPassword('wrong', hash)).toBe(false);
    expect(verifyPassword(password, 'garbage')).toBe(false);
  });

  it('signs and verifies tokens, rejecting tampering and expiry', () => {
    const secret = 'a'.repeat(40);
    const token = signToken({ sub: 'user-1', cid: 'company-1' }, secret);
    expect(verifyToken(token, secret)).toMatchObject({ sub: 'user-1' });

    expect(verifyToken(token, 'different-secret')).toBeNull();
    expect(verifyToken('not.a.token', secret)).toBeNull();
    expect(verifyToken(`${token}x`, secret)).toBeNull();

    const expired = signToken({ sub: 'u' }, secret, -10);
    expect(verifyToken(expired, secret)).toBeNull();
  });

  it('flags password weaknesses', () => {
    expect(passwordIssues('Test12345')).toEqual([]);
    expect(passwordIssues('short')).toContain('at least 8 characters');
    expect(passwordIssues('12345678')).toContain('at least one letter');
  });
});

describe('assessment lifecycle', () => {
  it('assesses, scores, creates gaps and persists an assessment', async () => {
    const token = await auth();
    const companyId = await currentCompanyId();

    await app.inject({
      method: 'PUT',
      url: `/api/v1/companies/${companyId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Test BV',
        legalName: 'Test B.V.',
        country: 'NL',
        sector: 'software',
        employees: 12,
        revenueEUR: 900_000,
        size: 'micro',
        aiSystems: [{ id: 'a1', name: 'Bot', purpose: 'Support', domain: 'customer-service', deployed: true }],
        processingActivities: [
          {
            id: 'd1',
            name: 'Customers',
            purpose: 'Contract',
            legalBasis: 'contract',
            dataSubjects: ['customers'],
            dataCategories: ['email'],
            retentionMonths: 120,
          },
        ],
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/assess',
      headers: { authorization: `Bearer ${token}` },
      payload: { companyId, answers: {} },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.scores.length).toBeGreaterThan(0);
    expect(body.gaps.length).toBeGreaterThan(0);
    expect(body.assessmentId).toBeTruthy();
    expect(body.overall).toBeGreaterThanOrEqual(0);

    const status = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${companyId}/status`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json().hasAssessment).toBe(true);
    expect(status.json().countdowns.length).toBeGreaterThan(0);
  });

  it('rejects an assessment with neither companyId nor profile', async () => {
    const token = await auth();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/assess',
      headers: { authorization: `Bearer ${token}` },
      payload: { answers: {} },
    });
    expect(response.statusCode).toBe(400);
  });

  it('previews without persisting', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/assess/preview',
      payload: {
        profile: {
          id: 'preview',
          name: 'Preview',
          country: 'NL',
          sector: 'software',
          employees: 4,
          revenueEUR: 100_000,
          size: 'micro',
        },
        answers: {},
      },
    });
    expect(response.statusCode).toBe(200);
    expect(typeof response.json().overall).toBe('number');
  });

  it('requires a profile for a preview', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/assess/preview', payload: {} });
    expect(response.statusCode).toBe(400);
  });
});

describe('roadmap', () => {
  it('returns three phases with dated items', async () => {
    const token = await auth();
    const companyId = await currentCompanyId();
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${companyId}/roadmap?horizon=90`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.roadmap.phases).toHaveLength(3);
    expect(body.roadmap.items.length).toBeGreaterThan(0);
    expect(body.roadmap.items[0].dueDate).toBeTruthy();
    expect(body.roadmap.disclaimer).toBeTruthy();
  });
});

describe('gaps and evidence', () => {
  it('changes a gap status and adds evidence', async () => {
    const token = await auth();
    const companyId = await currentCompanyId();

    const assessed = await app.inject({
      method: 'POST',
      url: '/api/v1/assess',
      headers: { authorization: `Bearer ${token}` },
      payload: { companyId, answers: {} },
    });
    const gap = assessed.json().gaps[0];

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/v1/gaps/${gap.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: 'in_progress' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().gap.status).toBe('in_progress');

    const invalid = await app.inject({
      method: 'PATCH',
      url: `/api/v1/gaps/${gap.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: 'nonsense' },
    });
    expect(invalid.statusCode).toBe(400);

    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/companies/${companyId}/evidence`,
      headers: { authorization: `Bearer ${token}` },
      payload: { frameworkId: 'gdpr', articleId: 'art-30-ropa', title: 'ROPA v1', type: 'record' },
    });
    expect(created.statusCode).toBe(201);

    const listed = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${companyId}/evidence`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listed.json().evidence.length).toBeGreaterThanOrEqual(1);
  });

  it('validates evidence payloads', async () => {
    const token = await auth();
    const companyId = await currentCompanyId();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/companies/${companyId}/evidence`,
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'no framework or article' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('document generation', () => {
  it('generates HTML and records it in the library', async () => {
    const token = await auth();
    const companyId = await currentCompanyId();

    const generated = await app.inject({
      method: 'POST',
      url: '/api/v1/generate',
      headers: { authorization: `Bearer ${token}` },
      payload: { companyId, kind: 'compliance-roadmap', format: 'html', save: true },
    });
    expect(generated.statusCode).toBe(200);
    const body = generated.json();
    expect(body.sections).toBeGreaterThan(0);
    expect(body.checksum).toBeTruthy();
    expect(body.path).toBeTruthy();

    const documents = await app.inject({
      method: 'GET',
      url: `/api/v1/documents?companyId=${companyId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(documents.json().documents.length).toBeGreaterThanOrEqual(1);
    expect(documents.json().documents[0].versions.length).toBeGreaterThanOrEqual(1);

    // A second generation bumps the version.
    await app.inject({
      method: 'POST',
      url: '/api/v1/generate',
      headers: { authorization: `Bearer ${token}` },
      payload: { companyId, kind: 'compliance-roadmap', format: 'html', save: true },
    });
    const again = await app.inject({
      method: 'GET',
      url: `/api/v1/documents?companyId=${companyId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const latest = again.json().documents.find((d: { kind: string }) => d.kind === 'compliance-roadmap');
    expect(latest.version).toBe(2);
  });

  it('generates a DOCX file on disk', async () => {
    const token = await auth();
    const companyId = await currentCompanyId();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/generate',
      headers: { authorization: `Bearer ${token}` },
      payload: { companyId, kind: 'gdpr-ropa', format: 'docx', save: true },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().format).toBe('docx');
    expect(response.json().bytes).toBeGreaterThan(3000);
  });

  it('rejects an unknown document kind', async () => {
    const token = await auth();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/generate',
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: 'not-a-kind', format: 'pdf' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('scanner', () => {
  it('scans a directory and returns article-mapped findings', async () => {
    const token = await auth();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/scan',
      headers: { authorization: `Bearer ${token}` },
      payload: { path: 'packages/scanner/src/demo-fixtures.ts' },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.filesScanned).toBe(1);
    expect(body.findings.length).toBeGreaterThan(5);
    expect(body.findings[0].mappings.length).toBeGreaterThan(0);
    expect(body.gaps.length).toBeGreaterThan(0);
    expect(body.summary.total).toBe(body.findings.length);
  });

  it('refuses to scan outside the allowed root', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/scan',
      payload: { path: '../../../../etc/passwd' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('invalid_path');
  });

  it('validates the scan payload', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/scan', payload: {} });
    expect(response.statusCode).toBe(400);
  });
});

describe('AI and subscription', () => {
  it('reports AI status and degrades clearly when unconfigured', async () => {
    const status = await app.inject({ method: 'GET', url: '/api/v1/ai/status' });
    expect(status.statusCode).toBe(200);
    expect(typeof status.json().configured).toBe('boolean');
    expect(status.json().note).toBeTruthy();

    const ask = await app.inject({ method: 'POST', url: '/api/v1/ai/ask', payload: { question: 'x' } });
    // 503 when no provider is configured, 502 when the call itself failed,
    // 200 when a provider answered.
    expect([503, 502, 200]).toContain(ask.statusCode);
  });

  it('applies a plan change directly when billing is off', async () => {
    const token = await auth();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/subscription',
      headers: { authorization: `Bearer ${token}` },
      payload: { plan: 'starter' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().subscription.plan).toBe('starter');
    expect(response.json().billingEnabled).toBe(false);
  });

  it('rejects an unknown plan', async () => {
    const token = await auth();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/subscription',
      headers: { authorization: `Bearer ${token}` },
      payload: { plan: 'platinum' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('errors', () => {
  it('404s unknown routes with a structured body', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('not_found');
  });

  it('requires a company context where one is needed', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/documents' });
    expect(response.statusCode).toBe(400);
  });
});

describe('path confinement', () => {
  it('refuses the sibling-prefix escape that startsWith() would allow', async () => {
    // A sibling directory whose name merely starts with the root's name must
    // not be scannable: '/repo-secrets'.startsWith('/repo') is true.
    const sibling = `${scanRoot}-secrets`;
    fs.mkdirSync(sibling, { recursive: true });
    try {
      fs.writeFileSync(path.join(sibling, 'leak.ts'), 'const password = "x";', 'utf8');
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/scan',
        payload: { path: sibling },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('invalid_path');
    } finally {
      fs.rmSync(sibling, { recursive: true, force: true });
    }
  });

  it('refuses traversal, absolute escapes and non-existent paths', async () => {
    for (const candidate of ['../../../etc/passwd', '/etc/passwd', 'no-such-directory']) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/scan',
        payload: { path: candidate },
      });
      expect(response.statusCode).toBe(400);
    }
  });

  it('still scans a valid path inside the root', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/scan',
      payload: { path: 'packages/scanner/src/demo-fixtures.ts' },
    });
    expect(response.statusCode).toBe(200);
  });
});

describe('abuse controls', () => {
  it('caps AI question length rather than forwarding it to a paid provider', async () => {
    const token = await auth();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/ask',
      headers: { authorization: `Bearer ${token}` },
      payload: { question: 'x'.repeat(5_000) },
    });
    expect([400, 503]).toContain(response.statusCode);
  });

  it('rejects a non-string question', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/ask',
      payload: { question: { nested: true } },
    });
    expect([400, 503]).toContain(response.statusCode);
  });

  it('does not echo upstream provider internals on failure', async () => {
    const token = await auth();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/ask',
      headers: { authorization: `Bearer ${token}` },
      payload: { question: 'What is Article 5 of the AI Act?' },
    });
    if (response.statusCode === 502) {
      expect(response.json().message).not.toMatch(/sk-|api[_-]?key|token/i);
    }
  });
});

describe('repository', () => {
  it('falls back to memory without a database URL', () => {
    expect(createRepository(undefined).kind).toBe('memory');
    expect(createRepository('').kind).toBe('memory');
  });

  it('seeds a demo company with an assessment, gaps and evidence', async () => {
    const repo = new MemoryRepository();
    const result = await seed(repo);
    expect(result.mode).toBe('memory');
    expect(result.user.email).toBe('demo@complisme.eu');
    expect(result.gaps).toBeGreaterThan(0);
    expect(result.evidence).toBeGreaterThanOrEqual(5);
    expect(result.assessmentId).toBeTruthy();

    const company = await repo.findCompany(result.company.id);
    expect(company?.name).toBe('Acme Analytics BV');
    expect((await repo.listAssessments(result.company.id)).length).toBeGreaterThan(0);
    expect((await repo.listDocuments(result.company.id)).length).toBeGreaterThan(0);
    expect((await repo.getSubscription(result.company.id)).plan).toBe('business');
  });

  it('tracks usage per company per month', async () => {
    const repo = new MemoryRepository();
    await repo.createCompany({ id: 'c1', name: 'C', country: 'NL', sector: 'x', employees: 1, revenueEUR: 1, size: 'micro' });
    expect(await repo.usageInMonth('c1', 'scans')).toBe(0);
    await repo.recordUsage('c1', 'scans', 1);
    await repo.recordUsage('c1', 'scans', 2);
    expect(await repo.usageInMonth('c1', 'scans')).toBe(3);
  });

  it('scopes gaps to their company', async () => {
    const repo = new MemoryRepository();
    const gaps = [
      {
        id: 'g1',
        frameworkId: 'gdpr',
        articleId: 'art-30-ropa',
        severity: 'error' as const,
        remediation: 'write it',
        effort: 3,
      },
    ];
    await repo.upsertGaps('company-a', gaps);
    expect((await repo.listGaps('company-a')).length).toBe(1);
    expect((await repo.listGaps('company-b')).length).toBe(0);
  });
});

describe('generated documents on disk', () => {
  it('writes a file that exists', async () => {
    const dir = path.join(os.tmpdir(), 'complisme-api-test');
    const files = fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }) : [];
    expect(files.length).toBeGreaterThan(0);
  });
});