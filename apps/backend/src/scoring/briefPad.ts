/**
 * briefPad.ts — per-category PAD (valence/arousal/dominance) target boxes.
 *
 * Lifted verbatim from the table currently duplicated in routes/scores.ts,
 * routes/analysis.ts and routes/demo.ts. This module is intended to become the
 * single source of truth those three should later import; for now the arc
 * engine reads it to derive a category "baseline floor" (the resting intensity
 * a scene of this category sits at before narrative events push it around).
 */

export type Range = [number, number];
export interface PADRange {
  valence: Range;
  arousal: Range;
  dominance: Range;
}

export const BRIEF_PAD: Record<string, PADRange> = {
  "chase-tension": { arousal: [0.75, 1.0], valence: [0.3, 0.6], dominance: [0.7, 1.0] },
  "action-combat": { arousal: [0.8, 1.0], valence: [0.2, 0.45], dominance: [0.8, 1.0] },
  "triumph-victory": { arousal: [0.8, 1.0], valence: [0.85, 1.0], dominance: [0.65, 1.0] },
  "euphoria-celebration": { arousal: [0.8, 1.0], valence: [0.85, 1.0], dominance: [0.65, 1.0] },
  "suspense-dread": { arousal: [0.6, 0.8], valence: [0.1, 0.35], dominance: [0.3, 0.55] },
  "horror-psychological": { arousal: [0.5, 0.7], valence: [0.05, 0.25], dominance: [0.2, 0.4] },
  "drama-confrontation": { arousal: [0.6, 0.75], valence: [0.25, 0.45], dominance: [0.55, 0.7] },
  "urban-gritty": { arousal: [0.6, 0.75], valence: [0.3, 0.5], dominance: [0.65, 0.8] },
  "romance-intimacy": { arousal: [0.2, 0.4], valence: [0.7, 1.0], dominance: [0.2, 0.4] },
  "heartbreak-separation": { arousal: [0.25, 0.45], valence: [0.15, 0.35], dominance: [0.15, 0.3] },
  "grief-loss": { arousal: [0.15, 0.35], valence: [0.2, 0.4], dominance: [0.15, 0.3] },
  "contemplative-reflective": { arousal: [0.15, 0.35], valence: [0.4, 0.6], dominance: [0.2, 0.35] },
  "emotional-resolution": { arousal: [0.4, 0.6], valence: [0.6, 0.8], dominance: [0.45, 0.65] },
  "comedy-light": { arousal: [0.45, 0.65], valence: [0.75, 1.0], dominance: [0.4, 0.6] },
  "quirky-offbeat": { arousal: [0.4, 0.6], valence: [0.6, 0.8], dominance: [0.35, 0.55] },
  "montage-transition": { arousal: [0.4, 0.6], valence: [0.4, 0.6], dominance: [0.4, 0.6] },
  "opening-closing-title": { arousal: [0.5, 0.7], valence: [0.5, 0.7], dominance: [0.55, 0.75] },
  "cinematic-epic": { arousal: [0.65, 0.8], valence: [0.45, 0.65], dominance: [0.75, 1.0] },
  "corporate-aspirational": { arousal: [0.5, 0.65], valence: [0.7, 0.85], dominance: [0.6, 0.75] },
  "nature-pastoral": { arousal: [0.15, 0.4], valence: [0.55, 0.75], dominance: [0.2, 0.4] },
};

/** Neutral fallback for categories without an explicit PAD box. */
const NEUTRAL: PADRange = BRIEF_PAD["montage-transition"];

function mid([lo, hi]: Range): number {
  return (lo + hi) / 2;
}

/**
 * Category "energy" scalar in [0,1] — a weighted blend of the PAD midpoints.
 * Arousal dominates (it is the primary intensity axis), with valence and
 * dominance as lighter contributions.
 */
export function categoryEnergy(briefId: string | null): number {
  const pad = (briefId && BRIEF_PAD[briefId]) || NEUTRAL;
  return 0.5 * mid(pad.arousal) + 0.3 * mid(pad.valence) + 0.2 * mid(pad.dominance);
}
