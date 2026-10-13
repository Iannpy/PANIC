"""Generate/verify local instrumental derivatives without touching source audio.

Requires Demucs 4.0.1 and FFmpeg/ffprobe. Use --separated-dir to validate and
copy a completed Demucs run instead of running the model again.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / "assets" / "audio"
OUTPUT = AUDIO / "instrumental"
QA = ROOT / "qa" / "karaoke-media-integrity.json"


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def probe(path: Path) -> dict:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_name,sample_rate,channels", "-of", "json", str(path)],
        check=True, capture_output=True, text=True,
    )
    return json.loads(result.stdout)


def verify_decode(path: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-v", "error", "-xerror", "-i", str(path), "-f", "null", os.devnull],
        check=True, capture_output=True,
    )


def prepare(separated: Path, files: list[Path], originals: dict[str, str]) -> list[dict]:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    checks: list[dict] = []
    for source in files:
        stem = separated / "htdemucs" / source.stem / "no_vocals.mp3"
        if not stem.is_file():
            raise FileNotFoundError(f"Missing instrumental stem: {stem}")
        source_info, stem_info = probe(source), probe(stem)
        delta = abs(float(source_info["format"]["duration"]) - float(stem_info["format"]["duration"]))
        if (delta > 0.25 or stem_info["streams"][0]["codec_name"] != "mp3"
                or stem_info["streams"][0]["channels"] != 2):
            raise ValueError(f"Instrumental differs in duration/format: {source.name} ({delta:.3f}s)")
        target = OUTPUT / source.name
        shutil.copyfile(stem, target)
        if sha(target) != sha(stem):
            raise RuntimeError(f"Copy verification failed: {target}")
        verify_decode(target)
        checks.append({
            "source": source.relative_to(ROOT).as_posix(),
            "instrumental": target.relative_to(ROOT).as_posix(),
            "sourceSHA256": originals[source.name],
            "instrumentalSHA256": sha(target),
            "durationDifferenceSeconds": round(delta, 4),
            "sourceDurationSeconds": float(source_info["format"]["duration"]),
            "instrumentalDurationSeconds": float(stem_info["format"]["duration"]),
            "codec": stem_info["streams"][0]["codec_name"],
            "fullDecodePassed": True,
        })
        print(f"{source.name}: instrumental verified ({delta:.3f}s duration difference)")
    return checks


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--demucs-python", type=Path, default=Path(sys.executable))
    parser.add_argument("--separated-dir", type=Path, help="reuse completed Demucs output")
    args = parser.parse_args()
    files = sorted(AUDIO.glob("[0-9][0-9]-*.mp3"))
    if len(files) != 10:
        raise ValueError(f"Expected ten prepared MP3s, found {len(files)}")
    originals = {path.name: sha(path) for path in files}

    if args.separated_dir:
        checks = prepare(args.separated_dir, files, originals)
    else:
        with tempfile.TemporaryDirectory(prefix="panic-karaoke-") as folder:
            separated = Path(folder)
            subprocess.run([
                str(args.demucs_python), "-m", "demucs", "-n", "htdemucs",
                "--two-stems", "vocals", "--mp3", "--mp3-bitrate", "192",
                "-d", "cpu", "-j", "1", "-o", str(separated),
                *(str(path) for path in files),
            ], check=True)
            checks = prepare(separated, files, originals)

    if {path.name: sha(path) for path in files} != originals:
        raise RuntimeError("Original prepared MP3s changed during separation")
    QA.write_text(json.dumps({
        "originalsUnchanged": True,
        "auditoryReview": "pending: mechanical decode/duration checks do not verify vocal removal by ear",
        "tracks": checks,
    }, indent=2), encoding="utf-8")
    print(f"Verified {len(checks)} local instrumentals; original MP3s unchanged")


if __name__ == "__main__":
    main()
