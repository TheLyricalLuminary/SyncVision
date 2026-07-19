import type { AnalysisResult, SceneArc, ArcMatchResult } from '../utils/apiClient';
import { scoreArcMatch } from './arcScore';
import { CLEARABLE_LIBRARY, type ClearableTrack } from './clearableLibrary';

const PHASE_LABELS = ['opening', 'held breath', 'turn', 'release'] as const;

export type PhaseDelta = { phase: string; temp: number; candidate: number; delta: number };

export type ClearableMatch = {
  track: ClearableTrack;
  arcMatch: ArcMatchResult;
  /** Per-phase magnitude deltas (candidate − temp), the falsifiable proof. */
  phaseDeltas: PhaseDelta[];
  /** The single tightest phase, for the headline proof line. */
  tightest: PhaseDelta;
  /** The loosest phase, so we never oversell. */
  loosest: PhaseDelta;
  /** Human-readable one-liner a supervisor can say out loud. */
  proof: string;
  savingsUsd: number | null;
};

/**
 * Given the temp track's measured DNA, rank the clearable one-stop library by
 * arc match. Uses the exact same scoreArcMatch as the rest of the app, so the
 * "% match" here is directly comparable to the Story Match score on screen.
 *
 * The temp's arc is compared to each candidate's arc DIRECTLY (temp-as-target),
 * because the supervisor's question is "what clears and sounds like the temp?",
 * not "what fits the brief?" — the temp already won the brief in the edit bay.
 */
export function matchClearableAlternatives(
  temp: AnalysisResult,
  sceneArc: SceneArc | null | undefined,
  opts?: { topN?: number; maxBudgetUsd?: number },
): ClearableMatch[] {
  const cs = temp.confidenceScore;

  // Target = the temp's measured magnitude + valence arc. Fall back to the
  // scene arc if the temp somehow has no curve (e.g. undecodable audio).
  const targetMag: number[] =
    cs.songArcCurve ??
    (sceneArc ? [sceneArc.opening, sceneArc.heldBreath, sceneArc.turn, sceneArc.release] : [40, 55, 72, 60]);
  const targetVal: number[] =
    cs.songArcValenceCurve ?? sceneArc?.valenceCurve ?? [0, 0, 0, 0];

  const tempCost = temp.rightsProfile?.splitPct != null ? null : null; // temp cost is unknown/prohibitive

  const matches = CLEARABLE_LIBRARY
    .filter(t => (opts?.maxBudgetUsd == null ? true : t.clearanceCostUsd <= opts.maxBudgetUsd))
    .map<ClearableMatch>(track => {
      const arcMatch = scoreArcMatch(targetMag, targetVal, track.arc, track.valence);
      const phaseDeltas: PhaseDelta[] = PHASE_LABELS.map((phase, i) => ({
        phase,
        temp: Math.round(targetMag[i] ?? 0),
        candidate: track.arc[i],
        delta: track.arc[i] - Math.round(targetMag[i] ?? 0),
      }));
      const byAbs = [...phaseDeltas].sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
      const tightest = byAbs[0];
      const loosest = byAbs[byAbs.length - 1];
      const proof =
        `Lands within Δ${Math.abs(tightest.delta)} of your temp at the ${tightest.phase}` +
        `, no phase off by more than Δ${Math.abs(loosest.delta)}. One-stop — clears in ${track.licenseTurnaround}.`;
      return {
        track,
        arcMatch,
        phaseDeltas,
        tightest,
        loosest,
        proof,
        savingsUsd: tempCost != null ? tempCost - track.clearanceCostUsd : null,
      };
    })
    .sort((a, b) => b.arcMatch.combinedScore - a.arcMatch.combinedScore);

  return matches.slice(0, opts?.topN ?? 3);
}
