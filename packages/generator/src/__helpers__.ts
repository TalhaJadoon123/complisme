/** Small helpers shared by the generator tests. */

/** Replace obvious identifiers in a string, so assertions can reason about text. */
export function anonymise(value: string): string {
  return value
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]');
}