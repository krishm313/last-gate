"""Rebuild a character atlas with motion-interpolated in-between frames (2x frame count).

Frames are placed into full-resolution cells on the shared baseline (as atlas.py does), then
between each pair of consecutive poses a middle frame is synthesised by warping both poses
halfway along dense optical flow (DIS) and averaging in premultiplied alpha. Loops (idle/walk)
wrap last->first; one-shots (attack/hit/death) get (n-1)*2+1 frames ending on the final pose.
"""
import json, sys
import numpy as np, cv2
from PIL import Image, ImageFilter

# Registered sheet frames (anim/<name>_<anim>_<i>.png + <name>_reg.json), cut from the owner's sheets.
SRC = "anim"

def cells(name, anims):
    R = json.load(open(f"{SRC}/{name}_reg.json")); reg = R["reg"]
    allf = [f for a in anims for f in reg[a]]
    minx = min(f["x"] for f in allf); maxx = max(f["x"] + f["w"] for f in allf)
    maxh = max(f["h"] + f["bottom"] for f in allf)
    pad = 6
    cw = int(maxx - minx) + pad * 2; ch = int(maxh) + pad * 2
    out = {}
    for a in anims:
        fr = []
        for i, f in enumerate(reg[a]):
            c = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
            im = Image.open(f"{SRC}/{name}_{a}_{i}.png").convert("RGBA")
            c.alpha_composite(im, (pad + int(f["x"] - minx), max(0, ch - pad - int(f["bottom"]) - f["h"])))
            fr.append(np.asarray(c, np.float32) / 255)
        out[a] = fr
    return out, cw, ch, pad

DIS = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
DIS.setFinestScale(0)

def gray(a):
    pm = a[..., :3] * a[..., 3:4]
    g = (pm @ np.array([0.3, 0.55, 0.15], np.float32)) * 0.75 + a[..., 3] * 0.25
    return np.clip(g * 255, 0, 255).astype(np.uint8)

def warp(img, flow, t):
    h, w = flow.shape[:2]
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    mx = gx - flow[..., 0] * t; my = gy - flow[..., 1] * t
    return cv2.remap(img, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)

def middle(A, B):
    ga, gb = gray(A), gray(B)
    fab = DIS.calc(ga, gb, None); fba = DIS.calc(gb, ga, None)
    pa = np.dstack([A[..., :3] * A[..., 3:4], A[..., 3]]); pb = np.dstack([B[..., :3] * B[..., 3:4], B[..., 3]])
    # Pixel p of the middle frame comes from A at p - 0.5*F_ab and from B at p - 0.5*F_ba.
    wa = warp(pa, fab, 0.5); wb = warp(pb, fba, 0.5)
    # Occlusion-aware blend: where the two warped poses disagree (limbs crossing, flow failing),
    # take one pose instead of averaging, so there's a single clean limb rather than a ghost.
    diff = np.abs(wa - wb).mean(axis=2) * 4
    diff = cv2.GaussianBlur(diff, (0, 0), 2.0)
    pick = np.clip((diff - 0.25) / 0.35, 0, 1)[..., None]
    m = (wa + wb) * 0.5 * (1 - pick) + wa * pick
    al = m[..., 3:4]
    rgb = np.where(al > 1e-4, m[..., :3] / np.maximum(al, 1e-4), 0)
    # Tighten the soft double-edges averaging leaves on the silhouette.
    a2 = np.clip((al[..., 0] - 0.5) * 1.35 + 0.5, 0, 1) * (al[..., 0] > 0.02)
    a2 = np.where(np.minimum(wa[..., 3], wb[..., 3]) > 0.9, 1.0, a2)
    return np.dstack([rgb, a2]).astype(np.float32)

def expand(frames, loop):
    out = []
    n = len(frames)
    pairs = n if loop else n - 1
    for i in range(pairs):
        A, B = frames[i], frames[(i + 1) % n]
        out += [A, middle(A, B)]
    if not loop: out.append(frames[-1])
    return out

if __name__ == "__main__":
    name, anim = sys.argv[1], sys.argv[2]
    cs, cw, ch, pad = cells(name, [anim])
    ex = expand(cs[anim], anim in ("idle", "walk"))
    strip = Image.new("RGBA", (cw * len(ex), ch), (90, 150, 80, 255))
    for i, f in enumerate(ex):
        strip.alpha_composite(Image.fromarray((np.clip(f, 0, 1) * 255).astype(np.uint8), "RGBA"), (i * cw, 0))
    strip.convert("RGB").save(f"hd/{name}_{anim}_x2.png")
    print(len(ex), strip.size)
