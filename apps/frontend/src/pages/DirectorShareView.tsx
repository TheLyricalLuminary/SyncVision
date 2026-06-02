// apps/frontend/src/pages/DirectorShareView.tsx
// Standalone high-fidelity Director/Share prototype.
// Uses DC design-canvas components; not wired to live API data.
import { useState } from 'react';
import { DCTrackCard } from '../components/DCTrackCard';
import { ApprovePassControls } from '../components/ApprovePassControls';
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
}

const MOCK_TRACKS: MockTrack[] = [
  {
    id: 1, rank: 1,
    title: 'Never Letting Go', artist: 'The Slow Decay',
    bpm: 68, mood: 'Yearning · Warm', genre: 'Indie Folk', score: 72,
    narrative: 'A held breath of cello, then a voice that almost breaks — exactly the moment of surrender.',
    rightsStatus: 'unclear',
  },
  {
    id: 2, rank: 2,
    title: 'Breaking Chains', artist: 'Elias River',
    bpm: 74, mood: 'Bittersweet', genre: 'Alt Pop', score: 65,
    narrative: 'Strong emotional swell, but the percussion fights the intimacy of the scene.',
  },
  {
    id: 3, rank: 3,
    title: 'Where We Belong', artist: 'Lumen Collective',
    bpm: 82, mood: 'Hopeful', genre: 'Indie Pop', score: 58,
    narrative: 'Lovely chorus, but the tempo lifts where the scene wants to settle.',
  },
];

export default function DirectorShareView() {
  const [decisions, setDecisions] = useState<Record<number, 'approve' | 'pass'>>({});
  const [comments, setComments] = useState<Record<number, string>>({});
  const [expandedTrack, setExpandedTrack] = useState<number | null>(null);

  const approvedCount = Object.values(decisions).filter((d) => d === 'approve').length;
  const passedCount   = Object.values(decisions).filter((d) => d === 'pass').length;
  const decidedCount  = approvedCount + passedCount;

  const handleDecision = (trackId: number, action: 'approve' | 'pass', comment?: string) => {
    setDecisions((prev) => ({ ...prev, [trackId]: action }));
    if (comment) setComments((prev) => ({ ...prev, [trackId]: comment }));
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0D0B1E', fontFamily: '"Manrope", system-ui, sans-serif', WebkitFontSmoothing: 'antialiased', color: '#F4F2FA' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* ── Sender header ── */}
        <div style={{ borderBottom: '1px solid rgba(123,112,178,0.20)', paddingBottom: 32, marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {/* Avatar */}
              <div style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg, #F5A623, #DB2777)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <div>
                <div style={{ color: '#F4F2FA', fontWeight: 600 }}>Shared by Jessica Mendoza</div>
                <div style={{ color: 'rgba(123,112,178,0.7)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  May 22, 2026 · Music Supervisor
                </div>
              </div>
            </div>
            <span className="chip" style={{ fontSize: 11, letterSpacing: '0.1em' }}>READ-ONLY MODE</span>
          </div>

          {/* Scene brief card */}
          <div style={{ marginTop: 32, background: 'linear-gradient(135deg, #170B33, #0D0B1E)', border: '1px solid rgba(123,112,178,0.20)', borderRadius: 24, padding: '28px 32px' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(123,112,178,0.7)', marginBottom: 10 }}>The Scene</div>
            <p style={{ fontFamily: '"Instrument Serif", Georgia, serif', fontSize: 22, lineHeight: 1.3, color: '#F4F2FA', fontStyle: 'italic', margin: 0 }}>
              A slow, intimate moment — the character finally lets their guard down.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
              {['Scene 14 · 1:42', '60–80 BPM', 'Vocal · Sparse'].map((f) => (
                <span key={f} className="chip" style={{ fontSize: 12 }}>{f}</span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Shortlist heading ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 28, flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ fontFamily: '"Instrument Serif", Georgia, serif', fontSize: 28, fontWeight: 400, color: '#F4F2FA', margin: 0 }}>
            Three for your call
          </h2>
          <span style={{ fontSize: 12, color: '#9B93C4', letterSpacing: '0.06em' }}>Ranked by AI fit</span>
        </div>

        {/* ── Track list ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {MOCK_TRACKS.map((track) => {
            const decision = decisions[track.id];
            const comment  = comments[track.id];
            const expanded = expandedTrack === track.id;

            return (
              <div key={track.id}>
                <DCTrackCard
                  rank={track.rank}
                  title={track.title}
                  artist={track.artist}
                  bpm={track.bpm}
                  mood={track.mood}
                  genre={track.genre}
                  score={track.score}
                  narrative={track.narrative}
                  rightsStatus={track.rightsStatus}
                  isRank1={track.rank === 1}
                  isPlaying={expanded}
                  onPlayToggle={() => setExpandedTrack(expanded ? null : track.id)}
                  editable={false}
                />

                {/* Expanded: waveform + AI reasoning */}
                {expanded && (
                  <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <WaveformPlayer
                      trackTitle={track.title}
                      isPlaying
                      onPlayToggle={() => setExpandedTrack(null)}
                    />
                    <AIReasoningCard
                      reason={track.narrative}
                      keyStrengths={['Emotional precision', 'Cinematic texture', 'Dynamic restraint']}
                      fitScore={track.score}
                    />
                  </div>
                )}

                {/* Approve / Pass */}
                <div style={{ marginTop: 12 }}>
                  <ApprovePassControls
                    trackTitle={track.title}
                    onApprove={(c) => handleDecision(track.id, 'approve', c)}
                    onPass={(c)    => handleDecision(track.id, 'pass', c)}
                  />
                </div>

                {/* Decision badge */}
                {decision && (
                  <div style={{ marginTop: 10 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      padding: '6px 16px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                      ...(decision === 'approve'
                        ? { background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.40)', color: '#34D399' }
                        : { background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.40)', color: '#F87171' }),
                    }}>
                      {decision === 'approve' ? '✓ APPROVED' : '✕ PASSED'}
                      {comment && <span style={{ color: 'rgba(226,232,240,0.65)', fontWeight: 400 }}>— "{comment}"</span>}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Decision summary ── */}
        {decidedCount > 0 && (
          <div style={{ marginTop: 56, border: '1px solid rgba(123,112,178,0.20)', borderRadius: 24, padding: '36px 32px', background: '#170B33', textAlign: 'center' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#9B93C4', marginBottom: 14 }}>Decision Summary</div>
            <div style={{ fontFamily: '"Instrument Serif", Georgia, serif', fontSize: 40, fontWeight: 400, color: '#F4F2FA', lineHeight: 1.1 }}>
              <span style={{ color: '#34D399' }}>{approvedCount} Approved</span>
              {passedCount > 0 && <> · {passedCount} Passed</>}
            </div>
            <div style={{ marginTop: 10, fontSize: 13, color: 'rgba(123,112,178,0.70)' }}>
              Your choices will sync back to Jessica in real time
            </div>
          </div>
        )}

        <div style={{ marginTop: 48, textAlign: 'center', fontSize: 11, color: 'rgba(123,112,178,0.45)', letterSpacing: '0.04em' }}>
          syncvision.app/s/9F2K-LMQ · No account needed
        </div>
      </div>
    </div>
  );
}
