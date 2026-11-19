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
    if (id === "bat" || id === "ram" || id === "dragon" || id === "frostwyrm") continue;
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
  } else if (mood === 6) {
    // Frostpeak: a cold blue-white wash and snow drifting down on the wind.
    ctx.fillStyle = "rgba(150,185,230,0.14)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawSnow(ctx, time);
  } else if (mood === 7) {
    // Ashen Caldera: a hot red haze rising from below, embers drifting up, ash drifting down.
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, "rgba(60,20,20,0.18)");
    g.addColorStop(1, "rgba(220,70,20,0.16)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawEmbers(ctx, time);
  } else if (mood === 8) {
    // Sunken Citadel: a cold sea-green wash, low sea mist drifting through, and a fine drizzle.
    ctx.fillStyle = "rgba(30,90,100,0.14)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    for (let i = 0; i < 4; i++) {
      const x = ((time * 10 + i * 170) % (VIEW_W + 300)) - 150;
      const y = 160 + i * 170 + Math.sin(time * 0.4 + i) * 24;
      const g = ctx.createRadialGradient(x, y, 10, x, y, 160);
      g.addColorStop(0, "rgba(200,230,230,0.2)");
      g.addColorStop(1, "rgba(200,230,230,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - 160, y - 160, 320, 320);
    }
    ctx.save();
    ctx.strokeStyle = "rgba(200,225,235,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 40; i++) {
      const seed = (i * 73) % 997;
      const x = ((seed * 6.7 - time * 40) % VIEW_W + VIEW_W) % VIEW_W;
      const y = ((seed * 3.1 + time * 380) % (VIEW_H + 20)) - 10;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 2, y + 9);
    }
    ctx.stroke();
    ctx.restore();
  } else if (mood === 9) {
    // Bloodmoon Moors: a deep red wash, blood-moon light pouring in from the north that swells
    // slowly like a heartbeat, and low crimson mist drifting over the heath.
    ctx.fillStyle = "rgba(110,20,45,0.13)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const pulse = 0.75 + 0.25 * Math.sin(time * 0.9);
    const mg = ctx.createRadialGradient(VIEW_W * 0.72, -140, 40, VIEW_W * 0.72, -140, VIEW_H * 0.75);
    mg.addColorStop(0, `rgba(255,70,60,${0.32 * pulse})`);
    mg.addColorStop(0.45, `rgba(200,40,60,${0.12 * pulse})`);
    mg.addColorStop(1, "rgba(160,20,50,0)");
    ctx.fillStyle = mg;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    for (let i = 0; i < 4; i++) {
      const x = ((time * 9 + i * 190) % (VIEW_W + 300)) - 150;
      const y = 200 + i * 180 + Math.sin(time * 0.35 + i * 1.3) * 26;
      const g = ctx.createRadialGradient(x, y, 10, x, y, 170);
      g.addColorStop(0, "rgba(190,60,80,0.16)");
      g.addColorStop(1, "rgba(190,60,80,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - 170, y - 170, 340, 340);
    }
  } else if (mood === 99) {
    ctx.fillStyle = "rgba(90,40,120,0.12)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

/** Falling snow for the winter chapter: three depth layers, deterministic from time. */
function drawSnow(ctx: CanvasRenderingContext2D, time: number): void {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  const layers = [
    { n: 26, speed: 26, size: 1.3, alpha: 0.5, drift: 14 },
    { n: 18, speed: 44, size: 2, alpha: 0.7, drift: 22 },
    { n: 10, speed: 70, size: 2.8, alpha: 0.85, drift: 30 },
  ];
  for (let l = 0; l < layers.length; l++) {
    const L = layers[l]!;
    ctx.globalAlpha = L.alpha;
    for (let i = 0; i < L.n; i++) {
      const seed = (i * 97 + l * 389) % 1000;
      const baseX = (seed * 7.31) % VIEW_W;
      const y = ((seed * 3.7 + time * L.speed) % (VIEW_H + 20)) - 10;
      const x = (baseX + Math.sin(time * 0.8 + seed) * L.drift + time * 10 + VIEW_W) % VIEW_W;
      ctx.beginPath();
      ctx.arc(x, y, L.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Embers rising (orange, flickering) and grey ash falling, for the volcano chapter. */
function drawEmbers(ctx: CanvasRenderingContext2D, time: number): void {
  ctx.save();
  for (let i = 0; i < 26; i++) {
    const seed = (i * 131) % 997;
    const x = ((seed * 5.3 + Math.sin(time * 0.7 + seed) * 30) % VIEW_W + VIEW_W) % VIEW_W;
    const y = VIEW_H + 10 - ((seed * 2.9 + time * (30 + (i % 4) * 12)) % (VIEW_H + 20));
    const flick = 0.55 + 0.45 * Math.sin(time * 9 + seed);
    ctx.globalAlpha = 0.75 * flick;
    ctx.fillStyle = i % 3 ? "#ffb04a" : "#ff6a2a";
    ctx.beginPath();
    ctx.arc(x, y, 1.6 + (i % 3) * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#b8b0a8";
  for (let i = 0; i < 14; i++) {
    const seed = (i * 89 + 400) % 997;
    const x = ((seed * 4.1 + time * 8 + Math.sin(time * 0.5 + seed) * 20) % VIEW_W + VIEW_W) % VIEW_W;
    const y = ((seed * 3.3 + time * 22) % (VIEW_H + 20)) - 10;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(x, y, 2.2, 2.2);
  }
  ctx.restore();
}
