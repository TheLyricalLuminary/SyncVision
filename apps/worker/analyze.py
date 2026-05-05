import os

# Pin all numerical backends to a single thread BEFORE importing numpy/librosa.
# Multi-threaded BLAS/OpenMP/Numba kernels reorder floating-point reductions
# non-deterministically across runs, which produces ULP-level drift in
# librosa's spectral features and breaks the inputHash determinism check.
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["NUMBA_NUM_THREADS"] = "1"
os.environ["NUMBA_CACHE_DIR"] = "/tmp/numba_cache"

import sys
import json
import hashlib

import numpy as np
import librosa


def normalize(arr):
    mn = arr.min()
    mx = arr.max()
    return (arr - mn) / (mx - mn + 1e-8)


def resample_to_512(arr):
    x_old = np.linspace(0, 1, len(arr))
    x_new = np.linspace(0, 1, 512)
    return np.interp(x_new, x_old, arr)


def analyze(path):
    with open(path, "rb") as f:
        raw_bytes = f.read()
    input_hash = hashlib.sha256(raw_bytes).hexdigest()

    # dtype=np.float32 is required for determinism — float64 accumulates more
    # ULP variance through the spectral pipeline.
    y, sr = librosa.load(path, sr=22050, mono=True, dtype=np.float32)

    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
    rms = librosa.feature.rms(y=y)[0]
    contrast = librosa.feature.spectral_contrast(y=y, sr=sr).mean(axis=0)
    zcr = librosa.feature.zero_crossing_rate(y)[0]
    bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr)[0]

    valence = resample_to_512(normalize(centroid))
    arousal = resample_to_512(normalize(rms))
    tension = resample_to_512(normalize(contrast))
    dominance = resample_to_512(1.0 - normalize(zcr))
    intimacy = resample_to_512(1.0 - normalize(bandwidth))

    timeline = np.stack([valence, arousal, tension, dominance, intimacy], axis=1)

    # Signal stability confidence: mean std across 5 dims, normalised so that
    # a signal with mean_std >= 0.12 scores ≥ 1.0 (capped). Flat/synthetic
    # signals have std ≈ 0, real MIR signals typically land 0.12–0.25.
    # Gate threshold in the API is 0.8, which corresponds to mean_std ≥ 0.096.
    stds = [float(np.std(d)) for d in [valence, arousal, tension, dominance, intimacy]]
    confidence = round(min(1.0, float(np.mean(stds)) / 0.12), 4)

    duration = float(len(y)) / sr

    tempo_arr, _ = librosa.beat.beat_track(y=y, sr=sr)
    tempo = float(np.atleast_1d(tempo_arr)[0])

    valence_mean = float(np.mean(valence))
    arousal_mean = float(np.mean(arousal))

    if valence_mean >= 0.60:
        tonal_character = "bright"
    elif valence_mean >= 0.40:
        tonal_character = "warm"
    elif valence_mean >= 0.25:
        tonal_character = "shadowed"
    else:
        tonal_character = "dark"

    if arousal_mean >= 0.65 and tempo >= 120:
        energy_character = "driving"
    elif arousal_mean >= 0.65 and tempo < 120:
        energy_character = "intense"
    elif arousal_mean >= 0.40 and tempo >= 100:
        energy_character = "forward"
    elif arousal_mean >= 0.40 and tempo < 100:
        energy_character = "measured"
    elif arousal_mean < 0.40 and tempo >= 90:
        energy_character = "restrained"
    else:
        energy_character = "sparse"

    return {
        "timeline": [[round(float(v), 8) for v in row] for row in timeline],
        "dimensions": ["valence", "arousal", "tension", "dominance", "intimacy"],
        "durationSeconds": duration,
        "tempo": round(tempo, 2),
        "tonalCharacter": tonal_character,
        "energyCharacter": energy_character,
        "inputHash": input_hash,
        "confidence": confidence,
    }


def main():
    if len(sys.argv) != 2:
        print("Usage: analyze.py <audio_file>", file=sys.stderr)
        sys.exit(1)

    try:
        result = analyze(sys.argv[1])
        print(json.dumps(result, separators=(",", ":")))
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
