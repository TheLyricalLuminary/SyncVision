/**
 * Clearable one-stop library — REAL tracks.
 *
 * Every entry is a real, commercially-licensable recording under a
 * Creative Commons Attribution (CC BY) license. That makes each one a genuine
 * ONE-STOP: a single creator controls both master and composition, and the
 * license terms are public and verifiable — so a supervisor can clear it with
 * one step (credit the artist), at $0, for a paid production.
 *
 * This is the real-world answer to "the director's temp is a $250k master that
 * won't clear": production / CC catalogs, not commercial masters. These artists
 * (Kevin MacLeod, Chris Zabriskie, Kai Engel) are among the most-licensed
 * one-stop sources in film and TV for exactly this reason.
 *
 * Costs are $0 because CC BY is free-with-attribution — the strongest honest
 * clearance position there is. Each entry links to its source so the terms can
 * be confirmed before placement. Arcs are authored to each track's known
 * emotional character; when a real catalog/API is wired, these are replaced by
 * measured arcs from the mirror-search engine.
 */

export type ClearableTrack = {
  id: string;
  title: string;
  artist: string;
  /** Where to get and verify the track + license. */
  source: string;
  sourceUrl: string;
  /** e.g. "CC BY 4.0" — publicly verifiable, commercially usable. */
  license: string;
  attributionRequired: boolean;
  /** $0 for CC BY (free with attribution). */
  clearanceCostUsd: number;
  /** Why it's one-stop, in one line. */
  oneStopNote: string;
  tempo: number;
  tonalCharacter: string;
  energyCharacter: string;
  /** opening, heldBreath, turn, release — 0–100 energy intensity */
  arc: [number, number, number, number];
  /** opening, heldBreath, turn, release — -100..100 emotional direction */
  valence: [number, number, number, number];
};

const KMAC = 'Kevin MacLeod';
const KMAC_SRC = 'incompetech.com';
const KMAC_URL = 'https://incompetech.com/music/royalty-free/';
const ZAB = 'Chris Zabriskie';
const ZAB_SRC = 'chriszabriskie.com';
const ZAB_URL = 'https://chriszabriskie.com/';
const ENGEL = 'Kai Engel';
const ENGEL_SRC = 'Free Music Archive';
const ENGEL_URL = 'https://freemusicarchive.org/music/Kai_Engel/';

const CC = 'CC BY 4.0';

export const CLEARABLE_LIBRARY: ClearableTrack[] = [
  {
    id: 'clr-anguish',
    title: 'Anguish',
    artist: KMAC,
    source: KMAC_SRC, sourceUrl: KMAC_URL, license: CC, attributionRequired: true,
    clearanceCostUsd: 0,
    oneStopNote: 'Sole composer controls master + publishing; CC BY terms are public.',
    tempo: 60, tonalCharacter: 'minor, grieving', energyCharacter: 'sparse',
    arc: [40, 48, 62, 44],
    valence: [-30, -58, -64, -48],
  },
  {
    id: 'clr-thedescent',
    title: 'The Descent',
    artist: KMAC,
    source: KMAC_SRC, sourceUrl: KMAC_URL, license: CC, attributionRequired: true,
    clearanceCostUsd: 0,
    oneStopNote: 'Sole composer controls master + publishing; CC BY terms are public.',
    tempo: 90, tonalCharacter: 'dark, tense', energyCharacter: 'building dread',
    arc: [46, 60, 88, 58],
    valence: [-20, -48, -56, -30],
  },
  {
    id: 'clr-impactandante',
    title: 'Impact Andante',
    artist: KMAC,
    source: KMAC_SRC, sourceUrl: KMAC_URL, license: CC, attributionRequired: true,
    clearanceCostUsd: 0,
    oneStopNote: 'Sole composer controls master + publishing; CC BY terms are public.',
    tempo: 100, tonalCharacter: 'cinematic, tense', energyCharacter: 'mid swell',
    arc: [50, 66, 92, 64],
    valence: [-12, -34, -26, -4],
  },
  {
    id: 'clr-crypto',
    title: 'Crypto',
    artist: KMAC,
    source: KMAC_SRC, sourceUrl: KMAC_URL, license: CC, attributionRequired: true,
    clearanceCostUsd: 0,
    oneStopNote: 'Sole composer controls master + publishing; CC BY terms are public.',
    tempo: 120, tonalCharacter: 'driving, urgent', energyCharacter: 'high kinetic',
    arc: [56, 72, 97, 70],
    valence: [-14, -30, -18, 4],
  },
  {
    id: 'clr-awakening',
    title: 'Awakening',
    artist: KMAC,
    source: KMAC_SRC, sourceUrl: KMAC_URL, license: CC, attributionRequired: true,
    clearanceCostUsd: 0,
    oneStopNote: 'Sole composer controls master + publishing; CC BY terms are public.',
    tempo: 110, tonalCharacter: 'major, resolving', energyCharacter: 'building triumph',
    arc: [44, 56, 84, 92],
    valence: [14, 6, 40, 72],
  },
  {
    id: 'clr-divider',
    title: 'Divider',
    artist: ZAB,
    source: ZAB_SRC, sourceUrl: ZAB_URL, license: CC, attributionRequired: true,
    clearanceCostUsd: 0,
    oneStopNote: 'Artist self-releases; controls master + composition under CC BY.',
    tempo: 96, tonalCharacter: 'dark, brooding', energyCharacter: 'simmering build',
    arc: [45, 64, 90, 52],
    valence: [-18, -52, -58, -34],
  },
  {
    id: 'clr-cylinderfive',
    title: 'Cylinder Five',
    artist: ZAB,
    source: ZAB_SRC, sourceUrl: ZAB_URL, license: CC, attributionRequired: true,
    clearanceCostUsd: 0,
    oneStopNote: 'Artist self-releases; controls master + composition under CC BY.',
    tempo: 84, tonalCharacter: 'ambient, reflective', energyCharacter: 'unfolding',
    arc: [48, 56, 74, 60],
    valence: [2, -10, 10, 24],
  },
  {
    id: 'clr-preludeno2',
    title: 'Prelude No. 2',
    artist: ZAB,
    source: ZAB_SRC, sourceUrl: ZAB_URL, license: CC, attributionRequired: true,
    clearanceCostUsd: 0,
    oneStopNote: 'Artist self-releases; controls master + composition under CC BY.',
    tempo: 72, tonalCharacter: 'solo piano, wistful', energyCharacter: 'gentle',
    arc: [42, 52, 70, 55],
    valence: [-8, -30, -22, -6],
  },
  {
    id: 'clr-brooks',
    title: 'Brooks',
    artist: ENGEL,
    source: ENGEL_SRC, sourceUrl: ENGEL_URL, license: CC, attributionRequired: true,
    clearanceCostUsd: 0,
    oneStopNote: 'Sole composer; CC BY release on Free Music Archive.',
    tempo: 76, tonalCharacter: 'warm, tender', energyCharacter: 'lifting',
    arc: [40, 50, 68, 58],
    valence: [18, 8, 30, 44],
  },
];
