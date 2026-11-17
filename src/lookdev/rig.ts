// Look-development prototype (Phase 0): stylised 3D characters built from primitives, with a soft
// cel ramp, rim light, inverted-hull outlines and procedural animation
// (idle / run / attack per weapon / hit / death). Standalone — not used by the game yet.
import * as THREE from "three";
import { buildBlock } from "./blocky";
import { buildHeroic } from "./heroic";

export const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x24160c, side: THREE.BackSide });

/**
 * Soft three-band cel ramp. Three's toon shader samples it at (N·L * 0.5 + 0.5): shadow below the
 * terminator, a mid band, and a lit band — with short smooth transitions so band edges stay clean
 * curves instead of following the triangles.
 */
export const TOON_RAMP = (() => {
  const w = 256;
  const data = new Uint8Array(w * 4);
  const smooth = (e0: number, e1: number, x: number): number => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < w; i++) {
    const x = i / (w - 1);
    const v = 0.42 + 0.3 * smooth(0.44, 0.48, x) + 0.28 * smooth(0.64, 0.68, x);
    const c = Math.round(v * 255);
    data.set([c, c, c, 255], i * 4);
  }
  const t = new THREE.DataTexture(data, w, 1, THREE.RGBAFormat);
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
})();

const RIM = { value: new THREE.Color(0xfff2d8) };

/** Toon material with a soft fresnel rim (the "premium mobile" edge glow). */
export function toon(
  color: number,
  opts: { emissive?: number; rim?: number; side?: THREE.Side; map?: THREE.Texture; alphaTest?: number } = {},
): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({
    color,
    gradientMap: TOON_RAMP,
    emissive: opts.emissive ?? 0x000000,
    side: opts.side ?? THREE.FrontSide,
    map: opts.map ?? null,
    alphaTest: opts.alphaTest ?? 0,
  });
  const strength = opts.rim ?? 0.32;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = RIM;
    sh.uniforms.rimStrength = { value: strength };
    sh.fragmentShader =
      "uniform vec3 rimColor;\nuniform float rimStrength;\n" +
      sh.fragmentShader.replace(
        "#include <opaque_fragment>",
        `{
          float rimF = 1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
          outgoingLight += rimColor * smoothstep(0.58, 0.92, rimF) * rimStrength;
        }
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => "toon-rim";
  return m;
}

/** A mesh with an inverted-hull outline child; casts and receives shadows. */
export function part(geo: THREE.BufferGeometry, mat: THREE.Material, outline = 0.045): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  if (outline > 0) {
    const o = new THREE.Mesh(geo, OUTLINE);
    o.scale.setScalar(1 + outline);
    o.castShadow = false;
    m.add(o);
  }
  return m;
}

export interface Palette {
  body: number;
  trim: number;
  skin: number;
  helm?: number;
  accent?: number;
  hair?: number;
  cape?: number;
  boots?: number;
}

export type Weapon = "bow" | "sword" | "club";
export type Head = "crown" | "helmet" | "horns" | "hood";

export interface CharacterSpec {
  /** "block" = voxel figures with pixel-art textures; "round" = soft chibi primitives. */
  style?: "block" | "round" | "heroic" | "kaykit";
  palette: Palette;
  weapon: Weapon;
  head: Head;
  shield?: boolean;
  /** Overall size (1 = hero). */
  scale?: number;
  /** Bulk: wider body, thicker limbs (brutes). */
  bulk?: number;
  /** Fierce = angled brows, grim mouth (enemies). */
  fierce?: boolean;
  /** Brute extras: tusks, topknot, spiked pauldron. */
  brute?: boolean;
}

type Mode = "idle" | "run" | "attack" | "hit" | "dead";

const ease = {
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inQuad: (t: number) => t * t,
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number) => {
    const c = 1.7;
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
  },
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

let instance = 0;

/** A limb: shoulder/hip pivot → upper segment → elbow/knee pivot → lower segment (+ hand/foot). */
export interface Limb {
  root: THREE.Group;
  joint: THREE.Group;
  end: THREE.Group;
}

/**
 * A rigid-part character: hips → torso → head / shoulders → arms (elbows) → hands (+ weapon);
 * hips → legs (knees) → boots. Animation is procedural: joints follow eased curves driven by a
 * small state machine, with squash & stretch on the root, secondary motion (cape, head lag),
 * facial expressions (blink, wince) and a white emissive flash on hits.
 */
export class Character {
  readonly root = new THREE.Group();
  hips = new THREE.Group();
  torso = new THREE.Group();
  neck = new THREE.Group();
  head = new THREE.Group();
  eyes: THREE.Group[] = [];
  armL!: Limb;
  armR!: Limb;
  legL!: Limb;
  legR!: Limb;
  weapon = new THREE.Group();
  cape: THREE.Mesh | null = null;
  /** Rigid two-part cape (block style): hinge at the shoulders and at mid-length. */
  capeRig: THREE.Object3D | null = null;
  capeLower: THREE.Object3D | null = null;
  hipY = 0.5;
  capeBase: Float32Array | null = null;
  toonMats: (THREE.MeshToonMaterial | THREE.MeshStandardMaterial)[] = [];
  capeLen = 0.62;
  allMats: THREE.Material[] = [];
  mode: Mode = "idle";
  private t = 0;
  private modeT = 0;
  private phase: number;
  private blinkAt: number;
  /** Facing (radians around Y; 0 = toward +Z / the camera). */
  facing = 0;
  private turnTo = 0;
  private turnVel = 0;
  /** World-space velocity for knockback / death fling. */
  private vel = new THREE.Vector3();
  private spin = 0;
  private flash = 0;
  private alive = true;
  private runBlend = 0;
  private headLag = 0;
  runSpeed = 1;
  readonly spec: CharacterSpec;
  onStrike: (() => void) | null = null;

  constructor(spec: CharacterSpec) {
    this.spec = spec;
    const n = instance++;
    this.phase = (n * 2.39) % 6.28;
    this.blinkAt = 1 + ((n * 0.73) % 2.5);
    const s = spec.scale ?? 1;
    if (spec.style === "block" || spec.style === "heroic") {
      if (spec.style === "block") buildBlock(this, spec);
      else buildHeroic(this, spec);
      this.root.scale.setScalar(s);
      this.root.traverse((o) => {
        o.receiveShadow = false;
      });
      return;
    }
    const b = spec.bulk ?? 1;
    const p = spec.palette;
    const mat = (c: number, side?: THREE.Side): THREE.MeshToonMaterial => {
      const m = toon(c, { side });
      this.toonMats.push(m);
      this.allMats.push(m);
      return m;
    };
    const basic = (c: number, extra: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial => {
      const m = new THREE.MeshBasicMaterial({ color: c, ...extra });
      this.allMats.push(m);
      return m;
    };
    const body = mat(p.body), trim = mat(p.trim), skin = mat(p.skin), boots = mat(p.boots ?? 0x4a2c18);
    const gold = mat(0xf2c443), metal = mat(0xc4cad4);

    this.root.add(this.hips);
    this.hips.position.y = 0.5;

    // --- Legs: thigh → knee → shin + boot with a cuff. -------------------------------------
    const makeLeg = (x: number): Limb => {
      const root = new THREE.Group();
      root.position.set(x, 0, 0);
      const thigh = part(new THREE.CapsuleGeometry(0.11 * b, 0.1, 6, 14), trim);
      thigh.position.y = -0.1;
      const joint = new THREE.Group();
      joint.position.y = -0.21;
      const shin = part(new THREE.CapsuleGeometry(0.1 * b, 0.06, 6, 14), trim, 0.03);
      shin.position.y = -0.07;
      const end = new THREE.Group();
      end.position.y = -0.2;
      const boot = part(new THREE.SphereGeometry(0.135 * b, 20, 14), boots);
      boot.scale.set(1, 0.72, 1.4);
      boot.position.set(0, -0.04, 0.05);
      const cuff = part(new THREE.CylinderGeometry(0.125 * b, 0.12 * b, 0.07, 18), boots, 0.04);
      cuff.position.y = 0.06;
      end.add(boot, cuff);
      joint.add(shin, end);
      root.add(thigh, joint);
      this.hips.add(root);
      return { root, joint, end };
    };
    this.legL = makeLeg(-0.15 * b);
    this.legR = makeLeg(0.15 * b);

    // --- Torso: a lathed tunic body, flared skirt, belt with a buckle. ---------------------
    this.hips.add(this.torso);
    const prof = [
      [0, -0.02], [0.27, -0.02], [0.31, 0.06], [0.31, 0.2], [0.28, 0.34], [0.22, 0.44], [0.12, 0.5], [0, 0.51],
    ].map(([r, y]) => new THREE.Vector2(r! * b, y!));
    const chest = part(new THREE.LatheGeometry(prof, 28), body);
    chest.scale.z = 0.86;
    const skirt = part(new THREE.CylinderGeometry(0.29 * b, 0.35 * b, 0.18, 28, 1, true), mat(p.body, THREE.DoubleSide), 0.03);
    skirt.position.y = -0.05;
    skirt.scale.z = 0.88;
    const belt = part(new THREE.CylinderGeometry(0.305 * b, 0.31 * b, 0.075, 28), mat(0x5a3418), 0.03);
    belt.position.y = 0.06;
    belt.scale.z = 0.88;
    const buckle = part(new THREE.BoxGeometry(0.11, 0.09, 0.04), gold, 0.05);
    buckle.position.set(0, 0.06, 0.27 * b);
    // Tunic trim: a contrasting stripe down the front.
    const stripe = part(new THREE.BoxGeometry(0.09 * b, 0.3, 0.02), trim, 0);
    stripe.position.set(0, 0.25, 0.262 * b);
    stripe.rotation.x = -0.12;
    this.torso.add(chest, skirt, belt, buckle, stripe);

    // --- Head: oversized (~40% of height), with a full face. ------------------------------
    this.neck.position.y = 0.5;
    this.torso.add(this.neck);
    this.head.position.y = 0.3;
    this.neck.add(this.head);
    const headR = 0.36;
    const skull = part(new THREE.SphereGeometry(headR, 44, 32), skin);
    skull.scale.set(spec.brute ? 1.12 : 1, spec.brute ? 0.94 : 0.97, spec.brute ? 1.04 : 0.96);
    this.head.add(skull);
    this.buildFace(headR, skin, basic, !!spec.fierce, !!spec.brute);
    this.addHeadgear(spec.head, mat(p.helm ?? p.trim), mat(p.hair ?? 0x6a3a1c), gold, metal, mat(p.accent ?? 0xd8382c), headR);

    // --- Arms: shoulder → elbow → forearm + hand (gloves on soldiers). ---------------------
    const gloves = spec.head === "helmet" ? mat(0x6a4426) : skin;
    const makeArm = (x: number): Limb => {
      const root = new THREE.Group();
      root.position.set(x, 0.4, 0);
      const sleeve = part(new THREE.SphereGeometry(0.11 * b, 16, 12), body);
      sleeve.scale.y = 0.9;
      const upper = part(new THREE.CapsuleGeometry(0.085 * b, 0.1, 6, 12), body);
      upper.position.y = -0.1;
      const joint = new THREE.Group();
      joint.position.y = -0.2;
      const fore = part(new THREE.CapsuleGeometry(0.08 * b, 0.08, 6, 12), spec.brute ? skin : body, 0.04);
      fore.position.y = -0.07;
      const end = new THREE.Group();
      end.position.y = -0.19;
      const hand = part(new THREE.SphereGeometry(0.1 * b, 16, 12), gloves);
      end.add(hand);
      joint.add(fore, end);
      root.add(sleeve, upper, joint);
      this.torso.add(root);
      return { root, joint, end };
    };
    this.armL = makeArm(-0.37 * b);
    this.armR = makeArm(0.37 * b);

    // Shoulder armour.
    if (spec.head === "helmet" || spec.brute) {
      for (const [arm, k] of [[this.armL, -1], [this.armR, 1]] as const) {
        if (spec.brute && k < 0) continue; // asymmetric: one big pauldron
        const pad = part(new THREE.SphereGeometry(0.17 * b, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), spec.brute ? mat(0x6a6e78) : metal);
        pad.position.y = 0.04;
        pad.rotation.z = -k * 0.35;
        arm.root.add(pad);
        if (spec.brute) {
          for (let i = 0; i < 3; i++) {
            const spike = part(new THREE.ConeGeometry(0.04, 0.16, 8), mat(0xe8dcc0), 0.06);
            spike.position.set((i - 1) * 0.09, 0.2, 0);
            spike.rotation.z = -(i - 1) * 0.4;
            pad.add(spike);
          }
        }
      }
    }

    // Weapon: bows are held in the left hand, melee weapons in the right.
    (spec.weapon === "bow" ? this.armL : this.armR).end.add(this.weapon);
    this.buildWeapon(spec.weapon, mat, gold, metal);
    if (spec.shield) {
      const sh = new THREE.Group();
      // Strapped to the forearm: the face looks along the forearm (hand -Y), so a raised
      // forearm presents the shield to the front.
      const face = part(new THREE.CylinderGeometry(0.27, 0.27, 0.06, 32), mat(0x8a5a30));
      const rim = part(new THREE.TorusGeometry(0.27, 0.035, 8, 32), metal, 0.04);
      rim.rotation.x = Math.PI / 2;
      const band = part(new THREE.BoxGeometry(0.1, 0.075, 0.5), mat(p.body), 0);
      const boss = part(new THREE.SphereGeometry(0.075, 14, 10), metal, 0.04);
      boss.position.y = -0.04;
      sh.add(face, rim, band, boss);
      sh.position.set(-0.08, -0.02, 0);
      this.armL.end.add(sh);
    }

    // Hero cape (vertex-animated cloth) + gold collar, and a quiver for bow users.
    if (p.cape !== undefined) {
      const geo = new THREE.PlaneGeometry(0.56 * b, 0.62, 6, 10);
      geo.translate(0, -0.31, 0);
      const cape = new THREE.Mesh(geo, mat(p.cape, THREE.DoubleSide));
      cape.castShadow = true;
      cape.position.set(0, 0.46, -0.24 * b);
      this.torso.add(cape);
      this.cape = cape;
      this.capeBase = (geo.attributes.position!.array as Float32Array).slice();
      const collar = part(new THREE.TorusGeometry(0.19, 0.05, 10, 24), gold, 0.05);
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 0.48;
      this.torso.add(collar);
    }
    if (spec.weapon === "bow") {
      const quiver = part(new THREE.CylinderGeometry(0.075, 0.065, 0.42, 14), mat(0x6a4426));
      quiver.position.set(0.12, 0.3, -0.27 * b);
      quiver.rotation.z = -0.5;
      for (let i = 0; i < 3; i++) {
        const fl = part(new THREE.ConeGeometry(0.035, 0.1, 6), mat(i === 1 ? 0xf2f0e6 : 0xd84a3a), 0.05);
        fl.position.set((i - 1) * 0.035, 0.25, (i % 2) * 0.02);
        quiver.add(fl);
      }
      this.torso.add(quiver);
    }

    this.root.scale.setScalar(s);
    // Characters cast shadows onto the world but do not self-shadow (no acne on the cel ramp).
    this.root.traverse((o) => {
      o.receiveShadow = false;
    });
  }

  /** Place a face feature on the head sphere at (latitude, longitude), facing outward. */
  private onHead(m: THREE.Object3D, r: number, lat: number, lon: number, lift = 0): void {
    const rr = r + lift;
    m.position.set(Math.sin(lon) * Math.cos(lat) * rr, Math.sin(lat) * rr, Math.cos(lon) * Math.cos(lat) * rr);
    m.lookAt(m.position.clone().multiplyScalar(2));
    this.head.add(m);
  }

  private buildFace(r: number, skin: THREE.Material, basic: (c: number, e?: THREE.MeshBasicMaterialParameters) => THREE.MeshBasicMaterial, fierce: boolean, brute: boolean): void {
    const white = basic(0xffffff), ink = basic(0x24160c), iris = basic(brute ? 0xe8b020 : 0x3a2414);
    const eyeLon = brute ? 0.36 : 0.34, eyeLat = brute ? 0.02 : -0.04;
    for (const k of [-1, 1]) {
      // Eye: white sclera, big iris, pupil, two highlights. Grouped so it can blink.
      const eye = new THREE.Group();
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.08, 20, 14), white);
      sclera.scale.set(brute ? 0.8 : 0.82, brute ? 0.7 : 1.05, 0.32);
      const ir = new THREE.Mesh(new THREE.SphereGeometry(0.058, 18, 12), iris);
      ir.scale.set(0.85, brute ? 0.85 : 1.05, 0.3);
      ir.position.set(-k * 0.006, -0.006, 0.018);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.034, 14, 10), ink);
      pupil.scale.set(0.9, 1, 0.3);
      pupil.position.set(-k * 0.006, -0.008, 0.026);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), white);
      hl.position.set(0.018, 0.024, 0.034);
      const hl2 = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), white);
      hl2.position.set(-0.014, -0.02, 0.034);
      // Outline ring around the sclera for definition.
      const ring = new THREE.Mesh(new THREE.SphereGeometry(0.088, 20, 14), ink);
      ring.scale.set(brute ? 0.8 : 0.82, brute ? 0.72 : 1.05, 0.28);
      ring.position.z = -0.006;
      eye.add(ring, sclera, ir, pupil, hl, hl2);
      this.onHead(eye, r, eyeLat, k * eyeLon, -0.012);
      this.eyes.push(eye);
      // Brow: angled down toward the nose when fierce.
      const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, brute ? 0.13 : 0.08, 4, 8), basic(brute ? 0x1d2a10 : 0x4a2c18));
      brow.rotation.z = Math.PI / 2;
      const bg = new THREE.Group();
      bg.add(brow);
      this.onHead(bg, r, eyeLat + (brute ? 0.2 : 0.24), k * (eyeLon + 0.02), 0.004);
      bg.rotateZ(fierce ? k * 0.38 : -k * 0.12);
      // Ear.
      const ear = part(new THREE.SphereGeometry(0.075, 14, 10), skin, 0.06);
      ear.scale.set(0.5, brute ? 1.4 : 1, 0.8);
      if (brute) ear.rotation.z = -k * 0.6;
      this.onHead(ear, r, 0, k * Math.PI * 0.5, -0.01);
      // Blush.
      if (!brute) {
        const blush = new THREE.Mesh(new THREE.CircleGeometry(0.05, 18), basic(0xff7a6a, { transparent: true, opacity: 0.35 }));
        blush.scale.y = 0.6;
        this.onHead(blush, r, -0.2, k * 0.5, 0.003);
      }
    }
    // Nose.
    const nose = part(new THREE.SphereGeometry(brute ? 0.07 : 0.045, 14, 10), skin, 0.05);
    nose.scale.set(1, 0.85, 0.8);
    this.onHead(nose, r, brute ? -0.1 : -0.13, 0, -0.012);
    // Mouth: a smile, or a grim line for enemies; brutes get tusks.
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(brute ? 0.1 : 0.055, 0.012, 6, 16, Math.PI), ink);
    const mg = new THREE.Group();
    mouth.rotation.z = fierce ? 0 : Math.PI;
    mouth.position.y = fierce ? -0.02 : 0.02;
    if (fierce && !brute) mouth.scale.set(0.8, 0.35, 1);
    mg.add(mouth);
    this.onHead(mg, r, brute ? -0.36 : -0.33, 0, 0);
    if (brute) {
      for (const k of [-1, 1]) {
        // Lower-jaw tusks pointing up past the lip.
        const tusk = part(new THREE.ConeGeometry(0.038, 0.14, 8), toon(0xf6eedc), 0.06);
        const tg = new THREE.Group();
        tusk.position.set(0, 0.04, 0.03);
        tusk.rotation.z = -k * 0.25;
        tg.add(tusk);
        this.onHead(tg, r, -0.5, k * 0.22, 0.0);
      }
    }
  }

  private addHeadgear(kind: Head, helm: THREE.Material, hair: THREE.Material, gold: THREE.Material, metal: THREE.Material, accent: THREE.Material, r: number): void {
    if (kind === "crown") {
      // Swept hair cap with a fringe, then a gold crown with jewels.
      const cap = part(new THREE.SphereGeometry(r * 1.06, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.52), hair);
      cap.rotation.x = -0.32;
      cap.position.set(0, 0.01, -0.02);
      this.head.add(cap);
      for (let i = 0; i < 5; i++) {
        const lock = part(new THREE.SphereGeometry(0.1, 14, 10), hair, 0.05);
        lock.scale.set(1.1, 0.7, 0.8);
        const g = new THREE.Group();
        g.add(lock);
        this.onHead(g, r, 0.42, (i - 2) * 0.32, -0.02);
        g.rotateZ((i - 2) * 0.3);
      }
      const band = part(new THREE.CylinderGeometry(0.25, 0.27, 0.12, 28, 1, true), gold, 0.05);
      band.position.y = 0.33;
      band.rotation.x = -0.12;
      this.head.add(band);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spike = part(new THREE.ConeGeometry(0.05, 0.13, 8), gold, 0.06);
        spike.position.set(Math.sin(a) * 0.25, 0.44, Math.cos(a) * 0.25 - 0.03);
        this.head.add(spike);
        const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), toon(i % 2 ? 0x3ad0ff : 0xff3a5a, { rim: 0.6 }));
        jewel.position.set(Math.sin(a) * 0.27, 0.33, Math.cos(a) * 0.27 - 0.03);
        this.head.add(jewel);
      }
    } else if (kind === "helmet") {
      // Kettle helm: dome + brim + nose guard + a crest plume; moustache below.
      const dome = part(new THREE.SphereGeometry(r * 1.07, 36, 18, 0, Math.PI * 2, 0, Math.PI * 0.5), helm);
      dome.position.y = 0.13;
      const brim = part(new THREE.TorusGeometry(r * 1.06, 0.035, 8, 36), metal, 0.03);
      brim.rotation.x = Math.PI / 2;
      brim.position.y = 0.13;
      brim.scale.setScalar(1.02);
      const guard = part(new THREE.BoxGeometry(0.045, 0.1, 0.035), metal, 0.05);
      this.head.add(dome, brim);
      this.onHead(guard, r, 0.36, 0, 0.04);
      for (let i = 0; i < 5; i++) {
        const plume = part(new THREE.SphereGeometry(0.08, 12, 10), accent, 0.05);
        plume.scale.set(0.55, 1, 1.2);
        const a = 0.3 + i * 0.32;
        plume.position.set(0, Math.cos(a) * 0.46 + 0.1, -Math.sin(a) * 0.46 + 0.04);
        this.head.add(plume);
      }
      const ink = new THREE.MeshBasicMaterial({ color: 0x3a2414 });
      this.allMats.push(ink);
      for (const k of [-1, 1]) {
        const tache = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.07, 4, 8), ink);
        const g = new THREE.Group();
        tache.rotation.z = Math.PI / 2 + k * 0.4;
        g.add(tache);
        this.onHead(g, r, -0.22, k * 0.09, 0.012);
      }
    } else if (kind === "hood") {
      const hood = part(new THREE.SphereGeometry(r * 1.1, 36, 20, 0, Math.PI * 2, 0, Math.PI * 0.6), helm);
      hood.rotation.x = -0.45;
      hood.position.z = -0.03;
      const tip = part(new THREE.ConeGeometry(0.14, 0.3, 14), helm, 0.04);
      tip.position.set(0, 0.28, -0.3);
      tip.rotation.x = -1.1;
      this.head.add(hood, tip);
    } else {
      // Brute: curled horns and a topknot.
      for (const k of [-1, 1]) {
        const horn = part(new THREE.ConeGeometry(0.075, 0.36, 12), toon(0xeee2c6), 0.05);
        horn.position.set(k * 0.32, 0.26, -0.02);
        horn.rotation.z = -k * 0.75;
        this.head.add(horn);
      }
      const knot = part(new THREE.SphereGeometry(0.11, 14, 10), hair, 0.05);
      knot.position.set(0, 0.38, -0.08);
      const tail = part(new THREE.ConeGeometry(0.07, 0.26, 10), hair, 0.05);
      tail.position.set(0, 0.36, -0.24);
      tail.rotation.x = -2.0;
      this.head.add(knot, tail);
    }
  }

  private buildWeapon(kind: Weapon, mat: (c: number) => THREE.MeshToonMaterial, gold: THREE.Material, metal: THREE.Material): void {
    if (kind === "bow") {
      // Built in its own frame: limbs along Y, belly (apex) at the origin bulging toward -X, string at +X.
      const wood = mat(0x8a5428);
      const arc = Math.PI * 0.82;
      const R = 0.4;
      const bow = part(new THREE.TorusGeometry(R, 0.03, 8, 28, arc), wood, 0.1);
      bow.rotation.z = Math.PI - arc / 2;
      bow.position.x = R;
      const tipY = R * Math.sin(arc / 2);
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, tipY * 2, 4), new THREE.MeshBasicMaterial({ color: 0xf2ead8 }));
      string.position.x = R * (1 - Math.cos(arc / 2));
      const grip = part(new THREE.CylinderGeometry(0.042, 0.042, 0.12, 10), mat(0x3a2414), 0.06);
      const g = new THREE.Group();
      g.add(bow, string, grip);
      // Map into the hand frame: limbs → hand Z (vertical when the arm points forward),
      // string side → hand +Y (toward the archer), belly → away from the archer.
      g.setRotationFromMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)));
      this.weapon.add(g);
    } else if (kind === "sword") {
      const blade = part(new THREE.BoxGeometry(0.08, 0.56, 0.025), mat(0xe2e6ee), 0.07);
      blade.position.y = 0.38;
      const tip = part(new THREE.ConeGeometry(0.057, 0.12, 4), mat(0xe2e6ee), 0.07);
      tip.scale.z = 0.3;
      tip.rotation.y = Math.PI / 4;
      tip.position.y = 0.72;
      const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.46, 0.03), new THREE.MeshBasicMaterial({ color: 0x9aa2b0 }));
      fuller.position.y = 0.36;
      const guard = part(new THREE.BoxGeometry(0.26, 0.05, 0.07), gold, 0.06);
      guard.position.y = 0.08;
      const grip = part(new THREE.CylinderGeometry(0.028, 0.028, 0.14, 8), mat(0x5a3418), 0.06);
      const pommel = part(new THREE.SphereGeometry(0.045, 10, 8), gold, 0.06);
      pommel.position.y = -0.08;
      this.weapon.add(blade, tip, fuller, guard, grip, pommel);
      this.weapon.rotation.x = Math.PI / 2 - 0.3;
    } else {
      const handle = part(new THREE.CylinderGeometry(0.045, 0.055, 0.5, 10), mat(0x6a4422));
      handle.position.y = 0.2;
      const head = part(new THREE.CylinderGeometry(0.16, 0.1, 0.42, 14), mat(0x8a6038));
      head.position.y = 0.6;
      const cap = part(new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x8a6038));
      cap.position.y = 0.81;
      this.weapon.add(handle, head, cap);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const stud = part(new THREE.ConeGeometry(0.035, 0.09, 6), metal, 0.06);
        stud.position.set(Math.cos(a) * 0.15, 0.62 + (i % 2) * 0.12, Math.sin(a) * 0.15);
        stud.rotation.z = -Math.PI / 2;
        stud.rotation.y = -a;
        this.weapon.add(stud);
      }
      this.weapon.rotation.x = Math.PI / 2 - 0.2;
    }
  }

  setMode(m: Mode): void {
    if (!this.alive || this.mode === m) return;
    this.mode = m;
    this.modeT = 0;
  }

  face(angle: number): void {
    this.turnTo = angle;
  }

  /** Knockback + squash + white flash + wince. Heavy hits stagger longer. */
  hit(dir: THREE.Vector3, power = 1): void {
    if (!this.alive) return;
    this.vel.addScaledVector(dir.clone().setY(0).normalize(), 2.6 * power);
    this.flash = 1;
    this.mode = "hit";
    this.modeT = 0;
  }

  /** Death: flung back and up, spinning; then lands and fades into the ground. */
  die(dir: THREE.Vector3): void {
    if (!this.alive) return;
    this.alive = false;
    this.mode = "dead";
    this.modeT = 0;
    const d = dir.clone().setY(0).normalize();
    this.vel.set(d.x * 3.2, 4.2, d.z * 3.2);
    this.spin = (this.phase > 3.14 ? -1 : 1) * 7;
    this.flash = 1;
    for (const m of this.allMats) m.transparent = true;
  }

  get isAlive(): boolean {
    return this.alive;
  }

  get deadFor(): number {
    return this.alive ? 0 : this.modeT;
  }

  update(dt: number): void {
    this.t += dt;
    this.modeT += dt;
    // Turn toward the target facing with a little overshoot (spring), shortest way round.
    let dA = this.turnTo - this.facing;
    dA = Math.atan2(Math.sin(dA), Math.cos(dA));
    this.turnVel += (dA * 140 - this.turnVel * 18) * dt;
    this.facing += this.turnVel * dt;
    this.root.rotation.y = this.facing;

    // Knockback / fling physics.
    this.root.position.addScaledVector(this.vel, dt);
    if (this.alive) {
      this.vel.multiplyScalar(Math.exp(-dt * 9));
    } else {
      this.vel.y -= 14 * dt;
      if (this.root.position.y <= 0 && this.vel.y < 0) {
        this.root.position.y = 0;
        this.vel.set(this.vel.x * 0.3, Math.abs(this.vel.y) > 2 ? -this.vel.y * 0.25 : 0, this.vel.z * 0.3);
        this.spin *= 0.3;
      }
    }

    // Hit flash (emissive white, fades fast).
    this.flash = Math.max(0, this.flash - dt * 8);
    for (const m of this.toonMats) m.emissive.setScalar(this.flash * 0.85);

    // Pose channels, reset each frame and layered by mode.
    const P = {
      bob: 0, lean: 0, sway: 0, sx: 1, sy: 1, twist: 0, headY: 0, headX: 0, headZ: 0,
      sL: 0.12, sR: 0.12, sLz: -0.08, sRz: 0.08, eL: -0.25, eR: -0.25, eLz: 0, eRz: 0,
      lL: 0, lR: 0, kL: 0.05, kR: 0.05, fwd: 0, eyes: 1,
    };
    const breath = Math.sin(this.t * 2.4 + this.phase);
    const isRun = this.mode === "run";
    this.runBlend = lerp(this.runBlend, isRun ? 1 : 0, Math.min(1, dt * 10));
    const w = this.spec.weapon;
    switch (this.mode) {
      case "idle": {
        // Breathing, weight shift side to side, an occasional glance.
        P.sy = 1 + breath * 0.022;
        P.sx = 1 - breath * 0.01;
        P.sway = Math.sin(this.t * 0.9 + this.phase) * 0.04;
        P.sL = 0.1 + breath * 0.04;
        P.sR = 0.1 - breath * 0.04;
        P.headY = Math.sin(this.t * 0.55 + this.phase) * 0.3 + Math.sin(this.t * 1.7) * 0.05;
        P.headX = breath * 0.03;
        P.kL = 0.05 + Math.max(0, P.sway) * 2;
        P.kR = 0.05 + Math.max(0, -P.sway) * 2;
        if (w === "bow") {
          P.sL = -0.35;
          P.eL = -0.4;
        } else if (w === "club") {
          P.sR = -0.3;
          P.eR = -0.9;
        } else {
          P.sR = -0.15;
          P.eR = -0.6;
        }
        if (this.spec.shield) {
          P.sL = -0.25;
          P.eL = -1.25;
          P.sLz = -0.15;
        }
        break;
      }
      case "run": {
        this.phase += dt * 11 * this.runSpeed;
        const s = Math.sin(this.phase);
        const c = Math.cos(this.phase);
        const contact = Math.abs(c);
        P.lL = -s * 0.8;
        P.lR = s * 0.8;
        // Knee bends while the leg swings forward (recovery), straight at contact.
        P.kL = 0.15 + Math.max(0, c) * 1.2;
        P.kR = 0.15 + Math.max(0, -c) * 1.2;
        P.sL = s * 0.75;
        P.sR = -s * 0.75;
        P.eL = -0.9;
        P.eR = -0.9;
        P.bob = (1 - contact) * 0.07;
        P.lean = 0.2;
        P.sy = 1 + (1 - contact) * 0.04 - contact * 0.04;
        P.sx = 1 + contact * 0.025;
        P.twist = s * 0.14;
        P.headY = -s * 0.1; // head counter-rotates to stay on target
        P.headX = -0.12;
        if (w === "bow") {
          P.sL = -0.4 + s * 0.3;
          P.eL = -0.5;
        }
        if (this.spec.shield) {
          P.sL = -0.3 + s * 0.2;
          P.eL = -1.2;
        }
        break;
      }
      case "attack":
        if (w === "bow") this.poseBow(P, dt);
        else if (w === "club") this.poseClub(P, dt);
        else this.poseSword(P, dt);
        break;
      case "hit": {
        const u = Math.min(1, this.modeT / 0.3);
        const k = 1 - ease.outCubic(u);
        P.sx = 1 + 0.16 * k;
        P.sy = 1 - 0.14 * k;
        P.lean = -0.4 * k;
        P.headX = -0.35 * k;
        P.headZ = 0.15 * k;
        P.sL = -0.5 * k;
        P.sR = -0.5 * k;
        P.sLz = -0.6 * k;
        P.sRz = 0.6 * k;
        P.eyes = 1 - 0.85 * k; // wince
        if (u >= 1) {
          this.mode = "idle";
          this.modeT = 0;
        }
        break;
      }
      case "dead": {
        this.root.rotation.z += this.spin * dt;
        this.root.rotation.x = Math.min(Math.PI / 2, this.root.rotation.x + dt * 5);
        P.sL = -2.6;
        P.sR = -2.2;
        P.sLz = -0.8;
        P.sRz = 0.8;
        P.lL = -0.6;
        P.lR = 0.3;
        P.kL = 0.8;
        P.headX = -0.4;
        P.eyes = 0.12;
        const fade = Math.max(0, 1 - Math.max(0, this.modeT - 0.75) / 0.5);
        for (const m of this.allMats) m.opacity = fade;
        if (this.modeT > 0.95) this.root.position.y -= dt * 0.6;
        break;
      }
    }

    // Blink every few seconds (unless the expression already closes the eyes).
    this.blinkAt -= dt;
    if (this.blinkAt < 0) {
      if (this.blinkAt < -0.13) this.blinkAt = 2 + ((this.phase * 7.3) % 2.5);
      else P.eyes = Math.min(P.eyes, 0.1);
    }

    // Head lags the torso twist slightly (follow-through).
    this.headLag = lerp(this.headLag, P.twist, Math.min(1, dt * 8));
    this.hips.position.y = this.hipY + P.bob;
    this.hips.rotation.set(P.lean, 0, P.sway);
    this.root.position.y = this.alive ? Math.max(0, this.root.position.y) : this.root.position.y;
    this.torso.rotation.set(0, P.twist, -P.sway * 0.6);
    this.neck.rotation.set(P.headX - P.lean * 0.5, P.headY - (P.twist - this.headLag) * 0.8 - P.twist * 0.6, P.headZ);
    this.armL.root.rotation.set(P.sL, 0, P.sLz);
    this.armR.root.rotation.set(P.sR, 0, P.sRz);
    this.armL.joint.rotation.set(P.eL, 0, P.eLz);
    this.armR.joint.rotation.set(P.eR, 0, P.eRz);
    this.legL.root.rotation.x = P.lL;
    this.legR.root.rotation.x = P.lR;
    this.legL.joint.rotation.x = P.kL;
    this.legR.joint.rotation.x = P.kR;
    // Keep the boots flat-ish: counter the leg + knee rotation.
    this.legL.end.rotation.x = -(P.lL + P.kL) * 0.6;
    this.legR.end.rotation.x = -(P.lR + P.kR) * 0.6;
    this.hips.position.z = P.fwd;
    for (const e of this.eyes) e.scale.y = Math.max(0.08, P.eyes);
    const s = this.spec.scale ?? 1;
    this.root.scale.set(s * P.sx, s * P.sy, s * P.sx);
    this.updateCape(P.lean);
  }

  /** Cape: hangs behind, streams back with speed, ripples. */
  private updateCape(lean: number): void {
    if (this.capeRig) {
      const stream = 0.06 + this.runBlend * 0.42 + lean * 0.25;
      const wave = Math.sin(this.t * (3 + this.runBlend * 7)) * (0.04 + this.runBlend * 0.08);
      this.capeRig.rotation.x = stream + wave;
      if (this.capeLower) this.capeLower.rotation.x = stream * 0.3 + Math.sin(this.t * (3 + this.runBlend * 7) - 1.2) * (0.06 + this.runBlend * 0.14);
      return;
    }
    if (!this.cape || !this.capeBase) return;
    const pos = this.cape.geometry.attributes.position as THREE.BufferAttribute;
    const base = this.capeBase;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3]!, y = base[i * 3 + 1]!;
      const k = Math.min(1, Math.max(0, -y / this.capeLen)); // 0 at the shoulders → 1 at the hem
      const stream = 0.08 + this.runBlend * 0.32 + lean * 0.2;
      const wave = Math.sin(this.t * (4 + this.runBlend * 6) - k * 4 + x * 3) * (0.025 + this.runBlend * 0.05);
      pos.setZ(i, -(k ** 1.6) * stream - wave * k);
      pos.setY(i, y + (k ** 2) * stream * 0.35);
      pos.setX(i, x * (1 + k * 0.18));
    }
    pos.needsUpdate = true;
    this.cape.geometry.computeVertexNormals();
  }

  // --- Weapon attacks. Each sets the pose channels and fires onStrike once at the contact frame.

  private strikeOnce(at: number, dt: number): void {
    if (this.onStrike && this.modeT >= at && this.modeT - dt < at) this.onStrike();
  }

  private endAttack(total: number): void {
    if (this.modeT >= total) {
      this.mode = "idle";
      this.modeT = 0;
    }
  }

  /** Bow: raise → draw (string hand to the cheek) → hold → release snap → recover. */
  private poseBow(P: Record<string, number>, dt: number): void {
    const raise = 0.14, draw = 0.2, hold = 0.06, recover = 0.28;
    const k = this.modeT;
    const up = ease.outCubic(Math.min(1, k / raise));
    // Bow arm straight at the target.
    P.sL = lerp(-0.35, -1.5, up);
    P.eL = lerp(-0.4, -0.05, up);
    P.sLz = lerp(-0.08, 0.15, up);
    P.twist = lerp(0, -0.35, up);
    P.headY = 0.3 * up;
    let pull = 0;
    if (k > raise) pull = ease.inOutSine(Math.min(1, (k - raise) / draw));
    const rel = raise + draw + hold;
    if (k < rel) {
      // String hand comes forward to the string then pulls back to the cheek.
      P.sR = lerp(-1.2, -1.45, pull);
      P.sRz = lerp(-0.3, 0.1, pull);
      P.eR = lerp(-0.3, -0.2, pull);
      P.eRz = lerp(-0.4, -2.3, pull);
      P.sy = 1 + 0.03 * pull;
      P.lean = -0.06 * pull;
    } else {
      this.strikeOnce(rel, dt);
      const u = Math.min(1, (k - rel) / recover);
      const snap = 1 - ease.outCubic(Math.min(1, (k - rel) / 0.08));
      const back = ease.outCubic(u);
      // Release: string hand flies back and open, bow arm kicks.
      P.sR = lerp(-1.6, 0.1, back);
      P.sRz = lerp(0.5, 0.08, back);
      P.eRz = lerp(-1.2, 0, back);
      P.eR = lerp(-0.2, -0.25, back);
      P.sL = lerp(-1.6 + snap * 0.12, -0.35, back * back);
      P.eL = lerp(-0.05, -0.4, back * back);
      P.twist = lerp(-0.42, 0, back);
      P.lean = -0.1 * snap;
      P.sx = 1 + 0.04 * snap;
      P.sy = 1 - 0.04 * snap;
      P.headY = 0.3 * (1 - back);
    }
    this.endAttack(rel + recover);
  }

  /** Sword: wind up over the shoulder → diagonal slash with a lunge → follow-through. */
  private poseSword(P: Record<string, number>, dt: number): void {
    const wind = 0.2, strike = 0.07, recover = 0.3;
    const k = this.modeT;
    if (k < wind) {
      const u = ease.outCubic(k / wind);
      P.sR = -2.7 * u;
      P.sRz = 0.5 * u;
      P.eR = -0.6 - 0.6 * u;
      P.twist = -0.5 * u;
      P.lean = -0.12 * u;
      P.sy = 1 + 0.06 * u;
      P.sx = 1 - 0.04 * u;
      P.lL = -0.3 * u;
    } else if (k < wind + strike) {
      const u = ease.inQuad((k - wind) / strike);
      P.sR = lerp(-2.7, 0.3, u);
      P.sRz = lerp(0.5, -0.6, u);
      P.eR = lerp(-1.2, -0.1, u);
      P.twist = lerp(-0.5, 0.55, u);
      P.lean = lerp(-0.12, 0.35, u);
      P.sy = lerp(1.06, 0.88, u);
      P.sx = lerp(0.96, 1.1, u);
      P.fwd = 0.18 * u;
      P.lL = lerp(-0.3, -0.7, u);
      P.kL = 0.3;
    } else {
      this.strikeOnce(wind + strike, dt);
      const u = ease.outCubic(Math.min(1, (k - wind - strike) / recover));
      P.sR = lerp(0.3, -0.15, u);
      P.sRz = lerp(-0.6, 0.08, u);
      P.eR = lerp(-0.1, -0.6, u);
      P.twist = 0.55 * (1 - u);
      P.lean = 0.35 * (1 - u);
      P.sy = lerp(0.88, 1, u);
      P.sx = lerp(1.1, 1, u);
      P.fwd = 0.18 * (1 - u);
      P.lL = -0.7 * (1 - u);
      P.kL = 0.3 * (1 - u);
    }
    P.sL = -0.35;
    P.eL = -1.25;
    this.endAttack(wind + strike + recover);
  }

  /** Club: long two-handed wind-up overhead (the telegraph) → slam with heavy squash → slow recovery. */
  private poseClub(P: Record<string, number>, dt: number): void {
    const wind = 0.5, hang = 0.1, slam = 0.08, recover = 0.45;
    const k = this.modeT;
    let arm = 0, lean = 0, sy = 1, sx = 1, kn = 0.05;
    if (k < wind) {
      const u = ease.outCubic(k / wind);
      arm = -3.0 * u;
      lean = -0.3 * u;
      sy = 1 + 0.1 * u;
      sx = 1 - 0.06 * u;
      P.headX = -0.25 * u;
    } else if (k < wind + hang) {
      const u = (k - wind) / hang;
      arm = -3.0 - 0.1 * u;
      lean = -0.32;
      sy = 1.1;
      sx = 0.94;
      P.headX = -0.25;
    } else if (k < wind + hang + slam) {
      const u = ease.inQuad((k - wind - hang) / slam);
      arm = lerp(-3.1, -0.5, u);
      lean = lerp(-0.32, 0.55, u);
      sy = lerp(1.1, 0.8, u);
      sx = lerp(0.94, 1.18, u);
      kn = 0.6 * u;
      P.headX = 0.2 * u;
    } else {
      this.strikeOnce(wind + hang + slam, dt);
      const u = ease.outCubic(Math.min(1, (k - wind - hang - slam) / recover));
      arm = lerp(-0.5, -0.3, u);
      lean = 0.55 * (1 - u);
      sy = lerp(0.8, 1, u);
      sx = lerp(1.18, 1, u);
      kn = 0.6 * (1 - u);
      P.headX = 0.2 * (1 - u);
    }
    P.sR = arm;
    P.sL = arm;
    P.sRz = -0.35;
    P.sLz = 0.35;
    P.eR = -0.5;
    P.eL = -0.5;
    P.lean = lean;
    P.sy = sy;
    P.sx = sx;
    P.kL = kn;
    P.kR = kn;
    this.endAttack(wind + hang + slam + recover);
  }
}

export const PALETTES = {
  hero: { body: 0x3566d6, trim: 0x1f2f66, skin: 0xffd3ac, accent: 0xffd84a, hair: 0x7a4320, cape: 0xc7302a } satisfies Palette,
  footman: { body: 0xc8382c, trim: 0x4a1c16, skin: 0xffcca2, helm: 0x9ea6b4, accent: 0xf2d24a } satisfies Palette,
  brute: { body: 0x6b4a2c, trim: 0x3a2414, skin: 0x86b852, hair: 0x22180e, boots: 0x3a2414 } satisfies Palette,
  archer: { body: 0x3566d6, trim: 0x1f2f66, skin: 0xffd3ac, helm: 0x2f7a4a } satisfies Palette,
};
