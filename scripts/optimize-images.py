"""Create smaller WebP copies for images used by the static site.

Original PNG files are read-only inputs and are never replaced.
Requires Pillow with WebP support.
"""
import hashlib
import json
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
OPTIMIZED = ROOT / "assets" / "optimized"
QA = ROOT / "qa"
KARAOKE_ART = (
    "01-night-birds", "02-crosses", "03-if-i-were-you",
    "04-hooked-on-a-feeling", "05-tied-to-the-tracks", "06-lullaby",
    "07-diamonds-and-daggers", "08-little-secret", "09-metal-song",
    "10-mercenary",
)
JOBS = [
    (ROOT / "assets" / "canyon.png", OPTIMIZED / "canyon.webp"),
    (ROOT / "assets" / "silk.png", OPTIMIZED / "silk.webp"),
    *[
        (ROOT / "assets" / "karaoke-concepts" / f"{name}.png",
         OPTIMIZED / "karaoke" / f"{name}.webp")
        for name in KARAOKE_ART
    ],
]
QUALITY = 86
METHOD = 6


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    OPTIMIZED.mkdir(parents=True, exist_ok=True)
    (OPTIMIZED / "karaoke").mkdir(parents=True, exist_ok=True)
    before = {source: sha256(source) for source, _ in JOBS}
    results = []

    for source, output in JOBS:
        if not source.is_file():
            raise FileNotFoundError(f"Missing image source: {source}")
        with Image.open(source) as image:
            image.load()
            dimensions = image.size
            profile = image.info.get("icc_profile")
            image.save(output, format="WEBP", quality=QUALITY, method=METHOD,
                       exact=True, icc_profile=profile)
        with Image.open(output) as optimized:
            optimized.verify()
        with Image.open(output) as optimized:
            if optimized.format != "WEBP" or optimized.size != dimensions:
                raise RuntimeError(f"Unexpected optimized image: {output}")
        if output.stat().st_size >= source.stat().st_size:
            raise RuntimeError(f"Optimization did not reduce file size: {source}")
        results.append({
            "source": source.relative_to(ROOT).as_posix(),
            "sourceSHA256": before[source],
            "sourceBytes": source.stat().st_size,
            "optimized": output.relative_to(ROOT).as_posix(),
            "optimizedBytes": output.stat().st_size,
            "width": dimensions[0],
            "height": dimensions[1],
        })
        print(f"{source.name}: {source.stat().st_size:,} -> {output.stat().st_size:,} bytes")

    after = {source: sha256(source) for source, _ in JOBS}
    if before != after:
        raise RuntimeError("An original image changed during optimization")
    original_bytes = sum(row["sourceBytes"] for row in results)
    optimized_bytes = sum(row["optimizedBytes"] for row in results)
    report = {
        "format": "WebP",
        "quality": QUALITY,
        "method": METHOD,
        "originalsPreserved": True,
        "originalBytes": original_bytes,
        "optimizedBytes": optimized_bytes,
        "bytesSaved": original_bytes - optimized_bytes,
        "percentSaved": round(100 * (original_bytes - optimized_bytes) / original_bytes, 2),
        "images": results,
    }
    (QA / "image-optimization.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Total: {original_bytes:,} -> {optimized_bytes:,} bytes ({report['percentSaved']}% smaller)")


if __name__ == "__main__":
    main()
