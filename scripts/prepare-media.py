"""Create browser-ready audio copies and a local catalog; never edit sources.

Requires the already installed ffmpeg/ffprobe and mutagen. Not a site build.
"""
import hashlib
import json
import pathlib
import re
import shutil
import subprocess

from mutagen.id3 import ID3

ROOT = pathlib.Path(__file__).resolve().parent.parent
AUDIO = ROOT / "assets" / "audio"
COVERS = ROOT / "assets" / "covers"
QA = ROOT / "qa"
KARAOKE_ART = (
    "01-night-birds.webp", "02-crosses.webp", "03-if-i-were-you.webp",
    "04-hooked-on-a-feeling.webp", "05-tied-to-the-tracks.webp",
    "06-lullaby.webp", "07-diamonds-and-daggers.webp",
    "08-little-secret.webp", "09-metal-song.webp", "10-mercenary.webp",
)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def originals():
    paths = [ROOT / "pasted_file_PZ275C_image.png"]
    paths += sorted((ROOT / "pistas").glob("*.*"))
    paths += sorted((ROOT / "portadas").glob("*.*"))
    return {str(p.relative_to(ROOT)): digest(p) for p in paths if p.is_file()}


def run(args):
    result = subprocess.run(args, capture_output=True, text=True, encoding="utf-8")
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout


def pcm_hash(path):
    return run(["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:a:0",
                "-f", "hash", "-hash", "sha256", "-"]).strip()


def slug(value):
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def preserve_xing_without_added_gapless(path):
    """Retain frame counts/seek TOC but not a new Lavf gapless trimming hint.

    FFmpeg's MP3 demuxer adds 529 skipped samples for a Lavf/LAME version
    in the Xing extension. These MPEG originals have no such trimming.
    Only ancillary metadata of the generated first frame is changed;
    original MP3 audio packets remain untouched. Verify the decoded PCM.
    Reference: FFmpeg/libavformat/mp3dec.c, mp3_parse_info_tag.
    """
    data = bytearray(path.read_bytes())
    if data[:3] != b"ID3":
        raise RuntimeError("Expected generated ID3 header")
    base = 10 + sum((value & 127) << shift for value, shift in
                    zip(data[6:10], (21, 14, 7, 0)))
    header = int.from_bytes(data[base:base + 4], "big")
    if header >> 21 != 0x7FF:
        raise RuntimeError("Expected first MP3 frame after ID3")
    mpeg1, mono = ((header >> 19) & 3) == 3, ((header >> 6) & 3) == 3
    side_info = (17 if mono else 32) if mpeg1 else (9 if mono else 17)
    marker = base + 4 + side_info
    if data[marker:marker + 4] not in (b"Info", b"Xing"):
        raise RuntimeError("Expected generated Xing/Info header")
    flags = int.from_bytes(data[marker + 4:marker + 8], "big")
    encoder = marker + 8 + sum(length for bit, length in
                               ((1, 4), (2, 4), (4, 100), (8, 4)) if flags & bit)
    if data[encoder:encoder + 4] != b"Lavf":
        raise RuntimeError("Unexpected generated encoder tag; inspect before modifying")
    data[encoder:encoder + 9] = bytes(9)
    path.write_bytes(data)


def main():
    before = originals()
    for directory in (AUDIO, COVERS, QA):
        directory.mkdir(parents=True, exist_ok=True)
    cover_sources = {digest(p): p for p in (ROOT / "portadas").glob("*.webp")}
    catalog, checks = [], []
    files = sorted((ROOT / "pistas").glob("*.mpeg"))
    if len(files) != 10:
        raise RuntimeError(f"Expected 10 prepared tracks, found {len(files)}")

    for index, source in enumerate(files, 1):
        karaoke_art = ROOT / "assets" / "optimized" / "karaoke" / KARAOKE_ART[index - 1]
        if not karaoke_art.is_file():
            raise FileNotFoundError(f"Run scripts/optimize-images.py before preparing media: {karaoke_art}")
        tags = ID3(source)
        title, artist, album, year = (str(tags.get(key, "")) for key in
                                    ("TIT2", "TPE1", "TALB", "TDRC"))
        if not all((title, artist, album)):
            raise RuntimeError(f"Missing prepared metadata: {source.name}")
        art = next((frame for frame in tags.getall("APIC") if frame.type == 3), None)
        cover = cover_sources.get(hashlib.sha256(art.data).hexdigest()) if art else None
        if cover is None:
            raise RuntimeError(f"No WebP matches embedded cover: {source.name}")

        audio_copy = AUDIO / f"{index:02d}-{slug(title)}.mp3"
        cover_copy = COVERS / f"{slug(cover.stem)}.webp"
        run(["ffmpeg", "-v", "error", "-y", "-i", str(source), "-map", "0:a:0",
             "-c:a", "copy", "-map_metadata", "-1", "-id3v2_version", "3",
             "-write_xing", "1",
             "-metadata", f"title={title}", "-metadata", f"artist={artist}",
             "-metadata", f"album={album}", "-metadata", f"date={year}",
             str(audio_copy)])
        preserve_xing_without_added_gapless(audio_copy)
        shutil.copyfile(cover, cover_copy)
        probe = json.loads(run(["ffprobe", "-v", "error", "-show_entries",
                                "format=format_name,duration:stream=codec_name,codec_type",
                                "-of", "json", str(audio_copy)]))
        source_pcm, copy_pcm = pcm_hash(source), pcm_hash(audio_copy)
        if source_pcm != copy_pcm:
            raise RuntimeError(f"Decoded audio differs: {source.name}")
        catalog.append({"id": index, "title": title, "artist": artist, "album": album,
                        "year": year, "duration": float(probe["format"]["duration"]),
                        "src": audio_copy.relative_to(ROOT).as_posix(),
                        "instrumentalSrc": (AUDIO / "instrumental" / audio_copy.name).relative_to(ROOT).as_posix(),
                        "karaokeImage": karaoke_art.relative_to(ROOT).as_posix(),
                        "cover": cover_copy.relative_to(ROOT).as_posix()})
        checks.append({"source": source.relative_to(ROOT).as_posix(),
                       "copy": audio_copy.relative_to(ROOT).as_posix(),
                       "container": probe["format"]["format_name"],
                       "codec": probe["streams"][0]["codec_name"],
                       "decodedAudioIdentical": source_pcm == copy_pcm,
                       "seekHeaderPreservedWithoutNewGaplessTrim": True,
                       "pcmSHA256": source_pcm, "coverMatchedAPIC": True,
                       "coverCopyIdentical": digest(cover) == digest(cover_copy)})
        print(f"{index:02d} {title}: MP3 copy, identical decoded audio, matched WebP")

    after = originals()
    if before != after:
        raise RuntimeError("Source files changed concurrently; review before continuing")
    (ROOT / "tracks-data.js").write_text(
        "// Prepared local metadata, not independently verified discography.\n"
        "window.PANIC_TRACKS = Object.freeze(" + json.dumps(catalog, ensure_ascii=False, indent=2)
        + ");\n", encoding="utf-8")
    (QA / "media-integrity.json").write_text(json.dumps(
        {"originalsUnchanged": True, "originalSHA256": before, "tracks": checks},
        ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Verified {len(checks)} audio copies and {len(before)} unchanged originals.")


if __name__ == "__main__":
    main()
