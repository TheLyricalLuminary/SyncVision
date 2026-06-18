import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ArcMatch } from './ArcMatch';
import type { ArcSegments } from '../engine/arcMatch';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const SCENE: ArcSegments = { opening: 54, heldBreath: 44, turn: 70, release: 86 };

/** "Never Letting Go" — canonical score 93, Excellent band. */
const SONG_EXCELLENT: ArcSegments = { opening: 49, heldBreath: 46, turn: 73, release: 82 };

/** Strong band candidate (score 88). */
const SONG_STRONG: ArcSegments = { opening: 54, heldBreath: 44, turn: 70, release: 62 };

/** Weak band candidate (score 64). */
const SONG_WEAK: ArcSegments = { opening: 72, heldBreath: 70, turn: 48, release: 80 };

// Disable animations in all tests so the score is shown immediately.
const DEFAULT_PROPS = {
  scene: SCENE,
  song: SONG_EXCELLENT,
  animate: false,
} as const;

// ── Accessibility ─────────────────────────────────────────────────────────────

describe('ArcMatch — accessibility', () => {
  it('renders an SVG with role="img"', () => {
    render(<ArcMatch {...DEFAULT_PROPS} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('sets a meaningful aria-label with score, band and sentence', () => {
    render(<ArcMatch {...DEFAULT_PROPS} />);
    const svg = screen.getByRole('img');
    const label = svg.getAttribute('aria-label') ?? '';
    // score 93
    expect(label).toContain('93');
    // band label
    expect(label).toContain('Excellent');
    // band sentence
    expect(label).toContain('Follows the scene almost exactly.');
  });

  it('reflects the overridden score in the aria-label when the score prop is used', () => {
    render(<ArcMatch {...DEFAULT_PROPS} score={77} />);
    const label = screen.getByRole('img').getAttribute('aria-label') ?? '';
    expect(label).toContain('77');
    expect(label).toContain('Partial');
  });
});

// ── Score display ─────────────────────────────────────────────────────────────

describe('ArcMatch — score display', () => {
  it('shows the deterministic score when animate=false', () => {
    render(<ArcMatch {...DEFAULT_PROPS} />);
    // The score "93" should be visible in the verdict area.
    expect(screen.getByText('93')).toBeInTheDocument();
  });

  it('shows the overridden score when the score prop is provided', () => {
    render(<ArcMatch {...DEFAULT_PROPS} score={55} />);
    expect(screen.getByText('55')).toBeInTheDocument();
  });

  it('shows the Excellent band label in the verdict area', () => {
    render(<ArcMatch {...DEFAULT_PROPS} />);
    // ARC_BAND_LABEL[excellent] = 'Excellent'  + ' arc match'
    expect(screen.getByText(/Excellent arc match/i)).toBeInTheDocument();
  });

  it('shows the Strong band label for a strong candidate', () => {
    render(<ArcMatch scene={SCENE} song={SONG_STRONG} animate={false} />);
    expect(screen.getByText(/Strong arc match/i)).toBeInTheDocument();
  });

  it('shows the Weak band label for a weak candidate', () => {
    render(<ArcMatch scene={SCENE} song={SONG_WEAK} animate={false} />);
    expect(screen.getByText(/Weak arc match/i)).toBeInTheDocument();
  });

  it('shows "Story Match™ Score" label in non-presentation mode', () => {
    render(<ArcMatch {...DEFAULT_PROPS} mode="static" />);
    expect(screen.getByText(/Story Match™ Score/i)).toBeInTheDocument();
  });
});

// ── Header (trackTitle / sceneLabel / artist) ─────────────────────────────────

describe('ArcMatch — header', () => {
  it('renders the trackTitle when provided in static mode', () => {
    render(<ArcMatch {...DEFAULT_PROPS} trackTitle="Never Letting Go" />);
    expect(screen.getByText('Never Letting Go')).toBeInTheDocument();
  });

  it('renders the artist name alongside the track title', () => {
    render(<ArcMatch {...DEFAULT_PROPS} trackTitle="Never Letting Go" artist="The Quiet Cellar" />);
    expect(screen.getByText(/The Quiet Cellar/)).toBeInTheDocument();
  });

  it('renders the sceneLabel eyebrow when provided', () => {
    render(<ArcMatch {...DEFAULT_PROPS} sceneLabel="Scene 14 · The Quiet Surrender" />);
    expect(screen.getByText('Scene 14 · The Quiet Surrender')).toBeInTheDocument();
  });

  it('shows "Emotional Arc Match" label in the header', () => {
    render(<ArcMatch {...DEFAULT_PROPS} trackTitle="Test Track" />);
    expect(screen.getByText(/Emotional Arc Match/i)).toBeInTheDocument();
  });

  it('does not render a header when neither trackTitle nor sceneLabel are provided', () => {
    render(<ArcMatch {...DEFAULT_PROPS} />);
    expect(screen.queryByText(/Emotional Arc Match/i)).not.toBeInTheDocument();
  });
});

// ── Render modes ──────────────────────────────────────────────────────────────

describe('ArcMatch — render modes', () => {
  it('shows axis beat labels in static mode', () => {
    render(<ArcMatch {...DEFAULT_PROPS} mode="static" />);
    expect(screen.getByText(/Opening/i)).toBeInTheDocument();
    expect(screen.getByText(/Held Breath/i)).toBeInTheDocument();
    expect(screen.getByText(/The Turn/i)).toBeInTheDocument();
    expect(screen.getByText(/Release/i)).toBeInTheDocument();
  });

  it('shows axis beat labels in inspect mode', () => {
    render(<ArcMatch {...DEFAULT_PROPS} mode="inspect" />);
    expect(screen.getByText(/Opening/i)).toBeInTheDocument();
  });

  it('does NOT show axis beat labels in presentation mode', () => {
    render(<ArcMatch {...DEFAULT_PROPS} mode="presentation" />);
    expect(screen.queryByText(/Opening/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Held Breath/i)).not.toBeInTheDocument();
  });

  it('hides the header in presentation mode even when trackTitle is provided', () => {
    render(<ArcMatch {...DEFAULT_PROPS} mode="presentation" trackTitle="Never Letting Go" />);
    expect(screen.queryByText('Never Letting Go')).not.toBeInTheDocument();
  });

  it('shows the band sentence in presentation mode', () => {
    render(<ArcMatch {...DEFAULT_PROPS} mode="presentation" />);
    expect(screen.getByText('Follows the scene almost exactly.')).toBeInTheDocument();
  });

  it('does NOT show "Story Match™ Score" label in presentation mode', () => {
    render(<ArcMatch {...DEFAULT_PROPS} mode="presentation" />);
    expect(screen.queryByText(/Story Match™ Score/i)).not.toBeInTheDocument();
  });

  it('shows the Legend (Aligned / Diverges) in static mode', () => {
    render(<ArcMatch {...DEFAULT_PROPS} mode="static" />);
    expect(screen.getByText('Aligned')).toBeInTheDocument();
    expect(screen.getByText('Diverges')).toBeInTheDocument();
  });

  it('shows the Legend in inspect mode', () => {
    render(<ArcMatch {...DEFAULT_PROPS} mode="inspect" />);
    expect(screen.getByText('Aligned')).toBeInTheDocument();
    expect(screen.getByText('Diverges')).toBeInTheDocument();
  });

  it('does NOT show the Legend in presentation mode', () => {
    render(<ArcMatch {...DEFAULT_PROPS} mode="presentation" />);
    expect(screen.queryByText('Aligned')).not.toBeInTheDocument();
    expect(screen.queryByText('Diverges')).not.toBeInTheDocument();
  });
});

// ── SVG geometry basics ───────────────────────────────────────────────────────

describe('ArcMatch — SVG', () => {
  it('renders with viewBox "0 0 640 280"', () => {
    render(<ArcMatch {...DEFAULT_PROPS} />);
    const svg = screen.getByRole('img');
    expect(svg.getAttribute('viewBox')).toBe('0 0 640 280');
  });

  it('renders an SVG with width="100%"', () => {
    render(<ArcMatch {...DEFAULT_PROPS} />);
    expect(screen.getByRole('img').getAttribute('width')).toBe('100%');
  });
});

// ── className passthrough ─────────────────────────────────────────────────────

describe('ArcMatch — className', () => {
  it('applies a custom className to the figure element', () => {
    const { container } = render(<ArcMatch {...DEFAULT_PROPS} className="my-arc" />);
    const figure = container.querySelector('figure');
    expect(figure?.className).toContain('my-arc');
  });
});

// ── Partial band sentence ─────────────────────────────────────────────────────

describe('ArcMatch — band sentences in presentation mode', () => {
  const cases: Array<[ArcSegments, string]> = [
    [SONG_EXCELLENT, 'Follows the scene almost exactly.'],
    [SONG_STRONG, 'Tracks the shape with one soft beat.'],
    [SONG_WEAK, 'A different journey entirely.'],
  ];

  for (const [song, expectedSentence] of cases) {
    it(`shows "${expectedSentence}" for appropriate candidate`, () => {
      render(<ArcMatch scene={SCENE} song={song} mode="presentation" animate={false} />);
      expect(screen.getByText(expectedSentence)).toBeInTheDocument();
    });
  }
});

// ── Animation disabled: score resolves immediately ────────────────────────────

describe('ArcMatch — animate=false', () => {
  it('shows the full score immediately (no count-up delay)', () => {
    render(<ArcMatch scene={SCENE} song={SONG_EXCELLENT} animate={false} />);
    // With animate=false, progress starts at 1, so shownScore = finalScore = 93
    expect(screen.getByText('93')).toBeInTheDocument();
  });
});

// ── prefers-reduced-motion ────────────────────────────────────────────────────

describe('ArcMatch — prefers-reduced-motion', () => {
  beforeEach(() => {
    // Simulate the user preferring reduced motion.
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the full score immediately when reduced motion is preferred', () => {
    render(<ArcMatch scene={SCENE} song={SONG_EXCELLENT} animate={true} />);
    // When prefers-reduced-motion: reduce, playable=false → progress=1 → shownScore=finalScore=93
    expect(screen.getByText('93')).toBeInTheDocument();
  });
});