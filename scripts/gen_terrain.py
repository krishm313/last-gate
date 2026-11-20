"""Painted terrain generator for Last Gate.

Bakes a high-detail ground image per chapter palette (grass with layered colour variation and
thousands of individual lit blades, soft-edged dirt road with pebbles, trampled battlefield,
forest-floor shade, hall plaza) so the environment matches the painted, 3D-rendered characters.

Usage: python3 scripts/gen_terrain.py [chapterId ...]   (writes static/sprites/terrain/ground_<id>.webp)
Layout constants mirror src/camp/world.ts and TERRAIN_* in src/camp/render.ts.
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

MAP_W, MAP_H = 720, 1300
WALL_Y, FOREST_Y = 560, 230
HALL = (360, 1050)
TX, TY = -80, -240
TW, TH = MAP_W + 160, MAP_H + 320
K = 1.8  # output pixels per world unit (matches TERRAIN_SCALE)
SS = 2  # supersampling for strokes
R = K / 1.5  # sizes and densities below were tuned at K = 1.5; R keeps them the same in world terms
OUT = os.path.join(os.path.dirname(__file__), "..", "static", "sprites", "terrain")

# Per-chapter palettes: grass dark/mid/light/tip, dirt light/dark, mud.
PALETTES = {
    1: dict(g=[(38, 92, 44), (62, 128, 56), (96, 158, 70), (156, 200, 104)], dirt=[(214, 178, 120), (168, 128, 82)], mud=(150, 122, 86)),
    2: dict(g=[(38, 78, 52), (60, 112, 70), (94, 146, 86), (150, 190, 120)], dirt=[(170, 150, 110), (120, 104, 76)], mud=(96, 104, 80)),
    3: dict(g=[(92, 98, 52), (128, 132, 70), (166, 164, 92), (214, 204, 130)], dirt=[(214, 188, 136), (170, 140, 96)], mud=(160, 134, 96)),
    4: dict(g=[(26, 52, 46), (40, 74, 62), (62, 102, 82), (110, 146, 118)], dirt=[(130, 122, 104), (92, 86, 74)], mud=(80, 78, 70)),
    5: dict(g=[(82, 70, 52), (112, 92, 66), (146, 118, 82), (196, 160, 110)], dirt=[(200, 156, 112), (150, 108, 76)], mud=(130, 90, 70)),
    99: dict(g=[(44, 88, 48), (70, 120, 60), (104, 152, 76), (164, 196, 112)], dirt=[(204, 170, 116), (160, 122, 80)], mud=(140, 116, 84)),
}


def px(x, y):
    return ((x - TX) * K, (y - TY) * K)


def noise(w, h, cell, rng):
    """Smooth value noise in [0,1] via bicubic-upsampled random grid (cell in K=1.5 pixels)."""
    cell = max(1.0, cell * R)
    gw, gh = max(2, int(w / cell) + 2), max(2, int(h / cell) + 2)
    g = (rng.random((gh, gw)) * 255).astype(np.uint8)
    im = Image.fromarray(g).resize((int(gw * cell), int(gh * cell)), Image.BICUBIC).crop((0, 0, w, h))
    return np.asarray(im, dtype=np.float32) / 255.0


def fbm(w, h, rng, cells=(220, 110, 55, 24, 10), weights=(0.4, 0.25, 0.17, 0.11, 0.07)):
    out = np.zeros((h, w), np.float32)
    for c, wt in zip(cells, weights):
        out += noise(w, h, c, rng) * wt
    return out / sum(weights)


def ramp(t, cols):
    """Map t in [0,1] through a list of RGB colours."""
    cols = np.array(cols, np.float32)
    t = np.clip(t, 0, 1) * (len(cols) - 1)
    i = np.clip(np.floor(t).astype(int), 0, len(cols) - 2)
    f = (t - i)[..., None]
    return cols[i] * (1 - f) + cols[i + 1] * f


def bezier(p0, p1, p2, p3, n=40):
    pts = []
    for i in range(n + 1):
        t = i / n
        a = (1 - t) ** 3
        b = 3 * (1 - t) ** 2 * t
        c = 3 * (1 - t) * t * t
        d = t ** 3
        pts.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return pts


def path_mask(W, H):
    """Road from the gate to the hall + plaza ellipse around the hall (same shape as the game)."""
    m = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(m)
    left = bezier((325, WALL_Y - 10), (320, 760), (330, 900), (320, HALL[1]))
    right = bezier((400, HALL[1]), (390, 900), (400, 760), (395, WALL_Y - 10))
    d.polygon([px(*p) for p in left + right], fill=255)
    cx, cy = px(HALL[0], HALL[1] + 10)
    d.ellipse((cx - 130 * K, cy - 70 * K, cx + 130 * K, cy + 70 * K), fill=255)
    return m


def paving(arr, P, rng):
    """Flagstone paving around the hall: jittered Voronoi stones with bevelled, lit edges and dark
    mortar, thinning out into the dirt at the rim so the plaza reads as a worn, lived-in square."""
    cxw, cyw, rx, ry = HALL[0], HALL[1] + 12, 116, 60
    x0, y0 = px(cxw - rx - 10, cyw - ry - 10)
    x1, y1 = px(cxw + rx + 10, cyw + ry + 10)
    x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
    h, w = y1 - y0, x1 - x0
    # Seeds on a jittered grid (stones ~15 world units across, slightly wider than tall).
    seeds = []
    sx, sy = 15 * K, 11 * K
    for j in range(int(h / sy) + 2):
        for i in range(int(w / sx) + 2):
            seeds.append(((i + (j % 2) * 0.5 + (rng.random() - 0.5) * 0.7) * sx, (j + (rng.random() - 0.5) * 0.7) * sy))
    seeds = np.array(seeds, np.float32)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d1 = np.full((h, w), 1e9, np.float32)
    d2 = np.full((h, w), 1e9, np.float32)
    idx = np.zeros((h, w), np.int32)
    for k, (sxk, syk) in enumerate(seeds):
        d = np.hypot(xx - sxk, (yy - syk) * 1.25)
        closer = d < d1
        d2 = np.where(closer, d1, np.minimum(d2, d))
        idx = np.where(closer, k, idx)
        d1 = np.where(closer, d, d1)
    edge = d2 - d1  # 0 on the seams, grows toward stone centres
    # Which stones exist: inside the ellipse, the rim ones randomly worn away.
    wx = seeds[:, 0] / K + (x0 / K + TX)
    wy = seeds[:, 1] / K + (y0 / K + TY)
    er = ((wx - cxw) / rx) ** 2 + ((wy - cyw) / ry) ** 2
    keep = er < (0.55 + rng.random(len(seeds)) * 0.55)
    tone = 0.82 + rng.random(len(seeds)) * 0.3
    stone_base = np.array(P["dirt"][0], np.float32) * 0.35 + np.array((176, 170, 158), np.float32) * 0.65
    present = keep[idx]
    # Bevel lighting: the edge field's gradient against a top-left sun.
    gy, gx = np.gradient(np.minimum(edge, 5 * K))
    lit = np.clip((-gx * 0.7 - gy * 0.7) * 0.9, -1, 1)
    grain = noise(w, h, 3, rng) * 0.12 + noise(w, h, 12, rng) * 0.1
    col = stone_base[None, None, :] * (tone[idx] - grain + 0.08)[..., None]
    col = col * (1 + lit[..., None] * 0.32)
    seam = np.clip(1 - (edge - 0.6 * K) / (1.4 * K), 0, 1)  # mortar line
    col = col * (1 - seam[..., None] * 0.55)
    # Soft alpha: stones fade at their own edge so the seam blends into the dirt underneath.
    a = (present * np.clip(edge / (0.8 * K), 0, 1)).astype(np.float32)
    a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)), np.float32) / 255
    sub = arr[y0:y1, x0:x1]
    # Darken the dirt where stones are missing next to present ones (worn gaps / grime).
    grime = np.asarray(Image.fromarray((present * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(4 * K)), np.float32) / 255
    sub = sub * (1 - (grime * (1 - a))[..., None] * 0.18)
    arr[y0:y1, x0:x1] = sub * (1 - a[..., None]) + col * a[..., None]
    full = np.zeros(arr.shape[:2], np.uint8)
    full[y0:y1, x0:x1] = (a > 0.3) * 255
    return arr, full


def build(ch):
    P = PALETTES[ch]
    rng = np.random.default_rng(4242 + ch)
    W, H = int(TW * K), int(TH * K)

    # --- Grass base: layered colour variation + soft sun from the top-left. ----------------
    n = fbm(W, H, rng)
    n2 = noise(W, H, 6, rng)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    sun = 0.08 * (1 - (xx / W) * 0.6 - (yy / H) * 0.4)
    t = n * 0.85 + n2 * 0.15 + sun
    base = ramp(t * 1.15 - 0.05, P["g"][:3])
    # Forest-floor shade toward the top.
    fy = (FOREST_Y - TY) * K
    shade = np.clip((fy + 90 * K - yy) / (260 * K), 0, 1)[..., None]
    base = base * (1 - shade * 0.42)
    # Forest-edge shade down both sides of the clearing: canopy shadow and darker, browner
    # forest floor with a ragged noisy boundary, so the clearing fades into woods.
    wxs = xx / K + TX
    dist = np.minimum(wxs, MAP_W - wxs)
    rag = noise(W, H, 40, rng) * 50 + noise(W, H, 12, rng) * 20
    edge = np.clip((120 - dist + rag - 35) / 90, 0, 1)
    edge = (edge * edge * (3 - 2 * edge))[..., None]
    floor = np.array(P["g"][0], np.float32) * 0.7 + np.array(P["mud"], np.float32) * 0.3
    base = base * (1 - edge * 0.62) + floor * 0.5 * (edge * 0.62)

    # --- Trampled battlefield before the wall: muddy patches broken up by noise. -----------
    cx, cy = px(360, WALL_Y - 80)
    e = ((xx - cx) / (330 * K)) ** 2 + ((yy - cy) / (110 * K)) ** 2
    mud = np.clip((1 - e) * 1.4, 0, 1) * np.clip((fbm(W, H, rng, cells=(90, 40, 16), weights=(0.5, 0.3, 0.2)) - 0.38) * 2.6, 0, 1)
    mudc = np.array(P["mud"], np.float32)
    base = base * (1 - mud[..., None] * 0.62) + mudc * (mud[..., None] * 0.62)

    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")

    # --- Road + plaza: soft edges, darker rim, inner texture, pebbles. ---------------------
    pm0 = path_mask(W, H)
    pb = np.asarray(pm0.filter(ImageFilter.GaussianBlur(7 * K)), np.float32) / 255
    wob = noise(W, H, 14, rng) * 0.6 + noise(W, H, 5, rng) * 0.4
    pmv = ((pb + (wob - 0.5) * 0.9) > 0.5).astype(np.uint8) * 255
    pm = Image.fromarray(pmv, "L")
    soft = pm.filter(ImageFilter.GaussianBlur(2.2 * K))
    rim = np.clip(np.asarray(pm.filter(ImageFilter.GaussianBlur(2.5 * K)), np.float32) - np.asarray(pm.filter(ImageFilter.GaussianBlur(9 * K)), np.float32), 0, 255) / 255
    dn = fbm(W, H, rng, cells=(60, 24, 9, 4), weights=(0.4, 0.3, 0.2, 0.1))
    dirt = ramp(dn * 1.2 - 0.1, [P["dirt"][1], P["dirt"][0], tuple(min(255, c + 18) for c in P["dirt"][0])])
    # Wheel ruts: two darker tracks down the road.
    ruts = Image.new("L", (W, H), 0)
    rd = ImageDraw.Draw(ruts)
    for off in (-11, 11):
        pts = [px(x + off + 2 * math.sin(i * 0.7), y) for i, (x, y) in enumerate(bezier((360, WALL_Y), (356, 760), (364, 900), (360, HALL[1] - 60), 30))]
        rd.line(pts, fill=255, width=int(5 * K))
    rutsa = np.asarray(ruts.filter(ImageFilter.GaussianBlur(3 * K)), np.float32)[..., None] / 255
    dirt = dirt * (1 - rutsa * 0.22)
    a = (np.asarray(soft, np.float32) / 255)[..., None]
    arr = np.asarray(img, np.float32)
    arr = arr * (1 - a) + dirt * a
    arr = arr * (1 - rim[..., None] * 0.35)
    arr, paved = paving(arr, P, np.random.default_rng(31 + ch))
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")

    # Tuft positions, and their soft contact shadows darkened into the ground first.
    rt = np.random.default_rng(7 + ch)
    nt = int(W * H / (1700 * R * R))
    tufts = list(zip(rt.random(nt) * W, rt.random(nt) * H, 0.7 + rt.random(nt) * 0.6))
    sh = Image.new("L", (W, H), 0)
    sd = ImageDraw.Draw(sh)
    pma = np.asarray(pm)
    for x, y, z in tufts:
        if 0 <= int(y) < H and 0 <= int(x) < W and pma[int(y), int(x)] > 128:
            continue
        sd.ellipse((x - 7 * z * K, y - 2 * z * K, x + 9 * z * K, y + 3 * z * K), fill=255)
    sha = np.asarray(sh.filter(ImageFilter.GaussianBlur(2.5 * K)), np.float32)[..., None] / 255
    arr = np.asarray(img, np.float32) * (1 - sha * 0.28)
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")

    # --- Supersampled stroke layer: grass blades, flowers, pebbles. -------------------------
    big = img.resize((W * SS, H * SS), Image.BILINEAR)
    d = ImageDraw.Draw(big)
    pmb = np.asarray(pm)
    r = np.random.default_rng(99 + ch)
    g0, g1, g2, gt = [np.array(c) for c in P["g"]]

    def on_path(x, y):
        xi, yi = int(x / SS), int(y / SS)
        return 0 <= xi < W and 0 <= yi < H and pmb[yi, xi] > 128

    # Blades: short curved strokes, dark base -> lit tip, leaning with the wind.
    def blade(x, y, L, lean, k, lit):
        mid = (x + lean * L * 0.45, y - L * 0.55)
        tip = (x + lean * L, y - L)
        col = (g0 * (1 - k) + g1 * k).astype(int)
        d.line([(x, y), mid], fill=tuple(col), width=max(1, int(round(1.5 * SS * R))))
        tc = (g2 * 0.5 + gt * 0.5) if lit else g2
        d.line([mid, tip], fill=tuple(tc.astype(int)), width=max(1, int(round(1.1 * SS * R))))

    nb = int(W * H / (60 * R * R))
    for x, y in zip(r.random(nb) * W * SS, r.random(nb) * H * SS):
        if on_path(x, y):
            continue
        blade(x, y, (4 + r.random() * 7) * SS * K * 0.55, (r.random() - 0.35) * 0.7, r.random(), r.random() < 0.4)
    # Tufts: fans of blades over their contact shadows (painted clump look).
    for tx, ty, z in tufts:
        x, y = tx * SS, ty * SS
        if on_path(x, y):
            continue
        sz = z * SS * K * 0.8
        nbl = 5 + r.integers(5)
        for i in range(nbl):
            ang = -1.0 + 2.0 * i / max(1, nbl - 1) + (r.random() - 0.5) * 0.3
            L = (8 + r.random() * 7) * sz
            blade(x + ang * 3 * sz, y, L, ang * 0.75 + 0.15, 0.35 + r.random() * 0.65, ang < 0.2)

    # Clover / flower clusters in the camp half.
    flowers = [(255, 255, 255), (255, 220, 80), (255, 140, 180), (176, 160, 255)]
    for _ in range(int(220 * (W * H) / (1320 * 2430 * R * R))):
        wx = 30 + r.random() * (MAP_W - 60)
        wy = WALL_Y + 40 + r.random() * (MAP_H - WALL_Y - 40)
        x, y = px(wx, wy)
        x *= SS
        y *= SS
        if on_path(x, y):
            continue
        fc = flowers[r.integers(len(flowers))]
        for _p in range(3 + r.integers(4)):
            ox, oy = (r.random() - 0.5) * 18 * SS * R, (r.random() - 0.5) * 10 * SS * R
            rr = 2.2 * SS * R
            d.ellipse((x + ox - rr, y + oy - rr + 1.5 * SS * R, x + ox + rr, y + oy + rr + 1.5 * SS * R), fill=(30, 60, 25))
            d.ellipse((x + ox - rr, y + oy - rr, x + ox + rr, y + oy + rr), fill=fc)
            d.ellipse((x + ox - rr * 0.4, y + oy - rr * 0.4, x + ox + rr * 0.4, y + oy + rr * 0.4), fill=(255, 230, 120))

    # Pebbles on the road and plaza: shadow, body, highlight.
    for _ in range(int(1500 * (W * H) / (1320 * 2430 * R * R))):
        x, y = r.random() * W * SS, r.random() * H * SS
        if not on_path(x, y) or paved[min(H - 1, int(y / SS)), min(W - 1, int(x / SS))]:
            continue
        s = (1.5 + r.random() * 3.5) * SS * K
        gcol = int(150 + r.random() * 60)
        d.ellipse((x - s + s * 0.3, y - s * 0.6 + s * 0.35, x + s + s * 0.3, y + s * 0.6 + s * 0.35), fill=(110, 86, 58))
        d.ellipse((x - s, y - s * 0.6, x + s, y + s * 0.6), fill=(gcol, gcol - 6, gcol - 16))
        d.ellipse((x - s * 0.6, y - s * 0.55, x + s * 0.1, y - s * 0.1), fill=(min(255, gcol + 40),) * 3)

    out = big.resize((W, H), Image.LANCZOS)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"ground_{ch}.webp")
    out.save(path, quality=86, method=6)
    print(path, out.size, os.path.getsize(path) // 1024, "KB")


if __name__ == "__main__":
    ids = [int(a) for a in sys.argv[1:]] or list(PALETTES)
    for ch in ids:
        build(ch)
