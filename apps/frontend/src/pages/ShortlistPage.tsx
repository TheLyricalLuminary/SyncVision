// apps/frontend/src/pages/ShortlistPage.tsx
// Standalone high-fidelity Shortlist prototype.
// Uses DC design-canvas components; not wired to live API data.
import { useState } from 'react';
import { DCTrackCard } from '../components/DCTrackCard';
import { TabNavigation } from '../components/TabNavigation';
import { WaveformPlayer } from '../components/WaveformPlayer';
import { AIReasoningCard } from '../components/AIReasoningCard';

type RightsStatus = 'clear' | 'unclear' | 'pending';

interface MockTrack {
  id: number;
  rank: number;
  title: string;
  artist: string;
  bpm: number;
  mood: string;
  genre: string;
  score: number;
  narrative: string;
  rightsStatus?: RightsStatus;
  isRank1?: boolean;
}

const INITIAL_TRACKS: MockTrack[] = [
  {
    id: 1,
    rank: 1,
    title: 'Never Letting Go',
    artist: 'The Slow Decay',
    bpm: 68,
    mood: 'Yearning · Warm',
    genre: 'Indie Folk',
    score: 72,
    narrative: 'A held breath of cello, then a voice that almost breaks — exactly the moment of surrender.',
    rightsStatus: 'unclear',
    isRank1: true,
  },
  {
    id: 2,
    rank: 2,
    title: 'Breaking Chains',
    artist: 'Elias River',
    bpm: 74,
    mood: 'Bittersweet',
    genre: 'Alt Pop',
    score: 65,
    narrative: 'Strong emotional swell, but the percussion fights the intimacy of the scene.',
  },
  {
    id: 3,
    rank: 3,
    title: 'Where We Belong',
    artist: 'Lumen Collective',
    bpm: 82,
    mood: 'Hopeful',
    genre: 'Indie Pop',
    score: 58,
    narrative: 'Lovely chorus, but the tempo lifts where the scene wants to settle.',
  },
];

const TABS = [
  { id: 'shortlist', label: 'Shortlist', count: 3 },
  { id: 'considered', label: 'Considered', count: 12 },
  { id: 'archive', label: 'Archive', count: 47 },
];

export default function ShortlistPage() {
  const [activeTab, setActiveTab] = useState('shortlist');
  const [playingTrackId, setPlayingTrackId] = useState<number | null>(null);
  const [tracks, setTracks] = useState<MockTrack[]>(INITIAL_TRACKS);

  const handlePlayToggle = (id: number) => {
    setPlayingTrackId((prev) => (prev === id ? null : id));
  };

  const handleDragStart = (e: React.DragEvent, trackId: number) => {
    e.dataTransfer.setData('text/plain', String(trackId));
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceId = parseInt(e.dataTransfer.getData('text/plain'), 10);
    const sourceIndex = tracks.findIndex((t) => t.id === sourceId);
    if (sourceIndex === -1 || sourceIndex === targetIndex) return;
    const next = [...tracks];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    // Recompute ranks immutably
    setTracks(next.map((t, i) => ({ ...t, rank: i + 1, isRank1: i === 0 })));
  };

  return (
    <div
      style={{ minHeight: '100vh', background: '#06030F', fontFamily: '"Manrope", system-ui, sans-serif', WebkitFontSmoothing: 'antialiased' }}
    >
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ letterSpacing: '0.125em', fontSize: 11, textTransform: 'uppercase', color: '#A78BFA', marginBottom: 6 }}>
              Shortlist · Scene 14
            </div>
            <h1 style={{ fontFamily: '"Instrument Serif", Georgia, serif', fontSize: 36, fontWeight: 400, color: '#E2E8F0', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.1 }}>
              The Quiet <span style={{ color: '#DB2777' }}>Surrender</span>
            </h1>
          </div>
          <TabNavigation tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
        </div>

        {/* Quick filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 32, flexWrap: 'wrap' }}>
          {['60–80 BPM', 'Intimate / Bittersweet', 'Clear Rights Only'].map((f) => (
            <span key={f} className="chip" style={{ fontSize: 13, padding: '6px 14px' }}>{f}</span>
          ))}
        </div>

        {/* Track list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {tracks.map((track, index) => (
            <div
              key={track.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, index)}
            >
              <DCTrackCard
                rank={track.rank}
                title={track.title}
                artist={track.artist}
                bpm={track.bpm}
                mood={track.mood}
                genre={track.genre}
                score={track.score}
                narrative={track.narrative}
                isRank1={track.isRank1}
                rightsStatus={track.rightsStatus}
                isPlaying={playingTrackId === track.id}
                onPlayToggle={() => handlePlayToggle(track.id)}
                onDragStart={(e) => handleDragStart(e, track.id)}
                editable
              />

              {/* Expanded: waveform + AI reasoning */}
              {playingTrackId === track.id && (
                <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <WaveformPlayer
                    trackTitle={track.title}
                    isPlaying
                    onPlayToggle={() => handlePlayToggle(track.id)}
                  />
                  <AIReasoningCard
                    reason={track.narrative}
                    keyStrengths={['Emotional precision', 'Dynamic restraint', 'Cinematic texture']}
                    fitScore={track.score}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 48, textAlign: 'center', fontSize: 11, color: 'rgba(167,139,250,0.5)', letterSpacing: '0.04em' }}>
          Drag cards to reorder · Tap play to expand AI reasoning + waveform
        </div>
      </div>
    </div>
  );
}
