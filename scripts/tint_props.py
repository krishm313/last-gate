#!/usr/bin/env python3
"""Recolour the summer prop atlas into a chapter tint (same layout, so PROP_ATLAS.<tint> = summer).

  python3 scripts/tint_props.py blossom   -> static/sprites/props/blossom.webp

Foliage is found by hue (yellow-green..cyan-green); trunks, rocks and outlines keep their colours.
"""
import colorsys
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "static/sprites/props/summer.webp"

# Per tint: for each prop family, (target hue 0..1 or None to keep, saturation ×, value ×, value +).
TINTS = {
    # Chapter 12, the Blossom Pass: round trees in pink blossom, pines and bushes a fresh spring green.
    "blossom": {
        "round": (0.93, 0.62, 1.12, 0.10),
        "pine": (0.29, 1.05, 1.08, 0.02),
        "bush": (0.27, 1.0, 1.12, 0.04),
    },
}


def rects():
    src = (ROOT / "src/camp/propAtlas.ts").read_text()
    body = re.search(r'"summer": \{([^}]*)\}', src).group(1)
    for name, sx, sy, w, h in re.findall(r'"(\w+)": \[(\d+), (\d+), (\d+), (\d+)', body):
        yield name, int(sx), int(sy), int(w), int(h)


def main(tint: str) -> None:
    spec = TINTS[tint]
    im = Image.open(SRC).convert("RGBA")
    px = im.load()
    for name, sx, sy, w, h in rects():
        fam = re.sub(r"\d+$", "", name)
        if fam not in spec:
            continue
        hue, sm, vm, va = spec[fam]
        for y in range(sy, sy + h):
            for x in range(sx, sx + w):
                r, g, b, a = px[x, y]
                if a == 0:
                    continue
                hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
                # Foliage only: green hues with some saturation (leaves trunks, outlines, rocks alone).
                if not (0.14 < hh < 0.5 and s > 0.18):
                    continue
                nh = hh if hue is None else hue
                ns = min(1.0, s * sm)
                nv = min(1.0, v * vm + va)
                rr, gg, bb = colorsys.hsv_to_rgb(nh, ns, nv)
                px[x, y] = (round(rr * 255), round(gg * 255), round(bb * 255), a)
    out = ROOT / f"static/sprites/props/{tint}.webp"
    im.save(out, "WEBP", quality=90, method=6)
    print("wrote", out)


if __name__ == "__main__":
    main(sys.argv[1])
