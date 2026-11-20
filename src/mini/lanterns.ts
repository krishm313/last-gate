import { createRng, next, range, type Rng } from "../core/rng";

/**
 * Ghost Lanterns — a 60-second side game. Four lanterns hang along the castle wall and slowly burn
 * down; wraiths drift in from the dark toward them. Tap a wraith to banish it, or tap a lantern to
 * fill it back up. A wraith that reaches a lantern snuffs it out; when every lantern is dark the
 * watch is over. Pure, deterministic logic (seeded, fixed step).
 */
export const LANTERN = {
  w: 360,
  h: 640,
  /** Lantern positions along the wall. */
  xs: [60, 140, 220, 300] as const,
  y: 520,
  time: 60,
  /** Oil drains per second (1 = full), at the start and the end of the round. */
  burn0: 0.06,
  burn1: 0.11,
  /** A wraith snuffs a lantern it reaches; tap radius around wraiths and lanterns. */
  hitR: 30,
  lanternR: 34,
  /** Wraith drift speed (px/s) at the start and the end of the round. */
  speed0: 42,
  speed1: 100,
  stars: [150, 280, 420] as const,
};

export interface Lamp {
  oil: number;
  lit: boolean;
  /** Seconds since last refilled (for a flare in the view). */
  flare: number;
}

export interface Wraith {
  id: number;
  x: number;
  y: number;
  target: number;
  /** Seconds since banished (fade-out); -1 while drifting. */
  gone: number;
}

export interface LanternFx {
  x: number;
  y: number;
  text: string;
  good: boolean;
  t: number;
}

export interface LanternState {
  rng: Rng;
  time: number;
  left: number;
  score: number;
  combo: number;
  bestCombo: number;
  lamps: Lamp[];
  wraiths: Wraith[];
  fx: LanternFx[];
  nextId: number;
  spawnIn: number;
  over: boolean;
  lost: boolean;
}

export function createLanterns(seed: number): LanternState {
  return {
    rng: createRng(seed), time: 0, left: LANTERN.time, score: 0, combo: 0, bestCombo: 0,
    lamps: LANTERN.xs.map(() => ({ oil: 1, lit: true, flare: 9 })), wraiths: [], fx: [], nextId: 1, spawnIn: 1.2, over: false, lost: false,
  };
}

const ramp = (t: number) => Math.min(1, t / LANTERN.time);
export function burnRate(t: number): number {
  return LANTERN.burn0 + (LANTERN.burn1 - LANTERN.burn0) * ramp(t);
}
export function driftSpeed(t: number): number {
  return LANTERN.speed0 + (LANTERN.speed1 - LANTERN.speed0) * ramp(t);
}

export function lanternStars(score: number): number {
  return LANTERN.stars.filter((t) => score >= t).length;
}

/** Gold for a finished round: a third of the score, plus a one-time bonus for each star tier newly reached. */
export function lanternReward(score: number, prevStars: number): { gold: number; stars: number; newStars: number } {
  const stars = lanternStars(score);
  const bonus = [0, 60, 120, 200].slice(prevStars + 1, stars + 1).reduce((a, b) => a + b, 0);
  return { gold: Math.round(Math.max(0, score) / 3) + bonus, stars, newStars: Math.max(0, stars - prevStars) };
}

/** A tap at (x, y): banish the nearest wraith in reach, else refill a lantern in reach. */
export function tapLantern(s: LanternState, x: number, y: number): "wraith" | "lamp" | "miss" {
  if (s.over) return "miss";
  let hit: Wraith | null = null, best = LANTERN.hitR ** 2;
  for (const w of s.wraiths) {
    if (w.gone >= 0) continue;
    const d = (w.x - x) ** 2 + (w.y - y) ** 2;
    if (d <= best) { best = d; hit = w; }
  }
  if (hit) {
    hit.gone = 0;
    s.combo += 1;
    s.bestCombo = Math.max(s.bestCombo, s.combo);
    // Closer to the lantern = a braver banish = more points; every 5 in a row adds +1×.
    const near = hit.y > LANTERN.y - 120 ? 1 : 0;
    const pts = (2 + near) * Math.min(3, 1 + Math.floor(s.combo / 5));
    s.score += pts;
    s.fx.push({ x: hit.x, y: hit.y, text: `+${pts}`, good: true, t: 0 });
    return "wraith";
  }
  for (const [i, l] of s.lamps.entries()) {
    if (!l.lit) continue;
    const lx = LANTERN.xs[i]!;
    if ((lx - x) ** 2 + (LANTERN.y - y) ** 2 > LANTERN.lanternR ** 2) continue;
    // Refilling a low lantern pays a point; topping up a full one does nothing.
    if (l.oil < 0.95) {
      if (l.oil < 0.35) { s.score += 1; s.fx.push({ x: lx, y: LANTERN.y - 30, text: "+1", good: true, t: 0 }); }
      l.oil = 1;
      l.flare = 0;
    }
    return "lamp";
  }
  s.combo = 0;
  return "miss";
}

function spawn(s: LanternState): void {
  const lit = s.lamps.map((l, i) => (l.lit ? i : -1)).filter((i) => i >= 0);
  if (!lit.length) return;
  const target = lit[Math.floor(next(s.rng) * lit.length)]!;
  const x = range(s.rng, 30, LANTERN.w - 30);
  s.wraiths.push({ id: s.nextId++, x, y: range(s.rng, 90, 150), target, gone: -1 });
}

export function stepLanterns(s: LanternState, dt: number): void {
  if (s.over) return;
  s.time += dt;
  s.left = Math.max(0, LANTERN.time - s.time);
  const burn = burnRate(s.time);
  for (const [i, l] of s.lamps.entries()) {
    l.flare += dt;
    if (!l.lit) continue;
    l.oil -= burn * dt;
    if (l.oil <= 0) {
      l.oil = 0;
      l.lit = false;
      s.combo = 0;
      s.fx.push({ x: LANTERN.xs[i]!, y: LANTERN.y - 30, text: "Burnt out!", good: false, t: 0 });
    }
  }
  s.spawnIn -= dt;
  if (s.spawnIn <= 0) {
    spawn(s);
    s.spawnIn = range(s.rng, 0.8, 1.3) * (1 - 0.55 * ramp(s.time));
  }
  const v = driftSpeed(s.time);
  for (const w of s.wraiths) {
    if (w.gone >= 0) { w.gone += dt; continue; }
    // Their lantern went dark: drift to another lit one (or fade if none are left).
    if (!s.lamps[w.target]!.lit) {
      const lit = s.lamps.map((l, i) => (l.lit ? i : -1)).filter((i) => i >= 0);
      if (!lit.length) { w.gone = 0; continue; }
      w.target = lit.reduce((a, b) => (Math.abs(LANTERN.xs[b]! - w.x) < Math.abs(LANTERN.xs[a]! - w.x) ? b : a));
    }
    const tx = LANTERN.xs[w.target]!, ty = LANTERN.y - 10;
    const dx = tx - w.x, dy = ty - w.y, d = Math.hypot(dx, dy);
    if (d < 14) {
      const l = s.lamps[w.target]!;
      l.lit = false;
      l.oil = 0;
      w.gone = 0;
      s.combo = 0;
      s.fx.push({ x: tx, y: LANTERN.y - 30, text: "Snuffed!", good: false, t: 0 });
      continue;
    }
    w.x += (dx / d) * v * dt;
    w.y += (dy / d) * v * dt;
  }
  s.wraiths = s.wraiths.filter((w) => !(w.gone > 0.6));
  if (s.lamps.every((l) => !l.lit)) { s.lost = true; s.over = true; }
  for (const f of s.fx) f.t += dt;
  s.fx = s.fx.filter((f) => f.t < 0.9);
  if (s.left <= 0) s.over = true;
}
