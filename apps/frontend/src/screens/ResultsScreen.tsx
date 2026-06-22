import { useEffect, useRef, useState } from 'react';
import { API_BASE, type AnalysisResult, type SceneParams, type SceneArc } from '../utils/apiClient';
import { BRIEF_LABELS, type BriefId } from '../engine/classifyBrief';
import { ArcMatch } from '../components/ArcMatch';
import type { ArcSegments } from '../engine/arcMatch';

function deriveSongArc(track: AnalysisResult['track']): ArcSegments {
  const energyBase =
    track.energyCharacter === 'high' ? 72 :
    track.energyCharacter === 'low'  ? 28 : 50;
  const bpm = track.tempo ?? 100;
  const tempoBoost = bpm > 140 ? 10 : bpm > 100 ? 3 : -6;
  const base = Math.min(84, Math.max(16, energyBase + tempoBoost));
  const isMajor = track.tonalCharacter === 'major';
  const isMinor = track.tonalCharacter === 'minor';
  if (isMajor) return { opening: base - 8, heldBreath: base - 4, turn: base + 6, release: base + 14 };
  if (isMinor) return { opening: base + 2, heldBreath: base + 12, turn: base - 4, release: base - 10 };
  return { opening: base, heldBreath: base, turn: base + 4, release: base };
}

// ── Decision-support scoring ──────────────────────────────────

type ClearabilityResult = { score: number; band: 'low' | 'medium' | 'high'; rationale: string };

function computeClearabilityConfidence(rp: AnalysisResult['rightsProfile'], track: AnalysisResult['track']): ClearabilityResult {
  if (!rp) {
    return {
      score: 35, band: 'high',
      rationale: 'No rights metadata on record. Run fingerprint lookup to begin clearance assessment.',
    };
  }
  let score = 50;
  const positives: string[] = [];
  const negatives: string[] = [];

  if (rp.isOneStop === true)                           { score += 20; positives.push('One-stop licensing available'); }
  if (rp.isrc ?? track.isrc)                          { score += 10; positives.push('ISRC verified'); }
  if (rp.publisherName)                               { score += 10; positives.push('Publisher identified'); }
  if (rp.writerName)                                  { score +=  8; positives.push('Writer on record'); }
  if ((rp.enrichmentSources ?? []).length > 0)        { score +=  5; positives.push('Metadata verified via ' + rp.enrichmentSources![0]); }
  if (rp.rightsState === 'clear')                     { score += 12; positives.push('Rights state clear'); }
  if (rp.workId)                                      { score +=  5; positives.push('MusicBrainz match found'); }

  if (rp.rightsState === 'blocked')                   { score -= 50; negatives.push('Rights state blocked'); }
  if (rp.splitPct != null && rp.splitPct < 100)       { score -= 15; negatives.push('Split ownership detected'); }
  const blockerCount = rp.blockers?.length ?? 0;
  if (blockerCount > 0) {
    score -= Math.min(30, blockerCount * 15);
    negatives.push(blockerCount === 1 ? '1 rights blocker on record' : `${blockerCount} rights blockers on record`);
  }
  if (!rp.publisherName && !rp.writerName)            { score -= 10; negatives.push('No publisher or writer on record'); }

  score = Math.max(5, Math.min(100, Math.round(score)));
  const band: ClearabilityResult['band'] = score >= 70 ? 'low' : score >= 45 ? 'medium' : 'high';

  const all = [...positives, ...negatives];
  const rationale = all.length > 0
    ? all.join('. ') + '.'
    : 'Insufficient metadata to assess clearance risk. Manual verification required.';

  return { score, band, rationale };
}

type ReplacementResult = { label: 'LOW' | 'MEDIUM' | 'HIGH'; count: number; sentence: string };

function computeReplacementRisk(result: AnalysisResult, allResults: AnalysisResult[]): ReplacementResult {
  const thisScore    = result.confidenceScore.score;
  const thisBlockers = result.rightsProfile?.blockers?.length ?? 0;

  const comparable = allResults.filter(r =>
    r.track.id !== result.track.id &&
    r.confidenceScore.score >= thisScore - 5 &&
    (r.rightsProfile?.blockers?.length ?? 0) <= thisBlockers,
  );
  const count = comparable.length;

  if (count >= 5) return { label: 'LOW',    count, sentence: `${count} comparable tracks score within 5 points and appear easier to clear.` };
  if (count >= 2) return { label: 'MEDIUM', count, sentence: `${count} comparable tracks available with similar fit and lower clearance risk.` };
  if (count === 0) return { label: 'HIGH',  count, sentence: 'No comparable alternatives found. This track may be worth pursuing despite clearance complexity.' };
  return             { label: 'HIGH',  count, sentence: `Only ${count} comparable alternative found.` };
}

type ActionTier = 'pursue' | 'fight' | 'alternative' | 'backup' | 'deprioritize';
type ActionResult = { tier: ActionTier; label: string; sentence: string };

function buildRecommendedAction(fitScore: number, clearScore: number, repLabel: ReplacementResult['label']): ActionResult {
  const highFit    = fitScore >= 70;
  const goodClear  = clearScore >= 65;
  const manyAlts   = repLabel === 'LOW';

  if (highFit && goodClear)              return { tier: 'pursue',      label: 'Pursue Clearance',    sentence: 'Strong creative fit with manageable rights complexity.' };
  if (highFit && !goodClear && !manyAlts) return { tier: 'fight',       label: 'Fight for It',        sentence: 'Strong fit with no comparable alternatives — clearance complexity may be worth it.' };
  if (highFit && !goodClear && manyAlts)  return { tier: 'alternative', label: 'Pursue Alternative',  sentence: 'Comparable creative fit available with lower clearance risk.' };
  if (!highFit && goodClear)              return { tier: 'backup',      label: 'Keep as Backup',      sentence: 'Decent fit with clean rights — useful if lead option falls through.' };
  return                                         { tier: 'deprioritize', label: 'Consider Replacing', sentence: 'Moderate fit and clearance complexity with alternatives available.' };
}

const ACTION_COLORS: Record<ActionTier, { bg: string; border: string; text: string }> = {
  pursue:       { bg: 'rgba(76,175,130,0.12)',  border: 'rgba(76,175,130,0.35)',  text: '#4CAF82' },
  fight:        { bg: 'rgba(245,181,68,0.12)',  border: 'rgba(245,181,68,0.35)',  text: '#F5B544' },
  alternative:  { bg: 'rgba(123,112,178,0.12)', border: 'rgba(123,112,178,0.35)', text: '#9B93C4' },
  backup:       { bg: 'rgba(123,112,178,0.10)', border: 'rgba(123,112,178,0.30)', text: '#9B93C4' },
  deprioritize: { bg: 'rgba(232,90,90,0.10)',   border: 'rgba(232,90,90,0.30)',   text: '#E85A5A' },
};

const CLEAR_BAND_COLOR: Record<ClearabilityResult['band'], string> = {
  low:    '#4CAF82',
  medium: '#F5B544',
  high:   '#E85A5A',
};
const CLEAR_BAND_LABEL: Record<ClearabilityResult['band'], string> = {
  low:    'Low Risk',
  medium: 'Medium Risk',
  high:   'High Risk',
};
const REP_COLOR: Record<ReplacementResult['label'], string> = {
  LOW:    '#4CAF82',
  MEDIUM: '#F5B544',
  HIGH:   '#E85A5A',
};

// ── design tokens ────────────────────────────────────────────
const C = {
  purple:        '#F5A623',
  magenta:       '#DB2777',
  silver:        '#F4F2FA',
  lavender:      '#9B93C4',
  amber:         '#F5B544',
  amberSoft:     'rgba(245, 181, 68, 0.12)',
  amberBorder:   'rgba(245, 181, 68, 0.28)',
  hairline:      'rgba(123, 112, 178, 0.16)',
  hairlineStrong:'rgba(123, 112, 178, 0.30)',
  bg:            '#0D0B1E',
  chipBg:        'rgba(123,112,178,0.08)',
  bpmBg:         'rgba(245,166,35,0.16)',
  bpmBorder:     'rgba(245,166,35,0.36)',
  good:          '#4CAF82',
  bad:           '#E85A5A',
};
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS  = '"Manrope", system-ui, sans-serif';
const BG    = `radial-gradient(900px 600px at 12% 8%, rgba(245,166,35,0.14), transparent 60%), radial-gradient(800px 500px at 95% 100%, rgba(221,122,58,0.10), transparent 60%), #0D0B1E`;

// ── share payload ─────────────────────────────────────────────
type SharePayload = { briefText: string; briefId: BriefId; sceneParams: SceneParams; results: AnalysisResult[] };

export function decodeSharePayload(encoded: string): SharePayload | null {
  try {
    const bin = atob(encoded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes)) as SharePayload;
  } catch { return null; }
}

// ── audio singleton ────────────────────────────────────────────
const currentAudio: { el: HTMLAudioElement | null } = { el: null };

function resolveAudioUrl(path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('/') && API_BASE) return `${API_BASE}${path}`;
  return path;
}

function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '00:00';
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

function cleanTrackTitle(raw: string): string {
  let t = raw;
  t = t.replace(/^[0-9a-f]{6,}_/i, '');
  t = t.replace(/_/g, ' ');
  t = t.replace(/\.(mp3|wav|flac|aiff?)$/i, '');
  t = t.replace(/\b(Official\s+Video|Official\s+Audio|Lyric\s+Video|HD|HQ|4K|Audio|Video|background\s+vocals?\s*\d*)\b/gi, '');
  t = t.replace(/\s+\d{1,3}\s*$/, '');
  t = t.replace(/\s{2,}/g, ' ').trim();
  if (t.includes(' - ')) t = t.slice(t.indexOf(' - ') + 3).trim();
  return t || raw;
}

// ── Scene fit sentence ──────────────────────────────────────
const BRIEF_EMOTIONAL_DESC: Record<string, { hi: string; mid: string; lo: string }> = {
  'chase-tension':            { hi: 'High arousal and controlled valence sit squarely in the tension window.', mid: 'Arousal or dominance partially overlaps the chase-tension target.', lo: 'Emotional profile misses the sustained kinetic tension this brief requires.' },
  'action-combat':            { hi: 'Peak arousal and assertive dominance match the action-combat target zone.', mid: 'Energy reads broadly action-adjacent but lands outside the core target.', lo: 'Track lacks the intensity ceiling this action brief demands.' },
  'triumph-victory':          { hi: 'High arousal and elevated valence align with the triumph-victory profile.', mid: 'Celebratory energy is present but one PAD dimension reads slightly off-brief.', lo: 'Emotional register does not reach the uplift this victory moment requires.' },
  'euphoria-celebration':     { hi: 'Bright valence and high energy sit exactly inside the euphoria target.', mid: 'Positive affect is present; arousal or dominance is partially outside the zone.', lo: 'Track reads too subdued for the euphoria-celebration register.' },
  'suspense-dread':           { hi: 'Moderate arousal and low valence match the suspense-dread window precisely.', mid: 'Tension is present but intensity or tone lands outside the ideal dread range.', lo: 'Emotional profile is too neutral or bright for a suspense-dread cue.' },
  'horror-psychological':     { hi: 'Low arousal, low valence, and suppressed dominance fit the psychological horror target.', mid: 'Unsettling quality is detectable but one PAD axis reads outside the core zone.', lo: 'Track lacks the psychological weight this horror brief requires.' },
  'drama-confrontation':      { hi: 'Moderate-to-high arousal and controlled tension fit the drama-confrontation target.', mid: 'Dramatic weight is present but emotional ceiling or valence is slightly off.', lo: 'Emotional profile reads too passive for a confrontation cue.' },
  'urban-gritty':             { hi: 'Mid-high arousal and subdued valence align with the urban-gritty register.', mid: 'Texture is present but arousal or dominance partially misses the target.', lo: 'Track lacks the raw assertion this gritty urban brief requires.' },
  'romance-intimacy':         { hi: 'Low arousal, warm valence, and gentle dominance sit inside the romance-intimacy zone.', mid: 'Intimate quality is present but one axis is slightly outside the target window.', lo: 'Track reads too assertive or too neutral for a romance-intimacy cue.' },
  'heartbreak-separation':    { hi: 'Subdued arousal and low valence match the heartbreak-separation profile.', mid: 'Melancholic quality is detectable but tone or energy partially misses the zone.', lo: 'Emotional register does not reach the grief depth this brief demands.' },
  'grief-loss':               { hi: 'Very low arousal and muted valence sit squarely in the grief-loss window.', mid: 'Somber quality is present but one PAD dimension reads outside the core target.', lo: 'Track is too energetic or neutral for a grief-loss cue.' },
  'contemplative-reflective': { hi: 'Low arousal and balanced valence align with the contemplative-reflective target.', mid: 'Reflective tone is present but intensity or valence drifts outside the zone.', lo: 'Track lacks the introspective stillness this contemplative brief requires.' },
  'emotional-resolution':     { hi: 'Mid arousal and elevated valence fit the emotional-resolution arc.', mid: 'Resolution quality is present but arousal or tone is slightly off the target.', lo: 'Emotional profile does not suggest the resolution arc this brief requires.' },
  'comedy-light':             { hi: 'Moderate energy and bright valence sit inside the comedy-light window.', mid: 'Positive affect is present but energy or lightness partially misses the target.', lo: 'Track reads too heavy or too neutral for a comedy-light brief.' },
  'quirky-offbeat':           { hi: 'Moderate arousal and warm valence align with the quirky-offbeat target.', mid: 'Playful quality is present but one PAD axis reads outside the core zone.', lo: 'Track lacks the idiosyncratic energy this offbeat brief requires.' },
  'montage-transition':       { hi: 'Balanced PAD values fit the neutral-to-flowing montage-transition target.', mid: 'Transition energy is present but emotional coloring slightly misses the zone.', lo: 'Track reads too extreme in one dimension for a smooth montage cue.' },
  'opening-closing-title':    { hi: 'Moderate arousal and balanced tone fit the title-card register precisely.', mid: 'Ceremonial quality is present but one dimension is slightly off the target.', lo: 'Emotional weight does not match the opening-closing title brief.' },
  'cinematic-epic':           { hi: 'High dominance and elevated arousal align with the cinematic-epic target zone.', mid: 'Epic scale is present but one PAD dimension partially misses the window.', lo: 'Track lacks the broad scope and gravitas this cinematic brief demands.' },
  'corporate-aspirational':   { hi: 'Moderate arousal and warm valence fit the corporate-aspirational target.', mid: 'Optimistic quality is present but intensity or tone slightly misses the zone.', lo: 'Track is too understated or too intense for a corporate-aspirational brief.' },
  'nature-pastoral':          { hi: 'Very low arousal and gentle valence sit inside the nature-pastoral window.', mid: 'Pastoral quality is present but one axis reads slightly outside the target.', lo: 'Track is too assertive or too neutral for a nature-pastoral cue.' },
};


function buildScoreCaption(vec: { scene: number; lyrics: number; audioSignal: number; rightsClarity: number }): React.ReactNode {
  const scenePart = vec.scene >= 0.7 ? 'Scene fit is strong' : vec.scene >= 0.5 ? 'Scene fit is decent' : 'Scene fit is weak';
  const rest: string[] = [];
  if (vec.rightsClarity < 0.35)       rest.push('Rights are dragging.');
  else if (vec.rightsClarity >= 0.65) rest.push('Rights look solid.');
  if (vec.lyrics === 0)               rest.push("Lyrics aren’t scored yet.");
  else if (vec.lyrics < 0.4)          rest.push('Lyrics are below target.');
  if (vec.audioSignal >= 0.6)         rest.push('Signal is decent.');
  else if (vec.audioSignal < 0.35)    rest.push('Signal is thin.');
  return (
    <>
      <strong style={{ fontStyle: 'normal', fontFamily: SANS, fontWeight: 700, color: C.silver, letterSpacing: '-0.005em' }}>{scenePart}</strong>
      {' — that’s most of the score.'}
      {rest.length > 0 && ' ' + rest.join(' ')}
    </>
  );
}

// ── sub-components ─────────────────────────────────────────────
function SvLogo({ onClick }: { onClick?: () => void }) {
  return (
    <span onClick={onClick} style={{ cursor: onClick ? 'pointer' : undefined, display: 'inline-flex' }}>
      <img src="/logo.png" alt="SyncVision" style={{ height: 26, width: 'auto', display: 'block' }} />
    </span>
  );
}

function Chip({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'bpm' | 'warn' | 'genre' }) {
  const s: React.CSSProperties =
    variant === 'bpm'   ? { background: C.bpmBg, border: `1px solid ${C.bpmBorder}`, color: C.silver, fontFamily: '"JetBrains Mono",monospace', letterSpacing: '0.04em' } :
    variant === 'warn'  ? { background: C.amberSoft, border: `1px solid ${C.amberBorder}`, color: C.amber } :
                          { background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.30)', color: C.amber };
  return (
    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.01em', padding: '5px 10px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', ...s }}>
      {children}
    </span>
  );
}

// ── AutoFill / FingerprintResult types ─────────────────────────
interface AutoFill {
  isrc: string | null;
  iswc: string | null;
  writerName: string | null;
  writerIpi: string | null;
  publisherName: string | null;
  proAffiliation: string | null;
  enrichmentSources?: string[];
  territory?: string | null;
  workId?: string | null;
  genreTags?: string[];
  sources: { isrc: string | null; writer: string | null; publisher: string | null; pro: string | null; };
  lyricsLinkage: { hasLyrics: boolean; explicit: boolean; url: string | null; isrc: string | null; source: string; } | null;
}

// ── BLOCKER_LABELS ─────────────────────────────────────────────
const BLOCKER_LABELS: Record<string, string> = {
  WRITER_UNIDENTIFIED:    'Writer name missing',
  WRITER_IPI_MISSING:     'Writer IPI missing',
  PUBLISHER_UNKNOWN:      'Publisher unknown',
  PRO_WORK_ID_MISSING:    'PRO Work ID missing',
  ONE_STOP_NOT_CONFIRMED: 'One-stop not confirmed',
  MASTER_PCT_UNSET:       'Master ownership % unset',
  MASTER_OWNERSHIP_CONFLICT: 'Master ownership conflict',
  ISRC_MISSING:           'ISRC missing',
};

// ── RightsPanel ────────────────────────────────────────────────
type RightsSaveResult = {
  rightsState: string;
  blockers: string[];
  isrc: string | null;
  isOneStop: boolean | null;
  proAffiliation: string | null;
  masterVerifiedAt: string | null;
  masterOwnedBy: string | null;
  publisherName: string | null;
  writerName: string | null;
  writerIpi?: string | null;
  workId: string | null;
  syncLicenseStatus: string | null;
  syncLicensedBy: string | null;
  lyricLicenseStatus: string | null;
  lyricLicensedBy: string | null;
  splitPct: number | null;
};

function RightsPanel({
  trackId, isrc: initialIsrc, existing, autoFill, onSaved, onClose,
}: {
  trackId: string;
  isrc: string | null;
  existing: AnalysisResult['rightsProfile'];
  autoFill?: AutoFill;
  onSaved: (r: RightsSaveResult) => void;
  onClose: () => void;
}) {
  const savedIsrc = existing?.isrc ?? null;
  const [isrc, setIsrc]               = useState(autoFill?.isrc ?? (savedIsrc && !savedIsrc.startsWith('PILOT-') ? savedIsrc : null) ?? ((!initialIsrc || initialIsrc.startsWith('PILOT-')) ? '' : initialIsrc) ?? '');
  const [writer, setWriter]           = useState(autoFill?.writerName ?? existing?.writerName ?? '');
  const [publisher, setPublisher]     = useState(autoFill?.publisherName ?? existing?.publisherName ?? '');
  const [pro, setPro]                 = useState(autoFill?.proAffiliation ?? existing?.proAffiliation ?? '');
  const [workId, setWorkId]           = useState(autoFill?.iswc ?? existing?.workId ?? '');
  const [ipi, setIpi]                 = useState(autoFill?.writerIpi ?? existing?.writerIpi ?? '');
  const [splitPct, setSplitPct]       = useState(existing?.splitPct != null ? String(existing.splitPct) : '');
  const [oneStop, setOneStop]         = useState(existing?.isOneStop ?? false);
  const [syncLicense, setSyncLicense] = useState(existing?.syncLicenseStatus ?? '');
  const [syncBy, setSyncBy]           = useState(existing?.syncLicensedBy ?? '');
  const [lyricLicense, setLyricLicense] = useState(existing?.lyricLicenseStatus ?? '');
  const [lyricBy, setLyricBy]         = useState(existing?.lyricLicensedBy ?? '');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'rgba(0,0,0,0.3)', border: `1px solid ${C.hairlineStrong}`,
    borderRadius: 8, padding: '7px 10px', fontSize: 12, color: C.silver,
    fontFamily: SANS, outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase',
    color: C.lavender, display: 'block', marginBottom: 4,
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (isrc.trim())        body.isrc = isrc.trim();
      if (writer.trim())      body.writerName = writer.trim();
      if (publisher.trim())   body.publisherName = publisher.trim();
      if (pro.trim())         body.proAffiliation = pro.trim();
      if (workId.trim())      body.ascapWorkId = workId.trim();
      if (ipi.trim())         body.writerIpi   = ipi.trim();
      if (splitPct.trim()) {
        const n = parseFloat(splitPct.trim());
        if (!isNaN(n)) body.splitPct = Math.min(100, Math.max(0, n));
      }
      body.isOneStop = oneStop;
      if (syncLicense.trim()) body.syncLicenseStatus = syncLicense.trim();
      if (syncBy.trim())      body.syncLicensedBy = syncBy.trim();
      if (lyricLicense.trim()) body.lyricLicenseStatus = lyricLicense.trim();
      if (lyricBy.trim())     body.lyricLicensedBy = lyricBy.trim();

      const res = await fetch(`${API_BASE}/api/tracks/${trackId}/rights`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json() as RightsSaveResult;
      onSaved(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: 20, padding: '14px 16px', borderRadius: 14, background: 'rgba(0,0,0,0.35)', border: `1px solid ${C.hairlineStrong}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 9, letterSpacing: '0.26em', textTransform: 'uppercase', color: C.lavender, fontWeight: 700 }}>Rights intake</span>
          {autoFill && (autoFill.writerName || autoFill.publisherName || autoFill.isrc) && (
            <span style={{ marginLeft: 8, fontSize: 9, color: '#34D399', fontWeight: 600, letterSpacing: '0.1em' }}>
              ✓ auto-filled from {autoFill.sources.writer ?? autoFill.sources.publisher ?? 'registry'}
            </span>
          )}
        </div>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: C.lavender, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div><label style={labelStyle}>ISRC</label><input style={inputStyle} value={isrc} onChange={e => setIsrc(e.target.value)} placeholder="e.g. USRC17607839" /></div>
        <div><label style={labelStyle}>Writer Name</label><input style={inputStyle} value={writer} onChange={e => setWriter(e.target.value)} placeholder="Artist / composer" /></div>
        <div><label style={labelStyle}>Publisher</label><input style={inputStyle} value={publisher} onChange={e => setPublisher(e.target.value)} placeholder="Publisher name" /></div>
        <div><label style={labelStyle}>PRO Affiliation</label><input style={inputStyle} value={pro} onChange={e => setPro(e.target.value)} placeholder="ASCAP / BMI / SESAC" /></div>
        <div><label style={labelStyle}>Work ID / ISWC</label><input style={inputStyle} value={workId} onChange={e => setWorkId(e.target.value)} placeholder="T-070909483-6 or ASCAP/BMI ID" /></div>
        <div><label style={labelStyle}>Writer IPI</label><input style={inputStyle} value={ipi} onChange={e => setIpi(e.target.value)} placeholder="e.g. 00508530861" /></div>
        <div>
          <label style={labelStyle}>Writer Split %</label>
          <input style={inputStyle} type="number" min={0} max={100} step={0.01} value={splitPct} onChange={e => setSplitPct(e.target.value)} placeholder="e.g. 50" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <label style={{ ...labelStyle, marginBottom: 10 }}>One-Stop License</label>
          <button type="button" onClick={() => setOneStop(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span style={{ width: 32, height: 18, borderRadius: 999, background: oneStop ? '#34D399' : 'rgba(255,255,255,0.10)', border: `1px solid ${oneStop ? '#34D399' : C.hairlineStrong}`, position: 'relative', display: 'inline-block', flexShrink: 0, transition: 'background 0.2s' }}>
              <span style={{ position: 'absolute', top: 2, left: oneStop ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
            </span>
            <span style={{ fontSize: 12, color: oneStop ? '#34D399' : C.lavender }}>{oneStop ? 'Yes' : 'No'}</span>
          </button>
        </div>
      </div>
      <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 9, background: 'rgba(245,166,35,0.07)', border: `1px solid ${C.hairline}` }}>
        <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.lavender, marginBottom: 8 }}>Composition &amp; Lyric Licenses</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={labelStyle}>Sync License Status</label>
            <select style={{ ...inputStyle, appearance: 'none' }} value={syncLicense} onChange={e => setSyncLicense(e.target.value)}>
              <option value="">— not set —</option>
              <option value="CLEARED">Cleared</option>
              <option value="PENDING">Pending</option>
              <option value="NOT_CLEARED">Not cleared</option>
            </select>
          </div>
          <div><label style={labelStyle}>Sync Licensed By</label><input style={inputStyle} value={syncBy} onChange={e => setSyncBy(e.target.value)} placeholder="Publisher / agency" /></div>
          <div>
            <label style={labelStyle}>Lyric License Status</label>
            <select style={{ ...inputStyle, appearance: 'none' }} value={lyricLicense} onChange={e => setLyricLicense(e.target.value)}>
              <option value="">— not set —</option>
              <option value="CLEARED">Cleared</option>
              <option value="PENDING">Pending</option>
              <option value="NOT_CLEARED">Not cleared</option>
              <option value="NOT_APPLICABLE">Not applicable</option>
            </select>
          </div>
          <div><label style={labelStyle}>Lyric Licensed By</label><input style={inputStyle} value={lyricBy} onChange={e => setLyricBy(e.target.value)} placeholder="Rights holder" /></div>
        </div>
      </div>
      {error && <p style={{ fontSize: 11, color: C.magenta, marginTop: 8 }}>{error}</p>}
      <button type="button" onClick={() => void handleSave()} disabled={saving} style={{ marginTop: 12, width: '100%', padding: '9px 0', borderRadius: 8, border: 'none', cursor: saving ? 'wait' : 'pointer', background: `linear-gradient(135deg, ${C.purple}, ${C.magenta})`, color: '#fff', fontFamily: SANS, fontWeight: 700, fontSize: 12, letterSpacing: '0.06em' }}>
        {saving ? 'Saving…' : 'Save Rights Data'}
      </button>
    </div>
  );
}

// ── RightsTable ────────────────────────────────────────────────
function RightsTable({
  rp,
  trackId,
  onEditRights,
}: {
  rp: AnalysisResult['rightsProfile'];
  trackId: string;
  onEditRights: () => void;
}) {
  const [fingerprinting, setFingerprinting] = useState(false);
  const [fpError, setFpError]               = useState<string | null>(null);
  const [fpNote, setFpNote]                 = useState<string | null>(null);

  const hasWriter    = Boolean(rp?.writerName);
  const hasPublisher = Boolean(rp?.publisherName);
  const hasOneStop   = rp?.isOneStop === true;
  const syncCleared  = rp?.syncLicenseStatus === 'CLEARED';
  const lyricCleared = rp?.lyricLicenseStatus === 'CLEARED';
  const hasAnyIntake = hasWriter || hasPublisher || Boolean(rp?.proAffiliation);

  const stages = [
    { label: 'Metadata intake',          done: hasAnyIntake },
    { label: 'Publisher data captured',  done: hasPublisher },
    { label: 'Writer / splits captured', done: hasWriter },
    { label: 'One-stop confirmed',        done: hasOneStop },
    { label: 'Sync license cleared',     done: syncCleared },
    { label: 'Lyric license cleared',    done: lyricCleared },
    { label: 'Fingerprint identity resolution', done: false },
    { label: 'PRO cross-check',          done: false },
  ];

  const confidencePct = Math.round((stages.filter(s => s.done).length / stages.length) * 100);
  const statusLabel   =
    syncCleared && lyricCleared && hasWriter && hasPublisher ? '✓ Fully cleared' :
    hasAnyIntake || syncCleared || lyricCleared              ? '⊞ Partially cleared' :
    '○ Not started';

  const fmtLicense = (s: string | null | undefined) =>
    s === 'CLEARED' ? 'Cleared' : s === 'PENDING' ? 'Pending' : s === 'NOT_CLEARED' ? 'Not cleared' : null;

  const RF = ({ label, val, warn, bad }: { label: string; val: string | null | undefined; warn?: boolean; bad?: boolean }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.amber, fontWeight: 700 }}>{label}</span>
      <span style={{
        fontFamily: '"JetBrains Mono",monospace', fontSize: 12, letterSpacing: '0.01em', wordBreak: 'break-word',
        color: !val ? undefined : warn ? '#fbbf24' : bad ? C.bad : C.silver,
      }}>
        {val ?? <span style={{ color: 'rgba(107,100,144,0.85)', fontStyle: 'italic', fontFamily: SERIF, fontSize: 13 }}>&mdash; not entered &mdash;</span>}
      </span>
    </div>
  );

  const runFingerprint = async () => {
    setFingerprinting(true);
    setFpError(null);
    try {
      const res = await fetch(`${API_BASE}/api/tracks/${trackId}/fingerprint`, { method: 'POST' });
      const data = await res.json() as { reconciliationNote?: string; error?: string; message?: string };
      if (!res.ok) throw new Error(data.message ?? data.error ?? `Server ${res.status}`);
      setFpNote(data.reconciliationNote ?? 'Identity resolved.');
    } catch (e) {
      setFpError(e instanceof Error ? e.message : 'Fingerprint failed');
    } finally {
      setFingerprinting(false);
    }
  };

  return (
    <div style={{ marginTop: 20, borderRadius: 16, border: `1px solid ${C.hairline}`, background: 'rgba(0,0,0,0.22)', overflow: 'hidden' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${C.hairline}`, background: 'linear-gradient(180deg,rgba(245,166,35,0.06),transparent)' }}>
        <span style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.amber, fontWeight: 700 }}>Rights &amp; clearance</span>
        <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 11, letterSpacing: '0.04em', padding: '4px 10px', borderRadius: 999, border: '1px solid rgba(245,158,11,0.35)', color: '#fbbf24', background: 'rgba(245,158,11,0.10)', whiteSpace: 'nowrap' }}>
          {statusLabel}
        </span>
      </div>
      {/* body */}
      <div className="sv-rights-body">
        {/* field grid */}
        <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 18px' }}>
          <RF label="ISRC"              val={rp?.isrc} />
          <RF label="Work ID · ISWC"    val={rp?.workId} />
          <RF label="Writer"            val={rp?.writerName} />
          <RF label="Writer split %"    val={rp?.splitPct != null ? `${rp.splitPct}%` : null} />
          <RF label="Writer IPI"        val={rp?.writerIpi} />
          <RF label="Publisher"         val={rp?.publisherName} />
          <RF label="PRO affiliation"   val={rp?.proAffiliation} />
          <RF label="One-stop license"  val={rp?.isOneStop === true ? 'Yes' : rp?.isOneStop === false ? 'No' : null} />
          <RF label="Sync license"      val={fmtLicense(rp?.syncLicenseStatus)} warn={rp?.syncLicenseStatus === 'PENDING'} bad={rp?.syncLicenseStatus === 'NOT_CLEARED'} />
          <RF label="Sync licensed by"  val={rp?.syncLicensedBy} />
          <RF label="Lyric license"     val={fmtLicense(rp?.lyricLicenseStatus)} warn={rp?.lyricLicenseStatus === 'PENDING'} bad={rp?.lyricLicenseStatus === 'NOT_CLEARED'} />
          <RF label="Lyric licensed by" val={rp?.lyricLicensedBy} />
        </div>
        {/* pipeline */}
        <div className="sv-rights-pipeline">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 8.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.amber, fontWeight: 700 }}>Rights confidence</span>
            <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 22, color: C.amber, lineHeight: 1 }}>{confidencePct}%</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {stages.map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 11, color: s.done ? C.silver : C.lavender }}>
                <span style={{ width: 15, height: 15, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 800, background: s.done ? 'rgba(76,175,130,0.18)' : 'rgba(123,112,178,0.10)', color: s.done ? C.good : C.lavender, border: `1px solid ${s.done ? 'rgba(76,175,130,0.4)' : C.hairlineStrong}` }}>
                  {s.done ? '✓' : '×'}
                </span>
                {s.label}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
            <button type="button" onClick={onEditRights} style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: `1px solid ${C.hairlineStrong}`, background: 'transparent', color: C.lavender, fontFamily: SANS, fontSize: 10, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.04em' }}>
              ✎ Edit
            </button>
            <button type="button" onClick={() => void runFingerprint()} disabled={fingerprinting} style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: 'none', background: `linear-gradient(135deg,${C.purple},${C.magenta})`, color: '#fff', fontFamily: SANS, fontSize: 10, fontWeight: 700, cursor: fingerprinting ? 'wait' : 'pointer', letterSpacing: '0.04em' }}>
              {fingerprinting ? 'Resolving…' : '⧅ Resolve'}
            </button>
          </div>
          {fpError && <p style={{ margin: '8px 0 0', fontSize: 10, color: C.magenta }}>{fpError}</p>}
          {fpNote  && <p style={{ margin: '8px 0 0', fontSize: 10, color: C.good, fontStyle: 'italic' }}>{fpNote}</p>}
        </div>
      </div>
    </div>
  );
}

// ── LocalRightsOverride type ──────────────────────────────────
type LocalRightsOverride = NonNullable<AnalysisResult['rightsProfile']> & { blockers?: string[] };

// ── LeadCard ───────────────────────────────────────────────────
function LeadCard({
  result,
  allResults,
  briefId: _briefId,
  sceneArc,
  onRightsSaved,
  onShare,
  onMoveToConsidered,
}: {
  result: AnalysisResult;
  allResults: AnalysisResult[];
  briefId: BriefId;
  sceneArc?: SceneArc | null;
  onRightsSaved?: (trackId: string, override: LocalRightsOverride) => void;
  onShare?: () => void;
  onMoveToConsidered?: (trackId: string) => void;
}) {
  const [isPlaying, setIsPlaying]           = useState(false);
  const [currentTime, setCurrentTime]       = useState(0);
  const [duration, setDuration]             = useState(0);
  const [rightsPanel, setRightsPanel]       = useState(false);
  const [playbackMsg, setPlaybackMsg]       = useState(false);
  const [noteOpen, setNoteOpen]             = useState(false);
  const [noteText, setNoteText]             = useState('');
  const [localRightsProfile, setLocalRights] = useState(result.rightsProfile);
  const [pendingAutoFill, setPendingAutoFill] = useState<AutoFill | undefined>(undefined);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const vec     = result.confidenceScore.vector;
  const WEIGHTS = { scene: 0.45, lyrics: 0.25, audioSignal: 0.20, rightsClarity: 0.10 };
  const liveScore = Math.round(
    (vec.scene * WEIGHTS.scene + vec.lyrics * WEIGHTS.lyrics +
     vec.audioSignal * WEIGHTS.audioSignal + vec.rightsClarity * WEIGHTS.rightsClarity) * 100
  );

  // ── Decision-support ──────────────────────────────────────────
  const clearability = computeClearabilityConfidence(result.rightsProfile, result.track);
  const replacement  = computeReplacementRisk(result, allResults);
  const action       = buildRecommendedAction(liveScore, clearability.score, replacement.label);
  const actionColors = ACTION_COLORS[action.tier];

  const audioFilePath = resolveAudioUrl(result.track.audioFilePath);
  const hasAudio      = audioFilePath !== null;
  const title         = cleanTrackTitle(result.track.title);
  const timeLabel     = duration > 0 ? `${formatTime(currentTime)} / ${formatTime(duration)}` : formatTime(currentTime);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime  = () => setCurrentTime(audio.currentTime);
    const onMeta  = () => setDuration(audio.duration);
    const onPlay  = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      if (currentAudio.el === audio) currentAudio.el = null;
      audio.pause();
    };
  }, [audioFilePath]);

  const togglePlayback = () => {
    if (!hasAudio) { setPlaybackMsg(true); return; }
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) { audio.pause(); return; }
    if (currentAudio.el && currentAudio.el !== audio) currentAudio.el.pause();
    currentAudio.el = audio;
    void audio.play().catch(() => setIsPlaying(false));
  };

  const MAX_W = 0.45;
  const AXES = [
    { key: 'scene',         label: 'Scene',  weight: 0.45, value: vec.scene,         fixed: true  },
    { key: 'lyrics',        label: 'Lyrics', weight: 0.25, value: vec.lyrics,        fixed: false },
    { key: 'audioSignal',   label: 'Signal', weight: 0.20, value: vec.audioSignal,   fixed: true  },
    { key: 'rightsClarity', label: 'Rights', weight: 0.10, value: vec.rightsClarity, fixed: false },
  ];

  const WAVE = [30,55,40,72,50,90,60,35,65,48,78,42,62,38,55,80,45,60,30,70,42,55,36,50,65,40,58,32,48,55];

  return (
    <article className="sv-lead-card" style={{
      position: 'relative', borderRadius: 22, padding: 28,
      background: 'linear-gradient(180deg, rgba(26,22,48,0.60), rgba(16,12,32,0.78))',
      border: `1px solid ${C.hairline}`, overflow: 'hidden',
    }}>

      {/* ── Recommended Action ── */}
      <div style={{ marginBottom: 20, padding: '14px 16px', borderRadius: 14, background: actionColors.bg, border: `1px solid ${actionColors.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: actionColors.text, opacity: 0.7 }}>Recommended Action</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: actionColors.text, letterSpacing: '0.01em' }}>{action.label}</span>
          </div>
          <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 13, color: C.silver, opacity: 0.8 }}>{action.sentence}</span>
        </div>
      </div>

      {/* ── Three-metric summary ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 22 }}>
        {/* Creative Fit */}
        <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(7,4,26,0.55)', border: `1px solid ${C.hairline}` }}>
          <div style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender, marginBottom: 6 }}>Creative Fit</div>
          <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 26, fontWeight: 600, color: C.silver, lineHeight: 1 }}>{liveScore}</div>
          <div style={{ fontSize: 10, color: C.lavender, marginTop: 4 }}>Story Match</div>
        </div>
        {/* Clearability */}
        <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(7,4,26,0.55)', border: `1px solid ${C.hairline}` }}>
          <div style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender, marginBottom: 6 }}>Clearability</div>
          <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 26, fontWeight: 600, color: CLEAR_BAND_COLOR[clearability.band], lineHeight: 1 }}>{clearability.score}%</div>
          <div style={{ fontSize: 10, color: CLEAR_BAND_COLOR[clearability.band], marginTop: 4 }}>{CLEAR_BAND_LABEL[clearability.band]}</div>
        </div>
        {/* Replacement Risk */}
        <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(7,4,26,0.55)', border: `1px solid ${C.hairline}` }}>
          <div style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender, marginBottom: 6 }}>Replacement Risk</div>
          <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 20, fontWeight: 600, color: REP_COLOR[replacement.label], lineHeight: 1, marginTop: 2 }}>{replacement.label}</div>
          <div style={{ fontSize: 10, color: C.lavender, marginTop: 4 }}>{replacement.count} alternative{replacement.count !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* ── Clearability rationale ── */}
      <div style={{ marginBottom: 20, padding: '10px 14px', borderRadius: 10, background: 'rgba(0,0,0,0.22)', borderLeft: `2px solid ${CLEAR_BAND_COLOR[clearability.band]}` }}>
        <span style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: CLEAR_BAND_COLOR[clearability.band], marginRight: 8 }}>Clearability</span>
        <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 13, color: C.lavender }}>{clearability.rationale}</span>
      </div>

      {/* ── Replacement sentence ── */}
      <div style={{ marginBottom: 22, padding: '10px 14px', borderRadius: 10, background: 'rgba(0,0,0,0.22)', borderLeft: `2px solid ${REP_COLOR[replacement.label]}` }}>
        <span style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: REP_COLOR[replacement.label], marginRight: 8 }}>Replacement Risk</span>
        <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 13, color: C.lavender }}>{replacement.sentence}</span>
      </div>

      {/* ── lead head ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
        <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(48px,7vw,76px)', lineHeight: 0.85, letterSpacing: '-0.03em', flexShrink: 0, background: 'linear-gradient(180deg,#F472B6 0%,#DB2777 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          {result.rank}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.magenta, background: 'rgba(219,39,119,0.14)', border: '1px solid rgba(219,39,119,0.34)', padding: '4px 9px', borderRadius: 999, marginBottom: 8 }}>
            &mdash; Leader &mdash;
          </span>
          <div style={{ fontFamily: SERIF, fontSize: 'clamp(26px,3.4vw,38px)', lineHeight: 1.05, letterSpacing: '-0.015em', color: C.silver }}>{title}</div>
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 16, color: C.lavender, marginTop: 4 }}>
            {result.track.artistName ? `by ${result.track.artistName}` : 'Unknown artist'}
            {duration > 0 && ` · ${formatTime(duration)}`}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            {result.track.tempo != null && <Chip variant="bpm">{result.track.tempo} BPM</Chip>}
            {result.track.tonalCharacter && <Chip>{result.track.tonalCharacter}</Chip>}
            {result.track.energyCharacter && <Chip>{result.track.energyCharacter}</Chip>}
            {(localRightsProfile?.blockers?.length ?? 0) > 0 && <Chip variant="warn">Rights unclear</Chip>}
          </div>
        </div>
      </div>

      {/* ── score block ── */}
      <div style={{ marginTop: 22, padding: '20px 22px', borderRadius: 16, background: 'rgba(7,4,26,0.55)', border: `1px solid ${C.hairline}` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, marginBottom: 18, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: SERIF, fontSize: 'clamp(64px,8vw,96px)', lineHeight: 0.85, letterSpacing: '-0.04em', color: C.silver }}>
            {liveScore}
            <span style={{ fontSize: '0.3em', color: 'rgba(167,139,250,0.55)', letterSpacing: '-0.01em', marginLeft: 4, verticalAlign: '0.55em' }}>/100</span>
          </div>
          <p style={{ flex: 1, minWidth: 200, fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(15px,1.5vw,18px)', lineHeight: 1.35, color: 'rgba(226,232,240,0.78)', maxWidth: '38ch', margin: 0 }}>
            {buildScoreCaption(vec)}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.6)', padding: '0 2px 6px', borderBottom: `1px dashed ${C.hairline}`, marginBottom: 2 }}>
            <span>Axis</span>
            <span style={{ color: 'rgba(167,139,250,0.45)', letterSpacing: '0.06em', textTransform: 'none', fontFamily: SERIF, fontStyle: 'italic', fontSize: 12 }}>bar width = weight &middot; fill = value</span>
          </div>

          {AXES.map(axis => {
            const barW     = (axis.weight / MAX_W) * 100;
            const fillPct  = Math.round(axis.value * 100);
            const unscored = axis.value === 0 && !axis.fixed;

            return (
              <div key={axis.key} className="sv-axis-row" style={{ display: 'grid', gridTemplateColumns: '56px minmax(0,1fr) 38px 22px', alignItems: 'center', gap: 10, padding: '4px 0', borderRadius: 8 }}>
                {/* label */}
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.silver }}>
                  {axis.label}
                  <span style={{ display: 'block', fontFamily: '"JetBrains Mono",monospace', fontSize: 9, letterSpacing: '0.04em', fontWeight: 500, color: 'rgba(167,139,250,0.55)', textTransform: 'none', marginTop: 1 }}>
                    {Math.round(axis.weight * 100)}% wt
                  </span>
                </div>
                {/* bar */}
                <div style={{ position: 'relative', height: 22, display: 'flex', alignItems: 'center' }}>
                  <div style={{ height: 14, borderRadius: 7, background: 'linear-gradient(90deg,rgba(167,139,250,0.05),rgba(167,139,250,0.10))', border: `1px solid ${C.hairline}`, position: 'relative', overflow: 'hidden', width: `${barW}%`, transition: 'width 0.4s cubic-bezier(0.2,0.7,0.2,1)' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: unscored ? '0%' : `${fillPct}%`, background: axis.fixed ? 'linear-gradient(90deg,rgba(219,39,119,0.55),rgba(219,39,119,0.85))' : 'linear-gradient(90deg,#C2410C,#F5A623)', borderRadius: 6, boxShadow: axis.fixed ? '0 0 12px rgba(219,39,119,0.35)' : '0 0 12px rgba(245,166,35,0.4)', transition: 'width 0.6s cubic-bezier(0.2,0.7,0.2,1)' }} />
                    <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 1, background: C.hairlineStrong }} />
                  </div>
                </div>
                {/* value */}
                <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 13, fontWeight: 600, color: unscored ? 'rgba(167,139,250,0.4)' : C.silver, textAlign: 'right', letterSpacing: '-0.01em' }}>
                  {unscored ? '—' : fillPct}
                </div>
                {/* action */}
                {!axis.fixed ? (
                  <button type="button" onClick={() => setRightsPanel(true)} style={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, fontFamily: '"JetBrains Mono",monospace', fontSize: 11, fontWeight: 700, color: C.magenta, background: 'rgba(221,122,58,0.10)', border: '1px solid rgba(221,122,58,0.35)', cursor: 'pointer' }} title="Improve this axis">↑</button>
                ) : (
                  <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'rgba(167,139,250,0.4)', border: `1px dashed rgba(167,139,250,0.25)`, fontFamily: '"JetBrains Mono",monospace', fontSize: 11 }}>—</div>
                )}
                {/* hint */}
                {!axis.fixed && (
                  <div style={{ gridColumn: '2 / -1', fontFamily: SERIF, fontStyle: 'italic', fontSize: 12, color: unscored ? 'rgba(167,139,250,0.40)' : 'rgba(167,139,250,0.55)', lineHeight: 1.2, marginTop: 2 }}>
                    {axis.key === 'lyrics' ? 'Add lyrics to score this axis.' : 'Add writer + publisher to clear this axis.'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── rights block ── */}
      {!rightsPanel ? (
        <RightsTable rp={localRightsProfile} trackId={result.track.id} onEditRights={() => setRightsPanel(true)} />
      ) : (
        <RightsPanel
          trackId={result.track.id}
          isrc={localRightsProfile?.isrc ?? result.track.isrc}
          existing={localRightsProfile}
          autoFill={pendingAutoFill}
          onSaved={saved => {
            const newRp: LocalRightsOverride = {
              isrc: saved.isrc, isOneStop: saved.isOneStop, proAffiliation: saved.proAffiliation,
              masterVerifiedAt: saved.masterVerifiedAt, masterOwnedBy: saved.masterOwnedBy,
              publisherName: saved.publisherName, writerName: saved.writerName,
              workId: saved.workId, blockers: saved.blockers, rightsState: saved.rightsState,
              syncLicenseStatus: saved.syncLicenseStatus, syncLicensedBy: saved.syncLicensedBy,
              lyricLicenseStatus: saved.lyricLicenseStatus, lyricLicensedBy: saved.lyricLicensedBy,
              splitPct: saved.splitPct,
            };
            setLocalRights(newRp);
            onRightsSaved?.(result.track.id, newRp);
            setRightsPanel(false);
          }}
          onClose={() => { setRightsPanel(false); setPendingAutoFill(undefined); }}
        />
      )}

      {/* ── narrative ── */}
      <div style={{ marginTop: 20, padding: '16px 18px', borderRadius: 14, background: 'rgba(167,139,250,0.05)', borderLeft: `2px solid ${C.magenta}`, fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(15px,1.5vw,18px)', lineHeight: 1.45, color: C.silver, maxWidth: '56ch' }}>
        {result.confidenceScore.explanation}
      </div>

      {/* ── arc match ── */}
      {sceneArc && (
        <div style={{ marginTop: 20 }}>
          <ArcMatch
            scene={{ opening: sceneArc.opening, heldBreath: sceneArc.heldBreath, turn: sceneArc.turn, release: sceneArc.release }}
            song={deriveSongArc(result.track)}
            mode="inspect"
            trackTitle={cleanTrackTitle(result.track.title)}
            artist={result.track.artistName ?? undefined}
            sceneLabel={isPlaying ? 'Arc Match™ — live sync' : 'Arc Match™ — play to sync · hover to inspect'}
            playheadFraction={duration > 0 ? currentTime / duration : undefined}
          />
        </div>
      )}

      {/* ── player ── */}
      <div className="no-print" style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 14, background: 'rgba(0,0,0,0.32)', border: `1px solid ${C.hairline}` }}>
        <button type="button" onClick={togglePlayback} aria-label={isPlaying ? 'Pause' : 'Play'} style={{ width: 38, height: 38, borderRadius: '50%', background: `linear-gradient(135deg,${C.purple},${C.magenta})`, border: 0, color: 'white', display: 'grid', placeItems: 'center', cursor: 'pointer', boxShadow: `0 10px 22px -10px rgba(245,166,35,0.6)${isPlaying ? ', 0 0 0 4px rgba(245,166,35,0.25)' : ''}`, flexShrink: 0, transition: 'box-shadow 0.2s ease' }}>
          {isPlaying
            ? <svg width="11" height="11" viewBox="0 0 10 10" fill="currentColor"><rect x="1.5" y="1" width="2.5" height="8"/><rect x="6" y="1" width="2.5" height="8"/></svg>
            : <svg width="13" height="13" viewBox="0 0 10 10" fill="currentColor"><path d="M2 1 L8 5 L2 9 Z"/></svg>
          }
        </button>
        <div
          style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2, height: 36, cursor: 'pointer' }}
          onPointerDown={e => {
            const el = e.currentTarget;
            const seek = (ev: PointerEvent) => {
              const r = el.getBoundingClientRect();
              const ratio = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
              if (audioRef.current) audioRef.current.currentTime = ratio * (audioRef.current.duration || 0);
            };
            seek(e.nativeEvent);
            const move = (ev: PointerEvent) => seek(ev);
            const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
          }}
        >
          {WAVE.map((h, i) => {
            const played = duration > 0 && (i / WAVE.length) < (currentTime / duration);
            return <span key={i} style={{ display: 'block', flex: 1, minWidth: 2, height: `${h}%`, borderRadius: 2, background: played ? `linear-gradient(180deg,${C.magenta},${C.purple})` : 'rgba(167,139,250,0.32)', transition: 'background 0.1s' }} />;
          })}
        </div>
        <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 11, color: C.lavender, letterSpacing: '0.04em', flexShrink: 0 }}>{timeLabel}</span>
      </div>
      {playbackMsg && !hasAudio && <p style={{ fontSize: 11, color: C.lavender, marginTop: 6, fontStyle: 'italic' }}>Audio playback coming soon.</p>}

      {/* ── lead actions ── */}
      <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={onShare} style={{ flex: 1, minWidth: 130, padding: '12px 16px', borderRadius: 12, border: 0, background: `linear-gradient(135deg,${C.purple},${C.magenta})`, color: 'white', fontSize: 13, fontWeight: 600, letterSpacing: '0.01em', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 14px 30px -14px rgba(221,122,58,0.55)', transition: 'transform 0.1s ease' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 12 L10 18 L20 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Pitch to director
        </button>
        <button type="button" onClick={() => onMoveToConsidered?.(result.track.id)} style={{ flex: 1, minWidth: 130, padding: '12px 16px', borderRadius: 12, border: `1px solid ${C.hairlineStrong}`, background: 'rgba(167,139,250,0.06)', color: C.silver, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'border-color 0.15s ease' }}>
          Move to considered
        </button>
        <button type="button" onClick={() => setNoteOpen(v => !v)} style={{ flex: 1, minWidth: 130, padding: '12px 16px', borderRadius: 12, border: `1px solid ${noteOpen ? 'rgba(219,39,119,0.3)' : C.hairlineStrong}`, background: noteOpen ? 'rgba(219,39,119,0.08)' : 'rgba(167,139,250,0.06)', color: C.silver, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          Notes
        </button>
      </div>

      {/* notes */}
      {noteOpen && (
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 12, background: noteText ? 'linear-gradient(180deg,rgba(219,39,119,0.08),transparent)' : 'rgba(0,0,0,0.28)', border: `1px solid ${noteText ? 'rgba(219,39,119,0.3)' : C.hairline}` }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: C.magenta, flexShrink: 0 }}><path d="M4 5 H20 V17 H10 L6 21 V17 H4 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>
          <input type="text" placeholder="Add a note for the director…" value={noteText} onChange={e => setNoteText(e.target.value)} style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', color: C.silver, fontFamily: SANS, fontSize: 13 }} />
        </div>
      )}

      {hasAudio && <audio ref={audioRef} src={audioFilePath!} preload="metadata" />}
    </article>
  );
}

// ── MiniCard ───────────────────────────────────────────────────
function MiniCard({
  result,
  topScore,
  dimmed,
}: {
  result: AnalysisResult;
  topScore: number;
  dimmed?: boolean;
}) {
  const title = cleanTrackTitle(result.track.title);
  const score = result.confidenceScore.score;
  const delta = topScore - score;

  return (
    <div className="sv-mini-card" style={{
      display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 14,
      alignItems: 'center', padding: '14px 16px', borderRadius: 14,
      background: 'rgba(15,8,35,0.55)', border: `1px solid ${C.hairline}`,
      cursor: 'pointer', position: 'relative',
      opacity: dimmed ? 0.62 : 1,
      transition: 'transform 0.15s ease, background 0.2s ease, box-shadow 0.2s ease',
    }}>
      <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 26, color: '#DB2777', lineHeight: 1, textAlign: 'center' }}>
        {result.rank}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.silver, letterSpacing: '-0.005em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </div>
        <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 13, color: C.lavender, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
          {result.confidenceScore.explanation}
        </div>
        <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 9, color: 'rgba(245,166,35,0.72)', letterSpacing: '0.06em', marginTop: 5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {result.track.tempo != null && <span>{result.track.tempo} BPM</span>}
          {result.track.tonalCharacter && <><span>&middot;</span><span style={{ textTransform: 'uppercase' }}>{result.track.tonalCharacter}</span></>}
          {result.track.energyCharacter && <><span>&middot;</span><span style={{ textTransform: 'uppercase' }}>{result.track.energyCharacter}</span></>}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontFamily: SERIF, fontSize: 22, color: C.silver, lineHeight: 1, letterSpacing: '-0.01em' }}>{score}</div>
        {delta > 0 && (
          <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 9, color: 'rgba(167,139,250,0.6)', letterSpacing: '0.04em', marginTop: 3 }}>&minus;{delta}</div>
        )}
      </div>
    </div>
  );
}

// ── Verdict builder ───────────────────────────────────────────
function buildVerdict(
  winner: AnalysisResult,
  loser:  AnalysisResult,
  briefId: BriefId,
  sceneParams: SceneParams,
): string {
  const wVec = winner.confidenceScore.vector;
  const lVec = loser.confidenceScore.vector;

  const gaps: { axis: string; gap: number }[] = [
    { axis: 'audioSignal',   gap: wVec.audioSignal   - lVec.audioSignal   },
    { axis: 'scene',         gap: wVec.scene         - lVec.scene         },
    { axis: 'lyrics',        gap: wVec.lyrics        - lVec.lyrics        },
    { axis: 'rightsClarity', gap: wVec.rightsClarity - lVec.rightsClarity },
  ];
  const dominant = gaps.reduce((a, b) => Math.abs(a.gap) > Math.abs(b.gap) ? a : b);

  const wName = cleanTrackTitle(winner.track.title);
  const lName = cleanTrackTitle(loser.track.title);
  const brief = BRIEF_LABELS[briefId] ?? briefId;
  const register = sceneParams.emotionalRegister ?? brief;
  const pacing = sceneParams.pacing;

  let axisSentence = '';
  let editorialSentence = '';

  if (dominant.axis === 'audioSignal') {
    const isWinnerHigher = dominant.gap > 0;
    axisSentence = `${wName} leads on mix profile.`;
    if (['grief-loss','heartbreak-separation','contemplative-reflective','romance-intimacy'].includes(briefId)) {
      editorialSentence = isWinnerHigher
        ? `Its more restrained signal sits inside the ${register.toLowerCase()} register without competing with dialogue or foley.`
        : `Its wider spectral presence gives the scene more tonal weight, anchoring the ${register.toLowerCase()} moment.`;
    } else if (['chase-tension','action-combat','suspense-dread','horror-psychological'].includes(briefId)) {
      editorialSentence = isWinnerHigher
        ? `A denser mix profile sustains the kinetic pressure this ${brief.toLowerCase()} cue demands without thinning at low levels.`
        : `The tighter mix leaves more headroom for sound design and dialogue cut through in a busy ${brief.toLowerCase()} mix.`;
    } else if (['euphoria-celebration','triumph-victory'].includes(briefId)) {
      editorialSentence = `The mix density matches the energy ceiling a ${brief.toLowerCase()} sequence needs without early compression artefacts.`;
    } else if (pacing === 'driving') {
      editorialSentence = `The signal profile holds together at the pacing this brief requires.`;
    } else {
      editorialSentence = `${lName}'s ${isWinnerHigher ? 'wider' : 'narrower'} spectral spread gives the music editor less room to work at low levels.`;
    }
  } else if (dominant.axis === 'scene') {
    axisSentence = `${wName} leads on scene fit.`;
    editorialSentence = `Its tonal and structural profile is a closer match for the ${register.toLowerCase()} brief — the gap is likely audible to a picture editor on first pass.`;
  } else if (dominant.axis === 'lyrics') {
    axisSentence = `${wName} leads on lyric fit.`;
    editorialSentence = `The lyric content aligns more directly with the ${register.toLowerCase()} subject matter, reducing the risk of a clearance-level semantic mismatch.`;
  } else if (dominant.axis === 'rightsClarity') {
    axisSentence = `${wName} leads on rights data completeness.`;
    editorialSentence = `Its rights record has more verified fields, which reduces clearance risk when the picture editor needs a quick decision.`;
  } else {
    axisSentence = `${wName} leads on scene fit.`;
    editorialSentence = `Its overall creative profile is a closer match for the ${register.toLowerCase()} brief.`;
  }

  const wR = winner.confidenceScore.clearanceBreakdown ?? 0;
  const lR = loser.confidenceScore.clearanceBreakdown ?? 0;
  const rightsDiff = wR - lR;
  let rightsSentence: string;
  if (Math.abs(rightsDiff) <= 5) {
    rightsSentence = 'Confirm rights clearance on both before placement.';
  } else if (rightsDiff > 0) {
    rightsSentence = `${wName} also carries less rights exposure — prioritise it if the timeline is short.`;
  } else {
    rightsSentence = `${lName} has the cleaner rights position; factor that in if the decision is close.`;
  }

  return `${axisSentence} ${editorialSentence} ${rightsSentence}`;
}

// ── CompareModal ──────────────────────────────────────────────
function CompareModal({
  results, open, onClose, briefId, sceneParams,
}: {
  results: AnalysisResult[];
  open: boolean;
  onClose: () => void;
  briefId: BriefId;
  sceneParams: SceneParams;
}) {
  const [leftIdx,  setLeftIdx]  = useState(0);
  const [rightIdx, setRightIdx] = useState(Math.min(1, results.length - 1));

  if (!open || results.length < 2) return null;

  const left       = results[leftIdx];
  const right      = results[rightIdx];
  const leftScore  = left.confidenceScore.score;
  const rightScore = right.confidenceScore.score;
  const lead       = leftIdx < rightIdx ? leftScore - rightScore : rightScore - leftScore;

  const AXES = ['scene', 'rightsClarity', 'lyrics', 'audioSignal'] as const;
  const AXIS_COLORS = {
    scene:         '#F5A623',
    rightsClarity: (v: number) => v >= 0.65 ? '#4CAF82' : v >= 0.35 ? '#F5B544' : '#E85A5A',
    lyrics:        '#9B93C4',
    audioSignal:   'rgba(155,147,196,0.55)',
  } as const;

  const axisColor = (key: typeof AXES[number], value: number) =>
    key === 'rightsClarity' ? (AXIS_COLORS.rightsClarity as (v: number) => string)(value) : AXIS_COLORS[key] as string;

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Side-by-side comparison"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(7,4,26,0.82)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px 40px', overflowY: 'auto' }}
    >
      <div style={{ width: '100%', maxWidth: 960, background: 'linear-gradient(180deg,#0e0820,#0D0B1E)', border: '1px solid rgba(123,112,178,0.22)', borderRadius: 24, overflow: 'hidden', boxShadow: '0 40px 80px -20px rgba(0,0,0,0.8)' }}>
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid rgba(123,112,178,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender, marginBottom: 4 }}>Side-by-side comparison</div>
            <div style={{ fontFamily: SERIF, fontSize: 20, color: C.silver }}>
              {cleanTrackTitle(left.track.title)} <span style={{ color: C.lavender, fontStyle: 'italic' }}>vs</span> {cleanTrackTitle(right.track.title)}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(123,112,178,0.12)', border: '1px solid rgba(123,112,178,0.22)', color: C.lavender, cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 18, lineHeight: 1 }}>
            &times;
          </button>
        </div>

        {results.length > 2 && (
          <div style={{ padding: '14px 28px', borderBottom: '1px solid rgba(123,112,178,0.10)', display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
            <select value={leftIdx} onChange={e => setLeftIdx(Number(e.target.value))} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(123,112,178,0.3)', borderRadius: 10, padding: '7px 10px', color: C.silver, fontFamily: SANS, fontSize: 12, cursor: 'pointer' }}>
              {results.map((r, i) => <option key={r.track.id} value={i} disabled={i === rightIdx}>#{i + 1} {cleanTrackTitle(r.track.title)}</option>)}
            </select>
            <span style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.lavender }}>vs</span>
            <select value={rightIdx} onChange={e => setRightIdx(Number(e.target.value))} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(123,112,178,0.3)', borderRadius: 10, padding: '7px 10px', color: C.silver, fontFamily: SANS, fontSize: 12, cursor: 'pointer' }}>
              {results.map((r, i) => <option key={r.track.id} value={i} disabled={i === leftIdx}>#{i + 1} {cleanTrackTitle(r.track.title)}</option>)}
            </select>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr' }}>
          {([left, right] as const).map((result, col) => {
            const isLeader = col === 0 ? leftScore >= rightScore : rightScore > leftScore;
            const vec   = result.confidenceScore.vector;
            const score = result.confidenceScore.score;
            const audioPath = resolveAudioUrl(result.track.audioFilePath);
            return col === 0 ? (
              <CompareHalf key={result.track.id} result={result} score={score} vec={vec} audioPath={audioPath} isLeader={isLeader} lead={lead} axisColor={axisColor} axes={AXES} />
            ) : (
              <>
                <div key="div" style={{ background: 'rgba(123,112,178,0.12)', margin: '24px 0' }} />
                <CompareHalf key={result.track.id} result={result} score={score} vec={vec} audioPath={audioPath} isLeader={isLeader} lead={lead} axisColor={axisColor} axes={AXES} />
              </>
            );
          })}
        </div>

        <div style={{ padding: '20px 28px', borderTop: '1px solid rgba(123,112,178,0.12)', background: 'rgba(0,0,0,0.18)' }}>
          <div style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender, marginBottom: 6 }}>Verdict</div>
          <p style={{ margin: 0, fontSize: 13, color: C.silver, lineHeight: 1.6 }}>
            <strong style={{ color: C.amber }}>{cleanTrackTitle(results[leftScore >= rightScore ? leftIdx : rightIdx].track.title)}</strong>
            {' '}leads by <strong>{Math.abs(lead)}</strong> points.{' '}
            {buildVerdict(
              leftScore >= rightScore ? left : right,
              leftScore >= rightScore ? right : left,
              briefId,
              sceneParams,
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function CompareHalf({
  result, score, vec, audioPath, isLeader, lead, axisColor, axes,
}: {
  result:    AnalysisResult;
  score:     number;
  vec:       { scene: number; rightsClarity: number; lyrics: number; audioSignal: number };
  audioPath: string | null;
  isLeader:  boolean;
  lead:      number;
  axisColor: (key: 'scene' | 'rightsClarity' | 'lyrics' | 'audioSignal', value: number) => string;
  axes:      readonly ('scene' | 'rightsClarity' | 'lyrics' | 'audioSignal')[];
}) {
  const [playing,  setPlaying]  = useState(false);
  const [time,     setTime]     = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime  = () => setTime(audio.currentTime);
    const onMeta  = () => setDuration(audio.duration);
    const onPlay  = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.pause();
    };
  }, [audioPath]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !audioPath) return;
    if (!audio.paused) { audio.pause(); return; }
    if (currentAudio.el && currentAudio.el !== audio) currentAudio.el.pause();
    currentAudio.el = audio;
    void audio.play().catch(() => setPlaying(false));
  };

  const WAVE = [30,55,40,72,50,90,60,35,65,48,78,42,62,38,55,80,45,60,30,70,42,55,36,50,65];
  const playedBars = duration > 0 ? Math.round((time / duration) * WAVE.length) : 0;

  return (
    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {isLeader && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#4CAF82', fontWeight: 700, marginBottom: 6, padding: '3px 8px', background: 'rgba(76,175,130,0.12)', borderRadius: 999, border: '1px solid rgba(76,175,130,0.3)' }}>
              ✓ {lead > 0 ? `+${lead} pts lead` : 'Tied'}
            </div>
          )}
          <div style={{ fontFamily: SERIF, fontSize: 18, color: C.amber, lineHeight: 1.2 }}>{cleanTrackTitle(result.track.title)}</div>
          {result.track.artistName && <div style={{ fontSize: 12, color: C.lavender, marginTop: 3 }}>{result.track.artistName}</div>}
          <div style={{ marginTop: 6, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {result.track.tempo != null && <Chip variant="bpm">{result.track.tempo} BPM</Chip>}
            {result.track.tonalCharacter && <Chip>{result.track.tonalCharacter}</Chip>}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 36, lineHeight: 1, color: score >= 70 ? '#4CAF82' : score >= 55 ? C.amber : C.magenta }}>{score}</div>
          <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.lavender, marginTop: 2 }}>Fit index</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.lavender, marginBottom: 2 }}>SyncScore axes</div>
        {axes.map(key => {
          const value = vec[key];
          const pct   = Math.round(value * 100);
          return (
            <div key={key} style={{ display: 'grid', gridTemplateColumns: '48px 1fr 26px', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.lavender, fontWeight: 700 }}>{key}</span>
              <div style={{ height: 5, background: 'rgba(123,112,178,0.12)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: axisColor(key, value), borderRadius: 999, transition: 'width 0.4s ease' }} />
              </div>
              <span style={{ fontSize: 12, fontFamily: 'monospace', color: C.silver, textAlign: 'right', fontWeight: 700 }}>{pct}</span>
            </div>
          );
        })}
      </div>

      <div style={{ padding: '12px 14px', borderRadius: 12, background: 'linear-gradient(180deg,rgba(219,39,119,0.06),transparent)', border: '1px solid rgba(219,39,119,0.18)' }}>
        <div style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.magenta, fontWeight: 700, marginBottom: 6 }}>✦ Why this track</div>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.65, color: '#E2E8F0' }}>{result.confidenceScore.explanation}</p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 11, background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.hairline}` }}>
        <button type="button" onClick={togglePlay} disabled={!audioPath} aria-label={playing ? 'Pause' : 'Play'} style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', background: audioPath ? `linear-gradient(135deg,${C.purple},${C.magenta})` : 'rgba(123,112,178,0.15)', color: audioPath ? '#fff' : C.lavender, border: 'none', cursor: audioPath ? 'pointer' : 'not-allowed', boxShadow: audioPath ? `0 4px 12px -4px rgba(219,39,119,0.5)` : 'none' }}>
          {playing ? <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><rect x="1.5" y="1" width="2.5" height="8"/><rect x="6" y="1" width="2.5" height="8"/></svg> : <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><path d="M2 1 L8 5 L2 9 Z"/></svg>}
        </button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5, height: 24, overflow: 'hidden' }}>
          {WAVE.map((h, i) => <span key={i} style={{ display: 'block', width: 2, flexShrink: 0, height: `${h}%`, borderRadius: 2, background: i < playedBars ? `linear-gradient(180deg,${C.purple},${C.magenta})` : 'rgba(123,112,178,0.25)' }} />)}
        </div>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: C.lavender, flexShrink: 0 }}>
          {audioPath ? `${formatTime(time)} / ${formatTime(duration || 0)}` : 'No audio'}
        </span>
        {audioPath && <audio ref={audioRef} src={audioPath} preload="metadata" />}
      </div>

      {result.rightsProfile && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {(result.rightsProfile.blockers ?? []).map(code => (
            <Chip key={code} variant="warn">{BLOCKER_LABELS[code] ?? code.replace(/_/g, ' ').toLowerCase()}</Chip>
          ))}
          {(result.rightsProfile.blockers ?? []).length === 0 && <Chip>✓ Rights clear</Chip>}
        </div>
      )}
    </div>
  );
}

// ── ResultsScreen ─────────────────────────────────────────────
type ResultsScreenProps = {
  briefText: string;
  briefId: BriefId;
  sceneParams: SceneParams;
  results: AnalysisResult[];
  sceneArc?: SceneArc | null;
  readOnly?: boolean;
  onBack?: () => void;
};

export function ResultsScreen({ briefText, briefId, sceneParams, results, sceneArc, readOnly, onBack }: ResultsScreenProps) {
  const [toast,                setToast]        = useState<string | null>(null);
  const [compareOpen,          setCompareOpen]  = useState(false);
  const [activeTab,            setActiveTab]    = useState<'shortlist' | 'considered' | 'archive'>('shortlist');
  const [localRightsOverrides, setLocalRightsOverrides] = useState<Record<string, LocalRightsOverride>>({});

  const onExportPdf = () => {
    try { window.print(); } catch (e) { setToast(e instanceof Error ? e.message : 'Print failed.'); }
  };

  const onCopyShareLink = async () => {
    try {
      setToast('Creating share link…');
      const body = {
        briefText, briefId, sceneParams,
        results: results.map(r => {
          const override = localRightsOverrides[r.track.id];
          const rp = override ?? r.rightsProfile;
          return {
            trackId:         r.track.id,
            title:           r.track.title,
            artistName:      r.track.artistName,
            isrc:            override?.isrc ?? r.track.isrc,
            rank:            r.rank,
            tempo:           r.track.tempo,
            tonalCharacter:  r.track.tonalCharacter,
            energyCharacter: r.track.energyCharacter,
            hasAudio:        r.track.audioFilePath !== null,
            confidenceScore: {
              score:       r.confidenceScore.score,
              vector:      r.confidenceScore.vector,
              inputHash:   r.confidenceScore.inputHash,
              explanation: r.confidenceScore.explanation,
            },
            rightsProfile: rp ? {
              isOneStop:         rp.isOneStop ?? null,
              proAffiliation:    rp.proAffiliation ?? null,
              masterOwnedBy:     rp.masterOwnedBy ?? null,
              publisherName:     rp.publisherName ?? null,
              writerName:        rp.writerName ?? null,
              rightsState:       rp.rightsState ?? null,
              enrichmentSources: rp.enrichmentSources ?? [],
              splitPct:          rp.splitPct ?? null,
            } : null,
          };
        }),
      };

      const resp = await fetch(`${API_BASE}/api/share`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(`Server ${resp.status}`);
      const { packetId } = await resp.json() as { packetId: string };
      const url = `${window.location.origin}${window.location.pathname}#share=${packetId}`;
      await navigator.clipboard.writeText(url);
      setToast('Share link copied.');
      window.setTimeout(() => setToast(null), 2400);
    } catch (e) {
      setToast(e instanceof Error ? `Couldn’t copy: ${e.message}` : "Couldn’t copy link.");
    }
  };

  const topScore    = results[0]?.confidenceScore.score ?? 100;
  const lead        = results[0];
  const sideResults = results.slice(1);

  // toolbar stats
  const rightsBlockerCount = results.filter(r => (r.rightsProfile?.blockers?.length ?? 0) > 0).length;
  const needLyricsCount    = results.filter(r => r.confidenceScore.vector.lyrics === 0).length;

  // scene name: use brief label, italicise last word
  const briefLabel = BRIEF_LABELS[briefId] ?? briefId;
  const labelWords = briefLabel.split(' ');
  const sceneNameEl = labelWords.length > 1
    ? <>{labelWords.slice(0, -1).join(' ')} <em style={{ fontStyle: 'italic', color: C.amber }}>{labelWords[labelWords.length - 1]}</em></>
    : briefLabel;

  return (
    <div style={{ minHeight: '100vh', fontFamily: SANS, WebkitFontSmoothing: 'antialiased', color: C.silver, background: BG }}>
      <style>{`
        @keyframes sv-pulse-dot { 0%,100%{opacity:.7;transform:scale(1)} 50%{opacity:1;transform:scale(1.15)} }

        .sv-rs-topbar { position: sticky; top: 0; z-index: 20; background: linear-gradient(180deg,rgba(7,4,26,0.92),rgba(7,4,26,0.6) 70%,transparent); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-bottom: 1px solid rgba(123,112,178,0.16); }
        .sv-rs-topbar-inner { max-width: 1280px; margin: 0 auto; padding: 16px 28px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .sv-rs-shell { max-width: 1280px; margin: 0 auto; padding: 28px 28px 80px; }

        /* stepper */
        .sv-rs-stepper { display: none; align-items: center; gap: 10px; font-family: "Manrope",sans-serif; }
        .sv-rs-step { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(167,139,250,0.6); }
        .sv-rs-step-num { width: 22px; height: 22px; border-radius: 50%; border: 1px solid rgba(123,112,178,0.30); display: grid; place-items: center; font-family: "JetBrains Mono",monospace; font-size: 10px; font-weight: 600; color: rgba(167,139,250,0.7); }
        .sv-rs-step-done .sv-rs-step-num { background: rgba(124,58,237,0.18); border-color: rgba(167,139,250,0.35); color: #F4F2FA; }
        .sv-rs-tick { width: 18px; height: 1px; background: rgba(123,112,178,0.30); flex-shrink: 0; display: block; }
        .sv-rs-step-badge { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: #9B93C4; padding: 4px 10px; border-radius: 999px; background: rgba(167,139,250,0.08); border: 1px solid rgba(123,112,178,0.16); white-space: nowrap; font-family: "Manrope",sans-serif; }
        .sv-rs-step-badge b { color: #F4F2FA; font-weight: 700; }
        @media (min-width: 880px) { .sv-rs-stepper { display: inline-flex; } .sv-rs-step-badge { display: none; } }

        /* results stage grid */
        .sv-results-stage { display: grid; grid-template-columns: 1fr; gap: 24px; }
        @media (min-width: 1000px) {
          .sv-results-stage { grid-template-columns: minmax(0,1.35fr) minmax(0,1fr); gap: 32px; align-items: start; }
        }

        /* side list */
        .sv-side-list { display: flex; flex-direction: column; gap: 12px; }
        @media (min-width: 1000px) { .sv-side-list { position: sticky; top: 72px; } }

        /* toolbar spans full width */
        .sv-toolbar { grid-column: 1 / -1; }

        /* lead card gradient border */
        .sv-lead-card::before { content: ""; position: absolute; inset: -1px; border-radius: 22px; padding: 1.5px; background: linear-gradient(180deg, rgba(245,166,35,0.55), rgba(221,122,58,0.45) 40%, transparent 80%); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; }

        /* axis row hover */
        .sv-axis-row { cursor: pointer; transition: background .15s ease; }
        .sv-axis-row:hover { background: rgba(167,139,250,0.04); }

        /* mini card hover */
        .sv-mini-card::before { content: ""; position: absolute; inset: 0; border-radius: 14px; padding: 1.5px; background: linear-gradient(135deg, #F5A623, #DB2777); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; opacity: 0; transition: opacity .18s ease; pointer-events: none; }
        .sv-mini-card:hover { transform: translateX(-2px); background: rgba(20,11,44,0.7) !important; box-shadow: 0 14px 30px -18px rgba(219,39,119,0.5); border-color: transparent !important; }
        .sv-mini-card:hover::before { opacity: 1; }

        /* rights body responsive */
        .sv-rights-body { display: grid; grid-template-columns: minmax(0,1.5fr) minmax(0,1fr); }
        @media (max-width: 600px) { .sv-rights-body { grid-template-columns: 1fr; } }
        .sv-rights-pipeline { border-left: 1px solid rgba(123,112,178,0.16); padding: 14px 16px; display: flex; flex-direction: column; gap: 7px; background: rgba(255,255,255,0.012); }
        @media (max-width: 600px) { .sv-rights-pipeline { border-left: 0; border-top: 1px solid rgba(123,112,178,0.16); } }

        @media (max-width: 480px) {
          .sv-rs-shell { padding: 16px 16px 60px; }
          .sv-rs-topbar-inner { padding: 10px 16px; }
          .sv-lead-card { padding: 20px !important; }
        }

        /* ── print report ── */
        .sv-print-report { display: none; }
        @media print {
          @page { size: A4; margin: 14mm 15mm; }
          html, body { background: #fff !important; color: #16121f !important; }
          .sv-rs-topbar, main.sv-rs-shell, .sv-rs-shell { display: none !important; }
          .sv-print-report { display: block !important; color: #16121f; font-family: "Manrope",system-ui,sans-serif; }
          .sv-print-report * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

          .pr-head { display: flex; align-items: center; justify-content: space-between; }
          .pr-mark { height: 22px; }
          .pr-mark img { height: 100%; filter: invert(1) brightness(0.2) saturate(1.1); }
          .pr-stamp { font-family: "JetBrains Mono",monospace; font-size: 10px; letter-spacing: 0.08em; color: #6b6490; }
          .pr-rule { height: 1px; background: #d8d3e0; margin: 10px 0 16px; }
          .pr-brief .pr-scene-type { font-size: 28px; font-weight: 800; letter-spacing: -0.01em; line-height: 1.02; }
          .pr-brief .pr-scene-desc { font-family: "Instrument Serif",serif; font-style: italic; font-size: 14px; color: #4a4458; margin-top: 6px; max-width: 64ch; }
          .pr-brief .pr-moods { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
          .pr-brief .pr-moods span { font-size: 9.5px; letter-spacing: 0.04em; text-transform: uppercase; padding: 3px 8px; border: 1px solid #cfc8db; border-radius: 999px; color: #5a5470; white-space: nowrap; }
          .pr-brief .pr-custom { font-family: "Instrument Serif",serif; font-style: italic; font-size: 13px; color: #2a2536; margin-top: 10px; }
          .pr-brief .pr-count { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: #8a83a8; margin-top: 12px; }

          .pr-track { page-break-inside: avoid; break-inside: avoid; border: 1px solid #ddd8e6; border-radius: 10px; padding: 16px 18px; margin-top: 14px; }
          .pr-th { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
          .pr-th .pr-tname { font-size: 21px; font-weight: 800; letter-spacing: -0.01em; }
          .pr-th .pr-tsub { font-size: 11px; color: #6b6490; margin-top: 3px; line-height: 1.35; }
          .pr-th .pr-rk { font-family: "Instrument Serif",serif; font-style: italic; font-size: 40px; color: #c9c3d6; line-height: 0.8; }
          .pr-fit-note { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #9a7b16; font-weight: 700; margin-top: 8px; }

          .pr-assess { border-left: 2px solid #16121f; padding-left: 12px; margin-top: 14px; }
          .pr-assess .pr-al { font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: #16121f; font-weight: 700; }
          .pr-assess .pr-al em { font-style: normal; color: #8a83a8; font-weight: 500; margin-left: 8px; letter-spacing: 0.06em; }
          .pr-assess p { margin: 6px 0 0; font-size: 12.5px; line-height: 1.5; color: #2a2536; }

          .pr-score { display: grid; grid-template-columns: 1fr auto; gap: 14px; align-items: start; margin-top: 14px; }
          .pr-axes { display: flex; flex-direction: column; gap: 7px; }
          .pr-axis { display: grid; grid-template-columns: 70px 1fr 30px; gap: 10px; align-items: center; }
          .pr-axis .pr-an { font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: #5a5470; font-weight: 700; }
          .pr-axis .pr-at { height: 8px; background: #ece8f1; border-radius: 4px; overflow: hidden; }
          .pr-axis .pr-at > i { display: block; height: 100%; border-radius: 4px; }
          .pr-axis .pr-av { font-family: "JetBrains Mono",monospace; font-size: 11px; text-align: right; color: #2a2536; }
          .pr-axiscap { font-size: 8.5px; letter-spacing: 0.08em; text-transform: uppercase; color: #9a93ac; margin-top: 8px; }
          .pr-fitbig { text-align: right; }
          .pr-fitbig .n { font-family: "JetBrains Mono",monospace; font-size: 40px; font-weight: 600; line-height: 0.9; }
          .pr-fitbig .d { font-size: 13px; color: #8a83a8; }
          .pr-fitbig .l { font-size: 8.5px; letter-spacing: 0.12em; text-transform: uppercase; color: #8a83a8; margin-top: 4px; }

          .pr-rights { display: grid; grid-template-columns: 1.5fr 1fr; gap: 18px; margin-top: 14px; padding-top: 14px; border-top: 1px solid #e5e0ee; }
          .pr-rtitle { grid-column: 1 / -1; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: #16121f; font-weight: 700; margin-bottom: 2px; }
          .pr-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 9px 16px; }
          .pr-f .k { font-size: 8px; letter-spacing: 0.1em; text-transform: uppercase; color: #8a83a8; font-weight: 700; }
          .pr-f .v { font-family: "JetBrains Mono",monospace; font-size: 11px; color: #16121f; margin-top: 1px; }
          .pr-f .v.none { font-family: "Instrument Serif",serif; font-style: italic; font-size: 12px; color: #b2acc2; }
          .pr-pipe { border-left: 1px solid #e5e0ee; padding-left: 16px; }
          .pr-pipe .pr-conf { display: flex; align-items: baseline; justify-content: space-between; }
          .pr-pipe .pr-conf .l { font-size: 8px; letter-spacing: 0.1em; text-transform: uppercase; color: #8a83a8; font-weight: 700; }
          .pr-pipe .pr-conf .n { font-size: 22px; font-weight: 800; }
          .pr-pipe .pr-stage { display: flex; align-items: center; gap: 8px; font-size: 10.5px; color: #2a2536; margin-top: 6px; }
          .pr-pipe .pr-stage .g { width: 13px; text-align: center; font-weight: 800; }
          .pr-pipe .pr-stage.ok .g { color: #2f8f63; }
          .pr-pipe .pr-stage.no .g { color: #b2acc2; }
          .pr-pipe .pr-stage.no { color: #8a83a8; }
          .pr-foot { text-align: center; margin-top: 26px; padding-top: 16px; border-top: 1px solid #d8d3e0; }
          .pr-foot .pr-mark img { height: 20px; filter: invert(1) brightness(0.2); }
          .pr-foot .t { font-family: "Instrument Serif",serif; font-style: italic; font-size: 13px; color: #4a4458; margin-top: 6px; }
        }
      `}</style>

      {/* ── topbar ── */}
      <header className="sv-rs-topbar">
        <div className="sv-rs-topbar-inner">
          {/* brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: SERIF }}>
            <SvLogo onClick={!readOnly && onBack ? onBack : undefined} />
            <span style={{ width: 1, height: 18, background: C.hairlineStrong, flexShrink: 0 }} />
            <span style={{ fontStyle: 'italic', fontSize: 15, color: C.lavender, letterSpacing: '0.005em' }}>
              {readOnly ? 'read-only' : 'shortlist'}
            </span>
          </div>

          {/* stepper — desktop only */}
          <nav className="sv-rs-stepper no-print" aria-label="Progress">
            {(['Brief', 'Ingest', 'Match'] as const).map((label, i) => (
              <span key={label} style={{ display: 'contents' }}>
                {i > 0 && <span className="sv-rs-tick" />}
                <span className="sv-rs-step sv-rs-step-done">
                  <span className="sv-rs-step-num">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12 L10 17 L20 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                  {label}
                </span>
              </span>
            ))}
          </nav>

          {/* right cluster: step-badge (mobile) + compare */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} className="no-print">
            <span className="sv-rs-step-badge">Match &middot; <b>complete</b></span>
            {results.length >= 2 && (
              <button type="button" onClick={() => setCompareOpen(true)} style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.silver, padding: '6px 14px', minHeight: 32, borderRadius: 999, background: `linear-gradient(135deg,rgba(245,166,35,0.28),rgba(219,39,119,0.22))`, border: `1px solid rgba(245,166,35,0.4)`, cursor: 'pointer', fontFamily: SANS, fontWeight: 700 }}>
                Compare &hArr;
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="sv-rs-shell">

        {/* ── scene bar ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, paddingBottom: 14, marginBottom: 18, borderBottom: `1px solid ${C.hairline}`, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.amber, marginBottom: 4 }}>
              Shortlist
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 'clamp(22px,2.6vw,32px)', lineHeight: 1.05, letterSpacing: '-0.015em', color: C.silver }}>
              {sceneNameEl}
            </div>
          </div>
          <div className="no-print" style={{ display: 'inline-flex', gap: 2, padding: 4, borderRadius: 12, background: 'rgba(15,8,35,0.6)', border: `1px solid ${C.hairline}`, fontFamily: SANS }}>
            {(['shortlist', 'considered', 'archive'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                style={{ padding: '8px 14px', borderRadius: 8, background: activeTab === tab ? 'rgba(245,166,35,0.12)' : 'transparent', border: 0, fontSize: 12, fontWeight: 600, color: activeTab === tab ? C.silver : 'rgba(245,166,35,0.82)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: activeTab === tab ? 'inset 0 0 0 1px rgba(245,166,35,0.24)' : 'none', transition: 'color .15s ease, background .15s ease' }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {tab === 'shortlist' && (
                  <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 10, fontWeight: 500, color: activeTab === tab ? C.amber : 'rgba(245,166,35,0.62)', padding: '1px 5px', borderRadius: 4, background: activeTab === tab ? 'rgba(245,166,35,0.18)' : 'rgba(245,166,35,0.10)' }}>{results.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── results ── */}
        {results.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <p style={{ color: C.silver, fontSize: 14, marginBottom: 8, fontFamily: SERIF, fontStyle: 'italic' }}>No matches found for this scene.</p>
            <p style={{ color: C.lavender, fontSize: 12, opacity: 0.7 }}>Try rewriting your scene description, or upload different tracks.</p>
          </div>
        ) : activeTab !== 'shortlist' ? (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <p style={{ color: C.lavender, fontSize: 14, fontFamily: SERIF, fontStyle: 'italic' }}>
              {activeTab === 'considered' ? 'No tracks in Considered yet.' : 'Archive is empty.'}
            </p>
          </div>
        ) : (
          <section className="sv-results-stage">

            {/* lead card */}
            {lead && (
              <LeadCard
                result={lead}
                allResults={results}
                briefId={briefId}
                sceneArc={sceneArc}
                onRightsSaved={(id, ov) => setLocalRightsOverrides(m => ({ ...m, [id]: ov }))}
                onShare={() => void onCopyShareLink()}
                onMoveToConsidered={() => setActiveTab('considered')}
              />
            )}

            {/* side list */}
            <aside className="sv-side-list">
              {sideResults.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '4px 4px 8px' }}>
                    <span style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.amber }}>Also in shortlist &middot; {sideResults.length}</span>
                    {results.length >= 2 && (
                      <span onClick={() => setCompareOpen(true)} style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 13, color: 'rgba(167,139,250,0.6)', cursor: 'pointer' }}>compare &darr;</span>
                    )}
                  </div>
                  {sideResults.map((r, i) => (
                    <MiniCard key={r.track.id} result={r} topScore={topScore} dimmed={i > 2} />
                  ))}
                </>
              )}

              {sideResults.length === 0 && (
                <div style={{ padding: '24px 16px', textAlign: 'center', fontFamily: SERIF, fontStyle: 'italic', fontSize: 14, color: 'rgba(155,147,196,0.5)' }}>
                  Only one track in shortlist.
                </div>
              )}
            </aside>

            {/* toolbar */}
            <div className="sv-toolbar no-print" style={{ padding: '14px 18px', borderRadius: 14, background: 'rgba(15,8,35,0.7)', border: `1px solid ${C.hairline}`, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.amber }}>
                <b style={{ color: C.silver, fontWeight: 700, fontFamily: SANS, fontSize: 13, letterSpacing: '-0.01em', marginRight: 3 }}>{results.length}</b>
                shortlisted
              </span>
              {rightsBlockerCount > 0 && (
                <span style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.amber }}>
                  <b style={{ color: C.silver, fontWeight: 700, fontFamily: SANS, fontSize: 13, letterSpacing: '-0.01em', marginRight: 3 }}>{rightsBlockerCount}</b>
                  rights blocker{rightsBlockerCount > 1 ? 's' : ''}
                </span>
              )}
              {needLyricsCount > 0 && (
                <span style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.amber }}>
                  <b style={{ color: C.silver, fontWeight: 700, fontFamily: SANS, fontSize: 13, letterSpacing: '-0.01em', marginRight: 3 }}>{needLyricsCount}</b>
                  need lyrics
                </span>
              )}
              <div style={{ flex: 1 }} />
              <button type="button" onClick={onExportPdf} style={{ padding: '10px 16px', borderRadius: 10, background: 'transparent', border: `1px solid ${C.hairlineStrong}`, color: C.silver, fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M6 3 H18 V21 L12 16 L6 21 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>
                Export PDF
              </button>
              <button type="button" onClick={() => void onCopyShareLink()} style={{ padding: '10px 18px', fontSize: 12, borderRadius: 10, border: 0, background: `linear-gradient(135deg,${C.purple},${C.magenta})`, color: '#fff', fontWeight: 700, letterSpacing: '0.02em', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                Share with director
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>

          </section>
        )}

        {/* ── print report (hidden on screen, shown on print) ── */}
        <div className="sv-print-report" aria-hidden="true">
          <div className="pr-head">
            <span className="pr-mark"><img src="/logo.png" alt="SyncVision" /></span>
            <span className="pr-stamp">SYNC REPORT &middot; {briefLabel.toUpperCase()}</span>
          </div>
          <div className="pr-rule" />
          <div className="pr-brief">
            <div className="pr-scene-type">{briefLabel.toUpperCase()}</div>
            <div className="pr-scene-desc">{briefText}</div>
            <div className="pr-count">Shortlist &mdash; {results.length} track{results.length !== 1 ? 's' : ''} ranked</div>
          </div>
          <div className="pr-rule" />
          {results.map((r, idx) => {
            const rp = localRightsOverrides[r.track.id] ?? r.rightsProfile;
            const vec = r.confidenceScore.vector;
            const WEIGHTS = { scene: 0.45, lyrics: 0.25, audioSignal: 0.20, rightsClarity: 0.10 };
            const liveScore = Math.round(
              (vec.scene * WEIGHTS.scene + vec.lyrics * WEIGHTS.lyrics +
               vec.audioSignal * WEIGHTS.audioSignal + vec.rightsClarity * WEIGHTS.rightsClarity) * 100
            );
            const hasWriter    = Boolean(rp?.writerName);
            const hasPublisher = Boolean(rp?.publisherName);
            const hasOneStop   = rp?.isOneStop === true;
            const syncCleared  = rp?.syncLicenseStatus === 'CLEARED';
            const lyricCleared = rp?.lyricLicenseStatus === 'CLEARED';
            const hasAnyIntake = hasWriter || hasPublisher || Boolean(rp?.proAffiliation);
            const prStages = [
              { label: 'Metadata intake',          done: hasAnyIntake },
              { label: 'Publisher data captured',  done: hasPublisher },
              { label: 'Writer / splits captured', done: hasWriter },
              { label: 'One-stop confirmed',        done: hasOneStop },
              { label: 'Sync license cleared',     done: syncCleared },
              { label: 'Lyric license cleared',    done: lyricCleared },
              { label: 'Fingerprint identity resolution', done: false },
              { label: 'PRO cross-check',          done: false },
            ];
            const confPct = Math.round((prStages.filter(s => s.done).length / prStages.length) * 100);
            const fmtLicense = (s: string | null | undefined) =>
              s === 'CLEARED' ? 'Cleared' : s === 'PENDING' ? 'Pending' : s === 'NOT_CLEARED' ? 'Not cleared' : null;
            const PR_AXES = [
              { label: 'Scene', value: vec.scene, color: '#16121f' },
              { label: 'Rights', value: vec.rightsClarity, color: '#9a7b16' },
              { label: 'Lyrics', value: vec.lyrics, color: '#16121f' },
              { label: 'Signal', value: vec.audioSignal, color: '#16121f' },
            ];
            return (
              <article key={r.track.id} className="pr-track">
                <div className="pr-th">
                  <div>
                    <div className="pr-tname">{cleanTrackTitle(r.track.title)}</div>
                    <div className="pr-tsub">
                      {r.track.artistName && `by ${r.track.artistName} · `}
                      {r.track.tempo != null && `${r.track.tempo} BPM`}
                      {r.track.tonalCharacter && ` · ${r.track.tonalCharacter}`}
                    </div>
                    <div className="pr-fit-note">
                      {idx === 0 ? 'Best fit in shortlist' : `−${(results[0].confidenceScore.score - r.confidenceScore.score)} pts separation`}
                    </div>
                  </div>
                  <div className="pr-rk">#{r.rank}</div>
                </div>
                <div className="pr-assess">
                  <div className="pr-al">Sync Assessment <em>deterministic · audit-stable</em></div>
                  <p>{r.confidenceScore.explanation}</p>
                </div>
                <div className="pr-score">
                  <div>
                    <div className="pr-axes">
                      {PR_AXES.map(ax => (
                        <div key={ax.label} className="pr-axis">
                          <span className="pr-an">{ax.label}</span>
                          <span className="pr-at"><i style={{ width: `${Math.round(ax.value * 100)}%`, background: ax.color }} /></span>
                          <span className="pr-av">{ax.value === 0 && ax.label === 'Lyrics' ? '—' : Math.round(ax.value * 100)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="pr-axiscap">Bar width = weight · bar fill = axis value</div>
                  </div>
                  <div className="pr-fitbig">
                    <div className="n">{liveScore}<span className="d">/100</span></div>
                    <div className="l">Fit Index</div>
                  </div>
                </div>
                <div className="pr-rights">
                  <div className="pr-rtitle">Rights &amp; clearance</div>
                  <div className="pr-fields">
                    {[
                      { k: 'ISRC', v: rp?.isrc },
                      { k: 'Work ID · ISWC', v: rp?.workId },
                      { k: 'Writer name', v: rp?.writerName },
                      { k: 'Writer split %', v: rp?.splitPct != null ? `${rp.splitPct}%` : null },
                      { k: 'Writer IPI', v: rp?.writerIpi },
                      { k: 'Publisher', v: rp?.publisherName },
                      { k: 'PRO affiliation', v: rp?.proAffiliation },
                      { k: 'One-stop license', v: rp?.isOneStop === true ? 'Yes' : rp?.isOneStop === false ? 'No' : null },
                      { k: 'Sync license status', v: fmtLicense(rp?.syncLicenseStatus) },
                      { k: 'Sync licensed by', v: rp?.syncLicensedBy },
                      { k: 'Lyric license status', v: fmtLicense(rp?.lyricLicenseStatus) },
                      { k: 'Lyric licensed by', v: rp?.lyricLicensedBy },
                    ].map(f => (
                      <div key={f.k} className="pr-f">
                        <div className="k">{f.k}</div>
                        <div className={`v${f.v ? '' : ' none'}`}>{f.v ?? '— not entered —'}</div>
                      </div>
                    ))}
                  </div>
                  <div className="pr-pipe">
                    <div className="pr-conf">
                      <span className="l">Rights confidence</span>
                      <span className="n">{confPct}%</span>
                    </div>
                    {prStages.map(s => (
                      <div key={s.label} className={`pr-stage ${s.done ? 'ok' : 'no'}`}>
                        <span className="g">{s.done ? '✓' : '×'}</span>
                        {s.label}
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
          <div className="pr-foot">
            <div className="pr-mark"><img src="/logo.png" alt="SyncVision" /></div>
            <div className="t">Surfaces what you need to decide, faster — does not decide for you.</div>
          </div>
        </div>

      </main>

      {toast && (
        <div role="status" style={{ position: 'fixed', bottom: 24, right: 24, background: '#170B33', border: `1px solid ${C.hairline}`, borderRadius: 10, padding: '8px 16px', color: C.silver, fontSize: 12 }}>
          {toast}
        </div>
      )}

      <CompareModal results={results} open={compareOpen} onClose={() => setCompareOpen(false)} briefId={briefId} sceneParams={sceneParams} />
    </div>
  );
}
