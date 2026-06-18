import { useEffect, useState, useRef } from 'react';
import { classifyBrief, BRIEF_LABELS, type BriefId } from '../engine/classifyBrief';
import { extractSceneArc, type SceneParams, type SceneArc, type ArcPhases } from '../utils/apiClient';
import { SceneArcInspector } from '../components/SceneArcInspector';

const C = {
  purple:        '#F5A623',
  magenta:       '#DB2777',
  silver:        '#F4F2FA',
  lavender:      '#9B93C4',
  amber:         '#F5B544',
  hairline:      'rgba(123, 112, 178, 0.16)',
  hairlineStrong:'rgba(123, 112, 178, 0.30)',
  bg:            '#0D0B1E',
};

const SERIF = '"Instrument Serif", Georgia, serif';
const SANS  = '"Manrope", system-ui, sans-serif';
const BG_GRADIENT = `radial-gradient(900px 600px at 12% 8%, rgba(245,166,35,0.14), transparent 60%), radial-gradient(800px 500px at 95% 100%, rgba(221,122,58,0.10), transparent 60%), #0D0B1E`;

const EXAMPLES = [
  'Two estranged brothers reconnect at a funeral.',
  'Late-night highway escape after betrayal.',
  'First kiss after emotional collapse.',
  'Team walks into impossible final battle.',
  'Detective uncovers the last piece of a cold case.',
  'Athlete crosses the finish line after years of injury.',
  'A parent watches their child leave for the last time.',
  'Corporate whistleblower walks out the front door.',
  'War-torn couple separated at the border.',
  'Underdog team hits the court-winning shot.',
  'Soldier returns home to an empty house.',
  'Montage of a failing relationship — three years in two minutes.',
  'Opening title sequence — gritty urban crime drama.',
  'Faith community gathers after a tragedy.',
  'The heist goes wrong at the worst possible moment.',
];

const PACING_OPTIONS: Array<{ value: SceneParams['pacing']; label: string; desc: string }> = [
  { value: 'slow',    label: 'Slow',    desc: 'restrained, emotional, atmospheric' },
  { value: 'mid',     label: 'Medium',  desc: 'conversational, building momentum' },
  { value: 'driving', label: 'Driving', desc: 'kinetic, urgent, forward motion' },
];

// Equalizer animation speed per pacing — slower pace = slower bars.
const PACE_SPEED: Record<string, string> = { slow: '1.5s', mid: '0.95s', driving: '0.55s' };

const MOOD_FAMILIES: Array<{ name: string; moods: string[]; isStyle?: boolean }> = [
  { name: 'Connection',   moods: ['Intimate', 'Romantic', 'Vulnerable', 'Yearning', 'Tender', 'Longing'] },
  { name: 'Conflict',     moods: ['Tense', 'Defiant', 'Desperate', 'Eerie', 'Foreboding', 'Dread', 'Volatile'] },
  { name: 'Resolution',   moods: ['Hopeful', 'Triumphant', 'Euphoric', 'Serene', 'Cathartic', 'Redemptive'] },
  { name: 'Dark',         moods: ['Grief', 'Haunted', 'Numb', 'Rage', 'Sinister', 'Desolate'] },
  { name: 'Memory',       moods: ['Nostalgic', 'Bittersweet', 'Melancholic', 'Wistful', 'Reflective'] },
  { name: 'Energy',       moods: ['Urgent', 'Relentless', 'Pulse', 'Kinetic', 'Brooding', 'Sparse'] },
  { name: 'Style',        moods: ['Cinematic', 'Playful', 'Quirky', 'Epic', 'Gritty', 'Underscore'], isStyle: true },
];


const MOOD_ADJ: Record<string, string> = {
  Intimate: 'intimate', Romantic: 'romantic', Vulnerable: 'vulnerable', Yearning: 'yearning',
  Tender: 'tender', Longing: 'longing',
  Tense: 'tense', Defiant: 'defiant', Desperate: 'desperate', Eerie: 'eerie',
  Foreboding: 'foreboding', Dread: 'dread-laden', Volatile: 'volatile',
  Hopeful: 'hopeful', Triumphant: 'triumphant', Euphoric: 'euphoric', Serene: 'serene',
  Cathartic: 'cathartic', Redemptive: 'redemptive',
  Grief: 'grief-stricken', Haunted: 'haunted', Numb: 'numb', Rage: 'furious', Sinister: 'sinister', Desolate: 'desolate',
  Nostalgic: 'nostalgic', Bittersweet: 'bittersweet', Melancholic: 'melancholic', Wistful: 'wistful', Reflective: 'reflective',
  Urgent: 'urgent', Relentless: 'relentless', Pulse: 'pulsing', Kinetic: 'kinetic', Brooding: 'brooding', Sparse: 'sparse',
  Cinematic: 'cinematic', Playful: 'playful', Quirky: 'quirky', Epic: 'epic', Gritty: 'gritty', Underscore: 'understated',
};

const MOOD_NOUN: Record<string, string> = {
  Intimate: 'intimacy', Romantic: 'romance', Vulnerable: 'vulnerability', Yearning: 'longing',
  Tender: 'tenderness', Longing: 'longing',
  Tense: 'tension', Defiant: 'defiance', Desperate: 'desperation', Eerie: 'unease',
  Foreboding: 'dread', Dread: 'dread', Volatile: 'volatility',
  Hopeful: 'hope', Triumphant: 'triumph', Euphoric: 'euphoria', Serene: 'serenity',
  Cathartic: 'release', Redemptive: 'redemption',
  Grief: 'grief', Haunted: 'haunting', Numb: 'numbness', Rage: 'fury', Sinister: 'menace', Desolate: 'desolation',
  Nostalgic: 'nostalgia', Bittersweet: 'bittersweetness', Melancholic: 'melancholy', Wistful: 'wistfulness', Reflective: 'reflection',
  Urgent: 'urgency', Relentless: 'relentlessness', Pulse: 'pulse', Kinetic: 'momentum', Brooding: 'weight', Sparse: 'restraint',
  Cinematic: 'grandeur', Playful: 'levity', Quirky: 'oddness', Epic: 'scale', Gritty: 'grit', Underscore: 'texture',
};

const DRIVING_ACTION: Record<string, string> = {
  Tense: 'escape', Defiant: 'standoff', Desperate: 'pursuit', Eerie: 'unraveling',
  Foreboding: 'descent', Dread: 'unraveling', Volatile: 'eruption',
  Triumphant: 'breakthrough', Euphoric: 'surge', Hopeful: 'push',
  Cathartic: 'release', Redemptive: 'reclamation',
  Intimate: 'reckoning', Romantic: 'collision', Vulnerable: 'unraveling',
  Tender: 'approach', Longing: 'reach',
  Yearning: 'pursuit', Serene: 'descent', Nostalgic: 'return',
  Bittersweet: 'departure', Melancholic: 'spiral', Wistful: 'fade', Reflective: 'turn',
  Grief: 'collapse', Haunted: 'spiral', Numb: 'drift', Rage: 'explosion', Sinister: 'closing', Desolate: 'emptying',
  Urgent: 'charge', Relentless: 'drive', Pulse: 'surge', Kinetic: 'rush', Brooding: 'build', Sparse: 'strip',
  Cinematic: 'charge', Playful: 'chase', Quirky: 'veer', Epic: 'ascent', Gritty: 'grind', Underscore: 'hold',
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

function SectionLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span>{label}</span>
      {hint && (
        <span style={{ color: 'rgba(123,112,178,0.5)', letterSpacing: '0.06em', textTransform: 'none', fontStyle: 'italic', fontFamily: SERIF, fontSize: 12 }}>
          {hint}
        </span>
      )}
    </div>
  );
}

type BriefScreenProps = {
  initialBriefText?: string;
  initialSceneParams?: SceneParams;
  onContinue: (args: { briefText: string; briefId: BriefId; sceneParams: SceneParams; sceneArc: SceneArc | null }) => void;
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
  const [manualBriefId, setManualBriefId] = useState<BriefId | null>(null);
  const [showBriefPicker, setShowBriefPicker] = useState(false);
  const [exampleIdx, setExampleIdx] = useState(0);
  const [sceneArc, setSceneArc] = useState<SceneArc | null>(null);
  const [arcLoading, setArcLoading] = useState(false);
  const [adjustedPhases, setAdjustedPhases] = useState<ArcPhases | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (briefText.trim().length < 10) { setDetectedBriefId(null); return; }
    const handle = window.setTimeout(() => setDetectedBriefId(classifyBrief(briefText)), 500);
    return () => window.clearTimeout(handle);
  }, [briefText]);

  // Deterministic Scene Arc extraction — debounced live preview (backend engine).
  useEffect(() => {
    if (briefText.trim().length < 10) { setSceneArc(null); setArcLoading(false); return; }
    setArcLoading(true);
    const params: SceneParams = {
      pacing,
      emotionalRegister: selectedMoods.length > 0 ? selectedMoods.join(', ') : null,
      sceneLengthSec: null,
    };
    const handle = window.setTimeout(() => {
      extractSceneArc(briefText, params)
        .then((a) => setSceneArc(a))
        .catch(() => setSceneArc(null))
        .finally(() => setArcLoading(false));
    }, 450);
    return () => window.clearTimeout(handle);
  }, [briefText, pacing, selectedMoods]);

  const realWordCount = briefText.trim()
    ? briefText.trim().split(/\s+/).filter(w => w.length >= 2).length
    : 0;
  const canContinue = briefText.trim().length >= 10 && realWordCount >= 2;

  const handleSubmit = () => {
    if (!canContinue) return;
    const briefId = manualBriefId ?? classifyBrief(briefText) ?? 'montage-transition';
    const parsedLen = sceneLengthSec.trim() ? Number(sceneLengthSec) : null;
    // Carry the final (possibly hand-adjusted) Scene Arc forward for later sessions.
    const finalArc: SceneArc | null = sceneArc
      ? { ...sceneArc, ...(adjustedPhases ?? {}) }
      : null;
    onContinue({
      briefText: briefText.trim(),
      briefId,
      sceneParams: {
        pacing,
        emotionalRegister: selectedMoods.length > 0 ? selectedMoods.join(', ') : null,
        sceneLengthSec: parsedLen != null && !Number.isNaN(parsedLen) ? parsedLen : null,
      },
      sceneArc: finalArc,
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
    <div style={{ minHeight: '100vh', fontFamily: SANS, WebkitFontSmoothing: 'antialiased', color: C.silver, background: BG_GRADIENT }}>
      <style>{`
        @keyframes sv-caret { 50% { opacity: 0; } }
        .sv-caret::after { content: ''; display: inline-block; width: 1.5px; height: 13px; background: ${C.magenta}; margin-left: 2px; vertical-align: -2px; animation: sv-caret 1s steps(2) infinite; }
        @keyframes sv-pulse-dot { 0%,100%{opacity:.7;transform:scale(1)} 50%{opacity:1;transform:scale(1.15)} }
        .sv-topbar { position: sticky; top: 0; z-index: 10; background: linear-gradient(180deg, rgba(6,3,15,0.94), rgba(6,3,15,0.6) 70%, transparent); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-bottom: 1px solid ${C.hairline}; }
        .sv-topbar-inner { max-width: 1280px; margin: 0 auto; padding: 14px 28px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .sv-stepper { display: none; align-items: center; gap: 10px; }
        .sv-step { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: rgba(123,112,178,0.6); }
        .sv-step .sv-step-num { width: 22px; height: 22px; border-radius: 50%; border: 1px solid ${C.hairlineStrong}; display: grid; place-items: center; font-family: "JetBrains Mono",monospace; font-size: 10px; font-weight: 600; color: rgba(123,112,178,0.7); }
        .sv-step.active { color: ${C.silver}; }
        .sv-step.active .sv-step-num { background: linear-gradient(135deg,${C.purple},${C.magenta}); border-color: transparent; color: white; box-shadow: 0 4px 14px -4px rgba(245,166,35,0.6); }
        .sv-step.done .sv-step-num { background: rgba(245,166,35,0.18); border-color: rgba(123,112,178,0.35); color: ${C.silver}; }
        .sv-tick { width: 18px; height: 1px; background: ${C.hairlineStrong}; }
        .sv-step-badge { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: ${C.lavender}; padding: 4px 10px; border-radius: 999px; background: rgba(123,112,178,0.08); border: 1px solid ${C.hairline}; white-space: nowrap; }
        .sv-step-badge b { color: ${C.silver}; font-weight: 700; }
        .sv-shell { max-width: 1280px; margin: 0 auto; padding: 28px 28px 80px; }
        .sv-hero-row { display: flex; align-items: baseline; gap: 20px; margin-bottom: 22px; flex-wrap: wrap; }
        .sv-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
        .sv-card { border-radius: 18px; background: linear-gradient(180deg,rgba(23,11,51,0.55),rgba(15,8,35,0.72)); border: 1px solid ${C.hairline}; padding: 18px 20px; }
        .sv-scene { /* mobile: normal flow */ }
        .sv-synthesis { margin-top: 0; }
        .sv-cta-row { margin-top: 4px; }
        .sv-pill { min-height: 36px; padding: 7px 12px; }
        .sv-pacing-btn { min-height: 52px; position: relative; }
        /* gradient selected-ring (amber→magenta) via mask-composite */
        .sv-pacing-btn.on::before { content: ""; position: absolute; inset: 0; border-radius: 14px; padding: 1.5px; background: linear-gradient(135deg, ${C.purple}, ${C.magenta}); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; }
        /* live equalizer — bars animate at a pace-specific speed when selected */
        .sv-eq { display: flex; align-items: flex-end; gap: 2.5px; height: 20px; flex-shrink: 0; margin-left: auto; }
        .sv-eq i { width: 3px; height: 35%; border-radius: 2px; background: ${C.lavender}; opacity: 0.35; display: block; }
        .sv-pacing-btn.on .sv-eq i { opacity: 1; background: linear-gradient(180deg, ${C.magenta}, ${C.purple}); }
        @media (prefers-reduced-motion: no-preference) {
          .sv-pacing-btn.on .sv-eq i { animation: sv-eqbar var(--eqspeed, 0.9s) ease-in-out infinite; }
          .sv-pacing-btn.on .sv-eq i:nth-child(2) { animation-delay: .12s; }
          .sv-pacing-btn.on .sv-eq i:nth-child(3) { animation-delay: .26s; }
          .sv-pacing-btn.on .sv-eq i:nth-child(4) { animation-delay: .08s; }
          @keyframes sv-eqbar { 0%, 100% { height: 28%; } 50% { height: 100%; } }
          .sv-sparkle { animation: sv-sparkle 3s ease-in-out infinite; transform-origin: center; }
          @keyframes sv-sparkle { 0%, 100% { opacity: 0.75; transform: scale(1) rotate(0); } 50% { opacity: 1; transform: scale(1.18) rotate(18deg); } }
        }
        @media (min-width: 880px) {
          .sv-stepper { display: inline-flex; }
          .sv-step-badge { display: none; }
          .sv-shell { padding: 36px 36px 96px; }
          .sv-grid { grid-template-columns: minmax(0,1.15fr) minmax(0,1fr); gap: 24px; }
          .sv-scene { grid-column: 1 / -1; }
          .sv-arc { grid-column: 1 / -1; }
          .sv-synthesis { grid-column: 1 / -1; }
          .sv-cta-row { grid-column: 1 / -1; }
          .sv-card { border-radius: 22px; padding: 24px 26px; }
        }
        @media (max-width: 480px) {
          .sv-shell { padding: 16px 16px 60px; }
          .sv-topbar-inner { padding: 12px 16px; }
        }
      `}</style>

      {/* ── sticky topbar ── */}
      <header className="sv-topbar">
        <div className="sv-topbar-inner">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img src="/logo.png" alt="SyncVision" style={{ height: 28, width: 'auto', display: 'block' }} />
          </div>
          <nav className="sv-stepper" aria-label="Progress">
            <span className="sv-step active"><span className="sv-step-num">1</span> Brief</span>
            <span className="sv-tick" />
            <span className="sv-step"><span className="sv-step-num">2</span> Ingest</span>
            <span className="sv-tick" />
            <span className="sv-step"><span className="sv-step-num">3</span> Match</span>
          </nav>
          <span className="sv-step-badge">Step <b>1</b> of 3</span>
        </div>
      </header>

      <main className="sv-shell">

        {/* ── hero row ── */}
        <div className="sv-hero-row">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: C.lavender, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 24, height: 1, background: `linear-gradient(90deg,${C.magenta},transparent)`, display: 'inline-block' }} />
              The Brief
            </span>
            <h1 style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(26px,4vw,52px)', lineHeight: 1.02, letterSpacing: '-0.02em', color: C.silver }}>
              Set the <em style={{ fontStyle: 'italic', color: C.lavender }}>scene.</em>
            </h1>
          </div>
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(13px,1.3vw,17px)', color: 'rgba(123,112,178,0.7)', maxWidth: 300, marginLeft: 'auto' }}>
            Describe the moment — we'll find tracks that fit.
          </div>
        </div>

        {/* ── main grid ── */}
        <div className="sv-grid">

          {/* Scene — spans both cols on desktop */}
          <section className="sv-card sv-scene">
            <SectionLabel label="The Scene" hint="tell the story in a line" />
            <div
              style={{ padding: '14px 16px', borderRadius: 14, background: 'radial-gradient(120% 80% at 50% -10%,rgba(245,166,35,0.16),transparent 60%),linear-gradient(180deg,rgba(245,166,35,0.10),rgba(245,166,35,0.02))', border: `1px solid ${C.hairline}`, position: 'relative', minHeight: 80 }}
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
                  resize: 'none', fontFamily: SERIF, fontStyle: 'italic',
                  fontSize: 'clamp(15px,1.6vw,20px)',
                  lineHeight: 1.5, color: C.silver, letterSpacing: '-0.005em', minHeight: 72,
                  padding: 0, display: 'block', caretColor: C.magenta,
                }}
              />
              {wordCount > 0 && (
                <div style={{ marginTop: 8, fontSize: 10, letterSpacing: '0.06em', color: C.lavender, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {wordCount} word{wordCount === 1 ? '' : 's'}
                      {(manualBriefId ?? detectedBriefId) && (
                        <span
                          onClick={() => setShowBriefPicker(v => !v)}
                          style={{ cursor: 'pointer', background: 'rgba(245,166,35,0.15)', border: `1px solid rgba(245,166,35,0.3)`, borderRadius: 999, padding: '1px 8px', color: C.lavender, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', userSelect: 'none' }}
                          title="Click to change scene type"
                        >
                          {BRIEF_LABELS[manualBriefId ?? detectedBriefId!]} ✎
                        </span>
                      )}
                    </span>
                    {showBriefPicker && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                        {(Object.entries(BRIEF_LABELS) as [BriefId, string][]).map(([id, label]) => (
                          <span
                            key={id}
                            onClick={() => { setManualBriefId(id); setShowBriefPicker(false); }}
                            style={{ cursor: 'pointer', padding: '2px 8px', borderRadius: 999, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', border: `1px solid ${(manualBriefId ?? detectedBriefId) === id ? C.lavender : C.hairline}`, color: (manualBriefId ?? detectedBriefId) === id ? C.silver : C.lavender, background: (manualBriefId ?? detectedBriefId) === id ? 'rgba(245,166,35,0.2)' : 'transparent', userSelect: 'none' }}
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
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
            {/* example chips */}
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(123,112,178,0.6)', flexShrink: 0 }}>Try</span>
              <span
                style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 13, color: C.silver, padding: '5px 12px', borderRadius: 999, background: 'rgba(123,112,178,0.06)', border: `1px solid ${C.hairline}`, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                onClick={() => { setBriefText(EXAMPLES[exampleIdx]); cycleExample(); }}
                title="Click to use this example"
              >
                &ldquo;{EXAMPLES[exampleIdx]}&rdquo;
              </span>
              <button
                type="button"
                onClick={cycleExample}
                aria-label="Next example"
                style={{ width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, background: 'rgba(123,112,178,0.10)', border: `1px solid ${C.hairline}`, color: C.lavender, cursor: 'pointer', padding: 0 }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M4 12 H20 M14 6 L20 12 L14 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </section>

          {/* Scene Arc inspector — the deterministic emotional shape */}
          <div className="sv-arc">
            <SceneArcInspector arc={sceneArc} loading={arcLoading} onAdjustedChange={setAdjustedPhases} />
          </div>

          {/* Pacing */}
          <section className="sv-card">
            <SectionLabel label="Pacing" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {PACING_OPTIONS.map(opt => {
                const on = pacing === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPacing(on ? null : opt.value)}
                    className={`sv-pacing-btn${on ? ' on' : ''}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', borderRadius: 14,
                      background: on ? 'linear-gradient(135deg, rgba(245,166,35,0.22), rgba(219,39,119,0.10))' : 'rgba(15,8,35,0.5)',
                      border: `1px solid ${on ? 'transparent' : C.hairline}`,
                      boxShadow: on ? '0 0 0 1px rgba(245,166,35,0.16) inset, 0 12px 26px -16px rgba(245,166,35,0.5)' : 'none',
                      cursor: 'pointer', textAlign: 'left', fontFamily: SANS, width: '100%',
                    }}
                  >
                    <span style={{ width: 16, height: 16, borderRadius: '50%', border: `1.5px solid ${on ? C.magenta : C.hairlineStrong}`, flexShrink: 0, position: 'relative', display: 'inline-block' }}>
                      {on && <span style={{ position: 'absolute', inset: 2.5, borderRadius: '50%', background: C.magenta }} />}
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, color: C.amber, fontWeight: 700, letterSpacing: '-0.005em' }}>{opt.label}</span>
                      <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 12, color: on ? 'rgba(226,232,240,0.82)' : C.lavender, lineHeight: 1.2 }}>{opt.desc}</span>
                    </span>
                    <span className="sv-eq" aria-hidden="true" style={{ '--eqspeed': PACE_SPEED[opt.value ?? ''] } as React.CSSProperties}>
                      <i /><i /><i /><i />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Mood families */}
          <section className="sv-card">
            <SectionLabel label="Mood" hint={selectedMoods.length ? `${selectedMoods.length} selected` : 'pick by feeling'} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {MOOD_FAMILIES.map(family => (
                <div key={family.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(123,112,178,0.7)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: family.isStyle ? C.magenta : C.lavender, opacity: family.isStyle ? 0.7 : 0.5, display: 'inline-block', flexShrink: 0 }} />
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
                          className="sv-pill"
                          style={{
                            fontSize: 12, fontWeight: 600, letterSpacing: '0.01em',
                            borderRadius: 999,
                            background: on ? 'linear-gradient(135deg, rgba(245,166,35,0.32), rgba(219,39,119,0.22))' : 'transparent',
                            color: C.silver,
                            border: `1px solid ${on ? 'rgba(123,112,178,0.55)' : C.hairlineStrong}`,
                            boxShadow: on ? '0 0 0 1px rgba(245,166,35,0.18) inset' : 'none',
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
          </section>

          {/* Synthesis preview — spans both cols on desktop */}
          {synthesis && (
            <div className="sv-synthesis" style={{ padding: '16px 20px', borderRadius: 18, background: 'linear-gradient(180deg,rgba(219,39,119,0.16),rgba(245,166,35,0.08) 60%,rgba(245,166,35,0.03))', border: '1px solid rgba(219,39,119,0.32)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${C.magenta}, ${C.purple})` }} />
              <div style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.magenta, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                <svg className="sv-sparkle" width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 2 L14.5 9.5 L22 12 L14.5 14.5 L12 22 L9.5 14.5 L2 12 L9.5 9.5 Z" fill="currentColor" /></svg>
                Creative direction
              </div>
              <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(15px,1.5vw,20px)', lineHeight: 1.4, color: C.silver, letterSpacing: '-0.005em', maxWidth: '70ch' }}>
                {synthesis}
              </div>
            </div>
          )}

          {/* CTA — spans both cols on desktop */}
          <div className="sv-cta-row">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canContinue}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '15px 20px', borderRadius: 14, minHeight: 52,
                background: canContinue ? `linear-gradient(135deg, ${C.purple}, ${C.magenta})` : 'rgba(123,112,178,0.10)',
                color: canContinue ? 'white' : C.lavender,
                fontWeight: 700, fontSize: 15, letterSpacing: '0.01em',
                border: canContinue ? 'none' : `1px solid ${C.hairlineStrong}`,
                boxShadow: canContinue ? '0 16px 30px -12px rgba(245,166,35,0.55), 0 0 0 1px rgba(255,255,255,0.06) inset' : 'none',
                cursor: canContinue ? 'pointer' : 'not-allowed',
                fontFamily: SANS,
              }}
            >
              Continue to upload
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M5 12 H19 M13 6 L19 12 L13 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

        </div>
      </main>
    </div>
  );
}
