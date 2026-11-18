import type { Fx } from "../render/fx";
import { FONT } from "../ui/font";
import { drawIcon, drawUnit, INK, LOOKS, softShadow } from "./art";
import { animFrame, drawAnim, drawSprite } from "./sprites";
import { BUILDING_ATLAS, DECOR_ATLAS, TOWER_ATLAS } from "./propAtlas";

let decorImg: HTMLImageElement | null = null;
/** The 3D-rendered decor atlas once loaded (null in tests / while loading). */
function decorAtlas(): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  if (!decorImg) {
    decorImg = new Image();
    decorImg.src = "./sprites/props/decor.webp";
  }
  return decorImg.complete && decorImg.naturalWidth > 0 ? decorImg : null;
}
let towerImg: HTMLImageElement | null = null;
/** The 3D-rendered tower atlas once loaded (null in tests / while loading). */
function towerAtlas(): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  if (!towerImg) {
    towerImg = new Image();
    towerImg.src = "./sprites/props/tower.webp";
  }
  return towerImg.complete && towerImg.naturalWidth > 0 ? towerImg : null;
}
/** Offsets (world units from the plot) of the forge sprite's chimney top and anvil. */
/** When each forge's smith last struck (for the anvil glow). */
const smithHitAt = new Map<string, number>();
const smithLastFrame = new Map<string, number>();
/** Cabin chimney top relative to the plot (world units). */
const CABIN_CHIMNEY = { x: -15, y: -37 };
let puffSprite: HTMLCanvasElement | null = null;
/**
 * Chimney smoke: soft puffs that rise, grow, drift downwind and thin out, each on its own
 * phase so the plume is continuous. `amount` scales density; `grey` is the base shade.
 */
function chimneySmoke(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, amount: number, grey: number, wind = 0): void {
  if (amount <= 0 || typeof document === "undefined") return;
  if (!puffSprite) {
    puffSprite = document.createElement("canvas");
    puffSprite.width = puffSprite.height = 64;
    const g = puffSprite.getContext("2d")!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,0.9)");
    gr.addColorStop(0.55, "rgba(255,255,255,0.45)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }
  const N = 7;
  const a0 = ctx.globalAlpha;
  ctx.save();
  // Tint the white puff by drawing it over a shade: cheap with "multiply" off, so instead fade
  // between the puff and its grey copy via alpha (grey sprite cached per shade).
  const sprite = greyPuff(grey);
  for (let i = 0; i < N; i++) {
    const t = (time * 0.32 + i / N) % 1;
    const r = 3 + t * 11;
    // A gust (wind > 0) flattens the plume downwind, bending it more the higher it has risen.
    const px = x + t * 14 + Math.sin(time * 1.3 + i * 2.1) * 2 * t + wind * t * t * 34;
    const py = y - t * 38 * (1 - Math.max(0, wind) * 0.4);
    ctx.globalAlpha = a0 * amount * Math.sin(Math.min(1, t * 4) * Math.PI * 0.5) * (1 - t) * 0.85;
    ctx.drawImage(sprite, px - r, py - r, r * 2, r * 2);
  }
  ctx.restore();
}
const greyPuffs = new Map<number, HTMLCanvasElement>();
function greyPuff(grey: number): HTMLCanvasElement {
  let c = greyPuffs.get(grey);
  if (!c) {
    c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.drawImage(puffSprite!, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = `rgb(${grey},${grey},${grey + 6})`;
    g.fillRect(0, 0, 64, 64);
    greyPuffs.set(grey, c);
  }
  return c;
}
const FORGE_FX = { smokeX: 12, smokeY: -35, smithX: 44, smithY: 20 };
let bldImg: HTMLImageElement | null = null;
/** Draw a 3D-rendered camp building standing on (x, baseY); false while the atlas loads. */
export function buildingSprite(ctx: CanvasRenderingContext2D, name: string, x: number, baseY: number, scale = 1): boolean {
  if (typeof Image === "undefined") return false;
  if (!bldImg) {
    bldImg = new Image();
    bldImg.src = "./sprites/props/buildings.webp";
  }
  const e = BUILDING_ATLAS[name];
  if (!bldImg.complete || bldImg.naturalWidth === 0 || !e) return false;
  const [sx, sy, sw, sh, fx, fy] = e;
  const k = 0.5 * scale;
  ctx.drawImage(bldImg, sx, sy, sw, sh, x - fx * k, baseY - fy * k, sw * k, sh * k);
  return true;
}
function towerPart(ctx: CanvasRenderingContext2D, img: HTMLImageElement, name: string, x: number, baseY: number): void {
  const e = TOWER_ATLAS[name];
  if (!e) return;
  const [sx, sy, sw, sh, fx, fy] = e;
  const k = 0.5;
  ctx.drawImage(img, sx, sy, sw, sh, x - fx * k, baseY - fy * k, sw * k, sh * k);
}
import { BOWS_PER_TOWER, FORGE_IN, FORGE_OUT, TOWER_LEVELS, type Camp, type Plot } from "./sim";
import { HALL, SEGMENT_W, WALL_Y } from "./world";

/** Shared animation state the building drawers need from the renderer. */
export interface DrawEnv {
  time: number;
  fx: Fx;
  builtAt: Map<string, number>;
  hallHitAt: number;
  /** Eased health-bar state (see CampRenderer.barState). */
  barState(key: number | string, frac: number): { shown: number; trail: number; hit: number; fade: number };
  /** Strength of the passing wind gust at world x (see CampRenderer.gustAt). */
  gustAt(x: number): number;
  /** Draws the rendered lumberjack (also used as the smith); returns the frame drawn or -1. */
  drawLumberjackFrame(ctx: CanvasRenderingContext2D, x: number, footY: number, walking: boolean, t: number, flip: boolean, still?: boolean): number;
  /** Draws a label now by day, or above the night darkness at night (same transform/alpha). */
  overlay(ctx: CanvasRenderingContext2D, draw: (ctx: CanvasRenderingContext2D) => void): void;
}

/** Last left/right facing of each tower archer (render-only memory for the facing dead zone). */
const archerFlip = new Map<string, boolean>();

export function drawTower(env: DrawEnv, ctx: CanvasRenderingContext2D, p: Plot): void {
  const st = TOWER_LEVELS[p.level - 1]!;
  const { x, y } = p;
  // Pop when just built/upgraded.
  const since = env.time - (env.builtAt.get(p.id) ?? -9);
  const [sx, sy] = riseScale(since);
  ctx.save();
  ctx.translate(x, y + 16);
  ctx.scale(sx, sy);
  ctx.translate(-x, -(y + 16));
  const tall = 34 + p.level * 6;
  const timg = towerAtlas();
  const lv = Math.min(4, Math.max(1, p.level));
  if (timg) towerPart(ctx, timg, `tower${lv}`, x, y + 4);
  // Long soft shadow cast down-right by the shared top-left light (taller towers, longer shadow).
  if (!timg) softShadow(ctx, x + 8 + tall * 0.18, y + 18, 34 + tall * 0.12, 11, 0.34);
  const py = y - tall;
  const D = 9; // platform depth (how far the top face recedes)
  const W = 30;
  if (!timg) {
  // Posts: the back pair sits higher and darker (further away), the front pair is lit on its left edge.
  const post = (x1: number, y1: number, x2: number, y2: number, w: number, base: string, lit: string): void => {
    ctx.lineCap = "round";
    ctx.strokeStyle = INK;
    ctx.lineWidth = w + 2.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = base;
    ctx.lineWidth = w;
    ctx.stroke();
    ctx.strokeStyle = lit;
    ctx.lineWidth = w * 0.35;
    ctx.beginPath();
    ctx.moveTo(x1 - w * 0.22, y1);
    ctx.lineTo(x2 - w * 0.22, y2);
    ctx.stroke();
  };
  for (const dx of [-17, 17]) post(x + dx, y + 6, x + dx * 0.9, py - D + 4, 4, "#5a3a1e", "#7a5432");
  // Cross braces between the front posts.
  ctx.strokeStyle = "#4a2e16";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 20, y + 8);
  ctx.lineTo(x + 17, py + 18);
  ctx.moveTo(x + 20, y + 8);
  ctx.lineTo(x - 17, py + 18);
  ctx.stroke();
  for (const dx of [-22, 22]) post(x + dx, y + 16, x + dx * 0.88, py + 10, 5.5, "#7a5230", "#b4874e");
  // Platform as a box: lit top face, mid front face, dark right side face.
  ctx.lineJoin = "round";
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  // Right side (in shade).
  ctx.fillStyle = "#5e3c1c";
  ctx.beginPath();
  ctx.moveTo(x + W, py);
  ctx.lineTo(x + W + 5, py - D + 2);
  ctx.lineTo(x + W + 5, py + 10);
  ctx.lineTo(x + W, py + 13);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Top face (in light), planks receding.
  const top = ctx.createLinearGradient(x - W, py - D, x + W, py);
  top.addColorStop(0, "#e2b273");
  top.addColorStop(1, "#b98545");
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.moveTo(x - W, py);
  ctx.lineTo(x - W + 5, py - D);
  ctx.lineTo(x + W + 5, py - D);
  ctx.lineTo(x + W, py);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(90,58,30,0.55)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    const t = i / 3;
    ctx.beginPath();
    ctx.moveTo(x - W + 5 * t, py - D * t);
    ctx.lineTo(x + W + 5 * t, py - D * t);
    ctx.stroke();
  }
  }
  // Archers stand on the deck, turning to aim at their target.
  for (let i = 0; i < st.archers; i++) {
    const ax = x + 2 + (i - (st.archers - 1) / 2) * 17;
    // Just built/upgraded: once the tower lands, its archers hop for joy (staggered).
    const cheerT = env.time - (env.builtAt.get(p.id) ?? -9) - 0.6 - i * 0.07;
    const cheer = cheerT > 0 && cheerT < 0.7 ? Math.abs(Math.sin((cheerT / 0.35) * Math.PI)) * 5 * (1 - cheerT / 0.7) : 0;
    const ay = py - D * 0.5 - 6 - cheer;
    const recoil = Math.max(0, 1 - p.fired / 0.2);
    // The blue archer: draw-and-loose frames right after a shot, idle breathing otherwise.
    // Timed so the arrow leaves on the release pose (~4 of 6): draw back while the next shot is
    // coming up, release as it fires, follow through, then ease back to idle.
    const since = p.fired, draw = 0.32;
    const stag = i * 0.04; // archers on one tower don't move as one
    let anim: "attack" | "idle" = "idle";
    let frame = animFrame("idle", env.time + i * 0.4 + p.x * 0.01, 5.4 + i * 0.5);
    if (since < 0.16 + stag) {
      anim = "attack";
      frame = Math.min(5, 4 + Math.max(0, since - stag) / 0.16);
    } else if (p.cooldown > 0 && p.cooldown < draw) {
      anim = "attack";
      frame = Math.max(0, (1 - p.cooldown / draw) * 4 - stag * 10);
    }
    // Face left/right with a dead zone around straight ahead, so a target walking down the middle
    // doesn't make the archer flicker back and forth between mirror poses.
    const fk = `${p.id}:${i}`, cf = Math.cos(p.facing);
    // (The archer art faces right natively, so mirror it for targets on the left.)
    const flip = cf < -0.3 ? true : cf > 0.3 ? false : (archerFlip.get(fk) ?? cf < 0);
    archerFlip.set(fk, flip);
    if (!drawAnim(ctx, "archer_ally", anim, frame, ax, ay + 7, 27, { flip, key: fk }))
      drawUnit(ctx, LOOKS.archer!, ax, ay - recoil * 1.5, 8, 0, p.facing, false, -recoil * 0.5);
    // Bowstring twang on release: a flash at the bow and a short streak along the shot.
    const rel = since - stag;
    if (rel >= 0 && rel < 0.1) {
      const u = rel / 0.1;
      const bx = ax + Math.cos(p.facing) * 7, by = ay - 4 + Math.sin(p.facing) * 4;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const fg = ctx.createRadialGradient(bx, by, 0.5, bx, by, 7);
      fg.addColorStop(0, `rgba(255,250,220,${(0.9 * (1 - u)).toFixed(3)})`);
      fg.addColorStop(1, "rgba(255,230,160,0)");
      ctx.fillStyle = fg;
      ctx.fillRect(bx - 7, by - 7, 14, 14);
      ctx.strokeStyle = `rgba(255,246,210,${(0.8 * (1 - u)).toFixed(3)})`;
      ctx.lineWidth = 1.4;
      ctx.lineCap = "round";
      const L0 = 4 + u * 10, L1 = L0 + 8 * (1 - u);
      ctx.beginPath();
      ctx.moveTo(bx + Math.cos(p.facing) * L0, by + Math.sin(p.facing) * L0);
      ctx.lineTo(bx + Math.cos(p.facing) * L1, by + Math.sin(p.facing) * L1);
      ctx.stroke();
      ctx.restore();
    }
  }
  if (timg) towerPart(ctx, timg, `tower${lv}f`, x, y + 4);
  else {
  // Front face (mid tone) with plank seams and a lit top edge.
  const front = ctx.createLinearGradient(0, py, 0, py + 13);
  front.addColorStop(0, "#a8733c");
  front.addColorStop(1, "#7c4f26");
  ctx.fillStyle = front;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x - W, py, W * 2, 13, 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(60,36,16,0.5)";
  for (let i = 1; i < 5; i++) ctx.fillRect(x - W + i * 12, py + 2, 1.5, 10);
  ctx.fillStyle = "rgba(255,230,180,0.45)";
  ctx.fillRect(x - W + 2, py + 1, W * 2 - 4, 1.5);
  // Low railing along the front edge of the deck, over the archers' feet.
  ctx.fillStyle = "#c99558";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x - W + 1, py - 5, W * 2 - 2, 4.5, 2);
  ctx.fill();
  ctx.stroke();
  }
  // Bow rack: one notch per delivered bow.
  if (p.bows > 0) {
    ctx.fillStyle = "#3a2410";
    ctx.beginPath();
    ctx.roundRect(x - 22, y + 2, 44, 9, 3);
    ctx.fill();
    for (let i = 0; i < BOWS_PER_TOWER; i++) {
      ctx.fillStyle = i < p.bows ? "#ffcc55" : "#5a4430";
      ctx.fillRect(x - 20 + i * 4.1, y + 4, 3, 5);
    }
  }
  // Banner with level: a cloth pennant rippling in the wind (lit near the pole, shaded at the tail).
  const poleX = x + W - 3;
  const poleTop = py - D - 30;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(poleX, py - D + 2);
  ctx.lineTo(poleX, poleTop);
  ctx.stroke();
  ctx.strokeStyle = "#d8c098";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // Built or upgraded: once the tower has risen, the pennant is hoisted up the pole (overshooting
  // a touch and flapping hard on the way up) instead of just appearing.
  const hu = Math.max(0, Math.min(1, (since - 0.45) / 0.7));
  const he = hu >= 1 ? 1 : 1 + 2.4 * (hu - 1) ** 3 + 1.4 * (hu - 1) ** 2;
  const flagTop = poleTop + (1 - he) * 26;
  const t = env.time * (4 + (1 - hu) * 6) + x * 0.05;
  // Travelling wave, growing toward the free end (a little gust layered in).
  const wave = (k: number): number => (Math.sin(t - k * 3.2) * 2.4 + Math.sin(t * 0.37 - k * 1.3) * 0.8) * k * (1 + (1 - hu) * 0.8);
  const len = 21, hgt = 11, N = 10;
  const top: [number, number][] = [], bot: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const k = i / N;
    const w = wave(k);
    const taper = hgt * (1 - k * 0.35);
    top.push([poleX + k * len, flagTop + 1 + w + k * 1.5]);
    bot.push([poleX + k * len, flagTop + 1 + w + k * 1.5 + taper]);
  }
  // Swallowtail notch at the free end.
  const tip = top[N]!, tipB = bot[N]!;
  const notch: [number, number] = [tip[0] - 4, (tip[1] + tipB[1]) / 2];
  ctx.beginPath();
  ctx.moveTo(top[0]![0], top[0]![1]);
  for (const [px2, py3] of top) ctx.lineTo(px2, py3);
  ctx.lineTo(notch[0], notch[1]);
  for (let i = N; i >= 0; i--) ctx.lineTo(bot[i]![0], bot[i]![1]);
  ctx.closePath();
  // A fully upgraded tower flies a gold pennant with a star (instead of a number).
  const maxed = p.level >= p.maxLevel;
  ctx.fillStyle = maxed ? "#e0a82a" : "#3d6aa8";
  ctx.fill();
  // Fold shading: bands lit where the cloth turns toward the light, shaded where it turns away.
  ctx.save();
  ctx.clip();
  for (let i = 0; i < N; i++) {
    const slope = top[i + 1]![1] - top[i]![1];
    const lit = Math.max(-1, Math.min(1, -slope / 1.4));
    ctx.fillStyle = lit > 0 ? (maxed ? `rgba(255,245,190,${(lit * 0.55).toFixed(3)})` : `rgba(160,200,255,${(lit * 0.45).toFixed(3)})`) : maxed ? `rgba(90,40,0,${(-lit * 0.4).toFixed(3)})` : `rgba(10,20,50,${(-lit * 0.4).toFixed(3)})`;
    ctx.fillRect(top[i]![0], flagTop - 8, len / N + 0.6, hgt + 20);
  }
  // Gold trim along the top edge.
  ctx.strokeStyle = "rgba(255,216,74,0.9)";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  top.forEach(([px2, py3], i) => (i ? ctx.lineTo(px2, py3 + 0.8) : ctx.moveTo(px2, py3 + 0.8)));
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = "rgba(20,30,60,0.7)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // Level number on the cloth.
  const py2 = flagTop + 7 + wave(0.35);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (maxed) {
    // Star on the cloth, and a slow twinkle at the pole top.
    ctx.fillStyle = "#fff6d0";
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 ? 1.8 : 4.2, aa = (k * Math.PI) / 5 - Math.PI / 2;
      ctx.lineTo(poleX + 8 + Math.cos(aa) * rr, py2 + Math.sin(aa) * rr);
    }
    ctx.closePath();
    ctx.fill();
    const tw = Math.max(0, Math.sin(env.time * 2.2 + x * 0.1));
    if (tw > 0.2) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(255,240,170,${(tw * 0.9).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      const r = 2 + tw * 4;
      ctx.beginPath();
      ctx.moveTo(poleX - r, poleTop); ctx.lineTo(poleX + r, poleTop);
      ctx.moveTo(poleX, poleTop - r); ctx.lineTo(poleX, poleTop + r);
      ctx.stroke();
      ctx.restore();
    }
  } else {
    ctx.fillStyle = "#ffd84a";
    ctx.font = `bold 9px ${FONT}`;
    ctx.fillText(String(p.level), poleX + 7, py2);
  }
  ctx.restore();
}

export function drawBarracks(env: DrawEnv, ctx: CanvasRenderingContext2D, p: Plot): void {
  const { x, y } = p;
  const since = env.time - (env.builtAt.get(p.id) ?? -9);
  const [sx, sy] = riseScale(since);
  ctx.save();
  ctx.translate(x, y + 18);
  ctx.scale(sx, sy);
  ctx.translate(-x, -(y + 18));
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  // The canvas breathes in the wind: a slow lean of the upper body around the pegged base.
  const gust = Math.sin(env.time * 1.3 + x * 0.02) * 0.6 + Math.sin(env.time * 2.9 + x * 0.05) * 0.4;
  ctx.save();
  ctx.translate(x, y + 18);
  ctx.transform(1, 0, -gust * 0.03, 1 - Math.abs(gust) * 0.01, 0, 0);
  ctx.translate(-x, -(y + 18));
  const drew = buildingSprite(ctx, "tent", x, y + 18);
  ctx.restore();
  if (drew) {
    ctx.restore();
    return;
  }
  softShadow(ctx, x + 14, y + 20, 46, 13, 0.34);
  const billow = Math.sin(env.time * 2.2 + x * 0.03) * 1.2;
  // Guy ropes and pegs.
  ctx.strokeStyle = "rgba(60,40,20,0.7)";
  ctx.lineWidth = 1;
  for (const k of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + k * 14, y - 12);
    ctx.lineTo(x + k * 46, y + 16);
    ctx.stroke();
    ctx.fillStyle = "#6a4420";
    ctx.fillRect(x + k * 46 - 1.5, y + 13, 3, 6);
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  // Side slope receding up-right, in shade, gently billowing.
  ctx.fillStyle = "#a8a088";
  ctx.beginPath();
  ctx.moveTo(x, y - 30);
  ctx.lineTo(x + 12, y - 36);
  ctx.quadraticCurveTo(x + 32 + billow, y - 8, x + 48, y + 12);
  ctx.lineTo(x + 36, y + 18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Front canvas face, lit from the top-left.
  const canvas = ctx.createLinearGradient(x - 36, y - 30, x + 36, y + 18);
  canvas.addColorStop(0, "#fffaea");
  canvas.addColorStop(1, "#cfc6a8");
  ctx.fillStyle = canvas;
  ctx.beginPath();
  ctx.moveTo(x - 36, y + 18);
  ctx.quadraticCurveTo(x - 16 - billow * 0.5, y - 4, x, y - 30);
  ctx.quadraticCurveTo(x + 16 + billow * 0.5, y - 4, x + 36, y + 18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Blue stripes, shaded to match the canvas.
  for (const k of [-1, 1]) {
    const stripe = ctx.createLinearGradient(x + k * 22, y - 30, x + k * 12, y + 18);
    stripe.addColorStop(0, k < 0 ? "#5a8ad0" : "#3d6aa8");
    stripe.addColorStop(1, k < 0 ? "#3d6aa8" : "#2a4e86");
    ctx.fillStyle = stripe;
    ctx.beginPath();
    ctx.moveTo(x, y - 30);
    ctx.lineTo(x + k * 12, y + 18);
    ctx.lineTo(x + k * 22, y + 18);
    ctx.closePath();
    ctx.fill();
  }
  // Open door flap: dark interior, the flap folded back and lit.
  ctx.fillStyle = "#2a1a0e";
  ctx.beginPath();
  ctx.moveTo(x - 8, y + 18);
  ctx.lineTo(x, y);
  ctx.lineTo(x + 8, y + 18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#e8e0c8";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 8, y + 18);
  ctx.lineTo(x + 13, y + 14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Flag.
  ctx.beginPath();
  ctx.moveTo(x, y - 30);
  ctx.lineTo(x, y - 50);
  ctx.stroke();
  ctx.fillStyle = "#ffd84a";
  ctx.beginPath();
  ctx.moveTo(x, y - 50);
  ctx.lineTo(x + 16, y - 45 + Math.sin(env.time * 5) * 2);
  ctx.lineTo(x, y - 40);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Weapon rack.
  ctx.strokeStyle = "#7a5230";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 34, y + 16);
  ctx.lineTo(x + 34, y - 4);
  ctx.moveTo(x + 44, y + 16);
  ctx.lineTo(x + 44, y - 4);
  ctx.stroke();
  ctx.restore();
}

export function drawCatapult(env: DrawEnv, ctx: CanvasRenderingContext2D, p: Plot): void {
  const { x, y } = p;
  const since = env.time - (env.builtAt.get(p.id) ?? -9);
  const [sx, sy] = riseScale(since);
  const recoil = Math.max(0, 1 - p.fired / 0.35);
  ctx.save();
  ctx.translate(x, y + 16);
  ctx.scale(sx, sy);
  ctx.translate(-x, -(y + 16));
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  const body3d = buildingSprite(ctx, "catapult", x, y + 14);
  if (!body3d) {
  softShadow(ctx, x + 10, y + 18, 40, 12, 0.34);
  // A spoked wheel seen nearly side-on: dark rim, lit hub, spokes that jolt when it fires.
  const wheel = (wx: number, wy: number, r: number, back: boolean): void => {
    ctx.fillStyle = back ? "#3e2814" : "#5a3a1e";
    ctx.beginPath();
    ctx.ellipse(wx, wy, r * 0.82, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (back) return;
    ctx.strokeStyle = "#8a5a2e";
    ctx.lineWidth = 1.5;
    const spin = recoil * 0.9;
    for (let k = 0; k < 4; k++) {
      const a = spin + (k * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(wx - Math.cos(a) * r * 0.7, wy - Math.sin(a) * r * 0.85);
      ctx.lineTo(wx + Math.cos(a) * r * 0.7, wy + Math.sin(a) * r * 0.85);
      ctx.stroke();
    }
    ctx.fillStyle = "#c8a070";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(wx, wy, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 2;
  };
  // Back wheels peek out up-right (depth), then the frame box, then the front wheels.
  for (const dx of [-14, 26]) wheel(x + dx, y + 9, 6, true);
  ctx.fillStyle = "#5e3c1c";
  ctx.beginPath();
  ctx.moveTo(x + 28, y + 2);
  ctx.lineTo(x + 34, y - 3);
  ctx.lineTo(x + 34, y + 8);
  ctx.lineTo(x + 28, y + 14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const deck = ctx.createLinearGradient(x - 28, y - 3, x + 28, y + 2);
  deck.addColorStop(0, "#d6a466");
  deck.addColorStop(1, "#a8743e");
  ctx.fillStyle = deck;
  ctx.beginPath();
  ctx.moveTo(x - 28, y + 2);
  ctx.lineTo(x - 22, y - 3);
  ctx.lineTo(x + 34, y - 3);
  ctx.lineTo(x + 28, y + 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const face = ctx.createLinearGradient(0, y + 2, 0, y + 14);
  face.addColorStop(0, "#9a6a36");
  face.addColorStop(1, "#6a4420");
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.roundRect(x - 28, y + 2, 56, 12, 2);
  ctx.fill();
  ctx.stroke();
  for (const dx of [-20, 20]) wheel(x + dx, y + 15, 7.5, false);
  // A-frame uprights, lit on their left edge.
  const upright = (ux: number): void => {
    ctx.fillStyle = "#9a6a36";
    ctx.fillRect(ux, y - 18, 6, 21);
    ctx.strokeRect(ux, y - 18, 6, 21);
    ctx.fillStyle = "rgba(255,225,175,0.45)";
    ctx.fillRect(ux + 1, y - 17, 1.5, 19);
  };
  upright(x - 12);
  upright(x + 6);
  }
  // Throwing arm: cranks back as the shot comes due, whips forward over ~0.09 s when it fires
  // (accelerating into the release), then wobbles back to rest.
  const REST = -0.5, BACK = -0.15, THROWN = -2.15;
  let ang: number;
  const f = p.fired;
  if (f < 0.09) {
    const u = f / 0.09;
    ang = BACK + (THROWN - BACK) * u * u;
  } else if (f < 0.6) {
    const u = (f - 0.09) / 0.51;
    const e = 1 - (1 - u) * (1 - u);
    ang = THROWN + (REST - THROWN) * e + Math.sin(u * Math.PI * 3) * 0.16 * (1 - u);
  } else {
    const wind = p.cooldown > 0 && p.cooldown < 0.45 ? 1 - p.cooldown / 0.45 : 0;
    ang = REST + (BACK - REST) * wind * wind * (3 - 2 * wind);
  }
  ctx.save();
  ctx.translate(x, y - 14);
  ctx.rotate(ang);
  const dimg = decorAtlas();
  const armE = DECOR_ATLAS[(f < 0.07 || f > 0.9) ? "cat_arm1" : "cat_arm_empty1"];
  if (dimg && armE) {
    // 3D-rendered arm (beam, iron bands, bowl and stone), pivoting a little above its foot.
    const [ax, ay, aw, ah, afx, afy] = armE;
    const k = 0.5;
    ctx.drawImage(dimg, ax, ay, aw, ah, -afx * k, 6 - afy * k, aw * k, ah * k);
    ctx.restore();
    drawTorsion(ctx, x, y, false);
    ctx.restore();
    return;
  }
  const arm = ctx.createLinearGradient(-4, 0, 4, 0);
  arm.addColorStop(0, "#e0ac6a");
  arm.addColorStop(1, "#9a6630");
  ctx.fillStyle = arm;
  ctx.beginPath();
  ctx.roundRect(-4, -40, 8, 46, 2);
  ctx.fill();
  ctx.stroke();
  // Cup.
  const cup = ctx.createRadialGradient(-2, -44, 1, 0, -42, 10);
  cup.addColorStop(0, "#8a6a44");
  cup.addColorStop(1, "#3e2a14");
  ctx.fillStyle = cup;
  ctx.beginPath();
  ctx.ellipse(0, -42, 9, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (f < 0.07 || f > 0.9) {
    // A round stone, lit from the top-left.
    const rock = ctx.createRadialGradient(-2.5, -48, 0.5, 0, -45, 7);
    rock.addColorStop(0, "#c8c0b4");
    rock.addColorStop(0.6, "#7a7268");
    rock.addColorStop(1, "#4a443c");
    ctx.fillStyle = rock;
    ctx.beginPath();
    ctx.arc(0, -45, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  drawTorsion(ctx, x, y, true);
  ctx.restore();
}

/** Rope torsion bundle at the catapult's pivot (drawn over the arm's foot); soft-shaded, without
 *  the ink outline, when it sits on the 3D-rendered body. */
function drawTorsion(ctx: CanvasRenderingContext2D, x: number, y: number, ink: boolean): void {
  const g = ctx.createLinearGradient(x, y - 18.5, x, y - 9.5);
  g.addColorStop(0, "#e2cc9a");
  g.addColorStop(1, "#9a8256");
  ctx.fillStyle = ink ? "#c8b080" : g;
  ctx.beginPath();
  ctx.ellipse(x, y - 14, 9, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (ink) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(110,80,40,0.7)";
  ctx.lineWidth = 1;
  for (let k = -6; k <= 6; k += 3) {
    ctx.beginPath();
    ctx.moveTo(x + k, y - 18);
    ctx.lineTo(x + k + 1.5, y - 10);
    ctx.stroke();
  }
}

export function drawLumberCamp(env: DrawEnv, ctx: CanvasRenderingContext2D, p: Plot): void {
  const { x, y } = p;
  const since = env.time - (env.builtAt.get(p.id) ?? -9);
  const [sx, sy] = riseScale(since);
  ctx.save();
  ctx.translate(x, y + 20);
  ctx.scale(sx, sy);
  ctx.translate(-x, -(y + 20));
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  if (buildingSprite(ctx, "cabin", x, y + 20)) {
    // Thin wood smoke from the stone chimney at the back.
    chimneySmoke(ctx, x + CABIN_CHIMNEY.x, y + CABIN_CHIMNEY.y, env.time + 3.7, 0.8, 0x9a, env.gustAt(x));
    ctx.restore();
    return;
  }
  softShadow(ctx, x + 14, y + 22, 46, 13, 0.34);
  const DX = 9;
  const DY = -6;
  // Side wall in shade (depth).
  ctx.fillStyle = "#6a4420";
  ctx.beginPath();
  ctx.moveTo(x + 30, y - 10);
  ctx.lineTo(x + 30 + DX, y - 10 + DY);
  ctx.lineTo(x + 30 + DX, y + 18 + DY);
  ctx.lineTo(x + 30, y + 22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Front wall of stacked round logs: each lit on top, shaded underneath, with cut ends.
  for (let i = 0; i < 4; i++) {
    const ly = y - 10 + i * 8;
    const g = ctx.createLinearGradient(0, ly, 0, ly + 8);
    g.addColorStop(0, "#d09a5a");
    g.addColorStop(0.5, "#a8743e");
    g.addColorStop(1, "#6e4622");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x - 31, ly, 62, 8, 4);
    ctx.fill();
    ctx.stroke();
    for (const ex of [x - 31, x + 31]) {
      ctx.fillStyle = "#e8c890";
      ctx.beginPath();
      ctx.arc(ex, ly + 4, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgba(140,96,48,0.8)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(ex, ly + 4, 1.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
    }
  }
  // Mossy roof: shaded side plane, then the front slope lit from the top-left.
  ctx.fillStyle = "#3e5a22";
  ctx.beginPath();
  ctx.moveTo(x + 38, y - 8);
  ctx.lineTo(x, y - 40);
  ctx.lineTo(x + DX, y - 40 + DY);
  ctx.lineTo(x + 38 + DX, y - 8 + DY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const moss = ctx.createLinearGradient(x - 38, y - 40, x + 38, y - 8);
  moss.addColorStop(0, "#9cc05a");
  moss.addColorStop(0.55, "#6a8a3a");
  moss.addColorStop(1, "#4a6a28");
  ctx.fillStyle = moss;
  ctx.beginPath();
  ctx.moveTo(x - 38, y - 8);
  ctx.lineTo(x, y - 40);
  ctx.lineTo(x + 38, y - 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(220,255,170,0.45)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - 34, y - 10);
  ctx.lineTo(x - 1, y - 37);
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  // Door, recessed.
  const door = ctx.createLinearGradient(0, y + 4, 0, y + 22);
  door.addColorStop(0, "#2a1a0e");
  door.addColorStop(1, "#5a3a20");
  ctx.fillStyle = door;
  ctx.beginPath();
  ctx.roundRect(x - 8, y + 4, 16, 18, [8, 8, 0, 0]);
  ctx.fill();
  ctx.stroke();
  // Axe sign.
  drawIcon(ctx, "hammer", x + 20, y - 18, 7, "#d8dce4");
  // Level pips.
  ctx.restore();
}

export function drawForge(env: DrawEnv, ctx: CanvasRenderingContext2D, c: Camp, p: Plot): void {
  const { x, y } = p;
  const since = env.time - (env.builtAt.get(p.id) ?? -9);
  const [sx, sy] = riseScale(since);
  const working = c.forgeLogs > 0 && c.forgeBows < 15;
  ctx.save();
  ctx.translate(x, y + 20);
  ctx.scale(sx, sy);
  ctx.translate(-x, -(y + 20));
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  if (buildingSprite(ctx, "forge", x, y + 22)) {
    // Animated life on top of the 3D smithy: chimney smoke, the smith hammering, sparks.
    chimneySmoke(ctx, x + FORGE_FX.smokeX, y + FORGE_FX.smokeY, env.time, working ? 1 : 0.35, 0x5a, env.gustAt(x));
    // The smith (rendered character) works the anvil; sparks fly on the downstroke.
    const sx0 = x + FORGE_FX.smithX, sy0 = y + FORGE_FX.smithY + 9;
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(sx0, sy0, 9, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    const f = env.drawLumberjackFrame(ctx, sx0, sy0, false, env.time * 0.9, false, !working);
    if (f < 0) {
      const hammer = working ? Math.abs(Math.sin(env.time * 7)) : 0;
      drawUnit(ctx, LOOKS.worker!, sx0, sy0 - 9, 8, 0, Math.PI, false, -0.6 + hammer * 1.4);
    } else if (working && f === 5 && smithLastFrame.get(p.id) !== 5) {
      env.fx.burst(x + 29, y + 22, "#ffd060", 6, 110, { max: 0.3, size: 2, shape: "spark", gravity: 260 });
      smithHitAt.set(p.id, env.time);
    }
    smithLastFrame.set(p.id, f);
    // The metal on the anvil glows: white-hot on each blow, cooling through orange to a dull red;
    // the smithy's doorway throws a flickering warm light while the fire is worked.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    if (working) {
      const fl = 0.75 + Math.sin(env.time * 9.3) * 0.12 + Math.sin(env.time * 15.1) * 0.08;
      const dg = ctx.createRadialGradient(x - 6, y + 14, 2, x - 6, y + 14, 34);
      dg.addColorStop(0, `rgba(255,150,60,${(0.22 * fl).toFixed(3)})`);
      dg.addColorStop(1, "rgba(255,120,40,0)");
      ctx.fillStyle = dg;
      ctx.fillRect(x - 40, y - 20, 68, 68);
    }
    const ht = env.time - (smithHitAt.get(p.id) ?? -9);
    const heat = working ? Math.max(0.25, Math.exp(-ht * 3.2)) : Math.max(0, 0.25 - ht * 0.1);
    if (heat > 0.01) {
      const r = 3 + heat * 7;
      const col = heat > 0.7 ? "255,240,200" : heat > 0.4 ? "255,180,80" : "230,90,40";
      const hg = ctx.createRadialGradient(x + 29, y + 22, 0.5, x + 29, y + 22, r);
      hg.addColorStop(0, `rgba(${col},${Math.min(1, heat).toFixed(3)})`);
      hg.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = hg;
      ctx.fillRect(x + 29 - r, y + 22 - r, r * 2, r * 2);
    }
    ctx.restore();
    ctx.restore();
    return;
  }
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(x + 5, y + 24, 44, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  // Stone smithy.
  ctx.fillStyle = "#9a948a";
  ctx.beginPath();
  ctx.roundRect(x - 34, y - 12, 68, 34, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#b4aea4";
  for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) ctx.fillRect(x - 32 + k * 17 + (r % 2) * 8, y - 10 + r * 11, 14, 8);
  // Roof.
  ctx.fillStyle = "#a8402a";
  ctx.beginPath();
  ctx.moveTo(x - 42, y - 10);
  ctx.lineTo(x - 26, y - 38);
  ctx.lineTo(x + 26, y - 38);
  ctx.lineTo(x + 42, y - 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Chimney with smoke.
  ctx.fillStyle = "#7a746a";
  ctx.fillRect(x + 14, y - 54, 12, 20);
  ctx.strokeRect(x + 14, y - 54, 12, 20);
  if (working)
    for (let i = 0; i < 3; i++) {
      const t = (env.time * 0.8 + i / 3) % 1;
      ctx.fillStyle = `rgba(90,90,90,${0.5 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(x + 20 + t * 8, y - 58 - t * 28, 4 + t * 6, 0, Math.PI * 2);
      ctx.fill();
    }
  // Furnace mouth glow.
  const glow = working ? 0.7 + 0.3 * Math.sin(env.time * 12) : 0.25;
  ctx.fillStyle = `rgba(255,${Math.round(120 + glow * 80)},40,${glow.toFixed(2)})`;
  ctx.beginPath();
  ctx.roundRect(x - 26, y + 2, 18, 18, [9, 9, 0, 0]);
  ctx.fill();
  ctx.stroke();
  // Anvil + blacksmith.
  ctx.fillStyle = "#4a4e58";
  ctx.beginPath();
  ctx.moveTo(x + 2, y + 28);
  ctx.lineTo(x + 30, y + 28);
  ctx.lineTo(x + 26, y + 22);
  ctx.lineTo(x + 34, y + 18);
  ctx.lineTo(x + 2, y + 18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const hammer = working ? Math.abs(Math.sin(env.time * 7)) : 0;
  drawUnit(ctx, LOOKS.worker!, x + 42, y + 18, 8, 0, Math.PI, false, -0.6 + hammer * 1.4);
  if (working && hammer > 0.97) env.fx.burst(x + 20, y + 16, "#ffd060", 3, 90, { max: 0.25, size: 2, shape: "spark" });
  ctx.restore();
}

export function drawForgeZones(_env: DrawEnv, ctx: CanvasRenderingContext2D, c: Camp): void {
  // Drop-off spots read as real fixtures, not dashed debug boxes: a timber pallet for logs going
  // in, a rack frame for finished bows, each with a small sign.
  for (const [z, label, rack] of [[FORGE_IN, "Logs in", false], [FORGE_OUT, "Bows", true]] as const) {
    softShadow(ctx, z.x + 3, z.y + 15, 26, 6, 0.28);
    ctx.lineJoin = "round";
    for (let k = 0; k < 4; k++) {
      const py = z.y + 2 + k * 4;
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.roundRect(z.x - 24, py - 1, 48, 4.5, 1); ctx.fill();
      ctx.fillStyle = k % 2 ? "#b8844a" : "#c99558";
      ctx.fillRect(z.x - 23, py, 46, 2.5);
      ctx.fillStyle = "rgba(255,236,190,0.45)";
      ctx.fillRect(z.x - 23, py, 46, 0.8);
    }
    if (rack) {
      ctx.strokeStyle = INK; ctx.lineWidth = 3.4; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(z.x - 20, z.y + 4); ctx.lineTo(z.x - 20, z.y - 14); ctx.lineTo(z.x + 20, z.y - 14); ctx.lineTo(z.x + 20, z.y + 4); ctx.stroke();
      ctx.strokeStyle = "#9a6a38"; ctx.lineWidth = 1.8; ctx.stroke();
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    _env.overlay(ctx, (ctx) => {
      ctx.save();
      ctx.globalAlpha *= 0.85;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      outlined(ctx, label, z.x, z.y + 30, 9.5);
      ctx.restore();
    });
  }
  drawLogPile(ctx, FORGE_IN.x, FORGE_IN.y, c.forgeLogs, false);
  for (let i = 0; i < Math.min(15, c.forgeBows); i++) drawBowItem(ctx, FORGE_OUT.x + ((i % 3) - 1) * 13, FORGE_OUT.y + 8 - Math.floor(i / 3) * 6);
}

export function drawHall(env: DrawEnv, ctx: CanvasRenderingContext2D, c: Camp): void {
  const hitT = env.time - env.hallHitAt;
  // A hit rocks the hall: a damped shake that rings out rather than a fixed buzz that cuts off.
  const x = HALL.x + (hitT < 0.45 ? Math.sin(hitT * 70) * 3.2 * Math.exp(-hitT * 9) : 0);
  const y = HALL.y;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  const hallLevel = c.plots.find((p) => p.kind === "hall")?.level ?? 0;
  // The owner's painted castle (grows a little with each hall level); procedural hall as fallback.
  // On an upgrade the castle grows smoothly from its old size to the new one (overshooting a touch
  // and settling) while a band of golden light sweeps up its walls and sparks drift off the top.
  const upT = env.time - (env.builtAt.get("hall") ?? -9);
  const GROW = 0.9;
  let grow = 1;
  if (upT >= 0 && upT < GROW) { const u = upT / GROW - 1, k = 1.6; grow = 1 + (k + 1) * u * u * u + k * u * u; }
  const castleH = 150 + (Math.max(0, hallLevel - 1) + grow) * 14 - (hallLevel === 0 ? 14 : 0);
  softShadow(ctx, x + 18, y + 32, 82 + hallLevel * 6, 24, 0.4);
  // ...and it squashes a touch at the base before springing back.
  const squash = hitT < 0.35 ? Math.sin(hitT * 28) * Math.exp(-hitT * 10) * 0.035 : 0;
  ctx.save();
  ctx.translate(x, y + 40);
  ctx.scale(1 + squash, 1 - squash);
  ctx.translate(-x, -(y + 40));
  const drewCastle = drawSprite(ctx, "castle", x, y + 40, castleH, { walk: 0, time: 0, seed: 0, flip: false, flash: hitT < 0.12 ? 1 - hitT / 0.12 : 0, lunge: 0 });
  ctx.restore();
  // The Grand Hall (fully upgraded) wears a crown of light: a soft gold glow round the keep's top
  // and a few stars that twinkle in turn above the battlements.
  const hallPlot = c.plots.find((p) => p.kind === "hall");
  if (drewCastle && hallPlot && hallPlot.level >= hallPlot.maxLevel) {
    const ty = y + 40 - castleH * 0.8;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const pu = 0.5 + 0.5 * Math.sin(env.time * 1.6);
    const g = ctx.createRadialGradient(x, ty, 4, x, ty, 58);
    g.addColorStop(0, `rgba(255,220,120,${(0.28 + pu * 0.14).toFixed(3)})`);
    g.addColorStop(1, "rgba(255,220,120,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - 60, ty - 60, 120, 120);
    for (let i = 0; i < 5; i++) {
      const tw = Math.max(0, Math.sin(env.time * 2.1 + i * 1.9));
      if (tw < 0.3) continue;
      const sx = x + Math.cos(i * 1.26 - 1.9) * 54, sy = ty - 10 + Math.sin(i * 1.26 - 1.9) * 26;
      const r = 2 + tw * 6;
      ctx.strokeStyle = `rgba(255,240,170,${(tw * 0.9).toFixed(3)})`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(sx - r, sy); ctx.lineTo(sx + r, sy);
      ctx.moveTo(sx, sy - r); ctx.lineTo(sx, sy + r);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (drewCastle && upT >= 0 && upT < 1.4) {
    const u = upT / 1.4;
    const bandY = y + 40 - castleH * (u * 0.95);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createLinearGradient(0, bandY - 26, 0, bandY + 26);
    const a = Math.sin(u * Math.PI) * 0.5;
    g.addColorStop(0, "rgba(255,220,120,0)");
    g.addColorStop(0.5, `rgba(255,220,120,${a.toFixed(3)})`);
    g.addColorStop(1, "rgba(255,220,120,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, bandY, 74 * (1 - u * 0.55), 22, 0, 0, Math.PI * 2);
    ctx.fill();
    // Sparks lifting off the battlements, each on its own drift.
    for (let i = 0; i < 14; i++) {
      const st = (i * 0.37) % 1 * 0.6;
      const v = (upT - st) / 0.8;
      if (v <= 0 || v >= 1) continue;
      const sx = x + Math.sin(i * 2.4) * 62 + Math.sin(v * 5 + i) * 6;
      const sy = y + 40 - castleH * 0.75 - v * 70 - (i % 3) * 8;
      ctx.fillStyle = `rgba(255,236,160,${((1 - v) * 0.9).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 2.2 * (1 - v * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  if (drewCastle) {
    // Hall banners stir in the wind (a soft shimmer over the cloth area).
    // Health eases down with a draining damage chunk and flashes on each hit (shared with units).
    const b = env.barState("hall", Math.max(0, c.hallHp / c.hallMaxHp));
    const frac = b.shown;
    ctx.fillStyle = "rgba(20,10,5,0.85)";
    ctx.beginPath();
    ctx.roundRect(x - 44, y + 46, 88, 9, 4.5);
    ctx.fill();
    ctx.fillStyle = "#ffd8a0";
    ctx.beginPath();
    ctx.roundRect(x - 42, y + 48, Math.max(2, 84 * b.trail), 5, 2.5);
    ctx.fill();
    ctx.fillStyle = b.hit < 0.08 ? "#ffffff" : frac > 0.5 ? "#6fdf4a" : frac > 0.25 ? "#f0b030" : "#ff4a2a";
    ctx.beginPath();
    ctx.roundRect(x - 42, y + 48, Math.max(2, 84 * frac), 5, 2.5);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(x - 41, y + 48, Math.max(0, 84 * frac - 2), 1.2);
    // Chimney-less castle: a thin wisp of torch smoke from the keep (soft puffs, like the chimneys).
    chimneySmoke(ctx, x + 4, y + 40 - castleH * 0.86, env.time + 1.3, 0.7, 0xb8, env.gustAt(x));
    // Badly damaged: dark smoke pours from the battlements and embers drift up — the more hurt,
    // the more of it — so a hall in danger reads on the building itself, not only in the bar.
    const hurt = Math.max(0, Math.min(1, (0.55 - c.hallHp / c.hallMaxHp) / 0.45));
    if (hurt > 0 && c.hallHp > 0) {
      for (let k = 0; k < 2; k++) chimneySmoke(ctx, x - 28 + k * 5, y + 40 - castleH * 0.74, env.time + 0.4 + k * 1.4, 1, 0x2a, env.gustAt(x));
      if (hurt > 0.4) for (let k = 0; k < 2; k++) chimneySmoke(ctx, x + 30 - k * 4, y + 40 - castleH * 0.7, env.time + 2.2 + k * 1.1, 1, 0x26, env.gustAt(x));
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < Math.round(4 + hurt * 8); i++) {
        const u = (env.time * (0.35 + (i % 4) * 0.08) + i * 0.137) % 1;
        const ex = x - 40 + ((i * 53) % 80) + Math.sin(env.time * 2 + i) * 6 * u;
        const ey = y + 40 - castleH * 0.55 - u * 60;
        ctx.fillStyle = `rgba(255,${150 + (i % 3) * 30},60,${((1 - u) * 0.9).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(ex, ey, 1.4 + (1 - u) * 1.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    return;
  }
  const DX = 14; // depth: the right side recedes up-right
  const DY = -8;
  softShadow(ctx, x + 26, y + 30, 92, 26, 0.36);
  // Stone base: lit top edge, block joints, a shaded right end.
  ctx.fillStyle = "#6e6a62";
  ctx.beginPath();
  ctx.moveTo(x + 60, y + 14);
  ctx.lineTo(x + 60 + DX, y + 14 + DY);
  ctx.lineTo(x + 60 + DX, y + 30 + DY);
  ctx.lineTo(x + 60, y + 34);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const stone = ctx.createLinearGradient(x - 60, 0, x + 60, 0);
  stone.addColorStop(0, "#b8b2a6");
  stone.addColorStop(1, "#8e887e");
  ctx.fillStyle = stone;
  ctx.beginPath();
  ctx.roundRect(x - 60, y + 14, 120, 20, 3);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(60,56,50,0.45)";
  ctx.lineWidth = 1;
  for (let k = 1; k < 8; k++) {
    const bx = x - 60 + k * 15 + (k % 2 ? 4 : 0);
    ctx.beginPath();
    ctx.moveTo(bx, y + 16);
    ctx.lineTo(bx, y + 32);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(x - 58, y + 15, 116, 1.5);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  // Timber walls: shaded right side face, then the plaster front lit from the left.
  ctx.fillStyle = "#b39a70";
  ctx.beginPath();
  ctx.moveTo(x + 54, y - 28);
  ctx.lineTo(x + 54 + DX, y - 28 + DY);
  ctx.lineTo(x + 54 + DX, y + 14 + DY);
  ctx.lineTo(x + 54, y + 18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const plaster = ctx.createLinearGradient(x - 54, y - 28, x + 54, y + 18);
  plaster.addColorStop(0, "#f6e6c0");
  plaster.addColorStop(1, "#d6be90");
  ctx.fillStyle = plaster;
  ctx.beginPath();
  ctx.roundRect(x - 54, y - 28, 108, 46, 3);
  ctx.fill();
  ctx.stroke();
  // Timber frame: dark beams with a lit left edge.
  const beam = (x1: number, y1: number, x2: number, y2: number): void => {
    ctx.strokeStyle = "#6a4422";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,220,170,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1 - 1, y1);
    ctx.lineTo(x2 - 1, y2);
    ctx.stroke();
  };
  for (const dx of [-54, -18, 18, 54]) beam(x + dx, y - 28, x + dx, y + 18);
  beam(x - 54, y - 6, x + 54, y - 6);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  // Door: recessed (darker at the top), iron ring.
  const door = ctx.createLinearGradient(0, y - 4, 0, y + 18);
  door.addColorStop(0, "#3e2612");
  door.addColorStop(1, "#7a5030");
  ctx.fillStyle = door;
  ctx.beginPath();
  ctx.roundRect(x - 12, y - 4, 24, 22, [10, 10, 0, 0]);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "#c8a24a";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x + 6, y + 9, 2.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  // Windows: warm, softly flickering firelight from inside.
  const flick = 0.85 + 0.15 * Math.sin(env.time * 7.3) * Math.sin(env.time * 3.1);
  for (const dx of [-36, 36]) {
    const glow = ctx.createRadialGradient(x + dx, y - 16, 1, x + dx, y - 16, 10);
    glow.addColorStop(0, `rgba(255,236,170,${flick.toFixed(2)})`);
    glow.addColorStop(1, "#d89a3a");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.roundRect(x + dx - 7, y - 22, 14, 12, 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#6a4422";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + dx, y - 22);
    ctx.lineTo(x + dx, y - 10);
    ctx.moveTo(x + dx - 7, y - 16);
    ctx.lineTo(x + dx + 7, y - 16);
    ctx.stroke();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
  }
  // Roof: shaded side plane receding right, then the tiled front slope lit from the top-left.
  ctx.fillStyle = "#24467c";
  ctx.beginPath();
  ctx.moveTo(x + 68, y - 24);
  ctx.lineTo(x + 40, y - 76);
  ctx.lineTo(x + 40 + DX, y - 76 + DY);
  ctx.lineTo(x + 68 + DX, y - 24 + DY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const roof = ctx.createLinearGradient(x - 68, y - 76, x + 68, y - 24);
  roof.addColorStop(0, "#6a9ae0");
  roof.addColorStop(0.5, "#3d6aa8");
  roof.addColorStop(1, "#2c5290");
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(x - 68, y - 24);
  ctx.lineTo(x - 40, y - 76);
  ctx.lineTo(x + 40, y - 76);
  ctx.lineTo(x + 68, y - 24);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Tile rows: a dark seam with a lit edge just above it.
  for (let i = 1; i < 4; i++) {
    const yy = y - 24 - i * 13;
    const inset = (i * 28) / 4;
    ctx.strokeStyle = "rgba(20,40,80,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 68 + inset, yy);
    ctx.lineTo(x + 68 - inset, yy);
    ctx.stroke();
    ctx.strokeStyle = "rgba(200,225,255,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 68 + inset + 1, yy - 1.5);
    ctx.lineTo(x + 68 - inset - 1, yy - 1.5);
    ctx.stroke();
  }
  // Lit ridge.
  ctx.strokeStyle = "rgba(220,235,255,0.6)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 39, y - 75);
  ctx.lineTo(x + 39, y - 75);
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  if (hallLevel >= 1) {
    // Side turrets: round stone (cylinder shading) under cone roofs lit on the left.
    for (const k of [-1, 1]) {
      const tx = x + k * 66;
      const cyl = ctx.createLinearGradient(tx - 14, 0, tx + 14, 0);
      cyl.addColorStop(0, "#d2ccc2");
      cyl.addColorStop(0.45, "#b4aea4");
      cyl.addColorStop(1, "#7e786e");
      ctx.fillStyle = cyl;
      ctx.beginPath();
      ctx.roundRect(tx - 14, y - 40, 28, 74, 3);
      ctx.fill();
      ctx.stroke();
      const cone = ctx.createLinearGradient(tx - 18, 0, tx + 18, 0);
      cone.addColorStop(0, "#5a8ad0");
      cone.addColorStop(0.5, "#3d6aa8");
      cone.addColorStop(1, "#24467c");
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(tx - 18, y - 38);
      ctx.lineTo(tx, y - 70);
      ctx.lineTo(tx + 18, y - 38);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = `rgba(255,224,150,${flick.toFixed(2)})`;
      ctx.fillRect(tx - 4, y - 24, 8, 10);
      ctx.strokeRect(tx - 4, y - 24, 8, 10);
    }
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  if (hallLevel >= 1) {
    // Gold ridge trim.
    ctx.strokeStyle = "#ffd84a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 40, y - 76);
    ctx.lineTo(x + 40, y - 76);
    ctx.stroke();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
  }
  if (hallLevel >= 2) {
    // Hanging banners.
    for (const k of [-1, 1]) {
      ctx.fillStyle = "#3d6aa8";
      ctx.beginPath();
      ctx.moveTo(x + k * 36 - 6, y - 4);
      ctx.lineTo(x + k * 36 + 6, y - 4);
      ctx.lineTo(x + k * 36 + 6, y + 14);
      ctx.lineTo(x + k * 36, y + 9);
      ctx.lineTo(x + k * 36 - 6, y + 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffd84a";
      ctx.beginPath();
      ctx.arc(x + k * 36, y + 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Chimney + flag.
  ctx.fillStyle = "#8a7a6a";
  ctx.fillRect(x + 22, y - 92, 12, 20);
  ctx.strokeRect(x + 22, y - 92, 12, 20);
  ctx.beginPath();
  ctx.moveTo(x - 20, y - 76);
  ctx.lineTo(x - 20, y - 112);
  ctx.stroke();
  const wave = Math.sin(env.time * 4) * 3;
  ctx.fillStyle = "#ffd84a";
  ctx.beginPath();
  ctx.moveTo(x - 20, y - 112);
  ctx.quadraticCurveTo(x - 6, y - 110 + wave, x + 6, y - 104);
  ctx.quadraticCurveTo(x - 6, y - 100 + wave, x - 20, y - 98);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Smoke puffs.
  for (let i = 0; i < 3; i++) {
    const t = (env.time * 0.6 + i / 3) % 1;
    ctx.fillStyle = `rgba(230,230,230,${0.5 * (1 - t)})`;
    ctx.beginPath();
    ctx.arc(x + 28 + t * 10, y - 96 - t * 30, 4 + t * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  if (hitT < 0.2) {
    ctx.fillStyle = `rgba(255,60,40,${(0.35 * (1 - hitT / 0.2)).toFixed(2)})`;
    ctx.fillRect(x - 68, y - 76, 136, 110);
  }
  // HP bar.
  const frac = Math.max(0, c.hallHp / c.hallMaxHp);
  ctx.fillStyle = "rgba(20,10,5,0.85)";
  ctx.beginPath();
  ctx.roundRect(x - 44, y + 40, 88, 9, 4.5);
  ctx.fill();
  ctx.fillStyle = frac > 0.5 ? "#6fdf4a" : frac > 0.25 ? "#f0b030" : "#ff4a2a";
  ctx.beginPath();
  ctx.roundRect(x - 42, y + 42, Math.max(2, 84 * frac), 5, 2.5);
  ctx.fill();
}

export function stoneSegment(ctx: CanvasRenderingContext2D, x0: number, frac: number, i: number, battlements: boolean): void {
  const top = WALL_Y - 30;
  ctx.fillStyle = "#a8a29a";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.fillRect(x0, top, SEGMENT_W, 40);
  ctx.strokeRect(x0, top, SEGMENT_W, 40);
  // Brick courses, offset every other row; chunks knocked out as it takes damage.
  const missing = Math.floor((1 - frac) * 5);
  for (let row = 0; row < 4; row++) {
    const y = top + row * 10;
    const off = row % 2 ? 10 : 0;
    for (let b = -1; b < 3; b++) {
      const bx = x0 + off + b * 20;
      const idx = row * 4 + b + 1;
      const gone = (idx * 7 + i * 3) % 16 < missing;
      ctx.fillStyle = gone ? "#5a5048" : (idx + i) % 3 === 0 ? "#bab4aa" : "#9a948a";
      const l = Math.max(x0, bx);
      const r = Math.min(x0 + SEGMENT_W, bx + 20);
      if (r - l <= 1) continue;
      ctx.fillRect(l + 1, y + 1, r - l - 2, 8);
    }
  }
  ctx.strokeRect(x0, top, SEGMENT_W, 40);
  if (battlements) {
    ctx.fillStyle = "#b4aea4";
    for (let k = 0; k < 3; k++) {
      ctx.fillRect(x0 + 3 + k * 20, top - 10, 13, 11);
      ctx.strokeRect(x0 + 3 + k * 20, top - 10, 13, 11);
    }
  }
}

export function drawBowItem(ctx: CanvasRenderingContext2D, x: number, y: number, s = 1): void {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3.5 * s;
  ctx.beginPath();
  ctx.arc(x - 3 * s, y, 7 * s, -1.2, 1.2);
  ctx.stroke();
  ctx.strokeStyle = "#a8743e";
  ctx.lineWidth = 2 * s;
  ctx.stroke();
  ctx.strokeStyle = "#f0e8d0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 3 * s + Math.cos(-1.2) * 7 * s, y + Math.sin(-1.2) * 7 * s);
  ctx.lineTo(x - 3 * s + Math.cos(1.2) * 7 * s, y + Math.sin(1.2) * 7 * s);
  ctx.stroke();
}

export function drawLogPile(ctx: CanvasRenderingContext2D, x: number, y: number, n: number, plate: boolean, box = plate): void {
  if (box) {
    // A timber pallet the logs are stacked on (instead of a dashed debug box).
    softShadow(ctx, x + 3, y + 15, 26, 6, 0.28);
    for (let k = 0; k < 4; k++) {
      const py = y + 2 + k * 4;
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.roundRect(x - 24, py - 1, 48, 4.5, 1); ctx.fill();
      ctx.fillStyle = k % 2 ? "#b8844a" : "#c99558";
      ctx.fillRect(x - 23, py, 46, 2.5);
      ctx.fillStyle = "rgba(255,236,190,0.45)";
      ctx.fillRect(x - 23, py, 46, 0.8);
    }
  }
  const count = Math.min(n, 15);
  let i = 0;
  // A 3D-rendered pile of the nearest size (1, 2, 3, 6, 10 or 15 logs).
  const img = decorAtlas();
  const tier = [15, 10, 6, 3, 2, 1].find((t) => t <= count);
  const e = tier ? DECOR_ATLAS[`pile${tier}1`] : undefined;
  if (img && e) {
    const [sx, sy, sw, sh, fx, fy] = e;
    const k = 0.5 * (plate ? 1.35 : 1.05);
    ctx.drawImage(img, sx, sy, sw, sh, x - fx * k, y + 12 - fy * k, sw * k, sh * k);
    return;
  }
  for (let row = 0; i < count; row++) {
    const perRow = Math.max(1, 5 - row);
    for (let k = 0; k < perRow && i < count; k++, i++) {
      const lx = x + (k - (perRow - 1) / 2) * 9;
      const ly = y + 8 - row * 7;
      ctx.fillStyle = "#9a6a3a";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.fillRect(lx - 4.5, ly - 3, 9, 6);
      ctx.fillStyle = "#e8c890";
      ctx.beginPath();
      ctx.ellipse(lx + 4.5, ly, 2, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeRect(lx - 4.5, ly - 3, 9, 6);
    }
  }
}

export function coinIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = "#ffd84a";
  ctx.strokeStyle = "#8a5a10";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f0b020";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
}

export function outlined(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color = "#ffffff"): void {
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0,0,0,0.8)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/**
 * Build / upgrade animation, applied around a building's base: it grows up out of the ground
 * (thin and tall first), overshoots, then settles with a little squash — instead of a flat pop.
 */
export function riseScale(since: number): [number, number] {
  const T = 0.55;
  if (since >= T || since < 0) return [1, 1];
  const t = since / T;
  // Height: ease-out-back from 0 → overshoot → 1.
  const c = 1.9;
  const u = t - 1;
  const h = 1 + (c + 1) * u * u * u + c * u * u;
  // Width: starts a touch narrow, bulges as it lands (volume-preserving feel), then settles.
  const w = 1 + (1 - h) * 0.6 + Math.sin(t * Math.PI) * 0.06;
  return [Math.max(0.2, w), Math.max(0.02, h)];
}
