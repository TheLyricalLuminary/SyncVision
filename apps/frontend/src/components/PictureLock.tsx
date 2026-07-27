import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { SceneArc } from '../utils/apiClient';
import { fetchLiveClearable, moodTagFor, type LiveClearableTrack } from '../engine/jamendoCatalog';

/**
 * Picture Lock A/B — the sync demo that closes.
 *
 * Drop in the scene cut, hit play, and flip between the director's temp (A)
 * and a clearable replacement (B) against the actual picture, gaplessly. Both
 * audio lanes run slaved to the video clock and stay mounted+playing; the A/B
 * switch only flips `muted`, so the swap is instant with no rebuffer — the
 * "same beats, on your picture" proof a supervisor gets in one gesture.
 *
 * Everything is client-side: the video never uploads (object URL only), so a
 * supervisor can use an unreleased cut without it leaving their machine.
 *
 * Three things make the comparison fair rather than merely impressive:
 *   • levels are matched, so the mastered temp doesn't just sound "better"
 *   • each lane has an in-point, so a cue can be landed on a specific beat
 *   • lanes are unlocked inside the first tap, so iOS actually plays them
 */

const C = {
  purple:  '#F5A623',
  magenta: '#DB2777',
  silver:  '#F4F2FA',
  lavender:'#9B93C4',
  amber:   '#F5B544',
  good:    '#4CAF82',
  bad:     '#E85A5A',
  hairline:'rgba(123,112,178,0.16)',
};
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS  = '"Manrope", system-ui, sans-serif';
const MONO  = '"JetBrains Mono", monospace';

const PHASES = ['Opening', 'Held breath', 'Turn', 'Release'] as const;

type BChoice =
  | { kind: 'live'; track: LiveClearableTrack }
  | { kind: 'file'; name: string; url: string };

type Props = {
  /** Resolved audio URL of the analyzed temp track (lane A). */
  tempUrl: string | null;
  tempTitle: string;
  /** Temp can't clear — drives the red framing on lane A. */
  tempBlocked: boolean;
  sceneArc?: SceneArc | null;
  briefId?: string;
  emotionalRegister?: string | null;
};

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

/**
 * Average loudness of a track, 0–1, so the A/B can be level-matched. Measured
 * by decoding the file once — never by routing playback through WebAudio,
 * which would silence any cross-origin cue. If the fetch is blocked by CORS
 * this returns null and the manual trim takes over.
 */
async function measureRms(url: string): Promise<number | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    const Ctx: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const buf = await ctx.decodeAudioData(bytes);
    void ctx.close();

    const ch = buf.getChannelData(0);
    // Stride-sample ~200k frames: plenty for an average, cheap on long cues.
    const stride = Math.max(1, Math.floor(ch.length / 200_000));
    let sum = 0;
    let n = 0;
    for (let i = 0; i < ch.length; i += stride) { sum += ch[i] * ch[i]; n++; }
    if (n === 0) return null;
    const rms = Math.sqrt(sum / n);
    return rms > 0.000_01 ? rms : null;
  } catch {
    return null;
  }
}

export function PictureLock({ tempUrl, tempTitle, tempBlocked, sceneArc, briefId, emotionalRegister }: Props) {
  const [videoUrl,  setVideoUrl]  = useState<string | null>(null);
  const [videoName, setVideoName] = useState('');
  const [videoErr,  setVideoErr]  = useState<string | null>(null);
  const [playing,   setPlaying]   = useState(false);
  const [time,      setTime]      = useState(0);
  const [duration,  setDuration]  = useState(0);
  const [active,    setActive]    = useState<'A' | 'B'>('A');
  const [bChoice,   setBChoice]   = useState<BChoice | null>(null);
  const [live,      setLive]      = useState<LiveClearableTrack[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);

  // In-point per lane: the video time at which the cue should start.
  const [inA, setInA] = useState(0);
  const [inB, setInB] = useState(0);

  // Level matching.
  const [rmsA, setRmsA] = useState<number | null>(null);
  const [rmsB, setRmsB] = useState<number | null>(null);
  const [trimDb, setTrimDb] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const aRef     = useRef<HTMLAudioElement | null>(null);
  const bRef     = useRef<HTMLAudioElement | null>(null);
  const bFileUrl = useRef<string | null>(null);
  const primed   = useRef(false);
  const inARef   = useRef(0);
  const inBRef   = useRef(0);

  useEffect(() => { inARef.current = inA; }, [inA]);
  useEffect(() => { inBRef.current = inB; }, [inB]);

  const bUrl = bChoice?.kind === 'live' ? bChoice.track.audioUrl : bChoice?.url ?? null;

  // ── lane clock ─────────────────────────────────────────────────────────────

  /** Hold each lane at `video.currentTime - inPoint`; snap past 300ms drift. */
  const resync = useCallback((v: HTMLVideoElement, audio: HTMLAudioElement | null, inPoint: number, force = false) => {
    if (!audio || !audio.src) return;
    const want = v.currentTime - inPoint;
    if (want < 0) {
      // Before its in-point: park at the top, silent.
      if (!audio.paused) audio.pause();
      if (audio.currentTime !== 0) audio.currentTime = 0;
      return;
    }
    const dur = Number.isFinite(audio.duration) ? audio.duration : Infinity;
    if (want >= dur) return;                       // cue ran out — let it lie
    if (force || Math.abs(audio.currentTime - want) > 0.3) audio.currentTime = want;
    if (!v.paused && audio.paused) void audio.play().catch(() => undefined);
  }, []);

  // ── iOS unlock ─────────────────────────────────────────────────────────────

  /**
   * iOS Safari only lets an element play if that element was started inside a
   * user gesture. The lanes are started programmatically off the video's play
   * event, so without this they stay silent. Priming them on the first tap
   * anywhere in the module unlocks both.
   */
  const primeLanes = useCallback(() => {
    if (primed.current) return;
    primed.current = true;
    [aRef.current, bRef.current].forEach(el => {
      if (!el || !el.src) return;
      const wasMuted = el.muted;
      el.muted = true;
      const p = el.play();
      if (p && typeof p.then === 'function') {
        void p.then(() => {
          el.pause();
          el.currentTime = 0;
          el.muted = wasMuted;
        }).catch(() => { el.muted = wasMuted; });
      } else {
        el.muted = wasMuted;
      }
    });
  }, []);

  // ── catalog ────────────────────────────────────────────────────────────────

  useEffect(() => {
    let aliveFlag = true;
    const mood = moodTagFor(briefId ?? '', emotionalRegister);
    void fetchLiveClearable(mood, 6).then(rows => {
      if (!aliveFlag) return;
      setLive(rows.filter(r => r.audioUrl));
      setCatalogLoaded(true);
    });
    return () => { aliveFlag = false; };
  }, [briefId, emotionalRegister]);

  // Auto-pick the first live track for B so the demo is one gesture, not three.
  useEffect(() => {
    if (!bChoice && live.length > 0) setBChoice({ kind: 'live', track: live[0] });
  }, [live, bChoice]);

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (bFileUrl.current) URL.revokeObjectURL(bFileUrl.current);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // If any other player on the page starts, stop the picture — the reverse of
  // onVideoPlay's sweep, so there is never a double soundtrack.
  useEffect(() => {
    const onAnyPlay = (e: Event) => {
      const t = e.target as HTMLMediaElement;
      const v = videoRef.current;
      if (!v || t === v || t === aRef.current || t === bRef.current) return;
      if (!v.paused) v.pause();
    };
    document.addEventListener('play', onAnyPlay, true);
    return () => document.removeEventListener('play', onAnyPlay, true);
  }, []);

  // ── level matching ─────────────────────────────────────────────────────────

  useEffect(() => { setRmsA(null); if (tempUrl) void measureRms(tempUrl).then(setRmsA); }, [tempUrl]);
  useEffect(() => { setRmsB(null); setTrimDb(0); if (bUrl) void measureRms(bUrl).then(setRmsB); }, [bUrl]);

  // Attenuate whichever lane is louder — volume can't exceed 1, so match down.
  const { volA, volB, matched } = useMemo(() => {
    let a = 1;
    let b = 1;
    const ok = Boolean(rmsA && rmsB);
    if (rmsA && rmsB) {
      if (rmsA > rmsB) a = rmsB / rmsA;
      else b = rmsA / rmsB;
    }
    const trim = Math.pow(10, trimDb / 20);
    return {
      volA: Math.min(1, Math.max(0, a)),
      volB: Math.min(1, Math.max(0, b * trim)),
      matched: ok,
    };
  }, [rmsA, rmsB, trimDb]);

  useEffect(() => { if (aRef.current) aRef.current.volume = volA; }, [volA]);
  useEffect(() => { if (bRef.current) bRef.current.volume = volB; }, [volB, bUrl]);

  // ── B swap mid-playback ────────────────────────────────────────────────────

  useEffect(() => {
    const v = videoRef.current;
    const b = bRef.current;
    if (!v || !b || v.paused || !bUrl) return;
    const start = () => { b.volume = volB; resync(v, b, inBRef.current, true); };
    if (b.readyState >= 1) start();
    else b.addEventListener('loadedmetadata', start, { once: true });
    return () => b.removeEventListener('loadedmetadata', start);
  }, [bUrl]);  // eslint-disable-line react-hooks/exhaustive-deps

  const bLabel = bChoice?.kind === 'live'
    ? `${bChoice.track.title} — ${bChoice.track.artist}`
    : bChoice?.kind === 'file' ? bChoice.name : 'No cue loaded';
  const bLicense = bChoice?.kind === 'live'
    ? (bChoice.track.commercialFree ? `${bChoice.track.license} · free w/ credit` : bChoice.track.license)
    : bChoice?.kind === 'file' ? 'your file' : null;

  const applyMute = (which: 'A' | 'B') => {
    if (aRef.current) aRef.current.muted = which !== 'A';
    if (bRef.current) bRef.current.muted = which !== 'B';
  };

  const flip = (which: 'A' | 'B') => {
    setActive(which);
    applyMute(which);
    const v = videoRef.current;
    const lane = which === 'A' ? aRef.current : bRef.current;
    if (!v || !lane) return;
    resync(v, lane, which === 'A' ? inARef.current : inBRef.current, true);
  };

  const onVideoPlay = () => {
    setPlaying(true);
    applyMute(active);
    // One soundtrack at a time: silence any players elsewhere on the screen.
    document.querySelectorAll('audio').forEach(el => {
      if (el !== aRef.current && el !== bRef.current) (el as HTMLAudioElement).pause();
    });
    const v = videoRef.current;
    if (!v) return;
    if (aRef.current) aRef.current.volume = volA;
    if (bRef.current) bRef.current.volume = volB;
    resync(v, aRef.current, inARef.current, true);
    resync(v, bRef.current, inBRef.current, true);
  };

  const onVideoPause = () => {
    setPlaying(false);
    aRef.current?.pause();
    bRef.current?.pause();
  };

  const onVideoTime = () => {
    const v = videoRef.current;
    if (!v) return;
    setTime(v.currentTime);
    resync(v, aRef.current, inARef.current);
    resync(v, bRef.current, inBRef.current);
  };

  const onVideoSeeked = () => {
    const v = videoRef.current;
    if (!v) return;
    resync(v, aRef.current, inARef.current, true);
    resync(v, bRef.current, inBRef.current, true);
  };

  // ── file intake ────────────────────────────────────────────────────────────

  const pickVideo = (file: File) => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    // ProRes .mov and HEVC are what editors export and what browsers can't
    // decode — say so up front instead of showing a black rectangle.
    const probe = document.createElement('video');
    const can = file.type ? probe.canPlayType(file.type) : '';
    setVideoErr(can === '' ? `This browser can’t decode ${file.type || file.name.split('.').pop()?.toUpperCase() || 'this file'}. Export an H.264 MP4 and drop that in.` : null);
    setVideoUrl(URL.createObjectURL(file));
    setVideoName(file.name);
    setPlaying(false);
    setTime(0);
  };

  const pickBFile = (file: File) => {
    if (bFileUrl.current) URL.revokeObjectURL(bFileUrl.current);
    bFileUrl.current = URL.createObjectURL(file);
    setBChoice({ kind: 'file', name: file.name, url: bFileUrl.current });
  };

  // ── derived display ────────────────────────────────────────────────────────

  const phaseIdx = duration > 0 ? Math.min(3, Math.floor((time / duration) * 4)) : 0;
  const phaseMag = useMemo(() => sceneArc
    ? [sceneArc.opening, sceneArc.heldBreath, sceneArc.turn, sceneArc.release]
    : [50, 60, 85, 55], [sceneArc]);

  const laneBtn = (which: 'A' | 'B', enabled: boolean): CSSProperties => {
    const on = active === which;
    const tone = which === 'A' ? C.bad : C.good;
    return {
      flex: 1, padding: '10px 12px', borderRadius: 10, cursor: enabled ? 'pointer' : 'not-allowed',
      textAlign: 'left', fontFamily: SANS, transition: 'all 0.15s', opacity: enabled ? 1 : 0.45,
      background: on ? `${tone}1f` : 'rgba(0,0,0,0.3)',
      border: `1.5px solid ${on ? tone : C.hairline}`,
      boxShadow: on && playing ? `0 0 0 3px ${tone}26` : 'none',
    };
  };

  const nudgeBtn: CSSProperties = {
    padding: '3px 7px', borderRadius: 6, background: 'rgba(0,0,0,0.35)',
    border: `1px solid ${C.hairline}`, color: C.lavender, fontSize: 10,
    fontFamily: MONO, cursor: 'pointer', lineHeight: 1.4,
  };

  const inPointRow = (which: 'A' | 'B') => {
    const val = which === 'A' ? inA : inB;
    const set = which === 'A' ? setInA : setInB;
    const apply = (next: number) => {
      const n = Math.max(0, Math.round(next * 10) / 10);
      set(n);
      const v = videoRef.current;
      const lane = which === 'A' ? aRef.current : bRef.current;
      if (v && lane) resync(v, lane, n, true);
    };
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(155,147,196,0.55)', fontFamily: MONO }}>
          {which} in
        </span>
        <button type="button" style={nudgeBtn} onClick={() => apply(val - 0.5)}>−</button>
        <span style={{ fontSize: 10, fontFamily: MONO, color: val > 0 ? C.amber : C.lavender, minWidth: 34, textAlign: 'center' }}>
          {fmt(val)}
        </span>
        <button type="button" style={nudgeBtn} onClick={() => apply(val + 0.5)}>+</button>
        <button type="button" style={nudgeBtn} onClick={() => apply(videoRef.current?.currentTime ?? 0)}>
          set here
        </button>
        {val > 0 && <button type="button" style={nudgeBtn} onClick={() => apply(0)}>clear</button>}
      </div>
    );
  };

  return (
    <div
      onPointerDownCapture={primeLanes}
      style={{ marginTop: 16, borderRadius: 14, border: `1px solid ${C.hairline}`, overflow: 'hidden', background: 'rgba(0,0,0,0.25)' }}
    >
      <div style={{ padding: '12px 15px 0' }}>
        <div style={{ fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.lavender, fontWeight: 700 }}>
          Picture Lock · A/B against your cut
        </div>
        <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 12.5, color: 'rgba(226,232,240,0.65)', marginTop: 3, lineHeight: 1.45 }}>
          Drop in the scene. Play it. Flip between the temp and the clearable cue — instantly, against picture.
        </div>
      </div>

      <div style={{ padding: '12px 12px 14px' }}>
        {!videoUrl ? (
          <label style={{ display: 'grid', placeItems: 'center', gap: 6, padding: '28px 16px', borderRadius: 12, border: `1.5px dashed rgba(123,112,178,0.4)`, cursor: 'pointer', textAlign: 'center' }}>
            <span style={{ fontSize: 22 }}>🎬</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.silver, fontFamily: SANS }}>Drop your scene cut here</span>
            <span style={{ fontSize: 10.5, color: C.lavender, fontFamily: SERIF, fontStyle: 'italic' }}>
              H.264 MP4 / WebM · stays on your device — never uploaded
            </span>
            <input
              type="file" accept="video/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) pickVideo(f); }}
            />
          </label>
        ) : (
          <>
            <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
              <video
                ref={videoRef}
                src={videoUrl}
                muted
                playsInline
                controls
                style={{ display: 'block', width: '100%', maxHeight: 340 }}
                onPlay={onVideoPlay}
                onPause={onVideoPause}
                onEnded={onVideoPause}
                onTimeUpdate={onVideoTime}
                onSeeked={onVideoSeeked}
                onLoadedMetadata={() => { setDuration(videoRef.current?.duration ?? 0); setVideoErr(null); }}
                onError={() => setVideoErr('This browser can’t decode that file (ProRes and HEVC won’t play). Export an H.264 MP4 and drop that in.')}
              />
              <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 6, pointerEvents: 'none', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', fontFamily: MONO, color: '#fff', background: active === 'A' ? C.bad : C.good, borderRadius: 5, padding: '3px 7px' }}>
                  {active === 'A' ? 'A · TEMP' : 'B · CLEARABLE'}
                </span>
                <span style={{ fontSize: 9, fontWeight: 700, fontFamily: MONO, color: 'rgba(255,255,255,0.75)', background: 'rgba(0,0,0,0.55)', borderRadius: 5, padding: '3px 7px' }}>
                  scene audio off · cue only
                </span>
                {matched && (
                  <span style={{ fontSize: 9, fontWeight: 700, fontFamily: MONO, color: C.good, background: 'rgba(0,0,0,0.55)', borderRadius: 5, padding: '3px 7px' }}>
                    ⦿ levels matched
                  </span>
                )}
              </div>
            </div>

            {videoErr && (
              <div style={{ marginTop: 8, padding: '9px 11px', borderRadius: 8, background: 'rgba(232,90,90,0.10)', border: '1px solid rgba(232,90,90,0.35)', color: C.bad, fontSize: 11, fontFamily: SANS }}>
                {videoErr}
              </div>
            )}

            {/* scene-phase strip with playhead */}
            <div style={{ position: 'relative', display: 'flex', gap: 2, marginTop: 8, height: 26, borderRadius: 7, overflow: 'hidden' }}>
              {PHASES.map((p, i) => (
                <div key={p} style={{ flex: 1, display: 'grid', placeItems: 'center', background: `rgba(245,166,35,${0.05 + (phaseMag[i] / 100) * 0.25})`, borderTop: `2px solid ${phaseIdx === i && playing ? C.amber : 'transparent'}`, transition: 'border-color 0.2s' }}>
                  <span style={{ fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: MONO, color: phaseIdx === i && playing ? C.amber : 'rgba(155,147,196,0.6)' }}>{p}</span>
                </div>
              ))}
              {duration > 0 && (
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${Math.min(100, (time / duration) * 100)}%`, width: 2, background: C.silver, opacity: 0.9 }} />
              )}
            </div>

            {/* A/B lanes */}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button" onClick={() => flip('A')} disabled={!tempUrl} style={laneBtn('A', Boolean(tempUrl))}>
                <span style={{ display: 'block', fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', fontFamily: MONO, color: C.bad }}>
                  A · TEMP{tempBlocked ? ' — WON’T CLEAR' : ''}
                </span>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.silver, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {tempTitle}
                </span>
              </button>
              <button type="button" onClick={() => flip('B')} disabled={!bUrl} style={laneBtn('B', Boolean(bUrl))}>
                <span style={{ display: 'block', fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', fontFamily: MONO, color: C.good }}>
                  B · CLEARABLE{bLicense ? ` — ${bLicense.toUpperCase()}` : ''}
                </span>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.silver, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {bLabel}
                </span>
              </button>
            </div>

            {/* in-points — land the cue on a specific beat */}
            <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {inPointRow('A')}
              {inPointRow('B')}
            </div>

            {/* level trim */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <span style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(155,147,196,0.55)', fontFamily: MONO, whiteSpace: 'nowrap' }}>
                B trim
              </span>
              <input
                type="range" min={-12} max={12} step={0.5} value={trimDb}
                onChange={e => setTrimDb(Number(e.target.value))}
                style={{ flex: 1, minWidth: 100, accentColor: C.purple }}
              />
              <span style={{ fontSize: 10, fontFamily: MONO, color: C.lavender, minWidth: 46, textAlign: 'right' }}>
                {trimDb > 0 ? '+' : ''}{trimDb.toFixed(1)} dB
              </span>
            </div>
            <div style={{ fontSize: 10, fontFamily: SERIF, fontStyle: 'italic', color: 'rgba(155,147,196,0.5)', marginTop: 4, lineHeight: 1.45 }}>
              {matched
                ? 'Levels auto-matched from both files, so the comparison is about the cue — not which one was mastered louder.'
                : 'Auto level-match unavailable for this cue (the source blocks direct reads) — trim by ear so the louder track doesn’t win by volume alone.'}
            </div>

            {/* B source picker */}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {live.length > 0 && (
                <select
                  value={bChoice?.kind === 'live' ? bChoice.track.id : ''}
                  onChange={e => {
                    const t = live.find(x => x.id === e.target.value);
                    if (t) { setBChoice({ kind: 'live', track: t }); if (active === 'B') setTimeout(() => flip('B'), 0); }
                  }}
                  style={{ flex: 1, minWidth: 180, padding: '8px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.35)', border: `1px solid ${C.hairline}`, color: C.silver, fontSize: 11.5, fontFamily: SANS }}
                >
                  {bChoice?.kind === 'file' && <option value="">{bChoice.name}</option>}
                  {live.map(t => (
                    <option key={t.id} value={t.id}>{t.title} — {t.artist} ({t.commercialFree ? 'free w/ credit' : t.license})</option>
                  ))}
                </select>
              )}
              <label style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.hairline}`, color: C.lavender, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap' }}>
                Upload cue file…
                <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) pickBFile(f); }} />
              </label>
              <label style={{ color: 'rgba(155,147,196,0.55)', fontSize: 10, fontFamily: SERIF, fontStyle: 'italic', cursor: 'pointer' }}>
                <input type="file" accept="video/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) pickVideo(f); }} />
                Replace scene ({videoName.length > 24 ? videoName.slice(0, 24) + '…' : videoName})
              </label>
            </div>

            {catalogLoaded && live.length === 0 && (
              <div style={{ marginTop: 8, padding: '9px 11px', borderRadius: 8, background: 'rgba(245,181,68,0.08)', border: '1px solid rgba(245,181,68,0.3)', color: 'rgba(226,232,240,0.72)', fontSize: 11, fontFamily: SANS, lineHeight: 1.5 }}>
                <strong style={{ color: C.amber }}>No live catalog connected.</strong> Upload a cue file to run the A/B, or connect a catalog to pull clearable options in automatically.
              </div>
            )}

            <audio ref={aRef} src={tempUrl ?? undefined} preload="auto" muted={active !== 'A'} />
            <audio ref={bRef} src={bUrl ?? undefined} preload="auto" muted={active !== 'B'} />
          </>
        )}
      </div>
    </div>
  );
}
