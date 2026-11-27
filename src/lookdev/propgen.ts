// Prop renderer (dev tool): renders stylised 3D environment props — pines, round trees, bushes,
// rocks, stumps — with soft lighting and a baked contact shadow onto a transparent canvas, so the
// 2D game can use them as sprites that match the painted, 3D-rendered characters.
// Usage: propgen.html?prop=pine&seed=1  → window.__done = true when rendered.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const q = new URLSearchParams(location.search);
const prop = q.get("prop") ?? "pine";
let seed = Number(q.get("seed") ?? 1) * 9301 + 49297;
const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const SIZE = Number(q.get("size") ?? 512);
const tint = q.get("tint") ?? "summer";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(SIZE, SIZE);
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.2;
scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x2a4a20, 0.75));
const sun = new THREE.DirectionalLight(0xffe6c0, 2.9);
sun.position.set(-5, 9, 6); // top-left, in front — matches the game's light
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -6;
sun.shadow.camera.right = 6;
sun.shadow.camera.top = 6;
sun.shadow.camera.bottom = -6;
sun.shadow.radius = 6;
sun.shadow.bias = -0.0005;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xbfd8ff, 0.5);
fill.position.set(6, 3, 4);
scene.add(fill);

// Invisible ground that only shows the shadow.
const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.32 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const PAL: Record<string, { leaf: number[]; trunk: number; rock: number; moss: number }> = {
  summer: { leaf: [0x1d6a2a, 0x2a8a34, 0x3fa63e, 0x5cbe48], trunk: 0x5a3820, rock: 0x8a8c90, moss: 0x4a8a2a },
  marsh: { leaf: [0x2a5e44, 0x3a7652, 0x4e8c5e, 0x6aa070], trunk: 0x4e3c2a, rock: 0x7e8a84, moss: 0x4a7a5a },
  dry: { leaf: [0x6a7a34, 0x86923e, 0xa4a84e, 0xc0b864], trunk: 0x7a5a38, rock: 0xb0a48c, moss: 0x8a8a4a },
  night: { leaf: [0x1e4a3e, 0x2a5e4c, 0x3a745c, 0x4e8a6c], trunk: 0x3e3226, rock: 0x6e7680, moss: 0x3a5a4a },
  autumn: { leaf: [0x8a3a1e, 0xb8542a, 0xd8802e, 0xe8a83a], trunk: 0x5a3a24, rock: 0x9a8c80, moss: 0x7a6a3a },
};
const P = PAL[tint] ?? PAL.summer!;

const std = (color: number, rough = 0.85): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });

/** Displace a geometry's vertices with smooth pseudo-noise (keeps shapes organic, not CG-perfect). */
function lumpy(geo0: THREE.BufferGeometry, amt: number, freq = 2.2, smooth = true): THREE.BufferGeometry {
  // Weld vertices first so displaced shapes shade smoothly (no facets) unless flat is wanted.
  const geo = smooth ? mergeVertices(geo0.deleteAttribute("normal").deleteAttribute("uv")) : geo0;
  const p = geo.attributes.position as THREE.BufferAttribute;
  const ox = rnd() * 10, oy = rnd() * 10, oz = rnd() * 10;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * freq + ox) * Math.cos(v.y * freq * 1.3 + oy) * Math.sin(v.z * freq * 0.9 + oz);
    v.multiplyScalar(1 + n * amt);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Vertex colours: darker toward the bottom of each mass (fake ambient occlusion), lighter on top. */
function shadeByHeight(geo: THREE.BufferGeometry, color: number, lo = 0.6, hi = 1.12): THREE.BufferGeometry {
  const p = geo.attributes.position as THREE.BufferAttribute;
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const c = new THREE.Color(color);
  const cols: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - bb.min.y) / Math.max(1e-6, bb.max.y - bb.min.y);
    const k = lo + (hi - lo) * Math.pow(t, 0.8);
    cols.push(c.r * k, c.g * k, c.b * k);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  return geo;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const root = new THREE.Group();
scene.add(root);

function pine(): void {
  const h = 3.2 + rnd() * 0.8;
  const trunk = mesh(lumpy(new THREE.CylinderGeometry(0.16, 0.24, h * 0.45, 10, 3), 0.08), std(P.trunk));
  trunk.position.y = h * 0.22;
  root.add(trunk);
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const r = 1.35 * (1 - t * 0.62) * (0.92 + rnd() * 0.16);
    const ch = 1.25 * (1 - t * 0.25);
    const g = lumpy(new THREE.ConeGeometry(r, ch, 14, 4), 0.1, 3.2);
    // Droop the rim a little for a softer silhouette.
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) if (p.getY(k) < -ch * 0.4) p.setY(k, p.getY(k) - 0.08 * Math.random());
    g.computeVertexNormals();
    const col = P.leaf[Math.min(P.leaf.length - 1, i)]!;
    const m = mesh(shadeByHeight(g, col, 0.42, 1.15), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    m.position.y = h * 0.35 + i * h * 0.19 + ch * 0.4;
    m.rotation.y = rnd() * 6;
    root.add(m);
  }
}

function roundTree(): void {
  const h = 2.2 + rnd() * 0.6;
  const trunk = mesh(lumpy(new THREE.CylinderGeometry(0.18, 0.3, h, 10, 4), 0.1), std(P.trunk));
  trunk.position.y = h / 2;
  root.add(trunk);
  // Two short branches.
  for (const s of [-1, 1]) {
    const b = mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.9, 8), std(P.trunk));
    b.position.set(s * 0.3, h * 0.75, 0);
    b.rotation.z = -s * 0.8;
    root.add(b);
  }
  const blobs = 9 + Math.floor(rnd() * 4);
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + rnd();
    const rr = i === 0 ? 0 : 0.55 + rnd() * 0.45;
    const r = i === 0 ? 1.05 : 0.6 + rnd() * 0.35;
    const g = lumpy(new THREE.IcosahedronGeometry(r, 3), 0.12, 2.6);
    const col = P.leaf[1 + Math.floor(rnd() * 3)]!;
    const m = mesh(shadeByHeight(g, col, 0.45, 1.15), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
    m.position.set(Math.cos(a) * rr, h + 0.35 + (i === 0 ? 0.35 : rnd() * 0.6 - 0.1), Math.sin(a) * rr * 0.8);
    root.add(m);
  }
}

const leafMats: THREE.MeshStandardMaterial[] = [];
const leafMat = (i: number): THREE.MeshStandardMaterial =>
  (leafMats[i] ??= new THREE.MeshStandardMaterial({ color: P.leaf[i]!, roughness: 0.9, flatShading: true }));
function bush(): void {
  const blobs = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < blobs; i++) {
    const r = 0.45 + rnd() * 0.3;
    const g = lumpy(new THREE.IcosahedronGeometry(r, 3), 0.14, 3);
    const m = mesh(shadeByHeight(g, P.leaf[Math.floor(rnd() * 2)]!, 0.42, 1.0), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
    m.position.set((i - (blobs - 1) / 2) * 0.55 + (rnd() - 0.5) * 0.2, r * 0.8, (rnd() - 0.5) * 0.4);
    root.add(m);
    // Leaf clumps over the lit upper surface, in mixed tones, so it reads as foliage, not a ball.
    for (let k = 0; k < 46; k++) {
      const th = rnd() * Math.PI * 2, ph = Math.acos(1 - rnd() * 1.25); // upper ~60% of the sphere
      const nx = Math.sin(ph) * Math.cos(th), ny = Math.cos(ph), nz = Math.sin(ph) * Math.sin(th);
      const lr = 0.08 + rnd() * 0.07;
      const ci = Math.min(3, Math.floor(rnd() * 2.2 + ny * 1.6));
      const leaf = mesh(new THREE.IcosahedronGeometry(lr, 0), leafMat(ci));
      leaf.position.set(m.position.x + nx * r * 0.98, m.position.y + ny * r * 0.98, m.position.z + nz * r * 0.98);
      leaf.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      leaf.scale.set(1, 0.7, 1);
      root.add(leaf);
    }
  }
  // A few berries / flowers.
  if (rnd() > 0.4) {
    const bm = std(rnd() > 0.5 ? 0xe84a4a : 0xffffff, 0.5);
    for (let i = 0; i < 6; i++) {
      const b = mesh(new THREE.SphereGeometry(0.06, 8, 6), bm);
      b.position.set((rnd() - 0.5) * 1.4, 0.5 + rnd() * 0.4, 0.35 + rnd() * 0.2);
      root.add(b);
    }
  }
}

function rock(): void {
  const n = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const r = i === 0 ? 0.75 : 0.35 + rnd() * 0.25;
    const g = lumpy(new THREE.DodecahedronGeometry(r, 1), 0.16, 2.4, false);
    g.scale(1.2, 0.75, 1);
    const m = mesh(shadeByHeight(g, P.rock, 0.65, 1.15), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
    m.position.set(i === 0 ? 0 : (rnd() - 0.3) * 1.4, r * 0.55, i === 0 ? 0 : (rnd() - 0.2) * 0.6);
    m.rotation.y = rnd() * 6;
    root.add(m);
    if (i === 0 && rnd() > 0.35) {
      const moss = mesh(lumpy(new THREE.SphereGeometry(r * 0.75, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.35), 0.1), std(P.moss, 0.95));
      moss.position.copy(m.position).add(new THREE.Vector3(-0.08, r * 0.28, 0));
      moss.scale.set(1.15, 0.6, 0.95);
      root.add(moss);
    }
  }
}

function stump(): void {
  const s = mesh(lumpy(new THREE.CylinderGeometry(0.42, 0.52, 0.45, 14, 2), 0.06), std(P.trunk));
  s.position.y = 0.22;
  root.add(s);
  const top = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.02, 20), std(0xd8b080, 0.8));
  top.position.y = 0.46;
  root.add(top);
}

// ---- Wall pieces: one 60-world-unit segment = 6 scene units wide (x from -3 to 3). ----
function stake(x: number, h: number, r: number, col: number): void {
  const g = lumpy(new THREE.CylinderGeometry(r, r * 1.05, h, 10, 3), 0.04);
  const m = mesh(shadeByHeight(g, col, 0.7, 1.05), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  m.position.set(x, h / 2, 0);
  m.rotation.y = rnd() * 6;
  root.add(m);
  const tip = mesh(new THREE.ConeGeometry(r, r * 2.1, 10), std(0xc89a62, 0.8));
  tip.position.set(x, h + r * 1.05, 0);
  root.add(tip);
}
function palisade(missing: number, banded: boolean): void {
  const cols = [0x8a5a30, 0x7a4e2a, 0x946236];
  for (let k = 0; k < 6; k++) {
    if (k % 2 === 1 && (k - 1) / 2 < missing) continue;
    stake(-2.5 + k, 2.6 + (((k * 7) % 5) - 2) * 0.08, 0.46, cols[k % 3]!);
  }
  const beam = mesh(new THREE.BoxGeometry(6.1, 0.38, 0.3), std(0x5a3a1c, 0.8));
  beam.position.set(0, 1.4, 0.45);
  root.add(beam);
  if (banded) {
    const iron = new THREE.MeshStandardMaterial({ color: 0x4a4e58, metalness: 0.6, roughness: 0.4 });
    const rivet = new THREE.MeshStandardMaterial({ color: 0xd8dce4, metalness: 0.7, roughness: 0.3 });
    for (const y of [0.55, 2.0]) {
      const band = mesh(new THREE.BoxGeometry(6.1, 0.22, 0.12), iron);
      band.position.set(0, y, 0.5);
      root.add(band);
      for (let k = 0; k < 6; k++) {
        const rv = mesh(new THREE.SphereGeometry(0.07, 8, 6), rivet);
        rv.position.set(-2.5 + k, y, 0.58);
        root.add(rv);
      }
    }
  }
}
function stoneWall(reinforced: boolean): void {
  const rows = 4;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? 0.5 : 0;
    for (let k = -1; k < 7; k++) {
      const xa = Math.max(-3, -3 + k + off);
      const x1 = Math.min(3, -3 + k + off + 1);
      if (x1 - xa < 0.15) continue;
      const g = lumpy(new THREE.BoxGeometry(x1 - xa - 0.06, 0.62, 0.9, 2, 2, 2), 0.03, 4, false);
      const tone = [0x9a9890, 0xa29e96, 0x928e86][(k * 31 + r * 17) % 3]!;
      const m = mesh(g, new THREE.MeshStandardMaterial({ color: tone, roughness: 0.95 }));
      m.position.set((xa + x1) / 2, 0.31 + r * 0.64, 0);
      root.add(m);
    }
  }
  for (let k = 0; k < 3; k++) {
    const m = mesh(lumpy(new THREE.BoxGeometry(1.2, 0.7, 0.95, 2, 2, 2), 0.03, 4, false), std(reinforced ? 0xb0aca2 : 0xa29e94, 0.95));
    m.position.set(-2 + k * 2, rows * 0.64 + 0.35, 0);
    root.add(m);
  }
  if (reinforced) {
    const cap = mesh(new THREE.BoxGeometry(6.1, 0.18, 1.05), std(0xc8c4ba, 0.9));
    cap.position.set(0, rows * 0.64 + 0.02, 0);
    root.add(cap);
  }
}
function gate(stone: boolean, right = false): void {
  for (let k = 0; k < 4; k++) {
    const g = new THREE.BoxGeometry(1.46, 3.0, 0.4);
    const m = mesh(shadeByHeight(g, [0x8a5a30, 0x7a4e2a][k % 2]!, 0.65, 1.05), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    m.position.set(-2.25 + k * 1.5, 1.5, 0);
    root.add(m);
  }
  const iron = new THREE.MeshStandardMaterial({ color: 0x3a3e48, metalness: 0.6, roughness: 0.45 });
  const rivet = new THREE.MeshStandardMaterial({ color: 0xd8dce4, metalness: 0.7, roughness: 0.3 });
  for (const y of [0.7, 2.3]) {
    const band = mesh(new THREE.BoxGeometry(6.0, 0.3, 0.5), iron);
    band.position.set(0, y, 0.05);
    root.add(band);
    for (let k = 0; k < 8; k++) {
      const rv = mesh(new THREE.SphereGeometry(0.09, 8, 6), rivet);
      rv.position.set(-2.6 + k * 0.75, y, 0.3);
      root.add(rv);
    }
  }
  if (stone) {
    const p = mesh(lumpy(new THREE.BoxGeometry(1.0, 4.3, 1.2, 2, 4, 2), 0.03, 4, false), std(0xa8a49a, 0.95));
    p.position.set(right ? 2.55 : -2.55, 2.15, 0.1);
    root.add(p);
  }
}

// ---- Archer tower: back part (posts, braces, deck, back rail) and front part (deck face + front
// rail), rendered separately so archers can stand between them. Level 1-4 heights match the game
// (deck at (34 + 6*level) world units = 3.4 + 0.6*level scene units).
function tower(level: number, part: "back" | "front"): void {
  const deckY = 3.4 + 0.6 * level;
  const W = 2.9, D = 1.6;
  const wood = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
  const stone = level >= 3;
  if (part === "back") {
    if (stone) {
      const sh = deckY * 0.48;
      const g = lumpy(new THREE.BoxGeometry(W * 1.7, sh, D * 1.5, 3, 3, 2), 0.02, 4, false);
      const base = mesh(shadeByHeight(g, 0xa29e94, 0.7, 1.08), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
      base.position.set(0, sh / 2, 0);
      root.add(base);
      // Block seams.
      for (let r = 1; r < 4; r++) {
        const seam = mesh(new THREE.BoxGeometry(W * 1.72, 0.04, D * 1.52), std(0x6e6a62));
        seam.position.set(0, (sh / 4) * r, 0);
        root.add(seam);
      }
    }
    for (const [px, pz] of [[-W * 0.8, -D * 0.6], [W * 0.8, -D * 0.6], [-W * 0.8, D * 0.6], [W * 0.8, D * 0.6]] as const) {
      const p = mesh(lumpy(new THREE.CylinderGeometry(0.17, 0.22, deckY, 8, 3), 0.05), wood(0x6a4426));
      p.position.set(px, deckY / 2, pz);
      root.add(p);
    }
    if (!stone) {
      for (const k of [-1, 1]) {
        const br = mesh(new THREE.CylinderGeometry(0.08, 0.08, deckY * 1.05, 6), wood(0x4e3218));
        br.position.set(0, deckY * 0.45, D * 0.62);
        br.rotation.z = k * 0.62;
        root.add(br);
      }
    }
    const deck = mesh(new THREE.BoxGeometry(W * 2.1, 0.3, D * 1.7), wood(0xb07a44));
    deck.position.set(0, deckY, 0);
    root.add(deck);
    // Back rail with merlons.
    for (let i = -2; i <= 2; i++) {
      const m = mesh(new THREE.BoxGeometry(0.75, 0.55, 0.22), wood(0x8a5a30));
      m.position.set(i * 1.2, deckY + 0.42, -D * 0.78);
      root.add(m);
    }
  } else {
    const face = mesh(new THREE.BoxGeometry(W * 2.15, 1.05, 0.25), wood(0x9a6a38));
    face.position.set(0, deckY - 0.35, D * 0.86);
    root.add(face);
    for (let i = -2; i <= 2; i++) {
      const plank = mesh(new THREE.BoxGeometry(0.05, 1.0, 0.27), wood(0x5a3a1c));
      plank.position.set(i * 1.2 + 0.6, deckY - 0.35, D * 0.86);
      root.add(plank);
    }
    const rail = mesh(new THREE.BoxGeometry(W * 2.15, 0.3, 0.3), wood(0xc99558));
    rail.position.set(0, deckY + 0.55, D * 0.86);
    root.add(rail);
    for (const x of [-W, 0, W]) {
      const post = mesh(new THREE.BoxGeometry(0.22, 0.6, 0.22), wood(0x7a4e2a));
      post.position.set(x, deckY + 0.3, D * 0.86);
      root.add(post);
    }
    // Front face casts no shadow onto the (non-existent) ground here; hide the shadow catcher.
    ground.visible = false;
  }
}

// ---- Camp buildings (1 scene unit = 10 world units). ----
function gable(w: number, d: number, h: number, mat: THREE.Material, y: number): void {
  // Triangular-prism roof along x.
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2 - 0.25, 0);
  shape.lineTo(0, h);
  shape.lineTo(d / 2 + 0.25, 0);
  shape.lineTo(-d / 2 - 0.25, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: w + 0.5, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
  g.translate(0, 0, -(w + 0.5) / 2);
  const m = mesh(g, mat);
  m.rotation.y = Math.PI / 2;
  m.position.y = y;
  root.add(m);
}
function cabin(level = 1): void {
  const W = 6.4, D = 4.2, H = 2.6;
  const logC = [0x8a5a30, 0x7a4e2a, 0x946236];
  // Walls of stacked horizontal logs (front/back along x, sides along z).
  for (let r = 0; r < 6; r++) {
    const y = 0.24 + r * 0.44;
    for (const z of [-D / 2, D / 2]) {
      const g = lumpy(new THREE.CylinderGeometry(0.24, 0.24, W + 0.5, 10, 2), 0.03);
      const m = mesh(g, std(logC[(r + (z > 0 ? 1 : 0)) % 3]!, 0.85));
      m.rotation.z = Math.PI / 2;
      m.position.set(0, y, z);
      root.add(m);
      for (const ex of [-W / 2 - 0.25, W / 2 + 0.25]) {
        const end = mesh(new THREE.CircleGeometry(0.24, 12), std(0xd8b080, 0.8));
        end.position.set(ex, y, z);
        end.rotation.y = ex < 0 ? -Math.PI / 2 : Math.PI / 2;
        root.add(end);
      }
    }
    for (const x of [-W / 2, W / 2]) {
      const g = lumpy(new THREE.CylinderGeometry(0.23, 0.23, D, 10, 2), 0.03);
      const m = mesh(g, std(logC[(r + 2) % 3]!, 0.85));
      m.rotation.x = Math.PI / 2;
      m.position.set(x, y + 0.22, 0);
      root.add(m);
    }
  }
  gable(W, D, 1.9, std(0x6a4428, 0.95), H + 0.1);
  // Wooden shingle courses down both slopes, alternating tones, each overlapping the one below.
  const run = D / 2 + 0.25, rise = 1.9;
  const slope = Math.atan2(rise, run), len = Math.hypot(run, rise);
  const shingle = [0x7a4c2c, 0x6c4226, 0x845434];
  const N = 6;
  for (const side of [-1, 1])
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N;
      const g = lumpy(new THREE.BoxGeometry(W + 0.62, 0.09, len / N + 0.16, 12, 1, 1), 0.02, 4);
      const m = mesh(g, std(shingle[(i + (side > 0 ? 1 : 0)) % 3]!, 0.92));
      m.position.set(0, H + 0.1 + rise * (1 - t) + 0.07 + i * 0.012, side * run * t);
      m.rotation.x = side * slope;
      root.add(m);
    }
  const ridge = mesh(new THREE.CylinderGeometry(0.14, 0.14, W + 0.7, 10), std(0x5a3a22, 0.9));
  ridge.rotation.z = Math.PI / 2;
  ridge.position.y = H + 0.1 + rise + 0.1;
  root.add(ridge);
  // Stone chimney at the back.
  const ch = mesh(lumpy(new THREE.BoxGeometry(0.7, 1.4, 0.7, 3, 4, 3), 0.04), std(0x8a8680, 0.95));
  ch.position.set(-W / 2 + 1.1, H + 1.9, -0.7);
  root.add(ch);
  // Door.
  const door = mesh(new THREE.BoxGeometry(1.1, 1.7, 0.12), std(0x4a2e16, 0.8));
  door.position.set(0.6, 0.85, D / 2 + 0.22);
  root.add(door);
  // Woodpile beside.
  for (let r = 0; r < 3; r++)
    for (let k = 0; k < 4 - r; k++) {
      const lg = mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.6, 10), std(logC[(k + r) % 3]!, 0.85));
      lg.rotation.x = Math.PI / 2;
      lg.position.set(W / 2 + 1.0 + k * 0.42 + r * 0.21, 0.2 + r * 0.36, 1.2);
      root.add(lg);
      const end = mesh(new THREE.CircleGeometry(0.2, 12), std(0xd8b080, 0.8));
      end.position.set(lg.position.x, lg.position.y, 2.01);
      root.add(end);
    }
  // Chopping stump with an axe.
  const st = mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.6, 12), std(0x6a4426));
  st.position.set(-W / 2 - 1.0, 0.3, 1.6);
  root.add(st);
  const handle = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), std(0x8a6038));
  handle.position.set(-W / 2 - 0.9, 0.95, 1.6);
  handle.rotation.z = -0.5;
  root.add(handle);
  const head = mesh(new THREE.BoxGeometry(0.35, 0.22, 0.06), new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 0.7, roughness: 0.3 }));
  head.position.set(-W / 2 - 1.12, 0.62, 1.6);
  root.add(head);
  if (level >= 2) cabinExtras(level, W, D);
}
function tent(level = 1): void {
  const W = 5.4, D = 4.4, H = 3.4;
  // Canvas: a ridge tent made of two sloped planes with stripes (vertex colours).
  const seg = 12;
  const g = new THREE.BufferGeometry();
  const pos: number[] = [], col: number[] = [];
  const white = new THREE.Color(0xf2ece0), blue = new THREE.Color(0x3a6ad0);
  for (const side of [-1, 1]) {
    for (let i = 0; i < seg; i++) {
      const x0 = -W / 2 + (W * i) / seg, x1 = -W / 2 + (W * (i + 1)) / seg;
      const c = i % 3 === 1 ? blue : white;
      const p = [[x0, 0, (side * D) / 2], [x1, 0, (side * D) / 2], [x1, H, 0], [x0, 0, (side * D) / 2], [x1, H, 0], [x0, H, 0]];
      if (side < 0) p.reverse();
      for (const v of p) {
        pos.push(v[0]!, v[1]!, v[2]!);
        col.push(c.r, c.g, c.b);
      }
    }
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  root.add(mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide })));
  // End walls (triangles) with an open dark doorway on the front.
  for (const ex of [-W / 2, W / 2]) {
    const tri = new THREE.Shape();
    tri.moveTo(-D / 2, 0);
    tri.lineTo(0, H);
    tri.lineTo(D / 2, 0);
    tri.lineTo(-D / 2, 0);
    const m = mesh(new THREE.ShapeGeometry(tri), std(0xe8e0d0, 0.9));
    m.rotation.y = Math.PI / 2;
    m.position.x = ex;
    root.add(m);
  }
  // Open doorway on the front end wall (dark triangle, slightly proud of the canvas).
  const door = new THREE.Shape();
  door.moveTo(-0.85, 0);
  door.lineTo(0, 2.1);
  door.lineTo(0.85, 0);
  door.lineTo(-0.85, 0);
  const dm = mesh(new THREE.ShapeGeometry(door), std(0x2a1e14, 1));
  dm.rotation.y = Math.PI / 2;
  dm.position.set(W / 2 + 0.03, 0.01, 0);
  root.add(dm);
  // Ridge pole and flag.
  const pole = mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.8, 8), std(0x6a4426));
  pole.position.set(W / 2 - 0.2, H + 0.8, 0);
  root.add(pole);
  const flag = mesh(new THREE.PlaneGeometry(1.1, 0.6), new THREE.MeshStandardMaterial({ color: 0xf2c443, side: THREE.DoubleSide, roughness: 0.8 }));
  flag.position.set(W / 2 + 0.35, H + 1.45, 0);
  root.add(flag);
  // Weapon rack in front.
  for (let k = 0; k < 3; k++) {
    const sp = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6), std(0x8a6038));
    sp.position.set(-W / 2 + 0.8 + k * 0.35, 0.9, D / 2 + 0.7);
    sp.rotation.z = 0.12;
    root.add(sp);
    const tip = mesh(new THREE.ConeGeometry(0.08, 0.3, 6), new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 0.7, roughness: 0.3 }));
    tip.position.set(sp.position.x - 0.1, 1.9, sp.position.z);
    root.add(tip);
  }
  if (level >= 2) tentExtras(level, W, D, H);
}
function forge(level = 1): void {
  const W = 5.6, D = 4.0, H = 2.6;
  const g = lumpy(new THREE.BoxGeometry(W, H, D, 4, 3, 3), 0.015, 4, false);
  const walls = mesh(shadeByHeight(g, 0xa29c92, 0.75, 1.05), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  walls.position.y = H / 2;
  root.add(walls);
  for (let r = 1; r < 4; r++) {
    const seam = mesh(new THREE.BoxGeometry(W + 0.02, 0.04, D + 0.02), std(0x6e6a62));
    seam.position.y = (H / 4) * r;
    root.add(seam);
  }
  gable(W, D, 1.7, new THREE.MeshStandardMaterial({ color: 0xb8402e, roughness: 0.85 }), H);
  const chim = mesh(lumpy(new THREE.BoxGeometry(0.8, 2.4, 0.8, 2, 3, 2), 0.02, 4, false), std(0x8a847a, 0.95));
  chim.position.set(W / 2 - 1.1, H + 1.4, -0.6);
  root.add(chim);
  // Furnace mouth: glowing arch.
  const mouth = mesh(new THREE.BoxGeometry(1.4, 1.1, 0.1), new THREE.MeshStandardMaterial({ color: 0x2a1408, emissive: 0xff7a20, emissiveIntensity: 1.6 }));
  mouth.position.set(-1.2, 0.75, D / 2 + 0.02);
  root.add(mouth);
  // Anvil on a stump.
  const st = mesh(new THREE.CylinderGeometry(0.4, 0.46, 0.6, 12), std(0x6a4426));
  st.position.set(1.4, 0.3, D / 2 + 1.0);
  root.add(st);
  const anvil = mesh(new THREE.BoxGeometry(0.9, 0.35, 0.45), new THREE.MeshStandardMaterial({ color: 0x3a3e48, metalness: 0.7, roughness: 0.4 }));
  anvil.position.set(1.4, 0.78, D / 2 + 1.0);
  root.add(anvil);
  if (level >= 2) forgeExtras(W, D, H);
}

/** Catapult chassis: frame box on four spoked wheels and two A-frame uprights (arm drawn by the game). */
function catapultBody(level = 1): void {
  const wood = (c: number) => std(c, 0.85);
  const frame = mesh(new THREE.BoxGeometry(3.4, 0.5, 2.2), wood(0x7a4e2a));
  frame.position.y = 0.9;
  root.add(frame);
  for (const z of [-0.95, 0.95]) {
    const rail = mesh(new THREE.BoxGeometry(3.8, 0.28, 0.28), wood(0x5a3a1c));
    rail.position.set(0, 1.2, z);
    root.add(rail);
  }
  for (const [wx, wz] of [[-1.3, 1.25], [1.3, 1.25], [-1.3, -1.25], [1.3, -1.25]] as const) {
    const w = mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.22, 20), wood(0x5a3a1e));
    w.rotation.x = Math.PI / 2;
    w.position.set(wx, 0.62, wz);
    root.add(w);
    const rim = mesh(new THREE.TorusGeometry(0.6, 0.06, 6, 20), new THREE.MeshStandardMaterial({ color: 0x3a3e48, metalness: 0.6, roughness: 0.45 }));
    rim.position.copy(w.position);
    rim.position.z += wz > 0 ? 0.11 : -0.11;
    root.add(rim);
    for (let k = 0; k < 4; k++) {
      const sp = mesh(new THREE.BoxGeometry(1.05, 0.08, 0.06), wood(0x8a5a2e));
      sp.position.copy(rim.position);
      sp.rotation.z = (k * Math.PI) / 4;
      root.add(sp);
    }
  }
  for (const x of [-0.75, 0.75]) {
    for (const k of [-1, 1]) {
      const up = mesh(new THREE.BoxGeometry(0.28, 2.1, 0.28), wood(0x9a6a36));
      up.position.set(x, 2.0, k * 0.55);
      up.rotation.x = -k * 0.25;
      root.add(up);
    }
  }
  const axle = mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.8, 10), wood(0xc8b080));
  axle.rotation.x = Math.PI / 2;
  axle.position.set(0, 2.9, 0);
  root.add(axle);
  if (level >= 2) catapultExtras(level);
}

const IRON = (): THREE.Material => new THREE.MeshStandardMaterial({ color: 0x3a3e48, metalness: 0.65, roughness: 0.4 });
const GOLD = (): THREE.Material => new THREE.MeshStandardMaterial({ color: 0xf2c443, metalness: 0.8, roughness: 0.3, emissive: 0x5a3a00, emissiveIntensity: 0.3 });
const FLAME = (c: number, e: number, k = 1.8): THREE.Material => new THREE.MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: k, roughness: 0.6 });

/** Per-level catapult upgrades: iron-shod frame (2), stone ammo + reinforced uprights (3), Firestorm brazier and banner (4). */
function catapultExtras(level: number): void {
  // L2: iron bands across the frame and a pile of round shot.
  for (const x of [-1.55, -0.5, 0.5, 1.55]) {
    const band = mesh(new THREE.BoxGeometry(0.16, 0.6, 2.3), IRON());
    band.position.set(x, 0.9, 0);
    root.add(band);
  }
  const stone = (r: number, x: number, y: number, z: number): void => {
    const m = mesh(lumpy(new THREE.IcosahedronGeometry(r, 2), 0.06), std(0x8e8a84, 0.95));
    m.position.set(x, y, z);
    root.add(m);
  };
  const sx = 2.5, sz = 0.7;
  for (const [dx, dz] of [[0, 0], [0.62, 0], [0.31, 0.55], [0.31, -0.55]] as const) stone(0.32, sx + dx, 0.32, sz + dz);
  stone(0.32, sx + 0.31, 0.82, sz);
  if (level < 3) return;
  // L3: a wicker-and-plank mantlet shield in front, iron-plated uprights and a blue pennant.
  for (const x of [-0.75, 0.75])
    for (const k of [-1, 1]) {
      const plate = mesh(new THREE.BoxGeometry(0.36, 0.5, 0.36), IRON());
      plate.position.set(x, 1.4, k * 0.6);
      root.add(plate);
    }
  for (let k = 0; k < 5; k++) {
    const plank = mesh(new THREE.BoxGeometry(0.42, 1.3, 0.12), std(k % 2 ? 0x8a5a30 : 0x7a4e2a, 0.85));
    plank.position.set(-0.9 + k * 0.45, 0.65, 1.95);
    plank.rotation.x = -0.18;
    root.add(plank);
  }
  const strap = mesh(new THREE.BoxGeometry(2.3, 0.12, 0.14), IRON());
  strap.position.set(0, 0.95, 1.92);
  strap.rotation.x = -0.18;
  root.add(strap);
  if (level < 4) return;
  // L4 (Firestorm): an iron fire-brazier with roaring flames and a red war banner.
  const bx = -2.5, bz = 0.8;
  const bowl = mesh(new THREE.CylinderGeometry(0.6, 0.34, 0.55, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a3e48, metalness: 0.6, roughness: 0.45, side: THREE.DoubleSide }));
  bowl.position.set(bx, 1.15, bz);
  root.add(bowl);
  for (const a of [0, 2.1, 4.2]) {
    const leg = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), IRON());
    leg.position.set(bx + Math.cos(a) * 0.32, 0.5, bz + Math.sin(a) * 0.32);
    root.add(leg);
  }
  const coals = mesh(new THREE.CircleGeometry(0.55, 14), FLAME(0x501008, 0xff5a10, 1.6));
  coals.rotation.x = -Math.PI / 2;
  coals.position.set(bx, 1.34, bz);
  root.add(coals);
  for (const [dx, dz, h] of [[0, 0, 1.1], [0.24, 0.14, 0.7], [-0.22, -0.12, 0.8], [0.1, -0.24, 0.6]] as const) {
    const f = mesh(new THREE.ConeGeometry(0.22, h, 8), FLAME(0xffb030, 0xff7a10, 2.2));
    f.position.set(bx + dx, 1.34 + h / 2, bz + dz);
    root.add(f);
  }
  const pole = mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 8), std(0x5a3a1c));
  pole.position.set(1.7, 2.7, -0.95);
  root.add(pole);
  const banner = mesh(new THREE.PlaneGeometry(0.9, 1.3), new THREE.MeshStandardMaterial({ color: 0xc8301e, side: THREE.DoubleSide, roughness: 0.8 }));
  banner.position.set(2.17, 3.7, -0.95);
  root.add(banner);
  const mark = mesh(new THREE.CircleGeometry(0.24, 12), GOLD());
  mark.position.set(2.17, 3.75, -0.93);
  root.add(mark);
}

/** Per-level barracks: a second tent (2), shield rack + banner (3), gold trim and standard for Veterans (4). */
function tentExtras(level: number, W: number, D: number, H: number): void {
  // L2: a smaller sleeping tent behind (extruded triangular prism) and a training dummy.
  const tri = new THREE.Shape();
  const sd = D * 0.62, sh = H * 0.62;
  tri.moveTo(-sd / 2, 0);
  tri.lineTo(0, sh);
  tri.lineTo(sd / 2, 0);
  tri.lineTo(-sd / 2, 0);
  const prism = new THREE.ExtrudeGeometry(tri, { depth: W * 0.6, bevelEnabled: false });
  const back = mesh(prism, std(0xe2dac8, 0.9));
  back.rotation.y = Math.PI / 2;
  back.position.set(-W * 0.45, 0, -D * 0.85);
  root.add(back);
  const dummyPost = mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 8), std(0x6a4426));
  dummyPost.position.set(W / 2 + 1.1, 0.9, -1.0);
  root.add(dummyPost);
  const sack = mesh(lumpy(new THREE.CylinderGeometry(0.32, 0.36, 0.9, 10, 2), 0.05), std(0xc8a870, 0.95));
  sack.position.set(W / 2 + 1.1, 1.5, -1.0);
  root.add(sack);
  const arm = mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), std(0x6a4426));
  arm.rotation.x = Math.PI / 2;
  arm.position.set(W / 2 + 1.1, 1.55, -1.0);
  root.add(arm);
  if (level < 3) return;
  // L3: round shields on a rack and a blue banner.
  for (let k = 0; k < 3; k++) {
    const sh = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 16), std(k === 1 ? 0x3a6ad0 : 0xa03a2a, 0.7));
    sh.rotation.z = Math.PI / 2;
    sh.rotation.y = Math.PI / 2;
    sh.position.set(-W / 2 + 2.3 + k * 0.95, 0.75, D / 2 + 0.75);
    root.add(sh);
    const boss = mesh(new THREE.SphereGeometry(0.12, 10, 6), IRON());
    boss.position.set(sh.position.x, 0.75, D / 2 + 0.82);
    root.add(boss);
  }
  const bp = mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.6, 8), std(0x5a3a1c));
  bp.position.set(-W / 2 - 0.5, 1.8, D / 2 - 0.3);
  root.add(bp);
  const ban = mesh(new THREE.PlaneGeometry(0.9, 1.4), new THREE.MeshStandardMaterial({ color: 0x3a6ad0, side: THREE.DoubleSide, roughness: 0.8 }));
  ban.position.set(-W / 2 - 0.5, 2.7, D / 2 - 0.3 + 0.48);
  ban.rotation.y = Math.PI / 2;
  root.add(ban);
  if (level < 4) return;
  // L4 (Veterans): gilded ridge, gold edge trim and a crowned gold standard.
  const ridge = mesh(new THREE.CylinderGeometry(0.1, 0.1, W + 0.3, 10), GOLD());
  ridge.rotation.z = Math.PI / 2;
  ridge.position.y = H + 0.04;
  root.add(ridge);
  for (const side of [-1, 1]) {
    const hem = mesh(new THREE.BoxGeometry(W + 0.1, 0.14, 0.08), GOLD());
    hem.position.set(0, 0.12, (side * D) / 2 + side * 0.02);
    root.add(hem);
  }
  for (const ex of [-W / 2, W / 2])
    for (const side of [-1, 1]) {
      const len = Math.hypot(D / 2, H);
      const edge = mesh(new THREE.BoxGeometry(0.1, len, 0.1), GOLD());
      edge.position.set(ex, H / 2, (side * D) / 4);
      edge.rotation.x = -side * Math.atan2(D / 2, H);
      root.add(edge);
    }
  const crown = mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.26, 5, 1, true), new THREE.MeshStandardMaterial({ color: 0xf2c443, metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide }));
  crown.position.set(-W / 2 - 0.5, 3.75, D / 2 - 0.3);
  root.add(crown);
}

/** Per-level lumber camp: sawhorse and a second woodpile (2), lean-to shed with a handcart (3). */
function cabinExtras(level: number, W: number, D: number): void {
  const logC = [0x8a5a30, 0x7a4e2a, 0x946236];
  const log = (x: number, y: number, z: number, len: number, along: "x" | "z", c: number): void => {
    const lg = mesh(new THREE.CylinderGeometry(0.2, 0.2, len, 10), std(logC[c % 3]!, 0.85));
    if (along === "x") lg.rotation.z = Math.PI / 2;
    else lg.rotation.x = Math.PI / 2;
    lg.position.set(x, y, z);
    root.add(lg);
  };
  // L2: a sawhorse with a half-cut log out front, and a tall second stack at the front-left corner.
  const hx = -1.6, hz = D / 2 + 1.5;
  for (const dx of [-0.6, 0.6])
    for (const k of [-1, 1]) {
      const leg = mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), std(0x6a4426));
      leg.position.set(hx + dx, 0.45, hz + k * 0.18);
      leg.rotation.x = k * 0.35;
      root.add(leg);
    }
  log(hx, 0.98, hz, 2.2, "x", 1);
  const saw = mesh(new THREE.BoxGeometry(0.9, 0.22, 0.03), new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 0.7, roughness: 0.3 }));
  saw.position.set(hx + 0.3, 1.3, hz);
  saw.rotation.z = 0.5;
  root.add(saw);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 4 - r; k++) log(-W / 2 + 0.4 + k * 0.42 + r * 0.21, 0.2 + r * 0.36, D / 2 + 0.6, 1.0, "z", k + r + 1);
  if (level < 3) return;
  // L3: a lean-to shed against the right gable end, full of split logs, and a loaded handcart.
  const lx = W / 2 + 0.3, depth = 1.8;
  for (const z of [-D / 2 + 0.2, 0.1]) {
    const p = mesh(new THREE.BoxGeometry(0.18, 1.7, 0.18), std(0x6a4426));
    p.position.set(lx + depth, 0.85, z);
    root.add(p);
  }
  const roof = mesh(new THREE.BoxGeometry(depth + 0.5, 0.1, D / 2 + 0.6), std(0x6c4226, 0.92));
  roof.position.set(lx + depth / 2, 1.95, -D / 4 - 0.05);
  roof.rotation.z = -0.3;
  root.add(roof);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 5; k++) log(lx + 0.3 + k * 0.32, 0.2 + r * 0.36, -D / 4, D / 2 - 0.2, "z", k + r);
  const cx = 1.9, cz = D / 2 + 1.7;
  const bed = mesh(new THREE.BoxGeometry(1.7, 0.45, 1.0), std(0x7a4e2a));
  bed.position.set(cx, 0.75, cz);
  root.add(bed);
  for (const k of [-1, 1]) {
    const wheel = mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.12, 16), std(0x5a3a1e));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(cx, 0.48, cz + k * 0.58);
    root.add(wheel);
  }
  for (const k of [-1, 1]) {
    const shaft = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6), std(0x6a4426));
    shaft.rotation.z = Math.PI / 2 - 0.25;
    shaft.position.set(cx - 1.4, 0.65, cz + k * 0.35);
    root.add(shaft);
  }
  for (let r = 0; r < 2; r++) for (let k = 0; k < 3 - r; k++) log(cx, 1.15 + r * 0.36, cz - 0.3 + k * 0.3 + r * 0.15, 1.6, "x", k + r);
}

/** Forge level 2: a second, roaring chimney, bellows, a weapon rack and quench barrel. */
function forgeExtras(W: number, D: number, H: number): void {
  const chim = mesh(lumpy(new THREE.BoxGeometry(0.7, 2.0, 0.7, 2, 3, 2), 0.02, 4, false), std(0x7a746a, 0.95));
  chim.position.set(-W / 2 + 1.0, H + 1.2, 0.5);
  root.add(chim);
  const glow = mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), FLAME(0x401008, 0xff6a10, 2.2));
  glow.position.set(-W / 2 + 1.0, H + 2.22, 0.5);
  root.add(glow);
  for (const [dx, h] of [[0, 0.8], [0.15, 0.5], [-0.14, 0.55]] as const) {
    const f = mesh(new THREE.ConeGeometry(0.18, h, 8), FLAME(0xffb030, 0xff7a10, 2.2));
    f.position.set(-W / 2 + 1.0 + dx, H + 2.26 + h / 2, 0.5);
    root.add(f);
  }
  const mouth2 = mesh(new THREE.BoxGeometry(1.0, 0.8, 0.1), FLAME(0x2a1408, 0xff8a30, 1.8));
  mouth2.position.set(0.6, 0.6, D / 2 + 0.02);
  root.add(mouth2);
  // Bellows: leather wedge on a frame beside the furnace.
  const bel = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 3), std(0x6a3a1e, 0.8));
  bel.rotation.x = Math.PI / 2;
  bel.position.set(-W / 2 - 0.6, 0.7, D / 2 - 0.4);
  root.add(bel);
  // Weapon rack with swords along the side.
  const rail = mesh(new THREE.BoxGeometry(0.12, 0.12, 2.0), std(0x6a4426));
  rail.position.set(W / 2 + 0.6, 1.4, 0.4);
  root.add(rail);
  for (let k = 0; k < 4; k++) {
    const blade = mesh(new THREE.BoxGeometry(0.05, 1.3, 0.14), new THREE.MeshStandardMaterial({ color: 0xd8dce4, metalness: 0.8, roughness: 0.25 }));
    blade.position.set(W / 2 + 0.66, 0.8, -0.4 + k * 0.5);
    root.add(blade);
    const guard = mesh(new THREE.BoxGeometry(0.08, 0.06, 0.4), GOLD());
    guard.position.set(W / 2 + 0.66, 1.48, -0.4 + k * 0.5);
    root.add(guard);
  }
  // Quench barrel.
  const barrel = mesh(new THREE.CylinderGeometry(0.42, 0.38, 0.9, 14), std(0x7a4e2a));
  barrel.position.set(2.5, 0.45, D / 2 + 0.9);
  root.add(barrel);
  for (const y of [0.15, 0.75]) {
    const hoop = mesh(new THREE.TorusGeometry(0.42, 0.03, 6, 16), IRON());
    hoop.rotation.x = Math.PI / 2;
    hoop.position.set(2.5, y, D / 2 + 0.9);
    root.add(hoop);
  }
}

/** Enemy battering ram: covered wagon (red horde hide roof) with an iron-capped log pointing at the camera. */
function ram(part: "body" | "log"): void {
  const wood = (c: number) => std(c, 0.85);
  if (part === "log") {
    const log = mesh(lumpy(new THREE.CylinderGeometry(0.42, 0.46, 4.4, 14, 3), 0.04), wood(0x7a5230));
    log.rotation.x = Math.PI / 2;
    log.position.set(0, 1.3, 0.6);
    root.add(log);
    const cap = mesh(new THREE.SphereGeometry(0.52, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4a4e58, metalness: 0.7, roughness: 0.35 }));
    cap.rotation.x = Math.PI / 2;
    cap.position.set(0, 1.3, 2.8);
    root.add(cap);
    for (const z of [1.6, 2.4]) {
      const band = mesh(new THREE.TorusGeometry(0.46, 0.06, 6, 16), new THREE.MeshStandardMaterial({ color: 0x4a4e58, metalness: 0.7, roughness: 0.4 }));
      band.position.set(0, 1.3, z);
      root.add(band);
    }
    ground.visible = false;
    return;
  }
  const bed = mesh(new THREE.BoxGeometry(2.6, 0.4, 4.0), wood(0x5a3a1c));
  bed.position.y = 0.75;
  root.add(bed);
  for (const [wx, wz] of [[-1.35, 1.3], [1.35, 1.3], [-1.35, -1.3], [1.35, -1.3]] as const) {
    const w = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.24, 18), wood(0x4a2e18));
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.55, wz);
    root.add(w);
  }
  for (const [px, pz] of [[-1.1, 1.7], [1.1, 1.7], [-1.1, -1.7], [1.1, -1.7]] as const) {
    const post = mesh(new THREE.BoxGeometry(0.22, 2.0, 0.22), wood(0x6a4426));
    post.position.set(px, 1.9, pz);
    root.add(post);
  }
  // Hide roof: two red sloped panels with dark stripes.
  for (const s of [-1, 1]) {
    const roof = mesh(new THREE.BoxGeometry(1.75, 0.12, 4.4), std(0xa8302a, 0.9));
    roof.position.set(s * 0.72, 3.15, 0);
    roof.rotation.z = -s * 0.62;
    root.add(roof);
    for (const z of [-1.4, 0, 1.4]) {
      const st = mesh(new THREE.BoxGeometry(1.78, 0.14, 0.18), std(0x5a1a14, 0.9));
      st.position.set(s * 0.72, 3.16, z);
      st.rotation.z = -s * 0.62;
      root.add(st);
    }
  }
  const ridge = mesh(new THREE.CylinderGeometry(0.1, 0.1, 4.6, 8), wood(0x5a3a1c));
  ridge.rotation.x = Math.PI / 2;
  ridge.position.y = 3.65;
  root.add(ridge);
}

/** Bat: fuzzy body with ears and glowing eyes; one wing (right) rendered separately for flapping. */
function bat(part: "body" | "wing"): void {
  ground.visible = false;
  if (part === "body") {
    const fur = new THREE.MeshStandardMaterial({ color: 0x4a3458, roughness: 0.95 });
    const b = mesh(lumpy(new THREE.SphereGeometry(0.7, 20, 14), 0.06, 5), fur);
    b.scale.set(1, 1.15, 0.9);
    b.position.y = 2;
    root.add(b);
    const h = mesh(lumpy(new THREE.SphereGeometry(0.55, 18, 12), 0.04, 5), fur);
    h.position.set(0, 2.95, 0.15);
    root.add(h);
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.ConeGeometry(0.2, 0.55, 8), fur);
      ear.position.set(s * 0.3, 3.5, 0.05);
      ear.rotation.z = -s * 0.3;
      root.add(ear);
      const eye = mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffd040, emissive: 0xff8a00, emissiveIntensity: 1.4 }));
      eye.position.set(s * 0.2, 3.0, 0.62);
      root.add(eye);
      const fang = mesh(new THREE.ConeGeometry(0.05, 0.16, 6), std(0xf6eedc, 0.5));
      fang.position.set(s * 0.1, 2.68, 0.6);
      fang.rotation.x = Math.PI;
      root.add(fang);
    }
    return;
  }
  // Membrane wing: a scalloped fan shape with finger bones.
  const sh = new THREE.Shape();
  sh.moveTo(0, 0.2);
  sh.lineTo(2.6, 1.1);
  sh.quadraticCurveTo(2.2, 0.2, 2.6, -0.6);
  sh.quadraticCurveTo(1.8, -0.4, 1.7, -1.0);
  sh.quadraticCurveTo(1.0, -0.6, 0.8, -1.1);
  sh.quadraticCurveTo(0.4, -0.4, 0, -0.4);
  sh.lineTo(0, 0.2);
  const w = mesh(new THREE.ShapeGeometry(sh, 16), new THREE.MeshStandardMaterial({ color: 0x5e3a6e, roughness: 0.8, side: THREE.DoubleSide }));
  w.position.set(0, 2.2, 0);
  root.add(w);
  for (const [x, y] of [[2.6, 1.1], [2.6, -0.6], [1.7, -1.0], [0.8, -1.1]] as const) {
    const len = Math.hypot(x, y - 0.1);
    const bone = mesh(new THREE.CylinderGeometry(0.035, 0.05, len, 6), std(0x2e1e38, 0.8));
    bone.position.set(x / 2, 2.2 + (y + 0.1) / 2, 0.02);
    bone.rotation.z = -Math.atan2(x, y - 0.1);
    root.add(bone);
  }
}

/** Bone Dragon: skeletal body (skull, ribcage, spine, tail) seen from the front-above; one wing separately. */
function dragon(part: "body" | "wing"): void {
  ground.visible = false;
  const bone = new THREE.MeshStandardMaterial({ color: 0xe6dcc4, roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2030, roughness: 0.9 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x60ffd0, emissive: 0x20ffb0, emissiveIntensity: 1.8 });
  if (part === "body") {
    // Spine + tail curving back (away from camera = -z, which reads as up the screen).
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      const v = mesh(new THREE.SphereGeometry(0.34 * (1 - t * 0.7), 12, 10), bone);
      v.position.set(Math.sin(t * 3) * 0.6 * t, 2.2 - t * 0.5, -0.6 - t * 3.6);
      root.add(v);
    }
    // Ribcage with dark core glowing green inside.
    const core = mesh(new THREE.SphereGeometry(0.75, 16, 12), dark);
    core.position.set(0, 2.1, 0.2);
    core.scale.set(1, 0.8, 1.3);
    root.add(core);
    const heart = mesh(new THREE.SphereGeometry(0.3, 12, 10), glow);
    heart.position.set(0, 2.15, 0.35);
    root.add(heart);
    for (let k = 0; k < 5; k++) {
      const rib = mesh(new THREE.TorusGeometry(0.85 - k * 0.06, 0.07, 6, 18, Math.PI * 1.25), bone);
      rib.position.set(0, 2.1, 0.9 - k * 0.38);
      rib.rotation.set(Math.PI / 2, 0, Math.PI * 1.375);
      root.add(rib);
    }
    // Neck + horned skull pointing at the camera.
    for (let i = 0; i < 4; i++) {
      const n = mesh(new THREE.SphereGeometry(0.26, 10, 8), bone);
      n.position.set(0, 2.35 + i * 0.12, 1.2 + i * 0.38);
      root.add(n);
    }
    const skull = mesh(lumpy(new THREE.BoxGeometry(0.9, 0.6, 1.3, 3, 3, 3), 0.06, 3), bone);
    skull.position.set(0, 2.85, 2.9);
    root.add(skull);
    const jaw = mesh(new THREE.BoxGeometry(0.7, 0.18, 1.0), bone);
    jaw.position.set(0, 2.45, 3.0);
    jaw.rotation.x = 0.25;
    root.add(jaw);
    for (const s of [-1, 1]) {
      const eye = mesh(new THREE.SphereGeometry(0.12, 10, 8), glow);
      eye.position.set(s * 0.26, 3.0, 3.45);
      root.add(eye);
      const horn = mesh(new THREE.ConeGeometry(0.12, 0.9, 8), bone);
      horn.position.set(s * 0.35, 3.35, 2.5);
      horn.rotation.set(-0.9, 0, -s * 0.4);
      root.add(horn);
    }
    return;
  }
  // Bony wing: arm bones radiating from the root with torn dark membrane between.
  const tips: [number, number][] = [[3.6, 1.6], [4.2, 0.2], [3.4, -1.2], [2.0, -1.6]];
  const sh = new THREE.Shape();
  sh.moveTo(0, 0.2);
  for (const [x, y] of tips) sh.lineTo(x, y);
  sh.quadraticCurveTo(1.0, -1.0, 0, -0.3);
  sh.lineTo(0, 0.2);
  const mem = mesh(new THREE.ShapeGeometry(sh, 12), new THREE.MeshStandardMaterial({ color: 0x3e3448, roughness: 0.85, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }));
  mem.position.set(0, 2.3, 0);
  root.add(mem);
  for (const [x, y] of tips) {
    const len = Math.hypot(x, y - 0.1);
    const b = mesh(new THREE.CylinderGeometry(0.06, 0.1, len, 6), bone);
    b.position.set(x / 2, 2.3 + (y + 0.1) / 2, 0.03);
    b.rotation.z = -Math.atan2(x, y - 0.1);
    root.add(b);
    const claw = mesh(new THREE.ConeGeometry(0.08, 0.3, 6), bone);
    claw.position.set(x, 2.3 + y, 0.03);
    claw.rotation.z = -Math.atan2(x, y - 0.1);
    root.add(claw);
  }
}

// ---- Chapter decorations. ----
function pond(): void {
  const water = mesh(new THREE.CircleGeometry(1.6, 32), new THREE.MeshStandardMaterial({ color: 0x3a7a8a, roughness: 0.15, metalness: 0.2 }));
  water.rotation.x = -Math.PI / 2;
  water.scale.set(1.4, 0.8, 1);
  water.position.y = 0.03;
  root.add(water);
  const bank = mesh(new THREE.TorusGeometry(1.6, 0.18, 6, 32), std(0x6a5a3a, 0.95));
  bank.rotation.x = Math.PI / 2;
  bank.scale.set(1.4, 0.8, 0.4);
  root.add(bank);
  for (let i = 0; i < 4; i++) {
    const pad = mesh(new THREE.CircleGeometry(0.28, 14, 0.4, Math.PI * 2 - 0.5), std(0x4e9a3a, 0.7));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set((rnd() - 0.5) * 2.6, 0.05, (rnd() - 0.5) * 1.2);
    root.add(pad);
  }
  const flower = mesh(new THREE.SphereGeometry(0.1, 8, 6), std(0xffa0c0, 0.5));
  flower.position.set(0.5, 0.1, 0.2);
  root.add(flower);
  for (let i = 0; i < 9; i++) {
    const h = 0.9 + rnd() * 0.7;
    const reed = mesh(new THREE.CylinderGeometry(0.025, 0.04, h, 5), std(0x5a8a3a, 0.9));
    reed.position.set(-2.0 + rnd() * 0.6, h / 2, -0.6 + rnd() * 0.8);
    reed.rotation.z = (rnd() - 0.5) * 0.3;
    root.add(reed);
    if (i % 3 === 0) {
      const cat = mesh(new THREE.CapsuleGeometry(0.06, 0.2, 4, 6), std(0x6a4426, 0.9));
      cat.position.set(reed.position.x, h, reed.position.z);
      root.add(cat);
    }
  }
}
function crates(): void {
  const wood = std(0x9a6a38, 0.85);
  const c1 = mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), wood);
  c1.position.set(0, 0.5, 0);
  c1.rotation.y = 0.3;
  root.add(c1);
  const c2 = mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), std(0x8a5a30, 0.85));
  c2.position.set(0.15, 1.4, 0.05);
  c2.rotation.y = -0.2;
  root.add(c2);
  for (const c of [c1, c2]) {
    const band = mesh(new THREE.BoxGeometry(1.02, 0.1, 1.02), std(0x5a3a1c));
    band.scale.setScalar(c === c1 ? 1 : 0.8);
    band.position.copy(c.position);
    band.rotation.copy(c.rotation);
    root.add(band);
  }
  const barrel = mesh(lumpy(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 16, 3), 0.03), std(0x7a4e2a, 0.8));
  barrel.position.set(1.1, 0.55, 0.3);
  root.add(barrel);
  for (const y of [0.2, 0.9]) {
    const hoop = mesh(new THREE.TorusGeometry(0.43, 0.035, 6, 20), new THREE.MeshStandardMaterial({ color: 0x4a4e58, metalness: 0.6, roughness: 0.4 }));
    hoop.rotation.x = Math.PI / 2;
    hoop.position.set(1.1, y, 0.3);
    root.add(hoop);
  }
}
function wheel(): void {
  const w = mesh(new THREE.TorusGeometry(0.75, 0.09, 8, 24), std(0x6a4426, 0.85));
  w.rotation.x = -Math.PI / 2 + 0.25;
  w.position.y = 0.12;
  root.add(w);
  for (let k = 0; k < 4; k++) {
    const sp = mesh(new THREE.BoxGeometry(1.4, 0.06, 0.08), std(0x8a5a2e));
    sp.rotation.set(-Math.PI / 2 + 0.25, 0, (k * Math.PI) / 4);
    sp.position.y = 0.12;
    root.add(sp);
  }
  const hub = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.18, 10), std(0x4a2e18));
  hub.position.y = 0.14;
  root.add(hub);
  const plank = mesh(new THREE.BoxGeometry(1.6, 0.12, 0.35), std(0x8a5a30));
  plank.position.set(0.6, 0.06, 0.7);
  plank.rotation.y = 0.5;
  root.add(plank);
}
function gravestone(): void {
  const stone = new THREE.MeshStandardMaterial({ color: 0x8a8c94, roughness: 0.95, flatShading: true });
  const sh = new THREE.Shape();
  sh.moveTo(-0.45, 0);
  sh.lineTo(-0.45, 0.9);
  sh.absarc(0, 0.9, 0.45, Math.PI, 0, true);
  sh.lineTo(0.45, 0);
  sh.lineTo(-0.45, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.22, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 });
  const m = mesh(g, stone);
  m.rotation.set(-0.08, rnd() - 0.5, (rnd() - 0.5) * 0.2);
  root.add(m);
  const cross = mesh(new THREE.BoxGeometry(0.08, 0.4, 0.04), std(0x5a5c64));
  cross.position.set(0, 0.95, 0.26);
  root.add(cross);
  const arm = mesh(new THREE.BoxGeometry(0.26, 0.08, 0.04), std(0x5a5c64));
  arm.position.set(0, 1.03, 0.26);
  root.add(arm);
  const mound = mesh(new THREE.SphereGeometry(0.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), std(0x3a4a34, 0.95));
  mound.scale.set(0.9, 0.25, 1.4);
  mound.position.set(0, 0, 0.9);
  root.add(mound);
}
function deadTree(): void {
  const bark = std(0x3e3028, 0.95);
  const trunk = mesh(lumpy(new THREE.CylinderGeometry(0.14, 0.26, 2.6, 8, 4), 0.08), bark);
  trunk.position.y = 1.3;
  trunk.rotation.z = 0.08;
  root.add(trunk);
  for (const [y, a, l] of [[1.6, 0.9, 1.1], [2.0, -0.8, 0.9], [2.4, 0.5, 0.7], [1.2, -1.1, 0.6]] as const) {
    const b = mesh(new THREE.CylinderGeometry(0.03, 0.08, l, 6), bark);
    b.position.set(Math.sin(a) * l * 0.45, y + Math.cos(a) * l * 0.3, 0);
    b.rotation.z = -a;
    root.add(b);
  }
}
function burntStump(): void {
  const s = mesh(lumpy(new THREE.CylinderGeometry(0.4, 0.55, 0.7, 10, 3), 0.1), std(0x2a2220, 0.95));
  s.position.y = 0.35;
  root.add(s);
  const ember = mesh(new THREE.CircleGeometry(0.34, 12), new THREE.MeshStandardMaterial({ color: 0x401008, emissive: 0xff5a10, emissiveIntensity: 1.3 }));
  ember.rotation.x = -Math.PI / 2;
  ember.position.y = 0.71;
  root.add(ember);
  const ash = mesh(new THREE.CircleGeometry(1.0, 20), std(0x3a3230, 1));
  ash.rotation.x = -Math.PI / 2;
  ash.scale.set(1.3, 0.8, 1);
  ash.position.y = 0.02;
  root.add(ash);
}
function crystal(): void {
  const mat = new THREE.MeshStandardMaterial({ color: 0xa070e0, emissive: 0x6020c0, emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.1, flatShading: true });
  for (const [x, z, h, t] of [[0, 0, 1.6, 0], [0.4, 0.2, 1.0, 0.4], [-0.35, 0.15, 0.8, -0.5]] as const) {
    const c = mesh(new THREE.OctahedronGeometry(0.3, 0), mat);
    c.scale.set(1, h / 0.6, 1);
    c.position.set(x, h / 2, z);
    c.rotation.z = t;
    root.add(c);
  }
}

/** A small barrel with iron hoops (plaza / camp clutter). */
function barrelAt(x: number, z: number, tilt = 0, tone = 0x7a4e2a): void {
  const g = new THREE.Group();
  const b = mesh(lumpy(new THREE.CylinderGeometry(0.4, 0.4, 1.0, 18, 4), 0.025), std(tone, 0.8));
  // Bulge the staves a little so it reads as a barrel, not a can.
  const pos = b.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = 1 + 0.12 * (1 - (y / 0.5) ** 2);
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  b.geometry.computeVertexNormals();
  b.position.y = 0.5;
  g.add(b);
  const lid = mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.04, 18), std(0x9a6a3a, 0.85));
  lid.position.y = 1.0;
  g.add(lid);
  for (const y of [0.18, 0.82]) {
    const hoop = mesh(new THREE.TorusGeometry(0.43, 0.03, 6, 22), new THREE.MeshStandardMaterial({ color: 0x4a4e58, metalness: 0.6, roughness: 0.4 }));
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = y;
    g.add(hoop);
  }
  g.position.set(x, 0, z);
  g.rotation.z = tilt;
  root.add(g);
}
function barrels(): void {
  barrelAt(-0.45, 0, 0, 0x7a4e2a);
  barrelAt(0.45, 0.15, 0, 0x6e4626);
  barrelAt(0.05, -0.65, 0, 0x845630);
}
/** Banner on a pole: blue cloth with a gold trim and crown-ish emblem, matching the hall's banners. */
function banner(): void {
  const pole = mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.4, 8), std(0x5a3a22, 0.8));
  pole.position.y = 1.7;
  root.add(pole);
  const knob = mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe0b040, metalness: 0.7, roughness: 0.35 }));
  knob.position.y = 3.45;
  root.add(knob);
  const bar = mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 6), std(0x5a3a22));
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0.5, 3.2, 0);
  root.add(bar);
  // Cloth: a subdivided plane with a gentle wave and a swallowtail cut.
  const geo = new THREE.PlaneGeometry(1.0, 1.6, 10, 16);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, Math.sin(x * 4 + y * 1.5) * 0.06 + (0.8 - y) * 0.05);
    if (y < -0.55) pos.setY(i, y + Math.max(0, 0.25 - Math.abs(x) * 0.9) * 0.9); // notch
  }
  geo.computeVertexNormals();
  const cloth = mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2c58b8, roughness: 0.9, side: THREE.DoubleSide }));
  cloth.position.set(0.52, 2.38, 0.02);
  root.add(cloth);
  const trim = mesh(new THREE.BoxGeometry(1.02, 0.08, 0.03), new THREE.MeshStandardMaterial({ color: 0xe0b040, metalness: 0.5, roughness: 0.4 }));
  trim.position.set(0.52, 3.12, 0.06);
  root.add(trim);
  const emblem = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 20), new THREE.MeshStandardMaterial({ color: 0xe0b040, metalness: 0.5, roughness: 0.4 }));
  emblem.rotation.x = Math.PI / 2;
  emblem.position.set(0.52, 2.55, 0.1);
  root.add(emblem);
  root.rotation.y = 0.35;
}
/** Grain sacks slumped against each other. */
function sacks(): void {
  const cloth = std(0xc8b088, 0.95);
  for (const [x, z, s, r] of [[-0.35, 0, 1, 0.2], [0.35, 0.1, 0.9, -0.3], [0, -0.45, 0.85, 0.1]] as const) {
    const sk = mesh(lumpy(new THREE.SphereGeometry(0.42, 16, 12), 0.06, 3), cloth);
    sk.scale.set(s, s * 1.15, s * 0.9);
    sk.position.set(x, 0.42 * s, z);
    sk.rotation.z = r;
    root.add(sk);
    const tie = mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.18, 10), std(0xb09870, 0.95));
    tie.position.set(x + Math.sin(-r) * 0.45 * s, 0.9 * s, z);
    tie.rotation.z = r;
    root.add(tie);
  }
}
/** Lantern post: timber post, arm and a glass lantern (the game adds the glow at night). */
function lantern(): void {
  const wood = std(0x5a3a22, 0.8);
  const post = mesh(new THREE.BoxGeometry(0.16, 2.6, 0.16), wood);
  post.position.y = 1.3;
  root.add(post);
  const arm = mesh(new THREE.BoxGeometry(0.7, 0.1, 0.1), wood);
  arm.position.set(0.3, 2.5, 0);
  root.add(arm);
  const iron = new THREE.MeshStandardMaterial({ color: 0x2e3036, metalness: 0.6, roughness: 0.45 });
  const cap = mesh(new THREE.ConeGeometry(0.2, 0.18, 4), iron);
  cap.position.set(0.58, 2.28, 0);
  cap.rotation.y = Math.PI / 4;
  root.add(cap);
  const glass = mesh(new THREE.BoxGeometry(0.24, 0.3, 0.24), new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffa040, emissiveIntensity: 0.6, roughness: 0.3 }));
  glass.position.set(0.58, 2.04, 0);
  root.add(glass);
  const base = mesh(new THREE.BoxGeometry(0.28, 0.05, 0.28), iron);
  base.position.set(0.58, 1.88, 0);
  root.add(base);
  const foot = mesh(new THREE.BoxGeometry(0.4, 0.14, 0.4), std(0x8a8c90, 0.9));
  foot.position.y = 0.07;
  root.add(foot);
}

/** Fallen, mossy log with a pale cut end and a broken branch stub (forest-edge clutter). */
function fallenLog(): void {
  const bark = std(0x5e4028, 0.95);
  const L = 2.6;
  const trunk = mesh(lumpy(new THREE.CylinderGeometry(0.34, 0.4, L, 14, 6), 0.05, 2.5), bark);
  trunk.rotation.z = Math.PI / 2;
  trunk.position.y = 0.34;
  root.add(trunk);
  const cut = mesh(new THREE.CircleGeometry(0.33, 18), std(0xd8b080, 0.8));
  cut.rotation.y = Math.PI / 2;
  cut.position.set(L / 2 + 0.01, 0.34, 0);
  root.add(cut);
  const ring = mesh(new THREE.RingGeometry(0.16, 0.19, 18), std(0xb08a5a, 0.85));
  ring.rotation.y = Math.PI / 2;
  ring.position.set(L / 2 + 0.02, 0.34, 0);
  root.add(ring);
  // Patchy moss on top of the log.
  for (const [x, w] of [[-0.8, 0.5], [-0.1, 0.35], [0.5, 0.42]] as const) {
    const m = mesh(lumpy(new THREE.SphereGeometry(0.3, 12, 8), 0.07, 3), std(0x3f6e2a, 1));
    m.scale.set(w / 0.3, 0.28, 0.9);
    m.position.set(x, 0.66, -0.02);
    root.add(m);
  }
  const stub = mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.6, 7), bark);
  stub.position.set(-0.4, 0.75, 0.1);
  stub.rotation.z = 0.6;
  root.add(stub);
  for (const [x, z] of [[0.9, 0.35], [-1.0, 0.32]] as const) {
    const m = mesh(lumpy(new THREE.SphereGeometry(0.22, 10, 8), 0.06), std(0x2f5e22, 1));
    m.scale.y = 0.6;
    m.position.set(x, 0.08, z);
    root.add(m);
  }
  root.rotation.y = -0.45;
}

/** Battlefield debris: arrows stuck in the ground at a slant, fletched. */
function arrows(): void {
  const shaft = std(0x8a6a44, 0.8);
  const fl = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.9, side: THREE.DoubleSide });
  const spots = [[0, 0, 0.5, 0.2], [0.35, 0.25, 0.42, -0.3], [-0.3, 0.2, 0.55, 0.6], [0.15, -0.35, 0.38, 1.2], [-0.45, -0.25, 0.48, -0.9]] as const;
  for (const [x, z, tilt, yaw] of spots) {
    const g = new THREE.Group();
    const a = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), shaft);
    a.position.y = 0.5;
    g.add(a);
    for (let k = 0; k < 3; k++) {
      const f = mesh(new THREE.PlaneGeometry(0.1, 0.22), fl);
      f.position.set(Math.cos((k * Math.PI * 2) / 3) * 0.05, 0.86, Math.sin((k * Math.PI * 2) / 3) * 0.05);
      f.rotation.y = (k * Math.PI * 2) / 3;
      g.add(f);
    }
    g.position.set(x, -0.25, z);
    g.rotation.set(tilt, yaw, 0, "YXZ");
    root.add(g);
  }
}
/** A broken spear stuck in the ground with its snapped half lying beside it. */
function spear(): void {
  const wood = std(0x7a5634, 0.8);
  const iron = new THREE.MeshStandardMaterial({ color: 0x8a8e98, metalness: 0.7, roughness: 0.4 });
  const g = new THREE.Group();
  const s1 = mesh(new THREE.CylinderGeometry(0.04, 0.045, 1.4, 7), wood);
  s1.position.y = 0.7;
  g.add(s1);
  const tip = mesh(new THREE.ConeGeometry(0.09, 0.32, 4), iron);
  tip.position.y = 1.55;
  g.add(tip);
  g.rotation.set(0.35, 0, -0.25);
  root.add(g);
  const half = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 7), wood);
  half.rotation.z = Math.PI / 2;
  half.rotation.y = 0.6;
  half.position.set(0.6, 0.05, 0.4);
  root.add(half);
}
/** A round wooden shield dropped on the ground, iron boss and rim, painted face. */
function shield(): void {
  const g = new THREE.Group();
  const face = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 24), std(0x8a5a32, 0.85));
  g.add(face);
  const paint = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.02, 24, 1, false, 0, Math.PI), std(0x8a2a22, 0.9));
  paint.position.y = 0.05;
  g.add(paint);
  const iron = new THREE.MeshStandardMaterial({ color: 0x5a5e66, metalness: 0.6, roughness: 0.45 });
  const rim = mesh(new THREE.TorusGeometry(0.55, 0.04, 6, 28), iron);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  const boss = mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), iron);
  boss.position.y = 0.04;
  g.add(boss);
  g.position.y = 0.12;
  g.rotation.set(0.22, 0.4, 0.1);
  root.add(g);
}

/** One short split log, bark on the side and a pale ringed cut end toward the viewer (stacked by the game). */
function logPiece(): void {
  const g = new THREE.Group();
  const bark = mesh(lumpy(new THREE.CylinderGeometry(0.24, 0.25, 1.1, 12, 3), 0.025, 3), std(0x7a4e2a, 0.9));
  bark.rotation.z = Math.PI / 2;
  g.add(bark);
  for (const sx of [-1, 1]) {
    const end = mesh(new THREE.CircleGeometry(0.235, 16), std(0xe0b880, 0.8));
    end.rotation.y = (sx * Math.PI) / 2;
    end.position.x = sx * 0.551;
    g.add(end);
    const ring = mesh(new THREE.RingGeometry(0.1, 0.125, 16), std(0xb48a58, 0.85));
    ring.rotation.y = (sx * Math.PI) / 2;
    ring.position.x = sx * 0.553;
    g.add(ring);
  }
  g.position.y = 0.25;
  g.rotation.y = -0.95;
  root.add(g);
}

/** Pyramid pile of short logs, ends facing the viewer; seed = number of logs (1, 2, 3, 6, 10, 15). */
function logPile(): void {
  const n = Number(q.get("seed") ?? 6);
  const rows = n >= 15 ? 5 : n >= 10 ? 4 : n >= 6 ? 3 : n >= 3 ? 2 : 1;
  const bottom = n === 2 ? 2 : n === 1 ? 1 : rows;
  const grp = new THREE.Group();
  const tones = [0x7a4e2a, 0x6e4626, 0x845630];
  let placed = 0;
  for (let r = 0; r < rows && placed < n; r++) {
    const per = Math.max(1, bottom - r);
    for (let k = 0; k < per && placed < n; k++, placed++) {
      const lg = new THREE.Group();
      const bark = mesh(lumpy(new THREE.CylinderGeometry(0.24, 0.25, 1.2, 12, 3), 0.025, 3), std(tones[(k + r) % 3]!, 0.9));
      bark.rotation.x = Math.PI / 2;
      lg.add(bark);
      const end = mesh(new THREE.CircleGeometry(0.235, 16), std(0xe0b880, 0.8));
      end.position.z = 0.601;
      lg.add(end);
      const ring = mesh(new THREE.RingGeometry(0.1, 0.125, 16), std(0xb48a58, 0.85));
      ring.position.z = 0.603;
      lg.add(ring);
      lg.position.set((k - (per - 1) / 2) * 0.5, 0.25 + r * 0.43, 0);
      grp.add(lg);
    }
  }
  grp.rotation.y = -0.35;
  root.add(grp);
}

/** Catapult throwing arm standing straight up from its pivot (the game rotates it): timber beam
 *  with iron bands, a bowl at the top, optionally holding a stone. No ground shadow (it moves). */
function catapultArm(loaded: boolean): void {
  ground.visible = false;
  const wood = std(0xb07a42, 0.8);
  const iron = new THREE.MeshStandardMaterial({ color: 0x4a4e58, metalness: 0.6, roughness: 0.45 });
  const beam = mesh(lumpy(new THREE.BoxGeometry(0.55, 3.8, 0.45, 1, 8, 1), 0.015), wood);
  beam.position.y = 1.6;
  root.add(beam);
  for (const y of [0.2, 1.4, 2.6]) {
    const band = mesh(new THREE.BoxGeometry(0.62, 0.1, 0.52), iron);
    band.position.y = y;
    root.add(band);
  }
  const bowlMat = std(0x6a4426, 0.85);
  bowlMat.side = THREE.DoubleSide;
  const bowl = mesh(new THREE.SphereGeometry(0.75, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), bowlMat);
  bowl.position.y = 4.15;
  bowl.rotation.x = 0.55; // open side tilted toward the camera
  bowl.scale.y = 0.6;
  root.add(bowl);
  const rim = mesh(new THREE.TorusGeometry(0.75, 0.06, 6, 22), iron);
  rim.position.y = 4.15;
  rim.rotation.x = Math.PI / 2 + 0.55;
  root.add(rim);
  if (loaded) {
    const stone = mesh(lumpy(new THREE.IcosahedronGeometry(0.55, 2), 0.08, 2.5), std(0x8a847a, 0.95));
    stone.position.set(0, 4.3, 0.2);
    root.add(stone);
  }
}

/** A catapult boulder in flight: craggy, lit stone, no ground shadow (the game draws its own). */
function boulder(): void {
  ground.visible = false;
  const mat = new THREE.MeshStandardMaterial({ color: 0x837b70, roughness: 0.95, flatShading: true });
  const b = mesh(lumpy(new THREE.IcosahedronGeometry(0.6, 1), 0.18, 3.1), mat);
  b.scale.set(1, 0.88, 0.95);
  b.position.y = 1.2;
  root.add(b);
}


// ---- Rebuilt camp pieces (were flat canvas drawings in the game): watchtower, healer's tent, merchant
// cart, cursed shrine, mage tower, spike stake. 1 scene unit = 10 world units, origin = base centre. ----
const woodM = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });

/** Watchtower (levels 1–3): splayed timber stilts with braces, a railed lookout, a roof; taller and
 *  sturdier per level, a stone footing and a gold-trimmed roof at the top level. */
function watchtowerModel(level: number): void {
  const H = 6.2 + level * 1.1, top = 1.5;
  const spread = 1.5, deckW = 2.6;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const leg = mesh(lumpy(new THREE.CylinderGeometry(0.13, 0.2, H + 0.2, 7, 4), 0.04), woodM(0x6a4426));
    // Legs lean in toward the deck.
    leg.position.set(x * (spread + deckW * 0.4) / 2, H / 2, z * (spread + deckW * 0.4) / 2);
    leg.rotation.z = -x * 0.08;
    leg.rotation.x = z * 0.08;
    root.add(leg);
  }
  // Cross braces on the front and sides, one pair per storey.
  const storeys = 1 + level;
  for (let k = 0; k < storeys; k++) {
    const y0 = (H / storeys) * k + 0.4, y1 = (H / storeys) * (k + 1);
    for (const z of [-1, 1]) for (const d of [-1, 1]) {
      const len = Math.hypot(spread * 1.25, y1 - y0);
      const br = mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 5), woodM(0x4e3218));
      br.position.set(0, (y0 + y1) / 2, z * 1.05);
      br.rotation.z = d * Math.atan2(spread * 1.25, y1 - y0);
      root.add(br);
    }
  }
  if (level >= 3) {
    const foot = mesh(lumpy(new THREE.CylinderGeometry(1.9, 2.1, 0.7, 10, 2), 0.05, 3, false), std(0x9a968c, 0.95));
    foot.position.y = 0.35;
    root.add(foot);
  }
  // Ladder up the front.
  for (const x of [-0.3, 0.3]) {
    const rail = mesh(new THREE.CylinderGeometry(0.04, 0.04, H, 5), woodM(0x8a5a30));
    rail.position.set(x, H / 2, 1.35);
    rail.rotation.x = -0.08;
    root.add(rail);
  }
  for (let r = 0.6; r < H; r += 0.55) {
    const rung = mesh(new THREE.BoxGeometry(0.62, 0.05, 0.06), woodM(0x9a6a38));
    rung.position.set(0, r, 1.35 + (r - H / 2) * 0.08);
    root.add(rung);
  }
  // Lookout deck + railing posts + plank walls.
  const deck = mesh(new THREE.BoxGeometry(deckW, 0.22, deckW), woodM(0xb07a44));
  deck.position.y = H;
  root.add(deck);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const post = mesh(new THREE.BoxGeometry(0.16, top, 0.16), woodM(0x7a4e2a));
    post.position.set(x * deckW * 0.45, H + top / 2, z * deckW * 0.45);
    root.add(post);
  }
  for (const [x, z, w, d] of [[0, deckW * 0.45, deckW * 0.95, 0.1], [0, -deckW * 0.45, deckW * 0.95, 0.1], [deckW * 0.45, 0, 0.1, deckW * 0.95], [-deckW * 0.45, 0, 0.1, deckW * 0.95]] as const) {
    const wall = mesh(new THREE.BoxGeometry(w, 0.6, d), woodM(0x9a6a38));
    wall.position.set(x, H + 0.4, z);
    root.add(wall);
  }
  // Pyramid roof (gold-trimmed at the top level) with a pennant.
  const roof = mesh(new THREE.ConeGeometry(deckW * 0.82, 1.3, 4), std(level >= 3 ? 0x2e5a9a : 0x8a3a2a, 0.75));
  roof.position.y = H + top + 0.55;
  roof.rotation.y = Math.PI / 4;
  root.add(roof);
  if (level >= 3) {
    const trim = mesh(new THREE.TorusGeometry(deckW * 0.6, 0.06, 6, 4), std(0xd8a82a, 0.4));
    trim.rotation.x = Math.PI / 2;
    trim.rotation.z = Math.PI / 4;
    trim.position.y = H + top - 0.05;
    root.add(trim);
  }
  const pole = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 5), woodM(0x5a3a1c));
  pole.position.y = H + top + 1.6;
  root.add(pole);
  const flag = mesh(new THREE.PlaneGeometry(0.8, 0.45), new THREE.MeshStandardMaterial({ color: level >= 2 ? 0xe0a82a : 0x3d6aa8, roughness: 0.8, side: THREE.DoubleSide }));
  flag.position.set(0.42, H + top + 1.9, 0);
  root.add(flag);
  // Lantern hanging under the roof.
  const lamp = mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffc860, emissive: 0xffa030, emissiveIntensity: 1.2 }));
  lamp.position.set(0, H + top - 0.35, deckW * 0.3);
  root.add(lamp);
}

/** Healer's tent (levels 1–4): a white canvas tent with red stripes and a red-cross banner, broader
 *  per level; a second awning at level 3, a gold cross and laurel banner at mastery. */
function healerTentModel(level: number): void {
  const W = 4.4 + level * 0.5, D = 3.4 + level * 0.25, H = 3.2 + level * 0.25;
  const seg = 10;
  const g = new THREE.BufferGeometry();
  const pos: number[] = [], col: number[] = [];
  const white = new THREE.Color(0xf4efe4), red = new THREE.Color(0xc8382a);
  for (const side of [-1, 1]) {
    for (let i = 0; i < seg; i++) {
      const x0 = -W / 2 + (W * i) / seg, x1 = -W / 2 + (W * (i + 1)) / seg;
      const c = i % 3 === 1 ? red : white;
      const p = [[x0, 0, (side * D) / 2], [x1, 0, (side * D) / 2], [x1, H, 0], [x0, 0, (side * D) / 2], [x1, H, 0], [x0, H, 0]];
      if (side < 0) p.reverse();
      for (const v of p) { pos.push(v[0]!, v[1]!, v[2]!); col.push(c.r, c.g, c.b); }
    }
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  root.add(mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide })));
  for (const ex of [-W / 2, W / 2]) {
    const tri = new THREE.Shape();
    tri.moveTo(-D / 2, 0); tri.lineTo(0, H); tri.lineTo(D / 2, 0); tri.lineTo(-D / 2, 0);
    const m = mesh(new THREE.ShapeGeometry(tri), std(0xece6da, 0.9));
    m.rotation.y = Math.PI / 2;
    m.position.x = ex;
    root.add(m);
  }
  // Doorway flap (dark) on the front end, tied back.
  const door = new THREE.Shape();
  door.moveTo(-0.8, 0); door.lineTo(0, 2.0); door.lineTo(0.8, 0); door.lineTo(-0.8, 0);
  const dm = mesh(new THREE.ShapeGeometry(door), std(0x3a2a20, 1));
  dm.rotation.y = Math.PI / 2;
  dm.position.x = W / 2 + 0.02;
  root.add(dm);
  // Ridge pole with a banner: red cross on white (gold cross at mastery).
  const pole = mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.0, 6), woodM(0x6a4426));
  pole.position.set(-W / 2 + 0.3, H + 0.9, 0);
  root.add(pole);
  const flag = mesh(new THREE.PlaneGeometry(1.1, 0.75), new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.8, side: THREE.DoubleSide }));
  flag.position.set(-W / 2 + 0.88, H + 1.5, 0);
  root.add(flag);
  const crossCol = level >= 4 ? 0xe0b030 : 0xd83a2a;
  for (const [w, h] of [[0.5, 0.15], [0.15, 0.5]] as const) {
    const c = mesh(new THREE.BoxGeometry(w, h, 0.02), std(crossCol, 0.6));
    c.position.set(-W / 2 + 0.88, H + 1.5, 0.02);
    root.add(c);
  }
  if (level >= 3) {
    // A front awning on poles (a field hospital).
    const aw = mesh(new THREE.BoxGeometry(W * 0.7, 0.08, 1.4), std(0xe8e2d4, 0.9));
    aw.position.set(0, 1.9, D / 2 + 0.6);
    aw.rotation.x = 0.18;
    root.add(aw);
    for (const x of [-W * 0.33, W * 0.33]) {
      const p = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 5), woodM(0x7a4e2a));
      p.position.set(x, 0.95, D / 2 + 1.2);
      root.add(p);
    }
  }
  // Supplies by the door: a cot and a crate of bottles.
  const crate = mesh(new THREE.BoxGeometry(0.8, 0.55, 0.6), woodM(0x9a6a38));
  crate.position.set(W / 2 - 0.2, 0.28, D / 2 + 0.3);
  root.add(crate);
  for (let i = 0; i < 3; i++) {
    const b = mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.32, 6), new THREE.MeshStandardMaterial({ color: 0x6ad06a, roughness: 0.3, emissive: 0x2a8a2a, emissiveIntensity: 0.3 }));
    b.position.set(W / 2 - 0.45 + i * 0.25, 0.72, D / 2 + 0.3);
    root.add(b);
  }
}

/** Wandering merchant's cart: wooden wagon, striped awning on posts, sacks and crates, two wheels. */
function merchantCartModel(): void {
  const body = mesh(lumpy(new THREE.BoxGeometry(4.6, 1.3, 2.4, 3, 2, 2), 0.02, 3, false), woodM(0xa06a38));
  body.position.y = 1.35;
  root.add(body);
  for (let i = -2; i <= 2; i++) {
    const plank = mesh(new THREE.BoxGeometry(0.05, 1.25, 2.42), woodM(0x6a4422));
    plank.position.set(i * 0.92, 1.35, 0);
    root.add(plank);
  }
  for (const x of [-1.5, 1.5]) for (const z of [-1.3, 1.3]) {
    const w = mesh(new THREE.TorusGeometry(0.62, 0.12, 6, 14), woodM(0x5a3a1c));
    w.position.set(x, 0.66, z);
    root.add(w);
    for (let k = 0; k < 4; k++) {
      const sp = mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), woodM(0x7a4e2a));
      sp.position.set(x, 0.66, z);
      sp.rotation.z = (k * Math.PI) / 4;
      root.add(sp);
    }
  }
  // Awning on four posts: red/cream stripes.
  for (const x of [-2.1, 2.1]) for (const z of [-1.0, 1.0]) {
    const p = mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 5), woodM(0x7a4e2a));
    p.position.set(x, 3.1, z);
    root.add(p);
  }
  for (let i = 0; i < 7; i++) {
    const strip = mesh(new THREE.BoxGeometry(4.8 / 7, 0.1, 2.8), std(i % 2 ? 0xf4ecd8 : 0xd8443a, 0.85));
    strip.position.set(-2.4 + (i + 0.5) * (4.8 / 7), 4.25 - Math.abs(i - 3) * 0.02, 0);
    strip.rotation.x = 0.1;
    root.add(strip);
  }
  // Wares: sacks, a crate and glowing bottles.
  for (const [x, z] of [[-1.3, 0.3], [-0.6, -0.5]] as const) {
    const sack = mesh(lumpy(new THREE.SphereGeometry(0.55, 8, 6), 0.06), std(0xd8c08a, 0.95));
    sack.scale.set(1, 0.8, 1);
    sack.position.set(x, 2.3, z);
    root.add(sack);
  }
  const crate = mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), woodM(0x8a5a30));
  crate.position.set(0.9, 2.35, 0.1);
  root.add(crate);
  for (let i = 0; i < 3; i++) {
    const b = mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.42, 6), new THREE.MeshStandardMaterial({ color: [0x6ac0e8, 0xe86aa8, 0xffd23a][i]!, roughness: 0.25, emissive: [0x2a6a9a, 0x9a2a5a, 0x9a7a1a][i]!, emissiveIntensity: 0.35 }));
    b.position.set(1.8 + (i % 2) * 0.2, 2.25, -0.5 + i * 0.35);
    root.add(b);
  }
  // Shaft poles out the front.
  for (const z of [-0.6, 0.6]) {
    const sh = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 5), woodM(0x6a4426));
    sh.rotation.z = Math.PI / 2 - 0.12;
    sh.position.set(3.3, 1.0, z);
    root.add(sh);
  }
}

/** Cursed shrine: a rune-cut obelisk on a stepped base, with a violet glowing eye and runes. */
function shrineModel(): void {
  const base = mesh(lumpy(new THREE.BoxGeometry(3.2, 0.5, 3.2, 3, 2, 3), 0.05, 3, false), std(0x6a6a78, 0.95));
  base.position.y = 0.25;
  root.add(base);
  const step = mesh(lumpy(new THREE.BoxGeometry(2.4, 0.4, 2.4, 3, 2, 3), 0.04, 3, false), std(0x7a7a88, 0.95));
  step.position.y = 0.7;
  root.add(step);
  const obG = new THREE.CylinderGeometry(0.55, 0.95, 5.2, 4, 3);
  const ob = mesh(lumpy(obG, 0.04, 3, false), std(0x8a8a9a, 0.9));
  ob.rotation.y = Math.PI / 4;
  ob.position.y = 3.5;
  root.add(ob);
  const cap = mesh(new THREE.ConeGeometry(0.62, 0.8, 4), std(0x7a7a88, 0.9));
  cap.rotation.y = Math.PI / 4;
  cap.position.y = 6.5;
  root.add(cap);
  const glow = new THREE.MeshStandardMaterial({ color: 0xc89aff, emissive: 0xa060ff, emissiveIntensity: 2.2 });
  const eye = mesh(new THREE.SphereGeometry(0.28, 10, 8), glow);
  eye.scale.set(1.4, 0.8, 0.4);
  eye.position.set(0, 4.6, 0.72);
  root.add(eye);
  for (const [y, w, h] of [[3.4, 0.12, 0.7], [3.4, 0.5, 0.1], [2.4, 0.4, 0.1], [2.1, 0.1, 0.5]] as const) {
    const r = mesh(new THREE.BoxGeometry(w, h, 0.05), glow);
    r.position.set(0, y, 0.84);
    root.add(r);
  }
}

/** Mage tower (levels 1–4): a tapering stone spire with rune bands and a floating crystal; taller per
 *  level, a gold-banded crown and a bigger crystal at mastery. */
function mageTowerModel(level: number): void {
  const H = 4.8 + level * 0.8;
  const g = lumpy(new THREE.CylinderGeometry(1.0, 1.7, H, 8, 6), 0.035, 3, false);
  const spire = mesh(shadeByHeight(g, 0xb4aec4, 0.7, 1.1), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  spire.position.y = H / 2;
  root.add(spire);
  const rune = new THREE.MeshStandardMaterial({ color: 0xa58aff, emissive: 0x7a50ff, emissiveIntensity: 1.6 });
  for (let k = 1; k <= level; k++) {
    const y = (H * k) / (level + 1);
    const r = 1.7 - (0.7 * y) / H;
    const band = mesh(new THREE.TorusGeometry(r + 0.03, 0.06, 6, 16), rune);
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    root.add(band);
  }
  // Doorway and a window.
  const door = mesh(new THREE.BoxGeometry(0.7, 1.2, 0.1), std(0x2a2038, 1));
  door.position.set(0, 0.6, 1.62);
  root.add(door);
  const win = mesh(new THREE.BoxGeometry(0.35, 0.5, 0.1), new THREE.MeshStandardMaterial({ color: 0xffd890, emissive: 0xffb040, emissiveIntensity: 1.2 }));
  win.position.set(0, H * 0.62, 1.28);
  root.add(win);
  // Crown ring of merlons (gold at mastery).
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const m = mesh(new THREE.BoxGeometry(0.32, 0.4, 0.32), std(level >= 4 ? 0xd8a82a : 0x9a94aa, level >= 4 ? 0.4 : 0.9));
    m.position.set(Math.cos(a) * 1.0, H + 0.2, Math.sin(a) * 1.0);
    root.add(m);
  }
  // Floating crystal above.
  const cr = mesh(new THREE.OctahedronGeometry(0.55 + level * 0.08), new THREE.MeshStandardMaterial({ color: 0xc8a8ff, emissive: 0x8a50ff, emissiveIntensity: 1.4, roughness: 0.2 }));
  cr.scale.set(0.8, 1.4, 0.8);
  cr.position.y = H + 1.4;
  root.add(cr);
}

/** One spike-trap stake (wood, or dark iron with a bright tip). */
/** Ballista base (Lv 1–3): a timber turntable on a plank deck (Lv 1), iron-banded with a bolt rack
 *  (Lv 2), on a dressed-stone plinth with gold trim (Lv 3). The bow is its own prop (it swivels). */
function ballistaBaseModel(level: number): void {
  const wood = (c: number) => std(c, 0.88);
  if (level >= 3) {
    const plinth = mesh(lumpy(new THREE.CylinderGeometry(1.5, 1.7, 0.6, 10), 0.03), std(0x9a948a, 0.95));
    plinth.position.y = 0.3;
    root.add(plinth);
    const trim = mesh(new THREE.TorusGeometry(1.52, 0.06, 6, 24), new THREE.MeshStandardMaterial({ color: 0xf2c443, metalness: 0.8, roughness: 0.3 }));
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.6;
    root.add(trim);
  } else {
    for (let k = 0; k < 4; k++) {
      const plank = mesh(new THREE.BoxGeometry(2.6, 0.18, 0.62), wood(k % 2 ? 0x7a4e2a : 0x8a5a30));
      plank.position.set(0, 0.09, -0.93 + k * 0.62);
      root.add(plank);
    }
  }
  const y0 = level >= 3 ? 0.6 : 0.18;
  const turn = mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.35, 16), wood(0x6a4426));
  turn.position.y = y0 + 0.17;
  root.add(turn);
  const post = mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.9, 10), wood(0x5a3a1c));
  post.position.y = y0 + 0.75;
  root.add(post);
  if (level >= 2) {
    for (const y of [y0 + 0.08, y0 + 0.28]) {
      const band = mesh(new THREE.TorusGeometry(0.98, 0.05, 6, 20), new THREE.MeshStandardMaterial({ color: 0x3a3e48, metalness: 0.65, roughness: 0.4 }));
      band.rotation.x = Math.PI / 2;
      band.position.y = y;
      root.add(band);
    }
    // Bolt rack beside it.
    const rack = mesh(new THREE.BoxGeometry(0.2, 0.7, 0.9), wood(0x5a3a1c));
    rack.position.set(1.25, y0 + 0.35, 0.3);
    root.add(rack);
    for (let k = 0; k < 3; k++) {
      const bolt = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6), wood(0x9a6a36));
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(1.3, y0 + 0.75, 0.0 + k * 0.25);
      root.add(bolt);
      const tip = mesh(new THREE.ConeGeometry(0.09, 0.22, 6), new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 0.7, roughness: 0.3 }));
      tip.rotation.x = Math.PI / 2;
      tip.position.set(1.3, y0 + 0.75, 0.0 + k * 0.25 + 0.75);
      root.add(tip);
    }
  }
}
/** Ballista bow: stock, steel-tipped bolt and the two great limbs with the string, pointing up-screen. */
function ballistaBowModel(): void {
  const wood = (c: number) => std(c, 0.85);
  const stock = mesh(new THREE.BoxGeometry(0.34, 0.24, 2.2), wood(0x7a4e2a));
  stock.position.set(0, 0.2, 0);
  root.add(stock);
  for (const side of [-1, 1]) {
    const limb = mesh(new THREE.BoxGeometry(1.5, 0.16, 0.2), wood(0x9a6a36));
    limb.position.set(side * 0.82, 0.24, -0.75);
    limb.rotation.y = side * 0.28;
    root.add(limb);
    const cap = mesh(new THREE.BoxGeometry(0.16, 0.2, 0.24), new THREE.MeshStandardMaterial({ color: 0x3a3e48, metalness: 0.7, roughness: 0.35 }));
    cap.position.set(side * 1.52, 0.24, -0.53);
    root.add(cap);
    const str = mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.62, 4), std(0xe8dcc0, 0.6));
    str.rotation.z = Math.PI / 2;
    str.rotation.y = side * -0.33;
    str.position.set(side * 0.76, 0.3, -0.25);
    root.add(str);
  }
  const bolt = mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.0, 6), wood(0xc8a070));
  bolt.rotation.x = Math.PI / 2;
  bolt.position.set(0, 0.38, -0.25);
  root.add(bolt);
  const tip = mesh(new THREE.ConeGeometry(0.12, 0.36, 6), new THREE.MeshStandardMaterial({ color: 0xd8dce4, metalness: 0.8, roughness: 0.25 }));
  tip.rotation.x = -Math.PI / 2;
  tip.position.set(0, 0.38, -1.42);
  root.add(tip);
  ground.visible = false;
}

/** Storm Lighthouse (chapter 11 kingdom landmark): a red-and-white striped tower on a rocky outcrop,
 *  a glowing lantern room with a gallery rail, and a dark cap. */
function lighthouseModel(): void {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const rock = mesh(lumpy(new THREE.IcosahedronGeometry(0.7 + (i % 2) * 0.25, 1), 0.12), std(i % 2 ? 0x6a6e72 : 0x7a7e80, 0.95));
    rock.position.set(Math.cos(a) * 1.1, 0.3, Math.sin(a) * 1.1);
    root.add(rock);
  }
  const H = 4.6, bands = 6;
  for (let k = 0; k < bands; k++) {
    const r0 = 0.95 - (k / bands) * 0.35, r1 = 0.95 - ((k + 1) / bands) * 0.35;
    const seg = mesh(new THREE.CylinderGeometry(r1, r0, H / bands, 20), std(k % 2 ? 0xc8302a : 0xf2ece0, 0.7));
    seg.position.y = 0.6 + (k + 0.5) * (H / bands);
    root.add(seg);
  }
  const gallery = mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 20), std(0x3a3e48, 0.6));
  gallery.position.y = 0.6 + H + 0.06;
  root.add(gallery);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const post = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 4), std(0x2a2e36, 0.5));
    post.position.set(Math.cos(a) * 0.8, 0.6 + H + 0.28, Math.sin(a) * 0.8);
    root.add(post);
  }
  const rail = mesh(new THREE.TorusGeometry(0.8, 0.025, 4, 24), std(0x2a2e36, 0.5));
  rail.rotation.x = Math.PI / 2;
  rail.position.y = 0.6 + H + 0.45;
  root.add(rail);
  const lamp = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.7, 12), new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffc040, emissiveIntensity: 1.8, roughness: 0.3 }));
  lamp.position.y = 0.6 + H + 0.47;
  root.add(lamp);
  const cap = mesh(new THREE.ConeGeometry(0.62, 0.6, 12), std(0x2a2e36, 0.6));
  cap.position.y = 0.6 + H + 1.12;
  root.add(cap);
  const ball = mesh(new THREE.SphereGeometry(0.1, 8, 6), std(0xf2c443, 0.4));
  ball.position.y = 0.6 + H + 1.5;
  root.add(ball);
}

/** Siege Tower: a tall timber tower on four wheels, hide-covered sides, a fighting top with merlons,
 *  and a closed drawbridge on the front (the open ramp is its own prop). */
function siegeTowerModel(): void {
  const wood = (c: number) => std(c, 0.88);
  const base = mesh(new THREE.BoxGeometry(2.6, 0.45, 2.6), wood(0x5a3a1c));
  base.position.y = 0.75;
  root.add(base);
  for (const [wx, wz] of [[-1.15, 1.2], [1.15, 1.2], [-1.15, -1.2], [1.15, -1.2]] as const) {
    const w = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.26, 18), wood(0x4a2e18));
    w.rotation.z = Math.PI / 2;
    w.position.set(wx * 1.15, 0.55, wz);
    root.add(w);
    const rim = mesh(new THREE.TorusGeometry(0.53, 0.06, 6, 18), new THREE.MeshStandardMaterial({ color: 0x3a3e48, metalness: 0.6, roughness: 0.45 }));
    rim.rotation.y = Math.PI / 2;
    rim.position.copy(w.position);
    rim.position.x += wx > 0 ? 0.14 : -0.14;
    root.add(rim);
  }
  // Tapering timber frame (corner posts) and plank storeys.
  const H = 5.2;
  for (const [x, z] of [[-1.05, -1.05], [1.05, -1.05], [-1.05, 1.05], [1.05, 1.05]] as const) {
    const post = mesh(new THREE.BoxGeometry(0.24, H, 0.24), wood(0x7a4e2a));
    post.position.set(x * 0.92, 0.95 + H / 2, z * 0.92);
    root.add(post);
  }
  const hide = [0x8a4a2e, 0x7a3e26, 0x9a5634];
  for (let k = 0; k < 4; k++) {
    const y = 1.3 + k * 1.2;
    const panel = mesh(lumpy(new THREE.BoxGeometry(2.0, 1.1, 2.0, 3, 2, 3), 0.03), std(hide[k % 3]!, 0.95));
    panel.position.y = y + 0.4;
    root.add(panel);
    const band = mesh(new THREE.BoxGeometry(2.1, 0.12, 2.1), wood(0x5a3a1c));
    band.position.y = y - 0.15;
    root.add(band);
  }
  // Fighting top: a wider platform with merlons.
  const top = mesh(new THREE.BoxGeometry(2.6, 0.22, 2.6), wood(0x6a4426));
  top.position.y = 0.95 + H;
  root.add(top);
  for (let i = 0; i < 4; i++)
    for (const side of [-1, 1]) {
      const m1 = mesh(new THREE.BoxGeometry(0.42, 0.5, 0.18), wood(0x7a4e2a));
      m1.position.set(-0.95 + i * 0.63, 1.3 + H, side * 1.2);
      root.add(m1);
      const m2 = mesh(new THREE.BoxGeometry(0.18, 0.5, 0.42), wood(0x7a4e2a));
      m2.position.set(side * 1.2, 1.3 + H, -0.95 + i * 0.63);
      root.add(m2);
    }
  // Closed drawbridge on the front face, with chains.
  const bridge = mesh(new THREE.BoxGeometry(1.5, 1.7, 0.14), wood(0x8a5a30));
  bridge.position.set(0, 0.95 + H - 1.05, 1.08);
  root.add(bridge);
  for (const x of [-0.6, 0.6]) {
    const chain = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5), new THREE.MeshStandardMaterial({ color: 0x3a3e48, metalness: 0.7, roughness: 0.4 }));
    chain.position.set(x, 0.95 + H - 0.2, 1.12);
    chain.rotation.x = 0.3;
    root.add(chain);
  }
  // A horde banner on top.
  const pole = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), wood(0x5a3a1c));
  pole.position.set(0.9, 1.9 + H, -0.9);
  root.add(pole);
  const flag = mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshStandardMaterial({ color: 0xb8302a, side: THREE.DoubleSide, roughness: 0.8 }));
  flag.position.set(1.32, 2.4 + H, -0.9);
  root.add(flag);
}
/** Siege Tower's lowered ramp: a plank board with cleats and iron straps (drawn when it unloads). */
function siegeRampModel(): void {
  const board = mesh(new THREE.BoxGeometry(1.5, 0.14, 2.4), std(0x8a5a30, 0.88));
  board.position.set(0, 0.07, 1.2);
  root.add(board);
  for (let k = 0; k < 5; k++) {
    const cleat = mesh(new THREE.BoxGeometry(1.4, 0.08, 0.1), std(0x5a3a1c, 0.88));
    cleat.position.set(0, 0.18, 0.3 + k * 0.45);
    root.add(cleat);
  }
  for (const x of [-0.6, 0.6]) {
    const strap = mesh(new THREE.BoxGeometry(0.1, 0.16, 2.4), new THREE.MeshStandardMaterial({ color: 0x3a3e48, metalness: 0.6, roughness: 0.45 }));
    strap.position.set(x, 0.1, 1.2);
    root.add(strap);
  }
  ground.visible = false;
}

/** Companion Hound: a lean tan hunting dog standing side-on, ears up, tail high, red collar. */
function houndModel(): void {
  const fur = std(0xb8844a, 0.85), dark = std(0x6a4426, 0.85), light = std(0xe8d0a8, 0.85);
  const body = mesh(lumpy(new THREE.CapsuleGeometry(0.42, 1.3, 6, 12), 0.02), fur);
  body.rotation.z = Math.PI / 2;
  body.position.set(0, 1.15, 0);
  root.add(body);
  const chest = mesh(new THREE.SphereGeometry(0.4, 14, 10), light);
  chest.position.set(0.72, 1.05, 0);
  chest.scale.set(0.9, 1, 0.9);
  root.add(chest);
  for (const [x, z] of [[0.6, 0.22], [0.6, -0.22], [-0.6, 0.22], [-0.6, -0.22]] as const) {
    const leg = mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.95, 8), x > 0 ? light : fur);
    leg.position.set(x, 0.48, z);
    root.add(leg);
    const paw = mesh(new THREE.SphereGeometry(0.11, 8, 6), dark);
    paw.position.set(x + 0.04, 0.05, z);
    root.add(paw);
  }
  const neck = mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.55, 10), fur);
  neck.position.set(0.95, 1.5, 0);
  neck.rotation.z = -0.7;
  root.add(neck);
  const collar = mesh(new THREE.TorusGeometry(0.24, 0.06, 6, 14), std(0xc8302a, 0.6));
  collar.position.set(0.92, 1.45, 0);
  collar.rotation.y = Math.PI / 2;
  collar.rotation.x = 0.7;
  root.add(collar);
  const tag = mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshStandardMaterial({ color: 0xf2c443, metalness: 0.8, roughness: 0.3 }));
  tag.position.set(1.02, 1.28, 0);
  root.add(tag);
  const head = mesh(new THREE.SphereGeometry(0.3, 14, 10), fur);
  head.position.set(1.2, 1.82, 0);
  root.add(head);
  const snout = mesh(new THREE.CylinderGeometry(0.12, 0.17, 0.42, 10), light);
  snout.rotation.z = Math.PI / 2;
  snout.position.set(1.48, 1.74, 0);
  root.add(snout);
  const nose = mesh(new THREE.SphereGeometry(0.07, 8, 6), std(0x1a1410, 0.4));
  nose.position.set(1.7, 1.76, 0);
  root.add(nose);
  for (const z of [0.15, -0.15]) {
    const ear = mesh(new THREE.ConeGeometry(0.1, 0.3, 6), dark);
    ear.position.set(1.12, 2.1, z);
    ear.rotation.z = 0.25;
    root.add(ear);
    const eye = mesh(new THREE.SphereGeometry(0.045, 6, 4), std(0x1a1410, 0.3));
    eye.position.set(1.4, 1.9, z * 0.9);
    root.add(eye);
  }
  const tail = mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.75, 8), fur);
  tail.position.set(-0.95, 1.6, 0);
  tail.rotation.z = 0.6;
  root.add(tail);
}
/** Companion Falcon: a peregrine with wings spread mid-glide, barred chest, hooked beak. */
function falconModel(): void {
  const slate = std(0x4a5468, 0.8), cream = std(0xe8dcc0, 0.85), gold = std(0xf2c443, 0.5);
  const body = mesh(new THREE.SphereGeometry(0.38, 14, 10), slate);
  body.scale.set(1.5, 0.9, 0.9);
  body.position.y = 1.6;
  root.add(body);
  const chest = mesh(new THREE.SphereGeometry(0.3, 12, 8), cream);
  chest.scale.set(1.2, 0.9, 0.8);
  chest.position.set(0.2, 1.52, 0);
  root.add(chest);
  const head = mesh(new THREE.SphereGeometry(0.22, 12, 8), slate);
  head.position.set(0.62, 1.78, 0);
  root.add(head);
  const beak = mesh(new THREE.ConeGeometry(0.07, 0.2, 6), gold);
  beak.rotation.z = -Math.PI / 2 - 0.4;
  beak.position.set(0.86, 1.72, 0);
  root.add(beak);
  for (const z of [0.12, -0.12]) {
    const eye = mesh(new THREE.SphereGeometry(0.04, 6, 4), std(0x1a1410, 0.3));
    eye.position.set(0.74, 1.84, z);
    root.add(eye);
  }
  // Wings: tapered feathered blades swept back from the shoulders.
  for (const side of [1, -1]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(0.05, side * 0.9, -0.3, side * 1.55);
    shape.lineTo(-0.7, side * 1.6);
    shape.quadraticCurveTo(-0.55, side * 0.8, -0.6, side * 0.5);
    shape.lineTo(-0.45, 0);
    shape.lineTo(0, 0);
    const wing = mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0x3e4658, roughness: 0.8, side: THREE.DoubleSide }));
    wing.rotation.x = -Math.PI / 2;
    wing.position.set(0.25, 1.68, 0);
    wing.rotation.z = 0;
    wing.rotation.y = side * 0.18;
    root.add(wing);
  }
  const tail = mesh(new THREE.ConeGeometry(0.22, 0.6, 4), slate);
  tail.rotation.z = Math.PI / 2;
  tail.scale.set(1, 1, 0.3);
  tail.position.set(-0.75, 1.58, 0);
  root.add(tail);
  ground.visible = false;
}

/** Balloon Bomber envelope: a patched, striped hot-air balloon with rigging lines down to the basket ring. */
function balloonEnvelope(): void {
  const g = new THREE.SphereGeometry(1.6, 32, 20);
  // Teardrop: narrow the bottom into a neck.
  const pos = g.attributes.position!;
  const col: number[] = [];
  const red = new THREE.Color(0xc8402e), cream = new THREE.Color(0xf0e2c0);
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = (y + 1.6) / 3.2; // 0 bottom .. 1 top
    const k = t < 0.45 ? 0.35 + (t / 0.45) * 0.65 : 1;
    x *= k; z *= k;
    if (t < 0.45) y -= (0.45 - t) * 1.2;
    pos.setXYZ(i, x, y * 1.12, z);
    const a = Math.atan2(z, x);
    const stripe = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8) % 2 === 0;
    const c = stripe ? red : cream;
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const env = mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
  env.position.y = 3.4;
  root.add(env);
  // Load band round the neck, and rigging lines down to where the basket hangs.
  const band = mesh(new THREE.TorusGeometry(0.62, 0.07, 6, 18), std(0x6a4426));
  band.rotation.x = Math.PI / 2;
  band.position.y = 1.75;
  root.add(band);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const top = new THREE.Vector3(Math.cos(a) * 0.6, 1.75, Math.sin(a) * 0.6);
    const bot = new THREE.Vector3(Math.cos(a) * 0.42, 0.55, Math.sin(a) * 0.42);
    const len = top.distanceTo(bot);
    const rope = mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 4), std(0x3a2a1a));
    rope.position.copy(top.clone().add(bot).multiplyScalar(0.5));
    rope.lookAt(bot);
    rope.rotateX(Math.PI / 2);
    root.add(rope);
  }
  // Burner flame at the neck.
  const flame = mesh(new THREE.ConeGeometry(0.2, 0.55, 8), new THREE.MeshStandardMaterial({ color: 0xffb040, emissive: 0xff7a10, emissiveIntensity: 2 }));
  flame.position.y = 1.55;
  flame.rotation.x = Math.PI;
  root.add(flame);
  ground.visible = false;
}
/** Balloon Bomber basket: wicker tub with a rim, sandbags and a couple of bombs hanging off it. */
function balloonBasket(): void {
  const tub = mesh(lumpy(new THREE.CylinderGeometry(0.55, 0.45, 0.6, 14, 2), 0.02), std(0xb88a4a, 0.95));
  tub.position.y = 0.3;
  root.add(tub);
  for (const y of [0.12, 0.3, 0.48]) {
    const weave = mesh(new THREE.TorusGeometry(0.52 - (0.48 - y) * 0.15, 0.03, 4, 18), std(0x8a6030, 0.95));
    weave.rotation.x = Math.PI / 2;
    weave.position.y = y;
    root.add(weave);
  }
  const rim = mesh(new THREE.TorusGeometry(0.56, 0.06, 6, 18), std(0x6a4426));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.6;
  root.add(rim);
  for (const a of [0.6, 2.4, 4.0]) {
    const bag = mesh(lumpy(new THREE.SphereGeometry(0.16, 8, 6), 0.03), std(0xc8b088, 0.95));
    bag.scale.y = 1.3;
    bag.position.set(Math.cos(a) * 0.6, 0.25, Math.sin(a) * 0.6);
    root.add(bag);
  }
  for (const a of [1.3, 1.9]) {
    const bomb = mesh(new THREE.SphereGeometry(0.17, 12, 8), new THREE.MeshStandardMaterial({ color: 0x24242a, metalness: 0.4, roughness: 0.45 }));
    bomb.position.set(Math.cos(a) * 0.62, 0.05, Math.sin(a) * 0.62);
    root.add(bomb);
  }
  ground.visible = false;
}
/** Shield Wall's tower shield: a tall curved iron-rimmed scutum with a boss and a red horde emblem. */
function towerShield(): void {
  const g = new THREE.CylinderGeometry(1.6, 1.6, 2.4, 20, 4, true, -0.42, 0.84);
  const sh = mesh(lumpy(g, 0.01), new THREE.MeshStandardMaterial({ color: 0x4a5670, roughness: 0.7, side: THREE.DoubleSide }));
  sh.position.set(0, 1.2, -1.45);
  root.add(sh);
  const rimM = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, metalness: 0.75, roughness: 0.35 });
  for (const y of [0.04, 2.36]) {
    const rim = mesh(new THREE.CylinderGeometry(1.63, 1.63, 0.1, 20, 1, true, -0.43, 0.86), new THREE.MeshStandardMaterial({ color: 0x9aa0aa, metalness: 0.75, roughness: 0.35, side: THREE.DoubleSide }));
    rim.position.set(0, y, -1.45);
    root.add(rim);
  }
  for (const a of [-0.42, 0.42]) {
    const edge = mesh(new THREE.BoxGeometry(0.1, 2.4, 0.1), rimM);
    edge.position.set(Math.sin(a) * 1.6, 1.2, Math.cos(a) * 1.6 - 1.45);
    root.add(edge);
  }
  const boss = mesh(new THREE.SphereGeometry(0.28, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), rimM);
  boss.rotation.x = Math.PI / 2;
  boss.position.set(0, 1.25, 0.17);
  root.add(boss);
  const emblem = mesh(new THREE.CircleGeometry(0.5, 3), new THREE.MeshStandardMaterial({ color: 0xb8302a, roughness: 0.8 }));
  emblem.position.set(0, 1.55, 0.16);
  emblem.rotation.z = -Math.PI / 2;
  root.add(emblem);
  for (const [x, y] of [[-0.45, 0.35], [0.45, 0.35], [-0.45, 2.05], [0.45, 2.05]] as const) {
    const rivet = mesh(new THREE.SphereGeometry(0.06, 6, 4), rimM);
    rivet.position.set(x, y, 0.16);
    root.add(rivet);
  }
  ground.visible = false;
}

function stakeModel(iron: boolean): void {
  const s = mesh(lumpy(new THREE.ConeGeometry(0.22, 2.2, 6, 3), 0.03), std(iron ? 0x4a4e5a : 0xa8743e, iron ? 0.45 : 0.85));
  s.position.y = 1.1;
  s.rotation.z = -0.35;
  root.add(s);
  const tip = mesh(new THREE.ConeGeometry(0.1, 0.4, 6), std(iron ? 0xf4f4f8 : 0xe8d0a0, iron ? 0.3 : 0.7));
  tip.position.set(0.37, 2.1, 0);
  tip.rotation.z = -0.35;
  root.add(tip);
}

({
  boulder,
  cat_arm: () => catapultArm(true),
  cat_arm_empty: () => catapultArm(false),
  logpile: logPile,
  logpiece: logPiece,
  arrows, spear, shield,
  log: fallenLog,
  barrels, banner, sacks, lantern,
  pond, crates, wheel, gravestone, deadtree: deadTree, burntstump: burntStump, crystal,
  dragon_body: () => dragon("body"),
  dragon_wing: () => dragon("wing"),
  bat_body: () => bat("body"),
  bat_wing: () => bat("wing"),
  ram_body: () => {
    ram("body");
    ram("log");
    ground.visible = true;
  },
  ram_log: () => ram("log"),
  catapult: () => {
    catapultBody();
    root.rotation.y = -0.35;
  },
  cabin: () => {
    cabin();
    root.rotation.y = -0.55;
  },
  tent: () => {
    tent();
    root.rotation.y = -Math.PI / 2 + 0.75;
  },
  forge: () => {
    forge();
    root.rotation.y = 0.5;
  },
  catapult1: () => { catapultBody(1); root.rotation.y = -0.35; },
  catapult2: () => { catapultBody(2); root.rotation.y = -0.35; },
  catapult3: () => { catapultBody(3); root.rotation.y = -0.35; },
  catapult4: () => { catapultBody(4); root.rotation.y = -0.35; },
  cabin1: () => { cabin(1); root.rotation.y = -0.55; },
  cabin2: () => { cabin(2); root.rotation.y = -0.55; },
  cabin3: () => { cabin(3); root.rotation.y = -0.55; },
  tent1: () => { tent(1); root.rotation.y = -Math.PI / 2 + 0.75; },
  tent2: () => { tent(2); root.rotation.y = -Math.PI / 2 + 0.75; },
  tent3: () => { tent(3); root.rotation.y = -Math.PI / 2 + 0.75; },
  tent4: () => { tent(4); root.rotation.y = -Math.PI / 2 + 0.75; },
  forge1: () => { forge(1); root.rotation.y = 0.5; },
  forge2: () => { forge(2); root.rotation.y = 0.5; },
  watch1: () => { watchtowerModel(1); root.rotation.y = -0.4; },
  watch2: () => { watchtowerModel(2); root.rotation.y = -0.4; },
  watch3: () => { watchtowerModel(3); root.rotation.y = -0.4; },
  healer1: () => { healerTentModel(1); root.rotation.y = -Math.PI / 2 + 0.7; },
  healer2: () => { healerTentModel(2); root.rotation.y = -Math.PI / 2 + 0.7; },
  healer3: () => { healerTentModel(3); root.rotation.y = -Math.PI / 2 + 0.7; },
  healer4: () => { healerTentModel(4); root.rotation.y = -Math.PI / 2 + 0.7; },
  cart: () => { merchantCartModel(); root.rotation.y = -0.35; },
  shrine: () => { shrineModel(); root.rotation.y = 0.2; },
  mage1: () => { mageTowerModel(1); root.rotation.y = 0.3; },
  mage2: () => { mageTowerModel(2); root.rotation.y = 0.3; },
  mage3: () => { mageTowerModel(3); root.rotation.y = 0.3; },
  mage4: () => { mageTowerModel(4); root.rotation.y = 0.3; },
  stake: () => stakeModel(false),
  stake_iron: () => stakeModel(true),
  balloon: balloonEnvelope,
  ballista1: () => { ballistaBaseModel(1); root.rotation.y = 0.35; },
  ballista2: () => { ballistaBaseModel(2); root.rotation.y = 0.35; },
  ballista3: () => { ballistaBaseModel(3); root.rotation.y = 0.35; },
  ballista_bow: () => { ballistaBowModel(); },
  lighthouse: () => { lighthouseModel(); root.rotation.y = 0.3; },
  siegetower: () => { siegeTowerModel(); root.rotation.y = 0.25; },
  siege_ramp: () => { siegeRampModel(); root.rotation.y = 0.25; },
  hound: () => { houndModel(); root.rotation.y = -0.35; },
  falcon: () => { falconModel(); root.rotation.y = -0.5; root.rotation.x = 0.35; },
  basket: balloonBasket,
  towershield: towerShield,
  tower1: () => tower(1, "back"), tower2: () => tower(2, "back"), tower3: () => tower(3, "back"), tower4: () => tower(4, "back"),
  tower1f: () => tower(1, "front"), tower2f: () => tower(2, "front"), tower3f: () => tower(3, "front"), tower4f: () => tower(4, "front"),
  pine, round: roundTree, bush, rock, stump,
  wall_log: () => palisade(0, false), wall_log_d1: () => palisade(1, false), wall_log_d2: () => palisade(2, false),
  wall_band: () => palisade(0, true), wall_band_d1: () => palisade(1, true), wall_band_d2: () => palisade(2, true),
  wall_stone: () => stoneWall(false), wall_stone2: () => stoneWall(true),
  gate: () => gate(false), gate_stone: () => gate(true), gate_stone_r: () => gate(true, true),
} as Record<string, () => void>)[prop]?.();

// Frame the prop: game-like 3/4 view from the front, slightly above.
// Fixed camera for every prop (so relative sizes are true): game-like 3/4 view from the front.
const cam = new THREE.PerspectiveCamera(22, 1, 0.1, 100);
const dist = Number(q.get("dist") ?? 14);
const elev = 0.5; // ~29°
cam.position.set(0, 2.1 + Math.sin(elev) * dist, Math.cos(elev) * dist);
cam.lookAt(0, 2.1, 0);
renderer.render(scene, cam);
// Where the prop's base (world origin) lands on the canvas, so the game can stand it on its spot.
const foot = new THREE.Vector3(0, 0, 0).project(cam);
(window as unknown as { __foot: { x: number; y: number } }).__foot = { x: ((foot.x + 1) / 2) * SIZE, y: ((1 - foot.y) / 2) * SIZE };
// Pixels per scene unit along x at the base (lets the game scale wall pieces to exactly 60 world units).
const u0 = new THREE.Vector3(-3, 0, 0).project(cam), u1 = new THREE.Vector3(3, 0, 0).project(cam);
(window as unknown as { __unit: number }).__unit = (((u1.x - u0.x) / 2) * SIZE) / 6;
(window as unknown as { __done: boolean }).__done = true;
