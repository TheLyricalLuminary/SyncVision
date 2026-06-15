/**
 * arcExtraction.ts — deterministic Scene Arc extraction.
 *
 * Turns a scene description into an emotional shape by EXTRACTING signal from
 * the text — never generating it. Same text → identical output, always. No
 * randomness, no Date, no locale-sensitive ops, no LLM.
 *
 * Produces, at the v1 four-phase resolution:
 *   - a MAGNITUDE curve (0–100): Opening / Held Breath / Turn / Release
 *   - a VALENCE curve (−100…+100): emotional direction (grief vs triumph)
 *   - narrativeCertainty (0–1): how much rule-based signal was found
 *   - per-event PROVENANCE: which rule matched, the matched text, the sentence
 *
 * Pipeline:
 *   1. Normalize (NFKC + lowercase); split into sentences (positional placement).
 *   2. Detect narrative events (count, first offset, matched trigger, sentence).
 *   3. Accumulate intensity into phases via each event's AFFINITY; accumulate a
 *      valence-weighted sum in parallel.
 *   4. Add the category baseline floor (classifyBrief → briefPad).
 *   5. Apply emotional-lexicon multipliers POSITIONALLY (sentence's phase).
 *   6. Apply pacing markers to their declared phase.
 *   7. (optional) scene-param pacing modulation.
 *   8. Clamp/round magnitude to 0–100; derive the signed valence curve.
 *   9. Derive narrativeCertainty and the ordered signal list.
 *  10. Hash canonical inputs for an audit trail.
 *
 * The arc is represented as ArcVec=number[] so it can be resampled to align with
 * a song's 512-point timeline later (resampleCurve in arcTypes). v1 is 4 points.
 */

import { createHash } from "crypto";
import {
  PHASE_COUNT,
  PHASES,
  sentencePhaseIndex,
  signalLabel,
} from "./arcTypes";
import type { ArcVec } from "./arcTypes";
import {
  AMP,
  AMPLIFIERS,
  LEXICON_VERSION,
  NARRATIVE_EVENTS,
  PACING,
  SUPPRESSORS,
} from "./arcLexicon";
import type { AmplitudeModifier } from "./arcLexicon";
import { classifyBriefDetailed } from "./classifyBrief";
import type { BriefId } from "./classifyBrief";
import { categoryEnergy } from "./briefPad";

// ── Calibration constants (frozen with LEXICON_VERSION) ──────────────────────
const FLOOR_BASE = 38; // resting intensity for a zero-energy category
const FLOOR_ENERGY_SCALE = 18; // how much category energy lifts the floor (kept
// modest so a category misclassification can't blow up the arc — events drive shape)
const EVIDENCE_SAT = 107; // raw amplitude at which the evidence term saturates
const COVERAGE_MIN = 4; // per-phase accumulated mass that counts as "covered"
const CERT_W_EVIDENCE = 0.6;
const CERT_W_COVERAGE = 0.25;
const CERT_W_CLARITY = 0.15;

export interface SceneParamsInput {
  pacing?: "slow" | "mid" | "driving" | null;
  emotionalRegister?: string | null;
  sceneLengthSec?: number | null;
}

export interface DetectedEvent {
  id: string;
  label: string;
  matched: string; // the exact trigger phrase that fired (provenance)
  offset: number; // char offset of first match in normalized text
  sentence: number; // 1-based sentence number of first match (provenance)
  intensity: 1 | 2 | 3;
  count: number;
}

export interface SceneArcResult {
  // v1 named magnitude phases (the public surface)
  opening: number;
  heldBreath: number;
  turn: number;
  release: number;
  // expandable representation
  curve: ArcVec; // magnitude curve at the canonical resolution
  valenceCurve: ArcVec; // signed direction, −100…+100, same resolution
  phaseCount: number;
  // signal
  narrativeCertainty: number; // 0–1, two decimals
  signals: string[]; // detected event ids, ordered by first appearance
  events: DetectedEvent[]; // detailed detections with provenance
  category: BriefId | null;
  inputHash: string;
  lexiconVersion: string;
}

// ── Text helpers ─────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** All match offsets of a trigger in text. Multi-word → substring; single → \b. */
function matchOffsets(text: string, trigger: string): number[] {
  const offsets: number[] = [];
  if (trigger.includes(" ")) {
    let from = 0;
    for (;;) {
      const i = text.indexOf(trigger, from);
      if (i === -1) break;
      offsets.push(i);
      from = i + trigger.length;
    }
  } else {
    const re = new RegExp(`\\b${escapeRegExp(trigger)}\\b`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      offsets.push(m.index);
      if (m.index === re.lastIndex) re.lastIndex++; // guard zero-width
    }
  }
  return offsets;
}

interface Sentence {
  start: number;
  index: number;
}

function splitSentences(text: string): Sentence[] {
  const parts = text.split(/(?<=[.!?])\s+/);
  const sentences: Sentence[] = [];
  let cursor = 0;
  parts.forEach((part, index) => {
    const start = text.indexOf(part, cursor);
    const resolved = start === -1 ? cursor : start;
    sentences.push({ start: resolved, index });
    cursor = resolved + part.length;
  });
  return sentences;
}

/** 0-based sentence index containing `offset`. */
function sentenceOfOffset(offset: number, sentences: Sentence[]): number {
  let chosen = 0;
  for (const s of sentences) {
    if (offset >= s.start) chosen = s.index;
    else break;
  }
  return chosen;
}

function densityBonus(count: number): number {
  return Math.min(1, (count - 1) / 2); // 0 at 1, 0.5 at 2, 1.0 at ≥3
}

function clampRound(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function clampSigned(n: number): number {
  return Math.max(-100, Math.min(100, Math.round(n)));
}

function sortedJson(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      return Object.keys(val as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (val as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return val;
  });
}

// ── Core ─────────────────────────────────────────────────────────────────────

export function extractSceneArc(
  sceneText: string,
  sceneParams?: SceneParamsInput,
): SceneArcResult {
  const raw = sceneText ?? "";
  const realWords = raw.trim().split(/\s+/).filter((w) => w.length >= 2);

  // Guard: too little signal to extract anything → honest neutral arc.
  if (realWords.length < 2) {
    const flat = new Array(PHASE_COUNT).fill(50);
    return {
      opening: 50,
      heldBreath: 50,
      turn: 50,
      release: 50,
      curve: flat,
      valenceCurve: new Array(PHASE_COUNT).fill(0),
      phaseCount: PHASE_COUNT,
      narrativeCertainty: 0,
      signals: [],
      events: [],
      category: null,
      inputHash: hashInputs(raw, sceneParams),
      lexiconVersion: LEXICON_VERSION,
    };
  }

  const text = normalize(raw);
  const sentences = splitSentences(text);

  // ── 2. Detect events (with provenance) ──────────────────────────────────
  const detected: DetectedEvent[] = [];
  for (const ev of NARRATIVE_EVENTS) {
    let count = 0;
    let firstOffset = Infinity;
    let matched = "";
    for (const trigger of ev.triggers) {
      const offs = matchOffsets(text, trigger);
      if (offs.length > 0) {
        count += offs.length;
        if (offs[0] < firstOffset) {
          firstOffset = offs[0];
          matched = trigger;
        }
      }
    }
    if (count > 0) {
      detected.push({
        id: ev.id,
        label: signalLabel(ev.id),
        matched,
        offset: firstOffset,
        sentence: sentenceOfOffset(firstOffset, sentences) + 1,
        intensity: ev.intensity,
        count,
      });
    }
  }
  // Stable order: first appearance, then id.
  detected.sort((a, b) =>
    a.offset !== b.offset ? a.offset - b.offset : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );

  // ── 3. Accumulate magnitude + valence via affinity ──────────────────────
  const acc: ArcVec = new Array(PHASE_COUNT).fill(0);
  const valAcc: ArcVec = new Array(PHASE_COUNT).fill(0);
  let totalAmp = 0;
  const eventById = new Map(NARRATIVE_EVENTS.map((e) => [e.id, e]));
  for (const d of detected) {
    const ev = eventById.get(d.id)!;
    const amp = AMP[d.intensity] * (1 + densityBonus(d.count));
    totalAmp += amp;
    for (let p = 0; p < PHASE_COUNT; p++) {
      const contribution = amp * ev.affinity[p];
      acc[p] += contribution;
      valAcc[p] += contribution * ev.valence;
    }
  }

  // ── 4. Category baseline floor ──────────────────────────────────────────
  const classification = classifyBriefDetailed(text);
  const floor = FLOOR_BASE + FLOOR_ENERGY_SCALE * categoryEnergy(classification.id);
  const blended: ArcVec = acc.map((a) => floor + a);

  // ── 5. Emotional-lexicon multipliers (positional) ───────────────────────
  applyPositionalModifiers(blended, text, sentences, SUPPRESSORS);
  applyPositionalModifiers(blended, text, sentences, AMPLIFIERS);

  // ── 6. Pacing markers (declared phase) ──────────────────────────────────
  for (const marker of PACING) {
    const hit = marker.triggers.some((t) => matchOffsets(text, t).length > 0);
    if (hit) blended[PHASES.indexOf(marker.phase)] *= marker.factor;
  }

  // ── 7. Optional scene-param pacing modulation ───────────────────────────
  if (sceneParams?.pacing === "driving") {
    blended[2] *= 1.05; // turn
    blended[3] *= 1.03; // release
  } else if (sceneParams?.pacing === "slow") {
    blended[0] *= 1.02; // opening
    blended[1] *= 1.05; // held breath
  }

  // ── 8. Magnitude + valence curves ───────────────────────────────────────
  const curve: ArcVec = blended.map(clampRound);
  const valenceCurve: ArcVec = acc.map((a, p) =>
    a > 0 ? clampSigned((valAcc[p] / a) * 100) : 0,
  );

  // ── 9. Narrative certainty + signals ────────────────────────────────────
  const evidence = Math.min(1, totalAmp / EVIDENCE_SAT);
  let covered = 0;
  for (let p = 0; p < PHASE_COUNT; p++) if (acc[p] >= COVERAGE_MIN) covered++;
  const coverage = covered / PHASE_COUNT;
  const clarity = classification.top === 0 ? 0 : Math.min(1, classification.top / 3);
  const narrativeCertainty = Math.max(
    0,
    Math.min(
      1,
      Math.round(
        (CERT_W_EVIDENCE * evidence +
          CERT_W_COVERAGE * coverage +
          CERT_W_CLARITY * clarity) *
          100,
      ) / 100,
    ),
  );

  return {
    opening: curve[0],
    heldBreath: curve[1],
    turn: curve[2],
    release: curve[3],
    curve,
    valenceCurve,
    phaseCount: PHASE_COUNT,
    narrativeCertainty,
    signals: detected.map((d) => d.id),
    events: detected,
    category: classification.id,
    inputHash: hashInputs(raw, sceneParams),
    lexiconVersion: LEXICON_VERSION,
  };
}

function applyPositionalModifiers(
  blended: ArcVec,
  text: string,
  sentences: Sentence[],
  modifiers: AmplitudeModifier[],
): void {
  for (const mod of modifiers) {
    const phasesHit = new Set<number>();
    for (const trigger of mod.triggers) {
      for (const off of matchOffsets(text, trigger)) {
        phasesHit.add(sentencePhaseIndex(sentenceOfOffset(off, sentences), sentences.length));
      }
    }
    for (const p of phasesHit) blended[p] *= mod.factor;
  }
}

function hashInputs(sceneText: string, sceneParams?: SceneParamsInput): string {
  const stable = {
    sceneText: sceneText.trim(),
    lexiconVersion: LEXICON_VERSION,
    pacing: sceneParams?.pacing ?? null,
    emotionalRegister: sceneParams?.emotionalRegister ?? null,
  };
  return createHash("sha256").update(sortedJson(stable)).digest("hex");
}
