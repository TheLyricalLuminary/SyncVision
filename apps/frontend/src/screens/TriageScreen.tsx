import { useMemo, useRef, useState } from 'react';
import { parseCueSheetCsv, cueSheetTemplateCsv, type CueSheetRow } from '../engine/cueSheet';
import { runTriage, worklistToCsv, type TriageRow } from '../engine/triageEngine';

/**
 * Project Triage — batch clearance risk across an entire locked cut.
 *
 * The single-scene workspace proves the arc-match engine works. This proves
 * it scales to what a supervisor's job actually is: a cue sheet of 50–200
 * scenes, each with a temp that may or may not clear, ranked by what's
 * actually at risk (rights status × budget exposure × days to lock) with a
 * pre-matched clearable swap ready for the ones that need one.
 */

const C = {
  purple:  '#F5A623',
  magenta: '#DB2777',
  silver:  '#F4F2FA',
  lavender:'#9B93C4',
  amber:   '#F5B544',
  good:    '#4CAF82',
  warn:    '#F5B544',
  bad:     '#E85A5A',
  hairline:'rgba(123,112,178,0.16)',
  hairlineStrong:'rgba(123,112,178,0.30)',
};
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS  = '"Manrope", system-ui, sans-serif';
const MONO  = '"JetBrains Mono", monospace';

function tierColor(tier: 'high' | 'medium' | 'low'): string {
  return tier === 'high' ? C.bad : tier === 'medium' ? C.warn : C.good;
}

function money(n: number | null): string {
  if (n == null) return '—';
  return `$${n.toLocaleString('en-US')}`;
}

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function TriageScreen() {
  const [rawRows,   setRawRows]   = useState<CueSheetRow[] | null>(null);
  const [warnings,  setWarnings]  = useState<string[]>([]);
  const [results,   setResults]   = useState<TriageRow[] | null>(null);
  const [progress,  setProgress]  = useState<{ done: number; total: number } | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [expanded,  setExpanded]  = useState<string | null>(null);
  const [parseErr,  setParseErr]  = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleParsed = (text: string) => {
    const { rows, warnings: w } = parseCueSheetCsv(text);
    if (rows.length === 0) {
      setParseErr(w[0] ?? 'No rows found.');
      return;
    }
    setParseErr(null);
    setRawRows(rows);
    setWarnings(w);
    setResults(null);
  };

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => handleParsed(String(reader.result ?? ''));
    reader.readAsText(file);
  };

  const runIt = async () => {
    if (!rawRows) return;
    setProgress({ done: 0, total: rawRows.length });
    const out = await runTriage(rawRows, (done, total) => setProgress({ done, total }));
    setResults(out);
    setProgress(null);
  };

  const reset = () => {
    setRawRows(null); setResults(null); setWarnings([]); setPasteText(''); setParseErr(null); setProgress(null);
  };

  const summary = useMemo(() => {
    if (!results) return null;
    const high = results.filter(r => r.risk.tier === 'high').length;
    const medium = results.filter(r => r.risk.tier === 'medium').length;
    const exposedBudget = results
      .filter(r => r.risk.tier !== 'low')
      .reduce((sum, r) => sum + (r.input.budgetUsd ?? 0), 0);
    const matched = results.filter(r => r.topMatches.length > 0).length;
    return { high, medium, exposedBudget, matched, total: results.length };
  }, [results]);

  return (
    <div className="ws2-page no-print-margins">
      <div style={{ marginBottom: 22 }}>
        <div className="sv-eyebrow amber">Project Triage</div>
        <h2 className="sv-display" style={{ fontSize: 'clamp(28px,3.2vw,42px)', marginTop: 8 }}>
          Your whole cut, <em>ranked by risk.</em>
        </h2>
        <p className="sv-narrative" style={{ marginTop: 10, maxWidth: 620 }}>
          Drop in the cue sheet you already have — scene, temp, rights status, budget, deadline. Every row gets a transparent risk score and, where there's a scene description to work from, a pre-matched clearable swap. Ranked so you know which fires to put out first.
        </p>
      </div>

      {!rawRows && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 }}>
          <label style={{ display: 'grid', placeItems: 'center', gap: 6, padding: '30px 18px', borderRadius: 14, border: `1.5px dashed ${C.hairlineStrong}`, cursor: 'pointer', textAlign: 'center', background: 'rgba(0,0,0,0.2)' }}>
            <span style={{ fontSize: 22 }}>📋</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.silver, fontFamily: SANS }}>Upload a cue sheet (CSV)</span>
            <span style={{ fontSize: 10.5, color: C.lavender, fontFamily: SERIF, fontStyle: 'italic' }}>
              Exported from Excel, Sheets, or your music editor's cue log
            </span>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: C.hairline }} />
            <span style={{ fontSize: 10, color: C.lavender, fontFamily: MONO }}>or paste CSV</span>
            <div style={{ flex: 1, height: 1, background: C.hairline }} />
          </div>

          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder="scene,description,temp_artist,temp_title,rights_status,budget_usd,days_to_lock&#10;12A - INT. DINER - NIGHT,...,Hans Zimmer,Time,unclear,4500,9"
            rows={5}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.3)', border: `1px solid ${C.hairline}`, color: C.silver, fontSize: 11.5, fontFamily: MONO, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              disabled={!pasteText.trim()}
              onClick={() => handleParsed(pasteText)}
              style={{ padding: '9px 16px', borderRadius: 9, background: pasteText.trim() ? `linear-gradient(135deg,${C.purple},${C.magenta})` : 'rgba(123,112,178,0.15)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: pasteText.trim() ? 'pointer' : 'not-allowed' }}
            >
              Parse pasted CSV
            </button>
            <button
              type="button"
              onClick={() => downloadBlob('syncvision-cue-sheet-template.csv', cueSheetTemplateCsv(), 'text/csv')}
              style={{ padding: '9px 14px', borderRadius: 9, background: 'transparent', border: `1px solid ${C.hairlineStrong}`, color: C.lavender, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
            >
              Download template
            </button>
          </div>

          {parseErr && (
            <div style={{ padding: '9px 12px', borderRadius: 8, background: 'rgba(232,90,90,0.10)', border: '1px solid rgba(232,90,90,0.35)', color: C.bad, fontSize: 11.5, fontFamily: SANS }}>
              {parseErr}
            </div>
          )}
        </div>
      )}

      {rawRows && !results && (
        <div style={{ maxWidth: 640 }}>
          <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(0,0,0,0.25)', border: `1px solid ${C.hairline}`, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.silver, fontFamily: SANS }}>
              {rawRows.length} scene{rawRows.length === 1 ? '' : 's'} loaded
            </div>
            {warnings.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 10.5, color: C.warn, fontFamily: SANS, lineHeight: 1.5 }}>
                {warnings.slice(0, 4).join(' · ')}{warnings.length > 4 ? ` · +${warnings.length - 4} more` : ''}
              </div>
            )}
            <div style={{ marginTop: 6, fontSize: 10.5, color: 'rgba(155,147,196,0.6)', fontFamily: SERIF, fontStyle: 'italic' }}>
              Rows with a scene description get an arc-matched clearable swap. Rows without one still get a risk score.
            </div>
          </div>

          {progress ? (
            <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(0,0,0,0.25)', border: `1px solid ${C.hairline}` }}>
              <div style={{ fontSize: 11.5, color: C.lavender, fontFamily: MONO, marginBottom: 8 }}>
                Matching scene {progress.done} / {progress.total}…
              </div>
              <div style={{ height: 6, borderRadius: 999, background: 'rgba(123,112,178,0.15)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(progress.done / progress.total) * 100}%`, background: `linear-gradient(90deg,${C.purple},${C.magenta})`, transition: 'width 0.2s' }} />
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => void runIt()} style={{ padding: '10px 20px', borderRadius: 9, background: `linear-gradient(135deg,${C.purple},${C.magenta})`, border: 'none', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                Run Triage
              </button>
              <button type="button" onClick={reset} style={{ padding: '10px 16px', borderRadius: 9, background: 'transparent', border: `1px solid ${C.hairlineStrong}`, color: C.lavender, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                Start over
              </button>
            </div>
          )}
        </div>
      )}

      {results && summary && (
        <>
          <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px,1fr))', gap: 10, marginBottom: 16 }}>
            <StatTile label="Scenes" value={String(summary.total)} tone={C.silver} />
            <StatTile label="High risk" value={String(summary.high)} tone={C.bad} />
            <StatTile label="Medium risk" value={String(summary.medium)} tone={C.warn} />
            <StatTile label="Budget at risk" value={money(summary.exposedBudget)} tone={C.amber} />
            <StatTile label="Matched to a swap" value={`${summary.matched}/${summary.total}`} tone={C.good} />
          </div>

          <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => downloadBlob('syncvision-worklist.csv', worklistToCsv(results), 'text/csv')} style={{ padding: '8px 14px', borderRadius: 9, background: 'transparent', border: `1px solid ${C.hairlineStrong}`, color: C.silver, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              Download worklist (CSV)
            </button>
            <button type="button" onClick={() => window.print()} style={{ padding: '8px 14px', borderRadius: 9, background: 'transparent', border: `1px solid ${C.hairlineStrong}`, color: C.silver, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              Print / Save as PDF
            </button>
            <button type="button" onClick={reset} style={{ padding: '8px 14px', borderRadius: 9, background: 'transparent', border: `1px solid ${C.hairline}`, color: C.lavender, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              New cue sheet
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {results.map(r => (
              <TriageRowCard key={r.input.id} row={r} expanded={expanded === r.input.id} onToggle={() => setExpanded(id => id === r.input.id ? null : r.input.id)} />
            ))}
          </div>
        </>
      )}

      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 12mm; }
          .no-print { display: none !important; }
          html, body { background: #fff !important; }
          body::before, body::after { display: none !important; }
          .ws2-page { max-width: none !important; padding: 0 !important; background: #fff !important; }
          .ws2-page, .ws2-page * { color: #16121f !important; background: #fff !important; border-color: #d8d3e6 !important; box-shadow: none !important; }
          .ws2-page * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div style={{ padding: '11px 13px', borderRadius: 12, background: 'rgba(0,0,0,0.25)', border: `1px solid ${C.hairline}` }}>
      <div style={{ fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(155,147,196,0.6)', fontFamily: SANS, fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: SERIF, fontSize: 24, color: tone, marginTop: 3, letterSpacing: '-0.02em' }}>{value}</div>
    </div>
  );
}

function TriageRowCard({ row, expanded, onToggle }: { row: TriageRow; expanded: boolean; onToggle: () => void }) {
  const best = row.topMatches[0];
  const tone = tierColor(row.risk.tier);

  return (
    <div style={{ borderRadius: 12, border: `1px solid ${expanded ? tone + '55' : C.hairline}`, overflow: 'hidden', background: 'rgba(0,0,0,0.2)' }}>
      <button type="button" onClick={onToggle} style={{ width: '100%', display: 'grid', gridTemplateColumns: '54px 1.4fr 1fr 1.6fr', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <span style={{ fontFamily: SERIF, fontSize: 20, color: tone, letterSpacing: '-0.02em' }}>{row.risk.total}</span>
          <span style={{ fontSize: 7.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: tone, fontWeight: 700, fontFamily: SANS }}>{row.risk.tier}</span>
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.silver, fontFamily: SANS, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.input.scene}</div>
          <div style={{ fontSize: 10.5, color: C.lavender, fontFamily: SERIF, fontStyle: 'italic', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {row.input.tempArtist || row.input.tempTitle ? `${row.input.tempArtist}${row.input.tempArtist && row.input.tempTitle ? ' — ' : ''}${row.input.tempTitle}` : 'No temp listed'}
          </div>
        </div>

        <div>
          <RightsBadge status={row.input.rightsStatus} />
          <div style={{ fontSize: 10, color: 'rgba(226,232,240,0.55)', fontFamily: MONO, marginTop: 4 }}>
            {money(row.input.budgetUsd)}{row.input.daysToLock != null ? ` · ${row.input.daysToLock}d to lock` : ''}
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          {best ? (
            <>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: C.good, fontFamily: SANS, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {best.matchPct}% — {best.track.title}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(155,147,196,0.6)', fontFamily: SERIF, fontStyle: 'italic', marginTop: 2 }}>
                {best.track.artist} · {best.track.license}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 10.5, color: 'rgba(155,147,196,0.45)', fontFamily: SERIF, fontStyle: 'italic' }}>
              Add a scene description to match
            </div>
          )}
        </div>
      </button>

      {expanded && (
        <div style={{ padding: '2px 16px 14px', borderTop: `1px solid ${C.hairline}` }}>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 12, marginBottom: 10 }}>
            <RiskChip label="Rights" value={row.risk.rights} max={55} />
            <RiskChip label="Budget" value={row.risk.budget} max={25} />
            <RiskChip label="Urgency" value={row.risk.urgency} max={25} />
          </div>

          {row.topMatches.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {row.topMatches.map((m, i) => (
                <div key={m.track.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderRadius: 9, background: 'rgba(0,0,0,0.25)', border: `1px solid ${C.hairline}` }}>
                  <span style={{ fontSize: 11, color: C.lavender, fontFamily: MONO, width: 16 }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 12, color: C.silver, fontFamily: SANS, fontWeight: 600 }}>{m.track.title} <span style={{ color: C.lavender, fontWeight: 400 }}>— {m.track.artist}</span></span>
                  <span style={{ fontSize: 11, color: C.good, fontFamily: MONO, fontWeight: 700 }}>{m.matchPct}%</span>
                  <span style={{ fontSize: 10, color: 'rgba(226,232,240,0.55)', fontFamily: MONO }}>{m.track.clearanceCostUsd === 0 ? 'free' : `$${m.track.clearanceCostUsd}`}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 11, color: 'rgba(155,147,196,0.55)', fontFamily: SERIF, fontStyle: 'italic' }}>
              No scene description in the cue sheet for this row — nothing to classify against, so no swap was fabricated. Add one and re-run to get a match.
            </p>
          )}

          {row.input.timecode && (
            <div style={{ marginTop: 10, fontSize: 10, color: 'rgba(155,147,196,0.5)', fontFamily: MONO }}>TC {row.input.timecode}</div>
          )}
        </div>
      )}
    </div>
  );
}

function RiskChip({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div style={{ minWidth: 90 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(155,147,196,0.6)', fontFamily: MONO, marginBottom: 3 }}>
        <span>{label}</span><span>{value}</span>
      </div>
      <div style={{ height: 4, borderRadius: 999, background: 'rgba(123,112,178,0.15)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(value / max) * 100}%`, background: C.purple }} />
      </div>
    </div>
  );
}

function RightsBadge({ status }: { status: CueSheetRow['rightsStatus'] }) {
  const map = {
    cleared: { label: 'Cleared', color: C.good },
    pending: { label: 'Pending', color: C.warn },
    unclear: { label: 'Unclear', color: C.bad },
    unknown: { label: 'Unknown', color: C.lavender },
  } as const;
  const s = map[status];
  return (
    <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', color: s.color, background: `${s.color}1a`, border: `1px solid ${s.color}55`, borderRadius: 999, padding: '2px 7px' }}>
      {s.label}
    </span>
  );
}
