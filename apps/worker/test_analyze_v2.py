import subprocess
import sys
import wave
import os
import tempfile
import json
import math


SCRIPT = os.path.join(os.path.dirname(__file__), "analyze_v2.py")
TIMELINE_KEYS = ["subZero", "zeroPocketZone", "presence", "highFidelityAir", "cmamTension"]


def make_wav(path, sr=16000, duration_sec=2.0, channels=1, freqs=(440.0,)):
    """Write a deterministic int16 WAV. `freqs` per channel (recycled if short)."""
    n = int(sr * duration_sec)
    frames = bytearray()
    for i in range(n):
        for ch in range(channels):
            f = freqs[ch % len(freqs)]
            s = int(32767 * 0.8 * math.sin(2 * math.pi * f * i / sr))
            frames += int(s).to_bytes(2, "little", signed=True)
    with wave.open(path, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(bytes(frames))


def run(wav_path, *extra):
    result = subprocess.run(
        [sys.executable, SCRIPT, wav_path, *extra],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"analyze_v2.py failed:\n{result.stderr}"
    # stdout must be a single clean JSON line (no logging leakage)
    assert result.stdout.count("\n") <= 1, f"stdout not single-line: {result.stdout!r}"
    return result.stdout, result.stderr


def assert_timeline(data):
    tl = data["forensicTimeline"]
    assert set(tl.keys()) == set(TIMELINE_KEYS), f"unexpected keys: {tl.keys()}"
    lengths = {k: len(tl[k]) for k in TIMELINE_KEYS}
    assert len(set(lengths.values())) == 1, f"timeline lengths differ: {lengths}"
    for k in TIMELINE_KEYS:
        for v in tl[k]:
            assert 0.0 <= v <= 1.0, f"{k} value out of range: {v}"
            assert v != float("-inf") and v == v, f"{k} has NaN/Inf: {v}"


def test_fast_path_16k_mono():
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        p = f.name
    try:
        make_wav(p, sr=16000, channels=1, freqs=(440.0,))
        out1, _ = run(p)
        out2, _ = run(p)
        assert out1 == out2, "fast-path output not byte-identical across runs"

        d = json.loads(out1)
        assert d["mode"] == "fast"
        assert d["sampleRate"] == 16000
        assert d["hopLength"] == 640, d["hopLength"]
        assert d["phaseLocked"] is True
        assert d["nFft"] >= d["hopLength"], "n_fft must be >= hop (no frame gaps)"
        assert len(d["inputHash"]) == 64
        assert "durationSeconds" in d, "camelCase durationSeconds required"
        assert_timeline(d)

        # Air band (10-20 kHz) is entirely above the 8 kHz Nyquist at 16 kHz,
        # so it must be all-zeros and produce no air onsets.
        assert all(v == 0.0 for v in d["forensicTimeline"]["highFidelityAir"]), \
            "Air band must be empty at 16 kHz"
        assert all(o["band"] != "high_fidelity_air" for o in d["majorOnsets"]), \
            "No air onsets possible at 16 kHz"
        print("PASS fast_path_16k_mono: deterministic, hop=640, Air empty, schema OK")
    finally:
        os.unlink(p)


def test_deep_48k_stereo_air_present():
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        p = f.name
    try:
        # Stereo, different tone per channel (exercise downmix); 12 kHz lands in
        # the Air band, which is valid at 48 kHz (Nyquist 24 kHz).
        make_wav(p, sr=48000, channels=2, freqs=(220.0, 12000.0))
        out, _ = run(p, "--deep")
        d = json.loads(out)
        assert d["mode"] == "deep"
        assert d["sampleRate"] == 48000
        assert d["hopLength"] == 1920, d["hopLength"]
        assert d["phaseLocked"] is True
        assert_timeline(d)
        assert any(v > 0.0 for v in d["forensicTimeline"]["highFidelityAir"]), \
            "Air band should carry energy at 48 kHz with a 12 kHz tone"
        print("PASS deep_48k_stereo: downmix + Air band populated, hop=1920")
    finally:
        os.unlink(p)


def test_signed_zero():
    """silence must not produce -0.0 in the JSON payload (librosa version sensitivity)."""
    import struct
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        p = f.name
    try:
        # 1 second of pure silence
        n = 16000
        with wave.open(p, "wb") as wf:
            wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(16000)
            wf.writeframes(struct.pack(f"<{n}h", *([0] * n)))
        out, _ = run(p)
        assert "-0.0" not in out, "Signed -0.0 leaked into JSON output (byte-identity violation)"
        assert "NaN" not in out and "Infinity" not in out, "Non-finite value in JSON"
        print("PASS signed_zero: no -0.0, NaN, or Infinity in silent-file output")
    finally:
        os.unlink(p)


def test_phase_lock_warning():
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        p = f.name
    try:
        # 16000 / 24 = 666.67 -> not phase-locked; field must report False and a
        # warning must go to stderr (never stdout).
        make_wav(p, sr=16000, channels=1)
        out, err = run(p, "--fps", "24")
        d = json.loads(out)
        assert d["phaseLocked"] is False
        assert "WARNING" in err and "not" in err
        print("PASS phase_lock_warning: fractional hop flagged, stdout still clean")
    finally:
        os.unlink(p)


if __name__ == "__main__":
    test_fast_path_16k_mono()
    test_deep_48k_stereo_air_present()
    test_signed_zero()
    test_phase_lock_warning()
    print("\nALL TESTS PASSED")
