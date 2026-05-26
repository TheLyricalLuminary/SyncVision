"""
extract_metadata.py — read embedded tags from a WAV/MP3 file using mutagen.

Usage: python extract_metadata.py <audio_file>
Prints a single-line JSON object on stdout:
    {"isrc": "...", "title": "...", "artist": "..."}   // present keys only
Exits 0 on success (even if no tags were found — JSON may be empty {}).
Exits 1 on file-not-found or unreadable file.

Tag sources, in priority order:
- ID3 TSRC frame (MP3 / tagged WAV) → "isrc"
- ID3 TIT2 frame                    → "title"
- ID3 TPE1 frame                    → "artist"
- Vorbis / FLAC "ISRC" comment      → "isrc"   (fallback)
- Vorbis / FLAC "TITLE" comment     → "title"  (fallback)
- Vorbis / FLAC "ARTIST" comment    → "artist" (fallback)
"""

import json
import os
import sys


def extract(path: str) -> dict:
    if not os.path.isfile(path):
        raise FileNotFoundError(path)

    out: dict = {}

    # mutagen.File auto-detects the format. easy=False so we can read raw frames.
    from mutagen import File as MutagenFile

    f = MutagenFile(path)
    if f is None:
        return out

    # ID3 path (MP3 + WAV with embedded ID3)
    tags = getattr(f, "tags", None)
    if tags is not None:
        # ID3 tag dict supports .getall("TSRC")
        try:
            tsrc = tags.getall("TSRC")
            if tsrc:
                value = str(tsrc[0]).strip()
                if value:
                    out["isrc"] = value
        except (AttributeError, KeyError):
            pass

        try:
            title_frames = tags.getall("TIT2")
            if title_frames:
                value = str(title_frames[0]).strip()
                if value:
                    out["title"] = value
        except (AttributeError, KeyError):
            pass

        try:
            artist_frames = tags.getall("TPE1")
            if artist_frames:
                value = str(artist_frames[0]).strip()
                if value:
                    out["artist"] = value
        except (AttributeError, KeyError):
            pass

        # Vorbis-style fallback (FLAC, OGG, some WAVs)
        if "isrc" not in out:
            for key in ("ISRC", "isrc"):
                v = tags.get(key)
                if v:
                    s = (v[0] if isinstance(v, list) else v)
                    s = str(s).strip()
                    if s:
                        out["isrc"] = s
                        break
        if "title" not in out:
            for key in ("TITLE", "title"):
                v = tags.get(key)
                if v:
                    s = (v[0] if isinstance(v, list) else v)
                    s = str(s).strip()
                    if s:
                        out["title"] = s
                        break
        if "artist" not in out:
            for key in ("ARTIST", "artist"):
                v = tags.get(key)
                if v:
                    s = (v[0] if isinstance(v, list) else v)
                    s = str(s).strip()
                    if s:
                        out["artist"] = s
                        break

    return out


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: extract_metadata.py <audio_file>", file=sys.stderr)
        return 1
    try:
        result = extract(sys.argv[1])
        print(json.dumps(result, separators=(",", ":")))
        return 0
    except FileNotFoundError as e:
        print(f"Error: file not found: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
