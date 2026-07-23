import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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

/** Keep lane audio locked to the video clock; snap when drift exceeds 300ms. */
function resync(video: HTMLVideoElement, audio: HTMLAudioElement | null, force = false) {
  if (!audio || !Number.isFinite(audio.duration)) return;
  const target = Math.min(video.currentTime, Math.max(0, (audio.duration || Infinity) - 0.05));
  if (force || Math.abs(audio.currentTime - target) > 0.3) audio.currentTime = target;
}

export function PictureLock({ tempUrl, tempTitle, tempBlocked, sceneArc, briefId, emotionalRegister }: Props) {
  const [videoUrl,  setVideoUrl]  = useState<string | null>(null);
  const [videoName, setVideoName] = useState('');
  const [playing,   setPlaying]   = useState(false);
  const [time,      setTime]      = useState(0);
  const [duration,  setDuration]  = useState(0);
  const [active,    setActive]    = useState<'A' | 'B'>('A');
  const [bChoice,   setBChoice]   = useState<BChoice | null>(null);
  const [live,      setLive]      = useState<LiveClearableTrack[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const aRef     = useRef<HTMLAudioElement | null>(null);
  const bRef     = useRef<HTMLAudioElement | null>(null);
  const bFileUrl = useRef<string | null>(null);

  useEffect(() => {
    let aliveFlag = true;
    const mood = moodTagFor(briefId ?? '', emotionalRegister);
    void fetchLiveClearable(mood, 6).then(rows => {
      if (!aliveFlag) return;
      setLive(rows.filter(r => r.audioUrl));
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

  const bUrl = bChoice?.kind === 'live' ? bChoice.track.audioUrl : bChoice?.url ?? null;

  // Swapping the B cue mid-playback: the fresh <audio> src must join the
  // running clock, not wait for the next play gesture.
  useEffect(() => {
    const v = videoRef.current;
    const b = bRef.current;
    if (!v || !b || v.paused || !bUrl) return;
    const start = () => { resync(v, b, true); void b.play().catch(() => undefined); };
    if (b.readyState >= 1) start();
    else b.addEventListener('loadedmetadata', start, { once: true });
    return () => b.removeEventListener('loadedmetadata', start);
  }, [bUrl]);
  const bLabel = bChoice?.kind === 'live'
    ? `${bChoice.track.title} — ${bChoice.track.artist}`
    : bChoice?.kind === 'file' ? bChoice.name : 'Pick a clearable cue';
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
    resync(v, lane, true);
    // A lane that ran out (cue shorter than the cut) restarts on flip while
    // the picture is rolling.
    if (!v.paused && lane.paused) void lane.play().catch(() => undefined);
  };

  const playLane = (audio: HTMLAudioElement | null, v: HTMLVideoElement) => {
    if (!audio || !audio.src) return;
    resync(v, audio, true);
    void audio.play().catch(() => undefined);
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
    playLane(aRef.current, v);
    playLane(bRef.current, v);
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
    resync(v, aRef.current);
    resync(v, bRef.current);
  };

  const onVideoSeeked = () => {
    const v = videoRef.current;
    if (!v) return;
    resync(v, aRef.current, true);
    resync(v, bRef.current, true);
  };

  const pickVideo = (file: File) => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
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

  return (
    <div style={{ marginTop: 16, borderRadius: 14, border: `1px solid ${C.hairline}`, overflow: 'hidden', background: 'rgba(0,0,0,0.25)' }}>
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
              MP4 / MOV / WebM · stays on your device — never uploaded
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
                onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
              />
              <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 6, pointerEvents: 'none' }}>
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', fontFamily: MONO, color: '#fff', background: active === 'A' ? C.bad : C.good, borderRadius: 5, padding: '3px 7px' }}>
                  {active === 'A' ? 'A · TEMP' : 'B · CLEARABLE'}
                </span>
                <span style={{ fontSize: 9, fontWeight: 700, fontFamily: MONO, color: 'rgba(255,255,255,0.75)', background: 'rgba(0,0,0,0.55)', borderRadius: 5, padding: '3px 7px' }}>
                  scene audio off · cue only
                </span>
              </div>
            </div>

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

            {/* B source picker */}
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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

            <audio ref={aRef} src={tempUrl ?? undefined} preload="auto" muted={active !== 'A'} />
            <audio ref={bRef} src={bUrl ?? undefined} preload="auto" muted={active !== 'B'} />
          </>
        )}
      </div>
    </div>
  );
}
