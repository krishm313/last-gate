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

/** This week's runs (Monday–Sunday) from the stored history. */
export function weekSummary(list: RunRecord[], today: string, weekOf: (date: string) => number): { runs: number; wins: number; nights: number; bestEndless: number } {
  const w = weekOf(today);
  const mine = list.filter((r) => r.date && weekOf(r.date) === w);
  return {
    runs: mine.length,
    wins: mine.filter((r) => r.won).length,
    nights: mine.reduce((a, r) => a + r.nights, 0),
    bestEndless: mine.filter((r) => r.chapter === 99).reduce((a, r) => Math.max(a, r.nights), 0),
  };
}

/** Best Endless sieges ever (kept apart from the capped run history). */
export interface EndlessBest {
  nights: number;
  hero: HeroId;
  date: string;
}
export const ENDLESS_TOP = 5;

/** Inserts a siege if it makes the top list; returns its rank (1-based) or 0. */
export function pushEndlessTop(list: EndlessBest[], r: EndlessBest): number {
  if (r.nights <= 0) return 0;
  list.push(r);
  list.sort((a, b) => b.nights - a.nights);
  if (list.length > ENDLESS_TOP) list.length = ENDLESS_TOP;
  return list.indexOf(r) + 1;
}

export function sanitizeEndlessTop(raw: unknown): EndlessBest[] {
  if (!Array.isArray(raw)) return [];
  const out: EndlessBest[] = [];
  for (const v of raw) {
    const o = v as Partial<EndlessBest>;
    if (!o || typeof o.nights !== "number" || !Number.isFinite(o.nights) || typeof o.hero !== "string" || !(o.hero in HERO_BY_ID)) continue;
    out.push({ nights: Math.max(0, Math.min(9999, Math.floor(o.nights))), hero: o.hero, date: typeof o.date === "string" ? o.date.slice(0, 10) : "" });
  }
  return out.sort((a, b) => b.nights - a.nights).slice(0, ENDLESS_TOP);
}
