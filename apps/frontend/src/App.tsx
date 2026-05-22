import React, { useEffect, useState } from 'react';
import { Nav } from './components/Nav';
import { BriefScreen } from './screens/BriefScreen';
import { IngestScreen } from './screens/IngestScreen';
import { AnalyzingScreen } from './screens/AnalyzingScreen';
import {
  ResultsScreen,
  decodeSharePayload,
} from './screens/ResultsScreen';
import { DirectorView } from './screens/DirectorView';
import { useAnalysisJob } from './hooks/useAnalysisJob';
import { useCredits } from './hooks/useCredits';
import type { BriefId } from './engine/classifyBrief';
import type { AnalysisResult, SceneParams } from './utils/apiClient';

type View = 'brief' | 'ingest' | 'analyzing' | 'results';

type SharedSession = {
  briefText: string;
  briefId: BriefId;
  sceneParams: SceneParams;
  results: AnalysisResult[];
};

function readSharedSession(): SharedSession | null {
  const match = window.location.hash.match(/^#share=(.+)$/);
  if (!match) return null;
  const payload = decodeSharePayload(match[1]);
  return payload;
}

const DEFAULT_SCENE_PARAMS: SceneParams = {
  pacing: null,
  emotionalRegister: null,
  sceneLengthSec: null,
};

function App() {
  const [shared] = useState<SharedSession | null>(() => readSharedSession());

  const [view, setView] = useState<View>('brief');
  const [briefText, setBriefText] = useState('');
  const [briefId, setBriefId] = useState<BriefId>('montage-transition');
  const [sceneParams, setSceneParams] = useState<SceneParams>(DEFAULT_SCENE_PARAMS);
  const [trackFilenames, setTrackFilenames] = useState<string[]>([]);

  const job = useAnalysisJob();
  const credits = useCredits();

  useEffect(() => {
    if (job.phase === 'complete') {
      setView('results');
    }
  }, [job.phase]);

  const glassCard: React.CSSProperties = {
    background: 'rgba(15, 8, 35, 0.72)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(180, 120, 255, 0.15)',
    borderRadius: '16px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    flex: 1,
  };

  if (shared) {
    return (
      <DirectorView
        briefText={shared.briefText}
        briefId={shared.briefId}
        sceneParams={shared.sceneParams}
        results={shared.results}
      />
    );
  }

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', minHeight: '100vh', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column' }}>
      <Nav
        creditBalance={credits.balance}
        loading={credits.loading}
        onHome={() => {
          job.reset();
          setView('brief');
        }}
      />

      <div style={glassCard}>
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
              void job.start({
                briefText,
                briefId,
                sceneParams,
                trackFilenames: filenames,
              });
            }}
          />
        )}

        {view === 'analyzing' && (
          <AnalyzingScreen
            phase={job.phase}
            warning={job.warning}
            error={job.error}
            elapsedMs={job.elapsedMs}
            onRetry={() =>
              void job.start({
                briefText,
                briefId,
                sceneParams,
                trackFilenames,
              })
            }
            onBackToIngest={() => {
              job.reset();
              setView('ingest');
            }}
          />
        )}

        {view === 'results' && job.results && (
          <ResultsScreen
            briefText={briefText}
            briefId={briefId}
            sceneParams={sceneParams}
            results={job.results}
            onBack={() => {
              job.reset();
              setView('brief');
            }}
          />
        )}
      </div>
    </div>
  );
}

export default App;
