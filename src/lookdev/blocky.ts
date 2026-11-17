// Block-style characters: voxel figures with hand-authored pixel-art textures (ASCII grids below),
// human proportions (head 8 px, body 12 px, legs 12 px; 1 px = PX world units), split limbs so
// elbows and knees still bend, 3D voxel accessories, and an alpha "overlay layer" for helmets and
// hoods. Builds into a Character, which then animates it with the shared procedural rig.
import * as THREE from "three";
import { OUTLINE, toon, type Character, type CharacterSpec, type Limb } from "./rig";

export const PX = 0.05;
type Pal = Record<string, number>;
type Art = string[];

// ---------------------------------------------------------------------------------------------
// Pixel textures.

const texCache = new Map<string, THREE.CanvasTexture>();

function hash(x: number, y: number, k: number): number {
  let h = (x * 374761393 + y * 668265263 + k * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Paint an ASCII grid with a palette ('.' = transparent). Tiny per-pixel value noise makes it feel hand-made. */
function tex(art: Art, pal: Pal, flip = false): THREE.CanvasTexture {
  const key = art.join("/") + "|" + Object.entries(pal).map(([k, v]) => k + v.toString(16)).join(",") + (flip ? "|f" : "");
  const hit = texCache.get(key);
  if (hit) return hit;
  const h = art.length, w = art[0]!.length;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = flip ? w - 1 - x : x;
      const ch = art[y]![sx] ?? ".";
      const i = (y * w + x) * 4;
      if (ch === ".") continue;
      const col = pal[ch] ?? 0xff00ff;
      const f = 0.95 + hash(sx, y, ch.charCodeAt(0)) * 0.09;
      img.data[i] = Math.min(255, ((col >> 16) & 255) * f);
      img.data[i + 1] = Math.min(255, ((col >> 8) & 255) * f);
      img.data[i + 2] = Math.min(255, (col & 255) * f);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

const fill = (w: number, h: number, ch: string): Art => Array.from({ length: h }, () => ch.repeat(w));

interface Faces {
  front: Art;
  back: Art;
  /** Side art with column 0 at the FRONT edge (mirrored automatically for the left side). */
  side: Art;
  top: Art;
  bottom: Art;
}

// ---------------------------------------------------------------------------------------------
// Shared limb art. Letters: v/V sleeve, c cuff, q hand, p/P trousers, o/O/u boots.

const ARM_UP: Faces = {
  front: ["vvvv", "vvvv", "vVvv", "vvvv", "vvVv", "VVVV"],
  back: ["vvvv", "vvvv", "vvVv", "vvvv", "vVvv", "VVVV"],
  side: ["vvvv", "vvvv", "vvvv", "vVvv", "vvvv", "VVVV"],
  top: fill(4, 4, "v"),
  bottom: fill(4, 4, "v"),
};
const ARM_LO: Faces = {
  front: ["vvvv", "cccc", "qqqq", "qqqq", "qqqq", "qqqq"],
  back: ["vvvv", "cccc", "qqqq", "qqqq", "qqqq", "qqqq"],
  side: ["vvvv", "cccc", "qqqq", "qqqq", "qqqq", "qqqq"],
  top: fill(4, 4, "v"),
  bottom: fill(4, 4, "q"),
};
const LEG_UP: Faces = {
  front: ["pppp", "pppp", "pppp", "pPpp", "pppp", "pppp"],
  back: ["pppp", "pppp", "ppPp", "pppp", "pppp", "pppp"],
  side: ["pppp", "pppp", "pppp", "pppp", "ppPp", "pppp"],
  top: fill(4, 4, "p"),
  bottom: fill(4, 4, "p"),
};
const LEG_LO: Faces = {
  front: ["pppp", "pPpp", "OOOO", "oooo", "oooo", "uuuu"],
  back: ["pppp", "ppPp", "OOOO", "oooo", "oooo", "OOOO"],
  side: ["pppp", "pppp", "OOOO", "oooo", "oooo", "uOOO"],
  top: fill(4, 4, "p"),
  bottom: fill(4, 4, "O"),
};

// ---------------------------------------------------------------------------------------------
// Character looks: palettes + head/body art (heads 8×8, bodies 8×12, 4 px deep).

interface Look {
  pal: Pal;
  head: Faces;
  body: Faces;
  overlay?: Faces;
  eye: { white: number; pupil: number };
}

const HERO_PAL: Pal = {
  s: 0xf2c29a, S: 0xd9a07a, h: 0x6b3a1a, H: 0x4e2a12, m: 0x8a3a2a,
  t: 0x3566d6, T: 0x24479e, g: 0xf2c443, G: 0xc9962a, l: 0x5a3418,
  v: 0x3566d6, V: 0x24479e, c: 0xf2c443, q: 0xf2c29a,
  p: 0x2a335c, P: 0x1f2647, o: 0x6a4426, O: 0x4a2c18, u: 0x8a5e36,
};

const HERO_BODY: Faces = {
  front: [
    "TTggggTT", "tTTggTTt", "ttTTTTtt", "tttTTttt", "tttTTttt", "tttTTttt",
    "tttTTttt", "lllgglll", "tttTTttt", "tttttttt", "TttttttT", "gggggggg",
  ],
  back: [
    "TTTTTTTT", "tttttttt", "tttttttt", "tttTtttt", "tttttttt", "ttttTttt",
    "tttttttt", "llllllll", "tttttttt", "tttttttt", "TttttttT", "gggggggg",
  ],
  side: ["TTTT", "tttt", "tttt", "tttt", "tTtt", "tttt", "tttt", "llll", "tttt", "tttt", "tttt", "gggg"],
  top: ["TTggggTT", "TggggggT", "TggggggT", "TTTTTTTT"],
  bottom: fill(8, 4, "t"),
};

const LOOKS: Record<string, Look> = {
  hero: {
    pal: HERO_PAL,
    eye: { white: 0xffffff, pupil: 0x3a2414 },
    head: {
      front: ["hhhhhhhh", "hhhhhhhh", "hHhhhhHh", "hsHssHsh", "ssssssss", "sssSSsss", "ssSmmSss", "ssssssss"],
      side: ["hhhhhhhh", "hhhhhhhh", "shhhhhhh", "sshhhhhh", "sssSShhh", "sssSShhh", "ssssshhh", "sssssshh"],
      back: ["hhhhhhhh", "hhhhhhhh", "hhhhHhhh", "hhhhhhhh", "hHhhhhhh", "hhhhhhHh", "hhhhhhhh", "HhhhhhhH"],
      top: ["hhhhhhhh", "hhHhhhhh", "hhhhhHhh", "hhhhhhhh", "hHhhhhhh", "hhhhHhhh", "hhhhhhhh", "hhhHhhhh"],
      bottom: fill(8, 8, "s"),
    },
    body: HERO_BODY,
  },
  archer: {
    pal: { ...HERO_PAL, g: 0x8a6a4a, c: 0x6a4426, h: 0x2f8a4a, H: 0x1f5c32, b: 0x4a2c18, e: 0xc8843a, E: 0xa86a2a },
    eye: { white: 0xffffff, pupil: 0x2a3a20 },
    head: {
      front: ["eeeeeeee", "eeeeeeee", "eEeeeeEe", "esbssbse", "ssssssss", "sssSSsss", "ssSmmSss", "ssssssss"],
      side: ["eeeeeeee", "eeeeeeee", "seeeeeee", "sseeeeee", "sssSSeee", "sssSSeee", "ssssseee", "sssssEee"],
      back: ["eeeeeeee", "eeeeeeee", "eeeEeeee", "eeeeeeee", "eeeeeEee", "eEeeeeee", "eeeeeeee", "EeeeeeeE"],
      top: fill(8, 8, "e"),
      bottom: fill(8, 8, "s"),
    },
    body: HERO_BODY,
    overlay: {
      // Green ranger cap with a brim.
      front: ["hhhhhhhh", "hhhhhhhh", "HHHHHHHH", "........", "........", "........", "........", "........"],
      side: ["hhhhhhhh", "hhhhhhhh", "HHHHHHHH", "........", "........", "........", "........", "........"],
      back: ["hhhhhhhh", "hhhhhhhh", "hhhhhhhh", "HHHHHHHH", "........", "........", "........", "........"],
      top: ["hhhhhhhh", "hhhhhhhh", "hhhHhhhh", "hhhhhhhh", "hhhhhhhh", "hhhhhHhh", "hhhhhhhh", "hhhhhhhh"],
      bottom: fill(8, 8, "."),
    },
  },
  footman: {
    pal: {
      s: 0xf0bf96, S: 0xd49c74, b: 0x5a3418, m: 0x7a2a20,
      t: 0xc8382c, T: 0x8e2218, g: 0xf2d24a, a: 0xa8b0bc, A: 0x707886, l: 0x4a2c18,
      v: 0xa8b0bc, V: 0x707886, c: 0x707886, q: 0x6a4426,
      p: 0x4a3424, P: 0x34241a, o: 0x5a3a22, O: 0x3a2414, u: 0x7a5232,
    },
    eye: { white: 0xffffff, pupil: 0x2a1a10 },
    head: {
      front: ["ssssssss", "ssssssss", "sbssssbs", "ssbssbss", "ssssssss", "sssSSsss", "ssbbbbss", "sssmmsss"],
      side: ["ssssssss", "ssssssss", "ssssssss", "ssssssss", "sssSSsss", "sssSSsss", "bsssssss", "ssssssss"],
      back: fill(8, 8, "s"),
      top: fill(8, 8, "s"),
      bottom: fill(8, 8, "s"),
    },
    body: {
      front: [
        "aTTTTTTa", "atttttta", "attggtta", "atggggta", "attggtta", "attggtta",
        "atttttta", "lllgglll", "atttttta", "atttttta", "aTttttTa", "aTTTTTTa",
      ],
      back: [
        "aAaAaAaA", "AaAaAaAa", "aAaAaAaA", "AaAaAaAa", "aAaAaAaA", "AaAaAaAa",
        "aAaAaAaA", "llllllll", "aAaAaAaA", "AaAaAaAa", "aAaAaAaA", "AAAAAAAA",
      ],
      side: ["aAaA", "AaAa", "aAaA", "AaAa", "aAaA", "AaAa", "aAaA", "llll", "aAaA", "AaAa", "aAaA", "AAAA"],
      top: ["aaaaaaaa", "aAAAAAAa", "aAAAAAAa", "aaaaaaaa"],
      bottom: fill(8, 4, "a"),
    },
    overlay: {
      front: ["aaaaaaaa", "aaaaaaaa", "AAAAAAAA", "...AA...", "...AA...", "........", "........", "........"],
      side: ["aaaaaaaa", "aaaaaaaa", "AAAAAAAA", "aa...aaa", "aa...aaa", "a....aaa", ".....aaa", "........"],
      back: ["aaaaaaaa", "aaaaaaaa", "AAAAAAAA", "aaaaaaaa", "aaaaaaaa", "aaaaaaaa", "AAAAAAAA", "........"],
      top: ["aaaAAaaa", "aaaAAaaa", "aaaAAaaa", "aaaAAaaa", "aaaAAaaa", "aaaAAaaa", "aaaAAaaa", "aaaAAaaa"],
      bottom: fill(8, 8, "."),
    },
  },
  brute: {
    pal: {
      s: 0x7aa84a, S: 0x557a32, k: 0x1d2a10, m: 0x3a1a10, l: 0x6b4a2c, L: 0x4a3020, w: 0xeee2c6,
      v: 0x7aa84a, V: 0x557a32, c: 0x4a3020, q: 0x7aa84a,
      p: 0x5a3a22, P: 0x3a2414, o: 0x8a6a4a, O: 0x5a4430, u: 0xa88a6a,
    },
    eye: { white: 0xffe066, pupil: 0x1d1208 },
    head: {
      front: ["ssssssss", "ssssssss", "skssssks", "sskSSkss", "ssssssss", "ssSkkSss", "smmmmmms", "ssssssss"],
      side: ["ssssssss", "ssssssss", "ssssSsss", "ssssssss", "sssSSsss", "sssSSsss", "ssssssss", "SsssssSs"],
      back: ["ssssssss", "ssSsssss", "ssssssss", "sssssSss", "ssssssss", "sSssssss", "ssssssss", "SSSSSSSS"],
      top: ["ssssssss", "sssSssss", "ssssssss", "ssssssSs", "ssssssss", "sSssssss", "ssssssss", "ssssssss"],
      bottom: fill(8, 8, "s"),
    },
    body: {
      front: [
        "llssssll", "llsSSsll", "llssssll", "llsSSsll", "llssssll", "llsSSsll",
        "llssssll", "LLLwwLLL", "pppppppp", "pppppppp", "pPppppPp", "PPPPPPPP",
      ],
      back: [
        "llllllll", "lLllllLl", "llllllll", "llLllLll", "llllllll", "lLllllLl",
        "llllllll", "LLLLLLLL", "pppppppp", "pppppppp", "pPppppPp", "PPPPPPPP",
      ],
      side: ["llll", "llll", "lLll", "llll", "llLl", "llll", "llll", "LLLL", "pppp", "pppp", "pPpp", "PPPP"],
      top: ["llssssll", "llssssll", "llssssll", "llllllll"],
      bottom: fill(8, 4, "p"),
    },
  },
};

function lookFor(spec: CharacterSpec): Look {
  if (spec.head === "crown") return LOOKS.hero!;
  if (spec.head === "hood") return LOOKS.archer!;
  if (spec.head === "horns") return LOOKS.brute!;
  return LOOKS.footman!;
}

// ---------------------------------------------------------------------------------------------
// Builder.

export function buildBlock(c: Character, spec: CharacterSpec): void {
  const look = lookFor(spec);
  const pal = look.pal;
  const b = spec.bulk ?? 1;
  const colorMats = new Map<number, THREE.MeshToonMaterial>();

  const track = (m: THREE.MeshToonMaterial): THREE.MeshToonMaterial => {
    c.toonMats.push(m);
    c.allMats.push(m);
    return m;
  };
  /** Textured box (sizes in pixels). Outline = slightly larger back-faced box (constant width). */
  const box = (w: number, h: number, d: number, f: Faces, opts: { overlay?: boolean; outline?: boolean } = {}): THREE.Mesh => {
    const ov = !!opts.overlay;
    const m = (art: Art, flip = false): THREE.MeshToonMaterial =>
      track(toon(0xffffff, { map: tex(art, pal, flip), alphaTest: ov ? 0.5 : 0, rim: 0.22 }));
    // BoxGeometry material order: +x, -x, +y, -y, +z (front), -z (back).
    const mats = [m(f.side), m(f.side, true), m(f.top), m(f.bottom), m(f.front), m(f.back)];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * PX, h * PX, d * PX), mats);
    mesh.castShadow = true;
    if (opts.outline !== false && !ov) {
      const e = 0.014;
      mesh.add(new THREE.Mesh(new THREE.BoxGeometry(w * PX + e * 2, h * PX + e * 2, d * PX + e * 2), OUTLINE));
    }
    return mesh;
  };
  /** Solid-colour voxel (sizes in pixels). */
  const vox = (color: number, w: number, h: number, d: number, outline = true): THREE.Mesh => {
    let mat = colorMats.get(color);
    if (!mat) {
      mat = track(toon(color, { rim: 0.3 }));
      colorMats.set(color, mat);
    }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * PX, h * PX, d * PX), mat);
    mesh.castShadow = true;
    if (outline) {
      const e = 0.012;
      mesh.add(new THREE.Mesh(new THREE.BoxGeometry(w * PX + e * 2, h * PX + e * 2, d * PX + e * 2), OUTLINE));
    }
    return mesh;
  };
  const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => {
    o.position.set(x * PX, y * PX, z * PX);
    return o;
  };

  c.hipY = 12 * PX;
  c.root.add(c.hips);
  c.hips.position.y = c.hipY;

  // Legs: hip → upper (6 px) → knee → lower (6 px) → foot.
  const leg = (x: number): Limb => {
    const root = at(new THREE.Group(), x, 0, 0);
    const up = at(box(4 * b, 6, 4 * b, LEG_UP), 0, -3, 0);
    const joint = at(new THREE.Group(), 0, -6, 0);
    const lo = at(box(4 * b, 6, 4 * b, LEG_LO), 0, -3, 0);
    const end = at(new THREE.Group(), 0, -6, 0);
    joint.add(lo, end);
    root.add(up, joint);
    c.hips.add(root);
    return { root, joint, end };
  };
  c.legL = leg(-2 * b);
  c.legR = leg(2 * b);

  // Torso.
  c.hips.add(c.torso);
  c.torso.add(at(box(8 * b, 12, 4 * b, look.body), 0, 6, 0));

  // Head on a neck pivot, with an optional overlay layer (helmet / hood).
  at(c.neck, 0, 12, 0);
  c.torso.add(c.neck);
  at(c.head, 0, 4, 0);
  c.neck.add(c.head);
  c.head.add(box(8, 8, 8, look.head));
  if (look.overlay) c.head.add(box(8.9, 8.9, 8.9, look.overlay, { overlay: true }));

  // Eyes: voxels proud of the face so they can blink / wince (white outer pixel, pupil inner).
  const eyeWhite = new THREE.MeshBasicMaterial({ color: look.eye.white });
  const eyePupil = new THREE.MeshBasicMaterial({ color: look.eye.pupil });
  c.allMats.push(eyeWhite, eyePupil);
  for (const k of [-1, 1]) {
    const g = at(new THREE.Group(), k * 2, -0.5, 4.08);
    const white = at(new THREE.Mesh(new THREE.BoxGeometry(PX, PX, 0.25 * PX), eyeWhite), k * 0.5, 0, 0);
    const pupil = at(new THREE.Mesh(new THREE.BoxGeometry(PX, PX, 0.3 * PX), eyePupil), -k * 0.5, 0, 0);
    g.add(white, pupil);
    c.head.add(g);
    c.eyes.push(g);
  }

  // Arms: shoulder → upper (6 px) → elbow → forearm + hand (6 px).
  const arm = (x: number): Limb => {
    const root = at(new THREE.Group(), x, 10, 0);
    const up = at(box(4 * b, 6, 4 * b, ARM_UP), 0, -1, 0);
    const joint = at(new THREE.Group(), 0, -4, 0);
    const lo = at(box(4 * b, 6, 4 * b, ARM_LO), 0, -3, 0);
    const end = at(new THREE.Group(), 0, -5, 0);
    joint.add(lo, end);
    root.add(up, joint);
    c.torso.add(root);
    return { root, joint, end };
  };
  c.armL = arm(-6 * b);
  c.armR = arm(6 * b);

  addAccessories(c, spec, vox, at, box, pal, b);
  (spec.weapon === "bow" ? c.armL : c.armR).end.add(c.weapon);
  buildBlockWeapon(c, spec, vox, at, box, pal);
}

type Vox = (color: number, w: number, h: number, d: number, outline?: boolean) => THREE.Mesh;
type At = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => T;
type Box = (w: number, h: number, d: number, f: Faces, opts?: { overlay?: boolean; outline?: boolean }) => THREE.Mesh;

function addAccessories(c: Character, spec: CharacterSpec, vox: Vox, at: At, box: Box, pal: Pal, b: number): void {
  const H = c.head;
  if (spec.head === "crown") {
    // Voxel crown: a band round the head with five points and gems.
    const gold = 0xf2c443, dark = 0xc9962a;
    H.add(at(vox(gold, 8.6, 1.4, 0.8), 0, 4.4, 3.9), at(vox(gold, 8.6, 1.4, 0.8), 0, 4.4, -3.9));
    H.add(at(vox(gold, 0.8, 1.4, 7.0), 3.9, 4.4, 0), at(vox(gold, 0.8, 1.4, 7.0), -3.9, 4.4, 0));
    for (const [x, z] of [[-3.9, 3.9], [0, 3.9], [3.9, 3.9], [-3.9, -3.9], [3.9, -3.9]] as const) {
      H.add(at(vox(dark, 1, 1.6, 1), x, 5.8, z));
      H.add(at(vox(gold, 0.6, 0.8, 0.6, false), x, 7.0, z));
    }
    H.add(at(vox(0xff3a5a, 1, 1, 0.5, false), 0, 4.4, 4.35));
    H.add(at(vox(0x3ad0ff, 0.8, 0.8, 0.5, false), -2.4, 4.4, 4.35), at(vox(0x3ad0ff, 0.8, 0.8, 0.5, false), 2.4, 4.4, 4.35));
  } else if (spec.head === "helmet") {
    // Crest plume of stacked voxels.
    const red = 0xd8382c, deep = 0x9a2420;
    [[0, 5.2, 2.5, 1.6], [0, 6.0, 1.0, 1.8], [0, 6.3, -0.6, 1.8], [0, 6.0, -2.2, 1.6], [0, 5.3, -3.6, 1.4]].forEach(([x, y, z, s], i) =>
      H.add(at(vox(i % 2 ? deep : red, 1.4, s!, 1.6), x!, y!, z!)),
    );
  } else if (spec.head === "hood") {
    // Cap brim + a red feather.
    H.add(at(vox(0x1f5c32, 9.4, 0.6, 2.2), 0, 1.2, 4.6));
    H.add(at(vox(0xd84a3a, 0.8, 3.2, 0.8), 3.6, 5.6, -1.5), at(vox(0xf2f0e6, 0.6, 1.2, 0.6, false), 3.6, 7.6, -1.5));
  } else if (spec.head === "horns") {
    const bone = 0xeee2c6, tip = 0xfff8e8;
    for (const k of [-1, 1]) {
      H.add(at(vox(bone, 1.6, 1.6, 1.6), k * 4.7, 2.2, 0));
      H.add(at(vox(bone, 1.4, 1.4, 1.4), k * 5.8, 3.3, 0));
      H.add(at(vox(bone, 1.2, 1.4, 1.2), k * 6.4, 4.6, 0));
      H.add(at(vox(tip, 0.9, 1.2, 0.9), k * 6.4, 5.9, 0));
      // Tusks rising from the jaw, proud of the face.
      H.add(at(vox(bone, 0.9, 1.8, 0.7), k * 2.5, -2.6, 4.35));
    }
    H.add(at(vox(0x22180e, 2.4, 2, 2.4), 0, 5, -0.8), at(vox(0x22180e, 1.6, 1.6, 1.6), 0, 5.4, -2.8), at(vox(0x22180e, 1.2, 2.4, 1.2), 0, 4.0, -4.0));
    // One big spiked pauldron on the weapon shoulder.
    const pad = at(vox(0x6a6e78, 6 * b, 3, 6 * b), 0, 2.4, 0);
    for (const dx of [-1.8, 0, 1.8]) pad.add(at(vox(bone, 1, 2.2, 1), dx * b, 2.4, 0));
    c.armR.root.add(pad);
  }
  if (spec.head === "helmet") {
    for (const arm of [c.armL, c.armR]) arm.root.add(at(vox(0xa8b0bc, 5.2, 2.4, 5.2), 0, 2.0, 0));
  }
  // Hero cape: two hinged voxel panels (gold-edged) so it swings and lags.
  if (spec.palette.cape !== undefined) {
    const rig = at(new THREE.Group(), 0, 11.6, -2.4);
    const cloth = (rows: number, hem: boolean): Faces => {
      const art = fill(8, rows, "r");
      art.forEach((_, i) => (art[i] = "g" + "r".repeat(6) + "g"));
      if (hem) art[rows - 1] = "gggggggg";
      return { front: art.map((r) => r.replace(/r/g, "R")), back: art, side: fill(1, rows, "g"), top: fill(8, 1, "r"), bottom: fill(8, 1, "g") };
    };
    const capePal = { r: spec.palette.cape, R: 0x8a1e1a, g: 0xf2c443 };
    const mk = (rows: number, hem: boolean): THREE.Mesh => {
      const f = cloth(rows, hem);
      const mats = [f.side, f.side, f.top, f.bottom, f.front, f.back].map((a) => {
        const m = toon(0xffffff, { map: tex(a, capePal), rim: 0.25 });
        c.toonMats.push(m);
        c.allMats.push(m);
        return m;
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(8.4 * PX, rows * PX, 0.6 * PX), mats);
      mesh.castShadow = true;
      mesh.add(new THREE.Mesh(new THREE.BoxGeometry(8.4 * PX + 0.02, rows * PX + 0.02, 0.6 * PX + 0.02), OUTLINE));
      return mesh;
    };
    rig.add(at(mk(7, false), 0, -3.5, 0));
    const lower = at(new THREE.Group(), 0, -7, 0);
    lower.add(at(mk(7, true), 0, -3.5, 0));
    rig.add(lower);
    c.torso.add(rig);
    c.capeRig = rig;
    c.capeLower = lower;
    // Gold shoulder clasp.
    c.torso.add(at(vox(0xf2c443, 9, 1.2, 1), 0, 11.6, -2.2));
  }
  if (spec.weapon === "bow") {
    const quiver = at(new THREE.Group(), 2, 7, -2.9);
    quiver.rotation.z = -0.55;
    quiver.add(vox(0x6a4426, 2.6, 8, 2.6));
    quiver.add(at(vox(0x4a2c18, 2.8, 1, 2.8), 0, 2.6, 0));
    [[-0.6, 0xf2f0e6], [0.6, 0xd84a3a], [0, 0xf2f0e6]].forEach(([x, col], i) => quiver.add(at(vox(col!, 0.8, 1.6, 0.8), x!, 4.6 + (i % 2) * 0.4, i === 2 ? 0.6 : -0.3)));
    c.torso.add(quiver);
  }
  void pal;
  void box;
}

function buildBlockWeapon(c: Character, spec: CharacterSpec, vox: Vox, at: At, box: Box, pal: Pal): void {
  const W = c.weapon;
  if (spec.weapon === "bow") {
    // Voxel bow in its own frame (limbs along Y, belly at the origin bulging to -X, string at +X),
    // stepped like pixel art, then mapped into the hand frame.
    const g = new THREE.Group();
    const R = 9; // px
    const tipY = 8;
    for (let y = -tipY; y <= tipY; y += 1) {
      const x = R - Math.sqrt(R * R - y * y);
      const snapped = Math.round(x * 2) / 2;
      const col = Math.abs(y) <= 1 ? 0x3a2414 : Math.abs(y) >= tipY - 1 ? 0xb07a40 : 0x8a5428;
      g.add(at(vox(col, 1.1, 1.1, 1.1, Math.abs(y) % 2 === 0), snapped, y, 0));
    }
    const tipX = R - Math.sqrt(R * R - tipY * tipY);
    const string = new THREE.Mesh(new THREE.BoxGeometry(0.25 * PX, tipY * 2 * PX, 0.25 * PX), new THREE.MeshBasicMaterial({ color: 0xf2ead8 }));
    c.allMats.push(string.material as THREE.Material);
    g.add(at(string, tipX, 0, 0));
    g.setRotationFromMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)));
    W.add(g);
  } else if (spec.weapon === "sword") {
    W.add(at(vox(0xe2e6ee, 1.8, 11, 0.7), 0, 7.5, 0));
    W.add(at(vox(0x9aa2b0, 0.6, 9.5, 0.8, false), 0, 7, 0));
    W.add(at(vox(0xe2e6ee, 1, 1, 0.7), 0, 13.5, 0));
    W.add(at(vox(0xf2c443, 5, 1.2, 1.4), 0, 1.6, 0));
    W.add(at(vox(0x5a3418, 1.2, 2.6, 1.2), 0, 0, 0));
    W.add(at(vox(0xf2c443, 1.6, 1.4, 1.6), 0, -1.8, 0));
    W.rotation.x = Math.PI / 2 - 0.3;
  } else {
    W.add(at(vox(0x6a4422, 1.6, 9, 1.6), 0, 3.5, 0));
    W.add(at(vox(0x8a6038, 4, 6.5, 4), 0, 10.5, 0));
    W.add(at(vox(0x6a4422, 4.4, 1, 4.4), 0, 7.4, 0));
    for (const [x, y, z] of [[2.3, 9.5, 0], [-2.3, 11.5, 0], [0, 10, 2.3], [0, 12, -2.3], [2.3, 12.6, 0], [0, 8.6, -2.3]] as const) {
      W.add(at(vox(0xc4cad4, 0.9, 0.9, 0.9), x, y, z));
    }
    W.rotation.x = Math.PI / 2 - 0.2;
  }
  if (spec.shield) {
    // Kite shield strapped to the forearm: its face looks along the forearm (hand -Y).
    const face: Art = [
      "AAAAAAAAAA", "AttttttttA", "AtttggtttA", "AtttggtttA", "AggggggggA", "AggggggggA",
      "AtttggtttA", "AtttggtttA", "AAttggttAA", ".AttttttA.", "..AttttA..", "...AAAA...",
    ];
    const f: Faces = { front: fill(10, 1, "A"), back: fill(10, 1, "A"), side: fill(12, 1, "A"), top: face.map((r) => r.replace(/[tg]/g, "l")), bottom: face };
    const sh = box(10, 1, 12, f, { overlay: true });
    at(sh, -1.5, -1.5, 0);
    c.armL.end.add(sh);
  }
  void pal;
}
