import { secretMatches } from "./secretCompare";

// ── Helpers ──────────────────────────────────────────────────────────────────

function pass(label: string): void {
  console.log(`  PASS [${label}]`);
}

function fail(label: string, msg: string): never {
  throw new Error(`FAIL [${label}]: ${msg}`);
}

function assertEqual<T>(a: T, b: T, label: string): void {
  if (a !== b) fail(label, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  pass(label);
}

// ── Tests ────────────────────────────────────────────────────────────────────

function testSecretMatches(): void {
  console.log("\nsecretMatches");

  assertEqual(secretMatches("s3cret", "s3cret"), true, "identical secrets match");
  assertEqual(secretMatches("s3cret", "s3creT"), false, "case difference does not match");
  assertEqual(secretMatches("s3cret", "wrong"), false, "different secret does not match");

  // The regression this guards: crypto.timingSafeEqual throws on unequal
  // buffer lengths. Hashing first means a wrong-length key returns false
  // instead of throwing (which would surface as a 500, not a 401).
  let threw = false;
  let shortResult = true;
  try {
    shortResult = secretMatches("x", "a-much-longer-configured-secret");
  } catch {
    threw = true;
  }
  assertEqual(threw, false, "shorter provided value does not throw");
  assertEqual(shortResult, false, "shorter provided value returns false");

  threw = false;
  let longResult = true;
  try {
    longResult = secretMatches("a-much-longer-provided-value", "x");
  } catch {
    threw = true;
  }
  assertEqual(threw, false, "longer provided value does not throw");
  assertEqual(longResult, false, "longer provided value returns false");

  // Empty strings are a real input (a missing header coerced to ''), and must
  // not accidentally match a configured secret.
  assertEqual(secretMatches("", "configured"), false, "empty provided does not match");
  assertEqual(secretMatches("", ""), true, "two empty strings do match");

  // Unicode must not corrupt the digest path.
  assertEqual(secretMatches("kéy-✓", "kéy-✓"), true, "unicode secrets match");
  assertEqual(secretMatches("kéy-✓", "key-✓"), false, "unicode near-miss does not match");
}

// ── Run all ──────────────────────────────────────────────────────────────────

testSecretMatches();

console.log("\nAll secret compare tests passed.\n");
