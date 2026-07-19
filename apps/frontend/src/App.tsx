import { useEffect, useState } from 'react';
import { LockScreen, isAuthenticated } from './components/LockScreen';
import { NavRail } from './components/NavRail';
import { MobileTopBar } from './components/MobileTopBar';
import { MobileTabBar } from './components/MobileTabBar';
import type { MobileTab } from './components/MobileTabBar';
import { BriefScreen } from './screens/BriefScreen';
import { IngestScreen } from './screens/IngestScreen';
import { AnalyzingScreen } from './screens/AnalyzingScreen';
import {
  ResultsScreen,
  decodeSharePayload,
} from './screens/ResultsScreen';
import { ShortlistsScreen } from './screens/ShortlistsScreen';
import { RightsScreen }     from './screens/RightsScreen';
import { LibraryScreen }    from './screens/LibraryScreen';
import { DirectorView }     from './screens/DirectorView';
import ShareView from './pages/ShareView';
import DesignSystemShowcase from './screens/DesignSystemShowcase';
import { PresentationView } from './components/PresentationView';
import { DEMO_PRESENTATION } from './fixtures/presentationDemo';
import { useAnalysisJob } from './hooks/useAnalysisJob';
import { useCredits } from './hooks/useCredits';
import type { BriefId } from './engine/classifyBrief';
import type { AnalysisResult, SceneParams, SceneArc } from './utils/apiClient';
import { API_BASE } from './utils/apiClient';
import type { DecisionPacket } from './pages/ShareView';

// The flow sub-view (brief → ingest → analyzing → results) lives under the
// "brief" rail item while in-flight, then moves to "workspace" on completion.
type FlowStep = 'brief' | 'ingest' | 'analyzing' | 'results';
type NavView  = 'workspace' | 'brief' | 'shortlists' | 'rights' | 'library' | 'director';

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

function isShareRoute(): boolean  { return /^#share=/.test(window.location.hash); }
function isDesignRoute(): boolean { return /^#\/?design\b/.test(window.location.hash); }

function App() {
  const [shareRoute, setShareRoute] = useState<ShareRoute>({ type: 'none' });
  const [unlocked, setUnlocked] = useState<boolean>(
    isShareRoute() || isAuthenticated(),
  );

  const [navView,   setNavView]   = useState<NavView>('brief');
  const [flowStep,  setFlowStep]  = useState<FlowStep>('brief');
  const [briefText, setBriefText] = useState('');
  const [briefId,   setBriefId]   = useState<BriefId>('montage-transition');
  const [sceneParams, setSceneParams] = useState<SceneParams>(DEFAULT_SCENE_PARAMS);
  const [sceneArc,    setSceneArc]    = useState<SceneArc | null>(null);
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
      const payload = decodeSharePayload(value);
      if (payload) setShareRoute({ type: 'legacy', ...payload });
      else          setShareRoute({ type: 'error', message: 'Unrecognised share link.' });
    }
  }, []);

  useEffect(() => {
    if (job.phase === 'complete') {
      setFlowStep('results');
      setNavView('workspace');
    }
  }, [job.phase]);

  // ── special routes (share, design) ──────────────────────────
  if (isDesignRoute()) return <DesignSystemShowcase />;

  if (!unlocked) return <LockScreen onUnlock={() => setUnlocked(true)} />;

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
  if (shareRoute.type === 'packet') return <ShareView packet={shareRoute.packet} />;
  if (shareRoute.type === 'legacy') {
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

  // ── which content panel to show ──────────────────────────────
  // navView drives top-level; flowStep drives sub-steps within brief/workspace
  function handleNav(v: NavView) {
    setNavView(v);
    // entering brief nav resets to the brief step if workspace has results
    if (v === 'brief') {
      job.reset();
      setFlowStep('brief');
    }
  }

  // The active rail item: brief/ingest/analyzing all highlight "brief"
  const railActive: NavView =
    navView === 'workspace' && flowStep !== 'results'
      ? 'brief'
      : navView;

  // Mobile tab — collapses 6 rail items into 3
  const mobileTab: MobileTab =
    navView === 'shortlists' ? 'short' :
    navView === 'workspace' && flowStep === 'results' ? 'stack' :
    'match';

  function handleMobileTab(t: MobileTab) {
    if (t === 'match') { handleNav('brief'); }
    else if (t === 'stack') { job.results ? handleNav('workspace') : handleNav('brief'); }
    else { handleNav('shortlists'); }
  }

  const isMatchActive = flowStep !== 'brief' || !!briefText;

  function renderContent() {
    // brief flow
    if (navView === 'brief' || (navView === 'workspace' && flowStep !== 'results')) {
      if (flowStep === 'brief') {
        return (
          <BriefScreen
            initialBriefText={briefText}
            initialSceneParams={sceneParams}
            onContinue={({ briefText: bt, briefId: bid, sceneParams: sp, sceneArc: sa }) => {
              setBriefText(bt); setBriefId(bid); setSceneParams(sp); setSceneArc(sa);
              setFlowStep('ingest');
            }}
          />
        );
      }
      if (flowStep === 'ingest') {
        return (
          <IngestScreen
            creditBalance={credits.balance}
            onBack={() => setFlowStep('brief')}
            onAnalyze={(filenames) => {
              setTrackFilenames(filenames);
              setFlowStep('analyzing');
              void job.start({ briefText, briefId, sceneParams, sceneArc, trackFilenames: filenames });
            }}
          />
        );
      }
      if (flowStep === 'analyzing') {
        return (
          <AnalyzingScreen
            phase={job.phase}
            warning={job.warning}
            error={job.error}
            elapsedMs={job.elapsedMs}
            onRetry={() => void job.start({ briefText, briefId, sceneParams, trackFilenames })}
            onBackToIngest={() => { job.reset(); setFlowStep('ingest'); }}
          />
        );
      }
    }

    // workspace / results
    if (navView === 'workspace' && flowStep === 'results' && job.results) {
      return (
        <ResultsScreen
          briefText={briefText}
          briefId={briefId}
          sceneParams={sceneParams}
          sceneArc={sceneArc}
          results={job.results}
          onBack={() => { job.reset(); setFlowStep('brief'); setNavView('brief'); }}
          onPitchToDirector={() => setNavView('director')}
        />
      );
    }

    // management screens
    if (navView === 'shortlists') return <ShortlistsScreen />;
    if (navView === 'rights')     return <RightsScreen />;
    if (navView === 'library')    return <LibraryScreen />;

    // director — live review of the current shortlist when a Story Match has
    // run; otherwise the Forensic Adjudication pitch deck demo fixture.
    if (navView === 'director') {
      if (job.results && job.results.length > 0) {
        return (
          <DirectorView
            briefText={briefText}
            briefId={briefId}
            sceneParams={sceneParams}
            sceneArc={sceneArc}
            results={job.results}
            onBack={() => setNavView('workspace')}
          />
        );
      }
      return <PresentationView payload={DEMO_PRESENTATION} />;
    }

    // default — go to brief
    return (
      <BriefScreen
        initialBriefText={briefText}
        initialSceneParams={sceneParams}
        onContinue={({ briefText: bt, briefId: bid, sceneParams: sp, sceneArc: sa }) => {
          setBriefText(bt); setBriefId(bid); setSceneParams(sp); setSceneArc(sa);
          setFlowStep('ingest');
          setNavView('brief');
        }}
      />
    );
  }

  return (
    <div className="sv-app">
      <NavRail active={railActive} onNav={handleNav} />
      <MobileTopBar briefText={briefText || undefined} isActive={isMatchActive} />
      <div className="sv-screen-host">
        {renderContent()}
      </div>
      <MobileTabBar active={mobileTab} onTab={handleMobileTab} hasResults={!!job.results} />
    </div>
  );
}

export default App;
