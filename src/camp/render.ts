import { Fx } from "../render/fx";
import { BAT_ATLAS, DECOR_ATLAS, DRAGON_ATLAS, PROP_ATLAS, WALL_ATLAS } from "./propAtlas";
import { animFrame, drawAnim, viewFor, type SpriteName, drawSprite, ENEMY_ANIMS, ENEMY_SPRITES, preloadAnims, preloadSprites, type AnimName } from "./sprites";
import { FONT } from "../ui/font";
import { createRng, next } from "../core/rng";
import { drawBossCard, drawDanger, drawMood } from "./overlays";
import { drawBat, drawIcon, drawRam, drawUnit, drawUnitCached, INK, LOOKS, makeTreeSprite, softShadow, type IconKind } from "./art";
import { HEALER_LEVELS, RALLY, SPIKES, type Weather } from "./sim";
import { buildingSprite, coinIcon, drawBarracks, drawBowItem, drawCatapult, drawForge, drawForgeZones, drawHall, drawLogPile, drawLumberCamp, drawTower, outlined, stoneSegment } from "./buildings";
import {
  BOWS_PER_TOWER, CAMP, FORGE_IN, FORGE_OUT, GROVE, LUMBER_PILE, plotCost, plotLogCost, plotMaxed, reduction, repairNeeded, TOWER_LEVELS,
  type Ally, type Camp, type CampEvent, type Enemy, type Plot, type Vec, type Worker,
} from "./sim";
import { FOREST_Y, GATE_SEGMENTS, HALL, HERO_SPAWN, INCOME_PILE, MAP_H, MAP_W, SEGMENT_W, SEGMENTS, VIEW_H, VIEW_W, WALL_THICK, WALL_Y } from "./world";

interface Tree { x: number; y: number; s: number; shade: number; v: string }
interface Flyer { from: Vec; to: Vec; t: number; log?: boolean; bow?: boolean; speed?: number; follow?: boolean }

const OUTLINE = INK;
const TERRAIN_X = -80;
const TERRAIN_Y = -240;
const TERRAIN_W = MAP_W + 160;
const TERRAIN_H = MAP_H + 320;
const TERRAIN_SCALE = 2.5;
const TREE_SIZES = [0.7, 0.85, 1, 1.15, 1.3];

/** Top-down camp renderer with a camera that follows the hero. */
/** Seconds between kills that keep a streak alive. */
const COMBO_WINDOW = 1.6;
const COMBO_CALLS: Record<number, string> = { 10: "RAMPAGE!", 20: "UNSTOPPABLE!", 35: "LEGENDARY!", 50: "GODLIKE!" };

/** Fallen logs along the forest edges: x, y, scale, mirrored (right side faces inward). */
const FALLEN_LOGS: [number, number, number, boolean][] = [
  [28, 640, 1.3, false], [24, 1240, 1.4, false], [692, 690, 1.3, true], [688, 980, 1.2, true], [696, 1230, 1.4, true],
];

type PlazaProp = { n: string; x: number; y: number; s: number; flip?: boolean };
/** Props that make the castle plaza feel inhabited: banners flanking the hall, lanterns at the
 *  road's mouth, stores of barrels and sacks. Kept clear of plots, the coin pile and hero spawn. */
const PLAZA_PROPS: PlazaProp[] = [
  { n: "banner1", x: 280, y: 1098, s: 2.0, flip: true },
  { n: "banner1", x: 440, y: 1098, s: 2.0 },
  { n: "lantern1", x: 314, y: 980, s: 1.9, flip: true },
  { n: "lantern1", x: 406, y: 980, s: 1.9 },
  { n: "barrels1", x: 450, y: 1138, s: 1.55 },
  { n: "sacks1", x: 294, y: 1142, s: 1.55 },
  { n: "crates1", x: 522, y: 1112, s: 1.3 },
];

/** Openings of the 3D-rendered buildings that glow at night: polygon in world units relative to
 *  (plot.x, plot.y + base), i.e. the sprite's foot; spill is where the light lands on the ground. */
const WINDOW_GLOW: Partial<Record<string, { base: number; spill: number; pts: [number, number][] }>> = {
  lumber: { base: 20, spill: 20, pts: [[-13, -3.6], [-2.5, -1.6], [-2.5, 14.9], [-13, 13.2]] },
  barracks: { base: 18, spill: 16, pts: [[23.5, -7], [26, 7.7], [14, 14]] },
  forge: { base: 22, spill: 20, pts: [[-8.5, 0], [5.5, 0], [5.5, 14], [-8.5, 14]] },
};

export class CampRenderer {
  private ctx: CanvasRenderingContext2D;
  readonly fx = new Fx();
  private base: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
  time = 0;
  private cam: Vec = { x: MAP_W / 2, y: 900 };
  private trees: Tree[] = [];
  private flyers: Flyer[] = [];
  /** Where courier coins fly to (the King, updated each frame). */
  private courierTo: Vec = { x: 0, y: 0 };
  private ground: [string, string] = ["#5f9a48", "#6aa851"];
  private terrain: HTMLCanvasElement | null = null;
  private treeSprites = new Map<string, HTMLCanvasElement>();
  private treeDpr = 1;
  /** Real time each plot was last built/upgraded (for the pop animation). */
  builtAt = new Map<string, number>();
  /** Joystick to draw (screen-space world units), set by the input layer. */
  joystick: { origin: Vec; knob: Vec } | null = null;
  /** Attract mode behind the menus: draw the world only — no guide/threat arrows or streak badge pointing at things the player can't act on. */
  ambient = false;
  /** When the hero last loosed an arrow (drives the recoil animation). */
  private heroShotAt = -9;
  /** Enemies that just died: drawn toppling over and fading for a moment instead of vanishing. */
  private corpses: { x: number; y: number; id: string; r: number; t: number; dir: number; landed?: boolean; motes?: boolean }[] = [];
  /** Ground stains left where bodies dissolved (fade slowly). */
  private stains: { x: number; y: number; r: number; t: number }[] = [];
  private corpseFlip = 1;
  /** Per-enemy render memory: last x + facing (from real movement) and when it began attacking. */
  private enemyMove = new Map<number, { x: number; flip: boolean; atkFrom: number; step?: number; hitAt?: number; lastFlash?: number }>();
  private lastCamp: Camp | null = null;
  private heroBehind = false;
  /** The tutorial can point the guide arrow at a specific spot (e.g. the hall's coin pile). */
  guideOverride: Vec | null = null;
  private guideKey = "";
  private guideAt = 0;

  constructor(private canvas: HTMLCanvasElement) {
    preloadSprites();
    preloadAnims();
    this.ctx = canvas.getContext("2d")!;
    // Deterministic forest so it doesn't reshuffle between runs.
    const rng = createRng(777);
    for (let i = 0; i < 140; i++) {
      const x = next(rng) * (MAP_W + 80) - 40;
      const y = next(rng) * (FOREST_Y + 40) - 140;
      this.trees.push({ x, y, s: 0.8 + next(rng) * 0.6, shade: next(rng), v: next(rng) < 0.72 ? `pine${1 + (i % 4)}` : `round${1 + (i % 3)}` });
    }
    // Trees down the sides of the clearing and around the camp edges.
    for (let i = 0; i < 70; i++) {
      const left = i % 2 === 0;
      const x = left ? next(rng) * 36 - 22 : MAP_W - next(rng) * 36 + 22;
      const y = FOREST_Y + next(rng) * (MAP_H - FOREST_Y);
      this.trees.push({ x, y, s: 0.7 + next(rng) * 0.5, shade: next(rng), v: next(rng) < 0.5 ? `pine${1 + (i % 4)}` : `round${1 + (i % 3)}` });
    }
    this.trees.sort((a, b) => a.y - b.y);
    // Pre-render each tree size so drawing is a 1:1 blit (scaling sprites every frame is slow on phones).
    for (const t of this.trees) t.s = TREE_SIZES.reduce((a, b) => (Math.abs(b - t.s) < Math.abs(a - t.s) ? b : a));
  }

  setGround(g: [string, string], chapterId = 1): void {
    this.ground = g;
    this.terrain = null;
    this.mood = chapterId;
    this.resetStreak();
    // New run / back to the menu: drop any boss-entrance pan + card still playing from the last run.
    this.focus = null;
    this.corpses = [];
    this.pendingUnlocks = [];
  }

  /** Chapter lighting: 1 day, 2 marsh mist, 3 dusty, 4 night, 5 blood-red dusk. */
  private mood = 1;

  private countKill(x: number, y: number): void {
    this.combo = this.time - this.comboAt < COMBO_WINDOW ? this.combo + 1 : 1;
    this.comboAt = this.time;
    const label = COMBO_CALLS[this.combo];
    if (label) {
      this.streakCall = Object.keys(COMBO_CALLS).indexOf(String(this.combo)) + 1;
      // Each tier lands harder: a bigger call-out, a double shockwave, a fountain of sparks and a
      // thump of screen shake.
      const tier = this.streakCall;
      const col = tier >= 3 ? "#ff5a3a" : tier === 2 ? "#ff7a2a" : "#ff9a3a";
      this.fx.number(x, y - 34, label, col, 22 + tier * 4, 1.3);
      this.fx.rings.push({ x, y, r: 46 + tier * 14, color: col, life: 0.35, max: 0.35, width: 5 });
      this.fx.rings.push({ x, y, r: 80 + tier * 24, color: "#fff2c0", life: 0.55, max: 0.55, width: 3 });
      this.fx.burst(x, y - 10, "#ffd060", 14 + tier * 6, 200 + tier * 40, { max: 0.7, size: 2.4, gravity: 180, shape: "spark" });
      if (this.fx.trauma < 0.4) this.fx.shake(0.18 + tier * 0.06);
    }
    if (this.combo > this.comboBest) this.comboBest = this.combo;
  }

  /** Streak badge under the HUD; pulses on every kill and drains as the window runs out. */
  private drawCombo(ctx: CanvasRenderingContext2D, c: Camp): void {
    const since = this.time - this.comboAt;
    if (this.combo < 3 || since > COMBO_WINDOW) return;
    const left = 1 - since / COMBO_WINDOW;
    // Each kill: an elastic pop (overshoot, ring out) with a small alternating tilt.
    const pu = Math.min(1, since / 0.4);
    const pop = 1 + Math.sin(pu * Math.PI * 3) * (1 - pu) ** 2 * 0.35;
    const tilt = (this.combo % 2 ? 1 : -1) * 0.12 * (1 - pu) ** 2;
    // First appearance slides in from the right; fading out it drifts up.
    if (this.combo === 3 && this.streakShownAt < this.comboAt - 0.01) this.streakShownAt = this.comboAt;
    const inU = Math.min(1, (this.time - this.streakShownAt) / 0.3);
    const enterX = (1 - inU) ** 3 * 70;
    const x = VIEW_W - 58 + enterX;
    // Sit below the boss HP bar while one is showing.
    const y = (c.enemies.some((e) => e.def.boss) ? 168 : 132) - (left < 0.25 ? (0.25 - left) * 60 : 0);
    const hot = this.combo >= 20 ? "#ff5a3a" : this.combo >= 10 ? "#ff9a3a" : "#ffd84a";
    ctx.save();
    ctx.translate(x, y);
    // Heat halo that grows with the streak.
    const heat = Math.min(1, (this.combo - 2) / 18);
    ctx.globalAlpha = Math.min(1, left * 4) * (0.25 + heat * 0.45);
    ctx.globalCompositeOperation = "lighter";
    const hg = ctx.createRadialGradient(0, 4, 2, 0, 4, 34 + heat * 14);
    hg.addColorStop(0, hot);
    hg.addColorStop(1, "rgba(255,120,40,0)");
    ctx.fillStyle = hg;
    ctx.fillRect(-60, -50, 120, 110);
    ctx.globalCompositeOperation = "source-over";
    // Big streaks smoulder: a constant fiery wobble.
    const wob = this.combo >= 10 ? Math.sin(this.time * 23) * 0.04 * heat : 0;
    ctx.rotate(tilt + wob);
    ctx.scale(pop, pop);
    ctx.globalAlpha = Math.min(1, left * 4);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    outlined(ctx, `x${this.combo}`, 0, 0, 24, hot);
    outlined(ctx, "STREAK", 0, 18, 10, "#ffffff");
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(-26, 27, 52, 5);
    ctx.fillStyle = hot;
    ctx.fillRect(-26, 27, 52 * left, 5);
    ctx.restore();
  }

  private pendingUnlocks: Vec[] = [];
  /** A newly unlocked plot announces itself: double green ring, a burst and a "NEW!" label. */
  private revealUnlock(x: number, y: number): void {
    this.fx.rings.push({ x, y, r: 60, color: "#8ef06a", life: 0.8, max: 0.8, width: 5 });
    this.fx.rings.push({ x, y, r: 95, color: "#d8ffb8", life: 1.1, max: 1.1, width: 3 });
    this.fx.burst(x, y, "#8ef06a", 24, 170, { max: 0.9, size: 3, gravity: -40, shape: "spark" });
    this.fx.number(x, y + 50, "NEW!", "#8ef06a", 18, 1.6); // below the plot: the "New building!" banner sits above
  }
  /** Play unlock reveals held back during the blessing pick (called once the camp is visible again). */
  flushUnlocks(): void {
    for (const u of this.pendingUnlocks) this.revealUnlock(u.x, u.y);
    this.pendingUnlocks = [];
  }

  /** The healer's heal radius on the ground (drawn under everything that stands), breathing gently. */
  private drawHealerAura(ctx: CanvasRenderingContext2D, p: Plot): void {
    const r = HEALER_LEVELS[p.level - 1]!.radius;
    const br = 0.5 + 0.5 * Math.sin(this.time * 1.6);
    ctx.save();
    ctx.strokeStyle = `rgba(210,255,190,${(0.38 + br * 0.2).toFixed(3)})`;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -this.time * 8;
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 10, r, r * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  /** Fog weather: soft pale banks drifting across the view, thicker away from the King's light. */
  private drawFog(ctx: CanvasRenderingContext2D, o: Vec): void {
    const t = this.time;
    const blob = this.blob("fogbank", [[0, "rgba(210,220,230,0.55)"], [0.6, "rgba(200,210,220,0.25)"], [1, "rgba(200,210,220,0)"]]);
    ctx.save();
    for (let i = 0; i < 9; i++) {
      const x = ((i * 157 + t * (14 + (i % 3) * 6) - o.x * 0.6) % (VIEW_W + 300)) - 150;
      const y = ((i * 211) % (VIEW_H + 200)) - 100 + Math.sin(t * 0.3 + i) * 20;
      this.drawBlob(ctx, blob, x, y, 190, 90, 0.55 + 0.15 * Math.sin(t * 0.5 + i * 1.7));
    }
    ctx.fillStyle = "rgba(190,200,215,0.12)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
  }

  /** Banner-bearer: a tall pole with a red war banner over his shoulder, and his rally ring on the ground. */
  private drawBanner(ctx: CanvasRenderingContext2D, c: Camp, e: Enemy, x: number, y: number, r: number): void {
    const pulse = 0.5 + 0.5 * Math.sin(c.time * 3 + e.id);
    ctx.save();
    ctx.strokeStyle = `rgba(255,90,60,${(0.25 + pulse * 0.2).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -c.time * 14;
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.6, RALLY.radius, RALLY.radius * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    // Pole and flag (flutters; leans with the march).
    const px = x + r * 0.7, top = y - r * 3.6;
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(px, y + r * 0.4); ctx.lineTo(px, top); ctx.stroke();
    ctx.strokeStyle = "#a8743e"; ctx.lineWidth = 1.4; ctx.stroke();
    const fl = Math.sin(c.time * 6 + e.id) * 2.5;
    ctx.fillStyle = "#c8302a"; ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(px, top); ctx.lineTo(px + 16, top + 2 + fl); ctx.lineTo(px + 12, top + 9 + fl * 0.7); ctx.lineTo(px + 16, top + 16 + fl); ctx.lineTo(px, top + 15);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ffd84a";
    ctx.beginPath(); ctx.arc(px + 7, top + 8 + fl * 0.5, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /** Healer's tent: a striped canvas tent with a red-cross banner, and a soft green aura on the ground. */
  private drawHealerTent(ctx: CanvasRenderingContext2D, p: Plot): void {
    const { x, y } = p;
    const since = this.time - (this.builtAt.get(p.id) ?? -9);
    const s = (since < 0.5 ? 1 - (1 - since / 0.5) ** 3 : 1) * (0.9 + p.level * 0.07);
    softShadow(ctx, x + 6, y + 18, 34 * s, 9 * s, 0.3);
    ctx.save();
    ctx.translate(x, y + 16);
    ctx.scale(s, s);
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    // Canvas: two slopes with red stripes, a dark open door flap.
    const W = 34, H = 40;
    const cloth = (side: number) => {
      ctx.beginPath();
      ctx.moveTo(0, -H); ctx.lineTo(side * W, 0); ctx.lineTo(0, 0); ctx.closePath();
    };
    cloth(-1); ctx.fillStyle = "#f4f0e6"; ctx.fill(); ctx.stroke();
    cloth(1); ctx.fillStyle = "#d8d2c4"; ctx.fill(); ctx.stroke();
    ctx.save();
    cloth(-1); ctx.clip();
    ctx.fillStyle = "#d84a3a";
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(-W + k * 12, 0); ctx.lineTo(-W + k * 12 + 5, 0); ctx.lineTo(0, -H); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = "#3a2a20";
    ctx.beginPath(); ctx.moveTo(0, -H * 0.55); ctx.lineTo(9, 0); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    // Pole and banner with a cross, fluttering.
    ctx.strokeStyle = INK; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(0, -H); ctx.lineTo(0, -H - 18); ctx.stroke();
    const fl = Math.sin(this.time * 4 + x) * 2;
    ctx.fillStyle = "#f4f0e6"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(0, -H - 18); ctx.lineTo(16, -H - 15 + fl); ctx.lineTo(16, -H - 5 + fl); ctx.lineTo(0, -H - 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#d84a3a";
    ctx.fillRect(6.5, -H - 15 + fl * 0.6, 3, 8);
    ctx.fillRect(4, -H - 12.5 + fl * 0.6, 8, 3);
    ctx.restore();
  }

  /** Mage tower: a stone spire with a floating arcane crystal that flares when it casts. */
  private drawMageTower(ctx: CanvasRenderingContext2D, p: Plot): void {
    const { x, y } = p;
    const since = this.time - (this.builtAt.get(p.id) ?? -9);
    const rise = since < 0.5 ? 1 - (1 - since / 0.5) ** 3 : 1;
    const H = (52 + p.level * 8) * rise;
    softShadow(ctx, x + 6, y + 16, 26, 8, 0.32);
    ctx.save();
    ctx.lineJoin = "round";
    // Base and tapering spire.
    const g = ctx.createLinearGradient(x - 18, 0, x + 18, 0);
    g.addColorStop(0, "#9a96a8"); g.addColorStop(0.5, "#cfcadc"); g.addColorStop(1, "#7a7488");
    ctx.fillStyle = g;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x - 20, y + 14); ctx.lineTo(x + 20, y + 14); ctx.lineTo(x + 12, y + 14 - H); ctx.lineTo(x - 12, y + 14 - H); ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Stone courses and a glowing rune band per level.
    ctx.strokeStyle = "rgba(40,30,60,0.35)"; ctx.lineWidth = 1;
    for (let k = 1; k < 5; k++) { const yy = y + 14 - (H * k) / 5, hw = 20 - (8 * k) / 5; ctx.beginPath(); ctx.moveTo(x - hw, yy); ctx.lineTo(x + hw, yy); ctx.stroke(); }
    const cast = Math.max(0, 1 - p.fired / 0.35);
    for (let k = 0; k < p.level; k++) {
      const yy = y + 4 - k * 12;
      ctx.strokeStyle = `rgba(200,150,255,${(0.55 + cast * 0.45).toFixed(3)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 15 + k * 1.5, yy); ctx.lineTo(x + 15 - k * 1.5, yy); ctx.stroke();
    }
    // Battlement cap.
    ctx.fillStyle = "#6a6478"; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x - 16, y + 8 - H, 32, 8, 2); ctx.fill(); ctx.stroke();
    // Floating crystal: bobs, spins slowly, flares on each cast.
    const cy = y - 6 - H - 8 + Math.sin(this.time * 2.2 + x) * 3;
    const sc = 1 + cast * 0.35;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const glow = this.blob("magecrystal", [[0, "rgba(220,170,255,1)"], [0.45, "rgba(160,90,255,0.6)"], [1, "rgba(120,60,255,0)"]]);
    this.drawBlob(ctx, glow, x, cy, 20 * sc, 20 * sc, 0.55 + cast * 0.45);
    ctx.restore();
    const w = 7 * sc, hgt = 12 * sc, tw = Math.sin(this.time * 1.4 + x) * 0.35;
    ctx.fillStyle = "#b07aff"; ctx.strokeStyle = "#2a1450"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x, cy - hgt); ctx.lineTo(x + w * Math.cos(tw), cy); ctx.lineTo(x, cy + hgt * 0.7); ctx.lineTo(x - w * Math.cos(tw), cy); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,240,255,0.75)";
    ctx.beginPath(); ctx.moveTo(x, cy - hgt); ctx.lineTo(x + w * 0.4 * Math.cos(tw), cy - 2); ctx.lineTo(x, cy); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /** When the spike trap last caught a foe (and where): stakes near it flash and judder. */
  private spikeHit = { x: 0, t: -9 };
  /** When each tower was last stunned by a War Raven. */
  towerStunAt = new Map<string, number>();
  /** Tonight's weather (mirrored from the camp each frame) and where a storm bolt is striking. */
  private weatherNow: Weather = "clear";
  private boltTarget: Vec | null = null;
  /** One row of the spike trap: sharpened stakes leaning out toward the forest (denser per level). */
  private drawSpikeRow(ctx: CanvasRenderingContext2D, level: number, row: number): void {
    const y = SPIKES.y0 + 12 + row * 18;
    const n = 6 + level * 2;
    const w = SPIKES.x1 - SPIKES.x0;
    const since = this.time - this.spikeHit.t;
    ctx.save();
    ctx.lineCap = "round";
    for (let i = 0; i < n; i++) {
      const x = SPIKES.x0 + ((i + (row % 2) * 0.5 + 0.25) / n) * w;
      const near = since < 0.3 && Math.abs(x - this.spikeHit.x) < 26 ? 1 - since / 0.3 : 0;
      const jig = near ? Math.sin(since * 70 + i) * 1.6 * near : 0;
      const len = 13 + ((i * 7 + row * 3) % 5);
      const lean = -0.35 + ((i * 13 + row * 5) % 7) * 0.05;
      const tx = x + Math.sin(lean) * len + jig, ty = y - Math.cos(lean) * len;
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + 2, y + 2); ctx.lineTo(tx + 6, y + 4); ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4.2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.strokeStyle = level >= 3 ? "#a8a8b0" : "#a8743e";
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.fillStyle = near ? "#ff6a4a" : level >= 2 ? "#e8e8ee" : "#d8b07a";
      ctx.beginPath(); ctx.arc(tx, ty, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /** A blessing was just chosen: the golden pillar rises around the King, with its icon and name. */
  blessed(c: Camp, icon: string, name: string, combo = false): void {
    this.flushUnlocks();
    if (this.ambient || c.hero.dead) return;
    const h = c.hero;
    this.levelUpAt = this.time;
    if (combo) {
      // A combo completes: a bigger, two-tone shockwave and a shower of gold and violet sparks.
      this.fx.rings.push({ x: h.x, y: h.y + 12, r: 130, color: "#ffd84a", life: 0.8, max: 0.8, width: 7 });
      this.fx.rings.push({ x: h.x, y: h.y + 12, r: 90, color: "#c890ff", life: 0.6, max: 0.6, width: 4 });
      this.fx.burst(h.x, h.y - 20, "#ffd84a", 30, 260, { max: 1, size: 3.5, gravity: 120, shape: "spark" });
      this.fx.burst(h.x, h.y - 20, "#c890ff", 20, 220, { max: 0.9, size: 3, gravity: 120, shape: "spark" });
      this.fx.flash = 0.25;
      this.fx.flashColor = "#fff2c0";
      this.fx.shake(0.25);
    }
    this.fx.rings.push({ x: h.x, y: h.y + 12, r: 70, color: "#bfe8ff", life: 0.6, max: 0.6, width: 5 });
    this.fx.burst(h.x, h.y - 10, "#fff2b0", 22, 170, { max: 0.8, size: 3, gravity: -90, shape: "spark" });
    this.fx.number(h.x, h.y - 112, `${icon} ${name}`, "#bfe8ff", 18, 1.6);
  }

  /** Short fireworks burst for in-run milestones (e.g. a new endless record). */
  celebrate(): void {
    this.fireworks = Math.max(this.fireworks, 1.2);
  }

  /** Longest kill streak this run (for the end screen). */
  get bestStreak(): number {
    return this.comboBest;
  }

  resetStreak(): void {
    this.combo = 0;
    this.comboBest = 0;
    this.comboAt = -9;
  }

  /** Pixel-density cap (full 3× on retina phones, for crisp art); lowered automatically on devices
   *  that can't hold ~24 fps (see perfSample). */
  maxDpr = 3;
  private perfAcc = 0;
  private perfFrames = 0;

  /**
   * Adaptive quality: feed real frame times; if ~4 s of frames average slower than 24 fps, render the
   * canvas at a lower pixel density (3 → 2 → 1.5 → 1). Only ever steps down; affects drawing, never the sim.
   */
  perfSample(realDt: number): void {
    if (this.maxDpr <= 1 || (window.devicePixelRatio || 1) <= 1) return;
    this.perfAcc += realDt;
    this.perfFrames++;
    if (this.perfAcc < 4) return;
    const avg = this.perfAcc / this.perfFrames;
    this.perfAcc = 0;
    this.perfFrames = 0;
    // 24 fps, not 30: iPhones in Low Power Mode cap rAF at 30 fps, which isn't a reason to blur the game.
    if (avg > 1 / 24) {
      this.maxDpr = this.maxDpr > 2 ? 2 : this.maxDpr > 1.5 ? 1.5 : 1;
      this.fit();
    }
  }

  fit(): number {
    const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
    // Render at the screen's true density (up to 3×) so the art is sharp; perfSample steps down if needed.
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.canvas.style.width = `${VIEW_W * scale}px`;
    this.canvas.style.height = `${VIEW_H * scale}px`;
    this.canvas.width = Math.round(VIEW_W * scale * dpr);
    this.canvas.height = Math.round(VIEW_H * scale * dpr);
    this.base = [scale * dpr, 0, 0, scale * dpr, 0, 0];
    // Tree sprites are rendered at the on-screen pixel density so they blit without resampling.
    const td = scale * dpr;
    if (Math.abs(td - this.treeDpr) > 0.01) {
      this.treeDpr = td;
      this.treeSprites.clear();
    }
    return scale;
  }

  /** Camera top-left in world space. */
  camOrigin(): Vec {
    return { x: this.cam.x - VIEW_W / 2, y: this.cam.y - VIEW_H / 2 };
  }

  private pickupBatch = 0;
  /** The live "+N" pickup label and its running total (merged while it's still fresh). */
  private pickupNum: (typeof this.fx.nums)[number] | null = null;
  private pickupTotal = 0;
  private segHitAt: number[] = [];
  hallHitAt = -9;
  private heroHitAt = -9;
  private heroStillAt = -9;
  private levelUpAt = -9;
  private arriveAt = -9;
  /** When the hero last respawned (drives the rise-from-light animation). */
  private respawnAt = -9;
  private lastKill: { x: number; y: number } | null = null;
  private groundFires: { x: number; y: number; t: number }[] = [];
  /** Boulder impacts: a scorched crater decal that fades, and a billowing dust cloud. */
  private impacts: { x: number; y: number; r: number; t: number }[] = [];
  /** The King's speech bubble. */
  private quip: { text: string; t: number } | null = null;
  private quipN = 0;
  private prevPhase = "";
  private lowHpSaid = false;
  /** Speech bubble above the King: pops in, holds ~2 s, fades. */
  private drawQuip(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const q = this.quip;
    if (!q) return;
    const age = this.time - q.t;
    if (age < 0) return;
    if (age > 2.3) {
      this.quip = null;
      return;
    }
    const pop = age < 0.15 ? 0.6 + (age / 0.15) * 0.4 + Math.sin((age / 0.15) * Math.PI) * 0.12 : 1;
    const a = age > 1.9 ? 1 - (age - 1.9) / 0.4 : 1;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.font = `bold 12px ${FONT}`;
    const w = ctx.measureText(q.text).width + 16;
    const bx = Math.max(x - 140, Math.min(x + 140, x));
    ctx.translate(bx, y);
    ctx.scale(pop, pop);
    ctx.fillStyle = "#fffaf0";
    ctx.strokeStyle = "#2a1a0a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -24, w, 22, 11);
    ctx.moveTo(-5, -2.5);
    ctx.lineTo(0, 6);
    ctx.lineTo(5, -2.5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fffaf0";
    ctx.fillRect(-4, -4, 8, 3);
    ctx.fillStyle = "#2a1a0a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(q.text, 0, -13);
    ctx.restore();
  }

  /** `delay` holds the line back (e.g. until a big floating label above the King has risen away). */
  private say(lines: string[], delay = 0): void {
    if (this.ambient) return;
    this.quip = { text: lines[this.quipN++ % lines.length]!, t: this.time + delay };
  }
  /** Where the King fell (plays his death animation until he respawns). */
  private heroFell: { x: number; y: number; t: number; flip: boolean; landed?: boolean } | null = null;
  private lastHeroFlip = false;
  private landed = true;
  private waveAt = -9;
  private fireworks = 0;
  /** Boss entrance: camera looks at this point for a moment. */
  private focus: { x: number; y: number; t: number; name: string } | null = null;
  /** Seconds left of the nightfall camera reveal. */
  private reveal = 0;
  /** Waiting (up to N s) for the first enemy of the night to come into view before revealing. */
  private revealPending = 0;
  private fireworkTimer = 0;
  private pickupTimer = 0;
  /** Kill streak: kills chained within COMBO_WINDOW of each other. */
  private combo = 0;
  private comboAt = -9;
  private streakShownAt = -9;
  private comboBest = 0;
  /** Milestone tier (1..4) reached since the last takeStreakCall(), 0 if none. */
  private streakCall = 0;
  private lastHero: Vec = { x: 0, y: 0 };
  private heroWasMoving = false;
  /** Wall/hall hits during the current wave; 0 at wave end = flawless. */
  private waveHits = 0;
  private flawless = false;

  /** True once after a wave is held without a single wall or hall hit. */
  takeFlawless(): boolean {
    const f = this.flawless;
    this.flawless = false;
    return f;
  }

  takeStreakCall(): number {
    const t = this.streakCall;
    this.streakCall = 0;
    return t;
  }

  consume(events: CampEvent[]): void {
    const fx = this.fx;
    // A blessing pick opens in the same tick: its screen covers mid-view, so world popups
    // there would ghost through behind the title (its recap already says "Flawless").
    const picking = events.some((e) => e.type === "offers");
    for (const ev of events) {
      switch (ev.type) {
        case "hit":
          if (this.hitStars.length > 24) this.hitStars.shift();
          this.hitStars.push({ x: ev.x, y: ev.y, t: this.time, gold: ev.owner === "hero", big: !!ev.crit, rot: (ev.x * 0.37 + ev.y * 0.11) % 1.57 });
          if (ev.owner === "hero") fx.burst(ev.x, ev.y, "#ffd84a", 5, 120, { max: 0.22, size: 2.4, shape: "spark" });
          else fx.burst(ev.x, ev.y, "#fff4d0", 2, 90, { max: 0.18, size: 2, shape: "spark" });
          // Tower arrows stay stuck in the body for a moment (visual only).
          if (ev.owner === "tower" && ev.eid !== undefined) {
            if (this.stuck.length > 60) this.stuck.shift();
            const h = (ev.eid * 7919 + this.stuck.length * 131) % 1000 / 1000;
            this.stuck.push({ eid: ev.eid, dx: (h - 0.5) * 10, dy: -6 - h * 10, ang: -Math.PI / 2 + (h - 0.5) * 1.1, t: this.time });
          }
          if (ev.crit) fx.number(ev.x, ev.y, `${ev.damage}!`, "#ffd84a", 24, 0.8);
          else if (ev.owner === "hero") fx.number(ev.x, ev.y, String(ev.damage), "#ffffff", 15, 0.6);
          break;
        case "shoot":
          if (ev.owner === "hero") {
            this.heroShotAt = this.time;
            // A tiny bow-string spark so each shot reads, even in a crowd.
            fx.burst(ev.x, ev.y - 6, "#fff6c0", 3, 70, { max: 0.14, size: 2, shape: "spark" });
          }
          break;
        case "kill":
          this.countKill(ev.x, ev.y);
          this.lastKill = { x: ev.x, y: ev.y };
          // A fallen torch-bearer's torch keeps burning on the ground for a moment.
          if (this.night > 0.4 && ev.eid % 3 === 0 && !ev.enemy.flying && this.groundFires.length < 12) this.groundFires.push({ x: ev.x + 10, y: ev.y + 6, t: this.time });
          // Walkers with a body sprite topple over and fade (bats, rams and the dragon just burst).
          // Walking bosses topple too (a heavy fall with a ring of dust), instead of vanishing.
          if (LOOKS[ev.enemy.id] && !ev.enemy.flying && this.corpses.length < 30) {
            this.corpseFlip = -this.corpseFlip;
            const mv = this.enemyMove.get(ev.eid);
            this.corpses.push({ x: ev.x, y: ev.y, id: ev.enemy.id, r: ev.enemy.radius, t: this.time, dir: mv ? (mv.flip ? 1 : -1) : this.corpseFlip });
          }
          fx.burst(ev.x, ev.y, ev.enemy.color, ev.enemy.boss ? 30 : 10, ev.enemy.boss ? 260 : 150, { max: 0.55, size: 3.5, gravity: 260, shape: "chunk" });
          fx.rings.push({ x: ev.x, y: ev.y, r: ev.enemy.radius * 1.8, color: "#ffffff", life: 0.18, max: 0.18, width: 2 });
          if (ev.enemy.boss) {
            this.say(["Down you go!", "Who's next?", "Ha! Too slow."]);
            fx.shake(0.9);
            fx.flash = 0.5;
            fx.flashColor = "#fff2c0";
            fx.slowmo = 1.2;
            if (!ev.enemy.flying) {
              for (let k = 0; k < 18; k++) {
                const a = (k / 18) * Math.PI * 2;
                fx.burst(ev.x + Math.cos(a) * ev.enemy.radius * 1.4, ev.y + 6 + Math.sin(a) * ev.enemy.radius * 0.5, "rgba(214,198,166,0.85)", 1, 70, { max: 0.9, size: 8, gravity: -14, drag: 3 });
              }
              fx.rings.push({ x: ev.x, y: ev.y + 6, r: ev.enemy.radius * 3.2, color: "#e8d8b0", life: 0.7, max: 0.7, width: 4 });
            }
          }
          break;
        case "logSpend":
          if (this.flyers.length < 40) this.flyers.push({ from: ev.from, to: ev.to, t: 0, log: true });
          break;
        case "bowDeliver":
          if (this.flyers.length < 40) this.flyers.push({ from: ev.from, to: ev.to, t: 0, bow: true });
          break;
        case "forged":
          fx.burst(ev.x - 50, ev.y - 40, "#ffb040", 8, 120, { max: 0.35, size: 2.5, shape: "spark" });
          break;
        case "chop":
          fx.burst(ev.x + 6, ev.y - 20, "#6aaa50", 5, 80, { max: 0.5, size: 3, gravity: 200 });
          fx.burst(ev.x + 10, ev.y, "#c8a070", 4, 70, { max: 0.4, size: 2.5, gravity: 300, shape: "chunk" });
          break;
        case "coinPickup": {
          this.pickupBatch += 1;
          // A coin flies from where it was picked up into the HUD coin counter (capped).
          if (!this.ambient && this.uiCoins.length < 14) {
            const oc = this.camOrigin();
            this.uiCoins.push({ x: ev.x - oc.x, y: ev.y - 20 - oc.y, t: -this.uiCoins.length * 0.05, spin: Math.random() * 6 });
          }
          break;
        }
        case "tentHeal":
          for (const pt of ev.points) {
            fx.burst(pt.x, pt.y - 10, "#8ef06a", 4, 40, { max: 0.7, size: 2.6, gravity: -90, shape: "spark" });
            fx.number(pt.x + 12, pt.y - 30, "+", "#8ef06a", 14, 0.6);
          }
          break;
        case "mageZap":
          fx.zaps.push({ points: ev.points, life: 0.3, color: "#d8b0ff" });
          for (const pt of ev.points.slice(1)) fx.burst(pt.x, pt.y, "#c890ff", 5, 110, { max: 0.3, size: 2.4, shape: "spark" });
          break;
        case "burrow":
        case "emerge":
          fx.burst(ev.x, ev.y, "#7a5a32", ev.type === "emerge" ? 16 : 10, 150, { max: 0.6, size: 3, gravity: 300, shape: "chunk" });
          fx.rings.push({ x: ev.x, y: ev.y + 4, r: 26, color: "#a88a5a", life: 0.35, max: 0.35, width: 3 });
          if (ev.type === "emerge") fx.shake(0.12);
          break;
        case "stormBolt":
          this.lightning = 1;
          this.boltSeed = Math.floor(this.time * 1000) + Math.round(ev.x);
          this.boltTarget = { x: ev.x, y: ev.y };
          fx.burst(ev.x, ev.y, "#e8e0ff", 14, 220, { max: 0.5, size: 3, shape: "spark" });
          fx.shake(0.18);
          break;
        case "towerStunned":
          this.towerStunAt.set(ev.plot, this.time);
          fx.burst(ev.x, ev.y, "#2a2438", 14, 150, { max: 0.6, size: 3, gravity: 120, shape: "chunk" });
          fx.rings.push({ x: ev.x, y: ev.y, r: 34, color: "#c890ff", life: 0.4, max: 0.4, width: 3 });
          fx.number(ev.x, ev.y - 30, "STUNNED!", "#d8b0ff", 15, 1);
          break;
        case "spikeHit":
          this.spikeHit = { x: ev.x, t: this.time };
          fx.burst(ev.x, ev.y + 4, "#8a5a2a", 4, 70, { max: 0.3, size: 2.4, gravity: 260, shape: "chunk" });
          break;
        case "specHit":
          if (ev.spec === "fire") fx.burst(ev.x, ev.y, "#ff9a3a", 5, 90, { max: 0.35, size: 2.6, gravity: -60, shape: "spark" });
          else if (ev.spec === "frost") {
            fx.burst(ev.x, ev.y, "#c8f0ff", 6, 110, { max: 0.4, size: 2.4, gravity: 120, shape: "chunk" });
            fx.rings.push({ x: ev.x, y: ev.y, r: 16, color: "#9ae6ff", life: 0.25, max: 0.25, width: 2 });
          } else fx.burst(ev.x, ev.y, "#ffe08a", 3, 80, { max: 0.2, size: 2, shape: "spark" });
          break;
        case "courier":
          // A coin arcs from the hall's pile to the King, homing on him as he moves.
          this.pickupBatch += 1;
          if (!this.ambient && this.flyers.length < 40) this.flyers.push({ from: { x: ev.x, y: ev.y - 8 }, to: { x: this.courierTo.x, y: this.courierTo.y - 20 }, t: 0, speed: 1.6, follow: true });
          break;
        case "coinSpend":
          if (this.flyers.length < 40) this.flyers.push({ from: ev.from, to: ev.to, t: 0 });
          break;
        case "build":
          this.builtAt.set(ev.plot, this.time);
          fx.burst(ev.x, ev.y, "#ffe08a", 26, 220, { max: 0.6, size: 3.5, gravity: -30 });
          fx.burst(ev.x, ev.y, "#c8a070", 14, 160, { max: 0.6, size: 4, gravity: 300, shape: "chunk" });
          fx.rings.push({ x: ev.x, y: ev.y, r: 70, color: "#ffe08a", life: 0.5, max: 0.5, width: 5 });
          // High enough to clear the King's coin stack and tag while he stands on the plot.
          fx.number(ev.x, ev.y - 112, ev.level === 1 && ev.kind !== "repair" ? "BUILT!" : ev.kind === "repair" ? "REPAIRED!" : "UPGRADED!", "#ffe66a", 20, 1.1);
fx.shake(0.15);
          // A low dust cloud rolls out from the base as the building lands at the end of its rise.
          if (ev.kind !== "repair") this.buildDust.push({ x: ev.x, y: ev.y + 16, t: this.time + 0.3 });
          break;
        case "wallHit":
          this.waveHits += 1;
          this.segHitAt[ev.seg] = this.time;
          fx.burst(ev.x + (Math.random() - 0.5) * SEGMENT_W * 0.8, ev.y - 6, "#a8865a", 3, 110, { max: 0.4, size: 3, gravity: 400, shape: "chunk" });
          break;
        case "wallBreak":
          fx.burst(ev.x, ev.y, "#8a6a42", 30, 220, { max: 0.8, size: 5, gravity: 420, shape: "chunk" });
          // The segment collapses: a broad dust cloud rolls along it and a few planks tumble away.
          if (this.impacts.length > 10) this.impacts.shift();
          this.impacts.push({ x: ev.x, y: ev.y + 6, r: SEGMENT_W * 0.9, t: this.time });
          for (let k = 0; k < 5; k++)
            this.planks.push({ x: ev.x + (k - 2) * 9, y: ev.y - 6, vx: (k - 2) * 38 + (k % 2 ? 12 : -12), vy: -150 - (k % 3) * 40, a: k * 0.7, va: (k % 2 ? 1 : -1) * (6 + k), t: this.time, gy: ev.y + 14 + (k % 3) * 6 });
          fx.shake(0.45);
          fx.number(ev.x, ev.y - 30, "BREACH!", "#ff6a50", 18, 1.1);
          break;
        case "hallHit":
          this.waveHits += 1;
          this.hallHitAt = this.time;
          fx.shake(Math.min(0.3, 0.05 + ev.damage / 150));
          fx.burst(ev.x, ev.y, "#c0a080", 3, 100, { max: 0.4, size: 3, gravity: 300, shape: "chunk" });
          break;
        case "ability":
          this.castFlourishAt = this.time;
          fx.shake(0.3);
          fx.rings.push({ x: ev.x, y: ev.y, r: 90, color: "#ffe08a", life: 0.5, max: 0.5, width: 5 });
          if (ev.id === "overclock") {
            fx.flash = 0.2;
            fx.flashColor = "#ffd060";
          }
          break;
        case "boom":
          if (ev.kind === "boulder") {
            fx.rings.push({ x: ev.x, y: ev.y, r: ev.r, color: "#c8a878", life: 0.35, max: 0.35, width: 5 });
            fx.burst(ev.x, ev.y, "#a08860", 16, 220, { max: 0.6, size: 4, gravity: 340, shape: "chunk" });
            fx.burst(ev.x, ev.y, "#6a6258", 6, 260, { max: 0.7, size: 5, gravity: 420, shape: "chunk" });
            fx.shake(0.18);
            if (this.impacts.length > 10) this.impacts.shift();
            this.impacts.push({ x: ev.x, y: ev.y, r: ev.r, t: this.time });
            break;
          }
          fx.rings.push({ x: ev.x, y: ev.y, r: ev.r, color: ev.kind === "nova" ? "#ff7a2a" : "#c8d8ff", life: 0.5, max: 0.5, width: 8 });
          // A shockwave rolls along the ground: dust kicked up in an expanding ring, and a scorch.
          this.shockwaves.push({ x: ev.x, y: ev.y, r: ev.r, t: this.time, nova: ev.kind === "nova" });
          if (this.impacts.length > 10) this.impacts.shift();
          this.impacts.push({ x: ev.x, y: ev.y, r: ev.r * 0.4, t: this.time });
          fx.burst(ev.x, ev.y, ev.kind === "nova" ? "#ff8a2a" : "#e0e8ff", 30, 260, { max: 0.6, size: 4 });
          fx.flash = 0.25;
          fx.flashColor = ev.kind === "nova" ? "#ff8030" : "#c8d8ff";
          fx.shake(0.45);
          break;
        case "plotUnlocked":
          // Unlocks land at dawn, behind the blessing pick: hold the reveal until the pick closes.
          if (picking) this.pendingUnlocks.push({ x: ev.x, y: ev.y });
          else this.revealUnlock(ev.x, ev.y);
          break;
        case "allyDown":
          // The knight topples with his death frames, kicks up dust and fades (see drawAllyFalls).
          fx.burst(ev.x, ev.y - 6, "#c8d0dc", 4, 90, { max: 0.3, size: 2, shape: "spark" });
          if (this.allyFalls.length > 12) this.allyFalls.shift();
          this.allyFalls.push({ x: ev.x, y: ev.y, t: this.time, flip: ev.x > MAP_W / 2, landed: false });
          break;
        case "heroRespawn":
          this.respawnAt = this.time;
          // Back in the fight: a gold ring and burst where the hero reappears.
          fx.rings.push({ x: HERO_SPAWN.x, y: HERO_SPAWN.y, r: 60, color: "#ffd84a", life: 0.5, max: 0.5, width: 5 });
          fx.burst(HERO_SPAWN.x, HERO_SPAWN.y, "#ffe9a0", 18, 160, { max: 0.6, size: 3, gravity: -40 });
          fx.number(HERO_SPAWN.x, HERO_SPAWN.y - 44, "Back!", "#ffe9a0", 16, 1);
          break;
        case "earlyBonus":
          // Calling the wave early: show the reward landing on the hall's coin pile.
          fx.number(INCOME_PILE.x - 60, INCOME_PILE.y - 40, `+${ev.coins} early!`, "#ffd84a", 16, 1.3);
          fx.burst(INCOME_PILE.x, INCOME_PILE.y - 10, "#ffd84a", 10, 120, { max: 0.6, size: 3, gravity: 200 });
          break;
        case "levelUp":
          this.levelUpAt = this.time;
          this.say(["For the crown!", "Stronger!", "Feel that?", "Ha! Come on!"], 0.9);
          // Above the coin stack and the King's quip bubble, so the two never overlap.
          fx.number(ev.x, ev.y - 112, `LEVEL ${ev.level}!`, "#ffe66a", 22, 1.4);
          fx.burst(ev.x, ev.y, "#ffe08a", 26, 190, { max: 0.8, size: 3, gravity: -80 });
          fx.rings.push({ x: ev.x, y: ev.y + 12, r: 60, color: "#ffe08a", life: 0.6, max: 0.6, width: 5 });
          break;
        case "bossSpawn":
          this.say(["That one's big…", "A champion? Good.", "Face me!"]);
          this.focus = { x: ev.x, y: ev.y + 120, t: 1.8, name: ev.name };
          fx.shake(0.4);
          // The ground answers: dust bursts out along the forest edge, rolling outward from where the
          // boss breaks cover, and the trees nearby shudder.
          this.bossRumble = { x: ev.x, y: Math.max(ev.y, FOREST_Y - 20), t: this.time };
          this.bossCracks = { x: ev.x, y: Math.max(ev.y, FOREST_Y - 20) + 30, t: this.time };
          break;
        case "waveStart":
          this.waveHits = 0;
          this.waveAt = this.time;
          fx.shake(0.2);
          // Nightfall reveal: glide up to the gate to show the horde coming, then back to the King.
          if (!ev.boss && !this.ambient) this.revealPending = 14;
          this.say(ev.boss ? ["That one's big…", "Steady now!"] : ["Hold the line!", "Here they come!", "To the walls!", "Not tonight!"]);
          break;
        case "heroHit":
          this.heroHitAt = this.time;
          fx.number(ev.x, ev.y - 24, `-${ev.damage}`, "#ff6a50", 12, 0.5);
          break;
        case "heroDown":
          this.heroFell = { x: ev.x, y: ev.y, t: this.time, flip: this.lastHeroFlip };
          fx.burst(ev.x, ev.y, "#ffd84a", 20, 180, { max: 0.6, size: 3 });
          fx.shake(0.5);
          fx.flash = 0.3;
          fx.flashColor = "#ff3020";
          break;
        case "sapper":
          fx.rings.push({ x: ev.x, y: ev.y, r: 60, color: "#ffcc55", life: 0.35, max: 0.35, width: 6 });
          fx.burst(ev.x, ev.y, "#ff9a30", 24, 240, { max: 0.5, size: 4 });
          fx.burst(ev.x, ev.y, "#5a4a3a", 10, 260, { max: 0.7, size: 4, gravity: 420, shape: "chunk" });
          fx.shake(0.45);
          // A swelling fireball, a rising smoke column and a scorched crater (see drawBlasts).
          if (this.impacts.length > 10) this.impacts.shift();
          this.impacts.push({ x: ev.x, y: ev.y, r: 55, t: this.time });
          if (this.blasts.length > 6) this.blasts.shift();
          this.blasts.push({ x: ev.x, y: ev.y, t: this.time });
          break;
        case "heal":
          fx.rings.push({ x: ev.x, y: ev.y, r: ev.r, color: "#6fe0a0", life: 0.5, max: 0.5, width: 3 });
          this.castAt.push({ x: ev.x, y: ev.y, t: this.time, color: "heal" });
          fx.burst(ev.x, ev.y - 20, "#a8ffcc", 8, 70, { max: 0.6, size: 2.2, gravity: -60, shape: "spark" });
          break;
        case "summon":
          fx.rings.push({ x: ev.x, y: ev.y, r: 60, color: "#ff5040", life: 0.45, max: 0.45, width: 4 });
          this.castAt.push({ x: ev.x, y: ev.y, t: this.time, color: "summon" });
          fx.burst(ev.x, ev.y - 20, "#ff9a80", 10, 90, { max: 0.6, size: 2.4, gravity: -40, shape: "spark" });
          break;
        case "enrage":
          fx.rings.push({ x: ev.x, y: ev.y, r: 120, color: "#ff2020", life: 0.8, max: 0.8, width: 6 });
          fx.shake(0.5);
          break;
        case "waveClear": {
          this.cheerAt = this.time;
          // Final blow of the night: a beat of slow motion, a golden flash and a shock ring
          // where the last enemy fell.
          if (!this.ambient && !fx.slowmo) {
            fx.slowmo = 0.45;
            fx.flash = 0.35;
            fx.flashColor = "#fff2c0";
            if (this.lastKill) {
              fx.rings.push({ x: this.lastKill.x, y: this.lastKill.y, r: 120, color: "#ffe08a", life: 0.6, max: 0.6, width: 6 });
              fx.burst(this.lastKill.x, this.lastKill.y, "#ffe08a", 24, 240, { max: 0.8, size: 3, gravity: 60, shape: "spark" });
            }
          }
          if (this.waveHits === 0) {
            if (!picking) fx.number(this.cam.x, this.cam.y - 140, "FLAWLESS!", "#8ef06a", 26, 1.6);
            if (!picking) fx.rings.push({ x: this.cam.x, y: this.cam.y - 140, r: 110, color: "#8ef06a", life: 0.7, max: 0.7, width: 6 });
            this.flawless = true;
            this.say(["Not a scratch!", "Flawless!", "Too easy."]);
          }
          const colors = ["#ffd84a", "#ff6a8a", "#6ae0ff", "#8ef06a", "#ffffff"];
          for (const col of colors) fx.burst(this.cam.x + (Math.random() - 0.5) * 300, this.cam.y - 200, col, 10, 260, { max: 1.4, size: 4, gravity: 220, drag: 1.5, shape: "chunk" });
          fx.number(INCOME_PILE.x - 45, INCOME_PILE.y - 34, `+${ev.bonus} bonus`, "#ffe66a", 16, 1.4);
          break;
        }
        case "won":
          this.fireworks = 2.2;
          break;
        case "lost":
          fx.shake(1);
          fx.flash = 0.5;
          fx.flashColor = "#ff2010";
          break;
        default:
          break;
      }
    }
  }

  draw(c: Camp, dt: number): void {
    // Menu backdrop: never carry a boss-entrance pan/card over from a run that was just left.
    if (this.ambient) this.focus = null;
    // A different camp (new run, back to the menu backdrop, attract restart): drop transient
    // presentation state so nothing leaks across — reveal pans, darkness, per-enemy memory.
    if (c !== this.lastCamp) {
      this.lastCamp = c;
      this.reveal = 0;
      this.revealPending = 0;
      this.night = c.phase === "wave" || this.mood === 4 ? 1 : 0;
      this.levelUpAt = -9;
      this.quip = null;
      this.groundFires = [];
      this.prevPhase = c.phase;
      this.lightning = 0;
      this.nextBolt = 6;
      this.heroFell = null;
      this.enemyMove.clear();
      this.corpses = [];
      // A fresh run: the King drops onto the field.
      this.arriveAt = this.ambient ? -9 : this.time;
      this.landed = this.ambient;
    }
    if (this.enemyMove.size > 300) {
      const alive = new Set(c.enemies.map((e) => e.id));
      for (const id of this.enemyMove.keys()) if (!alive.has(id)) this.enemyMove.delete(id);
    }
    const ctx = this.ctx;
    this.time += dt;
    this.fx.update(dt);
    this.pickupTimer += dt;
    this.courierTo = { x: c.hero.x, y: c.hero.y };
    this.weatherNow = this.ambient ? "clear" : c.weather;
    if (this.fireworks > 0) {
      this.fireworks -= dt;
      this.fireworkTimer -= dt;
      if (this.fireworkTimer <= 0) {
        this.fireworkTimer = 0.18;
        const x = this.cam.x + (Math.random() - 0.5) * VIEW_W * 0.9;
        const y = this.cam.y - VIEW_H * 0.15 - Math.random() * VIEW_H * 0.3;
        const col = ["#ffd84a", "#ff6a8a", "#6ae0ff", "#8ef06a", "#c890ff"][Math.floor(Math.random() * 5)]!;
        this.fx.burst(x, y, col, 26, 220, { max: 1, size: 3.5, gravity: 120, drag: 2, shape: "spark" });
        this.fx.rings.push({ x, y, r: 60, color: col, life: 0.5, max: 0.5, width: 3 });
      }
    }
    if (this.pickupBatch > 0 && this.pickupTimer > 0.25 && !c.hero.dead) {
      // Off to the King's side at shoulder height, clear of the coin stack and its count tag.
      // While the last "+N" is still young, fold the new coins into it (re-popping it) instead of
      // stacking another label: a quick run of pickups reads as one counter ticking up.
      const prev = this.pickupNum && this.fx.nums.includes(this.pickupNum) && this.pickupNum.life > this.pickupNum.max * 0.45 ? this.pickupNum : null;
      if (prev) {
        this.pickupTotal += this.pickupBatch;
        prev.text = `+${this.pickupTotal}`;
        prev.life = prev.max;
        prev.x = c.hero.x + 30; prev.y = c.hero.y - 28;
        prev.vy = -60;
      } else {
        this.pickupTotal = this.pickupBatch;
        this.fx.number(c.hero.x + 30, c.hero.y - 20, `+${this.pickupBatch}`, "#ffe66a", 15, 0.8);
        this.pickupNum = this.fx.nums[this.fx.nums.length - 1] ?? null;
      }
      this.pickupBatch = 0;
      this.pickupTimer = 0;
    }
    // Footstep dust while the hero walks.
    if (!c.hero.dead) {
      // A little scuff of dust under each footfall (walk-phase contacts at sheet poses ~0 and ~4),
      // kicked up behind the planted foot.
      const moved = Math.hypot(c.hero.x - this.lastHero.x, c.hero.y - this.lastHero.y);
      const ph = this.gait.get("hero")?.ph ?? 0;
      const foot = Math.floor((ph + 0.5) / 4) % 2;
      if (moved > 0.6 && moved < 40 && foot !== this.heroFoot) {
        const side = foot ? 5 : -5;
        this.fx.burst(c.hero.x + side, c.hero.y + 12, "rgba(210,190,150,0.8)", 4, 36, { max: 0.45, size: 3.5, gravity: -20, drag: 3 });
        // A soft print pressed into the grass, angled along the walk.
        const ang = Math.atan2(c.hero.y - this.lastHero.y, c.hero.x - this.lastHero.x);
        if (this.prints.length > 40) this.prints.shift();
        this.prints.push({ x: c.hero.x + Math.cos(ang + Math.PI / 2) * (foot ? 3.5 : -3.5), y: c.hero.y + 12 + Math.sin(ang + Math.PI / 2) * (foot ? 2 : -2), a: ang, t: this.time });
      }
      this.heroFoot = foot;
    }
    // Setting off kicks up a ring of dust behind the King; stopping short skids a puff ahead.
    if (!c.hero.dead) {
      const mv = c.hero.moving;
      if (mv !== this.heroWasMoving && this.time > 1) {
        const ang = c.hero.facing;
        const dx = Math.cos(ang), dy = Math.sin(ang);
        if (mv) {
          for (let i = 0; i < 6; i++) {
            const a = ang + Math.PI + (i - 2.5) * 0.35;
            this.fx.burst(c.hero.x + Math.cos(a) * 6, c.hero.y + 12 + Math.sin(a) * 3, "rgba(206,190,160,0.75)", 1, 55, { max: 0.45, size: 4, gravity: -12, drag: 4 });
          }
        } else this.fx.burst(c.hero.x + dx * 8, c.hero.y + 12 + dy * 4, "rgba(206,190,160,0.8)", 5, 45, { max: 0.4, size: 4.5, gravity: -10, drag: 5 });
      }
      this.heroWasMoving = mv;
    }
    this.lastHero = { x: c.hero.x, y: c.hero.y };
    // Enemy tracks: every walker presses a print each stride-length it covers, alternating feet
    // (bigger feet for bigger foes). Rams leave wheel ruts instead; flyers leave nothing.
    for (const e of c.enemies) {
      if (e.def.flying || e.attacking) continue;
      const tr = this.enemyTrack.get(e.id);
      if (!tr) { this.enemyTrack.set(e.id, { x: e.x, y: e.y, d: 0, foot: e.id % 2 }); continue; }
      const dx = e.x - tr.x, dy = e.y - tr.y, d = Math.hypot(dx, dy);
      if (d > 40) { tr.x = e.x; tr.y = e.y; continue; }
      tr.d += d;
      tr.x = e.x; tr.y = e.y;
      const r = e.def.radius;
      const stride = e.def.id === "ram" ? r * 0.9 : r * 1.3 + 6;
      if (tr.d >= stride && d > 0) {
        tr.d -= stride;
        tr.foot ^= 1;
        const ang = Math.atan2(dy, dx), side = (tr.foot ? 1 : -1) * (e.def.id === "ram" ? r * 0.7 : r * 0.3 + 1.5);
        if (this.ePrints.length > 200) this.ePrints.shift();
        this.ePrints.push({ x: e.x + Math.cos(ang + Math.PI / 2) * side, y: e.y + r * 0.9 + Math.sin(ang + Math.PI / 2) * side * 0.5, a: ang, t: this.time, s: Math.min(2, r / 10), rut: e.def.id === "ram" });
      }
    }
    if (this.enemyTrack.size > 200) { const live = new Set(c.enemies.map((q) => q.id)); for (const id of this.enemyTrack.keys()) if (!live.has(id)) this.enemyTrack.delete(id); }
    // Camera eases toward the hero, clamped to the map.
    // On death the camera lingers on the fallen King for a beat before returning to the hall.
    const fell = this.heroFell && this.time - this.heroFell.t < 1.4 ? this.heroFell : null;
    let target = c.hero.dead ? (fell ? { x: fell.x, y: fell.y - 60 } : { x: HALL.x, y: HALL.y - 120 }) : { x: c.hero.x, y: c.hero.y - 60 };
    if (this.focus) {
      this.focus.t -= dt;
      if (this.focus.t <= 0) this.focus = null;
      else target = this.focus;
    } else if (this.revealPending > 0 && !this.ambient) {
      this.revealPending -= dt;
      if (c.enemies.some((e) => e.y > WALL_Y - 230)) {
        this.revealPending = 0;
        this.reveal = 2.3;
      }
    }
    if (!this.focus && this.reveal > 0 && !this.ambient) {
      this.reveal -= dt;
      if (this.reveal > 0.35) target = { x: MAP_W / 2, y: WALL_Y - 30 };
    }
    // Exponential follow: the same feel at 30, 60 or 120 fps (a linear dt*rate step is not).
    const k = 1 - Math.exp(-dt * (this.focus ? 3.5 : this.reveal > 0 ? 2.6 : 6));
    this.cam.x += (target.x - this.cam.x) * k;
    this.cam.y += (target.y - this.cam.y) * k;
    this.cam.x = Math.max(VIEW_W / 2, Math.min(MAP_W - VIEW_W / 2, this.cam.x));
    // Normally stop 60 short of the map's bottom edge, so the top row of plots clears the HUD when the hero
    // stands by the hall; only follow further down if the hero walks low enough to slip under the bottom buttons.
    const heroLow = c.hero.dead ? 0 : c.hero.y - VIEW_H / 2 + 140;
    const maxY = Math.min(MAP_H - VIEW_H / 2, Math.max(MAP_H - VIEW_H / 2 - 60, heroLow));
    this.cam.y = Math.max(VIEW_H / 2 - 160, Math.min(maxY, this.cam.y));
    const o = this.camOrigin();
    const sh = this.fx.shakeOffset(this.time);

    ctx.setTransform(...this.base);
    // Smoothing on; character sprites switch to the high-quality filter themselves (drawAnim),
    // props and terrain are pre-rendered at screen density so the cheap filter is enough.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "low";
    ctx.fillStyle = "#24361c";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.lateBars.length = 0; // (never carried across frames, even if a frame skipped the flush)
    ctx.translate(-o.x + sh.x, -o.y + sh.y);

    this.drawGround(ctx);
    this.drawImpacts(ctx, "ground");
    this.drawBossCracks(ctx);
    // Enemy tracks, tinted by the ground: dark mud in the marsh, pale scuffs on the dusty plains,
    // muted elsewhere. They fade over a few seconds so a busy night shows where the horde came.
    this.ePrints = this.ePrints.filter((p) => this.time - p.t < 5);
    const tint = this.mood === 2 ? "34,26,14" : this.mood === 3 ? "96,72,40" : this.mood === 4 ? "16,20,26" : "26,36,10";
    const base = (this.mood === 2 ? 0.75 : this.mood === 3 ? 0.6 : 0.62) * (1 - this.night * 0.45); // quieter at night, where they read as busy dots
    for (const p of this.ePrints) {
      const u = (this.time - p.t) / 5;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      const fa = 1 - u * u; // hold strong, then fade at the end
      const rx = p.rut ? 8 * p.s : 5.4 * p.s, ry = p.rut ? 2.4 : 3 * p.s;
      // Lit lip of trampled grass on the far side, then the dark pressed hollow.
      ctx.fillStyle = `rgba(220,230,180,${(0.12 * fa).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(0.6, -0.9, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${tint},${(base * fa).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Footprints: a soft darker oval per step, fading out.
    this.prints = this.prints.filter((p) => this.time - p.t < 4);
    for (const p of this.prints) {
      const u = (this.time - p.t) / 4;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillStyle = `rgba(30,40,14,${(0.4 * (1 - u) * (1 - u)).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, 4.2, 2.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    this.drawPlots(ctx, c);
    this.drawCorpses(ctx);
    this.drawAllyFalls(ctx);
    this.drawIncome(ctx, c);
    this.drawCoins(ctx, c);

    // Depth-sorted actors and props.
    type Item = { y: number; draw: () => void };
    const items: Item[] = [];
    for (const t of this.trees) if (t.y > o.y - 20 && t.y < o.y + VIEW_H + 110 && t.x > o.x - 50 && t.x < o.x + VIEW_W + 50) items.push({ y: t.y, draw: () => this.drawTree(ctx, t, this.hidesUnit(c, t)) });
    items.push({ y: WALL_Y, draw: () => this.drawWall(ctx, c) });
    // Lit openings sit right in front of their building, so units in front still cover them.
    if (this.night > 0.02)
      for (const p of c.plots) {
        const win = p.level > 0 ? WINDOW_GLOW[p.kind] : undefined;
        if (win) items.push({ y: p.y + 10.01, draw: () => this.drawWindowLight(ctx, p.x, p.y + win.base, win.pts) });
      }
    const decor = this.decorAtlas();
    if (decor) for (const pp of PLAZA_PROPS) items.push({ y: pp.y, draw: () => this.drawPlazaProp(ctx, decor, pp, c.time) });
    items.push({
      y: HALL.y + 38,
      draw: () => {
        // Like trees, the hall turns see-through while the hero is hidden behind it.
        const h = c.hero;
        const hallLv = c.plots.find((p) => p.kind === "hall")?.level ?? 0;
        const behind = !h.dead && h.y < HALL.y + 38 && h.y > HALL.y + 40 - (150 + hallLv * 14) && Math.abs(h.x - HALL.x) < 80;
        if (behind) {
          ctx.globalAlpha = 0.45;
          this.heroBehind = true;
        }
        drawHall(this, ctx, c);
        ctx.globalAlpha = 1;
      },
    });
    // Spike trap before the gate: three staggered rows of stakes, each row depth-sorted with the foes.
    const spikePlot = c.plots.find((q) => q.kind === "spikes");
    if (spikePlot && spikePlot.level > 0) for (let row = 0; row < 3; row++) items.push({ y: SPIKES.y0 + 12 + row * 18, draw: () => this.drawSpikeRow(ctx, spikePlot.level, row) });
    for (const p of c.plots) if (p.kind === "tower" && p.level > 0) items.push({ y: p.y + 10, draw: () => this.faded(ctx, c, p, 34, 110, () => drawTower(this, ctx, p)) });
    for (const p of c.plots) if (p.kind === "healer" && p.level > 0) items.push({ y: -1e6, draw: () => this.drawHealerAura(ctx, p) });
    for (const p of c.plots) if (p.kind === "healer" && p.level > 0) items.push({ y: p.y + 10, draw: () => this.faded(ctx, c, p, 36, 70, () => this.drawHealerTent(ctx, p)) });
    for (const p of c.plots) if (p.kind === "mage" && p.level > 0) items.push({ y: p.y + 10, draw: () => this.faded(ctx, c, p, 30, 110, () => this.drawMageTower(ctx, p)) });
    for (const p of c.plots) if (p.kind === "barracks" && p.level > 0) items.push({ y: p.y + 10, draw: () => this.faded(ctx, c, p, 50, 70, () => drawBarracks(this, ctx, p)) });
    for (const a of c.allies) if (a.respawn > 0) this.allySeen.delete(a.id);
    for (const a of c.allies) if (a.respawn <= 0) items.push({ y: a.y, draw: () => this.drawAlly(ctx, c, a) });
    for (const p of c.plots) if (p.kind === "catapult" && p.level > 0) items.push({ y: p.y + 10, draw: () => this.faded(ctx, c, p, 34, 60, () => drawCatapult(this, ctx, p)) });
    for (const p of c.plots) if (p.kind === "lumber" && p.level > 0) items.push({ y: p.y + 10, draw: () => this.faded(ctx, c, p, 50, 70, () => drawLumberCamp(this, ctx, p)) });
    for (const p of c.plots)
      if (p.kind === "forge" && p.level > 0) {
        items.push({ y: p.y + 10, draw: () => this.faded(ctx, c, p, 50, 70, () => drawForge(this, ctx, c, p)) });
        items.push({ y: FORGE_IN.y, draw: () => drawForgeZones(this, ctx, c) });
      }
    GROVE.forEach((g, i) => items.push({ y: g.y, draw: () => this.drawGroveTree(ctx, c, g, i) }));
    // Daytime chickens in the meadow (render-only life; they shelter at night).
    if (this.night < 0.6 && (this.mood === 1 || this.mood === 2 || this.mood === 3 || this.mood === 5)) {
      this.updateChickens(c);
      for (const ch of this.chickens) items.push({ y: ch.y, draw: () => this.drawChicken(ctx, ch) });
    }
    for (const w of c.workers) items.push({ y: w.y, draw: () => this.drawWorker(ctx, c, w) });
    // The log drop-off only means something once a lumber camp exists: before that it was an unlabeled empty box.
    if (c.lumberPile > 0 || c.plots.some((p) => p.kind === "lumber" && p.level > 0))
      items.push({
        y: LUMBER_PILE.y,
        draw: () => {
          // Logs landing on (or taken from) the pile: it squashes and springs back, the old stack
          // cross-fades into the next size, a little dust puffs out, and the count bumps.
          const ps = this.pileState;
          if (c.lumberPile !== ps.n) {
            if (c.lumberPile > ps.n && this.time > 1) this.fx.burst(LUMBER_PILE.x, LUMBER_PILE.y + 12, "rgba(206,190,160,0.7)", 4, 34, { max: 0.4, size: 3, gravity: -12, drag: 4 });
            ps.prev = ps.n; ps.n = c.lumberPile; ps.at = this.time;
          }
          const u = Math.min(1, (this.time - ps.at) / 0.3);
          const bump = u < 1 ? Math.sin(u * Math.PI * 2.2) * (1 - u) * 0.12 : 0;
          ctx.save();
          ctx.translate(LUMBER_PILE.x, LUMBER_PILE.y + 12);
          ctx.scale(1 + bump * 0.6, 1 - bump);
          ctx.translate(-LUMBER_PILE.x, -(LUMBER_PILE.y + 12));
          // The bigger stack stays solid; the change fades in over it (growing) or out of it (shrinking).
          const grow = ps.n > ps.prev;
          if (u < 1 && ps.prev !== ps.n) {
            ctx.globalAlpha = grow ? 1 : 1 - u;
            drawLogPile(ctx, LUMBER_PILE.x, LUMBER_PILE.y, ps.prev, true, false);
            ctx.globalAlpha = grow ? u : 1;
          }
          drawLogPile(ctx, LUMBER_PILE.x, LUMBER_PILE.y, c.lumberPile, true);
          ctx.globalAlpha = 1;
          ctx.restore();
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const tb = u < 0.5 ? 1 + Math.sin(u * 2 * Math.PI) * 0.18 : 1;
          ctx.save();
          ctx.translate(LUMBER_PILE.x, LUMBER_PILE.y + 30);
          ctx.scale(tb, tb);
          const lt = c.lumberPile > 0 ? `Logs ${c.lumberPile}` : "Logs";
          this.overlay(ctx, (ctx) => { ctx.textAlign = "center"; ctx.textBaseline = "middle"; outlined(ctx, lt, 0, 0, 9.5); });
          ctx.restore();
        },
      });
    // Flyers sort above everything on the ground (they pass over trees and buildings).
    for (const e of c.enemies) items.push({ y: e.def.flying ? e.y + 2000 : e.y, draw: () => this.drawEnemy(ctx, c, e) });
    if (!c.hero.dead) {
      this.heroFell = null;
      items.push({ y: c.hero.y, draw: () => this.drawHero(ctx, c) });
    } else if (this.heroFell && c.heroLook === "hero") {
      const f = this.heroFell;
      items.push({
        y: f.y,
        draw: () => {
          const age = this.time - f.t;
          ctx.save();
          // Dust as he hits the ground; then he lies where he fell, easing toward faint until the
          // respawn.
          if (!f.landed && age > 0.5) {
            f.landed = true;
            this.fx.burst(f.x + (f.flip ? 14 : -14), f.y + 12, "rgba(200,184,150,0.8)", 12, 70, { max: 0.7, size: 5, gravity: -16, drag: 4 });
            this.fx.shake(0.12);
          }
          const u = Math.min(1, Math.max(0, (age - 1.2) / 3));
          ctx.globalAlpha = 1 - 0.65 * u * u * (3 - 2 * u);
          drawAnim(ctx, "king", "death", animFrame("death", age, 10), f.x, f.y + 12 + u * 2, 45, { flip: f.flip, flash: age < 0.08 ? 0.8 : 0 });
          ctx.restore();
        },
      });
    }
    items.sort((a, b) => a.y - b.y);
    this.heroBehind = false;
    for (const it of items) it.draw();
    // Hero tucked behind a building: draw them again on top, a bit see-through, so they never get lost.
    if (this.heroBehind && !c.hero.dead) {
      ctx.globalAlpha = 0.85;
      this.drawHero(ctx, c);
      ctx.globalAlpha = 1;
    }

    this.drawArrows(ctx, c);
    this.drawStrikes(ctx, c);
    this.drawImpacts(ctx, "dust");
    this.drawHitStars(ctx);
    if (this.bossRumble) {
      const rb = this.bossRumble, age = this.time - rb.t;
      if (age > 1.6) this.bossRumble = null;
      else {
        // A wave of dust puffs travelling out both ways along the tree line.
        const dust = this.blob("dust", [[0, "rgba(206,190,164,0.9)"], [0.6, "rgba(196,180,150,0.45)"], [1, "rgba(190,172,140,0)"]]);
        for (let i = 0; i < 18; i++) {
          const side = i % 2 ? 1 : -1, k = Math.floor(i / 2);
          const delay = k * 0.06, u = (age - delay) / 1.0;
          if (u <= 0 || u >= 1) continue;
          const px = rb.x + side * (20 + k * 34), py = rb.y + Math.sin(k * 1.7) * 8 - u * 16;
          const rr = 18 + u * 30;
          this.drawBlob(ctx, dust, px, py, rr, rr * 0.6, Math.min(1, (1 - u) * 1.3));
        }
        if (age < 1.0 && this.fx.trauma < 0.3) this.fx.shake(0.04);
      }
    }
    this.drawBlasts(ctx);
    this.drawShockwaves(ctx);
    this.drawPlanks(ctx, dt);
    this.drawRepairs(ctx, c);
    if (this.castAt.length) this.castAt = this.castAt.filter((k) => this.time - k.t < 0.6);
    for (const d of this.buildDust) {
      if (this.time < d.t) continue;
      // Front half of an ellipse round the base (the back half is hidden by the building).
      for (let k = 0; k < 16; k++) {
        const a = (k / 15) * Math.PI;
        this.fx.burst(d.x + Math.cos(a) * 40, d.y + 4 + Math.sin(a) * 12, "rgba(214,198,166,0.85)", 2, 60, { max: 0.75, size: 7, gravity: -12, drag: 3 });
      }
    }
    this.buildDust = this.buildDust.filter((d) => this.time < d.t);
    this.drawFlyers(ctx, dt);
    this.fx.draw(ctx);

    ctx.setTransform(...this.base);
    // Sunlight wash: warm where the light comes from (top-left), cooler and a touch darker toward
    // the bottom-right, with soft corners — ties every lit object into one scene. (Night has its own.)
    if (this.mood !== 4) {
      ctx.fillStyle = this.sunlight ??= this.makeSunlight(ctx);
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = this.vignette ??= this.makeVignette(ctx);
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    drawMood(ctx, c, o, this.mood, this.time, this.fx.shakeOffset(this.time));
    // Chapter 4 is permanently night; everywhere else waves are fought at night, building by day.
    this.drawDayNight(ctx, c, o, sh, dt);
    this.drawWeather(ctx, dt, o);
    // Floating numbers sit above the night darkness and weather, so damage, loot and "LEVEL N!"
    // read at full brightness anywhere on screen, not only inside a light.
    for (const draw of this.lateBars) draw(ctx);
    this.lateBars.length = 0;
    ctx.save();
    ctx.translate(-o.x + sh.x, -o.y + sh.y);
    this.fx.drawNumbers(ctx);
    ctx.restore();
    if (this.focus && !this.ambient) drawBossCard(ctx, this.focus.name, this.focus.t);
    drawDanger(ctx, c, this.time);
    // Hall struck while below half health: the screen edges flash red, harder the closer it is
    // to falling, so you feel it even when the King is far from the hall.
    const hitAge = this.time - this.hallHitAt;
    const hallFrac = c.hallHp / c.hallMaxHp;
    if (!this.ambient && c.phase === "wave" && hallFrac < 0.5 && hallFrac > 0 && hitAge < 0.4) {
      const k = (1 - hitAge / 0.4) * (0.35 + 0.5 * (1 - hallFrac / 0.5));
      const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.28, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.6);
      g.addColorStop(0, "rgba(255,30,20,0)");
      g.addColorStop(1, `rgba(255,30,20,${k.toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (!this.ambient) {
      this.drawIndicators(ctx, c, o);
      this.drawCombo(ctx, c);
    }
    this.drawUiCoins(ctx, dt);
    this.drawJoystick(ctx);
    if (this.fx.flash > 0) {
      ctx.globalAlpha = Math.min(0.6, this.fx.flash);
      ctx.fillStyle = this.fx.flashColor;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
    }
    // Wave start: a red glow sweeps along the top edge (where the enemies come from).
    const waveT = this.time - this.waveAt;
    if (waveT < 2) {
      const a = 0.45 * Math.sin(Math.min(1, waveT / 2) * Math.PI);
      const g3 = ctx.createLinearGradient(0, 0, 0, VIEW_H * 0.35);
      g3.addColorStop(0, `rgba(255,40,20,${a.toFixed(3)})`);
      g3.addColorStop(1, "rgba(255,40,20,0)");
      ctx.fillStyle = g3;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H * 0.35);
    }
    const heroT = this.time - this.heroHitAt;
    if (heroT < 0.35 && !c.hero.dead) {
      const a = 0.4 * (1 - heroT / 0.35);
      const g2 = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.75);
      g2.addColorStop(0, "rgba(255,0,0,0)");
      g2.addColorStop(1, `rgba(255,30,20,${a.toFixed(3)})`);
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    // (The low-hall red vignette lives in overlays.drawDanger — waves only, not behind the menus.)
  }

  // -------------------------------------------------------------------------------------------

  private drawGround(ctx: CanvasRenderingContext2D): void {
    if (!this.terrain) this.terrain = this.buildTerrain();
    // Blit only the visible window of the (large) terrain canvas.
    const o = this.camOrigin();
    const k = TERRAIN_SCALE;
    const pad = 20;
    const sx = Math.max(0, (o.x - pad - TERRAIN_X) * k);
    const sy = Math.max(0, (o.y - pad - TERRAIN_Y) * k);
    const sw = Math.min(this.terrain.width - sx, (VIEW_W + pad * 2) * k);
    const sh = Math.min(this.terrain.height - sy, (VIEW_H + pad * 2) * k);
    ctx.drawImage(this.terrain, sx, sy, sw, sh, TERRAIN_X + sx / k, TERRAIN_Y + sy / k, sw / k, sh / k);
  }

  /** The static ground (grass texture, path, flowers, rocks) rendered once into an offscreen canvas. */
  private groundImgs = new Map<number, HTMLImageElement>();
  /** The painted ground for the current chapter, or null while it loads (rebuilds when ready). */
  private paintedGround(): HTMLImageElement | null {
    if (typeof Image === "undefined") return null;
    const id = [1, 2, 3, 4, 5, 99].includes(this.mood) ? this.mood : 1;
    let img = this.groundImgs.get(id);
    if (!img) {
      img = new Image();
      img.onload = () => {
        if (this.mood === id) this.terrain = null;
      };
      img.src = `./sprites/terrain/ground_${id}.webp`;
      this.groundImgs.set(id, img);
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }

  private buildTerrain(): HTMLCanvasElement {
    this.ponds = [];
    this.crystals = [];
    this.graves = [];
    const k = TERRAIN_SCALE;
    const cv = document.createElement("canvas");
    cv.width = TERRAIN_W * k;
    cv.height = TERRAIN_H * k;
    const ctx = cv.getContext("2d")!;
    ctx.scale(k, k);
    ctx.translate(-TERRAIN_X, -TERRAIN_Y);
    const rng = createRng(4242);
    // Painted ground (baked by scripts/gen_terrain.py) when available; procedural fallback below.
    const painted = this.paintedGround();
    if (painted) {
      ctx.drawImage(painted, TERRAIN_X, TERRAIN_Y, TERRAIN_W, TERRAIN_H);
      this.chapterDecor(ctx, rng);
      // 3D-rendered bushes and rocks scattered off the road, the wall line and the castle plaza.
      const img = this.propAtlas();
      const atlas = PROP_ATLAS[this.propTint()];
      if (img && atlas) {
        const items: { x: number; y: number; n: string; s: number }[] = [];
        for (let i = 0; i < 70; i++) {
          const x = 10 + next(rng) * (MAP_W - 20);
          const y = FOREST_Y - 20 + next(rng) * (MAP_H - FOREST_Y);
          if (Math.abs(x - 360) < 75 || Math.abs(y - WALL_Y) < 45 || Math.hypot(x - HALL.x, y - HALL.y) < 170) continue;
          if (x > 110 && x < 610 && y > WALL_Y + 40 && y < HALL.y + 60) continue; // keep the build area clear
          const rock = next(rng) < 0.4;
          items.push({ x, y, n: rock ? `rock${1 + (i % 3)}` : `bush${1 + (i % 3)}`, s: 0.55 + next(rng) * 0.35 });
        }
        // Undergrowth packed along both forest edges (clear of the lumber grove), so the clearing
        // meets the woods through a thicket rather than a hard line.
        for (let i = 0; i < 120; i++) {
          const left = i % 2 === 0;
          const d = Math.pow(next(rng), 1.6) * 55;
          const x = left ? d - 4 : MAP_W + 4 - d;
          const y = FOREST_Y + 10 + next(rng) * (MAP_H - FOREST_Y);
          if (Math.abs(y - WALL_Y) < 30) continue;
          if (GROVE.some((g) => Math.hypot(g.x - x, g.y - y) < 30)) continue;
          items.push({ x, y, n: next(rng) < 0.18 ? `rock${1 + (i % 3)}` : `bush${1 + (i % 3)}`, s: 0.6 + next(rng) * 0.5 });
        }
        items.sort((a, b) => a.y - b.y);
        for (const it of items) {
          const e = atlas[it.n];
          if (!e) continue;
          const [sx, sy, sw, sh, fx, fy] = e;
          const kk = CampRenderer.PROP_K * it.s;
          ctx.drawImage(img, sx, sy, sw, sh, it.x - fx * kk, it.y - fy * kk, sw * kk, sh * kk);
        }
      }
      // Canopy shade over the edge thickets (ground and bushes alike), deepening toward the woods.
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      for (const left of [true, false]) {
        const x0 = left ? TERRAIN_X : MAP_W - TERRAIN_X;
        const x1 = left ? 75 : MAP_W - 75;
        const gr = ctx.createLinearGradient(x0, 0, x1, 0);
        gr.addColorStop(0, "rgb(120,138,132)");
        gr.addColorStop(0.55, "rgb(196,208,200)");
        gr.addColorStop(1, "rgb(255,255,255)");
        ctx.fillStyle = gr;
        ctx.fillRect(Math.min(x0, x1), FOREST_Y - 40, Math.abs(x1 - x0), TERRAIN_Y + TERRAIN_H - FOREST_Y + 40);
      }
      ctx.restore();
      // The battlefield before the wall: scorch marks and the debris of past nights.
      {
        const decor = this.decorAtlas();
        const brng = createRng(9100 + this.mood);
        ctx.save();
        ctx.globalCompositeOperation = "multiply";
        for (let i = 0; i < 7; i++) {
          const x = 70 + next(brng) * (MAP_W - 140), y = FOREST_Y + 70 + next(brng) * (WALL_Y - FOREST_Y - 130);
          if (Math.abs(x - 360) < 60) continue;
          const r = 16 + next(brng) * 16;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, "rgb(128,108,86)");
          g.addColorStop(0.55, "rgb(190,176,156)");
          g.addColorStop(1, "rgba(255,255,255,1)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.ellipse(x, y, r * 1.4, r * 0.75, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        if (decor) {
          const kinds = ["arrows1", "arrows1", "spear1", "shield1"];
          const items: { x: number; y: number; n: string; s: number; flip: boolean }[] = [];
          for (let i = 0; i < 18; i++) {
            const x = 50 + next(brng) * (MAP_W - 100), y = FOREST_Y + 50 + next(brng) * (WALL_Y - FOREST_Y - 90);
            if (Math.abs(x - 360) < 48) continue;
            items.push({ x, y, n: kinds[i % kinds.length]!, s: 1.7 + next(brng) * 0.5, flip: next(brng) < 0.5 });
          }
          items.sort((a, b) => a.y - b.y);
          for (const it of items) {
            const e = DECOR_ATLAS[it.n];
            if (!e) continue;
            const [sx, sy, sw, sh, fx, fy] = e;
            const kk = 0.5 * it.s;
            ctx.save();
            ctx.translate(it.x, it.y);
            if (it.flip) ctx.scale(-1, 1);
            ctx.drawImage(decor, sx, sy, sw, sh, -fx * kk, -fy * kk, sw * kk, sh * kk);
            ctx.restore();
          }
        }
      }
      // A few fallen logs in the edge thickets.
      const decor = this.decorAtlas();
      const log = DECOR_ATLAS.log1;
      if (decor && log) {
        const [sx, sy, sw, sh, fx, fy] = log;
        for (const [x, y, s, flip] of FALLEN_LOGS) {
          if (GROVE.some((g) => Math.hypot(g.x - x, g.y - y) < 40)) continue;
          ctx.save();
          ctx.translate(x, y);
          if (flip) ctx.scale(-1, 1);
          ctx.drawImage(decor, sx, sy, sw, sh, -fx * 0.5 * s, -fy * 0.5 * s, sw * 0.5 * s, sh * 0.5 * s);
          ctx.restore();
        }
      }
      return cv;
    }
    ctx.fillStyle = this.ground[0];
    ctx.fillRect(TERRAIN_X, TERRAIN_Y, TERRAIN_W, TERRAIN_H);
    // Mottled grass: big soft patches of lighter and darker green.
    for (let i = 0; i < 260; i++) {
      const x = TERRAIN_X + next(rng) * TERRAIN_W;
      const y = TERRAIN_Y + next(rng) * TERRAIN_H;
      const r = 20 + next(rng) * 60;
      ctx.fillStyle = next(rng) > 0.5 ? this.ground[1] : "rgba(40,80,30,0.18)";
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Grass tufts.
    ctx.strokeStyle = "rgba(30,70,25,0.45)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 900; i++) {
      const x = TERRAIN_X + next(rng) * TERRAIN_W;
      const y = TERRAIN_Y + next(rng) * TERRAIN_H;
      ctx.beginPath();
      ctx.moveTo(x - 3, y);
      ctx.lineTo(x - 4, y - 5);
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 7);
      ctx.moveTo(x + 3, y);
      ctx.lineTo(x + 4, y - 5);
      ctx.stroke();
    }
    // Forest floor shadow.
    const fg = ctx.createLinearGradient(0, FOREST_Y - 160, 0, FOREST_Y + 60);
    fg.addColorStop(0, "rgba(15,40,15,0.55)");
    fg.addColorStop(1, "rgba(15,40,15,0)");
    ctx.fillStyle = fg;
    ctx.fillRect(TERRAIN_X, TERRAIN_Y, TERRAIN_W, FOREST_Y + 60 - TERRAIN_Y);
    // Trampled battlefield in front of the wall.
    ctx.fillStyle = "rgba(160,130,85,0.4)";
    ctx.beginPath();
    ctx.ellipse(360, WALL_Y - 70, 320, 90, 0, 0, Math.PI * 2);
    ctx.fill();
    // Dirt path: gate → hall, and a ring around the hall.
    ctx.fillStyle = "#c4a46e";
    ctx.strokeStyle = "#a88a58";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(325, WALL_Y);
    ctx.bezierCurveTo(320, 760, 330, 900, 320, HALL.y);
    ctx.lineTo(400, HALL.y);
    ctx.bezierCurveTo(390, 900, 400, 760, 395, WALL_Y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(HALL.x, HALL.y + 10, 130, 70, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#b09060";
    for (let i = 0; i < 70; i++) {
      const y = WALL_Y + next(rng) * (HALL.y - WALL_Y);
      ctx.beginPath();
      ctx.ellipse(335 + next(rng) * 50, y, 3 + next(rng) * 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Flowers and rocks scattered in the camp.
    const flowers = ["#ffffff", "#ffd84a", "#ff8ab0", "#b0a0ff"];
    for (let i = 0; i < 120; i++) {
      const x = 30 + next(rng) * (MAP_W - 60);
      const y = WALL_Y + 40 + next(rng) * (MAP_H - WALL_Y - 40);
      if (Math.abs(x - 360) < 60) continue;
      ctx.fillStyle = flowers[Math.floor(next(rng) * flowers.length)]!;
      for (let p = 0; p < 4; p++) {
        ctx.beginPath();
        ctx.arc(x + Math.cos((p * Math.PI) / 2) * 2.2, y + Math.sin((p * Math.PI) / 2) * 2.2, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    this.chapterDecor(ctx, rng);
    for (let i = 0; i < 26; i++) {
      const x = 20 + next(rng) * (MAP_W - 40);
      const y = FOREST_Y + next(rng) * (MAP_H - FOREST_Y);
      if (Math.abs(x - 360) < 70 || Math.abs(y - WALL_Y) < 50) continue;
      const r = 5 + next(rng) * 8;
      ctx.fillStyle = "#8a8a8a";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#a8a8a8";
      ctx.beginPath();
      ctx.ellipse(x - r * 0.25, y - r * 0.2, r * 0.45, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return cv;
  }

  private treeSprite(s: number, shade: number): HTMLCanvasElement {
    const key = `${s}|${shade > 0.5 ? 1 : 0}`;
    let sp = this.treeSprites.get(key);
    if (!sp) {
      sp = makeTreeSprite(s, shade > 0.5 ? 0.8 : 0.2, this.treeDpr);
      this.treeSprites.set(key, sp);
    }
    return sp;
  }

  /** Is any enemy (or the hero) standing behind this tree's canopy? */
  private hidesUnit(c: Camp, t: Tree): boolean {
    const top = t.y - 80 * t.s;
    const half = 28 * t.s;
    const behind = (x: number, y: number, r: number) => Math.abs(x - t.x) < half + r && y < t.y + r && y > top - r;
    if (!c.hero.dead && behind(c.hero.x, c.hero.y, 12)) return true;
    for (const e of c.enemies) if (behind(e.x, e.y, e.def.radius)) return true;
    return false;
  }

  /** Per-chapter ground decoration baked into the terrain. Avoids the path and the wall line. */
  private chapterDecor(ctx: CanvasRenderingContext2D, rng: ReturnType<typeof createRng>): void {
    const spot = (minY = FOREST_Y - 40) => {
      for (let tries = 0; tries < 20; tries++) {
        const x = 30 + next(rng) * (MAP_W - 60);
        const y = minY + next(rng) * (MAP_H - minY - 20);
        if (Math.abs(x - 360) < 80 || Math.abs(y - WALL_Y) < 60 || Math.hypot(x - HALL.x, y - HALL.y) < 150) continue;
        return { x, y };
      }
      return { x: 40, y: MAP_H - 40 };
    };
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    // 3D-rendered chapter decorations when the decor atlas is loaded.
    const decor = this.decorAtlas();
    const SETS: Record<number, [string, number][]> = {
      2: [["pond1", 9], ["deadtree1", 3]],
      3: [["crates1", 7], ["wheel1", 7]],
      4: [["gravestone1", 9], ["gravestone2", 7], ["deadtree1", 6]],
      5: [["burntstump1", 12], ["deadtree1", 3]],
      99: [["crystal1", 14]],
    };
    const set = SETS[this.mood];
    if (decor && set) {
      const items: { x: number; y: number; n: string; s: number }[] = [];
      for (const [n, count] of set)
        for (let i = 0; i < count; i++) {
          const { x, y } = spot();
          items.push({ x, y, n, s: 1.1 + next(rng) * 0.6 });
        }
      items.sort((a, b) => a.y - b.y);
      for (const it of items) {
        const e = DECOR_ATLAS[it.n];
        if (!e) continue;
        const [sx, sy, sw, sh, fx, fy] = e;
        const k = 0.5 * it.s;
        ctx.drawImage(decor, sx, sy, sw, sh, it.x - fx * k, it.y - fy * k, sw * k, sh * k);
        // Remember the water's centre and size so rain can ripple it.
        if (it.n.startsWith("gravestone")) this.graves.push({ x: it.x, y: it.y - sh * k * 0.3 });
        if (it.n === "crystal1") this.crystals.push({ x: it.x - fx * k + sw * k * 0.4, y: it.y - fy * k + sh * k * 0.25, s: it.s });
        if (it.n === "pond1") this.ponds.push({ x: it.x - fx * k + sw * k * 0.5, y: it.y - fy * k + sh * k * 0.55, rx: sw * k * 0.36, ry: sh * k * 0.26 });
      }
      return;
    }
    if (this.mood === 2) {
      for (let i = 0; i < 14; i++) {
        const { x, y } = spot();
        const r = 14 + next(rng) * 20;
        ctx.fillStyle = "#4a7a6a";
        ctx.beginPath();
        ctx.ellipse(x, y, r * 1.4, r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#5e9a8a";
        ctx.beginPath();
        ctx.ellipse(x - r * 0.2, y - r * 0.15, r * 0.9, r * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#6aaa50";
        ctx.beginPath();
        ctx.arc(x + r * 0.5, y, 4, 0.4, Math.PI * 2 - 0.4);
        ctx.fill();
        ctx.strokeStyle = "#3a6a2a";
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.moveTo(x - r * 1.3 + k * 3, y + 2);
          ctx.lineTo(x - r * 1.3 + k * 3 + (k - 1.5), y - 12 - k * 2);
          ctx.stroke();
        }
        ctx.strokeStyle = INK;
      }
    } else if (this.mood === 3) {
      ctx.strokeStyle = "rgba(90,70,40,0.35)";
      ctx.lineWidth = 5;
      for (const dx of [-140, -120, 120, 140]) {
        ctx.beginPath();
        ctx.moveTo(360 + dx, FOREST_Y - 40);
        ctx.bezierCurveTo(360 + dx * 1.2, 380, 360 + dx * 0.8, 460, 360 + dx * 0.6, WALL_Y - 30);
        ctx.stroke();
      }
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 18; i++) {
        const { x, y } = spot();
        const r = 8 + next(rng) * 12;
        ctx.fillStyle = "#7a746a";
        ctx.beginPath();
        ctx.moveTo(x - r, y + r * 0.4);
        ctx.lineTo(x - r * 0.6, y - r * 0.6);
        ctx.lineTo(x + r * 0.5, y - r * 0.7);
        ctx.lineTo(x + r, y + r * 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    } else if (this.mood === 4) {
      for (let i = 0; i < 16; i++) {
        const { x, y } = spot();
        ctx.fillStyle = "#8a8a92";
        ctx.beginPath();
        ctx.roundRect(x - 7, y - 16, 14, 18, [7, 7, 1, 1]);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "#5a5a62";
        ctx.beginPath();
        ctx.moveTo(x, y - 12);
        ctx.lineTo(x, y - 4);
        ctx.moveTo(x - 3, y - 9);
        ctx.lineTo(x + 3, y - 9);
        ctx.stroke();
        ctx.strokeStyle = INK;
      }
      ctx.strokeStyle = "#3a2a20";
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        const { x, y } = spot();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - 34);
        ctx.moveTo(x, y - 20);
        ctx.lineTo(x - 12, y - 30);
        ctx.moveTo(x, y - 26);
        ctx.lineTo(x + 10, y - 36);
        ctx.stroke();
      }
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = INK;
    } else if (this.mood === 5) {
      for (let i = 0; i < 14; i++) {
        const { x, y } = spot();
        const r = 12 + next(rng) * 14;
        ctx.fillStyle = "rgba(40,25,20,0.55)";
        ctx.beginPath();
        ctx.ellipse(x, y, r * 1.3, r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,120,40,0.7)";
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.arc(x + (next(rng) - 0.5) * r, y + (next(rng) - 0.5) * r * 0.5, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (this.mood === 99) {
      for (let i = 0; i < 14; i++) {
        const { x, y } = spot();
        ctx.fillStyle = "#9a6ad0";
        ctx.beginPath();
        ctx.moveTo(x, y - 18);
        ctx.lineTo(x + 6, y - 2);
        ctx.lineTo(x, y + 4);
        ctx.lineTo(x - 6, y - 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#c8a0ff";
        ctx.beginPath();
        ctx.moveTo(x, y - 18);
        ctx.lineTo(x + 2, y - 4);
        ctx.lineTo(x - 3, y - 3);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // ---- 3D-rendered environment props (pines, round trees, bushes, rocks) per chapter tint. ----
  private propImgs = new Map<string, HTMLImageElement>();
  private propCache = new Map<string, HTMLCanvasElement>();
  private propTint(): string {
    return ({ 2: "marsh", 3: "dry", 4: "night", 5: "autumn" } as Record<number, string>)[this.mood] ?? "summer";
  }
  private propAtlas(): HTMLImageElement | null {
    if (typeof Image === "undefined") return null;
    const tint = this.propTint();
    let img = this.propImgs.get(tint);
    if (!img) {
      img = new Image();
      img.onload = () => {
        this.terrain = null;
        this.propCache.clear();
      };
      img.src = `./sprites/props/${tint}.webp`;
      this.propImgs.set(tint, img);
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }
  /** World units per atlas pixel for props (atlas is 0.5 px per render px). */
  private static PROP_K = 0.25; // world units per atlas px (atlas holds 4 px per unit: sharp on 3x screens)
  /** A prop pre-rendered at on-screen density (1:1 blit each frame). Returns canvas + foot offset in world units. */
  private propSprite(name: string, s: number, depth = 0): { cv: HTMLCanvasElement; fx: number; fy: number; w: number; h: number } | null {
    const img = this.propAtlas();
    const e = PROP_ATLAS[this.propTint()]?.[name];
    if (!img || !e) return null;
    const [sx, sy, sw, sh, fx, fy] = e;
    const k = CampRenderer.PROP_K * s;
    const key = `${this.propTint()}|${name}|${s}|${this.treeDpr}|${depth}`;
    let cv = this.propCache.get(key);
    if (!cv) {
      cv = document.createElement("canvas");
      cv.width = Math.ceil(sw * k * this.treeDpr);
      cv.height = Math.ceil(sh * k * this.treeDpr);
      const g = cv.getContext("2d")!;
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      g.drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
      if (depth > 0) {
        // Aerial perspective: deeper trees darker and cooler, so the forest recedes.
        g.globalCompositeOperation = "source-atop";
        g.fillStyle = `rgba(16,34,40,${0.16 * depth})`;
        g.fillRect(0, 0, cv.width, cv.height);
      }
      this.propCache.set(key, cv);
    }
    return { cv, fx: fx * k, fy: fy * k, w: sw * k, h: sh * k };
  }

  private flyerImgs = new Map<string, HTMLImageElement>();
  /** 3D-rendered winged flyer (bat / dragon): wings flap about their roots (rotate + fold), body on top. */
  /** Flyers bank into their turns: a smoothed tilt from horizontal speed. */
  private bankMem = new Map<number, { x: number; b: number; t: number }>();
  private bankFor(id: number, x: number, max: number): number {
    let m = this.bankMem.get(id);
    if (!m) this.bankMem.set(id, (m = { x, b: 0, t: this.time }));
    const dt = Math.max(1e-3, this.time - m.t);
    if (dt > 0.2) { m.x = x; m.t = this.time; return m.b; }
    const target = Math.max(-max, Math.min(max, ((x - m.x) / dt) * 0.006));
    m.b += (target - m.b) * (1 - Math.exp(-dt * 6));
    m.x = x;
    m.t = this.time;
    if (this.bankMem.size > 300) this.bankMem.clear();
    return m.b;
  }

  private drawBat3d(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, flash: boolean, kind: "bat" | "dragon" = "bat", bank = 0): boolean {
    if (typeof Image === "undefined") return false;
    let img = this.flyerImgs.get(kind);
    if (!img) {
      img = new Image();
      img.src = `./sprites/props/${kind}.webp`;
      this.flyerImgs.set(kind, img);
    }
    if (!img.complete || img.naturalWidth === 0) return false;
    const A = kind === "bat" ? BAT_ATLAS : DRAGON_ATLAS;
    const [bsx, bsy, bw, bh] = A.body!;
    const [wsx, wsy, ww, wh, wpx, wpy] = A.wing!;
    const [px, py] = A.pivot!;
    const k = (r * (kind === "bat" ? 2.6 : 2.4)) / bh!;
    // Flap cycle: a quick, powerful downstroke (40%) and a slower recovery upstroke (60%) with the
    // wing partly folded; the body lifts on each downstroke and sinks on the recovery.
    const ph = ((t * (kind === "bat" ? 16 : 5)) / (Math.PI * 2)) % 1;
    const down = ph < 0.4;
    const u = down ? ph / 0.4 : (ph - 0.4) / 0.6;
    const e = u * u * (3 - 2 * u);
    const flap = down ? 1 - 2 * e : -1 + 2 * e; // +1 = wings up, -1 = wings down
    const spread = down ? 1 : 0.62 + 0.38 * Math.abs(1 - 2 * u); // folded mid-recovery
    const lift = (down ? -Math.sin(u * Math.PI) : Math.sin(u * Math.PI) * 0.6) * r * 0.12;
    ctx.save();
    ctx.translate(x, y + lift);
    ctx.rotate(bank);
    ctx.scale(k, k);
    ctx.translate(-px!, -py!);
    for (const side of [1, -1]) {
      ctx.save();
      ctx.translate(px!, py!);
      ctx.scale(side, 1);
      ctx.rotate(-flap * 0.42);
      ctx.scale(spread, 0.7 + 0.3 * Math.abs(flap));
      ctx.drawImage(img, wsx!, wsy!, ww!, wh!, -wpx!, -wpy!, ww!, wh!);
      ctx.restore();
    }
    ctx.drawImage(img, bsx!, bsy!, bw!, bh!, 0, 0, bw!, bh!);
    ctx.restore();
    if (flash) {
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath();
      ctx.arc(x, y, r * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    return true;
  }

  private drawWindowLight(ctx: CanvasRenderingContext2D, x: number, y: number, pts: [number, number][]): void {
    const k = this.night * this.night * (3 - 2 * this.night);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = k * (0.9 + Math.sin(this.time * 7.3 + x) * 0.05 + Math.sin(this.time * 19 + y) * 0.05);
    ctx.fillStyle = "rgb(255,170,64)";
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(x + px, y + py) : ctx.moveTo(x + px, y + py)));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** A 3D-rendered plaza prop standing on its foot; banners sway gently in the wind. */
  private drawPlazaProp(ctx: CanvasRenderingContext2D, img: HTMLImageElement, pp: PlazaProp, time: number): void {
    const e = DECOR_ATLAS[pp.n];
    if (!e) return;
    const [sx, sy, sw, sh, fx, fy] = e;
    const k = 0.5 * pp.s;
    ctx.save();
    ctx.translate(pp.x, pp.y);
    if (pp.flip) ctx.scale(-1, 1);
    if (pp.n === "banner1") {
      // Cloth ripple: the pole stays put; the cloth is drawn in vertical strips, each lifted and
      // dropped by a wave travelling away from the pole, growing toward the free edge.
      const pole = 7, strips = 14, sw0 = (sw - pole) / strips;
      ctx.drawImage(img, sx, sy, pole, sh, -fx * k, -fy * k, pole * k, sh * k);
      // A passing gust (the same one that sweeps the meadow) whips the cloth harder and faster.
      const gust = Math.abs(this.gustAt(pp.x));
      // Phase is accumulated (not time × rate) so speeding up in a gust never makes the cloth jump.
      const bp = this.bannerPhase.get(pp.x) ?? { ph: time * 3.1, t: time };
      bp.ph += Math.min(0.1, Math.max(0, time - bp.t)) * (3.1 + gust * 3);
      bp.t = time;
      this.bannerPhase.set(pp.x, bp);
      const t = bp.ph + pp.x * 0.05;
      for (let i = 0; i < strips; i++) {
        const kk = (i + 0.5) / strips;
        const dy = (Math.sin(t - kk * 3.4) * 1.6 + Math.sin(t * 0.43 - kk * 1.7) * 0.7) * kk * (1 + gust * 2.2);
        const x0 = sx + pole + i * sw0;
        ctx.drawImage(img, x0, sy, sw0 + 0.6, sh, (-fx + pole + i * sw0) * k, (-fy + dy) * k, (sw0 + 0.6) * k, sh * k);
      }
    } else ctx.drawImage(img, sx, sy, sw, sh, -fx * k, -fy * k, sw * k, sh * k);
    if (pp.n === "lantern1" && this.night > 0.02) {
      // Warm, softly flickering halo round the lantern glass after dark.
      const fl = 0.85 + Math.sin(time * 9 + pp.x) * 0.08 + Math.sin(time * 23 + pp.y) * 0.05;
      ctx.globalCompositeOperation = "lighter";
      this.drawBlob(ctx, this.emberBlob(), 5.8 * pp.s, -20.5 * pp.s, 7 * pp.s * fl, 7 * pp.s * fl, this.night * 0.8);
      // A small live flame inside the glass.
      const k = this.night * this.night * (3 - 2 * this.night);
      const flame = this.blob("flame", [[0, "rgba(255,240,170,1)"], [0.4, "rgba(255,150,40,0.85)"], [1, "rgba(255,90,20,0)"]]);
      const lick = 0.5 + 0.5 * Math.sin(time * 11 + pp.x);
      this.drawBlob(ctx, flame, 5.8 * pp.s + Math.sin(time * 7 + pp.y) * 0.4, -20 * pp.s - lick * 1.2, 1.6 * pp.s, (2.4 + lick) * pp.s, k);
      this.drawBlob(ctx, this.glintBlob(), 5.8 * pp.s, -19.6 * pp.s, 0.9 * pp.s, 1.2 * pp.s, k);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.restore();
  }

  private decorImg: HTMLImageElement | null = null;
  private decorAtlas(): HTMLImageElement | null {
    if (typeof Image === "undefined") return null;
    if (!this.decorImg) {
      this.decorImg = new Image();
      this.decorImg.onload = () => {
        this.terrain = null;
      };
      this.decorImg.src = "./sprites/props/decor.webp";
    }
    return this.decorImg.complete && this.decorImg.naturalWidth > 0 ? this.decorImg : null;
  }

  private wallImg: HTMLImageElement | null = null;
  /** Draw one wall segment from the 3D-rendered wall atlas; false while it loads. */
  private drawWallPiece(ctx: CanvasRenderingContext2D, c: Camp, i: number, x0: number, frac: number, gate: boolean): boolean {
    if (typeof Image === "undefined") return false;
    if (!this.wallImg) {
      this.wallImg = new Image();
      this.wallImg.src = "./sprites/props/wall.webp";
    }
    const img = this.wallImg;
    if (!img.complete || img.naturalWidth === 0) return false;
    const dmg = Math.min(2, Math.floor((1 - frac) * 3));
    let name: string;
    if (gate) name = c.wallLevel >= 2 ? (i === GATE_SEGMENTS[0] ? "gate_stone" : "gate_stone_r") : "gate";
    else if (c.wallLevel >= 3) name = "wall_stone2";
    else if (c.wallLevel >= 2) name = "wall_stone";
    else name = (c.wallLevel >= 1 ? "wall_band" : "wall_log") + (dmg > 0 ? `_d${dmg}` : "");
    const e = WALL_ATLAS[name];
    if (!e) return false;
    const [sx, sy, sw, sh, fx, fy] = e;
    const k = 0.5; // world units per atlas px
    const ky = k * 1.3; // a touch taller than true scale so the wall reads against the characters
    ctx.drawImage(img, sx, sy, sw, sh, x0 + SEGMENT_W / 2 - fx * k, WALL_Y + 8 - fy * ky, sw * k, sh * ky);
    // Stone and gates show damage as cracks + darkening rather than missing logs.
    if ((c.wallLevel >= 2 || gate) && frac < 0.7) {
      const d = 1 - frac / 0.7;
      ctx.fillStyle = `rgba(30,20,10,${0.25 * d})`;
      ctx.fillRect(x0 + 2, WALL_Y - 28, SEGMENT_W - 4, 36);
      ctx.strokeStyle = `rgba(20,14,8,${0.5 + 0.4 * d})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      const cx = x0 + 18 + ((i * 13) % 24);
      ctx.moveTo(cx, WALL_Y - 24);
      ctx.lineTo(cx + 5, WALL_Y - 14);
      ctx.lineTo(cx - 3, WALL_Y - 6);
      if (d > 0.5) {
        ctx.moveTo(cx + 5, WALL_Y - 14);
        ctx.lineTo(cx + 14, WALL_Y - 10);
      }
      ctx.stroke();
    }
    return true;
  }

  /** Meadow chickens: wander between pecking spots, scatter (flapping) when the King comes close. */
  private chickens: { x: number; y: number; tx: number; ty: number; until: number; peck: boolean; flee: number; flip: boolean; step: number; n: number; seed: number }[] = [];
  private chickenT = 0;
  private updateChickens(c: Camp): void {
    const dt = Math.min(0.05, Math.max(0, this.time - this.chickenT));
    this.chickenT = this.time;
    const box = { x0: 130, x1: 590, y0: WALL_Y + 150, y1: HALL.y - 170 };
    const hsh = (n: number): number => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); };
    if (!this.chickens.length)
      for (let i = 0; i < 4; i++) {
        const x = box.x0 + hsh(i + 1) * (box.x1 - box.x0), y = box.y0 + hsh(i + 7) * (box.y1 - box.y0);
        this.chickens.push({ x, y, tx: x, ty: y, until: 0, peck: true, flee: 0, flip: false, step: 0, n: i * 13, seed: i * 1.7 });
      }
    const h = c.hero;
    for (const ch of this.chickens) {
      const dh = Math.hypot(ch.x - h.x, ch.y - h.y);
      if (!h.dead && dh < 55) {
        // Scatter away from the King.
        const ax = (ch.x - h.x) / (dh || 1), ay = (ch.y - h.y) / (dh || 1);
        ch.tx = Math.max(box.x0, Math.min(box.x1, ch.x + ax * 90));
        ch.ty = Math.max(box.y0, Math.min(box.y1, ch.y + ay * 60));
        ch.flee = 0.6;
        ch.peck = false;
      }
      ch.flee = Math.max(0, ch.flee - dt);
      const dx = ch.tx - ch.x, dy = ch.ty - ch.y, d = Math.hypot(dx, dy);
      if (d > 1.5) {
        const sp = ch.flee > 0 ? 85 : 20;
        const m = Math.min(d, sp * dt);
        ch.x += (dx / d) * m;
        ch.y += (dy / d) * m;
        ch.step += m;
        if (Math.abs(dx) > 0.5) ch.flip = dx > 0;
        ch.peck = false;
      } else if (!ch.peck) {
        ch.peck = true;
        ch.until = this.time + 1.2 + hsh(++ch.n) * 2.5;
      } else if (this.time > ch.until) {
        ch.tx = Math.max(box.x0, Math.min(box.x1, ch.x + (hsh(++ch.n) - 0.5) * 120));
        ch.ty = Math.max(box.y0, Math.min(box.y1, ch.y + (hsh(++ch.n) - 0.5) * 70));
      }
    }
  }
  private drawChicken(ctx: CanvasRenderingContext2D, ch: { x: number; y: number; peck: boolean; flee: number; flip: boolean; step: number; seed: number }): void {
    const fade = Math.max(0, 1 - this.night / 0.6);
    if (fade <= 0) return;
    const walking = !ch.peck;
    const hop = walking ? Math.abs(Math.sin(ch.step * 0.5)) * (ch.flee > 0 ? 3 : 1.2) : 0;
    // Pecking: quick head dips in little bursts.
    const pk = ch.peck ? Math.max(0, Math.sin(this.time * 14 + ch.seed * 5)) * (Math.sin(this.time * 1.7 + ch.seed) > 0 ? 1 : 0) : 0;
    ctx.save();
    ctx.globalAlpha *= fade;
    softShadow(ctx, ch.x, ch.y + 1, 7.5, 2.6, 0.3);
    ctx.translate(ch.x, ch.y - hop);
    ctx.scale(ch.flip ? -1.4 : 1.4, 1.4);
    ctx.lineCap = "round";
    // Legs (scissoring while walking).
    const lg = walking ? Math.sin(ch.step * 0.5) * 1.8 : 0;
    ctx.strokeStyle = "#e0a030";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-0.5, -3); ctx.lineTo(-1 + lg, 0);
    ctx.moveTo(1, -3); ctx.lineTo(1.5 - lg, 0);
    ctx.stroke();
    // Body + tail.
    ctx.fillStyle = "#3a2a20";
    ctx.beginPath(); ctx.ellipse(0.4, -5.6, 4.9, 3.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f6f1e6";
    ctx.beginPath(); ctx.ellipse(0.4, -5.8, 4.4, 3.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(3.6, -7.5); ctx.lineTo(6, -10); ctx.lineTo(5.2, -6); ctx.closePath(); ctx.fill();
    // Wing (flaps while fleeing).
    const flap = ch.flee > 0 ? Math.sin(this.time * 40) * 0.7 : 0;
    ctx.save();
    ctx.translate(1.2, -6.2);
    ctx.rotate(-0.2 - Math.max(0, flap) * 1.6);
    ctx.fillStyle = "#e6dfcf";
    ctx.beginPath(); ctx.ellipse(0.8, 0, 2.6, 1.6, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // Head (dips when pecking), comb, beak, eye.
    const hx = -3.8, hy = -8.6 + pk * 5;
    ctx.fillStyle = "#f6f1e6";
    ctx.beginPath(); ctx.arc(hx, hy, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e0402a";
    ctx.beginPath(); ctx.ellipse(hx + 0.2, hy - 2.1, 1.3, 0.9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx - 0.9, hy + 1.4, 0.6, 0.9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f0a030";
    ctx.beginPath(); ctx.moveTo(hx - 2, hy - 0.4); ctx.lineTo(hx - 3.7, hy + 0.2); ctx.lineTo(hx - 2, hy + 0.8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#1a1410";
    ctx.beginPath(); ctx.arc(hx - 0.7, hy - 0.4, 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /** Strength (0..1) of the travelling wind gust at world x right now: a band rolling in from the
   *  left every 9 s, 140 units wide, with a springy lag behind the front (trees overshoot back). */
  gustAt(wx: number): number {
    if (!(this.mood === 1 || this.mood === 2 || this.mood === 5)) return 0;
    const P = 9, gt = this.time - Math.floor(this.time / P) * P;
    if (gt >= 3.6) return 0;
    const front = -150 + (gt / 3) * (MAP_W + 300);
    const behind = front - wx; // how far the front has passed this x
    if (behind < 0 || behind > 260) return 0;
    if (behind < 140) return Math.sin((behind / 140) * Math.PI * 0.5) ** 2 * (1 - behind / 400);
    const k = (behind - 140) / 120; // release: swing back past upright and settle
    return Math.cos(k * Math.PI * 1.5) * (1 - k) * 0.65;
  }

  private drawTree(ctx: CanvasRenderingContext2D, t: Tree, seeThrough = false): void {
    // Depth bucket: 0 at the forest's front edge, up to 3 deep in the woods.
    const depth = t.y < FOREST_Y ? Math.min(3, Math.max(0, Math.floor((FOREST_Y + 20 - t.y) / 70))) : 0;
    const p = this.propSprite(t.v, t.s, depth);
    if (p) {
      if (seeThrough) ctx.globalAlpha = 0.35;
      // Wind: the crown leans from the base in a gust that travels across the map.
      // Gusts that sweep the meadow (see drawDayLife) push the crowns over as they pass, then the
      // trees spring back.
      const sway = Math.sin(this.time * 1.25 + t.x * 0.021 + t.y * 0.013) * 0.035 + Math.sin(this.time * 2.9 + t.x * 0.05) * 0.008 - this.gustAt(t.x) * 0.07;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.transform(1, 0, sway, 1, 0, 0);
      ctx.drawImage(p.cv, -p.fx, -p.fy, p.w, p.h);
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }
    const sprite = this.treeSprite(t.s, t.shade);
    const w = sprite.width / this.treeDpr;
    const h = sprite.height / this.treeDpr;
    if (seeThrough) ctx.globalAlpha = 0.35;
    ctx.drawImage(sprite, Math.round(t.x - w / 2), Math.round(t.y - h + 10 * t.s), w, h);
    ctx.globalAlpha = 1;
  }

  private drawWall(ctx: CanvasRenderingContext2D, c: Camp): void {
    // The wall casts a soft shadow onto the camp side (light comes from the top-left).
    const band = ctx.createLinearGradient(0, WALL_Y + 4, 0, WALL_Y + 26);
    band.addColorStop(0, "rgba(10,14,30,0.30)");
    band.addColorStop(1, "rgba(10,14,30,0)");
    ctx.fillStyle = band;
    for (let i = 0; i < SEGMENTS; i++) if (c.segments[i]!.hp > 0) ctx.fillRect(i * SEGMENT_W + 6, WALL_Y + 4, SEGMENT_W, 22);
    for (let i = 0; i < SEGMENTS; i++) {
      const s = c.segments[i]!;
      const hitT = this.time - (this.segHitAt[i] ?? -9);
      // A blow rattles the segment with a damped shake that rings out (instead of a buzz that cuts
      // off), knocks it back toward the camp a little, and squashes it at the base for a beat.
      const ring = hitT < 0.4 ? Math.exp(-hitT * 11) : 0;
      const x0 = i * SEGMENT_W + Math.sin(hitT * 75) * 2.4 * ring;
      const push = ring * 2.2 * Math.cos(hitT * 30);
      const squash = ring * 0.05 * Math.max(0, Math.cos(hitT * 40));
      const frac = s.hp / s.maxHp;
      const gate = GATE_SEGMENTS.includes(i);
      if (s.hp <= 0) {
        // Rubble.
        ctx.fillStyle = "#6a5034";
        for (let k = 0; k < 6; k++) ctx.fillRect(x0 + 4 + k * 9, WALL_Y + 2 + ((k * 5) % 7), 7, 4);
        continue;
      }
      ctx.save();
      ctx.translate(x0 + SEGMENT_W / 2, WALL_Y + 8 + push);
      ctx.scale(1 + squash * 0.5, 1 - squash);
      ctx.translate(-(x0 + SEGMENT_W / 2), -(WALL_Y + 8));
      const drewPiece = this.drawWallPiece(ctx, c, i, x0, frac, gate);
      ctx.restore();
      // Battlements (fully fortified): royal banners hang from the wall face, swaying gently.
      if (c.wallLevel >= 3 && gate && frac > 0.25) {
        // Hung on the gate pillar (left pillar for the left gate leaf, right for the right).
        const left = i === GATE_SEGMENTS[0];
        const bx = left ? x0 + 3 : x0 + SEGMENT_W - 3, by = WALL_Y - 34;
        const sw = Math.sin(this.time * 1.8 + i * 1.3) * 1.6;
        ctx.save();
        ctx.fillStyle = INK;
        ctx.fillRect(bx - 8, by - 1.5, 16, 3);
        ctx.beginPath();
        ctx.moveTo(bx - 6.5, by);
        ctx.lineTo(bx + 6.5, by);
        ctx.lineTo(bx + 6.5 + sw, by + 16);
        ctx.lineTo(bx + sw * 0.6, by + 12);
        ctx.lineTo(bx - 6.5 + sw, by + 16);
        ctx.closePath();
        ctx.fillStyle = "#3d6aa8";
        ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = "#ffd84a";
        ctx.fillRect(bx - 6.5, by + 1.5, 13, 1.6);
        ctx.beginPath();
        ctx.moveTo(bx - 3 + sw * 0.4, by + 9); ctx.lineTo(bx - 3 + sw * 0.4, by + 5.5); ctx.lineTo(bx - 1.5 + sw * 0.4, by + 7);
        ctx.lineTo(bx + sw * 0.4, by + 5); ctx.lineTo(bx + 1.5 + sw * 0.4, by + 7); ctx.lineTo(bx + 3 + sw * 0.4, by + 5.5); ctx.lineTo(bx + 3 + sw * 0.4, by + 9);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      if (drewPiece) {
        // 3D-rendered piece drawn.
      } else if (gate) {
        // Heavy timber doors: each plank lit on its left, a darker recess at the bottom,
        // iron bands with a bright upper edge and rivets catching the light.
        for (let k = 0; k < 4; k++) {
          const px = x0 + k * 15;
          const plank = ctx.createLinearGradient(px, 0, px + 15, 0);
          plank.addColorStop(0, "#9a6a3a");
          plank.addColorStop(0.5, "#7a5230");
          plank.addColorStop(1, "#56381c");
          ctx.fillStyle = plank;
          ctx.fillRect(px, WALL_Y - 26, 15, 34);
        }
        const recess = ctx.createLinearGradient(0, WALL_Y - 26, 0, WALL_Y + 8);
        recess.addColorStop(0, "rgba(255,230,190,0.18)");
        recess.addColorStop(0.5, "rgba(0,0,0,0)");
        recess.addColorStop(1, "rgba(20,10,0,0.35)");
        ctx.fillStyle = recess;
        ctx.fillRect(x0, WALL_Y - 26, SEGMENT_W, 34);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 2;
        ctx.strokeRect(x0, WALL_Y - 26, SEGMENT_W, 34);
        ctx.fillStyle = "rgba(40,24,10,0.6)";
        for (let k = 1; k < 4; k++) ctx.fillRect(x0 + k * 15 - 1, WALL_Y - 26, 2, 34);
        for (const by of [WALL_Y - 18, WALL_Y - 2]) {
          ctx.fillStyle = "#33363e";
          ctx.fillRect(x0, by, SEGMENT_W, 4.5);
          ctx.fillStyle = "rgba(220,226,240,0.55)";
          ctx.fillRect(x0, by, SEGMENT_W, 1.2);
          ctx.fillStyle = "#d8dce6";
          for (let k = 0; k < 4; k++) ctx.fillRect(x0 + k * 15 + 6, by + 1.5, 2, 2);
        }
        if (c.wallLevel >= 2) {
          // Stone gatehouse pillars.
          ctx.fillStyle = "#a8a29a";
          ctx.fillRect(x0 + (i === GATE_SEGMENTS[0] ? 0 : SEGMENT_W - 10), WALL_Y - 40, 10, 50);
          ctx.strokeRect(x0 + (i === GATE_SEGMENTS[0] ? 0 : SEGMENT_W - 10), WALL_Y - 40, 10, 50);
        }
      } else if (c.wallLevel >= 2) {
        stoneSegment(ctx, x0, frac, i, c.wallLevel >= 3);
      } else {
        // Sharpened log stakes; missing stakes show damage.
        const stakes = 6;
        const missing = Math.floor((1 - frac) * 3);
        for (let k = 0; k < stakes; k++) {
          if (k % 2 === 1 && k / 2 < missing) continue;
          const sx = x0 + k * 10 + 5;
          const top = WALL_Y - 30 + ((k * 7 + i * 3) % 5);
          // A round log: lit on the left, falling into shade on the right (shared top-left light).
          const log = ctx.createLinearGradient(sx - 5, 0, sx + 5, 0);
          const tone = k % 2 ? ["#c08a52", "#9a6a3a", "#5e3c1c"] : ["#b07c46", "#8a5a2e", "#523418"];
          log.addColorStop(0, tone[0]!);
          log.addColorStop(0.45, tone[1]!);
          log.addColorStop(1, tone[2]!);
          ctx.fillStyle = log;
          ctx.beginPath();
          ctx.moveTo(sx - 5, WALL_Y + 8);
          ctx.lineTo(sx - 5, top + 6);
          ctx.lineTo(sx, top);
          ctx.lineTo(sx + 5, top + 6);
          ctx.lineTo(sx + 5, WALL_Y + 8);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = OUTLINE;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          // Freshly cut point: pale wood facing the light.
          ctx.fillStyle = "#e8c890";
          ctx.beginPath();
          ctx.moveTo(sx - 4, top + 5.5);
          ctx.lineTo(sx, top + 1);
          ctx.lineTo(sx + 0.5, top + 6);
          ctx.closePath();
          ctx.fill();
        }
        // Cross beam with a lit top edge.
        ctx.fillStyle = "#5e3c1c";
        ctx.fillRect(x0, WALL_Y - 12, SEGMENT_W, 5);
        ctx.fillStyle = "rgba(255,220,170,0.35)";
        ctx.fillRect(x0, WALL_Y - 12, SEGMENT_W, 1.3);
        if (c.wallLevel >= 1) {
          // Iron bands with rivets.
          ctx.fillStyle = "#4a4e58";
          ctx.fillRect(x0, WALL_Y - 22, SEGMENT_W, 4);
          ctx.fillRect(x0, WALL_Y - 2, SEGMENT_W, 4);
          ctx.fillStyle = "#c8ccd4";
          for (let k = 0; k < 6; k++) {
            ctx.fillRect(x0 + k * 10 + 4, WALL_Y - 21, 2, 2);
            ctx.fillRect(x0 + k * 10 + 4, WALL_Y - 1, 2, 2);
          }
        }
      }
      if (hitT < 0.15) {
        ctx.fillStyle = `rgba(255,60,40,${(0.45 * (1 - hitT / 0.15)).toFixed(2)})`;
        ctx.fillRect(x0, WALL_Y - 34, SEGMENT_W, 44);
      }
      if (frac < 1) {
        ctx.fillStyle = "rgba(20,10,5,0.75)";
        ctx.fillRect(x0 + 8, WALL_Y + 12, SEGMENT_W - 16, 4);
        ctx.fillStyle = frac > 0.5 ? "#9be04a" : frac > 0.25 ? "#e0c341" : "#e0503a";
        ctx.fillRect(x0 + 8, WALL_Y + 12, (SEGMENT_W - 16) * frac, 4);
      }
    }
    void WALL_THICK;
  }

  private drawIncome(ctx: CanvasRenderingContext2D, c: Camp): void {
    const { x, y } = INCOME_PILE;
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 26, y - 22, 52, 44);
    ctx.setLineDash([]);
    this.coinStack(ctx, x - 8, y + 10, Math.min(15, Math.ceil(c.incomePile / 2)));
    this.coinStack(ctx, x + 10, y + 12, Math.min(15, Math.floor(c.incomePile / 2)));
  }

  /** When each coin of a stack (keyed by its x) landed, so new coins drop in rather than appear. */
  private stackLanded = new Map<number, number[]>();
  private coinStack(ctx: CanvasRenderingContext2D, x: number, y: number, n: number): void {
    let landed = this.stackLanded.get(x);
    if (!landed) { landed = []; this.stackLanded.set(x, landed); }
    // New coins are staggered so a batch patters down one after another.
    while (landed.length < n) landed.push(Math.max(this.time, (landed.at(-1) ?? 0) + 0.06) + (this.time < 1 ? -9 : 0));
    landed.length = Math.max(0, n);
    if (n <= 0) return;
    softShadow(ctx, x + 1, y + 2, 9, 3.4, 0.3);
    // Shaded coins (same as the King's carried stack), each nudged a little so the pile looks
    // hand-stacked rather than machined; a glint travels up the stack now and then. A new coin
    // falls onto the top, bounces once and settles.
    for (let i = 0; i < n; i++) {
      const jx = Math.sin(i * 2.7 + x) * 0.9;
      const age = this.time - landed[i]!;
      if (age < 0) break;
      let dy = 0;
      if (age < 0.12) { const u = age / 0.12; dy = -(1 - u * u) * 16; }
      else if (age < 0.26) { const u = (age - 0.12) / 0.14; dy = -Math.sin(u * Math.PI) * 3; }
      ctx.drawImage(this.stackCoin(i % 2), x + jx - 7.5, y - i * 3 - 3.5 + dy, 15, 8);
      if (age >= 0.12 && age < 0.3) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        this.drawBlob(ctx, this.glintBlob(), x + jx, y - i * 3, 6 + (age - 0.12) * 40, 2.5, (0.3 - age) * 3);
        ctx.restore();
      }
    }
    const g = (this.time * 0.6 + x * 0.01) % 2.2;
    if (g < 1) {
      const gi = Math.floor(g * n);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      this.drawBlob(ctx, this.glintBlob(), x - 3, y - gi * 3 - 1, 5, 2.5, Math.sin(g * Math.PI) * 0.7);
      ctx.restore();
    }
  }

  private pads = new Map<number, HTMLCanvasElement>();
  /** A flagstone foundation pad (bevelled stones, mortar gaps, soft contact shadow), cached per size. */
  private padSprite(half: number): HTMLCanvasElement {
    const key = Math.round(half);
    let cv = this.pads.get(key);
    if (cv) return cv;
    const S = 3;
    const W = (half * 2 + 12) * S, H = (half * 2 + 14) * S;
    cv = document.createElement("canvas");
    cv.width = Math.ceil(W);
    cv.height = Math.ceil(H);
    const g = cv.getContext("2d")!;
    g.scale(S, S);
    const w = half * 2 + 12, h = half * 2 + 14;
    // Contact shadow.
    g.fillStyle = "rgba(20,24,10,0.28)";
    g.beginPath();
    g.ellipse(w / 2 + 3, h / 2 + 5, w / 2, h / 2 - 3, 0, 0, Math.PI * 2);
    g.fill();
    // Mortar bed.
    g.fillStyle = "#6a6458";
    g.beginPath();
    g.roundRect(3, 2, w - 6, h - 8, 12);
    g.fill();
    // Flagstones on a 3x3 jittered grid, each bevelled (lit top-left, dark bottom-right).
    const rng = createRng(key * 31 + 7);
    const n = 3, cw = (w - 12) / n, ch = (h - 16) / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const x = 6 + i * cw + next(rng) * 1.5, y = 5 + j * ch + next(rng) * 1.5;
        const sw = cw - 2.5 - next(rng) * 1.5, sh = ch - 2.5 - next(rng) * 1.5;
        const tone = 150 + Math.floor(next(rng) * 30);
        g.fillStyle = `rgb(${tone - 30},${tone - 32},${tone - 40})`;
        g.beginPath();
        g.roundRect(x, y + 1.2, sw, sh, 3);
        g.fill();
        const grd = g.createLinearGradient(x, y, x + sw, y + sh);
        grd.addColorStop(0, `rgb(${tone + 22},${tone + 20},${tone + 12})`);
        grd.addColorStop(1, `rgb(${tone - 12},${tone - 14},${tone - 22})`);
        g.fillStyle = grd;
        g.beginPath();
        g.roundRect(x, y, sw, sh, 3);
        g.fill();
        // A hairline crack on some stones.
        if (next(rng) > 0.6) {
          g.strokeStyle = "rgba(60,56,48,0.6)";
          g.lineWidth = 0.6;
          g.beginPath();
          g.moveTo(x + sw * 0.2, y + sh * 0.3);
          g.lineTo(x + sw * 0.5, y + sh * 0.55);
          g.lineTo(x + sw * 0.7, y + sh * 0.5);
          g.stroke();
        }
      }
    // Grass creeping over the pad edges.
    g.strokeStyle = "rgba(70,130,50,0.9)";
    g.lineWidth = 1;
    for (let k = 0; k < 26; k++) {
      const a = next(rng) * Math.PI * 2;
      const ex = w / 2 + Math.cos(a) * (w / 2 - 4), ey = h / 2 - 3 + Math.sin(a) * (h / 2 - 6);
      g.beginPath();
      g.moveTo(ex, ey);
      g.lineTo(ex + (next(rng) - 0.5) * 3, ey - 3 - next(rng) * 3);
      g.stroke();
    }
    this.pads.set(key, cv);
    return cv;
  }

  /** Per-plot UI easing: how "stood-on" it is (eased), and when it last became affordable / ticked down. */
  private plotUi = new Map<string, { near: number; aff: boolean; affAt: number; label: string; labelAt: number }>();
  private plotUiT = 0;
  private drawPlots(ctx: CanvasRenderingContext2D, c: Camp): void {
    const h = c.hero;
    const pdt = Math.min(0.05, Math.max(0, this.time - this.plotUiT));
    this.plotUiT = this.time;
    for (const p of c.plots) {
      // A fully upgraded workshop shows a small gold "★ MAX" ribbon where its price plate was.
      if (plotMaxed(p) && !p.locked && (p.kind === "lumber" || p.kind === "forge" || p.kind === "catapult" || p.kind === "barracks" || p.kind === "mage" || p.kind === "healer")) {
        const bob = Math.sin(this.time * 2 + p.x * 0.05) * 1;
        const ribbon = (ctx: CanvasRenderingContext2D): void => {
        ctx.save();
        ctx.translate(p.x, p.y + 46 + bob);
        ctx.font = `900 10px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const w = ctx.measureText("★ MAX").width + 14;
        const g = ctx.createLinearGradient(0, -8, 0, 8);
        g.addColorStop(0, "#ffe98a"); g.addColorStop(1, "#e0a02a");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.roundRect(-w / 2, -8, w, 16, 8); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = "#3a1e06";
        ctx.fillText("★ MAX", 0, 0.5);
        ctx.restore();
        };
        // Like the price plates: above the darkness at night.
        if (this.night > 0.3) {
          const m = ctx.getTransform();
          this.lateBars.push((ctx) => { ctx.save(); ctx.setTransform(m); ribbon(ctx); ctx.restore(); });
        } else ribbon(ctx);
      }
      if (plotMaxed(p) || p.locked) continue;
      const near = !h.dead && this.nearPlot(h, p);
      const built = (p.kind === "tower" || p.kind === "lumber" || p.kind === "forge" || p.kind === "catapult" || p.kind === "barracks" || p.kind === "mage" || p.kind === "healer") && p.level > 0;
      const half = built ? CAMP.plotHalf * 0.8 : CAMP.plotHalf;
      const cost = plotCost(p);
      const logCost = plotLogCost(p);
      const affordable = h.coins >= cost - p.paid && h.logs >= logCost - p.paidLogs;
      if (p.kind === "repair" && !repairNeeded(c)) {
        this.drawIdleRepair(ctx, p);
        continue;
      }
      // Stepping on/off eases the highlight in and out instead of snapping it.
      let ui = this.plotUi.get(p.id);
      if (!ui) { ui = { near: 0, aff: affordable, affAt: -9, label: `${cost - p.paid}`, labelAt: -9 }; this.plotUi.set(p.id, ui); }
      ui.near += ((near ? 1 : 0) - ui.near) * (1 - Math.exp(-pdt * 14));
      if (ui.near > 0.02 && p.kind === "tower") this.drawRangePreview(ctx, c, p, ui.near);
      if (affordable && !ui.aff) ui.affAt = this.time;
      ui.aff = affordable;
      const pulse = 1 + Math.sin(this.time * 10) * 0.05 * ui.near + ui.near * 0.03;
      ctx.save();
      // Upgrade plates you can't afford yet recede (the camp mid-game was a wall of prices); they
      // come back to full strength when affordable or when the King walks up to them.
      if (built && !affordable) ctx.globalAlpha = 0.45 + 0.55 * ui.near;
      ctx.translate(p.x, p.y + (built ? 46 : 0));
      ctx.scale(pulse, pulse);
      // Stone foundation pad under empty plots (a real building site, not just a dashed box).
      if (!built) ctx.drawImage(this.padSprite(half), -half - 6, -half - 4, half * 2 + 12, half * 2 + 14);
      // Plate.
      ctx.fillStyle = near ? "rgba(255,236,160,0.28)" : built ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)";
      ctx.beginPath();
      ctx.roundRect(-half, -half * (built ? 0.55 : 1), half * 2, half * (built ? 1.1 : 2), 10);
      ctx.fill();
      // Progress fill (bottom-up).
      const prog = (p.paid + p.paidLogs) / (cost + logCost);
      if (prog > 0) {
        ctx.save();
        ctx.clip();
        const hgt = half * (built ? 1.1 : 2);
        const top = -half * (built ? 0.55 : 1);
        ctx.fillStyle = "rgba(255,200,60,0.55)";
        ctx.fillRect(-half, top + hgt * (1 - prog), half * 2, hgt * prog);
        ctx.restore();
      }
      ctx.strokeStyle = near ? "#ffe08a" : affordable ? "rgba(255,240,190,0.95)" : "rgba(255,255,255,0.6)";
      ctx.setLineDash([9, 6]);
      ctx.lineDashOffset = -this.time * (near ? 40 : 14);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (!built) {
        // Construction rising as it's paid for: corner posts grow up out of the pad, a cross-brace
        // and a top rail appear part-way, and a rope swings between the posts.
        if (prog > 0.02) {
          const grow = (k: number): number => Math.max(0, Math.min(1, (prog - k) / 0.35));
          const H = half * 1.5;
          const posts: [number, number, number][] = [[-half + 6, half - 6, 0], [half - 6, half - 6, 0.08], [-half + 9, -half + 12, 0.16], [half - 9, -half + 12, 0.24]];
          ctx.save();
          ctx.lineCap = "round";
          for (const [px, py, k] of posts) {
            const g = grow(k);
            if (g <= 0) continue;
            const e = 1 - (1 - g) ** 3; // posts shoot up then settle
            ctx.strokeStyle = INK; ctx.lineWidth = 4.5;
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - H * e); ctx.stroke();
            ctx.strokeStyle = "#b07a40"; ctx.lineWidth = 2.6; ctx.stroke();
            ctx.strokeStyle = "rgba(255,230,180,0.5)"; ctx.lineWidth = 0.9;
            ctx.beginPath(); ctx.moveTo(px - 0.8, py); ctx.lineTo(px - 0.8, py - H * e); ctx.stroke();
          }
          const beam = (x1: number, y1: number, x2: number, y2: number, g: number): void => {
            if (g <= 0) return;
            const ex = x1 + (x2 - x1) * g, ey = y1 + (y2 - y1) * g;
            ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(ex, ey); ctx.stroke();
            ctx.strokeStyle = "#c48c4c"; ctx.lineWidth = 2.2; ctx.stroke();
          };
          const g2 = grow(0.4), g3 = grow(0.6);
          beam(-half + 6, half - 6 - H * 0.55, half - 6, half - 6 - H * 0.55, g2);
          beam(-half + 6, half - 6 - H * 0.15, half - 6, half - 6 - H * 0.85, g2);
          beam(-half + 6, half - 6 - H, half - 6, half - 6 - H, g3);
          if (grow(0.7) > 0) {
            const sw = Math.sin(this.time * 2.4 + p.x * 0.03) * 3;
            ctx.strokeStyle = `rgba(200,170,120,${(0.85 * grow(0.7)).toFixed(3)})`; ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(-half + 9, -half + 12 - H * 0.9);
            ctx.quadraticCurveTo(0, -half + 12 - H * 0.9 + 7 + sw, half - 9, -half + 12 - H * 0.9);
            ctx.stroke();
          }
          ctx.restore();
        }
        // Ghost icon of what will be built.
        ctx.globalAlpha = 0.65;
        drawIcon(ctx, p.kind === "tower" ? "tower" : p.kind === "fortify" ? "wall" : p.kind === "lumber" ? "sword" : p.kind === "forge" ? "hammer" : p.kind === "hall" ? "crown" : p.kind === "catapult" ? "warn" : p.kind === "barracks" ? "sword" : "hammer", 0, -9, 10, "#f4e6c8");
        ctx.globalAlpha = 1;
      }
      // Prices and caption: at night they're drawn after the darkness (with this exact transform and
      // alpha) so they read in the dark — Hollow Night builds in permanent night. By day, in place.
      const labels = (ctx: CanvasRenderingContext2D): void => {
        // Price pill: pops with an overshoot when it becomes affordable (a shine sweeps across it), bumps
        // each time the count ticks down while paying, and bobs gently while it's affordable.
        const label = `${cost - p.paid}`;
        if (label !== ui.label) { ui.label = label; ui.labelAt = this.time; }
        const at = this.time - ui.affAt, lt0 = this.time - ui.labelAt;
        const pop = at < 0.4 ? 1 + Math.sin((at / 0.4) * Math.PI) * 0.28 * (1 - at / 0.4) : 1;
        const tick = lt0 < 0.18 ? 1 + Math.sin((lt0 / 0.18) * Math.PI) * 0.12 : 1;
        const bob = affordable && !near ? Math.sin(this.time * 3 + p.x * 0.05) * 1.2 : 0;
        ctx.font = `bold 13px ${FONT}`;
        const w = ctx.measureText(label).width + 26;
        const py0 = built ? 0 : 15;
        ctx.save();
        ctx.translate(0, py0 + bob);
        ctx.scale(pop * tick, pop * tick);
        const py = 0;
        // Each pill is judged on its own resource, so a plate short only of logs shows exactly that:
        // the coin pill stays gold, the missing one turns red.
        const coinOk = h.coins >= cost - p.paid;
        const short = !affordable && !coinOk;
        ctx.fillStyle = coinOk ? "#2a1a0e" : "rgba(40,20,10,0.75)";
        ctx.beginPath();
        ctx.roundRect(-w / 2, py - 9, w, 18, 9);
        ctx.fill();
        ctx.strokeStyle = affordable ? "#ffd84a" : coinOk ? "#c8a050" : short && logCost > 0 ? "#d0605a" : "#8a6a4a";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        coinIcon(ctx, -w / 2 + 10, py, 5.5);
        ctx.fillStyle = affordable ? "#ffe9a0" : coinOk ? "#f0dca0" : logCost > 0 ? "#ffa890" : "#c8b090";
        ctx.fillText(label, 7, py + 1);
        if (at < 0.5) {
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(-w / 2, py - 9, w, 18, 9);
          ctx.clip();
          const sx = -w / 2 - 10 + (w + 20) * (at / 0.5);
          ctx.fillStyle = "rgba(255,250,220,0.55)";
          ctx.beginPath();
          ctx.moveTo(sx - 4, py - 10); ctx.lineTo(sx + 4, py - 10); ctx.lineTo(sx - 2, py + 10); ctx.lineTo(sx - 10, py + 10);
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
        if (logCost > 0) {
          const lt = `${logCost - p.paidLogs}`;
          const lw = ctx.measureText(lt).width + 26;
          const ly = py0 + 20;
          const logOk = h.logs >= logCost - p.paidLogs;
          ctx.fillStyle = logOk ? "#2a1a0e" : "rgba(40,20,10,0.75)";
          ctx.beginPath();
          ctx.roundRect(-lw / 2, ly - 9, lw, 18, 9);
          ctx.fill();
          ctx.strokeStyle = logOk ? "#e8b070" : "#d0605a";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          drawLogPile(ctx, -lw / 2 + 10, ly - 7, 1, false);
          ctx.fillStyle = logOk ? "#f0d8b0" : "#ffa890";
          ctx.fillText(lt, 7, ly + 1);
        }
        // Caption.
        const caption = p.kind === "healer" ? (built ? `▲ Lv ${p.level + 1}` : "Healer's Tent") : p.kind === "mage" ? (built ? `▲ Lv ${p.level + 1}` : "Mage Tower") : p.kind === "barracks" ? (built ? `▲ Lv ${p.level + 1}` : "Barracks") : p.kind === "catapult" ? (built ? `▲ Lv ${p.level + 1}` : "Catapult") : p.kind === "hall" ? ["Upgrade Hall", "Grand Hall"][p.level]! : p.kind === "forge" ? (built ? `▲ Lv ${p.level + 1}` : "Forge") : p.kind === "lumber" ? (built ? `▲ Lv ${p.level + 1}` : "Lumber Camp") : p.kind === "tower" ? (built ? `▲ Lv ${p.level + 1}` : "Archer Tower") : p.kind === "fortify" ? ["Banded Wall", "Stone Wall", "Battlements"][p.level]! : p.label;
        outlined(ctx, caption, 0, built ? -18 : -half - 9, 10.5);
      };
      if (this.night > 0.3) {
        const m = ctx.getTransform(), ga = ctx.globalAlpha, ta = ctx.textAlign, tb = ctx.textBaseline;
        this.lateBars.push((ctx) => {
          ctx.save();
          ctx.setTransform(m); ctx.globalAlpha = ga; ctx.textAlign = ta; ctx.textBaseline = tb;
          labels(ctx);
          ctx.restore();
        });
      } else labels(ctx);
      ctx.restore();
    }
  }

  /** Draw a building see-through while the hero stands behind it (within halfW, up to `height` above its base). */
  private faded(ctx: CanvasRenderingContext2D, c: Camp, p: Vec, halfW: number, height: number, draw: () => void): void {
    const h = c.hero;
    const behind = !h.dead && h.y < p.y + 10 && h.y > p.y - height && Math.abs(h.x - p.x) < halfW;
    if (behind) {
      ctx.globalAlpha = 0.5;
      this.heroBehind = true;
    }
    draw();
    ctx.globalAlpha = 1;
  }

  /** Standing on a tower plot: current reach (faint) and the reach after this purchase (gold, dashed). */
  private drawRangePreview(ctx: CanvasRenderingContext2D, c: Camp, p: Plot, k = 1): void {
    const cur = TOWER_LEVELS[p.level - 1];
    const nx = TOWER_LEVELS[p.level];
    // `k` (0..1, eased) grows the rings out from the plot with a slight overshoot and fades them.
    const u = Math.min(1, k), g = 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2;
    ctx.save();
    ctx.globalAlpha = Math.min(1, u * 1.4);
    if (cur) {
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, cur.range * c.mods.towerRange * g), 0, Math.PI * 2);
      ctx.stroke();
    }
    if (nx) {
      const r = Math.max(1, nx.range * c.mods.towerRange * g);
      ctx.fillStyle = "rgba(255,216,74,0.06)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,216,74,0.7)";
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -this.time * 20;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Repair plot while every wall segment is whole: a quiet plate that takes no coins. */
  /** Coins flying from the King to the HUD coin counter (screen space). */
  private uiCoins: { x: number; y: number; t: number; spin: number }[] = [];
  private coinTarget = { x: 52, y: 52, at: -9 };
  private drawUiCoins(ctx: CanvasRenderingContext2D, dt: number): void {
    if (!this.uiCoins.length) return;
    // Where the HUD coin pill sits, in canvas units (re-measured now and then; the HUD is DOM).
    if (this.time - this.coinTarget.at > 1 && typeof document !== "undefined") {
      const pill = document.querySelector(".coin-pill"), cv = this.canvas.getBoundingClientRect();
      if (pill && cv.width > 0) {
        const r = pill.getBoundingClientRect();
        this.coinTarget = { x: ((r.left + r.height * 0.55 - cv.left) / cv.width) * VIEW_W, y: ((r.top + r.height / 2 - cv.top) / cv.height) * VIEW_H, at: this.time };
      }
    }
    const T = 0.55;
    const { x: tx, y: ty } = this.coinTarget;
    for (const k of this.uiCoins) {
      k.t += dt;
      if (k.t < 0) continue;
      const u = Math.min(1, k.t / T);
      const e = u * u * (3 - 2 * u);
      // Arc: pops up first, then accelerates into the counter, shrinking a little on arrival.
      const x = k.x + (tx - k.x) * e;
      const y = k.y + (ty - k.y) * e - Math.sin(u * Math.PI) * 50;
      const w = Math.max(1, Math.abs(Math.cos(k.spin + k.t * 14)) * 6);
      const sc = 1 - Math.max(0, u - 0.8) * 2;
      ctx.fillStyle = "#8a5a10";
      ctx.beginPath(); ctx.ellipse(x + 0.5, y + 0.7, (w + 0.6) * sc, 5.6 * sc, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#f7d256";
      ctx.beginPath(); ctx.ellipse(x, y, w * sc, 5.2 * sc, 0, 0, Math.PI * 2); ctx.fill();
      if (w > 3) { ctx.fillStyle = "rgba(255,250,220,0.85)"; ctx.beginPath(); ctx.ellipse(x - w * 0.35, y - 1.6, w * 0.25, 1.5, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    this.uiCoins = this.uiCoins.filter((k) => k.t < T);
  }

  private drawIdleRepair(ctx: CanvasRenderingContext2D, p: Plot): void {
    // Walls are fine: the repair spot is a carpenter's corner rather than an empty dashed box —
    // a stone pad with a sawhorse, a stack of planks and a hammer, and a small green check.
    const half = CAMP.plotHalf;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = 0.9;
    ctx.drawImage(this.padSprite(half), -half - 6, -half - 4, half * 2 + 12, half * 2 + 14);
    ctx.globalAlpha = 1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Plank stack (back left): three boards, lit tops, dark ends.
    for (let i = 0; i < 3; i++) {
      const y = 2 - i * 4.2, x = -16 + (i % 2) * 1.5;
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.roundRect(x - 1, y - 1, 24, 6, 1.5); ctx.fill();
      ctx.fillStyle = i === 2 ? "#d9a866" : "#c08a4e";
      ctx.beginPath(); ctx.roundRect(x, y, 22, 4, 1); ctx.fill();
      ctx.fillStyle = "rgba(255,236,190,0.55)";
      ctx.fillRect(x + 1, y, 20, 1);
      ctx.fillStyle = "#8a5a2c";
      ctx.fillRect(x + 20, y, 2, 4);
    }
    // Sawhorse (front right): splayed legs and a beam, with a board laid across it.
    softShadow(ctx, 10, 13, 15, 4, 0.3);
    const leg = (x1: number, y1: number, x2: number, y2: number): void => {
      ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = "#a8743c"; ctx.lineWidth = 2.2; ctx.stroke();
    };
    leg(1, 1, -2, 13); leg(4, 1, 6, 13); leg(16, 1, 13, 13); leg(19, 1, 22, 13);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(-1, -2, 23, 5, 1.5); ctx.fill();
    ctx.fillStyle = "#b8803f"; ctx.fillRect(0, -1, 21, 3);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(-5, -6.5, 31, 5, 1.5); ctx.fill();
    ctx.fillStyle = "#e0b070"; ctx.fillRect(-4, -5.5, 29, 3);
    ctx.fillStyle = "rgba(255,240,200,0.6)"; ctx.fillRect(-4, -5.5, 29, 1);
    // Hammer resting on the board.
    ctx.save();
    ctx.translate(12, -8);
    ctx.rotate(-0.35);
    ctx.strokeStyle = INK; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(5, 0); ctx.stroke();
    ctx.strokeStyle = "#7a4a22"; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(4, -3.5, 5, 7, 1); ctx.fill();
    ctx.fillStyle = "#9aa2ae"; ctx.fillRect(5, -2.5, 3, 5);
    ctx.restore();
    // "All good" badge: a small green check in a disc, gently bobbing.
    const bob = Math.sin(this.time * 2.2 + p.x * 0.01) * 1.2;
    const bx = half - 6, by = -half + 4 + bob;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(bx, by, 7.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#5fc04a"; ctx.beginPath(); ctx.arc(bx, by, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx - 3, by); ctx.lineTo(bx - 0.8, by + 2.4); ctx.lineTo(bx + 3.2, by - 2.4); ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = 0.85;
    // Like the other plot captions: after the darkness at night, so it reads in Hollow Night.
    if (this.night > 0.3) {
      const m = ctx.getTransform();
      this.lateBars.push((ctx) => {
        ctx.save();
        ctx.setTransform(m); ctx.globalAlpha = 0.85; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        outlined(ctx, p.label, 0, -half - 9, 10.5);
        ctx.restore();
      });
    } else outlined(ctx, p.label, 0, -half - 9, 10.5);
    ctx.restore();
  }

  private nearPlot(h: Vec, p: Plot): boolean {
    return Math.abs(p.x - h.x) < CAMP.plotHalf && Math.abs(p.y - h.y) < CAMP.plotHalf;
  }



  /** Pre-rendered soft radial blobs (drawn scaled with globalAlpha instead of a gradient per light). */
  private blobs = new Map<string, HTMLCanvasElement>();
  private blob(key: string, stops: [number, string][]): HTMLCanvasElement {
    let b = this.blobs.get(key);
    if (!b) {
      b = document.createElement("canvas");
      b.width = b.height = 128;
      const g = b.getContext("2d")!;
      const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      for (const [o, col] of stops) rg.addColorStop(o, col);
      g.fillStyle = rg;
      g.fillRect(0, 0, 128, 128);
      this.blobs.set(key, b);
    }
    return b;
  }
  private glint: HTMLCanvasElement | null = null;
  private slashGrad: CanvasGradient | null = null;
  /**
   * A living flame (torches): warm base, two tongues licking upward and swaying on their own
   * phases, a white-hot core and embers that rise and wink out. `s` scales it; `seed` desyncs.
   */
  private drawFlame(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, seed: number, alpha: number, cold = false): void {
    const flame = cold
      ? this.blob("coldflame", [[0, "rgba(220,240,255,1)"], [0.4, "rgba(120,170,255,0.85)"], [1, "rgba(70,110,255,0)"]])
      : this.blob("flame", [[0, "rgba(255,240,170,1)"], [0.4, "rgba(255,150,40,0.85)"], [1, "rgba(255,90,20,0)"]]);
    const fl = 1 + Math.sin(this.time * 17 + seed * 3) * 0.12 + Math.sin(this.time * 29 + seed) * 0.06;
    this.drawBlob(ctx, flame, x, y + s, 7 * fl * s, 8 * fl * s, alpha * 0.8);
    for (let j = 0; j < 2; j++) {
      const ph = this.time * (9 + j * 4) + seed + j * 2.3;
      const lick = 0.5 + 0.5 * Math.sin(ph);
      this.drawBlob(ctx, flame, x + Math.sin(ph * 0.7) * 1.6 * s, y - (4 + lick * 4) * s, (3.6 - j) * s, (6 + lick * 4) * s, alpha * (0.75 - j * 0.2));
    }
    this.drawBlob(ctx, this.glintBlob(), x, y, 2.6 * s, 3.6 * s, alpha * 0.9);
    for (let j = 0; j < 3; j++) {
      const u = (this.time * 0.9 + seed * 0.21 + j / 3) % 1;
      const ex = x + (Math.sin(u * 9 + seed + j * 2) * 3 + u * 4) * s;
      const ey = y - (6 + u * 26) * s;
      this.drawBlob(ctx, flame, ex, ey, 1.4, 1.4, alpha * (1 - u) * (0.6 + 0.4 * Math.sin(u * 40 + j)));
    }
  }
  private emberBlob(): HTMLCanvasElement {
    return this.blob("ember", [[0, "rgba(255,236,170,1)"], [0.25, "rgba(255,170,70,0.7)"], [1, "rgba(255,120,30,0)"]]);
  }
  private glintBlob(): HTMLCanvasElement {
    return (this.glint ??= this.blob("glint", [[0, "rgba(255,220,90,1)"], [1, "rgba(255,220,90,0)"]]));
  }
  private drawBlob(ctx: CanvasRenderingContext2D, b: HTMLCanvasElement, x: number, y: number, rx: number, ry = rx, alpha = 1): void {
    if (alpha <= 0.002) return;
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * Math.min(1, alpha);
    ctx.drawImage(b, x - rx, y - ry, rx * 2, ry * 2);
    ctx.globalAlpha = a;
  }

  /** 0 = full day, 1 = full night; eases between them over ~2 s (dusk / dawn). */
  night = 0;
  private nightLayer: HTMLCanvasElement | null = null;

  /** World-space light sources at night: the hero's lantern, the hall, built plots, wall torches. */
  private nightLights(c: Camp): { x: number; y: number; r: number; f?: number }[] {
    // `f` marks an open flame: its pool flickers and wobbles (lanterns and the hall burn steadier).
    const out: { x: number; y: number; r: number; f?: number }[] = [];
    if (!c.hero.dead) out.push({ x: c.hero.x, y: c.hero.y, r: 135 });
    out.push({ x: HALL.x, y: HALL.y - 10, r: 175 });
    for (const pp of PLAZA_PROPS) if (pp.n === "lantern1") out.push({ x: pp.x + (pp.flip ? -1 : 1) * 6 * pp.s, y: pp.y - 14 * pp.s, r: 70 });
    for (const p of c.plots) if (p.level > 0) out.push({ x: p.x, y: p.y - 10, r: p.kind === "tower" ? 95 + p.level * 12 : 72, f: 0.4 });
    for (let i = 1; i <= 5; i++) out.push({ x: (MAP_W * i) / 6, y: WALL_Y + WALL_THICK, r: 68, f: 1 });
    // Bosses are never lost in the dark; the treasure goblin glitters, a lure worth chasing.
    for (const e of c.enemies) {
      if (e.def.boss) out.push({ x: e.x, y: e.y - e.def.radius, r: e.def.radius * 4.2 });
      else if (e.def.id === "thief") out.push({ x: e.x, y: e.y - 6, r: 64 + Math.sin(this.time * 8) * 6 });
    }
    this.groundFires = this.groundFires.filter((f) => this.time - f.t < 3);
    for (const f of this.groundFires) out.push({ x: f.x, y: f.y, r: 54 * (1 - (this.time - f.t) / 3) + 10, f: 1.3 });
    // Torch-bearers in the horde: moving pools of light in the dark.
    for (const e of this.torchBearers(c)) out.push({ x: e.x + 8, y: e.y - 10, r: 62, f: 1 });
    // Barracks soldiers carry a lantern, so your own men read in a night brawl at the gate.
    for (const a of c.allies.slice(0, 12)) out.push({ x: a.x, y: a.y - 8, r: 52 });
    // Fire Nova lights up the night: a burst of firelight swells with the ring and dies away.
    for (const w of this.shockwaves) {
      const u = (this.time - w.t) / 0.7;
      if (w.nova && u >= 0 && u < 1) out.push({ x: w.x, y: w.y, r: 30 + w.r * 1.15 * Math.sin(Math.min(1, u * 1.6) * Math.PI * 0.5) * (1 - u * u), f: 1.2 });
    }
    return out;
  }

  /** Every third walking enemy carries a torch at night (capped for performance). */
  private torchCache: { t: number; list: Enemy[] } = { t: -1, list: [] };
  private torchBearers(c: Camp): Enemy[] {
    if (this.torchCache.t !== this.time) this.torchCache = { t: this.time, list: c.enemies.filter((e) => !e.def.flying && e.id % 3 === 0).slice(0, 14) };
    return this.torchCache.list;
  }

  /**
   * Day/night: waves are fought at night, building happens by day. Dusk washes the field orange,
   * then darkness falls with warm light pools around every light source (cut out of a darkness
   * layer), a warm additive glow and drifting fireflies; dawn fades it back with a pink blush.
   */
  private drawDayNight(ctx: CanvasRenderingContext2D, c: Camp, o: Vec, sh: Vec, dt: number): void {
    // Hollow Night (chapter 4) never sees the sun.
    const target = c.phase === "wave" || this.mood === 4 ? 1 : 0;
    if (this.prevPhase === "pick" && c.phase === "build") this.say(["Another dawn!", "We held!", "Rebuild. Quickly.", "Still standing!"]);
    this.prevPhase = c.phase;
    this.night += Math.sign(target - this.night) * Math.min(Math.abs(target - this.night), dt * 0.45);
    const k = this.night;
    this.drawDayLife(ctx, o, sh, 1 - k);
    // Golden hour: in the last ~10 s of the day the light warms toward sunset.
    if (c.phase === "build" && c.timer < 10 && !this.ambient && this.mood !== 4) {
      const g = 1 - Math.max(0, c.timer) / 10;
      const sun = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      sun.addColorStop(0, `rgba(255,150,60,${0.16 * g})`);
      sun.addColorStop(1, `rgba(140,60,90,${0.12 * g})`);
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (k <= 0.001) return;
    const ease = k * k * (3 - 2 * k);
    const mid = Math.sin(Math.PI * k);
    if (k < 0.999 && mid > 0.02) {
      ctx.fillStyle = target === 1 ? `rgba(255,118,48,${0.2 * mid})` : `rgba(255,168,190,${0.16 * mid})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    // Sunrise: as the night lifts, a broad band of warm light sweeps across the field from the
    // top-left (where the scene's light comes from), with a few soft rays fanning out of it.
    if (target === 0 && k < 0.999 && this.mood !== 4) {
      const p = 1 - k; // 0 → 1 through the dawn
      const D = VIEW_W + VIEW_H;
      const pos = -0.25 * D + p * 1.5 * D;
      const a = Math.sin(p * Math.PI) * 0.22;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const band = ctx.createLinearGradient(pos - 160, pos * 0.35 - 160 * 0.35, pos + 160, pos * 0.35 + 160 * 0.35);
      band.addColorStop(0, "rgba(255,190,110,0)");
      band.addColorStop(0.5, `rgba(255,200,120,${a.toFixed(3)})`);
      band.addColorStop(1, "rgba(255,190,110,0)");
      ctx.fillStyle = band;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      for (let i = 0; i < 4; i++) {
        const ang = 0.55 + i * 0.13 + Math.sin(this.time * 0.4 + i) * 0.02;
        ctx.save();
        ctx.translate(-40, -60);
        ctx.rotate(ang);
        const ray = ctx.createLinearGradient(0, 0, D, 0);
        ray.addColorStop(0, `rgba(255,220,150,${(a * 0.5).toFixed(3)})`);
        ray.addColorStop(1, "rgba(255,220,150,0)");
        ctx.fillStyle = ray;
        ctx.fillRect(0, -10 - i * 3, D, 20 + i * 6);
        ctx.restore();
      }
      ctx.restore();
    }
    const L = (this.nightLayer ??= document.createElement("canvas"));
    // The darkness is all soft gradients, so it renders at half resolution (4x fewer pixels).
    const HR = 0.5;
    if (L.width !== Math.ceil(VIEW_W * HR) || L.height !== Math.ceil(VIEW_H * HR)) {
      L.width = Math.ceil(VIEW_W * HR);
      L.height = Math.ceil(VIEW_H * HR);
    }
    const g = L.getContext("2d")!;
    g.setTransform(HR, 0, 0, HR, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, VIEW_W, VIEW_H);
    g.fillStyle = `rgba(8,12,48,${0.7 * ease})`;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    const lights = this.nightLights(c);
    const vis: { x: number; y: number; r: number; a: number }[] = [];
    g.globalCompositeOperation = "destination-out";
    const cut = this.blob("cut", [[0, "rgba(0,0,0,0.95)"], [0.5, "rgba(0,0,0,0.62)"], [1, "rgba(0,0,0,0)"]]);
    for (const l of lights) {
      const x = l.x - o.x + sh.x;
      const y = l.y - o.y + sh.y;
      if (x < -l.r || x > VIEW_W + l.r || y < -l.r || y > VIEW_H + l.r) continue;
      // Flicker from a few incommensurate sines (no visible beat), plus occasional gutters; flames
      // also sway their pool a pixel or two as the fire leans.
      const ph = l.x * 0.71 + l.y * 0.37, T = this.time, fs = l.f ?? 0.25;
      const n = Math.sin(T * 9.3 + ph) * 0.5 + Math.sin(T * 15.7 + ph * 1.7) * 0.3 + Math.sin(T * 23.1 + ph * 0.6) * 0.2;
      const gutter = Math.max(0, Math.sin(T * 1.9 + ph * 2.3) - 0.92) * 6;
      const flick = (n * 0.045 - gutter * 0.06) * fs;
      const r = l.r * (1 + flick);
      const wx = l.f ? Math.sin(T * 3.1 + ph) * 1.6 * fs : 0, wy = l.f ? Math.sin(T * 4.3 + ph * 1.3) * 1.0 * fs : 0;
      vis.push({ x: x + wx, y: y + wy, r, a: 1 + flick * 3 });
      this.drawBlob(g, cut, x + wx, y + wy, r);
    }
    // Moonlit silhouettes: thin the darkness a little around every foe, so the horde stays
    // readable out in the black instead of melting into the grass (their own colours show dimly).
    for (const e of c.enemies) {
      const r = e.def.radius;
      const x = e.x - o.x + sh.x, y = e.y - r * 0.5 - o.y + sh.y - (e.def.flying ? 10 : 0);
      if (x < -40 || x > VIEW_W + 40 || y < -40 || y > VIEW_H + 40) continue;
      this.drawBlob(g, cut, x, y, r * 1.7, r * 2.1, 0.5);
    }
    ctx.drawImage(L, 0, 0, VIEW_W, VIEW_H);
    // Wall torches stand on a short wooden pole with an iron cup, seen as a silhouette lit warm
    // from above by its own flame (so the flames below don't float in mid-air).
    ctx.save();
    ctx.globalAlpha = Math.min(1, ease * 1.2);
    for (let i = 1; i <= 5; i++) {
      const tx = (MAP_W * i) / 6 - o.x + sh.x;
      const ty = WALL_Y + WALL_THICK - 14 - o.y + sh.y;
      if (tx < -20 || tx > VIEW_W + 20 || ty < -20 || ty > VIEW_H + 30) continue;
      const pole = ctx.createLinearGradient(0, ty + 4, 0, ty + 22);
      pole.addColorStop(0, "#b0743a");
      pole.addColorStop(1, "#3a2414");
      ctx.fillStyle = pole;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(tx - 1.6, ty + 5, 3.2, 17, 1.2); ctx.fill(); ctx.stroke();
      // Iron cup: a little trapezoid with a warm-lit rim.
      ctx.fillStyle = "#2a2622";
      ctx.beginPath();
      ctx.moveTo(tx - 5, ty + 3); ctx.lineTo(tx + 5, ty + 3); ctx.lineTo(tx + 3, ty + 8); ctx.lineTo(tx - 3, ty + 8); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ffb050";
      ctx.fillRect(tx - 4.5, ty + 3, 9, 1.2);
    }
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const l of vis) {
      this.drawBlob(ctx, this.blob("warm", [[0, "rgba(255,150,60,1)"], [1, "rgba(255,150,60,0)"]]), l.x, l.y, l.r * 0.7, l.r * 0.7, 0.15 * ease * l.a);
    }
    // Torch flames on the wall (the wall lights above), flickering.
    for (let i = 1; i <= 5; i++) {
      const tx = (MAP_W * i) / 6 - o.x + sh.x;
      const ty = WALL_Y + WALL_THICK - 14 - o.y + sh.y;
      // At nightfall the torches catch one after another from the gate outwards: each flares big
      // with a puff of embers, then settles to a steady burn.
      const lightAt = this.waveAt + 0.35 + Math.abs(i - 3) * 0.2;
      const since = this.time - lightAt;
      const fresh = c.phase === "wave" && this.time - this.waveAt < 3;
      if (fresh && since < 0) continue;
      let sc = 1;
      if (fresh && since < 0.4) {
        sc = 1 + Math.sin((since / 0.4) * Math.PI) * 0.9 + (1 - since / 0.4) * 0.3;
        if (!this.torchLit.has(i)) {
          this.torchLit.add(i);
          this.fx.burst((MAP_W * i) / 6, WALL_Y + WALL_THICK - 18, "#ffb040", 6, 70, { max: 0.5, size: 2, gravity: -60, shape: "spark" });
        }
      }
      // Night won: the torches flare in a ripple from the gate outwards, a victory salute.
      const vt = this.time - this.cheerAt - Math.abs(i - 3) * 0.12;
      if (vt > 0 && vt < 0.6) sc *= 1 + Math.sin((vt / 0.6) * Math.PI) * 0.8;
      if (tx < -20 || tx > VIEW_W + 20 || ty < -20 || ty > VIEW_H + 20) continue;
      this.drawFlame(ctx, tx, ty, sc, i * 1.7, fresh ? Math.max(ease, 0.9) : ease);
    }
    if (c.phase !== "wave" || this.time - this.waveAt >= 3) this.torchLit.clear();
    // Dropped coins glint and arrows leave a faint glow, so loot and fire read in the dark.
    const glint = this.glintBlob();
    for (const k of c.coins) {
      const cx = k.x - o.x + sh.x, cy = k.y - k.z - o.y + sh.y;
      if (cx < -10 || cx > VIEW_W + 10 || cy < -10 || cy > VIEW_H + 10) continue;
      this.drawBlob(ctx, glint, cx, cy, 11, 11, ease * (0.45 + 0.35 * Math.sin(this.time * 6 + k.id)));
    }
    for (const a of c.arrows) {
      const ax = a.x - o.x + sh.x, ay = a.y - o.y + sh.y;
      if (ax < -10 || ax > VIEW_W + 10 || ay < -10 || ay > VIEW_H + 10) continue;
      this.drawBlob(ctx, glint, ax, ay, 9, 9, ease * 0.5);
    }
    // (Bosses' red menace glow is drawn on the ground beneath them in drawEnemyInner, so it no
    // longer washes out the boss sprite.)
    // Dropped torches burning out on the ground.
    for (const f of this.groundFires) {
      const k2 = 1 - (this.time - f.t) / 3;
      const fx = f.x - o.x + sh.x, fy = f.y - o.y + sh.y;
      this.drawFlame(ctx, fx, fy - 3 * k2, 0.25 + 0.7 * k2, f.x * 0.37, ease);
      ctx.strokeStyle = `rgba(70,40,20,${ease})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fx - 7, fy + 3);
      ctx.lineTo(fx + 3, fy - 1);
      ctx.stroke();
    }
    // Torch flames held by the horde's torch-bearers.
    for (const e of this.torchBearers(c)) {
      // Held out to the side at arm's length (away from the face), on a short haft that bobs with
      // the march.
      const r = e.def.radius, side = this.enemyMove.get(e.id)?.flip ? 1 : -1;
      const bob = Math.sin(this.time * 9 + e.id) * 1.2;
      const hx = e.x + side * r * 1.15 - o.x + sh.x, hy = e.y - r * 1.2 - o.y + sh.y + bob;
      const tx = hx + side * 3, ty = hy - r * 1.05;
      if (tx < -20 || tx > VIEW_W + 20 || ty < -20 || ty > VIEW_H + 20) continue;
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = `rgba(60,36,18,${ease})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(tx, ty + 3);
      ctx.stroke();
      ctx.globalCompositeOperation = "lighter";
      this.drawFlame(ctx, tx, ty, 0.8, e.id * 0.61, ease);
    }
    // Fireflies drifting over the field.
    for (let i = 0; i < 16; i++) {
      const fx = ((i * 97.3 + Math.sin(this.time * 0.4 + i) * 40 + this.time * (6 + (i % 5))) % (VIEW_W + 40)) - 20;
      const fy = ((i * 151.7 + Math.cos(this.time * 0.33 + i * 2) * 50) % VIEW_H + VIEW_H) % VIEW_H;
      const tw = Math.max(0, Math.sin(this.time * (1.7 + (i % 3) * 0.4) + i * 1.9));
      const a = ease * tw * 0.85;
      if (a < 0.03) continue;
      this.drawBlob(ctx, this.blob("fly", [[0, "rgba(220,255,140,1)"], [1, "rgba(220,255,140,0)"]]), fx, fy, 6, 6, a);
    }
    ctx.restore();
  }

  /**
   * Daytime life: soft cloud shadows drifting across the field (world-anchored, so they slide as
   * the camera moves) and small flocks of birds crossing overhead with their shadows far below.
   */
  private drawDayLife(ctx: CanvasRenderingContext2D, o: Vec, sh: Vec, day: number): void {
    if (day <= 0.02) return;
    const t = this.time;
    ctx.save();
    // Clouds: a few big blobs, each made of 3 overlapping soft ellipses.
    for (let i = 0; i < 7; i++) {
      const span = MAP_W + 700;
      const wx = ((t * (9 + (i % 3) * 2) + i * 430) % span) - 350;
      const wy = ((i * 263 + 120) % MAP_H) + Math.sin(t * 0.05 + i) * 40;
      const x = wx - o.x + sh.x, y = wy - o.y + sh.y;
      if (x < -260 || x > VIEW_W + 260 || y < -200 || y > VIEW_H + 200) continue;
      for (let j = 0; j < 3; j++) {
        const cx = x + (j - 1) * 70, cy = y + ((j * 37) % 30) - 15, rx = 110 - j * 12, ry = 55 - j * 6;
        this.drawBlob(ctx, this.blob("cloud", [[0, "rgba(20,40,30,1)"], [1, "rgba(20,40,30,0)"]]), cx, cy, rx, ry, 0.16 * day);
      }
    }
    // Wind gusts: every ~9 s a gust rolls across the meadow from the left: a band where the grass
    // bends over and catches the light, drawn as short pale curved blades (world-anchored, so the
    // gust moves over the ground, not the screen). Not on the dusty plains, the night chapter or
    // the stony endless field.
    if (this.mood === 1 || this.mood === 2 || this.mood === 5) {
      const P = 9, cyc = Math.floor(t / P), gt = t - cyc * P;
      if (gt < 3) {
        const front = -150 + (gt / 3) * (MAP_W + 300);
        const hsh = (n: number): number => { const v = Math.sin(n * 91.7 + cyc * 13.3) * 43758.5453; return v - Math.floor(v); };
        ctx.save();
        ctx.lineCap = "round";
        ctx.strokeStyle = this.mood === 5 ? "rgba(255,236,190,1)" : "rgba(236,250,200,1)";
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 170; i++) {
          const wx = hsh(i) * (MAP_W + 200) - 100, wy = FOREST_Y + 60 + hsh(i + 500) * (MAP_H - FOREST_Y - 200);
          const dxF = wx - front;
          if (dxF > 0 || dxF < -140) continue;
          const env = Math.sin((-dxF / 140) * Math.PI); // swells in the middle of the band
          const x = wx - o.x + sh.x, y = wy - o.y + sh.y;
          if (x < -10 || x > VIEW_W + 10 || y < -10 || y > VIEW_H + 10) continue;
          const bend = 4 + env * 5;
          ctx.globalAlpha = day * env * 0.45;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + bend * 0.5, y - 5, x + bend, y - 6 + env * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x + 4, y + 1);
          ctx.quadraticCurveTo(x + 4 + bend * 0.5, y - 3, x + 4 + bend, y - 4 + env * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    // Butterflies: a few flutter around the camp on wandering loops (world-anchored). Each has fore-
    // and hind wings with a darker edge and pale spot, seen from above: the wings foreshorten as they
    // beat (fast downstroke, slower recovery), the body lifts on each downstroke, and it turns to
    // face the way it is drifting.
    const cols = ["#ffd84a", "#ff8ac0", "#8ad8ff", "#ffffff", "#ffb04a", "#c8a0ff"];
    const edge = ["#8a5a10", "#a03a70", "#2a5a8a", "#8a8a9a", "#9a4a10", "#5a3a8a"];
    const bfPos = (i: number, tt: number): [number, number] => {
      const cx = HALL.x - 220 + ((i * 97) % 440), cy = HALL.y - 260 + ((i * 151) % 300);
      return [cx + Math.sin(tt * 0.37 + i * 1.7) * 60 + Math.sin(tt * 1.1 + i) * 12,
        cy + Math.cos(tt * 0.29 + i * 2.3) * 40 + Math.sin(tt * 2.3 + i) * 6];
    };
    for (let i = 0; i < 6; i++) {
      const [wx, wy] = bfPos(i, t);
      const [nx, ny] = bfPos(i, t + 0.15);
      const x = wx - o.x + sh.x, y = wy - o.y + sh.y;
      if (x < -10 || x > VIEW_W + 10 || y < -10 || y > VIEW_H + 10) continue;
      // Beat phase with a quick downstroke: warp the phase so the first 40% covers half the cycle.
      const raw = (t * 2.4 + i * 0.37) % 1;
      const ph = raw < 0.4 ? raw / 0.4 * 0.5 : 0.5 + (raw - 0.4) / 0.6 * 0.5;
      const open = 0.18 + 0.82 * (0.5 + 0.5 * Math.cos(ph * Math.PI * 2)); // 1 = flat open, ~0 = up
      const lift = Math.sin(ph * Math.PI * 2) * 1.6;
      const head = Math.atan2(ny - wy, nx - wx) + Math.PI / 2;
      ctx.globalAlpha = day;
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.beginPath();
      ctx.ellipse(x + 6, y + 14, 1.5 + 2.5 * open, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(x, y - lift);
      ctx.rotate(head);
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.scale(side * open, 1);
        // Hind wing (smaller, lower), then fore wing over it.
        ctx.fillStyle = edge[i]!;
        ctx.beginPath(); ctx.ellipse(2.6, 1.6, 2.6, 2.1, 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = cols[i]!;
        ctx.beginPath(); ctx.ellipse(2.4, 1.5, 2.0, 1.6, 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = edge[i]!;
        ctx.beginPath(); ctx.ellipse(3.0, -1.6, 3.4, 2.4, -0.45, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = cols[i]!;
        ctx.beginPath(); ctx.ellipse(2.8, -1.5, 2.8, 1.9, -0.45, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.beginPath(); ctx.arc(4.0, -2.2, 0.7, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = "#2a2018";
      ctx.beginPath(); ctx.ellipse(0, 0.3, 0.75, 3.0, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#2a2018"; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(-0.3, -2.6); ctx.lineTo(-1.3, -4.6); ctx.moveTo(0.3, -2.6); ctx.lineTo(1.3, -4.6); ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    // Leaves on the breeze, by chapter: a heavy fall of red and gold in autumn, green in summer
    // and the marsh, dry ochre on the plains; each swings side to side as it drifts and flips
    // edge-on as it tumbles, with a darker midrib.
    const LEAF: Record<number, { n: number; cols: string[] }> = {
      1: { n: 7, cols: ["#7ab040", "#9ac24a", "#d8a040", "#5e9a34"] },
      2: { n: 6, cols: ["#5e8a4a", "#7a9a52", "#8aa83a", "#4e7a40"] },
      3: { n: 8, cols: ["#c8a050", "#b08840", "#d8b868", "#9a7a3a"] },
      5: { n: 22, cols: ["#d84a24", "#e8822a", "#f0b03a", "#b8341e", "#c86a2a"] },
      99: { n: 7, cols: ["#d8a040", "#b8742a", "#8aa83a", "#c8582a"] },
    };
    const lf = LEAF[this.mood];
    if (lf)
      for (let i = 0; i < lf.n; i++) {
        const sp = 26 + (i % 5) * 9;
        const lx = ((t * sp + i * 173) % (VIEW_W + 80)) - 40 + Math.sin(t * 1.1 + i * 2.3) * 14;
        const ly = ((i * 211 + t * (14 + (i % 6) * 3)) % (VIEW_H + 40)) - 20;
        const swing = Math.sin(t * 2.1 + i * 1.7);
        const spin = t * (1.5 + (i % 5) * 0.4) + i;
        ctx.save();
        ctx.globalAlpha = day * 0.9;
        ctx.translate(lx, ly);
        ctx.rotate(swing * 0.9 + spin * 0.3);
        const ls = 1.45 + (i % 3) * 0.2;
        ctx.scale(ls, ls * (Math.abs(Math.sin(spin * 1.3)) * 0.8 + 0.2));
        ctx.fillStyle = lf.cols[i % lf.cols.length]!;
        ctx.beginPath();
        ctx.moveTo(-4.4, 0);
        ctx.quadraticCurveTo(0, -2.8, 4.4, 0);
        ctx.quadraticCurveTo(0, 2.8, -4.4, 0);
        ctx.fill();
        ctx.strokeStyle = "rgba(60,30,10,0.45)";
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(-4.4, 0);
        ctx.lineTo(4, 0);
        ctx.stroke();
        ctx.restore();
      }
    // Birds: a flock every ~14 s crossing diagonally; shadow offset down-right (sun top-left).
    const period = 14;
    const n = Math.floor(t / period);
    const u = (t % period) / period;
    if (u < 0.6) {
      const p = u / 0.6;
      const seed = (n * 9301 + 49297) % 233280;
      const y0 = 60 + (seed % 300);
      const dir = seed % 2 ? 1 : -1;
      const bx = dir > 0 ? -60 + p * (VIEW_W + 120) : VIEW_W + 60 - p * (VIEW_W + 120);
      const by = y0 + p * 120;
      for (let b = 0; b < 5; b++) {
        const ox = (b % 2 ? 1 : -1) * Math.ceil(b / 2) * 14 * -dir;
        const oy = Math.ceil(b / 2) * 10;
        const flap = Math.sin(t * 14 + b * 1.3);
        const x = bx + ox, y = by + oy;
        // shadow
        ctx.fillStyle = `rgba(0,0,0,${0.16 * day})`;
        ctx.beginPath();
        ctx.ellipse(x + 34, y + 70, 5, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        // bird (a dark gull 'm')
        ctx.strokeStyle = `rgba(30,30,40,${0.85 * day})`;
        ctx.lineWidth = 1.8;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x - 6, y - flap * 3);
        ctx.quadraticCurveTo(x - 3, y - 3 - flap, x, y);
        ctx.quadraticCurveTo(x + 3, y - 3 - flap, x + 6, y - flap * 3);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private lightning = 0;
  private nextBolt = 6;
  /**
   * Chapter weather: the marsh (2) has slanting rain with ground splashes; the blood-red last
   * stand (5) gets lightning — a forked bolt and a white sky flash every 6-14 s. Screen space.
   */
  private drawWeather(ctx: CanvasRenderingContext2D, dt: number, o: Vec = { x: 0, y: 0 }): void {
    const t = this.time;
    // Night weather (gameplay): fog rolls in as drifting banks; rain/storm reuse the marsh rain.
    if (this.weatherNow === "fog") this.drawFog(ctx, o);
    const raining = this.weatherNow === "rain" || this.weatherNow === "storm";
    if (this.mood === 2 || raining) {
      ctx.save();
      // Three depths of rain: far drops are thin, faint, short and slow; near ones long, bright and
      // fast. Each streak leans exactly along its own fall direction (wind / speed).
      const layers = [
        { n: 60, sp: 420, wind: 70, len: 0.018, w: 0.8, a: 0.18 },
        { n: 45, sp: 600, wind: 100, len: 0.022, w: 1.1, a: 0.3 },
        { n: 22, sp: 820, wind: 140, len: 0.028, w: 1.7, a: 0.42 },
      ];
      layers.forEach((L, li) => {
        ctx.strokeStyle = `rgba(205,222,255,${L.a})`;
        ctx.lineWidth = L.w;
        ctx.beginPath();
        for (let i = 0; i < L.n; i++) {
          const sp = L.sp * (0.9 + ((i * 37 + li * 11) % 10) / 50);
          const x = ((i * 89.7 + li * 41 + t * L.wind) % (VIEW_W + 80)) - 40;
          const y = ((i * 131.3 + li * 77 + t * sp) % (VIEW_H + 60)) - 30;
          ctx.moveTo(x, y);
          ctx.lineTo(x - L.wind * L.len, y - sp * L.len);
        }
        ctx.stroke();
      });
      // Rain rings spreading on the ponds (world-pinned).
      ctx.strokeStyle = "rgba(220,235,255,0.55)";
      ctx.lineWidth = 1;
      for (const pd of this.ponds) {
        const px = pd.x - o.x, py = pd.y - o.y;
        if (px < -60 || px > VIEW_W + 60 || py < -40 || py > VIEW_H + 40) continue;
        for (let i = 0; i < 6; i++) {
          const u = (t * 1.6 + i / 6) % 1;
          const cyc = Math.floor(t * 1.6 + i / 6);
          const h1 = ((cyc * 7919 + i * 131 + Math.round(pd.x)) % 1000) / 1000, h2 = ((cyc * 104729 + i * 71) % 1000) / 1000;
          const a = h1 * Math.PI * 2, d = Math.sqrt(h2) * 0.75;
          const rx = px + Math.cos(a) * pd.rx * d, ry = py + Math.sin(a) * pd.ry * d;
          ctx.globalAlpha = (1 - u) * 0.9;
          ctx.beginPath();
          ctx.ellipse(rx, ry, 1 + u * 7, 0.5 + u * 3, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      // Splashes: tiny expanding rings where drops land.
      ctx.strokeStyle = "rgba(210,230,255,0.4)";
      for (let i = 0; i < 18; i++) {
        const k = (t * 2.2 + i * 0.37) % 1;
        const x = (i * 211.7) % VIEW_W, y = (i * 157.9 + Math.floor(t * 2.2 + i * 0.37) * 97) % VIEW_H;
        ctx.globalAlpha = 1 - k;
        ctx.beginPath();
        ctx.ellipse(x, y, 2 + k * 6, 1 + k * 2.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    } else if (this.mood === 1 && this.night < 0.95) {
      // Summer: soft shafts of sunlight slant down from the top-left and drift slowly, with motes of
      // pollen glittering inside them (fade out as night falls).
      const day = 1 - this.night;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 4; i++) {
        const cx = ((i * 190 + t * 6) % (VIEW_W + 420)) - 380; // beams lean right as they fall (sun top-left)
        const w = 46 + (i % 3) * 22;
        const a = (0.16 + 0.05 * Math.sin(t * 0.5 + i * 1.7)) * day;
        const g = ctx.createLinearGradient(cx - w, 0, cx + w, 0);
        g.addColorStop(0, "rgba(255,240,190,0)");
        g.addColorStop(0.3, `rgba(255,240,190,${(a * 0.6).toFixed(3)})`);
        g.addColorStop(0.5, `rgba(255,240,190,${a.toFixed(3)})`);
        g.addColorStop(0.7, `rgba(255,240,190,${(a * 0.6).toFixed(3)})`);
        g.addColorStop(1, "rgba(255,240,190,0)");
        ctx.fillStyle = g;
        ctx.save();
        ctx.translate(cx, 0);
        ctx.transform(1, 0, 0.45, 1, 0, 0);
        ctx.translate(-cx, 0);
        ctx.fillRect(cx - w, -20, w * 2, VIEW_H + 40);
        ctx.restore();
        for (let j = 0; j < 5; j++) {
          const u = (t * 0.06 + j / 5 + i * 0.13) % 1;
          const my = u * VIEW_H;
          const mx = cx + 0.45 * my + Math.sin(t * 0.9 + j * 2 + i) * w * 0.5; // inside the slanted beam
          this.drawBlob(ctx, this.glintBlob(), mx, my, 2, 2, day * 0.7 * Math.sin(u * Math.PI) * (0.5 + 0.5 * Math.sin(t * 3 + j)));
        }
      }
      ctx.restore();
    } else if (this.mood === 99) {
      // Endless: the crystals catch the light — a soft glow and a four-point star that flares on
      // each in turn, with motes drifting up off them.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const glow = this.blob("crys", [[0, "rgba(190,220,255,0.9)"], [0.5, "rgba(150,190,255,0.3)"], [1, "rgba(120,160,255,0)"]]);
      this.crystals.forEach((cr, i) => {
        const px = cr.x - o.x, py = cr.y - o.y;
        if (px < -30 || px > VIEW_W + 30 || py < -30 || py > VIEW_H + 30) return;
        const ph = (t * 0.35 + i * 0.618) % 1;
        const flare = ph < 0.12 ? Math.sin((ph / 0.12) * Math.PI) : 0;
        this.drawBlob(ctx, glow, px, py + 4, 9 * cr.s, 9 * cr.s, 0.35 + 0.15 * Math.sin(t * 2 + i) + flare * 0.6);
        if (flare > 0) {
          const L = (5 + flare * 9) * cr.s;
          ctx.strokeStyle = `rgba(255,255,255,${(flare * 0.95).toFixed(3)})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(px - L, py); ctx.lineTo(px + L, py);
          ctx.moveTo(px, py - L); ctx.lineTo(px, py + L);
          ctx.stroke();
        }
        const u = (t * 0.5 + i * 0.37) % 1;
        this.drawBlob(ctx, this.glintBlob(), px + Math.sin(u * 7 + i) * 6, py - u * 30, 2.4, 2.4, (1 - u) * 0.7);
      });
      ctx.restore();
    } else if (this.mood === 3) {
      // Dry plains: wind-blown grit skims the ground in streaks, and now and then a dust devil
      // spins across the field (pinned to the world, scrolling with the camera).
      ctx.save();
      for (let i = 0; i < 40; i++) {
        const span = VIEW_W + 120;
        const x = ((((i * 97.3 + t * (60 + (i % 5) * 18)) % span) + span) % span) - 60;
        const y = ((i * 151.7) % VIEW_H) + Math.sin(t * 2 + i) * 4;
        const a = 0.22 + 0.18 * Math.sin(t * 1.3 + i * 2.1);
        ctx.strokeStyle = `rgba(252,240,205,${Math.max(0, a * 1.5).toFixed(3)})`;
        ctx.lineWidth = 1.2 + (i % 3) * 0.6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 12 - (i % 4) * 5, y + 0.8);
        ctx.stroke();
      }
      const grit = this.blob("grit", [[0, "rgba(236,214,166,0.9)"], [0.6, "rgba(220,196,150,0.4)"], [1, "rgba(210,186,140,0)"]]);
      for (let d = 0; d < 2; d++) {
        const cyc = 14 + d * 5, u = ((t + d * 7) % cyc) / cyc;
        if (u > 0.6) continue;
        const k = u / 0.6, fade = Math.sin(k * Math.PI);
        const wx = -60 + k * (MAP_W + 120), wy = 300 + d * 420 + Math.sin(k * 6) * 30;
        const sx = wx - o.x, sy = wy - o.y;
        for (let j = 0; j < 10; j++) {
          const h = j / 9, ang = t * 9 + j * 1.3;
          const rr = 9 + h * 28;
          this.drawBlob(ctx, grit, sx + Math.cos(ang) * rr * 0.55 + h * 10, sy - h * 85, rr, rr * 0.45, fade * (0.95 - h * 0.45));
        }
      }
      ctx.restore();
    } else if (this.mood === 4) {
      // Hollow Night: banks of low mist creep across the field in layers (pinned to the world,
      // drifting at different speeds), thickest out on the battlefield.
      const mist = this.blob("mist2", [[0, "rgba(170,190,225,1)"], [0.5, "rgba(150,170,210,0.55)"], [1, "rgba(130,150,190,0)"]]);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      // Will-o'-wisps: pale blue-green lights that rise from the graves, bob, and fade.
      const wisp = this.blob("gwisp", [[0, "rgba(210,255,240,1)"], [0.35, "rgba(120,230,210,0.55)"], [1, "rgba(80,200,190,0)"]]);
      this.graves.forEach((g, i) => {
        const px = g.x - o.x, py = g.y - o.y;
        if (px < -40 || px > VIEW_W + 40 || py < -80 || py > VIEW_H + 20) return;
        const u = (t * 0.22 + i * 0.37) % 1;
        if (u > 0.7) return;
        const k = u / 0.7, a = Math.sin(k * Math.PI);
        const wx = px + Math.sin(t * 1.3 + i * 2) * 8, wy = py - 6 - k * 34 + Math.sin(t * 3 + i) * 3;
        this.drawBlob(ctx, wisp, wx, wy, 7, 7, a * 0.9);
        this.drawBlob(ctx, wisp, wx - Math.sin(t * 1.3 + i * 2) * 3, wy + 6, 3.5, 3.5, a * 0.4);
      });
      for (let i = 0; i < 16; i++) {
        const layer = i % 3;
        const span = MAP_W + 400;
        const wx = ((((i * 173.3 + t * (7 + layer * 5)) % span) + span) % span) - 200;
        const wy = 120 + ((i * 97.7) % (MAP_H - 200)) + Math.sin(t * 0.3 + i) * 10;
        const sx = wx - o.x, sy = wy - o.y;
        const rw = 110 + layer * 40, rh = 26 + layer * 8;
        if (sx < -rw || sx > VIEW_W + rw || sy < -rh || sy > VIEW_H + rh) continue;
        const field = wy < WALL_Y ? 0.7 : 0.5;
        this.drawBlob(ctx, mist, sx, sy, rw, rh, (0.8 + 0.2 * Math.sin(t * 0.4 + i * 1.3)) * field);
      }
      ctx.restore();
    }
    if ((this.mood === 5 || this.lightning > 0) && dt > 0) {
      this.nextBolt -= dt;
      if (this.mood === 5 && this.nextBolt <= 0) {
        this.boltTarget = null;
        this.lightning = 1;
        this.nextBolt = 6 + ((t * 7.31) % 8);
        this.boltSeed = Math.floor(t * 1000);
      }
      if (this.lightning > 0) {
        const k = this.lightning;
        // Double-flicker flash.
        const flick = k > 0.75 || (k > 0.45 && k < 0.6) ? 1 : 0.4;
        ctx.fillStyle = `rgba(235,225,255,${0.35 * k * flick})`;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        // Forked bolt from the sky down to a strike point on the field: jagged by midpoint
        // displacement, drawn as a wide soft glow under a white-hot core, with a ground flash.
        let seed = this.boltSeed;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        let sx = 60 + rnd() * (VIEW_W - 120), ex = sx + (rnd() - 0.5) * 140, ey = VIEW_H * (0.45 + rnd() * 0.25);
        // A storm-weather bolt strikes a real foe.
        if (this.boltTarget) { ex = this.boltTarget.x - o.x; ey = this.boltTarget.y - o.y - 10; sx = ex + (rnd() - 0.5) * 120; }
        const bolt = (x0: number, y0: number, x1: number, y1: number, d: number, out: [number, number][]): void => {
          if (d <= 0) { out.push([x1, y1]); return; }
          const mx = (x0 + x1) / 2 + (rnd() - 0.5) * Math.hypot(x1 - x0, y1 - y0) * 0.35, my = (y0 + y1) / 2;
          bolt(x0, y0, mx, my, d - 1, out);
          bolt(mx, my, x1, y1, d - 1, out);
        };
        const main: [number, number][] = [[sx, -10]];
        bolt(sx, -10, ex, ey, 5, main);
        const fi = 8 + Math.floor(rnd() * 10);
        const [fx0, fy0] = main[fi]!;
        const fork: [number, number][] = [[fx0, fy0]];
        bolt(fx0, fy0, fx0 + (rnd() > 0.5 ? 1 : -1) * (50 + rnd() * 60), fy0 + 60 + rnd() * 60, 3, fork);
        const stroke = (pts: [number, number][], w: number, col: string): void => {
          ctx.strokeStyle = col;
          ctx.lineWidth = w;
          ctx.beginPath();
          pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
          ctx.stroke();
        };
        ctx.save();
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.globalCompositeOperation = "lighter";
        stroke(main, 14, `rgba(150,130,255,${0.18 * k})`);
        stroke(main, 6, `rgba(200,190,255,${0.4 * k})`);
        stroke(main, 2.2, `rgba(255,255,255,${k})`);
        stroke(fork, 6, `rgba(170,150,255,${0.25 * k})`);
        stroke(fork, 1.4, `rgba(255,250,255,${0.85 * k})`);
        // Where it strikes, the ground flares.
        this.drawBlob(ctx, this.blob("strike", [[0, "rgba(255,250,255,1)"], [0.3, "rgba(200,180,255,0.6)"], [1, "rgba(150,120,255,0)"]]), ex, ey, 46 * k, 18 * k, k);
        ctx.restore();
        this.lightning = Math.max(0, k - dt * 2.4);
      }
    }
  }
  private boltSeed = 1;

  private sunlight: CanvasGradient | undefined;
  private vignette: CanvasGradient | undefined;

  private makeSunlight(ctx: CanvasRenderingContext2D): CanvasGradient {
    const g = ctx.createLinearGradient(0, 0, VIEW_W, VIEW_H);
    g.addColorStop(0, "rgba(255,236,190,0.10)");
    g.addColorStop(0.5, "rgba(255,255,255,0)");
    g.addColorStop(1, "rgba(30,40,80,0.10)");
    return g;
  }

  private makeVignette(ctx: CanvasRenderingContext2D): CanvasGradient {
    const g = ctx.createRadialGradient(VIEW_W * 0.45, VIEW_H * 0.45, VIEW_H * 0.35, VIEW_W * 0.5, VIEW_H * 0.5, VIEW_H * 0.75);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(10,16,30,0.22)");
    return g;
  }

  /** Fallen enemies: a white hit-flash, then they tip over sideways and fade (~0.5 s). */
  /** A sapper's bomb tucked under his arm: shaded iron ball, brass cap, a fuse that sparks and sputters. */
  private drawSapperBomb(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, flip: boolean, seed: number, frame: number, walking: boolean): void {
    const side = flip ? 1 : -1;
    const bob = walking ? Math.abs(Math.sin((frame / 8) * Math.PI * 2)) * 1.2 : 0;
    const bx = x + side * r * 0.75, by = y - r * 0.55 - bob, br = r * 0.42;
    const g = ctx.createRadialGradient(bx - br * 0.35, by - br * 0.4, br * 0.1, bx, by, br);
    g.addColorStop(0, "#6a6e78");
    g.addColorStop(0.5, "#2e3038");
    g.addColorStop(1, "#141418");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#b08a3a";
    ctx.fillRect(bx - br * 0.28, by - br * 1.12, br * 0.56, br * 0.3);
    // Fuse: a little curl ending in a sputtering spark.
    const fx = bx + side * br * 0.35, fy = by - br * 1.55;
    ctx.strokeStyle = "#5a4630";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(bx, by - br * 1.1);
    ctx.quadraticCurveTo(bx + side * br * 0.5, by - br * 1.3, fx, fy);
    ctx.stroke();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    this.drawFlame(ctx, fx, fy, 0.32 + 0.08 * Math.sin(this.time * 37 + seed), seed * 1.3, 0.95);
    ctx.restore();
    if (Math.sin(this.time * 23 + seed * 2.1) > 0.92) this.fx.burst(fx, fy, "#ffd060", 2, 70, { max: 0.25, size: 1.6, gravity: 160, shape: "spark" });
  }

  /** Planks tumbling out of a breach: thrown, spinning, landing and lying a while before fading. */
  private drawPlanks(ctx: CanvasRenderingContext2D, dt: number): void {
    this.planks = this.planks.filter((p) => this.time - p.t < 4);
    for (const p of this.planks) {
      if (p.y < p.gy || p.vy < 0) {
        p.vy += 700 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.a += p.va * dt;
        if (p.y >= p.gy && p.vy > 0) {
          p.y = p.gy;
          p.vy = Math.abs(p.vy) > 120 ? -Math.abs(p.vy) * 0.3 : 0;
          p.vx *= 0.5;
          p.va *= 0.4;
          if (p.vy === 0) p.a = Math.round(p.a / Math.PI) * Math.PI + (p.a % 0.3);
        }
      }
      const age = this.time - p.t;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (4 - age) / 0.8);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillStyle = "#8a5a2e";
      ctx.fillRect(-9, -2.2, 18, 4.4);
      ctx.fillStyle = "#b47a40";
      ctx.fillRect(-9, -2.2, 18, 1.4);
      ctx.fillStyle = "#e8c890";
      ctx.fillRect(7.6, -2.2, 1.4, 4.4);
      ctx.restore();
    }
  }

  /** Wall repairs: for every segment whose HP jumped back up, fresh planks fly in from the camp
   *  side on arcs, slot into place with a knock of sawdust. */
  private drawRepairs(ctx: CanvasRenderingContext2D, c: Camp): void {
    c.segments.forEach((sg, i) => {
      const prev = this.segHpSeen[i];
      if (prev !== undefined && sg.hp - prev > sg.maxHp * 0.25 && this.repairs.length < 30) this.repairs.push({ seg: i, t: this.time });
      this.segHpSeen[i] = sg.hp;
    });
    this.repairs = this.repairs.filter((r) => this.time - r.t < 0.75);
    for (const r of this.repairs) {
      const cx = r.seg * SEGMENT_W + SEGMENT_W / 2;
      for (let k = 0; k < 3; k++) {
        const u = Math.min(1, Math.max(0, (this.time - r.t - k * 0.1) / 0.45));
        if (u <= 0) continue;
        const tx = cx + (k - 1) * 10, ty = WALL_Y - 4;
        const sx0 = tx + (k - 1) * 30, sy0 = WALL_Y + 70;
        const e = 1 - (1 - u) * (1 - u);
        const px = sx0 + (tx - sx0) * e, py = sy0 + (ty - sy0) * e - Math.sin(u * Math.PI) * 40;
        if (u >= 1) {
          if (!this.repairKnock.has(`${r.seg}:${k}:${r.t}`)) {
            this.repairKnock.add(`${r.seg}:${k}:${r.t}`);
            this.fx.burst(tx, ty, "#e8c890", 4, 60, { max: 0.3, size: 2, gravity: 200, shape: "chunk" });
          }
          continue;
        }
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate((1 - e) * (k - 1) * 2.4 + Math.PI / 2 * (1 - e));
        ctx.fillStyle = "#8a5a2e";
        ctx.fillRect(-2.4, -10, 4.8, 20);
        ctx.fillStyle = "#b47a40";
        ctx.fillRect(-2.4, -10, 1.6, 20);
        ctx.restore();
      }
    }
    if (this.repairKnock.size > 200) this.repairKnock.clear();
  }
  private repairKnock = new Set<string>();

  /** Ability shockwaves: a ring of ground dust racing outward (ease-out) and thinning, with a
   *  bright leading edge (fiery for Nova, pale for Shield Bash). */
  private drawShockwaves(ctx: CanvasRenderingContext2D): void {
    this.shockwaves = this.shockwaves.filter((w) => this.time - w.t < 0.7);
    const dust = this.blob("dust", [[0, "rgba(206,190,164,0.9)"], [0.6, "rgba(196,180,150,0.45)"], [1, "rgba(190,172,140,0)"]]);
    for (const w of this.shockwaves) {
      const u = (this.time - w.t) / 0.7;
      const e = 1 - (1 - u) ** 3;
      const R = w.r * (0.2 + 0.9 * e);
      const n = 22;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = w.x + Math.cos(a) * R, py = w.y + Math.sin(a) * R * 0.5;
        this.drawBlob(ctx, dust, px, py - 4 * (1 - u), 10 + u * 10, 7 + u * 7, (1 - u) * 0.7);
      }
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = w.nova ? `rgba(255,150,60,${(0.6 * (1 - u)).toFixed(3)})` : `rgba(210,225,255,${(0.6 * (1 - u)).toFixed(3)})`;
      ctx.lineWidth = 3 + 6 * (1 - u);
      ctx.beginPath();
      ctx.ellipse(w.x, w.y, R, R * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Sapper explosions: fireball swelling and cooling (0.45 s), then a smoke column that rises,
   *  spreads and thins (2 s). */
  private drawBlasts(ctx: CanvasRenderingContext2D): void {
    this.blasts = this.blasts.filter((b) => this.time - b.t < 2);
    const fire = this.blob("fireball", [[0, "rgba(255,210,120,1)"], [0.35, "rgba(255,120,30,0.85)"], [1, "rgba(220,50,10,0)"]]);
    const smoke = this.blob("smoke", [[0, "rgba(60,54,50,0.85)"], [0.6, "rgba(70,64,60,0.45)"], [1, "rgba(80,74,70,0)"]]);
    for (const b of this.blasts) {
      const age = this.time - b.t;
      // Smoke first (behind the fire): puffs climbing and widening, leaning with the wind.
      for (let i = 0; i < 7; i++) {
        const u = Math.min(1, Math.max(0, (age - i * 0.06) / 1.9));
        if (u <= 0) continue;
        const rr = 12 + u * 26 + i * 2;
        this.drawBlob(ctx, smoke, b.x + u * 18 + Math.sin(i * 2.3) * 8 * u, b.y - 10 - u * 70 - i * 6, rr, rr * 0.85, (1 - u) * 0.8);
      }
      if (age < 0.45) {
        const u = age / 0.45;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        this.drawBlob(ctx, fire, b.x, b.y - 14 - u * 16, 22 + u * 26, 20 + u * 22, (1 - u) * (1 - u) * 1.2);
        this.drawBlob(ctx, this.glintBlob(), b.x, b.y - 12, 14 * (1 - u), 12 * (1 - u), 1 - u);
        ctx.restore();
      }
    }
  }

  /** Fallen knights: full death animation, dust on landing, a beat of stillness, eased fade. */
  private drawAllyFalls(ctx: CanvasRenderingContext2D): void {
    const LIFE = 1.8;
    this.allyFalls = this.allyFalls.filter((f) => this.time - f.t < LIFE);
    for (const f of this.allyFalls) {
      const age = this.time - f.t;
      if (!f.landed && age > 0.45) {
        f.landed = true;
        this.fx.burst(f.x + (f.flip ? 10 : -10), f.y + 9, "rgba(200,184,150,0.75)", 8, 55, { max: 0.55, size: 4, gravity: -16, drag: 4 });
      }
      const u = Math.min(1, Math.max(0, (age - 1.0) / (LIFE - 1.0)));
      ctx.save();
      ctx.globalAlpha = 1 - u * u * (3 - 2 * u);
      drawAnim(ctx, "knight_ally", "death", animFrame("death", age, 12), f.x, f.y + 9.5 + u * 2, 36, { flip: f.flip, flash: age < 0.07 ? 0.7 : 0 });
      ctx.restore();
    }
  }

  private drawCorpses(ctx: CanvasRenderingContext2D): void {
    const LIFE = 1.2;
    const ANIM_LIFE = 1.7;
    this.corpses = this.corpses.filter((k) => this.time - k.t < (ENEMY_ANIMS[k.id] ? ANIM_LIFE : LIFE));
    // Stains first (under the bodies): a soft dark patch that lingers, then fades.
    this.stains = this.stains.filter((st) => this.time - st.t < 4);
    for (const st of this.stains) {
      const v = (this.time - st.t) / 4;
      softShadow(ctx, st.x, st.y, st.r * 1.3, st.r * 0.5, 0.22 * (1 - v) * Math.min(1, (this.time - st.t) * 3));
    }
    for (const k of this.corpses) {
      const age = this.time - k.t;
      const an = ENEMY_ANIMS[k.id];
      // As the body begins to fade it dissolves: pale motes drift up off it, leaving a stain.
      const fadeAt = an ? 1.0 : 0.6;
      if (age > fadeAt && !k.motes) {
        k.motes = true;
        const big = Math.min(2, k.r / 12);
        this.fx.burst(k.x + k.dir * k.r * 0.5, k.y + k.r * 0.4, "rgba(236,228,206,0.85)", Math.round(7 * big), 26, { max: 0.9, size: 2.2, gravity: -55, drag: 2.2, shape: "spark" });
        if (this.stains.length > 20) this.stains.shift();
        this.stains.push({ x: k.x + k.dir * k.r * 0.6, y: k.y + k.r * 0.9, r: k.r, t: this.time });
      }
      if (an) {
        // Painted death animation (~0.5 s); a puff of dust as the body hits the ground, a beat of
        // stillness, then an eased fade while it sinks a touch into the grass.
        if (!k.landed && age > 0.4) {
          k.landed = true;
          const big = Math.min(2, k.r / 12);
          this.fx.burst(k.x + k.dir * k.r * 0.6, k.y + k.r * 0.8, "rgba(200,184,150,0.75)", Math.round(6 * big), 46 * big, { max: 0.55, size: 4 * big, gravity: -18, drag: 4 });
        }
        const u = Math.min(1, Math.max(0, (age - 1.0) / (ANIM_LIFE - 1.0)));
        const fade = 1 - u * u * (3 - 2 * u);
        ctx.save();
        ctx.globalAlpha = fade;
        const ok = drawAnim(ctx, an.name, "death", animFrame("death", age, 12, an.name), k.x, k.y + k.r * 0.95 + u * 3, k.r * an.h, { flip: k.dir < 0, flash: age < 0.07 ? 0.7 : 0 });
        ctx.restore();
        if (ok) continue;
      }
      // Topples like a falling body: accelerating (ease-in), a small bounce as it lands, a puff of
      // dust, then lies still and eases away.
      const T = 0.32;
      let ease: number;
      if (age < T) ease = (age / T) ** 2;
      else {
        const b = age - T;
        ease = 1 - (b < 0.2 ? Math.sin((b / 0.2) * Math.PI) * 0.12 : 0);
        if (!k.landed) {
          k.landed = true;
          this.fx.burst(k.x + k.dir * k.r * 1.2, k.y + k.r * 0.8, "rgba(200,184,150,0.75)", Math.round(5 * Math.min(2, k.r / 12)), 44, { max: 0.5, size: 4, gravity: -16, drag: 4 });
        }
      }
      const footY = k.y + k.r * 0.9;
      const u = Math.min(1, Math.max(0, (age - 0.6) / (LIFE - 0.6)));
      ctx.save();
      ctx.globalAlpha = 1 - u * u * (3 - 2 * u);
      ctx.translate(k.x, footY);
      ctx.rotate(k.dir * ease * 1.45);
      ctx.scale(1 + (1 - ease) * 0.12, 1 - ease * 0.2);
      ctx.translate(-k.x, -footY);
      const sp = ENEMY_SPRITES[k.id];
      const drawn = sp !== undefined && drawSprite(ctx, sp.name, k.x, k.y + k.r * 0.95, k.r * sp.h, { walk: 0, time: 0, seed: 0, flip: false, flash: age < 0.07 ? 1 : 0, lunge: 0 });
      if (!drawn) drawUnitCached(ctx, k.id, k.x, k.y, k.r * 0.95, 0, Math.PI / 2 - 0.4, age < 0.07, 0);
      ctx.restore();
    }
  }

  /** Enemies that have already pushed out through the forest edge (for the leaf rustle). */
  private brokeCover = new Set<number>();
  private drawEnemy(ctx: CanvasRenderingContext2D, c: Camp, e: Enemy): void {
    const r = e.def.radius;
    if (e.burrow && e.burrow > 0) {
      // Underground: a heaving mound of dirt crawls under the wall, kicking up clods.
      const heave = Math.sin(c.time * 14 + e.id) * 1.5;
      ctx.save();
      softShadow(ctx, e.x, e.y + 4, r * 1.3, r * 0.45, 0.3);
      ctx.fillStyle = "#6a4a2a";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(e.x, e.y + 2 - heave * 0.4, r * 1.15, r * 0.55 + heave * 0.3, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#8a6a40";
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(e.x - r * 0.5 + k * r * 0.5, e.y - r * 0.15 - heave * 0.3, 2.4, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      if (Math.floor(c.time * 10 + e.id) % 2 === 0 && this.fx.particles.length < 400) this.fx.burst(e.x, e.y, "#7a5a32", 1, 50, { max: 0.4, size: 2.4, gravity: 260, shape: "chunk" });
      return;
    }
    // Walkers pushing out of the treeline rustle the undergrowth: a spray of leaves and a little
    // dust where they break cover.
    if (!e.def.flying && e.y > FOREST_Y - 6 && e.y < FOREST_Y + 40 && !this.brokeCover.has(e.id)) {
      this.brokeCover.add(e.id);
      const leaf = this.mood === 5 ? "#d8742a" : this.mood === 3 ? "#b89848" : this.mood === 4 ? "#4a5a48" : "#4e8a3a";
      this.fx.burst(e.x, e.y - r * 0.6, leaf, 5, 60, { max: 0.8, size: 2.6, gravity: 90, drag: 2 });
      this.fx.burst(e.x, e.y + r * 0.8, "rgba(160,150,120,0.6)", 3, 30, { max: 0.4, size: 3, gravity: -10, drag: 4 });
    }
    if (this.brokeCover.size > 300) { const live = new Set(c.enemies.map((q) => q.id)); for (const id of this.brokeCover) if (!live.has(id)) this.brokeCover.delete(id); }
    // Fresh spawns fade in out of the dark of the woods rather than popping into existence.
    if (e.age < 0.5 && !e.def.boss) {
      ctx.save();
      ctx.globalAlpha *= e.age / 0.5;
      this.drawEnemyInner(ctx, c, e);
      ctx.restore();
      return;
    }
    this.drawEnemyInner(ctx, c, e);
  }

  /** Strike telegraph: in the last ~0.35 s before an enemy's blow lands, a red ring tightens under
   *  it and a glint flares on its weapon side, so incoming hits read before they connect. */
  private drawStrikeTell(ctx: CanvasRenderingContext2D, e: Enemy): void {
    if (!e.attacking || e.def.flying) return;
    const W = 0.35;
    if (e.attackTimer > W || e.attackTimer <= 0) return;
    const u = 1 - e.attackTimer / W; // 0 -> 1 as the blow comes due
    const r = e.def.radius;
    ctx.save();
    ctx.globalAlpha = 0.25 + u * 0.55;
    ctx.strokeStyle = "#ff4a2a";
    ctx.lineWidth = 1.5 + u * 1.5;
    const rr = r * (2.2 - u * 1.1);
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + r * 0.9, rr, rr * 0.4, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (u > 0.55) {
      const mv = this.enemyMove.get(e.id);
      const side = mv?.flip ? 1 : -1;
      const gx = e.x + side * r * 0.9, gy = e.y - r * 1.4;
      const a = Math.sin(((u - 0.55) / 0.45) * Math.PI);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = a;
      ctx.fillStyle = "#fff0d0";
      ctx.translate(gx, gy);
      ctx.rotate(u * 1.5);
      const L = 5 + a * 4;
      ctx.beginPath();
      for (let q = 0; q < 4; q++) {
        const an = (q * Math.PI) / 2;
        ctx.lineTo(Math.cos(an) * L, Math.sin(an) * L);
        ctx.lineTo(Math.cos(an + Math.PI / 4) * 1.1, Math.sin(an + Math.PI / 4) * 1.1);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawEnemyInner(ctx: CanvasRenderingContext2D, c: Camp, e: Enemy): void {
    const r = e.def.radius;
    if (e.def.boss) {
      // Menace: a pulsing red glow pooled on the ground under the boss (brighter after dark).
      const menace = this.blob("menace", [[0, "rgba(255,60,30,1)"], [1, "rgba(255,60,30,0)"]]);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      this.drawBlob(ctx, menace, e.x, e.y + r * 0.85, r * 3.2, r * 1.3, (0.18 + 0.32 * this.night) * (0.85 + 0.15 * Math.sin(this.time * 3)));
      ctx.restore();
    }
    this.drawStrikeTell(ctx, e);
    const id = e.def.id;
    const lunge = e.attacking ? Math.max(0, 1 - (e.def.attackInterval - e.attackTimer) / 0.2) : 0;
    const flash = e.flash > 0;
    const x = e.x;
    const y = e.y + lunge * 4;
    const red = reduction(e);
    const walk = e.attacking ? 0 : c.time * (8 + e.def.speed * 0.05) + e.sway;
    if (e.def.flying) {
      // Flyers cast a smaller, fainter shadow further below them (height cue); it swells and darkens
      // as the flyer dips on its bob and shrinks as it rises.
      const bob = id === "bat" || id === "raven" ? Math.sin(c.time * 6 + e.sway) : 0;
      const k = 1 + bob * 0.12;
      softShadow(ctx, e.x, e.y + r * 1.9, r * 0.85 * k, r * 0.32 * k, 0.2 * (1 + bob * 0.25));
    } else {
      // Walkers: the shadow travels with the lunge (so the body never slides off it), widens a
      // touch on each footfall, and has a tight dark core right under the feet to plant them.
      const fall = e.attacking ? 0 : Math.abs(Math.cos(walk));
      const w = 1 + fall * 0.06 + lunge * 0.1;
      softShadow(ctx, e.x, y + r * 0.95, r * 1.15 * w, r * 0.45 * w, 0.34);
      softShadow(ctx, e.x - r * 0.15, y + r * 0.9, r * 0.6 * w, r * 0.2, 0.2);
    }
    const baseA = ctx.globalAlpha;
    ctx.globalAlpha = baseA * (red >= 1 ? 0.35 : id === "wraith" ? 0.8 : 1);
    if (id === "raven") {
      // War Raven: a bigger, faster-flapping dark wing-beast with burning red eyes and a red
      // war-paint streak, trailing dark feathers as it dives at a tower.
      const by = y - 6 + Math.sin(c.time * 9 + e.sway) * 2;
      if (!this.drawBat3d(ctx, x, by, r * 1.25, c.time * 1.4 + e.sway, flash, "bat", this.bankFor(e.id, e.x, 0.6))) drawBat(ctx, x, by, r * 1.25, c.time * 1.4 + e.sway, flash);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const eye = this.blob("raveneye", [[0, "rgba(255,120,80,1)"], [0.5, "rgba(255,40,20,0.7)"], [1, "rgba(255,0,0,0)"]]);
      this.drawBlob(ctx, eye, x - 3, by - r * 0.35, 4.5, 4.5, 0.95);
      this.drawBlob(ctx, eye, x + 3, by - r * 0.35, 4.5, 4.5, 0.95);
      ctx.restore();
      ctx.strokeStyle = "#d8302a"; ctx.lineWidth = 2; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x - 5, by - r * 0.85); ctx.lineTo(x, by - r * 1.15); ctx.lineTo(x + 5, by - r * 0.85); ctx.stroke();
      if (Math.floor(c.time * 8 + e.id) % 3 === 0 && this.fx.particles.length < 400) this.fx.burst(x, by, "#2a2438", 1, 30, { max: 0.5, size: 2.4, gravity: 40, shape: "chunk" });
    }
    else if (id === "bat") {
      const by = y - 6 + Math.sin(c.time * 6 + e.sway) * 3;
      if (!this.drawBat3d(ctx, x, by, r, c.time + e.sway, flash, "bat", this.bankFor(e.id, e.x, 0.45))) drawBat(ctx, x, by, r, c.time + e.sway, flash);
    }
    else if (id === "ram") {
      // 3D ram: rocks on its wheels while rolling; the log thrusts forward on each strike.
      const roll = e.attacking ? 0 : Math.sin(walk * 1.2) * 0.04;
      const thrust = e.attacking ? Math.max(0, 1 - (e.def.attackInterval - e.attackTimer) / 0.25) : 0;
      const k = r / 16;
      ctx.save();
      ctx.translate(x, y + r * 0.9);
      ctx.rotate(roll);
      const ok = buildingSprite(ctx, "ram_body", 0, thrust * 7, k);
      ctx.restore();
      // The log slams the gate: splinters and a thud on each strike; rolling, the wheels kick up
      // dust every few lengths travelled.
      const struck = thrust > 0.9;
      if (struck && !this.ramStruck.has(e.id)) {
        this.ramStruck.add(e.id);
        this.fx.burst(x, y + r * 0.9 + 9, "#a8865a", 8, 150, { max: 0.5, size: 3.5, gravity: 420, shape: "chunk" });
        this.fx.burst(x, y + r * 0.9 + 9, "rgba(206,190,160,0.8)", 5, 50, { max: 0.5, size: 5, gravity: -10, drag: 4 });
        if (this.fx.trauma < 0.3) this.fx.shake(0.12);
      } else if (!struck) this.ramStruck.delete(e.id);
      if (!e.attacking) {
        const ph = this.walkPhase(`ram${e.id}`, e.x, e.y, r * 2.4);
        const step = Math.floor(ph / 2);
        const key = -100000 - e.id;
        if (this.chopLast.get(key) !== step) {
          this.chopLast.set(key, step);
          this.fx.burst(x + (step % 2 ? r * 0.7 : -r * 0.7), y + r * 0.95, "rgba(200,184,150,0.7)", 2, 30, { max: 0.45, size: 4, gravity: -12, drag: 4 });
        }
      }
      if (!ok) drawRam(ctx, x, y, r, walk, flash);
      else if (flash) {
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.beginPath();
        ctx.ellipse(x, y, r * 1.1, r * 1.3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    else if (id === "dragon") this.drawDragon(ctx, c, e, flash);
    else {
      // Attackers swing their weapon down at the wall.
      const swing = e.attacking ? -lunge * 1.4 : 0;
      const an = ENEMY_ANIMS[id];
      let drawn = false;
      let mv = this.enemyMove.get(e.id);
      if (!mv) {
        mv = { x: e.x, flip: false, atkFrom: -1 };
        this.enemyMove.set(e.id, mv);
      }
      if (Math.abs(e.x - mv.x) > 0.15) mv.flip = e.x > mv.x;
      mv.x = e.x;
      if (!e.attacking) mv.atkFrom = -1;
      else if (mv.atkFrom < 0) mv.atkFrom = c.time;
      // Boss footfalls: each step thuds — a little shake and a dust puff at the feet.
      if (e.def.boss && !this.ambient) {
        if (e.attacking) mv.step = undefined;
        else {
        // Footfalls follow the distance-driven walk phase (contacts at sheet poses ~0 and ~4).
        const ph = this.gait.get(`e${e.id}`)?.ph ?? 0;
        const stepN = Math.floor((ph + 0.5) / 4);
        if (mv.step !== undefined && stepN !== mv.step) {
          if (this.fx.trauma < 0.25) this.fx.shake(0.06);
          this.fx.burst(e.x + (stepN % 2 ? 10 : -10), e.y + r * 0.9, "rgba(200,180,140,0.85)", 6, 60, { max: 0.5, size: 5, gravity: -15, drag: 3 });
        }
        mv.step = stepN;
        }
      }
      const eflip = mv.flip;
      if (an) {
        // Frame-animated: walk while marching; at the wall the wind-up is timed so the impact
        // frame lands on the actual strike; a flinch frame while hit-flashing.
        let anim: AnimName = "walk";
        let frame = 0;
        const sinceStrike = e.def.attackInterval - e.attackTimer;
        if (flash) {
          anim = "hit";
          frame = 1;
        } else if (e.attacking) {
          // Only play the strike once one has actually happened since reaching the wall.
          if (sinceStrike < 0.27 && c.time - mv.atkFrom >= sinceStrike) {
            anim = "attack";
            frame = 3 + Math.min(2, sinceStrike / 0.09);
          } else if (e.attackTimer < 0.3) {
            anim = "attack";
            frame = Math.min(2, (0.3 - e.attackTimer) / 0.1);
          } else {
            anim = "idle";
            frame = animFrame("idle", c.time + e.sway, 5 + ((e.id * 37) % 7) * 0.3); // each its own breathing pace
          }
        } else {
          // Stride scales with the drawn size (bigger brutes take longer steps).
          frame = this.walkPhase(`e${e.id}`, e.x, e.y, Math.max(30, r * an.h * 1.45), e.sway);
        }
        // Hit recoil: a quick knock back up the field (away from the defenders) with a squash.
        // Eased over 0.3 s: snaps back fast, settles slowly, with a springy squash that rings out.
        if (e.flash > (mv.lastFlash ?? 0)) mv.hitAt = this.time;
        mv.lastFlash = e.flash;
        const ht = this.time - (mv.hitAt ?? -9);
        const kick = ht < 0.3 ? (1 - ht / 0.3) ** 2 : 0;
        const ring = ht < 0.4 ? Math.sin(ht * 34) * Math.exp(-ht * 11) : 0;
        // Slight per-enemy size variation so the horde doesn't look cloned.
        const vary = e.def.boss ? 1 : 0.9 + ((e.id * 7919) % 100) / 500;
        drawn = drawAnim(ctx, an.name, anim, frame, e.x, e.y + r * 0.95 - kick * 3.5, r * an.h * vary, { flip: eflip, flash: flash ? 0.6 : 0, squash: ring * 0.9, key: `e${e.id}` });
        if (drawn && id === "sapper") this.drawSapperBomb(ctx, e.x, e.y, r, eflip, e.id, frame, anim === "walk");
      }
      const sp = ENEMY_SPRITES[id];
      if (!drawn && id === "wraith" && sp) {
        // Ghostly afterimages trailing back up the field and wisps curling off the hem.
        const a0 = ctx.globalAlpha;
        for (let i = 3; i >= 1; i--) {
          ctx.globalAlpha = a0 * 0.26 * (4 - i) / 3;
          drawSprite(ctx, sp.name, x + Math.sin(c.time * 2 + e.sway - i * 0.6) * 2, y + r * 0.95 - i * 10, r * sp.h * (1 - i * 0.05), { walk: 0, time: c.time - i * 0.15, seed: e.sway, flip: eflip, flash: 0, lunge: 0 });
        }
        ctx.globalAlpha = a0;
        const wisp = this.blob("wisp", [[0, "rgba(190,210,255,0.7)"], [1, "rgba(190,210,255,0)"]]);
        for (let i = 0; i < 4; i++) {
          const u = (c.time * 0.8 + i / 4 + e.sway) % 1;
          this.drawBlob(ctx, wisp, x + Math.sin(u * 6 + i * 1.7) * r * 0.6, y + r * 0.5 - u * r * 2.2, 5 + u * 6, 5 + u * 6, (1 - u) * 0.85 * a0);
        }
      }
      if (!drawn)
        drawn =
          sp !== undefined &&
          drawSprite(ctx, sp.name, x, y + r * 0.95, r * sp.h, { walk: e.attacking ? 0 : 0.001 + (this.walkPhase(`e${e.id}`, e.x, e.y, Math.max(30, r * sp.h * 1.45), e.sway) * Math.PI) / 4, time: c.time, seed: e.sway, flip: eflip, flash: flash ? 1 : 0, lunge, key: `s${e.id}` });
      if (!drawn) drawUnitCached(ctx, LOOKS[id] ? id : "footman", x, y, r * 0.95, walk, Math.PI / 2 - 0.4, flash, swing);
      if (drawn && sp && sp.name === "wraith") {
        // The wraith's ghost-fire burns cold and blue in the same raised hand.
        const h = r * sp.h, w = (h * 128) / 165;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        this.drawFlame(ctx, x + (eflip ? -1 : 1) * 0.32 * w, y + r * 0.95 - 0.8 * h - (3 + Math.sin(c.time * 2.2 + e.sway) * 2.5), (h / 60) * 0.55, e.id * 0.91, 0.7, true);
        ctx.restore();
      }
      if (drawn && sp && sp.name === "elite_mage") {
        // The fire in his raised hand flickers alive, and flares (green for a heal, red for a
        // summon) when this caster has just cast.
        const h = r * sp.h, w = (h * 128) / 165;
        const tipX = x + (eflip ? -1 : 1) * 0.32 * w, tipY = y + r * 0.95 - 0.8 * h;
        const cast = this.castAt.find((k) => Math.abs(k.x - e.x) < 6 && Math.abs(k.y - e.y) < 30 && this.time - k.t < 0.6);
        const flare = cast ? 1 - (this.time - cast.t) / 0.6 : 0;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        this.drawFlame(ctx, tipX, tipY, (h / 60) * (0.55 + flare * 0.6), e.id * 0.73, 0.75 + flare * 0.25);
        if (cast) {
          const orb = this.blob(cast.color === "summon" ? "orbR" : "orbG", cast.color === "summon" ? [[0, "rgba(255,200,170,1)"], [0.4, "rgba(255,90,60,0.6)"], [1, "rgba(255,60,40,0)"]] : [[0, "rgba(220,255,230,1)"], [0.4, "rgba(110,230,170,0.6)"], [1, "rgba(80,200,140,0)"]]);
          this.drawBlob(ctx, orb, tipX, tipY, r * (0.8 + flare * 1.4), r * (0.8 + flare * 1.4), flare);
        }
        ctx.restore();
      }
    }
    if (red > 0 && red < 1) {
      ctx.strokeStyle = e.def.armorCycle ? "rgba(230,240,255,0.9)" : "rgba(160,170,190,0.6)";
      ctx.lineWidth = e.def.armorCycle ? 4 : 2;
      ctx.beginPath();
      ctx.arc(x, y - r * 0.2, r * 1.25, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (e.enraged) {
      ctx.strokeStyle = `rgba(255,${Math.round(50 + Math.sin(c.time * 20) * 40)},30,0.9)`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y - r * 0.2, r * 1.35, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (id === "thief") {
      // Glittering trail so the treasure goblin stands out.
      if (Math.random() < 0.5) this.fx.burst(x, y - r, "#ffe066", 1, 30, { max: 0.6, size: 2.5, gravity: 40 });
      // A bulging loot sack slung on the back: shaded cloth that bounces with the stride (lagging
      // a beat behind the body), a rope tie, and gold peeking out of the neck.
      const ph = this.gait.get(`e${e.id}`)?.ph ?? 0;
      const bounce = Math.abs(Math.sin(((ph - 0.6) / 8) * Math.PI * 2)) * r * 0.22;
      const side = this.enemyMove.get(e.id)?.flip ? -1 : 1;
      const bx = x - side * r * 0.85, by = y - r * 0.35 - bounce, sr = r * 0.72;
      const g = ctx.createRadialGradient(bx - sr * 0.35, by - sr * 0.35, sr * 0.1, bx, by, sr * 1.1);
      g.addColorStop(0, "#d8b878");
      g.addColorStop(0.6, "#a07a44");
      g.addColorStop(1, "#5e4426");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(bx, by, sr, sr * (1.05 + bounce / r * 0.3), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#6a4a28";
      ctx.fillRect(bx - sr * 0.35, by - sr * 1.02, sr * 0.7, sr * 0.2);
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = k % 2 ? "#ffd84a" : "#f0b828";
        ctx.beginPath();
        ctx.ellipse(bx + (k - 1) * sr * 0.28, by - sr * 1.12 - (k % 2) * 1.5, sr * 0.2, sr * 0.11, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      this.drawBlob(ctx, this.glintBlob(), bx, by - sr * 1.1, sr * 0.7, sr * 0.45, 0.4 + 0.3 * Math.sin(c.time * 7 + e.id));
      ctx.restore();
    }
    if (e.slowTime > 0) {
      // Frost: icy ring + a few crystals.
      ctx.strokeStyle = "rgba(170,225,255,0.9)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(x, y + r * 0.8, r * 1.1, r * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#d8f2ff";
      for (let i = 0; i < 3; i++) {
        const a = c.time * 2 + i * 2.1 + e.id;
        const cx = x + Math.cos(a) * r * 0.9;
        const cy = y - r * 0.3 + Math.sin(a) * r * 0.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 3);
        ctx.lineTo(cx + 2, cy);
        ctx.lineTo(cx, cy + 3);
        ctx.lineTo(cx - 2, cy);
        ctx.closePath();
        ctx.fill();
      }
    }
    if (e.stunTime > 0) {
      ctx.fillStyle = "#ffe066";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const a = c.time * 6 + (i * Math.PI * 2) / 3;
        const sx = x + Math.cos(a) * r * 0.9;
        const sy = y - r * 1.9 + Math.sin(a) * 3;
        ctx.beginPath();
        for (let k = 0; k < 10; k++) {
          const rr = k % 2 ? 1.6 : 3.6;
          const aa = (k * Math.PI) / 5 - Math.PI / 2;
          ctx.lineTo(sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    if (e.def.aura) this.drawBanner(ctx, c, e, x, y, r);
    if (e.burnTime > 0) {
      for (let i = 0; i < 2; i++) {
        ctx.fillStyle = i ? "rgba(255,210,80,0.85)" : "rgba(255,110,30,0.8)";
        ctx.beginPath();
        ctx.arc(x + Math.sin(c.time * 17 + e.id + i * 2) * r * 0.5, y - r - ((c.time * 40 + i * 9 + e.id) % 12), 3.5 - i, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = baseA;
    if (e.hp < e.maxHp && !e.def.boss) {
      // The bar fades in on the first hit; the red fill eases down quickly, while a pale "damage
      // chunk" hangs where the health was for a beat and then drains after it; a hit flashes white.
      // Drawn later (after the night darkness), with the transform it has now, so it stays readable.
      const b = this.barState(e.id, Math.max(0, e.hp) / e.maxHp);
      const w = Math.max(20, r * 2.1);
      const by = y - r * 2 - 6;
      const fade = b.fade;
      const m = ctx.getTransform();
      this.lateBars.push((ctx) => {
      ctx.save();
      ctx.setTransform(m);
      ctx.globalAlpha = fade * baseA;
      ctx.fillStyle = "rgba(20,10,5,0.85)";
      ctx.beginPath();
      ctx.roundRect(x - w / 2 - 1.5, by - 1.5, w + 3, 6, 3);
      ctx.fill();
      ctx.fillStyle = "#ffd8a0";
      ctx.beginPath();
      ctx.roundRect(x - w / 2, by, Math.max(1, w * b.trail), 3, 1.5);
      ctx.fill();
      ctx.fillStyle = b.hit < 0.08 ? "#ffffff" : "#ff5a3a";
      ctx.beginPath();
      ctx.roundRect(x - w / 2, by, Math.max(1, w * b.shown), 3, 1.5);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(x - w / 2 + 1, by, Math.max(0, w * b.shown - 2), 1);
      ctx.restore();
      });
    }
    if (this.hpBars.size > 160) { const live = new Set(c.enemies.map((q) => q.id)); for (const id of this.hpBars.keys()) if (typeof id === "number" && !live.has(id)) this.hpBars.delete(id); }
  }
  /** Enemy health bars queued during the world pass, drawn after night lighting. */
  private lateBars: ((ctx: CanvasRenderingContext2D) => void)[] = [];
  private hpBars = new Map<number | string, { shown: number; trail: number; last: number; hitAt: number; t: number; born: number }>();
  /** Eased health-bar state for one unit: `shown` slides quickly to the true fraction, `trail` (the
   *  pale damage chunk) holds for a beat after a loss then drains after it; `hit` is the time since
   *  the last loss and `fade` fades the bar in when it first appears. */
  barState(key: number | string, frac: number): { shown: number; trail: number; hit: number; fade: number } {
    let b = this.hpBars.get(key);
    if (!b || this.time - b.t > 1) { b = { shown: b ? frac : 1, trail: b ? frac : 1, last: b ? frac : 1, hitAt: this.time, t: this.time, born: b ? b.born : this.time }; this.hpBars.set(key, b); }
    const dt = Math.min(0.05, Math.max(0, this.time - b.t));
    b.t = this.time;
    if (frac < b.last - 0.0005) b.hitAt = this.time;
    b.last = frac;
    b.shown += (frac - b.shown) * (1 - Math.exp(-dt * 22));
    if (this.time - b.hitAt > 0.28) b.trail += (b.shown - b.trail) * (1 - Math.exp(-dt * 7));
    if (b.trail < b.shown) b.trail = b.shown;
    return { shown: b.shown, trail: b.trail, hit: this.time - b.hitAt, fade: Math.min(1, (this.time - b.born) / 0.15) };
  }

  private drawDragon(ctx: CanvasRenderingContext2D, c: Camp, e: Enemy, flash: boolean): void {
    const r = e.def.radius;
    // Ground shadow far below the flyer (soft, swelling as it dips on its bob), then the 3D-rendered
    // dragon (slow, heavy wingbeats). Before each fireball it rears back while fire gathers in its
    // jaws, then lurches forward on the release with a flash and a puff of smoke from the mouth.
    const bob = Math.sin(c.time * 2.5);
    const sk = 1 + bob * 0.08;
    softShadow(ctx, e.x + 10, e.y + r * 1.6, r * 1.8 * sk, r * 0.45 * sk, 0.24 * (1 + bob * 0.2));
    const iv = e.def.attackInterval;
    const firing = e.def.behavior === "ranged" && e.y >= WALL_Y - (e.def.boss ? 175 : 145) - 2;
    const charge = firing ? Math.max(0, 1 - e.attackTimer / Math.min(0.8, iv * 0.5)) : 0; // 0..1 as the shot nears
    const since = firing ? iv - e.attackTimer : 9; // seconds since the last shot
    const lurch = since < 0.3 ? Math.sin((since / 0.3) * Math.PI) * (1 - since / 0.3) : 0;
    const rear = charge * charge * (3 - 2 * charge);
    const dy = -10 + bob * 4 - rear * 7 + lurch * 9;
    const mouthX = e.x, mouthY = e.y + dy + r * 1.0;
    if (this.drawBat3d(ctx, e.x, e.y + dy, r, c.time, flash, "dragon", this.bankFor(e.id, e.x, 0.3))) {
      const flame = this.blob("fireball", [[0, "rgba(255,210,120,1)"], [0.35, "rgba(255,120,30,0.85)"], [1, "rgba(220,50,10,0)"]]);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      if (charge > 0.05) {
        const fl = 1 + Math.sin(c.time * 37 + e.sway) * 0.15;
        this.drawBlob(ctx, flame, mouthX, mouthY, (8 + 20 * charge) * fl, (8 + 20 * charge) * fl, 0.35 + charge * 0.5);
        this.drawBlob(ctx, flame, mouthX, mouthY, (3 + 8 * charge) * fl, (3 + 8 * charge) * fl, 0.6 + charge * 0.4);
        if (charge > 0.5) this.drawBlob(ctx, this.glintBlob(), mouthX, mouthY, 2 + charge * 3, 2 + charge * 3, charge);
        // Embers drawn up into the jaws.
        for (let i = 0; i < 4; i++) {
          const u = (c.time * 2.2 + i / 4) % 1;
          const a = i * 1.7 + e.sway;
          const d = (1 - u) * 18;
          this.drawBlob(ctx, flame, mouthX + Math.cos(a) * d * 1.4, mouthY + Math.sin(a) * d * 0.8, 3.2, 3.2, charge * u);
        }
      }
      if (since < 0.18) {
        const u = since / 0.18;
        this.drawBlob(ctx, flame, mouthX, mouthY + 4, 18 * (0.6 + u * 0.6), 22 * (0.6 + u * 0.6), (1 - u) * 0.9);
      }
      ctx.restore();
      if (since < 0.5) {
        const smoke = this.blob("dust", [[0, "rgba(206,190,164,0.9)"], [0.6, "rgba(196,180,150,0.45)"], [1, "rgba(190,172,140,0)"]]);
        const u = since / 0.5;
        for (const sx of [-1, 1]) this.drawBlob(ctx, smoke, mouthX + sx * (4 + u * 10), mouthY - u * 10, 5 + u * 8, 5 + u * 8, (1 - u) * 0.45);
      }
      return;
    }
    const flap = Math.sin(c.time * 5) * 0.5;
    const x = e.x;
    const y = e.y - 10;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.fillStyle = flash ? "#ffffff" : "#c8bfa4";
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + k * r * 0.4, y - r * 0.2);
      ctx.quadraticCurveTo(x + k * r * 1.8, y - r * (1.6 + flap), x + k * r * 2.6, y - r * 0.3);
      ctx.lineTo(x + k * r * 1.9, y + r * 0.1);
      ctx.lineTo(x + k * r * 1.5, y - r * 0.1);
      ctx.lineTo(x + k * r * 1.1, y + r * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = flash ? "#ffffff" : "#e0d8c0";
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.55, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.95, r * 0.35, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ff5a20";
    ctx.beginPath();
    ctx.arc(x - r * 0.15, y + r * 1.0, r * 0.08, 0, Math.PI * 2);
    ctx.arc(x + r * 0.15, y + r * 1.0, r * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawAlly(ctx: CanvasRenderingContext2D, c: Camp, a: Ally): void {
    // Back from the barracks: fade in and rise from a crouch with a puff of dust (visual only).
    if (!this.allySeen.has(a.id)) {
      this.allySeen.set(a.id, this.time);
      if (c.phase === "wave" || this.time > 2) this.fx.burst(a.x, a.y + 8, "rgba(210,196,160,0.7)", 6, 40, { max: 0.45, size: 3.5, gravity: -14, drag: 4 });
    }
    const st = this.time - this.allySeen.get(a.id)!;
    // A shaft of pale light marks where the knight returns, narrowing and fading as they stand.
    if (st < 0.6 && (c.phase === "wave" || this.time > 2)) {
      const u = st / 0.6;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const hgt = 70 * (1 - (1 - Math.min(1, u * 4)) ** 2), w = 11 * (1 - u * 0.7);
      const col = ctx.createLinearGradient(0, a.y + 9 - hgt, 0, a.y + 9);
      col.addColorStop(0, "rgba(200,225,255,0)");
      col.addColorStop(1, `rgba(210,232,255,${(0.6 * (1 - u)).toFixed(3)})`);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(a.x, a.y + 9 - hgt / 2, w, hgt / 2 + 1, 0, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createRadialGradient(a.x, a.y + 9, 1, a.x, a.y + 9, 18);
      g.addColorStop(0, `rgba(220,236,255,${(0.5 * (1 - u)).toFixed(3)})`);
      g.addColorStop(1, "rgba(200,225,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(a.x, a.y + 9, 18, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (st < 0.35) {
      const u = st / 0.35;
      ctx.save();
      ctx.globalAlpha *= u;
      ctx.translate(a.x, a.y + 9);
      ctx.scale(1 + (1 - u) * 0.15, 0.7 + 0.3 * (1 - (1 - u) * (1 - u)));
      ctx.translate(-a.x, -(a.y + 9));
      this.drawAllyBody(ctx, c, a);
      ctx.restore();
      return;
    }
    this.withCheer(ctx, a.id, a.x, a.y + 9, () => this.drawAllyBody(ctx, c, a));
  }

  /** Render-only facing an idle knight watches (with a dead zone so it doesn't flicker). */
  private allyLook = new Map<number, number>();
  /** Accumulated ripple phase of each plaza banner (keyed by x). */
  private bannerPhase = new Map<number, { ph: number; t: number }>();
  /** Distance each enemy has walked since its last print, and enemy prints on the ground. */
  private enemyTrack = new Map<number, { x: number; y: number; d: number; foot: number }>();
  private ePrints: { x: number; y: number; a: number; t: number; s: number; rut: boolean }[] = [];
  /** Wall torches already lit this nightfall (for the one-off ember puff). */
  private torchLit = new Set<number>();
  private pileState = { n: 0, prev: 0, at: -9 };
  private drawAllyBody(ctx: CanvasRenderingContext2D, c: Camp, a: Ally): void {
    const ck = 1 - this.cheerLift * 0.04;
    softShadow(ctx, a.x, a.y + 9 + this.cheerLift, 9.5 * ck, 3.6 * ck, 0.3 * ck);
    // Engaged = an enemy within sword reach: the next swing winds up as the cooldown runs out, so
    // the blade lands (pose 4) exactly when the damage does, then follows through.
    const engaged = c.enemies.some((e) => !e.def.flying && Math.hypot(e.x - a.x, e.y - a.y) < 26 + e.def.radius);
    const windUp = engaged && a.swinging <= 0 && a.cooldown < 0.28;
    const moving = Math.hypot(a.x - a.postX, a.y - a.postY) > 4 && a.swinging <= 0 && !windUp;
    const allyAnim: AnimName = a.swinging > 0 || windUp ? "attack" : moving ? "walk" : "idle";
    const swingT = 0.25 - a.swinging; // seconds since the blow landed
    if (a.swinging > 0 && swingT < 0.03 && !this.allySparked.has(a.id)) {
      this.allySparked.add(a.id);
      const fx0 = a.x + Math.cos(a.facing) * 18, fy0 = a.y + Math.sin(a.facing) * 18 - 8;
      this.fx.burst(fx0, fy0, "#fff2c0", 5, 120, { max: 0.22, size: 2, shape: "spark" });
    } else if (a.swinging <= 0) this.allySparked.delete(a.id);
    const allyFrame =
      a.swinging > 0 ? Math.min(5, 4 + swingT / 0.22) : windUp ? Math.max(0, (1 - a.cooldown / 0.28) * 4) : moving ? this.walkPhase(`a${a.id}`, a.x, a.y, 56, a.id * 0.37) : animFrame(allyAnim, c.time + a.id * 0.37, 5.2 + ((a.id * 29) % 5) * 0.35);
    const allyDrawn =
      (() => {
        // Face the way they move/fight: back view walking up toward the wall, front view otherwise.
        // Standing guard, a knight keeps its eyes on the nearest threat in range (turning only once
        // it is clearly to the other side, so a foe walking straight at it doesn't cause flicker).
        let face = a.facing;
        if (allyAnim === "idle") {
          let best: Enemy | null = null, bd = 240;
          for (const e of c.enemies) { const d = Math.hypot(e.x - a.x, e.y - a.y); if (d < bd) { bd = d; best = e; } }
          const prev = this.allyLook.get(a.id) ?? a.facing;
          if (best) {
            const want = Math.atan2(best.y - a.y, best.x - a.x);
            const side = Math.cos(want), was = Math.cos(prev);
            face = Math.abs(side) > 0.35 || Math.sign(side) === Math.sign(was) ? want : prev;
          }
          this.allyLook.set(a.id, face);
        } else this.allyLook.delete(a.id);
        const v = viewFor("knight_ally", allyAnim, face);
        const h = v.name === "knight_ally_back" ? 33 : 36;
        return drawAnim(ctx, v.name, allyAnim, allyFrame, a.x, a.y + 9.5, h, { flip: v.flip, key: `a${a.id}` }) || drawAnim(ctx, "knight_ally", allyAnim, allyFrame, a.x, a.y + 9.5, 36, { flip: v.flip });
      })() ||
      drawSprite(ctx, "swordsman", a.x, a.y + 9.5, 31, {
      walk: moving ? 0.001 + (this.walkPhase(`a${a.id}`, a.x, a.y, 50, a.id * 0.37) * Math.PI) / 4 : 0, time: c.time, seed: a.id, flip: Math.cos(a.facing) > 0.15, flash: 0, lunge: a.swinging > 0 ? a.swinging / 0.25 : 0, key: `sa${a.id}`,
    });
    if (!allyDrawn) drawUnit(ctx, LOOKS.ally!, a.x, a.y, 9, moving ? c.time * 12 + a.id : 0, a.facing, false, a.swinging > 0 ? -1.2 * (a.swinging / 0.25) : 0);
    if (a.hp < a.maxHp) {
      const b = this.barState(`a${a.id}`, Math.max(0, a.hp) / a.maxHp);
      ctx.save();
      ctx.globalAlpha = b.fade;
      ctx.fillStyle = "rgba(20,10,5,0.85)";
      ctx.fillRect(a.x - 11, a.y - 22, 22, 4);
      ctx.fillStyle = "#ffd8a0";
      ctx.fillRect(a.x - 10, a.y - 21, 20 * b.trail, 2);
      ctx.fillStyle = b.hit < 0.08 ? "#ffffff" : "#6fdf4a";
      ctx.fillRect(a.x - 10, a.y - 21, 20 * b.shown, 2);
      ctx.restore();
    }
  }

  private drawGroveTree(ctx: CanvasRenderingContext2D, c: Camp, g: Vec, i: number): void {
    // The tree shudders right after each axe blow lands (chop frame 10 of 16) and sheds chips.
    let shake = 0;
    for (const w of c.workers) {
      if (w.state !== "chop" || w.tree !== i) continue;
      const ph = ((c.time + w.id * 0.37) * 18) % 16; // fractional chop frame
      const since = (ph - 10 + 16) % 16 / 18; // seconds since impact
      // Pushed away from the axe, then swaying back and ringing out.
      const away = w.x < g.x ? 1 : -1;
      if (since < 0.6) shake += away * Math.sin(since * 26 + 0.5) * Math.exp(-since * 6.5) * 0.05;
      const key = w.id * 100 + i;
      const f = Math.floor(ph);
      if (f === 10 && this.chopLast.get(key) !== 10) {
        this.fx.burst(g.x - away * 4, g.y - 8, "#d8b080", 4, 80, { max: 0.4, size: 2.2, gravity: 280, shape: "chunk" });
        // A few leaves shaken loose from the canopy drift down.
        this.fx.burst(g.x + away * 6, g.y - 52, i % 3 === 0 ? "#6aa83a" : "#3e7a3a", 3, 30, { max: 1.1, size: 2.6, gravity: 40, drag: 2.5 });
      }
      this.chopLast.set(key, f);
    }
    // 3D-rendered grove tree; while being chopped it leans from the base (the canopy swinging
    // further than the trunk) and sheds wood chips. Sub-pixel, so the sway reads smooth.
    const p3 = this.propSprite(i % 3 === 0 ? `round${1 + (i % 3)}` : `pine${1 + (i % 4)}`, 1.1);
    if (p3) {
      if (shake !== 0) {
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.transform(1, 0, -shake, 1, 0, 0);
        ctx.drawImage(p3.cv, -p3.fx, -p3.fy, p3.w, p3.h);
        ctx.restore();
      } else ctx.drawImage(p3.cv, Math.round(g.x - p3.fx), Math.round(g.y - p3.fy), p3.w, p3.h);
      return;
    }
    const sprite = this.treeSprite(1.1, i % 2 ? 0.2 : 0.8);
    const w = sprite.width / this.treeDpr;
    const h = sprite.height / this.treeDpr;
    ctx.save();
    ctx.translate(g.x, g.y + 11);
    ctx.transform(1, 0, -shake, 1, 0, 0);
    ctx.drawImage(sprite, -w / 2, -h, w, h);
    ctx.restore();
  }

  private ljImg: HTMLImageElement | null = null;
  /** Lumberjack frames rendered from the CC0 KayKit Barbarian (walk 8 + axe chop 8). */
  /** The rendered lumberjack (walk row / chop row); `still` holds the first chop frame. Returns the frame drawn, or -1 while loading. */
  overlay(ctx: CanvasRenderingContext2D, draw: (ctx: CanvasRenderingContext2D) => void): void {
    if (this.night <= 0.3) return draw(ctx);
    const m = ctx.getTransform(), ga = ctx.globalAlpha;
    this.lateBars.push((ctx) => { ctx.save(); ctx.setTransform(m); ctx.globalAlpha = ga; draw(ctx); ctx.restore(); });
  }

  drawLumberjackFrame(ctx: CanvasRenderingContext2D, x: number, footY: number, walking: boolean, t: number, flip: boolean, still = false): number {
    if (!this.drawLumberjack(ctx, x, footY, walking, still ? 0 : t, flip)) return -1;
    // Reported in the old 8-frame units (callers key effects off the impact pose, frame 5).
    return still ? 0 : Math.floor((Math.floor(t * (walking ? 20 : 18)) % 16) / 2);
  }
  private drawLumberjack(ctx: CanvasRenderingContext2D, x: number, footY: number, walking: boolean, t: number, flip: boolean): boolean {
    if (typeof Image === "undefined") return false;
    if (!this.ljImg) {
      this.ljImg = new Image();
      this.ljImg.src = "./sprites/anim/lumberjack.webp";
    }
    const img = this.ljImg;
    if (!img.complete || img.naturalWidth === 0) return false;
    // 16 real rendered frames per cycle (walk / chop), 1.5x the earlier resolution.
    const CW = 226, CH = 320, FX = 77, FY = 230;
    const f = Math.floor(t * (walking ? 20 : 18)) % 16;
    const row = walking ? 0 : 1;
    const k = 34 / 225; // ~34 world units tall
    ctx.save();
    ctx.translate(x, footY);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, f * CW, row * CH, CW, CH, -FX * k, -FY * k, CW * k, CH * k);
    ctx.restore();
    return true;
  }

  private drawWorker(ctx: CanvasRenderingContext2D, c: Camp, w: Worker): void {
    // Newly hired: fades in and rises from a crouch with a puff of dust, like the knights.
    const key = -1 - w.id;
    if (!this.allySeen.has(key)) {
      this.allySeen.set(key, this.time);
      if (this.time > 2) this.fx.burst(w.x, w.y + 8, "rgba(210,196,160,0.7)", 5, 36, { max: 0.4, size: 3, gravity: -14, drag: 4 });
    }
    const st = this.time - this.allySeen.get(key)!;
    if (st < 0.35) {
      const u = st / 0.35;
      ctx.save();
      ctx.globalAlpha *= u;
      ctx.translate(w.x, w.y + 9);
      ctx.scale(1 + (1 - u) * 0.15, 0.7 + 0.3 * (1 - (1 - u) * (1 - u)));
      ctx.translate(-w.x, -(w.y + 9));
      this.drawWorkerBody(ctx, c, w);
      ctx.restore();
      return;
    }
    this.drawWorkerBody(ctx, c, w);
  }

  private drawWorkerBody(ctx: CanvasRenderingContext2D, c: Camp, w: Worker): void {
    const moving = w.state !== "chop";
    const ph = moving ? this.walkPhase(`w${w.id}`, w.x, w.y, 48, w.id * 0.37) : 0;
    softShadow(ctx, w.x, w.y + 9, 9.5, 3.6, 0.3);
    const swing = w.state === "chop" ? Math.sin(this.time * 10) * 0.9 - 0.4 : 0;
    const tree = GROVE[w.tree]!;
    const facing = w.state === "chop" ? Math.atan2(tree.y - w.y, tree.x - w.x) : w.state === "toPile" ? Math.atan2(LUMBER_PILE.y - w.y, LUMBER_PILE.x - w.x) : Math.atan2(tree.y - w.y, tree.x - w.x);
    if (!this.drawLumberjack(ctx, w.x, w.y + 9, moving, moving ? ph / 10 : c.time + w.id * 0.37, Math.cos(facing) > 0.15))
      drawUnit(ctx, LOOKS.worker!, w.x, w.y, 8.5, moving ? c.time * 12 + w.id : 0, facing, false, swing);
    // Logs balanced on the head, riding the actual footfalls (contacts at poses 0 and 4): they dip
    // just after each step lands (the load's weight lags the body), rise through the passing pose,
    // and rock side to side once per stride.
    if (w.carrying) {
      const lag = ((ph - 0.6) % 8 + 8) % 8;
      const rise = moving ? Math.sin(lag * Math.PI / 4) ** 2 : 0;
      const rock = moving ? Math.sin(ph * Math.PI / 4) * 0.07 : 0;
      ctx.save();
      ctx.translate(w.x + 1, w.y - 36.5 - rise * 2.2);
      ctx.rotate(rock);
      drawLogPile(ctx, 0, 0, 2, false);
      ctx.restore();
    }
  }

  /**
   * Walk-cycle phase driven by distance actually covered (in sheet poses, 8 per cycle), so feet
   * plant instead of sliding whatever the speed: one cycle per `stride` world units. Phase is
   * kept per character, so speed changes never make the cycle jump.
   */
  private allySparked = new Set<number>();
  private ramStruck = new Set<number>();
  private bossRumble: { x: number; y: number; t: number } | null = null;
  /** Fissures torn in the ground where a boss broke cover (render-only, fade over a few seconds). */
  private bossCracks: { x: number; y: number; t: number } | null = null;
  private drawBossCracks(ctx: CanvasRenderingContext2D): void {
    const bc = this.bossCracks;
    if (!bc) return;
    const age = this.time - bc.t;
    if (age > 7) { this.bossCracks = null; return; }
    const grow = 1 - (1 - Math.min(1, age / 0.45)) ** 3;
    const fade = age < 5.5 ? 1 : 1 - (age - 5.5) / 1.5;
    const h = (n: number): number => { const v = Math.sin(n * 127.1 + bc.x * 0.31) * 43758.5453; return v - Math.floor(v); };
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // A dark crater dish under the cracks.
    softShadow(ctx, bc.x, bc.y, 34 * grow, 12 * grow, 0.3 * fade);
    for (let b = 0; b < 7; b++) {
      const ang = (b / 7) * Math.PI * 2 + (h(b) - 0.5) * 0.6;
      const len = (30 + h(b + 10) * 34) * grow;
      const pts: [number, number][] = [[bc.x, bc.y]];
      const segs = 5;
      for (let i = 1; i <= segs; i++) {
        const d = (len * i) / segs, j = (h(b * 9 + i) - 0.5) * 10;
        pts.push([bc.x + Math.cos(ang) * d - Math.sin(ang) * j, bc.y + (Math.sin(ang) * d + Math.cos(ang) * j) * 0.45]);
      }
      // Dark fissure, tapering, with a pale lit lip on its upper edge.
      for (const [wid, col, dy] of [[3.2, `rgba(255,236,200,${(0.18 * fade).toFixed(3)})`, -1], [2.6, `rgba(28,20,12,${(0.75 * fade).toFixed(3)})`, 0]] as const) {
        ctx.strokeStyle = col;
        for (let i = 1; i < pts.length; i++) {
          ctx.lineWidth = Math.max(0.6, wid * (1 - i / pts.length));
          ctx.beginPath();
          ctx.moveTo(pts[i - 1]![0], pts[i - 1]![1] + dy);
          ctx.lineTo(pts[i]![0], pts[i]![1] + dy);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
  /** Pond water areas baked into the terrain (for rain ripples). */
  private ponds: { x: number; y: number; rx: number; ry: number }[] = [];
  /** Crystal tips baked into the endless terrain (for glints). */
  private crystals: { x: number; y: number; s: number }[] = [];
  /** Gravestones baked into the Hollow Night terrain (for wisps). */
  private graves: { x: number; y: number }[] = [];
  /** Segment HP last frame (to spot repairs) and the planks flying in to mend them. */
  private segHpSeen: number[] = [];
  private repairs: { seg: number; t: number }[] = [];
  private shockwaves: { x: number; y: number; r: number; t: number; nova: boolean }[] = [];
  /** Planks flung from a collapsing wall segment (visual only). */
  private planks: { x: number; y: number; vx: number; vy: number; a: number; va: number; t: number; gy: number }[] = [];
  private blasts: { x: number; y: number; t: number }[] = [];
  private heroFoot = 0;
  /** Footprints the King leaves in the grass (fade over a few seconds). */
  private prints: { x: number; y: number; a: number; t: number }[] = [];
  /** Recent spell casts (heal/summon), so the caster's staff can flare. */
  private castAt: { x: number; y: number; t: number; color: "heal" | "summon" }[] = [];
  /** Pending build-landing dust clouds (fired at time t). */
  private buildDust: { x: number; y: number; t: number }[] = [];
  /** When each knight last appeared (spawn or respawn), for the fade-in. */
  private allySeen = new Map<number, number>();
  private allyFalls: { x: number; y: number; t: number; flip: boolean; landed: boolean }[] = [];
  private lastBolts: Camp["bolts"] = [];
  private wallBolts: { x: number; y: number; tilt: number; t: number }[] = [];
  private chopLast = new Map<number, number>();
  /** Arrows stuck in enemies: offset from the enemy, angle (shaft pointing back the way it came). */
  private stuck: { eid: number; dx: number; dy: number; ang: number; t: number }[] = [];
  /** Distance each homing coin started its flight from (for the hop arc). */
  private coinHomeFrom = new Map<number, number>();
  private coinLanded = new Map<number, number>();
  private stackCoins: HTMLCanvasElement[] = [];
  /** One coin of the carried stack, pre-rendered at 4x: edge band, lit gold face, rim, sheen. */
  private stackCoin(v: number): HTMLCanvasElement {
    const cached = this.stackCoins[v];
    if (cached) return cached;
    const S = 4, c = document.createElement("canvas");
    c.width = 15 * S;
    c.height = 8 * S;
    const g = c.getContext("2d")!;
    g.scale(S, S);
    // Edge (the coin's thickness) below the face.
    g.fillStyle = "#9a6410";
    g.beginPath();
    g.ellipse(7.5, 4.6, 7, 3, 0, 0, Math.PI * 2);
    g.fill();
    const face = g.createLinearGradient(1, 1, 13, 6);
    face.addColorStop(0, v ? "#fff3a8" : "#ffe680");
    face.addColorStop(0.5, v ? "#ffd84a" : "#f6c636");
    face.addColorStop(1, v ? "#d8a020" : "#c8901a");
    g.fillStyle = face;
    g.beginPath();
    g.ellipse(7.5, 3.5, 7, 3, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(140,90,16,0.9)";
    g.lineWidth = 0.7;
    g.stroke();
    // Inner rim and a small embossed mark.
    g.strokeStyle = "rgba(255,248,200,0.75)";
    g.lineWidth = 0.5;
    g.beginPath();
    g.ellipse(7.5, 3.5, 4.9, 2, 0, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "rgba(170,110,20,0.55)";
    g.beginPath();
    g.ellipse(7.5, 3.6, 1.8, 0.8, 0, 0, Math.PI * 2);
    g.fill();
    return (this.stackCoins[v] = c);
  }
  /** Spring state for the coin stack on the hero's back. */
  private stack = { x: 0, t: 0, lean: 0, v: 0 };
  private gait = new Map<string, { x: number; y: number; ph: number; seen: number }>();
  private walkPhase(key: string, x: number, y: number, stride: number, seed = 0): number {
    let g = this.gait.get(key);
    if (!g) this.gait.set(key, (g = { x, y, ph: (seed * 8) % 8, seen: this.time }));
    const d = Math.hypot(x - g.x, y - g.y);
    if (d < 40) g.ph = (g.ph + (d / stride) * 8) % 8;
    g.x = x;
    g.y = y;
    g.seen = this.time;
    if (this.gait.size > 500) for (const [k, v] of this.gait) if (this.time - v.seen > 2) this.gait.delete(k);
    return g.ph;
  }

  /**
   * Smear frame on the King's sword swing: a bright crescent trailing the blade from overhead to
   * the low follow-through (sheet poses ~2.8..4.8), like the smears in hand-drawn animation.
   */
  private drawSwordSmear(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, flip: boolean): void {
    const u = (frame - 2.8) / 2;
    if (u <= 0 || u >= 1) return;
    const head = -1.4 - u * 2.5; // painted facing left: from overhead round to front-low
    const tail = Math.min(-1.0, head + 1.9);
    const a = Math.sin(Math.min(1, u * 1.6) * Math.PI * 0.5) * (1 - Math.max(0, u - 0.7) / 0.3) * 0.85;
    const R = 22;
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.globalCompositeOperation = "lighter";
    // After dark the blade's arc throws a wide soft glow (a halo under the crescent), so each
    // swing lights up the night around the King.
    if (this.night > 0.05) {
      ctx.lineCap = "round";
      for (const [wid, al] of [[16, 0.16], [9, 0.22]] as const) {
        ctx.strokeStyle = `rgba(255,220,150,${(a * al * this.night).toFixed(3)})`;
        ctx.lineWidth = wid;
        ctx.beginPath();
        ctx.arc(0, 0, R + 1, tail + (head - tail) * 0.35, head, true);
        ctx.stroke();
      }
    }
    // Crescent: thick at the blade, tapering back along the arc.
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      ctx.strokeStyle = `rgba(255,${214 + 34 * t1},${150 + 90 * t1},${(a * t1 * t1).toFixed(3)})`;
      ctx.lineWidth = 1 + 6 * t1;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(0, 0, R + 2 * t1, tail + (head - tail) * t0, tail + (head - tail) * t1, true);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Stack of logs: little cylinders seen end-on, pyramid-stacked. */
  private castFlourishAt = -9;
  /** Ability cast: a column of gold light rises from the King's feet, sparks spiral up around him
   *  and the ground flares, all following him for ~0.9 s. Drawn over the hero. */
  private drawCastFlourish(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const t = this.time - this.castFlourishAt;
    if (t < 0 || t > 0.9) return;
    const u = t / 0.9;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // Ground flare.
    const gr = 18 + u * 34;
    const g = ctx.createRadialGradient(x, y + 12, 2, x, y + 12, gr);
    g.addColorStop(0, `rgba(255,224,140,${(0.55 * (1 - u)).toFixed(3)})`);
    g.addColorStop(1, "rgba(255,200,90,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y + 12, gr, gr * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    // Light column: shoots up fast, then thins and fades.
    const up = 1 - (1 - Math.min(1, u * 3)) ** 3;
    const hgt = 90 * up, w = 14 * (1 - u * 0.6);
    const col = ctx.createLinearGradient(0, y + 12 - hgt, 0, y + 12);
    col.addColorStop(0, "rgba(255,240,180,0)");
    col.addColorStop(0.6, `rgba(255,230,150,${(0.6 * (1 - u)).toFixed(3)})`);
    col.addColorStop(1, `rgba(255,220,130,${(0.8 * (1 - u)).toFixed(3)})`);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(x, y + 12 - hgt / 2, w, hgt / 2 + 1, 0, 0, Math.PI * 2);
    ctx.fill();
    // Spiralling sparks.
    for (let i = 0; i < 10; i++) {
      const a = i * 0.628 + t * 9;
      const rise = (t * 110 + i * 7) % 80;
      const rad = 16 * (1 - rise / 100);
      const sx = x + Math.cos(a) * rad, sy = y + 8 - rise + Math.sin(a) * rad * 0.35;
      const al = (1 - u) * (Math.sin(a) > 0 ? 1 : 0.5);
      ctx.fillStyle = `rgba(255,236,160,${al.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private cheerAt = -9;
  /** Current unit's hop height while drawing it (so its shadow can stay on the ground). */
  private cheerLift = 0;
  /** Night won: everyone hops for joy (two bounces, squashing on each landing), staggered by `seed`.
   *  Returns [lift, squash] for a unit, or null outside the cheer. */
  private cheer(seed: number): [number, number] | null {
    const t = this.time - this.cheerAt - (seed % 5) * 0.06;
    if (t < 0 || t > 0.9) return null;
    const hop = (t % 0.45) / 0.45;
    const lift = Math.sin(hop * Math.PI) * 9 * (t < 0.45 ? 1 : 0.6);
    const squash = hop < 0.12 ? (1 - hop / 0.12) * 0.12 : hop > 0.9 ? ((hop - 0.9) / 0.1) * 0.12 : 0;
    return [lift, squash];
  }
  private withCheer(ctx: CanvasRenderingContext2D, seed: number, x: number, footY: number, draw: () => void): void {
    const ch = this.cheer(seed);
    if (!ch) { draw(); return; }
    ctx.save();
    ctx.translate(x, footY - ch[0]);
    ctx.scale(1 + ch[1] * 0.6, 1 - ch[1]);
    ctx.translate(-x, -footY);
    this.cheerLift = ch[0];
    draw();
    this.cheerLift = 0;
    ctx.restore();
  }

  private drawHero(ctx: CanvasRenderingContext2D, c: Camp): void {
    this.withCheer(ctx, 0, c.hero.x, c.hero.y + 12, () => this.drawHeroInner(ctx, c));
    if (!c.hero.dead) this.drawCastFlourish(ctx, c.hero.x, c.hero.y);
  }

  private drawHeroInner(ctx: CanvasRenderingContext2D, c: Camp): void {
    const h = c.hero;
    const x = h.x;
    const y = h.y;
    const K = HERO_K;
    // Warm gold presence under the hero so they read instantly among the troops.
    const aura = ctx.createRadialGradient(x, y + 12, 2, x, y + 12, 30 * K);
    aura.addColorStop(0, "rgba(255,214,90,0.42)");
    aura.addColorStop(1, "rgba(255,214,90,0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.ellipse(x, y + 12, 30 * K, 11 * K, 0, 0, Math.PI * 2);
    ctx.fill();
    // Arrival: the King falls from above in a beam of light (0.55 s), then lands with a thud.
    const ar = this.time - this.arriveAt;
    let drop = 0;
    if (ar < 0.55) {
      const u = ar / 0.55;
      drop = (1 - u * u) * 170;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const beam = ctx.createLinearGradient(0, y - 260, 0, y + 14);
      beam.addColorStop(0, "rgba(255,230,140,0)");
      beam.addColorStop(1, `rgba(255,236,170,${0.55 * (1 - u * 0.5)})`);
      ctx.fillStyle = beam;
      ctx.fillRect(x - 22, y - 260, 44, 274);
      ctx.restore();
    } else if (!this.landed) {
      this.landed = true;
      this.fx.shake(0.35);
      this.fx.rings.push({ x, y: y + 12, r: 70, color: "#fff0b0", life: 0.5, max: 0.5, width: 5 });
      this.fx.burst(x, y + 12, "rgba(220,200,160,0.9)", 18, 150, { max: 0.6, size: 5, gravity: -10, drag: 3 });
      this.fx.burst(x, y, "#ffe08a", 14, 160, { max: 0.6, size: 2.5, gravity: -40, shape: "spark" });
    }
    // (During a victory hop the body is lifted by `cheerLift`; the shadow stays on the ground and shrinks.)
    const hk = (1 - drop / 340) * (1 - this.cheerLift * 0.03);
    softShadow(ctx, h.x, h.y + 12 + this.cheerLift, 17 * K * hk, 6.5 * K * hk, 0.42 * (1 - this.cheerLift * 0.03));
    // Low health: one warning line per scare.
    if (h.hp / h.maxHp < 0.3) {
      if (!this.lowHpSaid) this.say(["Ugh— fall back!", "I need the hall!", "Not like this…"]);
      this.lowHpSaid = true;
    } else if (h.hp / h.maxHp > 0.6) this.lowHpSaid = false;
    // Level up: a pillar of golden light rises around the King, with motes drifting up.
    const lu = this.time - this.levelUpAt;
    if (lu < 1.1) {
      const k = lu < 0.15 ? lu / 0.15 : 1 - (lu - 0.15) / 0.95;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const col = ctx.createLinearGradient(0, y - 120, 0, y + 14);
      col.addColorStop(0, "rgba(255,220,110,0)");
      col.addColorStop(0.6, `rgba(255,220,110,${0.35 * k})`);
      col.addColorStop(1, `rgba(255,240,180,${0.6 * k})`);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(x, y + 12, 24, 8, 0, 0, Math.PI);
      ctx.lineTo(x - 18, y - 120);
      ctx.lineTo(x + 18, y - 120);
      ctx.closePath();
      ctx.fill();
      for (let i = 0; i < 10; i++) {
        const my = y + 10 - ((lu * 90 + i * 13) % 120);
        const mx = x + Math.sin(i * 2.3 + lu * 4) * 16;
        ctx.fillStyle = `rgba(255,240,170,${0.9 * k})`;
        ctx.fillRect(mx - 1.2, my - 1.2, 2.4, 2.4);
      }
      ctx.restore();
    }
    // Ability charged: a cool blue ring breathes at the King's feet with sparks circling it, so
    // "ready" reads on the hero himself, not only on the corner button.
    if (c.phase === "wave" && c.abilityCharge >= 1 && !h.dead) {
      const pu = 0.5 + 0.5 * Math.sin(this.time * 5);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(140,200,255,${(0.45 + pu * 0.35).toFixed(3)})`;
      ctx.lineWidth = 2 + pu;
      ctx.beginPath(); ctx.ellipse(x, y + 12, 38 + pu * 4, 13 + pu * 1.5, 0, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const a = this.time * 3 + (i * Math.PI * 2) / 3;
        ctx.fillStyle = "rgba(200,235,255,0.9)";
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * 40, y + 12 + Math.sin(a) * 14, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // Low HP: a pulsing red ring at the hero's feet says "back off to the hall".
    const hpFrac = h.hp / h.maxHp;
    if (hpFrac < 0.3) {
      const beat = 0.5 + 0.5 * Math.sin(this.time * 9);
      ctx.strokeStyle = `rgba(255,50,30,${0.45 + 0.45 * beat})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(h.x, h.y + 12, (18 + beat * 4) * K, (7 + beat * 1.5) * K, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Range ring so players learn the reach.
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(h.x, h.y, CAMP.heroRange, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Selection ring under the hero.
    ctx.strokeStyle = "rgba(255,226,120,0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(h.x, h.y + 12, (17 + Math.sin(c.time * 4) * 1.5) * K, 6.5 * K, 0, 0, Math.PI * 2);
    ctx.stroke();
    const walk = h.moving ? c.time * 14 : 0;
    const step = h.moving ? Math.abs(Math.sin(c.time * 14)) : 0;
    const bob = step * 2;
    // Body language, anchored at the feet so the hero never floats:
    //  idle → slow breathing; walking → lean into the move + a little squash on each footfall;
    //  shooting → a quick recoil away from the target; hit → a squash-and-jolt.
    const breath = h.moving ? 0 : Math.sin(this.time * 3) * 0.035;
    const tilt = h.moving ? Math.cos(h.facing) * 0.12 : 0;
    const shotK = Math.max(0, 1 - (this.time - this.heroShotAt) / 0.14);
    const hitK = Math.max(0, 1 - (this.time - this.heroHitAt) / 0.2);
    // Landing from the arrival drop: stretched while falling, squashes flat on impact, then
    // springs back through a small overshoot.
    const land = this.time - this.arriveAt - 0.55;
    const fallK = drop > 0 ? 0.12 * (1 - drop / 170) : 0;
    const landK = land >= 0 && land < 0.5 ? Math.cos(land * 19) * Math.exp(-land * 8) * 0.24 : 0;
    // Respawn: the King rises out of a column of light, scaling up from 60% with a springy
    // overshoot, fading in over the first 0.15 s.
    const rs = this.time - this.respawnAt;
    const rise = rs < 0.6 ? 1 - (1 - 0.6) * Math.exp(-rs * 9) * Math.cos(rs * 16) : 1;
    if (rs < 0.6) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const a = 1 - rs / 0.6;
      const col = ctx.createLinearGradient(0, y - 120, 0, y + 14);
      col.addColorStop(0, "rgba(255,230,140,0)");
      col.addColorStop(1, `rgba(255,236,170,${(0.6 * a).toFixed(3)})`);
      ctx.fillStyle = col;
      ctx.fillRect(x - 18 * a - 4, y - 120, (18 * a + 4) * 2, 134);
      ctx.restore();
    }
    const sx = (1 + step * 0.04 + hitK * 0.16 - breath * 0.5 + landK * 0.8 - fallK * 0.5) * rise;
    const sy = (1 - step * 0.06 - hitK * 0.14 + breath - landK + fallK) * rise;
    const rx = -Math.cos(h.facing) * 3 * shotK;
    const ry = -Math.sin(h.facing) * 2 * shotK;
    ctx.save();
    ctx.translate(x + rx, y + 12 + ry - drop);
    if (rs < 0.15) ctx.globalAlpha *= Math.max(0, rs / 0.15);
    ctx.rotate(tilt - Math.cos(h.facing) * 0.1 * shotK);
    ctx.scale(sx * K, sy * K);
    ctx.translate(-x, -(y + 12));
    // The painted King sprite (has its own crown + cape); procedural fallback until it loads.
    const sinceShot = this.time - this.heroShotAt;
    // Standing still and not fighting for a moment: the King turns to face the camera (feels alive,
    // and nobody wants to stare at his back while building).
    if (h.moving) this.heroStillAt = this.time;
    const stillFor = this.time - Math.max(this.heroStillAt, this.heroShotAt);
    let faceDir = stillFor > 1.1 ? Math.PI / 2 + (Math.cos(h.facing) > 0.15 ? -0.6 : 0.6) : h.facing;
    if (stillFor > 1.1) {
      // Idle a while: keep an eye on the nearest foe if one is close, otherwise glance from side to
      // side every few seconds (the keyed pose memory turns him smoothly).
      let near: Enemy | null = null, nd = 240 * 240;
      for (const e of c.enemies) { const d = (e.x - h.x) ** 2 + (e.y - h.y) ** 2; if (d < nd) { nd = d; near = e; } }
      if (near) faceDir = Math.PI / 2 + (near.x > h.x ? -0.6 : 0.6);
      else if (stillFor > 4) {
        const glance = Math.floor((stillFor - 4) / 3.2) % 2;
        if (glance) faceDir = Math.PI - faceDir;
      }
    }
    let heroAnim: AnimName = h.moving ? "walk" : "idle";
    // Walking: ~68 world units per full cycle (two steps) for the 45-tall King.
    const heroWalkPh = this.walkPhase("hero", h.x, h.y, 68);
    let heroFrame = h.moving ? heroWalkPh : animFrame(heroAnim, this.time, 6);
    if (h.sinceHit < 0.2) {
      heroAnim = "hit";
      heroFrame = Math.min(1, h.sinceHit / 0.12);
    } else if (sinceShot < 0.2 && !h.moving) {
      // The slash leaves as the sword comes down (pose ~3.2), then follows through.
      heroAnim = "attack";
      heroFrame = 3.2 + (sinceShot / 0.2) * 1.8;
    } else if (!h.moving && h.cooldown > 0 && h.cooldown < 0.16 && c.enemies.some((e) => (e.x - h.x) ** 2 + (e.y - h.y) ** 2 < CAMP.heroRange ** 2)) {
      // Wind-up into the next swing as the cooldown runs out.
      heroAnim = "attack";
      heroFrame = (1 - h.cooldown / 0.16) * 3.2;
    }
    // Other heroes: their painted figure from the character sheet with procedural motion.
    const altHero: Record<string, SpriteName> = { hero_knight: "knight", hero_pyro: "mage", hero_engineer: "crossbowman" };
    const alt = altHero[c.heroLook];
    const kingDrawn = alt
      ? drawSprite(ctx, alt, x, y + 12, 42, {
          walk: h.moving ? 0.001 + (this.walkPhase("hero", h.x, h.y, 68) * Math.PI) / 4 : 0, time: this.time, seed: 0, flip: Math.cos(faceDir) > 0.15, flash: h.sinceHit < 0.1 ? 1 : 0, lunge: shotK * 0.5,
        })
      : (() => {
        const v = viewFor("king", heroAnim, faceDir);
        this.lastHeroFlip = v.flip;
        const ht = v.name === "king_back" ? 43 : 45;
        const ok = drawAnim(ctx, v.name, heroAnim, heroFrame, x, y + 12, ht, { flip: v.flip, flash: h.sinceHit < 0.1 ? 0.6 : 0, key: "hero" });
        if (ok && heroAnim === "attack") this.drawSwordSmear(ctx, x, y + 12 - ht * 0.36, heroFrame, v.flip);
        return ok;
      })() ||
      drawSprite(ctx, "king", x, y + 12, 40, {
        walk: h.moving ? 0.001 + (this.walkPhase("hero", h.x, h.y, 68) * Math.PI) / 4 : 0, time: this.time, seed: 0, flip: Math.cos(h.facing) > 0.15, flash: h.sinceHit < 0.1 ? 1 : 0, lunge: shotK * 0.5,
      });
    if (!kingDrawn) {
      drawHeroCape(ctx, x, y - bob, h.facing, h.moving, this.time);
      drawUnit(ctx, LOOKS[c.heroLook] ?? LOOKS.hero!, x, y - bob, 11, walk, h.facing, h.sinceHit < 0.1, -shotK * 0.5);
      drawHeroCrown(ctx, x, y - bob - 15.5, this.time);
    }
    ctx.restore();
    // Everything stacked on the hero sits above the (taller) scaled figure.
    const top = (kingDrawn ? 28 : (K - 1) * 22 + 6) + drop;
    // Coin stack on the back, leaning with movement.
    // Capped at 10 coins tall (a 26-coin tower hid the enemies behind the King); a full load shows
    // its exact count on a little tag on top instead.
    const n = Math.min(10, Math.ceil(h.coins / 3));
    // The stack lags behind the hero's motion on a damped spring: it leans back when he sets
    // off, sways forward when he stops, and bends more toward the top.
    const sdt = Math.min(0.05, Math.max(0, this.time - this.stack.t));
    if (sdt > 0) {
      const vx = (x - this.stack.x) / sdt;
      const target = Math.max(-0.1, Math.min(0.1, -vx / 1800));
      this.stack.v += ((target - this.stack.lean) * 140 - this.stack.v * 13) * sdt;
      this.stack.lean += this.stack.v * sdt;
    }
    this.stack.x = x;
    this.stack.t = this.time;
    const lean = this.stack.lean;
    for (let i = 0; i < n; i++) {
      const cx = x + lean * 3 * i ** 1.25;
      const cy = y - bob - 24 - top - i * 3;
      // Shaded coin seen from above: dark edge band, lit rim, embossed face (cached sprite).
      ctx.drawImage(this.stackCoin(i % 2), cx - 7.5, cy - 3.5, 15, 8);
    }
    const full = h.coins >= CAMP.carryCap + c.mods.carry;
    if (h.coins >= 12 || full) {
      // Count tag over the stack; when the King can't carry more it turns gold, reads
      // "40 FULL" and pulses (one tag, so the two labels never pile up on each other).
      const tx = x + lean * 3 * n ** 1.25, ty = y - bob - 24 - top - n * 3 - 9;
      const label = full ? `${h.coins} FULL` : `${h.coins}`;
      ctx.save();
      ctx.font = `900 9px ${FONT}`;
      const tw = ctx.measureText(label).width + 10;
      ctx.translate(tx, ty);
      if (full) { const s = 1 + 0.07 * (0.5 + 0.5 * Math.sin(this.time * 6)); ctx.scale(s, s); }
      if (full) {
        const g = ctx.createLinearGradient(0, -6, 0, 6);
        g.addColorStop(0, "#ffe98a"); g.addColorStop(1, "#f2a83a");
        ctx.fillStyle = g;
      } else ctx.fillStyle = "rgba(20,12,4,0.85)";
      ctx.beginPath(); ctx.roundRect(-tw / 2, -6, tw, 12, 6); ctx.fill();
      ctx.strokeStyle = full ? INK : "#ffd84a"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = full ? "#2a1606" : "#ffe9a0"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(label, 0, 0.5);
      ctx.restore();
    }
    // Log stack beside the coins.
    const nl = Math.min(10, Math.ceil(h.logs / 2));
    const logImg = this.decorAtlas();
    const logE = DECOR_ATLAS.pile11;
    for (let i = 0; i < nl; i++) {
      // Sways with the coin stack's spring, so the whole load moves as one.
      const lx = x - 15 + lean * 3 * i ** 1.25;
      const ly = y - bob - 18 - top - i * (logImg && logE ? 6 : 5);
      if (logImg && logE) {
        // A 3D-rendered log (the same model as the camp's log piles), alternating ends.
        const [sx, sy, sw, sh, fx, fy] = logE;
        const k = 0.5 * 1.35;
        ctx.save();
        ctx.translate(lx, ly + 4);
        if (i % 2) ctx.scale(-1, 1);
        ctx.drawImage(logImg, sx, sy, sw, sh, -fx * k, -fy * k, sw * k, sh * k);
        ctx.restore();
        continue;
      }
      ctx.fillStyle = "#9a6a3a";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.fillRect(lx - 6, ly - 2.5, 12, 5);
      ctx.strokeRect(lx - 6, ly - 2.5, 12, 5);
      ctx.fillStyle = "#e8c890";
      ctx.beginPath();
      ctx.ellipse(lx + 6, ly, 1.8, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < Math.min(10, h.bows); i++) drawBowItem(ctx, x + 14 * K, y - bob - 14 - top - i * 4, 0.8);
    // Sits above the count tag (shown from 12 coins, or when full) instead of on it.
    this.drawQuip(ctx, x, y - 30 - top - n * 3 - (nl > 0 ? 6 : 0) - (h.coins >= 12 || full ? 14 : 0));
    if (h.hp < h.maxHp) {
      ctx.fillStyle = "rgba(20,10,5,0.85)";
      ctx.beginPath();
      ctx.roundRect(x - 21, y + 21, 42, 7, 3.5);
      ctx.fill();
      const b = this.barState("hero", Math.max(0, h.hp) / h.maxHp);
      ctx.fillStyle = "#ffd8a0";
      ctx.beginPath();
      ctx.roundRect(x - 20, y + 22, Math.max(1, 40 * b.trail), 5, 2.5);
      ctx.fill();
      ctx.fillStyle = b.hit < 0.08 ? "#ffffff" : b.shown > 0.4 ? "#6fdf4a" : "#ff5a3a";
      ctx.beginPath();
      ctx.roundRect(x - 20, y + 22, Math.max(1, 40 * b.shown), 5, 2.5);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(x - 19, y + 22, Math.max(0, 40 * b.shown - 2), 1.2);
    }
  }

  private drawCoins(ctx: CanvasRenderingContext2D, c: Camp): void {
    const h = c.hero;
    for (const k of c.coins) {
      // Homing coins hop toward the King on a little arc (highest mid-flight) and leave a faint
      // gold streak; visual only, the sim's coin stays on the ground.
      let hop = 0;
      if (k.homing && k.z === 0) {
        const d = Math.hypot(h.x - k.x, h.y - k.y);
        const start = this.coinHomeFrom.get(k.id) ?? (this.coinHomeFrom.set(k.id, d), d);
        const u = Math.max(0, Math.min(1, 1 - d / Math.max(1, start)));
        hop = Math.sin(u * Math.PI) * Math.min(26, start * 0.35);
        const dx = h.x - k.x, dy = h.y - k.y, n = Math.max(1, d);
        const tail = ctx.createLinearGradient(k.x - (dx / n) * 16, k.y - hop - (dy / n) * 16, k.x, k.y - hop);
        tail.addColorStop(0, "rgba(255,220,90,0)");
        tail.addColorStop(1, "rgba(255,220,90,0.55)");
        ctx.strokeStyle = tail;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(k.x - (dx / n) * 16, k.y - hop * 0.8 - (dy / n) * 16);
        ctx.lineTo(k.x, k.y - hop);
        ctx.stroke();
      } else this.coinHomeFrom.delete(k.id);
      // Settle bounce: when a dropped coin first touches down it hops twice more, smaller each
      // time, and squashes on each contact (visual only).
      let squash = 0;
      if (!k.homing) {
        // -1 = seen in the air; a landing time is only recorded after that.
        if (k.z > 0) this.coinLanded.set(k.id, -1);
        else if (this.coinLanded.get(k.id) === -1) this.coinLanded.set(k.id, this.time);
        const at = this.coinLanded.get(k.id) ?? -9;
        const lt = at < 0 ? 9 : this.time - at;
        if (lt < 0.5) {
          const b = lt < 0.28 ? Math.sin((lt / 0.28) * Math.PI) * 7 : Math.sin(((lt - 0.28) / 0.22) * Math.PI) * 2.5;
          hop = Math.max(0, b);
          squash = Math.max(0, 1 - lt / 0.06) * 0.4 + (lt > 0.28 && lt < 0.32 ? 0.2 : 0);
        }
      }
      // Shadow shrinks and fades as the coin bounces up (height cue).
      const z = k.z + hop;
      const lift = Math.min(1, z / 30);
      softShadow(ctx, k.x, k.y + 3, 5.5 * (1 - lift * 0.4), 2.2 * (1 - lift * 0.4), 0.3 * (1 - lift * 0.5));
      if (squash > 0) {
        ctx.save();
        ctx.translate(k.x, k.y - z + 5);
        ctx.scale(1 + squash * 0.5, 1 - squash);
        spinCoin(ctx, 0, -5, 5, this.time * 5 + k.id);
        ctx.restore();
      } else spinCoin(ctx, k.x, k.y - z, 5, this.time * (k.homing ? 14 : 5) + k.id);
      // Resting coins twinkle now and then (a four-point star flash), so loot catches the eye;
      // homing coins leave a short trail of sparkles toward the King.
      const tw = (this.time * 0.9 + k.id * 0.37) % 1.6;
      if (!k.homing && z < 2 && tw < 0.22) {
        const u = tw / 0.22, a = Math.sin(u * Math.PI);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(255,248,210,${(0.95 * a).toFixed(3)})`;
        ctx.translate(k.x + 2, k.y - z - 3);
        ctx.rotate(u * 0.8);
        const L = 4 + a * 3;
        ctx.beginPath();
        for (let q = 0; q < 4; q++) {
          const an = (q * Math.PI) / 2;
          ctx.lineTo(Math.cos(an) * L, Math.sin(an) * L);
          ctx.lineTo(Math.cos(an + Math.PI / 4) * 0.9, Math.sin(an + Math.PI / 4) * 0.9);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (k.homing && (this.time * 30 + k.id) % 3 < 1) {
        this.fx.burst(k.x, k.y - z, "#ffe890", 1, 20, { max: 0.3, size: 1.8, gravity: -20, shape: "spark" });
      }
    }
    if (this.coinLanded.size > 400) this.coinLanded.clear();
    if (this.coinHomeFrom.size > 300) this.coinHomeFrom.clear();
  }

  private arrowFrom = new Map<number, number>();
  /** Arrows seen last frame, and missed arrows planted in the ground (visual only). */
  private arrowSeen = new Map<number, { x: number; y: number; ang: number; life: number; target: number }>();
  private planted: { x: number; y: number; ang: number; t: number }[] = [];
  private drawPlantedArrows(ctx: CanvasRenderingContext2D, c: Camp): void {
    // An arrow that vanished with its target already gone (it flew on after a kill) lands: it
    // sticks into the ground at a slant with a puff of dust instead of disappearing mid-air.
    const live = new Set<number>();
    const enemyIds = new Set(c.enemies.map((e) => e.id));
    for (const a of c.arrows) {
      live.add(a.id);
      this.arrowSeen.set(a.id, { x: a.x, y: a.y, ang: a.angle, life: a.life, target: a.target });
    }
    for (const [id, a] of this.arrowSeen) {
      if (live.has(id)) continue;
      this.arrowSeen.delete(id);
      if (a.life <= 0.31 && !enemyIds.has(a.target) && a.y > WALL_Y - 400) {
        if (this.planted.length > 30) this.planted.shift();
        this.planted.push({ x: a.x, y: a.y, ang: a.ang, t: this.time });
        this.fx.burst(a.x, a.y + 2, "rgba(200,184,150,0.7)", 3, 30, { max: 0.35, size: 2.5, gravity: -10, drag: 4 });
      }
    }
    this.planted = this.planted.filter((p) => this.time - p.t < 3);
    for (const p of this.planted) {
      const age = this.time - p.t;
      const al = age < 2.4 ? 1 : 1 - (age - 2.4) / 0.6;
      // A quick quiver as it lands, then still.
      const qv = age < 0.3 ? Math.sin(age * 70) * (1 - age / 0.3) * 0.25 : 0;
      const dir = Math.cos(p.ang) >= 0 ? 1 : -1;
      const tilt = -Math.PI / 2 - dir * 0.6 + qv; // shaft leans back the way it came
      const cs = Math.cos(tilt), sn = Math.sin(tilt), L = 10;
      ctx.save();
      ctx.globalAlpha = al;
      softShadow(ctx, p.x + 3, p.y + 1, 5, 1.6, 0.25);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + cs * L, p.y + sn * L);
      ctx.stroke();
      ctx.strokeStyle = "#c89a5a";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = "#f4f0e6";
      ctx.beginPath();
      ctx.ellipse(p.x + cs * L, p.y + sn * L, 2.2, 1.2, tilt, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawArrows(ctx: CanvasRenderingContext2D, c: Camp): void {
    this.drawPlantedArrows(ctx, c);
    ctx.lineCap = "round";
    const byIdArrow = new Map(c.enemies.map((e) => [e.id, e]));
    // Stuck arrows ride along with their enemy for ~0.9 s, then fade; gone when it dies.
    if (this.stuck.length) {
      const byId = new Map(c.enemies.map((e) => [e.id, e]));
      this.stuck = this.stuck.filter((s) => this.time - s.t < 0.9 && byId.has(s.eid));
      for (const s of this.stuck) {
        const e = byId.get(s.eid)!;
        const a = Math.min(1, (0.9 - (this.time - s.t)) / 0.3);
        const r = e.def.radius / 12;
        const bx = e.x + s.dx * r, by = e.y + s.dy * r;
        const cs = Math.cos(s.ang), sn = Math.sin(s.ang), L = 9;
        ctx.globalAlpha = a;
        ctx.strokeStyle = "#3a2410";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + cs * L, by + sn * L);
        ctx.stroke();
        ctx.strokeStyle = "#8a6038";
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.fillStyle = "#f2ece0";
        ctx.beginPath();
        ctx.moveTo(bx + cs * L, by + sn * L);
        ctx.lineTo(bx + cs * (L - 3) - sn * 2.4, by + sn * (L - 3) + cs * 2.4);
        ctx.lineTo(bx + cs * (L - 3) + sn * 2.4, by + sn * (L - 3) - cs * 2.4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    for (const a of c.arrows) {
      if (a.owner === "hero" && c.heroLook === "hero") {
        // The King's sword swing sends out a golden crescent slash.
        const pulse = 1 + Math.sin(this.time * 30 + a.id) * 0.08;
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.angle);
        ctx.scale(pulse, pulse);
        // Afterimage trail.
        for (let i = 3; i >= 1; i--) {
          ctx.globalAlpha = 0.18 * (4 - i) / 3;
          ctx.fillStyle = "#ffae20";
          ctx.beginPath();
          ctx.arc(-i * 7, 0, 11, -1.15, 1.15);
          ctx.arc(-i * 7 - 6, 0, 9, 1.0, -1.0, true);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "lighter";
        this.drawBlob(ctx, this.glintBlob(), 2, 0, 20, 16, 0.55);
        ctx.globalCompositeOperation = "source-over";
        // Gradient is in the slash's local space, so one cached gradient serves every slash.
        ctx.fillStyle = (this.slashGrad ??= (() => {
          const g = ctx.createLinearGradient(-8, 0, 11, 0);
          g.addColorStop(0, "#e07a00");
          g.addColorStop(0.55, "#ffc928");
          g.addColorStop(1, "#fff6b0");
          return g;
        })());
        ctx.strokeStyle = "rgba(110,50,0,0.85)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, 11, -1.2, 1.2);
        ctx.arc(-6, 0, 9, 1.05, -1.05, true);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        continue;
      }
      // A real arrow: fading motion streak, dark-outlined wooden shaft, steel head, white fletching.
      const hero = a.owner === "hero";
      const L = hero ? 17 : 14;
      // Lobbed flight: a gentle arc (highest mid-way, height scaled to the shot's length) with the
      // shaft pitched along it; the sim's homing path stays straight underneath.
      let lift = 0, dirx = Math.cos(a.angle), diry = Math.sin(a.angle);
      const tgt = byIdArrow.get(a.target);
      if (tgt) {
        const d = Math.hypot(tgt.x - a.x, tgt.y - a.y);
        let d0 = this.arrowFrom.get(a.id);
        if (d0 === undefined) this.arrowFrom.set(a.id, (d0 = Math.max(d, 1)));
        const u = Math.min(1, Math.max(0, 1 - d / d0)), k = hero ? 0.12 : 0.2;
        lift = Math.sin(u * Math.PI) * k * d0;
        diry -= Math.cos(u * Math.PI) * Math.PI * k;
        const n = Math.hypot(dirx, diry);
        dirx /= n;
        diry /= n;
      }
      if (lift > 2) {
        // Its shadow on the ground beneath: a soft streak along the ground direction, fainter and
        // shorter the higher the arrow is.
        const gx = Math.cos(a.angle), gy = Math.sin(a.angle);
        const sa = Math.max(0.05, 0.28 - lift / 140);
        ctx.strokeStyle = `rgba(0,0,0,${sa.toFixed(3)})`;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(a.x - gx * L * 0.9, a.y + 4 - gy * L * 0.9);
        ctx.lineTo(a.x, a.y + 4);
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(0, -lift);
      const cs = dirx, sn = diry;
      const tx = a.x - cs * L, ty = a.y - sn * L;
      // Motion streak: two fading segments (no per-arrow gradient allocation).
      ctx.lineWidth = hero ? 4 : 3;
      ctx.strokeStyle = hero ? "rgba(255,236,160,0.2)" : "rgba(255,240,200,0.14)";
      ctx.beginPath();
      ctx.moveTo(tx - cs * 18, ty - sn * 18);
      ctx.lineTo(tx - cs * 8, ty - sn * 8);
      ctx.stroke();
      ctx.strokeStyle = hero ? "rgba(255,236,160,0.6)" : "rgba(255,240,200,0.4)";
      ctx.beginPath();
      ctx.moveTo(tx - cs * 8, ty - sn * 8);
      ctx.lineTo(a.x, a.y);
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(a.x, a.y);
      ctx.stroke();
      ctx.strokeStyle = "#c8894a";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(a.x, a.y);
      ctx.stroke();
      // Head.
      ctx.fillStyle = "#e8ecf2";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.x + cs * 5, a.y + sn * 5);
      ctx.lineTo(a.x - sn * 3, a.y + cs * 3);
      ctx.lineTo(a.x + sn * 3, a.y - cs * 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Fletching (dyed in the tower's specialisation colour).
      const specCol = a.spec === "fire" ? "#ff8a3a" : a.spec === "frost" ? "#8ae0ff" : a.spec === "volley" ? "#ffd84a" : null;
      ctx.fillStyle = hero ? "#ffd84a" : specCol ?? "#f4f0e6";
      ctx.beginPath();
      ctx.moveTo(tx + cs * 4, ty + sn * 4);
      ctx.lineTo(tx - cs * 2 - sn * 3.5, ty - sn * 2 + cs * 3.5);
      ctx.lineTo(tx - cs * 2 + sn * 3.5, ty - sn * 2 - cs * 3.5);
      ctx.closePath();
      ctx.fill();
      // Specialised arrows glow: a burning or frosty head and a coloured trail.
      if (a.spec === "fire" || a.spec === "frost") {
        ctx.globalCompositeOperation = "lighter";
        const blob = a.spec === "fire"
          ? this.blob("specfire", [[0, "rgba(255,200,90,1)"], [0.4, "rgba(255,110,30,0.8)"], [1, "rgba(255,60,10,0)"]])
          : this.blob("specfrost", [[0, "rgba(230,250,255,1)"], [0.4, "rgba(120,210,255,0.8)"], [1, "rgba(60,150,255,0)"]]);
        const fl = 1 + Math.sin(this.time * 31 + a.id) * 0.15;
        this.drawBlob(ctx, blob, a.x, a.y, 8 * fl, 8 * fl, 0.95);
        for (let i = 1; i <= 3; i++) this.drawBlob(ctx, blob, a.x - cs * i * 6, a.y - sn * i * 6, 6 - i, 6 - i, 0.5 - i * 0.12);
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.restore();
    }
    if (this.arrowFrom.size > 300) for (const id of [...this.arrowFrom.keys()]) if (!c.arrows.some((a) => a.id === id)) this.arrowFrom.delete(id);
    // Crossbow bolts that reach the palisade stay stuck in it for a few seconds (spotted as bolts
    // that vanished near the wall since last frame; visual only).
    for (const b of this.lastBolts) {
      if (b.kind === "bolt" && !c.bolts.includes(b) && b.y > WALL_Y - WALL_THICK / 2 - 30) {
        if (this.wallBolts.length > 24) this.wallBolts.shift();
        this.wallBolts.push({ x: b.x, y: WALL_Y - WALL_THICK / 2 - 4 - ((b.x * 13) % 9), tilt: (((b.x * 7) % 10) - 5) * 0.04, t: this.time });
      }
    }
    this.lastBolts = [...c.bolts];
    this.wallBolts = this.wallBolts.filter((w) => this.time - w.t < 5);
    for (const w of this.wallBolts) {
      const a = Math.min(1, (5 - (this.time - w.t)) / 0.8);
      const quiver = this.time - w.t < 0.25 ? Math.sin((this.time - w.t) * 70) * 0.18 * (1 - (this.time - w.t) / 0.25) : 0;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(w.x, w.y);
      ctx.rotate(w.tilt + quiver);
      ctx.strokeStyle = "#3a2410";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -10);
      ctx.stroke();
      ctx.strokeStyle = "#7a5634";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#b8322a";
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(-2.4, -6.5);
      ctx.lineTo(2.4, -6.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    for (const b of c.bolts) {
      if (b.kind === "fireball") {
        // A tail of fire behind the ball (it falls toward the wall), thinning into smoke; a
        // flickering glow and a white-hot core.
        const flame = this.blob("fireball", [[0, "rgba(255,210,120,1)"], [0.35, "rgba(255,120,30,0.85)"], [1, "rgba(220,50,10,0)"]]);
        const smoke = this.blob("dust", [[0, "rgba(206,190,164,0.9)"], [0.6, "rgba(196,180,150,0.45)"], [1, "rgba(190,172,140,0)"]]);
        const seed = b.x * 0.13;
        ctx.save();
        for (let i = 6; i >= 1; i--) {
          const u = i / 6;
          const wob = Math.sin(this.time * 18 + i * 1.9 + seed) * 2.2 * u;
          const ty = b.y - u * 30;
          if (u > 0.6) this.drawBlob(ctx, smoke, b.x + wob, ty - 4, 5 + u * 5, 5 + u * 5, (1 - u) * 0.9);
          ctx.globalCompositeOperation = "lighter";
          this.drawBlob(ctx, flame, b.x + wob, ty, 7 * (1 - u * 0.6), 9 * (1 - u * 0.5), (1 - u) * 0.9);
          ctx.globalCompositeOperation = "source-over";
        }
        const fl = 1 + Math.sin(this.time * 31 + seed) * 0.12;
        ctx.globalCompositeOperation = "lighter";
        this.drawBlob(ctx, flame, b.x, b.y, 14 * fl, 14 * fl, 0.45);
        this.drawBlob(ctx, flame, b.x, b.y, 7.5 * fl, 7.5 * fl, 0.85);
        this.drawBlob(ctx, this.glintBlob(), b.x, b.y + 1, 3.6, 3.6, 1);
        ctx.restore();
      } else {
        // Enemy bolt: dark shaft, iron head pointing down at the wall, red fletching.
        ctx.strokeStyle = "rgba(255,200,180,0.25)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y - 26);
        ctx.lineTo(b.x, b.y - 12);
        ctx.stroke();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x, b.y - 13);
        ctx.stroke();
        ctx.strokeStyle = "#5a3a20";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x, b.y - 13);
        ctx.stroke();
        ctx.fillStyle = "#9aa0aa";
        ctx.beginPath();
        ctx.moveTo(b.x, b.y + 5);
        ctx.lineTo(b.x - 3, b.y);
        ctx.lineTo(b.x + 3, b.y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#d8382c";
        ctx.beginPath();
        ctx.moveTo(b.x, b.y - 9);
        ctx.lineTo(b.x - 3.5, b.y - 15);
        ctx.lineTo(b.x + 3.5, b.y - 15);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  /** Boulder impacts. "ground": a dark crater with a churned rim that fades over ~6 s.
   *  "dust": a cloud of soft puffs that billows outward and up, thinning over ~1.2 s. */
  /** Impact stars: a four-point flash where a blow or arrow lands, popping out and fading in ~0.15 s. */
  private hitStars: { x: number; y: number; t: number; gold: boolean; big: boolean; rot: number }[] = [];
  private drawHitStars(ctx: CanvasRenderingContext2D): void {
    const LIFE = 0.15;
    this.hitStars = this.hitStars.filter((h) => this.time - h.t < LIFE);
    if (!this.hitStars.length) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const h of this.hitStars) {
      const u = (this.time - h.t) / LIFE;
      const sc = (h.big ? 1.7 : 1) * (0.5 + 0.8 * (1 - (1 - u) ** 3));
      const L = 9 * sc, W = 1.8 * sc;
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(h.rot);
      ctx.globalAlpha = 1 - u;
      ctx.fillStyle = h.gold ? "#ffe27a" : "#fff8e0";
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2, b = a + Math.PI / 4;
        ctx.lineTo(Math.cos(a) * L, Math.sin(a) * L);
        ctx.lineTo(Math.cos(b) * W, Math.sin(b) * W);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  private drawImpacts(ctx: CanvasRenderingContext2D, layer: "ground" | "dust"): void {
    this.impacts = this.impacts.filter((m) => this.time - m.t < 6);
    for (const m of this.impacts) {
      const age = this.time - m.t;
      if (layer === "ground") {
        const a = Math.min(1, age * 8) * (1 - Math.max(0, age - 4) / 2);
        const r = m.r * 0.55;
        const g = ctx.createRadialGradient(m.x, m.y, r * 0.15, m.x, m.y, r);
        g.addColorStop(0, `rgba(36,26,18,${(0.7 * a).toFixed(3)})`);
        g.addColorStop(0.7, `rgba(66,50,34,${(0.45 * a).toFixed(3)})`);
        g.addColorStop(1, "rgba(90,70,50,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(m.x, m.y, r * 1.3, r * 0.65, 0, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (age > 1.6) continue;
      const u = age / 1.6;
      const puff = this.blob("dust", [[0, "rgba(206,190,164,0.9)"], [0.6, "rgba(196,180,150,0.45)"], [1, "rgba(190,172,140,0)"]]);
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2 + m.x * 0.01;
        const d = m.r * (0.25 + u * 0.75) * (0.8 + ((i * 37) % 10) / 25);
        const px = m.x + Math.cos(ang) * d * 1.3;
        const py = m.y + Math.sin(ang) * d * 0.6 - u * 14 - (i % 3) * 4 * u;
        const rr = 14 + u * 24 + (i % 3) * 4;
        this.drawBlob(ctx, puff, px, py, rr, rr * 0.8, Math.pow(1 - u, 1.3));
      }
    }
  }

  private drawStrikes(ctx: CanvasRenderingContext2D, c: Camp): void {
    ctx.lineCap = "round";
    for (const st of c.strikes) {
      const p = 1 - st.t / st.total;
      if (st.radius && st.fromX !== undefined && st.fromY !== undefined) {
        // Boulder on an arc, with a target ring that tightens as it lands.
        const bx = st.fromX + (st.x - st.fromX) * p;
        const by = st.fromY + (st.y - st.fromY) * p - Math.sin(p * Math.PI) * 160;
        ctx.strokeStyle = `rgba(255,80,40,${(0.3 + p * 0.4).toFixed(2)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(st.x, st.y, st.radius * (1.2 - p * 0.3), st.radius * 0.5 * (1.2 - p * 0.3), 0, 0, Math.PI * 2);
        ctx.stroke();
        // Ground shadow under the boulder: wide and faint while high, tight and dark as it lands.
        const gx = st.fromX + (st.x - st.fromX) * p, gy = st.fromY + (st.y - st.fromY) * p + 20;
        const h = Math.sin(p * Math.PI);
        ctx.fillStyle = `rgba(0,0,0,${(0.32 - h * 0.2).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(gx, gy, 7 + h * 6, 3 + h * 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
        const r = 7 + h * 3;
        const decor = this.decorAtlas();
        const e = DECOR_ATLAS.boulder1;
        // The stone is still in the catapult's bowl until the arm releases it (~0.09 s in).
        if ((1 - p) * st.total > st.total - 0.09) continue;
        if (decor && e) {
          // A short dust trail, then the 3D-rendered boulder tumbling end over end.
          const q = Math.max(0, p - 0.06);
          const tx = st.fromX + (st.x - st.fromX) * q, ty = st.fromY + (st.y - st.fromY) * q - Math.sin(q * Math.PI) * 160;
          const trail = ctx.createLinearGradient(tx, ty, bx, by);
          trail.addColorStop(0, "rgba(200,190,170,0)");
          trail.addColorStop(1, "rgba(200,190,170,0.35)");
          ctx.strokeStyle = trail;
          ctx.lineWidth = r * 1.2;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(bx, by);
          ctx.stroke();
          const [sx, sy, sw, sh] = e;
          const k = (r * 2.3) / sw;
          ctx.save();
          ctx.translate(bx, by);
          ctx.rotate(p * 7 * (st.x < st.fromX ? -1 : 1));
          ctx.drawImage(decor, sx, sy, sw, sh, (-sw * k) / 2, (-sh * k) / 2, sw * k, sh * k);
          ctx.restore();
          continue;
        }
        ctx.fillStyle = "#7a7268";
        ctx.strokeStyle = INK;
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        continue;
      }
      // Arrow Rain: a real arrow dropping out of the sky at a slant, accelerating, with a fading
      // streak and a ground shadow that tightens as it comes down.
      const fall = p * p;
      const drift = (1 - fall) * 60;
      const ax = st.x - drift, ay = st.y - (1 - fall) * 300;
      const ang = Math.atan2(300 * 2 * p, 60 * 2 * p + 0.001); // direction of travel
      const cs = Math.cos(ang), sn = Math.sin(ang);
      ctx.fillStyle = `rgba(0,0,0,${(0.08 + fall * 0.25).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(st.x, st.y + 2, 2 + (1 - fall) * 6, 1 + (1 - fall) * 2, 0, 0, Math.PI * 2);
      ctx.fill();
      const tl = 26 * (0.4 + p);
      const streak = ctx.createLinearGradient(ax - cs * tl, ay - sn * tl, ax, ay);
      streak.addColorStop(0, "rgba(255,240,190,0)");
      streak.addColorStop(1, "rgba(255,240,190,0.45)");
      ctx.strokeStyle = streak;
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(ax - cs * tl, ay - sn * tl);
      ctx.lineTo(ax, ay);
      ctx.stroke();
      // At night the dark shafts vanish: each arrow also leaves a glowing trail drawn above the
      // darkness, so the volley reads as streaks of light raining down.
      if (this.night > 0.3) {
        const m = ctx.getTransform(), gl = tl * 1.6;
        this.lateBars.push((ctx) => {
          ctx.save();
          ctx.setTransform(m);
          ctx.globalCompositeOperation = "lighter";
          const g = ctx.createLinearGradient(ax - cs * gl, ay - sn * gl, ax, ay);
          g.addColorStop(0, "rgba(255,200,110,0)");
          g.addColorStop(1, "rgba(255,230,160,0.85)");
          ctx.strokeStyle = g;
          ctx.lineWidth = 2.6;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(ax - cs * gl, ay - sn * gl);
          ctx.lineTo(ax, ay);
          ctx.stroke();
          ctx.fillStyle = "rgba(255,245,210,0.9)";
          ctx.beginPath();
          ctx.arc(ax, ay, 1.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
      }
      const L = 13;
      ctx.strokeStyle = "#3a2410";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(ax - cs * L, ay - sn * L);
      ctx.lineTo(ax, ay);
      ctx.stroke();
      ctx.strokeStyle = "#a07848";
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.fillStyle = "#d8dde6";
      ctx.beginPath();
      ctx.moveTo(ax + cs * 4, ay + sn * 4);
      ctx.lineTo(ax - sn * 2.6, ay + cs * 2.6);
      ctx.lineTo(ax + sn * 2.6, ay - cs * 2.6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#f4efe4";
      ctx.beginPath();
      ctx.moveTo(ax - cs * L, ay - sn * L);
      ctx.lineTo(ax - cs * (L - 4) - sn * 3, ay - sn * (L - 4) + cs * 3);
      ctx.lineTo(ax - cs * (L - 4) + sn * 3, ay - sn * (L - 4) - cs * 3);
      ctx.closePath();
      ctx.fill();
    }
    if (c.overclock > 0) {
      // Overclocked towers: a warm aura breathing round the platform and motes of gold rising
      // off it (instead of flat pulsing outlines).
      const glow = this.blob("oc", [[0, "rgba(255,210,90,0.9)"], [0.5, "rgba(255,170,50,0.35)"], [1, "rgba(255,150,40,0)"]]);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const p of c.plots) {
        if (p.kind !== "tower" || p.level <= 0) continue;
        const pulse = 0.55 + 0.25 * Math.sin(this.time * 9 + p.x * 0.05);
        this.drawBlob(ctx, glow, p.x, p.y - 30, 40, 52, pulse * Math.min(1, c.overclock * 2));
        for (let i = 0; i < 6; i++) {
          const u = (this.time * 0.9 + i / 6 + p.x * 0.013) % 1;
          const mx = p.x + Math.sin(i * 2.4 + u * 5) * 18, my = p.y - 6 - u * 70;
          this.drawBlob(ctx, this.glintBlob(), mx, my, 3.4, 3.4, (1 - u) * Math.min(1, c.overclock * 2));
        }
      }
      ctx.restore();
    }
  }

  private drawFlyers(ctx: CanvasRenderingContext2D, dt: number): void {
    // Spent coins / logs / bows arc from the hero to what they pay for: they leave quickly, hang at
    // the top of the arc and accelerate into the target (ease-in-out), coins flipping edge-over-edge
    // with a glint and a short sparkle trail, logs and bows tumbling.
    const pos = (f: Flyer, raw: number): [number, number] => {
      const t = Math.min(1, Math.max(0, raw));
      const e = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
      return [f.from.x + (f.to.x - f.from.x) * e, f.from.y + (f.to.y - f.from.y) * e - Math.sin(t * Math.PI) * 40];
    };
    for (const f of this.flyers) {
      f.t += dt * (f.speed ?? 3.5);
      if (f.follow) f.to = { x: this.courierTo.x, y: this.courierTo.y - 20 };
      const t = Math.min(1, f.t);
      const [x, y] = pos(f, t);
      const spin = t * Math.PI * 3 + (f.from.x + f.to.y) * 0.05;
      if (f.log || f.bow) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(spin) * 0.6);
        if (f.log) drawLogPile(ctx, 0, -8, 1, false);
        else drawBowItem(ctx, 0, 0);
        ctx.restore();
        continue;
      }
      // Trail: a few fading sparks along the path just behind the coin.
      for (let i = 1; i <= 3; i++) {
        const [tx, ty] = pos(f, t - i * 0.05);
        ctx.fillStyle = `rgba(255,230,140,${(0.5 - i * 0.14).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(tx, ty, 2.6 - i * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      const w = Math.max(0.8, Math.abs(Math.cos(spin)) * 5);
      const face = Math.cos(spin) > 0;
      ctx.fillStyle = "#8a5a10"; // rim seen as the coin turns edge-on
      ctx.beginPath();
      ctx.ellipse(x + 0.6, y + 0.8, w + 0.6, 4.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = face ? "#f7d256" : "#e0b23a";
      ctx.beginPath();
      ctx.ellipse(x, y, w, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      if (w > 2.5) {
        ctx.fillStyle = "rgba(255,250,220,0.85)";
        ctx.beginPath();
        ctx.ellipse(x - w * 0.35, y - 1.5, w * 0.25, 1.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    this.flyers = this.flyers.filter((f) => f.t < 1);
  }

  /** Screen-edge arrows: threats you can't see, and where to spend your coins. */
  private drawIndicators(ctx: CanvasRenderingContext2D, c: Camp, o: Vec): void {
    const h = c.hero;
    const margin = 28;
    const onScreen = (v: Vec) => v.x > o.x + 10 && v.x < o.x + VIEW_W - 10 && v.y > o.y + 50 && v.y < o.y + VIEW_H - 10;
    // While the boss HP bar is up (under the HUD), keep arrows clear of it too.
    const bossBar = c.enemies.some((e) => e.def.boss);
    const edgeArrow = (target: Vec, color: string, icon: IconKind, pulse: number) => {
      const cx = VIEW_W / 2;
      const dx = target.x - o.x - cx;
      // Keep arrows inside the play area: below the two-row HUD and above the bottom buttons.
      const top = bossBar ? 134 : 112;
      const bottom = VIEW_H - 40;
      const midY = (top + bottom) / 2;
      const ddy = target.y - o.y - midY;
      const k = Math.min((cx - margin) / Math.abs(dx || 1e-6), ((bottom - top) / 2) / Math.abs(ddy || 1e-6));
      const ax = cx + dx * k;
      const ay = midY + ddy * k;
      const a = Math.atan2(ddy, dx);
      const s = 1 + Math.sin(this.time * 8) * 0.08 * pulse;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.scale(s, s);
      ctx.fillStyle = color;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(24, 0);
      ctx.lineTo(14, -7);
      ctx.lineTo(14, 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.rotate(-a);
      drawIcon(ctx, icon, 0, 0, 8, "#ffffff");
      ctx.restore();
    };

    // Threats: enemies inside the camp, battering the wall, or bosses — off screen.
    // The treasure goblin is a timed chase, so it gets a gold arrow and goes first.
    // Threats hidden under the two-row HUD count as off-screen too (they'd otherwise get no arrow).
    const hudBottom = o.y + (bossBar ? 134 : 112);
    const visibleThreat = (v: Vec) => onScreen(v) && v.y > hudBottom;
    const threats = c.enemies.filter((e) => (e.inside || e.attacking || e.def.boss || e.def.id === "thief") && !visibleThreat(e)).sort((a, b) => Number(b.def.id === "thief") - Number(a.def.id === "thief"));
    const shown: number[] = [];
    for (const e of threats) {
      const a = Math.atan2(e.y - (o.y + VIEW_H / 2), e.x - (o.x + VIEW_W / 2));
      if (shown.some((s) => Math.abs(s - a) < 0.35)) continue;
      shown.push(a);
      if (e.def.id === "thief") edgeArrow(e, "#e8b020", "coin", 1.4);
      else edgeArrow(e, e.inside ? "#ff4a3a" : "#ff9a3a", e.def.boss ? "crown" : e.inside ? "warn" : "sword", 1);
      if (shown.length >= 4) break;
    }

    // Guide: point at the cheapest plot the hero can afford right now (or the income pile when broke).
    if (h.dead) return;
    let goal: Vec | null = null;
    let icon: IconKind = "tower";
    const affordable = c.plots
      // Repair only counts when the wall is actually hurt (below 60%); otherwise skip it and keep
      // looking — it's the cheapest plot, so rejecting it after sorting hid the arrow mid-game.
      .filter((p) => (p.kind !== "repair" || c.segments.some((sg) => sg.hp < sg.maxHp * 0.6)) && !plotMaxed(p) && !p.locked && h.coins >= plotCost(p) - p.paid && h.logs >= plotLogCost(p) - p.paidLogs && h.coins + h.logs > 0)
      .sort((a, b) => plotCost(a) - a.paid - (plotCost(b) - b.paid))[0];
    if (affordable) {
      // An upgrade's price plate sits below the building: point there, so the arrow and its
      // landing ring hit the ground instead of the roof.
      goal = affordable.level > 0 && affordable.kind !== "tower" ? { x: affordable.x, y: affordable.y + 46 } : affordable;
      icon = affordable.kind === "tower" ? "tower" : "hammer";
    } else if (h.bows > 0 && c.plots.some((p) => p.kind === "tower" && p.level > 0 && p.bows < BOWS_PER_TOWER)) {
      goal = c.plots.filter((p) => p.kind === "tower" && p.level > 0 && p.bows < BOWS_PER_TOWER).sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0]!;
      icon = "tower";
    } else if (c.forgeBows >= 3 && h.bows === 0 && c.plots.some((p) => p.kind === "tower" && p.level > 0 && p.bows < BOWS_PER_TOWER)) {
      goal = FORGE_OUT;
      icon = "sword";
    } else if (h.logs < 6 && c.lumberPile >= 6 && c.plots.some((p) => !plotMaxed(p) && plotLogCost(p) > p.paidLogs && h.coins >= plotCost(p) - p.paid)) {
      goal = LUMBER_PILE;
      icon = "sword";
    } else if (h.coins < 5 && c.incomePile >= 8) {
      goal = INCOME_PILE;
      icon = "coin";
    }
    if (this.guideOverride) {
      goal = this.guideOverride;
      icon = "coin";
    }
    if (!goal) return;
    const d = Math.hypot(goal.x - h.x, goal.y - h.y);
    if (d < 70) return;
    if (!onScreen(goal)) edgeArrow(goal, "#ffd84a", icon, 1);
    else {
      // Bouncing arrow above the goal — or below it, pointing up, when "above" would sit under the HUD
      // (the first tower plots hug the top of the screen on a new player's opening camera).
      // It moves like a ball: a parabolic hop (slow at the top, quick at the bottom), squashing on
      // each landing with a ring rippling out on the ground, and pops in with an overshoot when the
      // goal changes.
      const bx = goal.x - o.x;
      const key = `${Math.round(goal.x)},${Math.round(goal.y)}`;
      if (key !== this.guideKey) { this.guideKey = key; this.guideAt = this.time; }
      const age = this.time - this.guideAt;
      const pop = age >= 0.35 ? 1 : (() => { const u = age / 0.35, c = 2.2; return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2; })();
      const ph = (this.time * 1.5) % 1;
      const bounce = 4 * ph * (1 - ph) * 12;
      const contact = Math.max(0, 1 - Math.min(ph, 1 - ph) / 0.09);
      const sq = contact * contact * 0.16;
      const flip = goal.y - o.y - 68 - 22 < 112;
      const gy = goal.y - o.y;
      // Ground ring at the goal, launched by each landing.
      ctx.save();
      ctx.globalAlpha = (1 - ph) * 0.5 * Math.min(1, pop);
      ctx.strokeStyle = "#ffd84a";
      ctx.lineWidth = 2.5 * (1 - ph) + 0.5;
      ctx.beginPath();
      ctx.ellipse(bx, gy + 4, 14 + ph * 22, (14 + ph * 22) * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      // Above a plot the tip lands just over its caption, so the arrow never covers the name.
      const tipY = flip ? gy + 36 + bounce : gy - 52 - bounce;
      ctx.save();
      ctx.translate(bx, tipY);
      if (flip) ctx.scale(1, -1);
      ctx.scale(pop * (1 + sq), pop * (1 - sq));
      ctx.fillStyle = "#ffd84a";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-12, -16);
      ctx.lineTo(-5, -16);
      ctx.lineTo(-5, -28);
      ctx.lineTo(5, -28);
      ctx.lineTo(5, -16);
      ctx.lineTo(12, -16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // A soft highlight down the left edge so it reads as a lit, solid shape.
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.beginPath();
      ctx.moveTo(-2.5, -26);
      ctx.lineTo(-2.5, -15);
      ctx.lineTo(-8, -15);
      ctx.lineTo(-1.5, -5);
      ctx.lineTo(-1, -26);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  /** On-screen joystick: the knob follows the finger on a quick spring, and on release it springs
   *  back to the centre with a little overshoot while the pad fades out (instead of vanishing). */
  private joyShown: { ox: number; oy: number; kx: number; ky: number; vx: number; vy: number; alpha: number; t: number } | null = null;
  private drawJoystick(ctx: CanvasRenderingContext2D): void {
    const j = this.joystick;
    const now = this.time;
    if (j && !this.joyShown) this.joyShown = { ox: j.origin.x, oy: j.origin.y, kx: j.origin.x, ky: j.origin.y, vx: 0, vy: 0, alpha: 0, t: now };
    const s = this.joyShown;
    if (!s) return;
    const dt = Math.min(0.05, Math.max(0, now - s.t));
    s.t = now;
    if (j) {
      s.ox = j.origin.x;
      s.oy = j.origin.y;
    }
    const tx = j ? j.knob.x : s.ox, ty = j ? j.knob.y : s.oy;
    // Damped spring: stiff while held (tracks the finger), bouncier on the way home.
    const k = j ? 900 : 380, damp = j ? 55 : 16;
    s.vx += ((tx - s.kx) * k - s.vx * damp) * dt;
    s.vy += ((ty - s.ky) * k - s.vy * damp) * dt;
    s.kx += s.vx * dt;
    s.ky += s.vy * dt;
    s.alpha += ((j ? 1 : 0) - s.alpha) * (1 - Math.exp(-dt * (j ? 18 : 7)));
    if (!j && s.alpha < 0.02) {
      this.joyShown = null;
      return;
    }
    ctx.save();
    ctx.globalAlpha = s.alpha;
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(s.ox, s.oy, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.arc(s.kx, s.ky, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

}

/**
 * A coin spinning about its vertical axis, drawn as a real disc: when it turns edge-on you see
 * the milled rim (on the side it's turning toward), the face brightens as it turns to the light,
 * an embossed centre shows when it faces you, and a glint sweeps across now and then.
 */
function spinCoin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, angle: number): void {
  const c = Math.cos(angle);
  const w = Math.max(0.12, Math.abs(c));
  const side = Math.sin(angle) >= 0 ? 1 : -1;
  const rim = r * 0.32 * (1 - w);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#7a4c08";
  // Rim (thickness), offset toward the turning side.
  if (rim > 0.3) {
    ctx.fillStyle = "#b8840e";
    ctx.beginPath();
    ctx.ellipse(x + side * rim, y, r * w, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(Math.min(x, x + side * rim), y - r, Math.abs(rim), r * 2);
  }
  // Face: brighter the more it faces the (top-left) light.
  const lit = 0.55 + 0.45 * Math.max(0, -Math.sin(angle) * 0.6 + c * 0.8);
  const face = ctx.createRadialGradient(x - r * w * 0.4, y - r * 0.45, r * 0.1, x, y, r * 1.1);
  face.addColorStop(0, `rgba(255,${Math.round(236 + 19 * lit)},${Math.round(150 + 60 * lit)},1)`);
  face.addColorStop(0.55, "#f2c23c");
  face.addColorStop(1, "#c98d10");
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.ellipse(x, y, r * w, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Embossed centre when facing the viewer.
  if (w > 0.45) {
    ctx.strokeStyle = "rgba(140,90,10,0.6)";
    ctx.beginPath();
    ctx.ellipse(x, y, r * w * 0.55, r * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Glint sweeping across the face.
  const g = ((angle * 0.5) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  if (g < 0.7 && w > 0.3) {
    ctx.strokeStyle = `rgba(255,255,255,${(0.85 * (1 - g / 0.7)).toFixed(2)})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x - r * w * 0.5, y + r * 0.35);
    ctx.lineTo(x + r * w * 0.2, y - r * 0.55);
    ctx.stroke();
  }
}


/** The hero is drawn this much larger than troops (scaled about the feet). */
const HERO_K = 1.45;

/** Crimson cape with gold trim hanging from the shoulders; streams away from the walk direction. */
function drawHeroCape(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number, moving: boolean, t: number): void {
  const stream = moving ? 1 : 0.25;
  const dx = -Math.cos(facing) * 6 * stream;
  const wave = Math.sin(t * (moving ? 12 : 3)) * (moving ? 2.2 : 0.8);
  const top = y - 6;
  const hem = y + 9 + (moving ? -2 : 0);
  ctx.save();
  ctx.fillStyle = "#b3261e";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x - 6, top);
  ctx.quadraticCurveTo(x - 9 + dx * 0.5, (top + hem) / 2, x - 9 + dx + wave, hem);
  ctx.quadraticCurveTo(x + dx * 0.9, hem + 3 + wave * 0.5, x + 9 + dx - wave, hem);
  ctx.quadraticCurveTo(x + 9 + dx * 0.5, (top + hem) / 2, x + 6, top);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Gold hem trim + inner fold shading.
  ctx.strokeStyle = "#f2c443";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x - 8.5 + dx + wave, hem - 1);
  ctx.quadraticCurveTo(x + dx * 0.9, hem + 2 + wave * 0.5, x + 8.5 + dx - wave, hem - 1);
  ctx.stroke();
  ctx.strokeStyle = "rgba(60,8,6,0.35)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - 1, top + 2);
  ctx.quadraticCurveTo(x - 1 + dx * 0.4, (top + hem) / 2, x - 2 + dx * 0.8, hem);
  ctx.stroke();
  ctx.restore();
}

/** Small gold crown with a glinting gem, perched on the hero's head. */
function drawHeroCrown(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  ctx.save();
  ctx.fillStyle = "#f2c443";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - 5.5, y + 2.5);
  ctx.lineTo(x - 5.5, y - 2);
  ctx.lineTo(x - 3, y);
  ctx.lineTo(x, y - 3.5);
  ctx.lineTo(x + 3, y);
  ctx.lineTo(x + 5.5, y - 2);
  ctx.lineTo(x + 5.5, y + 2.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#2a6cff";
  ctx.beginPath();
  ctx.arc(x, y + 0.8, 1.3, 0, Math.PI * 2);
  ctx.fill();
  // Periodic glint.
  const g = Math.max(0, Math.sin(t * 2.2)) ** 12;
  if (g > 0.02) {
    ctx.fillStyle = `rgba(255,255,255,${g})`;
    ctx.beginPath();
    ctx.arc(x + 3.5, y - 1.5, 1.6 * g + 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
