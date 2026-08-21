import { describe, it, expect } from 'vitest';
import {
  arcMatchScore,
  arcBand,
  ARC_ORDER,
  ALIGN_THRESHOLD,
  ARC_BAND_LABEL,
  ARC_BAND_SENTENCE,
  type ArcSegments,
  type ArcBand,
} from './arcMatch';

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** Canonical example from the deck: "Never Letting Go" → score 93, Excellent. */
const SCENE: ArcSegments = { opening: 54, heldBreath: 44, turn: 70, release: 86 };
const SONG_EXCELLENT: ArcSegments = { opening: 49, heldBreath: 46, turn: 73, release: 82 };

/** One soft beat on release — expected score 88, Strong band. */
const SONG_STRONG: ArcSegments = { opening: 54, heldBreath: 44, turn: 70, release: 62 };

/** Clearly divergent — expected band Weak (score < 65). */
const SONG_WEAK: ArcSegments = { opening: 72, heldBreath: 70, turn: 48, release: 80 };

/** Identical to scene — perfect match, score 100. */
const SONG_PERFECT: ArcSegments = { ...SCENE };

/** Maximally divergent on every beat — should clamp to 0. */
const SONG_ZERO: ArcSegments = { opening: 100, heldBreath: 100, turn: 0, release: 0 };

// ── arcMatchScore ─────────────────────────────────────────────────────────────

describe('arcMatchScore', () => {
  it('returns 93 for the canonical deck example ("Never Letting Go")', () => {
    // gaps 5·2·3·4 → mean 3.5 → 100 − 7 = 93
    expect(arcMatchScore(SCENE, SONG_EXCELLENT)).toBe(93);
  });

  it('returns 100 for identical arcs (perfect match)', () => {
    expect(arcMatchScore(SCENE, SONG_PERFECT)).toBe(100);
  });

  it('clamps to 0 when the mean gap would drive the score negative', () => {
    // SCENE 54/44/70/86 vs SONG_ZERO 100/100/0/0
    // gaps: 46 + 56 + 70 + 86 = 258 → mean 64.5 → 100 − 129 = −29 → clamped 0
    expect(arcMatchScore(SCENE, SONG_ZERO)).toBe(0);
  });

  it('clamps to 100 (identity; never exceeds 100)', () => {
    expect(arcMatchScore(SONG_PERFECT, SONG_PERFECT)).toBe(100);
  });

  it('is symmetric — swapping scene and song gives the same score', () => {
    expect(arcMatchScore(SCENE, SONG_EXCELLENT)).toBe(arcMatchScore(SONG_EXCELLENT, SCENE));
  });

  it('is deterministic — same inputs always produce the same result', () => {
    const first = arcMatchScore(SCENE, SONG_EXCELLENT);
    const second = arcMatchScore(SCENE, SONG_EXCELLENT);
    expect(first).toBe(second);
  });

  it('returns an integer (Math.round applied)', () => {
    // mean gap for SCENE vs SONG_STRONG: 0+0+0+24=24 → mean 6 → 100-12=88
    const score = arcMatchScore(SCENE, SONG_STRONG);
    expect(Number.isInteger(score)).toBe(true);
  });

  it('returns 88 for the "Long Way Down" Strong candidate', () => {
    // SCENE vs SONG_STRONG: gaps 0·0·0·24 → mean 6 → 100 − 12 = 88
    expect(arcMatchScore(SCENE, SONG_STRONG)).toBe(88);
  });

  it('computes the score for SONG_WEAK below 65 (Weak band)', () => {
    // SCENE 54/44/70/86 vs SONG_WEAK 72/70/48/80
    // gaps: 18+26+22+6=72 → mean 18 → 100-36=64
    expect(arcMatchScore(SCENE, SONG_WEAK)).toBe(64);
  });

  it('handles zero values on all beats', () => {
    const zeros: ArcSegments = { opening: 0, heldBreath: 0, turn: 0, release: 0 };
    expect(arcMatchScore(zeros, zeros)).toBe(100);
  });

  it('handles maximum values on all beats', () => {
    const maxes: ArcSegments = { opening: 100, heldBreath: 100, turn: 100, release: 100 };
    expect(arcMatchScore(maxes, maxes)).toBe(100);
  });

  it('uses all four beats (opening, heldBreath, turn, release)', () => {
    const scene: ArcSegments = { opening: 0, heldBreath: 0, turn: 0, release: 0 };
    // Only opening differs by 10
    const songOpening: ArcSegments = { opening: 10, heldBreath: 0, turn: 0, release: 0 };
    // mean gap = 10/4 = 2.5 → 100 - 5 = 95
    expect(arcMatchScore(scene, songOpening)).toBe(95);

    // Only release differs by 10
    const songRelease: ArcSegments = { opening: 0, heldBreath: 0, turn: 0, release: 10 };
    expect(arcMatchScore(scene, songRelease)).toBe(95);
  });
});

// ── arcBand ───────────────────────────────────────────────────────────────────

describe('arcBand', () => {
  it('returns "excellent" for score 90', () => {
    expect(arcBand(90)).toBe('excellent');
  });

  it('returns "excellent" for score 100', () => {
    expect(arcBand(100)).toBe('excellent');
  });

  it('returns "strong" for score 89 (just below excellent threshold)', () => {
    expect(arcBand(89)).toBe('strong');
  });

  it('returns "strong" for score 78', () => {
    expect(arcBand(78)).toBe('strong');
  });

  it('returns "partial" for score 77 (just below strong threshold)', () => {
    expect(arcBand(77)).toBe('partial');
  });

  it('returns "partial" for score 65', () => {
    expect(arcBand(65)).toBe('partial');
  });

  it('returns "weak" for score 64 (just below partial threshold)', () => {
    expect(arcBand(64)).toBe('weak');
  });

  it('returns "weak" for score 0', () => {
    expect(arcBand(0)).toBe('weak');
  });

  it('returns "weak" for the "Breaking Chains" candidate score 64', () => {
    expect(arcBand(arcMatchScore(SCENE, SONG_WEAK))).toBe('weak');
  });

  it('returns "excellent" for the canonical "Never Letting Go" score 93', () => {
    expect(arcBand(93)).toBe('excellent');
  });

  it('returns correct band at each boundary threshold', () => {
    const cases: Array<[number, ArcBand]> = [
      [100, 'excellent'],
      [90, 'excellent'],
      [89, 'strong'],
      [78, 'strong'],
      [77, 'partial'],
      [65, 'partial'],
      [64, 'weak'],
      [0, 'weak'],
    ];
    for (const [score, expected] of cases) {
      expect(arcBand(score), `score ${score}`).toBe(expected);
    }
  });
});

// ── Constants ─────────────────────────────────────────────────────────────────

describe('ARC_ORDER', () => {
  it('contains exactly four elements', () => {
    expect(ARC_ORDER).toHaveLength(4);
  });

  it('is in narrative order: opening, heldBreath, turn, release', () => {
    expect(ARC_ORDER[0]).toBe('opening');
    expect(ARC_ORDER[1]).toBe('heldBreath');
    expect(ARC_ORDER[2]).toBe('turn');
    expect(ARC_ORDER[3]).toBe('release');
  });

  it('covers exactly the keys of ArcSegments', () => {
    const keys: ReadonlyArray<string> = ARC_ORDER;
    expect(keys).toContain('opening');
    expect(keys).toContain('heldBreath');
    expect(keys).toContain('turn');
    expect(keys).toContain('release');
  });
});

describe('ALIGN_THRESHOLD', () => {
  it('is 8', () => {
    expect(ALIGN_THRESHOLD).toBe(8);
  });

  it('marks a gap of exactly 8 as aligned (≤ threshold)', () => {
    expect(8 <= ALIGN_THRESHOLD).toBe(true);
  });

  it('marks a gap of 9 as divergent (> threshold)', () => {
    expect(9 <= ALIGN_THRESHOLD).toBe(false);
  });
});

describe('ARC_BAND_LABEL', () => {
  it('has a label for every band', () => {
    const bands: ArcBand[] = ['excellent', 'strong', 'partial', 'weak'];
    for (const band of bands) {
      expect(ARC_BAND_LABEL[band]).toBeTruthy();
    }
  });

  it('uses title-case labels', () => {
    expect(ARC_BAND_LABEL.excellent).toBe('Excellent');
    expect(ARC_BAND_LABEL.strong).toBe('Strong');
    expect(ARC_BAND_LABEL.partial).toBe('Partial');
    expect(ARC_BAND_LABEL.weak).toBe('Weak');
  });
});

describe('ARC_BAND_SENTENCE', () => {
  it('has a sentence for every band', () => {
    const bands: ArcBand[] = ['excellent', 'strong', 'partial', 'weak'];
    for (const band of bands) {
      expect(ARC_BAND_SENTENCE[band]).toBeTruthy();
    }
  });

  it('expresses the canonical banding lexicon from the deck', () => {
    expect(ARC_BAND_SENTENCE.excellent).toBe('Follows the scene almost exactly.');
    expect(ARC_BAND_SENTENCE.strong).toBe('Tracks the shape with one soft beat.');
    expect(ARC_BAND_SENTENCE.partial).toBe('The right feeling, the wrong moment.');
    expect(ARC_BAND_SENTENCE.weak).toBe('A different journey entirely.');
  });

  it('each sentence ends with a period', () => {
    for (const band of Object.keys(ARC_BAND_SENTENCE) as ArcBand[]) {
      expect(ARC_BAND_SENTENCE[band].endsWith('.')).toBe(true);
    }
  });
});

// ── Integration: arcMatchScore + arcBand ──────────────────────────────────────

describe('arcMatchScore + arcBand integration', () => {
  it('canonical deck candidates map to expected bands', () => {
    const SCENE_DECK: ArcSegments = { opening: 54, heldBreath: 44, turn: 70, release: 86 };

    // Never Letting Go → 93 → Excellent
    const s1 = arcMatchScore(SCENE_DECK, { opening: 49, heldBreath: 46, turn: 73, release: 82 });
    expect(s1).toBe(93);
    expect(arcBand(s1)).toBe('excellent');

    // Long Way Down → 88 → Strong
    const s2 = arcMatchScore(SCENE_DECK, { opening: 54, heldBreath: 44, turn: 70, release: 62 });
    expect(s2).toBe(88);
    expect(arcBand(s2)).toBe('strong');

    // Breaking Chains → 64 → Weak
    const s3 = arcMatchScore(SCENE_DECK, { opening: 72, heldBreath: 70, turn: 48, release: 80 });
    expect(s3).toBe(64);
    expect(arcBand(s3)).toBe('weak');
  });

  it('every band resolves to a non-empty label and sentence', () => {
    const pairs: Array<[ArcSegments, ArcSegments]> = [
      [SCENE, SONG_EXCELLENT],
      [SCENE, SONG_STRONG],
      [SCENE, SONG_WEAK],
    ];
    for (const [scene, song] of pairs) {
      const band = arcBand(arcMatchScore(scene, song));
      expect(ARC_BAND_LABEL[band].length).toBeGreaterThan(0);
      expect(ARC_BAND_SENTENCE[band].length).toBeGreaterThan(0);
    }
  });
});