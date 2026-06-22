/**
 * arcLexicon.ts — frozen deterministic lexicons for scene-arc extraction.
 *
 * Design contract (mirrors lyricsSemantic.ts):
 *   - Same scene text → same detection → same arc, always. No randomness, no LLM.
 *   - These tables are DATA. Tuning them is a reviewable, version-stamped diff.
 *
 * Three signal sources live here:
 *   1. NARRATIVE_EVENTS — weighted story beats. Each beat carries:
 *        intensity  (+ / ++ / +++)  → amplitude tier (how loud the moment is)
 *        affinity   ([O,HB,T,R], Σ≈1) → WHERE in the arc it characteristically
 *                                       lands, independent of text position
 *        valence    (−1…+1)         → emotional DIRECTION (grief vs triumph).
 *                                       This is what tells forgiveness from
 *                                       revenge when their magnitude shapes match.
 *   2. SUPPRESSORS / AMPLIFIERS — emotional-lexicon adjectives that scale the
 *      amplitude of the phase of the SENTENCE they appear in (positional).
 *   3. PACING — narrative markers that sharpen/lengthen their declared phase.
 *
 * Matching rule (shared with lyricsSemantic.ts):
 *   multi-word term → substring scan; single word → whole-word (\b…\b).
 */

import type { ArcVec } from "./arcTypes";

export const LEXICON_VERSION = "arc-v1";

/** Intensity tier → amplitude. Wide gaps so a defining +++ beat dominates an
 *  incidental + beat when both land in the same phase. */
export const AMP: Record<1 | 2 | 3, number> = { 1: 14, 2: 28, 3: 40 };

export interface NarrativeEvent {
  id: string;
  triggers: string[]; // lowercase words/phrases
  intensity: 1 | 2 | 3; // + / ++ / +++
  affinity: ArcVec; // [opening, heldBreath, turn, release], Σ ≈ 1.0
  valence: number; // −1 (dark) … +1 (bright)
}

/**
 * Common film beats covering the four phases. Affinity vectors and valences are
 * judgment calls, versioned via LEXICON_VERSION for safe revision. Trigger words
 * are kept disjoint across events so each beat surfaces as one signal.
 */
export const NARRATIVE_EVENTS: NarrativeEvent[] = [
  // ── Opening-weighted beats ────────────────────────────────────────────────
  { id: "establishing", triggers: ["establishing", "we open", "opens on", "wide shot", "exterior"], intensity: 1, affinity: [0.85, 0.1, 0.05, 0.0], valence: 0.0 },
  { id: "introduction", triggers: ["introduces", "introduction", "meets for the first time", "first meet"], intensity: 1, affinity: [0.8, 0.15, 0.05, 0.0], valence: 0.1 },
  { id: "arrival", triggers: ["arrives", "arrival", "walks in", "enters", "returns home", "comes home"], intensity: 1, affinity: [0.75, 0.15, 0.1, 0.0], valence: 0.1 },
  { id: "reunion", triggers: ["reunite", "reunites", "reunited", "reunion", "see each other again"], intensity: 1, affinity: [0.7, 0.2, 0.1, 0.0], valence: 0.4 },
  { id: "reconciliation", triggers: ["reconnect", "reconnects", "reconcile", "reconciles", "reconciled", "reconciliation", "make amends", "mend"], intensity: 1, affinity: [0.45, 0.1, 0.1, 0.35], valence: 0.5 },

  // ── Held-Breath-weighted beats (low, sustained, restrained) ───────────────
  { id: "longing", triggers: ["longing", "yearning", "pining", "aching for"], intensity: 1, affinity: [0.3, 0.55, 0.1, 0.05], valence: -0.2 },
  { id: "tension", triggers: ["tension", "unease", "uneasy", "on edge", "simmering"], intensity: 2, affinity: [0.1, 0.7, 0.15, 0.05], valence: -0.4 },
  { id: "restraint", triggers: ["restraint", "holding back", "unspoken", "withheld"], intensity: 1, affinity: [0.05, 0.8, 0.1, 0.05], valence: -0.1 },
  { id: "grief", triggers: ["grief", "grieving", "mourning", "mourns", "funeral", "eulogy", "wake", "loss of", "bereaved"], intensity: 1, affinity: [0.1, 0.6, 0.05, 0.25], valence: -0.6 },
  { id: "dread", triggers: ["dread", "foreboding", "creeping fear", "something is wrong", "ominous"], intensity: 2, affinity: [0.05, 0.75, 0.15, 0.05], valence: -0.7 },
  { id: "waiting", triggers: ["waiting", "waits", "anticipation", "stalling", "lingers"], intensity: 1, affinity: [0.1, 0.75, 0.1, 0.05], valence: -0.1 },
  { id: "doubt", triggers: ["doubt", "hesitates", "hesitation", "uncertain", "second-guess"], intensity: 1, affinity: [0.15, 0.65, 0.15, 0.05], valence: -0.3 },
  { id: "isolation", triggers: ["isolation", "all alone", "withdrawn", "shut out"], intensity: 1, affinity: [0.2, 0.65, 0.1, 0.05], valence: -0.5 },
  { id: "stillness", triggers: ["stillness", "silence", "quiet moment", "motionless", "calm before"], intensity: 1, affinity: [0.25, 0.65, 0.05, 0.05], valence: 0.0 },

  // ── Turn-weighted beats (the break / pivot) ───────────────────────────────
  { id: "chase", triggers: ["chase", "chases", "chasing"], intensity: 3, affinity: [0.05, 0.2, 0.7, 0.05], valence: -0.3 },
  { id: "pursuit", triggers: ["pursuit", "pursues", "pursued", "on the run", "fleeing"], intensity: 2, affinity: [0.05, 0.25, 0.65, 0.05], valence: -0.3 },
  { id: "fight", triggers: ["fight", "fights", "attack", "attacks", "combat", "brawl", "shootout"], intensity: 3, affinity: [0.0, 0.1, 0.8, 0.1], valence: -0.5 },
  { id: "threat", triggers: ["threat", "threatens", "danger closes", "cornered"], intensity: 2, affinity: [0.05, 0.45, 0.45, 0.05], valence: -0.6 },
  { id: "breakdown", triggers: ["breakdown", "breaks down", "falls apart", "loses control"], intensity: 2, affinity: [0.0, 0.3, 0.55, 0.15], valence: -0.7 },
  { id: "realization", triggers: ["realizes", "realization", "it dawns", "understands at last"], intensity: 2, affinity: [0.0, 0.15, 0.7, 0.15], valence: -0.2 },
  { id: "confession", triggers: ["confess", "confesses", "confession", "admits", "admit", "admission", "finally tells", "comes clean"], intensity: 2, affinity: [0.0, 0.1, 0.8, 0.1], valence: 0.1 },
  { id: "revelation", triggers: ["reveals", "revelation", "the truth comes out", "discovers"], intensity: 3, affinity: [0.0, 0.05, 0.85, 0.1], valence: -0.3 },
  { id: "betrayal", triggers: ["betrayal", "betrays", "betrayed", "double-cross", "backstab", "sold out", "set me up", "framed", "forged"], intensity: 3, affinity: [0.0, 0.15, 0.75, 0.1], valence: -0.9 },
  { id: "revenge", triggers: ["revenge", "vengeance", "avenge", "avenges", "payback", "retribution", "gets even", "make him pay", "make her pay", "dismantle", "expose him", "expose her"], intensity: 3, affinity: [0.0, 0.1, 0.55, 0.35], valence: -0.8 },
  { id: "confrontation", triggers: ["confront", "confronts", "confrontation", "standoff", "face off", "showdown"], intensity: 2, affinity: [0.05, 0.2, 0.7, 0.05], valence: -0.4 },
  { id: "ultimatum", triggers: ["ultimatum", "demands", "draws a line", "now or never"], intensity: 2, affinity: [0.0, 0.1, 0.8, 0.1], valence: -0.4 },
  { id: "decision", triggers: ["decides", "decision", "chooses", "makes the call"], intensity: 2, affinity: [0.0, 0.1, 0.75, 0.15], valence: 0.1 },
  { id: "climax", triggers: ["climax", "the moment of truth", "everything hinges"], intensity: 3, affinity: [0.0, 0.05, 0.85, 0.1], valence: 0.0 },
  { id: "horror", triggers: ["horror", "terror", "nightmare", "gruesome", "grisly", "monstrous", "blood-curdling"], intensity: 3, affinity: [0.0, 0.5, 0.45, 0.05], valence: -0.9 },

  // ── Spanning / terminal beats ─────────────────────────────────────────────
  { id: "death", triggers: ["death", "dies", "dying", "killed", "passes away"], intensity: 3, affinity: [0.0, 0.2, 0.45, 0.35], valence: -0.8 },
  { id: "sacrifice", triggers: ["sacrifice", "sacrifices", "gives everything", "lays down", "throws himself", "throws herself", "takes the bullet", "shields them", "gives his life", "gives her life"], intensity: 3, affinity: [0.0, 0.1, 0.45, 0.45], valence: 0.2 },
  { id: "escape", triggers: ["escape", "escapes", "breaks free", "gets away"], intensity: 2, affinity: [0.0, 0.1, 0.7, 0.2], valence: 0.3 },

  // ── Release-weighted beats (resolution / payoff) ──────────────────────────
  { id: "victory", triggers: ["victory", "triumph", "triumphant", "wins", "prevails", "overcomes", "glory"], intensity: 3, affinity: [0.0, 0.0, 0.3, 0.7], valence: 0.9 },
  { id: "forgiveness", triggers: ["forgiveness", "forgive", "forgives", "forgave"], intensity: 3, affinity: [0.0, 0.0, 0.15, 0.85], valence: 0.9 },
  { id: "resolution", triggers: ["resolution", "resolves", "at peace", "settles their differences", "comes to rest"], intensity: 2, affinity: [0.0, 0.05, 0.2, 0.75], valence: 0.6 },
  { id: "acceptance", triggers: ["acceptance", "accepts", "lets go", "makes peace"], intensity: 2, affinity: [0.0, 0.1, 0.2, 0.7], valence: 0.5 },
  { id: "redemption", triggers: ["redemption", "redeemed", "redeems", "atones"], intensity: 3, affinity: [0.0, 0.05, 0.25, 0.7], valence: 0.8 },
  { id: "farewell", triggers: ["farewell", "goodbye", "leaves for the last time", "parting", "walks out", "storms off"], intensity: 2, affinity: [0.05, 0.2, 0.15, 0.6], valence: -0.3 },
  { id: "catharsis", triggers: ["catharsis", "cathartic", "lets it all out", "breaks open"], intensity: 3, affinity: [0.0, 0.05, 0.2, 0.75], valence: 0.5 },
  { id: "homecoming", triggers: ["homecoming", "finally home", "belonging"], intensity: 2, affinity: [0.05, 0.1, 0.15, 0.7], valence: 0.7 },
  { id: "kiss", triggers: ["kiss", "kisses", "embrace", "embraces", "first kiss"], intensity: 2, affinity: [0.05, 0.15, 0.25, 0.55], valence: 0.7 },
  { id: "celebration", triggers: ["celebration", "celebrate", "party", "rejoice"], intensity: 2, affinity: [0.0, 0.0, 0.2, 0.8], valence: 0.9 },
  { id: "joy", triggers: ["joy", "joyful", "elated", "jubilant", "overjoyed"], intensity: 1, affinity: [0.05, 0.05, 0.2, 0.7], valence: 0.8 },
  { id: "comedy", triggers: ["comedy", "comic", "comedic", "hilarious", "slapstick", "punchline"], intensity: 1, affinity: [0.2, 0.2, 0.3, 0.3], valence: 0.6 },
];

export interface AmplitudeModifier {
  triggers: string[];
  factor: number; // <1 suppresses, >1 amplifies
}

/** Emotional lexicon — adjectives/adverbs that scale a phase's amplitude. */
export const SUPPRESSORS: AmplitudeModifier[] = [
  { triggers: ["restrained", "restraint", "muted", "subdued", "understated", "contained", "hushed", "wordless", "tense silence", "held back"], factor: 0.82 },
  { triggers: ["quiet", "soft", "softly", "gentle", "tender", "tentative", "hesitant", "faint", "still", "calm"], factor: 0.95 },
  { triggers: ["cold", "distant", "numb", "guarded", "detached"], factor: 0.9 },
];

export const AMPLIFIERS: AmplitudeModifier[] = [
  { triggers: ["explosive", "violent", "furious", "desperate", "shattering", "overwhelming", "raw", "brutal"], factor: 1.2 },
  { triggers: ["intense", "fierce", "urgent", "heated", "charged", "searing"], factor: 1.12 },
  { triggers: ["sudden", "abrupt", "without warning"], factor: 1.1 },
];

export interface PacingMarker {
  triggers: string[];
  phase: "opening" | "heldBreath" | "turn" | "release";
  factor: number;
}

/** Narrative pacing markers — sharpen or lengthen a phase. */
export const PACING: PacingMarker[] = [
  { triggers: ["finally", "at last", "at long last"], phase: "turn", factor: 1.06 },
  { triggers: ["suddenly", "all at once", "without warning"], phase: "turn", factor: 1.08 },
  { triggers: ["builds", "building", "mounting", "escalating", "slowly builds"], phase: "turn", factor: 1.05 },
  { triggers: ["ends with", "ending with", "closes on", "fades to", "cuts to black", "final beat"], phase: "release", factor: 1.06 },
  { triggers: ["slowly", "gradually", "little by little", "lingers"], phase: "heldBreath", factor: 1.04 },
];
