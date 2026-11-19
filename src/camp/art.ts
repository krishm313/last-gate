/**
 * Chunky, outlined "toy soldier" art drawn with Canvas 2D. Every unit is built from a small spec so
 * new enemy types only need a palette + parts, not new drawing code.
 */

export const INK = "#2b1d14";

export type Headgear = "helmet" | "hood" | "bare" | "goblin" | "horned" | "plume" | "crown" | "cap";
export type Weapon = "sword" | "club" | "staff" | "bow" | "crossbow" | "dagger" | "bomb" | "axe" | "none";

export interface UnitLook {
  body: string;
  trim: string;
  skin: string;
  head: Headgear;
  helm?: string;
  weapon: Weapon;
  shield?: string;
  /** Overall size multiplier relative to the unit's radius. */
  bulk?: number;
}

export const LOOKS: Record<string, UnitLook> = {
  hero: { body: "#3d6aa8", trim: "#ffd84a", skin: "#f2c9a0", head: "crown", weapon: "bow" },
  hero_knight: { body: "#9aa4b8", trim: "#ffd84a", skin: "#f2c9a0", head: "plume", helm: "#c8ccd8", weapon: "bow", shield: "#3d6aa8" },
  hero_pyro: { body: "#c8401a", trim: "#ffb030", skin: "#f2c9a0", head: "hood", helm: "#8a2010", weapon: "bow" },
  hero_engineer: { body: "#8a6a3a", trim: "#ffd84a", skin: "#f2c9a0", head: "cap", helm: "#c89a40", weapon: "bow" },
  archer: { body: "#3d6aa8", trim: "#2a4a7a", skin: "#f2c9a0", head: "cap", helm: "#2a4a7a", weapon: "bow" },
  ally: { body: "#3d6aa8", trim: "#2a4a7a", skin: "#f2c9a0", head: "helmet", helm: "#c8ccd8", weapon: "sword", shield: "#e8c070" },
  worker: { body: "#8a6a4a", trim: "#5a4030", skin: "#f2c9a0", head: "cap", helm: "#c8a060", weapon: "axe" },
  footman: { body: "#c8443a", trim: "#7a2018", skin: "#f2c9a0", head: "helmet", helm: "#9aa0a8", weapon: "sword" },
  banner: { body: "#c8443a", trim: "#7a2018", skin: "#f2c9a0", head: "helmet", helm: "#c8a040", weapon: "sword" },
  runner: { body: "#e07a3a", trim: "#8a4018", skin: "#f2c9a0", head: "bare", weapon: "dagger" },
  shield: { body: "#c8443a", trim: "#7a2018", skin: "#f2c9a0", head: "helmet", helm: "#9aa0a8", weapon: "sword", shield: "#b8c0cc" },
  brute: { body: "#8a3a5a", trim: "#4a1a30", skin: "#d8a888", head: "horned", helm: "#6a5a4a", weapon: "club", bulk: 1.05 },
  crossbow: { body: "#5a6a3a", trim: "#3a4020", skin: "#f2c9a0", head: "hood", helm: "#4a5a2a", weapon: "crossbow" },
  mob: { body: "#5f8f3a", trim: "#3a5a20", skin: "#8cc04a", head: "goblin", weapon: "club", bulk: 1.1 },
  thief: { body: "#c89a2a", trim: "#7a5a10", skin: "#8cc04a", head: "goblin", weapon: "bomb", bulk: 1.05 },
  goblin: { body: "#6a9a3a", trim: "#3a5a20", skin: "#8cc04a", head: "goblin", weapon: "dagger" },
  shaman: { body: "#2a8a8a", trim: "#1a5050", skin: "#d8b890", head: "hood", helm: "#1a6a6a", weapon: "staff" },
  ram: { body: "#8a6a3a", trim: "#5a3a1a", skin: "#f2c9a0", head: "helmet", helm: "#7a6a5a", weapon: "none" },
  sapper: { body: "#3a3a3a", trim: "#1a1a1a", skin: "#f2c9a0", head: "cap", helm: "#5a3a2a", weapon: "bomb" },
  knight: { body: "#3a404a", trim: "#1a1e24", skin: "#c8ccd4", head: "plume", helm: "#5a6070", weapon: "sword", shield: "#2a2e36" },
  wraith: { body: "#8a9ac0", trim: "#5a6a90", skin: "#c8d4f0", head: "hood", helm: "#6a7aa0", weapon: "none" },
  ogre: { body: "#6a7a3a", trim: "#3a4a1a", skin: "#9ab06a", head: "bare", weapon: "club", bulk: 1 },
  troll: { body: "#4a7a5a", trim: "#2a4a3a", skin: "#7aa088", head: "bare", weapon: "club" },
  warlord: { body: "#7a1a1a", trim: "#ffd84a", skin: "#e8b890", head: "crown", helm: "#9aa0a8", weapon: "axe" },
  hag: { body: "#4a5a2a", trim: "#2a3a10", skin: "#a8c088", head: "hood", helm: "#3a4a1a", weapon: "staff" },
  golem: { body: "#7a7468", trim: "#4a463e", skin: "#9a9488", head: "bare", weapon: "none" },
  colossus: { body: "#4a4e58", trim: "#ffd84a", skin: "#6a707c", head: "crown", helm: "#8a90a0", weapon: "club" },
};

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

/**
 * Volume shading for the current path: one light source, top-left, for the whole game.
 * A soft highlight near the lit edge falling off to a shaded far side turns flat cartoon shapes
 * into rounded, solid-looking ones. Call after fill() and before stroke() (the path is reused).
 */
export function shadeVolume(ctx: CanvasRenderingContext2D, cx: number, cy: number, rad: number, strength = 1.35): void {
  const g = ctx.createRadialGradient(cx - rad * 0.45, cy - rad * 0.55, rad * 0.05, cx, cy, rad * 1.35);
  g.addColorStop(0, `rgba(255,255,255,${(0.42 * strength).toFixed(3)})`);
  g.addColorStop(0.38, "rgba(255,255,255,0)");
  g.addColorStop(0.72, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(20,10,40,${(0.34 * strength).toFixed(3)})`);
  ctx.fillStyle = g;
  ctx.fill();
}

/**
 * Soft contact shadow, cast down-right from the shared top-left light: dark under the feet,
 * feathering out — reads as an object standing on the ground rather than a flat sticker.
 */
export function softShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, alpha = 0.32): void {
  const ox = x + rx * 0.22;
  const oy = y + ry * 0.25;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, rx * 0.15, 0, 0, rx);
  g.addColorStop(0, `rgba(10,14,30,${alpha.toFixed(3)})`);
  g.addColorStop(0.6, `rgba(10,14,30,${(alpha * 0.55).toFixed(3)})`);
  g.addColorStop(1, "rgba(10,14,30,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Draw a unit centred on (x, y) (its feet are at y + r * 0.9).
 * `walk` is the walk-cycle phase, `facing` the aim angle, `flash` turns it white when hit.
 */
export function drawUnit(
  ctx: CanvasRenderingContext2D,
  look: UnitLook,
  x: number,
  y: number,
  r: number,
  walk: number,
  facing: number,
  flash: boolean,
  swing = 0,
): void {
  const s = r * (look.bulk ?? 1);
  const body = flash ? "#ffffff" : look.body;
  const skin = flash ? "#ffffff" : look.skin;
  const faceLeft = Math.cos(facing) < 0;
  const dir = faceLeft ? -1 : 1;
  ctx.lineWidth = Math.max(1.5, s * 0.14);
  ctx.strokeStyle = INK;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Legs.
  const step = Math.sin(walk) * s * 0.28;
  ctx.fillStyle = flash ? "#ffffff" : look.trim;
  for (const k of [-1, 1]) {
    const lx = x + k * s * 0.32, ly = y + s * 0.72 + (k === 1 ? step : -step) * 0.4;
    blob(ctx, lx, ly, s * 0.22, s * 0.26);
    ctx.fill();
    if (!flash) shadeVolume(ctx, lx, ly, s * 0.26);
    ctx.fillStyle = flash ? "#ffffff" : look.trim;
    ctx.stroke();
  }

  // Weapon behind the body when facing away from the weapon hand.
  const handX = x + dir * s * 0.78;
  const handY = y + s * 0.1;
  const weaponAngle = facing + swing;
  const drawWeapon = () => drawWeaponPart(ctx, look.weapon, handX, handY, s, weaponAngle, flash, dir);
  if (Math.sin(facing) < -0.3) drawWeapon();

  // Body.
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.7, y + s * 0.55);
  ctx.quadraticCurveTo(x - s * 0.8, y - s * 0.35, x, y - s * 0.4);
  ctx.quadraticCurveTo(x + s * 0.8, y - s * 0.35, x + s * 0.7, y + s * 0.55);
  ctx.closePath();
  ctx.fill();
  if (!flash) shadeVolume(ctx, x, y + s * 0.08, s * 0.85);
  ctx.stroke();
  // Belt / trim.
  ctx.fillStyle = flash ? "#ffffff" : look.trim;
  ctx.fillRect(x - s * 0.66, y + s * 0.18, s * 1.32, s * 0.16);
  ctx.strokeRect(x - s * 0.66, y + s * 0.18, s * 1.32, s * 0.16);
  // Arms.
  ctx.fillStyle = skin;
  blob(ctx, handX, handY, s * 0.2, s * 0.2);
  ctx.fill();
  if (!flash) shadeVolume(ctx, handX, handY, s * 0.2, 0.8);
  ctx.stroke();
  ctx.fillStyle = skin;
  blob(ctx, x - dir * s * 0.72, y + s * 0.15, s * 0.19, s * 0.19);
  ctx.fill();
  if (!flash) shadeVolume(ctx, x - dir * s * 0.72, y + s * 0.15, s * 0.19, 0.8);
  ctx.stroke();

  if (Math.sin(facing) >= -0.3) drawWeapon();

  // Shield on the off hand.
  if (look.shield) {
    ctx.fillStyle = flash ? "#ffffff" : look.shield;
    const sx = x - dir * s * 0.55;
    ctx.beginPath();
    ctx.moveTo(sx - s * 0.42, y - s * 0.2);
    ctx.lineTo(sx + s * 0.42, y - s * 0.2);
    ctx.lineTo(sx + s * 0.36, y + s * 0.4);
    ctx.lineTo(sx, y + s * 0.7);
    ctx.lineTo(sx - s * 0.36, y + s * 0.4);
    ctx.closePath();
    ctx.fill();
    if (!flash) shadeVolume(ctx, sx, y + s * 0.2, s * 0.55);
    ctx.stroke();
    ctx.fillStyle = flash ? "#ffffff" : look.trim;
    blob(ctx, sx, y + s * 0.12, s * 0.12, s * 0.12);
    ctx.fill();
  }

  // Head.
  const hy = y - s * 0.78;
  const hr = look.head === "goblin" ? s * 0.5 : s * 0.46;
  if (look.head === "goblin") {
    // Big pointy ears.
    ctx.fillStyle = skin;
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + k * hr * 0.6, hy - hr * 0.1);
      ctx.lineTo(x + k * hr * 1.7, hy - hr * 0.6);
      ctx.lineTo(x + k * hr * 0.7, hy + hr * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.fillStyle = skin;
  blob(ctx, x, hy, hr, hr);
  ctx.fill();
  if (!flash) shadeVolume(ctx, x, hy, hr);
  ctx.stroke();
  // Eyes (looking toward facing).
  if (look.head !== "hood" || look.skin !== "#c8d4f0") {
    ctx.fillStyle = INK;
    const ex = Math.cos(facing) * hr * 0.25;
    const ey = Math.max(-0.1, Math.sin(facing)) * hr * 0.2;
    if (Math.sin(facing) > -0.6) {
      blob(ctx, x - hr * 0.32 + ex, hy + hr * 0.05 + ey, hr * 0.11, hr * 0.14);
      ctx.fill();
      blob(ctx, x + hr * 0.32 + ex, hy + hr * 0.05 + ey, hr * 0.11, hr * 0.14);
      ctx.fill();
    }
  }
  drawHeadgear(ctx, look, x, hy, hr, flash);
}

function drawHeadgear(ctx: CanvasRenderingContext2D, look: UnitLook, x: number, hy: number, hr: number, flash: boolean): void {
  const helm = flash ? "#ffffff" : (look.helm ?? look.trim);
  ctx.fillStyle = helm;
  // Same top-left light as the body: headgear catches a highlight and falls into shade.
  const sh = (): void => {
    if (flash) return;
    shadeVolume(ctx, x, hy - hr * 0.1, hr * 1.1);
    ctx.fillStyle = helm;
  };
  switch (look.head) {
    case "helmet":
      ctx.beginPath();
      ctx.arc(x, hy, hr * 1.04, Math.PI, 0);
      ctx.lineTo(x + hr * 1.1, hy + hr * 0.1);
      ctx.lineTo(x - hr * 1.1, hy + hr * 0.1);
      ctx.closePath();
      ctx.fill();
      sh();
      ctx.stroke();
      ctx.fillRect(x - hr * 0.1, hy - hr * 0.2, hr * 0.2, hr * 0.6);
      break;
    case "plume":
      ctx.beginPath();
      ctx.arc(x, hy, hr * 1.05, Math.PI * 0.95, Math.PI * 0.05);
      ctx.closePath();
      ctx.fill();
      sh();
      ctx.stroke();
      ctx.fillStyle = flash ? "#ffffff" : "#c83030";
      ctx.beginPath();
      ctx.ellipse(x, hy - hr * 1.15, hr * 0.3, hr * 0.6, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case "hood":
      ctx.beginPath();
      ctx.moveTo(x - hr * 1.15, hy + hr * 0.7);
      ctx.quadraticCurveTo(x - hr * 1.2, hy - hr * 1.3, x, hy - hr * 1.35);
      ctx.quadraticCurveTo(x + hr * 1.2, hy - hr * 1.3, x + hr * 1.15, hy + hr * 0.7);
      ctx.quadraticCurveTo(x, hy - hr * 0.2, x - hr * 1.15, hy + hr * 0.7);
      ctx.fill();
      sh();
      ctx.stroke();
      break;
    case "horned":
      ctx.beginPath();
      ctx.arc(x, hy, hr * 1.02, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      sh();
      ctx.stroke();
      ctx.fillStyle = flash ? "#ffffff" : "#f0e8d0";
      for (const k of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x + k * hr * 0.8, hy - hr * 0.4);
        ctx.quadraticCurveTo(x + k * hr * 1.7, hy - hr * 0.6, x + k * hr * 1.4, hy - hr * 1.5);
        ctx.quadraticCurveTo(x + k * hr * 1.2, hy - hr * 0.8, x + k * hr * 0.5, hy - hr * 0.8);
        ctx.fill();
        ctx.stroke();
      }
      break;
    case "crown":
      ctx.fillStyle = flash ? "#ffffff" : "#ffd84a";
      ctx.beginPath();
      ctx.moveTo(x - hr * 0.8, hy - hr * 0.5);
      ctx.lineTo(x - hr * 0.8, hy - hr * 1.3);
      ctx.lineTo(x - hr * 0.4, hy - hr * 0.9);
      ctx.lineTo(x, hy - hr * 1.45);
      ctx.lineTo(x + hr * 0.4, hy - hr * 0.9);
      ctx.lineTo(x + hr * 0.8, hy - hr * 1.3);
      ctx.lineTo(x + hr * 0.8, hy - hr * 0.5);
      ctx.closePath();
      ctx.fill();
      sh();
      ctx.stroke();
      break;
    case "cap":
      ctx.beginPath();
      ctx.arc(x, hy - hr * 0.1, hr, Math.PI * 1.05, Math.PI * 1.95);
      ctx.closePath();
      ctx.fill();
      sh();
      ctx.stroke();
      break;
    default:
      break;
  }
}

function drawWeaponPart(ctx: CanvasRenderingContext2D, w: Weapon, hx: number, hy: number, s: number, a: number, flash: boolean, dir: number): void {
  const metal = flash ? "#ffffff" : "#d8dce4";
  const wood = flash ? "#ffffff" : "#7a5230";
  ctx.save();
  ctx.translate(hx, hy);
  switch (w) {
    case "sword":
    case "dagger": {
      const len = s * (w === "sword" ? 1.3 : 0.8);
      ctx.rotate(a);
      ctx.fillStyle = metal;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.09);
      ctx.lineTo(len, -s * 0.07);
      ctx.lineTo(len + s * 0.2, 0);
      ctx.lineTo(len, s * 0.07);
      ctx.lineTo(0, s * 0.09);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = flash ? "#ffffff" : "#a87a2a";
      ctx.fillRect(-s * 0.05, -s * 0.22, s * 0.12, s * 0.44);
      ctx.strokeRect(-s * 0.05, -s * 0.22, s * 0.12, s * 0.44);
      break;
    }
    case "axe":
      ctx.rotate(a);
      ctx.strokeStyle = wood;
      ctx.lineWidth = s * 0.16;
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, 0);
      ctx.lineTo(s * 1.1, 0);
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1.5, s * 0.14);
      ctx.fillStyle = metal;
      ctx.beginPath();
      ctx.moveTo(s * 0.8, 0);
      ctx.quadraticCurveTo(s * 1.0, -s * 0.6, s * 1.25, -s * 0.5);
      ctx.lineTo(s * 1.25, s * 0.5);
      ctx.quadraticCurveTo(s * 1.0, s * 0.6, s * 0.8, 0);
      ctx.fill();
      ctx.stroke();
      break;
    case "club":
      ctx.rotate(a);
      ctx.fillStyle = wood;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.1);
      ctx.lineTo(s * 1.1, -s * 0.28);
      ctx.quadraticCurveTo(s * 1.45, 0, s * 1.1, s * 0.28);
      ctx.lineTo(0, s * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case "staff":
      ctx.strokeStyle = wood;
      ctx.lineWidth = s * 0.16;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.6);
      ctx.lineTo(0, -s * 1.4);
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1.5, s * 0.14);
      ctx.fillStyle = flash ? "#ffffff" : "#8fffd0";
      blob(ctx, 0, -s * 1.5, s * 0.28, s * 0.28);
      ctx.fill();
      ctx.stroke();
      break;
    case "bow":
      ctx.rotate(a);
      ctx.strokeStyle = wood;
      ctx.lineWidth = s * 0.18;
      ctx.beginPath();
      ctx.arc(-s * 0.1, 0, s * 0.85, -1.25, 1.25);
      ctx.stroke();
      ctx.strokeStyle = "#f0e8d0";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-s * 0.1 + Math.cos(-1.25) * s * 0.85, Math.sin(-1.25) * s * 0.85);
      ctx.lineTo(-s * 0.1 + Math.cos(1.25) * s * 0.85, Math.sin(1.25) * s * 0.85);
      ctx.stroke();
      ctx.strokeStyle = INK;
      break;
    case "crossbow":
      ctx.rotate(a);
      ctx.fillStyle = wood;
      ctx.fillRect(-s * 0.2, -s * 0.1, s * 1.1, s * 0.2);
      ctx.strokeRect(-s * 0.2, -s * 0.1, s * 1.1, s * 0.2);
      ctx.strokeStyle = wood;
      ctx.lineWidth = s * 0.14;
      ctx.beginPath();
      ctx.arc(s * 0.75, 0, s * 0.5, -1.4, 1.4);
      ctx.stroke();
      ctx.strokeStyle = INK;
      break;
    case "bomb":
      ctx.fillStyle = flash ? "#ffffff" : "#2a2a2a";
      blob(ctx, dir * s * 0.1, -s * 0.2, s * 0.45, s * 0.45);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#c8a060";
      ctx.beginPath();
      ctx.moveTo(dir * s * 0.3, -s * 0.6);
      ctx.lineTo(dir * s * 0.5, -s * 0.85);
      ctx.stroke();
      ctx.fillStyle = "#ffcc33";
      blob(ctx, dir * s * 0.55, -s * 0.9, s * 0.15, s * 0.15);
      ctx.fill();
      break;
    default:
      break;
  }
  ctx.restore();
}

/** Bats get their own flapping silhouette. */
export function drawBat(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, flash: boolean): void {
  const flap = Math.sin(t * 22) * 0.6;
  ctx.fillStyle = flash ? "#ffffff" : "#4a2a5a";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  for (const k of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + k * r * 1.4, y - r * (1.2 + flap), x + k * r * 2.2, y - r * 0.2 * flap);
    ctx.quadraticCurveTo(x + k * r * 1.5, y + r * 0.2, x + k * r * 1.2, y + r * 0.6);
    ctx.quadraticCurveTo(x + k * r * 0.8, y + r * 0.2, x, y + r * 0.4);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = flash ? "#ffffff" : "#3a2048";
  blob(ctx, x, y, r * 0.6, r * 0.7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffdd44";
  blob(ctx, x - r * 0.22, y - r * 0.1, r * 0.12, r * 0.12);
  ctx.fill();
  blob(ctx, x + r * 0.22, y - r * 0.1, r * 0.12, r * 0.12);
  ctx.fill();
}

/** Battering ram: a log on wheels pushed by two soldiers. */
export function drawRam(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, flash: boolean): void {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  for (const k of [-1, 1]) drawUnit(ctx, LOOKS.ram!, x + k * r * 0.75, y + r * 0.35, r * 0.42, t * 9 + k, Math.PI / 2, flash);
  ctx.fillStyle = flash ? "#ffffff" : "#7a5230";
  ctx.beginPath();
  ctx.roundRect(x - r * 0.38, y - r * 1.15, r * 0.76, r * 1.9, r * 0.3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = flash ? "#ffffff" : "#9aa0a8";
  ctx.beginPath();
  ctx.roundRect(x - r * 0.45, y + r * 0.55, r * 0.9, r * 0.32, r * 0.1);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "#5a3a1e";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(x - r * 0.3, y - r * 0.8 + i * r * 0.45);
    ctx.lineTo(x + r * 0.3, y - r * 0.8 + i * r * 0.45);
    ctx.stroke();
  }
}

/** Pine tree sprite pre-rendered once per variant. */
export function makeTreeSprite(scale: number, shade: number, dpr: number): HTMLCanvasElement {
  const w = Math.ceil(70 * scale);
  const h = Math.ceil(100 * scale);
  const cv = document.createElement("canvas");
  cv.width = w * dpr;
  cv.height = h * dpr;
  const ctx = cv.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const cx = w / 2;
  const base = h - 10 * scale;
  const s = 26 * scale;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  blob(ctx, cx + 5 * scale, base + 2 * scale, s * 0.95, s * 0.35);
  ctx.fill();
  ctx.fillStyle = "#6a4a2a";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.fillRect(cx - 4 * scale, base - 12 * scale, 8 * scale, 14 * scale);
  ctx.strokeRect(cx - 4 * scale, base - 12 * scale, 8 * scale, 14 * scale);
  const greens = shade > 0.5 ? ["#2d6a3a", "#3a8048", "#4c9858", "#5cae66"] : ["#285e34", "#347442", "#428a50", "#52a05e"];
  for (let i = 0; i < 3; i++) {
    const tw = s * (1 - i * 0.24);
    const y = base - 8 * scale - i * s * 0.62;
    ctx.fillStyle = greens[i]!;
    ctx.beginPath();
    ctx.moveTo(cx - tw, y);
    ctx.quadraticCurveTo(cx, y + tw * 0.25, cx + tw, y);
    ctx.lineTo(cx, y - s * 1.15);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();
    // Highlight on the lit side.
    ctx.fillStyle = greens[i + 1]!;
    ctx.beginPath();
    ctx.moveTo(cx, y - s * 1.1);
    ctx.lineTo(cx - tw * 0.55, y - 2);
    ctx.lineTo(cx - tw * 0.15, y - 2);
    ctx.closePath();
    ctx.fill();
  }
  return cv;
}

export type IconKind = "tower" | "hammer" | "coin" | "warn" | "crown" | "sword" | "wall";

/** Small vector icons (emoji fonts aren't reliable across devices). Centred on (x, y), size ≈ 2r. */
export function drawIcon(ctx: CanvasRenderingContext2D, kind: IconKind, x: number, y: number, r: number, color = "#ffffff"): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1.2, r * 0.16);
  ctx.lineJoin = "round";
  ctx.fillStyle = color;
  switch (kind) {
    case "tower":
      ctx.beginPath();
      ctx.moveTo(-r * 0.55, r);
      ctx.lineTo(-r * 0.45, -r * 0.3);
      ctx.lineTo(r * 0.45, -r * 0.3);
      ctx.lineTo(r * 0.55, r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(-r * 0.7, -r * 0.75, r * 1.4, r * 0.5);
      ctx.fill();
      ctx.stroke();
      for (const dx of [-0.5, 0, 0.5]) ctx.fillRect(dx * r - r * 0.12, -r * 1.0, r * 0.24, r * 0.28);
      break;
    case "hammer":
      ctx.rotate(-0.6);
      ctx.fillStyle = "#c8a070";
      ctx.fillRect(-r * 0.12, -r * 0.2, r * 0.24, r * 1.2);
      ctx.strokeRect(-r * 0.12, -r * 0.2, r * 0.24, r * 1.2);
      ctx.fillStyle = color;
      ctx.fillRect(-r * 0.6, -r * 0.7, r * 1.2, r * 0.5);
      ctx.strokeRect(-r * 0.6, -r * 0.7, r * 1.2, r * 0.5);
      break;
    case "coin":
      ctx.fillStyle = "#ffd84a";
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f0b020";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "warn":
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r, r * 0.8);
      ctx.lineTo(-r, r * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.fillRect(-r * 0.1, -r * 0.4, r * 0.2, r * 0.7);
      ctx.fillRect(-r * 0.1, r * 0.4, r * 0.2, r * 0.2);
      break;
    case "crown":
      ctx.fillStyle = "#ffd84a";
      ctx.beginPath();
      ctx.moveTo(-r, r * 0.6);
      ctx.lineTo(-r, -r * 0.5);
      ctx.lineTo(-r * 0.5, 0);
      ctx.lineTo(0, -r * 0.8);
      ctx.lineTo(r * 0.5, 0);
      ctx.lineTo(r, -r * 0.5);
      ctx.lineTo(r, r * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case "wall":
      ctx.fillStyle = "#b4aea4";
      ctx.fillRect(-r, -r * 0.5, r * 2, r * 1.3);
      ctx.strokeRect(-r, -r * 0.5, r * 2, r * 1.3);
      for (const dx of [-1, -0.2, 0.6]) {
        ctx.fillRect(dx * r, -r, r * 0.4, r * 0.5);
        ctx.strokeRect(dx * r, -r, r * 0.4, r * 0.5);
      }
      ctx.beginPath();
      ctx.moveTo(-r, r * 0.15);
      ctx.lineTo(r, r * 0.15);
      ctx.moveTo(0, -r * 0.5);
      ctx.lineTo(0, r * 0.15);
      ctx.stroke();
      break;
    case "sword":
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = "#e0e4ec";
      ctx.beginPath();
      ctx.moveTo(-r * 0.12, r * 0.4);
      ctx.lineTo(-r * 0.12, -r);
      ctx.lineTo(0, -r * 1.2);
      ctx.lineTo(r * 0.12, -r);
      ctx.lineTo(r * 0.12, r * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#a87a2a";
      ctx.fillRect(-r * 0.45, r * 0.4, r * 0.9, r * 0.18);
      ctx.fillRect(-r * 0.1, r * 0.55, r * 0.2, r * 0.45);
      break;
  }
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------
// Sprite cache: enemies always face the camp, so their look only varies by walk frame, hit flash
// and attack swing. Pre-rendering those frames turns ~40 path ops per unit into one drawImage.

const spriteCache = new Map<string, HTMLCanvasElement>();
const SPRITE_DPR = 2;
export const WALK_FRAMES = 8;

export function unitSprite(lookId: string, r: number, frame: number, flash: boolean, swingBucket: number, facing: number): HTMLCanvasElement {
  const key = `${lookId}|${r.toFixed(1)}|${frame}|${flash ? 1 : 0}|${swingBucket}|${facing.toFixed(2)}`;
  let cv = spriteCache.get(key);
  if (cv) return cv;
  const look = LOOKS[lookId] ?? LOOKS.footman!;
  const size = Math.ceil(r * 5.2);
  cv = document.createElement("canvas");
  cv.width = size * SPRITE_DPR;
  cv.height = size * SPRITE_DPR;
  const ctx = cv.getContext("2d");
  // No 2D context (blocked canvas / test DOM): return the blank canvas rather than throwing.
  if (!ctx) return cv;
  ctx.scale(SPRITE_DPR, SPRITE_DPR);
  drawUnit(ctx, look, size / 2, size * 0.58, r, (frame / WALK_FRAMES) * Math.PI * 2, facing, flash, -swingBucket * 0.45);
  spriteCache.set(key, cv);
  return cv;
}

const portraitCache = new Map<string, string>();

/** Square portrait (data URL) of a unit look, cropped to the figure, for menus. */
export function unitPortrait(lookId: string, size = 96): string {
  const key = `${lookId}|${size}`;
  let url = portraitCache.get(key);
  if (url) return url;
  // No 2D canvas (very old browsers, test DOMs): menus just show no portrait.
  if (!document.createElement("canvas").getContext("2d")) return "";
  const src = unitSprite(lookId, 14, 0, false, 0, Math.PI / 2 - 0.3);
  const w = src.width;
  const box = w * 0.56;
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  cv.getContext("2d")!.drawImage(src, (w - box) / 2, w * 0.58 - box * 0.62, box, box, 0, 0, size, size);
  url = cv.toDataURL();
  portraitCache.set(key, url);
  return url;
}

/** Draw a cached unit centred where drawUnit would have put it. */
export function drawUnitCached(ctx: CanvasRenderingContext2D, lookId: string, x: number, y: number, r: number, walk: number, facing: number, flash: boolean, swing: number): void {
  const frame = Math.floor((((walk / (Math.PI * 2)) % 1) + 1) % 1 * WALK_FRAMES);
  const bucket = Math.max(0, Math.min(3, Math.round(-swing / 0.45)));
  const cv = unitSprite(lookId, Math.round(r * 2) / 2, frame, flash, bucket, facing);
  const size = cv.width / SPRITE_DPR;
  ctx.drawImage(cv, x - size / 2, y - size * 0.58, size, size);
}
