import type { ArcMatchResult } from '../utils/apiClient';

/**
 * The single arc-match scoring function used everywhere in the app — Story
 * Match ranking, measured/modeled arcs, and the clearable-alternatives
 * recommender. One formula so every "match %" on screen is comparable and
 * auditable.
 *
 * magnitudeScore — how closely the energy shape tracks the target (0–100)
 * valenceScore   — how closely the emotional direction tracks (0–100)
 * combinedScore  — 0.65·shape + 0.35·valence, the headline number
 */
export function scoreArcMatch(
  targetMagnitude: number[],
  targetValence: number[],
  songMagnitude: number[],
  songValence: number[],
): ArcMatchResult {
  const n = Math.min(targetMagnitude.length, songMagnitude.length) || 1;

  let magGap = 0;
  for (let i = 0; i < n; i++) magGap += Math.abs(targetMagnitude[i] - songMagnitude[i]);
  const meanMagGap = magGap / n;
  const magnitudeScore = Math.max(0, Math.min(100, Math.round(100 - 2 * meanMagGap)));

  const vn = Math.min(targetValence.length, songValence.length) || 1;
  let valGap = 0;
  for (let i = 0; i < vn; i++) valGap += Math.abs((targetValence[i] ?? 0) - (songValence[i] ?? 0));
  const meanValGap = valGap / vn;
  const valenceScore = Math.max(0, Math.min(100, Math.round(100 - meanValGap)));

  const combinedScore = Math.round(magnitudeScore * 0.65 + valenceScore * 0.35);
  return { magnitudeScore, valenceScore, combinedScore };
}
