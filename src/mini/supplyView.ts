import { createRun, ROAD, steer, stepRun, supplyStars, type SupplyState, type Thing } from "./supply";

/**
 * Supply Run screen: a full-screen canvas over the game. Tap the left or right half of the screen
 * (or swipe) to move the wagon one lane. Fixed-step logic (supply.ts); this file only draws and
 * turns touches into steering.
 */
const STEP = 1 / 60;

export interface SupplyResult {
  score: number;
  stars: number;
  gold: number;
  newStars: number;
}

export class SupplyView {
  private root = document.createElement("div");
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private s: SupplyState = createRun(1);
  private raf = 0;
  private last = 0;
  private acc = 0;
  private press: { x: number; y: number } | null = null;
  private goblin = new Image();
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private ended = false;
  private onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "a") steer(this.s, -1);
    if (e.key === "ArrowRight" || e.key === "d") steer(this.s, 1);
  };

  constructor(
    private host: HTMLElement,
    /** Called once when a run ends; returns the reward to show. */
    private onFinish: (score: number) => SupplyResult,
    private onExit: () => void,
    private onSound?: (kind: "crash" | "pickup") => void,
  ) {
    this.root.className = "lgr";
    this.canvas.className = "lgr-canvas";
    this.root.append(this.canvas);
    this.goblin.src = "./sprites/units/goblin.png";
    this.canvas.addEventListener("pointerdown", (e) => this.down(e));
    this.canvas.addEventListener("pointerup", (e) => this.up(e));
    this.canvas.addEventListener("pointercancel", () => (this.press = null));
  }

  open(seed: number): void {
    this.s = createRun(seed);
    this.ended = false;
    this.press = null;
    this.acc = 0;
    this.root.querySelector(".lgr-end")?.remove();
    this.host.append(this.root);
    this.resize();
    window.addEventListener("keydown", this.onKey);
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  close(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKey);
    this.root.remove();
  }

  private resize(): void {
    const r = this.root.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.scale = Math.min(r.width / ROAD.w, r.height / ROAD.h) * dpr;
    this.ox = (this.canvas.width - ROAD.w * this.scale) / 2;
    this.oy = (this.canvas.height - ROAD.h * this.scale) / 2;
  }

  private down(e: PointerEvent): void {
    if (this.ended) return;
    this.press = { x: e.clientX, y: e.clientY };
  }
  private up(e: PointerEvent): void {
    if (!this.press || this.ended) return;
    const dx = e.clientX - this.press.x;
    this.press = null;
    // A swipe steers its way; a tap steers toward the half of the screen that was tapped.
    if (Math.abs(dx) > 24) steer(this.s, dx < 0 ? -1 : 1);
    else {
      const r = this.canvas.getBoundingClientRect();
      steer(this.s, e.clientX - r.left < r.width / 2 ? -1 : 1);
    }
  }

  private frame(now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    while (this.acc >= STEP) {
      const hp = this.s.hp, fx = this.s.fx.length;
      stepRun(this.s, STEP);
      if (this.s.hp < hp) this.onSound?.("crash");
      else if (this.s.fx.length > fx) this.onSound?.("pickup");
      this.acc -= STEP;
    }
    this.draw();
    if (this.s.over && !this.ended) {
      this.ended = true;
      this.showEnd(this.onFinish(this.s.score));
    }
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private showEnd(r: SupplyResult): void {
    const box = document.createElement("div");
    box.className = "panel pop-in lgr-end";
    const h = document.createElement("h1");
    h.className = "title";
    h.textContent = this.s.crashed ? "The wagon broke down!" : "Supplies delivered!";
    const p = document.createElement("p");
    p.className = "sub";
    p.textContent = `Score ${r.score} · ${"★".repeat(r.stars)}${"☆".repeat(3 - r.stars)} · +${r.gold} gold${r.newStars ? ` · ${r.newStars} new star${r.newStars > 1 ? "s" : ""}!` : ""}`;
    const again = document.createElement("button");
    again.className = "btn";
    again.textContent = "Ride again";
    again.onclick = () => this.open((Date.now() >>> 0) ^ 0x5a9);
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
    c.fillStyle = "#24361a";
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    const W = ROAD.w, H = ROAD.h;
    const roadL = 40, roadR = W - 40;
    const scroll = s.dist % 80;
    // Forest verges with grass stripes scrolling past.
    c.fillStyle = "#4a7a34";
    c.fillRect(0, 0, W, H);
    c.fillStyle = "#ffffff0d";
    for (let y = -80 + scroll; y < H; y += 80) c.fillRect(0, y, W, 40);
    // Dirt road with darker ruts at each lane.
    c.fillStyle = "#b08a58";
    c.fillRect(roadL, 0, roadR - roadL, H);
    c.fillStyle = "#9a7648";
    for (const lx of ROAD.lanes) {
      c.fillRect(lx - 22, 0, 6, H);
      c.fillRect(lx + 16, 0, 6, H);
    }
    // Lane dashes.
    c.fillStyle = "#e8d4a055";
    for (const bx of [135, 225]) for (let y = -80 + scroll; y < H; y += 80) c.fillRect(bx - 2, y, 4, 36);
    c.fillStyle = "#3a5a26";
    c.fillRect(roadL - 4, 0, 4, H);
    c.fillRect(roadR, 0, 4, H);
    // Trees along both verges (scroll a little slower for depth).
    const tscroll = (s.dist * 1.0) % 120;
    for (let y = -120 + tscroll; y < H + 40; y += 120) {
      this.tree(12, y);
      this.tree(W - 12, y + 60);
    }
    // Things on the road.
    for (const t of s.things) this.drawThing(t);
    // The wagon (flashes after a hit).
    if (!(s.hurt > 0 && Math.floor(s.hurt * 12) % 2 === 0)) this.wagon(s.x, ROAD.wagonY, s.time);
    // Popups.
    c.textAlign = "center";
    c.font = "900 18px ui-rounded, system-ui, sans-serif";
    for (const f of s.fx) {
      c.globalAlpha = 1 - f.t / 0.9;
      c.fillStyle = f.good ? "#ffe27a" : "#ff8a7a";
      c.strokeStyle = "#1d1208";
      c.lineWidth = 4;
      const y = ROAD.wagonY - 50 - f.t * 40;
      c.strokeText(f.text, f.x, y);
      c.fillText(f.text, f.x, y);
    }
    c.globalAlpha = 1;
    // HUD: score, hearts, time; star targets under it.
    c.fillStyle = "#120c09cc";
    c.fillRect(8, 8, W - 16, 40);
    c.font = "900 17px ui-rounded, system-ui, sans-serif";
    c.textAlign = "left";
    c.fillStyle = "#ffd84a";
    c.fillText(`🛒 ${s.score}`, 18, 34);
    c.textAlign = "center";
    const hearts = Math.max(0, Math.min(ROAD.hp, s.hp));
    c.fillText("❤️".repeat(hearts) + "🖤".repeat(ROAD.hp - hearts), W / 2, 34);
    c.textAlign = "right";
    c.fillStyle = s.left < 10 ? "#ff8a7a" : "#fff";
    c.fillText(`⏱ ${Math.ceil(s.left)}`, W - 18, 34);
    c.textAlign = "center";
    c.font = "800 11px ui-rounded, system-ui, sans-serif";
    c.fillStyle = "#fffc";
    const st = supplyStars(s.score);
    c.strokeStyle = "#1d1208aa";
    c.lineWidth = 3;
    const goal = `★ at ${ROAD.stars.join(" / ")}  ·  ${"★".repeat(st)}${"☆".repeat(3 - st)}`;
    c.strokeText(goal, W / 2, 64);
    c.fillText(goal, W / 2, 64);
    if (s.time < 3.5) {
      c.font = "900 15px ui-rounded, system-ui, sans-serif";
      c.fillStyle = "#fff";
      c.lineWidth = 4;
      c.strokeStyle = "#1d1208";
      for (const [i, line] of ["Tap left or right to steer!", "Dodge rocks, logs and goblins"].entries()) {
        c.strokeText(line, W / 2, ROAD.wagonY - 110 + i * 22);
        c.fillText(line, W / 2, ROAD.wagonY - 110 + i * 22);
      }
    }
  }

  private tree(x: number, y: number): void {
    const c = this.ctx;
    c.fillStyle = "#00000030";
    c.beginPath();
    c.ellipse(x + 4, y + 18, 18, 7, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#5a3a1e";
    c.fillRect(x - 3, y + 4, 6, 14);
    c.fillStyle = "#2e5e22";
    c.beginPath();
    c.arc(x, y - 4, 17, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#3f7a2e";
    c.beginPath();
    c.arc(x - 5, y - 9, 10, 0, Math.PI * 2);
    c.fill();
  }

  private wagon(x: number, y: number, t: number): void {
    const c = this.ctx;
    const bob = Math.sin(t * 14) * 1.2;
    // Seen from above, heading up the road: horse in front, cart behind.
    c.fillStyle = "#00000035";
    c.beginPath();
    c.ellipse(x + 3, y + 16, 26, 36, 0, 0, Math.PI * 2);
    c.fill();
    // Horse.
    c.fillStyle = "#7a4a26";
    c.strokeStyle = "#1d1208";
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(x, y - 30 + bob, 9, 16, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.beginPath();
    c.ellipse(x, y - 50 + bob, 6, 9, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = "#3a2210";
    c.fillRect(x - 1.5, y - 44 + bob, 3, 14);
    // Shafts.
    c.strokeStyle = "#5a3a1e";
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(x - 11, y - 12);
    c.lineTo(x - 8, y - 36);
    c.moveTo(x + 11, y - 12);
    c.lineTo(x + 8, y - 36);
    c.stroke();
    // Wheels.
    c.fillStyle = "#2a1a0e";
    for (const sx of [-1, 1]) for (const wy of [-2, 22]) c.fillRect(x + sx * 20 - 3, y + wy - 7, 6, 14);
    // Cart bed with a canvas cover and supplies.
    c.fillStyle = "#8a5a2e";
    c.strokeStyle = "#1d1208";
    c.lineWidth = 2;
    c.fillRect(x - 17, y - 14, 34, 46);
    c.strokeRect(x - 17, y - 14, 34, 46);
    c.fillStyle = "#efe2c0";
    c.beginPath();
    c.roundRect(x - 15, y - 10, 30, 30, 6);
    c.fill();
    c.stroke();
    c.strokeStyle = "#c8b48a";
    c.lineWidth = 1.5;
    for (const ry of [-2, 6, 14]) {
      c.beginPath();
      c.moveTo(x - 14, y + ry);
      c.lineTo(x + 14, y + ry);
      c.stroke();
    }
    c.fillStyle = "#c08a3a";
    c.fillRect(x - 9, y + 22, 8, 8);
    c.fillRect(x + 2, y + 22, 8, 8);
  }

  private drawThing(t: Thing): void {
    const c = this.ctx;
    const x = ROAD.lanes[t.lane]!, y = t.y;
    c.strokeStyle = "#1d1208";
    c.lineWidth = 2;
    if (t.kind === "rock") {
      c.fillStyle = "#00000030";
      c.beginPath();
      c.ellipse(x + 3, y + 10, 24, 9, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#8a8e96";
      c.beginPath();
      c.moveTo(x - 22, y + 10);
      c.lineTo(x - 16, y - 10);
      c.lineTo(x - 2, y - 18);
      c.lineTo(x + 14, y - 12);
      c.lineTo(x + 22, y + 8);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = "#b4b8c0";
      c.beginPath();
      c.moveTo(x - 12, y - 8);
      c.lineTo(x - 2, y - 14);
      c.lineTo(x + 8, y - 9);
      c.lineTo(x - 4, y - 3);
      c.closePath();
      c.fill();
    } else if (t.kind === "log") {
      c.fillStyle = "#00000030";
      c.fillRect(x - 30, y + 6, 64, 8);
      c.fillStyle = "#7a4e2a";
      c.beginPath();
      c.roundRect(x - 32, y - 9, 64, 18, 9);
      c.fill();
      c.stroke();
      c.fillStyle = "#c89a62";
      c.beginPath();
      c.ellipse(x + 27, y, 5, 8, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.strokeStyle = "#5a3618";
      c.beginPath();
      c.moveTo(x - 24, y - 2);
      c.lineTo(x + 14, y - 2);
      c.moveTo(x - 18, y + 4);
      c.lineTo(x + 8, y + 4);
      c.stroke();
    } else if (t.kind === "goblin") {
      if (this.goblin.complete && this.goblin.naturalWidth) {
        const h = 50;
        const w = (this.goblin.naturalWidth / this.goblin.naturalHeight) * h;
        c.fillStyle = "#00000030";
        c.beginPath();
        c.ellipse(x, y + 18, 18, 6, 0, 0, Math.PI * 2);
        c.fill();
        c.drawImage(this.goblin, x - w / 2, y - h + 22, w, h);
      } else {
        c.fillStyle = "#5f8f3a";
        c.beginPath();
        c.arc(x, y, 16, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
    } else if (t.kind === "coins") {
      const bob = Math.sin(this.s.time * 6 + t.id) * 2;
      c.fillStyle = "#c8a050";
      c.beginPath();
      c.ellipse(x, y + 3 + bob, 12, 11, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = "#a07a32";
      c.fillRect(x - 5, y - 11 + bob, 10, 6);
      c.fillStyle = "#ffd84a";
      c.font = "900 12px ui-rounded, system-ui, sans-serif";
      c.textAlign = "center";
      c.fillText("$", x, y + 8 + bob);
    } else {
      c.fillStyle = "#b07a3e";
      c.fillRect(x - 14, y - 14, 28, 28);
      c.strokeRect(x - 14, y - 14, 28, 28);
      c.strokeStyle = "#6a4420";
      c.beginPath();
      c.moveTo(x - 13, y - 13);
      c.lineTo(x + 13, y + 13);
      c.moveTo(x + 13, y - 13);
      c.lineTo(x - 13, y + 13);
      c.stroke();
      c.fillStyle = "#ffd84a";
      c.font = "900 11px ui-rounded, system-ui, sans-serif";
      c.textAlign = "center";
      c.fillText("+15", x, y - 18);
    }
  }
}
