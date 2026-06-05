import { useEffect, useRef, useState } from 'react';
import { API_BASE, type AnalysisResult, type SceneParams } from '../utils/apiClient';
import { rightsDisplayFor } from '../utils/rightsStatus';
import { BRIEF_LABELS, type BriefId } from '../engine/classifyBrief';

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
  // strip leading UUID-style prefix (e.g. "a1b2c3d4_")
  t = t.replace(/^[0-9a-f]{6,}_/i, '');
  // replace underscores with spaces
  t = t.replace(/_/g, ' ');
  // strip common file-noise suffixes
  t = t.replace(/\.(mp3|wav|flac|aiff?)$/i, '');
  t = t.replace(/\b(Official\s+Video|Official\s+Audio|Lyric\s+Video|HD|HQ|4K|Audio|Video|background\s+vocals?\s*\d*)\b/gi, '');
  // strip trailing numbers/noise left by watermarking tools
  t = t.replace(/\s+\d{1,3}\s*$/, '');
  // collapse multiple spaces
  t = t.replace(/\s{2,}/g, ' ').trim();
  // strip "Artist - " prefix
  if (t.includes(' - ')) t = t.slice(t.indexOf(' - ') + 3).trim();
  return t || raw;
}

// ── Scene fit sentence (brief-aware, score-tiered) ────────────
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

function sceneFitSentence(briefId: string, sceneFitScore: number): string {
  const desc = BRIEF_EMOTIONAL_DESC[briefId];
  if (!desc) return sceneFitScore >= 70 ? 'Strong alignment with the brief target zone.' : sceneFitScore >= 50 ? 'Partial alignment with the brief target zone.' : 'Emotional profile falls outside the brief target zone.';
  if (sceneFitScore >= 70) return desc.hi;
  if (sceneFitScore >= 50) return desc.mid;
  return desc.lo;
}

function clearanceSentence(clearanceScore: number): string {
  if (clearanceScore >= 80) return 'One-stop or indie-owned — fastest clearance path available.';
  if (clearanceScore >= 60) return 'Known publisher and writer on file — standard negotiation expected.';
  if (clearanceScore >= 40) return 'Major label involvement — multi-party negotiation likely required.';
  return 'Rights picture incomplete — clearance timeline is uncertain without additional data.';
}

// ── sub-components ─────────────────────────────────────────────
function SvLogo({ onClick }: { onClick?: () => void }) {
  return (
    <span onClick={onClick} style={{ cursor: onClick ? 'pointer' : undefined, display: 'inline-flex' }}>
      <img src="/logo.png" alt="SyncVision" style={{ height: 28, width: 'auto', display: 'block' }} />
    </span>
  );
}

function Chip({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'bpm' | 'warn' | 'genre' }) {
  const s: React.CSSProperties =
    variant === 'bpm'   ? { background: C.bpmBg, border: `1px solid ${C.bpmBorder}`, color: C.silver } :
    variant === 'warn'  ? { background: C.amberSoft, border: `1px solid ${C.amberBorder}`, color: C.amber } :
    variant === 'genre' ? { background: 'transparent', border: `1px solid ${C.hairlineStrong}`, color: C.silver } :
                          { background: C.chipBg, border: `1px solid ${C.hairline}`, color: C.lavender };
  return (
    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', padding: '4px 8px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', ...s }}>
      {children}
    </span>
  );
}

// ── RightsPipelineView ─────────────────────────────────────────
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
  sources: {
    isrc: string | null;
    writer: string | null;
    publisher: string | null;
    pro: string | null;
  };
  lyricsLinkage: {
    hasLyrics: boolean;
    explicit: boolean;
    url: string | null;
    isrc: string | null;
    source: string;
  } | null;
}

interface FingerprintResult {
  acoustidId: string | null;
  score: number;
  matchQuality: 'HIGH' | 'MEDIUM' | 'LOW' | 'NO_MATCH';
  topRecording: { id: string; title: string | null; artist: string | null } | null;
  discrepancies: { field: string; submitted: string | null; external: string | null }[];
  reconciliationNote: string;
  autoFill: AutoFill;
}

function RightsPipelineView({
  rp, trackId, onOpenIntake,
}: {
  rp: AnalysisResult['rightsProfile'];
  trackId: string;
  onOpenIntake: (autoFill?: AutoFill) => void;
}) {
  const [fingerprinting, setFingerprinting] = useState(false);
  const [fpResult, setFpResult]             = useState<FingerprintResult | null>(null);
  const [fpError, setFpError]               = useState<string | null>(null);

  const hasWriter    = Boolean(rp?.writerName);
  const hasPublisher = Boolean(rp?.publisherName);
  const hasPro       = Boolean(rp?.proAffiliation || rp?.writerName);
  const hasOneStop   = rp?.isOneStop === true;
  const syncCleared  = (rp as Record<string, unknown> | null)?.syncLicenseStatus === 'CLEARED';
  const lyricCleared = (rp as Record<string, unknown> | null)?.lyricLicenseStatus === 'CLEARED';
  const hasAnyIntake = hasWriter || hasPublisher || hasPro;

  const matchQ = fpResult?.matchQuality;

  const stages: { label: string; done: boolean; warn?: boolean }[] = [
    { label: 'Metadata intake',          done: hasAnyIntake },
    { label: 'Writer / splits captured', done: hasWriter },
    { label: 'Publisher data captured',  done: hasPublisher },
    { label: 'One-stop confirmed',        done: hasOneStop },
    { label: 'Sync license cleared',     done: syncCleared },
    { label: 'Lyric license cleared',    done: lyricCleared },
    {
      label: fpResult
        ? matchQ === 'HIGH'   ? 'Identity verified (AcoustID ✓)'
        : matchQ === 'MEDIUM' ? 'Identity probable — review recommended'
        : matchQ === 'LOW'    ? 'Low-confidence match — manual review'
        :                       'No external match found'
        : 'Fingerprint identity resolution',
      done: matchQ === 'HIGH' || matchQ === 'MEDIUM',
      warn: matchQ === 'LOW' || matchQ === 'NO_MATCH',
    },
    { label: 'PRO cross-check',          done: false },
  ];

  const completedCount = stages.filter(s => s.done).length;
  const confidencePct  = Math.round((completedCount / stages.length) * 100);

  const runFingerprint = async () => {
    setFingerprinting(true);
    setFpError(null);
    try {
      const res = await fetch(`${API_BASE}/api/tracks/${trackId}/fingerprint`, { method: 'POST' });
      const data = await res.json() as FingerprintResult & { error?: string; message?: string };
      if (!res.ok) throw new Error(data.message ?? data.error ?? `Server ${res.status}`);
      setFpResult(data);
      const af = data.autoFill;
      // Only open the intake form when external enrichment found something new.
      // "submitted" means the ISRC came from the track itself — not new info.
      const hasExternalData =
        (af.writerName    && af.sources?.writer)    ||
        (af.publisherName && af.sources?.publisher) ||
        (af.isrc && af.sources?.isrc && af.sources.isrc !== "submitted");
      if (af && hasExternalData) {
        onOpenIntake(af);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Fingerprint failed';
      console.error('[fingerprint] request failed:', e);
      setFpError(msg);
    } finally {
      setFingerprinting(false);
    }
  };

  return (
    <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 11, background: 'rgba(0,0,0,0.22)', border: `1px solid ${C.hairline}` }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.26em', textTransform: 'uppercase', color: C.lavender, fontWeight: 700 }}>Rights intake &amp; verification</div>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.lavender, marginTop: 3, opacity: 0.7 }}>pipeline</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 20, lineHeight: 1, color: confidencePct >= 70 ? '#34D399' : confidencePct >= 40 ? C.amber : C.magenta }}>
            {confidencePct}%
          </div>
          <div style={{ fontSize: 9, color: C.lavender, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>Rights confidence</div>
        </div>
      </div>

      {/* stages */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {stages.map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 800,
              background: s.done ? 'rgba(52,211,153,0.18)' : s.warn ? 'rgba(219,39,119,0.15)' : 'rgba(123,112,178,0.10)',
              color: s.done ? '#34D399' : s.warn ? C.magenta : 'rgba(123,112,178,0.5)',
              border: `1px solid ${s.done ? 'rgba(52,211,153,0.4)' : s.warn ? 'rgba(219,39,119,0.3)' : C.hairline}`,
            }}>
              {s.done ? '✓' : s.warn ? '!' : '⧗'}
            </span>
            <span style={{ fontSize: 11, color: s.done ? C.silver : s.warn ? C.magenta : 'rgba(226,232,240,0.45)', letterSpacing: '0.01em' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* fingerprint result detail */}
      {fpResult && fpResult.discrepancies.length > 0 && (
        <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(219,39,119,0.08)', border: '1px solid rgba(219,39,119,0.2)' }}>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.magenta, fontWeight: 700, marginBottom: 6 }}>Discrepancy detected</div>
          {fpResult.discrepancies.map(d => (
            <div key={d.field} style={{ fontSize: 11, color: C.silver, marginBottom: 4 }}>
              <span style={{ color: C.lavender, textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.12em' }}>{d.field}: </span>
              <span style={{ color: C.amber }}>"{d.submitted}"</span>
              <span style={{ color: 'rgba(226,232,240,0.45)', margin: '0 6px' }}>→</span>
              <span style={{ color: C.magenta }}>external: "{d.external}"</span>
            </div>
          ))}
          <div style={{ fontSize: 10, color: 'rgba(226,232,240,0.55)', marginTop: 4, fontStyle: 'italic' }}>Review recommended before placement</div>
        </div>
      )}
      {fpResult && fpResult.discrepancies.length === 0 && fpResult.matchQuality !== 'NO_MATCH' && (
        <div style={{ marginTop: 8, fontSize: 10, color: '#34D399', fontStyle: 'italic' }}>{fpResult.reconciliationNote}</div>
      )}

      {/* autoFill resolved fields summary */}
      {fpResult?.autoFill && (
        <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)' }}>
          {/* Source attribution header */}
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#34D399', fontWeight: 700, marginBottom: 8 }}>
            {fpResult.autoFill.enrichmentSources && fpResult.autoFill.enrichmentSources.length > 0
              ? `✓ auto-filled from ${fpResult.autoFill.enrichmentSources.join(' + ')}`
              : 'No external data found'}
          </div>

          {/* Auto-fillable field checklist */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.lavender, marginBottom: 2, opacity: 0.7 }}>Auto-fillable</div>
            <div style={{ fontSize: 11, color: fpResult.autoFill.isrc ? '#34D399' : C.amber }}>
              {fpResult.autoFill.isrc ? '✅ ISRC' : '⚠️ ISRC — enter manually'}
            </div>
            <div style={{ fontSize: 11, color: fpResult.autoFill.writerName ? '#34D399' : C.amber }}>
              {fpResult.autoFill.writerName ? '✅ Writer' : '⚠️ Writer — enter manually'}
            </div>
            <div style={{ fontSize: 11, color: fpResult.autoFill.publisherName ? '#34D399' : C.amber }}>
              {fpResult.autoFill.publisherName ? '✅ Publisher' : '⚠️ Publisher — enter manually'}
            </div>
            <div style={{ fontSize: 11, color: fpResult.autoFill.proAffiliation ? '#34D399' : C.amber }}>
              {fpResult.autoFill.proAffiliation ? `✅ PRO Affiliation — ${fpResult.autoFill.proAffiliation}` : '⚠️ PRO Affiliation — enter manually'}
            </div>
            <div style={{ fontSize: 11, color: fpResult.autoFill.workId ? '#34D399' : C.amber }}>
              {fpResult.autoFill.workId ? `✅ Work ID — ${fpResult.autoFill.workId}` : '⚠️ Work ID — enter manually'}
            </div>
            <div style={{ fontSize: 11, color: fpResult.autoFill.territory ? '#34D399' : C.amber }}>
              {fpResult.autoFill.territory ? `✅ Territory — ${fpResult.autoFill.territory}` : '⚠️ Territory — unknown'}
            </div>
          </div>

          {/* Permanent manual-entry fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.lavender, marginBottom: 2, opacity: 0.7 }}>Always manual</div>
            <div style={{ fontSize: 11, color: C.amber }}>⚠️ One-stop license — self-reported</div>
            <div style={{ fontSize: 11, color: C.amber }}>⚠️ Master ownership % — self-reported</div>
            <div style={{ fontSize: 11, color: C.amber }}>⚠️ Sync license status — negotiated privately</div>
            <div style={{ fontSize: 11, color: C.amber }}>⚠️ Lyric license status — negotiated privately</div>
          </div>

          {/* Resolved field values detail */}
          {(fpResult.autoFill.writerName || fpResult.autoFill.publisherName || fpResult.autoFill.isrc || fpResult.autoFill.lyricsLinkage) && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {fpResult.autoFill.writerName && (
                <div style={{ fontSize: 11, color: C.silver }}>
                  <span style={{ color: C.lavender, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Writer: </span>
                  {fpResult.autoFill.writerName}
                  {fpResult.autoFill.sources.writer && (
                    <span style={{ color: 'rgba(123,112,178,0.5)', fontSize: 9, marginLeft: 6 }}>via {fpResult.autoFill.sources.writer}</span>
                  )}
                </div>
              )}
              {fpResult.autoFill.publisherName && (
                <div style={{ fontSize: 11, color: C.silver }}>
                  <span style={{ color: C.lavender, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Publisher: </span>
                  {fpResult.autoFill.publisherName}
                  {fpResult.autoFill.sources.publisher && (
                    <span style={{ color: 'rgba(123,112,178,0.5)', fontSize: 9, marginLeft: 6 }}>via {fpResult.autoFill.sources.publisher}</span>
                  )}
                </div>
              )}
              {fpResult.autoFill.isrc && (
                <div style={{ fontSize: 11, color: C.silver }}>
                  <span style={{ color: C.lavender, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' }}>ISRC: </span>
                  {fpResult.autoFill.isrc}
                </div>
              )}
              {fpResult.autoFill.lyricsLinkage && (
                <div style={{ fontSize: 11, color: C.silver, marginTop: 2 }}>
                  <span style={{ color: C.lavender, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Lyrics: </span>
                  {fpResult.autoFill.lyricsLinkage.hasLyrics ? (
                    <>
                      {fpResult.autoFill.lyricsLinkage.explicit && (
                        <span style={{ background: C.amberSoft, color: C.amber, fontSize: 9, padding: '1px 5px', borderRadius: 4, marginRight: 5, fontWeight: 700 }}>EXPLICIT</span>
                      )}
                      {fpResult.autoFill.lyricsLinkage.url
                        ? <a href={fpResult.autoFill.lyricsLinkage.url} target="_blank" rel="noreferrer" style={{ color: '#34D399', textDecoration: 'none' }}>available via musixmatch ↗</a>
                        : <span style={{ color: '#34D399' }}>available</span>
                      }
                    </>
                  ) : (
                    <span style={{ color: 'rgba(226,232,240,0.4)' }}>not found in registry</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {fpError && (
        <div style={{ marginTop: 8, padding: '7px 10px', borderRadius: 7, background: 'rgba(219,39,119,0.10)', border: '1px solid rgba(219,39,119,0.3)', fontSize: 11, color: C.magenta, fontWeight: 600 }}>
          {fpError}
        </div>
      )}

      {/* Open items — chips for stages not yet complete */}
      {stages.filter(s => !s.done).length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
          <span style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.lavender, opacity: 0.6, flexShrink: 0 }}>Open:</span>
          {stages.filter(s => !s.done).map(s => (
            <span key={s.label} style={{
              fontSize: 9, padding: '3px 8px', borderRadius: 999,
              background: s.warn ? 'rgba(219,39,119,0.10)' : 'rgba(123,112,178,0.08)',
              border: `1px solid ${s.warn ? 'rgba(219,39,119,0.25)' : C.hairline}`,
              color: s.warn ? C.magenta : 'rgba(226,232,240,0.5)',
              letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'nowrap',
            }}>{s.label}</span>
          ))}
        </div>
      )}

      {/* actions */}
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => onOpenIntake()} style={{ flex: 1, padding: '7px 0', borderRadius: 7, border: `1px solid ${C.hairlineStrong}`, background: 'transparent', color: C.lavender, fontFamily: SANS, fontSize: 11, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.04em' }}>
          ✎ Edit Rights Data
        </button>
        <button type="button" onClick={() => void runFingerprint()} disabled={fingerprinting} style={{ flex: 1, padding: '7px 0', borderRadius: 7, border: 'none', background: `linear-gradient(135deg, ${C.purple}, ${C.magenta})`, color: '#fff', fontFamily: SANS, fontSize: 11, fontWeight: 700, cursor: fingerprinting ? 'wait' : 'pointer', letterSpacing: '0.04em' }}>
          {fingerprinting ? 'Resolving…' : '⦿ Resolve Identity'}
        </button>
      </div>
    </div>
  );
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
    <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 11, background: 'rgba(0,0,0,0.35)', border: `1px solid ${C.hairlineStrong}` }}>
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
        <div>
          <label style={labelStyle}>ISRC</label>
          <input style={inputStyle} value={isrc} onChange={e => setIsrc(e.target.value)} placeholder="e.g. USRC17607839" />
        </div>
        <div>
          <label style={labelStyle}>Writer Name</label>
          <input style={inputStyle} value={writer} onChange={e => setWriter(e.target.value)} placeholder="Artist / composer" />
        </div>
        <div>
          <label style={labelStyle}>Publisher</label>
          <input style={inputStyle} value={publisher} onChange={e => setPublisher(e.target.value)} placeholder="Publisher name" />
        </div>
        <div>
          <label style={labelStyle}>PRO Affiliation</label>
          <input style={inputStyle} value={pro} onChange={e => setPro(e.target.value)} placeholder="ASCAP / BMI / SESAC" />
        </div>
        <div>
          <label style={labelStyle}>Work ID / ISWC</label>
          <input style={inputStyle} value={workId} onChange={e => setWorkId(e.target.value)} placeholder="T-070909483-6 or ASCAP/BMI ID" />
        </div>
        <div>
          <label style={labelStyle}>Writer IPI</label>
          <input style={inputStyle} value={ipi} onChange={e => setIpi(e.target.value)} placeholder="e.g. 00508530861" />
        </div>
        <div>
          <label style={labelStyle}>Writer Split %</label>
          <input
            style={inputStyle}
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={splitPct}
            onChange={e => setSplitPct(e.target.value)}
            placeholder="e.g. 50"
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <label style={{ ...labelStyle, marginBottom: 10 }}>One-Stop License</label>
          <button
            type="button"
            onClick={() => setOneStop(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <span style={{ width: 32, height: 18, borderRadius: 999, background: oneStop ? '#34D399' : 'rgba(255,255,255,0.10)', border: `1px solid ${oneStop ? '#34D399' : C.hairlineStrong}`, position: 'relative', display: 'inline-block', flexShrink: 0, transition: 'background 0.2s' }}>
              <span style={{ position: 'absolute', top: 2, left: oneStop ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
            </span>
            <span style={{ fontSize: 12, color: oneStop ? '#34D399' : C.lavender }}>{oneStop ? 'Yes' : 'No'}</span>
          </button>
        </div>
      </div>

      {/* Composition sync + lyric license */}
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
          <div>
            <label style={labelStyle}>Sync Licensed By</label>
            <input style={inputStyle} value={syncBy} onChange={e => setSyncBy(e.target.value)} placeholder="Publisher / agency" />
          </div>
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
          <div>
            <label style={labelStyle}>Lyric Licensed By</label>
            <input style={inputStyle} value={lyricBy} onChange={e => setLyricBy(e.target.value)} placeholder="Rights holder" />
          </div>
        </div>
      </div>
      {error && <p style={{ fontSize: 11, color: C.magenta, marginTop: 8 }}>{error}</p>}
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        style={{ marginTop: 12, width: '100%', padding: '9px 0', borderRadius: 8, border: 'none', cursor: saving ? 'wait' : 'pointer', background: `linear-gradient(135deg, ${C.purple}, ${C.magenta})`, color: '#fff', fontFamily: SANS, fontWeight: 700, fontSize: 12, letterSpacing: '0.06em' }}
      >
        {saving ? 'Saving…' : 'Save Rights Data'}
      </button>
    </div>
  );
}

// ── TrackCard (inlined for full visual control) ────────────────
type LocalRightsOverride = NonNullable<AnalysisResult['rightsProfile']> & { blockers?: string[] };

function TrackCard({ result, briefId, topScore, isFirst, onRightsSaved }: { result: AnalysisResult; briefId: BriefId; topScore: number; isFirst: boolean; onRightsSaved?: (trackId: string, override: LocalRightsOverride) => void }) {
  const [isPlaying, setIsPlaying]               = useState(false);
  const [currentTime, setCurrentTime]           = useState(0);
  const [duration, setDuration]                 = useState(0);
  const [rightsTooltip, setRightsTooltip]       = useState(false);
  const [rightsPanel, setRightsPanel]           = useState(false);
  const [showPipeline, setShowPipeline]         = useState(false);
  const [playbackMsg, setPlaybackMsg]           = useState(false);
  const [localRightsProfile, setLocalRightsProfile] = useState(result.rightsProfile);
  const localVector = result.confidenceScore.vector ?? { scene: result.confidenceScore.sceneFitBreakdown / 100, lyrics: result.confidenceScore.lyricsBreakdown / 100, audioSignal: result.confidenceScore.signalBreakdown / 100, rightsClarity: (result.confidenceScore.dataConfidence ?? 50) / 100 };
  const [pendingAutoFill, setPendingAutoFill]        = useState<AutoFill | undefined>(undefined);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Mirror of backend scoreTrack() — same WEIGHTS, same dot product.
  // Recomputed locally whenever rights data saves so the card updates immediately.
  const WEIGHTS = { scene: 0.45, lyrics: 0.25, audioSignal: 0.20, rightsClarity: 0.10 };
  const liveScore = Math.round(
    (localVector.scene         * WEIGHTS.scene         +
     localVector.lyrics        * WEIGHTS.lyrics        +
     localVector.audioSignal   * WEIGHTS.audioSignal   +
     localVector.rightsClarity * WEIGHTS.rightsClarity) * 100
  );

  const audioFilePath = resolveAudioUrl(result.track.audioFilePath);
  const hasAudio = audioFilePath !== null;
  const rights = rightsDisplayFor(localRightsProfile);
  const score = liveScore;
  const delta = isFirst ? null : topScore - score;
  const title = cleanTrackTitle(result.track.title);
  const timeLabel = duration > 0 ? `${formatTime(currentTime)} / ${formatTime(duration)}` : formatTime(currentTime);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime    = () => setCurrentTime(audio.currentTime);
    const onMeta    = () => setDuration(audio.duration);
    const onPlay    = () => setIsPlaying(true);
    const onPause   = () => setIsPlaying(false);
    const onEnded   = () => { setIsPlaying(false); setCurrentTime(audio.currentTime); };
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

  return (
    <article
      className="sv-track-card"
      style={{
        position: 'relative',
        background: isFirst
          ? 'linear-gradient(180deg, rgba(245,166,35,0.22), rgba(219,39,119,0.06) 70%, rgba(245,166,35,0.02))'
          : 'linear-gradient(180deg, rgba(245,166,35,0.07), rgba(245,166,35,0.02))',
        border: `1px solid ${isFirst ? 'rgba(123,112,178,0.34)' : C.hairline}`,
        boxShadow: isFirst ? '0 20px 40px -20px rgba(245,166,35,0.35)' : 'none',
        borderRadius: 16, marginBottom: 10, overflow: 'hidden',
      }}
    >
      {/* ghosted rank */}
      <span aria-hidden style={{ position: 'absolute', top: 2, right: 14, fontFamily: SERIF, fontSize: 78, lineHeight: 1, color: isFirst ? 'rgba(255,255,255,0.10)' : 'rgba(123,112,178,0.10)', letterSpacing: '-0.04em', fontWeight: 400, pointerEvents: 'none', userSelect: 'none' }}>
        {result.rank}
      </span>

      {/* title */}
      <div style={{ fontFamily: SERIF, fontSize: 20, lineHeight: 1.1, fontWeight: 400, color: C.amber, letterSpacing: '-0.005em', paddingRight: 50 }}>
        {title}
      </div>
      {result.track.artistName && (
        <div style={{ fontSize: 13, color: C.lavender, fontWeight: 300, marginTop: 2 }}>{result.track.artistName}</div>
      )}

      {/* meta chips */}
      <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {result.track.tempo != null && <Chip variant="bpm">{result.track.tempo} BPM</Chip>}
        {result.track.tonalCharacter && <Chip>{result.track.tonalCharacter}</Chip>}
        {delta != null && delta > 0 && (
          <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(226,232,240,0.55)', letterSpacing: '0.02em', marginLeft: 'auto' }}>
            −{delta} pts separation
          </span>
        )}
        {isFirst && (
          <span style={{ fontSize: 11, fontWeight: 600, color: C.magenta, letterSpacing: '0.02em', marginLeft: 'auto' }}>Best fit in shortlist</span>
        )}
      </div>

      {/* SECTION 1 — Scene Fit */}
      <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 11, background: 'linear-gradient(180deg, rgba(123,112,178,0.07), transparent)', border: `1px solid ${C.hairlineStrong}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.26em', textTransform: 'uppercase', color: C.lavender, fontWeight: 700 }}>Scene Fit</div>
          <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 16, lineHeight: 1, color: result.confidenceScore.sceneFitBreakdown >= 70 ? '#34D399' : result.confidenceScore.sceneFitBreakdown >= 50 ? C.amber : C.magenta, fontVariantNumeric: 'tabular-nums' }}>{result.confidenceScore.sceneFitBreakdown}<span style={{ fontFamily: SANS, fontStyle: 'normal', fontSize: 9, color: C.lavender, marginLeft: 2 }}>/100</span></span>
        </div>
        <div style={{ fontFamily: SANS, fontSize: 12, lineHeight: 1.6, color: 'rgba(226,232,240,0.80)', letterSpacing: '0.01em' }}>
          {sceneFitSentence(briefId, result.confidenceScore.sceneFitBreakdown)}
        </div>
      </div>

      {/* SECTION 2 — Sync assessment */}
      <div className="sv-reasoning" style={{ marginTop: 6, padding: '10px 12px', borderRadius: 11, background: 'linear-gradient(180deg, rgba(219,39,119,0.06), transparent)', border: '1px solid rgba(219,39,119,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.26em', textTransform: 'uppercase', color: C.magenta, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2 L14.5 9.5 L22 12 L14.5 14.5 L12 22 L9.5 14.5 L2 12 L9.5 9.5 Z" /></svg>
            Sync assessment
          </div>
          <span style={{ fontSize: 8, color: 'rgba(219,39,119,0.45)', letterSpacing: '0.08em' }}>deterministic · audit-stable</span>
        </div>
        <div style={{ fontFamily: SANS, fontSize: 13, lineHeight: 1.65, color: '#E2E8F0', letterSpacing: '0.01em', fontWeight: 400 }}>
          {result.confidenceScore.explanation}
        </div>
      </div>

      {/* score + weighted breakdown */}
      <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 11, background: 'rgba(0,0,0,0.18)', border: `1px solid ${C.hairline}` }}>

        {/* scalar score */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <span style={{ fontSize: 9, letterSpacing: '0.26em', textTransform: 'uppercase', color: C.lavender }}>Fit Index</span>
          <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 22, lineHeight: 1, color: score >= 70 ? '#34D399' : score >= 55 ? C.amber : C.magenta, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', transition: 'color 0.3s' }}>
            {score}<span style={{ fontFamily: SANS, fontStyle: 'normal', fontSize: 10, color: C.lavender, marginLeft: 2 }}>/100</span>
          </span>
        </div>

        {/* weighted axis bars — container width ∝ weight, fill ∝ axis value */}
        <div style={{ display: 'flex', gap: 2, width: '100%' }}>
          {([
            { key: 'scene',         label: 'Scene',   sub: 'fit',        weight: 0.45, value: localVector.scene,         actionable: false },
            { key: 'lyrics',        label: 'Lyrics',  sub: 'fit',        weight: 0.25, value: localVector.lyrics,        actionable: false, pending: !localRightsProfile },
            { key: 'audioSignal',   label: 'Signal',  sub: 'mix fit',    weight: 0.20, value: localVector.audioSignal,   actionable: false },
            { key: 'rightsClarity', label: 'Rights',  sub: 'data score', weight: 0.10, value: localVector.rightsClarity, actionable: true  },
          ] as { key: string; label: string; sub: string; weight: number; value: number; actionable: boolean; pending?: boolean }[]).map((axis, _i, arr) => {
            const pct   = Math.round(axis.value * 100);
            const isLow = axis.value < 0.4;
            const barColor = axis.value >= 0.7 ? 'linear-gradient(90deg,#34D399,#22c55e)' : axis.value >= 0.45 ? 'linear-gradient(90deg,#F5B544,#F97316)' : 'linear-gradient(90deg,#DB2777,#be185d)';
            // gap is 2px × (n-1) total; subtract proportional share
            const gapDeduction = `${2 * (arr.length - 1) * axis.weight}px`;
            return (
              <div
                key={axis.key}
                style={{ display: 'flex', flexDirection: 'column', gap: 4, width: `calc(${axis.weight * 100}% - ${gapDeduction})`, flexShrink: 0 }}
              >
                {/* label row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.lavender }}>
                  <span style={{ fontWeight: 700, color: C.silver }}>{axis.label}</span>
                  {axis.actionable ? (
                    <button
                      type="button"
                      onClick={() => { setShowPipeline(false); setRightsPanel(true); }}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 10, color: isLow ? C.magenta : C.lavender, fontWeight: 700, lineHeight: 1 }}
                      title="Enter rights data"
                    >↑</button>
                  ) : axis.pending ? (
                    <span style={{ fontSize: 9, color: 'rgba(123,112,178,0.4)' }}>–</span>
                  ) : null}
                </div>

                {/* bar track */}
                <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 999, overflow: 'hidden', position: 'relative' }}>
                  <div style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: axis.pending ? 'rgba(123,112,178,0.15)' : barColor,
                    borderRadius: 999,
                    transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
                  }} />
                </div>

                {/* value */}
                <div style={{ fontSize: 9, fontFamily: 'monospace', color: axis.pending ? 'rgba(123,112,178,0.4)' : C.lavender, letterSpacing: '0.04em' }}>
                  {axis.pending ? '—' : `${pct}`}
                  {/* weight label only on wider axes */}
                  {axis.weight >= 0.2 && <span style={{ opacity: 0.45, marginLeft: 2 }}>{axis.sub}</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* weight legend — shown once, bottom right */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <span style={{ fontSize: 8, color: 'rgba(123,112,178,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            bar width = weight · bar fill = axis value
          </span>
        </div>

        {/* epistemic line */}
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.hairline}`, fontSize: 9, color: 'rgba(123,112,178,0.45)', letterSpacing: '0.06em', lineHeight: 1.5 }}>
          Surfaces what you need to decide, faster — does not decide for you.
        </div>
      </div>

      {/* SECTION 3 — Clearance Complexity */}
      {(() => {
        const cs = result.confidenceScore;
        const clScore = cs.clearanceBreakdown ?? 0;
        const dc = cs.dataConfidence ?? null;
        const dcVer = cs.dataConfidenceVerified ?? null;
        const dcTot = cs.dataConfidenceTotal ?? 8;
        return (
          <div style={{ marginTop: 6, padding: '10px 12px', borderRadius: 11, background: 'linear-gradient(180deg, rgba(245,181,68,0.05), transparent)', border: `1px solid ${C.amberBorder}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <div style={{ fontSize: 9, letterSpacing: '0.26em', textTransform: 'uppercase', color: C.amber, fontWeight: 700 }}>Clearance Complexity</div>
              <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 16, lineHeight: 1, color: clScore >= 70 ? '#34D399' : clScore >= 50 ? C.amber : C.magenta, fontVariantNumeric: 'tabular-nums' }}>{clScore}<span style={{ fontFamily: SANS, fontStyle: 'normal', fontSize: 9, color: C.lavender, marginLeft: 2 }}>/100</span></span>
            </div>
            <div style={{ fontFamily: SANS, fontSize: 12, lineHeight: 1.6, color: 'rgba(226,232,240,0.80)', letterSpacing: '0.01em' }}>
              {clearanceSentence(clScore)}
            </div>
            {dc !== null && dcVer !== null && (
              <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(123,112,178,0.65)', letterSpacing: '0.04em' }}>
                Rights data: {dc}% complete — {dcVer} of {dcTot} fields verified
              </div>
            )}
          </div>
        );
      })()}

      {/* tag row */}
      <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ position: 'relative' }}>
          <span
            style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', padding: '4px 8px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', background: rights.bgColor, border: `1px solid ${rights.borderColor}`, color: rights.color, cursor: 'pointer' }}
            onMouseEnter={() => !showPipeline && setRightsTooltip(true)}
            onMouseLeave={() => setRightsTooltip(false)}
            onClick={() => { setRightsTooltip(false); setShowPipeline(v => !v); setRightsPanel(false); }}
          >
            <span style={{ width: 13, height: 13, borderRadius: '50%', background: `${rights.color}33`, display: 'inline-grid', placeItems: 'center', fontSize: 9, fontWeight: 800, flexShrink: 0 }}>⧖</span>
            {rights.label.toUpperCase()}
          </span>
          {rightsTooltip && !showPipeline && (
            <span style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, width: 256, fontSize: 11, lineHeight: 1.5, borderRadius: 10, padding: '8px 12px', zIndex: 10, background: '#170B33', border: `1px solid ${C.hairline}`, color: C.silver }}>
              Click to view rights pipeline
            </span>
          )}
        </span>
        <Chip variant="genre">{BRIEF_LABELS[briefId]}</Chip>
        {showPipeline && (
          <button type="button" onClick={() => setShowPipeline(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.lavender, cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
        )}
      </div>

      {/* rights pipeline */}
      {showPipeline && !rightsPanel && (
        <RightsPipelineView
          rp={localRightsProfile}
          trackId={result.track.id}
          onOpenIntake={(af) => { setPendingAutoFill(af); setRightsPanel(true); setShowPipeline(false); }}
        />
      )}

      {/* rights intake panel */}
      {rightsPanel && (
        <RightsPanel
          trackId={result.track.id}
          isrc={localRightsProfile?.isrc ?? result.track.isrc}
          existing={localRightsProfile}
          autoFill={pendingAutoFill}
          onSaved={(saved) => {
            const newRp = {
              isrc: saved.isrc,
              isOneStop: saved.isOneStop,
              proAffiliation: saved.proAffiliation,
              masterVerifiedAt: saved.masterVerifiedAt,
              masterOwnedBy: saved.masterOwnedBy,
              publisherName: saved.publisherName,
              writerName: saved.writerName,
              workId: saved.workId,
              blockers: saved.blockers,
              rightsState: saved.rightsState,
              syncLicenseStatus: saved.syncLicenseStatus,
              syncLicensedBy: saved.syncLicensedBy,
              lyricLicenseStatus: saved.lyricLicenseStatus,
              lyricLicensedBy: saved.lyricLicensedBy,
              splitPct: saved.splitPct,
            };
            setLocalRightsProfile(newRp);
            onRightsSaved?.(result.track.id, newRp);
            setRightsPanel(false);
            setShowPipeline(true);
          }}
          onClose={() => { setRightsPanel(false); setShowPipeline(true); }}
        />
      )}

      {/* rights blockers — only when pipeline is closed */}
      {!showPipeline && !rightsPanel && localRightsProfile?.blockers && localRightsProfile.blockers.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {localRightsProfile.blockers.map(code => (
            <Chip key={code} variant="warn">{BLOCKER_LABELS[code] ?? code.replace(/_/g, ' ').toLowerCase()}</Chip>
          ))}
        </div>
      )}

      {/* waveform player */}
      <div className="no-print" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px 8px 8px', borderRadius: 11, background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.hairline}` }}>
        <button type="button" onClick={togglePlayback} aria-label={isPlaying ? 'Pause' : 'Play'} style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', background: isFirst ? `linear-gradient(135deg, ${C.purple}, ${C.magenta})` : C.silver, color: isFirst ? '#fff' : '#0D0B1E', border: 'none', cursor: 'pointer', boxShadow: isFirst ? '0 6px 14px -6px rgba(219,39,119,0.5)' : undefined }}>
          {isPlaying
            ? <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden><rect x="1.5" y="1" width="2.5" height="8" /><rect x="6" y="1" width="2.5" height="8" /></svg>
            : <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden><path d="M2 1 L8 5 L2 9 Z" /></svg>
          }
        </button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5, height: 26, overflow: 'hidden' }}>
          {[30,55,40,72,50,90,60,35,65,48,78,42,62,38,55,80,45,60,30,70,42,55,36,50,65,40,58,32,48,55,38,60,42,50,30,45,38,52,34,48].map((h, i) => {
            const played = duration > 0 && (i / 40) < (currentTime / duration);
            return <span key={i} style={{ display: 'block', width: 2, flexShrink: 0, height: `${h}%`, borderRadius: 2, background: played ? `linear-gradient(180deg, ${C.purple}, ${C.magenta})` : 'rgba(123,112,178,0.3)' }} />;
          })}
        </div>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: C.lavender, letterSpacing: '0.05em', flexShrink: 0 }}>{timeLabel}</span>
      </div>


      {hasAudio && <audio ref={audioRef} src={audioFilePath ?? undefined} preload="metadata" className="hidden" />}
      {playbackMsg && !hasAudio && <p style={{ fontSize: 11, color: C.lavender, marginTop: 6, fontStyle: 'italic' }}>Audio playback coming soon.</p>}
    </article>
  );
}

// ── Verdict builder ───────────────────────────────────────────
function buildVerdict(
  winner: AnalysisResult,
  loser:  AnalysisResult,
  briefId: BriefId,
  sceneParams: SceneParams,
): string {
  const wVec = winner.confidenceScore.vector ?? {
    scene:         winner.confidenceScore.sceneFitBreakdown  / 100,
    lyrics:        winner.confidenceScore.lyricsBreakdown    / 100,
    audioSignal:   winner.confidenceScore.signalBreakdown    / 100,
    rightsClarity: (winner.confidenceScore.dataConfidence ?? 50) / 100,
  };
  const lVec = loser.confidenceScore.vector ?? {
    scene:         loser.confidenceScore.sceneFitBreakdown  / 100,
    lyrics:        loser.confidenceScore.lyricsBreakdown    / 100,
    audioSignal:   loser.confidenceScore.signalBreakdown    / 100,
    rightsClarity: (loser.confidenceScore.dataConfidence ?? 50) / 100,
  };

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

  // ── axis-specific editorial sentences ──
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
    } else if (['euphoria-celebration','triumph-victory','sports-highlight'].includes(briefId)) {
      editorialSentence = `The mix density matches the energy ceiling a ${brief.toLowerCase()} sequence needs without early compression artefacts.`;
    } else if (pacing === 'driving') {
      editorialSentence = `The signal profile holds together at the pacing this brief requires — important when the mix engineer has little room to rebalance.`;
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

  // ── clearance closing sentence ──
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
  results,
  open,
  onClose,
  briefId,
  sceneParams,
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

  const left  = results[leftIdx];
  const right = results[rightIdx];
  const leftScore  = left.confidenceScore.score;
  const rightScore = right.confidenceScore.score;
  const lead = leftIdx < rightIdx ? leftScore - rightScore : rightScore - leftScore;

  const AXES = ['scene', 'rightsClarity', 'lyrics', 'audioSignal'] as const;
  const AXIS_COLORS = {
    scene:         '#F5A623',
    rightsClarity: (v: number) => v >= 0.65 ? '#4CAF82' : v >= 0.35 ? '#F5B544' : '#E85A5A',
    lyrics:      '#9B93C4',
    audioSignal: 'rgba(155,147,196,0.55)',
  } as const;

  const axisColor = (key: typeof AXES[number], value: number) =>
    key === 'rightsClarity' ? (AXIS_COLORS.rightsClarity as (v: number) => string)(value) : AXIS_COLORS[key] as string;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Side-by-side comparison"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(7,4,26,0.82)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '32px 16px 40px', overflowY: 'auto',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 960,
        background: 'linear-gradient(180deg,#0e0820,#0D0B1E)',
        border: '1px solid rgba(123,112,178,0.22)',
        borderRadius: 24, overflow: 'hidden',
        boxShadow: '0 40px 80px -20px rgba(0,0,0,0.8)',
      }}>
        {/* header */}
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid rgba(123,112,178,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender, marginBottom: 4 }}>Side-by-side comparison</div>
            <div style={{ fontFamily: SERIF, fontSize: 20, color: C.silver }}>
              {cleanTrackTitle(left.track.title)} <span style={{ color: C.lavender, fontStyle: 'italic' }}>vs</span> {cleanTrackTitle(right.track.title)}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(123,112,178,0.12)', border: '1px solid rgba(123,112,178,0.22)', color: C.lavender, cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 18, lineHeight: 1 }}>
            ×
          </button>
        </div>

        {/* track selectors — lets you swap which tracks you compare */}
        {results.length > 2 && (
          <div style={{ padding: '14px 28px', borderBottom: '1px solid rgba(123,112,178,0.10)', display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
            <select
              value={leftIdx}
              onChange={e => setLeftIdx(Number(e.target.value))}
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(123,112,178,0.3)', borderRadius: 10, padding: '7px 10px', color: C.silver, fontFamily: SANS, fontSize: 12, cursor: 'pointer' }}
            >
              {results.map((r, i) => <option key={r.track.id} value={i} disabled={i === rightIdx}>#{i + 1} {cleanTrackTitle(r.track.title)}</option>)}
            </select>
            <span style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.lavender }}>vs</span>
            <select
              value={rightIdx}
              onChange={e => setRightIdx(Number(e.target.value))}
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(123,112,178,0.3)', borderRadius: 10, padding: '7px 10px', color: C.silver, fontFamily: SANS, fontSize: 12, cursor: 'pointer' }}
            >
              {results.map((r, i) => <option key={r.track.id} value={i} disabled={i === leftIdx}>#{i + 1} {cleanTrackTitle(r.track.title)}</option>)}
            </select>
          </div>
        )}

        {/* two-column body */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr' }}>
          {([left, right] as const).map((result, col) => {
            const isLeader = col === 0 ? leftScore >= rightScore : rightScore > leftScore;
            const vec = result.confidenceScore.vector ?? {
              scene:         result.confidenceScore.sceneFitBreakdown  / 100,
              lyrics:        result.confidenceScore.lyricsBreakdown   / 100,
              audioSignal:   result.confidenceScore.signalBreakdown   / 100,
              rightsClarity: (result.confidenceScore.dataConfidence ?? 50) / 100,
            };
            const score = result.confidenceScore.score;
            const audioPath = resolveAudioUrl(result.track.audioFilePath);

            return col === 0 ? (
              <CompareHalf
                key={result.track.id}
                result={result}
                score={score}
                vec={vec}
                audioPath={audioPath}
                isLeader={isLeader}
                lead={lead}
                axisColor={axisColor}
                axes={AXES}
              />
            ) : (
              <>
                {/* divider */}
                <div key="div" style={{ background: 'rgba(123,112,178,0.12)', margin: '24px 0' }} />
                <CompareHalf
                  key={result.track.id}
                  result={result}
                  score={score}
                  vec={vec}
                  audioPath={audioPath}
                  isLeader={isLeader}
                  lead={lead}
                  axisColor={axisColor}
                  axes={AXES}
                />
              </>
            );
          })}
        </div>

        {/* footer verdict */}
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
      {/* identity */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {isLeader && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#4CAF82', fontWeight: 700, marginBottom: 6, padding: '3px 8px', background: 'rgba(76,175,130,0.12)', borderRadius: 999, border: '1px solid rgba(76,175,130,0.3)' }}>
              ✓ {lead > 0 ? `+${lead} pts lead` : 'Tied'}
            </div>
          )}
          <div style={{ fontFamily: SERIF, fontSize: 18, color: C.amber, lineHeight: 1.2, fontWeight: 400 }}>
            {cleanTrackTitle(result.track.title)}
          </div>
          {result.track.artistName && (
            <div style={{ fontSize: 12, color: C.lavender, marginTop: 3 }}>{result.track.artistName}</div>
          )}
          <div style={{ marginTop: 6, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {result.track.tempo != null && <Chip variant="bpm">{result.track.tempo} BPM</Chip>}
            {result.track.tonalCharacter && <Chip>{result.track.tonalCharacter}</Chip>}
            {result.track.energyCharacter && <Chip>{result.track.energyCharacter}</Chip>}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 36, lineHeight: 1, color: score >= 70 ? '#4CAF82' : score >= 55 ? C.amber : C.magenta }}>
            {score}
          </div>
          <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.lavender, marginTop: 2 }}>Fit index</div>
        </div>
      </div>

      {/* axis bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.lavender, marginBottom: 2 }}>SyncScore axes</div>
        {axes.map(key => {
          const value = vec[key];
          const pct   = Math.round(value * 100);
          const color = axisColor(key, value);
          return (
            <div key={key} style={{ display: 'grid', gridTemplateColumns: '48px 1fr 26px', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.lavender, fontWeight: 700 }}>{key}</span>
              <div style={{ height: 5, background: 'rgba(123,112,178,0.12)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 999, transition: 'width 0.4s ease' }} />
              </div>
              <span style={{ fontSize: 12, fontFamily: 'monospace', color: C.silver, textAlign: 'right', fontWeight: 700 }}>{pct}</span>
            </div>
          );
        })}
      </div>

      {/* narrative */}
      <div style={{ padding: '12px 14px', borderRadius: 12, background: 'linear-gradient(180deg,rgba(219,39,119,0.06),transparent)', border: '1px solid rgba(219,39,119,0.18)' }}>
        <div style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.magenta, fontWeight: 700, marginBottom: 6 }}>
          ✦ Why this track
        </div>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.65, color: '#E2E8F0' }}>
          {result.confidenceScore.explanation}
        </p>
      </div>

      {/* audio mini-player */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 11, background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.hairline}` }}>
        <button
          type="button"
          onClick={togglePlay}
          disabled={!audioPath}
          aria-label={playing ? 'Pause' : 'Play'}
          style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', background: audioPath ? `linear-gradient(135deg,${C.purple},${C.magenta})` : 'rgba(123,112,178,0.15)', color: audioPath ? '#fff' : C.lavender, border: 'none', cursor: audioPath ? 'pointer' : 'not-allowed', boxShadow: audioPath ? `0 4px 12px -4px rgba(219,39,119,0.5)` : 'none' }}
        >
          {playing
            ? <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><rect x="1.5" y="1" width="2.5" height="8" /><rect x="6" y="1" width="2.5" height="8" /></svg>
            : <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><path d="M2 1 L8 5 L2 9 Z" /></svg>}
        </button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5, height: 24, overflow: 'hidden' }}>
          {WAVE.map((h, i) => (
            <span key={i} style={{ display: 'block', width: 2, flexShrink: 0, height: `${h}%`, borderRadius: 2, background: i < playedBars ? `linear-gradient(180deg,${C.purple},${C.magenta})` : 'rgba(123,112,178,0.25)' }} />
          ))}
        </div>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: C.lavender, flexShrink: 0 }}>
          {audioPath ? `${formatTime(time)} / ${formatTime(duration || 0)}` : 'No audio'}
        </span>
        {audioPath && <audio ref={audioRef} src={audioPath} preload="metadata" />}
      </div>

      {/* rights status */}
      {result.rightsProfile && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {(result.rightsProfile.blockers ?? []).map(code => (
            <Chip key={code} variant="warn">{BLOCKER_LABELS[code] ?? code.replace(/_/g, ' ').toLowerCase()}</Chip>
          ))}
          {(result.rightsProfile.blockers ?? []).length === 0 && (
            <Chip>✓ Rights clear</Chip>
          )}
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
  readOnly?: boolean;
  onBack?: () => void;
};

export function ResultsScreen({ briefText, briefId, sceneParams, results, readOnly, onBack }: ResultsScreenProps) {
  const [toast,        setToast]        = useState<string | null>(null);
  const [compareOpen,  setCompareOpen]  = useState(false);
  const [localRightsOverrides, setLocalRightsOverrides] = useState<Record<string, LocalRightsOverride>>({});

  const onExportPdf = () => {
    try { window.print(); } catch (e) { setToast(e instanceof Error ? e.message : 'Print failed.'); }
  };

  const onCopyShareLink = async () => {
    try {
      setToast('Creating share link…');
      const body = {
        briefText,
        briefId,
        sceneParams,
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
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

      if (!resp.ok) throw new Error(`Server ${resp.status}`);
      const { packetId } = await resp.json() as { packetId: string };
      const url = `${window.location.origin}${window.location.pathname}#share=${packetId}`;
      await navigator.clipboard.writeText(url);
      setToast('Share link copied.');
      window.setTimeout(() => setToast(null), 2400);
    } catch (e) {
      setToast(e instanceof Error ? `Couldn't copy: ${e.message}` : "Couldn't copy link.");
    }
  };

  const topScore = results[0]?.confidenceScore.score ?? 100;
  const hasSidebar = results.length > 1;

  return (
    <div style={{ minHeight: '100vh', fontFamily: SANS, WebkitFontSmoothing: 'antialiased', color: C.silver, background: BG }}>
      <style>{`
        @keyframes sv-pulse-dot { 0%,100%{opacity:.7;transform:scale(1)} 50%{opacity:1;transform:scale(1.15)} }
        .sv-rs-topbar { position: sticky; top: 0; z-index: 20; background: linear-gradient(180deg,rgba(6,3,15,0.94),rgba(6,3,15,0.6) 70%,transparent); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-bottom: 1px solid ${C.hairline}; }
        .sv-rs-topbar-inner { max-width: 1280px; margin: 0 auto; padding: 12px 28px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .sv-rs-shell { max-width: 1280px; margin: 0 auto; padding: 24px 28px 80px; }
        .sv-rs-layout { display: grid; grid-template-columns: 1fr; gap: 20px; }
        .sv-rs-sidebar { display: none; }
        .sv-track-card { padding: 12px 14px 11px; }
        @media (min-width: 880px) {
          .sv-track-card { padding: 22px 26px 20px; }
        }
        @media (min-width: 1000px) {
          .sv-rs-layout--sidebar { grid-template-columns: minmax(0,1.6fr) minmax(0,1fr); gap: 28px; align-items: start; }
          .sv-rs-sidebar { display: flex; flex-direction: column; gap: 10px; position: sticky; top: 72px; }
          .sv-rs-main-cards { display: flex; flex-direction: column; gap: 0; }
        }
        @media (max-width: 480px) {
          .sv-rs-shell { padding: 16px 16px 60px; }
          .sv-rs-topbar-inner { padding: 10px 16px; }
        }
        @media print {
          /* Force all backgrounds and colors to render exactly as on screen */
          *, *::before, *::after {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          html, body {
            background: #0D0B1E !important;
            color: #E2E8F0 !important;
          }
          .sv-rs-topbar { display: none; }
          .sv-rs-shell { padding: 0; max-width: 100%; }
          .sv-rs-layout { grid-template-columns: 1fr; }
          .sv-rs-sidebar { display: none !important; }
          .no-print { display: none !important; }
          .print-wordmark { display: flex !important; }
        }
      `}</style>

      {/* ── sticky topbar ── */}
      <header className="sv-rs-topbar">
        <div className="sv-rs-topbar-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SvLogo onClick={!readOnly && onBack ? onBack : undefined} />
            {!readOnly && onBack && (
              <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.lavender }}>· Shortlist</span>
            )}
            {readOnly && (
              <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.lavender, opacity: 0.6 }}>read-only</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {results.length >= 2 && (
              <button type="button" onClick={() => setCompareOpen(true)} className="no-print" style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.silver, padding: '6px 14px', minHeight: 32, borderRadius: 999, background: `linear-gradient(135deg, rgba(245,166,35,0.28), rgba(219,39,119,0.22))`, border: `1px solid rgba(245,166,35,0.4)`, cursor: 'pointer', fontFamily: SANS, fontWeight: 700 }}>
                Compare ⇄
              </button>
            )}
            <button type="button" onClick={onExportPdf} className="no-print" style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.lavender, padding: '6px 12px', minHeight: 32, borderRadius: 999, background: C.chipBg, border: `1px solid ${C.hairline}`, cursor: 'pointer', fontFamily: SANS }}>
              Export PDF
            </button>
            <button type="button" onClick={onCopyShareLink} className="no-print" style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.lavender, padding: '6px 12px', minHeight: 32, borderRadius: 999, background: C.chipBg, border: `1px solid ${C.hairline}`, cursor: 'pointer', fontFamily: SANS }}>
              Copy share link
            </button>
          </div>
        </div>
      </header>

      <main className="sv-rs-shell">

        {/* ── scene header ── */}
        <div style={{ paddingBottom: 18, marginBottom: 18, borderBottom: `1px solid ${C.hairline}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender, marginBottom: 5, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 22, height: 1, background: `linear-gradient(90deg,${C.magenta},transparent)`, display: 'inline-block' }} />
                Shortlist
              </div>
              <h1 style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(22px,3.2vw,38px)', lineHeight: 1.05, letterSpacing: '-0.01em', color: C.silver }}>
                {BRIEF_LABELS[briefId]}
              </h1>
              <div style={{ marginTop: 6, fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(13px,1.2vw,15px)', color: 'rgba(226,232,240,0.65)', lineHeight: 1.4, maxWidth: '60ch' }}>
                {briefText}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginLeft: 'auto', alignSelf: 'flex-end' }}>
              {sceneParams.pacing && (
                <Chip>{sceneParams.pacing.charAt(0).toUpperCase() + sceneParams.pacing.slice(1)}</Chip>
              )}
              {sceneParams.sceneLengthSec != null && <Chip>{sceneParams.sceneLengthSec}s</Chip>}
              {sceneParams.emotionalRegister && <Chip>{sceneParams.emotionalRegister}</Chip>}
            </div>
          </div>
        </div>

        {/* ── tab bar ── */}
        <div className="no-print" style={{ display: 'flex', gap: 4, padding: 4, marginBottom: 18, background: 'rgba(123,112,178,0.06)', borderRadius: 12, border: `1px solid ${C.hairline}`, fontSize: 12, fontWeight: 600 }}>
          <div style={{ flex: 1, padding: '8px 0', textAlign: 'center', borderRadius: 8, background: 'rgba(245,166,35,0.22)', color: C.silver, boxShadow: 'inset 0 0 0 1px rgba(245,166,35,0.4)', letterSpacing: '0.02em' }}>
            Shortlist · {results.length}
          </div>
          <div style={{ flex: 1, padding: '8px 0', textAlign: 'center', color: C.lavender, letterSpacing: '0.02em' }}>Considered</div>
          <div style={{ flex: 1, padding: '8px 0', textAlign: 'center', color: C.lavender, letterSpacing: '0.02em' }}>Archive</div>
        </div>

        {/* ── 2-col layout on desktop ── */}
        {results.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <p style={{ color: C.silver, fontSize: 14, marginBottom: 8, fontFamily: SERIF, fontStyle: 'italic' }}>No matches found for this scene.</p>
            <p style={{ color: C.lavender, fontSize: 12, opacity: 0.7 }}>Try rewriting your scene description, or upload different tracks.</p>
          </div>
        ) : (
          <div className={`sv-rs-layout${hasSidebar ? ' sv-rs-layout--sidebar' : ''}`}>
            {/* Main column */}
            <div className="sv-rs-main-cards">
              {results.map((r, i) => (
                <div key={r.track.id}>
                  <TrackCard result={r} briefId={briefId} topScore={topScore} isFirst={i === 0} onRightsSaved={(id, ov) => setLocalRightsOverrides(m => ({ ...m, [id]: ov }))} />
                  {i === 0 && results.length >= 2 && (
                    <button
                      type="button"
                      className="no-print"
                      onClick={() => setCompareOpen(true)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                        padding: '14px 20px', margin: '4px 0 10px', borderRadius: 14,
                        border: '1px solid rgba(245,166,35,0.32)',
                        background: 'linear-gradient(135deg,rgba(245,166,35,0.14),rgba(219,39,119,0.10))',
                        color: C.silver, cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <span style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center', background: `linear-gradient(135deg,${C.purple},${C.magenta})`, color: '#fff', fontSize: 17 }}>⇄</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>Compare top 2 side-by-side</span>
                        <span style={{ display: 'block', fontSize: 12, color: C.lavender, marginTop: 2, fontFamily: SERIF, fontStyle: 'italic' }}>
                          Axis scores, narrative, and audio — {cleanTrackTitle(results[0].track.title)} vs {cleanTrackTitle(results[1].track.title)}
                        </span>
                      </span>
                      <span style={{ color: C.amber, fontSize: 18, flexShrink: 0 }}>→</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
            {/* Sidebar — only rendered when there are 2+ results */}
            {hasSidebar && <aside className="sv-rs-sidebar">
              <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender, marginBottom: 4 }}>Also in shortlist</div>
              {results.slice(1, 5).map((r, i) => {
                const score = r.confidenceScore.score;
                const title = cleanTrackTitle(r.track.title);
                return (
                  <div key={r.track.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 14, background: 'rgba(123,112,178,0.04)', border: `1px solid ${C.hairline}` }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(245,166,35,0.18)', display: 'grid', placeItems: 'center', flexShrink: 0, fontFamily: '"JetBrains Mono",monospace', fontSize: 10, fontWeight: 700, color: C.lavender }}>
                      {i + 2}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: C.silver, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.005em' }}>{title}</div>
                      <div style={{ fontSize: 10, color: C.lavender, letterSpacing: '0.04em', marginTop: 2 }}>Fit Index {score}</div>
                    </div>
                  </div>
                );
              })}
              {results.length > 5 && (
                <div style={{ fontSize: 11, color: 'rgba(123,112,178,0.55)', textAlign: 'center', paddingTop: 4, fontStyle: 'italic', fontFamily: SERIF }}>
                  +{results.length - 5} more below
                </div>
              )}
            </aside>}
          </div>
        )}

        {/* ── print header ── */}
        <div className="print-wordmark hidden">
          <img src="/logo.png" alt="SyncVision" className="print-wordmark-logo" />
          <span className="print-wordmark-text" style={{ marginLeft: 10, opacity: 0.5, fontSize: '0.75rem', letterSpacing: '0.14em' }}>
            SYNC REPORT
          </span>
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
