import type { HeroId } from "./heroes";
import { HERO_BY_ID } from "./heroes";

/** One finished run, newest first in save.history (kept short). */
export interface RunRecord {
  date: string;
  chapter: number;
  hero: HeroId;
  won: boolean;
  nights: number;
  kills: number;
  gold: number;
  minutes: number;
  daily?: boolean;
}

export const HISTORY_MAX = 20;

export function pushHistory(list: RunRecord[], r: RunRecord): void {
  list.unshift(r);
  if (list.length > HISTORY_MAX) list.length = HISTORY_MAX;
}

export function sanitizeHistory(raw: unknown): RunRecord[] {
  if (!Array.isArray(raw)) return [];
  const n = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0);
  const out: RunRecord[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const o = v as Partial<RunRecord>;
    if (typeof o.hero !== "string" || !(o.hero in HERO_BY_ID) || typeof o.chapter !== "number") continue;
    out.push({
      date: typeof o.date === "string" ? o.date.slice(0, 10) : "",
      chapter: Math.floor(o.chapter),
      hero: o.hero,
      won: o.won === true,
      nights: Math.floor(n(o.nights, 9999)),
      kills: Math.floor(n(o.kills, 1e7)),
      gold: Math.floor(n(o.gold, 1e7)),
      minutes: n(o.minutes, 1e4),
      ...(o.daily === true ? { daily: true } : {}),
    });
    if (out.length >= HISTORY_MAX) break;
  }
  return out;
}

/** Wins / runs over the stored history. */
export function historySummary(list: RunRecord[]): { runs: number; wins: number; kills: number; bestNights: number } {
  return {
    runs: list.length,
    wins: list.filter((r) => r.won).length,
    kills: list.reduce((a, r) => a + r.kills, 0),
    bestNights: list.reduce((a, r) => Math.max(a, r.nights), 0),
  };
}
