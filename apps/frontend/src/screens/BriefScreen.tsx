import { useEffect, useState, useRef } from 'react';
import { classifyBrief, BRIEF_LABELS, type BriefId } from '../engine/classifyBrief';
import type { SceneParams } from '../utils/apiClient';

const C = {
  purple:        '#7C3AED',
  magenta:       '#DB2777',
  silver:        '#E2E8F0',
  lavender:      '#A78BFA',
  hairline:      'rgba(167, 139, 250, 0.14)',
  hairlineStrong:'rgba(167, 139, 250, 0.22)',
  bg:            '#0F0823',
};

const SERIF = '"Instrument Serif", Georgia, serif';
const SANS  = '"Manrope", system-ui, sans-serif';
const BG_GRADIENT = `radial-gradient(1200px 700px at 18% 0%, rgba(124,58,237,0.18), transparent 60%), radial-gradient(900px 600px at 82% 100%, rgba(219,39,119,0.10), transparent 60%), #06030F`;

const EXAMPLES = [
  'Two estranged brothers reconnect at a funeral.',
  'Late-night highway escape after betrayal.',
  'First kiss after emotional collapse.',
  'Team walks into impossible final battle.',
];

const PACING_OPTIONS: Array<{ value: SceneParams['pacing']; label: string; desc: string }> = [
  { value: 'slow',    label: 'Slow',    desc: 'restrained, emotional, atmospheric' },
  { value: 'mid',     label: 'Medium',  desc: 'conversational, building momentum' },
  { value: 'driving', label: 'Driving', desc: 'kinetic, urgent, forward motion' },
];

const MOOD_FAMILIES: Array<{ name: string; moods: string[]; isStyle?: boolean }> = [
  { name: 'Connection', moods: ['Intimate', 'Romantic', 'Vulnerable', 'Yearning'] },
  { name: 'Conflict',   moods: ['Tense', 'Defiant', 'Desperate', 'Eerie'] },
  { name: 'Resolution', moods: ['Hopeful', 'Triumphant', 'Euphoric', 'Serene'] },
  { name: 'Memory',     moods: ['Nostalgic', 'Bittersweet', 'Melancholic'] },
  { name: 'Style modifiers', moods: ['Cinematic', 'Playful'], isStyle: true },
];


const MOOD_ADJ: Record<string, string> = {
  Intimate: 'intimate', Romantic: 'romantic', Vulnerable: 'vulnerable', Yearning: 'yearning',
  Tense: 'tense', Defiant: 'defiant', Desperate: 'desperate', Eerie: 'eerie',
  Hopeful: 'hopeful', Triumphant: 'triumphant', Euphoric: 'euphoric', Serene: 'serene',
  Nostalgic: 'nostalgic', Bittersweet: 'bittersweet', Melancholic: 'melancholic',
  Cinematic: 'cinematic', Playful: 'playful',
};

const MOOD_NOUN: Record<string, string> = {
  Intimate: 'intimacy', Romantic: 'romance', Vulnerable: 'vulnerability', Yearning: 'longing',
  Tense: 'tension', Defiant: 'defiance', Desperate: 'desperation', Eerie: 'unease',
  Hopeful: 'hope', Triumphant: 'triumph', Euphoric: 'euphoria', Serene: 'serenity',
  Nostalgic: 'nostalgia', Bittersweet: 'bittersweetness', Melancholic: 'melancholy',
  Cinematic: 'grandeur', Playful: 'levity',
};

const DRIVING_ACTION: Record<string, string> = {
  Tense: 'escape', Defiant: 'standoff', Desperate: 'pursuit', Eerie: 'unraveling',
  Triumphant: 'breakthrough', Euphoric: 'surge', Hopeful: 'push',
  Intimate: 'reckoning', Romantic: 'collision', Vulnerable: 'unraveling',
  Yearning: 'pursuit', Serene: 'descent', Nostalgic: 'return',
  Bittersweet: 'departure', Melancholic: 'spiral', Cinematic: 'charge', Playful: 'chase',
};

function buildSynthesis(pacing: SceneParams['pacing'], moods: string[]): string | null {
  if (!pacing && moods.length === 0) return null;
  const adj    = (m: string) => MOOD_ADJ[m]       ?? m.toLowerCase();
  const noun   = (m: string) => MOOD_NOUN[m]      ?? m.toLowerCase();
  const action = (m: string) => DRIVING_ACTION[m] ?? 'charge';

  if (!pacing) {
    if (moods.length === 1) return `Scene with ${adj(moods[0])} coloring — pacing unspecified.`;
    return `${adj(moods[0]).charAt(0).toUpperCase()}${adj(moods[0]).slice(1)} ${noun(moods[1])} — pacing unspecified.`;
  }

  if (pacing === 'slow') {
    if (moods.length === 0) return `Slow-burning scene — restrained emotional weight, direction unspecified.`;
    if (moods.length === 1) return `Slow-burning scene with ${adj(moods[0])} coloring — restrained emotional weight.`;
    return `Slow-burning ${adj(moods[0])} tension with ${adj(moods[1])} emotional release.`;
  }

  if (pacing === 'driving') {
    if (moods.length === 0) return `High-stakes urgent scene — kinetic energy, direction unspecified.`;
    if (moods.length === 1) return `High-stakes ${adj(moods[0])} scene — urgent forward energy.`;
    return `High-stakes urgent ${action(moods[0])} with ${adj(moods[1])} intensity.`;
  }

  // mid
  if (moods.length === 0) return `Measured scene — building momentum, direction unspecified.`;
  if (moods.length === 1) return `Conversational scene with ${adj(moods[0])} build — measured momentum.`;
  return `Conversational ${noun(moods[1])} building toward ${adj(moods[0])} resolution.`;
}

function SvLogo() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, letterSpacing: '-0.01em', fontFamily: SANS }}>
      <span className="sv-glyph" style={{ width: 22, height: 22, borderRadius: 7, position: 'relative', flexShrink: 0, background: `conic-gradient(from 210deg at 50% 50%, ${C.purple}, ${C.magenta}, ${C.purple})`, boxShadow: '0 0 0 1px rgba(255,255,255,0.06) inset' }} />
      <span style={{ fontSize: 15 }}><b>SyncVision</b></span>
    </span>
  );
}

function SectionLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span>{label}</span>
      {hint && (
        <span style={{ color: 'rgba(167,139,250,0.5)', letterSpacing: '0.06em', textTransform: 'none', fontStyle: 'italic', fontFamily: SERIF, fontSize: 12 }}>
          {hint}
        </span>
      )}
    </div>
  );
}

type BriefScreenProps = {
  initialBriefText?: string;
  initialSceneParams?: SceneParams;
  onContinue: (args: { briefText: string; briefId: BriefId; sceneParams: SceneParams }) => void;
};

export function BriefScreen({ initialBriefText, initialSceneParams, onContinue }: BriefScreenProps) {
  const [briefText, setBriefText]   = useState(initialBriefText ?? '');
  const [pacing, setPacing]         = useState<SceneParams['pacing']>(initialSceneParams?.pacing ?? null);
  const [selectedMoods, setSelectedMoods] = useState<string[]>(
    initialSceneParams?.emotionalRegister ? initialSceneParams.emotionalRegister.split(', ') : [],
  );
  const [sceneLengthSec, setSceneLengthSec] = useState<string>(
    initialSceneParams?.sceneLengthSec != null ? String(initialSceneParams.sceneLengthSec) : '',
  );
  const [detectedBriefId, setDetectedBriefId] = useState<BriefId | null>(null);
  const [exampleIdx, setExampleIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (briefText.trim().length < 10) { setDetectedBriefId(null); return; }
    const handle = window.setTimeout(() => setDetectedBriefId(classifyBrief(briefText)), 500);
    return () => window.clearTimeout(handle);
  }, [briefText]);

  const realWordCount = briefText.trim()
    ? briefText.trim().split(/\s+/).filter(w => w.length >= 2).length
    : 0;
  const canContinue = briefText.trim().length >= 10 && realWordCount >= 2;

  const handleSubmit = () => {
    if (!canContinue) return;
    const briefId = classifyBrief(briefText) ?? 'montage-transition';
    const parsedLen = sceneLengthSec.trim() ? Number(sceneLengthSec) : null;
    onContinue({
      briefText: briefText.trim(),
      briefId,
      sceneParams: {
        pacing,
        emotionalRegister: selectedMoods.length > 0 ? selectedMoods.join(', ') : null,
        sceneLengthSec: parsedLen != null && !Number.isNaN(parsedLen) ? parsedLen : null,
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
  };

  const toggleMood = (mood: string) => {
    setSelectedMoods(prev => prev.includes(mood) ? prev.filter(m => m !== mood) : [...prev, mood]);
  };

  const cycleExample = () => setExampleIdx(i => (i + 1) % EXAMPLES.length);

  const wordCount = briefText.trim() ? briefText.trim().split(/\s+/).length : 0;
  const synthesis = buildSynthesis(pacing, selectedMoods);

  return (
    <div style={{ minHeight: '100vh', fontFamily: SANS, WebkitFontSmoothing: 'antialiased', color: C.silver, background: BG_GRADIENT, display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes sv-caret { 50% { opacity: 0; } }
        .sv-caret::after { content: ''; display: inline-block; width: 1.5px; height: 13px; background: ${C.magenta}; margin-left: 2px; vertical-align: -2px; animation: sv-caret 1s steps(2) infinite; }
      `}</style>

      <div style={{ maxWidth: 520, width: '100%', margin: '0 auto', padding: '8px 20px 28px', display: 'flex', flexDirection: 'column', flex: 1 }}>

        {/* ── header ── */}
        <div style={{ padding: '16px 4px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.hairline}`, flexShrink: 0 }}>
          <SvLogo />
          <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.lavender, padding: '4px 10px', borderRadius: 999, background: 'rgba(167,139,250,0.08)', border: `1px solid ${C.hairline}`, whiteSpace: 'nowrap' }}>
            Step <b style={{ color: C.silver, fontWeight: 700 }}>1</b> of 3
          </span>
        </div>

        {/* ── body ── */}
        <div style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>

          {/* The Scene */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <SectionLabel label="The Scene" hint="tell the story in a line" />
            <div
              style={{ padding: '11px 14px 10px', borderRadius: 14, background: 'linear-gradient(180deg, rgba(124,58,237,0.10), rgba(124,58,237,0.02))', border: `1px solid ${C.hairline}`, position: 'relative', minHeight: 64 }}
              onClick={() => textareaRef.current?.focus()}
            >
              <textarea
                ref={textareaRef}
                value={briefText}
                onChange={e => setBriefText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe the emotional turn, what changes, and where the scene lands."
                style={{
                  width: '100%', background: 'transparent', border: 'none', outline: 'none',
                  resize: 'none', fontFamily: SERIF, fontStyle: 'italic', fontSize: 15,
                  lineHeight: 1.3, color: C.silver, letterSpacing: '-0.005em', minHeight: 60,
                  padding: 0, display: 'block',
                  caretColor: C.magenta,
                }}
              />
              {wordCount > 0 && (
                <div style={{ marginTop: 6, fontSize: 10, letterSpacing: '0.06em', color: C.lavender, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{wordCount} word{wordCount === 1 ? '' : 's'}{detectedBriefId ? ` · ${BRIEF_LABELS[detectedBriefId]}` : ''}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="number"
                      value={sceneLengthSec}
                      onChange={e => setSceneLengthSec(e.target.value)}
                      placeholder="—"
                      min={0}
                      style={{ width: 36, background: 'transparent', border: 'none', outline: 'none', color: C.lavender, fontSize: 10, letterSpacing: '0.06em', textAlign: 'right', fontFamily: SANS, MozAppearance: 'textfield', appearance: 'textfield' } as React.CSSProperties}
                    />
                    <span>sec</span>
                  </span>
                </div>
              )}
            </div>

            {/* rotating examples */}
            <div style={{ marginTop: 2, paddingLeft: 2, display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: C.lavender, overflow: 'hidden' }}>
              <span style={{ fontSize: 9, letterSpacing: '0.20em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.6)', flexShrink: 0 }}>Try</span>
              <span
                style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 13, color: C.silver, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0, cursor: 'pointer' }}
                onClick={() => { setBriefText(EXAMPLES[exampleIdx]); cycleExample(); }}
                title="Click to use this example"
              >
                &ldquo;{EXAMPLES[exampleIdx]}&rdquo;
              </span>
              <button
                type="button"
                onClick={cycleExample}
                aria-label="Next example"
                style={{ width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, background: 'rgba(167,139,250,0.10)', border: `1px solid ${C.hairline}`, color: C.lavender, cursor: 'pointer', padding: 0 }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M4 12 H20 M14 6 L20 12 L14 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>

          {/* Pacing */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <SectionLabel label="Pacing" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {PACING_OPTIONS.map(opt => {
                const on = pacing === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPacing(on ? null : opt.value)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px 8px 10px', borderRadius: 11,
                      background: on ? 'linear-gradient(135deg, rgba(124,58,237,0.22), rgba(219,39,119,0.10))' : 'transparent',
                      border: `1px solid ${on ? 'rgba(167,139,250,0.5)' : C.hairline}`,
                      boxShadow: on ? '0 0 0 1px rgba(124,58,237,0.16) inset, 0 6px 14px -6px rgba(124,58,237,0.4)' : 'none',
                      cursor: 'pointer', textAlign: 'left', fontFamily: SANS,
                    }}
                  >
                    <span style={{ width: 14, height: 14, borderRadius: '50%', border: `1.5px solid ${on ? C.magenta : C.hairlineStrong}`, flexShrink: 0, position: 'relative', display: 'inline-block' }}>
                      {on && <span style={{ position: 'absolute', inset: 2, borderRadius: '50%', background: C.magenta }} />}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, color: C.silver, fontWeight: 700, letterSpacing: '-0.005em', flexShrink: 0 }}>{opt.label}</span>
                      <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 12, color: on ? 'rgba(226,232,240,0.78)' : C.lavender, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mood families */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <SectionLabel label="Mood" hint="pick by feeling" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {MOOD_FAMILIES.map(family => (
                <div key={family.name} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.7)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: family.isStyle ? C.magenta : C.lavender, opacity: family.isStyle ? 0.7 : 0.5, display: 'inline-block', flexShrink: 0 }} />
                    {family.name}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {family.moods.map(mood => {
                      const on = selectedMoods.includes(mood);
                      return (
                        <button
                          key={mood}
                          type="button"
                          onClick={() => toggleMood(mood)}
                          style={{
                            fontSize: 11.5, fontWeight: 600, letterSpacing: '0.01em',
                            padding: '5px 10px', borderRadius: 999,
                            background: on ? 'linear-gradient(135deg, rgba(124,58,237,0.32), rgba(219,39,119,0.22))' : 'transparent',
                            color: C.silver,
                            border: `1px solid ${on ? 'rgba(167,139,250,0.55)' : C.hairlineStrong}`,
                            boxShadow: on ? '0 0 0 1px rgba(124,58,237,0.18) inset' : 'none',
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: SANS,
                          }}
                        >
                          {on && <span style={{ width: 4, height: 4, borderRadius: '50%', background: C.magenta, flexShrink: 0 }} />}
                          {mood}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Synthesis preview */}
          {synthesis && (
            <div style={{ padding: '11px 12px', borderRadius: 12, background: 'linear-gradient(180deg, rgba(219,39,119,0.16), rgba(124,58,237,0.10) 50%, rgba(124,58,237,0.04))', border: '1px solid rgba(219,39,119,0.32)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: `linear-gradient(180deg, ${C.magenta}, ${C.purple})` }} />
              <div style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.magenta, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 2 L14.5 9.5 L22 12 L14.5 14.5 L12 22 L9.5 14.5 L2 12 L9.5 9.5 Z" fill="currentColor" /></svg>
                Creative direction
              </div>
              <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 15, lineHeight: 1.3, color: C.silver, letterSpacing: '-0.005em' }}>
                {synthesis}
              </div>
            </div>
          )}

        </div>

        {/* ── CTA ── */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canContinue}
          style={{
            marginTop: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: 13, borderRadius: 13,
            background: canContinue ? `linear-gradient(135deg, ${C.purple}, ${C.magenta})` : 'rgba(167,139,250,0.10)',
            color: canContinue ? 'white' : C.lavender,
            fontWeight: 700, fontSize: 14, letterSpacing: '0.01em',
            border: canContinue ? 'none' : `1px solid ${C.hairlineStrong}`,
            boxShadow: canContinue ? '0 16px 30px -12px rgba(124,58,237,0.55), 0 0 0 1px rgba(255,255,255,0.06) inset' : 'none',
            cursor: canContinue ? 'pointer' : 'not-allowed',
            fontFamily: SANS,
            position: 'relative', overflow: 'hidden',
          }}
        >
          Continue to upload
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 12 H19 M13 6 L19 12 L13 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

      </div>
    </div>
  );
}
