import { isCampaignChapter } from "./chapters";
import { TWISTS, type Twist } from "./daily";
import { HEATS } from "./heat";
import { weekNumber } from "./quests";

/** The Weekly Gauntlet: one fixed run for the whole week (same seed every attempt, so it can be learned). */
export interface Gauntlet {
  week: number;
  seed: number;
  chapterId: number;
  twist: Twist;
  /** Three Heat modifiers forced on. */
  heats: string[];
}

export const WEEKLY = { win: 500, perHeat: 150, night: 15 };

/** Saved per week: best result (stars on a win, else nights held) and whether it was won. */
export interface WeeklyRecord {
  week: number;
  best: number;
  stars: number;
  won: boolean;
}

function mix(n: number): number {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** This week's gauntlet, fought on one of the chapters the player has cleared (late ones preferred). */
export function weeklyFor(date: string, cleared: number[]): Gauntlet {
  const week = weekNumber(date);
  const h = mix(week * 7919 + 17);
  const pool = cleared.filter((id) => id >= 3 && isCampaignChapter(id));
  const chapters = pool.length ? pool : cleared.length ? cleared : [1];
  const chapterId = chapters[h % chapters.length]!;
  const twists = TWISTS.filter((t) => !t.since || t.since <= date);
  const twist = twists[mix(h + 1) % twists.length]!;
  const ids = HEATS.map((x) => x.id);
  const heats: string[] = [];
  for (let i = 2; heats.length < 3; i++) {
    const id = ids[mix(h + i) % ids.length]!;
    if (!heats.includes(id)) heats.push(id);
  }
  return { week, seed: mix(h + 99) || 1, chapterId, twist, heats };
}

/** Gold a gauntlet run pays: loot and nights, plus the first win of the week's prize. */
export function weeklyReward(loot: number, nights: number, won: boolean, firstWin: boolean, heats: number): { gold: number; prize: number } {
  const prize = won && firstWin ? WEEKLY.win + WEEKLY.perHeat * heats : 0;
  return { gold: loot + nights * WEEKLY.night + prize, prize };
}

/** Record a run into this week's record (a new week starts fresh). */
export function recordWeekly(rec: WeeklyRecord | undefined, week: number, nights: number, won: boolean, stars: number): WeeklyRecord {
  const r = rec && rec.week === week ? { ...rec } : { week, best: 0, stars: 0, won: false };
  r.best = Math.max(r.best, nights);
  if (won) {
    r.won = true;
    r.stars = Math.max(r.stars, stars);
  }
  return r;
}
