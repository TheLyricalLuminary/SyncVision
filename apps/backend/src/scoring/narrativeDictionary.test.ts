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
 * CHECK 4 — FAIL lane balance: reads explicit lane tag from each FailPhrase; asserts ≥ MIN_LANE_SIZE
 *                            phrases per LaneTag value; cross-validates with keyword heuristics (warn
 *                            only — heuristic disagreements do not hard-fail).
 *
 * DO NOT modify NARRATIVE_DICTIONARY content in this file. This suite only reads and validates.
 */

import {
  NARRATIVE_DICTIONARY,
  tierFromScore,
  deterministicIndex,
} from './narrativeDictionary';
import type { BriefPool, FailPhrase, LaneTag } from './narrativeDictionary';

// ─── Configuration ────────────────────────────────────────────────────────────

/** Expected number of phrases in every brief × tier cell. */
const PHRASES_PER_POOL = 6;

/**
 * Jaccard token-overlap threshold for near-duplicate detection.
 * Two phrases with similarity >= this value are flagged.
 */
const NEAR_DUP_THRESHOLD = 0.80;

/**
 * Minimum number of FailPhrase objects per LaneTag value in each FAIL pool.
 * With the current 2/2/2 positional convention (scene/lyrics/rights) this is 2.
 */
const MIN_LANE_SIZE = 2;

/** All valid LaneTag values — used for runtime validation. */
const VALID_LANE_TAGS: LaneTag[] = ['scene', 'lyrics', 'rights'];

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
    pattern: /\b\d{1,2}:\d{2}\b/,
    reason:  'MM:SS timestamp references a structural moment the engine cannot verify for an arbitrary track',
  },
  {
    name:    'TEMPO_BPM_HARDCODED',
    // Matches hardcoded numeric BPM values like "92 BPM" or "118BPM".
    // {tempo} substitution placeholders do NOT match (no leading digits).
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
    // Matches musical key names: "C# minor", "Bb major", "F maj".
    // Case-sensitive on [A-G] — lowercase 'a'/'c' etc. are common articles/words.
    //
    // Negative lookahead excludes English adjective uses such as "A minor lift" or
    // "A minor arousal drift" where the letter is the article "A" and minor/major
    // describes degree, not a tonal centre.  The following noun list covers PAD-
    // dimension words and degree descriptors that never follow a key name in prose.
    // Extend PAD_DEGREE_NOUNS if new false-positive patterns surface.
    //
    // BEFORE: /\b[A-G][#b♯♭]?\s*(major|minor|maj|min)\b/
    //   → false-positives: "A minor lift", "A minor valence drift", "A minor dip"
    // AFTER: negative lookahead on PAD/degree nouns eliminates all known false positives
    //   → still catches: "in A minor", "C# major", "resolves to F# minor"
    pattern: /\b[A-G][#b♯♭]?\s*(major|minor|maj|min)\b(?!\s+(?:lift|dip|drift|tilt|fluctuation|shift|variation|adjustment|arousal|valence|dominance|softening|brightening|darkening|plateau|register|character|quality|concern|deviation|note\b))/,
    reason:  'Key/mode name references a specific tonal centre the engine cannot verify',
  },
  {
    name:    'IN_THE_KEY_OF',
    pattern: /in the key of/i,
    reason:  'Key signature claim',
  },
  {
    name:    'BAR_COUNT_NUMERIC',
    // Matches "8 bars", "16-bar", "32 measures" etc. Spelled-out counts not caught.
    pattern: /\b\d+\s*-?\s*(bar|measure)s?\b/i,
    reason:  'Numeric bar/measure count is a structural specificity the engine cannot verify',
  },
];

/**
 * SCENE_SPECIFIC_KEYWORDS — phrases containing these are hard-failed.
 */
const SCENE_SPECIFIC_KEYWORDS: string[] = [
  'the actor',
  'the dialogue says',
  'when the camera',
  'the explosion',
];

// ─── Keyword heuristics for FAIL lane cross-validation (CHECK 4) ──────────────
// Used as cross-validation ONLY — disagreements are warnings, not hard failures.
const LANE_HEURISTICS: Record<LaneTag, RegExp[]> = {
  scene: [
    /\bvalence\b/i,
    /\barousal\b/i,
    /\bdominance\b/i,
    /wrong (?:emotional|dimension|register)/i,
    /dimensional misread/i,
    /emotional dimension/i,
    /emotional axis/i,
    /emotional shape/i,
    /emotional direction/i,
    /PAD register/i,
  ],
  lyrics: [
    /button ending/i,
    /no extended mix/i,
    /structural conflict/i,
    /verse[- ]chorus/i,
    /pop.?song shape/i,
    /arrangement.*(?:wrong|conflict|mismatch)/i,
    /tempo change/i,
    /hard stop/i,
    /does not loop/i,
    /lyric/i,
    /vocal.*arrangement/i,
    /cue runs \d/i,
    /brick.wall/i,
    /dynamic range/i,
    /mix hierarchy/i,
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
    /pre.clear/i,
    /rate card/i,
    /approval.*require/i,
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

/** Extract the text string from a phrase entry (string for PASS/MAYBE, FailPhrase for FAIL). */
function phraseText(p: string | FailPhrase): string {
  return typeof p === 'string' ? p : p.text;
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

  const allPhrases = new Map<string, string>(); // phrase text → first location
  let nearDupCount   = 0;
  let crossExactCount = 0;

  for (const [brief, pool] of Object.entries(NARRATIVE_DICTIONARY)) {
    for (const tier of ['PASS', 'MAYBE', 'FAIL'] as const) {
      const raw     = pool[tier] ?? [];
      const texts   = raw.map(phraseText);
      const tokens  = texts.map(tokenize);

      // Within-pool exact duplicates
      const seen = new Set<string>();
      for (let i = 0; i < texts.length; i++) {
        const p = texts[i];
        if (seen.has(p)) {
          hardFail(`EXACT DUPLICATE within pool: ${fmt(brief, tier, i)} — "${p.slice(0, 80)}…"`);
        }
        seen.add(p);
      }

      // Within-pool near-duplicates (all pairs)
      for (let i = 0; i < texts.length; i++) {
        for (let j = i + 1; j < texts.length; j++) {
          const sim = jaccard(tokens[i], tokens[j]);
          if (sim >= NEAR_DUP_THRESHOLD) {
            nearDupCount++;
            hardFail(
              `NEAR-DUPLICATE (Jaccard ${sim.toFixed(3)} >= ${NEAR_DUP_THRESHOLD}): ` +
              `${fmt(brief, tier, i)} ↔ ${fmt(brief, tier, j)}\n` +
              `    [i] "${texts[i].slice(0, 80)}…"\n` +
              `    [j] "${texts[j].slice(0, 80)}…"`,
            );
          }
        }
      }

      // Cross-pool exact duplicate tracking
      for (let i = 0; i < texts.length; i++) {
        const key  = texts[i].trim();
        const here = fmt(brief, tier, i);
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

  const tempoPlaceholders: string[] = [];
  let overclamCount = 0;

  for (const [brief, pool] of Object.entries(NARRATIVE_DICTIONARY)) {
    for (const tier of ['PASS', 'MAYBE', 'FAIL'] as const) {
      const raw = pool[tier] ?? [];
      for (let i = 0; i < raw.length; i++) {
        const phrase = phraseText(raw[i]);
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

// ─── CHECK 4 — FAIL lane balance (explicit lane tags) ────────────────────────

function checkFailLaneBalance(): void {
  console.log('\n═══ CHECK 4 — FAIL lane balance ═══\n');

  console.log([
    '  Lane taxonomy (Option A — axis-mirroring):',
    '    scene   → PAD / tonal / emotional mismatch  (positions [0,1])',
    '    lyrics  → arrangement / content mismatch    (positions [2,3])',
    '    rights  → clearance friction                (positions [4,5])',
    `  MIN_LANE_SIZE per pool: ${MIN_LANE_SIZE}`,
    '',
  ].join('\n'));

  let laneHardFails    = 0;
  let heuristicWarnings = 0;

  for (const [brief, pool] of Object.entries(NARRATIVE_DICTIONARY)) {
    const phrases = pool.FAIL;
    if (!phrases || phrases.length !== PHRASES_PER_POOL) continue; // CHECK 1 covers this

    // Count phrases per lane and validate each tag
    const laneCounts: Record<LaneTag, number> = { scene: 0, lyrics: 0, rights: 0 };

    for (let i = 0; i < phrases.length; i++) {
      const fp = phrases[i];

      // Runtime check: lane must be a valid LaneTag
      if (!VALID_LANE_TAGS.includes(fp.lane)) {
        laneHardFails++;
        hardFail(`INVALID LANE TAG at ${fmt(brief, 'FAIL', i)}: "${fp.lane}" is not a valid LaneTag`);
        continue;
      }

      laneCounts[fp.lane]++;

      // Keyword heuristic cross-validation — warn only, do not hard-fail
      const heurLane = classifyFailLane(fp.text);
      if (heurLane && heurLane !== fp.lane) {
        heuristicWarnings++;
        warn(
          `LANE HEURISTIC MISMATCH at ${fmt(brief, 'FAIL', i)}: ` +
          `annotated "${fp.lane}", keyword heuristic suggests "${heurLane}"\n` +
          `    "${fp.text.slice(0, 100)}${fp.text.length > 100 ? '…' : ''}"`,
        );
      }
    }

    // Assert ≥ MIN_LANE_SIZE per lane
    let poolOk = true;
    for (const lane of VALID_LANE_TAGS) {
      if (laneCounts[lane] < MIN_LANE_SIZE) {
        laneHardFails++;
        poolOk = false;
        hardFail(
          `LANE BALANCE at ${brief} / FAIL: lane "${lane}" has ${laneCounts[lane]} phrase(s), ` +
          `need at least ${MIN_LANE_SIZE}`,
        );
      }
    }

    if (poolOk) {
      pass(
        `${brief} / FAIL: scene:${laneCounts.scene} lyrics:${laneCounts.lyrics} rights:${laneCounts.rights}`,
      );
    }
  }

  if (laneHardFails === 0 && heuristicWarnings === 0) {
    pass('All lane tags valid; keyword heuristics agree with all annotations');
  } else if (laneHardFails === 0) {
    pass('All lane tag values are valid and MIN_LANE_SIZE satisfied');
    console.log(`  ${heuristicWarnings} heuristic discrepancy(ies) flagged as warnings — review AMBIGUOUS phrases`);
  }
}

/** Heuristic lane classifier — returns null if no strong signal. */
function classifyFailLane(text: string): LaneTag | null {
  const scores: Record<LaneTag, number> = { scene: 0, lyrics: 0, rights: 0 };
  for (const [lane, patterns] of Object.entries(LANE_HEURISTICS) as Array<[LaneTag, RegExp[]]>) {
    for (const pat of patterns) {
      if (pat.test(text)) scores[lane]++;
    }
  }
  const max = Math.max(scores.scene, scores.lyrics, scores.rights);
  if (max === 0) return null;
  const [top] = (Object.entries(scores) as Array<[LaneTag, number]>)
    .filter(([, v]) => v === max)
    .map(([k]) => k);
  const sorted = Object.values(scores).sort((a, b) => b - a);
  if (sorted[0] <= sorted[1]) return null; // tie — no clear winner
  return top;
}

// ─── Determinism smoke-test ───────────────────────────────────────────────────

function checkDeterminism(): void {
  console.log('\n═══ SMOKE — Determinism ═══\n');
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

  const idx1 = deterministicIndex('track-abc', 'chase-tension', 6);
  const idx2 = deterministicIndex('track-abc', 'chase-tension', 6);
  if (idx1 !== idx2) hardFail(`deterministicIndex not stable: ${idx1} vs ${idx2}`);
  else pass(`deterministicIndex stable: ${idx1}`);

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
