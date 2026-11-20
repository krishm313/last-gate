import { CHAPTERS, ENDLESS_ID } from "./chapters";
import { HERO_BY_ID, HEROES, type HeroId } from "./heroes";
import { DIFF_BY_ID, isDifficulty, type DifficultyId } from "./difficulty";
import { sanitizeEndlessTop, sanitizeHistory, type EndlessBest, type RunRecord } from "./history";
import { newQuestState, sanitizeQuests, type QuestState } from "./quests";
import { newHeroProgress, sanitizeHeroProgress, skillPoints, type HeroProgress } from "./skills";

/** Permanent upgrades bought with gold between runs. */
export interface PermDef {
  id: string;
  name: string;
  desc: (level: number) => string;
  icon: string;
  max: number;
  baseCost: number;
  costGrowth: number;
  /** Late-game sink: locked until every other upgrade is maxed. */
  capstone?: boolean;
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
  { id: "arcanum", name: "Arcanum", icon: "🔮", max: 5, baseCost: 90, costGrowth: 1.6,
    desc: (l) => `Mage Tower damage +${l * 8}%` },
  { id: "fieldworks", name: "Field Works", icon: "🪤", max: 5, baseCost: 80, costGrowth: 1.6,
    desc: (l) => `Spikes +${l * 10}%, Healer reach +${l * 5}%` },
  { id: "legacy", name: "Royal Legacy", icon: "👑", max: 10, baseCost: 600, costGrowth: 1.25, capstone: true,
    desc: (l) => `Hero & tower damage, wall HP +${l * 3}%` },
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
  /** Daily / weekly quests handed out (see quests.ts). */
  quests: QuestState;
  /** Per-hero XP (nights survived) and learned skills. */
  heroes: Record<HeroId, HeroProgress>;
  /** Recent runs, newest first (see history.ts). */
  history: RunRecord[];
  /** Top Endless sieges (nights held). */
  endlessTop: EndlessBest[];
  /** Chosen cosmetic hero flair (see flair.ts). */
  flair: string;
  /** Selected campaign difficulty, and per chapter the highest difficulty rank cleared (1 hard, 2 nightmare). */
  difficulty: DifficultyId;
  diffCleared: Record<number, number>;
  /** Best night reached per chapter on Hard / Nightmare, keyed "chapter:rank". */
  diffBest: Record<string, number>;
  /** Side-stop mini-games on the map: best score and stars per game id. */
  mini: Record<string, { best: number; stars: number }>;
}

/** Known side-stop mini-games (anything else in a stored save is dropped). */
export const MINI_IDS = ["archery", "supply", "watch", "catapult", "dragon", "lanterns", "forge", "bells", "mason", "siege1", "siege2", "siege3", "siege4", "siege5", "siege6"];

export function newSave(): SaveData {
  return { version: 1, gold: 0, stars: {}, perms: {}, hero: "ranger", best: {}, runs: 0, wins: 0, lastChapter: 1, daily: { date: "", best: 0, won: false }, stats: {}, claimed: [], quests: newQuestState(), heroes: newHeroProgress(), history: [], endlessTop: [], flair: "none", difficulty: "normal", diffCleared: {}, diffBest: {}, mini: {} };
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
  // Campaign chapters plus Boss Rush (98), whose stars and best night are kept too.
  const chapterIds = new Set([...CHAPTERS.map((c) => c.id), 98]);
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
  d.flair = typeof (r as { flair?: unknown }).flair === "string" ? ((r as { flair: string }).flair).slice(0, 20) : "none";
  d.difficulty = isDifficulty((r as { difficulty?: unknown }).difficulty) ? (r as { difficulty: DifficultyId }).difficulty : "normal";
  for (const [k, v] of Object.entries(rec((r as { diffCleared?: unknown }).diffCleared))) if (chapterIds.has(Number(k))) d.diffCleared[Number(k)] = Math.max(0, Math.min(2, Math.floor(num(v, 0))));
  d.endlessTop = sanitizeEndlessTop((r as { endlessTop?: unknown }).endlessTop);
  // Saves from before the board: the Endless record so far becomes its first entry.
  if ((r as { endlessTop?: unknown }).endlessTop === undefined && (d.best[ENDLESS_ID] ?? 0) > 0) d.endlessTop = [{ nights: Math.max(0, d.best[ENDLESS_ID]! - 1), hero: d.hero, date: "" }];
  for (const [k, v] of Object.entries(rec((r as { mini?: unknown }).mini))) {
    if (!MINI_IDS.includes(k)) continue;
    const m = rec(v);
    d.mini[k] = { best: Math.max(0, Math.min(99999, Math.floor(num(m.best, 0)))), stars: Math.max(0, Math.min(3, Math.floor(num(m.stars, 0)))) };
  }
  for (const [k, v] of Object.entries(rec((r as { diffBest?: unknown }).diffBest))) if (/^\d+:[12]$/.test(k) && chapterIds.has(Number(k.split(":")[0]))) d.diffBest[k] = Math.max(0, Math.min(99, Math.floor(num(v, 0))));
  d.history = sanitizeHistory((r as { history?: unknown }).history);
  const rawHeroes = (r as { heroes?: unknown }).heroes;
  d.heroes = sanitizeHeroProgress(rawHeroes);
  // Saves from before skill trees: the nights already survived count for the current hero.
  if (rawHeroes === undefined && (raw as { version?: unknown }).version !== undefined) d.heroes[d.hero].xp = d.stats.wavesHeld ?? 0;
  d.quests = sanitizeQuests((r as { quests?: unknown }).quests);
  if (dl && typeof dl.date === "string") d.daily = { date: dl.date, best: Math.max(0, Math.floor(num(dl.best, 0))), won: dl.won === true };
  return d;
}

/** Campaign stars (Boss Rush and Endless don't count toward unlocks). */
export function totalStars(s: SaveData): number {
  return Object.entries(s.stars).reduce((a, [id, v]) => a + (Number(id) < 98 ? v : 0), 0);
}

export function heroUnlocked(s: SaveData, id: HeroId): boolean {
  return totalStars(s) >= HERO_BY_ID[id].starsToUnlock;
}

export function chapterUnlocked(s: SaveData, id: number): boolean {
  if (id === 99) return (s.stars[1] ?? 0) > 0;
  if (id === 98) return (s.stars[5] ?? 0) > 0; // Boss Rush
  return id === 1 || (s.stars[id - 1] ?? 0) > 0;
}

/** Whether an upgrade can be bought at all yet (the capstone waits until all the others are maxed). */
export function permOpen(s: SaveData, p: PermDef): boolean {
  return !p.capstone || PERMS.every((o) => o.capstone || (s.perms[o.id] ?? 0) >= o.max);
}

export function canBuy(s: SaveData, id: string): boolean {
  const p = PERM_BY_ID[id];
  if (!p || !permOpen(s, p)) return false;
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
  /** Campaign difficulty played (default normal). */
  difficulty?: DifficultyId;
}

export interface RunReward {
  gold: number;
  waveBonus: number;
  winBonus: number;
  stars: number;
  newStars: number;
  firstClear: boolean;
  unlockedHeroes: HeroId[];
  /** Endless: one-time milestone bonus (every 5 nights) and the nights it was for. */
  milestoneBonus?: number;
  milestones?: number[];
  /** First clear on Hard (1) / Nightmare (2) this run. */
  hardClear?: number;
  /** Daily: extra gold for the current daily streak. */
  streakBonus?: number;
}

/** Endless milestones: every 5 nights held pays once, more for deeper nights. */
export const ENDLESS_MILESTONE_STEP = 5;
export function endlessMilestoneReward(night: number): number {
  return night * 30;
}
/** The next Endless milestone not yet paid out. */
export function nextEndlessMilestone(s: SaveData): number {
  return (s.stats.endlessMilestone ?? 0) + ENDLESS_MILESTONE_STEP;
}

/** Applies a finished run to the save and returns what was earned. */
export function applyRun(s: SaveData, r: RunResult): RunReward {
  // Late-campaign wins (chapter 7 onward, any difficulty) feed a weekly quest.
  if (r.won && r.chapter >= 7 && r.chapter !== ENDLESS_ID) s.stats.lateWins = (s.stats.lateWins ?? 0) + 1;
  // Endless pays like a mid-campaign chapter per wave held.
  const diff = DIFF_BY_ID[r.chapter >= 98 ? "normal" : r.difficulty ?? "normal"];
  if (diff.rank > 0) return applyHardRun(s, r, diff.rank, diff.gold);
  // Endless pays like chapter 3, Boss Rush like chapter 6.
  const goldTier = r.chapter === 99 ? 3 : r.chapter === 98 ? 6 : r.chapter;
  const waveBonus = Math.max(0, r.wave - (r.won ? 0 : 1)) * 4 * goldTier;
  const firstClear = r.won && (s.stars[r.chapter] ?? 0) === 0;
  const winBonus = r.won ? 40 * goldTier * (firstClear ? 2 : 1) : 0;
  const stars = starsFor(r.won, r.gateFrac);
  const before = totalStars(s);
  const heroesBefore = HEROES.filter((h) => heroUnlocked(s, h.id)).map((h) => h.id);
  s.stars[r.chapter] = Math.max(s.stars[r.chapter] ?? 0, stars);
  s.best[r.chapter] = Math.max(s.best[r.chapter] ?? 0, r.wave);
  // Endless milestones: pay each 5-night mark held for the first time.
  const milestones: number[] = [];
  let milestoneBonus = 0;
  if (r.chapter === ENDLESS_ID) {
    const held = Math.max(0, r.wave - (r.won ? 0 : 1));
    for (let m = nextEndlessMilestone(s); m <= held; m += ENDLESS_MILESTONE_STEP) {
      milestones.push(m);
      milestoneBonus += endlessMilestoneReward(m);
      s.stats.endlessMilestone = m;
    }
  }
  const gold = r.goldFromKills + waveBonus + winBonus + milestoneBonus;
  s.gold += gold;
  s.stats.goldEarned = (s.stats.goldEarned ?? 0) + gold;
  s.runs += 1;
  if (r.won) s.wins += 1;
  s.lastChapter = r.chapter;
  return {
    gold, waveBonus, winBonus, stars, firstClear, milestoneBonus, milestones,
    newStars: totalStars(s) - before,
    unlockedHeroes: HEROES.filter((h) => heroUnlocked(s, h.id) && !heroesBefore.includes(h.id)).map((h) => h.id),
  };
}

/** Nights survived in a run go to the hero who held them. Returns skill points newly earned. */
export function grantHeroXp(s: SaveData, hero: HeroId, nights: number): number {
  const p = s.heroes[hero];
  const before = skillPoints(p.xp);
  p.xp += Math.max(0, Math.floor(nights));
  return skillPoints(p.xp) - before;
}

/**
 * A Hard / Nightmare run: pays more gold, records the clear, but leaves stars (and so chapter /
 * hero unlocks) to the Normal campaign.
 */
function applyHardRun(s: SaveData, r: RunResult, rank: number, goldMult: number): RunReward {
  const waveBonus = Math.round(Math.max(0, r.wave - (r.won ? 0 : 1)) * 4 * r.chapter * goldMult);
  const firstClear = r.won && (s.diffCleared[r.chapter] ?? 0) < rank;
  const winBonus = r.won ? Math.round(40 * r.chapter * (firstClear ? 2 : 1) * goldMult) : 0;
  const loot = Math.round(r.goldFromKills * goldMult);
  if (r.won) s.diffCleared[r.chapter] = Math.max(s.diffCleared[r.chapter] ?? 0, rank);
  if (r.won) s.stats.hardWins = (s.stats.hardWins ?? 0) + 1;
  const key = `${r.chapter}:${rank}`;
  s.diffBest[key] = Math.max(s.diffBest[key] ?? 0, r.wave);
  const gold = loot + waveBonus + winBonus;
  s.gold = Math.min(MAX_GOLD, s.gold + gold);
  s.stats.goldEarned = (s.stats.goldEarned ?? 0) + gold;
  s.runs += 1;
  if (r.won) s.wins += 1;
  s.lastChapter = r.chapter;
  return { gold, waveBonus, winBonus, stars: 0, newStars: 0, firstClear: false, unlockedHeroes: [], hardClear: firstClear ? rank : 0 };
}
