import { useEffect, useState } from 'react';
import { LockScreen, isAuthenticated } from './components/LockScreen';
import { BriefScreen } from './screens/BriefScreen';
import { IngestScreen } from './screens/IngestScreen';
import { AnalyzingScreen } from './screens/AnalyzingScreen';
import {
  ResultsScreen,
  decodeSharePayload,
} from './screens/ResultsScreen';
import ShareView from './pages/ShareView';
import { useAnalysisJob } from './hooks/useAnalysisJob';
import { useCredits } from './hooks/useCredits';
import type { BriefId } from './engine/classifyBrief';
import type { AnalysisResult, SceneParams } from './utils/apiClient';
import { API_BASE } from './utils/apiClient';
import type { DecisionPacket } from './pages/ShareView';

type View = 'brief' | 'ingest' | 'analyzing' | 'results';

// A cuid2/cuid looks like: starts with a letter, 24–26 alphanum chars, no '=' padding.
// Legacy base64 payloads are always 100+ chars and contain '+', '/', '='.
function isPacketId(s: string): boolean {
  return s.length < 60 && /^[a-z][a-z0-9]+$/.test(s);
}

type ShareRoute =
  | { type: 'none' }
  | { type: 'loading' }
  | { type: 'packet';  packet: DecisionPacket }
  | { type: 'legacy';  briefText: string; briefId: BriefId; sceneParams: SceneParams; results: AnalysisResult[] }
  | { type: 'error';   message: string };

const DEFAULT_SCENE_PARAMS: SceneParams = {
  pacing: null,
  emotionalRegister: null,
  sceneLengthSec: null,
};

// Share links bypass the lock screen — supervisors receive them without accounts.
function isShareRoute(): boolean {
  return /^#share=/.test(window.location.hash);
}

function App() {
  const [shareRoute, setShareRoute] = useState<ShareRoute>({ type: 'none' });
  const [unlocked, setUnlocked] = useState<boolean>(
    isShareRoute() || isAuthenticated(),
  );

  const [view, setView] = useState<View>('brief');
  const [briefText, setBriefText] = useState('');
  const [briefId, setBriefId] = useState<BriefId>('montage-transition');
  const [sceneParams, setSceneParams] = useState<SceneParams>(DEFAULT_SCENE_PARAMS);
  const [trackFilenames, setTrackFilenames] = useState<string[]>([]);

  const job     = useAnalysisJob();
  const credits = useCredits();

  useEffect(() => {
    const match = window.location.hash.match(/^#share=(.+)$/);
    if (!match) return;
    const value = match[1];

    if (isPacketId(value)) {
      setShareRoute({ type: 'loading' });
      fetch(`${API_BASE}/api/share/${value}`)
        .then(r => {
          if (r.status === 410) throw new Error('This share link has expired.');
          if (!r.ok)            throw new Error(`Server ${r.status}`);
          return r.json() as Promise<DecisionPacket>;
        })
        .then(packet => setShareRoute({ type: 'packet', packet }))
        .catch(e => setShareRoute({ type: 'error', message: e instanceof Error ? e.message : 'Failed to load.' }));
    } else {
      // Legacy base64 payload — read-only fallback
      const payload = decodeSharePayload(value);
      if (payload) {
        setShareRoute({ type: 'legacy', ...payload });
      } else {
        setShareRoute({ type: 'error', message: 'Unrecognised share link.' });
      }
    }
  }, []);

  useEffect(() => {
    if (job.phase === 'complete') setView('results');
  }, [job.phase]);

  if (!unlocked) {
    return <LockScreen onUnlock={() => setUnlocked(true)} />;
  }

  if (shareRoute.type === 'loading') {
    return (
      <div style={{ minHeight: '100vh', background: '#0F0823', display: 'grid', placeItems: 'center', color: '#A78BFA', fontFamily: 'Manrope, system-ui, sans-serif', fontSize: 14, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
        Loading decision packet…
      </div>
    );
  }

  if (shareRoute.type === 'error') {
    return (
      <div style={{ minHeight: '100vh', background: '#0F0823', display: 'grid', placeItems: 'center', color: '#F87171', fontFamily: 'Manrope, system-ui, sans-serif', fontSize: 14 }}>
        {shareRoute.message}
      </div>
    );
  }

  if (shareRoute.type === 'packet') {
    return <ShareView packet={shareRoute.packet} />;
  }

  if (shareRoute.type === 'legacy') {
    // Render the old ShareView via ResultsScreen read-only prop
    return (
      <ResultsScreen
        briefText={shareRoute.briefText}
        briefId={shareRoute.briefId}
        sceneParams={shareRoute.sceneParams}
        results={shareRoute.results}
        readOnly
      />
    );
  }

  return (
    <>
      {view === 'brief' && (
        <BriefScreen
          initialBriefText={briefText}
          initialSceneParams={sceneParams}
          onContinue={({ briefText: bt, briefId: bid, sceneParams: sp }) => {
            setBriefText(bt);
            setBriefId(bid);
            setSceneParams(sp);
            setView('ingest');
          }}
        />
      )}

      {view === 'ingest' && (
        <IngestScreen
          creditBalance={credits.balance}
          onBack={() => setView('brief')}
          onAnalyze={(filenames) => {
            setTrackFilenames(filenames);
            setView('analyzing');
            void job.start({ briefText, briefId, sceneParams, trackFilenames: filenames });
          }}
        />
      )}

      {view === 'analyzing' && (
        <AnalyzingScreen
          phase={job.phase}
          warning={job.warning}
          error={job.error}
          elapsedMs={job.elapsedMs}
          onRetry={() => void job.start({ briefText, briefId, sceneParams, trackFilenames })}
          onBackToIngest={() => { job.reset(); setView('ingest'); }}
        />
      )}

      {view === 'results' && job.results && (
        <ResultsScreen
          briefText={briefText}
          briefId={briefId}
          sceneParams={sceneParams}
          results={job.results}
          onBack={() => { job.reset(); setView('brief'); }}
        />
      )}
    </>
  );
}

export default App;
