/**
 * Arc Match™ — deterministic scoring engine.
 *
 * A film scene has an emotional arc; a song has an emotional arc. These pure
 * functions measure how closely the two align. The score is a function of the
 * two arcs alone — no randomness, no model — so the same pair always produces
 * the same number. The React component in components/ArcMatch.tsx only draws
 * what this module computes.
 */

/** Four narrative beats, each 0–100 (emotional intensity). 1:1 with ArcPhases. */
export type ArcSegments = {
  opening: number;
  heldBreath: number;
  turn: number;
  release: number;
};

/** Canonical beat order — the narrative timeline, left to right. */
export const ARC_ORDER = ['opening', 'heldBreath', 'turn', 'release'] as const;

/** A beat counts as "in step" when the two arcs sit within this gap. */
export const ALIGN_THRESHOLD = 8;

export type ArcBand = 'excellent' | 'strong' | 'partial' | 'weak';

/**
 * Deterministic Arc Match score, 0–100.
 *
 * Each beat contributes its absolute gap |scene − song|; the mean gap is doubled
 * and subtracted from 100. Tight tracking across all four beats lands near 100;
 * a journey that diverges everywhere falls away fast.
 *
 *   "Never Letting Go" — scene 54/44/70/86 vs song 49/46/73/82
 *   gaps 5·2·3·4 → mean 3.5 → 100 − 7 = 93  (the deck's canonical Excellent)
 */
export function arcMatchScore(scene: ArcSegments, song: ArcSegments): number {
  const meanGap =
    ARC_ORDER.reduce((sum, k) => sum + Math.abs(scene[k] - song[k]), 0) / ARC_ORDER.length;
  return Math.max(0, Math.min(100, Math.round(100 - 2 * meanGap)));
}

/** Band a score into the core metric language (Design System 2.0, slides 03 & 18). */
export function arcBand(score: number): ArcBand {
  if (score >= 90) return 'excellent';
  if (score >= 78) return 'strong';
  if (score >= 65) return 'partial';
  return 'weak';
}

export const ARC_BAND_LABEL: Record<ArcBand, string> = {
  excellent: 'Excellent',
  strong: 'Strong',
  partial: 'Partial',
  weak: 'Weak',
};

/** One banding lexicon turns every score into a sentence (slide 18). */
export const ARC_BAND_SENTENCE: Record<ArcBand, string> = {
  excellent: 'Follows the scene almost exactly.',
  strong: 'Tracks the shape with one soft beat.',
  partial: 'The right feeling, the wrong moment.',
  weak: 'A different journey entirely.',
};
