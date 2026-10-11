/**
 * Redaction: minimise what leaves the customer's machine.
 *
 * Even with BYOK, company data goes to a third-party API. This module strips
 * direct identifiers (emails, phones, names, VAT numbers) before any prompt is
 * built, and replaces them with stable tokens so the model can still reason
 * about the shape of the data ("customer_1@example.invalid") without seeing it.
 */

import { checksum, stableId } from '@complisme/shared';

/**
 * Order matters: the IP pattern must run before the phone pattern, otherwise
 * `192.168.1.10` is consumed as a phone number.
 */
const PATTERNS: Array<{ name: string; re: RegExp; replacement: string }> = [
  { name: 'email', re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[email]' },
  { name: 'url', re: /https?:\/\/[^\s'"<>)]+/g, replacement: '[url]' },
  { name: 'ip', re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: '[ip]' },
  { name: 'card', re: /\b(?:\d[ -]?){13,19}\b/g, replacement: '[card]' },
  { name: 'iban', re: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, replacement: '[iban]' },
  { name: 'ssn', re: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[national-id]' },
  { name: 'vat', re: /\b(?:VAT|BTW|USt)[-\s]?[A-Z]{2}\s?\d{2,12}\b/gi, replacement: '[vat-id]' },
  { name: 'postcode', re: /\b\d{4}\s?[A-Z]{2}\b/g, replacement: '[postcode]' },
  { name: 'phone', re: /\+?\d[\d\s().-]{7,}\d/g, replacement: '[phone]' },
];

export interface RedactionResult {
  text: string;
  /** Which kinds of identifiers were found. */
  categories: string[];
  count: number;
}

/** Replace direct identifiers with typed placeholders. */
export function redact(input: string): RedactionResult {
  const categories = new Set<string>();
  let count = 0;
  let text = input;

  for (const pattern of PATTERNS) {
    text = text.replace(pattern.re, () => {
      categories.add(pattern.name);
      count += 1;
      return pattern.replacement;
    });
  }

  return { text, categories: [...categories], count };
}

/**
 * Replace a company's real name with a stable pseudonym so the prompt is
 * readable ("the company") without disclosing who it is.
 */
export function pseudonymise(name: string | undefined): string {
  if (!name) return 'the company';
  return `Company ${checksum(name).slice(0, 6).toUpperCase()}`;
}

/** Stable token for an individual record, e.g. `subject_4f2a1c`. */
export function subjectToken(index: number, salt: string): string {
  return `subject_${stableId(salt, String(index)).slice(0, 6)}`;
}

/** Clamp a structure to a token budget so a prompt never blows the context. */
export function truncate(value: string, maxChars = 12_000): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n… [truncated, ${value.length - maxChars} characters omitted]`;
}