// apps/frontend/src/pages/ShareView.tsx
// Read-only decision-packet view — share view and print/PDF surface share this file.
// Graphs render identically in HTML and @media print via CSS only (no canvas).
import { useState, useRef, useEffect } from 'react';
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

// ─── Conflict matrix ─────────────────────────────────────────────────────────
// rows = rights fields, cols = sources
// Each cell: background tint + glyph (always) + aria-label (accessibility)
// In @media print backgrounds may strip — the glyph is always present.

// ─── Rights pipeline bar ──────────────────────────────────────────────────────

// ─── Aggregate readout ─────────────────────────────────────────────────────────

// ─── Audio player ──────────────────────────────────────────────────────────────


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

type DecisionState = 'approved' | 'leader' | 'passed';

const WAVE_HEIGHTS = [30, 55, 40, 72, 50, 90, 60, 35, 65, 48, 78, 42, 62, 38, 55, 80, 45, 60, 30, 70, 42, 55, 36, 50, 65, 40, 58, 32, 48, 55, 38, 60, 42, 50, 30, 45, 52, 34, 66, 44, 58, 36, 49, 63, 41, 54];

function CheckIcon({ size = 11 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M5 12 L10 17 L20 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function XIcon({ size = 11 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>;
}

function PlayIcon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 10 10"><path d="M2 1 L8 5 L2 9 Z" fill="currentColor" /></svg>;
}

function SparkIcon() {
  return <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M12 2 L14.5 9.5 L22 12 L14.5 14.5 L12 22 L9.5 14.5 L2 12 L9.5 9.5 Z" fill="currentColor" /></svg>;
}

function CompareIcon({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M9 4 H5 a1 1 0 0 0-1 1 v14 a1 1 0 0 0 1 1 h4 M15 4 h4 a1 1 0 0 1 1 1 v14 a1 1 0 0 1-1 1 h-4 M12 3 v18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function prettySceneName(packet: DecisionPacket) {
  if (packet.briefText.toLowerCase().includes('quiet surrender')) return 'The Quiet Surrender';
  return packet.briefId
    .split(/[-_]/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ') || 'The Quiet Surrender';
}

function trackMeta(slot: TrackSlot) {
  const parts = [
    slot.artistName ? `by ${slot.artistName}` : null,
    slot.tempo ? `${Math.round(slot.tempo)} BPM` : null,
  ].filter(Boolean);
  return parts.join(' - ');
}

function axisPct(value: number) {
  return Math.round(value * 100);
}

// ── Real audio player — uses the signed share-audio token from the API ────────
function AudioPlayer({ token, title }: { token: string; title: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing,  setPlaying]  = useState(false);
  const [time,     setTime]     = useState(0);
  const [duration, setDuration] = useState(0);
  const [error,    setError]    = useState(false);

  const audioUrl = `${API_BASE}/api/share/audio/${token}`;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime     = () => setTime(audio.currentTime);
    const onDuration = () => setDuration(audio.duration || 0);
    const onEnded    = () => setPlaying(false);
    const onError    = () => setError(true);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onDuration);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || error) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play().then(() => setPlaying(true)).catch(() => setError(true)); }
  };

  const dur = duration || (174);
  const pct = dur > 0 ? time / dur : 0;
  const playedBars = Math.round(pct * WAVE_HEIGHTS.length);

  return (
    <div className="track-waveform">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      <button className="play" type="button" aria-label={playing ? `Pause ${title}` : `Play ${title}`} onClick={togglePlay}>
        {playing
          ? <svg width="14" height="14" viewBox="0 0 10 10"><rect x="1.5" y="1" width="2.5" height="8" fill="currentColor" rx="0.5" /><rect x="6" y="1" width="2.5" height="8" fill="currentColor" rx="0.5" /></svg>
          : <PlayIcon />}
      </button>
      <div className="wave" aria-hidden="true">
        {WAVE_HEIGHTS.map((height, index) => (
          <i key={index} className={index < playedBars ? 'played' : undefined} style={{ height: `${height}%` }} />
        ))}
      </div>
      <span className="time">{formatTime(time)} / {formatTime(dur)}</span>
      {error && <span style={{ fontSize: 10, color: 'var(--sv-bad)', marginLeft: 6 }}>Audio unavailable</span>}
    </div>
  );
}

// ── Static waveform fallback when no audio token ───────────────────────────────
function LiveWaveform({ slot, played = false }: { slot: TrackSlot; played?: boolean }) {
  const duration = slot.tempo ? Math.round(Math.max(150, Math.min(220, slot.tempo * 2.35))) : 174;
  const current = played ? Math.min(72, duration) : 0;
  const playedBars = Math.round((current / duration) * WAVE_HEIGHTS.length);

  return (
    <div className="track-waveform">
      <button className="play" type="button" aria-label={`Play ${slot.title}`}><PlayIcon /></button>
      <div className="wave" aria-hidden="true">
        {WAVE_HEIGHTS.map((height, index) => (
          <i key={`${slot.trackId}-${index}`} className={index < playedBars ? 'played' : undefined} style={{ height: `${height}%` }} />
        ))}
      </div>
      <span className="time">{formatTime(current)} / {formatTime(duration)}</span>
    </div>
  );
}

function LiveRightsBlock({ slot }: { slot: TrackSlot }) {
  const clearance = clearanceLabel(slot.rightsState);
  const completed = slot.pipeline.filter(stage => stage.completed).length;
  const confidence = slot.pipeline.length ? Math.round((completed / slot.pipeline.length) * 100) : 0;
  const splitPct = fieldValue(slot, 'split_pct');
  const fields: { label: string; value: string; highlight?: boolean }[] = [
    { label: 'ISRC',            value: slot.isrc ?? '- not entered -' },
    { label: 'Work ID - ISWC',  value: fieldValue(slot, 'iswc') },
    { label: 'Writer',          value: fieldValue(slot, 'writer') },
    { label: 'Writer split %',  value: splitPct, highlight: !splitPct.startsWith('-') },
    { label: 'Writer IPI',      value: fieldValue(slot, 'ipi') },
    { label: 'Publisher',       value: fieldValue(slot, 'publisher') },
    { label: 'PRO affiliation', value: fieldValue(slot, 'pro_affiliation') },
    { label: 'Sync license',    value: clearance.label },
  ];

  return (
    <div className="rights-block">
      <div className="rights-head">
        <span className="rb-label">Rights & clearance</span>
        <span className={`rb-status ${clearance.tone}`}>{clearance.label}</span>
      </div>
      <div className="rights-body">
        <div className="rights-grid">
          {fields.map(({ label, value, highlight }) => (
            <div className={`rf ${highlight ? 'rf-highlight' : ''}`} key={label}>
              <span className="k">{label}</span>
              <span className={`v ${String(value).startsWith('-') ? 'none' : ''}`}>{value}</span>
            </div>
          ))}
        </div>
        <div className="rights-pipeline">
          <div className="rp-top"><span className="lbl">Rights confidence</span><span className="pct">{confidence}%</span></div>
          {slot.pipeline.map(stage => (
            <div className={`rp-stage ${stage.completed ? 'ok' : 'no'}`} key={stage.stage}>
              <span className="gl">{stage.completed ? '✓' : '×'}</span>
              {stage.stage.replace(/_/g, ' ').toLowerCase()}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LiveTrackCard({
  slot,
  state,
  setState,
  showRights,
  note,
  onNoteChange,
}: {
  slot: TrackSlot;
  state: DecisionState;
  setState: (state: DecisionState) => void;
  showRights?: boolean;
  note: string;
  onNoteChange: (note: string) => void;
}) {
  const isApproved = state === 'approved';
  const isPassed = state === 'passed';
  const label = isApproved ? 'Approved' : isPassed ? 'Passed' : 'Awaiting decision';

  return (
    <article className="track-card" data-state={state}>
      <div className="track-head">
        <div className="track-rank">{slot.rank}</div>
        <div className="track-info">
          <span className="track-state-pill">
            {isApproved ? <CheckIcon size={9} /> : isPassed ? <XIcon size={9} /> : <span className="dot" />}
            {label}
          </span>
          <div className="track-name">{slot.title}</div>
          <div className="track-artist">{trackMeta(slot) || 'by Artist pending'}</div>
        </div>
        <div className="track-score-block"><div className="n">{slot.fitIndex}</div><div className="l">Fit</div></div>
      </div>

      {/* Audio player — real if token available, static visual fallback otherwise */}
      {!isPassed && (
        slot.audioToken
          ? <AudioPlayer token={slot.audioToken} title={slot.title} />
          : <LiveWaveform slot={slot} played={isApproved} />
      )}

      <div className="ai-quote">
        <div className="ai-label"><SparkIcon />Why this track</div>
        <p>{slot.explanation}</p>
      </div>

      {/* FIT INDEX axis bars — same layout as the results/shortlist view */}
      <div className="fit-index-block">
        <div className="fi-label">Fit index</div>
        <div className="fi-axes">
          {([
            ['Scene',  slot.vector.scene,  '#F5A623'],
            ['Rights', slot.vector.rights, slot.vector.rights >= 0.65 ? '#4CAF82' : slot.vector.rights >= 0.35 ? '#F5B544' : '#E85A5A'],
            ['Lyrics', slot.vector.lyrics, '#9B93C4'],
            ['Signal', slot.vector.signal, 'rgba(155,147,196,0.55)'],
          ] as const).map(([label, value, color]) => {
            const pct = Math.round(value * 100);
            return (
              <div className="fi-axis" key={label}>
                <span className="fi-name">{label}</span>
                <span className="fi-bar"><span className="fi-fill" style={{ width: `${pct}%`, background: color }} /></span>
                <span className="fi-val">{pct}</span>
              </div>
            );
          })}
        </div>
      </div>

      {showRights && <LiveRightsBlock slot={slot} />}

      <div className="decision-row">
        <button className="decision-btn approve" type="button" onClick={() => setState('approved')}>
          <span className="ico"><CheckIcon /></span>{isApproved ? 'Approved' : 'Approve'}
        </button>
        <button className="decision-btn pass" type="button" onClick={() => setState('passed')}>
          <span className="ico"><XIcon /></span>{isPassed ? 'Passed' : 'Pass'}
        </button>
      </div>

      {/* Notes — always visible, controlled state, persists across approve/pass actions */}
      <div className={`comment-strip ${note.length > 0 ? 'has-note' : ''}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 5 H20 V17 H10 L6 21 V17 H4 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
        <input
          className="comment-input"
          value={note}
          onChange={e => onNoteChange(e.target.value)}
          placeholder="Leave a note…"
        />
        {note.length > 0 && (
          <button
            className="note-send-btn"
            type="button"
            onClick={() => onNoteChange('')}
            title="Clear note"
            style={{ flexShrink: 0, background: 'none', border: 'none', color: 'rgba(155,147,196,0.6)', cursor: 'pointer', padding: '0 4px', fontSize: 12 }}
          >✕</button>
        )}
      </div>
    </article>
  );
}

type CmpSeg = 'both' | 'first' | 'second';

function CompareModal({ packet, open, onClose }: { packet: DecisionPacket; open: boolean; onClose: () => void }) {
  const first = packet.tracks[0];
  const second = packet.tracks[1];
  const [seg, setSeg] = useState<CmpSeg>('both');
  if (!first || !second) return null;
  const lead = Math.max(first.fitIndex - second.fitIndex, 0);
  const showFirst  = seg === 'both' || seg === 'first';
  const showSecond = seg === 'both' || seg === 'second';

  return (
    <div className={`cmp-overlay ${open ? 'open' : ''}`} role="dialog" aria-modal="true" aria-label="Top 2 head-to-head comparison">
      <div className="cmp-modal">
        <div className="cmp-head">
          <div>
            <span className="ch-kicker"><CompareIcon size={12} />Top 2 head-to-head</span>
            <h2>{first.title} <span>vs</span> {second.title}</h2>
            <div className="ch-scene">Scene 14 - <em>{prettySceneName(packet)}.</em> {packet.briefText}</div>
          </div>
          <button className="cmp-close" type="button" onClick={onClose} aria-label="Close comparison"><XIcon size={16} /></button>
        </div>

        <div className="cmp-transport">
          <button className="cmp-playbtn" type="button"><PlayIcon /><span>Play {seg === 'both' ? 'both' : seg === 'first' ? '#1' : '#2'}</span></button>
          <div className="cmp-seg">
            <button className={seg === 'both'   ? 'on' : undefined} type="button" onClick={() => setSeg('both')}>Both</button>
            <button className={seg === 'first'  ? 'on' : undefined} type="button" onClick={() => setSeg('first')}>#1</button>
            <button className={seg === 'second' ? 'on' : undefined} type="button" onClick={() => setSeg('second')}>#2</button>
          </div>
          <button className="cmp-chip" data-on="1" type="button"><span className="dot" />Loop 30s</button>
          <span className="cmp-tempo">Tempo <b>{first.tempo ? Math.round(first.tempo) : 68}</b> <span className="arrow">→</span> <b>{second.tempo ? Math.round(second.tempo) : 82}</b> BPM</span>
        </div>
        <div className="cmp-scrub-row"><div className="cmp-scrub"><div className="fill" /><div className="head" /></div><span className="cmp-time">0:00 / 0:30</span></div>

        <div className="cmp-body">
          <div className="cmp-section">
            <div className="cmp-split cmp-identity">
              {showFirst && (
                <div className="cmp-half is-leader" key={first.trackId}>
                  <span className="cmp-leader-badge"><CheckIcon size={9} />Clear leader</span>
                  <div className="cmp-trackname">{first.title}</div>
                  <div className="cmp-trackmeta">{[first.tonalCharacter, first.energyCharacter, first.tempo ? `${Math.round(first.tempo)} BPM` : null].filter(Boolean).join(' - ')}</div>
                  <div className="cmp-score-row"><span className="cmp-score">{first.fitIndex}</span><span className="cmp-score-l">Fit</span></div>
                  <div className="cmp-mini-wave">{WAVE_HEIGHTS.map((height, i) => <i key={i} className={i < 16 ? 'played' : undefined} style={{ height: `${height}%` }} />)}</div>
                </div>
              )}
              {seg === 'both' && <div className="cmp-gap"><div className="g-arrow">▲</div><div className="g-num">+{lead}</div><div className="g-lbl">Lead</div></div>}
              {showSecond && (
                <div className="cmp-half" key={second.trackId}>
                  <div className="cmp-trackname">{second.title}</div>
                  <div className="cmp-trackmeta">{[second.tonalCharacter, second.energyCharacter, second.tempo ? `${Math.round(second.tempo)} BPM` : null].filter(Boolean).join(' - ')}</div>
                  <div className="cmp-score-row"><span className="cmp-score">{second.fitIndex}</span><span className="cmp-score-l">Fit</span></div>
                  <div className="cmp-mini-wave">{WAVE_HEIGHTS.map((height, i) => <i key={i} className={i < 16 ? 'played' : undefined} style={{ height: `${height}%` }} />)}</div>
                </div>
              )}
            </div>
          </div>

          <div className="cmp-section">
            <div className="cmp-seclabel">Why this track</div>
            <div className="cmp-split">
              {showFirst  && <div className="cmp-half"><p className="cmp-why">{first.explanation}</p></div>}
              {showSecond && <div className="cmp-half"><p className="cmp-why">{second.explanation}</p></div>}
            </div>
          </div>

          <div className="cmp-section">
            <div className="cmp-seclabel">SyncScore axes</div>
            <div className="cmp-split">
              {[first, second].filter((_, i) => i === 0 ? showFirst : showSecond).map((slot, index) => (
                <div className={`cmp-half ${index === 0 && showFirst ? 'is-leader' : ''}`} key={slot.trackId}>
                  <div className="cmp-axes">
                    {([
                      ['Scene', slot.vector.scene],
                      ['Rights', slot.vector.rights],
                      ['Lyrics', slot.vector.lyrics],
                      ['Signal', slot.vector.signal],
                    ] as const).map(([label, value]) => (
                      <div className="cmp-axis" key={label}><span className="a-n">{label}</span><span className="a-t"><span className="a-f" style={{ width: `${axisPct(value)}%` }} /></span><span className="a-v">{axisPct(value)}</span></div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="cmp-section">
            <div className="cmp-seclabel">Rights coverage</div>
            <div className="cmp-split">
              {[first, second].filter((_, i) => i === 0 ? showFirst : showSecond).map(slot => {
                const total = Math.max(slot.rightsAggregate.totalFields, 1);
                const pct = Math.round((slot.rightsAggregate.confirmedFields / total) * 100);
                const risk = pct >= 65 ? 'low' : pct >= 40 ? 'med' : 'high';
                return (
                  <div className="cmp-half" key={slot.trackId}>
                    <div className="cmp-rights-cov"><span className="num">{slot.rightsAggregate.confirmedFields}</span><span className="of">of {total} cleared</span><span className="miss">{slot.rightsAggregate.missing} missing</span></div>
                    <div className={`cmp-risk ${risk}`}><div className="r-track"><i style={{ width: `${pct}%` }} /></div><div className="r-lbl">{risk === 'low' ? '✓ Low clearance risk' : risk === 'med' ? '• Medium clearance risk' : '⚠ High clearance risk'}</div></div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="cmp-actions">
          <div className="cmp-summary"><b>{first.title}</b> leads on intimacy and emotional fit. <b>{second.title}</b> may have cleaner rights, but pulls energy out of the scene.</div>
          <div className="cmp-act-btns"><button className="cmp-act" type="button">Export top 2</button><button className="cmp-act" type="button">Send both to editor</button><button className="cmp-act primary" type="button">Save as new shortlist</button></div>
        </div>
      </div>
    </div>
  );
}

function LiveShareView({ packet }: { packet: DecisionPacket }) {
  const [decisions, setDecisions] = useState<Record<string, DecisionState>>(() => Object.fromEntries(
    packet.tracks.map((slot, index) => [slot.trackId, index === 0 ? 'approved' : index === packet.tracks.length - 1 ? 'passed' : 'leader']),
  ));
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(packet.tracks.map(slot => [slot.trackId, ''])),
  );
  const [compareOpen, setCompareOpen] = useState(false);
  const approved = Object.values(decisions).filter(state => state === 'approved').length;
  const passed = Object.values(decisions).filter(state => state === 'passed').length;
  const pending = Math.max(packet.tracks.length - approved - passed, 0);
  const sceneName = prettySceneName(packet);
  const moodPills = [
    packet.sceneParams.emotionalRegister,
    packet.sceneParams.pacing,
    'Intimate',
    'Bittersweet',
  ].filter(Boolean).slice(0, 4);

  return (
    <div className="sv-live-share sv-screen-share">
      <header className="topbar topbar-share">
        <div className="topbar-inner">
          <div className="brand">
            <img className="logo" src="/logo.png" alt="SyncVision" />
            <span className="divider" />
            <span className="read-badge"><span className="lock">▣</span>Read-only - <b>Director View</b></span>
          </div>
          <div className="sender-card"><span className="avatar">MK</span><span className="who">Shared by Maya K.<span className="role">music supervisor</span></span></div>
        </div>
      </header>

      <main className="shell">
        <div className="hero-row">
          <div className="titles"><span className="kicker">For your review</span><h1>{packet.tracks.length} candidates for <em>Scene 14.</em></h1></div>
          <div className="hero-meta">Approve, pass, or leave a note. Decisions sync back to Maya.</div>
        </div>

        <section className="share-stage">
          <aside className="brief-panel">
            <div className="crumb">The Scene</div>
            <h2>{sceneName.replace(/^The\s/i, 'The ')} <em>{sceneName.includes(' ') ? sceneName.split(' ').slice(-1)[0] : 'Surrender'}</em></h2>
            <p className="brief-line">{packet.briefText || 'Two estranged brothers reconnect at a funeral. The moment before either of them speaks.'}</p>
            <div className="brief-meta">
              <div className="row"><span className="k">Pacing</span><span className="v">{packet.sceneParams.pacing ?? 'Slow'} - <em>restrained</em></span></div>
              <div className="row"><span className="k">Listening for</span><span className="v"><em>{packet.sceneParams.emotionalRegister ?? 'Yearning, intimate, bittersweet emotional release.'}</em></span></div>
            </div>
            <div className="brief-pills">{moodPills.map(pill => <span className="pill" key={pill}>{pill}</span>)}</div>
            <div className="decision-summary">
              <div className="label">Your decisions</div>
              <div className="count-row">
                <div><div className="cnt ap">{approved}</div><div className="lbl">Approved</div></div>
                <div><div className="cnt ps">{passed}</div><div className="lbl">Passed</div></div>
                <div><div className="cnt left">{pending}</div><div className="lbl">Pending</div></div>
              </div>
              <div className="progress"><span className="ap-fill" style={{ width: `${(approved / packet.tracks.length) * 100}%` }} /><span className="ps-fill" style={{ width: `${(passed / packet.tracks.length) * 100}%` }} /></div>
            </div>
          </aside>

          <div className="tracks-col">
            <div className="tracks-head"><span className="label"><span className="count">{packet.tracks.length}</span> tracks - ranked by fit</span><span className="nav-helper">scroll to review</span></div>
            {packet.tracks.map((slot, index) => (
              <div key={slot.trackId} className="track-wrap">
                {index === 1 && packet.tracks.length > 1 && (
                  <button className="compare-cta" type="button" onClick={() => setCompareOpen(true)}>
                    <span className="cc-ico"><CompareIcon /></span><span className="cc-txt"><span className="cc-title">Compare Top 2 head-to-head</span><span className="cc-sub">Hear #1 and #2 against the same scene, side by side</span></span><span className="cc-arrow">→</span>
                  </button>
                )}
                <LiveTrackCard
                  slot={slot}
                  state={decisions[slot.trackId] ?? 'leader'}
                  setState={state => setDecisions(current => ({ ...current, [slot.trackId]: state }))}
                  showRights={index === 0}
                  note={notes[slot.trackId] ?? ''}
                  onNoteChange={text => setNotes(current => ({ ...current, [slot.trackId]: text }))}
                />
              </div>
            ))}
            <div className="final-cta"><div className="copy">{pending} <em>pending</em>. When you've made all calls, Maya gets a notification.</div><button className="cta" type="button">Send decisions →</button></div>
          </div>
        </section>
      </main>

      <CompareModal packet={packet} open={compareOpen} onClose={() => setCompareOpen(false)} />
    </div>
  );
}

// ─── Main ShareView ───────────────────────────────────────────────────────────
interface ShareViewProps {
  packet: DecisionPacket;
}

export default function ShareView({ packet }: ShareViewProps) {
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
        .sv-legacy-share  { display: none !important; }

        .sv-live-share {
          --sv-bg0: #07041a;
          --sv-bg1: #0D0B1E;
          --sv-surface: rgba(25,18,48,0.78);
          --sv-surface2: rgba(13,8,30,0.82);
          --sv-silver: #F4F2FA;
          --sv-lavender: #9B93C4;
          --sv-amber: #F5A623;
          --sv-magenta: #DB2777;
          --sv-good: #4CAF82;
          --sv-bad: #E85A5A;
          --sv-hairline: rgba(123,112,178,0.18);
          --sv-hairline-strong: rgba(123,112,178,0.34);
          min-height: 100vh;
          color: var(--sv-silver);
          font-family: ${SANS};
          background:
            radial-gradient(760px 520px at 11% 16%, rgba(245,166,35,0.12), transparent 62%),
            radial-gradient(700px 520px at 88% 15%, rgba(219,39,119,0.16), transparent 60%),
            radial-gradient(840px 560px at 50% 105%, rgba(124,58,237,0.14), transparent 68%),
            linear-gradient(180deg, var(--sv-bg0), var(--sv-bg1));
          position: relative;
          overflow-x: hidden;
        }
        .sv-live-share::before {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          opacity: 0.42;
          mix-blend-mode: overlay;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.06 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
        }
        .sv-live-share .topbar {
          position: sticky;
          top: 0;
          z-index: 20;
          background: linear-gradient(180deg, rgba(7,4,26,0.94), rgba(7,4,26,0.70) 72%, transparent);
          -webkit-backdrop-filter: blur(14px);
          backdrop-filter: blur(14px);
          border-bottom: 1px solid var(--sv-hairline);
        }
        .sv-live-share .topbar-inner {
          max-width: 1480px;
          margin: 0 auto;
          padding: 16px 28px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .sv-live-share .brand,
        .sv-live-share .sender-card,
        .sv-live-share .read-badge {
          display: flex;
          align-items: center;
        }
        .sv-live-share .brand { gap: 14px; }
        .sv-live-share .brand .logo { height: 21px; width: auto; display: block; }
        .sv-live-share .brand .divider { width: 1px; height: 18px; background: var(--sv-hairline-strong); }
        .sv-live-share .read-badge {
          gap: 8px;
          padding: 5px 12px 5px 6px;
          border-radius: 999px;
          background: rgba(155,147,196,0.08);
          border: 1px solid var(--sv-hairline-strong);
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--sv-lavender);
        }
        .sv-live-share .read-badge .lock {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: rgba(155,147,196,0.18);
          color: var(--sv-lavender);
          display: grid;
          place-items: center;
          font-size: 8px;
        }
        .sv-live-share .read-badge b { color: var(--sv-silver); }
        .sv-live-share .sender-card {
          gap: 10px;
          padding: 6px 10px 6px 6px;
          border-radius: 999px;
          background: rgba(155,147,196,0.06);
          border: 1px solid var(--sv-hairline);
        }
        .sv-live-share .avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--sv-amber), var(--sv-magenta));
          color: white;
          font-weight: 700;
          font-size: 11px;
          display: grid;
          place-items: center;
          flex-shrink: 0;
        }
        .sv-live-share .who { font-size: 12px; color: var(--sv-silver); font-weight: 700; line-height: 1.2; }
        .sv-live-share .role { display: block; font-family: ${SERIF}; font-style: italic; color: var(--sv-lavender); font-size: 11px; font-weight: 400; }
        .sv-live-share .shell {
          position: relative;
          z-index: 1;
          max-width: 1480px;
          margin: 0 auto;
          padding: 36px 28px 96px;
        }
        .sv-live-share .hero-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 24px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }
        .sv-live-share .kicker {
          font-size: 11px;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          color: var(--sv-amber);
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }
        .sv-live-share .kicker::before {
          content: "";
          width: 28px;
          height: 1px;
          background: linear-gradient(90deg, var(--sv-amber), transparent);
        }
        .sv-live-share h1 {
          margin: 8px 0 0;
          font-family: ${SERIF};
          font-weight: 400;
          font-size: clamp(32px, 4.4vw, 56px);
          line-height: 1.02;
          letter-spacing: -0.02em;
          color: var(--sv-silver);
        }
        .sv-live-share h1 em,
        .sv-live-share .brief-panel h2 em { color: var(--sv-amber); font-style: italic; }
        .sv-live-share .hero-meta {
          font-family: ${SERIF};
          font-style: italic;
          font-size: clamp(14px, 1.4vw, 18px);
          color: rgba(155,147,196,0.76);
          max-width: 340px;
          text-align: right;
        }
        .sv-live-share .share-stage {
          display: grid;
          grid-template-columns: minmax(320px, 1fr) minmax(0, 1.8fr);
          gap: 44px;
          align-items: start;
        }
        .sv-live-share .brief-panel {
          position: sticky;
          top: 96px;
          border-radius: 22px;
          background: linear-gradient(180deg, var(--sv-surface), var(--sv-surface2));
          border: 1px solid var(--sv-hairline);
          padding: 34px;
          overflow: hidden;
        }
        .sv-live-share .brief-panel::after {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: linear-gradient(180deg, var(--sv-magenta), var(--sv-amber));
        }
        .sv-live-share .brief-panel .crumb,
        .sv-live-share .tracks-head .label,
        .sv-live-share .decision-summary .label,
        .sv-live-share .decision-summary .lbl {
          font-size: 10px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--sv-lavender);
        }
        .sv-live-share .brief-panel h2 {
          margin: 6px 0 18px;
          font-family: ${SERIF};
          font-weight: 400;
          font-size: 44px;
          line-height: 1.05;
          letter-spacing: -0.015em;
        }
        .sv-live-share .brief-line {
          margin: 0 0 22px;
          font-family: ${SERIF};
          font-style: italic;
          font-size: 21px;
          line-height: 1.4;
          color: rgba(226,224,240,0.86);
          max-width: 34ch;
        }
        .sv-live-share .brief-meta {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding-top: 18px;
          border-top: 1px solid var(--sv-hairline);
        }
        .sv-live-share .brief-meta .row { display: flex; align-items: baseline; gap: 14px; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; }
        .sv-live-share .brief-meta .k { color: rgba(155,147,196,0.65); width: 72px; flex-shrink: 0; }
        .sv-live-share .brief-meta .v { color: var(--sv-silver); font-weight: 600; text-transform: none; font-size: 15px; }
        .sv-live-share .brief-meta .v em { font-family: ${SERIF}; font-style: italic; color: var(--sv-lavender); font-weight: 400; font-size: 16px; }
        .sv-live-share .brief-pills { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 6px; }
        .sv-live-share .pill {
          font-size: 12px;
          font-weight: 600;
          padding: 5px 12px;
          border-radius: 999px;
          color: var(--sv-amber);
          border: 1px solid rgba(245,166,35,0.30);
          background: rgba(245,166,35,0.06);
        }
        .sv-live-share .decision-summary {
          margin-top: 20px;
          padding: 16px 18px;
          border-radius: 12px;
          background: rgba(7,4,26,0.5);
          border: 1px solid var(--sv-hairline);
        }
        .sv-live-share .count-row { display: flex; align-items: baseline; gap: 18px; font-family: ${SERIF}; margin-top: 10px; }
        .sv-live-share .cnt { font-size: 34px; line-height: 1; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
        .sv-live-share .cnt.ap { color: var(--sv-good); }
        .sv-live-share .cnt.ps { color: rgba(155,147,196,0.72); }
        .sv-live-share .cnt.left { color: var(--sv-magenta); font-style: italic; }
        .sv-live-share .progress { margin-top: 12px; display: flex; height: 5px; border-radius: 4px; background: rgba(155,147,196,0.12); overflow: hidden; }
        .sv-live-share .ap-fill { background: var(--sv-good); }
        .sv-live-share .ps-fill { background: rgba(155,147,196,0.48); }
        .sv-live-share .tracks-col { display: flex; flex-direction: column; gap: 22px; min-width: 0; }
        .sv-live-share .track-wrap { display: contents; }
        .sv-live-share .tracks-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 0 4px; flex-wrap: wrap; }
        .sv-live-share .tracks-head .count { color: var(--sv-amber); font-weight: 700; margin-right: 4px; }
        .sv-live-share .nav-helper { font-family: ${SERIF}; font-style: italic; font-size: 15px; color: rgba(155,147,196,0.72); }
        .sv-live-share .track-card {
          position: relative;
          border-radius: 24px;
          background: linear-gradient(180deg, var(--sv-surface), var(--sv-surface2));
          border: 1px solid var(--sv-hairline);
          padding: 30px 34px 28px;
          transition: border-color .2s ease, transform .15s ease;
        }
        .sv-live-share .track-card:hover { border-color: rgba(245,166,35,0.42); box-shadow: 0 18px 40px -22px rgba(219,39,119,0.45); }
        .sv-live-share .track-card[data-state="approved"] { border-color: rgba(76,175,130,0.56); background: linear-gradient(180deg, rgba(76,175,130,0.08), rgba(15,8,35,0.72)); }
        .sv-live-share .track-card[data-state="passed"] { opacity: 0.55; }
        .sv-live-share .track-card::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          border-radius: 24px 0 0 24px;
          background: linear-gradient(180deg, var(--sv-magenta), var(--sv-amber));
        }
        .sv-live-share .track-card[data-state="approved"]::before { background: var(--sv-good); }
        .sv-live-share .track-card[data-state="passed"]::before { background: rgba(155,147,196,0.42); }
        .sv-live-share .track-head { display: flex; align-items: flex-start; gap: 20px; margin-bottom: 16px; }
        .sv-live-share .track-rank { font-family: ${SERIF}; font-size: 62px; line-height: 0.85; color: rgba(155,147,196,0.82); letter-spacing: -0.03em; min-width: 44px; flex-shrink: 0; }
        .sv-live-share .track-info { flex: 1; min-width: 0; }
        .sv-live-share .track-state-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 10px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          padding: 4px 10px;
          border-radius: 999px;
          background: rgba(155,147,196,0.10);
          border: 1px solid var(--sv-hairline);
          color: var(--sv-lavender);
          margin-bottom: 8px;
        }
        .sv-live-share .track-state-pill .dot { width: 8px; height: 8px; border-radius: 999px; background: currentColor; }
        .sv-live-share .track-card[data-state="leader"] .track-state-pill { background: rgba(219,39,119,0.16); border-color: rgba(219,39,119,0.34); color: var(--sv-magenta); }
        .sv-live-share .track-card[data-state="approved"] .track-state-pill { background: rgba(76,175,130,0.14); border-color: rgba(76,175,130,0.34); color: var(--sv-good); }
        .sv-live-share .track-name { font-family: ${SERIF}; font-size: 36px; line-height: 1.05; letter-spacing: -0.015em; }
        .sv-live-share .track-artist { font-family: ${SERIF}; font-style: italic; font-size: 17px; color: var(--sv-lavender); margin-top: 5px; }
        .sv-live-share .track-score-block { text-align: right; flex-shrink: 0; }
        .sv-live-share .track-score-block .n { font-family: ${SERIF}; font-size: 62px; line-height: 0.85; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
        .sv-live-share .track-score-block .l { font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(155,147,196,0.62); margin-top: 4px; }
        .sv-live-share .track-waveform {
          margin-top: 4px;
          display: flex;
          align-items: center;
          gap: 18px;
          padding: 18px 20px;
          border-radius: 14px;
          background: rgba(0,0,0,0.35);
          border: 1px solid var(--sv-hairline);
        }
        .sv-live-share .play {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--sv-amber), var(--sv-magenta));
          color: white;
          display: grid;
          place-items: center;
          flex-shrink: 0;
          box-shadow: 0 12px 26px -12px rgba(245,166,35,0.65);
        }
        .sv-live-share .wave { flex: 1; min-width: 0; display: flex; align-items: center; gap: 2px; height: 48px; }
        .sv-live-share .wave i { flex: 1; min-width: 2px; background: rgba(155,147,196,0.34); border-radius: 2px; }
        .sv-live-share .wave i.played { background: linear-gradient(180deg, var(--sv-magenta), var(--sv-amber)); }
        .sv-live-share .time { font-family: ${MONO}; font-size: 13px; color: var(--sv-lavender); letter-spacing: 0.04em; flex-shrink: 0; }
        .sv-live-share .ai-quote {
          margin-top: 18px;
          position: relative;
          padding: 22px 26px 22px 64px;
          border-radius: 16px;
          background: linear-gradient(135deg, rgba(245,166,35,0.10), rgba(221,122,58,0.04));
          border: 1px solid rgba(155,147,196,0.24);
        }
        .sv-live-share .ai-quote::before {
          content: "\\201C";
          position: absolute;
          left: 16px;
          top: -10px;
          font-family: ${SERIF};
          font-size: 92px;
          line-height: 1;
          color: rgba(221,122,58,0.45);
          font-style: italic;
        }
        .sv-live-share .ai-label { font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--sv-magenta); display: inline-flex; align-items: center; gap: 6px; margin-bottom: 6px; }
        .sv-live-share .ai-quote p { margin: 0; font-family: ${SERIF}; font-style: italic; font-size: 21px; line-height: 1.4; color: var(--sv-silver); letter-spacing: -0.005em; }
        .sv-live-share .rights-block { margin-top: 16px; border-radius: 16px; border: 1px solid var(--sv-hairline); background: rgba(0,0,0,0.22); overflow: hidden; }
        .sv-live-share .rights-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--sv-hairline); background: linear-gradient(180deg, rgba(245,166,35,0.06), transparent); }
        .sv-live-share .rb-label { font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--sv-amber); font-weight: 700; }
        .sv-live-share .rb-status { font-family: ${MONO}; font-size: 12px; padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(245,158,11,0.35); color: #fbbf24; background: rgba(245,158,11,0.10); white-space: nowrap; }
        .sv-live-share .rb-status.clear { color: var(--sv-good); border-color: rgba(76,175,130,0.45); background: rgba(76,175,130,0.10); }
        .sv-live-share .rb-status.blocked { color: var(--sv-bad); border-color: rgba(232,90,90,0.42); background: rgba(232,90,90,0.10); }
        .sv-live-share .rights-body { display: grid; grid-template-columns: minmax(0,1.5fr) minmax(0,1fr); }
        .sv-live-share .rights-grid { padding: 16px 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px 22px; }
        .sv-live-share .rf { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .sv-live-share .rf .k { font-size: 9.5px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--sv-amber); font-weight: 700; }
        .sv-live-share .rf .v { font-family: ${MONO}; font-size: 13px; color: var(--sv-silver); word-break: break-word; }
        .sv-live-share .rf .v.none { color: rgba(107,100,144,0.85); font-style: italic; font-family: ${SERIF}; }
        .sv-live-share .rf.rf-highlight { background: rgba(76,175,130,0.06); border-radius: 8px; padding: 6px 10px; margin: -6px -10px; }
        .sv-live-share .rf.rf-highlight .v { color: var(--sv-good); font-weight: 700; }
        /* FIT INDEX axis bars — matches shortlist/results view layout */
        .sv-live-share .fit-index-block { margin-top: 16px; padding: 14px 18px; border-radius: 14px; background: rgba(0,0,0,0.2); border: 1px solid var(--sv-hairline); }
        .sv-live-share .fi-label { font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--sv-amber); font-weight: 700; margin-bottom: 10px; }
        .sv-live-share .fi-axes { display: flex; flex-direction: column; gap: 7px; }
        .sv-live-share .fi-axis { display: grid; grid-template-columns: 52px 1fr 28px; align-items: center; gap: 10px; }
        .sv-live-share .fi-name { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--sv-lavender); font-weight: 600; }
        .sv-live-share .fi-bar { height: 5px; border-radius: 999px; background: rgba(123,112,178,0.12); overflow: hidden; }
        .sv-live-share .fi-fill { display: block; height: 100%; border-radius: 999px; transition: width 0.4s ease; }
        .sv-live-share .fi-val { font-size: 12px; font-weight: 700; color: var(--sv-silver); text-align: right; font-family: ${MONO}; }
        .sv-live-share .rights-pipeline { border-left: 1px solid var(--sv-hairline); padding: 16px 20px; display: flex; flex-direction: column; gap: 10px; background: rgba(255,255,255,0.012); }
        .sv-live-share .rp-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
        .sv-live-share .rp-top .lbl { font-size: 9.5px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--sv-amber); font-weight: 700; }
        .sv-live-share .rp-top .pct { font-family: ${SERIF}; font-style: italic; font-size: 26px; color: var(--sv-amber); line-height: 1; }
        .sv-live-share .rp-stage { display: flex; align-items: center; gap: 9px; font-size: 12px; color: var(--sv-silver); text-transform: capitalize; }
        .sv-live-share .rp-stage .gl { width: 17px; height: 17px; border-radius: 50%; display: grid; place-items: center; font-size: 10px; font-weight: 800; font-family: ${MONO}; flex-shrink: 0; }
        .sv-live-share .rp-stage.ok .gl { background: rgba(76,175,130,0.18); color: var(--sv-good); border: 1px solid rgba(76,175,130,0.4); }
        .sv-live-share .rp-stage.no { color: var(--sv-lavender); }
        .sv-live-share .rp-stage.no .gl { background: rgba(123,112,178,0.10); color: var(--sv-lavender); border: 1px solid var(--sv-hairline-strong); }
        .sv-live-share .decision-row { margin-top: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .sv-live-share .decision-btn { padding: 16px 20px; border-radius: 14px; border: 1px solid var(--sv-hairline-strong); background: rgba(15,8,35,0.6); color: var(--sv-silver); font-size: 15px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; gap: 10px; }
        .sv-live-share .decision-btn .ico { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; }
        .sv-live-share .decision-btn.approve .ico { background: rgba(76,175,130,0.18); color: var(--sv-good); border: 1px solid rgba(76,175,130,0.4); }
        .sv-live-share .decision-btn.pass .ico { background: rgba(155,147,196,0.12); color: var(--sv-lavender); border: 1px solid var(--sv-hairline-strong); }
        .sv-live-share .track-card[data-state="approved"] .decision-btn.approve { background: linear-gradient(135deg, rgba(76,175,130,0.25), rgba(76,175,130,0.08)); border-color: var(--sv-good); color: var(--sv-good); }
        .sv-live-share .track-card[data-state="passed"] .decision-btn.pass { background: rgba(155,147,196,0.14); border-color: var(--sv-lavender); color: var(--sv-lavender); }
        .sv-live-share .comment-strip { margin-top: 12px; display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: 12px; background: rgba(155,147,196,0.04); border: 1px solid var(--sv-hairline); }
        .sv-live-share .comment-strip.has-note { background: linear-gradient(180deg, rgba(219,39,119,0.08), transparent); border-color: rgba(219,39,119,0.3); }
        .sv-live-share .comment-input { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--sv-silver); font-size: 14px; }
        .sv-live-share .comment-input::placeholder { color: rgba(155,147,196,0.62); font-family: ${SERIF}; font-style: italic; font-size: 15px; }
        .sv-live-share .compare-cta { width: 100%; display: flex; align-items: center; gap: 16px; padding: 16px 20px; border-radius: 16px; border: 1px solid rgba(245,166,35,0.32); background: linear-gradient(135deg, rgba(245,166,35,0.16), rgba(219,39,119,0.12)); color: var(--sv-silver); text-align: left; }
        .sv-live-share .cc-ico { width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0; display: grid; place-items: center; background: linear-gradient(135deg, var(--sv-amber), var(--sv-magenta)); color: #fff; }
        .sv-live-share .cc-txt { flex: 1; min-width: 0; }
        .sv-live-share .cc-title { display: block; font-weight: 700; font-size: 15px; }
        .sv-live-share .cc-sub { display: block; font-family: ${SERIF}; font-style: italic; font-size: 13px; color: var(--sv-lavender); margin-top: 2px; }
        .sv-live-share .cc-arrow { flex-shrink: 0; color: var(--sv-amber); font-size: 20px; }
        .sv-live-share .final-cta { margin-top: 14px; padding: 26px 28px; border-radius: 18px; background: linear-gradient(135deg, rgba(245,166,35,0.18), rgba(221,122,58,0.10)); border: 1px solid rgba(155,147,196,0.28); display: flex; align-items: center; justify-content: space-between; gap: 18px; flex-wrap: wrap; }
        .sv-live-share .final-cta .copy { font-family: ${SERIF}; font-size: 23px; line-height: 1.3; max-width: 40ch; }
        .sv-live-share .final-cta em { color: var(--sv-lavender); }
        .sv-live-share .cta { padding: 13px 18px; border-radius: 12px; color: #fff; font-weight: 800; background: linear-gradient(135deg, var(--sv-amber), var(--sv-magenta)); }
        .sv-live-share .cmp-overlay { position: fixed; inset: 0; z-index: 200; background: rgba(6,3,18,0.74); -webkit-backdrop-filter: blur(9px); backdrop-filter: blur(9px); display: grid; place-items: center; padding: 28px; opacity: 0; visibility: hidden; transition: opacity .26s ease, visibility .26s; }
        .sv-live-share .cmp-overlay.open { opacity: 1; visibility: visible; }
        .sv-live-share .cmp-modal { width: min(1120px, 100%); max-height: calc(100vh - 56px); overflow-y: auto; background: linear-gradient(180deg, #160d31, #0c0720); border: 1px solid var(--sv-hairline-strong); border-radius: 24px; box-shadow: 0 40px 90px -30px rgba(0,0,0,0.8); }
        .sv-live-share .cmp-head { position: sticky; top: 0; z-index: 3; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 22px 26px 18px; border-bottom: 1px solid var(--sv-hairline); background: linear-gradient(180deg, #160d31, rgba(22,13,49,0.92)); }
        .sv-live-share .ch-kicker { font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase; color: var(--sv-amber); font-weight: 700; display: inline-flex; align-items: center; gap: 8px; }
        .sv-live-share .cmp-head h2 { margin: 7px 0 0; font-family: ${SERIF}; font-weight: 400; font-size: clamp(22px, 2.4vw, 30px); line-height: 1.04; letter-spacing: -0.015em; }
        .sv-live-share .cmp-head h2 span { color: var(--sv-lavender); font-size: 0.7em; }
        .sv-live-share .ch-scene { font-family: ${SERIF}; font-style: italic; font-size: 14px; color: var(--sv-lavender); margin-top: 5px; max-width: 56ch; }
        .sv-live-share .cmp-close { width: 38px; height: 38px; border-radius: 11px; border: 1px solid var(--sv-hairline-strong); background: rgba(255,255,255,0.03); color: var(--sv-lavender); display: grid; place-items: center; }
        .sv-live-share .cmp-transport { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 16px 26px; border-bottom: 1px solid var(--sv-hairline); background: rgba(0,0,0,0.28); }
        .sv-live-share .cmp-playbtn { display: inline-flex; align-items: center; gap: 9px; padding: 10px 18px 10px 14px; border-radius: 12px; background: linear-gradient(135deg, var(--sv-amber), var(--sv-magenta)); color: #fff; font-weight: 700; font-size: 13px; }
        .sv-live-share .cmp-seg { display: inline-flex; padding: 3px; border-radius: 11px; background: rgba(0,0,0,0.4); border: 1px solid var(--sv-hairline); }
        .sv-live-share .cmp-seg button { padding: 7px 13px; border-radius: 8px; font-weight: 600; font-size: 12px; color: var(--sv-lavender); }
        .sv-live-share .cmp-seg .on { background: rgba(245,166,35,0.16); color: var(--sv-amber); }
        .sv-live-share .cmp-chip { display: inline-flex; align-items: center; gap: 7px; padding: 8px 13px; border-radius: 999px; border: 1px solid rgba(245,166,35,0.45); background: rgba(245,166,35,0.08); color: var(--sv-amber); font-size: 12px; }
        .sv-live-share .cmp-chip .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
        .sv-live-share .cmp-tempo { margin-left: auto; font-family: ${MONO}; font-size: 12px; color: var(--sv-lavender); display: inline-flex; align-items: center; gap: 8px; }
        .sv-live-share .cmp-tempo b { color: var(--sv-silver); font-weight: 500; }
        .sv-live-share .cmp-scrub-row { display: flex; align-items: center; gap: 14px; padding: 14px 26px 18px; border-bottom: 1px solid var(--sv-hairline); }
        .sv-live-share .cmp-scrub { flex: 1; min-width: 0; height: 8px; border-radius: 5px; background: rgba(155,147,196,0.14); position: relative; }
        .sv-live-share .cmp-scrub .fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0%; border-radius: 5px; background: linear-gradient(90deg, var(--sv-amber), var(--sv-magenta)); }
        .sv-live-share .cmp-scrub .head { position: absolute; top: 50%; left: 0%; width: 14px; height: 14px; border-radius: 50%; background: #fff; transform: translate(-50%, -50%); }
        .sv-live-share .cmp-time { font-family: ${MONO}; font-size: 12px; color: var(--sv-lavender); flex-shrink: 0; }
        .sv-live-share .cmp-body { padding: 8px 26px 4px; }
        .sv-live-share .cmp-section { padding: 18px 0; border-bottom: 1px solid var(--sv-hairline); }
        .sv-live-share .cmp-seclabel { text-align: center; font-size: 9.5px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--sv-lavender); margin-bottom: 14px; }
        .sv-live-share .cmp-split { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
        .sv-live-share .cmp-half { padding: 0 24px; min-width: 0; }
        .sv-live-share .cmp-half + .cmp-half { border-left: 1px solid var(--sv-hairline); }
        .sv-live-share .cmp-identity { grid-template-columns: 1fr auto 1fr; align-items: stretch; }
        .sv-live-share .cmp-trackname { font-family: ${SERIF}; font-size: 25px; line-height: 1.05; letter-spacing: -0.015em; }
        .sv-live-share .cmp-trackmeta { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--sv-lavender); margin-top: 6px; }
        .sv-live-share .cmp-leader-badge { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 8px; font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 700; padding: 4px 10px; border-radius: 999px; background: rgba(76,175,130,0.16); border: 1px solid rgba(76,175,130,0.45); color: var(--sv-good); }
        .sv-live-share .cmp-score-row { display: flex; align-items: flex-end; gap: 12px; margin-top: 14px; }
        .sv-live-share .cmp-score { font-family: ${SERIF}; font-size: 56px; line-height: 0.8; letter-spacing: -0.02em; }
        .sv-live-share .cmp-score-l { font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(155,147,196,0.62); padding-bottom: 8px; }
        .sv-live-share .cmp-mini-wave { display: flex; align-items: center; gap: 1.5px; height: 30px; margin-top: 16px; }
        .sv-live-share .cmp-mini-wave i { flex: 1; min-width: 1.5px; background: rgba(155,147,196,0.28); border-radius: 1.5px; }
        .sv-live-share .cmp-mini-wave i.played { background: linear-gradient(180deg, var(--sv-magenta), var(--sv-amber)); }
        .sv-live-share .cmp-gap { align-self: stretch; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: 0 20px; text-align: center; border-left: 1px solid var(--sv-hairline); border-right: 1px solid var(--sv-hairline); }
        .sv-live-share .g-arrow, .sv-live-share .g-num, .sv-live-share .g-lbl { color: var(--sv-good); }
        .sv-live-share .g-num { font-family: ${SERIF}; font-style: italic; font-size: 30px; line-height: 1; }
        .sv-live-share .g-lbl { font-size: 8px; letter-spacing: 0.16em; text-transform: uppercase; font-weight: 700; }
        .sv-live-share .cmp-why { font-family: ${SERIF}; font-style: italic; font-size: 16px; line-height: 1.45; }
        .sv-live-share .cmp-axes { display: flex; flex-direction: column; gap: 9px; }
        .sv-live-share .cmp-axis { display: grid; grid-template-columns: 58px 1fr 30px; gap: 10px; align-items: center; }
        .sv-live-share .cmp-axis .a-n { font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--sv-lavender); font-weight: 700; }
        .sv-live-share .cmp-axis .a-t { height: 8px; border-radius: 4px; background: rgba(155,147,196,0.14); overflow: hidden; }
        .sv-live-share .cmp-axis .a-f { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, var(--sv-amber), var(--sv-magenta)); }
        .sv-live-share .cmp-axis .a-v { font-family: ${MONO}; font-size: 12px; text-align: right; font-weight: 600; color: var(--sv-magenta); }
        .sv-live-share .cmp-rights-cov { display: flex; align-items: baseline; gap: 8px; }
        .sv-live-share .cmp-rights-cov .num { font-family: ${SERIF}; font-style: italic; font-size: 26px; line-height: 1; }
        .sv-live-share .cmp-rights-cov .of { font-size: 12px; color: var(--sv-lavender); }
        .sv-live-share .cmp-rights-cov .miss { font-size: 11px; color: rgba(155,147,196,0.62); margin-left: auto; }
        .sv-live-share .cmp-risk { margin-top: 12px; }
        .sv-live-share .r-track { height: 6px; border-radius: 4px; background: rgba(155,147,196,0.12); overflow: hidden; display: flex; }
        .sv-live-share .r-track i { height: 100%; background: var(--sv-good); }
        .sv-live-share .cmp-risk.high .r-track i { background: var(--sv-bad); }
        .sv-live-share .cmp-risk.med .r-track i { background: var(--sv-amber); }
        .sv-live-share .r-lbl { font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; font-weight: 700; margin-top: 7px; color: var(--sv-good); }
        .sv-live-share .cmp-risk.high .r-lbl { color: var(--sv-bad); }
        .sv-live-share .cmp-risk.med .r-lbl { color: var(--sv-amber); }
        .sv-live-share .cmp-actions { position: sticky; bottom: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 18px 26px; border-top: 1px solid var(--sv-hairline); background: linear-gradient(0deg, #160d31, rgba(22,13,49,0.92)); }
        .sv-live-share .cmp-summary { flex: 1; min-width: 240px; font-family: ${SERIF}; font-style: italic; font-size: 14px; line-height: 1.4; color: var(--sv-lavender); }
        .sv-live-share .cmp-summary b { color: var(--sv-silver); font-style: normal; font-family: ${SANS}; font-weight: 700; }
        .sv-live-share .cmp-act-btns { display: flex; gap: 10px; flex-wrap: wrap; }
        .sv-live-share .cmp-act { padding: 11px 16px; border-radius: 12px; font-weight: 600; font-size: 13px; border: 1px solid var(--sv-hairline-strong); background: rgba(255,255,255,0.03); color: var(--sv-silver); }
        .sv-live-share .cmp-act.primary { border-color: transparent; background: linear-gradient(135deg, var(--sv-amber), var(--sv-magenta)); color: #fff; }
        @media (max-width: 1000px) {
          .sv-live-share .share-stage { grid-template-columns: 1fr; }
          .sv-live-share .brief-panel { position: relative; top: auto; }
        }
        @media (max-width: 720px) {
          .sv-live-share .topbar-inner, .sv-live-share .shell { padding-left: 16px; padding-right: 16px; }
          .sv-live-share .hero-meta, .sv-live-share .sender-card .who { display: none; }
          .sv-live-share .track-card { padding: 22px 20px; }
          .sv-live-share .track-rank, .sv-live-share .track-score-block .n { font-size: 42px; }
          .sv-live-share .track-name { font-size: 28px; }
          .sv-live-share .decision-row, .sv-live-share .rights-body, .sv-live-share .rights-grid, .sv-live-share .cmp-split, .sv-live-share .cmp-identity { grid-template-columns: 1fr; }
          .sv-live-share .rights-pipeline, .sv-live-share .cmp-half + .cmp-half { border-left: 0; border-top: 1px solid var(--sv-hairline); }
          .sv-live-share .cmp-gap { border: 0; padding: 14px 0; flex-direction: row; justify-content: flex-start; }
        }

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
      <LiveShareView packet={packet} />
    </div>
  );
}
