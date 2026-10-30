import { createHash, timingSafeEqual } from 'node:crypto';

/** Compares a presented secret with the configured one in constant time. */
export function tokenMatches(presented: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(presented), digest(expected));
}
