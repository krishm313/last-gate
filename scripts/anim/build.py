"""Build HD, 2x-frame atlases for every character from the registered sheet frames."""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter
sys.path.insert(0, os.path.dirname(__file__))
from interp import cells, expand

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "static", "sprites", "anim") + os.sep
H = 200  # cell height in the atlas (the sheets' native resolution; was downscaled to 170)
FULL = ["idle", "walk", "attack", "hit", "death"]
BACK = ["idle", "walk", "attack"]
chars = {"king": FULL, "horde_horned": FULL, "brute": FULL, "horde_archer": FULL, "knight_ally": FULL,
         "archer_ally": FULL, "king_back": BACK, "knight_ally_back": BACK}
only = sys.argv[1:] or list(chars)
meta = {}
for name in only:
    anims = chars[name]
    cs, cw, ch, pad = cells(name, anims)
    rows = {a: expand(cs[a], a in ("idle", "walk")) for a in anims}
    k = H / ch
    W = round(cw * k)
    cols = max(len(v) for v in rows.values())
    atlas = Image.new("RGBA", (W * cols, H * len(anims)), (0, 0, 0, 0))
    for r, a in enumerate(anims):
        for i, f in enumerate(rows[a]):
            im = Image.fromarray((np.clip(f, 0, 1) * 255).astype(np.uint8), "RGBA").resize((W, H), Image.LANCZOS)
            # Crisper detail: unsharp the colour only (sharpening alpha would halo the silhouette).
            rgb = im.convert("RGB").filter(ImageFilter.UnsharpMask(radius=1.1, percent=70, threshold=2))
            im = Image.merge("RGBA", (*rgb.split(), im.split()[3]))
            atlas.paste(im, (i * W, r * H))
    atlas.save(OUT + f"{name}.webp", quality=92, method=6)
    meta[name] = {"w": W, "h": H, "foot": round((ch - pad) * k), "frames": {a: len(rows[a]) for a in anims}}
    print(name, atlas.size, meta[name], os.path.getsize(OUT + f"{name}.webp") // 1024, "KB", flush=True)
json.dump(meta, open(f"hd/meta_{'_'.join(only)}.json", "w"))
