// Heroic style: chunky stylised-3D figures in the mobile-strategy genre look — broad armoured
// chest, oversized gauntlet fists, short sturdy legs in big boots, sculpted faces (heavy brows,
// lidded eyes, big nose, beards), physically-shaded metal and cloth, no outlines. Our own cast:
// the Warden (hero), red-horde footmen, an ogre brute and ranger archers.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Character, CharacterSpec, Limb } from "./rig";

type M = THREE.MeshStandardMaterial;

interface HeroLook {
  skin: number;
  hair: number;
  beard?: number;
  armor: number; // steel
  trim: number; // gold / bronze
  cloth: number; // tabard / tunic
  under: number; // mail / undershirt
  leather: number;
  cape?: number;
  eye: number;
  head: "circlet" | "kettle" | "ogre" | "hood";
  /** Bare arms/legs show skin (ogre). */
  bare?: boolean;
}

const LOOKS: Record<string, HeroLook> = {
  warden: { skin: 0xf0b48a, hair: 0xb8501e, beard: 0xa8461a, armor: 0xc2cad6, trim: 0xe8b23a, cloth: 0x2a3550, under: 0x3a3f4c, leather: 0x7a4a26, cape: 0xb3261e, eye: 0x3a6a3a, head: "circlet" },
  footman: { skin: 0xf2b88e, hair: 0x5a3418, beard: 0x5a3418, armor: 0xaab2be, trim: 0x8a8e98, cloth: 0xd6342a, under: 0x6a2018, leather: 0x5a3418, eye: 0x2a1a10, head: "kettle" },
  brute: { skin: 0x7fb24e, hair: 0x2a1c10, armor: 0x7a7e88, trim: 0xd8ccb0, cloth: 0x6b4a2c, under: 0x4a3020, leather: 0x4a3020, eye: 0xf2c030, head: "ogre", bare: true },
  ranger: { skin: 0xf0b48a, hair: 0x6a3a1a, beard: 0x6a3a1a, armor: 0x9aa2ae, trim: 0xb08a50, cloth: 0x2f7a4a, under: 0x4a3a2a, leather: 0x6a4426, eye: 0x2a3a20, head: "hood" },
};

function lookFor(spec: CharacterSpec): HeroLook {
  if (spec.head === "crown") return LOOKS.warden!;
  if (spec.head === "hood") return LOOKS.ranger!;
  if (spec.head === "horns") return LOOKS.brute!;
  return LOOKS.footman!;
}

export function buildHeroic(c: Character, spec: CharacterSpec): void {
  const L = lookFor(spec);
  const b = spec.bulk ?? 1;
  const ogre = L.head === "ogre";

  const mats = new Map<string, M>();
  const mat = (color: number, kind: "metal" | "cloth" | "skin" | "gold" | "leather" | "gloss" = "cloth", side: THREE.Side = THREE.FrontSide): M => {
    const key = `${color}-${kind}-${side}`;
    let m = mats.get(key);
    if (!m) {
      const p = {
        metal: { metalness: 0.7, roughness: 0.42 },
        gold: { metalness: 0.8, roughness: 0.34 },
        cloth: { metalness: 0, roughness: 0.82 },
        skin: { metalness: 0, roughness: 0.55 },
        leather: { metalness: 0.05, roughness: 0.6 },
        gloss: { metalness: 0, roughness: 0.15 },
      }[kind];
      m = new THREE.MeshStandardMaterial({ color, side, ...p });
      mats.set(key, m);
      c.toonMats.push(m);
      c.allMats.push(m);
    }
    return m;
  };
  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh => {
    const o = new THREE.Mesh(geo, m);
    o.castShadow = true;
    return o;
  };
  const sph = (r: number, m: THREE.Material, sx = 1, sy = 1, sz = 1, seg = 32): THREE.Mesh => {
    const o = mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), m);
    o.scale.set(sx, sy, sz);
    return o;
  };
  const rbox = (w: number, h: number, d: number, r: number, m: THREE.Material): THREE.Mesh => mesh(new RoundedBoxGeometry(w, h, d, 4, r), m);
  const cap = (r: number, len: number, m: THREE.Material): THREE.Mesh => mesh(new THREE.CapsuleGeometry(r, len, 8, 16), m);
  const cyl = (rt: number, rb: number, h: number, m: THREE.Material, open = false): THREE.Mesh => mesh(new THREE.CylinderGeometry(rt, rb, h, 28, 1, open), m);
  const put = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number, parent: THREE.Object3D): T => {
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };

  const steel = mat(L.armor, "metal"), gold = mat(L.trim, ogre ? "skin" : "gold"), cloth = mat(L.cloth), under = mat(L.under);
  const leather = mat(L.leather, "leather"), skin = mat(L.skin, "skin");

  c.hipY = 0.42;
  c.root.add(c.hips);
  c.hips.position.y = c.hipY;

  // --- Legs: short and sturdy — mail thigh, armoured greave, big rounded boot. -------------
  const leg = (x: number): Limb => {
    const root = put(new THREE.Group(), x, 0, 0, c.hips);
    put(cap(0.105 * b, 0.05, L.bare ? leather : under), 0, -0.08, 0, root);
    const joint = put(new THREE.Group(), 0, -0.17, 0, root);
    put(sph(0.075 * b, ogre ? leather : steel), 0, 0, 0.05, joint);
    put(cyl(0.1 * b, 0.115 * b, 0.13, ogre ? skin : steel), 0, -0.07, 0, joint);
    const end = put(new THREE.Group(), 0, -0.17, 0, joint);
    put(rbox(0.23 * b, 0.13, 0.32 * b, 0.055, ogre ? leather : steel), 0, -0.02, 0.05, end);
    put(cyl(0.125 * b, 0.12 * b, 0.05, ogre ? mat(0x8a6a4a, "cloth") : leather), 0, 0.06, 0, end);
    return { root, joint, end };
  };
  c.legL = leg(-0.135 * b);
  c.legR = leg(0.135 * b);

  // --- Torso: barrel cuirass (or bare ogre belly), belt with a big buckle, skirt + tabard. ---
  c.hips.add(c.torso);
  put(cyl(0.3 * b, 0.36 * b, 0.2, under, true), 0, -0.04, 0, c.torso).scale.z = 0.85;
  if (!ogre) {
    const tab = put(rbox(0.26 * b, 0.36, 0.04, 0.02, cloth), 0, -0.1, 0.27 * b, c.torso);
    tab.rotation.x = 0.08;
    put(rbox(0.26 * b, 0.3, 0.04, 0.02, cloth), 0, -0.06, -0.27 * b, c.torso).rotation.x = -0.08;
  }
  const belt = put(new THREE.Mesh(new THREE.TorusGeometry(0.3 * b, 0.05, 12, 36), leather), 0, 0.08, 0, c.torso);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1, 0.85, 1);
  belt.castShadow = true;
  put(rbox(0.16, 0.12, 0.06, 0.025, ogre ? mat(0xe8dcc0, "skin") : gold), 0, 0.08, 0.27 * b, c.torso);
  if (ogre) {
    // Bare belly + leather straps crossing the chest.
    put(sph(0.36 * b, skin, 1.05, 0.95, 0.85), 0, 0.32, 0, c.torso);
    const strap = put(rbox(0.09, 0.62, 0.04, 0.02, leather), 0, 0.33, 0.3 * b, c.torso);
    strap.rotation.z = 0.7;
  } else {
    put(sph(0.36 * b, L.head === "kettle" ? cloth : steel, 1.05, 0.95, 0.82), 0, 0.33, 0, c.torso);
    put(new THREE.Mesh(new THREE.TorusGeometry(0.29 * b, 0.025, 10, 36), gold), 0, 0.18, 0, c.torso).rotation.x = Math.PI / 2;
    // Chest emblem: a raised gold shield crest (the Warden's own sigil: a tower).
    if (L.head === "circlet") {
      const crest = put(rbox(0.13, 0.15, 0.04, 0.02, gold), 0, 0.38, 0.29, c.torso);
      crest.rotation.x = -0.25;
      put(rbox(0.05, 0.08, 0.03, 0.01, mat(0xb3261e, "gloss")), 0, 0.0, 0.02, crest);
    }
  }

  // --- Head on the neck pivot. ---------------------------------------------------------------
  put(c.neck, 0, 0.6, 0, c.torso);
  put(c.head, 0, 0.26, 0, c.neck);
  const H = c.head;
  const R = ogre ? 0.32 : 0.3;
  put(sph(R, skin, ogre ? 1.12 : 0.96, 1, 0.96, 48), 0, 0, 0, H);
  /** Place a feature on the head surface at (lat, lon), facing out. */
  const onHead = (o: THREE.Object3D, lat: number, lon: number, lift = 0, rx = 1): THREE.Object3D => {
    const r = R + lift;
    o.position.set(Math.sin(lon) * Math.cos(lat) * r * rx, Math.sin(lat) * r, Math.cos(lon) * Math.cos(lat) * r);
    o.lookAt(o.position.clone().multiplyScalar(2));
    H.add(o);
    return o;
  };
  const rx = ogre ? 1.12 : 0.96;
  // Eyes: white, iris, pupil, glint, and an upper lid (skin) for a determined look.
  const white = mat(0xffffff, "gloss"), iris = mat(L.eye, "gloss"), pupil = mat(0x140c06, "gloss"), glint = new THREE.MeshBasicMaterial({ color: 0xffffff });
  c.allMats.push(glint);
  for (const k of [-1, 1]) {
    const eye = new THREE.Group();
    eye.add(sph(0.058, white, 0.95, 1, 0.45, 20));
    put(sph(0.038, iris, 1, 1, 0.4, 16), -k * 0.004, -0.004, 0.018, eye);
    put(sph(0.02, pupil, 1, 1, 0.4, 12), -k * 0.004, -0.004, 0.026, eye);
    put(new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), glint), 0.012, 0.014, 0.03, eye);
    const lid = put(sph(0.064, skin, 1, 1, 0.55, 20), 0, 0.022, 0.004, eye);
    lid.scale.y = 0.6;
    onHead(eye, ogre ? 0.08 : 0.02, k * 0.36, -0.018, rx);
    c.eyes.push(eye);
    // Heavy brow, angled down toward the nose.
    const brow = new THREE.Group();
    const bm = cap(0.03, ogre ? 0.12 : 0.1, mat(ogre ? 0x3a5a22 : L.beard ?? L.hair, ogre ? "skin" : "cloth"));
    bm.rotation.z = Math.PI / 2;
    brow.add(bm);
    onHead(brow, ogre ? 0.24 : 0.2, k * 0.36, 0.0, rx);
    brow.rotateZ(k * (ogre ? 0.45 : 0.3));
    // Ear.
    const ear = sph(0.07, skin, 0.5, ogre ? 1.5 : 1, 0.8, 16);
    if (ogre) ear.rotation.z = -k * 0.7;
    onHead(ear, 0, k * Math.PI * 0.5, -0.015, rx);
  }
  // Big nose.
  onHead(sph(ogre ? 0.085 : 0.065, skin, 0.9, 0.95, 1.1, 20), -0.12, 0, -0.012, rx);
  if (L.beard && L.head !== "kettle") {
    // Sculpted beard + moustache wrapping the jaw.
    const bm = mat(L.beard, "cloth");
    put(sph(0.25, bm, 1.1, 0.66, 0.88), 0, -0.2, 0.07, H);
    put(sph(0.12, bm, 1, 1.1, 0.9), 0, -0.31, 0.14, H);
    for (const k of [-1, 1]) {
      const mo = new THREE.Group();
      const m = cap(0.03, 0.08, bm);
      m.rotation.z = Math.PI / 2 + k * 0.35;
      mo.add(m);
      onHead(mo, -0.27, k * 0.12, 0.02, rx);
    }
    // Mouth shadow under the moustache.
    onHead(sph(0.05, mat(0x5a1e14, "skin"), 1.2, 0.35, 0.3, 12), -0.36, 0, -0.005, rx);
  } else if (L.head === "kettle") {
    // Footman: a bushy moustache, clean chin.
    const bm = mat(L.beard!, "cloth");
    for (const k of [-1, 1]) {
      const mo = new THREE.Group();
      const m = cap(0.034, 0.08, bm);
      m.rotation.z = Math.PI / 2 + k * 0.3;
      mo.add(m);
      onHead(mo, -0.26, k * 0.11, 0.015, rx);
    }
    onHead(sph(0.04, mat(0x5a1e14, "skin"), 1.2, 0.4, 0.3, 12), -0.38, 0, -0.005, rx);
  } else if (ogre) {
    // Wide jaw, underbite and tusks.
    put(sph(0.2, skin, 1.35, 0.7, 1), 0, -0.17, 0.08, H);
    onHead(sph(0.06, mat(0x3a1a10, "skin"), 2.2, 0.4, 0.3, 12), -0.4, 0, 0.03, rx);
    for (const k of [-1, 1]) {
      const t = mesh(new THREE.ConeGeometry(0.035, 0.13, 12), mat(0xf6eedc, "gloss"));
      put(t, k * 0.13, -0.17, 0.27, H);
      t.rotation.z = -k * 0.2;
    }
  }

  // Headgear.
  if (L.head === "circlet") {
    // Swept-back hair cap (leaves the face clear), sideburns into the beard, then a slim gold
    // circlet with three leaf points and an emerald.
    const hairM = mat(L.hair, "cloth");
    const hairCap = put(new THREE.Mesh(new THREE.SphereGeometry(R * 1.06, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM), 0, 0.0, -0.02, H);
    hairCap.rotation.x = -0.55;
    hairCap.scale.set(rx * 1.02, 1, 1.02);
    hairCap.castShadow = true;
    const quiff = put(sph(0.13, hairM, 1.5, 0.55, 0.9), 0, 0.27, 0.1, H);
    quiff.rotation.x = -0.6;
    for (const k of [-1, 1]) put(sph(0.06, hairM, 0.7, 1.4, 0.9, 16), k * 0.27, -0.04, 0.06, H);
    const ring = put(new THREE.Mesh(new THREE.TorusGeometry(0.295, 0.024, 12, 48), gold), 0, 0.13, -0.02, H);
    ring.rotation.x = Math.PI / 2 - 0.22;
    ring.castShadow = true;
    for (const [a, s] of [[0, 1], [-0.7, 0.75], [0.7, 0.75]] as const) {
      const leaf = mesh(new THREE.ConeGeometry(0.045 * s, 0.13 * s, 4), gold);
      const g = new THREE.Group();
      g.add(leaf);
      leaf.position.y = 0.06 * s;
      g.position.set(Math.sin(a) * 0.29, 0.17 + Math.cos(a) * 0.05, Math.cos(a) * 0.28 - 0.02);
      g.rotation.set(-0.15, a, 0);
      H.add(g);
    }
    put(sph(0.032, mat(0x1fbf6a, "gloss"), 1, 1.2, 0.6, 16), 0, 0.2, 0.275, H);
  } else if (L.head === "kettle") {
    put(new THREE.Mesh(new THREE.SphereGeometry(R * 1.1, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.5), steel), 0, 0.07, 0, H).castShadow = true;
    const brim = put(new THREE.Mesh(new THREE.TorusGeometry(R * 1.13, 0.04, 12, 48), steel), 0, 0.07, 0, H);
    brim.rotation.x = Math.PI / 2;
    brim.scale.set(1, 1, 0.6);
    put(sph(0.04, steel, 1, 1, 1, 12), 0, 0.4, 0, H);
  } else if (L.head === "hood") {
    const hood = put(new THREE.Mesh(new THREE.SphereGeometry(R * 1.12, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.62), cloth), 0, 0.02, -0.03, H);
    hood.rotation.x = -0.5;
    hood.castShadow = true;
  } else {
    for (const k of [-1, 1]) {
      const horn = mesh(new THREE.ConeGeometry(0.07, 0.34, 16), mat(0xeee2c6, "skin"));
      put(horn, k * 0.33, 0.25, -0.02, H).rotation.z = -k * 0.8;
    }
    put(sph(0.1, mat(L.hair, "cloth")), 0, 0.33, -0.1, H);
    put(cap(0.06, 0.16, mat(L.hair, "cloth")), 0, 0.3, -0.26, H).rotation.x = -2.0;
  }

  // --- Arms: layered pauldron, mail upper arm, flared gauntlet, big fist. --------------------
  const arm = (x: number, side: number): Limb => {
    const root = put(new THREE.Group(), x, 0.47, 0, c.torso);
    if (!ogre || side > 0) {
      const p1 = put(sph(0.2 * b, ogre ? mat(0x7a7e88, "metal") : L.head === "kettle" ? cloth : steel, 1.15, 0.8, 1.1), 0, 0.03, 0, root);
      p1.rotation.z = -side * 0.35;
      if (!ogre) put(sph(0.17 * b, L.head === "kettle" ? under : gold, 1.1, 0.5, 1.05), side * 0.03, -0.06, 0, root).rotation.z = -side * 0.45;
      else for (const dx of [-0.08, 0, 0.08]) put(mesh(new THREE.ConeGeometry(0.035, 0.15, 10), mat(0xeee2c6, "skin")), dx, 0.2, 0, root);
    }
    put(cap(0.085 * b, 0.1, L.bare ? skin : under), 0, -0.1, 0, root);
    const joint = put(new THREE.Group(), 0, -0.2, 0, root);
    put(cyl(0.09 * b, 0.115 * b, 0.16, ogre ? leather : steel), 0, -0.08, 0, joint);
    const end = put(new THREE.Group(), 0, -0.2, 0, joint);
    put(rbox(0.19 * b, 0.19, 0.19 * b, 0.065, ogre ? skin : steel), 0, 0, 0, end);
    put(cap(0.035 * b, 0.05, ogre ? skin : steel), side * -0.085 * b, 0.0, 0.05, end).rotation.z = side * 0.6;
    return { root, joint, end };
  };
  c.armL = arm(-0.42 * b, -1);
  c.armR = arm(0.42 * b, 1);

  // --- Cape (vertex-animated cloth by the shared rig) with a mantle over the shoulders. ------
  if (L.cape !== undefined) {
    const capeMat = mat(L.cape, "cloth", THREE.DoubleSide);
    const geo = new THREE.PlaneGeometry(0.8 * b, 0.86, 8, 12);
    geo.translate(0, -0.43, 0);
    const capeMesh = put(mesh(geo, capeMat), 0, 0.56, -0.26 * b, c.torso);
    c.cape = capeMesh;
    c.capeLen = 0.86;
    c.capeBase = (geo.attributes.position!.array as Float32Array).slice();
    // Shoulder drape: a shallow dome over the shoulders and upper back, tied at the throat.
    const mantle = put(new THREE.Mesh(new THREE.SphereGeometry(0.34, 40, 16, 0, Math.PI * 2, 0, Math.PI * 0.36), capeMat), 0, 0.42, -0.05, c.torso);
    mantle.scale.set(1.45 * b, 0.9, 1.05);
    mantle.castShadow = true;
    put(sph(0.045, mat(L.trim, "gold"), 1, 1, 0.6, 16), 0, 0.53, 0.25, c.torso);
  }
  if (spec.weapon === "bow") {
    const q = put(cyl(0.07, 0.06, 0.42, leather), 0.12, 0.32, -0.3 * b, c.torso);
    q.rotation.z = -0.5;
    for (let i = 0; i < 3; i++) put(mesh(new THREE.ConeGeometry(0.03, 0.09, 6), mat(i === 1 ? 0xf2f0e6 : 0xd84a3a)), (i - 1) * 0.03, 0.25, 0, q);
  }

  // --- Weapons (same hand-frame conventions as the other styles). ----------------------------
  (spec.weapon === "bow" ? c.armL : c.armR).end.add(c.weapon);
  const W = c.weapon;
  if (spec.weapon === "bow") {
    const g = new THREE.Group();
    const arc = Math.PI * 0.8, Rb = 0.44;
    const bow = mesh(new THREE.TorusGeometry(Rb, 0.03, 10, 36, arc), mat(0x7a4a22, "leather"));
    bow.rotation.z = Math.PI - arc / 2;
    bow.position.x = Rb;
    const tipY = Rb * Math.sin(arc / 2);
    const str = mesh(new THREE.CylinderGeometry(0.005, 0.005, tipY * 2, 4), mat(0xf2ead8));
    str.position.x = Rb * (1 - Math.cos(arc / 2));
    const grip = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 12), mat(L.trim, "gold"));
    for (const k of [-1, 1]) {
      const tip = mesh(new THREE.ConeGeometry(0.035, 0.08, 10), mat(L.trim, "gold"));
      tip.position.set(Rb * (1 - Math.cos(arc / 2)), k * tipY, 0);
      tip.rotation.z = k > 0 ? 0 : Math.PI;
      g.add(tip);
    }
    g.add(bow, str, grip);
    g.setRotationFromMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)));
    W.add(g);
  } else if (spec.weapon === "sword") {
    put(rbox(0.08, 0.5, 0.025, 0.01, mat(0xe2e6ee, "metal")), 0, 0.36, 0, W);
    put(mesh(new THREE.ConeGeometry(0.057, 0.1, 4), mat(0xe2e6ee, "metal")), 0, 0.66, 0, W).scale.z = 0.35;
    put(rbox(0.26, 0.05, 0.07, 0.02, mat(0xe8b23a, "gold")), 0, 0.1, 0, W);
    put(cyl(0.03, 0.03, 0.14, leather), 0, 0.02, 0, W);
    put(sph(0.045, mat(0xe8b23a, "gold"), 1, 1, 1, 12), 0, -0.07, 0, W);
    W.rotation.x = Math.PI / 2 - 0.3;
  } else {
    put(cyl(0.045, 0.055, 0.5, mat(0x6a4422, "leather")), 0, 0.2, 0, W);
    put(cyl(0.17, 0.11, 0.44, mat(0x8a6038, "leather")), 0, 0.62, 0, W);
    put(sph(0.17, mat(0x8a6038, "leather"), 1, 0.6, 1), 0, 0.84, 0, W);
    for (const y of [0.5, 0.74]) put(new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 8, 24), mat(0x6a6e78, "metal")), 0, y, 0, W).rotation.x = Math.PI / 2;
    W.rotation.x = Math.PI / 2 - 0.2;
  }
  if (spec.shield) {
    // Round shield strapped to the forearm, face along the forearm (hand -Y).
    const sh = new THREE.Group();
    sh.add(cyl(0.28, 0.28, 0.06, mat(0xd6342a)));
    const rim = put(new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 10, 40), steel), 0, 0, 0, sh);
    rim.rotation.x = Math.PI / 2;
    put(sph(0.08, steel, 1, 0.6, 1, 16), 0, -0.04, 0, sh);
    put(rbox(0.07, 0.07, 0.5, 0.02, mat(0xe8c040, "gold")), 0, -0.03, 0, sh);
    put(rbox(0.5, 0.07, 0.07, 0.02, mat(0xe8c040, "gold")), 0, -0.03, 0, sh);
    put(sh, -0.08, -0.04, 0, c.armL.end);
  }
}
