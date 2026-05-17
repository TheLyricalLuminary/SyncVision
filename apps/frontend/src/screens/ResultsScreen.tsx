import { useState } from 'react';
import { TrackCard } from '../components/TrackCard';
import type { AnalysisResult, SceneParams } from '../utils/apiClient';
import type { BriefId } from '../engine/classifyBrief';
import { BRIEF_LABELS } from '../engine/classifyBrief';

type ResultsScreenProps = {
  briefText: string;
  briefId: BriefId;
  sceneParams: SceneParams;
  results: AnalysisResult[];
  readOnly?: boolean;
  onBack?: () => void;
};

type SharePayload = {
  briefText: string;
  briefId: BriefId;
  sceneParams: SceneParams;
  results: AnalysisResult[];
};

function encodeSharePayload(payload: SharePayload): string {
  const json = JSON.stringify(payload);
  const utf8 = new TextEncoder().encode(json);
  let binary = '';
  utf8.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

export function decodeSharePayload(encoded: string): SharePayload | null {
  try {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as SharePayload;
  } catch {
    return null;
  }
}

export function ResultsScreen({
  briefText,
  briefId,
  sceneParams,
  results,
  readOnly,
  onBack,
}: ResultsScreenProps) {
  const [toast, setToast] = useState<string | null>(null);

  const onExportPdf = () => {
    try {
      window.print();
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Print export failed.');
    }
  };

  const onCopyShareLink = async () => {
    try {
      const encoded = encodeSharePayload({
        briefText,
        briefId,
        sceneParams,
        results,
      });
      const url = `${window.location.origin}${window.location.pathname}#share=${encoded}`;
      await navigator.clipboard.writeText(url);
      setToast('Share link copied to clipboard.');
      window.setTimeout(() => setToast(null), 2400);
    } catch (e) {
      setToast(
        e instanceof Error
          ? `Couldn't copy link: ${e.message}`
          : "Couldn't copy link.",
      );
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-8 py-10">
      <div className="print-wordmark hidden">SYNCVISION</div>

      <div className="flex items-center justify-between mb-6 no-print sticky top-0 py-3" style={{ background: 'rgba(15, 8, 35, 0.6)', backdropFilter: 'blur(8px)' }}>
        {!readOnly && onBack ? (
          <button onClick={onBack} className="uppercase-label text-xs">
            ← New brief
          </button>
        ) : (
          <span className="uppercase-label text-xs" style={{ opacity: 0.5 }}>
            Read-only view
          </span>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onExportPdf}
            className="btn-outline text-xs uppercase tracking-[0.12em]"
          >
            Export PDF
          </button>
          <button
            type="button"
            onClick={onCopyShareLink}
            className="btn-outline text-xs uppercase tracking-[0.12em]"
          >
            Copy share link
          </button>
        </div>
      </div>

      <header className="mb-8">
        <h1 className="uppercase-label text-xs mb-2">Scene Brief</h1>
        <p className="text-mg-silver text-sm italic leading-relaxed">
          {briefText}
        </p>
        <div className="uppercase-label text-xs mt-3" style={{ opacity: 0.7 }}>
          Detected: {BRIEF_LABELS[briefId]}
          {sceneParams.pacing && ` · Pacing: ${sceneParams.pacing}`}
          {sceneParams.sceneLengthSec != null &&
            ` · ${sceneParams.sceneLengthSec}s`}
        </div>
      </header>

      <section>
        {results.length === 0 ? (
          <p className="text-mg-lavender text-sm italic">No results.</p>
        ) : (
          results.map((r) => (
            <TrackCard key={r.track.id} result={r} briefId={briefId} />
          ))
        )}
      </section>

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 right-6 card px-4 py-2 text-mg-silver text-xs no-print"
        >
          {toast}
        </div>
      )}
    </main>
  );
}
