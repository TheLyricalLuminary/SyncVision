import { useEffect, useState } from 'react';
import {
  BRIEF_LABELS,
  classifyBrief,
  type BriefId,
} from '../engine/classifyBrief';
import type { SceneParams } from '../utils/apiClient';

type BriefScreenProps = {
  initialBriefText?: string;
  initialSceneParams?: SceneParams;
  onContinue: (args: {
    briefText: string;
    briefId: BriefId;
    sceneParams: SceneParams;
  }) => void;
};

const PACING_OPTIONS: Array<{ value: SceneParams['pacing']; label: string }> = [
  { value: 'slow', label: 'Slow' },
  { value: 'mid', label: 'Mid' },
  { value: 'driving', label: 'Driving' },
];

export function BriefScreen({
  initialBriefText,
  initialSceneParams,
  onContinue,
}: BriefScreenProps) {
  const [briefText, setBriefText] = useState(initialBriefText ?? '');
  const [pacing, setPacing] = useState<SceneParams['pacing']>(
    initialSceneParams?.pacing ?? null,
  );
  const [emotionalRegister, setEmotionalRegister] = useState(
    initialSceneParams?.emotionalRegister ?? '',
  );
  const [sceneLengthSec, setSceneLengthSec] = useState<string>(
    initialSceneParams?.sceneLengthSec != null
      ? String(initialSceneParams.sceneLengthSec)
      : '',
  );
  const [detectedBriefId, setDetectedBriefId] = useState<BriefId | null>(null);

  useEffect(() => {
    if (briefText.trim().length < 10) {
      setDetectedBriefId(null);
      return;
    }
    const handle = window.setTimeout(() => {
      setDetectedBriefId(classifyBrief(briefText));
    }, 500);
    return () => window.clearTimeout(handle);
  }, [briefText]);

  const canContinue = briefText.trim().length >= 10;

  const handleSubmit = () => {
    if (!canContinue) return;
    const briefId = classifyBrief(briefText);
    const parsedLen = sceneLengthSec.trim().length
      ? Number(sceneLengthSec)
      : null;
    onContinue({
      briefText: briefText.trim(),
      briefId,
      sceneParams: {
        pacing,
        emotionalRegister: emotionalRegister.trim() || null,
        sceneLengthSec: parsedLen != null && !Number.isNaN(parsedLen) ? parsedLen : null,
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-8 py-12">
      <h1 className="uppercase-label text-xs mb-2 text-mg-silver">Scene Brief</h1>
      <textarea
        value={briefText}
        onChange={(e) => setBriefText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Describe the scene — pacing, emotional register, moment in the story. Write it the way you'd say it out loud."
        className="w-full p-4 mb-8 card text-mg-silver text-base resize-y placeholder:text-mg-silver placeholder:opacity-80"
        style={{ minHeight: '140px' }}
      />

      <div className="flex flex-wrap gap-6 mb-8">
        <div>
          <div className="uppercase-label text-xs mb-2 text-mg-silver">Pacing</div>
          <div className="flex gap-2">
            {PACING_OPTIONS.map((opt) => {
              const active = pacing === opt.value;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setPacing(active ? null : opt.value)}
                  className="px-3 py-1 rounded-full border text-xs"
                  style={{
                    borderColor: active
                      ? 'var(--color-mg-lavender)'
                      : 'var(--color-mg-border)',
                    color: active
                      ? 'var(--color-mg-silver)'
                      : 'var(--color-mg-lavender)',
                    background: active ? 'var(--color-mg-cosmic)' : 'transparent',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 min-w-[200px]">
          <div className="uppercase-label text-xs mb-2 text-mg-silver">Emotional Register</div>
          <input
            type="text"
            value={emotionalRegister}
            onChange={(e) => setEmotionalRegister(e.target.value)}
            className="w-full border-b border-mg-border py-1 text-mg-silver text-sm"
            placeholder="e.g. bittersweet, restrained"
          />
        </div>

        <div>
          <div className="uppercase-label text-xs mb-2 text-mg-silver">Scene Length (sec)</div>
          <input
            type="number"
            value={sceneLengthSec}
            onChange={(e) => setSceneLengthSec(e.target.value)}
            className="w-24 border-b border-mg-border py-1 text-mg-silver text-sm tabular-nums"
            min={0}
            style={{ MozAppearance: 'textfield', appearance: 'textfield' } as React.CSSProperties}
          />
        </div>
      </div>

      <div className="flex items-center gap-6">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canContinue}
          className="btn-outline text-sm tracking-[0.12em] uppercase"
        >
          Set the scene →
        </button>
        {detectedBriefId && (
          <span className="text-mg-lavender text-xs" style={{ opacity: 0.7 }}>
            Detected: {BRIEF_LABELS[detectedBriefId]}
          </span>
        )}
      </div>
    </main>
  );
}
