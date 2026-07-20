import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnalysisResult, SceneArc } from '../utils/apiClient';
import { matchClearableAlternatives, type ClearableMatch } from '../engine/matchClearable';
import { fetchLiveClearable, moodTagFor, type LiveClearableTrack } from '../engine/jamendoCatalog';

const C = {
  purple:  '#F5A623',
  magenta: '#DB2777',
  silver:  '#F4F2FA',
  lavender:'#9B93C4',
  amber:   '#F5B544',
  good:    '#4CAF82',
  bad:     '#E85A5A',
  hairline:'rgba(123,112,178,0.16)',
  hairlineStrong:'rgba(123,112,178,0.30)',
};
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS  = '"Manrope", system-ui, sans-serif';
const MONO  = '"JetBrains Mono", monospace';

function costLabel(n: number): string {
  return n === 0 ? 'Free' : `$${n.toLocaleString('en-US')}`;
}

function matchColor(score: number): string {
  return score >= 80 ? C.good : score >= 60 ? C.amber : C.lavender;
}

type Props = {
  temp: AnalysisResult;
  sceneArc?: SceneArc | null;
  /** Whether the temp is blocked/unclearable — drives the framing + default-open. */
  blocked: boolean;
  briefId?: string;
  emotionalRegister?: string | null;
};

/**
 * The money feature: when the temp track can't clear, this surfaces the
 * one-stop, pre-cleared tracks whose DNA lands closest to it — ranked by the
 * same arc-match math as the Story Match score, with per-phase delta proof and
 * a real clearance cost.
 */
export function ClearableAlternatives({ temp, sceneArc, blocked, briefId, emotionalRegister }: Props) {
  const matches = useMemo(
    () => matchClearableAlternatives(temp, sceneArc, { topN: 3 }),
    [temp, sceneArc],
  );
  const [open, setOpen] = useState(blocked);
  const [expandedId, setExpandedId] = useState<string | null>(matches[0]?.track.id ?? null);

  // Live one-stop inventory from Jamendo (backend proxy). Absent/failed → hidden.
  const [live, setLive] = useState<LiveClearableTrack[]>([]);
  useEffect(() => {
    let alive = true;
    const mood = moodTagFor(briefId ?? '', emotionalRegister);
    void fetchLiveClearable(mood, 6).then(rows => { if (alive) setLive(rows); });
    return () => { alive = false; };
  }, [briefId, emotionalRegister]);

  if (matches.length === 0) return null;

  const top = matches[0];

  return (
    <div style={{ marginTop: 16, borderRadius: 14, border: `1px solid ${blocked ? 'rgba(245,166,35,0.34)' : C.hairline}`, overflow: 'hidden', background: blocked ? 'rgba(245,166,35,0.05)' : 'rgba(0,0,0,0.22)' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 15px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <div>
          <div style={{ fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: blocked ? C.amber : C.lavender, fontWeight: 700 }}>
            {blocked ? '⚠ Temp won’t clear — one-stop replacements' : 'Clearable one-stop alternatives'}
          </div>
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 13, color: 'rgba(226,232,240,0.72)', marginTop: 3 }}>
            {matches.length} one-stop cue{matches.length > 1 ? 's' : ''} matched to this DNA · best lands {top.arcMatch.combinedScore}% · {costLabel(top.track.clearanceCostUsd)} ({top.track.license})
          </div>
        </div>
        <span style={{ fontSize: 13, color: C.lavender, transition: 'transform 0.2s', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }}>▾</span>
      </button>

      {open && (
        <div style={{ padding: '4px 12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {matches.map((m, i) => (
            <MatchCard
              key={m.track.id}
              match={m}
              rank={i + 1}
              expanded={expandedId === m.track.id}
              onToggle={() => setExpandedId(id => id === m.track.id ? null : m.track.id)}
            />
          ))}
          <div style={{ marginTop: 4, fontFamily: SERIF, fontStyle: 'italic', fontSize: 10.5, color: 'rgba(155,147,196,0.55)', lineHeight: 1.5 }}>
            Real tracks, ranked by the same arc-match math as Story Match. Each is a genuine one-stop — one creator controls master + composition under a public Creative Commons license. Confirm current terms at the source before placement.
          </div>

          {live.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 12, borderTop: `1px solid ${C.hairline}` }}>
              <div style={{ fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.lavender, fontWeight: 700, marginBottom: 3 }}>
                Live one-stop inventory · Jamendo
              </div>
              <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 11.5, color: 'rgba(226,232,240,0.6)', marginBottom: 10 }}>
                {live.length} more matched to your scene mood — preview and license one-stop. Run any through Story Match to score its arc.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {live.map(t => <LiveRow key={t.id} track={t} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LiveRow({ track }: { track: LiveClearableTrack }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggle = () => {
    const a = audioRef.current;
    if (!a || !track.audioUrl) return;
    if (a.paused) { void a.play().catch(() => setPlaying(false)); } else { a.pause(); }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 10, background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.hairline}` }}>
      <button
        type="button"
        onClick={toggle}
        disabled={!track.audioUrl}
        aria-label={playing ? 'Pause' : 'Play'}
        style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', background: track.audioUrl ? `linear-gradient(135deg,${C.purple},${C.magenta})` : 'rgba(123,112,178,0.15)', color: track.audioUrl ? '#fff' : C.lavender, border: 'none', cursor: track.audioUrl ? 'pointer' : 'not-allowed' }}
      >
        {playing
          ? <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><rect x="1.5" y="1" width="2.5" height="8"/><rect x="6" y="1" width="2.5" height="8"/></svg>
          : <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><path d="M2 1 L8 5 L2 9 Z"/></svg>}
      </button>

      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.silver, fontFamily: SANS, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.title}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 11, color: C.lavender }}>{track.artist}</span>
          <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.04em', color: track.commercialFree ? C.good : C.amber, background: track.commercialFree ? 'rgba(76,175,130,0.12)' : 'rgba(245,181,68,0.12)', border: `1px solid ${track.commercialFree ? 'rgba(76,175,130,0.32)' : 'rgba(245,181,68,0.3)'}`, borderRadius: 999, padding: '2px 6px' }}>
            {track.commercialFree ? `${track.license} · free w/ credit` : track.license}
          </span>
        </span>
      </span>

      <a
        href={track.licenseUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: 10.5, fontWeight: 700, color: C.amber, textDecoration: 'none', letterSpacing: '0.02em', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}
      >
        License
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M17 7H9M17 7v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </a>

      {track.audioUrl && (
        <audio
          ref={audioRef}
          src={track.audioUrl}
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
      )}
    </div>
  );
}

function MatchCard({ match, rank, expanded, onToggle }: { match: ClearableMatch; rank: number; expanded: boolean; onToggle: () => void }) {
  const { track, arcMatch, phaseDeltas, proof } = match;
  const mc = matchColor(arcMatch.combinedScore);

  return (
    <div style={{ borderRadius: 11, border: `1px solid ${C.hairline}`, background: 'rgba(0,0,0,0.28)', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{ width: '100%', display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 11, padding: '11px 13px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 18, color: mc, lineHeight: 1, width: 20, textAlign: 'center' }}>{rank}</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: C.silver, fontFamily: SANS, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.title}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 11.5, color: C.lavender }}>{track.artist}</span>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: C.good, background: 'rgba(76,175,130,0.12)', border: '1px solid rgba(76,175,130,0.32)', borderRadius: 999, padding: '2px 7px' }}>ONE-STOP</span>
          </span>
        </span>
        <span style={{ textAlign: 'right' }}>
          <span style={{ display: 'block', fontFamily: MONO, fontSize: 18, fontWeight: 700, color: mc, lineHeight: 1 }}>{arcMatch.combinedScore}<span style={{ fontSize: 10, color: 'rgba(155,147,196,0.55)' }}>%</span></span>
          <span style={{ display: 'block', fontFamily: MONO, fontSize: 11, color: track.clearanceCostUsd === 0 ? C.good : C.silver, marginTop: 3 }}>{costLabel(track.clearanceCostUsd)}</span>
        </span>
      </button>

      {expanded && (
        <div style={{ padding: '2px 13px 13px' }}>
          <p style={{ margin: '0 0 11px', fontFamily: SERIF, fontStyle: 'italic', fontSize: 12.5, lineHeight: 1.5, color: 'rgba(226,232,240,0.82)' }}>{proof}</p>

          {/* per-phase delta proof — the falsifiable evidence */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr 1fr 34px', gap: 8, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(155,147,196,0.55)', fontWeight: 700, paddingBottom: 2 }}>
              <span>Phase</span><span>Temp</span><span>This cue</span><span style={{ textAlign: 'right' }}>Δ</span>
            </div>
            {phaseDeltas.map(pd => {
              const off = Math.abs(pd.delta) > 12;
              return (
                <div key={pd.phase} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 1fr 34px', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 9.5, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.lavender, fontWeight: 700 }}>{pd.phase}</span>
                  <MiniBar value={pd.temp} color="rgba(155,147,196,0.5)" />
                  <MiniBar value={pd.candidate} color={C.purple} />
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, textAlign: 'right', color: off ? C.bad : C.good }}>{pd.delta > 0 ? `+${pd.delta}` : pd.delta}</span>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 11, display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 10.5, color: C.lavender }}>
            <Meta label={`${track.tempo} BPM`} />
            <Meta label={track.tonalCharacter} />
            <Meta label={track.license} accent />
            {track.attributionRequired && <Meta label="Credit required" />}
          </div>

          <div style={{ marginTop: 9, fontFamily: SERIF, fontStyle: 'italic', fontSize: 11, color: 'rgba(155,147,196,0.7)', lineHeight: 1.5 }}>
            {track.oneStopNote}
          </div>

          <a
            href={track.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ marginTop: 9, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: C.amber, textDecoration: 'none', letterSpacing: '0.02em' }}
          >
            Get it &amp; verify at {track.source}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M17 7H9M17 7v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </a>
        </div>
      )}
    </div>
  );
}

function MiniBar({ value, color }: { value: number; color: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ flex: 1, height: 5, borderRadius: 999, background: 'rgba(123,112,178,0.14)', overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${Math.max(0, Math.min(100, value))}%`, background: color, borderRadius: 999 }} />
      </span>
      <span style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(226,232,240,0.7)', width: 20, textAlign: 'right' }}>{value}</span>
    </span>
  );
}

function Meta({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 999, background: accent ? 'rgba(76,175,130,0.12)' : 'rgba(123,112,178,0.08)', border: `1px solid ${accent ? 'rgba(76,175,130,0.32)' : 'rgba(123,112,178,0.16)'}`, color: accent ? '#4CAF82' : '#9B93C4', whiteSpace: 'nowrap' }}>{label}</span>
  );
}
