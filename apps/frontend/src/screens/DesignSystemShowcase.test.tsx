import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DesignSystemShowcase from './DesignSystemShowcase';

// ── Cover / header ────────────────────────────────────────────────────────────

describe('DesignSystemShowcase — cover header', () => {
  it('renders the product headline', () => {
    render(<DesignSystemShowcase />);
    expect(screen.getByText(/Design the instrument/i)).toBeInTheDocument();
  });

  it('renders the brand eyebrow label', () => {
    render(<DesignSystemShowcase />);
    expect(screen.getByText(/SyncVision · Product Design System 2\.0/i)).toBeInTheDocument();
  });

  it('renders the cover paragraph mentioning Story Match™', () => {
    render(<DesignSystemShowcase />);
    // "Story Match™" appears both in the cover paragraph and in the ArcMatch verdict area.
    expect(screen.getAllByText(/Story Match™/).length).toBeGreaterThanOrEqual(1);
  });
});

// ── Arc Match section ─────────────────────────────────────────────────────────

describe('DesignSystemShowcase — Arc Match section', () => {
  it('renders the "Arc Match™" section heading', () => {
    render(<DesignSystemShowcase />);
    expect(screen.getByText('Arc Match™')).toBeInTheDocument();
  });

  it('renders mode buttons for static, inspect, and presentation', () => {
    render(<DesignSystemShowcase />);
    expect(screen.getByRole('button', { name: /static/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /inspect/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /presentation/i })).toBeInTheDocument();
  });

  it('defaults to static mode and shows the static description', () => {
    render(<DesignSystemShowcase />);
    expect(screen.getByText(/STATIC — scene gradient/i)).toBeInTheDocument();
  });

  it('switches to inspect mode when the inspect button is clicked', () => {
    render(<DesignSystemShowcase />);
    fireEvent.click(screen.getByRole('button', { name: /inspect/i }));
    expect(screen.getByText(/INSPECT — move across the chart/i)).toBeInTheDocument();
  });

  it('switches to presentation mode when the presentation button is clicked', () => {
    render(<DesignSystemShowcase />);
    fireEvent.click(screen.getByRole('button', { name: /presentation/i }));
    expect(screen.getByText(/PRESENTATION — axis stripped/i)).toBeInTheDocument();
  });

  it('switches back to static from presentation', () => {
    render(<DesignSystemShowcase />);
    fireEvent.click(screen.getByRole('button', { name: /presentation/i }));
    fireEvent.click(screen.getByRole('button', { name: /static/i }));
    expect(screen.getByText(/STATIC — scene gradient/i)).toBeInTheDocument();
  });

  it('renders the hero track title "Never Letting Go"', () => {
    render(<DesignSystemShowcase />);
    // Appears in both the ArcMatch header and the metric language cards.
    expect(screen.getAllByText('Never Letting Go').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the scene label', () => {
    render(<DesignSystemShowcase />);
    expect(screen.getByText('Scene 14 · The Quiet Surrender')).toBeInTheDocument();
  });
});

// ── Metric language section ───────────────────────────────────────────────────

describe('DesignSystemShowcase — metric language section', () => {
  it('renders the "How a score becomes a sentence" heading', () => {
    render(<DesignSystemShowcase />);
    expect(screen.getByText(/How a score becomes a sentence/i)).toBeInTheDocument();
  });

  it('renders all three candidate track titles', () => {
    render(<DesignSystemShowcase />);
    // "Never Letting Go" appears in both the ArcMatch header and metric cards.
    expect(screen.getAllByText('Never Letting Go').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Long Way Down')).toBeInTheDocument();
    expect(screen.getByText('Breaking Chains')).toBeInTheDocument();
  });

  it('renders all three artist names', () => {
    render(<DesignSystemShowcase />);
    expect(screen.getByText('The Quiet Cellar')).toBeInTheDocument();
    expect(screen.getByText('Ember Reel')).toBeInTheDocument();
    expect(screen.getByText('Halfway Light')).toBeInTheDocument();
  });

  it('renders the correct band labels for the canonical candidates', () => {
    render(<DesignSystemShowcase />);
    // "Never Letting Go" → score 93 → Excellent (appears multiple times due to header + metric section)
    const excellentEls = screen.getAllByText(/Excellent/i);
    expect(excellentEls.length).toBeGreaterThanOrEqual(1);
    // "Long Way Down" → score 88 → Strong
    expect(screen.getAllByText(/Strong/i).length).toBeGreaterThanOrEqual(1);
    // "Breaking Chains" → score 64 → Weak
    expect(screen.getAllByText(/Weak/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders the band sentences for the candidates', () => {
    render(<DesignSystemShowcase />);
    // Sentences appear in both the metric cards (with surrounding quotes) and
    // the ArcMatch SVG aria-label; use getAllByText to handle either occurrence.
    expect(screen.getAllByText(/Follows the scene almost exactly\./).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Tracks the shape with one soft beat\./).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/A different journey entirely\./).length).toBeGreaterThanOrEqual(1);
  });

  it('renders the correct numeric scores (93, 88, 64)', () => {
    render(<DesignSystemShowcase />);
    // Each score should appear at least once in the metric language cards.
    // Note: "93" may also appear in the SVG aria-label in the Arc Match section.
    expect(screen.getAllByText('93').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('88').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('64').length).toBeGreaterThanOrEqual(1);
  });
});

// ── Color & tokens section ────────────────────────────────────────────────────

describe('DesignSystemShowcase — Color & tokens section', () => {
  it('renders the "Color & tokens" heading', () => {
    render(<DesignSystemShowcase />);
    expect(screen.getByText('Color & tokens')).toBeInTheDocument();
  });

  it('renders all four accent token names', () => {
    render(<DesignSystemShowcase />);
    expect(screen.getByText('--accent-primary')).toBeInTheDocument();
    expect(screen.getByText('--accent-secondary')).toBeInTheDocument();
    expect(screen.getByText('--accent-tertiary')).toBeInTheDocument();
    expect(screen.getByText('--accent-iris')).toBeInTheDocument();
  });

  it('renders all four Arc Match state bands in the scale', () => {
    render(<DesignSystemShowcase />);
    // Each band name appears in both the Arc Match verdict area and the scale swatches.
    expect(screen.getAllByText('Excellent').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Strong').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Partial').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Weak').length).toBeGreaterThanOrEqual(1);
  });

  it('shows range labels for the Arc Match state scale', () => {
    render(<DesignSystemShowcase />);
    expect(screen.getByText('90–100')).toBeInTheDocument();
    expect(screen.getByText('78–89')).toBeInTheDocument();
    expect(screen.getByText('65–77')).toBeInTheDocument();
    expect(screen.getByText('<65')).toBeInTheDocument();
  });
});

// ── Typography section ────────────────────────────────────────────────────────

describe('DesignSystemShowcase — Typography section', () => {
  it('renders the "Typography" heading', () => {
    render(<DesignSystemShowcase />);
    expect(screen.getByText('Typography')).toBeInTheDocument();
  });

  it('renders the role labels for the six type roles', () => {
    render(<DesignSystemShowcase />);
    expect(screen.getByText('Display · Serif')).toBeInTheDocument();
    expect(screen.getByText('Headline · Serif')).toBeInTheDocument();
    expect(screen.getByText('Narrative · Serif italic')).toBeInTheDocument();
    expect(screen.getByText('Body · Manrope')).toBeInTheDocument();
    expect(screen.getByText('Data · JetBrains Mono')).toBeInTheDocument();
    expect(screen.getByText('Label · Mono')).toBeInTheDocument();
  });

  it('renders the display type sample text', () => {
    render(<DesignSystemShowcase />);
    expect(screen.getByText('Does the music follow the scene?')).toBeInTheDocument();
  });

  it('renders the data type sample with ARC 93', () => {
    render(<DesignSystemShowcase />);
    expect(screen.getByText('0:42 · 124 BPM · ARC 93')).toBeInTheDocument();
  });
});

// ── Spacing, radius & motion section ─────────────────────────────────────────

describe('DesignSystemShowcase — Spacing, radius & motion section', () => {
  it('renders the "Spacing, radius & motion" heading', () => {
    render(<DesignSystemShowcase />);
    expect(screen.getByText('Spacing, radius & motion')).toBeInTheDocument();
  });

  it('renders motion token durations', () => {
    render(<DesignSystemShowcase />);
    expect(screen.getByText('80ms')).toBeInTheDocument();
    expect(screen.getByText('160ms')).toBeInTheDocument();
    expect(screen.getByText('240ms')).toBeInTheDocument();
    expect(screen.getByText('420ms')).toBeInTheDocument();
    expect(screen.getByText('900ms')).toBeInTheDocument();
  });

  it('renders motion token names', () => {
    render(<DesignSystemShowcase />);
    expect(screen.getByText('--dur-instant')).toBeInTheDocument();
    expect(screen.getByText('--dur-cine')).toBeInTheDocument();
  });

  it('renders motion use descriptions', () => {
    render(<DesignSystemShowcase />);
    expect(screen.getByText('hover tints, taps')).toBeInTheDocument();
    expect(screen.getByText('arc draw-in, alignment')).toBeInTheDocument();
  });
});

// ── Footer ────────────────────────────────────────────────────────────────────

describe('DesignSystemShowcase — footer', () => {
  it('renders the footer tagline', () => {
    render(<DesignSystemShowcase />);
    expect(screen.getByText('Deterministic · Repeatable · Ownable')).toBeInTheDocument();
  });
});