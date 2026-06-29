import os

# Pin all numerical backends to a single thread BEFORE importing numpy/librosa.
# Multi-threaded BLAS/OpenMP/Numba kernels reorder floating-point reductions
# non-deterministically across runs, which produces ULP-level drift in
# librosa's spectral features. The whole forensic-adjudication thesis depends on
# byte-identical output for a given input, so this must run first.
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["NUMBA_NUM_THREADS"] = "1"
os.environ["NUMBA_CACHE_DIR"] = "/tmp/numba_cache"

import sys
import json
import hashlib
import shutil
import tempfile

import numpy as np
import librosa
from mutagen.id3 import ID3, ID3NoHeaderError


MODEL_VERSION = "2.0.0-phase1"

# ── Ingestion modes ────────────────────────────────────────────────────────
# Fast-Path Production Mode: 16 kHz mono. Phase-locked to 25 fps -> hop 640.
#   Nyquist = 8 kHz, so the High-Fidelity Air band (10-20 kHz) is physically
#   empty and the Presence band is truncated to 3-8 kHz. This is the default,
#   matching the single-arg CLI contract the backend uses to spawn the worker.
# Deep Research Mode: native sample rate (44.1 / 48 kHz), preserving the full
#   spectrum so the Air band and high-frequency onsets are valid.
FAST_PATH_SR = 16000
DEFAULT_FPS = 25


def sanitize_mp3(path):
    """
    Return a path safe to pass to librosa.load.  If the file has ID3 COMM
    frames with empty text/description — which cause libmpg123 to call
    abort() and kill the process — strip them from a temp copy and return
    that path instead.  Caller deletes the temp file when tmp=True.

    Ported verbatim from analyze.py so this worker is self-contained and the
    two entry points cannot drift apart on MP3 handling.
    """
    if not path.lower().endswith(".mp3"):
        return path, False
    try:
        tags = ID3(path)
    except ID3NoHeaderError:
        return path, False
    except Exception:
        return path, False

    bad_keys = [
        k for k in tags.keys()
        if k.startswith("COMM")
        and (
            not tags[k].text
            or not any(str(t).strip() for t in tags[k].text)
            or not str(getattr(tags[k], "desc", "") or "").strip()
        )
    ]
    if not bad_keys:
        return path, False

    tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
    tmp.close()
    shutil.copy2(path, tmp.name)
    try:
        fixed = ID3(tmp.name)
        for k in bad_keys:
            fixed.delall(k)
        fixed.save(tmp.name)
    except Exception:
        os.unlink(tmp.name)
        return path, False
    return tmp.name, True


def safe_normalize(arr):
    """
    Min-max normalize a 1D array strictly into [0.0, 1.0]. Flat or
    zero-magnitude arrays (silence, or a band that lies entirely above the
    Nyquist ceiling) collapse to all-zeros rather than dividing by ~0.
    """
    arr = np.asarray(arr, dtype=np.float64)
    mn = float(np.min(arr))
    mx = float(np.max(arr))
    diff = mx - mn
    if diff < 1e-8:
        return np.zeros_like(arr, dtype=np.float64)
    return (arr - mn) / diff


def load_audio(path, target_sr):
    """
    Decode `path` to a mono float32 signal in [-1, 1] at `target_sr`.

    target_sr=None loads at the file's native rate (Deep Research Mode).
    Otherwise librosa resamples with an anti-aliasing filter (soxr_hq) — this
    is why we do NOT read raw PCM with scipy and slice: naive decimation from
    e.g. 44.1 kHz to 16 kHz would fold everything above 8 kHz back into the
    audible band as alias artefacts and corrupt every downstream metric.

    Stereo is collapsed to mono by averaging channels (mono=True does this),
    preserving transient energy present in either channel.
    """
    load_path, is_tmp = sanitize_mp3(path)
    try:
        # dtype=float32 matches analyze.py for determinism — float64 accumulates
        # more ULP variance through the spectral pipeline.
        y, sr = librosa.load(load_path, sr=target_sr, mono=True, dtype=np.float32)
    except Exception as load_err:
        # libmpg123 can reject a tag mutagen didn't flag. Strip ALL ID3 tags
        # and retry — the audio payload itself is usually fine.
        if is_tmp:
            try:
                os.unlink(load_path)
            except OSError:
                pass
            is_tmp = False

        print(
            f"[analyze_v2] WARNING: librosa.load failed ({load_err}); "
            "stripping all ID3 tags and retrying.",
            file=sys.stderr,
        )
        strip_tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
        strip_tmp.close()
        shutil.copy2(path, strip_tmp.name)
        try:
            try:
                all_tags = ID3(strip_tmp.name)
                all_tags.delete()
                all_tags.save(strip_tmp.name)
            except ID3NoHeaderError:
                pass
            y, sr = librosa.load(strip_tmp.name, sr=target_sr, mono=True, dtype=np.float32)
        finally:
            try:
                os.unlink(strip_tmp.name)
            except OSError:
                pass
    else:
        if is_tmp:
            try:
                os.unlink(load_path)
            except OSError:
                pass

    return y, int(sr)


def choose_n_fft(sr, hop_length):
    """
    Pick an STFT window. Fast-path (16 kHz) uses 1024 rather than the bare 512
    the spec floats: at 25 fps the hop is 640 samples, and n_fft=512 < 640
    would leave a 128-sample gap between frames (20% of the signal never
    analyzed). n_fft=1024 keeps frames overlapping AND gives the 20-80 Hz
    Sub-Zero band enough bins to be meaningful (~15.6 Hz/bin vs 31.25).

    Deep mode uses 2048. As a hard guarantee against inter-frame gaps at any
    rate/fps combination, bump n_fft to the next power of two above hop_length
    whenever the hop would otherwise meet or exceed the window.
    """
    n_fft = 1024 if sr < 22050 else 2048
    if hop_length >= n_fft:
        n_fft = 1 << int(hop_length).bit_length()
    return n_fft


def band_energy(mags, freqs, lo, hi, n_frames, hi_inclusive=False):
    """Sum magnitude across [lo, hi) (or [lo, hi] if hi_inclusive) per frame."""
    if hi_inclusive:
        mask = (freqs >= lo) & (freqs <= hi)
    else:
        mask = (freqs >= lo) & (freqs < hi)
    if not np.any(mask):
        return np.zeros(n_frames, dtype=np.float64)
    return np.sum(mags[mask, :], axis=0)


def detect_onsets(band_name, envelope_norm, times, delta=0.15):
    """
    Band-limited transient onsets via positive spectral flux + peak picking.

    `envelope_norm` is the min-max-normalized band envelope. A band that lies
    above Nyquist (e.g. Air at 16 kHz) or is otherwise silent normalizes to
    all-zeros — we skip it here, which is the rate-agnostic replacement for the
    original `sr < 20000` guard (that guard was wrong: the Air band needs
    Nyquist >= 20 kHz, i.e. sr >= 40 kHz, not 20 kHz).
    """
    if not np.any(envelope_norm):
        return []

    flux = np.diff(envelope_norm, prepend=envelope_norm[0])
    flux[flux < 0.0] = 0.0
    flux[0] = 0.0  # no preceding frame -> no onset can exist at t=0
    flux_norm = safe_normalize(flux)
    if not np.any(flux_norm):
        return []

    peaks = librosa.util.peak_pick(
        flux_norm,
        pre_max=2,
        post_max=2,
        pre_avg=3,
        post_avg=3,
        delta=delta,
        wait=5,
    )

    return [
        {
            "timeSec": float(round(times[p], 4)),
            "band": band_name,
            "magnitude": float(round(float(flux_norm[p]) + 0.0, 4)),
        }
        for p in peaks
    ]


def analyze_audio(file_path, mode="fast", fps=DEFAULT_FPS, sr_override=None):
    """
    Deterministic forensic audio analysis. Returns the Phase 1 timeline schema.

    mode="fast" -> 16 kHz mono fast path; mode="deep" -> native rate.
    sr_override forces a specific target rate regardless of mode.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Audio file not found at: {file_path}")

    with open(file_path, "rb") as f:
        input_hash = hashlib.sha256(f.read()).hexdigest()

    if sr_override is not None:
        target_sr = int(sr_override)
    elif mode == "deep":
        target_sr = None  # native
    else:
        target_sr = FAST_PATH_SR

    y, sr = load_audio(file_path, target_sr)
    if y.size == 0:
        raise ValueError("Decoded audio is empty (zero samples).")

    duration_sec = float(len(y)) / sr
    nyquist = sr / 2.0

    # ── Phase-locked hop length ────────────────────────────────────────────
    # L_hop = fs / FPS must be an integer or the analysis grid drifts against
    # the video timeline by the fractional remainder every frame. Use floor
    # division and surface a warning if the chosen (sr, fps) pair is not
    # phase-locked so the caller can pick a compatible rate.
    if fps <= 0:
        raise ValueError(f"fps must be positive, got {fps}")
    hop_length = sr // fps
    if hop_length < 1:
        raise ValueError(f"sr={sr} is too low for fps={fps} (hop < 1 sample).")
    remainder = sr % fps
    phase_locked = remainder == 0
    if not phase_locked:
        drift_samples_per_frame = remainder / fps
        print(
            f"[analyze_v2] WARNING: sr={sr} / fps={fps} = {sr / fps:.4f} is not "
            f"an integer hop ({hop_length} used); drift of "
            f"{drift_samples_per_frame:.4f} samples/frame will accumulate.",
            file=sys.stderr,
        )

    n_fft = choose_n_fft(sr, hop_length)

    # ── STFT magnitude spectrogram ─────────────────────────────────────────
    mags = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=hop_length, center=True))
    n_frames = mags.shape[1]
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    # No n_fft offset: with center=True, frame t is centered at sample t*hop,
    # so its time is simply t*hop/sr. Passing n_fft here would shift every
    # timestamp by +n_fft/2 (the center=False convention) and mis-time onsets.
    times = librosa.frames_to_time(np.arange(n_frames), sr=sr, hop_length=hop_length)

    # ── Multi-band forensic energy (Nyquist-aware upper bounds) ────────────
    sub_raw = band_energy(mags, freqs, 20, 80, n_frames)
    zero_raw = band_energy(mags, freqs, 300, 3000, n_frames)
    pres_hi = min(10000.0, nyquist)
    presence_raw = band_energy(mags, freqs, 3000, pres_hi, n_frames)
    air_raw = band_energy(mags, freqs, 10000, 20000, n_frames, hi_inclusive=True)

    sub_norm = safe_normalize(sub_raw)
    zero_norm = safe_normalize(zero_raw)
    presence_norm = safe_normalize(presence_raw)
    air_norm = safe_normalize(air_raw)

    # ── CMAM: normalized chroma entropy (ABSOLUTE 0..1, not min-max) ────────
    # Feed the POWER spectrogram (|S|^2) — that is what librosa's chroma_stft
    # uses internally when called on a waveform. The original code passed |S|,
    # which weights pitch classes differently. Entropy is normalized by
    # log2(12) so it already spans [0,1] (0 = consonant, 1 = max dissonance);
    # min-max normalizing it again (as the original did) would erase that
    # absolute calibration, so we deliberately do NOT.
    eps = 1e-10
    chroma = librosa.feature.chroma_stft(
        S=mags ** 2, sr=sr, n_fft=n_fft, hop_length=hop_length
    )
    chroma_norm = chroma / (np.sum(chroma, axis=0, keepdims=True) + eps)
    chroma_entropy = -np.sum(chroma_norm * np.log2(chroma_norm + eps), axis=0)
    # +0.0 collapses signed-zero (-0.0) to 0.0 before serialization. Librosa
    # 0.10.x and 0.11.x produce -0.0 for silent frames on different numpy
    # versions; the two strings are byte-different even though they are
    # numerically equal, which breaks the byte-identity determinism guarantee.
    cmam_tension = np.clip(chroma_entropy / np.log2(12.0), 0.0, 1.0) + 0.0

    # ── Band-limited onset detection (Sub-Zero kicks + Air cymbals) ────────
    majorOnsets = []
    majorOnsets += detect_onsets("sub_zero", sub_norm, times)
    majorOnsets += detect_onsets("high_fidelity_air", air_norm, times)
    majorOnsets.sort(key=lambda o: o["timeSec"])

    def _ser(v):
        # +0.0 here covers band envelopes for the same signed-zero reason above.
        return round(float(v) + 0.0, 5)

    return {
        # camelCase throughout to match the backend's TypeScript conventions.
        # Named "forensicTimeline" (not "timeline") to avoid a key collision
        # with the VATDI "timeline" column that consumer.ts / scores.ts read as
        # number[][] — an object would corrupt every downstream reader silently.
        "durationSeconds": float(round(duration_sec, 4)),
        "fps": int(fps),
        "sampleRate": int(sr),
        "nFft": int(n_fft),
        "hopLength": int(hop_length),
        "phaseLocked": bool(phase_locked),
        "mode": "deep" if target_sr is None else "fast",
        "forensicTimeline": {
            "subZero": [_ser(v) for v in sub_norm],
            "zeroPocketZone": [_ser(v) for v in zero_norm],
            # Presence band: additive field the 4-band spec defines but the
            # original payload omitted. Non-breaking (no consumer reads it yet).
            "presence": [_ser(v) for v in presence_norm],
            "highFidelityAir": [_ser(v) for v in air_norm],
            "cmamTension": [_ser(v) for v in cmam_tension],
        },
        "majorOnsets": majorOnsets,
        "inputHash": input_hash,
        "modelVersion": MODEL_VERSION,
    }


def parse_args(argv):
    """Minimal arg parsing: <path> is required; flags are optional and the
    backend's single-arg `python analyze_v2.py <file>` spawn still works."""
    path = None
    mode = "fast"
    fps = DEFAULT_FPS
    sr_override = None
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--deep":
            mode = "deep"
        elif a == "--fast":
            mode = "fast"
        elif a == "--fps":
            if i + 1 >= len(argv):
                raise ValueError("--fps requires a value")
            i += 1
            try:
                fps = int(argv[i])
            except ValueError:
                raise ValueError(f"--fps value must be an integer, got: {argv[i]!r}")
        elif a == "--sr":
            if i + 1 >= len(argv):
                raise ValueError("--sr requires a value")
            i += 1
            try:
                sr_override = int(argv[i])
            except ValueError:
                raise ValueError(f"--sr value must be an integer, got: {argv[i]!r}")
        elif not a.startswith("--") and path is None:
            path = a
        else:
            raise ValueError(f"Unexpected argument: {a}")
        i += 1
    if path is None:
        raise ValueError("Missing input file path.")
    return path, mode, fps, sr_override


def main():
    try:
        path, mode, fps, sr_override = parse_args(sys.argv[1:])
    except ValueError as e:
        print(
            f"ERROR: {e}\n"
            "Usage: analyze_v2.py <audio_file> [--deep|--fast] [--fps N] [--sr N]",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        result = analyze_audio(path, mode=mode, fps=fps, sr_override=sr_override)
        # allow_nan=False: a stray NaN/Inf emits bare tokens NaN/Infinity which
        # are NOT valid JSON (RFC 8259) and crash JSON.parse in the Node backend.
        # Better to exit nonzero loudly than emit unparseable output silently.
        print(json.dumps(result, separators=(",", ":"), allow_nan=False))
        sys.exit(0)
    except Exception as err:
        print(f"ERROR: {err}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
