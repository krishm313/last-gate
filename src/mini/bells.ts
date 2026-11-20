import { createRng, next, type Rng } from "../core/rng";

/**
 * Bell Tower — a 90-second memory side game. Four bells ring a tune; ring it back in the same order.
 * Every tune you get right adds one more note and plays a little faster. A wrong bell costs a crack
 * in the tower (three and the round is over) and the tune plays again. Pure, deterministic logic.
 */
export const BELLS = {
  n: 4,
  time: 90,
  start: 3,
  cracks: 3,
  /** Seconds each note glows while the tune plays, and the gap between notes (shrink per round). */
  on: 0.6,
  gap: 0.18,
  speedup: 0.93,
  minOn: 0.28,
  /** Pause before a tune plays. */
  lead: 0.7,
  /** Points per note of a tune rung back right. */
  perNote: 5,
  stars: [110, 230, 350] as const,
};

export interface BellFx {
  text: string;
  good: boolean;
  t: number;
}

export interface BellState {
  rng: Rng;
  time: number;
  left: number;
  score: number;
  tune: number[];
  /** "show": the tune is playing (taps ignored); "play": the player rings it back. */
  phase: "show" | "play";
  /** Seconds into the current show (including the lead-in). */
  showT: number;
  /** Next note the player must ring. */
  at: number;
  rounds: number;
  cracks: number;
  /** Per bell: seconds since it last rang (for the glow/swing). */
  rang: number[];
  /** Last wrong bell, for a red flash. */
  wrong: { bell: number; t: number } | null;
  fx: BellFx[];
  over: boolean;
  lost: boolean;
}

export function noteTimes(rounds: number): { on: number; gap: number } {
  const k = Math.pow(BELLS.speedup, rounds);
  return { on: Math.max(BELLS.minOn, BELLS.on * k), gap: Math.max(0.1, BELLS.gap * k) };
}

export function createBells(seed: number): BellState {
  const rng = createRng(seed);
  const tune: number[] = [];
  for (let i = 0; i < BELLS.start; i++) tune.push(Math.floor(next(rng) * BELLS.n));
  return { rng, time: 0, left: BELLS.time, score: 0, tune, phase: "show", showT: 0, at: 0, rounds: 0, cracks: 0, rang: [9, 9, 9, 9], wrong: null, fx: [], over: false, lost: false };
}

/** Which bell (if any) is sounding in the tune right now. */
export function showingBell(s: BellState): number {
  if (s.phase !== "show") return -1;
  const { on, gap } = noteTimes(s.rounds);
  const t = s.showT - BELLS.lead;
  if (t < 0) return -1;
  const i = Math.floor(t / (on + gap));
  if (i >= s.tune.length || t - i * (on + gap) > on) return -1;
  return s.tune[i]!;
}

function showLength(s: BellState): number {
  const { on, gap } = noteTimes(s.rounds);
  return BELLS.lead + s.tune.length * (on + gap);
}

export function bellsStars(score: number): number {
  return BELLS.stars.filter((t) => score >= t).length;
}

/** Gold for a finished round: half the score, plus a one-time bonus for each star tier newly reached. */
export function bellsReward(score: number, prevStars: number): { gold: number; stars: number; newStars: number } {
  const stars = bellsStars(score);
  const bonus = [0, 60, 120, 200].slice(prevStars + 1, stars + 1).reduce((a, b) => a + b, 0);
  return { gold: Math.round(Math.max(0, score) / 2) + bonus, stars, newStars: Math.max(0, stars - prevStars) };
}

/** The player rings bell `b`. */
export function ring(s: BellState, b: number): "right" | "done" | "wrong" | "ignored" {
  if (s.over || s.phase !== "play" || b < 0 || b >= BELLS.n) return "ignored";
  s.rang[b] = 0;
  if (s.tune[s.at] !== b) {
    s.cracks += 1;
    s.wrong = { bell: b, t: 0 };
    s.fx.push({ text: s.cracks >= BELLS.cracks ? "The tower cracks!" : "Wrong bell!", good: false, t: 0 });
    if (s.cracks >= BELLS.cracks) { s.lost = true; s.over = true; return "wrong"; }
    s.phase = "show";
    s.showT = 0;
    s.at = 0;
    return "wrong";
  }
  s.at += 1;
  if (s.at < s.tune.length) return "right";
  const pts = s.tune.length * BELLS.perNote;
  s.score += pts;
  s.rounds += 1;
  s.fx.push({ text: `${s.tune.length} notes! +${pts}`, good: true, t: 0 });
  s.tune.push(Math.floor(next(s.rng) * BELLS.n));
  s.phase = "show";
  s.showT = 0;
  s.at = 0;
  return "done";
}

export function stepBells(s: BellState, dt: number): void {
  if (s.over) return;
  s.time += dt;
  s.left = Math.max(0, BELLS.time - s.time);
  for (let i = 0; i < s.rang.length; i++) s.rang[i]! += dt;
  if (s.wrong) { s.wrong.t += dt; if (s.wrong.t > 0.6) s.wrong = null; }
  if (s.phase === "show") {
    const was = showingBell(s);
    s.showT += dt;
    const now = showingBell(s);
    // A gap separates notes, so a repeated bell rings again for its next note.
    if (now >= 0 && now !== was) s.rang[now] = 0;
    if (s.showT >= showLength(s)) s.phase = "play";
  }
  for (const f of s.fx) f.t += dt;
  s.fx = s.fx.filter((f) => f.t < 1.1);
  if (s.left <= 0) s.over = true;
}
