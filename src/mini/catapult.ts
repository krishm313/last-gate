import { createRng, next, range, type Rng } from "../core/rng";

/**
 * Catapult Toss — a 60-second side game. Siege towers and battering rams roll down the field
 * toward the castle wall. Tap a spot to lob a stone there: it takes a moment to land (longer the
 * farther it goes), so lead the moving targets. Stones splash; towers take three hits. Three
 * engines at the wall and the round is lost. Pure, deterministic logic (seeded, fixed step).
 */
export const CAT = {
  w: 360,
  h: 640,
  /** The catapult (stones start here) and the wall line the engines must not reach. */
  catX: 180,
  catY: 590,
  wallY: 515,
  /** The field's top (engines enter here) and the highest a stone can be aimed. */
  fieldTop: 90,
  time: 60,
  lives: 3,
  reload: 0.8,
  /** Flight time: a base plus a little per pixel of distance. */
  flight0: 0.45,
  flightPx: 0.0011,
  /** Landing splash radius (plus the target's own radius). */
  splash: 30,
  stars: [100, 200, 300] as const,
};

export type EngineKind = "tower" | "ram";

export interface Engine {
  id: number;
  kind: EngineKind;
  x: number;
  y: number;
  vy: number;
  hp: number;
  maxHp: number;
  r: number;
  /** Seconds since destroyed (crumble animation); -1 while rolling. */
  dead: number;
}

export interface Stone {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
}

export interface CatFx {
  x: number;
  y: number;
  text: string;
  good: boolean;
  t: number;
}

export interface CatState {
  rng: Rng;
  time: number;
  left: number;
  score: number;
  lives: number;
  combo: number;
  bestCombo: number;
  reload: number;
  engines: Engine[];
  stones: Stone[];
  /** Landing marks (for dust puffs in the view): position and age. */
  impacts: { x: number; y: number; t: number }[];
  fx: CatFx[];
  nextId: number;
  spawnIn: number;
  over: boolean;
  lost: boolean;
}

export function createCatapult(seed: number): CatState {
  return { rng: createRng(seed), time: 0, left: CAT.time, score: 0, lives: CAT.lives, combo: 0, bestCombo: 0, reload: 0, engines: [], stones: [], impacts: [], fx: [], nextId: 1, spawnIn: 0.6, over: false, lost: false };
}

export function flightTime(tx: number, ty: number): number {
  return CAT.flight0 + Math.hypot(tx - CAT.catX, ty - CAT.catY) * CAT.flightPx;
}

export function catStars(score: number): number {
  return CAT.stars.filter((t) => score >= t).length;
}

/** Gold for a finished round: a third of the score, plus a one-time bonus for each star tier newly reached. */
export function catReward(score: number, prevStars: number): { gold: number; stars: number; newStars: number } {
  const stars = catStars(score);
  const bonus = [0, 60, 120, 200].slice(prevStars + 1, stars + 1).reduce((a, b) => a + b, 0);
  return { gold: Math.round(Math.max(0, score) / 3) + bonus, stars, newStars: Math.max(0, stars - prevStars) };
}

/** Lob a stone at (x, y). Returns false while reloading (or aimed off the field). */
export function lob(s: CatState, x: number, y: number): boolean {
  if (s.over || s.reload > 0) return false;
  const tx = Math.max(10, Math.min(CAT.w - 10, x));
  const ty = Math.max(CAT.fieldTop, Math.min(CAT.wallY - 10, y));
  s.stones.push({ sx: CAT.catX, sy: CAT.catY, tx, ty, t: 0, dur: flightTime(tx, ty) });
  s.reload = CAT.reload;
  return true;
}

function spawn(s: CatState): void {
  const r = s.rng;
  const pace = 1 + 0.6 * Math.min(1, s.time / CAT.time);
  const tower = next(r) < 0.4;
  const e: Engine = tower
    ? { id: s.nextId++, kind: "tower", x: range(r, 50, CAT.w - 50), y: CAT.fieldTop - 40, vy: range(r, 22, 30) * pace, hp: 3, maxHp: 3, r: 24, dead: -1 }
    : { id: s.nextId++, kind: "ram", x: range(r, 40, CAT.w - 40), y: CAT.fieldTop - 30, vy: range(r, 40, 52) * pace, hp: 1, maxHp: 1, r: 16, dead: -1 };
  s.engines.push(e);
}

export function stepCatapult(s: CatState, dt: number): void {
  if (s.over) return;
  s.time += dt;
  s.left = Math.max(0, CAT.time - s.time);
  s.reload = Math.max(0, s.reload - dt);
  s.spawnIn -= dt;
  if (s.spawnIn <= 0) {
    spawn(s);
    s.spawnIn = range(s.rng, 1.5, 2.3) * (1 - 0.4 * Math.min(1, s.time / CAT.time));
  }
  for (const e of s.engines) {
    if (e.dead >= 0) { e.dead += dt; continue; }
    e.y += e.vy * dt;
    if (e.y >= CAT.wallY - e.r * 0.5) {
      // Reached the wall: it batters in and is gone.
      e.dead = 0;
      e.hp = 0;
      s.lives -= 1;
      s.combo = 0;
      s.fx.push({ x: e.x, y: e.y, text: "At the wall!", good: false, t: 0 });
      if (s.lives <= 0) { s.lost = true; s.over = true; }
    }
  }
  for (const st of s.stones) {
    st.t += dt;
    if (st.t < st.dur) continue;
    // Landed: splash every engine in reach.
    s.impacts.push({ x: st.tx, y: st.ty, t: 0 });
    let hits = 0;
    for (const e of s.engines) {
      if (e.dead >= 0) continue;
      if ((e.x - st.tx) ** 2 + (e.y - st.ty) ** 2 > (CAT.splash + e.r) ** 2) continue;
      hits += 1;
      e.hp -= 1;
      if (e.hp <= 0) {
        e.dead = 0;
        const mult = Math.min(3, 1 + Math.floor(s.combo / 3));
        const pts = (e.kind === "tower" ? 5 : 2) * mult;
        s.score += pts;
        s.fx.push({ x: e.x, y: e.y, text: `+${pts}`, good: true, t: 0 });
      } else {
        s.score += 1;
        s.fx.push({ x: e.x, y: e.y, text: "Crack!", good: true, t: 0 });
      }
    }
    if (hits) {
      s.combo += 1;
      s.bestCombo = Math.max(s.bestCombo, s.combo);
    } else s.combo = 0;
  }
  s.stones = s.stones.filter((st) => st.t < st.dur);
  s.engines = s.engines.filter((e) => !(e.dead > 0.8));
  for (const im of s.impacts) im.t += dt;
  s.impacts = s.impacts.filter((im) => im.t < 0.6);
  for (const f of s.fx) f.t += dt;
  s.fx = s.fx.filter((f) => f.t < 0.9);
  if (s.left <= 0) s.over = true;
}
