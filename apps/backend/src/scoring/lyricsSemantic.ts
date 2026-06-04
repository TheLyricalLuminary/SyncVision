/**
 * lyricsSemantic.ts — deterministic keyword-lexicon scoring for the lyrics axis.
 *
 * Design contract:
 *   - Same lyrics + same briefId → same score, always. No randomness, no LLM.
 *   - FULL state: score lyric text against brief's weighted term lexicon, 0–100.
 *   - INSTRUMENTAL / UNAVAILABLE: neutral 0.50 (expressed as 50 on the 0–100 scale).
 *     Neutral must not inflate or deflate ranking relative to tracks with real scores.
 *
 * Scoring algorithm (FULL state):
 *   For each term in the brief lexicon (weight 1–3):
 *     - Check whether the lowercased lyric text contains the term (whole-word boundary).
 *     - Each match contributes: weight × (1 + density_bonus).
 *     - density_bonus = min(1.0, matchCount / 3): caps at 1× bonus after 3 occurrences.
 *   Raw score = sum of contributions.
 *   Normalised score = clamp(raw / maxPossibleRaw × 100, 0, 100), rounded to integer.
 *   maxPossibleRaw = sum of (weight × 2) for all terms (all terms present, density capped).
 *   Applied floor: raw == 0 → score = 0 (no matching terms → zero, not neutral).
 *
 * Only one brief lexicon (chase-tension) is defined here, as directed by the review gate.
 * Add remaining 19 briefs after approval.
 */

import type { LyricsState } from "../lib/lrclib";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface LexiconTerm {
  term: string;   // lowercase search string (word or short phrase)
  weight: number; // 1 = present, 2 = thematically central, 3 = defining term
}

export interface BriefLexicon {
  briefId: string;
  description: string;
  terms: LexiconTerm[];
}

export interface SemanticScoreResult {
  score: number;          // 0–100
  state: LyricsState;
  label: string;
  matchedTerms: Array<{ term: string; weight: number; count: number; contribution: number }>;
}

// ─── Lexicons ─────────────────────────────────────────────────────────────────
//
// chase-tension: pursuit, urgency, momentum, motion, escape, drive,
//               relentlessness. Defiant energy and forward propulsion count —
//               the brief lives at the intersection of kinetic motion and threat.

export const BRIEF_LEXICONS: Record<string, BriefLexicon> = {
  "chase-tension": {
    briefId: "chase-tension",
    description: "Pursuit, urgency, momentum, motion, escape, drive, relentlessness",
    terms: [
      // Core pursuit / escape — weight 3 (defining)
      { term: "run",       weight: 3 },
      { term: "running",   weight: 3 },
      { term: "chase",     weight: 3 },
      { term: "escape",    weight: 3 },
      { term: "flee",      weight: 3 },
      { term: "hunt",      weight: 3 },
      { term: "caught",    weight: 3 },
      { term: "trap",      weight: 3 },
      { term: "corner",    weight: 2 },
      // Urgency / pressure — weight 3
      { term: "faster",    weight: 3 },
      { term: "hurry",     weight: 3 },
      { term: "time",      weight: 2 },
      { term: "now",       weight: 2 },
      { term: "too late",  weight: 3 },
      { term: "before",    weight: 1 },
      { term: "deadline",  weight: 2 },
      // Motion / momentum — weight 2–3
      { term: "move",      weight: 2 },
      { term: "moving",    weight: 2 },
      { term: "speed",     weight: 3 },
      { term: "fast",      weight: 2 },
      { term: "rush",      weight: 3 },
      { term: "push",      weight: 2 },
      { term: "forward",   weight: 2 },
      { term: "drive",     weight: 2 },
      { term: "driven",    weight: 2 },
      { term: "race",      weight: 3 },
      { term: "sprint",    weight: 3 },
      { term: "fly",       weight: 2 },
      { term: "flying",    weight: 2 },
      // Threat / danger — weight 2
      { term: "danger",    weight: 2 },
      { term: "threat",    weight: 2 },
      { term: "fear",      weight: 2 },
      { term: "afraid",    weight: 2 },
      { term: "blood",     weight: 1 },
      { term: "fight",     weight: 2 },
      { term: "fighter",   weight: 2 },
      { term: "weapon",    weight: 2 },
      { term: "gun",       weight: 2 },
      { term: "knife",     weight: 2 },
      // Defiance / relentlessness — weight 2
      { term: "never stop", weight: 3 },
      { term: "won't stop", weight: 3 },
      { term: "never give", weight: 2 },
      { term: "push back",  weight: 2 },
      { term: "resist",    weight: 2 },
      { term: "defy",      weight: 2 },
      { term: "rebel",     weight: 2 },
      { term: "won't back", weight: 2 },
      { term: "keep going", weight: 2 },
      { term: "don't stop", weight: 3 },
      // Power / aggression (overlaps with action but also chase energy) — weight 1–2
      { term: "power",     weight: 1 },
      { term: "force",     weight: 2 },
      { term: "strike",    weight: 2 },
      { term: "hit",       weight: 1 },
      { term: "blow",      weight: 1 },
    ],
  },
};

// ─── Scoring engine ────────────────────────────────────────────────────────────

function countOccurrences(text: string, term: string): number {
  // Whole-word boundary match, case-insensitive.
  // Use \b for single words; for multi-word terms, check substring presence directly.
  if (term.includes(" ")) {
    let count = 0;
    let pos = 0;
    const lower = text.toLowerCase();
    while ((pos = lower.indexOf(term, pos)) !== -1) {
      count++;
      pos += term.length;
    }
    return count;
  }
  const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
  const matches = text.match(re);
  return matches ? matches.length : 0;
}

export function scoreLyricsSemantic(
  lyricsText: string | null,
  lyricsState: LyricsState,
  briefId: string,
): SemanticScoreResult {
  // Non-FULL states always return neutral 50.
  if (lyricsState !== "FULL" || lyricsText === null) {
    const label =
      lyricsState === "INSTRUMENTAL"
        ? "Instrumental — no lyric content to evaluate"
        : "Lyrics unavailable — semantic match not evaluated";
    return { score: 50, state: lyricsState, label, matchedTerms: [] };
  }

  const lexicon = BRIEF_LEXICONS[briefId];
  if (!lexicon) {
    // Brief not yet implemented — fall back to neutral.
    return {
      score: 50,
      state: "FULL",
      label: `Lexicon not implemented for brief "${briefId}"`,
      matchedTerms: [],
    };
  }

  const text = lyricsText.toLowerCase();
  const maxPossibleRaw = lexicon.terms.reduce((s, t) => s + t.weight * 2, 0);

  let rawScore = 0;
  const matchedTerms: SemanticScoreResult["matchedTerms"] = [];

  for (const { term, weight } of lexicon.terms) {
    const count = countOccurrences(text, term);
    if (count === 0) continue;
    // density_bonus: 0 for 1 occurrence, up to 1.0 for ≥3 occurrences
    const densityBonus = Math.min(1.0, (count - 1) / 2);
    const contribution = weight * (1 + densityBonus);
    rawScore += contribution;
    matchedTerms.push({ term, weight, count, contribution: parseFloat(contribution.toFixed(3)) });
  }

  const normalised = maxPossibleRaw > 0
    ? Math.round(Math.min(100, (rawScore / maxPossibleRaw) * 100))
    : 0;

  const label = matchedTerms.length === 0
    ? "No lexicon terms matched"
    : `${matchedTerms.length} term${matchedTerms.length === 1 ? "" : "s"} matched`;

  return {
    score: normalised,
    state: "FULL",
    label,
    matchedTerms: matchedTerms.sort((a, b) => b.contribution - a.contribution),
  };
}

// ─── 0–1 normaliser for axis integration ──────────────────────────────────────
// Converts the 0–100 semantic score to the [0,1] range expected by trackVector.ts.
// Neutral (INSTRUMENTAL / UNAVAILABLE) is always exactly 0.50.

export function lyricsSemanticToAxisValue(result: SemanticScoreResult): number {
  if (result.state !== "FULL") return 0.50;
  return result.score / 100;
}
