/**
 * Companion to sweep-unauthenticated.js: prove the authentication gate did not
 * lock out the endpoints that are supposed to be reachable anonymously.
 *
 * A gate that rejects everything is just as broken as no gate at all — the
 * Docker HEALTHCHECK, the marketing page and self-service signup all depend on
 * these answering without credentials.
 *
 * The expected list comes from public-routes.js, which also drives the
 * unauthenticated sweep. Because both read the same list, the two checks
 * reconcile: a route added to the server's allowlist without being swept as
 * public fails here, and a route in the list that the server actually gates
 * fails too.
 */
process.env.NODE_ENV = 'production';
process.env.AUTH_SECRET = require('node:crypto').randomBytes(32).toString('hex');
delete process.env.API_STATIC_KEYS;

const { buildServer } = require('../dist/index.js');
const { PUBLIC_PATHS } = require('./public-routes.js');

/** Why each public route must stay reachable, and the status it must return. */
const EXPECTED = {
  '/health': { method: 'GET', status: 200, why: 'Docker HEALTHCHECK + load balancer probe' },
  '/api/v1/auth/signup': { method: 'POST', status: 201, why: 'self-service signup' },
  '/api/v1/auth/login': { method: 'POST', status: 401, why: 'login must answer (bad credentials = 401)' },
  '/api/v1/frameworks': { method: 'GET', status: 200, why: 'marketing site lists frameworks' },
  '/api/v1/frameworks/gdpr': { method: 'GET', status: 200, why: 'public framework definition' },
  '/api/v1/frameworks/eu-ai-act': { method: 'GET', status: 200, why: 'public framework definition' },
  '/api/v1/rules': { method: 'GET', status: 200, why: 'public detection rules' },
  '/api/v1/pricing': { method: 'GET', status: 200, why: 'public pricing page' },
  '/api/v1/ai/status': { method: 'GET', status: 200, why: 'UI shows whether AI is available' },
  '/api/v1/assess/preview': {
    method: 'POST',
    status: 200,
    why: 'pre-signup trial score (must not persist, must be rate limited)',
    payload: {
      profile: { name: 'Public Reach BV', country: 'NL', sector: 'retail', employees: 12, revenueEUR: 900_000 },
    },
  },
};

function payloadFor(path) {
  if (path === '/api/v1/auth/signup') {
    return {
      email: `pub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.eu`,
      password: 'Test12345',
      companyName: 'Public Reach BV',
      country: 'NL',
    };
  }
  if (path === '/api/v1/auth/login') {
    return { email: 'nobody@example.eu', password: 'Wrong12345' };
  }
  return EXPECTED[path] && EXPECTED[path].payload;
}

async function main() {
  const app = await buildServer({ logger: false });
  await app.ready();

  console.log('Public route reachability (production, no credentials)');
  console.log('======================================================\n');

  let failed = 0;

  for (const path of PUBLIC_PATHS) {
    const spec = EXPECTED[path];
    if (!spec) {
      console.log(`  FAIL  ??    ${path.padEnd(30)} listed as public but has no expectation`);
      failed += 1;
      continue;
    }

    const response = await app.inject({
      method: spec.method,
      url: path,
      payload: payloadFor(path),
    });
    const ok = response.statusCode === spec.status;
    if (!ok) failed += 1;
    console.log(
      `  ${ok ? 'PASS' : 'FAIL'}  ${String(response.statusCode).padEnd(4)} ${spec.method.padEnd(5)} ${path.padEnd(30)} ${spec.why}`,
    );
  }

  // CORS preflight must never require credentials.
  const preflight = await app.inject({
    method: 'OPTIONS',
    url: '/api/v1/documents',
    headers: { origin: 'https://complisme.eu', 'access-control-request-method': 'GET' },
  });
  const preflightOk = preflight.statusCode < 400;
  if (!preflightOk) failed += 1;
  console.log(
    `  ${preflightOk ? 'PASS' : 'FAIL'}  ${String(preflight.statusCode).padEnd(4)} OPTIONS /api/v1/documents          CORS preflight needs no credential`,
  );

  // The trial endpoint runs the engine on anonymous input, so it must be
  // rate limited. Hammer it past its budget and expect a 429.
  const answers = [];
  for (let i = 0; i < 40; i += 1) {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/assess/preview',
      payload: { profile: { name: 'Flood BV', country: 'NL', sector: 'retail', employees: 5, revenueEUR: 100_000 } },
    });
    answers.push(r.statusCode);
  }
  const limited = answers.includes(429);
  if (!limited) failed += 1;
  console.log(
    `  ${limited ? 'PASS' : 'FAIL'}  ${answers.filter((s) => s === 429).length}   POST /api/v1/assess/preview          anonymous engine runs are rate limited`,
  );

  const total = PUBLIC_PATHS.length + 2;
  console.log(`\n  ${total - failed} passed, ${failed} failed\n`);
  await app.close();
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error('ERROR:', error && error.message);
  process.exit(1);
});