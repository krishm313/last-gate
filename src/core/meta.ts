import { CHAPTERS, ENDLESS_ID } from "./chapters";
import { HERO_BY_ID, HEROES, type HeroId } from "./heroes";

/** Permanent upgrades bought with gold between runs. */
export interface PermDef {
  id: string;
  name: string;
  desc: (level: number) => string;
  icon: string;
  max: number;
  baseCost: number;
  costGrowth: number;
}

export const PERMS: PermDef[] = [
  { id: "walls", name: "Stone Walls", icon: "🏰", max: 10, baseCost: 40, costGrowth: 1.45,
    desc: (l) => `Wall HP +${l * 10}%` },
  { id: "fletching", name: "Fletching", icon: "🪶", max: 10, baseCost: 50, costGrowth: 1.5,
    desc: (l) => `Hero damage +${l * 8}%` },
  { id: "training", name: "Training Grounds", icon: "🎯", max: 10, baseCost: 45, costGrowth: 1.45,
    desc: (l) => `Tower damage +${l * 10}%` },
  { id: "drawspeed", name: "Bowyer", icon: "🏹", max: 8, baseCost: 60, costGrowth: 1.55,
    desc: (l) => `Hero attack speed +${l * 5}%` },
  { id: "barracks", name: "Barracks", icon: "⛺", max: 2, baseCost: 300, costGrowth: 2.5,
    desc: (l) => (l >= 2 ? "Start with 2 towers built" : "Start with a tower built") },
  { id: "masons", name: "Masons' Guild", icon: "🧱", max: 5, baseCost: 70, costGrowth: 1.6,
    desc: (l) => `Wall repairs ${l * 6}% after each night` },
  { id: "keen", name: "Keen Eyes", icon: "👁️", max: 5, baseCost: 80, costGrowth: 1.6,
    desc: (l) => `+${l * 3}% crit chance` },
  { id: "lucky", name: "Lucky Coin", icon: "🍀", max: 3, baseCost: 120, costGrowth: 2,
    desc: (l) => `+${l} reroll${l === 1 ? "" : "s"} per run` },
  { id: "treasury", name: "Treasury", icon: "💰", max: 5, baseCost: 100, costGrowth: 1.7,
    desc: (l) => `+${l * 10}% coins & income` },
];

export const PERM_BY_ID: Record<string, PermDef> = Object.fromEntries(PERMS.map((p) => [p.id, p]));

export function permCost(p: PermDef, level: number): number {
  return Math.round((p.baseCost * p.costGrowth ** level) / 5) * 5;
}

export interface SaveData {
  version: 1;
  gold: number;
  /** chapter id → best stars (0..3). */
  stars: Record<number, number>;
  perms: Record<string, number>;
  hero: HeroId;
  /** chapter id → best wave reached. */
  best: Record<number, number>;
  runs: number;
  wins: number;
  lastChapter: number;
  /** Daily challenge progress for the most recent date played. */
  daily: { date: string; best: number; won: boolean };
  /** Lifetime counters for achievements. */
  stats: Record<string, number>;
  /** Achievement ids already claimed. */
  claimed: string[];
}

export function newSave(): SaveData {
  return { version: 1, gold: 0, stars: {}, perms: {}, hero: "ranger", best: {}, runs: 0, wins: 0, lastChapter: 1, daily: { date: "", best: 0, won: false }, stats: {}, claimed: [] };
}

/** Accepts anything (corrupted / old saves) and returns a valid SaveData. */
/** Upper bound for banked gold (far beyond anything reachable; keeps the HUD readable). */
export const MAX_GOLD = 9_999_999;

export function sanitizeSave(raw: unknown): SaveData {
  const d = newSave();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<SaveData>;
  const num = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) ? v : def);
  const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, number>) : {});
  // Clamp to sane ranges and keep only real chapters, so a hand-edited or corrupted save can't
  // show "1e+308" gold or count stars for chapters that don't exist (which would unlock heroes).
  const chapterIds = new Set(CHAPTERS.map((c) => c.id));
  d.gold = Math.min(MAX_GOLD, Math.max(0, Math.floor(num(r.gold, 0))));
  for (const [k, v] of Object.entries(rec(r.stars))) if (chapterIds.has(Number(k))) d.stars[Number(k)] = Math.max(0, Math.min(3, Math.floor(num(v, 0))));
  for (const [k, v] of Object.entries(rec(r.best))) if (chapterIds.has(Number(k)) || Number(k) === ENDLESS_ID) d.best[Number(k)] = Math.max(0, Math.min(9999, Math.floor(num(v, 0))));
  for (const p of PERMS) d.perms[p.id] = Math.max(0, Math.min(p.max, Math.floor(num(rec(r.perms)[p.id], 0))));
  d.hero = r.hero && r.hero in HERO_BY_ID ? r.hero : "ranger";
  d.runs = Math.floor(num(r.runs, 0));
  d.wins = Math.floor(num(r.wins, 0));
  d.lastChapter = CHAPTERS.some((c) => c.id === r.lastChapter) ? (r.lastChapter as number) : 1;
  if (!heroUnlocked(d, d.hero)) d.hero = "ranger";
  for (const [k, v] of Object.entries(rec(r.stats))) d.stats[k] = Math.max(0, Math.floor(num(v, 0)));
  if (Array.isArray(r.claimed)) d.claimed = r.claimed.filter((x): x is string => typeof x === "string");
  const dl = (r as { daily?: unknown }).daily as { date?: unknown; best?: unknown; won?: unknown } | undefined;
  if (dl && typeof dl.date === "string") d.daily = { date: dl.date, best: Math.max(0, Math.floor(num(dl.best, 0))), won: dl.won === true };
  return d;
}

export function totalStars(s: SaveData): number {
  return Object.values(s.stars).reduce((a, b) => a + b, 0);
}

export function heroUnlocked(s: SaveData, id: HeroId): boolean {
  return totalStars(s) >= HERO_BY_ID[id].starsToUnlock;
}

export function chapterUnlocked(s: SaveData, id: number): boolean {
  if (id === 99) return (s.stars[1] ?? 0) > 0;
  return id === 1 || (s.stars[id - 1] ?? 0) > 0;
}

export function canBuy(s: SaveData, id: string): boolean {
  const p = PERM_BY_ID[id];
  if (!p) return false;
  const lvl = s.perms[id] ?? 0;
  return lvl < p.max && s.gold >= permCost(p, lvl);
}

export function buyPerm(s: SaveData, id: string): boolean {
  if (!canBuy(s, id)) return false;
  const p = PERM_BY_ID[id]!;
  const lvl = s.perms[id] ?? 0;
  s.gold -= permCost(p, lvl);
  s.perms[id] = lvl + 1;
  return true;
}

export function starsFor(won: boolean, gateFrac: number): number {
  if (!won) return 0;
  return gateFrac >= 0.8 ? 3 : gateFrac >= 0.5 ? 2 : 1;
}

export interface RunResult {
  chapter: number;
  won: boolean;
  wave: number;
  gateFrac: number;
  goldFromKills: number;
}

export interface RunReward {
  gold: number;
  waveBonus: number;
  winBonus: number;
  stars: number;
  newStars: number;
  firstClear: boolean;
  unlockedHeroes: HeroId[];
}

/** Applies a finished run to the save and returns what was earned. */
export function applyRun(s: SaveData, r: RunResult): RunReward {
  // Endless pays like a mid-campaign chapter per wave held.
  const goldTier = r.chapter === 99 ? 3 : r.chapter;
  const waveBonus = Math.max(0, r.wave - (r.won ? 0 : 1)) * 4 * goldTier;
  const firstClear = r.won && (s.stars[r.chapter] ?? 0) === 0;
  const winBonus = r.won ? 40 * r.chapter * (firstClear ? 2 : 1) : 0;
  const stars = starsFor(r.won, r.gateFrac);
  const before = totalStars(s);
  const heroesBefore = HEROES.filter((h) => heroUnlocked(s, h.id)).map((h) => h.id);
  s.stars[r.chapter] = Math.max(s.stars[r.chapter] ?? 0, stars);
  s.best[r.chapter] = Math.max(s.best[r.chapter] ?? 0, r.wave);
  const gold = r.goldFromKills + waveBonus + winBonus;
  s.gold += gold;
  s.runs += 1;
  if (r.won) s.wins += 1;
  s.lastChapter = r.chapter;
  return {
    gold, waveBonus, winBonus, stars, firstClear,
    newStars: totalStars(s) - before,
    unlockedHeroes: HEROES.filter((h) => heroUnlocked(s, h.id) && !heroesBefore.includes(h.id)).map((h) => h.id),
  };
}
