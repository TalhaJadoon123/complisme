/**
 * Adversarial auth sweep: in a closed (production) deployment, call EVERY
 * registered route with no credentials and assert nothing leaks.
 *
 * There is no global authentication gate — the onRequest hook only parses
 * credentials and never rejects. Safety therefore depends on every handler
 * remembering to check. This sweep proves whether that currently holds by
 * walking Fastify's own route tree rather than trusting a code reading, so a
 * route added later without a check is caught automatically.
 */
const crypto = require('node:crypto');

process.env.NODE_ENV = 'production';
process.env.AUTH_SECRET = crypto.randomBytes(32).toString('hex');
delete process.env.API_STATIC_KEYS;

const { buildServer } = require('../dist/index.js');

/**
 * Routes the API exposes on purpose. Mirrored from public-routes.js so this
 * sweep and sweep-public.js cannot disagree about what "public" means.
 */
const { isPublicPath, routeKey } = require('./public-routes.js');

/** Placeholders so path params resolve; values are deliberately meaningless. */
const SEED = {
  id: 'nonexistent-company',
  evidenceId: 'nonexistent-evidence',
};

/** Bodies that satisfy the loosest plausible schema, so a 400 never masks a 200. */
const BODIES = {
  'POST /api/v1/assess': { profile: { name: 'Sweep BV', country: 'NL', sector: 'x', employees: 1, revenueEUR: 1 } },
  'POST /api/v1/assess/preview': { frameworkId: 'gdpr' },
  'POST /api/v1/ai/ask': { question: 'What are our GDPR obligations?' },
  'POST /api/v1/github/issues': {},
  'POST /api/v1/scan': { path: '.' },
  'POST /api/v1/generate': { frameworkId: 'gdpr', articleId: 'art-30-ropa', format: 'pdf' },
  'POST /api/v1/documents': { frameworkId: 'gdpr' },
  'PUT /api/v1/companies/nonexistent-company': { name: 'Sweep', country: 'NL', sector: 'x', employees: 1, revenueEUR: 1 },
  'PATCH /api/v1/gaps/nonexistent-gap': { status: 'resolved' },
  'POST /api/v1/subscription': { plan: 'starter' },
};

/** Flatten Fastify's boxed route tree into "METHOD /full/path" strings. */
function flattenRoutes(app) {
  const out = [];
  const stack = [];

  for (const raw of app.printRoutes({ commonPrefix: false }).split('\n')) {
    if (!raw.trim()) continue;
    const m = raw.match(/^((?:[^\S\n][^\S\n][^\S\n][^\S\n]|.)*?)(?:├── |└── )(.*)$/);
    if (!m) continue;

    // Depth = number of 4-column indent groups before the connector.
    let indentText = m[1];
    let depth = 0;
    while (indentText.length >= 4) {
      depth += 1;
      // Consume one indent group (a vertical bar plus three spaces, or four spaces).
      indentText = indentText.slice(4);
    }
    if (indentText.trim() !== '') {
      // Trailing partial indent (no connector) still advances the depth.
      depth += Math.ceil(indentText.length / 4);
    }

    const rest = m[2];
    const segMatch = rest.match(/^(\S*)\s*\(([^)]*)\)/);
    if (!segMatch) continue;
    const segment = segMatch[1];
    const methods = segMatch[2].split(',').map((s) => s.trim()).filter(Boolean);

    stack.length = depth;
    stack[depth] = segment;
    const full = stack.slice(0, depth + 1).join('');

    for (const method of methods) {
      out.push({ route: `${method.toUpperCase()} ${full}`, method: method.toUpperCase(), url: full });
    }
  }
  return out;
}

function sample(url) {
  return url.replace(/:([A-Za-z0-9_]+)/g, (m, name) => SEED[name] ?? 'sweep-value');
}

async function main() {
  const app = await buildServer({ logger: false });
  await app.ready();

  const routes = flattenRoutes(app);
  const privateRoutes = routes.filter((r) => !isPublicPath(r.url) && r.url !== '*');

  console.log('Unauthenticated route sweep (production, closed deployment)');
  console.log('==========================================================');
  console.log(`routes in tree : ${routes.length}`);
  console.log(`public         : ${routes.length - privateRoutes.length}`);
  console.log(`private (swept): ${privateRoutes.length}\n`);

  const leaks = [];

  for (const { route, method, url } of privateRoutes) {
    const target = sample(url);
    let response;
    try {
      response = await app.inject({ method, url: target, payload: BODIES[route] ?? {} });
    } catch (error) {
      leaks.push({ route, target, status: 'THREW', detail: String(error.message).slice(0, 80) });
      continue;
    }

    const status = response.statusCode;
    if (status >= 200 && status < 300) {
      leaks.push({ route, target, status, detail: String(response.body ?? '').slice(0, 100) });
    } else {
      console.log(`  ${String(status).padEnd(4)} ${route}`);
    }
  }

  console.log(`\nleaks: ${leaks.length}`);
  if (leaks.length) {
    console.log('');
    for (const l of leaks) {
      console.log(`  LEAK  ${String(l.status).padEnd(5)} ${l.route}`);
      console.log(`        ${l.target}`);
      console.log(`        ${l.detail}`);
    }
    console.log('\nFAIL: a private route answered an unauthenticated caller with 2xx.');
  } else {
    console.log('\nPASS: every private route refused an unauthenticated caller.');
  }
  console.log('');

  await app.close();
  process.exit(leaks.length ? 1 : 0);
}

main().catch((error) => {
  console.error('ERROR:', error && error.message);
  process.exit(1);
});
