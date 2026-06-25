/**
 * NarrativeFitStudio — flagship experience for narrative alignment.
 *
 * Makes SyncVision immediately understandable to a music supervisor
 * within 30 seconds.
 *
 * Primary object: narrative alignment between scene arc and song arc.
 * Secondary: SCDE constraint diagnostics.
 *
 * Layout:
 *   1. Hero arc canvas (scene arc vs selected song arc)
 *   2. Verdict + divergence detail (two columns)
 *   3. Candidate track rail (horizontal selection)
 *   4. SCDE diagnostic (why catalog narrowed)
 */

import { useState } from 'react';
import type { AnalysisResult, SceneArc, SceneParams } from '../utils/apiClient';
import type { BriefId } from '../engine/classifyBrief';
import { BRIEF_LABELS } from '../engine/classifyBrief';
import { NarrativeArcCanvas, computeDivergenceSegments } from '../components/NarrativeArcCanvas';
import { NarrativeFitVerdict } from '../components/NarrativeFitVerdict';
import { CandidateArcRail } from '../components/CandidateArcRail';
import { SCDEPanel } from '../components/SCDEPanel';

const C = {
  magenta:  '#DB2777',
  amber:    '#F5B544',
  lavender: '#9B93C4',
  silver:   '#F4F2FA',
  good:     '#4CAF82',
  bad:      '#E85A5A',
  hairline: 'rgba(123,112,178,0.13)',
  bg:       '#0D0B1E',
};

const SANS  = '"Manrope", system-ui, sans-serif';
const MONO  = '"JetBrains Mono", monospace';
const SERIF = '"Instrument Serif", Georgia, serif';

const BG = `radial-gradient(1100px 700px at 5% 0%, rgba(219,39,119,0.08), transparent 55%), radial-gradient(900px 600px at 100% 100%, rgba(245,181,68,0.07), transparent 55%), #0D0B1E`;

type Props = {
  briefText: string;
  briefId: BriefId;
  sceneParams: SceneParams;
  sceneArc: SceneArc | null;
  results: AnalysisResult[];
  onBack?: () => void;
  readOnly?: boolean;
};

function DivergenceDetail({ sceneArc, songArcCurve }: { sceneArc: SceneArc | null; songArcCurve: number[] }) {
  const segments = computeDivergenceSegments(sceneArc, songArcCurve.slice(0, 4));

  const [sO, sH, sT, sR] = sceneArc
    ? [sceneArc.opening, sceneArc.heldBreath, sceneArc.turn, sceneArc.release]
    : [40, 55, 75, 55];
  const [nO, nH, nT, nR] = songArcCurve.slice(0, 4);

  const peakTimingDelta   = Math.abs(nT - sT);
  const releaseTimingDelta = Math.abs(nR - sR);
  const trajectoryDev     = ([nO - sO, nH - sH, nT - sT, nR - sR].reduce((a, b) => a + Math.abs(b), 0)) / 4;

  function deltaLabel(delta: number): { text: string; color: string } {
    if (delta < 8)  return { text: 'Aligned', color: C.good };
    if (delta < 20) return { text: `±${Math.round(delta)} pts`, color: C.amber };
    return { text: `${Math.round(delta)} pts off`, color: C.bad };
  }

  const peakLabel      = deltaLabel(peakTimingDelta);
  const releaseLabel   = deltaLabel(releaseTimingDelta);
  const trajectoryLabel = deltaLabel(trajectoryDev);

  const items = [
    {
      key: 'peak',
      label: 'Peak timing delta',
      ...peakLabel,
      tooltip: peakTimingDelta < 8
        ? 'Song and scene reach peak intensity at the same narrative moment.'
        : peakTimingDelta < 20
          ? `Song emotional peak deviates ${Math.round(peakTimingDelta)} points from the scene's climax.`
          : `Peak misalignment is significant — song and scene reach maximum intensity at different moments.`,
    },
    {
      key: 'release',
      label: 'Release timing delta',
      ...releaseLabel,
      tooltip: releaseTimingDelta < 8
        ? 'Emotional release aligns with the scene resolution phase.'
        : releaseTimingDelta < 20
          ? `Release phase intensity differs by ${Math.round(releaseTimingDelta)} points from the scene.`
          : releaseTimingDelta > 20
            ? `Resolution phase maintains too high intensity — decay is absent.`
            : `Emotional release collapses below the scene — resolution is cut short.`,
    },
    {
      key: 'trajectory',
      label: 'Emotional trajectory',
      ...trajectoryLabel,
      tooltip: trajectoryDev < 8
        ? 'Emotional trajectory matches the scene across all narrative phases.'
        : trajectoryDev < 20
          ? `Mean deviation of ${Math.round(trajectoryDev)} points — the song follows the shape with occasional drift.`
          : `Emotional trajectory diverges significantly — a different journey than the scene requires.`,
    },
  ];

  return (
    <div style={{
      borderRadius: 14,
      background: 'rgba(7,4,26,0.65)',
      border: `1px solid ${C.hairline}`,
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
    }}>
      <div style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender, fontFamily: SANS, marginBottom: 14 }}>
        Divergence Detail
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {items.map(item => (
          <div key={item.key}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: C.lavender, fontFamily: SANS }}>{item.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: item.color }}>{item.text}</span>
            </div>
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(244,242,250,0.65)', fontFamily: SANS, lineHeight: 1.55 }}>
              {item.tooltip}
            </p>
          </div>
        ))}
      </div>

      {/* curve distance summary */}
      <div style={{
        marginTop: 16,
        paddingTop: 14,
        borderTop: `1px solid ${C.hairline}`,
      }}>
        <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.lavender, fontFamily: SANS, marginBottom: 6 }}>
          Overall arc distance
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            flex: 1, height: 5, borderRadius: 3,
            background: 'rgba(123,112,178,0.10)',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${Math.min(100, trajectoryDev / 50 * 100)}%`,
              height: '100%',
              borderRadius: 3,
              background: trajectoryDev < 8 ? C.good : trajectoryDev < 20 ? C.amber : C.bad,
            }} />
          </div>
          <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 11, color: 'rgba(155,147,196,0.65)', whiteSpace: 'nowrap' }}>
            {trajectoryDev < 8 ? 'Closely aligned' : trajectoryDev < 20 ? 'Moderate drift' : 'Strong divergence'}
          </span>
        </div>
      </div>
    </div>
  );
}

export function NarrativeFitStudio({
  briefText, briefId, sceneParams, sceneArc, results, onBack, readOnly,
}: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  const selected     = results[selectedIdx];
  const songArcCurve = selected?.confidenceScore.songArcCurve ?? [];
  const arcMatch     = selected?.confidenceScore.arcMatch;

  const cleanTitle = (raw: string) => {
    let t = raw
      .replace(/^[0-9a-f]{6,}_/i, '')
      .replace(/_/g, ' ')
      .replace(/\.(mp3|wav|flac|aiff?)$/i, '')
      .replace(/\b(Official\s+Video|Official\s+Audio|Lyric\s+Video|HD|HQ|4K|Audio|Video)\b/gi, '')
      .replace(/\s{2,}/g, ' ').trim();
    if (t.includes(' - ')) t = t.slice(t.indexOf(' - ') + 3).trim();
    return t || raw;
  };

  const selectedTitle = selected ? cleanTitle(selected.track.title) : '';
  const briefLabel    = BRIEF_LABELS[briefId] ?? briefId;

  return (
    <div style={{
      minHeight: '100vh',
      background: BG,
      fontFamily: SANS,
      padding: '0 0 40px',
      boxSizing: 'border-box',
    }}>
      {/* ── header bar ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 24px',
        background: 'rgba(13,11,30,0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${C.hairline}`,
      }}>
        {/* left: back + identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {onBack && !readOnly && (
            <button
              onClick={onBack}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                display: 'flex', alignItems: 'center', gap: 6,
                color: C.lavender, fontSize: 12, fontFamily: SANS,
              }}
              aria-label="Back"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L5 8L10 13" stroke={C.lavender} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back
            </button>
          )}
          <div>
            <div style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.magenta, fontFamily: SANS }}>
              Narrative Fit Studio
            </div>
            <div style={{ fontSize: 12, color: C.lavender, marginTop: 1 }}>
              {briefLabel}
            </div>
          </div>
        </div>

        {/* center: primary question */}
        <div style={{
          fontSize: 13, fontFamily: SERIF, fontStyle: 'italic',
          color: 'rgba(244,242,250,0.70)',
          textAlign: 'center',
          flex: 1,
          padding: '0 20px',
        }}>
          Does this song tell the same story as the scene?
        </div>

        {/* right: selected track */}
        <div style={{ textAlign: 'right', minWidth: 120 }}>
          {selectedTitle && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.silver, letterSpacing: '-0.005em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>
                {selectedTitle}
              </div>
              <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.lavender, marginTop: 2 }}>
                {results.length} {results.length === 1 ? 'candidate' : 'candidates'}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── content ── */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── 1. PRIMARY TAGLINE ── */}
        <div style={{ textAlign: 'center', padding: '8px 0 0' }}>
          <div style={{ fontSize: 9, letterSpacing: '0.26em', textTransform: 'uppercase', color: C.magenta, fontFamily: SANS, marginBottom: 8 }}>
            Narrative Arc Alignment
          </div>
          <h1 style={{
            margin: 0, fontSize: 'clamp(22px, 4vw, 32px)',
            fontFamily: SERIF, fontWeight: 400, color: C.silver,
            lineHeight: 1.25, letterSpacing: '-0.01em',
          }}>
            Scene arc <em>versus</em> song arc
          </h1>
          <p style={{
            margin: '10px auto 0', maxWidth: 520, fontSize: 14,
            color: 'rgba(155,147,196,0.80)', lineHeight: 1.6, fontFamily: SANS,
          }}>
            SyncVision shows whether a song tells the same story as the scene — not whether it scores well.
          </p>
        </div>

        {/* ── 2. HERO ARC CANVAS ── */}
        <NarrativeArcCanvas
          sceneArc={sceneArc}
          songArcCurve={songArcCurve}
          arcMatch={arcMatch}
          sceneLengthSec={sceneParams.sceneLengthSec}
        />

        {/* ── 3. VERDICT + DIVERGENCE (two columns) ── */}
        {selected && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}>
            <NarrativeFitVerdict
              sceneArc={sceneArc}
              songArcCurve={songArcCurve}
              arcMatch={arcMatch}
              trackTitle={selected.track.title}
            />
            <DivergenceDetail
              sceneArc={sceneArc}
              songArcCurve={songArcCurve}
            />
          </div>
        )}

        {/* ── 4. CANDIDATE TRACK RAIL ── */}
        {results.length > 0 && (
          <div style={{
            borderRadius: 14,
            background: 'rgba(7,4,26,0.55)',
            border: `1px solid ${C.hairline}`,
            padding: '16px 18px',
          }}>
            <CandidateArcRail
              results={results}
              sceneArc={sceneArc}
              selectedIdx={selectedIdx}
              onSelect={setSelectedIdx}
            />
          </div>
        )}

        {/* ── 5. SCDE DIAGNOSTIC ── */}
        <SCDEPanel results={results} />

        {/* ── 6. FOOTER PRINCIPLE ── */}
        <div style={{
          textAlign: 'center',
          padding: '20px 0 0',
          borderTop: `1px solid ${C.hairline}`,
        }}>
          <p style={{
            margin: 0, fontSize: 12, fontFamily: SERIF, fontStyle: 'italic',
            color: 'rgba(155,147,196,0.45)', lineHeight: 1.7,
          }}>
            A supervisor should know within 30 seconds: why this song fits, why another fails,
            why the catalog narrows, and what requirement causes scarcity.
          </p>
        </div>
      </div>
    </div>
  );
}
