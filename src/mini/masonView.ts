import { showEndPanel, type MiniResult } from "./endPanel";
import { createMason, drop, MASON, masonStars, stepMason, type MasonState } from "./mason";

/**
 * Mason's Tower screen: a full-screen canvas over the game. Tap anywhere to drop the sliding block.
 * Fixed-step logic (mason.ts); this file only draws (the camera rises with the tower).
 */
const STEP = 1 / 60;
const W = 360, H = 640;
const BLOCK_H = 24;
const GROUND = 600;
/** Where the top of the tower sits on screen once it is tall. */
const TOP_ON_SCREEN = 360;

export class MasonView {
  private root = document.createElement("div");
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private s: MasonState = createMason();
  private raf = 0;
  private last = 0;
  private acc = 0;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private ended = false;
  /** Camera offset (world y of the screen top), eased toward the tower top. */
  private cam = 0;

  constructor(
    private host: HTMLElement,
    private onFinish: (score: number) => MiniResult,
    private onExit: () => void,
    private onSound?: (kind: "thud" | "settle" | "crash" | "star") => void,
  ) {
    this.root.className = "lgm2";
    this.canvas.className = "lgl-canvas";
    this.root.append(this.canvas);
    this.canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.tap();
    });
  }

  open(_seed = 0): void {
    this.s = createMason();
    this.ended = false;
    this.acc = 0;
    this.cam = 0;
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

  private tap(): void {
    if (this.ended) return;
    const streak = this.s.streak;
    const r = drop(this.s);
    if (r === "ignored") return;
    if (r === "miss") this.onSound?.("crash");
    else if (r === "perfect") {
      this.onSound?.("settle");
      if (this.s.streak > streak && this.s.streak % 3 === 0) window.setTimeout(() => this.onSound?.("star"), 120);
    } else this.onSound?.("thud");
  }

  private frame(now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    while (this.acc >= STEP) {
      stepMason(this.s, STEP);
      this.acc -= STEP;
    }
    // Keep the top of the tower around TOP_ON_SCREEN once it is taller than that.
    const want = Math.max(0, (this.s.tower.length - 1) * BLOCK_H - (GROUND - TOP_ON_SCREEN));
    this.cam += (want - this.cam) * Math.min(1, dt * 6);
    this.draw();
    if (this.s.over && !this.ended) {
      this.ended = true;
      window.setTimeout(() => this.showEnd(this.onFinish(this.s.score)), this.s.lost ? 700 : 0);
    }
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private showEnd(r: MiniResult): void {
    showEndPanel(this.root, {
      cls: "lgm2-end",
      title: this.s.lost ? "The tower topples!" : "Mortar's dry!",
      r,
      extra: `${this.s.tower.length - 1} blocks high · best streak ${this.s.bestStreak}`,
      again: "Build again",
      onAgain: () => this.open(),
      onBack: () => {
        this.close();
        this.onExit();
      },
    });
  }

  /** Screen y of the bottom of tower level i (0 = the base block). */
  private levelY(i: number): number {
    return GROUND - i * BLOCK_H + this.cam;
  }

  private block(c: CanvasRenderingContext2D, x: number, yBottom: number, w: number, tone = 0): void {
    const y = yBottom - BLOCK_H;
    const light = 150 + tone, mid = 122 + tone, dark = 86 + tone;
    c.fillStyle = `rgb(${mid},${mid - 10},${mid - 26})`;
    c.fillRect(x - w / 2, y, w, BLOCK_H);
    c.fillStyle = `rgb(${light},${light - 10},${light - 28})`;
    c.fillRect(x - w / 2, y, w, 5);
    c.fillStyle = `rgb(${dark},${dark - 8},${dark - 20})`;
    c.fillRect(x - w / 2, yBottom - 4, w, 4);
    // Mortar seams: staggered bricks.
    c.strokeStyle = "rgba(40,30,20,0.55)";
    c.lineWidth = 1.5;
    c.strokeRect(x - w / 2, y, w, BLOCK_H);
    const step = 36, shift = Math.round(yBottom / BLOCK_H) % 2 ? 18 : 0;
    for (let bx = x - w / 2 + shift + step; bx < x + w / 2 - 4; bx += step) {
      c.beginPath();
      c.moveTo(bx, y + 3);
      c.lineTo(bx, yBottom - 2);
      c.stroke();
    }
  }

  private draw(): void {
    const c = this.ctx;
    const s = this.s;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = "#1a1a2e";
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    // Sky darkens as the tower climbs; a few stars appear up high.
    const k = Math.min(1, this.cam / 900);
    const sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, `rgb(${Math.round(110 - 80 * k)},${Math.round(150 - 110 * k)},${Math.round(210 - 120 * k)})`);
    sky.addColorStop(1, `rgb(${Math.round(240 - 120 * k)},${Math.round(180 - 90 * k)},${Math.round(140 - 40 * k)})`);
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);
    if (k > 0.2) {
      c.fillStyle = `rgba(255,255,255,${(k - 0.2) * 0.9})`;
      for (let i = 0; i < 24; i++) c.fillRect((i * 97) % W, ((i * 53) % 300) + 70, 2, 2);
    }
    // Hills and ground (scroll away as the camera rises).
    c.fillStyle = "#4a7a3a";
    c.beginPath();
    c.moveTo(0, GROUND - 40 + this.cam);
    for (let x = 0; x <= W; x += 30) c.lineTo(x, GROUND - 40 - Math.sin(x * 0.02) * 18 + this.cam);
    c.lineTo(W, H + this.cam + 100);
    c.lineTo(0, H + this.cam + 100);
    c.fill();
    c.fillStyle = "#3a5a2a";
    c.fillRect(0, GROUND + this.cam, W, 200);
    // The tower.
    s.tower.forEach((b, i) => {
      const y = this.levelY(i);
      if (y < -BLOCK_H || y > H + BLOCK_H) return;
      const bounce = i === s.tower.length - 1 && s.since < 0.15 ? Math.sin((s.since / 0.15) * Math.PI) * 2 : 0;
      this.block(c, b.x, y + bounce, b.w, i === 0 ? -20 : ((i * 13) % 5) * 3);
    });
    // The broken-off piece tumbling down.
    if (s.chip && s.chip.t < 1.2) {
      const y = this.levelY(s.tower.length - 1) - (s.lost ? BLOCK_H : 0) + 260 * s.chip.t * s.chip.t;
      c.save();
      c.translate(s.chip.x, y - BLOCK_H / 2);
      c.rotate(s.chip.t * (s.chip.x > 180 ? 2.4 : -2.4));
      c.globalAlpha = Math.max(0, 1 - s.chip.t / 1.2);
      this.block(c, 0, BLOCK_H / 2, s.chip.w, -10);
      c.restore();
      c.globalAlpha = 1;
    }
    // The sliding block, with its shadow guide on the tower top.
    if (!s.over) {
      const yTop = this.levelY(s.tower.length);
      const top = s.tower[s.tower.length - 1]!;
      c.fillStyle = "rgba(0,0,0,0.18)";
      c.fillRect(Math.max(s.x - s.w / 2, top.x - top.w / 2), yTop - 3, Math.max(0, Math.min(s.x + s.w / 2, top.x + top.w / 2) - Math.max(s.x - s.w / 2, top.x - top.w / 2)), 3);
      this.block(c, s.x, yTop - 30, s.w, 10);
      // Rope from the crane above.
      c.strokeStyle = "#3a2a1a";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(s.x, 0);
      c.lineTo(s.x, yTop - 30 - BLOCK_H);
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
      const y = TOP_ON_SCREEN - 100 - f.t * 40 - i * 4;
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
    c.fillText(`🧱 ${s.score}`, 18, 34);
    c.textAlign = "center";
    c.fillText(`🏰 ${s.tower.length - 1}${s.streak >= 2 ? `  🔥${s.streak}` : ""}`, W / 2, 34);
    c.textAlign = "right";
    c.fillStyle = s.left < 10 ? "#ff8a7a" : "#fff";
    c.fillText(`⏱ ${Math.ceil(s.left)}`, W - 18, 34);
    c.textAlign = "center";
    c.font = "800 11px ui-rounded, system-ui, sans-serif";
    c.fillStyle = "#fff";
    c.strokeStyle = "#1d1208aa";
    c.lineWidth = 3;
    const st = masonStars(s.score);
    const goal = `★ at ${MASON.stars.join(" / ")}  ·  ${"★".repeat(st)}${"☆".repeat(3 - st)}`;
    c.strokeText(goal, W / 2, 64);
    c.fillText(goal, W / 2, 64);
    if (s.time < 4 && s.tower.length < 3) {
      c.font = "900 15px ui-rounded, system-ui, sans-serif";
      c.lineWidth = 4;
      c.strokeStyle = "#1d1208";
      for (const [i, line] of ["Tap to drop the block on the tower!", "What hangs over the edge breaks off", "Line it up perfectly to keep it wide"].entries()) {
        c.strokeText(line, W / 2, 100 + i * 22);
        c.fillText(line, W / 2, 100 + i * 22);
      }
    }
  }
}
