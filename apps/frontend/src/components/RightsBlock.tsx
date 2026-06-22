import { useState } from 'react';
import { API_BASE, type AnalysisResult } from '../utils/apiClient';

const C = {
  purple:         '#F5A623',
  magenta:        '#DB2777',
  silver:         '#F4F2FA',
  lavender:       '#9B93C4',
  amber:          '#F5B544',
  hairline:       'rgba(123,112,178,0.16)',
  hairlineStrong: 'rgba(123,112,178,0.30)',
  good:           '#4CAF82',
  bad:            '#E85A5A',
};
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS  = '"Manrope", system-ui, sans-serif';

export const BLOCKER_LABELS: Record<string, string> = {
  WRITER_UNIDENTIFIED:       'Writer name missing',
  WRITER_IPI_MISSING:        'Writer IPI missing',
  PUBLISHER_UNKNOWN:         'Publisher unknown',
  PRO_WORK_ID_MISSING:       'PRO Work ID missing',
  ONE_STOP_NOT_CONFIRMED:    'One-stop not confirmed',
  MASTER_PCT_UNSET:          'Master ownership % unset',
  MASTER_OWNERSHIP_CONFLICT: 'Master ownership conflict',
  ISRC_MISSING:              'ISRC missing',
};

export interface AutoFill {
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
  sources: { isrc: string | null; writer: string | null; publisher: string | null; pro: string | null };
  lyricsLinkage: { hasLyrics: boolean; explicit: boolean; url: string | null; isrc: string | null; source: string } | null;
}

export type RightsSaveResult = {
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

export type LocalRightsOverride = NonNullable<AnalysisResult['rightsProfile']> & { blockers?: string[] };

// ── RightsPanel ────────────────────────────────────────────────
export function RightsPanel({
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
      if (ipi.trim())         body.writerIpi = ipi.trim();
      if (splitPct.trim()) {
        const n = parseFloat(splitPct.trim());
        if (!isNaN(n)) body.splitPct = Math.min(100, Math.max(0, n));
      }
      body.isOneStop = oneStop;
      if (syncLicense.trim())  body.syncLicenseStatus = syncLicense.trim();
      if (syncBy.trim())       body.syncLicensedBy = syncBy.trim();
      if (lyricLicense.trim()) body.lyricLicenseStatus = lyricLicense.trim();
      if (lyricBy.trim())      body.lyricLicensedBy = lyricBy.trim();

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
export function RightsTable({
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
    { label: 'Metadata intake',               done: hasAnyIntake },
    { label: 'Publisher data captured',        done: hasPublisher },
    { label: 'Writer / splits captured',       done: hasWriter },
    { label: 'One-stop confirmed',             done: hasOneStop },
    { label: 'Sync license cleared',           done: syncCleared },
    { label: 'Lyric license cleared',          done: lyricCleared },
    { label: 'Fingerprint identity resolution', done: false },
    { label: 'PRO cross-check',                done: false },
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
      <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 12, letterSpacing: '0.01em', wordBreak: 'break-word', color: !val ? undefined : warn ? '#fbbf24' : bad ? C.bad : C.silver }}>
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${C.hairline}`, background: 'linear-gradient(180deg,rgba(245,166,35,0.06),transparent)' }}>
        <span style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.amber, fontWeight: 700 }}>Rights &amp; clearance</span>
        <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 11, letterSpacing: '0.04em', padding: '4px 10px', borderRadius: 999, border: '1px solid rgba(245,158,11,0.35)', color: '#fbbf24', background: 'rgba(245,158,11,0.10)', whiteSpace: 'nowrap' }}>
          {statusLabel}
        </span>
      </div>
      <div className="sv-rights-body">
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
