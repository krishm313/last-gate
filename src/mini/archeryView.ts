import { createRange, RANGE, rangeReward, shoot, starsFor, stepRange, type RangeState } from "./archery";

/**
 * Archery Range screen: a full-screen canvas over the game. Drag back from the bow (anywhere in the
 * bottom of the screen) and let go to shoot — a dotted line shows where the arrow will start off.
 * Fixed-step logic (archery.ts); this file only draws and turns touches into shots.
 */
const STEP = 1 / 60;

export interface RangeResult {
  score: number;
  stars: number;
  gold: number;
  newStars: number;
}

export class ArcheryView {
  private root = document.createElement("div");
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private s: RangeState = createRange(1);
  private raf = 0;
  private last = 0;
  private acc = 0;
  private drag: { x: number; y: number; cx: number; cy: number } | null = null;
  private king = new Image();
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private ended = false;

  constructor(
    private host: HTMLElement,
    /** Called once when a round ends; returns the reward to show. */
    private onFinish: (score: number) => RangeResult,
    private onExit: () => void,
  ) {
    this.root.className = "lga";
    this.canvas.className = "lga-canvas";
    this.root.append(this.canvas);
    this.king.src = "./sprites/units/king.png";
    this.canvas.addEventListener("pointerdown", (e) => this.down(e));
    this.canvas.addEventListener("pointermove", (e) => this.move(e));
    this.canvas.addEventListener("pointerup", () => this.up());
    this.canvas.addEventListener("pointercancel", () => (this.drag = null));
  }

  open(seed: number): void {
    this.s = createRange(seed);
    this.ended = false;
    this.drag = null;
    this.acc = 0;
    this.root.querySelector(".lga-end")?.remove();
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
    this.scale = Math.min(r.width / RANGE.w, r.height / RANGE.h) * dpr;
    this.ox = (this.canvas.width - RANGE.w * this.scale) / 2;
    this.oy = (this.canvas.height - RANGE.h * this.scale) / 2;
  }

  /** Screen (CSS px) → range coordinates. */
  private toRange(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / r.width;
    return { x: ((e.clientX - r.left) * dpr - this.ox) / this.scale, y: ((e.clientY - r.top) * dpr - this.oy) / this.scale };
  }

  private down(e: PointerEvent): void {
    if (this.ended) return;
    const p = this.toRange(e);
    this.drag = { x: p.x, y: p.y, cx: p.x, cy: p.y };
    this.canvas.setPointerCapture(e.pointerId);
  }
  private move(e: PointerEvent): void {
    if (!this.drag) return;
    const p = this.toRange(e);
    this.drag.cx = p.x;
    this.drag.cy = p.y;
  }
  private up(): void {
    if (!this.drag) return;
    shoot(this.s, this.drag.cx - this.drag.x, this.drag.cy - this.drag.y);
    this.drag = null;
  }

  private frame(now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    while (this.acc >= STEP) {
      stepRange(this.s, STEP);
      this.acc -= STEP;
    }
    this.draw();
    if (this.s.over && !this.ended) {
      this.ended = true;
      this.showEnd(this.onFinish(this.s.score));
    }
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private showEnd(r: RangeResult): void {
    const box = document.createElement("div");
    box.className = "panel pop-in lga-end";
    const h = document.createElement("h1");
    h.className = "title";
    h.textContent = r.stars ? "Fine shooting!" : "Time's up";
    const p = document.createElement("p");
    p.className = "sub";
    p.textContent = `Score ${r.score} · ${"★".repeat(r.stars)}${"☆".repeat(3 - r.stars)} · +${r.gold} gold${r.newStars ? ` · ${r.newStars} new star${r.newStars > 1 ? "s" : ""}!` : ""}`;
    const again = document.createElement("button");
    again.className = "btn";
    again.textContent = "Shoot again";
    again.onclick = () => this.open((Date.now() >>> 0) ^ 0xa11);
    const back = document.createElement("button");
    back.className = "btn btn-ghost";
    back.textContent = "Back to the map";
    back.onclick = () => {
      this.close();
      this.onExit();
    };
    box.append(h, p, again, back);
    this.root.append(box);
  }

  private draw(): void {
    const c = this.ctx;
    const s = this.s;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = "#1c2a14";
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    // The range: mown grass with lighter stripes, a dirt shooting line at the bottom.
    const g = c.createLinearGradient(0, 0, 0, RANGE.h);
    g.addColorStop(0, "#4f8a3a");
    g.addColorStop(1, "#6aa84a");
    c.fillStyle = g;
    c.fillRect(0, 0, RANGE.w, RANGE.h);
    c.fillStyle = "#ffffff10";
    for (let i = 0; i < 8; i++) c.fillRect(0, i * 80, RANGE.w, 40);
    c.fillStyle = "#b8925a";
    c.fillRect(0, RANGE.bowY + 20, RANGE.w, RANGE.h - RANGE.bowY - 20);
    // Lane ropes.
    c.strokeStyle = "#e8d8a066";
    c.lineWidth = 1.5;
    for (let lane = 0; lane < 4; lane++) {
      const y = 120 + lane * 85 + 34;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(RANGE.w, y);
      c.stroke();
    }
    for (const t of s.targets) this.drawTarget(t.kind, t.x, t.y, t.r);
    // Arrows.
    for (const a of s.arrows) {
      const ang = Math.atan2(a.vy, a.vx);
      c.save();
      c.translate(a.x, a.y);
      c.rotate(ang);
      c.strokeStyle = "#5a3a1e";
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(-22, 0);
      c.lineTo(0, 0);
      c.stroke();
      c.fillStyle = "#e8eef4";
      c.beginPath();
      c.moveTo(5, 0);
      c.lineTo(-4, -3.5);
      c.lineTo(-4, 3.5);
      c.closePath();
      c.fill();
      c.fillStyle = "#d84a3a";
      c.fillRect(-24, -3, 5, 6);
      c.restore();
    }
    // The King and his bow.
    if (this.king.complete && this.king.naturalWidth) {
      const h = 92;
      const w = (this.king.naturalWidth / this.king.naturalHeight) * h;
      c.drawImage(this.king, RANGE.bowX - w / 2, RANGE.bowY - h + 30, w, h);
    }
    // Aim line while drawing the bow: the path the arrow will take for its first moments.
    if (this.drag) {
      const dx = this.drag.cx - this.drag.x, dy = this.drag.cy - this.drag.y;
      const len = Math.hypot(dx, dy);
      if (len > 12) {
        const power = Math.min(1, len / RANGE.fullDraw);
        const sp = RANGE.maxSpeed * (0.45 + 0.55 * power);
        let x = RANGE.bowX, y = RANGE.bowY, vx = (-dx / len) * sp, vy = (-dy / len) * sp;
        c.fillStyle = `rgba(255,240,180,${0.5 + power * 0.4})`;
        for (let i = 0; i < 14; i++) {
          for (let k = 0; k < 3; k++) {
            vy += RANGE.gravity * STEP;
            x += vx * STEP;
            y += vy * STEP;
          }
          c.beginPath();
          c.arc(x, y, 2.6, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
    // Score popups.
    c.textAlign = "center";
    c.font = "900 18px ui-rounded, system-ui, sans-serif";
    for (const f of s.fx) {
      c.globalAlpha = 1 - f.t / 0.9;
      c.fillStyle = f.bull ? "#ffe27a" : "#ffffff";
      c.strokeStyle = "#1d1208";
      c.lineWidth = 4;
      const label = f.bull ? `BULLSEYE +${f.points}` : `+${f.points}`;
      c.strokeText(label, f.x, f.y - 20 - f.t * 30);
      c.fillText(label, f.x, f.y - 20 - f.t * 30);
    }
    c.globalAlpha = 1;
    // HUD: score, combo, time.
    c.fillStyle = "#120c09cc";
    c.fillRect(8, 8, RANGE.w - 16, 40);
    c.font = "900 17px ui-rounded, system-ui, sans-serif";
    c.textAlign = "left";
    c.fillStyle = "#ffd84a";
    c.fillText(`🎯 ${s.score}`, 18, 34);
    c.textAlign = "center";
    c.fillStyle = "#fff";
    const mult = Math.min(3, 1 + Math.floor(s.combo / 3));
    if (s.combo >= 2) c.fillText(`combo ${s.combo}${mult > 1 ? ` · ×${mult}` : ""}`, RANGE.w / 2, 34);
    c.textAlign = "right";
    c.fillStyle = s.left < 10 ? "#ff8a7a" : "#fff";
    c.fillText(`⏱ ${Math.ceil(s.left)}`, RANGE.w - 18, 34);
    c.textAlign = "center";
    c.font = "800 11px ui-rounded, system-ui, sans-serif";
    c.fillStyle = "#fff8";
    const st = starsFor(s.score);
    c.fillText(`★ at ${RANGE.stars.join(" / ")}  ·  ${"★".repeat(st)}${"☆".repeat(3 - st)}`, RANGE.w / 2, 64);
    if (s.time < 3 && !s.shots) {
      c.font = "900 15px ui-rounded, system-ui, sans-serif";
      c.fillStyle = "#fff";
      c.strokeStyle = "#1d1208";
      c.lineWidth = 4;
      c.strokeText("Drag back and let go to shoot!", RANGE.w / 2, RANGE.bowY - 90);
      c.fillText("Drag back and let go to shoot!", RANGE.w / 2, RANGE.bowY - 90);
    }
  }

  private drawTarget(kind: string, x: number, y: number, r: number): void {
    const c = this.ctx;
    if (kind === "board") {
      // A stand and a painted board: red and white rings, gold centre.
      c.fillStyle = "#6a4a2a";
      c.fillRect(x - 3, y + r * 0.6, 6, 30);
      const rings = ["#f4efe2", "#d8402a", "#f4efe2", "#d8402a", "#ffd84a"];
      rings.forEach((col, i) => {
        c.fillStyle = col;
        c.beginPath();
        c.arc(x, y, r * (1 - i * 0.18), 0, Math.PI * 2);
        c.fill();
      });
      c.strokeStyle = "#1d1208";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.stroke();
    } else if (kind === "dummy") {
      // Straw dummy on a post.
      c.fillStyle = "#6a4a2a";
      c.fillRect(x - 3, y, 6, 34);
      c.fillStyle = "#d8b860";
      c.strokeStyle = "#1d1208";
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(x, y, r * 0.75, r, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.beginPath();
      c.arc(x, y - r * 1.15, r * 0.45, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    } else {
      // Raven: a dark bird with flapping wings.
      const flap = Math.sin(this.s.time * 18 + x) * 0.6;
      c.fillStyle = "#1e1a24";
      c.beginPath();
      c.ellipse(x, y, r * 0.7, r * 0.45, 0, 0, Math.PI * 2);
      c.fill();
      for (const side of [-1, 1]) {
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x + side * r * 1.2, y - r * (0.9 + flap), x + side * r * 1.6, y + r * 0.2);
        c.closePath();
        c.fill();
      }
      c.fillStyle = "#ffd84a";
      c.beginPath();
      c.arc(x + r * 0.35, y - r * 0.1, 2.2, 0, Math.PI * 2);
      c.fill();
    }
  }
}

export { rangeReward };
