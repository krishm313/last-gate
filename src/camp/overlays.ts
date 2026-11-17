// Screen-space overlays drawn on top of the world (after the camera transform is reset):
// boss entrance card, chapter mood lighting (incl. night eyes) and the hall-danger vignette.
import { LOOKS } from "./art";
import { outlined } from "./buildings";
import type { Camp, Vec } from "./sim";
import { VIEW_H, VIEW_W } from "./world";

/** Letterbox bars + boss name card during a boss entrance (`t` counts down from 1.8 s). */
export function drawBossCard(ctx: CanvasRenderingContext2D, name: string, t: number): void {
  // t counts down from 1.8. Letterbox bars glide in/out on a smoothstep; the name panel sweeps in
  // from the left with an overshoot, a light streak runs across it, and it slides off to the right.
  const e = 1.8 - t;
  const ss = (u: number): number => { const v = Math.min(1, Math.max(0, u)); return v * v * (3 - 2 * v); };
  const a = Math.min(ss(e / 0.3), ss(t / 0.3));
  const bar = 46 * a;
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  ctx.fillRect(0, 0, VIEW_W, bar);
  ctx.fillRect(0, VIEW_H - bar, VIEW_W, bar);
  const inU = Math.min(1, Math.max(0, (e - 0.12) / 0.4));
  const back = 1 + 2.4 * (inU - 1) ** 3 + 1.4 * (inU - 1) ** 2; // ease-out-back
  const outU = ss((0.3 - t) / 0.3);
  const dx = (1 - back) * -VIEW_W + outU * VIEW_W;
  if (inU <= 0) return;
  ctx.save();
  ctx.translate(dx, 0);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const y = VIEW_H * 0.62;
  ctx.fillStyle = "rgba(20,8,8,0.78)";
  ctx.fillRect(-20, y - 34, VIEW_W + 40, 68);
  ctx.fillStyle = "#ff5a3a";
  ctx.fillRect(-20, y - 34, VIEW_W + 40, 3);
  ctx.fillRect(-20, y + 31, VIEW_W + 40, 3);
  // Light streak sweeping across the panel once it lands.
  const sw = (e - 0.45) / 0.5;
  if (sw > 0 && sw < 1) {
    const sx = -60 + sw * (VIEW_W + 120);
    const g = ctx.createLinearGradient(sx - 50, 0, sx + 50, 0);
    g.addColorStop(0, "rgba(255,200,170,0)");
    g.addColorStop(0.5, "rgba(255,220,190,0.35)");
    g.addColorStop(1, "rgba(255,200,170,0)");
    ctx.fillStyle = g;
    ctx.fillRect(sx - 50, y - 31, 100, 62);
  }
  outlined(ctx, "BOSS", VIEW_W / 2, y - 14, 13, "#ff8a6a");
  const pop = 1 + Math.max(0, 1 - (e - 0.3) / 0.25) * 0.15 * (e > 0.3 ? 1 : 0);
  ctx.translate(VIEW_W / 2, y + 10);
  ctx.scale(pop, pop);
  outlined(ctx, name, 0, 0, 26, "#ffffff");
  ctx.restore();
}

/** Hall below 30% during a wave: red vignette that pulses faster the closer it gets to falling. */
export function drawDanger(ctx: CanvasRenderingContext2D, c: Camp, time: number): void {
  const frac = c.hallHp / c.hallMaxHp;
  if (c.phase !== "wave" || frac >= 0.3 || frac <= 0) return;
  const urgency = 1 - frac / 0.3;
  const beat = 0.5 + 0.5 * Math.sin(time * (4 + urgency * 6));
  const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.32, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.62);
  g.addColorStop(0, "rgba(200,20,10,0)");
  g.addColorStop(1, `rgba(200,20,10,${0.18 + 0.27 * urgency * beat})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

/** At night, foes out of the hero's light show glowing eyes so they read against the dark. */
function drawNightEyes(ctx: CanvasRenderingContext2D, c: Camp, o: Vec, sh: Vec): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const e of c.enemies) {
    const id = e.def.id;
    if (id === "bat" || id === "ram" || id === "dragon") continue;
    const d = Math.hypot(e.x - c.hero.x, e.y - c.hero.y);
    if (d < 110) continue;
    const a = Math.min(1, (d - 110) / 120);
    const sz = e.def.radius * 0.95 * (LOOKS[id]?.bulk ?? 1);
    const hr = sz * 0.46;
    const x = e.x - o.x + sh.x + hr * 0.1;
    const y = e.y - o.y + sh.y - sz * 0.78 + hr * 0.2;
    const blink = Math.sin(c.time * 1.3 + e.sway * 7) > 0.97 ? 0.15 : 1;
    ctx.globalAlpha = a * blink;
    ctx.fillStyle = e.def.boss ? "#ff5a3a" : "#ffd84a";
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(x + k * hr * 0.32, y, Math.max(1.3, hr * 0.13), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * Chapter lighting: 1 day (none), 2 marsh mist, 3 dusty, 4 night (light pool + eyes), 5 blood-red dusk,
 * 99 endless violet. `o` is the camera origin, `sh` the current screen-shake offset.
 */
export function drawMood(ctx: CanvasRenderingContext2D, c: Camp, o: Vec, mood: number, time: number, sh: Vec): void {
  // Follow the world's screen shake so the night light pool stays on the hero.
  const hx = c.hero.x - o.x + sh.x;
  const hy = c.hero.y - o.y + sh.y;
  if (mood === 4) {
    // Night: the renderer's day/night pass draws the darkness and lights; here just a cold tint
    // and the eyes watching from the forest.
    ctx.fillStyle = "rgba(20,30,80,0.12)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    void hx;
    void hy;
    drawNightEyes(ctx, c, o, sh);
  } else if (mood === 2) {
    // Drifting marsh mist.
    for (let i = 0; i < 5; i++) {
      const x = ((time * 12 + i * 140) % (VIEW_W + 300)) - 150;
      const y = 120 + i * 140 + Math.sin(time * 0.5 + i) * 20;
      const g = ctx.createRadialGradient(x, y, 10, x, y, 150);
      g.addColorStop(0, "rgba(200,230,200,0.22)");
      g.addColorStop(1, "rgba(200,230,200,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - 150, y - 150, 300, 300);
    }
    ctx.fillStyle = "rgba(60,90,60,0.12)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  } else if (mood === 3) {
    ctx.fillStyle = "rgba(200,160,90,0.12)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  } else if (mood === 5) {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, "rgba(180,40,20,0.30)");
    g.addColorStop(1, "rgba(120,30,40,0.10)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  } else if (mood === 99) {
    ctx.fillStyle = "rgba(90,40,120,0.12)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}
