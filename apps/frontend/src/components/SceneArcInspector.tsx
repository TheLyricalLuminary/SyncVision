import { useEffect, useMemo, useState } from 'react';
import type { SceneArc, ArcPhases } from '../utils/apiClient';

/**
 * SceneArcInspector — the deterministic Scene Arc, presented as an INSPECTOR
 * (not a graph): four phase values, the detected signals (each traceable to the
 * rule that fired), and a narrative-certainty readout. Supervisors can manually
 * adjust any phase value; adjustments are surfaced to the parent.
 */

const C = {
  purple: '#F5A623',
  magenta: '#DB2777',
  silver: '#F4F2FA',
  lavender: '#9B93C4',
  amber: '#F5B544',
  good: '#4CAF82',
  hairline: 'rgba(123, 112, 178, 0.16)',
  hairlineStrong: 'rgba(123, 112, 178, 0.30)',
};
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS = '"Manrope", system-ui, sans-serif';
const MONO = '"JetBrains Mono", monospace';

const PHASES: Array<{ key: keyof ArcPhases; label: string }> = [
  { key: 'opening', label: 'Opening' },
  { key: 'heldBreath', label: 'Held Breath' },
  { key: 'turn', label: 'Turn' },
  { key: 'release', label: 'Release' },
];

function valenceColor(v: number): string {
  if (v > 12) return C.amber; // bright / uplifting
  if (v < -12) return '#7C83C4'; // dark / heavy
  return C.lavender; // neutral
}

type Props = {
  arc: SceneArc | null;
  loading?: boolean;
  onAdjustedChange?: (phases: ArcPhases | null) => void;
};

export function SceneArcInspector({ arc, loading, onAdjustedChange }: Props) {
  const [overrides, setOverrides] = useState<Partial<ArcPhases>>({});

  // Reset manual overrides whenever the underlying extraction changes.
  useEffect(() => {
    setOverrides({});
  }, [arc?.inputHash]);

  const phaseValue = (key: keyof ArcPhases): number =>
    overrides[key] ?? (arc ? arc[key] : 0);

  const edited = Object.keys(overrides).length > 0;

  const adjusted: ArcPhases | null = useMemo(() => {
    if (!arc) return null;
    return {
      opening: phaseValue('opening'),
      heldBreath: phaseValue('heldBreath'),
      turn: phaseValue('turn'),
      release: phaseValue('release'),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arc, overrides]);

  useEffect(() => {
    onAdjustedChange?.(adjusted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjusted]);

  const certaintyPct = arc ? Math.round(arc.narrativeCertainty * 100) : 0;
  const hasArc = !!arc && arc.signals.length > 0;

  return (
    <div
      className="sv-card"
      style={{
        borderRadius: 18,
        background: 'linear-gradient(180deg,rgba(23,11,51,0.55),rgba(15,8,35,0.72))',
        border: `1px solid ${C.hairline}`,
        padding: '18px 20px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <span style={{ fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: C.lavender, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 18, height: 1, background: `linear-gradient(90deg,${C.magenta},transparent)`, display: 'inline-block' }} />
          Scene Arc
        </span>
        {hasArc && (
          <span title="How much rule-based narrative signal was found in the text"
            style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.lavender, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Narrative Certainty
            <b style={{ fontFamily: MONO, fontSize: 12, color: certaintyPct >= 70 ? C.good : C.amber, fontWeight: 700 }}>{certaintyPct}%</b>
          </span>
        )}
      </div>

      {/* empty / loading states */}
      {!hasArc && (
        <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 15, color: 'rgba(123,112,178,0.7)', padding: '6px 0 2px' }}>
          {loading
            ? 'Reading the scene…'
            : 'Describe the scene above — the emotional shape appears here as you write.'}
        </div>
      )}

      {hasArc && (
        <>
          {/* phase rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {PHASES.map(({ key, label }, i) => {
              const val = phaseValue(key);
              const isEdited = overrides[key] != null && overrides[key] !== arc![key];
              const vColor = valenceColor(arc!.valenceCurve[i] ?? 0);
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 92, flexShrink: 0, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.lavender }}>
                    {label}
                  </span>
                  {/* magnitude track (inspector aid, not a curve graph) */}
                  <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'rgba(123,112,178,0.12)', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${val}%`, background: `linear-gradient(90deg, ${vColor}, ${vColor}cc)`, borderRadius: 999, transition: 'width 220ms ease' }} />
                  </div>
                  {/* editable value */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: 60, justifyContent: 'flex-end' }}>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={val}
                      onChange={(e) => {
                        const n = Math.max(0, Math.min(100, Math.round(Number(e.target.value))));
                        setOverrides((prev) => ({ ...prev, [key]: Number.isNaN(n) ? arc![key] : n }));
                      }}
                      style={{
                        width: 42, textAlign: 'right', fontFamily: MONO, fontSize: 16,
                        fontWeight: 700, color: isEdited ? C.amber : C.silver, background: 'transparent',
                        border: 'none', borderBottom: `1px solid ${isEdited ? C.amber : 'transparent'}`,
                        outline: 'none', MozAppearance: 'textfield', appearance: 'textfield',
                      } as React.CSSProperties}
                      title="Click to manually adjust this phase"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {edited && (
            <button
              type="button"
              onClick={() => setOverrides({})}
              style={{ marginTop: 8, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.lavender, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              ↺ Reset to extracted
            </button>
          )}

          {/* detected signals */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.hairline}` }}>
            <div style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(123,112,178,0.7)', marginBottom: 8 }}>
              Detected Signals
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {arc!.events.map((ev) => (
                <span
                  key={ev.id}
                  title={`matched “${ev.matched}” · sentence ${ev.sentence}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px',
                    borderRadius: 999, fontSize: 11, fontWeight: 600, letterSpacing: '0.01em',
                    color: C.silver, background: 'rgba(76,175,130,0.10)', border: '1px solid rgba(76,175,130,0.22)',
                    cursor: 'default',
                  }}
                >
                  <span style={{ color: C.good, fontSize: 11 }}>✓</span>
                  {ev.label}
                </span>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 10, fontStyle: 'italic', fontFamily: SERIF, color: 'rgba(123,112,178,0.55)' }}>
              Every value traces to a rule. Hover a signal to see what matched.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
