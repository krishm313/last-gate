"""Animated variants of the horde: recolour an animated atlas with a variant's palette.

The variant's still sprite gives a luminance -> colour lookup (mean colour of its opaque pixels
per luminance bin, smoothed); every pixel of the source atlas is mapped through it by its own
luminance, alpha untouched. Goblins/sappers/bosses thus get the full walk/attack/hit/death sheet.
"""
import os, sys
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
U = os.path.join(ROOT, "static", "sprites", "units") + os.sep
A = os.path.join(ROOT, "static", "sprites", "anim") + os.sep
LUM = np.array([0.299, 0.587, 0.114], np.float32)

def lut_from(sprite, bins=64):
    im = np.asarray(Image.open(U + sprite + ".png").convert("RGBA"), np.float32) / 255
    m = im[..., 3] > 0.6
    rgb = im[..., :3][m]; l = rgb @ LUM
    # Spread the variant's luminance range over 0..1 so the mapping uses all of it.
    lo, hi = np.percentile(l, 1), np.percentile(l, 99.5)
    t = np.clip((l - lo) / (hi - lo), 0, 1)
    idx = np.minimum(bins - 1, (t * bins).astype(int))
    lut = np.zeros((bins, 3), np.float32); cnt = np.zeros(bins)
    np.add.at(lut, idx, rgb); np.add.at(cnt, idx, 1)
    have = cnt > 3
    xs = np.arange(bins)
    for c in range(3):
        v = np.where(have, lut[:, c] / np.maximum(cnt, 1), np.nan)
        lut[:, c] = np.interp(xs, xs[have], v[have])
    k = np.array([1, 2, 3, 2, 1], np.float32); k /= k.sum()
    for c in range(3): lut[:, c] = np.convolve(np.pad(lut[:, c], 2, mode="edge"), k, mode="valid")
    return lut

def recolor(src, sprite, out, keep=0.0):
    lut = lut_from(sprite)
    im = np.asarray(Image.open(A + src + ".webp").convert("RGBA"), np.float32) / 255
    rgb, a = im[..., :3], im[..., 3]
    l = rgb @ LUM
    m = a > 0.6
    lo, hi = np.percentile(l[m], 1), np.percentile(l[m], 99.5)
    t = np.clip((l - lo) / (hi - lo), 0, 1) * (len(lut) - 1)
    i0 = np.floor(t).astype(int); i1 = np.minimum(i0 + 1, len(lut) - 1); f = (t - i0)[..., None]
    new = lut[i0] * (1 - f) + lut[i1] * f
    new = new * (1 - keep) + rgb * keep  # optionally keep a little of the source's own colour
    Image.fromarray((np.dstack([np.clip(new, 0, 1), a]) * 255).astype(np.uint8), "RGBA").save(A + out + ".webp", quality=92, method=6)
    print(out, "<-", src, "palette of", sprite)

VARIANTS = {
    "goblin_anim": ("horde_horned", "goblin", 0.0),
    "sapper_anim": ("horde_horned", "sapper", 0.0),
    "goblin_mob_anim": ("brute", "goblin_mob", 0.0),
    "goblin_thief_anim": ("horde_archer", "goblin_thief", 0.0),
    "boss_anim": ("brute", "boss", 0.35),
}
if __name__ == "__main__":
    for k in sys.argv[1:] or VARIANTS:
        recolor(*VARIANTS[k][:2], k, VARIANTS[k][2])
