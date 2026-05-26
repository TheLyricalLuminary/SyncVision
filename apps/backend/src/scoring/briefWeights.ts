/**
 * BriefWeightProfile — explicit per-brief weight vector for the SyncVision Score.
 *
 * For each brief, weights must satisfy:
 *   sceneFit + rightsClarity + metadata === 1.0  (checked at startup via validateWeights())
 *
 * Design rationale per axis:
 *   sceneFit     — emotional and acoustic fit to the brief's PAD target range
 *   rightsClarity — clearance confidence (master + publishing + ASCAP/BMI + one-stop)
 *   metadata     — completeness of cataloguing data (ISRC, tempo, character tags, audio file)
 *
 * Briefs where clearance is the primary gating risk (e.g. network/broadcast placements)
 * carry higher rightsClarity weight. Briefs where emotional resonance dominates
 * (e.g. grief, romance) carry higher sceneFit weight.
 */

export interface BriefWeightProfile {
  sceneFit: number;
  rightsClarity: number;
  metadata: number;
}

export const BRIEF_WEIGHTS: Record<string, BriefWeightProfile> = {
  // High-arousal / high-placement-value briefs — clearance is frequently the blocker
  "chase-tension":            { sceneFit: 0.50, rightsClarity: 0.35, metadata: 0.15 },
  "action-combat":            { sceneFit: 0.50, rightsClarity: 0.35, metadata: 0.15 },
  "triumph-victory":          { sceneFit: 0.50, rightsClarity: 0.30, metadata: 0.20 },
  "euphoria-celebration":     { sceneFit: 0.50, rightsClarity: 0.30, metadata: 0.20 },

  // Psychological / dark — mood is the primary differentiator; rights still matter
  "suspense-dread":           { sceneFit: 0.55, rightsClarity: 0.30, metadata: 0.15 },
  "horror-psychological":     { sceneFit: 0.55, rightsClarity: 0.30, metadata: 0.15 },

  // Drama — emotional precision weighted highest; metadata matters for editorial
  "drama-confrontation":      { sceneFit: 0.55, rightsClarity: 0.25, metadata: 0.20 },
  "urban-gritty":             { sceneFit: 0.50, rightsClarity: 0.30, metadata: 0.20 },

  // Intimate / emotional — sceneFit dominates; supervisors rarely clear on metadata alone
  "romance-intimacy":         { sceneFit: 0.60, rightsClarity: 0.25, metadata: 0.15 },
  "heartbreak-separation":    { sceneFit: 0.60, rightsClarity: 0.25, metadata: 0.15 },
  "grief-loss":               { sceneFit: 0.60, rightsClarity: 0.25, metadata: 0.15 },
  "contemplative-reflective": { sceneFit: 0.55, rightsClarity: 0.25, metadata: 0.20 },
  "emotional-resolution":     { sceneFit: 0.55, rightsClarity: 0.25, metadata: 0.20 },

  // Light / comedic — mood fit still primary; easier to clear, so rights weight lower
  "comedy-light":             { sceneFit: 0.50, rightsClarity: 0.25, metadata: 0.25 },
  "quirky-offbeat":           { sceneFit: 0.50, rightsClarity: 0.25, metadata: 0.25 },

  // Utility / neutral briefs — balanced; metadata matters more for editorial search
  "montage-transition":       { sceneFit: 0.45, rightsClarity: 0.30, metadata: 0.25 },
  "opening-closing-title":    { sceneFit: 0.45, rightsClarity: 0.35, metadata: 0.20 },

  // Broadcast / high-value placements — rights are the hard gating factor
  "cinematic-epic":           { sceneFit: 0.45, rightsClarity: 0.40, metadata: 0.15 },
  "corporate-aspirational":   { sceneFit: 0.45, rightsClarity: 0.35, metadata: 0.20 },

  // Ambient / low-stakes — emotional texture leads; rights and metadata balanced
  "nature-pastoral":          { sceneFit: 0.55, rightsClarity: 0.25, metadata: 0.20 },

  // Sports — high placement value, network broadcast rights are the primary blocker
  "sports-highlight":         { sceneFit: 0.50, rightsClarity: 0.35, metadata: 0.15 },

  // True crime / investigative — mood is primary differentiator; tone must sustain
  "true-crime-investigative": { sceneFit: 0.55, rightsClarity: 0.30, metadata: 0.15 },

  // Faith / inspirational — emotional resonance leads; broadcast PRO rates apply
  "faith-inspirational":      { sceneFit: 0.55, rightsClarity: 0.30, metadata: 0.15 },

  // Kids / family — explicit flag is a hard gate; emotional safety leads
  "kids-family":              { sceneFit: 0.50, rightsClarity: 0.35, metadata: 0.15 },

  // Trailer / promo — theatrical and broadcast rights are the primary gating factor
  "trailer-promo":            { sceneFit: 0.45, rightsClarity: 0.40, metadata: 0.15 },

  // Period / historical — instrumentation and tonal authenticity lead; metadata for editorial
  "period-historical":        { sceneFit: 0.55, rightsClarity: 0.25, metadata: 0.20 },
};

/** Throws if any profile's weights do not sum to 1.0 within floating-point tolerance. */
export function validateWeights(): void {
  for (const [id, w] of Object.entries(BRIEF_WEIGHTS)) {
    const sum = w.sceneFit + w.rightsClarity + w.metadata;
    if (Math.abs(sum - 1.0) > 1e-9) {
      throw new Error(
        `BRIEF_WEIGHTS["${id}"] sums to ${sum.toFixed(10)}, expected 1.0`
      );
    }
  }
}
