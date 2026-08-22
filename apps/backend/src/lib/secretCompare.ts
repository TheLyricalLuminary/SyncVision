import crypto from 'crypto';

/**
 * Constant-time secret comparison.
 *
 * Both sides are hashed to a fixed 32-byte digest before comparing, for two
 * reasons:
 *   1. crypto.timingSafeEqual THROWS on unequal buffer lengths. Comparing raw
 *      inputs would turn any wrong-length secret into a 500 instead of a 401,
 *      and the throw itself would leak length.
 *   2. Hashing first keeps the comparison constant-time with respect to the
 *      provided value's length as well as its content.
 *
 * Do not "simplify" this to a raw timingSafeEqual on the inputs — see
 * secretCompare.test.ts.
 */
export function secretMatches(provided: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}
