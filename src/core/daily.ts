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
  /** Share of spawns that are elites (newer twists). */
  eliteChance?: number;
  /** Forced weather odds for the day's nights. */
  weatherOdds?: { rain: number; fog: number; storm: number };
  /** Wall HP multiplier. */
  wallHp?: number;
  /** Seconds between free tides each night (slows foes and the hero alike). */
  tideEvery?: number;
  /** First date this twist can appear (so days already decided keep their twist). */
  since?: string;
}

export const TWISTS: Twist[] = [
  { id: "gold-rush", name: "Gold Rush", desc: "Double coins, but enemies are 30% tougher", enemyHp: 1.3, drops: 2, heroDamage: 1, towerDamage: 1 },
  { id: "lone-hero", name: "Lone Hero", desc: "Your hero hits twice as hard; towers deal half damage", enemyHp: 1, drops: 1, heroDamage: 2, towerDamage: 0.5 },
  { id: "engineers", name: "Engineers' Day", desc: "Towers +60% damage; your hero −40%", enemyHp: 1, drops: 1, heroDamage: 0.6, towerDamage: 1.6 },
  { id: "horde", name: "The Horde", desc: "Enemies 20% weaker but you earn 30% less", enemyHp: 0.8, drops: 0.7, heroDamage: 1, towerDamage: 1 },
  { id: "elite-rush", name: "Elite Rush", desc: "Elite foes everywhere (15%) — and they pay triple", enemyHp: 1, drops: 1.2, heroDamage: 1, towerDamage: 1, eliteChance: 0.15 },
  { id: "fog-war", name: "Fog of War", desc: "Every night from the 3rd is foggy; towers +20% damage to make up", enemyHp: 1, drops: 1.1, heroDamage: 1, towerDamage: 1.2, weatherOdds: { rain: 0, fog: 1, storm: 0 } },
  { id: "storm-day", name: "Storm Day", desc: "Lightning every night from the 3rd; foes +25% HP", enemyHp: 1.25, drops: 1.1, heroDamage: 1, towerDamage: 1, weatherOdds: { rain: 0, fog: 0, storm: 1 } },
  { id: "iron-walls", name: "Iron Walls", desc: "Walls +60% HP; your hero −25%", enemyHp: 1, drops: 1, heroDamage: 0.75, towerDamage: 1, wallHp: 1.6 },
  { id: "high-tide", name: "High Tide", desc: "The tide rolls in every 12s at night — it slows you and the horde · coins +20%", enemyHp: 1, drops: 1.2, heroDamage: 1, towerDamage: 1, tideEvery: 12, since: "2026-11-21" },
  { id: "last-stand", name: "Last Stand", desc: "Walls −40% HP; your hero +60% damage · coins +20%", enemyHp: 1, drops: 1.2, heroDamage: 1.6, towerDamage: 1, wallHp: 0.6, since: "2026-11-21" },
  { id: "glass", name: "Glass Cannon", desc: "Everything you have hits 50% harder; enemies +50% HP", enemyHp: 1.5, drops: 1.2, heroDamage: 1.5, towerDamage: 1.5 },
];

const HEROES: HeroId[] = ["ranger", "knight", "pyro", "engineer"];
/** The newer heroes join the daily hero pool from this date (earlier days keep their hero). */
const HEROES_EXPANDED_FROM = "2026-11-21";
const NEW_HEROES: HeroId[] = ["warden", "lancer"];
const BLESSINGS = ["sharp", "quick", "drills", "eagle", "split", "fire", "frost", "masons", "tax", "pockets", "hunter", "vigor"];

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

/** The newer twists and blessings join the rotation from this date (so days already played keep theirs). */
const EXPANDED_FROM = "2026-11-20";
const ORIGINAL_TWISTS = ["gold-rush", "lone-hero", "engineers", "horde", "glass"];

function heroPool(date: string): HeroId[] {
  return date >= HEROES_EXPANDED_FROM ? [...HEROES, ...NEW_HEROES] : HEROES;
}

export function dailyFor(date: string): DailyChallenge {
  const h = hash(`lastgate-${date}`);
  const expanded = date >= EXPANDED_FROM;
  const twists = expanded ? TWISTS.filter((t) => !t.since || date >= t.since) : TWISTS.filter((t) => ORIGINAL_TWISTS.includes(t.id));
  const blessings = expanded ? BLESSINGS : BLESSINGS.slice(0, 10);
  return {
    date,
    seed: h,
    chapterId: 1 + (h % 3),
    hero: heroPool(date)[(h >>> 3) % heroPool(date).length]!,
    twist: twists[(h >>> 7) % twists.length]!,
    blessing: blessings[(h >>> 11) % blessings.length]!,
  };
}

/** Gold bonus for the first daily victory of the day. */
export const DAILY_BONUS = 150;
