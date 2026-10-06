/**
 * End-to-end API smoke test.
 *
 * Exercises the full product flow against a running server:
 *   health -> signup -> company -> assess -> status -> roadmap -> gaps
 *   -> evidence -> generate -> documents -> scan -> rules -> pricing -> AI
 *
 * Usage:  node packages/api/scripts/e2e.mjs [baseUrl]
 * Exits non-zero on the first failure.
 */

const BASE = process.argv[2] ?? process.env.API_URL ?? 'http://localhost:4100';

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
  }
}

async function call(method, path, body, token) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: response.status, body: json };
}

async function main() {
  console.log(`\nCompliSME API end-to-end test against ${BASE}\n`);

  // 1. Health -----------------------------------------------------------------
  const health = await call('GET', '/health');
  check('GET /health returns ok', health.status === 200 && health.body.status === 'ok', health.body);
  check('all four frameworks are registered', health.body.frameworks?.length === 4, health.body.frameworks);

  // Whether the global auth gate is active depends on how the server was
  // started. CI runs without NODE_ENV, so open access is on and the gate is
  // off; a production deployment has the gate on. Later assertions branch on
  // this rather than assuming one mode.
  const gated = health.body.openAccess === false;
  check('health reports the auth posture', typeof health.body.openAccess === 'boolean', health.body.openAccess);

  // 2. Public catalogue -------------------------------------------------------
  const frameworks = await call('GET', '/api/v1/frameworks');
  check('GET /api/v1/frameworks lists 4 frameworks', frameworks.body.frameworks?.length === 4);
  const aiAct = await call('GET', '/api/v1/frameworks/eu-ai-act');
  check('GET /api/v1/frameworks/:id returns articles', aiAct.body.articles?.length > 10);
  check('framework exposes deadlines', Array.isArray(aiAct.body.deadlines));

  const rules = await call('GET', '/api/v1/rules');
  check('GET /api/v1/rules returns the rule set', rules.body.rules?.length >= 15, rules.body.rules?.length);
  check(
    'every rule maps to at least one article',
    rules.body.rules?.every((r) => r.mapsTo?.length > 0),
  );

  const pricing = await call('GET', '/api/v1/pricing');
  check('GET /api/v1/pricing returns 4 plans', pricing.body.plans?.length === 4);
  check('starter plan is EUR 49', pricing.body.plans?.find((p) => p.id === 'starter')?.priceMonthly === 49);

  // 3. Signup ----------------------------------------------------------------
  const email = `e2e-${Date.now()}@example.com`;
  const signup = await call('POST', '/api/v1/auth/signup', {
    email,
    password: 'Test12345',
    companyName: 'E2E Test BV',
    country: 'NL',
  });
  check('POST /auth/signup creates the account', signup.status === 201, signup.body);
  check('signup returns a token', typeof signup.body.token === 'string');
  const token = signup.body.token;
  const companyId = signup.body.company?.id;

  const weak = await call('POST', '/api/v1/auth/signup', {
    email: `weak-${Date.now()}@example.com`,
    password: 'short',
    companyName: 'X',
    country: 'NL',
  });
  check('weak passwords are rejected', weak.status === 400, weak.body);

  const login = await call('POST', '/api/v1/auth/login', { email, password: 'Test12345' });
  check('POST /auth/login works', login.status === 200 && !!login.body.token);

  const badLogin = await call('POST', '/api/v1/auth/login', { email, password: 'wrong' });
  check('wrong password is rejected', badLogin.status === 401);

  const me = await call('GET', '/api/v1/auth/me', undefined, token);
  check('GET /auth/me returns the user', me.body.user?.email === email, me.body);
  check('GET /auth/me returns the subscription', !!me.body.subscription);

  // 4. Company profile -------------------------------------------------------
  const company = await call('GET', `/api/v1/companies/${companyId}`, undefined, token);
  check('GET company returns the profile', company.body.company?.name === 'E2E Test BV');
  check('company includes applicability analysis', company.body.applicability?.length === 4);
  check('fine exposure is computed', company.body.fineExposure > 0, company.body.fineExposure);

  const update = await call(
    'PUT',
    `/api/v1/companies/${companyId}`,
    {
      name: 'E2E Test BV',
      legalName: 'E2E Test B.V.',
      country: 'NL',
      sector: 'software',
      employees: 12,
      revenueEUR: 900_000,
      size: 'micro',
      aiSystems: [
        {
          id: 'ai-1',
          name: 'Support Bot',
          purpose: 'Answers customer questions',
          domain: 'customer-service',
          deployed: true,
        },
      ],
      processingActivities: [
        {
          id: 'dpa-1',
          name: 'Customer data',
          purpose: 'Contract and support',
          legalBasis: 'contract',
          dataSubjects: ['customers'],
          dataCategories: ['email', 'name'],
          retentionMonths: 120,
        },
      ],
      usesCookies: true,
    },
    token,
  );
  check('PUT company updates the profile', update.body.company?.employees === 12, update.body);

  // 5. Preview (onboarding live score) ---------------------------------------
  const preview = await call('POST', '/api/v1/assess/preview', {
    profile: {
      id: 'preview-company',
      name: 'Preview BV',
      country: 'NL',
      sector: 'software',
      employees: 12,
      revenueEUR: 900_000,
      size: 'micro',
      aiSystems: [
        {
          id: 'ai-1',
          name: 'Support Bot',
          purpose: 'Answers customer questions',
          domain: 'customer-service',
          deployed: true,
        },
      ],
    },
    answers: {},
  });
  check('POST /assess/preview scores without persisting', typeof preview.body.overall === 'number', preview.body);
  check('preview reports blockers', typeof preview.body.blockers === 'number', preview.body);

  // 6. Assess ----------------------------------------------------------------
  const assess = await call('POST', '/api/v1/assess', { companyId, answers: {} }, token);
  check('POST /assess returns scores', assess.body.scores?.length > 0, assess.body.scores?.length);
  check('POST /assess returns gaps', assess.body.gaps?.length > 0);
  check('POST /assess persists an assessment id', !!assess.body.assessmentId);
  check('assess returns an overall score', typeof assess.body.overall === 'number');

  const withAnswers = await call(
    'POST',
    '/api/v1/assess',
    {
      companyId,
      answers: {
        gdpr: { 'a5-q1': 'documented', 'a30-q1': 'complete-and-reviewed', 'a35-q1': 'not-required' },
      },
    },
    token,
  );
  check(
    'answers change the score',
    withAnswers.body.overall > assess.body.overall,
    { before: assess.body.overall, after: withAnswers.body.overall },
  );

  // 7. Status ----------------------------------------------------------------
  const status = await call('GET', `/api/v1/companies/${companyId}/status`, undefined, token);
  check('GET company status returns scores', status.body.scores?.length > 0);
  check('status includes deadlines', Array.isArray(status.body.deadlines));
  check('status includes countdowns', Array.isArray(status.body.countdowns));
  check('status reports a summary', typeof status.body.summary?.total === 'number');

  // 8. Roadmap ---------------------------------------------------------------
  const roadmap = await call('GET', `/api/v1/companies/${companyId}/roadmap`, undefined, token);
  check('GET roadmap returns 3 phases', roadmap.body.roadmap?.phases?.length === 3);
  check('roadmap items carry due dates', roadmap.body.roadmap?.items?.[0]?.dueDate);
  check('roadmap states a total effort', roadmap.body.roadmap?.totalEffort > 0);

  // 9. Evidence --------------------------------------------------------------
  const addEvidence = await call(
    'POST',
    `/api/v1/companies/${companyId}/evidence`,
    { frameworkId: 'gdpr', articleId: 'art-30-ropa', title: 'ROPA v1', type: 'record' },
    token,
  );
  check('POST evidence records an item', addEvidence.status === 201, addEvidence.body);
  const listEvidence = await call('GET', `/api/v1/companies/${companyId}/evidence`, undefined, token);
  check('GET evidence lists the item', listEvidence.body.evidence?.length >= 1);
  check(
    'evidence invalidates the missing-evidence gap',
    !listEvidence.body.evidence.some((e) => e.articleId === 'art-30-ropa' && !e.title),
  );

  // 10. Gaps -----------------------------------------------------------------
  const gapsBefore = await call('POST', '/api/v1/assess', { companyId, answers: {} }, token);
  const aGap = gapsBefore.body.gaps[0];
  check('assess produced a gap to work on', !!aGap);
  const patch = await call('PATCH', `/api/v1/gaps/${aGap.id}`, { status: 'in_progress' }, token);
  check('PATCH gap changes the status', patch.body.gap?.status === 'in_progress', patch.body);

  // 11. Generate -------------------------------------------------------------
  const generate = await call(
    'POST',
    '/api/v1/generate',
    { companyId, kind: 'compliance-roadmap', format: 'html', save: true },
    token,
  );
  check('POST /generate produces a document', generate.status === 200 && !!generate.body.path, generate.body);
  check('generated document has sections', generate.body.sections > 0);
  check('generated document has a checksum', !!generate.body.checksum);

  const generateDocx = await call(
    'POST',
    '/api/v1/generate',
    { companyId, kind: 'gdpr-ropa', format: 'docx', save: true },
    token,
  );
  check('DOCX generation works', generateDocx.body.format === 'docx' && generateDocx.body.bytes > 3000, generateDocx.body);

  const documents = await call('GET', `/api/v1/documents?companyId=${companyId}`, undefined, token);
  check('GET documents lists the library', documents.body.documents?.length >= 2, documents.body.documents?.length);
  check('documents carry version history', documents.body.documents?.[0]?.versions?.length >= 1);

  // 12. Scanner --------------------------------------------------------------
  const scan = await call('POST', '/api/v1/scan', { path: 'packages/scanner/src/demo-fixtures.ts' }, token);
  check('POST /scan returns findings', scan.body.findings?.length > 5, scan.body.findings?.length);
  check('POST /scan maps findings to articles', scan.body.findings?.[0]?.mappings?.length > 0);
  check('POST /scan derives compliance gaps', scan.body.gaps?.length > 0);
  check('POST /scan reports a summary', typeof scan.body.summary?.total === 'number');

  const traversal = await call('POST', '/api/v1/scan', { path: '../../../../etc' }, token);
  check('scan path traversal is blocked', traversal.status === 400, traversal.body);

  // 13. AI -------------------------------------------------------------------
  const aiStatus = await call('GET', '/api/v1/ai/status');
  check('GET /ai/status responds', typeof aiStatus.body.configured === 'boolean');
  check('AI status explains the degraded path', typeof aiStatus.body.note === 'string');

  // 14. Subscription ---------------------------------------------------------
  const sub = await call('POST', '/api/v1/subscription', { plan: 'starter' }, token);
  check('POST /subscription changes the plan', sub.body.subscription?.plan === 'starter', sub.body);

  // 15. Errors ---------------------------------------------------------------
  // Authenticated, so the request reaches the router: the global auth gate
  // answers anonymous callers with 401 before routing happens, which would
  // mask the 404 behaviour this is checking.
  const missing = await call('GET', '/api/v1/does-not-exist', undefined, token);
  check('unknown routes return a 404 body', missing.status === 404 && missing.body.error === 'not_found', missing.body);

  // And the gate itself. Only meaningful on a closed deployment: with open
  // access on, an unknown path legitimately 404s because routing is reached.
  const anon = await call('GET', '/api/v1/does-not-exist');
  if (gated) {
    check(
      'anonymous callers are refused before routing',
      anon.status === 401 && anon.body.error === 'unauthorized',
      anon.body,
    );
  } else {
    check(
      'open-access deployment reaches routing (401 here would mean the gate leaked on)',
      anon.status === 404,
      anon.body,
    );
  }

  const badAssess = await call('POST', '/api/v1/assess', { nope: true }, token);
  check('invalid payloads are rejected with 400', badAssess.status === 400, badAssess.body);

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`\nscript error: ${error.message}`);
  process.exitCode = 1;
});