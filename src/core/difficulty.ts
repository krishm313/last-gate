import type { ChapterDef } from "./waves";

/** Optional challenge: harder versions of each campaign chapter for better gold. */
export type DifficultyId = "normal" | "hard" | "nightmare";

export interface DifficultyDef {
  id: DifficultyId;
  /** 0 normal, 1 hard, 2 nightmare (save.diffCleared stores the highest cleared). */
  rank: number;
  name: string;
  icon: string;
  hp: number;
  speed: number;
  gate: number;
  gold: number;
  desc: string;
}

export const DIFFICULTIES: DifficultyDef[] = [
  { id: "normal", rank: 0, name: "Normal", icon: "🛡️", hp: 1, speed: 1, gate: 1, gold: 1, desc: "The campaign as told." },
  { id: "hard", rank: 1, name: "Hard", icon: "💀", hp: 1.4, speed: 1.1, gate: 1.15, gold: 1.5, desc: "Foes +40% HP, faster, hit harder · gold ×1.5" },
  { id: "nightmare", rank: 2, name: "Nightmare", icon: "☠️", hp: 1.9, speed: 1.2, gate: 1.3, gold: 2.2, desc: "Foes +90% HP, much faster · gold ×2.2" },
];

export const DIFF_BY_ID: Record<DifficultyId, DifficultyDef> = Object.fromEntries(DIFFICULTIES.map((d) => [d.id, d])) as Record<DifficultyId, DifficultyDef>;

export function isDifficulty(v: unknown): v is DifficultyId {
  return typeof v === "string" && v in DIFF_BY_ID;
}

/**
 * Whether a chapter can be played on a difficulty: Hard needs the chapter cleared on Normal
 * (`normalCleared`), Nightmare needs it cleared on Hard (`bestRank` ≥ 1).
 */
export function difficultyOpen(diff: DifficultyId, normalCleared: boolean, bestRank: number): boolean {
  if (diff === "normal") return true;
  if (diff === "hard") return normalCleared;
  return bestRank >= 1;
}

/** The chapter as played on a difficulty (speed and gate damage scaled; HP goes via the setup). */
export function chapterOnDifficulty(ch: ChapterDef, diff: DifficultyId): ChapterDef {
  const d = DIFF_BY_ID[diff];
  if (d.rank === 0 || ch.endless) return ch;
  return { ...ch, speedMult: ch.speedMult * d.speed, gateDamageMult: ch.gateDamageMult * d.gate };
}
