import { showEndPanel, type MiniResult } from "./endPanel";
import { BELLS, bellsStars, createBells, ring, showingBell, stepBells, type BellState } from "./bells";

/**
 * Bell Tower screen: four big bells in the belfry. Watch the tune, then tap the bells back in order.
 * Fixed-step logic (bells.ts); this file only draws and turns taps into rings.
 */
const STEP = 1 / 60;
const W = 360, H = 640;
/** Bell centres (2×2) and their tap radius. */
const POS: [number, number][] = [[105, 270], [255, 270], [105, 450], [255, 450]];
const TAP_R = 78;
const COLORS: [string, string][] = [["#ffd84a", "#a87810"], ["#8ad0ff", "#2a6a9a"], ["#ff8a6a", "#a8401a"], ["#9ae07a", "#3a8a2a"]];
/** A ringing bell brightens in its own colour (not white, so you can still tell them apart). */
const LIT = ["#fff2a0", "#d4efff", "#ffd2c2", "#dcffc8"];

export class BellsView {
  private root = document.createElement("div");
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private s: BellState = createBells(1);
  private raf = 0;
  private last = 0;
  private acc = 0;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private ended = false;

  constructor(
    private host: HTMLElement,
    private onFinish: (score: number) => MiniResult,
    private onExit: () => void,
    private onBell?: (i: number) => void,
    private onSound?: (kind: "crash" | "star") => void,
  ) {
    this.root.className = "lgb2";
    this.canvas.className = "lgl-canvas";
    this.root.append(this.canvas);
    this.canvas.addEventListener("pointerdown", (e) => this.down(e));
  }

  open(seed: number): void {
    this.s = createBells(seed);
    this.ended = false;
    this.acc = 0;
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

  private down(e: PointerEvent): void {
    if (this.ended) return;
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / r.width;
    const x = ((e.clientX - r.left) * dpr - this.ox) / this.scale;
    const y = ((e.clientY - r.top) * dpr - this.oy) / this.scale;
    let best = -1, bd = TAP_R * TAP_R;
    POS.forEach(([bx, by], i) => {
      const d = (bx - x) ** 2 + (by - y) ** 2;
      if (d <= bd) { bd = d; best = i; }
    });
    if (best < 0) return;
    const res = ring(this.s, best);
    if (res === "ignored") return;
    if (res === "wrong") this.onSound?.("crash");
    else {
      this.onBell?.(best);
      if (res === "done") window.setTimeout(() => this.onSound?.("star"), 160);
    }
  }

  private frame(now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    while (this.acc >= STEP) {
      const before = this.s.rang.slice();
      const showing = this.s.phase === "show";
      stepBells(this.s, STEP);
      // Bells the tune strikes make their sound too.
      if (showing) this.s.rang.forEach((t, i) => { if (t < before[i]! && t < STEP * 1.5) this.onBell?.(i); });
      this.acc -= STEP;
    }
    this.draw();
    if (this.s.over && !this.ended) {
      this.ended = true;
      this.showEnd(this.onFinish(this.s.score));
    }
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private showEnd(r: MiniResult): void {
    showEndPanel(this.root, {
      cls: "lgb2-end",
      title: this.s.lost ? "The tower cracked!" : "The bells fall silent",
      r,
      extra: `longest tune ${this.s.tune.length - 1} notes`,
      again: "Ring again",
      onAgain: () => this.open((Date.now() >>> 0) ^ 0xbe11),
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
    c.fillStyle = "#1a1420";
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    // Belfry: dusk sky through two arches, stone walls, a beam the bells hang from.
    const sky = c.createLinearGradient(0, 80, 0, 560);
    sky.addColorStop(0, "#2a2a5a");
    sky.addColorStop(1, "#c86a4a");
    c.fillStyle = "#3a3040";
    c.fillRect(0, 0, W, H);
    c.fillStyle = sky;
    for (const ax of [W / 4, (3 * W) / 4]) {
      c.beginPath();
      c.moveTo(ax - 62, 560);
      c.lineTo(ax - 62, 160);
      c.arc(ax, 160, 62, Math.PI, 0);
      c.lineTo(ax + 62, 560);
      c.closePath();
      c.fill();
    }
    c.strokeStyle = "#2a2230";
    c.lineWidth = 2;
    for (let y = 90, row = 0; y < H; y += 30, row++) {
      for (let x = (row % 2) * 24; x < W; x += 48) {
        if ((Math.abs(x - W / 4) < 70 || Math.abs(x - (3 * W) / 4) < 70) && y > 100 && y < 560) continue;
        c.strokeRect(x, y, 48, 30);
      }
    }
    c.fillStyle = "#5a3a22";
    c.fillRect(0, 168, W, 16);
    c.fillRect(0, 348, W, 16);
    // Bells.
    const sounding = showingBell(s);
    POS.forEach(([bx, by], i) => {
      const t = s.rang[i]!;
      const lit = sounding === i || t < 0.25;
      const bad = s.wrong?.bell === i;
      const swing = Math.sin(t * 14) * Math.exp(-t * 3.2) * 0.35;
      const [hi, lo] = COLORS[i]!;
      if (lit) {
        const g = c.createRadialGradient(bx, by, 10, bx, by, 90);
        g.addColorStop(0, `${hi}cc`);
        g.addColorStop(1, `${hi}00`);
        c.fillStyle = g;
        c.fillRect(bx - 90, by - 90, 180, 180);
      }
      c.save();
      c.translate(bx, by - 78);
      c.rotate(swing);
      c.fillStyle = "#2a1a10";
      c.fillRect(-4, 0, 8, 22);
      // Bell body: flared cup.
      const grad = c.createLinearGradient(-50, 0, 50, 0);
      grad.addColorStop(0, lo);
      grad.addColorStop(0.35, bad ? "#ff5a4a" : lit ? LIT[i]! : hi);
      grad.addColorStop(1, lo);
      c.fillStyle = grad;
      c.strokeStyle = "#1d1208";
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(-18, 22);
      c.quadraticCurveTo(-26, 24, -30, 60);
      c.quadraticCurveTo(-34, 100, -52, 112);
      c.lineTo(52, 112);
      c.quadraticCurveTo(34, 100, 30, 60);
      c.quadraticCurveTo(26, 24, 18, 22);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = "#1d1208";
      c.beginPath();
      c.ellipse(0, 112, 50, 7, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = lo;
      c.beginPath();
      c.arc(Math.sin(t * 20) * Math.exp(-t * 4) * 10, 118, 9, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.restore();
    });
    // Cracks down the walls.
    c.strokeStyle = "#120c14";
    c.lineWidth = 3;
    for (let k = 0; k < s.cracks; k++) {
      const x = [24, W - 24, W / 2][k]!;
      c.beginPath();
      c.moveTo(x, 90);
      for (let j = 1; j < 8; j++) c.lineTo(x + (j % 2 ? 8 : -6), 90 + j * 22);
      c.stroke();
    }
    // Tune progress: one dot per note.
    const n = s.tune.length;
    const dw = Math.min(22, 300 / n);
    for (let i = 0; i < n; i++) {
      const done = s.phase === "play" && i < s.at;
      c.fillStyle = done ? "#ffd84a" : "#00000070";
      c.strokeStyle = "#c8a46a";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(W / 2 - ((n - 1) * dw) / 2 + i * dw, 560, Math.min(7, dw / 2 - 1), 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    c.textAlign = "center";
    c.font = "900 18px ui-rounded, system-ui, sans-serif";
    c.lineWidth = 4;
    c.strokeStyle = "#1d1208";
    c.fillStyle = s.phase === "show" ? "#c8d8ff" : "#ffe27a";
    const label = s.phase === "show" ? "🎵 Listen…" : "Your turn — ring it back!";
    c.strokeText(label, W / 2, 600);
    c.fillText(label, W / 2, 600);
    // Popups.
    for (const [i, f] of s.fx.entries()) {
      c.globalAlpha = 1 - f.t / 1.1;
      c.fillStyle = f.good ? "#ffe27a" : "#ff8a7a";
      c.font = "900 22px ui-rounded, system-ui, sans-serif";
      const y = 130 - f.t * 30 - i * 4;
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
    c.fillText(`🔔 ${s.score}`, 18, 34);
    c.textAlign = "center";
    c.fillText(`🎵 ${n}  ${"💥".repeat(s.cracks)}${"·".repeat(BELLS.cracks - s.cracks)}`, W / 2, 34);
    c.textAlign = "right";
    c.fillStyle = s.left < 10 ? "#ff8a7a" : "#fff";
    c.fillText(`⏱ ${Math.ceil(s.left)}`, W - 18, 34);
    c.textAlign = "center";
    c.font = "800 11px ui-rounded, system-ui, sans-serif";
    c.fillStyle = "#fff";
    c.lineWidth = 3;
    const st = bellsStars(s.score);
    const goal = `★ at ${BELLS.stars.join(" / ")}  ·  ${"★".repeat(st)}${"☆".repeat(3 - st)}`;
    c.strokeText(goal, W / 2, 66);
    c.fillText(goal, W / 2, 66);
  }
}
