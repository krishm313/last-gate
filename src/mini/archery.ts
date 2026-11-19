import { createRng, next, range, type Rng } from "../core/rng";

/**
 * Archery Range — a 60-second side game. The King stands at the bottom; straw targets slide across
 * the range at different heights and War Ravens dive in later. Drag back from the bow and let go to
 * loose an arrow (slingshot aim). Pure, deterministic logic (seeded, fixed step) — the view in
 * archeryView.ts only reads this state and feeds input in.
 */
export const RANGE = {
  w: 360,
  h: 640,
  /** The bow (arrows start here). */
  bowX: 180,
  bowY: 560,
  time: 60,
  gravity: 220,
  /** Arrow speed at a full draw, and the drag distance that counts as full. */
  maxSpeed: 920,
  fullDraw: 150,
  /** Seconds between shots. */
  reload: 0.35,
  /** Star thresholds (score). */
  stars: [30, 60, 100] as const,
};

export interface Target {
  id: number;
  kind: "board" | "dummy" | "raven";
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Hit radius; boards have a bullseye of `r * 0.35`. */
  r: number;
  /** Seconds left before it leaves (ravens fly off). */
  life: number;
  hit: boolean;
}

export interface Arrow {
  x: number;
  y: number;
  vx: number;
  vy: number;
  live: boolean;
}

export interface HitFx {
  x: number;
  y: number;
  points: number;
  bull: boolean;
  t: number;
}

export interface RangeState {
  rng: Rng;
  time: number;
  left: number;
  score: number;
  combo: number;
  bestCombo: number;
  shots: number;
  hits: number;
  targets: Target[];
  arrows: Arrow[];
  fx: HitFx[];
  reload: number;
  nextId: number;
  spawnTimer: number;
  ravenTimer: number;
  over: boolean;
}

export function createRange(seed: number): RangeState {
  return {
    rng: createRng(seed),
    time: 0,
    left: RANGE.time,
    score: 0,
    combo: 0,
    bestCombo: 0,
    shots: 0,
    hits: 0,
    targets: [],
    arrows: [],
    fx: [],
    reload: 0,
    nextId: 1,
    spawnTimer: 0,
    ravenTimer: 18,
    over: false,
  };
}

/** Points for a hit: bullseye 3, board ring or dummy 1, raven 5 — times the combo bonus. */
export function hitPoints(kind: Target["kind"], bull: boolean, combo: number): number {
  const base = kind === "raven" ? 5 : bull ? 3 : 1;
  return base * comboMult(combo);
}
/** Every 3 hits in a row adds +1× (capped at 3×). */
export function comboMult(combo: number): number {
  return Math.min(3, 1 + Math.floor(combo / 3));
}

export function starsFor(score: number): number {
  return RANGE.stars.filter((t) => score >= t).length;
}

/**
 * Loose an arrow, aimed by a drag from the bow: the arrow flies opposite the drag (pull down and
 * back to shoot up and forward), with power from the drag length. Returns false while reloading.
 */
export function shoot(s: RangeState, dragX: number, dragY: number): boolean {
  if (s.over || s.reload > 0) return false;
  const len = Math.hypot(dragX, dragY);
  if (len < 12) return false;
  const power = Math.min(1, len / RANGE.fullDraw);
  const speed = RANGE.maxSpeed * (0.45 + 0.55 * power);
  s.arrows.push({ x: RANGE.bowX, y: RANGE.bowY, vx: (-dragX / len) * speed, vy: (-dragY / len) * speed, live: true });
  s.shots += 1;
  s.reload = RANGE.reload;
  return true;
}

function spawnTarget(s: RangeState): void {
  const r = s.rng;
  // Lanes higher up are harder (farther and smaller); later in the round targets move faster.
  const lane = Math.floor(range(r, 0, 4));
  const y = 120 + lane * 85;
  const fromLeft = next(r) < 0.5;
  const pace = 1 + (s.time / RANGE.time) * 0.8;
  const dummy = next(r) < 0.3;
  const radius = dummy ? 22 : 30 - lane * 3;
  const speed = range(r, 50, 95) * pace * (dummy ? 0.7 : 1);
  s.targets.push({ id: s.nextId++, kind: dummy ? "dummy" : "board", x: fromLeft ? -40 : RANGE.w + 40, y, vx: fromLeft ? speed : -speed, vy: 0, r: radius, life: 30, hit: false });
}

function spawnRaven(s: RangeState): void {
  const r = s.rng;
  const fromLeft = next(r) < 0.5;
  s.targets.push({ id: s.nextId++, kind: "raven", x: fromLeft ? -30 : RANGE.w + 30, y: range(r, 90, 200), vx: fromLeft ? 150 : -150, vy: 40, r: 18, life: 4, hit: false });
}

/** Advance the range by `dt` seconds. */
export function stepRange(s: RangeState, dt: number): void {
  if (s.over) return;
  s.time += dt;
  s.left = Math.max(0, RANGE.time - s.time);
  s.reload = Math.max(0, s.reload - dt);
  // Keep 3–4 targets on the range; ravens from 18 s, every ~7 s.
  s.spawnTimer -= dt;
  const live = s.targets.filter((t) => !t.hit && t.kind !== "raven").length;
  if (s.spawnTimer <= 0 && live < 4) {
    spawnTarget(s);
    s.spawnTimer = range(s.rng, 0.6, 1.4);
  }
  s.ravenTimer -= dt;
  if (s.ravenTimer <= 0) {
    spawnRaven(s);
    s.ravenTimer = range(s.rng, 5, 8);
  }
  for (const t of s.targets) {
    t.x += t.vx * dt;
    t.y += t.vy * dt;
    if (t.kind === "raven") t.vy = Math.sin(s.time * 4 + t.id) * 60;
    t.life -= dt;
  }
  s.targets = s.targets.filter((t) => !t.hit && t.life > 0 && t.x > -80 && t.x < RANGE.w + 80);
  for (const a of s.arrows) {
    if (!a.live) continue;
    const x0 = a.x, y0 = a.y;
    a.vy += RANGE.gravity * dt;
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    for (const t of s.targets) {
      if (t.hit) continue;
      // Closest approach along this frame's flight (a fast arrow crosses a target between frames).
      const sx = a.x - x0, sy = a.y - y0;
      const k = Math.max(0, Math.min(1, ((t.x - x0) * sx + (t.y - y0) * sy) / (sx * sx + sy * sy || 1)));
      const d = Math.hypot(x0 + sx * k - t.x, y0 + sy * k - t.y);
      if (d > t.r) continue;
      // The bullseye is judged by how close the arrow's line passes to the centre, not where it
      // first touches the board's rim.
      const sl = Math.hypot(sx, sy) || 1;
      const miss = Math.abs((t.x - x0) * sy - (t.y - y0) * sx) / sl;
      const bull = t.kind === "board" && miss <= t.r * 0.35;
      s.combo += 1;
      s.bestCombo = Math.max(s.bestCombo, s.combo);
      const pts = hitPoints(t.kind, bull, s.combo);
      s.score += pts;
      s.hits += 1;
      t.hit = true;
      a.live = false;
      s.fx.push({ x: t.x, y: t.y, points: pts, bull, t: 0 });
      break;
    }
    // A miss: off the top or sides of the range breaks the combo.
    if (a.live && (a.y < -20 || a.x < -20 || a.x > RANGE.w + 20 || a.y > RANGE.h + 20)) {
      a.live = false;
      s.combo = 0;
    }
  }
  s.arrows = s.arrows.filter((a) => a.live);
  for (const f of s.fx) f.t += dt;
  s.fx = s.fx.filter((f) => f.t < 0.9);
  if (s.left <= 0) s.over = true;
}

/** Gold paid for a finished round: the score, plus a one-time bonus for each star tier newly reached. */
export function rangeReward(score: number, prevStars: number): { gold: number; stars: number; newStars: number } {
  const stars = starsFor(score);
  const newStars = Math.max(0, stars - prevStars);
  const bonus = [0, 60, 120, 200].slice(prevStars + 1, stars + 1).reduce((a, b) => a + b, 0);
  return { gold: score + bonus, stars, newStars };
}
