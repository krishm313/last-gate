// Daytime life (cloud shadows, wind gusts through the grass, butterflies — one perches on a still King —
// leaves on the breeze, bird flocks), split out of render.ts (phase 10 B3). Screen space over the world.
import { FOREST_Y, HALL, MAP_H, MAP_W, VIEW_H, VIEW_W } from "./world";

type V = { x: number; y: number };
/** Butterfly perch: butterfly `who` (blue, reads on the gold crown) lands after the King stands still
 *  `after` s by day, at (dx, dy) from his feet; eases in/out at these rates per second; rests facing `head`. */
export const PERCH = { who: 2, after: 3, dx: 3, dy: -43, inRate: 0.45, outRate: 1.8, head: -0.25 };

/** What day life needs from the renderer. */
export interface DayLifeEnv {
  time: number;
  /** Chapter scenery id. */
  mood: number;
  /** Perching butterfly: how far in (0..1) and the perch point (world). */
  perch: { k: number; x: number; y: number };
  blob(key: string, stops: [number, string][]): HTMLCanvasElement;
  drawBlob(ctx: CanvasRenderingContext2D, b: HTMLCanvasElement, x: number, y: number, rx: number, ry?: number, alpha?: number): void;
  screenAt(x: number, y: number, base: number, o: V, sh: V): [number, number];
}

/**
 * Daytime life: soft cloud shadows drifting across the field (world-anchored, so they slide as
 * the camera moves) and small flocks of birds crossing overhead with their shadows far below.
 */
export function drawDayLife(env: DayLifeEnv, ctx: CanvasRenderingContext2D, o: V, sh: V, day: number): void {
  if (day <= 0.02) return;
  const t = env.time;
  ctx.save();
  // Clouds: a few big blobs, each made of 3 overlapping soft ellipses.
  for (let i = 0; i < 7; i++) {
    const span = MAP_W + 700;
    const wx = ((t * (9 + (i % 3) * 2) + i * 430) % span) - 350;
    const wy = ((i * 263 + 120) % MAP_H) + Math.sin(t * 0.05 + i) * 40;
    const [x, y] = env.screenAt(wx, wy, wy, o, sh);
    if (x < -260 || x > VIEW_W + 260 || y < -200 || y > VIEW_H + 200) continue;
    for (let j = 0; j < 3; j++) {
      const cx = x + (j - 1) * 70, cy = y + ((j * 37) % 30) - 15, rx = 110 - j * 12, ry = 55 - j * 6;
      env.drawBlob(ctx, env.blob("cloud", [[0, "rgba(20,40,30,1)"], [1, "rgba(20,40,30,0)"]]), cx, cy, rx, ry, 0.16 * day);
    }
  }
  // Wind gusts: every ~9 s a gust rolls across the meadow from the left: a band where the grass
  // bends over and catches the light, drawn as short pale curved blades (world-anchored, so the
  // gust moves over the ground, not the screen). Not on the dusty plains, the night chapter or
  // the stony endless field.
  if (env.mood === 1 || env.mood === 2 || env.mood === 5) {
    const P = 9, cyc = Math.floor(t / P), gt = t - cyc * P;
    if (gt < 3) {
      const front = -150 + (gt / 3) * (MAP_W + 300);
      const hsh = (n: number): number => { const v = Math.sin(n * 91.7 + cyc * 13.3) * 43758.5453; return v - Math.floor(v); };
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = env.mood === 5 ? "rgba(255,236,190,1)" : "rgba(236,250,200,1)";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 170; i++) {
        const wx = hsh(i) * (MAP_W + 200) - 100, wy = FOREST_Y + 60 + hsh(i + 500) * (MAP_H - FOREST_Y - 200);
        const dxF = wx - front;
        if (dxF > 0 || dxF < -140) continue;
        const swell = Math.sin((-dxF / 140) * Math.PI); // swells in the middle of the band
        const [x, y] = env.screenAt(wx, wy, wy, o, sh);
        if (x < -10 || x > VIEW_W + 10 || y < -10 || y > VIEW_H + 10) continue;
        const bend = 4 + swell * 5;
        ctx.globalAlpha = day * swell * 0.45;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + bend * 0.5, y - 5, x + bend, y - 6 + swell * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 1);
        ctx.quadraticCurveTo(x + 4 + bend * 0.5, y - 3, x + 4 + bend, y - 4 + swell * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  // Butterflies: a few flutter around the camp on wandering loops (world-anchored). Each has fore-
  // and hind wings with a darker edge and pale spot, seen from above: the wings foreshorten as they
  // beat (fast downstroke, slower recovery), the body lifts on each downstroke, and it turns to
  // face the way it is drifting.
  const cols = ["#ffd84a", "#ff8ac0", "#8ad8ff", "#ffffff", "#ffb04a", "#c8a0ff"];
  const edge = ["#8a5a10", "#a03a70", "#2a5a8a", "#8a8a9a", "#9a4a10", "#5a3a8a"];
  const bfPos = (i: number, tt: number): [number, number] => {
    const cx = HALL.x - 220 + ((i * 97) % 440), cy = HALL.y - 260 + ((i * 151) % 300);
    return [cx + Math.sin(tt * 0.37 + i * 1.7) * 60 + Math.sin(tt * 1.1 + i) * 12,
      cy + Math.cos(tt * 0.29 + i * 2.3) * 40 + Math.sin(tt * 2.3 + i) * 6];
  };
  for (let i = 0; i < (env.mood === 6 || env.mood === 7 || env.mood === 8 || env.mood === 9 ? 0 : 6); i++) {
    const [wx, wy] = bfPos(i, t);
    const [nx, ny] = bfPos(i, t + 0.15);
    let [x, y] = env.screenAt(wx, wy, wy, o, sh);
    // The blue butterfly (reads against the gold crown) drifts over to perch on a King who has stood still a while (eased in and out).
    const land = i === PERCH.who ? env.perch.k * env.perch.k * (3 - 2 * env.perch.k) : 0;
    if (land > 0) {
      const [px, py] = env.screenAt(env.perch.x, env.perch.y, env.perch.y - PERCH.dy, o, sh);
      // A little arc on the way in, so it swoops rather than slides.
      x += (px - x) * land;
      y += (py - y) * land - Math.sin(land * Math.PI) * 26;
    }
    if (x < -10 || x > VIEW_W + 10 || y < -10 || y > VIEW_H + 10) continue;
    // Beat phase with a quick downstroke: warp the phase so the first 40% covers half the cycle.
    const raw = (t * 2.4 + i * 0.37) % 1;
    const ph = raw < 0.4 ? raw / 0.4 * 0.5 : 0.5 + (raw - 0.4) / 0.6 * 0.5;
    let open = 0.18 + 0.82 * (0.5 + 0.5 * Math.cos(ph * Math.PI * 2)); // 1 = flat open, ~0 = up
    let lift = Math.sin(ph * Math.PI * 2) * 1.6;
    let head = Math.atan2(ny - wy, nx - wx) + Math.PI / 2;
    if (land > 0) {
      // Perched: wings fold up and open lazily, body still, facing up the screen.
      const rest = 0.3 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.6));
      open += (rest - open) * land;
      lift *= 1 - land;
      head += (PERCH.head - head) * land;
    }
    ctx.globalAlpha = day * (1 - land); // its ground shadow lands on the King instead
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(x + 6, y + 14, 1.5 + 2.5 * open, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = day;
    ctx.save();
    ctx.translate(x, y - lift);
    ctx.rotate(head);
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(side * open, 1);
      // Hind wing (smaller, lower), then fore wing over it.
      ctx.fillStyle = edge[i]!;
      ctx.beginPath(); ctx.ellipse(2.6, 1.6, 2.6, 2.1, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = cols[i]!;
      ctx.beginPath(); ctx.ellipse(2.4, 1.5, 2.0, 1.6, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = edge[i]!;
      ctx.beginPath(); ctx.ellipse(3.0, -1.6, 3.4, 2.4, -0.45, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = cols[i]!;
      ctx.beginPath(); ctx.ellipse(2.8, -1.5, 2.8, 1.9, -0.45, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.beginPath(); ctx.arc(4.0, -2.2, 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = "#2a2018";
    ctx.beginPath(); ctx.ellipse(0, 0.3, 0.75, 3.0, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#2a2018"; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(-0.3, -2.6); ctx.lineTo(-1.3, -4.6); ctx.moveTo(0.3, -2.6); ctx.lineTo(1.3, -4.6); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  // Leaves on the breeze, by chapter: a heavy fall of red and gold in autumn, green in summer
  // and the marsh, dry ochre on the plains; each swings side to side as it drifts and flips
  // edge-on as it tumbles, with a darker midrib.
  const LEAF: Record<number, { n: number; cols: string[] }> = {
    1: { n: 7, cols: ["#7ab040", "#9ac24a", "#d8a040", "#5e9a34"] },
    2: { n: 6, cols: ["#5e8a4a", "#7a9a52", "#8aa83a", "#4e7a40"] },
    3: { n: 8, cols: ["#c8a050", "#b08840", "#d8b868", "#9a7a3a"] },
    5: { n: 22, cols: ["#d84a24", "#e8822a", "#f0b03a", "#b8341e", "#c86a2a"] },
    99: { n: 7, cols: ["#d8a040", "#b8742a", "#8aa83a", "#c8582a"] },
  };
  const lf = LEAF[env.mood];
  if (lf)
    for (let i = 0; i < lf.n; i++) {
      const sp = 26 + (i % 5) * 9;
      const lx = ((t * sp + i * 173) % (VIEW_W + 80)) - 40 + Math.sin(t * 1.1 + i * 2.3) * 14;
      const ly = ((i * 211 + t * (14 + (i % 6) * 3)) % (VIEW_H + 40)) - 20;
      const swing = Math.sin(t * 2.1 + i * 1.7);
      const spin = t * (1.5 + (i % 5) * 0.4) + i;
      ctx.save();
      ctx.globalAlpha = day * 0.9;
      ctx.translate(lx, ly);
      ctx.rotate(swing * 0.9 + spin * 0.3);
      const ls = 1.45 + (i % 3) * 0.2;
      ctx.scale(ls, ls * (Math.abs(Math.sin(spin * 1.3)) * 0.8 + 0.2));
      ctx.fillStyle = lf.cols[i % lf.cols.length]!;
      ctx.beginPath();
      ctx.moveTo(-4.4, 0);
      ctx.quadraticCurveTo(0, -2.8, 4.4, 0);
      ctx.quadraticCurveTo(0, 2.8, -4.4, 0);
      ctx.fill();
      ctx.strokeStyle = "rgba(60,30,10,0.45)";
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(-4.4, 0);
      ctx.lineTo(4, 0);
      ctx.stroke();
      ctx.restore();
    }
  // Birds: a flock every ~14 s crossing diagonally; shadow offset down-right (sun top-left).
  const period = 14;
  const n = Math.floor(t / period);
  const u = (t % period) / period;
  if (u < 0.6) {
    const p = u / 0.6;
    const seed = (n * 9301 + 49297) % 233280;
    const y0 = 60 + (seed % 300);
    const dir = seed % 2 ? 1 : -1;
    const bx = dir > 0 ? -60 + p * (VIEW_W + 120) : VIEW_W + 60 - p * (VIEW_W + 120);
    const by = y0 + p * 120;
    for (let b = 0; b < 5; b++) {
      const ox = (b % 2 ? 1 : -1) * Math.ceil(b / 2) * 14 * -dir;
      const oy = Math.ceil(b / 2) * 10;
      const flap = Math.sin(t * 14 + b * 1.3);
      const x = bx + ox, y = by + oy;
      // shadow
      ctx.fillStyle = `rgba(0,0,0,${0.16 * day})`;
      ctx.beginPath();
      ctx.ellipse(x + 34, y + 70, 5, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      // bird (a dark gull 'm')
      ctx.strokeStyle = `rgba(30,30,40,${0.85 * day})`;
      ctx.lineWidth = 1.8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x - 6, y - flap * 3);
      ctx.quadraticCurveTo(x - 3, y - 3 - flap, x, y);
      ctx.quadraticCurveTo(x + 3, y - 3 - flap, x + 6, y - flap * 3);
      ctx.stroke();
    }
  }
  ctx.restore();
}
