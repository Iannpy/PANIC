"""Prepare browser-ready, approximate line timings from the untouched TXT sources.

The original transcripts contain sparse, sometimes out-of-order block timestamps.
This script sorts those blocks chronologically and distributes their lines within
each interval. It does not claim word-perfect alignment or correct uncertain text.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "letras"
OUTPUT = ROOT / "lyrics-data.js"
TIMINGS = ROOT / "lyrics-timings.json"
TIME = re.compile(r"^\[(\d{2}):(\d{2})\]\s*(.*)$")
NON_LYRIC = re.compile(r"^\(\s*instrumental\b", re.IGNORECASE)


def parse_blocks(path: Path) -> list[tuple[int, int, list[str]]]:
    blocks: list[tuple[int, int, list[str]]] = []
    active: list[str] | None = None
    for order, raw in enumerate(path.read_text(encoding="utf-8-sig").splitlines()):
        line = raw.strip()
        if line == "---":
            break  # Notes after this delimiter are not sung lyrics.
        match = TIME.match(line)
        if match:
            stamp = int(match.group(1)) * 60 + int(match.group(2))
            active = []
            blocks.append((stamp, order, active))
            line = match.group(3).strip()
        if active is not None and line and not re.fullmatch(r"\[[A-Za-z][^\]]*\]", line) and not NON_LYRIC.match(line):
            active.append(line)
    return sorted(blocks, key=lambda block: (block[0], block[1]))


def instrumental_stamps(path: Path) -> set[int]:
    """Find explicit instrumental cues without rendering them as sung words."""
    stamps: set[int] = set()
    active_stamp: int | None = None
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if line == "---":
            break
        match = TIME.match(line)
        if match:
            active_stamp = int(match.group(1)) * 60 + int(match.group(2))
            line = match.group(3).strip()
        if active_stamp is not None and NON_LYRIC.match(line):
            stamps.add(active_stamp)
    return stamps


def make_lines(path: Path, duration: float) -> list[dict[str, str | float]]:
    blocks = parse_blocks(path)
    instrumental = instrumental_stamps(path)
    if not blocks:
        raise ValueError(f"No timestamped lyrics: {path}")
    anchors = sorted(set(stamp for stamp, _, _ in blocks))
    output: list[dict[str, str | float]] = []
    for anchor_index, start in enumerate(anchors):
        lines = [line for stamp, _, block in blocks if stamp == start for line in block]
        if not lines:
            continue
        next_anchor = anchors[anchor_index + 1] if anchor_index + 1 < len(anchors) else None
        estimated_end = start + max(6, len(lines) * 3.7)
        end = min(duration, next_anchor if next_anchor is not None else estimated_end)
        if start in instrumental:
            end = min(end, estimated_end)
        if end <= start:
            raise ValueError(f"Invalid timing window {start}–{end}: {path}")
        weights = [max(1.0, len(line.split()) ** 0.7) for line in lines]
        total = sum(weights)
        cursor = float(start)
        for index, (text, weight) in enumerate(zip(lines, weights)):
            line_end = end if index == len(lines) - 1 else cursor + (end - start) * weight / total
            # A sparse next anchor can include a long instrumental gap; do not
            # leave one lyric highlighted for the entire empty interval.
            output.append({"start": round(cursor, 2), "end": round(min(line_end, cursor + 12), 2), "text": text})
            cursor = line_end
    return output


def reconcile_timings(path: Path, fallback: list[dict], candidates: list[dict]) -> list[dict]:
    """Keep reliable CTC lines without squeezing neighbouring lyrics to fractions of a second."""
    result = [dict(line) for line in fallback]
    blocks = parse_blocks(path)
    cursor = 0
    for stamp in sorted({block[0] for block in blocks}):
        count = sum(len(lines) for block_stamp, _, lines in blocks if block_stamp == stamp)
        if not count:
            continue
        first, last = cursor, cursor + count
        cursor = last
        block_start, block_end = fallback[first]["start"], fallback[last - 1]["end"]
        accepted: list[int] = []
        previous_end = block_start
        previous_index = first - 1
        for index in range(first, last):
            item = candidates[index]
            if item.get("method") != "ctc":
                continue
            start, end = float(item["start"]), float(item["end"])
            before = index - previous_index - 1
            after = last - index - 1
            if (end - start > 12 or start < block_start - 2 or end > block_end + 0.5
                    or start - previous_end < before * 1.8
                    or block_end - end < after * 1.8):
                continue
            accepted.append(index)
            previous_end, previous_index = end, index

        left_index, left_time = first, block_start
        for right_index in [*accepted, last]:
            right_time = float(candidates[right_index]["start"]) if right_index < last else block_end
            pending = list(range(left_index, right_index))
            if pending:
                weights = [fallback[index]["end"] - fallback[index]["start"] for index in pending]
                total = sum(weights)
                point = left_time
                for index, weight in zip(pending, weights):
                    next_point = point + (right_time - left_time) * weight / total
                    result[index]["start"] = round(point, 2)
                    result[index]["end"] = round(next_point, 2)
                    point = next_point
            if right_index < last:
                result[right_index]["start"] = float(candidates[right_index]["start"])
                result[right_index]["end"] = float(candidates[right_index]["end"])
                left_time = result[right_index]["end"]
                left_index = right_index + 1
    for line in result:
        line["end"] = round(min(line["end"], line["start"] + 12), 2)
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="verify that output is up to date without writing")
    args = parser.parse_args()

    # Durations come from the prepared local catalog; the source TXT's rounded
    # duration labels and album metadata are intentionally not authoritative.
    catalog = (ROOT / "tracks-data.js").read_text(encoding="utf-8")
    track_objects = re.findall(r"\{\s*\"id\":.*?\n  \}", catalog, flags=re.DOTALL)
    tracks = [json.loads(item) for item in track_objects]
    sources = sorted(SOURCE.glob("[0-9][0-9] - *.txt"))
    if len(tracks) != 10 or len(sources) != 10:
        raise ValueError("Expected exactly ten catalog entries and ten lyric sources")
    result: dict[int, list[dict[str, str | float]]] = {}
    reviewed = json.loads(TIMINGS.read_text(encoding="utf-8")) if TIMINGS.exists() else {}
    for track, source in zip(tracks, sources):
        if not source.name.startswith(f"{track['id']:02d} - "):
            raise ValueError(f"Catalog/source mismatch: {track['id']} / {source.name}")
        lines = make_lines(source, float(track["duration"]))
        timing = reviewed.get(str(track["id"]))
        if timing is not None:
            if timing["sourceSHA256"] != hashlib.sha256(source.read_bytes()).hexdigest() or len(timing["lines"]) != len(lines):
                raise ValueError(f"Timed lyric source changed: {source.name}")
            lines = reconcile_timings(source, lines, timing["lines"])
        result[track["id"]] = lines
    rendered = "// Prepared from letras/*.txt; original transcriptions remain untouched.\n"
    rendered += "// Timing is approximate; CTC candidates are constrained by sparse TXT anchors.\n"
    rendered += "window.PANIC_LYRICS = Object.freeze(" + json.dumps(result, ensure_ascii=False, indent=2) + ");\n"
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != rendered:
            raise SystemExit("lyrics-data.js is missing or differs from the TXT sources")
        print("Lyrics data matches the ten TXT sources")
    else:
        OUTPUT.write_text(rendered, encoding="utf-8")
        print(f"Wrote {OUTPUT}: {sum(map(len, result.values()))} lines")


if __name__ == "__main__":
    main()
