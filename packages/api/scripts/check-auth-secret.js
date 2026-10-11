// Verify the production safety guard: the API must refuse to boot with the
// built-in development AUTH_SECRET when NODE_ENV=production.
process.env.NODE_ENV = 'production';
process.env.AUTH_SECRET = 'change-me-development-secret-please-32-bytes-min';
delete process.env.API_STATIC_KEYS;

const { buildServer } = require('../dist/index.js');

buildServer({ logger: false })
  .then((app) => {
    console.log('FAIL: the server started with the default AUTH_SECRET in production');
    return app.close().then(() => process.exit(1));
  })
  .catch((error) => {
    const refused = /AUTH_SECRET/.test(error.message) && /production/i.test(error.message);
    console.log(
      refused
        ? `PASS: refused to start — ${error.message}`
        : `FAIL: refused for the wrong reason — ${error.message}`,
    );
    process.exit(refused ? 0 : 1);
  });
