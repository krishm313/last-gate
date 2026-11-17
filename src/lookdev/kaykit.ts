// Skinned, keyframe-animated characters from the CC0 KayKit packs (Kay Lousberg,
// www.kaylousberg.com): Adventurers + Skeletons. Each instance is a SkeletonUtils clone with its
// own AnimationMixer; a small state machine crossfades between the pack's professional clips
// (idle / run / attack / hit / death) and fires onStrike at the attack's contact frame. Exposes
// the same surface as the procedural Character so the look-dev scene can drive either.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

export type KKModel = "Knight" | "Barbarian" | "Rogue_Hooded" | "Skeleton_Minion" | "Skeleton_Warrior";

interface Loaded {
  scene: THREE.Group;
  clips: Map<string, THREE.AnimationClip>;
  height: number;
}
const cache = new Map<string, Loaded>();
const loader = new GLTFLoader();

export async function loadKK(models: KKModel[]): Promise<void> {
  await Promise.all(
    models.map(async (m) => {
      if (cache.has(m)) return;
      const gltf = await loader.loadAsync(`./kaykit/${m}.glb`);
      const clips = new Map(gltf.animations.map((a) => [a.name, a] as const));
      const box = new THREE.Box3().setFromObject(gltf.scene);
      cache.set(m, { scene: gltf.scene, clips, height: box.max.y - box.min.y });
    }),
  );
}

type Mode = "idle" | "run" | "attack" | "hit" | "dead";

export interface KKSpec {
  model: KKModel;
  /** Visible accessory meshes (everything else in the hand slots / heads is hidden). */
  show: string[];
  /** Accessories borrowed from another loaded model: [model, nodeName, boneName]. */
  borrow?: [KKModel, string, string][];
  /** Target height in world units. */
  height: number;
  clips: { idle: string; run: string; attack: string; hit: string; death: string };
  /** Fraction of the attack clip at which the blow lands / the shot is released. */
  strikeAt: number;
  /** Optional colour remap of the shared palette texture (e.g. red horde). */
  recolor?: (r: number, g: number, b: number) => [number, number, number];
  /** Add our own gold crown on the head bone. */
  crown?: boolean;
  /** Compatibility with the procedural rig's spec (scene code reads .scale for chest height). */
  scale?: number;
}

const recolorCache = new Map<string, THREE.Texture>();

function recolorTexture(src: THREE.Texture, key: string, fn: NonNullable<KKSpec["recolor"]>): THREE.Texture {
  const hit = recolorCache.get(key);
  if (hit) return hit;
  const img = src.image as HTMLImageElement | ImageBitmap;
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img as CanvasImageSource, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < data.data.length; i += 4) {
    const [r, g, b] = fn(data.data[i]!, data.data[i + 1]!, data.data[i + 2]!);
    data.data[i] = r;
    data.data[i + 1] = g;
    data.data[i + 2] = b;
  }
  ctx.putImageData(data, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = src.flipY;
  t.colorSpace = src.colorSpace;
  t.magFilter = src.magFilter;
  t.minFilter = src.minFilter;
  recolorCache.set(key, t);
  return t;
}

/** A gold crown with five points and gems, sized to the model (in model units). */
function makeCrown(modelH: number): THREE.Group {
  const u = modelH / 2.6; // KayKit adventurers are ~2.6 units tall
  const gold = new THREE.MeshStandardMaterial({ color: 0xf2c440, metalness: 0.85, roughness: 0.3 });
  const g = new THREE.Group();
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.42 * u, 0.4 * u, 0.2 * u, 28, 1, true), gold);
  band.material.side = THREE.DoubleSide;
  g.add(band);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.ConeGeometry(0.09 * u, 0.24 * u, 4), gold);
    p.position.set(Math.sin(a) * 0.41 * u, 0.2 * u, Math.cos(a) * 0.41 * u);
    g.add(p);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035 * u, 10, 8), gold);
    tip.position.set(Math.sin(a) * 0.41 * u, 0.33 * u, Math.cos(a) * 0.41 * u);
    g.add(tip);
  }
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.08 * u), new THREE.MeshStandardMaterial({ color: 0x2a6cff, metalness: 0.2, roughness: 0.1 }));
  gem.position.set(0, 0.02 * u, 0.42 * u);
  gem.scale.set(1, 1.3, 0.6);
  g.add(gem);
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  g.position.y = (CROWN.y as number) * u;
  g.scale.setScalar(CROWN.s as number);
  g.userData.crown = true;
  return g;
}

export const CROWN: Record<string, number> = { y: 0.88, s: 1.3 };
let serial = 0;

export class SkinnedCharacter {
  readonly root = new THREE.Group();
  readonly spec: KKSpec & { scale: number };
  private model: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private mats: THREE.MeshStandardMaterial[] = [];
  mode: Mode = "idle";
  private modeT = 0;
  private attackLen = 1;
  facing = 0;
  private turnTo = 0;
  private turnVel = 0;
  private vel = new THREE.Vector3();
  private flash = 0;
  private alive = true;
  private struck = false;
  runSpeed = 1;
  onStrike: (() => void) | null = null;

  constructor(spec: KKSpec) {
    const L = cache.get(spec.model);
    if (!L) throw new Error(`model ${spec.model} not loaded`);
    const k = spec.height / L.height;
    this.spec = { ...spec, scale: spec.scale ?? spec.height / 1.7 };
    this.model = SkeletonUtils.clone(L.scene);
    this.model.scale.setScalar(k);
    this.root.add(this.model);
    const n = serial++;

    // Accessories: hide everything that isn't the body or explicitly shown.
    const bodyParts = /(ArmLeft|ArmRight|Body|Head|LegLeft|LegRight|Eyes|Jaw|Cloak|Cape|Helmet|Hat)$/;
    this.model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const keep = spec.show.includes(o.name) || (bodyParts.test(o.name) && !/Shield|Sword|Axe|Crossbow|Knife|Mug|Throwable/.test(o.name));
      o.visible = keep;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
    });
    // Hats/helmets/capes can be removed by listing "-Name" in show.
    for (const s of spec.show) if (s.startsWith("-")) {
      const o = this.model.getObjectByName(s.slice(1));
      if (o) o.visible = false;
    }
    for (const [from, node, bone] of spec.borrow ?? []) {
      const src = cache.get(from)?.scene.getObjectByName(node);
      const target = this.model.getObjectByName(bone);
      if (src && target) {
        const copy = src.clone();
        copy.visible = true;
        copy.traverse((o) => {
          o.visible = true;
          (o as THREE.Mesh).castShadow = true;
        });
        target.add(copy);
      }
    }
    if (spec.crown) {
      const head = this.model.getObjectByName("head");
      if (head) head.add(makeCrown(L.height));
    }
    // Per-instance materials so hit flashes / death fades don't leak between characters.
    this.model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as THREE.MeshStandardMaterial;
      const m = src.clone();
      if (spec.recolor && m.map && !/Shield|Sword|Axe|Crossbow|Knife/.test(mesh.name)) m.map = recolorTexture(m.map, `${spec.model}:${m.map.uuid}:${spec.recolor.toString()}`, spec.recolor);
      m.roughness = Math.min(m.roughness, 0.75);
      mesh.material = m;
      this.mats.push(m);
    });

    this.mixer = new THREE.AnimationMixer(this.model);
    for (const name of Object.values(spec.clips)) {
      const clip = L.clips.get(name);
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      if (name === spec.clips.death || name === spec.clips.attack || name === spec.clips.hit) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions.set(name, a);
    }
    this.attackLen = L.clips.get(spec.clips.attack)?.duration ?? 1;
    this.play(spec.clips.idle, 0);
    // Desynchronise idles across a crowd.
    this.mixer.update((n * 0.37) % 2);
  }

  private play(name: string, fade = 0.15, timeScale = 1): void {
    const next = this.actions.get(name);
    if (!next || next === this.current) {
      if (next) next.timeScale = timeScale;
      return;
    }
    next.reset();
    next.timeScale = timeScale;
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.play();
    if (this.current && fade > 0) this.current.crossFadeTo(next, fade, false);
    else if (this.current) this.current.stop();
    this.current = next;
  }

  setMode(m: Mode): void {
    if (!this.alive || this.mode === m) return;
    this.mode = m;
    this.modeT = 0;
    this.struck = false;
    const c = this.spec.clips;
    if (m === "idle") this.play(c.idle, 0.2);
    else if (m === "run") this.play(c.run, 0.18, this.runSpeed);
    else if (m === "attack") this.play(c.attack, 0.08);
  }

  face(angle: number): void {
    this.turnTo = angle;
  }

  hit(dir: THREE.Vector3, power = 1): void {
    if (!this.alive) return;
    this.vel.addScaledVector(dir.clone().setY(0).normalize(), 2.4 * power);
    this.flash = 1;
    this.mode = "hit";
    this.modeT = 0;
    this.play(this.spec.clips.hit, 0.05);
  }

  die(dir: THREE.Vector3): void {
    if (!this.alive) return;
    this.alive = false;
    this.mode = "dead";
    this.modeT = 0;
    const d = dir.clone().setY(0).normalize();
    this.vel.set(d.x * 2.6, 0, d.z * 2.6);
    this.flash = 1;
    for (const m of this.mats) m.transparent = true;
    this.play(this.spec.clips.death, 0.06);
  }

  get isAlive(): boolean {
    return this.alive;
  }

  get deadFor(): number {
    return this.alive ? 0 : this.modeT;
  }

  update(dt: number): void {
    this.modeT += dt;
    let dA = this.turnTo - this.facing;
    dA = Math.atan2(Math.sin(dA), Math.cos(dA));
    this.turnVel += (dA * 140 - this.turnVel * 18) * dt;
    this.facing += this.turnVel * dt;
    this.root.rotation.y = this.facing;
    this.root.position.addScaledVector(this.vel, dt);
    this.vel.multiplyScalar(Math.exp(-dt * (this.alive ? 9 : 5)));

    this.flash = Math.max(0, this.flash - dt * 7);
    for (const m of this.mats) m.emissive.setScalar(this.flash * 0.7);

    const c = this.spec.clips;
    if (this.mode === "run") {
      const a = this.actions.get(c.run);
      if (a) a.timeScale = this.runSpeed;
    } else if (this.mode === "attack") {
      if (!this.struck && this.modeT >= this.attackLen * this.spec.strikeAt) {
        this.struck = true;
        this.onStrike?.();
      }
      if (this.modeT >= this.attackLen * 0.92) {
        this.mode = "idle";
        this.play(c.idle, 0.25);
      }
    } else if (this.mode === "hit") {
      if (this.modeT > 0.4) {
        this.mode = "idle";
        this.play(c.idle, 0.2);
      }
    } else if (this.mode === "dead") {
      const fade = Math.max(0, 1 - Math.max(0, this.modeT - 1.1) / 0.5);
      for (const m of this.mats) m.opacity = fade;
      if (this.modeT > 1.2) this.root.position.y -= dt * 0.5;
    }
    this.mixer.update(dt);
  }
}
