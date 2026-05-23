import { useEffect, useState } from 'react';
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

function SvLogo() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, letterSpacing: '-0.01em', fontFamily: SANS }}>
      <span
        className="sv-glyph"
        style={{ width: 22, height: 22, borderRadius: 7, position: 'relative', flexShrink: 0, background: `conic-gradient(from 210deg at 50% 50%, ${C.purple}, ${C.magenta}, ${C.purple})`, boxShadow: '0 0 0 1px rgba(255,255,255,0.06) inset' }}
      />
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

function Pill({ label, on, onClick, dot = false }: { label: string; on: boolean; onClick: () => void; dot?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 12, fontWeight: 600, letterSpacing: '0.01em',
        padding: '7px 11px', borderRadius: 999,
        background: on ? 'linear-gradient(135deg, rgba(124,58,237,0.32), rgba(219,39,119,0.22))' : 'transparent',
        color: C.silver,
        border: `1px solid ${on ? 'rgba(167,139,250,0.55)' : C.hairlineStrong}`,
        boxShadow: on ? '0 0 0 1px rgba(124,58,237,0.18) inset, 0 6px 16px -6px rgba(124,58,237,0.4)' : 'none',
        display: 'inline-flex', alignItems: 'center', gap: 5,
        whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: SANS,
      }}
    >
      {dot && (
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: on ? C.magenta : C.lavender, opacity: on ? 1 : 0.5, flexShrink: 0 }} />
      )}
      {label}
    </button>
  );
}

const PACING_OPTIONS: Array<{ value: SceneParams['pacing']; label: string }> = [
  { value: 'slow',    label: 'Slow' },
  { value: 'mid',     label: 'Medium' },
  { value: 'driving', label: 'Driving' },
];

const MOOD_OPTIONS = [
  'Yearning', 'Intimate', 'Bittersweet', 'Hopeful', 'Triumphant',
  'Melancholic', 'Tense', 'Euphoric', 'Nostalgic', 'Eerie',
  'Playful', 'Romantic', 'Desperate', 'Serene', 'Defiant',
  'Vulnerable', 'Cinematic',
];

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

  const wordCount = briefText.trim() ? briefText.trim().split(/\s+/).length : 0;

  return (
    <div style={{ minHeight: '100vh', fontFamily: SANS, WebkitFontSmoothing: 'antialiased', color: C.silver, background: BG_GRADIENT, display: 'flex', flexDirection: 'column' }}>
      <div style={{ maxWidth: 520, width: '100%', margin: '0 auto', padding: '8px 20px 28px', display: 'flex', flexDirection: 'column', flex: 1 }}>

        {/* ── header ── */}
        <div style={{ padding: '16px 4px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.hairline}`, flexShrink: 0 }}>
          <SvLogo />
          <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.lavender, padding: '4px 10px', borderRadius: 999, background: 'rgba(167,139,250,0.08)', border: `1px solid ${C.hairline}` }}>
            Step <b style={{ color: C.silver, fontWeight: 700 }}>1</b> of 3
          </span>
        </div>

        {/* ── body ── */}
        <div style={{ paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>

          {/* The Scene */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SectionLabel label="The Scene" hint="describe the moment" />
            <div style={{ padding: '14px 14px 12px', borderRadius: 14, background: 'linear-gradient(180deg, rgba(124,58,237,0.10), rgba(124,58,237,0.02))', border: `1px solid ${C.hairline}`, marginTop: 0, position: 'relative' }}>
              <textarea
                value={briefText}
                onChange={e => setBriefText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe the moment — the mood, what's at stake, where the scene ends up…"
                style={{
                  width: '100%', background: 'transparent', border: 'none', outline: 'none',
                  resize: 'none', fontFamily: SERIF, fontStyle: 'italic', fontSize: 19,
                  lineHeight: 1.3, color: C.silver, letterSpacing: '-0.005em', minHeight: 88,
                  padding: 0, display: 'block',
                }}
              />
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: 'rgba(167,139,250,0.12) solid 1px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, letterSpacing: '0.06em', color: C.lavender }}>
                <span>{wordCount > 0 ? `${wordCount} word${wordCount === 1 ? '' : 's'}` : 'Start typing…'}{detectedBriefId ? ` · ${BRIEF_LABELS[detectedBriefId]}` : ''}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
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
            </div>
          </div>

          {/* Pacing */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SectionLabel label="Pacing" />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PACING_OPTIONS.map(opt => (
                <Pill
                  key={opt.label}
                  label={opt.label}
                  on={pacing === opt.value}
                  onClick={() => setPacing(pacing === opt.value ? null : opt.value)}
                  dot
                />
              ))}
            </div>
          </div>

          {/* Mood */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SectionLabel label="Mood" hint="pick a few" />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {MOOD_OPTIONS.map(mood => (
                <Pill
                  key={mood}
                  label={mood}
                  on={selectedMoods.includes(mood)}
                  onClick={() => toggleMood(mood)}
                  dot
                />
              ))}
            </div>
          </div>

        </div>

        {/* ── CTA ── */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canContinue}
          style={{
            marginTop: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: 15, borderRadius: 14,
            background: canContinue ? `linear-gradient(135deg, ${C.purple}, ${C.magenta})` : 'rgba(167,139,250,0.10)',
            color: canContinue ? 'white' : C.lavender,
            fontWeight: 700, fontSize: 15, letterSpacing: '0.01em',
            border: canContinue ? 'none' : `1px solid ${C.hairlineStrong}`,
            boxShadow: canContinue ? '0 16px 30px -12px rgba(124,58,237,0.55), 0 0 0 1px rgba(255,255,255,0.06) inset' : 'none',
            cursor: canContinue ? 'pointer' : 'not-allowed',
            fontFamily: SANS,
            position: 'relative', overflow: 'hidden',
          }}
        >
          Find tracks
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 12 H19 M13 6 L19 12 L13 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

      </div>
    </div>
  );
}
