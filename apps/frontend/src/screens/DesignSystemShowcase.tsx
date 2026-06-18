import { useState } from 'react';
import { ArcMatch, type ArcMatchMode } from '../components/ArcMatch';
import {
  arcMatchScore,
  arcBand,
  ARC_BAND_LABEL,
  ARC_BAND_SENTENCE,
  type ArcSegments,
} from '../engine/arcMatch';

/**
 * Design System 2.0 — living showcase.
 *
 * The reference surface for the SyncVision design language: the Arc Match™
 * signature component in each of its render modes, the metric-language banding,
 * and the token foundation (color, type, spacing, motion) that everything else
 * is built from. Open it at #design.
 */

// Canonical data from the deck (slides 13–14). The scores below are computed by
// the same deterministic engine the component uses — they are not typed in.
const SCENE: ArcSegments = { opening: 54, heldBreath: 44, turn: 70, release: 86 };

const CANDIDATES: Array<{ title: string; artist: string; song: ArcSegments }> = [
  { title: 'Never Letting Go', artist: 'The Quiet Cellar', song: { opening: 49, heldBreath: 46, turn: 73, release: 82 } }, // 93 · Excellent
  { title: 'Long Way Down', artist: 'Ember Reel', song: { opening: 54, heldBreath: 44, turn: 70, release: 62 } }, // 88 · Strong (one soft beat)
  { title: 'Breaking Chains', artist: 'Halfway Light', song: { opening: 72, heldBreath: 70, turn: 48, release: 80 } }, // 64 · Weak
];

const ACCENTS = [
  { token: '--accent-primary', hex: '#F5A623', use: 'Primary accent' },
  { token: '--accent-secondary', hex: '#DB2777', use: 'Secondary accent' },
  { token: '--accent-tertiary', hex: '#7C3AED', use: 'Tertiary / arc start' },
  { token: '--accent-iris', hex: '#8B5CF6', use: 'Iris' },
];

const ARC_SCALE = [
  { token: '--arc-excellent', band: 'Excellent', range: '90–100' },
  { token: '--arc-strong', band: 'Strong', range: '78–89' },
  { token: '--arc-partial', band: 'Partial', range: '65–77' },
  { token: '--arc-weak', band: 'Weak', range: '<65' },
];

const SPACE = ['--space-2', '--space-4', '--space-6', '--space-8', '--space-12', '--space-16'];
const RADII = ['--radius-xs', '--radius-md', '--radius-xl', '--radius-2xl'];
const MOTION = [
  { token: '--dur-instant', v: '80ms', use: 'hover tints, taps' },
  { token: '--dur-fast', v: '160ms', use: 'button & tab states' },
  { token: '--dur-base', v: '240ms', use: 'panel & card transitions' },
  { token: '--dur-slow', v: '420ms', use: 'score count-up, morphs' },
  { token: '--dur-cine', v: '900ms', use: 'arc draw-in, alignment' },
];

function Section({ eyebrow, title, blurb, children }: { eyebrow: string; title: string; blurb?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 'var(--space-24)' }}>
      <div className="sv-label" style={{ color: 'var(--accent-secondary)', display: 'inline-flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 32, height: 1, background: 'linear-gradient(90deg, var(--accent-secondary), transparent)' }} />
        {eyebrow}
      </div>
      <h2 className="sv-headline" style={{ margin: '12px 0 0', fontSize: '2.25rem' }}>{title}</h2>
      {blurb && <p className="sv-body" style={{ maxWidth: 620, marginTop: 'var(--space-3)' }}>{blurb}</p>}
      <div style={{ marginTop: 'var(--space-8)' }}>{children}</div>
    </section>
  );
}

export default function DesignSystemShowcase() {
  const [mode, setMode] = useState<ArcMatchMode>('static');
  const hero = CANDIDATES[0];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-canvas)' }}>
      <div style={{ maxWidth: 'var(--grid-max)', margin: '0 auto', padding: 'var(--space-16) var(--space-6) var(--space-24)' }}>
        {/* ── Cover ─────────────────────────────────────────────────────────── */}
        <header>
          <div className="sv-label" style={{ color: 'var(--accent-secondary)' }}>SyncVision · Product Design System 2.0</div>
          <h1 className="sv-display" style={{ margin: '16px 0 0' }}>
            Design the instrument,<br />not the dashboard.
          </h1>
          <p className="sv-narrative" style={{ maxWidth: 680, marginTop: 'var(--space-6)', color: 'var(--text-secondary)' }}>
            A film scene has an emotional arc. A song has an emotional arc. Story Match™ visualizes both and
            measures how closely they align — and this is the operating system for that idea.
          </p>
        </header>

        {/* ── Signature component ───────────────────────────────────────────── */}
        <Section
          eyebrow="The signature moment"
          title="Arc Match™"
          blurb="The single recognizable object of SyncVision. One deterministic engine renders every state. Matching beats glow gold, divergent beats glow red, and the score resolves only after alignment completes."
        >
          {/* mode switch */}
          <div style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 'var(--radius-pill)', background: 'var(--surface-raised)', border: '1px solid var(--hairline)', marginBottom: 'var(--space-6)' }}>
            {(['static', 'inspect', 'presentation'] as ArcMatchMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="sv-label"
                style={{
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-pill)',
                  background: mode === m ? 'var(--accent-tertiary)' : 'transparent',
                  color: mode === m ? '#fff' : 'var(--text-secondary)',
                  transition: 'background var(--dur-fast) var(--ease-standard)',
                }}
              >
                {m}
              </button>
            ))}
          </div>

          <ArcMatch
            key={mode /* remount so the draw-in replays per mode */}
            mode={mode}
            scene={SCENE}
            song={hero.song}
            trackTitle={hero.title}
            artist={hero.artist}
            sceneLabel="Scene 14 · The Quiet Surrender"
          />
          <p className="sv-body" style={{ marginTop: 'var(--space-4)', color: 'var(--text-muted)' }}>
            {mode === 'static' && 'STATIC — scene gradient, one dashed candidate, four segment anchors.'}
            {mode === 'inspect' && 'INSPECT — move across the chart: a playhead rides both curves and the segment gap reads out live.'}
            {mode === 'presentation' && "PRESENTATION — axis stripped for the director's room: just shapes and verdict."}
          </p>
        </Section>

        {/* ── Metric language ───────────────────────────────────────────────── */}
        <Section
          eyebrow="System · Narrative"
          title="How a score becomes a sentence"
          blurb="One banding lexicon turns every Arc Match score into supervisor language. We name feelings and moments, never genres and metadata."
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
            {CANDIDATES.map((c) => {
              const s = arcMatchScore(SCENE, c.song);
              const b = arcBand(s);
              return (
                <div key={c.title} style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--elev-2)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <span className="sv-data" style={{ fontSize: '2.5rem', color: `var(--arc-${b})` }}>{s}</span>
                    <span className="sv-label" style={{ color: `var(--arc-${b})` }}>{ARC_BAND_LABEL[b]}</span>
                  </div>
                  <div className="sv-body" style={{ color: 'var(--text-primary)', marginTop: 8 }}>{c.title}</div>
                  <div className="sv-label" style={{ color: 'var(--text-muted)', marginTop: 2 }}>{c.artist}</div>
                  <p className="sv-narrative" style={{ marginTop: 'var(--space-3)', color: 'var(--text-secondary)' }}>
                    “{ARC_BAND_SENTENCE[b]}”
                  </p>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ── Foundations: color ────────────────────────────────────────────── */}
        <Section eyebrow="Foundations" title="Color & tokens" blurb="Components reference semantic tokens only; the raw palette stays private. Two accents per view, maximum.">
          <div className="sv-label" style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>Accents — two per view, maximum</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-4)' }}>
            {ACCENTS.map((a) => (
              <div key={a.token} style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--hairline)' }}>
                <div style={{ height: 64, background: `var(${a.token})` }} />
                <div style={{ padding: 'var(--space-3)', background: 'var(--surface-raised)' }}>
                  <div className="sv-data" style={{ fontSize: 12 }}>{a.token}</div>
                  <div className="sv-label" style={{ color: 'var(--text-muted)', marginTop: 4 }}>{a.use} · {a.hex}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="sv-label" style={{ color: 'var(--text-muted)', margin: 'var(--space-8) 0 var(--space-4)' }}>Arc Match™ state scale — the core metric language</div>
          <div style={{ display: 'flex', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--hairline)' }}>
            {ARC_SCALE.map((a) => (
              <div key={a.token} style={{ flex: 1 }}>
                <div style={{ height: 64, background: `var(${a.token})` }} />
                <div style={{ padding: 'var(--space-3)', background: 'var(--surface-raised)' }}>
                  <div className="sv-body" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{a.band}</div>
                  <div className="sv-label" style={{ color: 'var(--text-muted)', marginTop: 2 }}>{a.range}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Foundations: type ─────────────────────────────────────────────── */}
        <Section eyebrow="Foundations" title="Typography" blurb="Serif for feeling, sans for function, mono for fact.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <TypeRow role="Display · Serif" cls="sv-display" sample="Does the music follow the scene?" style={{ fontSize: '2.75rem' }} />
            <TypeRow role="Headline · Serif" cls="sv-headline" sample="Story Match Score" />
            <TypeRow role="Narrative · Serif italic" cls="sv-narrative" sample="It settles into the held breath, then lifts on the turn." />
            <TypeRow role="Body · Manrope" cls="sv-body" sample="Tracks the scene almost exactly — restrained through the release." />
            <TypeRow role="Data · JetBrains Mono" cls="sv-data" sample="0:42 · 124 BPM · ARC 93" />
            <TypeRow role="Label · Mono" cls="sv-label" sample="EMOTIONAL ARC MATCH" />
          </div>
        </Section>

        {/* ── Foundations: spacing, radius, motion ──────────────────────────── */}
        <Section eyebrow="Foundations" title="Spacing, radius & motion" blurb="A 4px base rhythm, soft long shadows, and easing that settles and locks like an instrument coming into focus.">
          <div className="sv-label" style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>Spacing · 4px base</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            {SPACE.map((t) => (
              <div key={t} style={{ textAlign: 'center' }}>
                <div style={{ width: `var(${t})`, height: `var(${t})`, background: 'var(--gradient-arc)', borderRadius: 'var(--radius-xs)' }} />
                <div className="sv-label" style={{ color: 'var(--text-muted)', marginTop: 8 }}>{t.replace('--space-', '')}</div>
              </div>
            ))}
          </div>

          <div className="sv-label" style={{ color: 'var(--text-muted)', margin: 'var(--space-8) 0 var(--space-4)' }}>Radius · 6 → 28</div>
          <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            {RADII.map((t) => (
              <div key={t} style={{ width: 72, height: 72, background: 'var(--surface-card)', border: '1px solid var(--hairline-strong)', borderRadius: `var(${t})`, display: 'grid', placeItems: 'center' }}>
                <span className="sv-label" style={{ color: 'var(--text-muted)' }}>{t.replace('--radius-', '')}</span>
              </div>
            ))}
          </div>

          <div className="sv-label" style={{ color: 'var(--text-muted)', margin: 'var(--space-8) 0 var(--space-4)' }}>Motion · duration tokens</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 520 }}>
            {MOTION.map((m) => (
              <div key={m.token} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                <span className="sv-data" style={{ width: 120, fontSize: 12 }}>{m.token}</span>
                <span className="sv-data" style={{ width: 56, color: 'var(--accent-primary)', fontSize: 12 }}>{m.v}</span>
                <span className="sv-body" style={{ color: 'var(--text-muted)' }}>{m.use}</span>
              </div>
            ))}
          </div>
        </Section>

        <footer style={{ marginTop: 'var(--space-24)', paddingTop: 'var(--space-6)', borderTop: '1px solid var(--hairline)' }}>
          <p className="sv-label" style={{ color: 'var(--text-muted)' }}>Deterministic · Repeatable · Ownable</p>
        </footer>
      </div>
    </div>
  );
}

function TypeRow({ role, cls, sample, style }: { role: string; cls: string; sample: string; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 200px) 1fr', gap: 'var(--space-6)', alignItems: 'baseline', borderTop: '1px solid var(--hairline)', paddingTop: 'var(--space-4)' }}>
      <span className="sv-label" style={{ color: 'var(--text-muted)' }}>{role}</span>
      <span className={cls} style={style}>{sample}</span>
    </div>
  );
}
