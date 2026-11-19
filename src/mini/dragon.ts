import { createRng, next, range, type Rng } from "../core/rng";

/**
 * Dragon Dodge — a 60-second side game. A dragon circles over the courtyard and marks spots on the
 * ground; a moment later fire lands there. Drag the King around to stay out of the marked circles
 * (and, later, the long breath lines) while grabbing the coins that spill out. Three burns and the
 * round is over. Pure, deterministic logic (seeded, fixed step).
 */
export const DRAGON = {
  w: 360,
  h: 640,
  /** The courtyard the King can move in. */
  x0: 24,
  x1: 336,
  y0: 120,
  y1: 600,
  time: 60,
  lives: 3,
  /** King's run speed (px/s) toward the finger, and his body radius. */
  speed: 250,
  kingR: 14,
  /** Seconds a mark glows before the fire lands, at the start and the end of the round. */
  fuse0: 1.3,
  fuse1: 0.85,
  /** Seconds of safety after a burn. */
  hurt: 1.2,
  coin: 3,
  stars: [60, 100, 150] as const,
};

export interface Blast {
  id: number;
  /** "spot": a circle; "line": a horizontal band across the courtyard (breath). */
  kind: "spot" | "line";
  x: number;
  y: number;
  r: number;
  fuse: number;
  /** Seconds since it was marked; it fires at `fuse`, then burns out shortly after. */
  t: number;
  fired: boolean;
}

export interface Coin {
  id: number;
  x: number;
  y: number;
  t: number;
}

export interface DragonFx {
  x: number;
  y: number;
  text: string;
  good: boolean;
  t: number;
}

export interface DragonState {
  rng: Rng;
  time: number;
  left: number;
  score: number;
  lives: number;
  x: number;
  y: number;
  /** Where the King is heading (the finger). */
  tx: number;
  ty: number;
  hurt: number;
  blasts: Blast[];
  coins: Coin[];
  fx: DragonFx[];
  nextId: number;
  blastIn: number;
  lineIn: number;
  coinIn: number;
  /** Whole seconds survived (paid +1 each). */
  paid: number;
  over: boolean;
  lost: boolean;
}

export function createDragon(seed: number): DragonState {
  const cx = (DRAGON.x0 + DRAGON.x1) / 2, cy = DRAGON.y1 - 80;
  return { rng: createRng(seed), time: 0, left: DRAGON.time, score: 0, lives: DRAGON.lives, x: cx, y: cy, tx: cx, ty: cy, hurt: 0, blasts: [], coins: [], fx: [], nextId: 1, blastIn: 1.2, lineIn: 20, coinIn: 0.5, paid: 0, over: false, lost: false };
}

export function fuseAt(t: number): number {
  return DRAGON.fuse0 + (DRAGON.fuse1 - DRAGON.fuse0) * Math.min(1, t / DRAGON.time);
}

export function dragonStars(score: number): number {
  return DRAGON.stars.filter((t) => score >= t).length;
}

/** Gold for a finished round: the score, plus a one-time bonus for each star tier newly reached. */
export function dragonReward(score: number, prevStars: number): { gold: number; stars: number; newStars: number } {
  const stars = dragonStars(score);
  const bonus = [0, 60, 120, 200].slice(prevStars + 1, stars + 1).reduce((a, b) => a + b, 0);
  return { gold: Math.max(0, score) + bonus, stars, newStars: Math.max(0, stars - prevStars) };
}

/** Point the King at (x, y) — he runs there (clamped to the courtyard). */
export function steerTo(s: DragonState, x: number, y: number): void {
  s.tx = Math.max(DRAGON.x0, Math.min(DRAGON.x1, x));
  s.ty = Math.max(DRAGON.y0, Math.min(DRAGON.y1, y));
}

/** Is (x, y) inside this blast's fire? */
export function inBlast(b: Blast, x: number, y: number, pad = 0): boolean {
  if (b.kind === "line") return Math.abs(y - b.y) < b.r + pad;
  return (x - b.x) ** 2 + (y - b.y) ** 2 < (b.r + pad) ** 2;
}

function markSpots(s: DragonState): void {
  const r = s.rng;
  // Usually one mark near the King (so standing still is never safe), sometimes a second anywhere.
  const n = next(r) < 0.25 + Math.min(0.35, s.time / 120) ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const near = i === 0;
    const x = near ? s.x + range(r, -50, 50) : range(r, DRAGON.x0 + 30, DRAGON.x1 - 30);
    const y = near ? s.y + range(r, -50, 50) : range(r, DRAGON.y0 + 30, DRAGON.y1 - 30);
    s.blasts.push({ id: s.nextId++, kind: "spot", x: Math.max(DRAGON.x0, Math.min(DRAGON.x1, x)), y: Math.max(DRAGON.y0, Math.min(DRAGON.y1, y)), r: range(r, 44, 60), fuse: fuseAt(s.time), t: 0, fired: false });
  }
}

export function stepDragon(s: DragonState, dt: number): void {
  if (s.over) return;
  s.time += dt;
  s.left = Math.max(0, DRAGON.time - s.time);
  s.hurt = Math.max(0, s.hurt - dt);
  // Run toward the finger.
  const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy);
  const step = DRAGON.speed * dt;
  if (d <= step) { s.x = s.tx; s.y = s.ty; } else { s.x += (dx / d) * step; s.y += (dy / d) * step; }
  // The dragon marks the ground.
  s.blastIn -= dt;
  if (s.blastIn <= 0) {
    markSpots(s);
    s.blastIn = range(s.rng, 0.9, 1.4) * (1 - 0.35 * Math.min(1, s.time / DRAGON.time));
  }
  // From 20 s: breath lines sweep a whole row.
  s.lineIn -= dt;
  if (s.lineIn <= 0) {
    const y = s.y + range(s.rng, -30, 30);
    s.blasts.push({ id: s.nextId++, kind: "line", x: (DRAGON.x0 + DRAGON.x1) / 2, y: Math.max(DRAGON.y0 + 20, Math.min(DRAGON.y1 - 20, y)), r: 26, fuse: fuseAt(s.time) + 0.3, t: 0, fired: false });
    s.lineIn = range(s.rng, 5, 8);
  }
  for (const b of s.blasts) {
    b.t += dt;
    if (!b.fired && b.t >= b.fuse) {
      b.fired = true;
      // The fire scorches any coin it lands on.
      s.coins = s.coins.filter((c) => !inBlast(b, c.x, c.y));
      if (s.hurt <= 0 && inBlast(b, s.x, s.y, DRAGON.kingR * 0.6)) {
        s.lives -= 1;
        s.hurt = DRAGON.hurt;
        s.fx.push({ x: s.x, y: s.y, text: "Burned!", good: false, t: 0 });
        if (s.lives <= 0) { s.lost = true; s.over = true; }
      }
    }
  }
  s.blasts = s.blasts.filter((b) => b.t < b.fuse + 0.45);
  // Coins spill into the courtyard; walk over them to grab.
  s.coinIn -= dt;
  if (s.coinIn <= 0 && s.coins.length < 5) {
    s.coins.push({ id: s.nextId++, x: range(s.rng, DRAGON.x0 + 20, DRAGON.x1 - 20), y: range(s.rng, DRAGON.y0 + 20, DRAGON.y1 - 20), t: 0 });
    s.coinIn = range(s.rng, 0.8, 1.6);
  }
  for (const c of s.coins) c.t += dt;
  s.coins = s.coins.filter((c) => {
    if ((c.x - s.x) ** 2 + (c.y - s.y) ** 2 < (DRAGON.kingR + 12) ** 2) {
      s.score += DRAGON.coin;
      s.fx.push({ x: c.x, y: c.y, text: `+${DRAGON.coin}`, good: true, t: 0 });
      return false;
    }
    return c.t < 9;
  });
  // Surviving pays a point a second.
  const secs = Math.floor(s.time);
  if (secs > s.paid) { s.score += secs - s.paid; s.paid = secs; }
  for (const f of s.fx) f.t += dt;
  s.fx = s.fx.filter((f) => f.t < 0.9);
  if (s.left <= 0) s.over = true;
}
