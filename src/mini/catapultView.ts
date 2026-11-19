import { CAT, catStars, createCatapult, lob, stepCatapult, type CatState, type Engine } from "./catapult";
import { showEndPanel, type MiniResult } from "./endPanel";

/**
 * Catapult Toss screen: a full-screen canvas over the game. Tap the field to lob a stone there —
 * a ring marks where it will land. Fixed-step logic (catapult.ts); this file only draws and turns
 * taps into throws.
 */
const STEP = 1 / 60;

export type CatResult = MiniResult;

export class CatapultView {
  private root = document.createElement("div");
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private s: CatState = createCatapult(1);
  private raf = 0;
  private last = 0;
  private acc = 0;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private ended = false;

  constructor(
    private host: HTMLElement,
    /** Called once when a round ends; returns the reward to show. */
    private onFinish: (score: number) => CatResult,
    private onExit: () => void,
    private onSound?: (kind: "twang" | "thunk" | "crash") => void,
  ) {
    this.root.className = "lgc";
    this.canvas.className = "lgc-canvas";
    this.root.append(this.canvas);
    this.canvas.addEventListener("pointerdown", (e) => this.down(e));
  }

  open(seed: number): void {
    this.s = createCatapult(seed);
    this.ended = false;
    this.acc = 0;
    this.root.querySelector(".lgc-end")?.remove();
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
    this.scale = Math.min(r.width / CAT.w, r.height / CAT.h) * dpr;
    this.ox = (this.canvas.width - CAT.w * this.scale) / 2;
    this.oy = (this.canvas.height - CAT.h * this.scale) / 2;
  }

  private down(e: PointerEvent): void {
    if (this.ended) return;
    const r = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / r.width;
    const x = ((e.clientX - r.left) * dpr - this.ox) / this.scale;
    const y = ((e.clientY - r.top) * dpr - this.oy) / this.scale;
    if (lob(this.s, x, y)) this.onSound?.("twang");
  }

  private frame(now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    while (this.acc >= STEP) {
      const lives = this.s.lives, impacts = this.s.impacts.length;
      stepCatapult(this.s, STEP);
      if (this.s.lives < lives) this.onSound?.("crash");
      else if (this.s.impacts.length > impacts) this.onSound?.("thunk");
      this.acc -= STEP;
    }
    this.draw();
    if (this.s.over && !this.ended) {
      this.ended = true;
      this.showEnd(this.onFinish(this.s.score));
    }
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private showEnd(r: CatResult): void {
    showEndPanel(this.root, {
      cls: "lgc-end",
      title: this.s.lost ? "The engines broke through!" : "The siege is broken!",
      r,
      extra: `best combo ${this.s.bestCombo}`,
      again: "Throw again",
      onAgain: () => this.open((Date.now() >>> 0) ^ 0xca7),
      onBack: () => {
        this.close();
        this.onExit();
      },
    });
  }

  private draw(): void {
    const c = this.ctx;
    const s = this.s;
    const W = CAT.w, H = CAT.h;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = "#202a18";
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    // The field: trampled grass, darker toward the horizon, with wheel ruts.
    const g = c.createLinearGradient(0, 0, 0, CAT.wallY);
    g.addColorStop(0, "#3e5a2c");
    g.addColorStop(1, "#6a8a44");
    c.fillStyle = g;
    c.fillRect(0, 0, W, CAT.wallY);
    c.fillStyle = "#ffffff0c";
    for (let y = 0; y < CAT.wallY; y += 70) c.fillRect(0, y, W, 35);
    c.fillStyle = "#00000014";
    for (const x of [70, 150, 230, 300]) c.fillRect(x, 0, 5, CAT.wallY);
    // Landing dust.
    for (const im of s.impacts) {
      c.fillStyle = `rgba(200, 180, 140, ${0.6 * (1 - im.t / 0.6)})`;
      c.beginPath();
      c.ellipse(im.x, im.y, CAT.splash * (0.5 + im.t * 1.2), CAT.splash * (0.3 + im.t * 0.6), 0, 0, Math.PI * 2);
      c.fill();
    }
    // Where each stone in the air will land.
    for (const st of s.stones) {
      const u = st.t / st.dur;
      c.strokeStyle = `rgba(255, 230, 120, ${0.5 + 0.5 * u})`;
      c.lineWidth = 2;
      c.setLineDash([5, 4]);
      c.beginPath();
      c.arc(st.tx, st.ty, CAT.splash * (1.3 - 0.3 * u), 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
    }
    // Engines, back to front.
    for (const e of [...s.engines].sort((a, b) => a.y - b.y)) this.drawEngine(e);
    // Stones in flight: a shadow on the ground and the stone arcing above it.
    for (const st of s.stones) {
      const u = Math.min(1, st.t / st.dur);
      const gx = st.sx + (st.tx - st.sx) * u, gy = st.sy + (st.ty - st.sy) * u;
      const lift = Math.sin(Math.PI * u) * (60 + Math.hypot(st.tx - st.sx, st.ty - st.sy) * 0.35);
      c.fillStyle = "#00000040";
      c.beginPath();
      c.ellipse(gx, gy, 7, 3.5, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#8a8e96";
      c.strokeStyle = "#1d1208";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(gx, gy - lift, 7 + Math.sin(Math.PI * u) * 3, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    // The castle wall along the bottom, with the catapult on it.
    c.fillStyle = "#8a8478";
    c.fillRect(0, CAT.wallY, W, H - CAT.wallY);
    c.strokeStyle = "#6a645a";
    c.lineWidth = 1.5;
    for (let y = CAT.wallY + 20, row = 0; y < H; y += 24, row++) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(W, y);
      c.stroke();
      for (let x = (row % 2) * 22; x < W; x += 44) {
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x, y + 24);
        c.stroke();
      }
    }
    c.fillStyle = "#9a9488";
    c.strokeStyle = "#1d1208";
    c.lineWidth = 2;
    for (let x = 0; x < W; x += 40) {
      c.fillRect(x + 4, CAT.wallY - 2, 24, 22);
      c.strokeRect(x + 4, CAT.wallY - 2, 24, 22);
    }
    this.drawCatapult();
    // Popups.
    c.textAlign = "center";
    c.font = "900 18px ui-rounded, system-ui, sans-serif";
    for (const f of s.fx) {
      c.globalAlpha = 1 - f.t / 0.9;
      c.fillStyle = f.good ? "#ffe27a" : "#ff8a7a";
      c.strokeStyle = "#1d1208";
      c.lineWidth = 4;
      const y = f.y - 34 - f.t * 40;
      c.strokeText(f.text, f.x, y);
      c.fillText(f.text, f.x, y);
    }
    c.globalAlpha = 1;
    // HUD.
    c.fillStyle = "#120c09cc";
    c.fillRect(8, 8, W - 16, 40);
    c.font = "900 17px ui-rounded, system-ui, sans-serif";
    c.textAlign = "left";
    c.fillStyle = "#ffd84a";
    c.fillText(`🪨 ${s.score}`, 18, 34);
    c.textAlign = "center";
    const lives = Math.max(0, Math.min(CAT.lives, s.lives));
    c.fillText("❤️".repeat(lives) + "🖤".repeat(CAT.lives - lives), W / 2, 34);
    c.textAlign = "right";
    c.fillStyle = s.left < 10 ? "#ff8a7a" : "#fff";
    c.fillText(`⏱ ${Math.ceil(s.left)}`, W - 18, 34);
    c.textAlign = "center";
    c.font = "800 11px ui-rounded, system-ui, sans-serif";
    c.fillStyle = "#fff";
    c.strokeStyle = "#1d1208aa";
    c.lineWidth = 3;
    const st = catStars(s.score);
    const mult = Math.min(3, 1 + Math.floor(s.combo / 3));
    const goal = `★ at ${CAT.stars.join(" / ")}  ·  ${"★".repeat(st)}${"☆".repeat(3 - st)}${s.combo >= 2 ? `  ·  combo ${s.combo}${mult > 1 ? ` ×${mult}` : ""}` : ""}`;
    c.strokeText(goal, W / 2, 64);
    c.fillText(goal, W / 2, 64);
    if (s.time < 4) {
      c.font = "900 15px ui-rounded, system-ui, sans-serif";
      c.lineWidth = 4;
      c.strokeStyle = "#1d1208";
      for (const [i, line] of ["Tap the field to lob a stone!", "Aim ahead — stones take a moment to land"].entries()) {
        c.strokeText(line, W / 2, 330 + i * 22);
        c.fillText(line, W / 2, 330 + i * 22);
      }
    }
  }

  private drawCatapult(): void {
    const c = this.ctx;
    const x = CAT.catX, y = CAT.catY;
    // Arm: swung forward right after a throw, winding back as it reloads.
    const k = this.s.reload / CAT.reload;
    const ang = -0.35 - (1 - k) * 0.9 + k * 0.2;
    c.strokeStyle = "#1d1208";
    c.lineWidth = 2;
    c.fillStyle = "#7a4e2a";
    c.fillRect(x - 26, y - 6, 52, 14);
    c.strokeRect(x - 26, y - 6, 52, 14);
    c.fillStyle = "#3a2410";
    for (const wx of [-20, 20]) {
      c.beginPath();
      c.arc(x + wx, y + 10, 7, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    c.save();
    c.translate(x, y - 4);
    c.rotate(ang);
    c.fillStyle = "#9a6a3a";
    c.fillRect(-3, -40, 6, 44);
    c.strokeRect(-3, -40, 6, 44);
    c.fillStyle = "#5a3a1e";
    c.beginPath();
    c.arc(0, -42, 7, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    if (this.s.reload <= 0) {
      c.fillStyle = "#8a8e96";
      c.beginPath();
      c.arc(0, -44, 5, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  private drawEngine(e: Engine): void {
    const c = this.ctx;
    const dead = e.dead >= 0;
    if (dead) c.globalAlpha = Math.max(0, 1 - e.dead / 0.8);
    c.save();
    c.translate(e.x, e.y);
    if (dead) c.rotate(e.dead * 0.6 * (e.id % 2 ? 1 : -1));
    c.strokeStyle = "#1d1208";
    c.lineWidth = 2;
    c.fillStyle = "#00000030";
    c.beginPath();
    c.ellipse(2, e.r * 0.7, e.r * 1.1, e.r * 0.35, 0, 0, Math.PI * 2);
    c.fill();
    if (e.kind === "tower") {
      // Siege tower: a tall plank tower with a hide-covered front and a drawbridge top.
      c.fillStyle = "#7a5230";
      c.fillRect(-20, -46, 40, 62);
      c.strokeRect(-20, -46, 40, 62);
      c.strokeStyle = "#5a3a1e";
      for (let py = -36; py < 16; py += 12) {
        c.beginPath();
        c.moveTo(-19, py);
        c.lineTo(19, py);
        c.stroke();
      }
      c.fillStyle = "#c8a878";
      c.strokeStyle = "#1d1208";
      c.fillRect(-16, -2, 32, 16);
      c.strokeRect(-16, -2, 32, 16);
      c.fillStyle = "#5a3a1e";
      c.fillRect(-22, -54, 44, 10);
      c.strokeRect(-22, -54, 44, 10);
      c.fillStyle = "#c83a2a";
      c.beginPath();
      c.moveTo(0, -54);
      c.lineTo(0, -70);
      c.lineTo(12, -65);
      c.lineTo(0, -61);
      c.fill();
      c.fillStyle = "#2a1a0e";
      for (const wx of [-14, 14]) {
        c.beginPath();
        c.arc(wx, 18, 6, 0, Math.PI * 2);
        c.fill();
      }
      // Cracks as it takes hits.
      c.strokeStyle = "#1d1208";
      c.lineWidth = 1.5;
      if (e.hp < e.maxHp) {
        c.beginPath();
        c.moveTo(-10, -40);
        c.lineTo(-2, -28);
        c.lineTo(-8, -18);
        c.stroke();
      }
      if (e.hp < e.maxHp - 1) {
        c.beginPath();
        c.moveTo(12, -30);
        c.lineTo(4, -20);
        c.lineTo(10, -8);
        c.stroke();
      }
      // HP pips.
      if (!dead) for (let i = 0; i < e.maxHp; i++) {
        c.fillStyle = i < e.hp ? "#ff6a5a" : "#00000060";
        c.fillRect(-15 + i * 11, -80, 9, 5);
      }
    } else {
      // Battering ram: a roofed frame on wheels with the iron-capped log poking out front.
      c.fillStyle = "#6a4422";
      c.fillRect(-5, 4, 10, 22);
      c.strokeRect(-5, 4, 10, 22);
      c.fillStyle = "#9aa0a8";
      c.fillRect(-6, 22, 12, 6);
      c.fillStyle = "#8a5a2e";
      c.beginPath();
      c.moveTo(-16, 10);
      c.lineTo(0, -16);
      c.lineTo(16, 10);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = "#2a1a0e";
      for (const wx of [-13, 13]) {
        c.beginPath();
        c.arc(wx, 12, 5, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();
    c.globalAlpha = 1;
  }
}
