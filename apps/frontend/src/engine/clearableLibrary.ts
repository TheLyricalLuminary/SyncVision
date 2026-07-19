/**
 * Clearable one-stop library — the demo-mode replacement catalog.
 *
 * Every entry is a ONE-STOP, pre-cleared production/library cue: a single
 * rights holder controls both master and publishing, so a supervisor can
 * license it with one signature, fast, at a known cost. These are the tracks
 * you reach for when the director's temp is a $250k major-label master that
 * will never clear.
 *
 * Each cue carries a hand-authored emotional arc (opening / heldBreath / turn
 * / release, 0–100) and a 4-point valence curve (-100..100), so the recommender
 * can rank them against a temp track's measured DNA using the exact same
 * arc-match math the rest of the app uses.
 *
 * These are FICTIONAL library cues (not real commercial recordings). In
 * production this list is replaced by a fingerprinted catalog queried through
 * the backend mirror-search engine.
 */

export type ClearableTrack = {
  id: string;
  title: string;
  artist: string;         // library / composer credit
  publisher: string;      // one-stop rights holder
  proAffiliation: string;
  tempo: number;
  tonalCharacter: string;
  energyCharacter: string;
  clearanceCostUsd: number;
  licenseTurnaround: string; // e.g. "24–48h"
  /** opening, heldBreath, turn, release — 0–100 energy intensity */
  arc: [number, number, number, number];
  /** opening, heldBreath, turn, release — -100..100 emotional direction */
  valence: [number, number, number, number];
};

export const CLEARABLE_LIBRARY: ClearableTrack[] = [
  {
    id: 'clr-embertide',
    title: 'Embertide',
    artist: 'Halden Vore',
    publisher: 'Northlight One-Stop',
    proAffiliation: 'ASCAP',
    tempo: 72,
    tonalCharacter: 'minor, aching',
    energyCharacter: 'slow build',
    clearanceCostUsd: 2500,
    licenseTurnaround: '24–48h',
    arc: [48, 58, 96, 60],
    valence: [-4, -50, -46, -18],
  },
  {
    id: 'clr-glasshour',
    title: 'Glass Hour',
    artist: 'Mira Sennett',
    publisher: 'Northlight One-Stop',
    proAffiliation: 'ASCAP',
    tempo: 84,
    tonalCharacter: 'minor, wistful',
    energyCharacter: 'mid swell',
    clearanceCostUsd: 3200,
    licenseTurnaround: '24–48h',
    arc: [52, 61, 88, 66],
    valence: [8, -38, -30, -6],
  },
  {
    id: 'clr-lastmile',
    title: 'The Last Mile',
    artist: 'Cody Renn',
    publisher: 'Redline Sync (one-stop)',
    proAffiliation: 'BMI',
    tempo: 128,
    tonalCharacter: 'driving, tense',
    energyCharacter: 'high kinetic',
    clearanceCostUsd: 4000,
    licenseTurnaround: '48h',
    arc: [55, 70, 98, 72],
    valence: [-10, -30, -20, 6],
  },
  {
    id: 'clr-afterlight',
    title: 'Afterlight',
    artist: 'Selah Brooks',
    publisher: 'Meridian One-Stop',
    proAffiliation: 'SESAC',
    tempo: 68,
    tonalCharacter: 'warm, tender',
    energyCharacter: 'gentle',
    clearanceCostUsd: 1800,
    licenseTurnaround: '24h',
    arc: [40, 50, 70, 55],
    valence: [20, 8, 30, 44],
  },
  {
    id: 'clr-undertow',
    title: 'Undertow',
    artist: 'Kane Whitlock',
    publisher: 'Redline Sync (one-stop)',
    proAffiliation: 'BMI',
    tempo: 96,
    tonalCharacter: 'dark, brooding',
    energyCharacter: 'simmering',
    clearanceCostUsd: 2900,
    licenseTurnaround: '48h',
    arc: [45, 64, 90, 52],
    valence: [-18, -55, -60, -34],
  },
  {
    id: 'clr-highbeam',
    title: 'Highbeam',
    artist: 'The Ossature',
    publisher: 'Meridian One-Stop',
    proAffiliation: 'ASCAP',
    tempo: 140,
    tonalCharacter: 'urgent, electric',
    energyCharacter: 'relentless',
    clearanceCostUsd: 4500,
    licenseTurnaround: '48h',
    arc: [60, 74, 99, 80],
    valence: [-6, -22, -8, 18],
  },
  {
    id: 'clr-paperkite',
    title: 'Paper Kite',
    artist: 'Ivy Marsh',
    publisher: 'Northlight One-Stop',
    proAffiliation: 'ASCAP',
    tempo: 100,
    tonalCharacter: 'bright, hopeful',
    energyCharacter: 'lifting',
    clearanceCostUsd: 2200,
    licenseTurnaround: '24–48h',
    arc: [42, 55, 82, 88],
    valence: [30, 20, 50, 72],
  },
  {
    id: 'clr-ironwill',
    title: 'Iron Will',
    artist: 'Marcus Vale',
    publisher: 'Redline Sync (one-stop)',
    proAffiliation: 'BMI',
    tempo: 112,
    tonalCharacter: 'anthemic, resolute',
    energyCharacter: 'building triumph',
    clearanceCostUsd: 3800,
    licenseTurnaround: '48h',
    arc: [50, 62, 90, 95],
    valence: [10, 4, 40, 78],
  },
  {
    id: 'clr-hollowroom',
    title: 'Hollow Room',
    artist: 'Elise Kadar',
    publisher: 'Meridian One-Stop',
    proAffiliation: 'SESAC',
    tempo: 60,
    tonalCharacter: 'sparse, grieving',
    energyCharacter: 'still',
    clearanceCostUsd: 1500,
    licenseTurnaround: '24h',
    arc: [35, 42, 58, 40],
    valence: [-30, -62, -70, -55],
  },
  {
    id: 'clr-nightferry',
    title: 'Night Ferry',
    artist: 'Sound of Thurso',
    publisher: 'Northlight One-Stop',
    proAffiliation: 'ASCAP',
    tempo: 90,
    tonalCharacter: 'nocturnal, longing',
    energyCharacter: 'mid pulse',
    clearanceCostUsd: 2700,
    licenseTurnaround: '24–48h',
    arc: [50, 60, 92, 64],
    valence: [-2, -44, -40, -14],
  },
  {
    id: 'clr-signalfire',
    title: 'Signal Fire',
    artist: 'Bram Ostara',
    publisher: 'Redline Sync (one-stop)',
    proAffiliation: 'BMI',
    tempo: 120,
    tonalCharacter: 'tense, propulsive',
    energyCharacter: 'chase',
    clearanceCostUsd: 3500,
    licenseTurnaround: '48h',
    arc: [56, 72, 97, 70],
    valence: [-12, -34, -24, 2],
  },
  {
    id: 'clr-slowdawn',
    title: 'Slow Dawn',
    artist: 'Wren Halloway',
    publisher: 'Meridian One-Stop',
    proAffiliation: 'SESAC',
    tempo: 76,
    tonalCharacter: 'reflective, warm',
    energyCharacter: 'unfolding',
    clearanceCostUsd: 2000,
    licenseTurnaround: '24h',
    arc: [44, 54, 76, 68],
    valence: [12, -6, 24, 46],
  },
];
