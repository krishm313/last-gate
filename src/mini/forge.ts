import { createRng, range, type Rng } from "../core/rng";

/**
 * Royal Forge — a 60-second timing side game. A glowing marker sweeps back and forth along the
 * anvil bar; tap while it's inside the hot zone to land a hammer strike. Dead centre is a perfect
 * strike. Five strikes forge a blade (bonus gold, extra for a flawless one) and a new bar heats up.
 * The marker speeds up and the zone narrows as the round goes on; three misses crack the anvil and
 * the round ends. Pure, deterministic logic (seeded, fixed step).
 */
export const FORGE = {
  time: 60,
  strikes: 5,
  cracks: 3,
  /** Marker speed in bar-lengths per second, at the start and the end of the round. */
  speed0: 0.75,
  speed1: 1.6,
  /** Half-width of the hot zone (bar = 0..1), start and end; the perfect core is a fraction of it. */
  zone0: 0.12,
  zone1: 0.065,
  core: 0.38,
  perfect: 5,
  good: 3,
  blade: 10,
  flawless: 10,
  stars: [250, 450, 650] as const,
};

export type Strike = "perfect" | "good" | "miss";

export interface ForgeFx {
  text: string;
  good: boolean;
  t: number;
}

export interface ForgeState {
  rng: Rng;
  time: number;
  left: number;
  score: number;
  /** Marker position 0..1 and its direction. */
  pos: number;
  dir: 1 | -1;
  /** Hot zone centre and half-width. */
  zone: number;
  width: number;
  /** Strikes landed on this blade, and whether all of them were perfect. */
  hits: number;
  clean: boolean;
  blades: number;
  combo: number;
  bestCombo: number;
  perfects: number;
  cracks: number;
  last: Strike | null;
  /** Seconds since the last strike (for the hammer swing / sparks). */
  since: number;
  fx: ForgeFx[];
  over: boolean;
  lost: boolean;
}

const ramp = (t: number) => Math.min(1, t / FORGE.time);
export function forgeSpeed(t: number): number {
  return FORGE.speed0 + (FORGE.speed1 - FORGE.speed0) * ramp(t);
}
export function zoneWidth(t: number): number {
  return FORGE.zone0 + (FORGE.zone1 - FORGE.zone0) * ramp(t);
}

function newZone(s: ForgeState): void {
  s.width = zoneWidth(s.time);
  // Keep the zone off the very ends, and away from where the marker is right now.
  let z = range(s.rng, 0.15, 0.85);
  if (Math.abs(z - s.pos) < 0.2) z = z < 0.5 ? z + 0.35 : z - 0.35;
  s.zone = z;
}

export function createForge(seed: number): ForgeState {
  const s: ForgeState = {
    rng: createRng(seed), time: 0, left: FORGE.time, score: 0, pos: 0, dir: 1, zone: 0.5, width: FORGE.zone0,
    hits: 0, clean: true, blades: 0, combo: 0, bestCombo: 0, perfects: 0, cracks: 0, last: null, since: 9, fx: [], over: false, lost: false,
  };
  newZone(s);
  return s;
}

export function forgeStars(score: number): number {
  return FORGE.stars.filter((t) => score >= t).length;
}

/** Gold for a finished round: a quarter of the score, plus a one-time bonus for each star tier newly reached. */
export function forgeReward(score: number, prevStars: number): { gold: number; stars: number; newStars: number } {
  const stars = forgeStars(score);
  const bonus = [0, 60, 120, 200].slice(prevStars + 1, stars + 1).reduce((a, b) => a + b, 0);
  return { gold: Math.round(Math.max(0, score) / 4) + bonus, stars, newStars: Math.max(0, stars - prevStars) };
}

/** What a tap right now would be. */
export function strikeAt(s: ForgeState): Strike {
  const d = Math.abs(s.pos - s.zone);
  return d <= s.width * FORGE.core ? "perfect" : d <= s.width ? "good" : "miss";
}

/** A tap: strike the bar. */
export function strike(s: ForgeState): Strike {
  if (s.over) return "miss";
  const k = strikeAt(s);
  s.last = k;
  s.since = 0;
  if (k === "miss") {
    s.combo = 0;
    s.clean = false;
    s.cracks += 1;
    s.fx.push({ text: s.cracks >= FORGE.cracks ? "Cracked!" : "Miss!", good: false, t: 0 });
    if (s.cracks >= FORGE.cracks) { s.lost = true; s.over = true; }
    return k;
  }
  s.combo += 1;
  s.bestCombo = Math.max(s.bestCombo, s.combo);
  if (k === "perfect") s.perfects += 1;
  else s.clean = false;
  const pts = (k === "perfect" ? FORGE.perfect : FORGE.good) * Math.min(3, 1 + Math.floor(s.combo / 5));
  s.score += pts;
  s.hits += 1;
  if (s.hits >= FORGE.strikes) {
    const bonus = FORGE.blade + (s.clean ? FORGE.flawless : 0);
    s.score += bonus;
    s.blades += 1;
    s.fx.push({ text: s.clean ? `Flawless blade! +${pts + bonus}` : `Blade forged! +${pts + bonus}`, good: true, t: 0 });
    s.hits = 0;
    s.clean = true;
  } else s.fx.push({ text: k === "perfect" ? `Perfect! +${pts}` : `+${pts}`, good: true, t: 0 });
  newZone(s);
  return k;
}

export function stepForge(s: ForgeState, dt: number): void {
  if (s.over) return;
  s.time += dt;
  s.left = Math.max(0, FORGE.time - s.time);
  s.since += dt;
  s.pos += s.dir * forgeSpeed(s.time) * dt;
  if (s.pos >= 1) { s.pos = 2 - s.pos; s.dir = -1; }
  if (s.pos <= 0) { s.pos = -s.pos; s.dir = 1; }
  for (const f of s.fx) f.t += dt;
  s.fx = s.fx.filter((f) => f.t < 0.9);
  if (s.left <= 0) s.over = true;
}
