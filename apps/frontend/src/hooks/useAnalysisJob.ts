import { useCallback, useEffect, useRef, useState } from 'react';
import {
  pollAnalysis,
  submitAnalysis,
  type AnalysisResult,
  type SceneParams,
} from '../utils/apiClient';

export type JobPhase =
  | 'idle'
  | 'submitting'
  | 'pending'
  | 'processing'
  | 'complete'
  | 'failed'
  | 'timed-out';

export type UseAnalysisJob = {
  phase: JobPhase;
  results: AnalysisResult[] | null;
  error: string | null;
  warning: string | null;
  elapsedMs: number;
  start: (args: {
    briefText: string;
    briefId: string;
    sceneParams: SceneParams;
    trackFilenames: string[];
  }) => Promise<void>;
  reset: () => void;
};

const POLL_INTERVAL_MS = 1500;
const WARN_AFTER_MS = 45_000;
const TIMEOUT_AFTER_MS = 60_000;

export function useAnalysisJob(): UseAnalysisJob {
  const [phase, setPhase] = useState<JobPhase>('idle');
  const [results, setResults] = useState<AnalysisResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const timersRef = useRef<{ poll: number | null; tick: number | null; startedAt: number }>(
    { poll: null, tick: null, startedAt: 0 },
  );

  const clearTimers = useCallback(() => {
    if (timersRef.current.poll !== null) {
      window.clearTimeout(timersRef.current.poll);
      timersRef.current.poll = null;
    }
    if (timersRef.current.tick !== null) {
      window.clearInterval(timersRef.current.tick);
      timersRef.current.tick = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    setPhase('idle');
    setResults(null);
    setError(null);
    setWarning(null);
    setElapsedMs(0);
  }, [clearTimers]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const start = useCallback<UseAnalysisJob['start']>(
    async (args) => {
      clearTimers();
      setResults(null);
      setError(null);
      setWarning(null);
      setElapsedMs(0);
      setPhase('submitting');
      timersRef.current.startedAt = Date.now();

      timersRef.current.tick = window.setInterval(() => {
        const elapsed = Date.now() - timersRef.current.startedAt;
        setElapsedMs(elapsed);
        if (elapsed >= WARN_AFTER_MS && elapsed < TIMEOUT_AFTER_MS) {
          setWarning('Still working — usually completes within 45 seconds.');
        }
        if (elapsed >= TIMEOUT_AFTER_MS) {
          clearTimers();
          setPhase('timed-out');
          setError('Analysis did not complete within 60 seconds.');
        }
      }, 250);

      try {
        const { jobId } = await submitAnalysis(args);
        setPhase('pending');

        const tick = async () => {
          if (Date.now() - timersRef.current.startedAt >= TIMEOUT_AFTER_MS) {
            return;
          }
          try {
            const status = await pollAnalysis(jobId);
            if (status.status === 'pending' || status.status === 'processing') {
              setPhase(status.status);
              timersRef.current.poll = window.setTimeout(tick, POLL_INTERVAL_MS);
            } else if (status.status === 'complete') {
              clearTimers();
              setResults(status.results);
              setPhase('complete');
            } else {
              clearTimers();
              setError(status.error || 'Analysis failed.');
              setPhase('failed');
            }
          } catch (e) {
            clearTimers();
            setError(e instanceof Error ? e.message : String(e));
            setPhase('failed');
          }
        };

        timersRef.current.poll = window.setTimeout(tick, POLL_INTERVAL_MS);
      } catch (e) {
        clearTimers();
        setError(e instanceof Error ? e.message : String(e));
        setPhase('failed');
      }
    },
    [clearTimers],
  );

  return { phase, results, error, warning, elapsedMs, start, reset };
}
