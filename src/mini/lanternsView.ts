import { showEndPanel, type MiniResult } from "./endPanel";
import { createLanterns, LANTERN, lanternStars, stepLanterns, tapLantern, type LanternState } from "./lanterns";

/**
 * Ghost Lanterns screen: a full-screen canvas over the game. Tap wraiths to banish them, tap a
 * lantern to fill it. Fixed-step logic (lanterns.ts); this file only draws and turns taps into hits.
 */
const STEP = 1 / 60;

export type LanternResult = MiniResult;

export class LanternsView {
  private root = document.createElement("div");
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private s: LanternState = createLanterns(1);
  private raf = 0;
  private last = 0;
  private acc = 0;
  private wraith = new Image();
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private ended = false;
  private ping: { x: number; y: number; t: number } | null = null;
  /** When each lantern went dark (game time), for the smoke curl. */
  private darkAt: number[] = [];

  constructor(
    private host: HTMLElement,
    /** Called once when a round ends; returns the reward to show. */
    private onFinish: (score: number) => LanternResult,
    private onExit: () => void,
    private onSound?: (kind: "thunk" | "pickup" | "crash") => void,
  ) {
    this.root.className = "lgl";
    this.canvas.className = "lgl-canvas";
    this.root.append(this.canvas);
    this.wraith.src = "./sprites/units/wraith.png";
    this.canvas.addEventListener("pointerdown", (e) => this.down(e));
  }

  open(seed: number): void {
    this.s = createLanterns(seed);
    this.ended = false;
    this.acc = 0;
    this.ping = null;
    this.darkAt = [];
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
    this.scale = Math.min(r.width / LANTERN.w, r.height / LANTERN.h) * dpr;
    this.ox = (this.canvas.width - LANTERN.w * this.scale) / 2;
    this.oy = (this.canvas.height - LANTERN.h * this.scale) / 2;
  }

  private down(e: PointerEvent): void {
    if (this.ended) return;
    const r = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / r.width;
    const x = ((e.clientX - r.left) * dpr - this.ox) / this.scale;
    const y = ((e.clientY - r.top) * dpr - this.oy) / this.scale;
    this.ping = { x, y, t: 0 };
    const hit = tapLantern(this.s, x, y);
    if (hit === "wraith") this.onSound?.("thunk");
    else if (hit === "lamp") this.onSound?.("pickup");
  }

  private frame(now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    while (this.acc >= STEP) {
      const was = this.s.lamps.map((l) => l.lit);
      stepLanterns(this.s, STEP);
      this.s.lamps.forEach((l, i) => {
        if (was[i] && !l.lit) {
          this.darkAt[i] = this.s.time;
          this.onSound?.("crash");
        }
      });
      this.acc -= STEP;
    }
    if (this.ping) this.ping.t += dt;
    this.draw();
    if (this.s.over && !this.ended) {
      this.ended = true;
      this.showEnd(this.onFinish(this.s.score));
    }
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private showEnd(r: LanternResult): void {
    showEndPanel(this.root, {
      cls: "lgl-end",
      title: this.s.lost ? "Darkness falls" : "The lights held!",
      r,
      extra: `best combo ${this.s.bestCombo}`,
      again: "Keep watch again",
      onAgain: () => this.open((Date.now() >>> 0) ^ 0x1a7),
      onBack: () => {
        this.close();
        this.onExit();
      },
    });
  }

  private draw(): void {
    const c = this.ctx;
    const s = this.s;
    const W = LANTERN.w, H = LANTERN.h;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = "#0e0c18";
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    // Night sky and a misty field in front of the wall.
    const sky = c.createLinearGradient(0, 0, 0, LANTERN.y);
    sky.addColorStop(0, "#151228");
    sky.addColorStop(1, "#2a2640");
    c.fillStyle = sky;
    c.fillRect(0, 0, W, LANTERN.y);
    c.fillStyle = "#ffffff10";
    for (let i = 0; i < 4; i++) {
      const y = 180 + i * 80 + Math.sin(s.time * 0.4 + i) * 10;
      c.beginPath();
      c.ellipse(W / 2 + Math.sin(s.time * 0.2 + i * 2) * 60, y, 220, 18, 0, 0, Math.PI * 2);
      c.fill();
    }
    // Lantern light pools on the ground (brighter with more oil).
    c.save();
    c.globalCompositeOperation = "lighter";
    for (const [i, l] of s.lamps.entries()) {
      if (!l.lit) continue;
      const x = LANTERN.xs[i]!, y = LANTERN.y - 30;
      const flick = 0.9 + 0.1 * Math.sin(s.time * 13 + i * 3);
      const rad = (60 + l.oil * 70) * flick + (l.flare < 0.3 ? (0.3 - l.flare) * 120 : 0);
      const g = c.createRadialGradient(x, y, 4, x, y, rad);
      g.addColorStop(0, `rgba(255,210,120,${0.55 * (0.4 + 0.6 * l.oil)})`);
      g.addColorStop(1, "rgba(255,160,60,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, rad, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    // The wall.
    c.fillStyle = "#3e3a4a";
    c.fillRect(0, LANTERN.y, W, H - LANTERN.y);
    c.strokeStyle = "#2a2634";
    c.lineWidth = 1.5;
    for (let y = LANTERN.y + 22, row = 0; y < H; y += 24, row++) {
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
    c.fillStyle = "#4a4658";
    c.strokeStyle = "#1d1208";
    c.lineWidth = 2;
    for (let x = 0; x < W; x += 40) {
      c.fillRect(x + 4, LANTERN.y - 4, 24, 22);
      c.strokeRect(x + 4, LANTERN.y - 4, 24, 22);
    }
    // Lanterns on posts, with an oil gauge.
    for (const [i, l] of s.lamps.entries()) {
      const x = LANTERN.xs[i]!, y = LANTERN.y - 30;
      c.fillStyle = "#2a1a0e";
      c.fillRect(x - 2, y + 8, 4, 30);
      c.fillStyle = l.lit ? (l.oil < 0.3 && Math.floor(s.time * 6) % 2 ? "#ffb04a" : "#ffe08a") : "#3a3644";
      c.strokeStyle = "#1d1208";
      c.lineWidth = 2;
      c.beginPath();
      c.roundRect(x - 10, y - 14, 20, 24, 4);
      c.fill();
      c.stroke();
      c.fillStyle = "#1d1208";
      c.fillRect(x - 12, y - 18, 24, 5);
      c.fillRect(x - 12, y + 9, 24, 4);
      // Just gone dark: a curl of smoke rising from the glass.
      if (!l.lit && l.flare >= 0) {
        const k = Math.min(1, s.time - (this.darkAt[i] ?? s.time));
        if (k < 1) {
          c.fillStyle = `rgba(160,150,170,${0.5 * (1 - k)})`;
          for (let j = 0; j < 3; j++) {
            c.beginPath();
            c.arc(x + Math.sin(k * 6 + j) * 6, y - 16 - k * 40 - j * 8, 5 + k * 8, 0, Math.PI * 2);
            c.fill();
          }
        }
      }
      // Gauge.
      c.fillStyle = "#00000080";
      c.fillRect(x - 16, y + 44, 32, 6);
      c.fillStyle = l.oil < 0.3 ? "#ff6a4a" : "#ffd84a";
      c.fillRect(x - 15, y + 45, 30 * l.oil, 4);
    }
    // Wraiths: pale, drifting, fading when banished.
    for (const w of s.wraiths) {
      const fade = w.gone >= 0 ? Math.max(0, 1 - w.gone / 0.6) : 0.85;
      c.globalAlpha = fade;
      const bob = Math.sin(s.time * 3 + w.id) * 4;
      // A cold glow so they read against the night.
      const glow = c.createRadialGradient(w.x, w.y - 8 + bob, 2, w.x, w.y - 8 + bob, 30);
      glow.addColorStop(0, "rgba(200,190,255,0.35)");
      glow.addColorStop(1, "rgba(160,140,255,0)");
      c.fillStyle = glow;
      c.beginPath();
      c.arc(w.x, w.y - 8 + bob, 30, 0, Math.PI * 2);
      c.fill();
      if (this.wraith.complete && this.wraith.naturalWidth) {
        const h = 50;
        const ww = (this.wraith.naturalWidth / this.wraith.naturalHeight) * h;
        c.drawImage(this.wraith, w.x - ww / 2, w.y - h + 18 + bob - (w.gone >= 0 ? w.gone * 40 : 0), ww, h);
      } else {
        c.fillStyle = "#c8c0e8";
        c.beginPath();
        c.arc(w.x, w.y + bob, 14, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    }
    // Tap ring.
    if (this.ping && this.ping.t < 0.3) {
      c.strokeStyle = `rgba(255,240,200,${1 - this.ping.t / 0.3})`;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(this.ping.x, this.ping.y, 10 + this.ping.t * 60, 0, Math.PI * 2);
      c.stroke();
    }
    // Popups.
    c.textAlign = "center";
    c.font = "900 18px ui-rounded, system-ui, sans-serif";
    for (const f of s.fx) {
      c.globalAlpha = 1 - f.t / 0.9;
      c.fillStyle = f.good ? "#ffe27a" : "#ff8a7a";
      c.strokeStyle = "#1d1208";
      c.lineWidth = 4;
      const y = f.y - 30 - f.t * 40;
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
    c.fillText(`🏮 ${s.score}`, 18, 34);
    c.textAlign = "center";
    c.fillText("🕯️".repeat(s.lamps.filter((l) => l.lit).length) || "—", W / 2, 34);
    c.textAlign = "right";
    c.fillStyle = s.left < 10 ? "#ff8a7a" : "#fff";
    c.fillText(`⏱ ${Math.ceil(s.left)}`, W - 18, 34);
    c.textAlign = "center";
    c.font = "800 11px ui-rounded, system-ui, sans-serif";
    c.fillStyle = "#fff";
    c.strokeStyle = "#1d1208aa";
    c.lineWidth = 3;
    const st = lanternStars(s.score);
    const mult = Math.min(3, 1 + Math.floor(s.combo / 5));
    const goal = `★ at ${LANTERN.stars.join(" / ")}  ·  ${"★".repeat(st)}${"☆".repeat(3 - st)}${s.combo >= 2 ? `  ·  combo ${s.combo}${mult > 1 ? ` ×${mult}` : ""}` : ""}`;
    c.strokeText(goal, W / 2, 64);
    c.fillText(goal, W / 2, 64);
    if (s.time < 4) {
      c.font = "900 15px ui-rounded, system-ui, sans-serif";
      c.lineWidth = 4;
      c.strokeStyle = "#1d1208";
      for (const [i, line] of ["Tap the wraiths to banish them!", "Tap a lantern to fill it before it burns out"].entries()) {
        c.strokeText(line, W / 2, 330 + i * 22);
        c.fillText(line, W / 2, 330 + i * 22);
      }
    }
  }
}
