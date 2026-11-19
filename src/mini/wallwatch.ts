import { createRng, next, range, type Rng } from "../core/rng";

/**
 * Wall Watch — a 60-second side game. Goblins prop ladders against the wall and climb; tap a
 * climber to knock it off before it reaches the top. Some ladders carry a friendly builder
 * (a hard hat) — tapping one costs points. Climbers speed up over the round; three goblins over
 * the wall and the watch is lost. Pure, deterministic logic (seeded, fixed step).
 */
export const WATCH_GAME = {
  w: 360,
  h: 640,
  /** Ladder positions along the wall, and the wall's top (where a climber gets over) and foot. */
  ladders: [50, 115, 180, 245, 310] as const,
  top: 250,
  foot: 560,
  time: 60,
  lives: 3,
  /** Climb speed (px/s) at the start and the end of the round. */
  climb0: 70,
  climb1: 150,
  /** Tap radius around a climber. */
  hitR: 34,
  stars: [120, 220, 300] as const,
};

export type ClimberKind = "goblin" | "brute" | "builder";

export interface Climber {
  id: number;
  kind: ClimberKind;
  ladder: number;
  y: number;
  /** Taps left (brutes take two). */
  hp: number;
  /** Seconds since it was knocked off (falling animation); -1 while climbing. */
  fall: number;
  over: boolean;
}

export interface WatchFx {
  x: number;
  y: number;
  text: string;
  good: boolean;
  t: number;
}

export interface WatchState {
  rng: Rng;
  time: number;
  left: number;
  score: number;
  lives: number;
  combo: number;
  bestCombo: number;
  climbers: Climber[];
  fx: WatchFx[];
  nextId: number;
  spawnIn: number;
  over: boolean;
  lost: boolean;
}

export function createWatch(seed: number): WatchState {
  return { rng: createRng(seed), time: 0, left: WATCH_GAME.time, score: 0, lives: WATCH_GAME.lives, combo: 0, bestCombo: 0, climbers: [], fx: [], nextId: 1, spawnIn: 0.8, over: false, lost: false };
}

export function climbSpeed(t: number): number {
  return WATCH_GAME.climb0 + (WATCH_GAME.climb1 - WATCH_GAME.climb0) * Math.min(1, t / WATCH_GAME.time);
}

export function watchStars(score: number): number {
  return WATCH_GAME.stars.filter((t) => score >= t).length;
}

/** Gold for a finished round: a third of the score, plus a one-time bonus for each star tier newly reached. */
export function watchReward(score: number, prevStars: number): { gold: number; stars: number; newStars: number } {
  const stars = watchStars(score);
  const bonus = [0, 60, 120, 200].slice(prevStars + 1, stars + 1).reduce((a, b) => a + b, 0);
  return { gold: Math.round(Math.max(0, score) / 3) + bonus, stars, newStars: Math.max(0, stars - prevStars) };
}

/** Points for knocking a goblin off: more the higher it got, times the combo (every 4 in a row +1×, up to 3×). */
function knockPoints(c: Climber, combo: number): number {
  const height = (WATCH_GAME.foot - c.y) / (WATCH_GAME.foot - WATCH_GAME.top);
  const base = (c.kind === "brute" ? 3 : 1) + (height > 0.7 ? 1 : 0);
  return base * Math.min(3, 1 + Math.floor(combo / 4));
}

/** A tap at (x, y). Returns what it hit. */
export function tap(s: WatchState, x: number, y: number): "goblin" | "builder" | "miss" {
  if (s.over) return "miss";
  let hit: Climber | null = null, best = WATCH_GAME.hitR ** 2;
  for (const c of s.climbers) {
    if (c.fall >= 0 || c.over) continue;
    const d = (WATCH_GAME.ladders[c.ladder]! - x) ** 2 + (c.y - y) ** 2;
    if (d <= best) { best = d; hit = c; }
  }
  if (!hit) return "miss";
  const lx = WATCH_GAME.ladders[hit.ladder]!;
  if (hit.kind === "builder") {
    hit.fall = 0;
    s.score -= 5;
    s.combo = 0;
    s.fx.push({ x: lx, y: hit.y, text: "Oops! −5", good: false, t: 0 });
    return "builder";
  }
  hit.hp -= 1;
  if (hit.hp > 0) {
    s.fx.push({ x: lx, y: hit.y, text: "Bonk!", good: true, t: 0 });
    hit.y += 24; // knocked down a few rungs
    return "goblin";
  }
  s.combo += 1;
  s.bestCombo = Math.max(s.bestCombo, s.combo);
  const pts = knockPoints(hit, s.combo);
  s.score += pts;
  hit.fall = 0;
  s.fx.push({ x: lx, y: hit.y, text: `+${pts}`, good: true, t: 0 });
  return "goblin";
}

function spawn(s: WatchState): void {
  const r = s.rng;
  const busy = new Set(s.climbers.filter((c) => c.fall < 0 && !c.over && c.y > WATCH_GAME.foot - 90).map((c) => c.ladder));
  const free = [0, 1, 2, 3, 4].filter((i) => !busy.has(i));
  if (!free.length) return;
  const ladder = free[Math.floor(next(r) * free.length)]!;
  const roll = next(r);
  const kind: ClimberKind = roll < 0.14 ? "builder" : roll < 0.14 + Math.min(0.2, s.time / 200) ? "brute" : "goblin";
  s.climbers.push({ id: s.nextId++, kind, ladder, y: WATCH_GAME.foot, hp: kind === "brute" ? 2 : 1, fall: -1, over: false });
}

export function stepWatch(s: WatchState, dt: number): void {
  if (s.over) return;
  s.time += dt;
  s.left = Math.max(0, WATCH_GAME.time - s.time);
  const v = climbSpeed(s.time);
  s.spawnIn -= dt;
  if (s.spawnIn <= 0) {
    spawn(s);
    // Climbers come faster as the round goes on.
    s.spawnIn = range(s.rng, 0.7, 1.2) * (1 - 0.45 * Math.min(1, s.time / WATCH_GAME.time));
  }
  for (const c of s.climbers) {
    if (c.fall >= 0) { c.fall += dt; continue; }
    if (c.over) continue;
    c.y -= v * (c.kind === "brute" ? 0.75 : c.kind === "builder" ? 0.9 : 1) * dt;
    if (c.y <= WATCH_GAME.top) {
      c.over = true;
      c.y = WATCH_GAME.top;
      const lx = WATCH_GAME.ladders[c.ladder]!;
      if (c.kind === "builder") {
        s.score += 3;
        s.fx.push({ x: lx, y: c.y, text: "Repaired! +3", good: true, t: 0 });
      } else {
        s.lives -= 1;
        s.combo = 0;
        s.fx.push({ x: lx, y: c.y, text: "Over the wall!", good: false, t: 0 });
        if (s.lives <= 0) { s.lost = true; s.over = true; }
      }
    }
  }
  s.climbers = s.climbers.filter((c) => !(c.fall > 1) && !c.over);
  for (const f of s.fx) f.t += dt;
  s.fx = s.fx.filter((f) => f.t < 0.9);
  if (s.left <= 0) s.over = true;
}
