/**
 * narratives.test.ts
 *
 * Permanent validator suite for the LIVE NARRATIVE_DICTIONARY in narratives.ts.
 * Runs on every commit/PR via CI and fails the build on any hard failure.
 *
 * CHECK 1 — Completeness:   every brief × verdict cell exists and has exactly PHRASES_PER_POOL phrases.
 *                            Reports which briefs ARE present vs the 20 in narrativeDictionary.ts
 *                            so any coverage gap is visible.
 * CHECK 2 — Uniqueness:     no exact or near-duplicate (Jaccard ≥ NEAR_DUP_THRESHOLD) within each pool;
 *                            cross-pool exact matches are warned (not hard-failed).
 * CHECK 3 — Overclaim lint: no timestamps, hardcoded BPM, key signatures, bar counts, or unverifiable
 *                            scene-specific claims. Hard-fails on any match.
 *                            SOFT FLAG — BPM without a preceding digit: surface for human review, no hard fail.
 * CHECK 4 — FAIL lane balance: verifies the 2/2 (emotional / structural) positional convention holds
 *                            for FAIL_CLOSE and FAIL_HARD pools. No rights lane — 4-phrase pools have
 *                            no positional slot for it; rights-friction arguments should not appear here.
 *
 * DO NOT modify NARRATIVE_DICTIONARY content in this file. This suite only reads and validates.
 */

import {
  NARRATIVE_DICTIONARY,
  verdictFor,
  buildBriefNarrative,
} from './narratives';
import type { BriefNarrativePool, Verdict } from './narratives';

// ─── Configuration ────────────────────────────────────────────────────────────

/** Expected number of phrases in every brief × verdict cell. */
const PHRASES_PER_POOL = 4;

/**
 * Jaccard token-overlap threshold for near-duplicate detection.
 * Two phrases with similarity >= this value are flagged.
 */
const NEAR_DUP_THRESHOLD = 0.80;

/**
 * The 20 briefs present in narrativeDictionary.ts (the static dead pool).
 * Any brief present there but absent here represents a coverage gap.
 */
const BRIEFS_IN_STATIC_POOL: string[] = [
  'chase-tension',
  'action-combat',
  'triumph-victory',
  'euphoria-celebration',
  'suspense-dread',
  'horror-psychological',
  'drama-confrontation',
  'urban-gritty',
  'romance-intimacy',
  'heartbreak-separation',
  'grief-loss',
  'contemplative-reflective',
  'emotional-resolution',
  'comedy-light',
  'quirky-offbeat',
  'montage-transition',
  'opening-closing-title',
  'cinematic-epic',
  'corporate-aspirational',
  'nature-pastoral',
];

/**
 * Expected briefs per the v1 spec ("SyncVision Narrative Dictionary v1 — 360 phrases /
 * 6 verdicts × 20 briefs × 3 phrase slots" — but this pool uses 4 phrases per verdict).
 * Set to 18 as the design target; the check will report the actual count and any gap.
 */
const EXPECTED_BRIEFS = 18;

const EXPECTED_TIERS: Array<keyof BriefNarrativePool> = [
  'PASS_STRONG', 'PASS_SOFT', 'MAYBE_HIGH', 'MAYBE_LOW', 'FAIL_CLOSE', 'FAIL_HARD',
];

/**
 * FAIL_CLOSE and FAIL_HARD pool positions map to lanes by convention (positional-only).
 * With 4 phrases: [0,1] = emotional-mismatch, [2,3] = structural-conflict.
 * No rights-friction lane — 4-phrase pools have no positional slot for it.
 */
const FAIL_LANE_POSITIONS: Record<'emotional' | 'structural', [number, number]> = {
  emotional:  [0, 1],
  structural: [2, 3],
};

const FAIL_TIERS: Array<keyof BriefNarrativePool> = ['FAIL_CLOSE', 'FAIL_HARD'];

// ─── OVERCLAIM_PATTERNS ───────────────────────────────────────────────────────

const OVERCLAIM_PATTERNS: Array<{
  name:    string;
  pattern: RegExp;
  reason:  string;
}> = [
  {
    name:    'TIMESTAMP_MMSS',
    pattern: /\b\d{1,2}:\d{2}\b/,
    reason:  'MM:SS timestamp references a structural moment the engine cannot verify for an arbitrary track',
  },
  {
    name:    'TEMPO_BPM_HARDCODED',
    // Matches numeric BPM e.g. "92 BPM" or "118BPM". Does NOT match {tempo} placeholders.
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
    // "A minor valence drift" where the letter is the article "A" and minor/major
    // describes degree, not a tonal centre.
    //
    // BEFORE: /\b[A-G][#b♯♭]?\s*(major|minor|maj|min)\b/
    //   → false-positives on narratives.ts: all 8 were "A minor [PAD/degree noun]"
    // AFTER: negative lookahead eliminates known false positives; true key names pass.
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
    // Matches "8 bars", "16-bar", "32 measures" — numeric only; spelled-out counts are not caught.
    pattern: /\b\d+\s*-?\s*(bar|measure)s?\b/i,
    reason:  'Numeric bar/measure count is a structural specificity the engine cannot verify',
  },
];

/**
 * SOFT_BPM_PATTERN — BPM referenced without a preceding digit.
 * Phrases like "Has the BPM but not the weight" lean on a numeric concept without stating it.
 * WARNING only (not a hard fail). Surface for human review.
 */
const SOFT_BPM_PATTERN = /\bBPM\b/;

const SCENE_SPECIFIC_KEYWORDS: string[] = [
  'the actor',
  'the dialogue says',
  'when the camera',
  'the explosion',
];

// ─── Keyword heuristics for FAIL lane identification (CHECK 4) ────────────────
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
  return `${brief}/${tier}[${idx}]`;
}

// ─── Accumulate failures then throw once at the end ───────────────────────────

const hardFailures: string[] = [];
const warnings:     string[] = [];

function hardFail(msg: string): void { hardFailures.push(msg); }
function warn(msg: string):     void { warnings.push(msg); }
function pass(label: string):   void { console.log(`  PASS  ${label}`); }

// ─── CHECK 1 — Completeness ───────────────────────────────────────────────────

function checkCompleteness(): void {
  console.log('\n═══ CHECK 1 — Completeness ═══\n');

  const briefs = Object.keys(NARRATIVE_DICTIONARY);
  const briefSet = new Set(briefs);

  // Coverage gap report vs the static pool's 20 briefs
  const inStaticButNotHere = BRIEFS_IN_STATIC_POOL.filter(b => !briefSet.has(b));
  const hereButNotInStatic = briefs.filter(b => !BRIEFS_IN_STATIC_POOL.includes(b));

  console.log(`  INFO  Briefs present in this pool (${briefs.length}): ${briefs.join(', ')}`);
  if (inStaticButNotHere.length > 0) {
    console.log(`  INFO  In static pool but ABSENT here (${inStaticButNotHere.length}): ${inStaticButNotHere.join(', ')}`);
  } else {
    console.log(`  INFO  Coverage gap vs static pool: none — all 20 briefs are present`);
  }
  if (hereButNotInStatic.length > 0) {
    console.log(`  INFO  Present here but NOT in static pool (new briefs): ${hereButNotInStatic.join(', ')}`);
  }

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
  if (briefCount !== EXPECTED_BRIEFS) {
    // Not a hard fail — report the discrepancy so the human can decide whether
    // the design target (EXPECTED_BRIEFS) needs updating.
    console.log(
      `  INFO  BRIEF COUNT: expected ${EXPECTED_BRIEFS}, found ${briefCount} — ` +
      `update EXPECTED_BRIEFS in this file if the design target has changed`,
    );
  } else {
    pass(`Brief count: ${briefCount}`);
  }

  const totalPhrases = briefs.reduce((sum, b) => {
    const p = NARRATIVE_DICTIONARY[b];
    return sum + EXPECTED_TIERS.reduce((s, t) => s + (p[t]?.length ?? 0), 0);
  }, 0);
  const expectedTotal = briefCount * EXPECTED_TIERS.length * PHRASES_PER_POOL;
  if (totalPhrases !== expectedTotal) {
    hardFail(`TOTAL PHRASE COUNT: expected ${expectedTotal}, found ${totalPhrases}`);
  } else {
    pass(`Total phrases: ${totalPhrases} (${briefCount} briefs × ${EXPECTED_TIERS.length} verdicts × ${PHRASES_PER_POOL} phrases)`);
  }
}

// ─── CHECK 2 — Uniqueness ─────────────────────────────────────────────────────

function checkUniqueness(): void {
  console.log('\n═══ CHECK 2 — Uniqueness ═══\n');

  const allPhrases = new Map<string, string>(); // phrase → first location
  let nearDupCount   = 0;
  let crossExactCount = 0;

  for (const [brief, pool] of Object.entries(NARRATIVE_DICTIONARY)) {
    for (const tier of EXPECTED_TIERS) {
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
        const here = fmt(brief, tier, i);
        if (allPhrases.has(key)) {
          crossExactCount++;
          warn(
            `CROSS-POOL EXACT DUPLICATE: "${key.slice(0, 80)}…"\n    first seen at: ${allPhrases.get(key)}\n    also at: ${here}`,
          );
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
  let softBpmCount  = 0;

  for (const [brief, pool] of Object.entries(NARRATIVE_DICTIONARY)) {
    for (const tier of EXPECTED_TIERS) {
      const phrases = pool[tier] ?? [];
      for (let i = 0; i < phrases.length; i++) {
        const phrase = phrases[i];
        const loc    = fmt(brief, tier, i);

        // Authorized {tempo} substitution — INFO only
        if (/\{tempo\}/.test(phrase)) {
          tempoPlaceholders.push(`  INFO  ${loc}: contains {tempo} placeholder (authorized engine-substituted value)`);
        }

        // Hard-fail overclaim patterns
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

        // Scene-specific keyword list — hard fail
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

        // SOFT flag — BPM without a preceding digit (warning, not hard fail)
        // Check only if TEMPO_BPM_HARDCODED already passed (avoid double-flagging numeric BPM).
        const hasNumericBpm = /\b\d{2,3}\s?bpm\b/i.test(phrase);
        if (!hasNumericBpm && SOFT_BPM_PATTERN.test(phrase)) {
          softBpmCount++;
          warn(
            `SOFT [BPM_SANS_DIGIT] at ${loc}: "${phrase.slice(0, 120)}${phrase.length > 120 ? '…' : ''}"`,
          );
        }
      }
    }
  }

  if (tempoPlaceholders.length > 0) {
    console.log(`  INFO  ${tempoPlaceholders.length} phrase(s) use {tempo} substitution — engine-verified, not overclaims:`);
    tempoPlaceholders.forEach(l => console.log(l));
  }
  if (softBpmCount > 0) {
    console.log(`  INFO  ${softBpmCount} SOFT BPM_SANS_DIGIT warning(s) will appear in WARNINGS section below`);
  }
  if (overclamCount === 0) pass('No overclaim violations found');
}

// ─── CHECK 4 — FAIL lane balance ─────────────────────────────────────────────

function checkFailLaneBalance(): void {
  console.log('\n═══ CHECK 4 — FAIL lane balance ═══\n');

  console.log([
    '  ⚠ FRAGILITY FINDING: FAIL pool lanes are identified by POSITION ONLY.',
    '    With 4 phrases per verdict: [0,1] = emotional-mismatch, [2,3] = structural-conflict.',
    '    No rights-friction lane — 4-phrase pools have no positional slot.',
    '    Rights-friction arguments in FAIL_CLOSE or FAIL_HARD should be flagged below.',
    '    Recommendation: add an explicit lane tag to prevent positional drift:',
    '      type LaneTag = "emotional" | "structural";',
    '      interface FailPhrase { text: string; lane: LaneTag; }',
    '      Replace FAIL_CLOSE/FAIL_HARD: string[] with FAIL_CLOSE/FAIL_HARD: FailPhrase[]',
    '    Until then, the validator enforces EXACTLY ' + PHRASES_PER_POOL + ' phrases per FAIL pool',
    '    and uses keyword heuristics to cross-check the ordering.',
    '',
  ].join('\n'));

  let laneDiscrepancies = 0;

  for (const [brief, pool] of Object.entries(NARRATIVE_DICTIONARY)) {
    for (const failTier of FAIL_TIERS) {
      const phrases = pool[failTier] ?? [];

      if (phrases.length !== PHRASES_PER_POOL) continue; // CHECK 1 already caught this

      // Rights-friction heuristic check — should not appear in FAIL_CLOSE or FAIL_HARD
      for (let i = 0; i < phrases.length; i++) {
        const phrase = phrases[i];
        const heurLane = classifyFailLane(phrase);
        if (heurLane === 'rights') {
          laneDiscrepancies++;
          warn(
            `RIGHTS-IN-FAIL at ${fmt(brief, failTier, i)}: ` +
            `keyword heuristic suggests "rights" lane — no positional slot for rights in 4-phrase pool\n` +
            `    "${phrase.slice(0, 100)}"`,
          );
        }
      }

      // Emotional/structural positional cross-check
      for (const [laneName, [start, end]] of Object.entries(FAIL_LANE_POSITIONS) as Array<[string, [number, number]]>) {
        for (let i = start; i <= end; i++) {
          const phrase   = phrases[i];
          const heurLane = classifyFailLane(phrase);
          if (heurLane && heurLane !== 'rights' && heurLane !== laneName) {
            laneDiscrepancies++;
            warn(
              `LANE HEURISTIC MISMATCH at ${fmt(brief, failTier, i)}: ` +
              `positional slot suggests "${laneName}", keyword heuristic suggests "${heurLane}"\n` +
              `    "${phrase.slice(0, 100)}"`,
            );
          }
        }
      }

      pass(`${brief} / ${failTier}: ${PHRASES_PER_POOL} phrases — lane distribution assumed correct per position convention`);
    }
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
  const max = Math.max(scores.emotional, scores.structural, scores.rights);
  if (max === 0) return null;
  const [top] = (Object.entries(scores) as Array<[string, number]>)
    .filter(([, v]) => v === max)
    .map(([k]) => k);
  const sorted = Object.values(scores).sort((a, b) => b - a);
  if (sorted[0] <= sorted[1]) return null; // tie — no clear winner
  return top as 'emotional' | 'structural' | 'rights';
}

// ─── Determinism smoke-test ───────────────────────────────────────────────────

function checkDeterminism(): void {
  console.log('\n═══ SMOKE — Determinism ═══\n');

  // verdictFor threshold smoke-test
  const verdictCases: Array<[number, Verdict]> = [
    [100, 'PASS_STRONG'], [80, 'PASS_STRONG'], [79, 'PASS_SOFT'], [70, 'PASS_SOFT'],
    [69, 'MAYBE_HIGH'],   [60, 'MAYBE_HIGH'],  [59, 'MAYBE_LOW'], [50, 'MAYBE_LOW'],
    [49, 'FAIL_CLOSE'],   [40, 'FAIL_CLOSE'],  [39, 'FAIL_HARD'], [0,  'FAIL_HARD'],
  ];
  for (const [score, expected] of verdictCases) {
    const got = verdictFor(score);
    if (got !== expected) {
      hardFail(`verdictFor(${score}): expected ${expected}, got ${got}`);
    } else {
      pass(`verdictFor(${score}) = ${got}`);
    }
  }

  // buildBriefNarrative must be stable and return a non-empty string
  const track = { tempo: 120, tonalCharacter: 'dark', energyCharacter: 'high-energy' };
  const n1 = buildBriefNarrative('track-abc', 'chase-tension', 85, track);
  const n2 = buildBriefNarrative('track-abc', 'chase-tension', 85, track);
  if (n1 !== n2) {
    hardFail(`buildBriefNarrative not stable across calls`);
  } else {
    pass(`buildBriefNarrative stable: "${n1.slice(0, 60)}…"`);
  }

  // Must return fallback string for unknown brief
  const fallback = buildBriefNarrative('track-xyz', 'unknown-brief', 85, track);
  if (!fallback.includes('unavailable')) {
    hardFail(`buildBriefNarrative for unknown brief should include "unavailable", got: "${fallback}"`);
  } else {
    pass(`buildBriefNarrative fallback for unknown brief: "${fallback.slice(0, 60)}"`);
  }

  // Deterministic phrase selection — different trackId should (by probability) sometimes differ,
  // but same trackId+briefId+score must always be the same.
  const n3 = buildBriefNarrative('track-abc', 'chase-tension', 85, track);
  if (n1 !== n3) hardFail(`buildBriefNarrative not stable on third call`);
  else pass(`buildBriefNarrative stable on third call`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  console.log('═══════════════════════════════════════════════════');
  console.log(' narratives.test.ts — Invariant Validator          ');
  console.log(' Live NARRATIVE_DICTIONARY: 6-verdict × 4-phrase  ');
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
      `narratives validation FAILED — ${hardFailures.length} hard failure(s) above. ` +
      `Fix all items before merging.`,
    );
  }

  console.log('  All checks passed.\n');
}

main();
