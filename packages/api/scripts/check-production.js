// Boot the API exactly as production would, with a real AUTH_SECRET, and
// assert the resulting instance is usable and locked down.
const crypto = require('node:crypto');

process.env.NODE_ENV = 'production';
process.env.AUTH_SECRET = crypto.randomBytes(32).toString('hex');
process.env.API_PORT = process.env.PORT || '4403';
delete process.env.API_STATIC_KEYS;

const { buildServer } = require('../dist/index.js');

async function main() {
  const app = await buildServer({ logger: false });
  await app.ready();

  const checks = [];
  const add = (label, ok, detail) => checks.push({ label, ok, detail });

  // 1. Health reports the production posture.
  const health = await app.inject({ method: 'GET', url: '/health' });
  const body = health.json();
  add('health 200', health.statusCode === 200, `status=${health.statusCode}`);
  add('openAccess false in production', body.openAccess === false, `openAccess=${body.openAccess}`);
  add('all 4 frameworks loaded', body.frameworks?.length === 4, `n=${body.frameworks?.length}`);

  // 2. Security headers present.
  const hsts = health.headers['strict-transport-security'];
  const nosniff = health.headers['x-content-type-options'];
  add('HSTS present in production', !!hsts, String(hsts));
  add('nosniff present', nosniff === 'nosniff', String(nosniff));

  // 3. Unauthenticated access to a tenant route is refused.
  const unauth = await app.inject({ method: 'GET', url: '/api/v1/documents' });
  add('documents requires auth', unauth.statusCode >= 400, `status=${unauth.statusCode}`);

  // 4. A tampered token is refused.
  const tampered = await app.inject({
    method: 'GET',
    url: '/api/v1/auth/me',
    headers: { authorization: 'Bearer not.a.valid.token' },
  });
  add('tampered token refused', tampered.statusCode === 401, `status=${tampered.statusCode}`);

  // 5. An anonymous caller must not be able to enumerate routes: the global
  //    auth gate answers before routing, so an unknown path is 401, not 404.
  const masked = await app.inject({ method: 'GET', url: '/api/v1/nope' });
  add(
    'unknown route masked from anonymous callers',
    masked.statusCode === 401,
    `status=${masked.statusCode}`,
  );

  // 6. Signup + login round trip works.
  const email = `prodcheck-${Date.now()}@example.eu`;
  const signup = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/signup',
    payload: { email, password: 'Test12345', companyName: 'Prod Check BV', country: 'NL' },
  });
  add('signup works', signup.statusCode === 201, `status=${signup.statusCode}`);
  const token = signup.json().token;
  const companyId = signup.json().company?.id;

  const me = await app.inject({
    method: 'GET',
    url: '/api/v1/auth/me',
    headers: { authorization: `Bearer ${token}` },
  });
  add('token authenticates', me.json().user?.email === email, me.json().user?.email ?? 'none');

  // 7. Once authenticated, routing and validation behave normally again.
  const unknown = await app.inject({
    method: 'GET',
    url: '/api/v1/nope',
    headers: { authorization: `Bearer ${token}` },
  });
  add(
    'authenticated 404 is structured JSON',
    unknown.statusCode === 404 && unknown.json().error === 'not_found',
    `status=${unknown.statusCode} ${JSON.stringify(unknown.json()).slice(0, 50)}`,
  );

  const missing = await app.inject({
    method: 'GET',
    url: '/api/v1/documents',
    headers: { authorization: `Bearer ${token}` },
  });
  add(
    'authenticated documents route works',
    missing.statusCode === 200,
    `status=${missing.statusCode}`,
  );

  // 7. Cross-tenant isolation: a second company cannot read the first's documents.
  const otherEmail = `prodcheck-b-${Date.now()}@example.eu`;
  const other = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/signup',
    payload: { email: otherEmail, password: 'Test12345', companyName: 'Other BV', country: 'NL' },
  });
  const otherToken = other.json().token;
  const otherCompanyId = other.json().company?.id;

  await app.inject({
    method: 'POST',
    url: `/api/v1/companies/${companyId}/evidence`,
    headers: { authorization: `Bearer ${token}` },
    payload: { frameworkId: 'gdpr', articleId: 'art-30-ropa', title: 'Tenant A evidence' },
  });

  const leaked = await app.inject({
    method: 'GET',
    url: `/api/v1/companies/${companyId}/evidence?companyId=${otherCompanyId}`,
    headers: { authorization: `Bearer ${otherToken}` },
  });
  const leakedList = leaked.json().evidence ?? [];
  add(
    'tenant cannot read another tenant evidence',
    !leakedList.some((e) => e.title === 'Tenant A evidence'),
    `saw ${leakedList.length} items`,
  );

  // 8. Path traversal is refused for an *authenticated* caller too — the
  //    auth gate must not be the only thing standing between a user and the
  //    filesystem.
  for (const attempt of ['../../etc', '..\\..\\windows', '/workspace-secrets']) {
    const scan = await app.inject({
      method: 'POST',
      url: '/api/v1/scan',
      headers: { authorization: `Bearer ${token}` },
      payload: { path: attempt },
    });
    add(
      `scan rejects traversal ${JSON.stringify(attempt)}`,
      scan.statusCode >= 400,
      `status=${scan.statusCode}`,
    );
  }

  // 9. A legitimate in-root scan still works, so the checks above are not just
  //    rejecting everything.
  const okScan = await app.inject({
    method: 'POST',
    url: '/api/v1/scan',
    headers: { authorization: `Bearer ${token}` },
    payload: { path: '.' },
  });
  add(
    'authenticated in-root scan succeeds',
    okScan.statusCode === 200 && okScan.json().filesScanned > 0,
    `status=${okScan.statusCode} files=${okScan.json().filesScanned}`,
  );

  await app.close();

  let failed = 0;
  console.log('');
  console.log('Production posture checks');
  console.log('========================');
  for (const c of checks) {
    if (!c.ok) failed += 1;
    console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.label.padEnd(42)} ${c.detail ?? ''}`);
  }
  console.log('');
  console.log(`  ${checks.length - failed} passed, ${failed} failed`);
  console.log('');
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error('ERROR:', error.message);
  process.exit(1);
});