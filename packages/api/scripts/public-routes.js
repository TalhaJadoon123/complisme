/**
 * The API's public allowlist, shared by the two security sweeps.
 *
 * This is a mirror of `PUBLIC_PATHS` in packages/api/src/server.ts. It lives in
 * one place so the sweeps cannot drift apart: sweep-unauthenticated.js must not
 * flag a route the API deliberately exposes, and sweep-public.js must cover
 * every route it does. If you change the allowlist in the server, change it here.
 */
'use strict';

const PUBLIC_PATHS = [
  '/health',
  '/api/v1/auth/signup',
  '/api/v1/auth/login',
  '/api/v1/frameworks',
  '/api/v1/frameworks/gdpr',
  '/api/v1/frameworks/eu-ai-act',
  '/api/v1/rules',
  '/api/v1/pricing',
  '/api/v1/ai/status',
  // Pre-signup onboarding trial: scores a caller-supplied profile, persists
  // nothing, and carries its own rate budget.
  '/api/v1/assess/preview',
];

/** Framework definitions are public by prefix, e.g. /api/v1/frameworks/csrd. */
const PUBLIC_PREFIXES = ['/api/v1/frameworks/'];

function isPublicPath(url) {
  const path = url.split('?')[0];
  if (PUBLIC_PATHS.includes(path)) return true;
  return PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/** "GET /health" style key for a method+path pair. */
function routeKey(method, url) {
  return `${String(method).toUpperCase()} ${url.split('?')[0]}`;
}

module.exports = { PUBLIC_PATHS, PUBLIC_PREFIXES, isPublicPath, routeKey };