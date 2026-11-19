import { dayNumber, todayString } from "./daily";
import type { SaveData } from "./meta";

/**
 * Daily / weekly quests. Each quest tracks a lifetime stat: when a quest is handed out we record the
 * stat's value, and progress is how far it has grown since. Three daily quests rotate at local
 * midnight, one weekly quest on Monday; the picks come from the date, so they're the same on every
 * device and survive reloads.
 */
export interface QuestDef {
  id: string;
  icon: string;
  desc: string;
  /** Stat key in save.stats (plus the pseudo keys "runs" / "wins"). */
  stat: string;
  goal: number;
  reward: number;
}

export const DAILY_QUESTS: QuestDef[] = [
  { id: "d-kills", icon: "💀", desc: "Slay 120 foes", stat: "kills", goal: 120, reward: 60 },
  { id: "d-nights", icon: "🛡️", desc: "Survive 8 nights", stat: "wavesHeld", goal: 8, reward: 60 },
  { id: "d-boss", icon: "👑", desc: "Defeat a boss", stat: "bosses", goal: 1, reward: 80 },
  { id: "d-towers", icon: "🏹", desc: "Build 4 archer towers", stat: "towersBuilt", goal: 4, reward: 50 },
  { id: "d-logs", icon: "🪓", desc: "Deliver 60 logs", stat: "logs", goal: 60, reward: 50 },
  { id: "d-bows", icon: "🔨", desc: "Forge 6 bows", stat: "bows", goal: 6, reward: 50 },
  { id: "d-flawless", icon: "✨", desc: "Hold 2 nights without a hit", stat: "flawlessWaves", goal: 2, reward: 80 },
  { id: "d-gold", icon: "💰", desc: "Earn 250 gold from runs", stat: "goldEarned", goal: 250, reward: 60 },
  { id: "d-win", icon: "🏆", desc: "Win a run", stat: "wins", goal: 1, reward: 100 },
  // Newer content (from 2026-11-20).
  { id: "d-elites", icon: "🎖️", desc: "Defeat 5 elite foes", stat: "elites", goal: 5, reward: 80 },
  { id: "d-fires", icon: "🧯", desc: "Stamp out 3 fires", stat: "firesOut", goal: 3, reward: 70 },
  { id: "d-hard", icon: "💀", desc: "Win a run on Hard or Nightmare", stat: "hardWins", goal: 1, reward: 150 },
];
/** Daily quests in the rotation before the newer ones joined (keeps days already played stable). */
const ORIGINAL_DAILY = 9;
const QUESTS_EXPANDED_FROM = "2026-11-20";

export const WEEKLY_QUESTS: QuestDef[] = [
  { id: "w-kills", icon: "💀", desc: "Slay 1,500 foes this week", stat: "kills", goal: 1500, reward: 400 },
  { id: "w-nights", icon: "🛡️", desc: "Survive 60 nights this week", stat: "wavesHeld", goal: 60, reward: 400 },
  { id: "w-boss", icon: "👑", desc: "Defeat 8 bosses this week", stat: "bosses", goal: 8, reward: 450 },
  { id: "w-win", icon: "🏆", desc: "Win 4 runs this week", stat: "wins", goal: 4, reward: 500 },
  { id: "w-gold", icon: "💰", desc: "Earn 2,500 gold from runs this week", stat: "goldEarned", goal: 2500, reward: 450 },
  // Newer content (from the week starting Mon 2026-11-23).
  { id: "w-elites", icon: "🎖️", desc: "Defeat 30 elite foes this week", stat: "elites", goal: 30, reward: 450 },
  { id: "w-flawless", icon: "✨", desc: "Hold 10 flawless nights this week", stat: "flawlessWaves", goal: 10, reward: 450 },
  { id: "w-logs", icon: "🪓", desc: "Deliver 500 logs this week", stat: "logs", goal: 500, reward: 400 },
  // From the week starting Mon 2026-11-30.
  { id: "w-late", icon: "🌋", desc: "Win 2 runs in chapter 7+ this week", stat: "lateWins", goal: 2, reward: 650 },
];
/** Weekly quests in the rotation before the newer ones joined (keeps the current week stable). */
const ORIGINAL_WEEKLY = 5;
const WEEKLY_EXPANDED_FROM = "2026-11-23";
/** Weekly quests in the rotation from WEEKLY_EXPANDED_FROM until the next batch joined. */
const WEEKLY_SECOND = 8;
const WEEKLY_EXPANDED_2 = "2026-11-30";

const BY_ID: Record<string, QuestDef> = Object.fromEntries([...DAILY_QUESTS, ...WEEKLY_QUESTS].map((q) => [q.id, q]));

export interface QuestSlot {
  id: string;
  /** Stat value when the quest was handed out. */
  start: number;
  claimed: boolean;
}

export interface QuestState {
  day: string;
  daily: QuestSlot[];
  week: number;
  weekly: QuestSlot | null;
}

export function newQuestState(): QuestState {
  return { day: "", daily: [], week: -1, weekly: null };
}

export function questStat(s: SaveData, stat: string): number {
  if (stat === "runs") return s.runs;
  if (stat === "wins") return s.wins;
  return s.stats[stat] ?? 0;
}

/** Week index (weeks start on Monday) for a YYYY-MM-DD date. 1970-01-01 was a Thursday. */
export function weekNumber(date: string): number {
  return Math.floor((dayNumber(date) + 3) / 7);
}

function hash(n: number): number {
  let h = Math.imul(n ^ 0x5bd1e995, 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  return (h ^ (h >>> 13)) >>> 0;
}

/**
 * Whether a player can realistically finish a quest yet: elites (daily or weekly) need Hard (a chapter cleared),
 * fires need Fire Imps (chapter 7 open), Hard wins need a chapter cleared.
 */
export function questEligible(s: SaveData | null, id: string): boolean {
  if (!s) return true;
  const cleared = Object.values(s.stars).some((v) => v > 0);
  if (id === "d-elites" || id === "d-hard" || id === "w-elites") return cleared;
  if (id === "d-fires") return (s.stars[6] ?? 0) > 0;
  if (id === "w-late") return (s.stars[7] ?? 0) > 0; // has beaten chapter 7 once already
  return true;
}

/** The three daily quest ids for a date (distinct, deterministic). */
export function dailyPicks(date: string, s: SaveData | null = null): string[] {
  const pool = (date >= QUESTS_EXPANDED_FROM ? DAILY_QUESTS : DAILY_QUESTS.slice(0, ORIGINAL_DAILY)).map((q) => q.id).filter((id) => questEligible(s, id));
  const out: string[] = [];
  let seed = dayNumber(date);
  while (out.length < 3) {
    seed = hash(seed + 1);
    const id = pool[seed % pool.length]!;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

export function weeklyPick(week: number, s: SaveData | null = null): string {
  const size = week >= weekNumber(WEEKLY_EXPANDED_2) ? WEEKLY_QUESTS.length : week >= weekNumber(WEEKLY_EXPANDED_FROM) ? WEEKLY_SECOND : ORIGINAL_WEEKLY;
  const pool = WEEKLY_QUESTS.slice(0, size).filter((q) => questEligible(s, q.id));
  return pool[hash(week * 7919) % pool.length]!.id;
}

/** Hands out new quests when the day / week has turned. Returns true if anything changed. */
export function refreshQuests(s: SaveData, now = new Date()): boolean {
  const day = todayString(now);
  const q = s.quests;
  let changed = false;
  if (q.day !== day) {
    q.day = day;
    q.daily = dailyPicks(day, s).map((id) => ({ id, start: questStat(s, BY_ID[id]!.stat), claimed: false }));
    changed = true;
  }
  const week = weekNumber(day);
  if (q.week !== week || !q.weekly) {
    q.week = week;
    const id = weeklyPick(week, s);
    q.weekly = { id, start: questStat(s, BY_ID[id]!.stat), claimed: false };
    changed = true;
  }
  return changed;
}

/** Quest rewards grow with campaign progress so they stay worth chasing late on. */
export function questReward(s: SaveData, def: QuestDef): number {
  const cleared = Object.values(s.stars).filter((v) => v > 0).length;
  return Math.round((def.reward * (1 + cleared * 0.25)) / 5) * 5;
}

export interface QuestView {
  slot: QuestSlot;
  def: QuestDef;
  progress: number;
  done: boolean;
  reward: number;
  weekly: boolean;
}

export function questViews(s: SaveData): QuestView[] {
  const slots: [QuestSlot, boolean][] = s.quests.daily.map((x) => [x, false]);
  if (s.quests.weekly) slots.push([s.quests.weekly, true]);
  const out: QuestView[] = [];
  for (const [slot, weekly] of slots) {
    const def = BY_ID[slot.id];
    if (!def) continue;
    const progress = Math.max(0, Math.min(def.goal, questStat(s, def.stat) - slot.start));
    out.push({ slot, def, progress, done: progress >= def.goal, reward: questReward(s, def), weekly });
  }
  return out;
}

export function questsReady(s: SaveData): number {
  return questViews(s).filter((v) => v.done && !v.slot.claimed).length;
}

/** Claims a finished quest; returns the gold paid (0 if not claimable). */
export function claimQuest(s: SaveData, id: string): number {
  const v = questViews(s).find((x) => x.slot.id === id);
  if (!v || !v.done || v.slot.claimed) return 0;
  v.slot.claimed = true;
  s.gold += v.reward;
  return v.reward;
}

/** Validates a stored quest state (old saves have none). */
export function sanitizeQuests(raw: unknown): QuestState {
  const d = newQuestState();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<QuestState>;
  const slot = (v: unknown): QuestSlot | null => {
    if (!v || typeof v !== "object") return null;
    const o = v as Partial<QuestSlot>;
    if (typeof o.id !== "string" || !BY_ID[o.id]) return null;
    const start = typeof o.start === "number" && Number.isFinite(o.start) ? Math.max(0, Math.floor(o.start)) : 0;
    return { id: o.id, start, claimed: o.claimed === true };
  };
  if (typeof r.day === "string") d.day = r.day;
  if (Array.isArray(r.daily)) d.daily = r.daily.map(slot).filter((x): x is QuestSlot => !!x).slice(0, 3);
  if (typeof r.week === "number" && Number.isFinite(r.week)) d.week = Math.floor(r.week);
  d.weekly = slot(r.weekly);
  return d;
}
