// Painted character sprites (the owner's original character designs, cut out of the design
// sheet into static/sprites/units/). Drawn with procedural motion on top: walk hop + sway,
// idle breathing, facing flip, attack lunge, a white hit-flash silhouette. Falls back to the
// procedural units until an image has loaded (and always in Node tests).

export type SpriteName =
  | "king" | "swordsman" | "spearman" | "archer" | "crossbowman" | "knight" | "mage" | "cleric" | "marshal"
  | "knight_vet" | "mage_vet" | "crossbowman_vet" | "archer_vet" | "spearman_vet" | "cleric_vet" | "marshal_vet" | "alchemist" | "alchemist_vet"
  | "horde_sword" | "horde_brute" | "horde_archer" | "elite_horned" | "elite_shield" | "elite_mage" | "boss" | "castle" | "wraith" | "stalker" | "sapper" | "goblin" | "goblin_mob" | "goblin_thief";

interface Entry {
  img: HTMLImageElement;
  ready: boolean;
  flash: HTMLCanvasElement | null;
}

const entries = new Map<SpriteName, Entry>();

/**
 * Marks an image ready only once it is decoded: a plain onload leaves decoding to the first
 * drawImage, which then stalls a frame mid-battle (tens of ms on a phone). decode() runs off the
 * main thread.
 */
function whenDecoded(img: HTMLImageElement, ready: () => void): void {
  img.onload = () => {
    if (typeof img.decode === "function") img.decode().then(ready, ready);
    else ready();
  };
}

function entry(name: SpriteName): Entry | null {
  if (typeof Image === "undefined") return null;
  let e = entries.get(name);
  if (!e) {
    const img = new Image();
    const created: Entry = { img, ready: false, flash: null };
    whenDecoded(img, () => { created.ready = true; });
    img.src = `./sprites/units/${name}.png`;
    entries.set(name, created);
    e = created;
  }
  return e.ready ? e : null;
}

/** Preload every sprite (call once at startup so the first wave already shows the art). */
export function preloadSprites(): void {
  for (const n of Object.keys(ENEMY_SPRITES).map((k) => ENEMY_SPRITES[k]!.name).concat(["king", "swordsman", "knight", "mage", "crossbowman", "archer", "spearman", "cleric", "marshal", "castle", "knight_vet", "mage_vet", "crossbowman_vet", "archer_vet", "spearman_vet", "cleric_vet", "marshal_vet", "alchemist", "alchemist_vet"] as SpriteName[])) entry(n);
}

/** A white silhouette of the sprite for hit flashes (built once per sprite). */
function flashOf(e: Entry): HTMLCanvasElement {
  if (e.flash) return e.flash;
  const c = document.createElement("canvas");
  c.width = e.img.naturalWidth;
  c.height = e.img.naturalHeight;
  const g = c.getContext("2d")!;
  g.drawImage(e.img, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, c.width, c.height);
  e.flash = c;
  return c;
}

/** Enemy id → sprite and on-screen height in multiples of the enemy's radius. */
export const ENEMY_SPRITES: Record<string, { name: SpriteName; h: number }> = {
  footman: { name: "horde_sword", h: 3.3 },
  banner: { name: "horde_sword", h: 3.3 },
  runner: { name: "horde_sword", h: 3.2 },
  shield: { name: "elite_shield", h: 3.1 },
  brute: { name: "horde_brute", h: 3.0 },
  crossbow: { name: "horde_archer", h: 3.4 },
  knight: { name: "elite_horned", h: 3.2 },
  shaman: { name: "elite_mage", h: 3.4 },
  wraith: { name: "wraith", h: 3.4 },
  stalker: { name: "stalker", h: 3.3 },
  sapper: { name: "sapper", h: 3.3 },
  tunneler: { name: "sapper", h: 3.3 },
  goblin: { name: "goblin", h: 3.6 },
  mob: { name: "goblin_mob", h: 3.0 },
  thief: { name: "goblin_thief", h: 3.6 },
  hag: { name: "elite_mage", h: 3.0 },
  ogre: { name: "boss", h: 2.3 },
  troll: { name: "boss", h: 2.3 },
  warlord: { name: "boss", h: 2.2 },
  golem: { name: "boss", h: 2.1 },
  colossus: { name: "boss", h: 2.0 },
  magma: { name: "boss", h: 1.95 },
  drowned: { name: "boss", h: 2.0 },
  bloodlord: { name: "boss", h: 1.95 },
  hollowking: { name: "boss", h: 2.0 },
};

export interface SpritePose {
  /** Walk phase (radians, advancing while moving); 0 = standing. */
  walk: number;
  /** Seconds, for idle breathing. */
  time: number;
  /** Per-unit offset so crowds don't breathe in sync. */
  seed: number;
  /** Mirror horizontally (sprites are painted facing slightly left). */
  flip: boolean;
  /** 0..1 white flash. */
  flash: number;
  /** 0..1 attack lunge (leans and stretches toward the target). */
  lunge: number;
  /** Per-character key: when set, a change of facing turns through edge-on instead of snapping. */
  key?: string;
}
const spriteTurns = new Map<string, { flip: boolean; at: number; from: boolean; seen: number }>();

/**
 * Draw a sprite standing on (x, footY) at the given on-screen height. Returns false if the image
 * isn't loaded yet so the caller can fall back to the procedural unit.
 */
/** Robed figures: the hem sways as one piece instead of two scissoring legs; the wraith floats. */
const ROBED: Partial<Record<SpriteName, boolean>> = { mage: true, elite_mage: true, wraith: true, stalker: true, alchemist: true, mage_vet: true, alchemist_vet: true };
/** Fraction of the sprite's height (from the feet) that is legs / robe hem. */
const LEGS = 0.3;

export function drawSprite(ctx: CanvasRenderingContext2D, name: SpriteName, x: number, footY: number, height: number, p: SpritePose): boolean {
  const e = entry(name);
  if (!e) return false;
  const img = e.img;
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const w = (height * iw) / ih;
  const moving = p.walk !== 0;
  const s = Math.sin(p.walk);
  const contact = Math.abs(Math.cos(p.walk));
  const robed = ROBED[name] === true;
  const floats = name === "wraith";
  // Walk: the body rises over each step (lowest on contact) and leans against the stride.
  const hover = floats ? 3 + Math.sin(p.time * 2.2 + p.seed) * 2.5 : 0;
  const hop = (moving ? Math.abs(s) * height * 0.045 : 0) + hover;
  const sway = moving ? s * 0.045 : Math.sin(p.time * 1.3 + p.seed) * 0.015;
  const breath = moving ? 0 : Math.sin(p.time * 2.6 + p.seed) * 0.022;
  let sx = 1 + (moving ? contact * 0.03 : -breath * 0.5);
  let sy = 1 - (moving ? contact * 0.04 : -breath);
  // Lunge: stretch toward the target and lean forward.
  sx *= 1 + p.lunge * 0.06;
  sy *= 1 + p.lunge * 0.1;
  // Stride: legs scissor (or the robe hem swings) about the hip line.
  const stride = moving ? s * (robed ? 0.16 : 0.32) : robed ? Math.sin(p.time * 1.7 + p.seed) * 0.05 : 0;
  const legH = height * LEGS, srcLeg = ih * LEGS, srcHip = ih - srcLeg;
  const blit = (src: CanvasImageSource): void => {
    // Legs / hem first, sheared from the hip (top edge fixed, feet swing).
    const halves: [number, number, number][] = robed ? [[0, iw, stride]] : [[0, iw / 2, stride], [iw / 2, iw / 2, -stride]];
    for (const [x0, ww, sh] of halves) {
      ctx.save();
      ctx.translate(0, -legH);
      ctx.transform(1, 0, sh, 1, 0, 0);
      ctx.drawImage(src, x0, srcHip, ww, srcLeg, -w / 2 + (x0 / iw) * w, 0, (ww / iw) * w, legH);
      ctx.restore();
    }
    // Torso, head and arms over the top (a few px of overlap hides the seam at the hip).
    const ov = ih * 0.04;
    ctx.drawImage(src, 0, 0, iw, srcHip + ov, -w / 2, -height, w, height - legH + (ov / ih) * height);
  };
  // Turning round: narrow to edge-on and open out the other way (old facing until midway).
  let flip = p.flip, xs = 1;
  if (p.key !== undefined) {
    const now = performance.now() / 1000;
    let m = spriteTurns.get(p.key);
    if (!m) spriteTurns.set(p.key, (m = { flip: p.flip, at: -9, from: p.flip, seen: now }));
    if (m.flip !== p.flip) Object.assign(m, { from: m.flip, at: now, flip: p.flip });
    m.seen = now;
    const tu = (now - m.at) / 0.14;
    if (tu < 1) {
      flip = tu < 0.5 ? m.from : p.flip;
      xs = Math.max(0.08, Math.abs(Math.cos(tu * Math.PI)));
    }
    if (spriteTurns.size > 400) for (const [k, v] of spriteTurns) if (now - v.seen > 3) spriteTurns.delete(k);
  }
  ctx.save();
  ctx.translate(x, footY - hop);
  ctx.rotate(sway + p.lunge * 0.12 * (flip ? -1 : 1));
  ctx.scale((flip ? -1 : 1) * sx * xs, sy);
  blit(img);
  if (p.flash > 0) {
    ctx.globalAlpha *= Math.min(1, p.flash) * 0.85;
    blit(flashOf(e));
  }
  ctx.restore();
  return true;
}

// ---------------------------------------------------------------------------------------------
// Frame-animated characters (the owner's animation sheets, packed into static/sprites/anim/ as
// one atlas per character: rows idle/walk/attack/hit/death, frames registered on a shared
// baseline so feet don't jitter between frames).

export type AnimChar =
  | "king" | "horde_horned" | "brute" | "horde_archer" | "knight_ally" | "knight_ally_back" | "king_back" | "archer_ally"
  // Palette variants of the horde sheets (scripts/anim/recolor.py): same frames, variant colours.
  | "goblin_anim" | "sapper_anim" | "goblin_mob_anim" | "goblin_thief_anim" | "boss_anim" | "hollowking_anim" | "king_vet" | "king_back_vet";
export type AnimName = "idle" | "walk" | "attack" | "hit" | "death";

const ROWS: Record<AnimName, { row: number; frames: number }> = {
  idle: { row: 0, frames: 4 },
  walk: { row: 1, frames: 8 },
  attack: { row: 2, frames: 6 },
  hit: { row: 3, frames: 2 },
  death: { row: 4, frames: 6 },
};
/** Cell size of each atlas (px) and the baseline (feet) inside a cell. */
const ATLAS: Record<AnimChar, { w: number; h: number; foot: number }> = {
  king: { w: 214, h: 200, foot: 194 },
  horde_horned: { w: 217, h: 200, foot: 194 },
  brute: { w: 219, h: 200, foot: 194 },
  horde_archer: { w: 222, h: 200, foot: 193 },
  knight_ally: { w: 194, h: 200, foot: 194 },
  // Back view (walking up the screen): rows idle / walk / attack only.
  knight_ally_back: { w: 160, h: 200, foot: 195 },
  king_back: { w: 194, h: 200, foot: 196 },
  archer_ally: { w: 207, h: 200, foot: 194 },
  goblin_anim: { w: 217, h: 200, foot: 194 },
  sapper_anim: { w: 217, h: 200, foot: 194 },
  goblin_mob_anim: { w: 219, h: 200, foot: 194 },
  goblin_thief_anim: { w: 222, h: 200, foot: 193 },
  boss_anim: { w: 219, h: 200, foot: 194 },
  // The Hollow King: the boss sheet recoloured pale and violet (deathly skin, violet armour).
  hollowking_anim: { w: 219, h: 200, foot: 194 },
  // The Crimson King (Veteran look): the King's sheets recoloured black, crimson and gold.
  king_vet: { w: 214, h: 200, foot: 194 },
  king_back_vet: { w: 194, h: 200, foot: 196 },
};

/** Per-character frame-count overrides (sheets that differ from the standard rows). */
const FRAMES: Partial<Record<AnimChar, Partial<Record<AnimName, number>>>> = { archer_ally: { death: 7 } };
/** Pose count of the original sheet: the unit callers time animations in. */
function framesOf(name: AnimChar, anim: AnimName): number {
  return FRAMES[name]?.[anim] ?? ROWS[anim].frames;
}
/**
 * Frames actually stored in the atlas. Each pair of sheet poses has a motion-interpolated
 * in-between (built by optical flow), so loops hold 2n frames and one-shots 2n-1 (ending on
 * the final pose). drawAnim maps a sheet-pose frame onto these.
 */
function storedFrames(name: AnimChar, anim: AnimName): number {
  const n = framesOf(name, anim);
  return anim === "idle" || anim === "walk" ? n * 2 : n * 2 - 1;
}

/** Characters that have a back-view atlas (used when moving/facing up the screen). */
const BACK_OF: Partial<Record<AnimChar, AnimChar>> = { knight_ally: "knight_ally_back", king: "king_back", king_vet: "king_back_vet" };

/**
 * Pick the view for a facing angle (atan2(dy, dx), screen space): facing up the screen uses the
 * back-view atlas when one exists (for idle/walk/attack); art is painted turned to the left, so
 * anything facing right is mirrored. Returns the atlas to draw and whether to flip it.
 */
export function viewFor(name: AnimChar, anim: AnimName, facing: number): { name: AnimChar; flip: boolean } {
  const up = Math.sin(facing) < -0.35;
  const back = BACK_OF[name];
  const useBack = up && back !== undefined && anim !== "hit" && anim !== "death";
  return { name: useBack ? back : name, flip: Math.cos(facing) > 0.15 };
}

interface AtlasEntry {
  img: HTMLImageElement;
  ready: boolean;
  flash: HTMLCanvasElement | null;
  /** Half-resolution copy downscaled once at high quality (used when drawn small). */
  half: HTMLCanvasElement | ImageBitmap | null;
  /** This run needs the sheet: build its half-size copy off the main thread as soon as it's decoded. */
  warm?: boolean;
  halfPending?: boolean;
}
const atlases = new Map<AnimChar, AtlasEntry>();

function atlas(name: AnimChar): AtlasEntry | null {
  if (typeof Image === "undefined") return null;
  let e = atlases.get(name);
  if (!e) {
    const img = new Image();
    const created: AtlasEntry = { img, ready: false, flash: null, half: null };
    whenDecoded(img, () => {
      created.ready = true;
      if (created.warm) warmHalf(created);
    });
    img.src = `./sprites/anim/${name}.webp`;
    atlases.set(name, created);
    e = created;
  }
  return e.ready ? e : null;
}

/** Sheets every session needs at once: the King, his allies and the first chapter's horde. */
const CORE_ANIMS: AnimChar[] = ["king", "king_back", "knight_ally", "knight_ally_back", "archer_ally", "horde_horned", "brute", "horde_archer"];

/**
 * Startup preload: only the core sheets (all 15 were ~8 MB to download and ~190 MB decoded — slow on a
 * phone's first load and heavy on memory). Each run preloads the rest it can meet (preloadAnimsFor);
 * anything still missing loads on first use. Pass `all` for modes whose foes aren't known up front.
 */
export function preloadAnims(all = false): void {
  // Veteran-look sheets load on first use (most players never wear them).
  for (const n of all ? (Object.keys(ATLAS) as AnimChar[]) : CORE_ANIMS) if (!n.endsWith("_vet")) warmAtlas(n);
}

/** Starts loading a sheet and marks it for an off-thread half-size build once decoded. */
function warmAtlas(name: AnimChar): void {
  atlas(name);
  const e = atlases.get(name);
  if (!e) return;
  e.warm = true;
  if (e.ready) warmHalf(e);
}

/** Preloads the animation sheets these enemy kinds use (call when a run starts, before the first wave). */
export function preloadAnimsFor(enemyIds: Iterable<string>): void {
  for (const id of enemyIds) {
    const a = ENEMY_ANIMS[id];
    if (a) warmAtlas(a.name);
  }
}

/**
 * Builds the half-size sheet off the main thread (createImageBitmap with a resize). The first
 * high-quality downscale of a 3.5k-wide sheet otherwise lands inside a frame — the 70–100 ms hitches
 * when a new kind of foe first appears. If it isn't ready in time, atlasHalf builds it the old way.
 */
function warmHalf(e: AtlasEntry): void {
  if (e.half || e.halfPending || typeof createImageBitmap !== "function") return;
  e.halfPending = true;
  const w = Math.ceil(e.img.naturalWidth / 2), h = Math.ceil(e.img.naturalHeight / 2);
  createImageBitmap(e.img, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" }).then(
    (b) => {
      // (A browser that ignores the resize options returns the full size: keep the canvas route.)
      if (!e.half && b.width === w && b.height === h) e.half = b;
      else b.close();
    },
    () => {},
  );
}

function atlasHalf(e: AtlasEntry): HTMLCanvasElement | ImageBitmap {
  if (e.half) return e.half;
  const c = document.createElement("canvas");
  c.width = Math.ceil(e.img.naturalWidth / 2);
  c.height = Math.ceil(e.img.naturalHeight / 2);
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(e.img, 0, 0, c.width, c.height);
  e.half = c;
  return c;
}

/**
 * Crisp frames: one atlas cell resampled once, at high quality, to exactly the size it occupies on
 * screen in device pixels, then lightly sharpened. Drawn 1:1 on whole device pixels, so characters
 * aren't softened by on-the-fly downscaling and sub-pixel resampling every frame. LRU-capped.
 */
export const crispCache = new Map<string, HTMLCanvasElement>();
// ~50 KB each: 800 frames ≈ 40 MB (1500 kept growing past 100 MB of canvases on long nights — iOS caps
// total canvas memory — with no fewer rebuilds per minute than 800).
const CRISP_MAX = 800;
export const crispStats = { built: 0 };
let crispFrameAt = 0, crispSpent = 0;
/** Returns null when this frame's build budget (~4 ms) is spent; the caller then draws the old way. */
function crispFrame(e: AtlasEntry, key: string, sx: number, sy: number, sw: number, sh: number, pw: number, ph: number, flash: boolean): HTMLCanvasElement | null {
  const k = `${key}|${sx}|${sy}|${pw}x${ph}|${flash ? 1 : 0}`;
  const hit = crispCache.get(k);
  if (hit) {
    crispCache.delete(k);
    crispCache.set(k, hit);
    return hit;
  }
  const t0 = performance.now();
  if (t0 - crispFrameAt > 12) { crispFrameAt = t0; crispSpent = 0; }
  if (crispSpent > 2) return null;
  crispStats.built++;
  const c = document.createElement("canvas");
  c.width = pw;
  c.height = ph;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  // Shrink in steps of at most 2x (one big jump drops detail and aliases).
  let src: CanvasImageSource = e.img, ssx = sx, ssy = sy, ssw = sw, ssh = sh;
  if (ph < sh * 0.5) {
    src = atlasHalf(e);
    ssx /= 2; ssy /= 2; ssw /= 2; ssh /= 2;
  }
  g.drawImage(src, ssx, ssy, ssw, ssh, 0, 0, pw, ph);
  // (No per-pixel sharpening here: getImageData forces a GPU→CPU readback, which stalls phones.)
  if (flash) {
    g.globalCompositeOperation = "source-in";
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, pw, ph);
  }
  crispSpent += performance.now() - t0;
  crispCache.set(k, c);
  if (crispCache.size > CRISP_MAX) crispCache.delete(crispCache.keys().next().value!);
  return c;
}

/** White silhouettes of single sheet cells for hit flashes (a whole-sheet copy is ~14 MB each and
 *  hitched the first hit on every character). Small LRU. */
const flashCells = new Map<string, HTMLCanvasElement>();
function cellFlash(e: AtlasEntry, name: string, sx: number, sy: number, sw: number, sh: number): HTMLCanvasElement {
  const k = `${name}|${sx}|${sy}`;
  const hit = flashCells.get(k);
  if (hit) {
    flashCells.delete(k);
    flashCells.set(k, hit);
    return hit;
  }
  const c = document.createElement("canvas");
  c.width = sw;
  c.height = sh;
  const g = c.getContext("2d")!;
  g.drawImage(e.img, sx, sy, sw, sh, 0, 0, sw, sh);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, sw, sh);
  flashCells.set(k, c);
  if (flashCells.size > 60) flashCells.delete(flashCells.keys().next().value!);
  return c;
}

/** Frame index for an animation: loops (idle/walk) or clamps on the last frame (others). */
export function animFrame(anim: AnimName, t: number, fps: number, name?: AnimChar): number {
  const n = name ? framesOf(name, anim) : ROWS[anim].frames;
  const f = t * fps;
  // Looping cycles return a fractional frame so drawAnim can blend into the next pose.
  if (anim === "idle" || anim === "walk") return ((f % n) + n) % n;
  // One-shots stay fractional too: the atlas has in-betweens, so they play at twice the poses.
  return Math.min(n - 1, Math.max(0, f));
}

export function animFrames(anim: AnimName): number {
  return ROWS[anim].frames;
}

/**
 * Draw one frame standing on (x, footY). `height` is the on-screen height of a whole cell
 * (the character fills ~90% of it). Returns false until the atlas has loaded.
 */
/** Seconds a pose transition takes to dissolve. */
const BLEND_S = 0.1;
type PoseRef = { name: AnimChar; anim: AnimName; frame: number; flip: boolean };
const poseMemory = new Map<string, PoseRef & { from: PoseRef | null; at: number; seen: number; turnAt?: number; turnFrom?: boolean }>();
/** Seconds a mirror turn takes (narrowing to edge-on and opening out the other way). */
const TURN_S = 0.14;

export function drawAnim(
  ctx: CanvasRenderingContext2D,
  name: AnimChar,
  anim: AnimName,
  frame: number,
  x: number,
  footY: number,
  height: number,
  opts: { flip?: boolean; flash?: number; squash?: number; key?: string; xscale?: number } = {},
): boolean {
  const e = atlas(name);
  if (!e) return false;
  // Pose transitions: when this character switches animation (walk -> idle, idle -> attack, ...)
  // the last pose of the old one dissolves into the new one instead of snapping.
  if (opts.key !== undefined) {
    const now = performance.now() / 1000;
    let m = poseMemory.get(opts.key);
    if (!m) poseMemory.set(opts.key, (m = { name, anim, frame, flip: !!opts.flip, from: null, at: -9, seen: now }));
    if (m.name !== name) {
      // Front <-> back view: a clean cut reads better than a dissolve between silhouettes.
      m.from = null;
    } else if (m.flip !== !!opts.flip) {
      // Mirroring: turn through edge-on instead of snapping (old facing until the midpoint).
      m.from = null;
      m.turnAt = now;
      m.turnFrom = m.flip;
    } else if (m.anim !== anim && anim !== "hit" && m.anim !== "hit") {
      m.from = { name: m.name, anim: m.anim, frame: m.frame, flip: m.flip };
      m.at = now;
    }
    const fromPose = m.from;
    Object.assign(m, { name, anim, frame, flip: !!opts.flip, seen: now });
    const t = (now - m.at) / BLEND_S;
    const tu = (now - (m.turnAt ?? -9)) / TURN_S;
    const turning = tu < 1;
    const drawOpts = turning ? { ...opts, key: undefined, flip: tu < 0.5 ? m.turnFrom : opts.flip, xscale: Math.max(0.08, Math.abs(Math.cos(tu * Math.PI))) } : { ...opts, key: undefined };
    if (!drawAnim(ctx, name, anim, frame, x, footY, height, drawOpts)) return false;
    if (fromPose && t < 1) {
      const a = ctx.globalAlpha;
      ctx.globalAlpha = a * (1 - t) * (1 - t);
      drawAnim(ctx, fromPose.name, fromPose.anim, fromPose.frame, x, footY, height, { flip: fromPose.flip, squash: opts.squash });
      ctx.globalAlpha = a;
    }
    if (poseMemory.size > 400) for (const [k, v] of poseMemory) if (now - v.seen > 3) poseMemory.delete(k);
    return true;
  }
  const A = ATLAS[name];
  const R = ROWS[anim];
  const loop = anim === "idle" || anim === "walk";
  // Sheet pose -> stored frame (2 stored frames per pose step, in-betweens included).
  const N = storedFrames(name, anim);
  const h = loop ? (((frame * 2) % N) + N) % N : Math.min(N - 1, Math.max(0, frame * 2));
  const fi = Math.min(N - 1, Math.floor(h));
  // A light cross-fade covers only the half-step left between stored frames.
  const blend = loop || fi < N - 1 ? h - fi : 0;
  const f = fi;
  const k = height / A.h;
  const w = A.w * k;
  const sx = f * A.w, sy = R.row * A.h;
  const sq = opts.squash ?? 0;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(x, footY);
  ctx.scale((opts.flip ? -1 : 1) * (1 + sq * 0.12) * (opts.xscale ?? 1), 1 - sq * 0.12);
  const dx = -w / 2, dy = -A.foot * k;
  // Crisp path: plain upright draws (no squash, no edge-on turn, no rotation) blit a pre-sized
  // frame on whole device pixels.
  const M = ctx.getTransform();
  if (sq === 0 && (opts.xscale ?? 1) === 1 && Math.abs(M.b) < 1e-6 && Math.abs(M.c) < 1e-6 && M.d > 0) {
    // Width and height sized separately (callers may stretch a little, e.g. breathing).
    // Sizes snap to ~3% steps so slightly different enemies (size variety, zoom) share cached frames
    // instead of each building its own; the frame keeps the sheet's aspect ratio.
    const ph = Math.max(6, Math.round(Math.pow(2, Math.round(Math.log2(A.h * k * M.d) * 24) / 24)));
    const pw = Math.max(4, Math.round(A.w * (ph / A.h) * (Math.abs(M.a) / M.d)));
    const body = crispFrame(e, name, sx, sy, A.w, A.h, pw, ph, false);
    const fl = opts.flash && opts.flash > 0 ? crispFrame(e, name, sx, sy, A.w, A.h, pw, ph, true) : null;
    if (body && (fl || !(opts.flash && opts.flash > 0))) {
      const ox = Math.round(M.e + M.a * dx), oy = Math.round(M.f + M.d * dy);
      ctx.setTransform(M.a < 0 ? -1 : 1, 0, 0, 1, ox, oy);
      ctx.drawImage(body, 0, 0);
      if (fl) {
        ctx.globalAlpha *= Math.min(1, opts.flash!) * 0.8;
        ctx.drawImage(fl, 0, 0);
      }
      ctx.restore();
      return true;
    }
  }
  // Small on screen: sample the pre-shrunk copy (cleaner edges than a 4x one-step downscale).
  const screenH = A.h * k * Math.abs(ctx.getTransform().d);
  const useHalf = screenH < A.h * 0.55;
  const src: CanvasImageSource = useHalf ? atlasHalf(e) : e.img;
  const m = useHalf ? 0.5 : 1;
  ctx.drawImage(src, sx * m, sy * m, A.w * m, A.h * m, dx, dy, w, A.h * k);
  if (blend > 0.04) {
    // In-between: fade the next pose over this one (opaque base, so no see-through body).
    const nx = ((fi + 1) % N) * A.w;
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * blend;
    ctx.drawImage(src, nx * m, sy * m, A.w * m, A.h * m, dx, dy, w, A.h * k);
    ctx.globalAlpha = a;
  }
  if (opts.flash && opts.flash > 0) {
    ctx.globalAlpha *= Math.min(1, opts.flash) * 0.8;
    ctx.drawImage(cellFlash(e, name, sx, sy, A.w, A.h), dx, dy, w, A.h * k);
  }
  ctx.restore();
  return true;
}

/** Enemy id → animated character + cell height in multiples of the enemy radius. */
export const ENEMY_ANIMS: Record<string, { name: AnimChar; h: number }> = {
  footman: { name: "horde_horned", h: 4.0 },
  banner: { name: "horde_horned", h: 4.0 },
  runner: { name: "horde_horned", h: 3.8 },
  brute: { name: "brute", h: 3.5 },
  crossbow: { name: "horde_archer", h: 4.2 },
  goblin: { name: "goblin_anim", h: 4.35 },
  sapper: { name: "sapper_anim", h: 4.0 },
  tunneler: { name: "sapper_anim", h: 4.0 },
  mob: { name: "goblin_mob_anim", h: 3.5 },
  thief: { name: "goblin_thief_anim", h: 4.45 },
  ogre: { name: "boss_anim", h: 2.7 },
  troll: { name: "boss_anim", h: 2.7 },
  warlord: { name: "boss_anim", h: 2.6 },
  golem: { name: "boss_anim", h: 2.45 },
  colossus: { name: "boss_anim", h: 2.35 },
  magma: { name: "boss_anim", h: 2.3 },
  drowned: { name: "boss_anim", h: 2.35 },
  bloodlord: { name: "boss_anim", h: 2.3 },
  hollowking: { name: "hollowking_anim", h: 2.4 },
};
