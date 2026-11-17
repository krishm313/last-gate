import type { HeroId } from "./heroes";

/** One day's challenge: same for every player on that date (derived from the date string). */
export interface DailyChallenge {
  date: string;
  seed: number;
  chapterId: number;
  hero: HeroId;
  twist: Twist;
  /** Blessing granted at the start. */
  blessing: string;
}

export interface Twist {
  id: string;
  name: string;
  desc: string;
  enemyHp: number;
  drops: number;
  heroDamage: number;
  towerDamage: number;
}

export const TWISTS: Twist[] = [
  { id: "gold-rush", name: "Gold Rush", desc: "Double coins, but enemies are 30% tougher", enemyHp: 1.3, drops: 2, heroDamage: 1, towerDamage: 1 },
  { id: "lone-hero", name: "Lone Hero", desc: "Your hero hits twice as hard; towers deal half damage", enemyHp: 1, drops: 1, heroDamage: 2, towerDamage: 0.5 },
  { id: "engineers", name: "Engineers' Day", desc: "Towers +60% damage; your hero −40%", enemyHp: 1, drops: 1, heroDamage: 0.6, towerDamage: 1.6 },
  { id: "horde", name: "The Horde", desc: "Enemies 20% weaker but you earn 30% less", enemyHp: 0.8, drops: 0.7, heroDamage: 1, towerDamage: 1 },
  { id: "glass", name: "Glass Cannon", desc: "Everything you have hits 50% harder; enemies +50% HP", enemyHp: 1.5, drops: 1.2, heroDamage: 1.5, towerDamage: 1.5 },
];

const HEROES: HeroId[] = ["ranger", "knight", "pyro", "engineer"];
const BLESSINGS = ["sharp", "quick", "drills", "eagle", "split", "fire", "frost", "masons", "tax", "pockets"];

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function todayString(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "5h 12m" until the next local midnight, when a new daily twist arrives. */
export function timeToNextDaily(now = new Date()): string {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const mins = Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 60000));
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`;
}

/** Whole days since 1970-01-01 for a YYYY-MM-DD string (calendar math, timezone-free). */
export function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y!, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

/**
 * Records a first daily clear on `date` in the save's stats and returns the streak length:
 * consecutive days continue it, a missed day restarts it at 1.
 */
export function recordDailyWin(stats: Record<string, number>, date: string): number {
  const today = dayNumber(date);
  const last = stats.dailyLastWin ?? -10;
  const streak = today - last === 1 ? (stats.dailyStreak ?? 0) + 1 : today === last ? stats.dailyStreak ?? 1 : 1;
  stats.dailyStreak = streak;
  stats.dailyLastWin = today;
  stats.dailyBestStreak = Math.max(stats.dailyBestStreak ?? 0, streak);
  return streak;
}

/** Current streak as of `date`: still alive if the last clear was today or yesterday. */
export function liveDailyStreak(stats: Record<string, number>, date: string): number {
  const last = stats.dailyLastWin;
  if (last === undefined) return 0;
  return dayNumber(date) - last <= 1 ? stats.dailyStreak ?? 0 : 0;
}

export function dailyFor(date: string): DailyChallenge {
  const h = hash(`lastgate-${date}`);
  return {
    date,
    seed: h,
    chapterId: 1 + (h % 3),
    hero: HEROES[(h >>> 3) % HEROES.length]!,
    twist: TWISTS[(h >>> 7) % TWISTS.length]!,
    blessing: BLESSINGS[(h >>> 11) % BLESSINGS.length]!,
  };
}

/** Gold bonus for the first daily victory of the day. */
export const DAILY_BONUS = 150;
