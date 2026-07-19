/**
 * Live audio analyser — taps a playing <audio> element so the Story Match
 * visualizer can react to the real sound in real time.
 *
 * Constraints handled here:
 *  - createMediaElementSource() may be called only ONCE per element, so the
 *    source + analyser are cached per element in a WeakMap.
 *  - One shared AudioContext (browsers cap concurrent contexts).
 *  - Routing an element through the graph silences it unless the analyser is
 *    connected to destination — we do that.
 *  - Object-URL (blob:) sources are same-origin, so the analyser is never
 *    tainted by CORS.
 */

type ElNode = { analyser: AnalyserNode; source: MediaElementAudioSourceNode };

let sharedCtx: AudioContext | null = null;
const perElement = new WeakMap<HTMLMediaElement, ElNode>();

function ctx(): AudioContext | null {
  try {
    if (!sharedCtx) {
      const AC: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      sharedCtx = new AC();
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

/**
 * Get (or lazily create) the analyser for a media element. Returns null when
 * the Web Audio API is unavailable or the element can't be tapped — callers
 * fall back to the non-reactive time-based playhead.
 */
export function getAnalyser(el: HTMLMediaElement): AnalyserNode | null {
  const c = ctx();
  if (!c) return null;
  try {
    let node = perElement.get(el);
    if (!node) {
      const source = c.createMediaElementSource(el);
      const analyser = c.createAnalyser();
      analyser.fftSize = 256;              // 128 frequency bins
      analyser.smoothingTimeConstant = 0.78;
      source.connect(analyser);
      analyser.connect(c.destination);     // keep audio audible
      node = { analyser, source };
      perElement.set(el, node);
    }
    if (c.state === 'suspended') void c.resume();
    return node.analyser;
  } catch {
    return null;
  }
}

/** Resume the shared context (call on a user gesture such as pressing play). */
export function resumeAudioContext(): void {
  if (sharedCtx?.state === 'suspended') void sharedCtx.resume();
}
