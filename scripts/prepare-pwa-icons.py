"""Rasterize the existing P! favicon identity for installable PWA icons (no build)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "assets" / "icons"


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    font_path = Path("C:/Windows/Fonts/arialbd.ttf")
    for name, size, maskable in [
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-maskable-512.png", 512, True),
        ("apple-touch-icon.png", 180, False),
    ]:
        # Opaque background; maskable content fits inside the central safe circle.
        image = Image.new("RGB", (size, size), "#090909")
        draw = ImageDraw.Draw(image)
        font = ImageFont.truetype(str(font_path), round(size * (0.50 if maskable else 0.62)))
        bbox = draw.textbbox((0, 0), "P!", font=font)
        position = ((size - bbox[2] - bbox[0]) / 2, (size - bbox[3] - bbox[1]) / 2)
        draw.text(position, "P!", font=font, fill="white")
        image.save(DEST / name, optimize=True)
        print(name, size)


if __name__ == "__main__":
    main()
