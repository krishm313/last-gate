/**
 * Mason's Tower — a 60-second stacking side game. A stone block slides back and forth above the
 * tower; tap to drop it. Whatever hangs over the edge of the block below breaks off, so the next
 * block is narrower. A near-perfect drop keeps the full width, and a run of them grows it back a
 * little. The round ends when time runs out or a block misses the tower entirely. Pure,
 * deterministic logic (no randomness: the slide speed rises with height).
 */
export const MASON = {
  time: 60,
  /** Tower and block widths in px (the play area is 360 wide). */
  base: 140,
  minWidth: 4,
  /** Slide range for the block's centre, and its speed (px/s) at the start and per level. */
  left: 40,
  right: 320,
  speed0: 120,
  speedPer: 9,
  speedMax: 330,
  /** Within this many px of dead centre counts as perfect (no cut). */
  perfect: 4,
  /** After this many perfect drops in a row, each further perfect grows the block back by `grow` px. */
  streak: 3,
  grow: 10,
  /** Points: per block placed, extra for a perfect, multiplied by the streak (capped). */
  place: 3,
  perfectBonus: 4,
  stars: [60, 130, 220] as const,
};

export interface MasonBlock {
  x: number;
  w: number;
}

export interface MasonFx {
  text: string;
  good: boolean;
  t: number;
}

export interface MasonState {
  time: number;
  left: number;
  score: number;
  /** Placed blocks, bottom first (the first is the base). */
  tower: MasonBlock[];
  /** The sliding block: centre x, width, direction. */
  x: number;
  w: number;
  dir: 1 | -1;
  streak: number;
  bestStreak: number;
  perfects: number;
  /** The last broken-off piece (for the view): its x and width, and seconds since it broke. */
  chip: { x: number; w: number; t: number } | null;
  /** Seconds since the last drop (bounce in the view). */
  since: number;
  fx: MasonFx[];
  over: boolean;
  lost: boolean;
}

export function createMason(): MasonState {
  return {
    time: 0, left: MASON.time, score: 0, tower: [{ x: 180, w: MASON.base }], x: MASON.left, w: MASON.base, dir: 1,
    streak: 0, bestStreak: 0, perfects: 0, chip: null, since: 9, fx: [], over: false, lost: false,
  };
}

export function slideSpeed(levels: number): number {
  return Math.min(MASON.speedMax, MASON.speed0 + MASON.speedPer * levels);
}

export function masonStars(score: number): number {
  return MASON.stars.filter((t) => score >= t).length;
}

/** Gold for a finished round: the score, plus a one-time bonus for each star tier newly reached. */
export function masonReward(score: number, prevStars: number): { gold: number; stars: number; newStars: number } {
  const stars = masonStars(score);
  const bonus = [0, 60, 120, 200].slice(prevStars + 1, stars + 1).reduce((a, b) => a + b, 0);
  return { gold: Math.max(0, score) + bonus, stars, newStars: Math.max(0, stars - prevStars) };
}

/** A tap: drop the block. */
export function drop(s: MasonState): "perfect" | "cut" | "miss" | "ignored" {
  if (s.over) return "ignored";
  const top = s.tower[s.tower.length - 1]!;
  const off = s.x - top.x;
  s.since = 0;
  if (Math.abs(off) >= (s.w + top.w) / 2) {
    s.chip = { x: s.x, w: s.w, t: 0 };
    s.fx.push({ text: "It fell!", good: false, t: 0 });
    s.lost = true;
    s.over = true;
    return "miss";
  }
  let res: "perfect" | "cut";
  let x = s.x, w = s.w;
  if (Math.abs(off) <= MASON.perfect) {
    // Snap onto the block below.
    x = top.x;
    s.streak += 1;
    s.perfects += 1;
    if (s.streak > MASON.streak) w = Math.min(MASON.base, w + MASON.grow);
    s.chip = null;
    res = "perfect";
  } else {
    // Keep only the overlap; the rest breaks off.
    const l = Math.max(s.x - s.w / 2, top.x - top.w / 2), r = Math.min(s.x + s.w / 2, top.x + top.w / 2);
    const cutW = w - (r - l);
    const cutX = off > 0 ? r + cutW / 2 : l - cutW / 2;
    s.chip = { x: cutX, w: cutW, t: 0 };
    x = (l + r) / 2;
    w = r - l;
    s.streak = 0;
    res = "cut";
  }
  s.bestStreak = Math.max(s.bestStreak, s.streak);
  const mult = Math.min(3, 1 + Math.floor(s.streak / 3));
  const pts = (MASON.place + (res === "perfect" ? MASON.perfectBonus : 0)) * mult;
  s.score += pts;
  s.tower.push({ x, w });
  s.fx.push({ text: res === "perfect" ? `Perfect! +${pts}` : `+${pts}`, good: true, t: 0 });
  if (w < MASON.minWidth) {
    s.over = true;
    s.lost = true;
    return res;
  }
  // The next block starts from the side it was heading away from.
  s.w = w;
  s.dir = s.dir === 1 ? -1 : 1;
  s.x = s.dir === 1 ? MASON.left : MASON.right;
  return res;
}

export function stepMason(s: MasonState, dt: number): void {
  if (s.over) return;
  s.time += dt;
  s.left = Math.max(0, MASON.time - s.time);
  s.since += dt;
  if (s.chip) s.chip.t += dt;
  s.x += s.dir * slideSpeed(s.tower.length - 1) * dt;
  if (s.x > MASON.right) { s.x = 2 * MASON.right - s.x; s.dir = -1; }
  if (s.x < MASON.left) { s.x = 2 * MASON.left - s.x; s.dir = 1; }
  for (const f of s.fx) f.t += dt;
  s.fx = s.fx.filter((f) => f.t < 0.9);
  if (s.left <= 0) s.over = true;
}
