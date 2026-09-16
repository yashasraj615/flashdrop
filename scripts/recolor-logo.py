#!/usr/bin/env python3
"""Recolor Flashdrop artwork to cyan/aqua and regenerate icon sizes."""

from __future__ import annotations

import colorsys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "brand" / "flashdrop-logo.png"


def map_hue(hue: float, sat: float) -> float:
    if sat <= 0.07:
        return hue
    if hue >= 245 or hue <= 28:
        if hue >= 245:
            t = min(1.0, (hue - 245.0) / 115.0)
            return 192.0 - t * 24.0
        return 172.0
    if 215 <= hue < 245:
        t = (hue - 215.0) / 30.0
        return 198.0 - t * 14.0
    return hue


def recolor(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
            hue = map_hue(h * 360.0, s)
            if 160 <= hue <= 200:
                s = min(1.0, s * 1.06)
            nr, ng, nb = colorsys.hsv_to_rgb((hue / 360.0) % 1.0, s, v)
            pixels[x, y] = (int(nr * 255), int(ng * 255), int(nb * 255), a)
    return rgba


def content_bbox(image: Image.Image, threshold: int = 16) -> tuple[int, int, int, int]:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    left, top, right, bottom = width, height, 0, 0
    found = False
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a > 12 and max(r, g, b) > threshold:
                found = True
                if x < left:
                    left = x
                if y < top:
                    top = y
                if x > right:
                    right = x
                if y > bottom:
                    bottom = y
    if not found:
        return (0, 0, width, height)
    pad = max(2, int(min(width, height) * 0.03))
    return (
        max(0, left - pad),
        max(0, top - pad),
        min(width, right + 1 + pad),
        min(height, bottom + 1 + pad),
    )


def resize_square(image: Image.Image, size: int) -> Image.Image:
    return image.resize((size, size), Image.Resampling.LANCZOS)


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)


def main() -> None:
    colored = recolor(Image.open(SOURCE))
    save(colored, SOURCE)
    tight = colored.crop(content_bbox(colored))

    save(resize_square(colored, 512), ROOT / "public" / "icons" / "icon-512.png")
    save(resize_square(colored, 192), ROOT / "public" / "icons" / "icon-192.png")
    save(resize_square(colored, 180), ROOT / "public" / "icons" / "icon-180.png")
    save(resize_square(colored, 180), ROOT / "public" / "apple-touch-icon.png")
    save(resize_square(colored, 180), ROOT / "app" / "apple-icon.png")
    save(resize_square(colored, 128), ROOT / "public" / "icons" / "icon-128.png")
    save(resize_square(colored, 512), ROOT / "app" / "icon.png")

    fav48 = resize_square(tight, 48)
    fav32 = resize_square(tight, 32)
    fav16 = resize_square(tight, 16)
    save(fav48, ROOT / "public" / "icons" / "favicon-48.png")
    save(fav32, ROOT / "public" / "icons" / "favicon-32.png")
    save(fav16, ROOT / "public" / "icons" / "favicon-16.png")
    fav48.save(ROOT / "public" / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])

    for relative in ("public/og.png", "app/opengraph-image.png", "app/twitter-image.png"):
        path = ROOT / relative
        save(recolor(Image.open(path)), path)


if __name__ == "__main__":
    main()
