#!/usr/bin/env python3
"""Build the maskable app icons from the 512 px spieli pin (#939).

The original icons (app/public/icons/icon-192.png, icon-512.png) are the
free-standing pixel-art pin on a transparent background. They are declared
`purpose: any` in the web app manifest: desktop, Dock and start menu show them
as they are.

Android launchers and some desktop shells instead cut a *maskable* icon into a
circle or squircle, and only the inner 80 % (a circle of 40 % radius) is
guaranteed to survive. The original pin fills its whole canvas, so a mask crops
its tip, and the transparent background turns black or white. This script
centres the pin at two thirds of the canvas on a solid background:

    icon-maskable-512.png, icon-maskable-192.png

The pin is placed unscaled on a 768 px canvas and the whole canvas is then
downscaled once, so the pixel art is resampled a single time — the same way
the existing 192 px icon was derived from the 512 px one.

Output is committed; rerun with `make app-icons` after changing the artwork.
"""

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "app" / "public" / "icons"
SOURCE = ICONS / "icon-512.png"

# The accent's soft tint (--color-primary-soft in app/src/styles/app.css):
# light enough that the red pin carries the icon, tied to the UI's emerald.
BACKGROUND = (0xEC, 0xFD, 0xF5, 0xFF)
CANVAS = 768  # 512 px pin on 768 px → 2/3 of the icon, inside the safe zone


def main() -> int:
    if not SOURCE.exists():
        print(f"missing {SOURCE}", file=sys.stderr)
        return 1
    pin = Image.open(SOURCE).convert("RGBA")
    if pin.size != (512, 512):
        print(f"{SOURCE} is {pin.size}, expected 512x512", file=sys.stderr)
        return 1

    canvas = Image.new("RGBA", (CANVAS, CANVAS), BACKGROUND)
    offset = (CANVAS - pin.width) // 2
    canvas.alpha_composite(pin, (offset, offset))
    canvas = canvas.convert("RGB")  # maskable icons must be fully opaque

    for size in (512, 192):
        out = ICONS / f"icon-maskable-{size}.png"
        canvas.resize((size, size), Image.Resampling.LANCZOS).save(out, optimize=True)
        print(f"wrote {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
