import { createWatch, stepWatch, tap, WATCH_GAME, watchStars, type Climber, type WatchState } from "./wallwatch";

/**
 * Wall Watch screen: a full-screen canvas over the game. Tap goblins on the ladders to knock them
 * off; leave the builders (yellow hats) alone. Fixed-step logic (wallwatch.ts); this file only
 * draws and turns taps into hits.
 */
const STEP = 1 / 60;

export interface WatchResult {
  score: number;
  stars: number;
  gold: number;
  newStars: number;
}

export class WallWatchView {
  private root = document.createElement("div");
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private s: WatchState = createWatch(1);
  private raf = 0;
  private last = 0;
  private acc = 0;
  private goblin = new Image();
  private brute = new Image();
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private ended = false;
  /** Where the last tap landed (a quick ring), in game coordinates. */
  private ping: { x: number; y: number; t: number } | null = null;

  constructor(
    private host: HTMLElement,
    /** Called once when a round ends; returns the reward to show. */
    private onFinish: (score: number) => WatchResult,
    private onExit: () => void,
    private onSound?: (kind: "thunk" | "crash" | "pickup") => void,
  ) {
    this.root.className = "lgw";
    this.canvas.className = "lgw-canvas";
    this.root.append(this.canvas);
    this.goblin.src = "./sprites/units/goblin.png";
    this.brute.src = "./sprites/units/horde_brute.png";
    this.canvas.addEventListener("pointerdown", (e) => this.down(e));
  }

  open(seed: number): void {
    this.s = createWatch(seed);
    this.ended = false;
    this.acc = 0;
    this.ping = null;
    this.root.querySelector(".lgw-end")?.remove();
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
    this.scale = Math.min(r.width / WATCH_GAME.w, r.height / WATCH_GAME.h) * dpr;
    this.ox = (this.canvas.width - WATCH_GAME.w * this.scale) / 2;
    this.oy = (this.canvas.height - WATCH_GAME.h * this.scale) / 2;
  }

  private down(e: PointerEvent): void {
    if (this.ended) return;
    const r = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / r.width;
    const x = ((e.clientX - r.left) * dpr - this.ox) / this.scale;
    const y = ((e.clientY - r.top) * dpr - this.oy) / this.scale;
    this.ping = { x, y, t: 0 };
    const hit = tap(this.s, x, y);
    if (hit === "goblin") this.onSound?.("thunk");
    else if (hit === "builder") this.onSound?.("crash");
  }

  private frame(now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    while (this.acc >= STEP) {
      const lives = this.s.lives;
      stepWatch(this.s, STEP);
      if (this.s.lives < lives) this.onSound?.("crash");
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

  private showEnd(r: WatchResult): void {
    const box = document.createElement("div");
    box.className = "panel pop-in lgw-end";
    const h = document.createElement("h1");
    h.className = "title";
    h.textContent = this.s.lost ? "They got over!" : "The wall holds!";
    const p = document.createElement("p");
    p.className = "sub";
    p.textContent = `Score ${r.score} · best combo ${this.s.bestCombo} · ${"★".repeat(r.stars)}${"☆".repeat(3 - r.stars)} · +${r.gold} gold${r.newStars ? ` · ${r.newStars} new star${r.newStars > 1 ? "s" : ""}!` : ""}`;
    const again = document.createElement("button");
    again.className = "btn";
    again.textContent = "Watch again";
    again.onclick = () => this.open((Date.now() >>> 0) ^ 0x3a7);
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
    const W = WATCH_GAME.w, H = WATCH_GAME.h, top = WATCH_GAME.top, foot = WATCH_GAME.foot;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = "#1a2030";
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    // Dusk sky with hills behind the wall.
    const sky = c.createLinearGradient(0, 0, 0, top);
    sky.addColorStop(0, "#3a4a7a");
    sky.addColorStop(1, "#e8a06a");
    c.fillStyle = sky;
    c.fillRect(0, 0, W, top);
    c.fillStyle = "#4a5a6a";
    c.beginPath();
    c.moveTo(0, top - 40);
    c.quadraticCurveTo(90, top - 90, 180, top - 50);
    c.quadraticCurveTo(270, top - 10, W, top - 70);
    c.lineTo(W, top);
    c.lineTo(0, top);
    c.closePath();
    c.fill();
    // The wall: stone courses with offset joints, crenellations on top.
    c.fillStyle = "#8a8478";
    c.fillRect(0, top, W, foot - top);
    c.strokeStyle = "#6a645a";
    c.lineWidth = 1.5;
    for (let y = top, row = 0; y < foot; y += 26, row++) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(W, y);
      c.stroke();
      for (let x = (row % 2) * 24; x < W; x += 48) {
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x, y + 26);
        c.stroke();
      }
    }
    c.fillStyle = "#9a9488";
    c.strokeStyle = "#1d1208";
    c.lineWidth = 2;
    for (let x = 0; x < W; x += 40) {
      c.fillRect(x + 4, top - 22, 24, 22);
      c.strokeRect(x + 4, top - 22, 24, 22);
    }
    c.fillStyle = "#00000025";
    c.fillRect(0, top, W, 10);
    // Ground below.
    c.fillStyle = "#4a7a34";
    c.fillRect(0, foot, W, H - foot);
    c.fillStyle = "#3a6a28";
    c.fillRect(0, foot, W, 8);
    // Ladders.
    for (const lx of WATCH_GAME.ladders) {
      c.strokeStyle = "#6a4422";
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(lx - 14, foot + 10);
      c.lineTo(lx - 11, top - 14);
      c.moveTo(lx + 14, foot + 10);
      c.lineTo(lx + 11, top - 14);
      c.stroke();
      c.lineWidth = 3;
      for (let y = top - 4; y < foot + 6; y += 22) {
        c.beginPath();
        c.moveTo(lx - 12, y);
        c.lineTo(lx + 12, y);
        c.stroke();
      }
    }
    for (const k of s.climbers) this.drawClimber(k);
    // Tap ring.
    if (this.ping && this.ping.t < 0.3) {
      c.strokeStyle = `rgba(255,255,255,${1 - this.ping.t / 0.3})`;
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
    // HUD: score, lives, time; combo and star targets under it.
    c.fillStyle = "#120c09cc";
    c.fillRect(8, 8, W - 16, 40);
    c.font = "900 17px ui-rounded, system-ui, sans-serif";
    c.textAlign = "left";
    c.fillStyle = "#ffd84a";
    c.fillText(`🛡️ ${s.score}`, 18, 34);
    c.textAlign = "center";
    const lives = Math.max(0, Math.min(WATCH_GAME.lives, s.lives));
    c.fillText("❤️".repeat(lives) + "🖤".repeat(WATCH_GAME.lives - lives), W / 2, 34);
    c.textAlign = "right";
    c.fillStyle = s.left < 10 ? "#ff8a7a" : "#fff";
    c.fillText(`⏱ ${Math.ceil(s.left)}`, W - 18, 34);
    c.textAlign = "center";
    c.font = "800 11px ui-rounded, system-ui, sans-serif";
    c.fillStyle = "#fff";
    c.strokeStyle = "#1d1208aa";
    c.lineWidth = 3;
    const st = watchStars(s.score);
    const mult = Math.min(3, 1 + Math.floor(s.combo / 4));
    const goal = `★ at ${WATCH_GAME.stars.join(" / ")}  ·  ${"★".repeat(st)}${"☆".repeat(3 - st)}${s.combo >= 2 ? `  ·  combo ${s.combo}${mult > 1 ? ` ×${mult}` : ""}` : ""}`;
    c.strokeText(goal, W / 2, 64);
    c.fillText(goal, W / 2, 64);
    if (s.time < 4) {
      c.font = "900 15px ui-rounded, system-ui, sans-serif";
      c.lineWidth = 4;
      c.strokeStyle = "#1d1208";
      for (const [i, line] of ["Tap the goblins off the ladders!", "Leave the builders 👷 alone"].entries()) {
        c.strokeText(line, W / 2, 110 + i * 22);
        c.fillText(line, W / 2, 110 + i * 22);
      }
    }
  }

  private drawClimber(k: Climber): void {
    const c = this.ctx;
    const x = WATCH_GAME.ladders[k.ladder]!;
    // Knocked off: tumble away and fade.
    let y = k.y;
    // Climbing: a little hop on each rung, leaning side to side.
    let rot = k.fall < 0 ? Math.sin(k.y / 7) * 0.08 : 0;
    if (k.fall < 0) y -= Math.abs(Math.sin(k.y / 11)) * 3;
    if (k.fall >= 0) {
      y += k.fall * 120 + k.fall * k.fall * 600;
      rot = k.fall * 9 * (k.id % 2 ? 1 : -1);
      c.globalAlpha = Math.max(0, 1 - k.fall);
    }
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    if (k.kind === "builder") {
      // A friendly builder: tunic, round face, yellow hard hat, hammer.
      c.strokeStyle = "#1d1208";
      c.lineWidth = 2;
      c.fillStyle = "#4a7ac8";
      c.beginPath();
      c.roundRect(-10, -6, 20, 24, 5);
      c.fill();
      c.stroke();
      c.fillStyle = "#f0c8a0";
      c.beginPath();
      c.arc(0, -14, 9, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = "#ffd84a";
      c.beginPath();
      c.arc(0, -17, 10, Math.PI, 0);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillRect(-13, -18, 26, 3);
      c.fillStyle = "#6a4422";
      c.fillRect(10, -8, 3, 16);
      c.fillStyle = "#9aa0a8";
      c.fillRect(7, -12, 10, 5);
    } else {
      const img = k.kind === "brute" ? this.brute : this.goblin;
      const h = k.kind === "brute" ? 58 : 46;
      if (img.complete && img.naturalWidth) {
        const w = (img.naturalWidth / img.naturalHeight) * h;
        c.drawImage(img, -w / 2, -h + 18, w, h);
      } else {
        c.fillStyle = "#5f8f3a";
        c.beginPath();
        c.arc(0, 0, 14, 0, Math.PI * 2);
        c.fill();
      }
      if (k.kind === "brute" && k.hp > 1 && k.fall < 0) {
        c.fillStyle = "#1d1208";
        c.fillRect(-14, -h + 10, 28, 5);
        c.fillStyle = "#ff6a5a";
        c.fillRect(-13, -h + 11, 26, 3);
      }
    }
    c.restore();
    c.globalAlpha = 1;
  }
}
