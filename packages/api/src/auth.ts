/**
 * Password hashing and token signing.
 *
 * scrypt for passwords (no external dependency, memory-hard), HMAC-SHA256 for
 * session tokens and API keys. Both are implemented on node:crypto.
 */

import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;
const SCRYPT_COST = 16_384;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_COST }).toString('hex');
  return `scrypt$${SCRYPT_COST}$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, cost, salt, expected] = stored.split('$');
    if (scheme !== 'scrypt' || !salt || !expected) return false;
    const derived = scryptSync(password, salt, expected.length / 2, { N: Number(cost) });
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (derived.length !== expectedBuffer.length) return false;
    return timingSafeEqual(derived, expectedBuffer);
  } catch {
    return false;
  }
}

/** Mint a signed session token: `base64url(payload).base64url(hmac)`. */
export function signToken(payload: Record<string, unknown>, secret: string, ttlSeconds = 60 * 60 * 24 * 7): string {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const encoded = base64url(JSON.stringify(body));
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyToken<T = Record<string, unknown>>(token: string, secret: string): T | null {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  const expected = createHmac('sha256', secret).update(encoded).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as { exp?: number };
    if (body.exp && body.exp * 1000 < Date.now()) return null;
    return body as T;
  } catch {
    return null;
  }
}

/** Generate an API key: `csm_<random>`. Only the hash is stored. */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const raw = randomBytes(24).toString('base64url');
  const key = `csm_${raw}`;
  return { key, hash: hashApiKey(key), prefix: key.slice(0, 12) };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Constant-time membership test.
 *
 * A plain `Array.includes` short-circuits on the first byte that differs, which
 * lets an attacker who can time responses recover a valid key byte by byte.
 * Every candidate is compared in full regardless.
 */
export function matchesAnyConstantTime(candidate: string, candidates: string[]): boolean {
  if (!candidate || candidates.length === 0) return false;
  const given = Buffer.from(candidate);
  let matched = 0;
  for (const candidateValue of candidates) {
    const expected = Buffer.from(candidateValue);
    // timingSafeEqual throws on length mismatch, which would itself be a timing
    // oracle, so compare a padded buffer instead.
    const length = Math.max(given.length, expected.length);
    const a = Buffer.alloc(length);
    const b = Buffer.alloc(length);
    given.copy(a);
    expected.copy(b);
    matched |= timingSafeEqual(a, b) ? 1 : 0;
  }
  return matched === 1;
}

export function base64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

export interface AuthSecret {
  secret: string;
  isDefault: boolean;
}

/** Read the auth secret from the environment, warning when it is the default. */
export function readAuthSecret(env: NodeJS.ProcessEnv = process.env): AuthSecret {
  const secret = env.AUTH_SECRET ?? 'change-me-development-secret-please-32-bytes-min';
  return { secret, isDefault: secret === 'change-me-development-secret-please-32-bytes-min' };
}

/** Basic password strength check used at signup. */
export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 8) issues.push('at least 8 characters');
  if (!/[a-zA-Z]/.test(password)) issues.push('at least one letter');
  if (!/[0-9]/.test(password)) issues.push('at least one number');
  return issues;
}