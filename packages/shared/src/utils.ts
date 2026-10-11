/** Small, dependency-free helpers used across every package. */

import { createHash, randomUUID } from 'node:crypto';

/** Stable, deterministic id from arbitrary parts. */
export function stableId(...parts: Array<string | number | undefined | null>): string {
  const hash = createHash('sha256');
  hash.update(parts.filter((p) => p !== undefined && p !== null).join('|'));
  return hash.digest('hex').slice(0, 16);
}

export function uuid(): string {
  return randomUUID();
}

/** Deterministic gap id: one gap per company+framework+article+question. */
export function gapId(
  companyId: string | undefined,
  frameworkId: string,
  articleId: string,
  questionId?: string,
): string {
  return stableId('gap', companyId, frameworkId, articleId, questionId);
}

export function clamp(value: number, min = 0, max = 100): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return clamp((part / whole) * 100, 0, 100);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
}

export function toDate(value: Date | string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function isoDate(date: Date | string | undefined): string | undefined {
  const d = toDate(date);
  return d ? d.toISOString().slice(0, 10) : undefined;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** `2026-08-02` -> `02/08/2026` for human readable documents. */
export function formatDateEU(date: Date | string | undefined): string {
  const d = toDate(date);
  if (!d) return '—';
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

export function formatDateISO(date: Date | string | undefined): string {
  return isoDate(date) ?? '—';
}

export function formatEuro(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number | undefined, decimals = 0): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function titleCase(input: string): string {
  return input.replace(/[-_.]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Compact human readable id like `GAP-4F2A`. */
export function shortCode(prefix: string, id: string): string {
  return `${prefix}-${id.slice(0, 4).toUpperCase()}`;
}

export function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function safeJsonParse<T>(input: string, fallback: T): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

/** Extract the first ```json fenced block, tolerating prose around it. */
export function extractJsonBlock(text: string): string | undefined {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) return undefined;
  const open = candidate[start] as '[' | '{';
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return candidate.slice(start, i + 1);
    }
  }
  return undefined;
}

export function checksum(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function relativePath(root: string, file: string): string {
  const normalizedRoot = root.replace(/\\/g, '/').replace(/\/+$/, '');
  const normalizedFile = file.replace(/\\/g, '/');
  if (normalizedFile.startsWith(normalizedRoot)) {
    return normalizedFile.slice(normalizedRoot.length).replace(/^\//, '') || '.';
  }
  return normalizedFile;
}

export function groupBy<T, K extends string>(items: T[], key: (item: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of items) {
    const k = key(item);
    (out[k] ||= []).push(item);
  }
  return out;
}

export function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

export function average(values: number[]): number {
  return values.length ? sum(values) / values.length : 0;
}