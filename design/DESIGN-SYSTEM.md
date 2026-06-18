# SyncVision — Product Design System 2.0

> **Design the instrument, not the dashboard.**
>
> A film scene has an emotional arc. A song has an emotional arc. **Story Match™**
> visualizes both and measures how closely they align. This document is the
> operating system for that idea.

This is the canonical, version-controlled record of the design language. It pairs
with two pieces of code:

| Artifact | Path | Role |
|---|---|---|
| **Token foundation** | `apps/frontend/src/styles/tokens.css` | Color, type, spacing, elevation, motion — the bedrock every component references |
| **Signature component** | `apps/frontend/src/components/ArcMatch.tsx` | The Arc Match™ visualization — the one recognizable object of the product |
| **Living showcase** | `apps/frontend/src/screens/DesignSystemShowcase.tsx` | Reference surface, open at **`#design`** |

---

## 01 · Philosophy — ten principles

| | Principle | Meaning |
|---|---|---|
| P01 | Story before metadata | The emotional arc is the primary object. Rights and BPM are supporting evidence. |
| P02 | Emotion before admin | Show the shape first; clearance and paperwork resolve underneath. |
| P03 | Recommendation before reporting | Results read like a supervisor's shortlist. Every row carries an opinion. |
| P04 | One hero, many witnesses | The Arc Match visualization is the single hero. Scores and panels orbit it. |
| P05 | Determinism over mystique | Same track, same curve, every time. Never an opaque emotion oracle. |
| P06 | Shape, then number | The curves align first; the score resolves last. The number confirms the feeling. |
| P07 | Confidence, never play | Motion communicates certainty. Transitions settle and snap, never bounce. |
| P08 | Cinematic restraint | Midnight surfaces, negative space, two accents per view. Criterion, not BI. |
| P09 | Evidence on demand | Every claim is inspectable. Depth is available, never imposed. |
| P10 | End on the next action | Every screen terminates in a decision: shortlist, send, clear, request. |

---

## 02 · Color & tokens

Token names describe **function, not color**. Components reference semantic tokens
only; the raw palette stays private (the `--_*` variables in `tokens.css`).

### Surfaces — elevation ladder

| Token | Value | Use |
|---|---|---|
| `--surface-canvas` | `#0D0B1E` | the page |
| `--surface-raised` | `#120D26` | chips, rows |
| `--surface-card` | `#170B33` | Story Match cards |
| `--surface-panel` | `#1C1340` | decision panel |
| `--hairline` / `--hairline-strong` | `rgba(123,112,178,.16 / .30)` | the only borders in the system |

### Accents — two per view, maximum

| Token | Hex |
|---|---|
| `--accent-primary` | `#F5A623` |
| `--accent-secondary` | `#DB2777` |
| `--accent-tertiary` | `#7C3AED` |
| `--accent-iris` | `#8B5CF6` |
| `--gradient-arc` | `linear-gradient(90deg, tertiary → primary)` — the scene's journey, violet into gold |

### Arc Match™ state scale — the core metric language

A score is never just a number; it is a **band**. The scale runs from the
aligned-gold glow (top) to the mismatch-red glow (bottom) — the same two anchors
used for per-beat alignment, so the whole system speaks one color.

| Token | Band | Range | Value |
|---|---|---|---|
| `--arc-excellent` | Excellent | 90–100 | `#FFCF6B` *(= aligned glow)* |
| `--arc-strong` | Strong | 78–89 | `#F2B84B` |
| `--arc-partial` | Partial | 65–77 | `#E8895A` |
| `--arc-weak` | Weak | <65 | `#FF6B6B` *(= mismatch glow)* |
| `--arc-aligned` | matching beat | — | `#FFCF6B` |
| `--arc-mismatch` | divergent beat | — | `#FF6B6B` |

> **Derivation note.** The deck specifies exact values for the two glow anchors
> (`#FFCF6B` aligned, `#FF6B6B` mismatch). The two interior bands (`strong`,
> `partial`) are interpolated as a smooth gold→red ramp between them, so the state
> scale and the per-beat glow are one continuous language. No green is introduced —
> Arc Match speaks only gold↔red.

---

## 03 · Typography

**Serif for feeling, sans for function, mono for fact.**

| Role | Family | Token / class | Used for |
|---|---|---|---|
| Display | Instrument Serif | `.sv-display` | cover & presentation mode |
| Headline | Instrument Serif | `.sv-headline` | card & panel headlines |
| Narrative | Instrument Serif *italic* | `.sv-narrative` | why-it-works, scene language |
| Body | Manrope | `.sv-body` | operational copy |
| Data | JetBrains Mono | `.sv-data` | scores, timecodes, BPM |
| Label | JetBrains Mono | `.sv-label` | eyebrows, axis, tokens (uppercase) |

Font families are exposed as `--font-serif`, `--font-sans`, `--font-mono`. The
three families are loaded in `apps/frontend/index.html`.

---

## 04 · Spacing, grid & elevation

A **4px base rhythm** and a **12-column / 1280px** grid trade dashboard density for
breathing room.

- **Spacing** — `--space-1` (4px) through `--space-24` (96px); the token number is
  the multiple of the 4px base. Canonical steps: 2·4·6·8·12·16·24.
- **Grid** — `--grid-max: 1280px`, `--grid-columns: 12`, `--grid-gutter: --space-6`.
- **Radius** — `--radius-xs` (6) → `--radius-2xl` (28), plus `--radius-pill` (999px)
  for state pills, chips and meters.
- **Elevation** — `--elev-1`…`--elev-4`. Depth is built from **soft, long,
  low-opacity** shadows — never hard drops.

---

## 05 · Motion

**Motion communicates confidence, never play.** Durations run from an 80ms instant
to a 900ms cinematic arc-draw. The signature easing is `--ease-snap` — curves
settle and lock like an instrument coming into focus.

| Duration | Value | Easing | Curve |
|---|---|---|---|
| `--dur-instant` | 80ms | `--ease-snap` | `cubic-bezier(.16,1,.3,1)` — the alignment "lock" |
| `--dur-fast` | 160ms | `--ease-standard` | `cubic-bezier(.4,0,.2,1)` — general UI |
| `--dur-base` | 240ms | `--ease-decel` | `cubic-bezier(0,0,.2,1)` — entrances, draw-ins |
| `--dur-slow` | 420ms | `--ease-accel` | `cubic-bezier(.4,0,1,1)` — exits |
| `--dur-cine` | 900ms | | arc draw-in, alignment |

All duration tokens collapse to `0ms` under `prefers-reduced-motion: reduce`.

---

## 06 · Arc Match™ — the signature component

The single recognizable object of SyncVision. One deterministic engine renders
every state.

### Data contract

```ts
type ArcSegments = { opening: number; heldBreath: number; turn: number; release: number };
// each beat 0–100, 1:1 with the engine's ArcPhases

<ArcMatch
  scene={sceneSegments}
  song={songSegments}
  mode="static" | "inspect" | "presentation"
  trackTitle="Never Letting Go"
  artist="The Quiet Cellar"
  sceneLabel="Scene 14 · The Quiet Surrender"
/>
```

### Render modes

| Mode | Behavior |
|---|---|
| `static` | Resting overlay: scene gradient, one dashed candidate, four segment anchors. |
| `inspect` | A playhead rides both curves; the segment gap reads out live as you move across the chart. |
| `presentation` | Axis stripped for the director's room — just shapes and verdict, oversized. |

### The deterministic score

The Arc Match score is a **pure function of the two arcs** — no randomness, no
model, fully reproducible:

```
score = round( 100 − 2 × mean(|scene_beat − song_beat|) ),  clamped 0–100
```

Worked example (the deck's canonical "Never Letting Go"):

```
scene  54  44  70  86
song   49  46  73  82
gap     5   2   3   4   → mean 3.5 → 100 − 7 = 93  → Excellent
```

A beat is **in step** (glows gold) when its gap ≤ `ALIGN_THRESHOLD` (8); otherwise
it **diverges** (glows red). The score count-up resolves *only after* the curves
finish drawing in — shape, then number (P06).

`arcMatchScore`, `arcBand`, `ARC_BAND_LABEL` and `ARC_BAND_SENTENCE` are exported
from the component for reuse anywhere a score or its sentence is shown.

---

## 07 · Data-visualization language

No random charts. Every measurement uses one of five related encodings, so a
supervisor reads any screen the same way.

| | Encoding | Rule |
|---|---|---|
| 01 | Emotion → **shape** | Feeling is always a curve over narrative time. Never a bar, never a radar. |
| 02 | Alignment → **gold ↔ red** | Wherever two things should match, gold means aligned and red means diverges. |
| 03 | Readiness → **meter** | Rights, clearance and confidence are horizontal fills, colored by state. |
| 04 | Score → **one big number** | The Story Match Score is the only large numeral on a screen, banded by Arc Match. |
| 05 | State → **pill + LED** | Discrete states are pills with a glowing LED. Color carries meaning; the dot feels live. |

**One scene, one truth** — a measurement looks identical on every screen and
export. Consistency makes the arc iconic. *Deterministic · Repeatable · Ownable.*

---

## 08 · Narrative voice — speak like a supervisor

SyncVision names **feelings and moments**, never genres and metadata. One banding
lexicon turns every score into a sentence — and we never anthropomorphize the
engine into an oracle.

| Band | Range | Sentence |
|---|---|---|
| Excellent | 90–100 | "Follows the scene almost exactly." |
| Strong | 78–89 | "Tracks the shape with one soft beat." |
| Partial | 65–77 | "The right feeling, the wrong moment." |
| Weak | <65 | "A different journey entirely." |

| | |
|---|---|
| ✗ **Search engine** | `Track #4821 · 124 BPM · "emotional" · 82% relevance` |
| ✓ **Supervisor** | *It settles into the held breath, then lifts on the turn.* |

---

## Screen architecture (from the deck)

The 2.0 deck defines five screens, all built from the components above. They are
the roadmap for applying this system across the product:

1. **Story Match Workspace** — three zones, one reading order: scene → candidates → reason. Terminates in *Open decision*.
2. **Track Detail** — segment-by-segment Arc Match; same encodings as the workspace, nothing re-learned.
3. **Director Review** — no chrome, readable across a room; ends on *Approve* / *Show another*.
4. **Rights Resolution** — clearance as a pipeline (identify → master → sync → quote → locked), friction surfaced as state, living one click off the arc.
5. **Composer Feedback** — the arc becomes a brief; notes anchor to the beat where target and delivered cue diverge.
