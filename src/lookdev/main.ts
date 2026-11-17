// Look-development prototype (Phase 0): a small 3D battlefield to agree the art direction.
// ?view=battle (default) — hero + tower archers defend a palisade against marching footmen and a
// brute; ?view=turn — the three characters on a turntable cycling their animations.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Character, PALETTES, part, toon, type CharacterSpec } from "./rig";
import { CROWN, SkinnedCharacter, loadKK, type KKSpec } from "./kaykit";
import { TILE, TILES, block, buildBlockGround, buildTufts, rock, swayTufts, voxelTree } from "./world";
import { ENEMY_PATH, buildCliffs, buildSmoothGround, buildSmoothTowerProps, buildSmoothTufts, buildStoneWall, pine, smoothRock } from "./worldSmooth";

const params = new URLSearchParams(location.search);
const view = params.get("view") ?? "battle";
const styleParam = params.get("style");
const style = styleParam === "round" || styleParam === "block" || styleParam === "heroic" ? styleParam : "kaykit";
/** Physically-shaded looks share lighting and the smooth world. */
const isPbr = style === "heroic" || style === "kaykit";

// ---------------------------------------------------------------------------------------------
// Renderer, camera, light (one warm key light from the top-left of the screen, cool sky fill).

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !params.has("noshadow");
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
if (isPbr) {
  // Physically-shaded characters: filmic tone mapping + a soft studio environment for metal sheen.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
}
scene.background = new THREE.Color(0x9fd0f0);
scene.fog = new THREE.Fog(0x9fd0f0, 30, 60);

const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 200);
if (view === "turn") {
  camera.position.set(0, 3.2, 9);
  camera.lookAt(0, 0.9, 0);
} else {
  if (style === "block") {
    camera.position.set(0, 13.5, 12.5);
    camera.lookAt(0, 0.4, -4.2);
  } else {
    // Steeper, more top-down framing like the genre's field view.
    camera.position.set(0, 16.5, 9.5);
    camera.lookAt(0, 0, -4.6);
  }
}

scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x5a7a3a, isPbr ? 0.9 : 1.1));
const sun = new THREE.DirectionalLight(0xfff0d0, isPbr ? 2.0 : 2.6);
sun.position.set(-9, 16, -4); // screen top-left → shadows fall down-right
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -16;
sun.shadow.camera.right = 16;
sun.shadow.camera.top = 16;
sun.shadow.camera.bottom = -16;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
sun.shadow.radius = 4;
scene.add(sun);
// Rim light from behind-right gives characters a bright edge against the ground.
const rim = new THREE.DirectionalLight(0xbfe0ff, 1.2);
rim.position.set(6, 6, -10);
scene.add(rim);

addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ---------------------------------------------------------------------------------------------
// Character factory: procedural rigs, or skinned KayKit characters (default).

type Char = Character | SkinnedCharacter;

/** Shift blue-ish palette pixels to red (the enemy horde's livery). */
function blueToRed(r: number, g: number, b: number): [number, number, number] {
  const c = new THREE.Color(r / 255, g / 255, b / 255);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  // Armour greys and blue cloth → red livery; skin, leather and gold stay.
  if (hsl.s > 0.25 && hsl.h > 0.5 && hsl.h < 0.75) c.setHSL(0.0, Math.min(1, hsl.s * 1.1), hsl.l * 0.95);
  else if (hsl.s < 0.16 && hsl.l > 0.28 && hsl.l < 0.85) c.setHSL(0.995, 0.68, 0.22 + hsl.l * 0.42);
  return [c.r * 255, c.g * 255, c.b * 255];
}

const CLIPS = { idle: "Idle", run: "Running_A", hit: "Hit_A", death: "Death_A" };
function kkSpecFor(spec: CharacterSpec): KKSpec {
  const s = spec.scale ?? 1;
  if (spec.head === "crown") {
    return { model: "Knight", show: ["-Knight_Helmet"], borrow: [["Rogue_Hooded", "1H_Crossbow", "handslotr"]], crown: true, height: 1.8 * s, clips: { ...CLIPS, attack: "1H_Ranged_Shoot" }, strikeAt: 0.3 };
  }
  if (spec.head === "hood") {
    return { model: "Rogue_Hooded", show: ["2H_Crossbow"], height: 1.75 * s, clips: { ...CLIPS, idle: "2H_Ranged_Aiming", attack: "2H_Ranged_Shoot" }, strikeAt: 0.25 };
  }
  if (spec.head === "horns") {
    return { model: "Barbarian", show: ["2H_Axe"], height: 2.1 * s, clips: { ...CLIPS, idle: "2H_Melee_Idle", attack: "2H_Melee_Attack_Chop", death: "Death_B" }, strikeAt: 0.42 };
  }
  return { model: "Knight", show: ["1H_Sword", "Round_Shield", "-Knight_Cape"], height: 1.75 * s, clips: { ...CLIPS, attack: "1H_Melee_Attack_Chop" }, strikeAt: 0.4, recolor: blueToRed };
}

function makeChar(spec: CharacterSpec): Char {
  return style === "kaykit" ? new SkinnedCharacter(kkSpecFor(spec)) : new Character(spec);
}
if (params.get("cy")) CROWN.y = +params.get("cy")!;
if (params.get("cs")) CROWN.s = +params.get("cs")!;
if (style === "kaykit") await loadKK(["Knight", "Barbarian", "Rogue_Hooded"]);

// Seeded RNG so captures are repeatable.
let seed = 7;
const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---------------------------------------------------------------------------------------------
// Ground: grass with soft colour patches, a dirt road, swaying grass tufts.

function buildGround(): void {
  if (style !== "block") {
    buildSmoothGround(scene);
    tufts = [buildSmoothTufts(scene, rnd)];
    buildCliffs(scene, rnd);
    for (const [x, z, sc] of [[-8.5, -9, 1.3], [-10.5, -5.5, 1.1], [8.8, -8, 1.4], [10.6, -12, 1.2], [-7, 3.5, 1.2], [7.6, 4.5, 1.1], [-11, 1, 1.3], [11, 0, 1.2], [-5.5, -13, 1.3], [6, -14, 1.2], [-9.4, -1.8, 1], [9.6, -3.4, 1.1]] as const) {
      scene.add(pine(x, z, sc));
    }
    for (const [x, z, sc] of [[-3.2, 2.2, 1], [3.6, -9.5, 0.9], [-6.2, -11, 1.2], [6.5, 1.6, 0.8], [-3.4, -7.6, 0.7]] as const) scene.add(smoothRock(x, z, sc));
    return;
  }
  buildBlockGround(scene, WALL_Z);
  tufts = buildTufts(scene, rnd, (x, z) => (Math.abs(x) < 1.6 && z > WALL_Z - 0.5) || Math.abs(z - WALL_Z) < 0.5);
  // Frame the field with voxel trees and rocks.
  for (const [x, z, h, sc] of [[-8.5, -9, 2.6, 1], [-10.5, -5.5, 2.2, 0.9], [8.8, -8, 2.8, 1], [10.6, -12, 2.4, 1], [-7, 3.5, 2.4, 1], [7.6, 4.5, 2.2, 0.95], [-11, 1, 2.6, 1], [11, 0, 2.5, 1], [-4.5, -13, 2.6, 1], [5, -14, 2.4, 1]] as const) {
    scene.add(voxelTree(x, z, h, sc));
  }
  for (const [x, z, sc] of [[-3.2, 2.2, 1], [3.6, -9.5, 0.9], [-6.2, -11, 1.2], [6.5, 1.6, 0.8], [-2.6, -7.6, 0.7]] as const) scene.add(rock(x, z, sc));
}

let tufts: THREE.InstancedMesh[] = [];
function swayGrass(t: number): void {
  swayTufts(tufts, t);
}

// ---------------------------------------------------------------------------------------------
// Palisade wall with a gate, and an archer tower behind it.

const WALL_Z = -4;
const shake = { amp: 0, t: 0 };

function buildWall(): void {
  if (style !== "block") {
    buildStoneWall(scene, WALL_Z);
    return;
  }
  // Square palisade logs with stepped points, plank cross-beams.
  for (let x = -14; x <= 14; x += 0.42) {
    if (Math.abs(x) < 1.3) continue;
    const h = 1.45 + Math.round(Math.sin(x * 7.1) * 2) * 0.05;
    const log = block(0.4, h, 0.4, TILES.bark(), TILES.logTop());
    log.position.set(x, h / 2, WALL_Z);
    const t1 = block(0.28, 0.16, 0.28, TILES.logTop(), TILES.logTop());
    t1.position.y = h / 2 + 0.08;
    const t2 = block(0.14, 0.14, 0.14, TILES.logTop(), TILES.logTop());
    t2.position.y = 0.15;
    t1.add(t2);
    log.add(t1);
    scene.add(log);
  }
  for (const k of [-1, 1]) {
    const beam = block(12.6, 0.2, 0.14, TILES.plank());
    beam.position.set(k * 7.6, 0.75, WALL_Z + 0.27);
    scene.add(beam);
  }
  // Gate: vertical planks, iron bands with rivets, gate posts.
  const gate = new THREE.Group();
  const doors = block(2.5, 1.7, 0.3, TILES.plankV(), TILES.plank());
  doors.position.y = 0.85;
  gate.add(doors);
  for (const y of [0.4, 1.3]) {
    const band = block(2.56, 0.14, 0.36, TILES.iron());
    band.position.y = y;
    gate.add(band);
    for (let i = -2; i <= 2; i++) {
      const rivet = block(0.07, 0.07, 0.07, TILES.iron(), TILES.iron(), false);
      rivet.position.set(i * 0.5, y, 0.2);
      gate.add(rivet);
    }
  }
  for (const k of [-1, 1]) {
    const post = block(0.5, 2.2, 0.5, TILES.bark(), TILES.logTop());
    post.position.set(k * 1.5, 1.1, 0);
    gate.add(post);
  }
  gate.position.z = WALL_Z;
  scene.add(gate);
}

interface Tower {
  group: THREE.Group;
  archers: Char[];
  banner: THREE.Mesh;
  cooldown: number[];
}

function buildTower(x: number, z: number): Tower {
  let g = new THREE.Group();
  let cloth: THREE.Mesh;
  if (style !== "block") {
    const props = buildSmoothTowerProps();
    g = props.g;
    cloth = props.banner;
  } else {
  for (const [px, pz] of [[-0.8, -0.6], [0.8, -0.6], [-0.8, 0.6], [0.8, 0.6]] as const) {
    const p = block(0.25, 2.6, 0.25, TILES.bark(), TILES.logTop());
    p.position.set(px, 1.3, pz);
    g.add(p);
  }
  for (const k of [-1, 1]) {
    const brace = block(0.1, 2.1, 0.1, TILES.plank());
    brace.position.set(0, 1.25, 0.62);
    brace.rotation.z = k * 0.62;
    g.add(brace);
  }
  const deck = block(2.2, 0.25, 1.7, TILES.plank());
  deck.position.y = 2.65;
  g.add(deck);
  for (let i = -2; i <= 2; i++) {
    const merlon = block(0.32, 0.35, 0.16, TILES.plank());
    merlon.position.set(i * 0.46, 2.95, 0.82);
    g.add(merlon);
  }
  const pole = block(0.06, 1.6, 0.06, TILES.bark());
  pole.position.set(1.0, 3.5, -0.7);
  g.add(pole);
  cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5, 12, 4), toon(0xffffff, { map: TILES.banner(), side: THREE.DoubleSide }));
  cloth.position.set(1.42, 4.05, -0.7);
  cloth.castShadow = true;
  (cloth.userData as { base: Float32Array }).base = (cloth.geometry.attributes.position!.array as Float32Array).slice();
  g.add(cloth);
  }
  const archers: Char[] = [];
  for (const ax of [-0.45, 0.45]) {
    const a = makeChar({ style, palette: PALETTES.archer, weapon: "bow", head: "hood", scale: 0.62 });
    a.root.position.set(ax, 2.78, 0.1);
    g.add(a.root);
    archers.push(a);
  }
  g.position.set(x, 0, z);
  scene.add(g);
  return { group: g, archers, banner: cloth, cooldown: [0.4, 1.1] };
}

function waveBanner(m: THREE.Mesh, t: number): void {
  const base = (m.userData as { base: Float32Array }).base;
  const pos = m.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3]!, y = base[i * 3 + 1]!;
    const k = (x + 0.4) / 0.8; // 0 at the pole → 1 at the tail
    pos.setZ(i, Math.sin(t * 6 - k * 5) * 0.09 * k + Math.sin(t * 3.3 + y * 4) * 0.02 * k);
  }
  pos.needsUpdate = true;
  m.geometry.computeVertexNormals();
}

// ---------------------------------------------------------------------------------------------
// Projectiles (arcing, rotating arrows with fading trails) and pooled particles.

interface Arrow {
  mesh: THREE.Group;
  from: THREE.Vector3;
  to: () => THREE.Vector3;
  t: number;
  dur: number;
  arc: number;
  trail: THREE.Line;
  hist: THREE.Vector3[];
  onHit: () => void;
}
const arrows: Arrow[] = [];
const arrowMat = toon(0x8a5a2e), tipMat = toon(0xd8dce4), fletchMat = toon(0xfff1c8), fletchRed = toon(0xd84a3a);

function makeArrowMesh(): THREE.Group {
  if (style !== "block") {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.7, 6), new THREE.MeshStandardMaterial({ color: 0x8a5a2e, roughness: 0.7 }));
    shaft.rotation.x = Math.PI / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 8), new THREE.MeshStandardMaterial({ color: 0xd8dce4, metalness: 0.7, roughness: 0.35 }));
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.42;
    const fl = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.01, 0.16), new THREE.MeshStandardMaterial({ color: 0xf2f0e6 }));
    fl.position.z = -0.3;
    g.add(shaft, tip, fl);
    return g;
  }
  // Voxel arrow: square shaft, steel head, red/white fletching.
  const g = new THREE.Group();
  const shaft = part(new THREE.BoxGeometry(0.05, 0.05, 0.7), arrowMat, 0.15);
  const tip = part(new THREE.BoxGeometry(0.1, 0.1, 0.12), tipMat, 0.1);
  tip.position.z = 0.4;
  const f1 = part(new THREE.BoxGeometry(0.16, 0.02, 0.14), fletchMat, 0);
  f1.position.z = -0.3;
  const f2 = part(new THREE.BoxGeometry(0.02, 0.16, 0.14), fletchRed, 0);
  f2.position.z = -0.3;
  g.add(shaft, tip, f1, f2);
  return g;
}

function shoot(from: THREE.Vector3, to: () => THREE.Vector3, onHit: () => void): void {
  const mesh = makeArrowMesh();
  scene.add(mesh);
  const trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xfff6d0, transparent: true, opacity: 0.55 }));
  scene.add(trail);
  const dist = from.distanceTo(to());
  arrows.push({ mesh, from: from.clone(), to, t: 0, dur: 0.35 + dist * 0.035, arc: 0.6 + dist * 0.12, trail, hist: [], onHit });
  burst(from, 0xfff6c0, 4, 1.5, 0.15);
}

function updateArrows(dt: number): void {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i]!;
    a.t += dt;
    const u = Math.min(1, a.t / a.dur);
    const to = a.to();
    const p = a.from.clone().lerp(to, u);
    p.y += Math.sin(u * Math.PI) * a.arc;
    // Orient along the velocity (look slightly ahead on the arc).
    const u2 = Math.min(1, u + 0.02);
    const ahead = a.from.clone().lerp(to, u2);
    ahead.y += Math.sin(u2 * Math.PI) * a.arc;
    a.mesh.position.copy(p);
    a.mesh.lookAt(ahead);
    a.hist.push(p.clone());
    if (a.hist.length > 7) a.hist.shift();
    a.trail.geometry.setFromPoints(a.hist);
    if (u >= 1) {
      a.onHit();
      scene.remove(a.mesh, a.trail);
      arrows.splice(i, 1);
    }
  }
}

// Particle pool: small toon-shaded chunks / sparks with gravity and fade.
interface Bit { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; max: number; grav: number }
const bits: Bit[] = [];
const bitGeo = style === "block" ? new THREE.BoxGeometry(0.09, 0.09, 0.09) : new THREE.IcosahedronGeometry(0.06, 0);
const dustGeo = style === "block" ? new THREE.BoxGeometry(0.2, 0.2, 0.2) : new THREE.IcosahedronGeometry(0.13, 1);
function burst(at: THREE.Vector3, color: number, n: number, speed: number, life: number, grav = 6): void {
  for (let i = 0; i < n && bits.length < 260; i++) {
    const mesh = new THREE.Mesh(bitGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
    mesh.position.copy(at);
    const a = rnd() * Math.PI * 2, up = 0.4 + rnd() * 0.9;
    const vel = new THREE.Vector3(Math.cos(a), up, Math.sin(a)).multiplyScalar(speed * (0.5 + rnd()));
    scene.add(mesh);
    bits.push({ mesh, vel, life, max: life, grav });
  }
}
function dust(at: THREE.Vector3, n = 10, size = 1): void {
  for (let i = 0; i < n && bits.length < 260; i++) {
    const mesh = new THREE.Mesh(dustGeo, new THREE.MeshBasicMaterial({ color: 0xd8c4a0, transparent: true, opacity: 0.7 }));
    mesh.scale.setScalar(size);
    mesh.rotation.set(rnd() * 3, rnd() * 3, 0);
    const a = (i / n) * Math.PI * 2;
    mesh.position.set(at.x + Math.cos(a) * 0.2, 0.12, at.z + Math.sin(a) * 0.2);
    scene.add(mesh);
    bits.push({ mesh, vel: new THREE.Vector3(Math.cos(a) * 2.2 * size, 0.6, Math.sin(a) * 2.2 * size), life: 0.55, max: 0.55, grav: 0 });
  }
}
function updateBits(dt: number): void {
  for (let i = bits.length - 1; i >= 0; i--) {
    const b = bits[i]!;
    b.life -= dt;
    b.vel.y -= b.grav * dt;
    b.vel.multiplyScalar(Math.exp(-dt * 2.5));
    b.mesh.position.addScaledVector(b.vel, dt);
    const k = Math.max(0, b.life / b.max);
    (b.mesh.material as THREE.MeshBasicMaterial).opacity = k;
    b.mesh.scale.setScalar(0.6 + k * 0.6);
    b.mesh.rotation.x += dt * 6;
    b.mesh.rotation.y += dt * 4;
    if (b.life <= 0) {
      scene.remove(b.mesh);
      bits.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Scenes.

const clock = { t: 0 };
const updaters: ((dt: number, t: number) => void)[] = [];

if (view === "turn") {
  // Turntable: hero, footman, brute on a pedestal, cycling idle → run → attack.
  const ped =
    style === "block"
      ? block(TILE * 10, TILE * 0.5, TILE * 4, TILES.grassSide(), TILES.grass(), true, TILES.dirt())
      : new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.8, 0.3, 64), new THREE.MeshStandardMaterial({ color: 0x4a9e52, roughness: 0.9 }));
  ped.receiveShadow = true;
  ped.position.y = style === "block" ? -TILE * 0.25 : -0.15;
  scene.add(ped);
  scene.background = new THREE.Color(style === "block" ? 0x2a3550 : 0x7fa8cc);
  scene.fog = null;
  const cast = [
    makeChar({ style, palette: PALETTES.footman, weapon: "sword", head: "helmet", shield: true, fierce: true }),
    makeChar({ style, palette: PALETTES.hero, weapon: "bow", head: "crown" }),
    makeChar({ style, palette: PALETTES.brute, weapon: "club", head: "horns", scale: 1.35, bulk: 1.3, fierce: true, brute: true }),
  ];
  cast.forEach((c, i) => {
    c.root.position.set((i - 1) * 2.2, 0, 0);
    scene.add(c.root);
  });
  const modes = ["idle", "run", "attack"] as const;
  const focus = params.get("focus");
  const forced = params.get("mode") as (typeof modes)[number] | null;
  const rot = params.get("rot");
  if (focus !== null) {
    const c = cast[+focus]!;
    const h = 1.6 * (c.spec.scale ?? 1);
    camera.position.set(c.root.position.x, h * 0.75, 3.6 * (c.spec.scale ?? 1));
    camera.lookAt(c.root.position.x, h * 0.55, 0);
  }
  updaters.push((dt, t) => {
    const mode = forced ?? modes[Math.floor(t / 2.2) % modes.length]!;
    cast.forEach((c, i) => {
      c.face(rot !== null ? +rot : Math.sin(t * 0.6 + i * 1.3) * 0.75);
      if (forced === "attack") {
        if (c.mode !== "attack" && c.mode !== "hit") c.setMode("attack");
      } else if (mode === "attack") {
        if (c.mode !== "attack" && Math.floor(t * 10) % 11 === i * 3) c.setMode("attack");
      } else c.setMode(mode);
      c.update(dt);
    });
  });
} else {
  buildGround();
  buildWall();
  const towers = [buildTower(-3.9, WALL_Z + 1.2), buildTower(3.9, WALL_Z + 1.2)];
  const hero = makeChar({ style, palette: PALETTES.hero, weapon: "bow", head: "crown" });
  hero.root.position.set(1.6, 0, -0.6);
  scene.add(hero.root);

  // Enemies march from the far field toward the wall in loose formation.
  interface Foe { c: Char; hp: number; speed: number; lane: number; attackCd: number; brute: boolean; telegraph?: THREE.Mesh }
  const foes: Foe[] = [];
  /** X of the enemy road at depth z (piecewise-linear through ENEMY_PATH, which runs toward -z). */
  const pathX = (z: number): number => {
    for (let i = 0; i < ENEMY_PATH.length - 1; i++) {
      const [ax, az] = ENEMY_PATH[i]!, [bx, bz] = ENEMY_PATH[i + 1]!;
      if (z <= az && z >= bz) return ax + ((z - az) / (bz - az)) * (bx - ax);
    }
    return ENEMY_PATH[ENEMY_PATH.length - 1]![0];
  };
  const spawnFoot = (lane: number, delay: number): void => {
    const c = makeChar({ style, palette: PALETTES.footman, weapon: "sword", head: "helmet", shield: true, scale: style === "block" ? 0.85 : 0.8, fierce: true });
    c.root.position.set(style === "block" ? lane + (rnd() - 0.5) * 0.6 : pathX(-15 - delay) + lane, 0, -15 - delay);
    c.face(0);
    c.runSpeed = 0.85 + rnd() * 0.3;
    c.setMode("run");
    scene.add(c.root);
    foes.push({ c, hp: 3, speed: 1.1 + rnd() * 0.35, lane, attackCd: 1 + rnd(), brute: false });
  };
  const spawnBrute = (): void => {
    const c = makeChar({ style, palette: PALETTES.brute, weapon: "club", head: "horns", scale: 1.25, bulk: 1.3, fierce: true, brute: true });
    const bl = style === "block" ? -1.9 : 1.0;
    c.root.position.set(style === "block" ? bl : pathX(-19) + bl, 0, style === "block" ? -16 : -19);
    c.runSpeed = 0.7;
    c.setMode("run");
    scene.add(c.root);
    foes.push({ c, hp: 14, speed: 0.8, lane: bl, attackCd: 0.6, brute: true });
  };
  const spawnWave = (): void => {
    if (style === "block") {
      for (let i = 0; i < 7; i++) spawnFoot(-4 + (i % 4) * 2.4 + (i > 3 ? 1.2 : 0), i * 0.9);
    } else {
      // A red horde streaming down the road: three abreast, tightly packed.
      for (let i = 0; i < 18; i++) spawnFoot(((i % 3) - 1) * 0.55, Math.floor(i / 3) * 0.75 + (i % 2) * 0.2);
    }
    spawnBrute();
  };
  spawnWave();

  const target = (): Foe | undefined => foes.filter((f) => f.c.isAlive && f.c.root.position.z > -13).sort((a, b) => b.c.root.position.z - a.c.root.position.z)[0];
  const chest = (c: Char): THREE.Vector3 => c.root.position.clone().add(new THREE.Vector3(0, 0.9 * (c.spec.scale ?? 1), 0));
  const damage = (f: Foe, from: THREE.Vector3, power: number): void => {
    const dir = f.c.root.position.clone().sub(from);
    burst(chest(f.c), 0xffffff, 5, 2.2, 0.22, 4);
    f.hp -= power;
    if (f.hp <= 0) {
      f.c.die(dir);
      burst(chest(f.c), f.brute ? 0x6a8a3a : 0xc8382c, 12, 3, 0.5);
      burst(chest(f.c), 0xffd84a, 6, 2.6, 0.7, 9); // coins pop out
      if (f.brute) shake.amp = 0.25;
      if (f.telegraph) scene.remove(f.telegraph);
    } else f.c.hit(dir, f.brute ? 0.35 : 1);
  };

  let heroCd = 0.6;
  let respawnT = 0;
  updaters.push((dt, t) => {
    swayGrass(t);
    for (const tw of towers) waveBanner(tw.banner, t + tw.group.position.x);
    // Hero: aims at the nearest marching enemy, draws and looses with recoil.
    const tg = target();
    if (tg) {
      const d = tg.c.root.position.clone().sub(hero.root.position);
      hero.face(Math.atan2(d.x, d.z));
      heroCd -= dt;
      if (heroCd <= 0 && hero.mode !== "attack") {
        hero.setMode("attack");
        hero.onStrike = () => {
          const f = target();
          if (!f) return;
          shoot(chest(hero), () => chest(f.c), () => f.c.isAlive && damage(f, hero.root.position, 1));
        };
        heroCd = 0.75;
      }
    } else hero.setMode("idle");
    hero.update(dt);
    // Tower archers turn to their target and fire in turn.
    for (const tw of towers) {
      tw.archers.forEach((a, i) => {
        const f = target();
        if (f) {
          const wp = new THREE.Vector3();
          a.root.getWorldPosition(wp);
          const d = f.c.root.position.clone().sub(wp);
          a.face(Math.atan2(d.x, d.z));
          tw.cooldown[i]! -= dt;
          if (tw.cooldown[i]! <= 0) {
            tw.cooldown[i] = 1.4 + rnd() * 0.5;
            a.setMode("attack");
            a.onStrike = () => {
              const ff = target();
              if (!ff) return;
              const from = new THREE.Vector3();
              a.root.getWorldPosition(from);
              from.y += 0.5;
              shoot(from, () => chest(ff.c), () => ff.c.isAlive && damage(ff, from, 1));
            };
          }
        }
        a.update(dt);
      });
    }
    // Enemies: march (with formation sway), stop at the wall and attack it.
    for (const f of foes) {
      const c = f.c;
      if (c.isAlive) {
        const front = WALL_Z - 0.75 - (f.brute ? 0.4 : 0);
        if (c.root.position.z < front) {
          if (c.mode !== "hit") {
            c.setMode("run");
            c.root.position.z += f.speed * dt;
            if (style === "block") c.root.position.x += Math.sin(t * 1.3 + f.lane) * 0.15 * dt;
            else {
              // Follow the winding road, keeping the column's lane offset.
              const want = pathX(c.root.position.z) + f.lane;
              c.root.position.x += (want - c.root.position.x) * Math.min(1, dt * 3);
            }
            c.face(0);
          }
        } else {
          c.face(0);
          f.attackCd -= dt;
          if (f.brute) {
            // Telegraph: a pulsing red ring on the wall before the slam.
            if (!f.telegraph) {
              const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.85, 32), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
              ring.rotation.x = -Math.PI / 2;
              ring.position.set(c.root.position.x, 0.03, WALL_Z + 0.2);
              scene.add(ring);
              f.telegraph = ring;
            }
            const pulse = 1 + Math.max(0, 1 - f.attackCd) * 0.5;
            f.telegraph.scale.setScalar(pulse);
            (f.telegraph.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.4 * Math.abs(Math.sin(t * 8));
          }
          if (f.attackCd <= 0 && c.mode !== "attack" && c.mode !== "hit") {
            c.setMode("attack");
            c.onStrike = () => {
              const hitAt = new THREE.Vector3(c.root.position.x, 0.6, WALL_Z);
              burst(hitAt, 0xa8865a, f.brute ? 14 : 5, f.brute ? 3.2 : 2, 0.45);
              if (f.brute) {
                dust(new THREE.Vector3(c.root.position.x, 0, WALL_Z - 0.3), 14, 1.4);
                shake.amp = 0.18;
              }
            };
            f.attackCd = f.brute ? 2.2 : 1.1 + rnd() * 0.4;
          }
        }
        // Marching dust puffs every few steps.
        if (c.mode === "run" && rnd() < dt * 2.5) dust(c.root.position, 2, 0.5);
      }
      c.update(dt);
    }
    // Loop the demo: clear the fallen and send a new group when the field is empty.
    for (let i = foes.length - 1; i >= 0; i--) {
      if (foes[i]!.c.deadFor > 1.6) {
        scene.remove(foes[i]!.c.root);
        foes.splice(i, 1);
      }
    }
    if (!foes.some((f) => f.c.isAlive)) {
      respawnT += dt;
      if (respawnT > 1) {
        respawnT = 0;
        spawnWave();
      }
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Loop (fixed-step friendly: captures can step time deterministically via __lookdev.step).

const camBase = camera.position.clone();
function step(dt: number, draw = true): void {
  clock.t += dt;
  for (const u of updaters) u(dt, clock.t);
  updateArrows(dt);
  updateBits(dt);
  shake.amp *= Math.exp(-dt * 8);
  camera.position.copy(camBase).add(new THREE.Vector3(Math.sin(clock.t * 61) * shake.amp, Math.cos(clock.t * 53) * shake.amp * 0.6, 0));
  if (draw) renderer.render(scene, camera);
}
let manual = params.has("capture");
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!manual) step(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
(window as unknown as { __lookdev: unknown }).__lookdev = {
  /** Freeze real time and advance the scene by `seconds` in fixed 1/60 s steps (for captures). */
  step(seconds: number): void {
    manual = true;
    const n = Math.max(1, Math.round(seconds * 60));
    for (let k = 0; k < n; k++) step(1 / 60, k === n - 1);
  },
};
