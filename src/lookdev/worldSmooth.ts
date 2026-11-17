// Smooth stylised world for the heroic look: rich green field with sandy winding paths (blended
// into the ground's vertex colours), a grey stone curtain wall with crenellations and a gate,
// wooden archer towers, low-poly pines, rocks and a ring of grey cliffs. Physically shaded.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const std = (color: number, roughness = 0.85, flat = false, metalness = 0): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: flat });

function shadowed<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return o;
}

/** Distance from p to a polyline. */
function distToPath(x: number, z: number, pts: [number, number][]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]!, [bx, bz] = pts[i + 1]!;
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

export const ENEMY_PATH: [number, number][] = [[0, -4], [0.4, -6], [-0.8, -8.5], [-0.2, -11], [1.6, -14], [1.2, -18], [-1, -24]];
export const CAMP_PATH: [number, number][] = [[0, -4], [0.3, -1], [-0.6, 2], [0.4, 5], [-0.4, 9], [0, 14]];

export function buildSmoothGround(scene: THREE.Scene): void {
  const size = 70, seg = 140;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position!;
  const cols: number[] = [];
  const g1 = new THREE.Color(0x3f9a4c), g2 = new THREE.Color(0x328a42), g3 = new THREE.Color(0x4caa58);
  const sand = new THREE.Color(0xd8b880), sandEdge = new THREE.Color(0xb8945e);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const n = Math.sin(x * 0.31 + Math.sin(z * 0.17) * 2.2) * Math.cos(z * 0.27 - x * 0.12);
    const n2 = Math.sin(x * 1.3 + z * 0.9) * Math.sin(z * 1.1 - x * 0.7);
    const c = g1.clone().lerp(n > 0 ? g3 : g2, Math.abs(n) * 0.7).lerp(g2, Math.max(0, n2) * 0.15);
    const d = Math.min(distToPath(x, z, ENEMY_PATH) - 0.25 * Math.sin(z * 0.9), distToPath(x, z, CAMP_PATH));
    const w = 1.05;
    if (d < w + 0.35) {
      const edge = THREE.MathUtils.smoothstep(d, w - 0.1, w + 0.35);
      const s = sand.clone().lerp(sandEdge, THREE.MathUtils.smoothstep(d, w * 0.5, w));
      c.lerp(s, 1 - edge);
    }
    // Gentle swell of the land toward the edges (the cliffs ring the field).
    const r = Math.hypot(x * 0.8, z + 4);
    pos.setY(i, r > 16 ? (r - 16) * 0.12 : 0);
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  ground.receiveShadow = true;
  scene.add(ground);
}

/** Low-poly grass tufts (instanced, swayable). */
export function buildSmoothTufts(scene: THREE.Scene, rnd: () => number): THREE.InstancedMesh {
  const n = 500;
  const geo = new THREE.ConeGeometry(0.07, 0.3, 4);
  geo.translate(0, 0.15, 0);
  const mesh = new THREE.InstancedMesh(geo, std(0x2f8a40, 0.9, true), n);
  const data: { x: number; z: number; ph: number; s: number }[] = [];
  for (let i = 0; i < n * 3 && data.length < n; i++) {
    const x = (rnd() - 0.5) * 30, z = (rnd() - 0.5) * 30 - 3;
    if (distToPath(x, z, ENEMY_PATH) < 1.4 || distToPath(x, z, CAMP_PATH) < 1.4 || Math.abs(z + 4) < 0.7) continue;
    data.push({ x, z, ph: rnd() * 6, s: 0.8 + rnd() * 0.6 });
  }
  mesh.count = data.length;
  mesh.userData.data = data;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

export function buildStoneWall(scene: THREE.Scene, wallZ: number): void {
  const stone = std(0x9ea4b0, 0.85), stoneDark = std(0x8a909c, 0.88), cap = std(0xb4bac4, 0.8);
  const segW = 1.2;
  for (let x = -14.4; x <= 14.4; x += segW) {
    if (Math.abs(x) < 1.6) continue;
    const g = new THREE.Group();
    const h = 1.25;
    const body = new THREE.Mesh(new RoundedBoxGeometry(segW + 0.02, h, 0.7, 3, 0.06), Math.round(x / segW) % 2 ? stone : stoneDark);
    body.position.y = h / 2;
    const top = new THREE.Mesh(new RoundedBoxGeometry(segW + 0.06, 0.14, 0.8, 3, 0.05), cap);
    top.position.y = h + 0.07;
    g.add(body, top);
    // Crenellations: two merlons per segment.
    for (const dx of [-0.3, 0.3]) {
      const m = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.34, 0.3, 3, 0.05), stone);
      m.position.set(dx, h + 0.3, -0.2);
      g.add(m);
    }
    g.position.set(x, 0, wallZ);
    scene.add(shadowed(g));
  }
  // Gatehouse: two stout pillars, a lintel and heavy wooden doors with iron studs.
  const gate = new THREE.Group();
  for (const k of [-1, 1]) {
    const pillar = new THREE.Mesh(new RoundedBoxGeometry(0.75, 2.0, 0.95, 3, 0.08), stone);
    pillar.position.set(k * 1.55, 1.0, 0);
    const pcap = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.2, 1.1, 3, 0.06), cap);
    pcap.position.set(k * 1.55, 2.1, 0);
    gate.add(pillar, pcap);
  }
  const lintel = new THREE.Mesh(new RoundedBoxGeometry(2.6, 0.32, 0.8, 3, 0.06), stoneDark);
  lintel.position.y = 1.84;
  const doors = new THREE.Mesh(new RoundedBoxGeometry(2.3, 1.66, 0.22, 3, 0.04), std(0x8a5a30, 0.7));
  doors.position.y = 0.83;
  gate.add(lintel, doors);
  for (const y of [0.45, 1.25]) {
    const band = new THREE.Mesh(new RoundedBoxGeometry(2.34, 0.12, 0.28, 2, 0.03), std(0x4a4e58, 0.4, false, 0.6));
    band.position.y = y;
    gate.add(band);
  }
  gate.position.z = wallZ;
  scene.add(shadowed(gate));
}

/** Wooden archer tower; returns the group and the banner cloth (for waving). */
export function buildSmoothTowerProps(): { g: THREE.Group; banner: THREE.Mesh } {
  const g = new THREE.Group();
  const wood = std(0x8a5a32, 0.75), woodDark = std(0x6a4426, 0.8), plank = std(0xb07a44, 0.7);
  for (const [px, pz] of [[-0.8, -0.6], [0.8, -0.6], [-0.8, 0.6], [0.8, 0.6]] as const) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 2.6, 10), wood);
    p.position.set(px, 1.3, pz);
    g.add(p);
  }
  for (const k of [-1, 1]) {
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), woodDark);
    brace.position.set(0, 1.25, 0.62);
    brace.rotation.z = k * 0.62;
    g.add(brace);
  }
  const deck = new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.24, 1.7, 3, 0.05), plank);
  deck.position.y = 2.65;
  g.add(deck);
  for (let i = -2; i <= 2; i++) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(0.32, 0.34, 0.14, 2, 0.04), wood);
    m.position.set(i * 0.46, 2.95, 0.82);
    g.add(m);
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 8), std(0xd8c098, 0.6));
  pole.position.set(1.0, 3.5, -0.7);
  g.add(pole);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5, 12, 4), new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.85, side: THREE.DoubleSide }));
  banner.position.set(1.42, 4.05, -0.7);
  g.add(banner);
  shadowed(g);
  (banner.userData as { base: Float32Array }).base = (banner.geometry.attributes.position!.array as Float32Array).slice();
  return { g, banner };
}

export function pine(x: number, z: number, s = 1): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * s, 0.12 * s, 0.5 * s, 6), std(0x6a4426, 0.9, true));
  trunk.position.y = 0.25 * s;
  g.add(trunk);
  const greens = [0x2f7d46, 0x37904f, 0x3f9e58];
  [0.55, 0.95, 1.3].forEach((y, i) => {
    const r = (0.62 - i * 0.15) * s;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 0.75 * s, 7), std(greens[i]!, 0.85, true));
    cone.position.y = y * s + 0.2 * s;
    cone.rotation.y = i * 0.7 + x;
    g.add(cone);
  });
  g.position.set(x, 0, z);
  return shadowed(g);
}

export function smoothRock(x: number, z: number, s = 1): THREE.Group {
  const g = new THREE.Group();
  const a = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35 * s, 0), std(0x9aa0aa, 0.9, true));
  a.scale.set(1.2, 0.7, 1);
  a.position.y = 0.18 * s;
  a.rotation.y = x;
  const b = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 * s, 0), std(0xaeb4be, 0.9, true));
  b.position.set(0.3 * s, 0.1 * s, 0.15 * s);
  g.add(a, b);
  g.position.set(x, 0, z);
  return shadowed(g);
}

/** A ring of tall grey cliff prisms around the far side of the field. */
export function buildCliffs(scene: THREE.Scene, rnd: () => number): void {
  const rock = [std(0xa2a8b4, 0.9, true), std(0x8e94a2, 0.9, true), std(0xb4bac4, 0.9, true)];
  for (let i = 0; i < 46; i++) {
    const a = -Math.PI * 0.95 + (i / 45) * Math.PI * 0.9 - Math.PI * 0.05;
    const R = 19 + rnd() * 2.5;
    const x = Math.cos(a) * R * 0.95, z = Math.sin(a) * R - 4;
    if (z > 2) continue;
    const h = 3 + rnd() * 4;
    const prism = new THREE.Mesh(new THREE.CylinderGeometry(1.1 + rnd() * 0.6, 1.6 + rnd() * 0.6, h, 5 + Math.floor(rnd() * 2)), rock[i % 3]!);
    prism.position.set(x, h / 2 - 0.3, z);
    prism.rotation.y = rnd() * 3;
    scene.add(shadowed(prism));
    if (rnd() > 0.5) scene.add(pine(x * 0.9 + (rnd() - 0.5), z * 0.9 + 1.5, 0.8 + rnd() * 0.3));
  }
}
