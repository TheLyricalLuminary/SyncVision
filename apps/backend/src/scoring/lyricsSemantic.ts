/**
 * lyricsSemantic.ts — deterministic keyword-lexicon scoring for the lyrics axis.
 *
 * What this measures (and what it does NOT):
 *   DOES measure: vocabulary overlap between lyric text and a brief's thematic
 *   keyword set — term presence and density. It is a bag-of-words signal.
 *   DOES NOT measure: deep semantic meaning, metaphor, emotional arc, or theme
 *   comprehension. A song can be thematically perfect and score low if it uses
 *   non-overlapping vocabulary. That is intentional and honest.
 *
 * Design contract:
 *   - Same lyrics + same briefId → same score, always. No randomness, no LLM.
 *   - FULL state: score lyric text against brief's weighted term lexicon, 0–100.
 *   - INSTRUMENTAL / UNAVAILABLE: neutral 50 (axis value 0.50).
 *     Neutral must not inflate or deflate ranking relative to tracks with real scores.
 *
 * Scoring algorithm (FULL state):
 *   For each term in the brief lexicon (weight 1–3):
 *     raw_contribution = weight × (1 + density_bonus)
 *     density_bonus    = min(1.0, (matchCount − 1) / 2)
 *                        → 0 for 1 occurrence, 0.5 at 2, 1.0 at ≥3
 *   normalised = clamp(round(rawTotal / lexicon.saturationRaw × 100), 0, 100)
 *
 * saturationRaw — the calibration constant:
 *   Represents the expected raw score for a STRONGLY on-theme song (not a
 *   theoretical all-terms-at-max ceiling, which no real song approaches).
 *   Calibrated so:
 *     strongly on-theme  → 60–85
 *     light overlap      → 30–50
 *     no overlap         → 0–15
 *   Songs that exceed saturationRaw cap at 100. That is acceptable; the axis
 *   is a vocabulary-overlap signal, not a nuanced comprehension score.
 *
 * Only two brief lexicons (chase-tension, grief-loss) are defined here.
 * Add remaining briefs after review-gate approval.
 */

import type { LyricsState } from "../lib/lrclib";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface LexiconTerm {
  term: string;   // lowercase search string (word or short phrase)
  weight: number; // 1 = incidental signal, 2 = thematically central, 3 = defining
}

export interface BriefLexicon {
  briefId: string;
  description: string;
  /**
   * Calibration denominator. Raw score at which a strongly on-theme song
   * saturates to ~100. Set empirically — not the sum-of-all-weights ceiling.
   * See module header for target bands.
   */
  saturationRaw: number;
  terms: LexiconTerm[];
}

export interface SemanticScoreResult {
  score: number;          // 0–100, vocabulary-overlap signal
  axisValue: number;      // score / 100, in [0, 1] — for weighted dot-product
  state: LyricsState;
  label: string;
  matchedTerms: Array<{
    term: string;
    weight: number;
    count: number;
    contribution: number;
  }>;
}

// ─── Lexicons ──────────────────────────────────────────────────────────────────

export const BRIEF_LEXICONS: Record<string, BriefLexicon> = {

  // ── 1. CHASE / TENSION ────────────────────────────────────────────────────────
  // Pursuit, urgency, momentum, motion, escape, drive, relentlessness.
  // Defiant energy counts — the brief lives at kinetic motion + threat.
  //
  // saturationRaw = 15: ~5 high-weight terms matching with light density.
  // Benchmark: SNA raw=6 → 40 ("defiant and driving" = reasonable overlap).
  "chase-tension": {
    briefId: "chase-tension",
    description: "Pursuit, urgency, momentum, motion, escape, drive, relentlessness",
    saturationRaw: 15,
    terms: [
      // Core pursuit / escape — weight 3
      { term: "run",        weight: 3 },
      { term: "running",    weight: 3 },
      { term: "chase",      weight: 3 },
      { term: "escape",     weight: 3 },
      { term: "flee",       weight: 3 },
      { term: "hunt",       weight: 3 },
      { term: "caught",     weight: 3 },
      { term: "trap",       weight: 3 },
      { term: "corner",     weight: 2 },
      // Urgency / pressure — weight 2–3
      { term: "faster",     weight: 3 },
      { term: "hurry",      weight: 3 },
      { term: "time",       weight: 2 },
      { term: "now",        weight: 2 },
      { term: "too late",   weight: 3 },
      { term: "before",     weight: 1 },
      { term: "deadline",   weight: 2 },
      // Motion / momentum — weight 2–3
      { term: "move",       weight: 2 },
      { term: "moving",     weight: 2 },
      { term: "speed",      weight: 3 },
      { term: "fast",       weight: 2 },
      { term: "rush",       weight: 3 },
      { term: "push",       weight: 2 },
      { term: "forward",    weight: 2 },
      { term: "drive",      weight: 2 },
      { term: "driven",     weight: 2 },
      { term: "race",       weight: 3 },
      { term: "sprint",     weight: 3 },
      { term: "fly",        weight: 2 },
      { term: "flying",     weight: 2 },
      // Threat / danger — weight 1–2
      { term: "danger",     weight: 2 },
      { term: "threat",     weight: 2 },
      { term: "fear",       weight: 2 },
      { term: "afraid",     weight: 2 },
      { term: "blood",      weight: 1 },
      { term: "fight",      weight: 2 },
      { term: "fighter",    weight: 2 },
      { term: "weapon",     weight: 2 },
      { term: "gun",        weight: 2 },
      { term: "knife",      weight: 2 },
      // Defiance / relentlessness — weight 2–3
      { term: "never stop", weight: 3 },
      { term: "won't stop", weight: 3 },
      { term: "never give", weight: 2 },
      { term: "push back",  weight: 2 },
      { term: "resist",     weight: 2 },
      { term: "defy",       weight: 2 },
      { term: "rebel",      weight: 2 },
      { term: "won't back", weight: 2 },
      { term: "keep going", weight: 2 },
      { term: "don't stop", weight: 3 },
      // Power / aggression — weight 1–2
      { term: "power",      weight: 1 },
      { term: "force",      weight: 2 },
      { term: "strike",     weight: 2 },
      { term: "hit",        weight: 1 },
      { term: "blow",       weight: 1 },
    ],
  },

  // ── 2. GRIEF / LOSS ───────────────────────────────────────────────────────────
  // Loss, death, absence, mourning, emptiness, memory, longing.
  // Brief: "two estranged brothers reconnect at a funeral" — loss, reflective.
  //
  // saturationRaw = 24: ~8 weight-2/3 terms matching once.
  // Calibrated from observed data: Hurt raw=15 → 63 (strongly on-theme ✓),
  // Iris raw=9 → 38 (moderate overlap ✓), Billie Jean raw=3 → 13 (no overlap ✓).
  "grief-loss": {
    briefId: "grief-loss",
    description: "Loss, death, absence, grief, mourning, emptiness, memory, longing",
    saturationRaw: 24,
    terms: [
      // Defining grief vocabulary — weight 3
      { term: "grief",      weight: 3 },
      { term: "grieve",     weight: 3 },
      { term: "mourning",   weight: 3 },
      { term: "mourn",      weight: 3 },
      { term: "sorrow",     weight: 3 },
      // Pain / hurt — weight 3
      { term: "hurt",       weight: 3 },
      { term: "pain",       weight: 3 },
      { term: "ache",       weight: 3 },
      { term: "aching",     weight: 2 },
      // Emptiness / numbness — weight 3
      { term: "empty",      weight: 3 },
      { term: "hollow",     weight: 3 },
      { term: "numb",       weight: 3 },
      // Absence / loss — weight 3
      { term: "loss",       weight: 3 },
      { term: "lost",       weight: 3 },
      { term: "gone",       weight: 3 },
      { term: "goodbye",    weight: 3 },
      // Death / ending — weight 3
      { term: "dead",       weight: 3 },
      { term: "death",      weight: 3 },
      { term: "dying",      weight: 3 },
      { term: "die",        weight: 2 },
      { term: "fade",       weight: 3 },
      { term: "fading",     weight: 2 },
      // Memory / longing — weight 2
      { term: "memory",     weight: 2 },
      { term: "memories",   weight: 2 },
      { term: "remember",   weight: 2 },
      { term: "miss",       weight: 2 },
      { term: "missing",    weight: 2 },
      { term: "longing",    weight: 2 },
      // Emotional texture — weight 2
      { term: "tears",      weight: 2 },
      { term: "crying",     weight: 2 },
      { term: "weeping",    weight: 2 },
      { term: "alone",      weight: 2 },
      { term: "lonely",     weight: 2 },
      { term: "silence",    weight: 2 },
      { term: "broken",     weight: 2 },
      { term: "darkness",   weight: 2 },
      // Light incidental signals — weight 1
      { term: "dark",       weight: 1 },
      { term: "cold",       weight: 1 },
      { term: "heavy",      weight: 1 },
      { term: "forever",    weight: 1 },
      { term: "never",      weight: 1 },
      { term: "leave",      weight: 1 },
      { term: "leaving",    weight: 1 },
      { term: "left",       weight: 1 },
      { term: "heart",      weight: 1 },
      { term: "soul",       weight: 1 },
    ],
  },
};

// ─── Scoring engine ────────────────────────────────────────────────────────────

function countOccurrences(text: string, term: string): number {
  // Multi-word terms: substring scan (no word-boundary issue across spaces).
  if (term.includes(" ")) {
    let count = 0;
    let pos   = 0;
    const lower = text.toLowerCase();
    while ((pos = lower.indexOf(term, pos)) !== -1) {
      count++;
      pos += term.length;
    }
    return count;
  }
  // Single-word terms: whole-word boundary, case-insensitive.
  const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
  return (text.match(re) ?? []).length;
}

export function scoreLyricsSemantic(
  lyricsText: string | null,
  lyricsState: LyricsState,
  briefId: string,
): SemanticScoreResult {
  // Non-FULL states: neutral 50 / 0.50. These must not move ranking.
  if (lyricsState !== "FULL" || lyricsText === null) {
    const label =
      lyricsState === "INSTRUMENTAL"
        ? "Instrumental — no lyric content to evaluate"
        : "Lyrics unavailable — semantic match not evaluated";
    return { score: 50, axisValue: 0.50, state: lyricsState, label, matchedTerms: [] };
  }

  const lexicon = BRIEF_LEXICONS[briefId];
  if (!lexicon) {
    // Lexicon for this brief not yet built — fall back to neutral.
    return {
      score: 50,
      axisValue: 0.50,
      state: "FULL",
      label: `Lexicon not implemented for brief "${briefId}"`,
      matchedTerms: [],
    };
  }

  const text = lyricsText.toLowerCase();
  let rawScore = 0;
  const matchedTerms: SemanticScoreResult["matchedTerms"] = [];

  for (const { term, weight } of lexicon.terms) {
    const count = countOccurrences(text, term);
    if (count === 0) continue;
    // density_bonus caps at 1.0 after 3+ occurrences:
    //   count=1 → 0.0   (no bonus)
    //   count=2 → 0.5
    //   count=3+ → 1.0
    const densityBonus  = Math.min(1.0, (count - 1) / 2);
    const contribution  = weight * (1 + densityBonus);
    rawScore           += contribution;
    matchedTerms.push({
      term,
      weight,
      count,
      contribution: parseFloat(contribution.toFixed(3)),
    });
  }

  // Normalise against saturationRaw, not the all-terms-present ceiling.
  // A song at rawScore = saturationRaw scores 100; above it caps at 100.
  const score = Math.min(100, Math.round((rawScore / lexicon.saturationRaw) * 100));

  const label =
    matchedTerms.length === 0
      ? "No lexicon terms matched"
      : `${matchedTerms.length} term${matchedTerms.length === 1 ? "" : "s"} matched`;

  return {
    score,
    axisValue: parseFloat((score / 100).toFixed(4)),
    state: "FULL",
    label,
    matchedTerms: matchedTerms.sort((a, b) => b.contribution - a.contribution),
  };
}

// ─── 0–1 helper for axis integration (not yet wired) ─────────────────────────
// Returns axisValue directly for convenience.  Neutral states always 0.50.

export function lyricsSemanticToAxisValue(result: SemanticScoreResult): number {
  return result.axisValue;
}
