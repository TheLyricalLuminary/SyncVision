// apps/frontend/src/pages/ShareView.tsx
// Read-only decision-packet view — share view and print/PDF surface share this file.
// Graphs render identically in HTML and @media print via CSS only (no canvas).
import { useEffect, useRef, useState, useMemo } from 'react';
import QRCode from 'qrcode';
import { API_BASE } from '../utils/apiClient';

// ─── Exported types (consumed by App.tsx) ────────────────────────────────────

export type AgreementState = 'AGREE' | 'SINGLE_SOURCE' | 'CONFLICT' | 'MISSING';

export interface SourcedValue {
  value:      string | number | boolean | null;
  source:     string;
  confidence: number;
}

export type RightsFieldName =
  | 'writer' | 'split_pct' | 'publisher'
  | 'isrc'   | 'iswc'      | 'pro_affiliation' | 'ipi';

export interface RightsFieldLedger {
  field:          RightsFieldName;
  entries:        SourcedValue[];
  agreementState: AgreementState;
}

export interface PipelineStatus {
  stage:     string;
  completed: boolean;
}

export interface TrackSlot {
  trackId:      string;
  title:        string;
  artistName:   string | null;
  rank:         number;
  fitIndex:     number;
  vector:       { scene: number; rights: number; lyrics: number; signal: number };
  axisWeights:  { scene: number; rights: number; lyrics: number; signal: number };
  explanation:  string;
  tempo:        number | null;
  tonalCharacter:  string | null;
  energyCharacter: string | null;
  isrc:         string | null;
  rightsState:  string | null;
  rightsLedger: RightsFieldLedger[];
  rightsAggregate: { totalFields: number; confirmedFields: number; conflicts: number; missing: number };
  pipeline:     PipelineStatus[];
  inputHash:    string;
  audioToken:      string | null;
  audioExpiresAt:  string | null;
}

export interface DecisionPacket {
  packetId:       string;
  packetVersion:  '1';
  scoringVersion: string;
  briefId:        string;
  briefText:      string;
  sceneParams:    { pacing: string | null; emotionalRegister: string | null; sceneLengthSec: number | null };
  briefWeightProfile: { sceneFit: number; rightsClarity: number; metadata: number } | null;
  createdAt:      string;
  expiresAt:      string;
  tracks:         TrackSlot[];
  totalConfirmed: number;
  totalConflicts: number;
  totalMissing:   number;
  packetHash:     string;
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:            '#0D0B1E',
  bg2:           '#170B33',
  purple:        '#F5A623',
  magenta:       '#DB2777',
  lavender:      '#9B93C4',
  silver:        '#F4F2FA',
  good:          '#34D399',
  bad:           '#F87171',
  amber:         '#F5B544',
  hairline:      'rgba(123,112,178,0.14)',
  hairlineStrong:'rgba(123,112,178,0.22)',
  textFaint:     'rgba(226,232,240,0.60)',
  copper:        '#C87941',  // SYNCSCORE copper accent
};
const SERIF = '"Instrument Serif", Georgia, serif';
const MONO  = '"JetBrains Mono", monospace';
const SANS  = '"Manrope", system-ui, sans-serif';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const FIELD_LABELS: Record<RightsFieldName, string> = {
  writer:          'Writer',
  split_pct:       'Split %',
  publisher:       'Publisher',
  isrc:            'ISRC',
  iswc:            'ISWC',
  pro_affiliation: 'PRO',
  ipi:             'IPI',
};

// Glyph + label per agreement state — color-independent for print legibility
const STATE_GLYPH: Record<AgreementState, string> = {
  AGREE:         '✓',
  SINGLE_SOURCE: '◐',
  CONFLICT:      '✗',
  MISSING:       '—',
};
const STATE_LABEL: Record<AgreementState, string> = {
  AGREE:         'Confirmed (multiple sources agree)',
  SINGLE_SOURCE: 'Single source — not yet cross-checked',
  CONFLICT:      'Conflict — sources disagree',
  MISSING:       'Missing — no source provided this field',
};
const STATE_COLOR: Record<AgreementState, string> = {
  AGREE:         C.good,
  SINGLE_SOURCE: C.amber,
  CONFLICT:      C.bad,
  MISSING:       'rgba(123,112,178,0.35)',
};
const STATE_BG: Record<AgreementState, string> = {
  AGREE:         'rgba(52,211,153,0.10)',
  SINGLE_SOURCE: 'rgba(245,181,68,0.10)',
  CONFLICT:      'rgba(248,113,113,0.10)',
  MISSING:       'rgba(123,112,178,0.05)',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

// ─── Audio singleton (stop other tracks when a new one plays) ─────────────────
const currentAudio: { el: HTMLAudioElement | null } = { el: null };

// ─── Weighted axis bar ────────────────────────────────────────────────────────
// bar width ∝ axis weight; fill ∝ axis value
// Renders identically in HTML and print — pure CSS, no canvas.
function WeightedAxisBars({ vector, weights }: {
  vector:  TrackSlot['vector'];
  weights: TrackSlot['axisWeights'];
}) {
  const axes: { key: keyof typeof vector; label: string }[] = [
    { key: 'scene',  label: 'Scene'  },
    { key: 'rights', label: 'Rights' },
    { key: 'lyrics', label: 'Lyrics' },
    { key: 'signal', label: 'Signal' },
  ];
  return (
    <div>
      <div style={{ fontSize: 9, letterSpacing: '0.26em', textTransform: 'uppercase', color: C.lavender, marginBottom: 6 }}>
        SYNCSCORE AXES
      </div>
      <div style={{ display: 'flex', gap: 3, width: '100%' }}>
        {axes.map(({ key, label }) => {
          const weight   = weights[key];
          const value    = vector[key];
          const fillPct  = Math.round(value * 100);
          return (
            <div
              key={key}
              style={{ flex: `0 0 ${weight * 100}%`, display: 'flex', flexDirection: 'column', gap: 3 }}
              title={`${label}: ${fillPct}% (weight ${Math.round(weight * 100)}%)`}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.lavender }}>
                <span>{label}</span>
                <span style={{ fontFamily: MONO, color: C.silver }}>{fillPct}</span>
              </div>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${fillPct}%`,
                  background: `linear-gradient(90deg, ${C.copper}, #F97316)`,
                  borderRadius: 999,
                }} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 5, fontSize: 8, color: 'rgba(123,112,178,0.5)', letterSpacing: '0.10em' }}>
        Bar width = axis weight · fill = axis value
      </div>
    </div>
  );
}

// ─── Conflict matrix ─────────────────────────────────────────────────────────
// rows = rights fields, cols = sources
// Each cell: background tint + glyph (always) + aria-label (accessibility)
// In @media print backgrounds may strip — the glyph is always present.
function ConflictMatrix({ ledger }: { ledger: RightsFieldLedger[] }) {
  // Collect all unique sources across all fields
  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const f of ledger) for (const e of f.entries) set.add(e.source);
    return Array.from(set);
  }, [ledger]);

  const hasAnySources = sources.length > 0;

  return (
    <div>
      <div style={{ fontSize: 9, letterSpacing: '0.26em', textTransform: 'uppercase', color: C.lavender, marginBottom: 6 }}>
        RIGHTS CONFLICT MATRIX
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse', fontSize: 10,
          fontFamily: SANS,
        }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 8px', fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.lavender, fontWeight: 600, borderBottom: `1px solid ${C.hairline}` }}>
                Field
              </th>
              {hasAnySources ? sources.map(src => (
                <th key={src} style={{ textAlign: 'center', padding: '4px 8px', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.lavender, fontWeight: 600, borderBottom: `1px solid ${C.hairline}`, whiteSpace: 'nowrap' }}>
                  {src}
                </th>
              )) : (
                <th style={{ textAlign: 'center', padding: '4px 8px', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.lavender, fontWeight: 600, borderBottom: `1px solid ${C.hairline}` }}>
                  Status
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {ledger.map(field => {
              const state = field.agreementState;
              const glyph = STATE_GLYPH[state];
              const color = STATE_COLOR[state];
              const bg    = STATE_BG[state];
              const label = STATE_LABEL[state];

              if (!hasAnySources) {
                // No sources at all — show as one status column
                return (
                  <tr key={field.field}>
                    <td style={{ padding: '5px 8px', borderBottom: `1px solid ${C.hairline}`, color: C.lavender, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
                      {FIELD_LABELS[field.field]}
                    </td>
                    <td
                      style={{ padding: '5px 8px', borderBottom: `1px solid ${C.hairline}`, textAlign: 'center', background: bg, color }}
                      title={label}
                      aria-label={`${FIELD_LABELS[field.field]}: ${label}`}
                    >
                      <span style={{ fontWeight: 700 }}>{glyph}</span>
                      <span style={{ fontSize: 8, marginLeft: 4, letterSpacing: '0.10em', textTransform: 'uppercase', opacity: 0.8 }}>{state.replace('_', ' ')}</span>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={field.field}>
                  <td style={{ padding: '5px 8px', borderBottom: `1px solid ${C.hairline}`, color: C.lavender, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
                    {FIELD_LABELS[field.field]}
                  </td>
                  {sources.map(src => {
                    const entry = field.entries.find(e => e.source === src);
                    if (!entry) {
                      // This source didn't provide this field
                      return (
                        <td
                          key={src}
                          style={{ padding: '5px 8px', borderBottom: `1px solid ${C.hairline}`, textAlign: 'center', background: STATE_BG['MISSING'], color: STATE_COLOR['MISSING'] }}
                          title={STATE_LABEL['MISSING']}
                          aria-label={`${FIELD_LABELS[field.field]} from ${src}: missing`}
                        >
                          <span style={{ fontWeight: 700 }}>{STATE_GLYPH['MISSING']}</span>
                        </td>
                      );
                    }
                    // Entry exists — state applies to the field, but show glyph per row
                    return (
                      <td
                        key={src}
                        style={{ padding: '5px 8px', borderBottom: `1px solid ${C.hairline}`, textAlign: 'center', background: bg, color }}
                        title={`${src}: "${String(entry.value)}" — ${label}`}
                        aria-label={`${FIELD_LABELS[field.field]} from ${src}: ${String(entry.value)}, ${label}`}
                      >
                        <span style={{ fontWeight: 700 }}>{glyph}</span>
                        <div style={{ fontSize: 8, marginTop: 1, color: C.textFaint, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '1px auto 0' }}>
                          {String(entry.value ?? '—')}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 8, letterSpacing: '0.10em', color: 'rgba(123,112,178,0.55)' }}>
        {(['AGREE', 'SINGLE_SOURCE', 'CONFLICT', 'MISSING'] as AgreementState[]).map(s => (
          <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ color: STATE_COLOR[s], fontWeight: 700 }}>{STATE_GLYPH[s]}</span>
            <span>{s.replace('_', ' ')}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Rights pipeline bar ──────────────────────────────────────────────────────
function PipelineBar({ pipeline }: { pipeline: PipelineStatus[] }) {
  const completedCount = pipeline.filter(s => s.completed).length;
  const fillPct        = Math.round((completedCount / pipeline.length) * 100);

  // Find the last completed stage index for step label
  const lastDone = pipeline.reduce((acc, s, i) => s.completed ? i : acc, -1);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <div style={{ fontSize: 9, letterSpacing: '0.26em', textTransform: 'uppercase', color: C.lavender }}>
          RIGHTS PIPELINE
        </div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: fillPct >= 70 ? C.good : fillPct >= 40 ? C.amber : C.bad }}>
          {completedCount}/{pipeline.length}
        </div>
      </div>

      {/* Segmented horizontal bar — each segment = one stage */}
      <div style={{ display: 'flex', gap: 2, height: 6 }}>
        {pipeline.map((s, i) => (
          <div
            key={s.stage}
            title={`${s.stage.replace(/_/g, ' ')}: ${s.completed ? 'complete' : 'pending'}`}
            style={{
              flex: 1,
              borderRadius: 999,
              background: s.completed
                ? (i <= lastDone ? `linear-gradient(90deg, ${C.copper}, #F97316)` : C.good)
                : 'rgba(255,255,255,0.06)',
            }}
          />
        ))}
      </div>

      {/* Stage labels — shown on hover/focus in browser, always visible in print */}
      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {pipeline.map(s => (
          <div key={s.stage} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
              display: 'grid', placeItems: 'center', fontSize: 7, fontWeight: 800,
              background: s.completed ? 'rgba(52,211,153,0.18)' : 'rgba(123,112,178,0.08)',
              color: s.completed ? C.good : 'rgba(123,112,178,0.4)',
              border: `1px solid ${s.completed ? 'rgba(52,211,153,0.35)' : C.hairline}`,
            }}>
              {s.completed ? '✓' : '⧗'}
            </span>
            <span style={{ fontSize: 9, color: s.completed ? C.silver : 'rgba(226,232,240,0.35)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {s.stage.replace(/_/g, ' ')}
            </span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 6, fontSize: 9, fontFamily: SERIF, fontStyle: 'italic', color: C.textFaint }}>
        {fillPct}% pipeline complete · {pipeline.length - completedCount} stage{pipeline.length - completedCount !== 1 ? 's' : ''} remaining
      </div>
    </div>
  );
}

// ─── Aggregate readout ─────────────────────────────────────────────────────────
function AggregateReadout({ confirmed, conflicts, missing, total }: {
  confirmed: number; conflicts: number; missing: number; total: number;
}) {
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 10,
      background: 'rgba(123,112,178,0.04)', border: `1px solid ${C.hairline}`,
      display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
    }}>
      <span style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender, flexShrink: 0 }}>
        Rights coverage
      </span>
      <span style={{ fontFamily: MONO, fontSize: 11, color: C.good }}>
        {confirmed}/{total} confirmed
      </span>
      {conflicts > 0 && (
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.bad }}>
          {conflicts} conflict{conflicts !== 1 ? 's' : ''}
        </span>
      )}
      {missing > 0 && (
        <span style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(123,112,178,0.55)' }}>
          {missing} missing
        </span>
      )}
    </div>
  );
}

// ─── Audio player ──────────────────────────────────────────────────────────────
function AudioPlayer({ token, isRank1 }: { token: string; trackId: string; isRank1: boolean }) {
  const audioRef   = useRef<HTMLAudioElement | null>(null);
  const [playing,  setPlaying]  = useState(false);
  const [time,     setTime]     = useState(0);
  const [duration, setDuration] = useState(0);
  const [error,    setError]    = useState(false);

  const audioUrl = `${API_BASE}/api/share/audio/${token}`;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime   = () => setTime(audio.currentTime);
    const onMeta   = () => setDuration(audio.duration);
    const onPlay   = () => setPlaying(true);
    const onPause  = () => setPlaying(false);
    const onEnded  = () => { setPlaying(false); setTime(audio.currentTime); };
    const onError  = () => { setError(true); setPlaying(false); };
    audio.addEventListener('timeupdate',     onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('play',  onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('timeupdate',     onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('play',  onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      if (currentAudio.el === audio) currentAudio.el = null;
      audio.pause();
    };
  }, [audioUrl]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio || error) return;
    if (!audio.paused) { audio.pause(); return; }
    if (currentAudio.el && currentAudio.el !== audio) currentAudio.el.pause();
    currentAudio.el = audio;
    void audio.play().catch(() => setError(true));
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * duration;
  };

  const fillPct = duration > 0 ? (time / duration) * 100 : 0;

  return (
    <div style={{
      padding: '12px 14px', borderRadius: 12,
      background: 'rgba(0,0,0,0.32)', border: `1px solid ${C.hairline}`,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <audio ref={audioRef} src={audioUrl} preload="metadata" style={{ display: 'none' }} crossOrigin="anonymous" />

      <button
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        disabled={error}
        style={{
          width: 40, height: 40, borderRadius: '50%', flexShrink: 0, border: 'none', cursor: error ? 'not-allowed' : 'pointer',
          background: error ? 'rgba(248,113,113,0.15)' : isRank1 ? `linear-gradient(135deg, ${C.purple}, ${C.magenta})` : C.silver,
          color: error ? C.bad : isRank1 ? 'white' : C.bg,
          display: 'grid', placeItems: 'center',
          boxShadow: isRank1 && !error ? '0 10px 20px -10px rgba(219,39,119,0.5)' : 'none',
          opacity: error ? 0.6 : 1,
        }}
      >
        {error ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        ) : playing ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 10 10"><path d="M2 1 L8 5 L2 9 Z" fill="currentColor"/></svg>
        )}
      </button>

      {/* Scrub bar — click to seek */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div
          onClick={seek}
          role="slider"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fillPct)}
          aria-label="Playback position"
          style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden', cursor: duration > 0 ? 'pointer' : 'default' }}
        >
          <div style={{ height: '100%', width: `${fillPct}%`, background: `linear-gradient(90deg, ${C.copper}, #F97316)`, borderRadius: 999, transition: 'width 0.1s linear' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 9, color: C.lavender }}>
          <span>{formatTime(time)}</span>
          <span style={{ color: 'rgba(123,112,178,0.5)' }}>{duration > 0 ? formatTime(duration) : '—'}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Track card ───────────────────────────────────────────────────────────────
function TrackCard({ slot }: { slot: TrackSlot; packetId: string }) {
  const [showLedger,   setShowLedger]   = useState(false);
  const [showPipeline, setShowPipeline] = useState(false);
  const isRank1 = slot.rank === 1;

  const rights = slot.rightsState;
  const rightsColor =
    rights === 'CLEAR'           ? C.good  :
    rights === 'BLOCKED'         ? C.bad   :
    rights === 'PARTIALLY_CLEAR' ? C.amber : 'rgba(123,112,178,0.6)';
  const rightsLabel =
    rights === 'CLEAR'           ? 'CLEAR'    :
    rights === 'BLOCKED'         ? 'BLOCKED'  :
    rights === 'PARTIALLY_CLEAR' ? 'PARTIAL'  :
    rights === 'UNVERIFIED'      ? 'UNVERIFIED' : 'INGESTED';

  return (
    <div
      className="sv-track-card"
      style={{
        position: 'relative',
        background: isRank1
          ? 'radial-gradient(140% 60% at 100% 0%, rgba(219,39,119,0.14), transparent 60%), linear-gradient(180deg, rgba(245,166,35,0.16), rgba(245,166,35,0.02) 70%)'
          : 'rgba(255,255,255,0.025)',
        border: `1px solid ${isRank1 ? 'rgba(123,112,178,0.34)' : C.hairline}`,
        borderRadius: 16,
        padding: '22px 26px',
        overflow: 'hidden',
        breakInside: 'avoid',
      }}
    >
      {/* Ghost rank */}
      <div style={{ position: 'absolute', top: -10, right: 18, fontFamily: SERIF, fontSize: 96, lineHeight: 1, color: isRank1 ? 'rgba(255,255,255,0.10)' : 'rgba(123,112,178,0.10)', fontWeight: 400, letterSpacing: '-0.04em', pointerEvents: 'none' }}>
        {slot.rank}
      </div>

      {/* Header */}
      <div style={{ fontFamily: SERIF, fontSize: 28, lineHeight: 1.05, letterSpacing: '-0.012em', color: C.silver, fontWeight: 400, paddingRight: 60 }}>
        {slot.title}
      </div>
      <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.lavender, marginTop: 5, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {slot.artistName && <span style={{ color: C.silver, fontWeight: 600 }}>{slot.artistName}</span>}
        {slot.tonalCharacter  && <><span style={{ opacity: 0.35 }}>·</span><span>{slot.tonalCharacter}</span></>}
        {slot.energyCharacter && <><span style={{ opacity: 0.35 }}>·</span><span>{slot.energyCharacter}</span></>}
        {slot.tempo           && <><span style={{ opacity: 0.35 }}>·</span><span style={{ fontFamily: MONO }}>{Math.round(slot.tempo)} BPM</span></>}
        {slot.isrc            && <><span style={{ opacity: 0.35 }}>·</span><span style={{ fontFamily: MONO, fontSize: 9 }}>{slot.isrc}</span></>}
      </div>

      {/* Rights chip */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <span style={{
          fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
          padding: '3px 9px', borderRadius: 999, fontWeight: 600,
          background: 'rgba(123,112,178,0.08)', border: `1px solid ${C.hairline}`,
          color: rightsColor, fontFamily: SANS, whiteSpace: 'nowrap',
        }}>
          {rightsLabel}
        </span>
        <span style={{
          fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase',
          padding: '3px 9px', borderRadius: 999,
          background: 'rgba(123,112,178,0.04)', border: `1px solid ${C.hairline}`,
          color: C.lavender, fontFamily: SANS,
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <span style={{ fontFamily: MONO, fontWeight: 700, color: C.copper, fontSize: 12 }}>
            {slot.fitIndex}
          </span>
          <span style={{ opacity: 0.6 }}>SYNCSCORE</span>
        </span>
      </div>

      {/* Explanation */}
      <div style={{
        marginTop: 16, padding: '14px 16px', borderRadius: 12,
        background: 'linear-gradient(180deg, rgba(219,39,119,0.06), transparent)',
        border: '1px solid rgba(219,39,119,0.2)',
      }}>
        <div style={{ fontSize: 9, letterSpacing: '0.30em', textTransform: 'uppercase', color: C.magenta, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          WHY THIS TRACK
        </div>
        <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 15, lineHeight: 1.45, color: C.silver, letterSpacing: '-0.005em' }}>
          {slot.explanation}
        </div>
      </div>

      {/* Audio player (hidden in print — QR code links to share URL for playback) */}
      <div className="no-print" style={{ marginTop: 12 }}>
        {slot.audioToken ? (
          <AudioPlayer token={slot.audioToken} trackId={slot.trackId} isRank1={isRank1} />
        ) : (
          <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(0,0,0,0.2)', border: `1px solid ${C.hairline}`, fontSize: 10, color: 'rgba(123,112,178,0.45)', fontStyle: 'italic' }}>
            No preview available
          </div>
        )}
      </div>

      {/* Weighted axis bars — rendered in HTML + print */}
      <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 12, background: 'rgba(0,0,0,0.18)', border: `1px solid ${C.hairline}` }}>
        <WeightedAxisBars vector={slot.vector} weights={slot.axisWeights} />
      </div>

      {/* Rights aggregate readout */}
      <div style={{ marginTop: 10 }}>
        <AggregateReadout
          confirmed={slot.rightsAggregate.confirmedFields}
          conflicts={slot.rightsAggregate.conflicts}
          missing={slot.rightsAggregate.missing}
          total={slot.rightsAggregate.totalFields}
        />
      </div>

      {/* Conflict matrix — always rendered (toggle in screen, always in print) */}
      <div style={{ marginTop: 10 }} className="sv-ledger-wrap">
        <div className="no-print" style={{ marginBottom: 8 }}>
          <button
            onClick={() => setShowLedger(v => !v)}
            style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender, background: 'transparent', border: `1px solid ${C.hairline}`, borderRadius: 999, padding: '4px 10px', cursor: 'pointer', fontFamily: SANS }}
          >
            {showLedger ? 'Hide' : 'Show'} conflict matrix
          </button>
        </div>
        <div className={showLedger ? undefined : 'sv-ledger-body'} style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(0,0,0,0.18)', border: `1px solid ${C.hairline}` }}>
          <ConflictMatrix ledger={slot.rightsLedger} />
        </div>
      </div>

      {/* Pipeline bar — toggle in screen, always in print */}
      <div style={{ marginTop: 10 }} className="sv-pipeline-wrap">
        <div className="no-print" style={{ marginBottom: 8 }}>
          <button
            onClick={() => setShowPipeline(v => !v)}
            style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender, background: 'transparent', border: `1px solid ${C.hairline}`, borderRadius: 999, padding: '4px 10px', cursor: 'pointer', fontFamily: SANS }}
          >
            {showPipeline ? 'Hide' : 'Show'} pipeline
          </button>
        </div>
        <div className={showPipeline ? undefined : 'sv-pipeline-body'} style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(0,0,0,0.18)', border: `1px solid ${C.hairline}` }}>
          <PipelineBar pipeline={slot.pipeline} />
        </div>
      </div>

      {/* Audit hash — print only */}
      <div className="print-only" style={{ marginTop: 10, fontSize: 8, fontFamily: MONO, color: 'rgba(123,112,178,0.35)', wordBreak: 'break-all' }}>
        inputHash: {slot.inputHash}
      </div>
    </div>
  );
}

// ─── QR code (print-only) ─────────────────────────────────────────────────────
function QRBlock({ url }: { url: string }) {
  const [svgHtml, setSvgHtml] = useState<string>('');

  useEffect(() => {
    QRCode.toString(url, { type: 'svg', width: 120, margin: 1 })
      .then(svg => setSvgHtml(svg))
      .catch(() => {});
  }, [url]);

  if (!svgHtml) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div
        style={{ width: 120, height: 120, background: 'white', borderRadius: 8, padding: 4 }}
        dangerouslySetInnerHTML={{ __html: svgHtml }}
      />
      <div style={{ fontSize: 9, fontFamily: MONO, color: 'rgba(0,0,0,0.5)', textAlign: 'center', maxWidth: 140, wordBreak: 'break-all' }}>
        Scan to hear tracks
      </div>
    </div>
  );
}

// ─── Main ShareView ───────────────────────────────────────────────────────────
interface ShareViewProps {
  packet: DecisionPacket;
}

export default function ShareView({ packet }: ShareViewProps) {
  const shareUrl = `${window.location.origin}${window.location.pathname}#share=${packet.packetId}`;
  const total    = packet.tracks.length;

  const sp = packet.sceneParams;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: SANS, WebkitFontSmoothing: 'antialiased', color: C.silver }}>
      <style>{`
        @media (max-width: 900px) {
          .sv-share-grid   { display: block !important; }
          .sv-share-left   { display: none !important; }
          .sv-share-right  { position: static !important; height: auto !important; border-left: none !important; border-top: 1px solid rgba(123,112,178,0.14) !important; }
          .sv-share-main   { padding: 20px 16px !important; }
        }
        /* Screen: ledger and pipeline bodies are hidden behind toggle buttons */
        .sv-ledger-body   { display: none; }
        .sv-pipeline-body { display: none; }
        .print-only       { display: none; }

        @media print {
          *, *::before, *::after {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          html, body { background: #0D0B1E !important; color: #F4F2FA !important; }
          .sv-share-grid   { display: block !important; }
          .sv-share-left   { display: none !important; }
          .sv-share-right  { display: none !important; }
          .sv-share-main   { padding: 20px !important; }
          /* Show all collapsed sections in print */
          .sv-ledger-body   { display: block !important; }
          .sv-pipeline-body { display: block !important; }
          /* Show print-only elements */
          .print-only { display: block !important; }
          /* Hide interactive-only elements */
          .no-print   { display: none !important; }
          /* Break each track card onto its own page */
          .sv-track-card { page-break-inside: avoid; break-inside: avoid; margin-bottom: 24px; }
        }
      `}</style>

      <div className="sv-share-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,260px) 1fr minmax(0,240px)',
        minHeight: '100vh',
        maxWidth: 1200,
        margin: '0 auto',
      }}>

        {/* ── LEFT RAIL ── */}
        <aside className="sv-share-left" style={{
          borderRight: `1px solid ${C.hairline}`,
          padding: '28px 26px 22px',
          display: 'flex', flexDirection: 'column',
          background: 'rgba(0,0,0,0.15)',
          position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
        }}>
          {/* brand */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 22, borderBottom: `1px solid ${C.hairline}` }}>
            <img src="/logo.png" alt="SyncVision" style={{ height: 22, width: 'auto' }} />
            <span style={{ fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase', color: C.lavender, padding: '4px 9px', borderRadius: 999, border: `1px solid ${C.hairline}`, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.magenta, boxShadow: `0 0 6px ${C.magenta}` }} />
              READ-ONLY
            </span>
          </div>

          {/* meta */}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.26em', textTransform: 'uppercase', color: C.lavender }}>THE SCENE</div>
            <div style={{ marginTop: 10, fontFamily: SERIF, fontStyle: 'italic', fontSize: 14, lineHeight: 1.45, color: 'rgba(226,232,240,0.78)', paddingLeft: 14, borderLeft: `2px solid ${C.magenta}` }}>
              {packet.briefText || '—'}
            </div>
          </div>

          <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { k: 'TRACKS',  v: String(total) },
              { k: 'FORMAT',  v: 'SHORTLIST' },
              { k: 'PACING',  v: sp.pacing ?? '—' },
              { k: 'CREATED', v: formatDate(packet.createdAt) },
            ].map(({ k, v }) => (
              <div key={k} style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(123,112,178,0.04)', border: `1px solid ${C.hairline}` }}>
                <div style={{ fontSize: 8.5, letterSpacing: '0.24em', textTransform: 'uppercase', color: C.lavender, marginBottom: 4 }}>{k}</div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: C.silver, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Packet-level rights aggregate */}
          <div style={{ marginTop: 18 }}>
            <AggregateReadout
              confirmed={packet.totalConfirmed}
              conflicts={packet.totalConflicts}
              missing={packet.totalMissing}
              total={packet.tracks.length * 7}
            />
          </div>

          {/* Audit */}
          <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.22)', border: `1px solid ${C.hairline}` }}>
            <div style={{ fontSize: 8.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender, marginBottom: 4 }}>PACKET HASH</div>
            <div style={{ fontFamily: MONO, fontSize: 8, color: 'rgba(123,112,178,0.5)', wordBreak: 'break-all', lineHeight: 1.4 }}>
              {packet.packetHash.slice(0, 32)}…
            </div>
            <div style={{ fontSize: 8.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender, marginTop: 8, marginBottom: 4 }}>SCORING</div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: 'rgba(123,112,178,0.5)' }}>{packet.scoringVersion}</div>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: 22, borderTop: `1px solid ${C.hairline}`, fontSize: 10, letterSpacing: '0.14em', color: 'rgba(123,112,178,0.6)', lineHeight: 1.6 }}>
            Shared via <span style={{ color: C.silver, fontFamily: MONO, fontWeight: 500, fontSize: 10 }}>syncvision.app</span>
            <br />No account needed
          </div>
        </aside>

        {/* ── CENTER: tracks ── */}
        <main className="sv-share-main" style={{ padding: '28px 32px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

          {/* Print header — only shows in PDF */}
          <div className="print-only" style={{ marginBottom: 24, paddingBottom: 16, borderBottom: `1px solid ${C.hairline}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase', color: C.lavender, marginBottom: 6 }}>
                  SYNCVISION DECISION REPORT
                </div>
                <div style={{ fontFamily: SERIF, fontSize: 22, color: C.silver, lineHeight: 1.1 }}>
                  {packet.briefText || 'Sync Brief'}
                </div>
                <div style={{ marginTop: 8, fontSize: 10, color: C.lavender }}>
                  {total} track{total !== 1 ? 's' : ''} · {formatDate(packet.createdAt)} · expires {formatDate(packet.expiresAt)}
                </div>
                <div style={{ marginTop: 8 }}>
                  <AggregateReadout
                    confirmed={packet.totalConfirmed}
                    conflicts={packet.totalConflicts}
                    missing={packet.totalMissing}
                    total={packet.tracks.length * 7}
                  />
                </div>
                <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 8, color: 'rgba(123,112,178,0.4)' }}>
                  packetHash: {packet.packetHash}
                </div>
              </div>
              {/* QR code — scan to play audio in share view */}
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <QRBlock url={shareUrl} />
                <div style={{ fontSize: 8, fontFamily: MONO, color: 'rgba(0,0,0,0.45)', textAlign: 'center' }}>
                  Scan for audio playback
                </div>
              </div>
            </div>
          </div>

          <div className="no-print" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 16, marginBottom: 22, borderBottom: `1px solid ${C.hairline}` }}>
            <h2 style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: 24, color: C.silver, letterSpacing: '-0.01em' }}>
              {total === 1 ? 'One track' : `${total} tracks`}{' '}
              <em style={{ fontStyle: 'italic', color: C.lavender }}>for your call</em>
            </h2>
            <span style={{ fontSize: 10, letterSpacing: '0.26em', textTransform: 'uppercase', color: C.lavender }}>RANKED BY SYNCSCORE</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {packet.tracks.map(slot => (
              <TrackCard key={slot.trackId} slot={slot} packetId={packet.packetId} />
            ))}
          </div>

          {/* Print footer */}
          <div className="print-only" style={{ marginTop: 32, paddingTop: 16, borderTop: `1px solid ${C.hairline}`, fontSize: 9, fontFamily: MONO, color: 'rgba(123,112,178,0.4)', display: 'flex', justifyContent: 'space-between' }}>
            <span>SyncVision · syncvision.app</span>
            <span>scoring/{packet.scoringVersion} · v{packet.packetVersion}</span>
          </div>
        </main>

        {/* ── RIGHT RAIL ── */}
        <aside className="sv-share-right" style={{
          borderLeft: `1px solid ${C.hairline}`,
          padding: '28px 26px 22px',
          background: 'rgba(0,0,0,0.15)',
          display: 'flex', flexDirection: 'column', gap: 22,
          position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
        }}>
          {/* Track-by-track score summary */}
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.26em', textTransform: 'uppercase', color: C.lavender, marginBottom: 12 }}>
              RANKED SHORTLIST
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {packet.tracks.map(slot => (
                <div key={slot.trackId} style={{
                  padding: '10px 12px', borderRadius: 10,
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: 'rgba(123,112,178,0.03)', border: `1px solid ${C.hairline}`,
                }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, fontFamily: SERIF, fontSize: 13, border: '1px solid', background: 'rgba(123,112,178,0.08)', color: C.lavender, borderColor: C.hairline }}>
                    {slot.rank}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: SERIF, fontSize: 13, color: C.silver, lineHeight: 1.1, letterSpacing: '-0.005em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {slot.title}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.copper, marginTop: 2 }}>
                      {slot.fitIndex} <span style={{ color: 'rgba(123,112,178,0.5)', fontSize: 8, letterSpacing: '0.1em' }}>SYNCSCORE</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Conflict summary */}
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.26em', textTransform: 'uppercase', color: C.lavender, marginBottom: 12 }}>
              RIGHTS OVERVIEW
            </div>
            <AggregateReadout
              confirmed={packet.totalConfirmed}
              conflicts={packet.totalConflicts}
              missing={packet.totalMissing}
              total={packet.tracks.length * 7}
            />
          </div>

          {/* Expiry */}
          <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: `1px solid ${C.hairline}` }}>
            <div style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender, marginBottom: 4 }}>
              LINK EXPIRES
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(226,232,240,0.5)' }}>
              {formatDate(packet.expiresAt)}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
