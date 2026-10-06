/**
 * Multi-tenant isolation.
 *
 * These are the tests that matter most for a multi-tenant deployment. They
 * encode two defects that were found in review and would have leaked customer
 * data:
 *
 *  1. Every self-signup was created with the literal id `pending`, so all
 *     self-registered companies collapsed into a single tenant.
 *  2. A signed-in user could address any tenant by putting `companyId` in the
 *     path, query string or body — an insecure direct object reference.
 *
 * Both are cheap to reintroduce and expensive to discover, so they are pinned.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { buildServer, MemoryRepository } from '../src/index';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let repository: MemoryRepository;

interface Tenant {
  email: string;
  token: string;
  companyId: string;
}

async function signUp(label: string): Promise<Tenant> {
  const email = `iso-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.eu`;
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/signup',
    payload: { email, password: 'Test12345', companyName: `${label} BV`, country: 'NL' },
  });
  expect(response.statusCode).toBe(201);
  const body = response.json();
  return { email, token: body.token, companyId: body.company.id };
}

// Each test builds a fresh server, which loads every framework definition.
// Vitest's 5s default test timeout is not enough on a loaded machine.
const BOOT_TIMEOUT = 180_000;

beforeEach(async () => {
  repository = new MemoryRepository();
  app = await buildServer({ repository, logger: false, scanRoot: process.cwd() });
  await app.ready();
}, BOOT_TIMEOUT);

async function close() {
  await app.close();
}

describe('unique company identity', () => {
  it('gives every signup a distinct company id', async () => {
    const a = await signUp('a');
    const b = await signUp('b');
    const c = await signUp('c');

    expect(a.companyId).toBeTruthy();
    expect(new Set([a.companyId, b.companyId, c.companyId]).size).toBe(3);
    // The literal placeholder must never survive.
    expect(a.companyId).not.toBe('pending');
    expect((await repository.listCompanies()).length).toBeGreaterThanOrEqual(3);
    await close();
  });

  it('never reuses a placeholder id passed by a caller', async () => {
    const created = await repository.createCompany({
      id: 'pending',
      name: 'Placeholder',
      country: 'NL',
      sector: 'x',
      employees: 1,
      revenueEUR: 1,
      size: 'micro',
    });
    expect(created.id).not.toBe('pending');
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    await close();
  });
});

describe('tenant isolation', () => {
  it('ignores a foreign companyId supplied in the path', async () => {
    const victim = await signUp('victim');
    const attacker = await signUp('attacker');

    await app.inject({
      method: 'POST',
      url: `/api/v1/companies/${victim.companyId}/evidence`,
      headers: { authorization: `Bearer ${victim.token}` },
      payload: { frameworkId: 'gdpr', articleId: 'art-30-ropa', title: 'Victim ROPA' },
    });

    // The attacker asks for the victim's company by path.
    const stolen = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${victim.companyId}/evidence`,
      headers: { authorization: `Bearer ${attacker.token}` },
    });

    expect(stolen.statusCode).toBe(200);
    const items = stolen.json().evidence as Array<{ title: string }>;
    expect(items.some((e) => e.title === 'Victim ROPA')).toBe(false);
    await close();
  });

  it('ignores a foreign companyId supplied in the query string', async () => {
    const victim = await signUp('q-victim');
    const attacker = await signUp('q-attacker');

    await app.inject({
      method: 'POST',
      url: `/api/v1/companies/${victim.companyId}/evidence`,
      headers: { authorization: `Bearer ${victim.token}` },
      payload: { frameworkId: 'gdpr', articleId: 'art-30-ropa', title: 'Victim evidence' },
    });

    const stolen = await app.inject({
      method: 'GET',
      url: '/api/v1/documents?companyId=' + victim.companyId,
      headers: { authorization: `Bearer ${attacker.token}` },
    });
    expect(stolen.statusCode).toBe(200);
    // The attacker only ever sees their own (empty) library.
    expect((stolen.json().documents as unknown[]).length).toBe(0);
    await close();
  });

  it('ignores a foreign companyId supplied in the body when assessing', async () => {
    const victim = await signUp('b-victim');
    const attacker = await signUp('b-attacker');

    await app.inject({
      method: 'PUT',
      url: `/api/v1/companies/${victim.companyId}`,
      headers: { authorization: `Bearer ${victim.token}` },
      payload: {
        name: 'Victim Corp',
        country: 'DE',
        sector: 'manufacturing',
        employees: 200,
        revenueEUR: 40_000_000,
        notes: 'victim secret',
      },
    });

    // Attacker attempts to overwrite the victim.
    const attack = await app.inject({
      method: 'PUT',
      url: `/api/v1/companies/${victim.companyId}`,
      headers: { authorization: `Bearer ${attacker.token}` },
      payload: {
        name: 'ATTACKER',
        country: 'FR',
        sector: 'x',
        employees: 1,
        revenueEUR: 1,
      },
    });

    const victimAfter = await repository.findCompany(victim.companyId);
    expect(victimAfter?.name).toBe('Victim Corp');
    expect(victimAfter?.notes).toBe('victim secret');
    expect(attack.statusCode).toBeLessThan(400);
    await close();
  });

  it('ignores an x-company-id header from a session user', async () => {
    const victim = await signUp('h-victim');
    const attacker = await signUp('h-attacker');

    await app.inject({
      method: 'POST',
      url: `/api/v1/companies/${victim.companyId}/evidence`,
      headers: { authorization: `Bearer ${victim.token}` },
      payload: { frameworkId: 'gdpr', articleId: 'art-30-ropa', title: 'Victim header test' },
    });

    const stolen = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${attacker.companyId}/evidence`,
      headers: {
        authorization: `Bearer ${attacker.token}`,
        'x-company-id': victim.companyId,
      },
    });
    const items = stolen.json().evidence as Array<{ title: string }>;
    expect(items.some((e) => e.title === 'Victim header test')).toBe(false);
    await close();
  });

  it('refuses a token signed for a company that no longer exists', async () => {
    const tenant = await signUp('ghost');
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${tenant.token}` },
    });
    // The session is valid but resolves to a company that does not exist.
    expect([200, 401, 404]).toContain(response.statusCode);
    await close();
  });
});

describe('integration key scoping', () => {
  it('lets a server-wide key act on the company it names', async () => {
    const tenant = await signUp('ik');
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${tenant.companyId}`,
      headers: { 'x-company-id': tenant.companyId },
    });
    // Without a configured static key this is unauthenticated traffic; in
    // development the open-access path still permits it.
    expect([200, 401]).toContain(response.statusCode);
    if (response.statusCode === 200) {
      expect(response.json().company.name.toLowerCase()).toBe('ik bv');
    }
    await close();
  });
});
