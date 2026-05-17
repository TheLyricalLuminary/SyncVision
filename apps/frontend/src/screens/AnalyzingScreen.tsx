import type { JobPhase } from '../hooks/useAnalysisJob';

type AnalyzingScreenProps = {
  phase: JobPhase;
  warning: string | null;
  error: string | null;
  elapsedMs: number;
  onRetry: () => void;
  onBackToIngest: () => void;
};

const PHASE_LABEL: Record<JobPhase, string> = {
  idle: 'Idle',
  submitting: 'Submitting…',
  pending: 'Queued…',
  processing: 'Analyzing tracks…',
  complete: 'Complete',
  failed: 'Failed',
  'timed-out': 'Timed out',
};

export function AnalyzingScreen({
  phase,
  warning,
  error,
  elapsedMs,
  onRetry,
  onBackToIngest,
}: AnalyzingScreenProps) {
  const isError = phase === 'failed' || phase === 'timed-out';
  const elapsedSec = Math.floor(elapsedMs / 1000);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-8">
      {!isError ? (
        <>
          <div className="uppercase-label text-xs mb-4">{PHASE_LABEL[phase]}</div>
          <div
            className="w-80 h-1 rounded overflow-hidden mb-3"
            style={{ background: 'var(--color-mg-dim)' }}
            aria-hidden
          >
            <div
              className="h-1 sv-analyzing-bar"
              style={{
                background: 'var(--color-mg-lavender)',
                width: '40%',
              }}
            />
          </div>
          <div className="text-mg-lavender text-xs tabular-nums">
            {elapsedSec}s elapsed
          </div>
          {warning && (
            <div className="text-amber-400 text-xs mt-4">{warning}</div>
          )}
          <style>{`
            @keyframes sv-analyzing {
              0%   { transform: translateX(-100%); }
              100% { transform: translateX(250%); }
            }
            .sv-analyzing-bar {
              animation: sv-analyzing 1.4s ease-in-out infinite;
            }
          `}</style>
        </>
      ) : (
        <>
          <div className="uppercase-label text-xs mb-2 text-amber-400">
            {phase === 'timed-out' ? 'Timed out' : 'Analysis failed'}
          </div>
          <p className="text-mg-silver text-sm mb-6 max-w-md text-center">
            {error ?? 'Something went wrong while analyzing the tracks.'}
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={onRetry} className="btn-outline text-xs uppercase tracking-[0.12em]">
              Retry
            </button>
            <button
              type="button"
              onClick={onBackToIngest}
              className="btn-outline text-xs uppercase tracking-[0.12em]"
            >
              Back to ingest
            </button>
          </div>
        </>
      )}
    </main>
  );
}
