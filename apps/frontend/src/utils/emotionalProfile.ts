import type { AnalysisResult, SceneArc, SceneParams } from './apiClient';
import { cleanTrackTitle } from './trackTitle';
import { matchClearableAlternatives } from '../engine/matchClearable';

// The downloadable "emotional profile" — the DNA of a scene/track match.
// Purpose: when a temp track is too expensive to clear, this file captures its
// structural-emotional fingerprint AND the ranked clearable one-stop cues that
// match it — so the file is an actionable replacement brief, not a dead-end.

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
  /** Ranked clearable one-stop cues whose DNA matches this track's arc. */
  clearableAlternatives: {
    title: string;
    artist: string;
    oneStop: true;
    license: string;
    attributionRequired: boolean;
    source: string;
    sourceUrl: string;
    clearanceCostUsd: number;
    arcMatchPct: number;
    phaseDeltas: { phase: string; temp: number; candidate: number; delta: number }[];
  }[];
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
      title: cleanTrackTitle(result.track.title),
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
    clearableAlternatives: matchClearableAlternatives(result, sceneArc, { topN: 3 }).map(m => ({
      title: m.track.title,
      artist: m.track.artist,
      oneStop: true,
      license: m.track.license,
      attributionRequired: m.track.attributionRequired,
      source: m.track.source,
      sourceUrl: m.track.sourceUrl,
      clearanceCostUsd: m.track.clearanceCostUsd,
      arcMatchPct: m.arcMatch.combinedScore,
      phaseDeltas: m.phaseDeltas,
    })),
  };
}

export async function downloadEmotionalProfile(profile: EmotionalProfile): Promise<void> {
  const safe = profile.track.title.replace(/[^a-z0-9\-_ ]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'track';
  const filename = `emotional-profile-${safe}.json`;
  const json = JSON.stringify(profile, null, 2);
  const blob = new Blob([json], { type: 'application/json' });

  // Mobile browsers frequently ignore the anchor `download` attribute for blob
  // URLs and just navigate to the raw JSON. When the Web Share API can share
  // files, use it — that opens the native "Save to Files / share" sheet.
  try {
    const file = new File([blob], filename, { type: 'application/json' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (typeof navigator.share === 'function' && nav.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename, text: 'SyncVision emotional profile (DNA)' });
      return;
    }
  } catch {
    // user cancelled the share sheet, or share failed — fall through to download
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
