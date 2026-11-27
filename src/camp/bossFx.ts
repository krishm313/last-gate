// Boss signature effects and boss arenas (phase 9 C8), split out of render.ts (phase 10 B3).
import type { Fx } from "../render/fx";
import type { Camp } from "./sim";
import { VIEW_H, VIEW_W, WALL_THICK, WALL_Y } from "./world";

/** What these effects need from the renderer. */
export interface BossFxEnv {
  time: number;
  night: number;
  lite: number;
  ambient: boolean;
  fx: Fx;
  base: [number, number, number, number, number, number];
  blob(key: string, stops: [number, string][]): HTMLCanvasElement;
  drawBlob(ctx: CanvasRenderingContext2D, b: HTMLCanvasElement, x: number, y: number, rx: number, ry?: number, alpha?: number): void;
}

export class BossFx {
  /** Marsh Troll's bog: a dark, sucking pool of marsh water and weed that gloops (slows the King). */
  drawBogPool(env: BossFxEnv, ctx: CanvasRenderingContext2D, l: { x: number; y: number; r: number; t: number; dur: number }): void {
    const grow = Math.min(1, l.t / 0.35);
    const fade = Math.max(0, Math.min(1, (l.dur - l.t) / 1.0));
    const a = grow * fade;
    const r = l.r * (0.6 + 0.4 * grow);
    ctx.save();
    ctx.fillStyle = `rgba(38,44,20,${0.7 * a})`;
    ctx.beginPath(); ctx.ellipse(l.x, l.y, r * 1.12, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(l.x, l.y - 2, 2, l.x, l.y, r);
    g.addColorStop(0, `rgba(96,112,52,${0.95 * a})`);
    g.addColorStop(0.7, `rgba(64,78,34,${0.9 * a})`);
    g.addColorStop(1, `rgba(40,50,22,${0.6 * a})`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(l.x, l.y, r, r * 0.44, 0, 0, Math.PI * 2); ctx.fill();
    // Weed and slow bubbles that swell and pop.
    ctx.strokeStyle = `rgba(140,170,70,${0.8 * a})`;
    ctx.lineWidth = 1.6;
    for (let k = 0; k < 5; k++) {
      const ang = k * 1.3 + l.x * 0.02;
      const wx = l.x + Math.cos(ang) * r * 0.6, wy = l.y + Math.sin(ang) * r * 0.22;
      ctx.beginPath(); ctx.moveTo(wx, wy); ctx.quadraticCurveTo(wx + 3, wy - 5, wx + Math.sin(env.time * 2 + k) * 3, wy - 9); ctx.stroke();
    }
    for (let k = 0; k < 3; k++) {
      const ph = (env.time * 0.9 + k * 0.37 + l.y * 0.01) % 1;
      const ang = k * 2.3 + l.y;
      ctx.strokeStyle = `rgba(190,210,140,${(1 - ph) * 0.8 * a})`;
      ctx.beginPath(); ctx.arc(l.x + Math.cos(ang) * r * 0.4, l.y + Math.sin(ang) * r * 0.15, 2 + ph * 5, Math.PI, 0); ctx.stroke();
    }
    ctx.restore();
  }

  /** Bone Dragon's fire breath: a roaring sheet of flame from its jaws down across the wall (x0..x1). */
  breaths: { x: number; y: number; x0: number; x1: number; t: number }[] = [];
  drawBreaths(env: BossFxEnv, ctx: CanvasRenderingContext2D): void {
    if (!this.breaths.length) return;
    const DUR = 0.9;
    for (const b of this.breaths) {
      const u = (env.time - b.t) / DUR;
      if (u >= 1) continue;
      const on = Math.min(1, u / 0.15) * Math.min(1, (1 - u) / 0.35);
      // Sweeps left → right across the band.
      const sx = b.x0 + (b.x1 - b.x0) * Math.min(1, u / 0.7);
      const mouthY = b.y + 10, wallY = WALL_Y - WALL_THICK / 2;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createLinearGradient(b.x, mouthY, sx, wallY);
      g.addColorStop(0, `rgba(255,240,170,${0.9 * on})`);
      g.addColorStop(0.5, `rgba(255,150,40,${0.75 * on})`);
      g.addColorStop(1, `rgba(255,70,10,${0.55 * on})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(b.x - 6, mouthY);
      ctx.lineTo(sx - 46, wallY + 6);
      ctx.quadraticCurveTo(sx, wallY + 22, sx + 46, wallY + 6);
      ctx.lineTo(b.x + 6, mouthY);
      ctx.closePath();
      ctx.fill();
      // Scorch glow along the stretch of wall already swept.
      env.drawBlob(ctx, env.blob("lavaglow", [[0, "rgba(255,120,40,0.9)"], [1, "rgba(255,60,10,0)"]]), (b.x0 + sx) / 2, wallY, Math.max(30, (sx - b.x0) / 2 + 30), 26, 0.6 * on);
      ctx.restore();
      if (env.fx.particles.length < 420) {
        env.fx.burst(sx + Math.sin(env.time * 31) * 30, wallY, Math.sin(env.time * 47) > 0 ? "#ffb040" : "#ff5a1a", 3, 120, { max: 0.5, size: 3.4, gravity: -90, shape: "dot" });
        if (Math.floor(env.time * 20) % 2 === 0) env.fx.burst(sx, wallY - 6, "rgba(60,50,45,0.7)", 1, 40, { max: 1, size: 8, gravity: -40, drag: 2 });
      }
    }
    this.breaths = this.breaths.filter((b) => env.time - b.t < DUR);
  }

  /** Iron Colossus quake: a heaving ring of earth rolls out, with cracks splitting the ground. */
  quakes: { x: number; y: number; r: number; t: number }[] = [];
  drawQuakes(env: BossFxEnv, ctx: CanvasRenderingContext2D): void {
    if (!this.quakes.length) return;
    const DUR = 1.1;
    for (const q of this.quakes) {
      const u = (env.time - q.t) / DUR;
      if (u >= 1) continue;
      const e = 1 - (1 - u) ** 3;
      const R = q.r * e;
      const gy = q.y + 30;
      ctx.save();
      // The rolling front: a thick band of churned earth.
      ctx.strokeStyle = `rgba(150,120,80,${(0.75 * (1 - u)).toFixed(3)})`;
      ctx.lineWidth = 10 * (1 - u) + 2;
      ctx.beginPath(); ctx.ellipse(q.x, gy, R, R * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(230,210,170,${(0.6 * (1 - u)).toFixed(3)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(q.x, gy - 2, R * 0.96, R * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
      // Cracks: jagged lines out from the feet, opening then closing.
      const open = Math.min(1, u / 0.25) * Math.min(1, (1 - u) / 0.4);
      ctx.strokeStyle = `rgba(30,20,12,${(0.85 * open).toFixed(3)})`;
      ctx.lineWidth = 2.6;
      ctx.lineJoin = "round";
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + 0.3;
        ctx.beginPath();
        ctx.moveTo(q.x, gy);
        let px = q.x, py = gy;
        for (let j = 1; j <= 4; j++) {
          const d = (q.r * 0.75 * e * j) / 4;
          px = q.x + Math.cos(a + Math.sin(j * 3.1 + k) * 0.25) * d;
          py = gy + Math.sin(a + Math.sin(j * 3.1 + k) * 0.25) * d * 0.42;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();
      if (u < 0.6 && env.fx.particles.length < 420) {
        const a = env.time * 9;
        env.fx.burst(q.x + Math.cos(a) * R, gy + Math.sin(a) * R * 0.42, "rgba(206,190,160,0.8)", 2, 50, { max: 0.6, size: 6, gravity: -14, drag: 3 });
        env.fx.burst(q.x + Math.cos(a + 2) * R, gy + Math.sin(a + 2) * R * 0.42, "#8a7458", 1, 120, { max: 0.5, size: 3, gravity: 360, shape: "chunk" });
      }
    }
    this.quakes = this.quakes.filter((q) => env.time - q.t < DUR);
  }

  /** Arena vignettes, one small canvas per tint (stretched to the view when drawn). */
  private vignettes = new Map<string, HTMLCanvasElement | null>();
  private vignette(tint: string, W: number, H: number): HTMLCanvasElement | null {
    if (this.vignettes.has(tint)) return this.vignettes.get(tint)!;
    let cv: HTMLCanvasElement | null = null;
    if (typeof document !== "undefined") {
      cv = document.createElement("canvas");
      const w = 72, h = Math.round((72 * H) / W);
      cv.width = w;
      cv.height = h;
      const g2 = cv.getContext("2d");
      if (g2) {
        const g = g2.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
        g.addColorStop(0, `rgba(${tint},0)`);
        g.addColorStop(1, `rgba(${tint},0.32)`);
        g2.fillStyle = g;
        g2.fillRect(0, 0, w, h);
      } else cv = null;
    }
    this.vignettes.set(tint, cv);
    return cv;
  }

  /** Boss arena: while a boss is on the field the whole night takes on its colour — an edge tint and
   *  drifting motes in its theme (embers, snow, spores, ash, sea-mist, blood motes, wisps, dust). */
  arenaAt = -1;
  arenaId = "";
  drawArena(env: BossFxEnv, ctx: CanvasRenderingContext2D, c: Camp): void {
    const boss = env.ambient ? undefined : c.enemies.find((e) => e.def.boss && e.hp > 0);
    if (!boss) { this.arenaAt = -1; return; }
    if (this.arenaId !== boss.def.id || this.arenaAt < 0) { this.arenaId = boss.def.id; this.arenaAt = env.time; }
    const T = ARENA[boss.def.id] ?? ARENA.ogre!;
    const fade = Math.min(1, (env.time - this.arenaAt) / 1.5) * (boss.enraged ? 1.25 : 1);
    ctx.save();
    ctx.setTransform(...env.base);
    const W = VIEW_W, H = VIEW_H;
    // Edge tint (deeper once the boss is enraged): a vignette pre-drawn once per theme into a small
    // canvas and stretched over the view — a full-screen gradient fill every frame cost ~5 ms.
    const vig = this.vignette(T.tint, W, H);
    if (vig) {
      ctx.globalAlpha = Math.min(1, fade);
      ctx.drawImage(vig, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    // Motes: stateless (each one's position is a function of time), so they cost nothing to keep.
    const n = env.lite >= 2 ? 0 : env.lite >= 1 ? 16 : 34;
    ctx.fillStyle = `rgb(${T.mote})`;
    if (T.glow) ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < n; i++) {
      const h1 = ((i * 7919) % 1000) / 1000, h2 = ((i * 104729) % 1000) / 1000, h3 = ((i * 31337) % 1000) / 1000;
      const sp = 0.5 + h3;
      const ph = (h2 + (env.time * T.speed * sp) / H) % 1;
      const y = T.rise ? H * (1 - ph) : H * ph;
      const x = W * h1 + Math.sin(env.time * (0.6 + h3) + i) * T.sway;
      const tw = 0.55 + 0.45 * Math.sin(env.time * 3 + i * 1.7);
      ctx.globalAlpha = fade * tw * (T.glow ? 0.8 : 0.65);
      const rr = (T.size * (0.6 + h3 * 0.8));
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Thunder Giant strikes: jagged bolts from the storm onto each target, with a glowing scorch. */
  thunders: { x: number; y: number; t: number; seed: number }[] = [];
  drawThunders(env: BossFxEnv, ctx: CanvasRenderingContext2D): void {
    if (!this.thunders.length) return;
    const DUR = 0.5;
    for (const b of this.thunders) {
      const u = (env.time - b.t) / DUR;
      if (u >= 1 || u < 0) continue;
      const a = u < 0.15 ? 1 : 1 - (u - 0.15) / 0.85;
      // Bolt: a zig-zag from high above down to the target, re-jittered a few times as it flickers.
      let seed = b.seed + Math.floor(u * 12);
      const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      const top = b.y - 360;
      const pts: [number, number][] = [[b.x + (rnd() - 0.5) * 60, top]];
      for (let k = 1; k <= 9; k++) pts.push([b.x + (rnd() - 0.5) * 34 * (1 - k / 10), top + (b.y - top) * (k / 9)]);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const [w, col] of [[9, `rgba(120,170,255,${(0.35 * a).toFixed(3)})`], [3.5, `rgba(220,235,255,${(0.95 * a).toFixed(3)})`]] as const) {
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(pts[0]![0], pts[0]![1]);
        for (const [x, y] of pts) ctx.lineTo(x, y);
        ctx.stroke();
      }
      env.drawBlob(ctx, env.blob("thunderglow", [[0, "rgba(170,210,255,0.95)"], [1, "rgba(60,110,255,0)"]]), b.x, b.y, 46, 22, 0.8 * a);
      ctx.restore();
    }
    this.thunders = this.thunders.filter((b) => env.time - b.t < DUR);
  }

  /** Thunder Giant: a storm-blue halo that crackles with sparks. */
  drawThunderAura(env: BossFxEnv, ctx: CanvasRenderingContext2D, c: Camp, e: { x: number; y: number; id: number; enraged: boolean; def: { radius: number } }): void {
    const r = e.def.radius;
    const pulse = 0.5 + 0.5 * Math.sin(c.time * 2.4 + e.id);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    env.drawBlob(ctx, env.blob("thunderaura", [[0, "rgba(120,170,255,0.9)"], [1, "rgba(40,70,200,0)"]]), e.x, e.y - r * 0.5, r * (2.2 + pulse * 0.3), r * (1.7 + pulse * 0.2), (e.enraged ? 0.55 : 0.34) + env.night * 0.25);
    ctx.restore();
    if (Math.floor(c.time * 12 + e.id) % 2 === 0 && env.fx.particles.length < 400) env.fx.burst(e.x + Math.sin(c.time * 19) * r * 0.8, e.y - r * (0.3 + Math.cos(c.time * 13) * 0.6), Math.sin(c.time * 31) > 0 ? "#e8f0ff" : "#7aa8ff", 1, 60, { max: 0.25, size: 2.2, gravity: 0, shape: "spark" });
  }
}

/** Boss arena themes: edge tint, mote colour, size (px), drift speed (px/s), sway, rise vs fall, additive glow. */
const ARENA: Record<string, { tint: string; mote: string; size: number; speed: number; sway: number; rise: boolean; glow: boolean }> = {
  ogre: { tint: "110,70,30", mote: "214,190,140", size: 2.2, speed: 22, sway: 14, rise: true, glow: false },
  warlord: { tint: "120,30,20", mote: "230,180,120", size: 2.2, speed: 26, sway: 14, rise: true, glow: false },
  troll: { tint: "40,80,30", mote: "170,210,100", size: 2.4, speed: 16, sway: 20, rise: true, glow: true },
  hag: { tint: "50,90,30", mote: "160,230,110", size: 2.4, speed: 14, sway: 22, rise: true, glow: true },
  golem: { tint: "60,60,70", mote: "190,190,190", size: 2.6, speed: 30, sway: 10, rise: false, glow: false },
  colossus: { tint: "50,55,70", mote: "180,180,190", size: 2.8, speed: 34, sway: 10, rise: false, glow: false },
  dragon: { tint: "150,50,10", mote: "255,150,50", size: 2.2, speed: 60, sway: 18, rise: true, glow: true },
  magma: { tint: "170,50,10", mote: "255,120,40", size: 2.4, speed: 70, sway: 16, rise: true, glow: true },
  frostwyrm: { tint: "60,120,190", mote: "240,248,255", size: 2.6, speed: 40, sway: 26, rise: false, glow: false },
  drowned: { tint: "20,80,110", mote: "150,220,235", size: 2.2, speed: 50, sway: 8, rise: false, glow: true },
  bloodlord: { tint: "150,10,30", mote: "255,70,80", size: 2.2, speed: 24, sway: 18, rise: true, glow: true },
  thundergiant: { tint: "40,60,110", mote: "200,225,255", size: 2.2, speed: 90, sway: 6, rise: false, glow: true },
  hollowking: { tint: "70,30,130", mote: "190,150,255", size: 2.6, speed: 20, sway: 24, rise: true, glow: true },
};
