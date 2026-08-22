import { useCallback, useEffect, useState } from 'react';
import { API_BASE, type AnalysisResult } from '../utils/apiClient';
import { RightsPanel, BLOCKER_LABELS, type RightsSaveResult } from '../components/RightsBlock';

/**
 * Rights Kanban — a view over data that already exists and is already
 * deterministic. GET /api/rights/evaluate runs every track through the real
 * rights state machine (scoring/rightsStateMachine.ts) server-side; this
 * screen just groups the result into columns instead of a stub message.
 *
 * "Automated stage progression" here means what it should mean: a card moves
 * columns because its underlying data changed and the state machine
 * recomputed — never a drag gesture pretending to clear rights that aren't
 * actually cleared. Clicking a card opens the existing RightsPanel edit form
 * (already wired to the real save endpoint); on save we re-fetch, and the
 * card lands wherever the real state machine puts it.
 */

type RightsState = 'INGESTED' | 'UNVERIFIED' | 'PARTIALLY_CLEAR' | 'BLOCKED' | 'CLEAR';

type EvalInput = {
  metadata: { isrc: string | null; title: string | null; artistName: string | null };
  ownership: { masterOwnershipPct: number | string | null; masterOwnedBy: string | null; masterOwnershipType: string | null; masterVerificationSource: string | null };
  publishing: { ascapWorkId: string | null; bmiWorkId: string | null; writerName: string | null; writerIpi: string | null; publisherName: string | null; proAffiliation: string | null };
  usage_rights: { isOneStop: boolean | null; masterOwnershipSplits: unknown };
};

type TrackEvaluation = {
  rights_state: RightsState;
  confidence_score: number;
  blockers: string[];
  clearance_summary: string;
  transition_trace: { from: string | null; to: string; rule: string; triggered: boolean }[];
  audit_hash: { hash: string };
};

type EvaluatedTrack = {
  audio_id: string;
  title: string;
  isrc: string | null;
  artistName: string | null;
  input: EvalInput;
  evaluation: TrackEvaluation;
};

type EvaluateResponse = {
  engine_version: string;
  evaluated_at: string;
  track_count: number;
  state_summary: Record<string, number>;
  tracks: EvaluatedTrack[];
};

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

const COLUMNS: { state: RightsState; label: string; blurb: string; tone: string }[] = [
  { state: 'INGESTED',        label: 'Ingested',         blurb: 'No rights profile yet',        tone: C.lavender },
  { state: 'UNVERIFIED',      label: 'Unverified',       blurb: 'Profile exists, empty',         tone: C.lavender },
  { state: 'PARTIALLY_CLEAR', label: 'Partially Clear',  blurb: 'Some fields confirmed',         tone: C.amber },
  { state: 'BLOCKED',         label: 'Blocked',          blurb: 'Conflict or unknown owner',     tone: C.bad },
  { state: 'CLEAR',           label: 'Clear',            blurb: 'All conditions met',            tone: C.good },
];

function evalInputToRightsProfile(t: EvaluatedTrack): NonNullable<AnalysisResult['rightsProfile']> {
  const { input, evaluation } = t;
  return {
    isrc: input.metadata.isrc,
    isOneStop: input.usage_rights.isOneStop,
    proAffiliation: input.publishing.proAffiliation,
    masterVerifiedAt: null,
    masterOwnedBy: input.ownership.masterOwnedBy,
    publisherName: input.publishing.publisherName,
    writerName: input.publishing.writerName,
    writerIpi: input.publishing.writerIpi,
    workId: input.publishing.ascapWorkId ?? input.publishing.bmiWorkId ?? null,
    splitPct: null,
    syncLicenseStatus: null,
    syncLicensedBy: null,
    lyricLicenseStatus: null,
    lyricLicensedBy: null,
    blockers: evaluation.blockers,
    rightsState: evaluation.rights_state,
  };
}

export function RightsScreen() {
  const [data,     setData]     = useState<EvaluateResponse | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [editing,  setEditing]  = useState<EvaluatedTrack | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/rights/evaluate`);
      if (!res.ok) throw new Error(`Server ${res.status}`);
      const body = (await res.json()) as EvaluateResponse;
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load rights data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onSaved = (_r: RightsSaveResult) => {
    setEditing(null);
    void load(); // real recompute — card lands wherever the state machine puts it
  };

  if (loading) {
    return (
      <div className="stub-screen">
        <div className="sv-eyebrow amber" style={{ marginBottom: 10 }}>Rights Resolution</div>
        <h2 className="sv-display">Clearance is a <em>pipeline,</em> not a spreadsheet.</h2>
        <p className="sv-narrative" style={{ marginTop: 12 }}>Loading rights state for every track…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="stub-screen">
        <div className="sv-eyebrow amber" style={{ marginBottom: 10 }}>Rights Resolution</div>
        <h2 className="sv-display">Clearance is a <em>pipeline,</em> not a spreadsheet.</h2>
        <p className="sv-narrative" style={{ marginTop: 12, color: C.bad }}>{error ?? 'No data.'}</p>
        <button type="button" onClick={() => void load()} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 9, background: `linear-gradient(135deg,${C.purple},${C.magenta})`, border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    );
  }

  if (data.track_count === 0) {
    return (
      <div className="stub-screen">
        <div className="sv-eyebrow amber" style={{ marginBottom: 10 }}>Rights Resolution</div>
        <h2 className="sv-display">Clearance is a <em>pipeline,</em> not a spreadsheet.</h2>
        <p className="sv-narrative" style={{ marginTop: 12 }}>
          No tracks in the system yet. Once you analyze candidates, every one lands here — grouped by its real, deterministically computed clearance state.
        </p>
      </div>
    );
  }

  const byState = (s: RightsState) => data.tracks.filter(t => t.evaluation.rights_state === s);

  return (
    <div className="ws2-page">
      <div style={{ marginBottom: 20 }}>
        <div className="sv-eyebrow amber">Rights Resolution</div>
        <h2 className="sv-display" style={{ fontSize: 'clamp(26px,3vw,38px)', marginTop: 8 }}>
          Clearance is a <em>pipeline,</em> not a spreadsheet.
        </h2>
        <p className="sv-narrative" style={{ marginTop: 10, maxWidth: 640 }}>
          Every track in the system, grouped by its real clearance state — computed by the deterministic rights state machine (engine {data.engine_version}), not entered by hand. Click a card to fill in what's missing; it moves on its own once the state actually changes.
        </p>
        <p style={{ marginTop: 10, maxWidth: 640, fontSize: 11, color: 'rgba(155,147,196,0.6)' }}>
          SyncVision organizes decision and rights evidence. It does not provide legal advice or final music clearance.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8 }}>
        {COLUMNS.map(col => {
          const tracks = byState(col.state);
          return (
            <div key={col.state} style={{ flex: '0 0 260px', minWidth: 260 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '2px 4px 10px', borderBottom: `2px solid ${col.tone}55` }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: col.tone, fontFamily: SANS }}>{col.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.silver, background: `${col.tone}22`, borderRadius: 999, padding: '1px 8px' }}>{tracks.length}</span>
              </div>
              <div style={{ fontSize: 10, fontFamily: SERIF, fontStyle: 'italic', color: 'rgba(155,147,196,0.55)', margin: '6px 4px 10px' }}>{col.blurb}</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tracks.length === 0 && (
                  <div style={{ padding: '14px 10px', textAlign: 'center', fontSize: 10.5, fontFamily: SERIF, fontStyle: 'italic', color: 'rgba(155,147,196,0.4)', border: `1px dashed ${C.hairline}`, borderRadius: 10 }}>
                    Empty
                  </div>
                )}
                {tracks.map(t => {
                  const isOpen = expanded === t.audio_id;
                  return (
                    <div key={t.audio_id} style={{ borderRadius: 12, border: `1px solid ${isOpen ? col.tone + '66' : C.hairline}`, background: 'rgba(0,0,0,0.25)', overflow: 'hidden' }}>
                      <button
                        type="button"
                        onClick={() => setEditing(t)}
                        style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                      >
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: C.silver, fontFamily: SANS, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                        <div style={{ fontSize: 10.5, color: C.lavender, fontFamily: SERIF, fontStyle: 'italic', marginTop: 2 }}>{t.artistName ?? 'Unknown artist'}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                          <div style={{ flex: 1, height: 3, borderRadius: 999, background: 'rgba(123,112,178,0.15)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.round(t.evaluation.confidence_score * 100)}%`, background: col.tone }} />
                          </div>
                          <span style={{ fontSize: 9.5, fontFamily: MONO, color: col.tone }}>{Math.round(t.evaluation.confidence_score * 100)}%</span>
                        </div>
                        {t.evaluation.blockers.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 7 }}>
                            {t.evaluation.blockers.slice(0, 2).map(b => (
                              <span key={b} style={{ fontSize: 8, fontWeight: 700, color: C.bad, background: 'rgba(232,90,90,0.10)', border: '1px solid rgba(232,90,90,0.3)', borderRadius: 999, padding: '2px 6px' }}>
                                {BLOCKER_LABELS[b] ?? b}
                              </span>
                            ))}
                            {t.evaluation.blockers.length > 2 && (
                              <span style={{ fontSize: 8, color: 'rgba(155,147,196,0.6)', padding: '2px 4px' }}>+{t.evaluation.blockers.length - 2}</span>
                            )}
                          </div>
                        )}
                      </button>
                      <div style={{ borderTop: `1px solid ${C.hairline}`, padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <button
                          type="button"
                          onClick={() => setExpanded(v => v === t.audio_id ? null : t.audio_id)}
                          style={{ background: 'none', border: 'none', color: 'rgba(155,147,196,0.6)', fontSize: 9.5, cursor: 'pointer', padding: 0, fontFamily: SANS }}
                        >
                          {isOpen ? 'Hide reasoning ▴' : 'Why this state? ▾'}
                        </button>
                        <span style={{ fontFamily: MONO, fontSize: 8.5, color: 'rgba(155,147,196,0.4)' }} title={t.evaluation.audit_hash.hash}>
                          {t.evaluation.audit_hash.hash.slice(0, 8)}
                        </span>
                      </div>
                      {isOpen && (
                        <div style={{ padding: '8px 12px 12px', borderTop: `1px solid ${C.hairline}`, background: 'rgba(0,0,0,0.2)' }}>
                          <p style={{ fontSize: 10.5, fontFamily: SERIF, fontStyle: 'italic', color: 'rgba(226,232,240,0.7)', lineHeight: 1.5, margin: 0 }}>
                            {t.evaluation.clearance_summary}
                          </p>
                          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {t.evaluation.transition_trace.filter(tr => tr.triggered).map((tr, i) => (
                              <div key={i} style={{ fontSize: 9, fontFamily: MONO, color: col.tone }}>
                                ⦿ {tr.rule}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <div
          onClick={() => setEditing(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 20 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', borderRadius: 16, background: '#150C2E', border: `1px solid ${C.hairlineStrong}`, padding: 20 }}>
            <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 700, color: C.silver, fontFamily: SANS }}>{editing.title}</div>
            <div style={{ marginBottom: 14, fontSize: 11, color: C.lavender, fontFamily: SERIF, fontStyle: 'italic' }}>{editing.artistName ?? 'Unknown artist'}</div>
            <RightsPanel
              trackId={editing.audio_id}
              isrc={editing.isrc}
              existing={evalInputToRightsProfile(editing)}
              onSaved={onSaved}
              onClose={() => setEditing(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
