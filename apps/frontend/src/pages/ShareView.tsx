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

function fieldValue(slot: TrackSlot, field: RightsFieldName): string {
  const ledgerField = slot.rightsLedger.find(item => item.field === field);
  const entry = ledgerField?.entries.find(item => item.value !== null && item.value !== '');
  if (entry?.value !== undefined && entry.value !== null && entry.value !== '') return String(entry.value);
  if (field === 'isrc' && slot.isrc) return slot.isrc;
  return '- not entered -';
}

function clearanceLabel(rights: string | null): { label: string; tone: 'clear' | 'part' | 'blocked' } {
  if (rights === 'CLEAR') return { label: 'Cleared', tone: 'clear' };
  if (rights === 'BLOCKED') return { label: 'Blocked', tone: 'blocked' };
  if (rights === 'PARTIALLY_CLEAR') return { label: 'Partially cleared', tone: 'part' };
  return { label: 'Largely unverified', tone: 'part' };
}

function PrintRunHead({ stamp }: { stamp: string }) {
  return (
    <div className="sv-p-runhead">
      <img className="sv-p-logo" src="/logo.png" alt="SyncVision" />
      <span className="sv-p-stamp">{stamp}</span>
    </div>
  );
}

function PrintRunFoot({ page, pages }: { page: number; pages: number }) {
  return (
    <div className="sv-p-runfoot">
      <span>SyncVision - Sync Report</span>
      <span>Confidential - Page {page} of {pages}</span>
    </div>
  );
}

function PrintTrackPage({ slot, index, total, pages }: { slot: TrackSlot; index: number; total: number; pages: number }) {
  const clearance = clearanceLabel(slot.rightsState);
  const completed = slot.pipeline.filter(stage => stage.completed).length;
  const confidence = slot.pipeline.length ? Math.round((completed / slot.pipeline.length) * 100) : 0;
  const meta = [
    slot.artistName,
    slot.tonalCharacter,
    slot.energyCharacter,
    slot.tempo ? `${Math.round(slot.tempo)} BPM` : null,
    slot.isrc,
  ].filter(Boolean).join(' - ');

  const rightsFields: { label: string; value: string; tone?: string }[] = [
    { label: 'ISRC', value: slot.isrc ?? '- not entered -' },
    { label: 'Work ID - ISWC', value: fieldValue(slot, 'iswc') },
    { label: 'Writer', value: fieldValue(slot, 'writer') },
    { label: 'Writer split %', value: fieldValue(slot, 'split_pct') },
    { label: 'Writer IPI', value: fieldValue(slot, 'ipi') },
    { label: 'Publisher', value: fieldValue(slot, 'publisher') },
    { label: 'PRO affiliation', value: fieldValue(slot, 'pro_affiliation') },
    { label: 'Rights status', value: clearance.label, tone: clearance.tone },
  ];

  return (
    <section className="sv-p-page">
      <div className="sv-p-noise" />
      <PrintRunHead stamp={`Candidate ${index + 1} of ${total} - Fit ${slot.fitIndex}`} />

      <div className={`sv-p-td-head ${index === 0 ? 'is-leader' : ''}`}>
        <div className="sv-p-rk">{slot.rank}</div>
        <div className="sv-p-info">
          <span className={`sv-p-state ${clearance.tone}`}>{index === 0 ? 'Recommended' : clearance.label}</span>
          <div className="sv-p-track-name">{slot.title}</div>
          <div className="sv-p-meta">{meta || 'Metadata pending'}</div>
        </div>
        <div className="sv-p-score"><div>{slot.fitIndex}</div><span>Fit</span></div>
      </div>

      <div className="sv-p-assess">
        <div className="sv-p-lab">Sync assessment <em>deterministic - audit-stable</em></div>
        <p>{slot.explanation}</p>
      </div>

      <div className="sv-p-panel-label">SyncScore axes</div>
      <div className="sv-p-axes">
        {([
          ['Scene', slot.vector.scene],
          ['Rights', slot.vector.rights],
          ['Lyrics', slot.vector.lyrics],
          ['Signal', slot.vector.signal],
        ] as const).map(([label, value]) => {
          const pct = Math.round(value * 100);
          return (
            <div className="sv-p-axis" key={label}>
              <span>{label}</span>
              <i><b style={{ width: `${pct}%` }} /></i>
              <strong>{pct}</strong>
            </div>
          );
        })}
      </div>
      <div className="sv-p-axis-cap">Bar fill = axis value (0-100)</div>

      <div className="sv-p-rights">
        <div className="sv-p-rights-head">
          <span>Rights & clearance</span>
          <b className={clearance.tone}>{clearance.label}</b>
        </div>
        <div className="sv-p-rfields">
          {rightsFields.map(field => (
            <div className="sv-p-rf" key={field.label}>
              <div>{field.label}</div>
              <span className={field.value.startsWith('-') ? 'none' : field.tone}>{field.value}</span>
            </div>
          ))}
        </div>
        <div className="sv-p-pipe">
          <div className="sv-p-pc"><span>Confidence</span><b>{confidence}%</b></div>
          {slot.pipeline.map(stage => (
            <div className={`sv-p-stage ${stage.completed ? 'ok' : 'no'}`} key={stage.stage}>
              <i>{stage.completed ? '✓' : '×'}</i>
              {stage.stage.replace(/_/g, ' ')}
            </div>
          ))}
        </div>
      </div>

      <PrintRunFoot page={index + 3} pages={pages} />
    </section>
  );
}

function PrintReport({ packet }: { packet: DecisionPacket }) {
  const pages = packet.tracks.length + (packet.tracks.length > 1 ? 3 : 2);
  const top = packet.tracks[0];
  const runnerUp = packet.tracks[1];
  const sp = packet.sceneParams;

  return (
    <div className="sv-print-report">
      <section className="sv-p-page sv-p-cover">
        <div className="sv-p-noise" />
        <div className="sv-p-brandrow">
          <img className="sv-p-cover-logo" src="/logo.png" alt="SyncVision" />
          <span>Director View - <b>Read-only</b></span>
        </div>

        <div className="sv-p-hero">
          <span className="sv-p-kicker">Sync Report - Decision Packet</span>
          <h1>Sync Report<br /><em>Shortlist.</em></h1>
          <p>{packet.briefText || 'Ranked music candidates with rights and clearance detail.'}</p>
          <div className="sv-p-moods">
            {sp.emotionalRegister && <span className="accent">{sp.emotionalRegister}</span>}
            {sp.pacing && <span className="accent">{sp.pacing}</span>}
            {sp.sceneLengthSec && <span>Scene {sp.sceneLengthSec}s</span>}
            <span>{packet.tracks.length} ranked candidates</span>
            <span>Audit-stable scoring</span>
          </div>
        </div>

        <div className="sv-p-metagrid">
          <div><span>Shared by</span><b>SyncVision<br /><em>decision packet</em></b></div>
          <div><span>Candidates</span><b>{packet.tracks.length} ranked<br /><em>shortlist</em></b></div>
          <div><span>Generated</span><b>{formatDate(packet.createdAt)}</b></div>
          <div><span>Link expires</span><b>{formatDate(packet.expiresAt)}</b></div>
        </div>

        <PrintRunFoot page={1} pages={pages} />
      </section>

      <section className="sv-p-page">
        <div className="sv-p-noise" />
        <PrintRunHead stamp="Ranked candidates" />
        <span className="sv-p-kicker">The shortlist</span>
        <div className="sv-p-sec-title">Ranked candidates</div>
        <div className="sv-p-sec-sub">Ordered by Fit Index. Surfaces what you need to decide, faster.</div>

        <div className="sv-p-scene-card">
          <div>The scene</div>
          <h3>Decision <em>brief</em></h3>
          <p>{packet.briefText || 'Scene brief pending.'}</p>
        </div>

        <div className="sv-p-rank-list">
          {packet.tracks.map((slot, i) => (
            <div className={`sv-p-rank-row ${i === 0 ? 'approved' : ''}`} key={slot.trackId}>
              <div className="rk">{slot.rank}</div>
              <div className="nm"><div>{slot.title}</div><span>{slot.artistName ? `by ${slot.artistName}` : 'Artist pending'}</span></div>
              <div className={`state ${i === 0 ? 'approved' : 'pending'}`}>{i === 0 ? 'Recommended' : 'Review'}</div>
              <div className="cov"><b>{slot.rightsAggregate.confirmedFields}</b>/{slot.rightsAggregate.totalFields} rights</div>
              <div className="fit"><div>{slot.fitIndex}</div><span>Fit</span></div>
            </div>
          ))}
        </div>

        <div className="sv-p-tally">
          <div><b className="ap">{top ? 1 : 0}</b><span>Recommended</span></div>
          <div><b className="ps">{Math.max(packet.tracks.length - 1, 0)}</b><span>For review</span></div>
          <div><b className="pe">{packet.totalConflicts}</b><span>Rights conflicts</span></div>
        </div>

        <PrintRunFoot page={2} pages={pages} />
      </section>

      {packet.tracks.map((slot, index) => (
        <PrintTrackPage key={slot.trackId} slot={slot} index={index} total={packet.tracks.length} pages={pages} />
      ))}

      {top && runnerUp && (
        <section className="sv-p-page">
          <div className="sv-p-noise" />
          <PrintRunHead stamp="Top 2 - Head-to-head" />
          <span className="sv-p-kicker">The decision</span>
          <div className="sv-p-sec-title">Top 2 head-to-head</div>
          <div className="sv-p-sec-sub">{top.title} vs {runnerUp.title} against the same scene.</div>

          <div className="sv-p-h2h">
            <div className="leader">
              <span>Clear leader</span>
              <h3>{top.title}</h3>
              <p>{[top.tonalCharacter, top.energyCharacter, top.tempo ? `${Math.round(top.tempo)} BPM` : null].filter(Boolean).join(' - ')}</p>
              <b>{top.fitIndex}</b>
              <em>{top.explanation}</em>
            </div>
            <div className="gut"><i>▲</i><b>+{Math.max(top.fitIndex - runnerUp.fitIndex, 0)}</b><span>Lead</span></div>
            <div>
              <h3>{runnerUp.title}</h3>
              <p>{[runnerUp.tonalCharacter, runnerUp.energyCharacter, runnerUp.tempo ? `${Math.round(runnerUp.tempo)} BPM` : null].filter(Boolean).join(' - ')}</p>
              <b>{runnerUp.fitIndex}</b>
              <em>{runnerUp.explanation}</em>
            </div>
          </div>

          <div className="sv-p-verdict">
            <div>Recommendation</div>
            <p><b>{top.title}</b> leads by {Math.max(top.fitIndex - runnerUp.fitIndex, 0)} points. Use the rights detail above to confirm clearance before final placement.</p>
          </div>

          <div className="sv-p-closing">
            <img src="/logo.png" alt="SyncVision" />
            <p>SyncScore is deterministic and audit-stable: the same inputs produce the same ranking. Shared via syncvision.app.</p>
          </div>

          <PrintRunFoot page={pages} pages={pages} />
        </section>
      )}
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
        .sv-print-report  { display: none; }

        .sv-p-page, .sv-p-page * { box-sizing: border-box; }
        .sv-p-page {
          width: 210mm;
          min-height: 297mm;
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(620px 420px at 8% 4%, rgba(245,166,35,0.13), transparent 58%),
            radial-gradient(560px 380px at 98% 6%, rgba(219,39,119,0.13), transparent 58%),
            radial-gradient(760px 520px at 50% 108%, rgba(124,58,237,0.13), transparent 70%),
            linear-gradient(160deg, #120D26, #0D0B1E);
          color: #F4F2FA;
          padding: 17mm 16mm 14mm;
          font-family: ${SANS};
        }
        .sv-p-page > * { position: relative; z-index: 1; }
        .sv-p-cover { display: flex; flex-direction: column; }
        .sv-p-noise {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          opacity: 0.45;
          mix-blend-mode: overlay;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.05 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
        }
        .sv-p-logo { height: 17px; width: auto; display: block; }
        .sv-p-runhead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 14px;
          border-bottom: 1px solid rgba(123,112,178,0.18);
          margin-bottom: 22px;
        }
        .sv-p-stamp,
        .sv-p-runfoot {
          font-family: ${MONO};
          font-size: 8px;
          letter-spacing: 0.08em;
          color: rgba(155,147,196,0.62);
          text-transform: uppercase;
        }
        .sv-p-stamp { font-size: 9px; letter-spacing: 0.14em; white-space: nowrap; }
        .sv-p-runfoot {
          position: absolute;
          left: 16mm;
          right: 16mm;
          bottom: 10mm;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 9px;
          border-top: 1px solid rgba(123,112,178,0.18);
        }
        .sv-p-brandrow {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .sv-p-cover-logo { height: 24px; width: auto; }
        .sv-p-brandrow span,
        .sv-p-state,
        .sv-p-rank-row .state {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 5px 12px;
          border-radius: 999px;
          border: 1px solid rgba(123,112,178,0.34);
          font-size: 9px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #9B93C4;
          white-space: nowrap;
          font-weight: 700;
        }
        .sv-p-brandrow b { color: #F4F2FA; }
        .sv-p-hero {
          margin-top: auto;
          margin-bottom: auto;
          padding: 94px 0 76px;
        }
        .sv-p-kicker {
          font-size: 10px;
          letter-spacing: 0.26em;
          text-transform: uppercase;
          color: #F5A623;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 9px;
        }
        .sv-p-kicker::before {
          content: "";
          width: 26px;
          height: 1px;
          background: linear-gradient(90deg, #F5A623, transparent);
        }
        .sv-p-cover h1 {
          font-family: ${SERIF};
          font-weight: 400;
          font-size: 76px;
          line-height: 0.96;
          letter-spacing: -0.02em;
          margin: 16px 0 0;
        }
        .sv-p-cover h1 em,
        .sv-p-scene-card h3 em { color: #F5A623; font-style: italic; }
        .sv-p-hero p {
          font-family: ${SERIF};
          font-style: italic;
          font-size: 20px;
          line-height: 1.45;
          color: rgba(226,224,240,0.86);
          margin: 22px 0 0;
          max-width: 44ch;
        }
        .sv-p-moods {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin-top: 26px;
        }
        .sv-p-moods span {
          font-size: 10.5px;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          padding: 5px 12px;
          border-radius: 999px;
          border: 1px solid rgba(123,112,178,0.34);
          color: #9B93C4;
        }
        .sv-p-moods .accent {
          border-color: rgba(245,166,35,0.4);
          color: #F5A623;
          background: rgba(245,166,35,0.06);
        }
        .sv-p-metagrid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1px;
          background: rgba(123,112,178,0.18);
          border: 1px solid rgba(123,112,178,0.18);
          border-radius: 14px;
          overflow: hidden;
        }
        .sv-p-metagrid div {
          background: rgba(13,8,30,0.6);
          padding: 16px;
        }
        .sv-p-metagrid span,
        .sv-p-rf div,
        .sv-p-panel-label,
        .sv-p-lab,
        .sv-p-tally span,
        .sv-p-verdict div {
          display: block;
          font-size: 8.5px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(155,147,196,0.62);
          font-weight: 700;
        }
        .sv-p-metagrid b {
          display: block;
          font-size: 14px;
          color: #F4F2FA;
          margin-top: 6px;
          font-weight: 600;
        }
        .sv-p-metagrid em { font-family: ${SERIF}; color: #9B93C4; font-weight: 400; }
        .sv-p-sec-title {
          font-family: ${SERIF};
          font-size: 30px;
          line-height: 1.1;
          letter-spacing: -0.015em;
          margin: 4px 0 2px;
        }
        .sv-p-sec-sub {
          font-size: 11px;
          color: #9B93C4;
          margin-bottom: 18px;
        }
        .sv-p-scene-card {
          border: 1px solid rgba(123,112,178,0.18);
          border-radius: 16px;
          padding: 20px 22px;
          background: rgba(13,8,30,0.5);
          position: relative;
          overflow: hidden;
          margin-bottom: 22px;
        }
        .sv-p-scene-card::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: linear-gradient(180deg, #DB2777, #F5A623);
        }
        .sv-p-scene-card div {
          font-size: 9.5px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #9B93C4;
        }
        .sv-p-scene-card h3 {
          font-family: ${SERIF};
          font-weight: 400;
          font-size: 28px;
          margin: 6px 0 8px;
        }
        .sv-p-scene-card p {
          font-family: ${SERIF};
          font-style: italic;
          font-size: 14px;
          line-height: 1.5;
          color: rgba(226,224,240,0.82);
          margin: 0;
        }
        .sv-p-rank-list { display: flex; flex-direction: column; gap: 10px; }
        .sv-p-rank-row {
          display: grid;
          grid-template-columns: 30px 1fr 104px 110px 70px;
          gap: 16px;
          align-items: center;
          padding: 15px 18px;
          border: 1px solid rgba(123,112,178,0.18);
          border-radius: 14px;
          background: rgba(13,8,30,0.45);
        }
        .sv-p-rank-row.approved {
          border-color: rgba(76,175,130,0.4);
          background: linear-gradient(180deg, rgba(76,175,130,0.06), rgba(13,8,30,0.5));
        }
        .sv-p-rank-row .rk {
          font-family: ${SERIF};
          font-style: italic;
          font-size: 30px;
          color: #9B93C4;
          line-height: 1;
        }
        .sv-p-rank-row.approved .rk { color: #4CAF82; }
        .sv-p-rank-row .nm { min-width: 0; }
        .sv-p-rank-row .nm div {
          font-family: ${SERIF};
          font-size: 19px;
          line-height: 1.1;
        }
        .sv-p-rank-row .nm span {
          display: block;
          font-family: ${SERIF};
          font-style: italic;
          font-size: 12px;
          color: #9B93C4;
          margin-top: 2px;
        }
        .sv-p-rank-row .state.approved,
        .sv-p-state.clear,
        .sv-p-state.part,
        .sv-p-state.blocked {
          color: #4CAF82;
          border-color: rgba(76,175,130,0.45);
          background: rgba(76,175,130,0.12);
        }
        .sv-p-rank-row .state.pending,
        .sv-p-state.part { color: #F5A623; border-color: rgba(245,166,35,0.4); background: rgba(245,166,35,0.1); }
        .sv-p-state.blocked { color: #E85A5A; border-color: rgba(232,90,90,0.4); background: rgba(232,90,90,0.1); }
        .sv-p-rank-row .cov {
          font-family: ${MONO};
          font-size: 11px;
          color: #9B93C4;
        }
        .sv-p-rank-row .cov b { color: #F4F2FA; }
        .sv-p-rank-row .fit { text-align: right; }
        .sv-p-rank-row .fit div,
        .sv-p-tally b {
          font-family: ${SERIF};
          font-size: 30px;
          line-height: 1;
          font-weight: 400;
        }
        .sv-p-rank-row .fit span {
          display: block;
          font-size: 8px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(155,147,196,0.62);
          margin-top: 2px;
        }
        .sv-p-tally {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
          margin-top: 22px;
        }
        .sv-p-tally div {
          border: 1px solid rgba(123,112,178,0.18);
          border-radius: 14px;
          padding: 16px 18px;
          background: rgba(13,8,30,0.45);
        }
        .sv-p-tally b { display: block; font-size: 38px; margin-bottom: 8px; }
        .sv-p-tally .ap { color: #4CAF82; }
        .sv-p-tally .ps { color: #9B93C4; }
        .sv-p-tally .pe { color: #F5A623; font-style: italic; }
        .sv-p-td-head {
          display: flex;
          align-items: flex-start;
          gap: 18px;
          margin-bottom: 18px;
        }
        .sv-p-td-head .sv-p-rk {
          font-family: ${SERIF};
          font-style: italic;
          font-size: 56px;
          line-height: 0.8;
          color: #9B93C4;
          letter-spacing: -0.03em;
        }
        .sv-p-td-head.is-leader .sv-p-rk {
          background: linear-gradient(180deg, #fff, #F5A623);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .sv-p-info { flex: 1; min-width: 0; }
        .sv-p-track-name {
          font-family: ${SERIF};
          font-size: 32px;
          line-height: 1.02;
          letter-spacing: -0.015em;
          margin-top: 8px;
        }
        .sv-p-meta {
          font-size: 10.5px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #9B93C4;
          margin-top: 7px;
        }
        .sv-p-score { text-align: right; flex-shrink: 0; }
        .sv-p-score div {
          font-family: ${SERIF};
          font-size: 58px;
          line-height: 0.78;
          font-variant-numeric: tabular-nums;
        }
        .sv-p-score span {
          display: block;
          font-size: 8.5px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(155,147,196,0.62);
          margin-top: 4px;
        }
        .sv-p-assess {
          border-left: 2px solid #F5A623;
          padding: 4px 0 4px 16px;
          margin-bottom: 20px;
        }
        .sv-p-lab { color: #F5A623; }
        .sv-p-lab em { color: rgba(155,147,196,0.62); font-style: normal; font-weight: 500; margin-left: 8px; letter-spacing: 0.06em; }
        .sv-p-assess p {
          font-family: ${SERIF};
          font-style: italic;
          font-size: 15px;
          line-height: 1.5;
          color: rgba(226,224,240,0.9);
          margin: 8px 0 0;
        }
        .sv-p-panel-label { margin: 0 0 12px; color: #9B93C4; }
        .sv-p-axes { display: flex; flex-direction: column; gap: 9px; margin-bottom: 22px; }
        .sv-p-axis {
          display: grid;
          grid-template-columns: 70px 1fr 34px;
          gap: 12px;
          align-items: center;
        }
        .sv-p-axis span {
          font-size: 9px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #9B93C4;
          font-weight: 700;
        }
        .sv-p-axis i {
          display: block;
          height: 9px;
          border-radius: 5px;
          background: rgba(167,139,250,0.14);
          overflow: hidden;
        }
        .sv-p-axis b {
          display: block;
          height: 100%;
          border-radius: 5px;
          background: linear-gradient(90deg, #F5A623, #DB2777);
        }
        .sv-p-axis strong {
          font-family: ${MONO};
          font-size: 12px;
          text-align: right;
          color: #F5A623;
        }
        .sv-p-axis-cap {
          font-size: 8.5px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(155,147,196,0.62);
          margin: -12px 0 22px;
        }
        .sv-p-rights {
          display: grid;
          grid-template-columns: 1.45fr 1fr;
          border: 1px solid rgba(123,112,178,0.18);
          border-radius: 16px;
          overflow: hidden;
        }
        .sv-p-rights-head {
          grid-column: 1 / -1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 18px;
          border-bottom: 1px solid rgba(123,112,178,0.18);
          background: linear-gradient(180deg, rgba(245,166,35,0.06), transparent);
        }
        .sv-p-rights-head span {
          font-size: 9.5px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #F5A623;
          font-weight: 700;
        }
        .sv-p-rights-head b {
          font-family: ${MONO};
          font-size: 10px;
          letter-spacing: 0.04em;
          padding: 4px 10px;
          border-radius: 999px;
          font-weight: 500;
        }
        .sv-p-rights-head .clear,
        .sv-p-rf .clear { color: #4CAF82; }
        .sv-p-rights-head .part,
        .sv-p-rf .part { color: #FBBF24; }
        .sv-p-rights-head .blocked,
        .sv-p-rf .blocked { color: #E85A5A; }
        .sv-p-rfields {
          padding: 15px 18px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px 18px;
        }
        .sv-p-rf div { color: #F5A623; font-size: 8px; letter-spacing: 0.12em; }
        .sv-p-rf span {
          display: block;
          font-family: ${MONO};
          font-size: 11px;
          color: #F4F2FA;
          margin-top: 2px;
          word-break: break-word;
        }
        .sv-p-rf .none {
          font-family: ${SERIF};
          font-style: italic;
          font-size: 12px;
          color: rgba(107,100,144,0.85);
        }
        .sv-p-pipe {
          border-left: 1px solid rgba(123,112,178,0.18);
          padding: 15px 18px;
          background: rgba(255,255,255,0.012);
        }
        .sv-p-pc {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .sv-p-pc span {
          font-size: 8px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #9B93C4;
          font-weight: 700;
        }
        .sv-p-pc b {
          font-family: ${SERIF};
          font-style: italic;
          font-size: 26px;
          color: #F5A623;
          font-weight: 400;
        }
        .sv-p-stage {
          display: flex;
          align-items: center;
          gap: 9px;
          font-size: 10px;
          color: #F4F2FA;
          margin-top: 7px;
          text-transform: capitalize;
        }
        .sv-p-stage i {
          width: 15px;
          height: 15px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          font-size: 9px;
          font-weight: 800;
          font-family: ${MONO};
          font-style: normal;
          flex-shrink: 0;
        }
        .sv-p-stage.ok i { background: rgba(76,175,130,0.18); color: #4CAF82; border: 1px solid rgba(76,175,130,0.4); }
        .sv-p-stage.no { color: rgba(155,147,196,0.62); }
        .sv-p-stage.no i { background: rgba(123,112,178,0.1); color: #9B93C4; border: 1px solid rgba(123,112,178,0.34); }
        .sv-p-h2h {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: stretch;
          border: 1px solid rgba(123,112,178,0.18);
          border-radius: 16px;
          overflow: hidden;
        }
        .sv-p-h2h > div { padding: 22px; }
        .sv-p-h2h .leader { background: linear-gradient(180deg, rgba(245,166,35,0.06), transparent); }
        .sv-p-h2h .leader span {
          display: inline-flex;
          font-size: 8.5px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          font-weight: 700;
          padding: 4px 9px;
          border-radius: 999px;
          background: rgba(76,175,130,0.16);
          border: 1px solid rgba(76,175,130,0.45);
          color: #4CAF82;
          margin-bottom: 8px;
        }
        .sv-p-h2h h3 {
          font-family: ${SERIF};
          font-size: 23px;
          font-weight: 400;
          line-height: 1.05;
          margin: 0;
        }
        .sv-p-h2h p {
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #9B93C4;
          margin: 5px 0 0;
        }
        .sv-p-h2h b {
          display: block;
          font-family: ${SERIF};
          font-size: 50px;
          line-height: 0.9;
          margin-top: 12px;
          font-weight: 400;
        }
        .sv-p-h2h em {
          display: block;
          font-family: ${SERIF};
          font-style: italic;
          font-size: 13px;
          line-height: 1.45;
          color: rgba(226,224,240,0.86);
          margin-top: 14px;
        }
        .sv-p-h2h .gut {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          padding: 0 18px;
          border-left: 1px solid rgba(123,112,178,0.18);
          border-right: 1px solid rgba(123,112,178,0.18);
        }
        .sv-p-h2h .gut i { color: #4CAF82; font-style: normal; font-size: 16px; }
        .sv-p-h2h .gut b { color: #4CAF82; font-size: 32px; margin: 0; font-style: italic; }
        .sv-p-h2h .gut span {
          font-size: 8px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #4CAF82;
          font-weight: 700;
        }
        .sv-p-verdict {
          margin-top: 22px;
          padding: 20px 24px;
          border-radius: 16px;
          border: 1px solid rgba(245,166,35,0.28);
          background: linear-gradient(135deg, rgba(245,166,35,0.12), rgba(219,39,119,0.08));
        }
        .sv-p-verdict div { color: #F5A623; margin-bottom: 8px; }
        .sv-p-verdict p {
          font-family: ${SERIF};
          font-size: 17px;
          line-height: 1.45;
          margin: 0;
        }
        .sv-p-verdict b { font-family: ${SANS}; }
        .sv-p-closing {
          margin-top: 28px;
          padding-top: 24px;
          border-top: 1px solid rgba(123,112,178,0.18);
        }
        .sv-p-closing img { height: 18px; width: auto; opacity: 0.9; }
        .sv-p-closing p {
          font-family: ${SERIF};
          font-style: italic;
          font-size: 13px;
          color: #9B93C4;
          margin-top: 10px;
          max-width: 60ch;
          line-height: 1.5;
        }

        @media print {
          @page { size: A4 portrait; margin: 0; }
          *, *::before, *::after {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          html, body { background: #0D0B1E !important; color: #F4F2FA !important; }
          .sv-screen-share { display: none !important; }
          .sv-print-report {
            display: block !important;
            background: #07041a !important;
          }
          .sv-p-page {
            width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            box-shadow: none !important;
            break-after: page;
            page-break-after: always;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .sv-p-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }
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

      <PrintReport packet={packet} />

      <div className="sv-share-grid sv-screen-share" style={{
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
