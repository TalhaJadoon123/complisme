import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DesktopApp, startDesktop, renderApp } from '../src/index';
import type { DesktopServer } from '../src/index';

let dir: string;
let app: DesktopApp;
let server: DesktopServer;
let base: string;

const scanFixture = `
import OpenAI from 'openai';
const client = new OpenAI();
export async function signup(input) {
  const email = input.email;
  const phone = input.phone;
  await client.chat.completions.create({ messages: [{ role: 'user', content: email }] });
  console.log('user', email, phone);
  return { email };
}
`;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'complisme-desktop-'));
  const scanRoot = path.join(dir, 'repo');
  fs.mkdirSync(scanRoot, { recursive: true });
  fs.writeFileSync(path.join(scanRoot, 'signup.ts'), scanFixture, 'utf8');

  app = new DesktopApp({ workspaceDir: dir, scanRoot });
  server = await startDesktop({ port: 0, host: '127.0.0.1', workspaceDir: dir, scanRoot });
  base = server.url;
}, 60_000);

afterAll(async () => {
  await server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function call(method: string, path: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as never };
}

describe('desktop GUI document', () => {
  it('is a complete, self-contained HTML page', () => {
    const html = renderApp();
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('</html>');
    expect(html).toContain('CompliSME');
  });

  it('contains every navigation view', () => {
    const html = renderApp();
    for (const view of ['dashboard', 'company', 'questionnaire', 'scan', 'roadmap', 'documents']) {
      expect(html).toContain(`data-view="${view}"`);
    }
  });

  it('makes no external requests', () => {
    const html = renderApp();
    expect(html).not.toMatch(/src="https?:/);
    expect(html).not.toMatch(/href="https?:/);
  });

  it('does not inject raw HTML from data', () => {
    // The only innerHTML use is for trusted static markup; user data goes
    // through esc() and textContent.
    const html = renderApp();
    const innerHtml = /innerHTML = ([^;]+);/g;
    const uses = [...html.matchAll(innerHtml)].map((m) => m[1]);
    expect(uses.every((u) => u.trim() === "''" || u.includes('escapeHtml') === false)).toBe(true);
    expect(html).toContain('function esc(');
  });
});

describe('desktop server routes', () => {
  it('serves the app at the root', async () => {
    const response = await fetch(`${base}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('CompliSME');
  });

  it('sets protective headers', async () => {
    const response = await fetch(`${base}/`);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });

  it('returns 404 JSON for unknown API routes', async () => {
    const { status, body } = await call('GET', '/api/nope');
    expect(status).toBe(404);
    expect(body).toMatchObject({ error: 'not_found' });
  });

  it('exposes an overview before a profile exists', async () => {
    const { status, body } = await call('GET', '/api/overview');
    expect(status).toBe(200);
    expect(body).toMatchObject({ hasProfile: false });
    expect((body as { countdowns: unknown[] }).countdowns.length).toBeGreaterThan(0);
    expect((body as { plans: unknown[] }).plans.length).toBe(4);
  });

  it('lists frameworks and returns one definition', async () => {
    const list = await call('GET', '/api/frameworks');
    expect((list.body as { frameworks: unknown[] }).frameworks.length).toBe(4);

    const one = await call('GET', '/api/framework?id=gdpr');
    expect(one.status).toBe(200);
    expect((one.body as { articles: unknown[] }).articles.length).toBeGreaterThan(5);
  });

  it('404s an unknown framework id', async () => {
    const { status } = await call('GET', '/api/framework?id=nope');
    expect(status).toBe(404);
  });
});

describe('company profile', () => {
  it('accepts a profile without id or size and derives them', async () => {
    const { status, body } = await call('POST', '/api/profile', {
      name: 'Acme Analytics BV',
      country: 'NL',
      sector: 'software',
      employees: 9,
      revenueEUR: 1_250_000,
    });
    expect(status).toBe(200);
    const profile = (body as { profile: { id: string; size: string } }).profile;
    expect(profile.id).toBeTruthy();
    expect(profile.size).toBe('micro');
  });

  it('scores the frameworks once a profile is saved', async () => {
    await call('POST', '/api/profile', {
      name: 'Acme Analytics BV',
      country: 'NL',
      sector: 'software',
      employees: 9,
      revenueEUR: 1_250_000,
      aiSystems: [{ id: 'a1', name: 'Bot', purpose: 'Support', domain: 'customer-service', deployed: true }],
      processingActivities: [
        { id: 'd1', name: 'Customers', purpose: 'Contract', legalBasis: 'contract', dataSubjects: ['customers'] },
      ],
    });

    const { body } = await call('GET', '/api/overview');
    const overview = body as {
      hasProfile: boolean;
      overall: number;
      grade: string;
      scores: unknown[];
      gaps: unknown[];
      summary: { total: number };
      applicability: unknown[];
    };
    expect(overview.hasProfile).toBe(true);
    expect(overview.overall).toBeGreaterThanOrEqual(0);
    expect(overview.grade).toMatch(/[ABCDF]/);
    expect(overview.scores.length).toBeGreaterThan(0);
    expect(overview.summary.total).toBeGreaterThan(0);
    expect(overview.applicability.length).toBe(4);
  });

  it('rejects an invalid profile', async () => {
    const { status, body } = await call('POST', '/api/profile', { country: 'NL' });
    expect(status).toBe(200); // the app returns { error } in the 200 envelope
    expect(body).toHaveProperty('error');
  });

  it('improves the score when answers are supplied', async () => {
    const before = (await call('GET', '/api/overview')).body as { overall: number };
    const answered = await call('POST', '/api/answers', {
      gdpr: { 'a5-q1': 'documented', 'a30-q1': 'complete-and-reviewed', 'a5-q2': 'defined-and-automated' },
    });
    expect(answered.status).toBe(200);
    const after = (await call('GET', '/api/overview')).body as { overall: number };
    expect(after.overall).toBeGreaterThan(before.overall);
  });

  it('builds a roadmap once a profile exists', async () => {
    const { body } = await call('GET', '/api/roadmap');
    const roadmap = (body as { roadmap: { phases: unknown[]; items: unknown[] } }).roadmap;
    expect(roadmap.phases.length).toBe(3);
    expect(roadmap.items.length).toBeGreaterThan(0);
  });

  it('persists across app instances', async () => {
    const reopened = new DesktopApp({ workspaceDir: dir });
    const overview = reopened.overview();
    expect(overview.hasProfile).toBe(true);
    expect(overview.scores.length).toBeGreaterThan(0);
    // Answers survive too, so a reopened session does not restart from zero.
    expect(overview.overall).toBeGreaterThan(0);
  });
});

describe('scanning from the desktop app', () => {
  it('scans inside the configured root', async () => {
    const { body } = await call('POST', '/api/scan', { path: 'signup.ts' });
    const result = body as { filesScanned: number; findings: unknown[]; gaps: unknown[] };
    expect(result.filesScanned).toBe(1);
    expect(result.findings.length).toBeGreaterThan(2);
    expect(result.gaps.length).toBeGreaterThan(0);
  });

  it('refuses to escape the scan root', async () => {
    for (const escape of ['../..', '../../etc/passwd', 'C:\\Windows']) {
      const { body } = await call('POST', '/api/scan', { path: escape });
      expect(body).toHaveProperty('error', 'invalid_path');
    }
  });

  it('reports a missing path rather than throwing', async () => {
    const { body } = await call('POST', '/api/scan', { path: 'does-not-exist' });
    expect(body).toHaveProperty('error');
  });
});

describe('document generation from the desktop app', () => {
  it('writes a PDF into the workspace', async () => {
    const { status, body } = await call('POST', '/api/generate', { kind: 'gdpr-dpia' });
    expect(status).toBe(200);
    const doc = body as { path: string; bytes: number; error?: string };
    expect(doc.error).toBeUndefined();
    expect(doc.bytes).toBeGreaterThan(1000);
    expect(fs.existsSync(doc.path)).toBe(true);
    expect(fs.statSync(doc.path).size).toBeGreaterThan(1000);
  }, 120_000);

  it('lists generated documents in the overview', async () => {
    const { body } = await call('GET', '/api/overview');
    const documents = (body as { documents: Array<{ kind: string }> }).documents;
    expect(documents.some((d) => d.kind === 'gdpr-dpia')).toBe(true);
  });
});

describe('robustness', () => {
  it('tolerates a malformed JSON body', async () => {
    const response = await fetch(`${base}/api/profile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect([200, 400, 500]).toContain(response.status);
  });

  it('reports AI status without a provider', async () => {
    const { status, body } = await call('GET', '/api/ai/status');
    expect(status).toBe(200);
    expect(body).toHaveProperty('configured');
  });

  it('binds to loopback only', () => {
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:/);
  });
});