import { HERO_POS, WALL_Y, WORLD_W } from "../core/constants";
import { FONT } from "../ui/font";
import type { GameEvent, Vec } from "../core/events";

/**
 * Visual-only effects driven by simulation events: particles, rings, flashes, numbers, shake.
 * Uses Math.random freely — none of this feeds back into the (deterministic) simulation.
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  gravity: number;
  drag: number;
  shape: "dot" | "spark" | "chunk";
}
interface Ring { x: number; y: number; r: number; color: string; life: number; max: number; width: number }
interface Zap { points: Vec[]; life: number; color: string }
interface Num { x: number; y: number; vx: number; vy: number; text: string; color: string; life: number; max: number; size: number; crit: boolean; rot: number }
interface Coin { x: number; y: number; vx: number; vy: number; t: number; delay: number }

const MAX_PARTICLES = 700;
const MAX_NUMS = 50;

export class Fx {
  particles: Particle[] = [];
  rings: Ring[] = [];
  zaps: Zap[] = [];
  nums: Num[] = [];
  coins: Coin[] = [];
  /** Screen shake "trauma" 0..1; offset ∝ trauma². */
  trauma = 0;
  /** Full-screen colour flash. */
  flash = 0;
  flashColor = "#ffffff";
  /** Hero bow recoil 0..1. */
  heroKick = 0;
  /** Gate wobble 0..1 when struck. */
  gateHit = 0;
  /** Boss-kill slow motion: seconds of real time remaining. */
  slowmo = 0;
  /** Where the gold counter is, in world coords (coins fly there). */
  goldTarget: Vec = { x: WORLD_W - 72, y: 22 };

  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  burst(x: number, y: number, color: string, count: number, speed: number, opts: Partial<Particle> = {}): void {
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      const max = (opts.max ?? 0.5) * (0.6 + Math.random() * 0.6);
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: max, max,
        size: (opts.size ?? 3) * (0.6 + Math.random() * 0.8), color,
        gravity: opts.gravity ?? 0, drag: opts.drag ?? 3, shape: opts.shape ?? "dot",
      });
    }
  }

  number(x: number, y: number, text: string, color: string, size: number, life = 0.55): void {
    if (this.nums.length >= MAX_NUMS) this.nums.shift();
    // Numbers hop: up and a little sideways, then arc back down under gravity. Crits (text ending
    // in "!") hop higher and tilt.
    // (Long-lived labels such as "BUILT!" keep the calm float instead.)
    const label = life >= 1;
    const crit = !label && text.endsWith("!");
    const side = Math.random() - 0.5;
    this.nums.push({ x: x + side * 12, y: y - 8, vx: label ? 0 : side * 50, vy: label ? -55 : crit ? -120 : -85, text, color, life, max: life, size, crit, rot: crit ? side * 0.4 : 0 });
  }

  consume(events: GameEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case "shoot":
          if (ev.owner === "hero") this.heroKick = 1;
          break;
        case "hit":
          if (ev.owner === "hero" || ev.owner === "archer") this.burst(ev.x, ev.y, "#fff4d0", 2, 90, { max: 0.18, size: 2, shape: "spark" });
          if (ev.crit) {
            this.number(ev.x, ev.y, `${ev.damage}!`, "#ffd84a", 24, 0.85);
            this.burst(ev.x, ev.y, "#ffd84a", 6, 160, { max: 0.3, size: 2.5, shape: "spark" });
          } else if (ev.owner === "hero") this.number(ev.x, ev.y, String(ev.damage), "#ffffff", 15, 0.6);
          else if (ev.owner === "splash") this.number(ev.x, ev.y, String(ev.damage), "#ffb0a0", 12);
          else if (ev.owner === "chain") this.number(ev.x, ev.y, String(ev.damage), "#bfe4ff", 11);
          else if (ev.owner === "thorns") this.number(ev.x, ev.y, String(ev.damage), "#a8e070", 11);
          break;
        case "kill": {
          const big = ev.enemy.boss ? 3 : ev.enemy.radius > 15 ? 1.6 : 1;
          this.burst(ev.x, ev.y, ev.enemy.color, Math.round(9 * big), 150 * big, { max: 0.55, size: 3.5 * Math.sqrt(big), gravity: 260, shape: "chunk" });
          this.burst(ev.x, ev.y, "#ffffff", 4, 80, { max: 0.15, size: 3 });
          this.rings.push({ x: ev.x, y: ev.y, r: ev.enemy.radius * 1.8, color: "#ffffff", life: 0.18, max: 0.18, width: 2 });
          for (let i = 0; i < Math.min(ev.gold, 6); i++) {
            this.coins.push({ x: ev.x, y: ev.y, vx: (Math.random() - 0.5) * 140, vy: -80 - Math.random() * 80, t: 0, delay: i * 0.04 });
          }
          if (ev.enemy.boss) {
            this.shake(0.9);
            this.flash = 0.6;
            this.flashColor = "#fff2c0";
            this.slowmo = 1.4;
            this.rings.push({ x: ev.x, y: ev.y, r: 200, color: "#ffd84a", life: 0.7, max: 0.7, width: 6 });
          }
          break;
        }
        case "gateHit":
          this.shake(Math.min(0.35, 0.05 + ev.damage / 120));
          this.gateHit = 1;
          this.burst(ev.x, WALL_Y - 2, "#a8865a", 4, 110, { max: 0.4, size: 3, gravity: 400, shape: "chunk" });
          break;
        case "zap":
          this.zaps.push({ points: ev.points, life: 0.2, color: "#cfe8ff" });
          for (const p of ev.points.slice(1)) this.burst(p.x, p.y, "#bfe4ff", 3, 120, { max: 0.2, size: 2, shape: "spark" });
          break;
        case "boom": {
          const col = { shatter: "#9fe4ff", wildfire: "#ff8a2a", plague: "#9be04a", boulder: "#b8a080", nova: "#ff6a20" }[ev.kind];
          if (ev.kind === "nova") {
            this.shake(0.5);
            this.flash = 0.3;
            this.flashColor = "#ff8030";
          }
          this.rings.push({ x: ev.x, y: ev.y, r: ev.r, color: col, life: 0.3, max: 0.3, width: 5 });
          this.burst(ev.x, ev.y, col, 16, 220, { max: 0.45, size: 3.5, shape: ev.kind === "shatter" ? "spark" : "dot" });
          this.shake(0.08);
          break;
        }
        case "sapper":
          this.rings.push({ x: ev.x, y: ev.y, r: 55, color: "#ffcc55", life: 0.35, max: 0.35, width: 6 });
          this.burst(ev.x, ev.y, "#ff9a30", 22, 240, { max: 0.5, size: 4 });
          this.burst(ev.x, ev.y, "#444", 10, 120, { max: 0.8, size: 6, drag: 2 });
          this.shake(0.45);
          this.flash = 0.25;
          this.flashColor = "#ffb040";
          break;
        case "heal":
          this.rings.push({ x: ev.x, y: ev.y, r: ev.r, color: "#6fe0a0", life: 0.5, max: 0.5, width: 3 });
          this.burst(ev.x, ev.y, "#8fffb8", 8, 60, { max: 0.6, size: 2.5, gravity: -60 });
          break;
        case "summon":
          this.rings.push({ x: ev.x, y: ev.y, r: 60, color: "#ff5040", life: 0.45, max: 0.45, width: 4 });
          this.burst(ev.x, ev.y, "#ff6040", 14, 140, { max: 0.5, size: 3 });
          break;
        case "enrage":
          this.rings.push({ x: ev.x, y: ev.y, r: 120, color: "#ff2020", life: 0.8, max: 0.8, width: 6 });
          this.shake(0.5);
          this.flash = 0.35;
          this.flashColor = "#ff3020";
          break;
        case "bossSpawn":
          this.shake(0.4);
          break;
        case "block":
          this.number(ev.x, ev.y - 4, "BLOCK", "#c8d4e8", 10, 0.4);
          this.burst(ev.x, ev.y, "#e0e8ff", 3, 100, { max: 0.15, size: 2, shape: "spark" });
          break;
        case "immune":
          if (Math.random() < 0.3) this.number(ev.x, ev.y - 4, "IMMUNE", "#b0b8d0", 9, 0.35);
          break;
        case "tower":
          if (ev.kind === "mage") this.burst(ev.x, ev.y - 36, "#b0a0ff", 6, 90, { max: 0.3, size: 2.5 });
          else this.burst(ev.x, ev.y - 20, "#c8b090", 4, 70, { max: 0.3, size: 2.5, gravity: 200 });
          break;
        case "ability":
          this.shake(0.3);
          this.rings.push({ x: HERO_POS.x, y: HERO_POS.y, r: 90, color: "#ffe08a", life: 0.5, max: 0.5, width: 5 });
          if (ev.id === "shieldBash") {
            this.rings.push({ x: HERO_POS.x, y: WALL_Y, r: 280, color: "#c8d8ff", life: 0.6, max: 0.6, width: 8 });
            this.flash = 0.25;
            this.flashColor = "#c8d8ff";
          }
          if (ev.id === "overclock") {
            this.flash = 0.2;
            this.flashColor = "#ffd060";
          }
          break;
        case "upgrade":
          this.burst(HERO_POS.x, HERO_POS.y, "#ffe08a", 24, 200, { max: 0.6, size: 3, gravity: -40 });
          this.rings.push({ x: HERO_POS.x, y: HERO_POS.y, r: 70, color: "#ffe08a", life: 0.5, max: 0.5, width: 4 });
          break;
        case "lost":
          this.shake(1);
          this.flash = 0.5;
          this.flashColor = "#ff2010";
          break;
        default:
          break;
      }
    }
  }

  /** Siege Lord's flipped view: "up" on screen is +y in the world, so rising things (smoke, numbers) invert. */
  flip = false;

  update(dt: number): void {
    const up = this.flip ? -1 : 1;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.flash = Math.max(0, this.flash - dt * 2);
    this.heroKick = Math.max(0, this.heroKick - dt * 9);
    this.gateHit = Math.max(0, this.gateHit - dt * 6);
    this.slowmo = Math.max(0, this.slowmo - dt);
    for (const p of this.particles) {
      p.vy += p.gravity * up * dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const z of this.zaps) z.life -= dt;
    this.zaps = this.zaps.filter((z) => z.life > 0);
    for (const n of this.nums) {
      n.x += n.vx * dt;
      n.y += n.vy * up * dt;
      n.vx *= Math.exp(-4 * dt);
      if (n.max < 1) {
        n.vy += 260 * dt; // gravity: the number rises, hangs, and drops a touch as it fades
        n.vy = Math.min(n.vy, 40);
      } else n.vy *= Math.exp(-3 * dt);
      n.life -= dt;
    }
    this.nums = this.nums.filter((n) => n.life > 0);
    for (const c of this.coins) {
      c.t += dt;
      if (c.t < 0.25 + c.delay) {
        c.vy += 500 * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
      } else {
        // Home in on the gold counter.
        const dx = this.goldTarget.x - c.x;
        const dy = this.goldTarget.y - c.y;
        const k = Math.min(1, dt * 7);
        c.x += dx * k;
        c.y += dy * k;
      }
    }
    this.coins = this.coins.filter((c) => c.t < 1.4 && Math.hypot(this.goldTarget.x - c.x, this.goldTarget.y - c.y) > 8);
  }

  /** Current camera offset from screen shake. */
  /** 0 disables screen shake (accessibility setting). */
  shakeScale = 1;
  /** Reduced motion: full-screen flashes are skipped. */
  calm = false;

  shakeOffset(time: number): Vec {
    const t = this.trauma * this.trauma * this.shakeScale;
    return { x: Math.sin(time * 71) * 9 * t, y: Math.cos(time * 53) * 7 * t };
  }

  draw(c: CanvasRenderingContext2D): void {
    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      c.globalAlpha = Math.max(0, 1 - t);
      c.strokeStyle = r.color;
      c.lineWidth = r.width * (1 - t * 0.6);
      c.beginPath();
      c.arc(r.x, r.y, r.r * (0.3 + 0.7 * Math.sqrt(t)), 0, Math.PI * 2);
      c.stroke();
    }
    for (const p of this.particles) {
      c.globalAlpha = Math.min(1, (p.life / p.max) * 1.5);
      c.fillStyle = p.color;
      if (p.shape === "spark") {
        c.strokeStyle = p.color;
        c.lineWidth = p.size * 0.7;
        c.beginPath();
        c.moveTo(p.x, p.y);
        c.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
        c.stroke();
      } else if (p.shape === "chunk") {
        c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else {
        c.beginPath();
        c.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.globalAlpha = 1;
    for (const coin of this.coins) {
      c.fillStyle = "#f2c94c";
      c.strokeStyle = "#8a5a10";
      c.lineWidth = 1;
      c.beginPath();
      c.arc(coin.x, coin.y, 3.5, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  /** Lightning arcs (drawn with the numbers, after the night darkness, so bolts light up the dark). */
  private drawZaps(c: CanvasRenderingContext2D): void {
    c.lineCap = "round";
    c.lineJoin = "round";
    for (const z of this.zaps) {
      const a = Math.max(0, z.life / 0.2);
      for (const [w, col] of [[6, "rgba(120,180,255,0.35)"], [2.5, z.color]] as const) {
        c.globalAlpha = a;
        c.strokeStyle = col;
        c.lineWidth = w;
        c.beginPath();
        z.points.forEach((p, i) => {
          if (i === 0) return c.moveTo(p.x, p.y);
          const prev = z.points[i - 1]!;
          for (let k = 1; k <= 3; k++) {
            const f = k / 4;
            c.lineTo(prev.x + (p.x - prev.x) * f + (Math.random() - 0.5) * 12, prev.y + (p.y - prev.y) * f + (Math.random() - 0.5) * 12);
          }
          c.lineTo(p.x, p.y);
        });
        c.stroke();
      }
    }
    c.globalAlpha = 1;
  }

  /** Floating numbers/labels: drawn separately (after night lighting) so they stay readable. */
  drawNumbers(c: CanvasRenderingContext2D): void {
    this.drawZaps(c);
    c.textAlign = "center";
    c.textBaseline = "middle";
    for (const n of this.nums) {
      const t = 1 - n.life / n.max;
      // Pop: springs up from small with an overshoot, then settles; drawn through a transform at a
      // fixed font size so the scale is smooth (integer font sizes stepped visibly).
      const pt = Math.min(1, (t * n.max) / 0.16);
      const k = n.crit ? 4.2 : 2.6;
      const back = 1 + k * (pt - 1) ** 3 + (k - 1) * (pt - 1) ** 2; // ease-out-back 0 -> 1
      const scale = 0.4 + 0.6 * back;
      // Crits rattle for a beat as they land.
      const shake = n.crit && t * n.max < 0.18 ? Math.sin(t * n.max * 90) * 1.6 * (1 - (t * n.max) / 0.18) : 0;
      const out = Math.min(1, (n.life / n.max) * 3);
      c.globalAlpha = out * out * (3 - 2 * out);
      c.save();
      c.translate(n.x + shake, n.y);
      c.rotate(n.rot * (1 - Math.min(1, t * 2)) + n.rot * 0.3);
      c.scale(scale, this.flip ? -scale : scale);
      c.font = `900 ${n.size}px ${FONT}`;
      c.lineJoin = "round";
      c.lineWidth = n.crit ? 5 : 4;
      c.strokeStyle = "rgba(20,10,4,0.85)";
      c.strokeText(n.text, 0, 0);
      if (n.crit) {
        const g = c.createLinearGradient(0, -n.size * 0.5, 0, n.size * 0.5);
        g.addColorStop(0, "#fffbe0");
        g.addColorStop(0.5, n.color);
        g.addColorStop(1, "#ff9a2a");
        c.fillStyle = g;
      } else c.fillStyle = n.color;
      c.fillText(n.text, 0, 0);
      c.restore();
    }
    c.globalAlpha = 1;
  }
}
