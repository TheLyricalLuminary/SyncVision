/**
 * narrativeDictionary.test.ts
 *
 * Permanent validator suite for NARRATIVE_DICTIONARY.
 * Runs on every commit/PR via CI and fails the build on any hard failure.
 *
 * CHECK 1 — Completeness:   every brief × tier cell exists and has exactly PHRASES_PER_POOL phrases.
 * CHECK 2 — Uniqueness:     no exact or near-duplicate (Jaccard ≥ NEAR_DUP_THRESHOLD) within each pool;
 *                            cross-pool exact matches are warned (not hard-failed).
 * CHECK 3 — Overclaim lint: no timestamps, hardcoded BPM, key signatures, bar counts, or unverifiable
 *                            scene-specific claims. Hard-fails on any match.
 * CHECK 4 — FAIL lane balance: verifies the 2/2/2 (emotional / structural / rights) positional
 *                            convention holds for every FAIL pool. Reports fragility of positional-only
 *                            tagging.
 *
 * DO NOT modify NARRATIVE_DICTIONARY content in this file. This suite only reads and validates.
 */

import {
  NARRATIVE_DICTIONARY,
  tierFromScore,
  deterministicIndex,
} from './narrativeDictionary';
import type { BriefPool } from './narrativeDictionary';

// ─── Configuration ────────────────────────────────────────────────────────────

/** Expected number of phrases in every brief × tier cell. */
const PHRASES_PER_POOL = 6;

/**
 * Jaccard token-overlap threshold for near-duplicate detection.
 * Two phrases with similarity >= this value are flagged.
 * Tune this constant if the threshold produces false positives.
 */
const NEAR_DUP_THRESHOLD = 0.80;

/**
 * FAIL pool positions map to lanes by convention (positional-only, no explicit tag).
 * Indices [0,1] = emotional-mismatch, [2,3] = structural-conflict, [4,5] = rights-friction.
 * This is a FRAGILITY — see CHECK 4 report.
 */
const FAIL_LANE_POSITIONS: Record<'emotional' | 'structural' | 'rights', [number, number]> = {
  emotional:  [0, 1],
  structural: [2, 3],
  rights:     [4, 5],
};

// ─── OVERCLAIM_PATTERNS ───────────────────────────────────────────────────────
// Each entry names a forbidden pattern with a reason string.
// All patterns are auditable here — no check is hidden in procedural code.

const OVERCLAIM_PATTERNS: Array<{
  name:    string;
  pattern: RegExp;
  reason:  string;
}> = [
  {
    name:    'TIMESTAMP_MMSS',
    // Matches time references like 0:08, 1:42, 2:47.
    // Phrases must not reference specific moments the engine cannot verify.
    pattern: /\b\d{1,2}:\d{2}\b/,
    reason:  'MM:SS timestamp references a structural moment the engine cannot verify for an arbitrary track',
  },
  {
    name:    'TEMPO_BPM_HARDCODED',
    // Matches hardcoded numeric BPM values like "92 BPM" or "118BPM".
    // Note: {tempo} substitution placeholders do NOT match this pattern (no leading digits).
    // The {tempo} pattern is engine-provided (verified value) and is authorized.
    pattern: /\b\d{2,3}\s?bpm\b/i,
    reason:  'Hardcoded BPM value is an invented tempo claim; use {tempo} substitution for engine-verified values',
  },
  {
    name:    'BEATS_PER_MINUTE',
    pattern: /beats per minute/i,
    reason:  'Tempo claim in long form',
  },
  {
    name:    'KEY_SIGNATURE',
    // Matches specific key names: "A minor", "C# major", "Bb maj" etc.
    // Does NOT match generic "major-key" or "minor-seventh" (no [A-G] letter precedes them).
    // Case-sensitive on [A-G] to avoid matching "a major label" or "c minor chord".
    pattern: /\b[A-G][#b♯♭]?\s*(major|minor|maj|min)\b/,
    reason:  'Key/mode name references a specific tonal centre the engine cannot verify',
  },
  {
    name:    'IN_THE_KEY_OF',
    pattern: /in the key of/i,
    reason:  'Key signature claim',
  },
  {
    name:    'BAR_COUNT_NUMERIC',
    // Matches "8 bars", "16-bar", "32 measures" etc.
    // Spelled-out counts ("sixteen bars") are not caught — this targets numeric claims only.
    pattern: /\b\d+\s*-?\s*(bar|measure)s?\b/i,
    reason:  'Numeric bar/measure count is a structural specificity the engine cannot verify',
  },
];

/**
 * SCENE_SPECIFIC_KEYWORDS — phrases containing these are hard-failed.
 * These are unverifiable scene-specific claims that assume knowledge the engine does not have.
 * Expand this list as new overclaim patterns surface in phrase authoring.
 */
const SCENE_SPECIFIC_KEYWORDS: string[] = [
  'the actor',         // assumes knowledge of on-screen performance
  'the dialogue says', // assumes verbatim dialogue content
  'when the camera',   // assumes cinematography decisions
  'the explosion',     // assumes specific scene events
  // Add new patterns here with a comment explaining the class of overclaim
];

// ─── Keyword heuristics for FAIL lane identification (CHECK 4) ────────────────
// These patterns are HEURISTIC — they inform the lane-balance analysis but
// the ground truth is positional ordering (see FAIL_LANE_POSITIONS above).
const LANE_HEURISTICS: Record<'emotional' | 'structural' | 'rights', RegExp[]> = {
  emotional: [
    /\bvalence\b/i,
    /\barousal\b/i,
    /\bdominance\b/i,
    /wrong (?:emotional|dimension|register)/i,
    /dimensional misread/i,
    /emotional dimension/i,
    /emotional axis/i,
  ],
  structural: [
    /button ending/i,
    /no extended mix/i,
    /structural conflict/i,
    /verse[- ]chorus/i,
    /pop.?song shape/i,
    /arrangement.*(?:wrong|conflict|mismatch)/i,
    /tempo change/i,
    /hard stop/i,
    /does not loop/i,
    /cue runs \d/i,
  ],
  rights: [
    /\bmaster\b.*(?:control|own|label|estate|library)/i,
    /\bpublish/i,
    /copyright control/i,
    /\bMFN\b/,
    /one.stop/i,
    /clearance/i,
    /sync licen/i,
    /lyric licen/i,
    /co.write\b/i,
    /\bestate\b/i,
    /sync library/i,
    /chain of title/i,
    /interpolation/i,
    /administrator/i,
    /\bPRS\b/,
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function fmt(brief: string, tier: string, idx: number): string {
  return `${brief} / ${tier}[${idx}]`;
}

// ─── Accumulate failures then throw once at the end ───────────────────────────

const hardFailures: string[] = [];
const warnings:     string[] = [];

function hardFail(msg: string): void  { hardFailures.push(msg); }
function warn(msg: string):     void  { warnings.push(msg); }
function pass(label: string):   void  { console.log(`  PASS  ${label}`); }

// ─── CHECK 1 — Completeness ───────────────────────────────────────────────────

function checkCompleteness(): void {
  console.log('\n═══ CHECK 1 — Completeness ═══\n');
  const EXPECTED_TIERS: Array<keyof BriefPool> = ['PASS', 'MAYBE', 'FAIL'];
  const briefs = Object.keys(NARRATIVE_DICTIONARY);

  for (const brief of briefs) {
    const pool = NARRATIVE_DICTIONARY[brief];
    for (const tier of EXPECTED_TIERS) {
      const phrases = pool[tier];
      if (!phrases) {
        hardFail(`MISSING CELL: ${brief} / ${tier} — pool undefined`);
        continue;
      }
      if (phrases.length !== PHRASES_PER_POOL) {
        hardFail(
          `WRONG COUNT: ${brief} / ${tier} — expected ${PHRASES_PER_POOL} phrases, found ${phrases.length}`,
        );
      } else {
        pass(`${brief} / ${tier}: ${phrases.length} phrases`);
      }
    }
  }

  const briefCount = briefs.length;
  const expected   = 20;
  if (briefCount !== expected) {
    hardFail(`BRIEF COUNT: expected ${expected} briefs, found ${briefCount} — ${briefs.join(', ')}`);
  } else {
    pass(`Brief count: ${briefCount}`);
  }

  const totalPhrases = briefs.reduce((sum, b) => {
    const p = NARRATIVE_DICTIONARY[b];
    return sum + (p.PASS?.length ?? 0) + (p.MAYBE?.length ?? 0) + (p.FAIL?.length ?? 0);
  }, 0);
  const expectedTotal = expected * EXPECTED_TIERS.length * PHRASES_PER_POOL;
  if (totalPhrases !== expectedTotal) {
    hardFail(`TOTAL PHRASE COUNT: expected ${expectedTotal}, found ${totalPhrases}`);
  } else {
    pass(`Total phrases: ${totalPhrases}`);
  }
}

// ─── CHECK 2 — Uniqueness ─────────────────────────────────────────────────────

function checkUniqueness(): void {
  console.log('\n═══ CHECK 2 — Uniqueness ═══\n');

  // Collect all phrases globally for cross-pool exact duplicate detection
  const allPhrases = new Map<string, string>(); // phrase → first location
  let nearDupCount = 0;
  let crossExactCount = 0;

  for (const [brief, pool] of Object.entries(NARRATIVE_DICTIONARY)) {
    for (const tier of ['PASS', 'MAYBE', 'FAIL'] as const) {
      const phrases = pool[tier] ?? [];
      const tokens  = phrases.map(tokenize);

      // Within-pool exact duplicates
      const seen = new Set<string>();
      for (let i = 0; i < phrases.length; i++) {
        const p = phrases[i];
        if (seen.has(p)) {
          hardFail(`EXACT DUPLICATE within pool: ${fmt(brief, tier, i)} — "${p.slice(0, 80)}…"`);
        }
        seen.add(p);
      }

      // Within-pool near-duplicates (all pairs)
      for (let i = 0; i < phrases.length; i++) {
        for (let j = i + 1; j < phrases.length; j++) {
          const sim = jaccard(tokens[i], tokens[j]);
          if (sim >= NEAR_DUP_THRESHOLD) {
            nearDupCount++;
            hardFail(
              `NEAR-DUPLICATE (Jaccard ${sim.toFixed(3)} >= ${NEAR_DUP_THRESHOLD}): ` +
              `${fmt(brief, tier, i)} ↔ ${fmt(brief, tier, j)}\n` +
              `    [i] "${phrases[i].slice(0, 80)}…"\n` +
              `    [j] "${phrases[j].slice(0, 80)}…"`,
            );
          }
        }
      }

      // Cross-pool exact duplicate tracking
      for (let i = 0; i < phrases.length; i++) {
        const key  = phrases[i].trim();
        const here = `${fmt(brief, tier, i)}`;
        if (allPhrases.has(key)) {
          crossExactCount++;
          warn(`CROSS-POOL EXACT DUPLICATE: "${key.slice(0, 80)}…"\n    first seen at: ${allPhrases.get(key)}\n    also at: ${here}`);
        } else {
          allPhrases.set(key, here);
        }
      }
    }
  }

  if (nearDupCount === 0 && crossExactCount === 0) {
    pass('No within-pool exact or near-duplicates found');
    pass('No cross-pool exact duplicates found');
  } else if (nearDupCount === 0) {
    pass('No within-pool exact or near-duplicates found');
  }
}

// ─── CHECK 3 — Overclaim lint ─────────────────────────────────────────────────

function checkOverclaims(): void {
  console.log('\n═══ CHECK 3 — Overclaim lint ═══\n');

  // Report authorized {tempo} placeholders as INFO, not failures
  const tempoPlaceholders: string[] = [];
  let overclamCount = 0;

  for (const [brief, pool] of Object.entries(NARRATIVE_DICTIONARY)) {
    for (const tier of ['PASS', 'MAYBE', 'FAIL'] as const) {
      const phrases = pool[tier] ?? [];
      for (let i = 0; i < phrases.length; i++) {
        const phrase = phrases[i];
        const loc    = fmt(brief, tier, i);

        // Authorized {tempo} substitution — INFO only
        if (/\{tempo\}/.test(phrase)) {
          tempoPlaceholders.push(`  INFO  ${loc}: contains {tempo} placeholder (authorized engine-substituted value)`);
        }

        // Overclaim patterns — hard fail
        for (const { name, pattern, reason } of OVERCLAIM_PATTERNS) {
          const match = phrase.match(pattern);
          if (match) {
            overclamCount++;
            hardFail(
              `OVERCLAIM [${name}] at ${loc}\n` +
              `  reason:  ${reason}\n` +
              `  matched: "${match[0]}"\n` +
              `  phrase:  "${phrase.slice(0, 120)}${phrase.length > 120 ? '…' : ''}"`,
            );
          }
        }

        // Scene-specific keyword list
        for (const kw of SCENE_SPECIFIC_KEYWORDS) {
          if (phrase.toLowerCase().includes(kw.toLowerCase())) {
            overclamCount++;
            hardFail(
              `OVERCLAIM [SCENE_SPECIFIC] at ${loc}\n` +
              `  keyword: "${kw}"\n` +
              `  phrase:  "${phrase.slice(0, 120)}${phrase.length > 120 ? '…' : ''}"`,
            );
          }
        }
      }
    }
  }

  if (tempoPlaceholders.length > 0) {
    console.log(`  INFO  ${tempoPlaceholders.length} phrase(s) use {tempo} substitution — engine-verified, not overclaims:`);
    tempoPlaceholders.forEach(l => console.log(l));
  }
  if (overclamCount === 0) pass('No overclaim violations found');
}

// ─── CHECK 4 — FAIL lane balance ─────────────────────────────────────────────

function checkFailLaneBalance(): void {
  console.log('\n═══ CHECK 4 — FAIL lane balance ═══\n');

  // ── FRAGILITY FINDING ─────────────────────────────────────────────────────
  console.log([
    '  ⚠ FRAGILITY FINDING: FAIL pool lanes are identified by POSITION ONLY.',
    '    Indices [0,1] = emotional-mismatch, [2,3] = structural-conflict, [4,5] = rights-friction.',
    '    There is no explicit lane field or tag in BriefPool.',
    '    Recommendation: add an explicit lane tag to prevent positional drift:',
    '      type LaneTag = "emotional" | "structural" | "rights";',
    '      interface FailPhrase { text: string; lane: LaneTag; }',
    '      Replace FAIL: string[] with FAIL: FailPhrase[]',
    '    Until then, the validator enforces EXACTLY ' + PHRASES_PER_POOL + ' phrases per FAIL pool',
    '    and uses keyword heuristics to cross-check the ordering.',
    '',
  ].join('\n'));

  let laneDiscrepancies = 0;

  for (const [brief, pool] of Object.entries(NARRATIVE_DICTIONARY)) {
    const phrases = pool.FAIL ?? [];

    // Count enforcement: CHECK 1 already catches wrong counts; repeat here for lane math
    if (phrases.length !== PHRASES_PER_POOL) continue;

    // Heuristic: attempt to classify each phrase by dominant lane signal
    for (const [laneName, [start, end]] of Object.entries(FAIL_LANE_POSITIONS) as Array<[string, [number, number]]>) {
      for (let i = start; i <= end; i++) {
        const phrase    = phrases[i];
        const heurLane  = classifyFailLane(phrase);
        if (heurLane && heurLane !== laneName) {
          laneDiscrepancies++;
          warn(
            `LANE HEURISTIC MISMATCH at ${fmt(brief, 'FAIL', i)}: ` +
            `positional slot suggests "${laneName}", keyword heuristic suggests "${heurLane}"\n` +
            `    "${phrase.slice(0, 100)}…"`,
          );
        }
      }
    }

    pass(`${brief} / FAIL: 6 phrases — lane distribution assumed correct per position convention`);
  }

  if (laneDiscrepancies === 0) {
    pass('Keyword heuristics agree with positional lane assignments for all FAIL pools');
  } else {
    console.log(`  ${laneDiscrepancies} heuristic discrepancy(ies) flagged above — review positional ordering`);
  }
}

/** Heuristic lane classifier — returns null if no strong signal found. */
function classifyFailLane(phrase: string): 'emotional' | 'structural' | 'rights' | null {
  const scores = { emotional: 0, structural: 0, rights: 0 };
  for (const [lane, patterns] of Object.entries(LANE_HEURISTICS) as Array<['emotional' | 'structural' | 'rights', RegExp[]]>) {
    for (const pat of patterns) {
      if (pat.test(phrase)) scores[lane]++;
    }
  }
  const max   = Math.max(scores.emotional, scores.structural, scores.rights);
  if (max === 0) return null; // no signal
  const [top] = (Object.entries(scores) as Array<[string, number]>)
    .filter(([, v]) => v === max)
    .map(([k]) => k);
  // Only return a classification if one lane clearly dominates
  const sorted = Object.values(scores).sort((a, b) => b - a);
  if (sorted[0] <= sorted[1]) return null; // tie — no clear winner
  return top as 'emotional' | 'structural' | 'rights';
}

// ─── Determinism smoke-test ───────────────────────────────────────────────────

function checkDeterminism(): void {
  console.log('\n═══ SMOKE — Determinism ═══\n');
  // Verify tierFromScore and deterministicIndex produce stable results
  const cases: Array<[number, 'PASS' | 'MAYBE' | 'FAIL']> = [
    [100, 'PASS'], [70, 'PASS'], [69, 'MAYBE'], [50, 'MAYBE'], [49, 'FAIL'], [0, 'FAIL'],
  ];
  for (const [score, expected] of cases) {
    const got = tierFromScore(score);
    if (got !== expected) {
      hardFail(`tierFromScore(${score}): expected ${expected}, got ${got}`);
    } else {
      pass(`tierFromScore(${score}) = ${got}`);
    }
  }

  // deterministicIndex must be stable across calls
  const idx1 = deterministicIndex('track-abc', 'chase-tension', 6);
  const idx2 = deterministicIndex('track-abc', 'chase-tension', 6);
  if (idx1 !== idx2) hardFail(`deterministicIndex not stable: ${idx1} vs ${idx2}`);
  else pass(`deterministicIndex stable: ${idx1}`);

  // Must be in range
  for (let poolSize = 1; poolSize <= 8; poolSize++) {
    const idx = deterministicIndex('track-xyz', 'action-combat', poolSize);
    if (idx < 0 || idx >= poolSize) {
      hardFail(`deterministicIndex out of range for poolSize=${poolSize}: got ${idx}`);
    }
  }
  pass('deterministicIndex stays within [0, poolSize)');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  console.log('═══════════════════════════════════════════════════');
  console.log(' narrativeDictionary.test.ts — Invariant Validator ');
  console.log('═══════════════════════════════════════════════════');

  checkCompleteness();
  checkUniqueness();
  checkOverclaims();
  checkFailLaneBalance();
  checkDeterminism();

  // ── Report ───────────────────────────────────────────────────────────────
  console.log('\n═══ SUMMARY ═══\n');

  if (warnings.length > 0) {
    console.log(`  WARNINGS (${warnings.length}) — not build failures:\n`);
    warnings.forEach((w, i) => console.log(`  ${i + 1}. ${w}\n`));
  }

  if (hardFailures.length > 0) {
    console.error(`\n  HARD FAILURES (${hardFailures.length}):\n`);
    hardFailures.forEach((f, i) => console.error(`  ${i + 1}. ${f}\n`));
    throw new Error(
      `narrativeDictionary validation FAILED — ${hardFailures.length} hard failure(s) above. ` +
      `Fix all items before merging.`,
    );
  }

  console.log('  All checks passed.\n');
}

main();
