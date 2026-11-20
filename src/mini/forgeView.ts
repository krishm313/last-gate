import { showEndPanel, type MiniResult } from "./endPanel";
import { createForge, FORGE, forgeStars, stepForge, strike, type ForgeState } from "./forge";

/**
 * Royal Forge screen: a full-screen canvas over the game. Tap anywhere to bring the hammer down
 * when the marker is in the hot zone. Fixed-step logic (forge.ts); this file only draws.
 */
const STEP = 1 / 60;
const W = 360, H = 640;
/** The timing bar (screen space inside the 360×640 frame). */
const BAR = { x0: 36, x1: 324, y: 486, h: 30 };
const ANVIL_Y = 392;

interface Spark { x: number; y: number; vx: number; vy: number; t: number; hot: boolean }

export class ForgeView {
  private root = document.createElement("div");
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private s: ForgeState = createForge(1);
  private raf = 0;
  private last = 0;
  private acc = 0;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private ended = false;
  private sparks: Spark[] = [];
  private sparkSeed = 1;
  private glow = ForgeView.makeGlow();

  private static makeGlow(): HTMLCanvasElement {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const g = cv.getContext("2d");
    if (!g) return cv;
    const gr = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,170,60,0.75)");
    gr.addColorStop(1, "rgba(255,90,20,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return cv;
  }

  constructor(
    private host: HTMLElement,
    private onFinish: (score: number) => MiniResult,
    private onExit: () => void,
    private onSound?: (kind: "clang" | "ring" | "crash" | "star") => void,
  ) {
    this.root.className = "lgf2";
    this.canvas.className = "lgl-canvas";
    this.root.append(this.canvas);
    this.canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.tap();
    });
  }

  open(seed: number): void {
    this.s = createForge(seed);
    this.ended = false;
    this.acc = 0;
    this.sparks = [];
    this.root.querySelector(".lgx-end")?.remove();
    this.host.append(this.root);
    this.resize();
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  close(): void {
    cancelAnimationFrame(this.raf);
    this.root.remove();
  }

  private resize(): void {
    const r = this.root.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.scale = Math.min(r.width / W, r.height / H) * dpr;
    this.ox = (this.canvas.width - W * this.scale) / 2;
    this.oy = (this.canvas.height - H * this.scale) / 2;
  }

  private rnd(): number {
    this.sparkSeed = (this.sparkSeed * 1103515245 + 12345) >>> 0;
    return this.sparkSeed / 4294967296;
  }

  private tap(): void {
    if (this.ended || this.s.over) return;
    const blades = this.s.blades;
    const k = strike(this.s);
    if (k === "miss") {
      this.onSound?.("crash");
      return;
    }
    this.onSound?.(k === "perfect" ? "ring" : "clang");
    if (this.s.blades > blades) window.setTimeout(() => this.onSound?.("star"), 120);
    const n = k === "perfect" ? 22 : 12;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * (0.1 + 0.8 * this.rnd());
      const v = 120 + this.rnd() * (k === "perfect" ? 260 : 160);
      this.sparks.push({ x: W / 2 + (this.rnd() - 0.5) * 30, y: ANVIL_Y - 14, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, hot: this.rnd() > 0.4 });
    }
  }

  private frame(now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    while (this.acc >= STEP) {
      stepForge(this.s, STEP);
      this.acc -= STEP;
    }
    for (const p of this.sparks) {
      p.t += dt;
      p.vy += 420 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.sparks = this.sparks.filter((p) => p.t < 0.7);
    this.draw();
    if (this.s.over && !this.ended) {
      this.ended = true;
      this.showEnd(this.onFinish(this.s.score));
    }
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private showEnd(r: MiniResult): void {
    showEndPanel(this.root, {
      cls: "lgf2-end",
      title: this.s.lost ? "The anvil cracked!" : "The forge cools",
      r,
      extra: `${this.s.blades} blade${this.s.blades === 1 ? "" : "s"} · best combo ${this.s.bestCombo}`,
      again: "Forge again",
      onAgain: () => this.open((Date.now() >>> 0) ^ 0xf09),
      onBack: () => {
        this.close();
        this.onExit();
      },
    });
  }

  private draw(): void {
    const c = this.ctx;
    const s = this.s;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = "#140c08";
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    // Stone forge walls.
    c.fillStyle = "#2a1e18";
    c.fillRect(0, 0, W, H);
    c.strokeStyle = "#1a120e";
    c.lineWidth = 2;
    for (let y = 70, row = 0; y < 330; y += 28, row++) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(W, y);
      c.stroke();
      for (let x = (row % 2) * 30; x < W; x += 60) {
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x, y + 28);
        c.stroke();
      }
    }
    // The hearth: an arch of glowing coals behind the anvil.
    const flick = 0.85 + 0.15 * Math.sin(s.time * 9) * Math.sin(s.time * 3.3);
    c.save();
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = 0.9 * flick;
    c.drawImage(this.glow, W / 2 - 170, 120, 340, 260);
    c.restore();
    c.fillStyle = "#3a2a22";
    c.beginPath();
    c.moveTo(W / 2 - 110, 320);
    c.lineTo(W / 2 - 110, 210);
    c.arc(W / 2, 210, 110, Math.PI, 0);
    c.lineTo(W / 2 + 110, 320);
    c.closePath();
    c.fill();
    c.fillStyle = "#120a06";
    c.beginPath();
    c.moveTo(W / 2 - 80, 320);
    c.lineTo(W / 2 - 80, 222);
    c.arc(W / 2, 222, 80, Math.PI, 0);
    c.lineTo(W / 2 + 80, 320);
    c.closePath();
    c.fill();
    for (let i = 0; i < 9; i++) {
      const x = W / 2 - 64 + i * 16, y = 304 + Math.sin(i * 2.1) * 4;
      c.fillStyle = Math.sin(s.time * 5 + i * 1.7) > 0.2 ? "#ffb040" : "#e05a18";
      c.beginPath();
      c.arc(x, y, 9, 0, Math.PI * 2);
      c.fill();
    }
    // Floor.
    c.fillStyle = "#3a2c22";
    c.fillRect(0, 330, W, H - 330);
    c.fillStyle = "#00000030";
    for (let x = 0; x < W; x += 45) c.fillRect(x, 330, 2, H - 330);
    // Anvil.
    const ax = W / 2;
    c.fillStyle = "#4a4e58";
    c.strokeStyle = "#16181e";
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(ax - 92, ANVIL_Y - 8);
    c.lineTo(ax + 70, ANVIL_Y - 8);
    c.quadraticCurveTo(ax + 108, ANVIL_Y - 6, ax + 118, ANVIL_Y - 18);
    c.lineTo(ax + 104, ANVIL_Y + 8);
    c.lineTo(ax + 50, ANVIL_Y + 12);
    c.lineTo(ax + 34, ANVIL_Y + 40);
    c.lineTo(ax + 56, ANVIL_Y + 60);
    c.lineTo(ax - 64, ANVIL_Y + 60);
    c.lineTo(ax - 42, ANVIL_Y + 40);
    c.lineTo(ax - 58, ANVIL_Y + 12);
    c.lineTo(ax - 92, ANVIL_Y + 8);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = "#6a707c";
    c.fillRect(ax - 90, ANVIL_Y - 8, 158, 5);
    // Cracks in the anvil.
    c.strokeStyle = "#0c0d10";
    c.lineWidth = 2;
    for (let i = 0; i < s.cracks; i++) {
      const cx = ax - 30 + i * 28;
      c.beginPath();
      c.moveTo(cx, ANVIL_Y + 2);
      c.lineTo(cx + 6, ANVIL_Y + 16);
      c.lineTo(cx - 2, ANVIL_Y + 28);
      c.lineTo(cx + 4, ANVIL_Y + 42);
      c.stroke();
    }
    // The blade on the anvil: glows hotter with every strike.
    const heat = s.hits / FORGE.strikes;
    const bladeCol = `rgb(${Math.round(150 + 105 * heat)},${Math.round(150 - 20 * heat + 60 * heat * heat)},${Math.round(160 - 120 * heat)})`;
    c.save();
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = 0.25 + 0.5 * heat;
    c.drawImage(this.glow, ax - 90, ANVIL_Y - 50, 180, 70);
    c.restore();
    c.fillStyle = bladeCol;
    c.strokeStyle = "#2a1a10";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(ax - 70, ANVIL_Y - 12);
    c.lineTo(ax + 50, ANVIL_Y - 12);
    c.lineTo(ax + 70, ANVIL_Y - 17);
    c.lineTo(ax + 50, ANVIL_Y - 22);
    c.lineTo(ax - 70, ANVIL_Y - 22);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = "#5a3a1e";
    c.fillRect(ax - 96, ANVIL_Y - 20, 26, 6);
    c.fillStyle = "#c8a040";
    c.fillRect(ax - 72, ANVIL_Y - 26, 5, 18);
    // The hammer: raised, then slams down on a strike.
    const swing = Math.min(1, s.since / 0.18);
    const down = s.since < 0.06 ? 1 : 1 - swing;
    // Raised (head up and back) at rest; level with the blade at the moment of the strike.
    const ang = 1.05 * (1 - down);
    c.save();
    c.translate(ax + 130, ANVIL_Y - 38);
    c.rotate(ang);
    c.fillStyle = "#6a4424";
    c.strokeStyle = "#2a1a0c";
    c.lineWidth = 2;
    c.fillRect(-110, -5, 112, 10);
    c.strokeRect(-110, -5, 112, 10);
    c.fillStyle = "#5a5e68";
    c.fillRect(-128, -20, 30, 40);
    c.strokeRect(-128, -20, 30, 40);
    c.restore();
    // Sparks.
    c.save();
    c.globalCompositeOperation = "lighter";
    for (const p of this.sparks) {
      c.globalAlpha = 1 - p.t / 0.7;
      c.fillStyle = p.hot ? "#ffe27a" : "#ff8a2a";
      c.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    c.restore();
    c.globalAlpha = 1;
    // Timing bar: track, hot zone, perfect core, marker.
    const bw = BAR.x1 - BAR.x0;
    c.fillStyle = "#120a06";
    c.strokeStyle = "#c8a46a";
    c.lineWidth = 3;
    c.beginPath();
    c.roundRect(BAR.x0 - 6, BAR.y - 6, bw + 12, BAR.h + 12, 10);
    c.fill();
    c.stroke();
    const zx0 = BAR.x0 + (s.zone - s.width) * bw, zx1 = BAR.x0 + (s.zone + s.width) * bw;
    const zg = c.createLinearGradient(zx0, 0, zx1, 0);
    zg.addColorStop(0, "#c8401a");
    zg.addColorStop(0.5, "#ff9a2a");
    zg.addColorStop(1, "#c8401a");
    c.fillStyle = zg;
    c.fillRect(zx0, BAR.y, zx1 - zx0, BAR.h);
    const core = s.width * FORGE.core * bw;
    c.fillStyle = "#fff0b0";
    c.fillRect(BAR.x0 + s.zone * bw - core, BAR.y, core * 2, BAR.h);
    const mx = BAR.x0 + s.pos * bw;
    c.fillStyle = "#ffffff";
    c.strokeStyle = "#1d1208";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(mx - 9, BAR.y - 14);
    c.lineTo(mx + 9, BAR.y - 14);
    c.lineTo(mx, BAR.y - 2);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillRect(mx - 2, BAR.y, 4, BAR.h);
    // Strike pips for this blade.
    for (let i = 0; i < FORGE.strikes; i++) {
      c.fillStyle = i < s.hits ? "#ffb040" : "#00000060";
      c.strokeStyle = "#c8a46a";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(W / 2 - 48 + i * 24, BAR.y + BAR.h + 26, 8, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    // Popups.
    c.textAlign = "center";
    c.font = "900 20px ui-rounded, system-ui, sans-serif";
    for (const [i, f] of s.fx.entries()) {
      c.globalAlpha = 1 - f.t / 0.9;
      c.fillStyle = f.good ? "#ffe27a" : "#ff8a7a";
      c.strokeStyle = "#1d1208";
      c.lineWidth = 4;
      const y = 250 - f.t * 50 - i * 4;
      c.strokeText(f.text, W / 2, y);
      c.fillText(f.text, W / 2, y);
    }
    c.globalAlpha = 1;
    // HUD.
    c.fillStyle = "#120c09cc";
    c.fillRect(8, 8, W - 16, 40);
    c.font = "900 17px ui-rounded, system-ui, sans-serif";
    c.textAlign = "left";
    c.fillStyle = "#ffd84a";
    c.fillText(`⚒️ ${s.score}`, 18, 34);
    c.textAlign = "center";
    c.fillText(`🗡️ ${s.blades}  ${"💥".repeat(s.cracks)}${"·".repeat(FORGE.cracks - s.cracks)}`, W / 2, 34);
    c.textAlign = "right";
    c.fillStyle = s.left < 10 ? "#ff8a7a" : "#fff";
    c.fillText(`⏱ ${Math.ceil(s.left)}`, W - 18, 34);
    c.textAlign = "center";
    c.font = "800 11px ui-rounded, system-ui, sans-serif";
    c.fillStyle = "#fff";
    c.strokeStyle = "#1d1208aa";
    c.lineWidth = 3;
    const st = forgeStars(s.score);
    const mult = Math.min(3, 1 + Math.floor(s.combo / 5));
    const goal = `★ at ${FORGE.stars.join(" / ")}  ·  ${"★".repeat(st)}${"☆".repeat(3 - st)}${s.combo >= 2 ? `  ·  combo ${s.combo}${mult > 1 ? ` ×${mult}` : ""}` : ""}`;
    c.strokeText(goal, W / 2, 64);
    c.fillText(goal, W / 2, 64);
    if (s.time < 4) {
      c.font = "900 15px ui-rounded, system-ui, sans-serif";
      c.lineWidth = 4;
      c.strokeStyle = "#1d1208";
      for (const [i, line] of ["Tap when the marker is in the hot zone!", "Dead centre = a perfect strike", "3 misses crack the anvil"].entries()) {
        c.strokeText(line, W / 2, 572 + i * 22);
        c.fillText(line, W / 2, 572 + i * 22);
      }
    }
  }
}
