"""Refine sparse lyric anchors against locally separated vocal stems.

This is a *draft alignment*, not a substitute for listening review. The CTC
model was trained for speech, not singing; low-confidence lines keep the
interpolated timings. It never edits the source transcripts.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import subprocess
import time
import unicodedata
from pathlib import Path

import numpy as np
import torch
from torchaudio.pipelines import MMS_FA


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "letras"
OUTPUT = ROOT / "lyrics-timings.json"
spec = importlib.util.spec_from_file_location("karaoke_prepare", ROOT / "scripts" / "prepare-karaoke-lyrics.py")
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


def normalized_words(text: str) -> list[str]:
    text = unicodedata.normalize("NFKD", text.lower()).encode("ascii", "ignore").decode("ascii")
    return [word for word in (re.sub("[^a-z']", "", raw) for raw in text.split()) if word]


def audio_slice(path: Path, start: float, end: float) -> torch.Tensor:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", str(start), "-t", str(end - start), "-i", str(path),
         "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
        check=True, capture_output=True,
    ).stdout
    return torch.from_numpy(np.frombuffer(raw, dtype=np.float32).copy()).unsqueeze(0)


def align_group(model, tokenizer, aligner, vocal: Path, texts: list[str], start: float, end: float) -> list[dict | None]:
    words: list[str] = []
    counts: list[int] = []
    for text in texts:
        line_words = normalized_words(text)
        counts.append(len(line_words))
        words.extend(line_words)
    if not words:
        return [None] * len(texts)
    waveform = audio_slice(vocal, start, end)
    with torch.inference_mode():
        emission, _ = model(waveform)
        spans = aligner(emission[0], tokenizer(words))
    ratio = waveform.shape[1] / 16000 / emission.shape[1]
    result: list[dict | None] = []
    cursor = 0
    for count in counts:
        if not count:
            result.append(None)
            continue
        word_spans = spans[cursor:cursor + count]
        cursor += count
        tokens = [span for word in word_spans for span in word]
        if not tokens:
            result.append(None)
            continue
        score = sum(span.score * len(span) for span in tokens) / sum(len(span) for span in tokens)
        result.append({
            "start": round(start + word_spans[0][0].start * ratio, 2),
            "end": round(start + word_spans[-1][-1].end * ratio, 2),
            "confidence": round(score, 3),
        })
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--vocals-root", type=Path, required=True, help="Demucs separated/htdemucs directory")
    parser.add_argument("--wait-seconds", type=int, default=0, help="wait for Demucs to finish each vocal stem")
    args = parser.parse_args()
    catalog = (ROOT / "tracks-data.js").read_text(encoding="utf-8")
    tracks = [json.loads(item) for item in re.findall(r"\{\s*\"id\":.*?\n  \}", catalog, flags=re.DOTALL)]
    torch.set_num_threads(3)
    model = MMS_FA.get_model().eval()
    tokenizer, aligner = MMS_FA.get_tokenizer(), MMS_FA.get_aligner()
    output: dict[str, dict] = {}
    for track in tracks:
        source = next(SOURCE.glob(f"{track['id']:02d} - *.txt"))
        vocal = args.vocals_root / Path(track["src"]).stem / "vocals.mp3"
        deadline = time.monotonic() + args.wait_seconds
        while not vocal.is_file():
            if time.monotonic() >= deadline:
                raise FileNotFoundError(vocal)
            time.sleep(10)
        # The file appears only after Demucs has completed this song. A short
        # stable-size check also avoids reading a still-flushing MP3.
        size = vocal.stat().st_size
        time.sleep(3)
        if vocal.stat().st_size != size:
            time.sleep(3)
        approximate = prepare.make_lines(source, float(track["duration"]))
        blocks = prepare.parse_blocks(source)
        anchors = sorted(set(stamp for stamp, _, _ in blocks))
        timings = [dict(start=line["start"], end=line["end"], confidence=0, method="anchor") for line in approximate]
        cursor = 0
        for anchor_index, anchor in enumerate(anchors):
            texts = [line for stamp, _, group in blocks if stamp == anchor for line in group]
            if not texts:
                continue
            next_anchor = anchors[anchor_index + 1] if anchor_index + 1 < len(anchors) else float(track["duration"])
            window_start = max(0, anchor - 5)
            window_end = min(float(track["duration"]), max(next_anchor + 15, anchor + len(texts) * 4.2 + 8))
            try:
                proposed = align_group(model, tokenizer, aligner, vocal, texts, window_start, window_end)
            except (RuntimeError, ValueError) as error:
                print(f"{source.name} @ {anchor}s: alignment failed ({error}); using anchors", flush=True)
                proposed = [None] * len(texts)
            for index, candidate in enumerate(proposed):
                if candidate and candidate["confidence"] >= 0.4 and 0.25 <= candidate["end"] - candidate["start"] <= 14:
                    timings[cursor + index] = {**candidate, "method": "ctc"}
            cursor += len(texts)
        # Preserve chronological playback even when a lyric block is wrong.
        previous_end = 0.0
        accepted = 0
        for index, (timing, fallback) in enumerate(zip(timings, approximate)):
            if timing["start"] < previous_end - 0.08 or timing["end"] <= timing["start"]:
                timing = {"start": max(previous_end, fallback["start"]), "end": max(previous_end + 0.25, fallback["end"]), "confidence": 0, "method": "anchor"}
            if timing["start"] < previous_end:
                timing["start"] = round(previous_end, 2)
            timing["end"] = round(min(float(track["duration"]), max(timing["start"] + 0.2, timing["end"])), 2)
            timings[index] = timing
            previous_end = timing["end"]
            accepted += timing["method"] == "ctc"
        output[str(track["id"])] = {
            "sourceSHA256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "lines": timings,
        }
        OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{track['id']:02d} {track['title']}: {accepted}/{len(timings)} CTC lines", flush=True)
    print(f"Wrote {OUTPUT}; review low-confidence lines before treating timing as precise", flush=True)


if __name__ == "__main__":
    main()
