import { CHAPTERS } from "./chapters";
import { dayNumber } from "./daily";
import { HEROES, type HeroId } from "./heroes";

/**
 * Daily Siege: one Siege Lord challenge per calendar day, picked from the date. The ground is a
 * chapter you have cleared, the defender any hero, and the walls rise with the chapter.
 * First win of the day pays a prize.
 */
export interface DailySiege {
  date: string;
  chapter: number;
  hero: HeroId;
  perm: number;
  name: string;
}

export const DAILY_SIEGE_PRIZE = 250;
const HERO_WALLS: Partial<Record<HeroId, number>> = { ranger: 1, pyro: 2, alchemist: 2 };

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Today's siege, given which chapters are cleared (at least chapter 1). */
export function dailySiegeFor(date: string, cleared: number[]): DailySiege {
  const grounds = CHAPTERS.map((c) => c.id).filter((id) => cleared.includes(id));
  const pool = grounds.length ? grounds : [1];
  const h = hash(`dsiege:${date}`);
  const chapter = pool[h % pool.length]!;
  const hero = HEROES[(h >>> 8) % HEROES.length]!.id;
  // Walls: about 0.6 per chapter, a level lower some days. Heroes whose ability wipes packed pushes
  // (the King's arrow rain, the Pyromancer's nova, the Alchemist's acid) get lower walls (siegesim).
  const wobble = (h >>> 16) % 3 === 0 ? -1 : 0;
  const perm = Math.max(0, Math.min(10, Math.round(chapter * 0.6) + wobble - (HERO_WALLS[hero] ?? 0)));
  const ch = CHAPTERS.find((c) => c.id === chapter)!;
  const who = HEROES.find((x) => x.id === hero)!.name.replace(/^The /, "");
  return { date, chapter, hero, perm, name: `${who} holds ${ch.name}` };
}

/** Whether today's prize is still to win (kept in stats.dsiegeDay as a day number). */
export function dailySiegeOpen(stats: Record<string, number>, date: string): boolean {
  return stats.dsiegeDay !== dayNumber(date);
}

/** Records a win: returns the prize (0 if today's was already taken). */
export function claimDailySiege(stats: Record<string, number>, date: string): number {
  if (!dailySiegeOpen(stats, date)) return 0;
  stats.dsiegeDay = dayNumber(date);
  stats.dsiegeWins = (stats.dsiegeWins ?? 0) + 1;
  return DAILY_SIEGE_PRIZE;
}
