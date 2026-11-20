import { dayNumber } from "./daily";

/**
 * The Royal Gift — a chest on the Battle tab that opens once per calendar day. Coming back on
 * consecutive days walks a 7-day ladder (day 7 is the big one, then it starts over); missing a day
 * restarts it at day 1. Kept in the save's generic stats: giftDay (day number of the last claim),
 * giftStreak, giftBest and gifts (lifetime opens).
 */
export const GIFT_GOLD = [60, 80, 100, 130, 160, 200, 350] as const;

export interface GiftView {
  /** Today's chest is still closed. */
  ready: boolean;
  /** Ladder day 1..7 for today's chest (the one just opened, if already claimed). */
  day: number;
  /** Gold today's chest holds. */
  gold: number;
  /** Consecutive days including today's claim (or the claim it would make). */
  streak: number;
}

function streakToday(stats: Record<string, number>, today: number): number {
  const last = stats.giftDay;
  if (last === undefined) return 1;
  if (last === today) return Math.max(1, stats.giftStreak ?? 1);
  return today - last === 1 ? (stats.giftStreak ?? 0) + 1 : 1;
}

export function giftView(stats: Record<string, number>, date: string): GiftView {
  const today = dayNumber(date);
  const streak = streakToday(stats, today);
  const day = ((streak - 1) % GIFT_GOLD.length) + 1;
  return { ready: stats.giftDay !== today, day, gold: GIFT_GOLD[day - 1]!, streak };
}

/** Opens today's chest: returns the gold (0 if it was already opened today). */
export function claimGift(stats: Record<string, number>, date: string): number {
  const v = giftView(stats, date);
  if (!v.ready) return 0;
  stats.giftDay = dayNumber(date);
  stats.giftStreak = v.streak;
  stats.giftBest = Math.max(stats.giftBest ?? 0, v.streak);
  stats.gifts = (stats.gifts ?? 0) + 1;
  return v.gold;
}
