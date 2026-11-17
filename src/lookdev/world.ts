// Block-world environment for the look-dev scene: procedurally painted 16-px tiles (grass, path,
// planks, bark, log rings, leaves, cobble), boxes whose UVs are scaled so every surface shares the
// characters' pixel density (16 px = TILE world units), crossed-quad grass tufts, voxel trees.
import * as THREE from "three";
import { OUTLINE, toon } from "./rig";

export const TILE = 0.8; // world units per 16-px tile (1 px = 0.05, same as the characters)

function hash(x: number, y: number, k: number): number {
  let h = (x * 374761393 + y * 668265263 + k * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

type Painter = (x: number, y: number, r: number) => number | null; // null = transparent
const tileCache = new Map<string, THREE.CanvasTexture>();

function paint(name: string, fn: Painter, w = 16, h = 16): THREE.CanvasTexture {
  const hit = tileCache.get(name);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const seed = [...name].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const col = fn(x, y, hash(x, y, seed));
      if (col === null) continue;
      const i = (y * w + x) * 4;
      img.data[i] = (col >> 16) & 255;
      img.data[i + 1] = (col >> 8) & 255;
      img.data[i + 2] = col & 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  tileCache.set(name, t);
  return t;
}

const pick = (r: number, cols: number[]): number => cols[Math.min(cols.length - 1, Math.floor(r * cols.length))]!;

export const TILES = {
  grass: () => paint("grass", (_x, _y, r) => pick(r, [0x64a046, 0x6aa84a, 0x6aa84a, 0x6ea94c, 0x6aa84a, 0x62a044, 0x72b050, 0x6aa84a])),
  path: () =>
    paint("path", (x, y, r) => (hash(x, y, 9) > 0.975 ? 0x948e80 : pick(r, [0xb08a58, 0xbc9460, 0xb89060, 0xa8824e, 0xc29a64, 0xb48c5c]))),
  dirt: () => paint("dirt", (_x, _y, r) => pick(r, [0x7a5432, 0x8a6038, 0x6a4628, 0x946a40])),
  grassSide: () =>
    paint("grassSide", (x, y, r) => {
      const drip = 3 + Math.floor(hash(x, 0, 3) * 3);
      return y < drip ? pick(r, [0x5e9a40, 0x6aa84a, 0x74b252]) : pick(r, [0x7a5432, 0x8a6038, 0x6a4628, 0x946a40]);
    }),
  plank: () =>
    paint("plank", (x, y, r) => {
      const row = y >> 2;
      if ((y & 3) === 3) return 0x5a3a1e; // seam
      const off = row % 2 ? 0 : 8;
      if ((x + off) % 16 === 0) return 0x5a3a1e;
      const base = [0xb07a40, 0xa46e38, 0xb88446, 0x9c6834][row]!;
      return r > 0.85 ? base - 0x0a0806 : r < 0.1 ? base + 0x080604 : base;
    }),
  plankV: () =>
    paint("plankV", (x, y, r) => {
      const col = x >> 2;
      if ((x & 3) === 3) return 0x4a2e16;
      const base = [0x8a5a30, 0x7e522a, 0x946234, 0x84562c][col]!;
      if (y === 15) return 0x4a2e16;
      return r > 0.85 ? base - 0x080604 : base;
    }),
  bark: () =>
    paint("bark", (x, y, r) => {
      const streak = hash(x, Math.floor(y / 5), 4);
      return streak > 0.75 ? 0x4e3420 : pick(r, [0x6a4a2a, 0x5e4024, 0x765230, 0x6a4a2a]);
    }),
  logTop: () =>
    paint("logTop", (x, y, r) => {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d > 6.6) return 0x5e4024;
      return Math.floor(d) % 2 ? (r > 0.5 ? 0xb8905a : 0xb28a54) : 0xa07a48;
    }),
  leaves: () =>
    paint("leaves", (x, y, r) => {
      const n = hash(x >> 1, y >> 1, 21);
      if (n > 0.88) return 0x24561a;
      return pick(r, [0x3f8a2c, 0x4a9a34, 0x3a7e28, 0x52a63a, 0x2f6e22]);
    }),
  cobble: () =>
    paint("cobble", (x, y, r) => {
      const cx = Math.floor((x + (y >> 2) % 2 * 2) / 4), cy = y >> 2;
      const edge = (x + (y >> 2) % 2 * 2) % 4 === 0 || y % 4 === 0;
      if (edge) return 0x5e6068;
      const base = [0x8e9098, 0x9a9ca4, 0x82848c, 0xa4a6ae][Math.floor(hash(cx, cy, 5) * 4)]!;
      return r > 0.8 ? base - 0x0a0a0a : base;
    }),
  iron: () => paint("iron", (_x, _y, r) => pick(r, [0x3a3e48, 0x444852, 0x34383f])),
  tuft: () =>
    paint("tuft", (x, y) => {
      // Grass blades: each column has a blade of random height (transparent above).
      const hgt = 5 + Math.floor(hash(x, 0, 11) * 10);
      if (x % 2 === 1 && hash(x, 1, 12) > 0.4) return null;
      if (15 - y > hgt) return null;
      return 15 - y > hgt - 3 ? 0x8ccc5c : y > 12 ? 0x3f7a2c : 0x5e9a40;
    }),
  flower: () =>
    paint("flower", (x, y) => {
      if ((x === 7 || x === 8) && y > 7) return 0x3f7a2c;
      if (y === 10 && (x === 5 || x === 10)) return 0x4f8a3a;
      const d = Math.hypot(x - 7.5, y - 5);
      if (d < 1.2) return 0xffe04a;
      if (d < 3.2) return 0xe8443a;
      return null;
    }),
  banner: () =>
    paint(
      "banner",
      (x, y) => {
        // Blue field, gold border and a pixel crown.
        if (y === 0 || y === 9 || x === 15) return 0xf2c443;
        const crown = ["................", "................", "....g..g..g.....", "....g..g..g.....", "....ggggggg.....", "....grgggbg.....", "....ggggggg.....", "................", "................", "................"];
        const ch = crown[y]![x];
        if (ch === "g") return 0xf2c443;
        if (ch === "r") return 0xe8443a;
        if (ch === "b") return 0x3ad0ff;
        return (x + y) % 7 === 0 ? 0x2c58c0 : 0x3566d6;
      },
      16,
      10,
    ),
};

/** Scale a BoxGeometry's UVs so each face repeats its tile once per TILE world units. */
function tileUVs(geo: THREE.BoxGeometry, w: number, h: number, d: number): void {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const faces: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  faces.forEach(([fu, fv], f) => {
    for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, uv.getX(i) * (fu / TILE), uv.getY(i) * (fv / TILE));
  });
  uv.needsUpdate = true;
}

const matCache = new Map<THREE.Texture, THREE.MeshToonMaterial>();
const tm = (t: THREE.Texture): THREE.MeshToonMaterial => {
  let m = matCache.get(t);
  if (!m) {
    m = toon(0xffffff, { map: t, rim: 0.12 });
    matCache.set(t, m);
  }
  return m;
};

/** A world block: side / top (/ bottom) tiles, pixel-density UVs, constant-width outline. */
export function block(w: number, h: number, d: number, side: THREE.Texture, top: THREE.Texture = side, outline = true, bottom: THREE.Texture = top): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  tileUVs(geo, w, h, d);
  const mesh = new THREE.Mesh(geo, [tm(side), tm(side), tm(top), tm(bottom), tm(side), tm(side)]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (outline) {
    const e = 0.018;
    const o = new THREE.Mesh(new THREE.BoxGeometry(w + e * 2, h + e * 2, d + e * 2), OUTLINE);
    o.castShadow = false;
    mesh.add(o);
  }
  return mesh;
}

export function buildBlockGround(scene: THREE.Scene, roadFromZ: number): void {
  const size = 64;
  const g = TILES.grass().clone();
  g.needsUpdate = true;
  g.repeat.set(size / TILE, size / TILE);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), toon(0xffffff, { map: g, rim: 0 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  // Path from the gate toward the camp: a strip of path tiles, edged with a darker border.
  const len = 12;
  const p = TILES.path().clone();
  p.needsUpdate = true;
  p.repeat.set(3, len / TILE);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(TILE * 3, len), toon(0xffffff, { map: p, rim: 0 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.006, roadFromZ + len / 2);
  road.receiveShadow = true;
  scene.add(road);
}

/** Crossed-quad grass tufts and flowers (instanced so they can sway). */
export function buildTufts(scene: THREE.Scene, rnd: () => number, avoid: (x: number, z: number) => boolean): THREE.InstancedMesh[] {
  const quad = (): THREE.BufferGeometry => {
    const a = new THREE.PlaneGeometry(0.42, 0.42);
    a.translate(0, 0.21, 0);
    const b2 = a.clone();
    b2.rotateY(Math.PI / 2);
    const pos = new Float32Array([...(a.attributes.position!.array as Float32Array), ...(b2.attributes.position!.array as Float32Array)]);
    const uv = new Float32Array([...(a.attributes.uv!.array as Float32Array), ...(b2.attributes.uv!.array as Float32Array)]);
    const nrm = new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)); // up normals: lit like the ground
    const idx = [...(a.index!.array as Uint16Array), ...[...(b2.index!.array as Uint16Array)].map((i) => i + 4)];
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
    g.setIndex(idx);
    return g;
  };
  const out: THREE.InstancedMesh[] = [];
  for (const [tex, n, scale] of [[TILES.tuft(), 520, 1], [TILES.flower(), 60, 0.8]] as const) {
    const mesh = new THREE.InstancedMesh(quad(), toon(0xffffff, { map: tex, alphaTest: 0.5, side: THREE.DoubleSide, rim: 0 }), n);
    const data: { x: number; z: number; ph: number; s: number }[] = [];
    for (let i = 0; i < n * 3 && data.length < n; i++) {
      const x = (rnd() - 0.5) * 30, z = (rnd() - 0.5) * 30 - 2;
      if (avoid(x, z)) continue;
      data.push({ x, z, ph: rnd() * 6, s: scale * (0.8 + rnd() * 0.5) });
    }
    mesh.count = data.length;
    mesh.userData.data = data;
    scene.add(mesh);
    out.push(mesh);
  }
  return out;
}

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
export function swayTufts(meshes: THREE.InstancedMesh[], t: number): void {
  for (const mesh of meshes) {
    const data = mesh.userData.data as { x: number; z: number; ph: number; s: number }[];
    data.forEach((d, i) => {
      const gust = Math.sin(t * 1.6 + d.x * 0.25 + d.z * 0.15 + d.ph * 0.2);
      e3.set(gust * 0.16, d.ph, gust * 0.1);
      q.setFromEuler(e3);
      m4.compose(v3.set(d.x, 0, d.z), q, s3.setScalar(d.s));
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Voxel tree: log trunk and a stepped canopy of leaf blocks. */
export function voxelTree(x: number, z: number, h = 2.4, s = 1): THREE.Group {
  const g = new THREE.Group();
  const trunk = block(0.4 * s, h, 0.4 * s, TILES.bark(), TILES.logTop());
  trunk.position.y = h / 2;
  g.add(trunk);
  const L = TILE * s;
  const layers: [number, number, number][] = [];
  for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) layers.push([ix, 0, iz]);
  for (const [ix, iz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) layers.push([ix, 1, iz]);
  layers.push([0, 2, 0]);
  for (const [ix, iy, iz] of layers) {
    if (Math.abs(ix) + Math.abs(iz) === 2 && hash(ix + Math.round(x * 3), iz + Math.round(z * 3), 7) > 0.6) continue; // ragged corners
    const leaf = block(L, L, L, TILES.leaves());
    leaf.position.set(ix * L, h + iy * L - L * 0.3, iz * L);
    g.add(leaf);
  }
  g.position.set(x, 0, z);
  return g;
}

export function rock(x: number, z: number, s = 1): THREE.Group {
  const g = new THREE.Group();
  const a = block(0.6 * s, 0.4 * s, 0.5 * s, TILES.cobble());
  a.position.y = 0.2 * s;
  const b = block(0.35 * s, 0.3 * s, 0.35 * s, TILES.cobble());
  b.position.set(0.25 * s, 0.15 * s, 0.25 * s);
  g.add(a, b);
  g.position.set(x, 0, z);
  return g;
}
