import type { SaveData } from "./meta";

/** Cosmetic hero flair (a trail / halo drawn around the hero), unlocked by milestones. */
export interface FlairDef {
  id: string;
  name: string;
  icon: string;
  /** How to unlock it (shown while locked). */
  how: string;
  unlocked: (s: SaveData) => boolean;
}

const stars = (s: SaveData) => Object.entries(s.stars).reduce((a, [id, v]) => a + (Number(id) < 98 ? v : 0), 0);

export const FLAIRS: FlairDef[] = [
  { id: "none", name: "None", icon: "▫️", how: "", unlocked: () => true },
  { id: "gold", name: "Golden Halo", icon: "✨", how: "Earn 6 stars", unlocked: (s) => stars(s) >= 6 },
  { id: "ember", name: "Ember Trail", icon: "🔥", how: "Clear chapter 4", unlocked: (s) => (s.stars[4] ?? 0) > 0 },
  { id: "petal", name: "Petal Trail", icon: "🌸", how: "Claim 8 trophies", unlocked: (s) => s.claimed.length >= 8 },
  { id: "shadow", name: "Shadow Wisps", icon: "🌑", how: "Reach night 20 in Endless", unlocked: (s) => (s.best[99] ?? 0) >= 20 },
  { id: "frost", name: "Frost Trail", icon: "❄️", how: "Clear chapter 6", unlocked: (s) => (s.stars[6] ?? 0) > 0 },
  { id: "seafoam", name: "Seafoam Trail", icon: "🫧", how: "Clear chapter 8", unlocked: (s) => (s.stars[8] ?? 0) > 0 },
  { id: "bloodmoon", name: "Blood Moon Halo", icon: "🌕", how: "Clear chapter 9", unlocked: (s) => (s.stars[9] ?? 0) > 0 },
];

export const FLAIR_BY_ID: Record<string, FlairDef> = Object.fromEntries(FLAIRS.map((f) => [f.id, f]));

/** The flair to wear: the saved choice if it's (still) unlocked, else none. */
export function activeFlair(s: SaveData): string {
  const f = FLAIR_BY_ID[s.flair];
  return f && f.unlocked(s) ? f.id : "none";
}
