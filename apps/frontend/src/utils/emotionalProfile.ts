import type { AnalysisResult, SceneArc, SceneParams } from './apiClient';

// The downloadable "emotional profile" — the DNA of a scene/track match.
// Purpose: when a temp track is too expensive to clear, this file captures its
// structural-emotional fingerprint so a supervisor can search for a clearable
// track with the same shape.

export type EmotionalProfile = {
  format: 'syncvision-emotional-profile';
  version: 1;
  generatedAt: string;
  scene: {
    briefText: string;
    briefId: string;
    pacing: string | null;
    emotionalRegister: string | null;
    sceneLengthSec: number | null;
    arc: {
      phases: { opening: number; heldBreath: number; turn: number; release: number };
      magnitudeCurve: number[];
      valenceCurve: number[];
      narrativeCertainty: number;
      signals: string[];
      category: string | null;
    } | null;
  };
  track: {
    title: string;
    artistName: string | null;
    isrc: string | null;
    tempo: number | null;
    tonalCharacter: string | null;
    energyCharacter: string | null;
    arc: {
      magnitudeCurve: number[]; // 0–100 per phase: opening, heldBreath, turn, release
      valenceCurve: number[];   // -100..100 per phase
      /** 'measured' = extracted from the audio signal; 'modeled' = deterministic estimate. */
      source: 'measured' | 'modeled';
      /** 32-point normalized DSP curves — present only when source is 'measured'. */
      fineCurves: { energy: number[]; brightness: number[] } | null;
    } | null;
  };
  match: {
    arcMatch: { magnitudeScore: number; valenceScore: number; combinedScore: number } | null;
    fitVector: { scene: number; lyrics: number; audioSignal: number; rightsClarity: number };
    fitIndex: number;
    explanation: string;
    phaseDeltas: { phase: string; scene: number; track: number; delta: number }[] | null;
  };
};

const PHASE_KEYS = ['opening', 'heldBreath', 'turn', 'release'] as const;

export function buildEmotionalProfile(
  result: AnalysisResult,
  sceneArc: SceneArc | null | undefined,
  briefText: string,
  briefId: string,
  sceneParams: SceneParams,
): EmotionalProfile {
  const cs = result.confidenceScore;
  const songCurve = cs.songArcCurve ?? null;

  const phaseDeltas = sceneArc && songCurve
    ? PHASE_KEYS.map((k, i) => ({
        phase: k,
        scene: sceneArc[k],
        track: songCurve[i],
        delta: songCurve[i] - sceneArc[k],
      }))
    : null;

  return {
    format: 'syncvision-emotional-profile',
    version: 1,
    generatedAt: new Date().toISOString(),
    scene: {
      briefText,
      briefId,
      pacing: sceneParams.pacing,
      emotionalRegister: sceneParams.emotionalRegister,
      sceneLengthSec: sceneParams.sceneLengthSec,
      arc: sceneArc
        ? {
            phases: {
              opening: sceneArc.opening,
              heldBreath: sceneArc.heldBreath,
              turn: sceneArc.turn,
              release: sceneArc.release,
            },
            magnitudeCurve: sceneArc.curve,
            valenceCurve: sceneArc.valenceCurve,
            narrativeCertainty: sceneArc.narrativeCertainty,
            signals: sceneArc.signals,
            category: sceneArc.category,
          }
        : null,
    },
    track: {
      title: result.track.title,
      artistName: result.track.artistName,
      isrc: result.track.isrc,
      tempo: result.track.tempo,
      tonalCharacter: result.track.tonalCharacter,
      energyCharacter: result.track.energyCharacter,
      arc: songCurve
        ? {
            magnitudeCurve: songCurve,
            valenceCurve: cs.songArcValenceCurve ?? [],
            source: cs.arcSource ?? 'modeled',
            fineCurves: cs.songArcFineCurves ?? null,
          }
        : null,
    },
    match: {
      arcMatch: cs.arcMatch ?? null,
      fitVector: cs.vector,
      fitIndex: cs.score,
      explanation: cs.explanation,
      phaseDeltas,
    },
  };
}

export function downloadEmotionalProfile(profile: EmotionalProfile): void {
  const safe = profile.track.title.replace(/[^a-z0-9\-_ ]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'track';
  const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `emotional-profile-${safe}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
