import { createRng, next, range, type Rng } from "../core/rng";

/**
 * Supply Run — a 90-second side game. A supply wagon rolls up the forest road to the camp; steer it
 * between three lanes to dodge rocks, fallen logs and goblin ambushes, and grab coin bags and
 * crates on the way. The road speeds up as you go; three hits and the wagon breaks down.
 * Pure, deterministic logic (seeded, fixed step); supplyView.ts draws it.
 */
export const ROAD = {
  w: 360,
  h: 640,
  lanes: [90, 180, 270] as const,
  wagonY: 540,
  time: 90,
  hp: 3,
  /** Road speed (px/s) at the start and the end of the run. */
  speed0: 220,
  speed1: 430,
  /** Seconds a lane change takes (the wagon slides). */
  shift: 0.14,
  stars: [150, 300, 500] as const,
};

export type ThingKind = "rock" | "log" | "goblin" | "coins" | "crate";

export interface Thing {
  id: number;
  kind: ThingKind;
  lane: number;
  y: number;
  done: boolean;
}

export interface RunFx {
  x: number;
  y: number;
  text: string;
  good: boolean;
  t: number;
}

export interface SupplyState {
  rng: Rng;
  time: number;
  left: number;
  dist: number;
  score: number;
  hp: number;
  lane: number;
  /** Wagon's drawn x (slides toward the lane). */
  x: number;
  things: Thing[];
  fx: RunFx[];
  nextId: number;
  spawnIn: number;
  /** Seconds of invulnerability after a hit (the wagon flashes). */
  hurt: number;
  over: boolean;
  crashed: boolean;
}

export function createRun(seed: number): SupplyState {
  return {
    rng: createRng(seed),
    time: 0,
    left: ROAD.time,
    dist: 0,
    score: 0,
    hp: ROAD.hp,
    lane: 1,
    x: ROAD.lanes[1],
    things: [],
    fx: [],
    nextId: 1,
    spawnIn: 1,
    hurt: 0,
    over: false,
    crashed: false,
  };
}

export function roadSpeed(t: number): number {
  return ROAD.speed0 + (ROAD.speed1 - ROAD.speed0) * Math.min(1, t / ROAD.time);
}

/** Move one lane left (-1) or right (+1). */
export function steer(s: SupplyState, dir: -1 | 1): void {
  if (s.over) return;
  s.lane = Math.max(0, Math.min(2, s.lane + dir));
}

export function supplyStars(score: number): number {
  return ROAD.stars.filter((t) => score >= t).length;
}

/** Gold for a finished run: a quarter of the score, plus a one-time bonus for each star tier newly reached. */
export function supplyReward(score: number, prevStars: number): { gold: number; stars: number; newStars: number } {
  const stars = supplyStars(score);
  const bonus = [0, 60, 120, 200].slice(prevStars + 1, stars + 1).reduce((a, b) => a + b, 0);
  return { gold: Math.round(score / 4) + bonus, stars, newStars: Math.max(0, stars - prevStars) };
}

function spawnRow(s: SupplyState): void {
  const r = s.rng;
  // One or two hazards per row, never all three lanes (there's always a way through), plus a pickup.
  const lanes = [0, 1, 2].sort(() => next(r) - 0.5);
  const hazards = next(r) < 0.2 + Math.min(0.3, s.time / 200) ? 2 : 1;
  for (let i = 0; i < hazards; i++) {
    const roll = next(r);
    const kind: ThingKind = roll < 0.45 ? "rock" : roll < 0.8 ? "log" : "goblin";
    s.things.push({ id: s.nextId++, kind, lane: lanes[i]!, y: -40, done: false });
  }
  if (next(r) < 0.7) s.things.push({ id: s.nextId++, kind: next(r) < 0.8 ? "coins" : "crate", lane: lanes[2]!, y: -40 - range(r, 0, 60), done: false });
}

export function stepRun(s: SupplyState, dt: number): void {
  if (s.over) return;
  s.time += dt;
  s.left = Math.max(0, ROAD.time - s.time);
  const v = roadSpeed(s.time);
  s.dist += v * dt;
  s.hurt = Math.max(0, s.hurt - dt);
  // The wagon slides toward its lane.
  const tx = ROAD.lanes[s.lane]!;
  const k = Math.min(1, dt / ROAD.shift);
  s.x += (tx - s.x) * k;
  s.spawnIn -= dt;
  if (s.spawnIn <= 0) {
    spawnRow(s);
    // Rows come closer together as the road speeds up.
    s.spawnIn = Math.max(0.75, range(s.rng, 1.0, 1.4) * Math.sqrt(ROAD.speed0 / v));
  }
  for (const t of s.things) {
    t.y += v * dt;
    if (t.done) continue;
    // Contact: same lane (by the wagon's drawn position) and overlapping rows.
    const lx = ROAD.lanes[t.lane]!;
    if (Math.abs(t.y - ROAD.wagonY) < 28 && Math.abs(lx - s.x) < 38) {
      t.done = true;
      if (t.kind === "coins" || t.kind === "crate") {
        const pts = t.kind === "coins" ? 5 : 15;
        s.score += pts;
        s.fx.push({ x: lx, y: t.y, text: `+${pts}`, good: true, t: 0 });
      } else if (s.hurt <= 0) {
        s.hp -= 1;
        s.hurt = 1.2;
        s.fx.push({ x: lx, y: t.y, text: t.kind === "goblin" ? "Ambush!" : "Crash!", good: false, t: 0 });
        if (s.hp <= 0) {
          s.crashed = true;
          s.over = true;
        }
      }
    }
  }
  s.things = s.things.filter((t) => t.y < ROAD.h + 60 && !(t.done && (t.kind === "coins" || t.kind === "crate")));
  // Distance counts too: 1 point per 200 px travelled (paid as you go).
  const before = Math.floor((s.dist - v * dt) / 200);
  const now = Math.floor(s.dist / 200);
  s.score += now - before;
  for (const f of s.fx) f.t += dt;
  s.fx = s.fx.filter((f) => f.t < 0.9);
  if (s.left <= 0) s.over = true;
}
