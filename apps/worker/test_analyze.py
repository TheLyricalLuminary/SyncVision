import subprocess
import sys
import struct
import wave
import os
import tempfile
import json


def make_test_wav(path, duration_sec=1.0, sr=22050):
    n_samples = int(sr * duration_sec)
    # Simple deterministic sine wave at 440 Hz
    import math
    samples = [int(32767 * math.sin(2 * math.pi * 440 * i / sr)) for i in range(n_samples)]
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(struct.pack(f"<{n_samples}h", *samples))


def run_analyze(wav_path):
    script = os.path.join(os.path.dirname(__file__), "analyze.py")
    result = subprocess.run(
        [sys.executable, script, wav_path],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"analyze.py failed:\n{result.stderr}"
    return result.stdout


def test_determinism():
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        wav_path = f.name

    try:
        make_test_wav(wav_path)

        out1 = run_analyze(wav_path)
        out2 = run_analyze(wav_path)

        assert out1 == out2, "Outputs differ between runs — not deterministic"

        data = json.loads(out1)
        assert data["dimensions"] == ["valence", "arousal", "tension", "dominance", "intimacy"]
        assert len(data["timeline"]) == 512
        for row in data["timeline"]:
            assert len(row) == 5
            for v in row:
                assert 0.0 <= v <= 1.0, f"Value out of range: {v}"
        assert len(data["inputHash"]) == 64
        assert isinstance(data["durationSeconds"], float)

        print("PASS: byte-identical outputs, shape (512, 5), all values in [0, 1]")
    finally:
        os.unlink(wav_path)


if __name__ == "__main__":
    test_determinism()
