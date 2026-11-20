import { showEndPanel, type MiniResult } from "./endPanel";
import { drawFlyer } from "./flyer";
import { createDragon, DRAGON, dragonStars, steerTo, stepDragon, type Blast, type DragonState } from "./dragon";

/**
 * Dragon Dodge screen: a full-screen canvas over the game. Touch and drag anywhere — the King runs
 * to just above your finger (so he stays visible). Red circles and bands show where fire will land.
 * Fixed-step logic (dragon.ts); this file only draws and turns touches into steering.
 */
const STEP = 1 / 60;
/** The King stands this far above the finger. */
const LIFT = 46;

export type DragonResult = MiniResult;

export class DragonView {
  private root = document.createElement("div");
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private s: DragonState = createDragon(1);
  private raf = 0;
  private last = 0;
  private acc = 0;
  private king = new Image();
  private dragon = new Image();
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private ended = false;
  private touching = false;

  constructor(
    private host: HTMLElement,
    /** Called once when a round ends; returns the reward to show. */
    private onFinish: (score: number) => DragonResult,
    private onExit: () => void,
    private onSound?: (kind: "crash" | "pickup" | "thunk" | "roar") => void,
  ) {
    this.root.className = "lgd2";
    this.canvas.className = "lgd2-canvas";
    this.root.append(this.canvas);
    this.king.src = "./sprites/units/king.png";
    this.dragon.src = "./sprites/props/dragon.webp";
    this.canvas.addEventListener("pointerdown", (e) => { this.touching = true; this.canvas.setPointerCapture(e.pointerId); this.aim(e); });
    this.canvas.addEventListener("pointermove", (e) => { if (this.touching) this.aim(e); });
    this.canvas.addEventListener("pointerup", () => (this.touching = false));
    this.canvas.addEventListener("pointercancel", () => (this.touching = false));
  }

  open(seed: number): void {
    this.s = createDragon(seed);
    this.ended = false;
    this.acc = 0;
    this.touching = false;
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
    this.scale = Math.min(r.width / DRAGON.w, r.height / DRAGON.h) * dpr;
    this.ox = (this.canvas.width - DRAGON.w * this.scale) / 2;
    this.oy = (this.canvas.height - DRAGON.h * this.scale) / 2;
  }

  private aim(e: PointerEvent): void {
    if (this.ended) return;
    const r = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / r.width;
    const x = ((e.clientX - r.left) * dpr - this.ox) / this.scale;
    const y = ((e.clientY - r.top) * dpr - this.oy) / this.scale;
    steerTo(this.s, x, y - LIFT);
  }

  private frame(now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    while (this.acc >= STEP) {
      const lives = this.s.lives, score = this.s.score, fired = this.s.blasts.filter((b) => b.fired).length;
      const lines = this.s.blasts.filter((b) => b.kind === "line").length;
      stepDragon(this.s, STEP);
      if (this.s.lives < lives) this.onSound?.("crash");
      else if (this.s.score - score >= DRAGON.coin) this.onSound?.("pickup");
      else if (this.s.blasts.filter((b) => b.fired).length > fired) this.onSound?.("thunk");
      if (this.s.blasts.filter((b) => b.kind === "line").length > lines) this.onSound?.("roar");
      this.acc -= STEP;
    }
    this.draw();
    if (this.s.over && !this.ended) {
      this.ended = true;
      this.showEnd(this.onFinish(this.s.score));
    }
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private showEnd(r: DragonResult): void {
    showEndPanel(this.root, {
      cls: "lgd2-end",
      title: this.s.lost ? "Scorched!" : "The dragon gives up!",
      r,
      extra: `${Math.floor(this.s.time)}s survived`,
      again: "Dodge again",
      onAgain: () => this.open((Date.now() >>> 0) ^ 0xd1a),
      onBack: () => {
        this.close();
        this.onExit();
      },
    });
  }

  private draw(): void {
    const c = this.ctx;
    const s = this.s;
    const W = DRAGON.w, H = DRAGON.h;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = "#1e1814";
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    // Castle courtyard: flagstones inside low walls.
    c.fillStyle = "#5a5248";
    c.fillRect(0, 0, W, H);
    c.fillStyle = "#8a8070";
    c.fillRect(DRAGON.x0 - 10, DRAGON.y0 - 24, DRAGON.x1 - DRAGON.x0 + 20, DRAGON.y1 - DRAGON.y0 + 44);
    c.strokeStyle = "#6e665a";
    c.lineWidth = 1.5;
    for (let y = DRAGON.y0 - 24, row = 0; y < DRAGON.y1 + 20; y += 32, row++) {
      c.beginPath();
      c.moveTo(DRAGON.x0 - 10, y);
      c.lineTo(DRAGON.x1 + 10, y);
      c.stroke();
      for (let x = DRAGON.x0 - 10 + (row % 2) * 24; x < DRAGON.x1 + 10; x += 48) {
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x, y + 32);
        c.stroke();
      }
    }
    c.strokeStyle = "#3a342c";
    c.lineWidth = 6;
    c.strokeRect(DRAGON.x0 - 10, DRAGON.y0 - 24, DRAGON.x1 - DRAGON.x0 + 20, DRAGON.y1 - DRAGON.y0 + 44);
    // Coins.
    for (const k of s.coins) {
      const bob = Math.sin(k.t * 5 + k.id) * 2;
      c.globalAlpha = k.t > 7.5 ? 0.5 + 0.5 * Math.sin(k.t * 20) : 1;
      c.fillStyle = "#00000030";
      c.beginPath();
      c.ellipse(k.x, k.y + 8, 8, 3, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#ffd84a";
      c.strokeStyle = "#8a5a10";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(k.x, k.y + bob, 8, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = "#fff6c0";
      c.fillRect(k.x - 2, k.y - 4 + bob, 3, 5);
      c.globalAlpha = 1;
    }
    // Marks and fire (under the King).
    for (const b of s.blasts) this.drawBlast(b);
    // The King (flashes after a burn).
    if (!(s.hurt > 0 && Math.floor(s.hurt * 12) % 2 === 0) && this.king.complete && this.king.naturalWidth) {
      const h = 64;
      const w = (this.king.naturalWidth / this.king.naturalHeight) * h;
      c.fillStyle = "#00000040";
      c.beginPath();
      c.ellipse(s.x, s.y + 6, 16, 6, 0, 0, Math.PI * 2);
      c.fill();
      const flip = s.tx < s.x - 2;
      c.save();
      c.translate(s.x, s.y);
      if (flip) c.scale(-1, 1);
      const moving = Math.hypot(s.tx - s.x, s.ty - s.y) > 2;
      const bob = moving ? -Math.abs(Math.sin(s.time * 14)) * 4 : 0;
      c.rotate(moving ? Math.sin(s.time * 14) * 0.05 : 0);
      c.drawImage(this.king, -w / 2, -h + 12 + bob, w, h);
      c.restore();
    }
    // The dragon circling overhead (shadow on the ground, the beast above it).
    const a = s.time * 0.6;
    const dx = W / 2 + Math.cos(a) * 120, dy = 330 + Math.sin(a * 1.3) * 160;
    c.fillStyle = "#00000028";
    c.beginPath();
    c.ellipse(dx + 20, dy + 60, 70, 22, 0, 0, Math.PI * 2);
    c.fill();
    // Seen from above, gliding with slow wingbeats.
    drawFlyer(c, this.dragon, "dragon", dx, dy - 20, 70, Math.sin(s.time * 4));
    // Popups.
    c.textAlign = "center";
    c.font = "900 18px ui-rounded, system-ui, sans-serif";
    for (const f of s.fx) {
      c.globalAlpha = 1 - f.t / 0.9;
      c.fillStyle = f.good ? "#ffe27a" : "#ff8a7a";
      c.strokeStyle = "#1d1208";
      c.lineWidth = 4;
      const y = f.y - 40 - f.t * 40;
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
    c.fillText(`🐉 ${s.score}`, 18, 34);
    c.textAlign = "center";
    const lives = Math.max(0, Math.min(DRAGON.lives, s.lives));
    c.fillText("❤️".repeat(lives) + "🖤".repeat(DRAGON.lives - lives), W / 2, 34);
    c.textAlign = "right";
    c.fillStyle = s.left < 10 ? "#ff8a7a" : "#fff";
    c.fillText(`⏱ ${Math.ceil(s.left)}`, W - 18, 34);
    c.textAlign = "center";
    c.font = "800 11px ui-rounded, system-ui, sans-serif";
    c.fillStyle = "#fff";
    c.strokeStyle = "#1d1208aa";
    c.lineWidth = 3;
    const st = dragonStars(s.score);
    const goal = `★ at ${DRAGON.stars.join(" / ")}  ·  ${"★".repeat(st)}${"☆".repeat(3 - st)}`;
    c.strokeText(goal, W / 2, 64);
    c.fillText(goal, W / 2, 64);
    if (s.time < 4) {
      c.font = "900 15px ui-rounded, system-ui, sans-serif";
      c.lineWidth = 4;
      c.strokeStyle = "#1d1208";
      for (const [i, line] of ["Drag to move the King!", "Stay out of the red — grab the coins"].entries()) {
        c.strokeText(line, W / 2, 200 + i * 22);
        c.fillText(line, W / 2, 200 + i * 22);
      }
    }
  }

  private drawBlast(b: Blast): void {
    const c = this.ctx;
    if (!b.fired) {
      // Warning: a red area that fills in as the fuse burns down.
      const u = Math.min(1, b.t / b.fuse);
      const pulse = 0.5 + 0.5 * Math.sin(b.t * 18);
      c.fillStyle = `rgba(220, 50, 30, ${0.18 + 0.12 * pulse})`;
      c.strokeStyle = `rgba(255, 90, 60, ${0.6 + 0.3 * pulse})`;
      c.lineWidth = 2.5;
      if (b.kind === "spot") {
        c.beginPath();
        c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        c.fillStyle = "rgba(255, 120, 40, 0.35)";
        c.beginPath();
        c.arc(b.x, b.y, b.r * u, 0, Math.PI * 2);
        c.fill();
      } else {
        c.fillRect(DRAGON.x0 - 10, b.y - b.r, DRAGON.x1 - DRAGON.x0 + 20, b.r * 2);
        c.strokeRect(DRAGON.x0 - 10, b.y - b.r, DRAGON.x1 - DRAGON.x0 + 20, b.r * 2);
        c.fillStyle = "rgba(255, 120, 40, 0.35)";
        c.fillRect(DRAGON.x0 - 10, b.y - b.r, (DRAGON.x1 - DRAGON.x0 + 20) * u, b.r * 2);
      }
      return;
    }
    // Fire: a bright burst that fades.
    const k = Math.min(1, (b.t - b.fuse) / 0.45);
    c.globalAlpha = 1 - k;
    const g = b.kind === "spot" ? c.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * (1 + k * 0.2)) : null;
    if (g) {
      g.addColorStop(0, "#fff6a0");
      g.addColorStop(0.4, "#ffb030");
      g.addColorStop(1, "rgba(220,60,20,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(b.x, b.y, b.r * (1 + k * 0.2), 0, Math.PI * 2);
      c.fill();
      // Embers thrown out of the burst (fixed directions per blast, so no randomness).
      for (let i = 0; i < 10; i++) {
        const a = i * 2.39996 + b.id;
        const d = b.r * (0.4 + k * (0.9 + ((i * 37 + b.id * 13) % 10) / 20));
        c.fillStyle = i % 2 ? "#ffe27a" : "#ff8a3a";
        c.beginPath();
        c.arc(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d - k * 18, 2.6 * (1 - k) + 0.6, 0, Math.PI * 2);
        c.fill();
      }
    } else {
      const lg = c.createLinearGradient(0, b.y - b.r, 0, b.y + b.r);
      lg.addColorStop(0, "rgba(220,60,20,0)");
      lg.addColorStop(0.5, "#ffd060");
      lg.addColorStop(1, "rgba(220,60,20,0)");
      c.fillStyle = lg;
      c.fillRect(DRAGON.x0 - 10, b.y - b.r * 1.2, DRAGON.x1 - DRAGON.x0 + 20, b.r * 2.4);
    }
    c.globalAlpha = 1;
  }
}
