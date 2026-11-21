/** Heat: optional challenge modifiers picked before a run, each adding a gold bonus. */
export interface HeatDef {
  id: string;
  icon: string;
  name: string;
  desc: string;
  /** Added to the run's gold multiplier. */
  gold: number;
  hp?: number;
  speed?: number;
  wall?: number;
  income?: number;
  elite?: number;
  noRerolls?: boolean;
}

export const HEATS: HeatDef[] = [
  { id: "hide", icon: "🩸", name: "Tough Hide", desc: "Foes +30% HP", gold: 0.25, hp: 1.3 },
  { id: "swift", icon: "💨", name: "Swift Feet", desc: "Foes 15% faster", gold: 0.2, speed: 1.15 },
  { id: "brittle", icon: "🧱", name: "Brittle Walls", desc: "Walls −30% HP", gold: 0.2, wall: 0.7 },
  { id: "lean", icon: "🏚️", name: "Lean Times", desc: "Hall income −40%", gold: 0.2, income: 0.6 },
  { id: "elite", icon: "🎖️", name: "Elite Blood", desc: "+10% of foes are elites", gold: 0.25, elite: 0.1 },
  { id: "noreroll", icon: "🎲", name: "No Second Chances", desc: "No blessing rerolls", gold: 0.1, noRerolls: true },
];

export const HEAT_BY_ID: Record<string, HeatDef> = Object.fromEntries(HEATS.map((h) => [h.id, h]));

/** Known heat ids only, no repeats. */
export function cleanHeat(ids: unknown): string[] {
  return Array.isArray(ids) ? [...new Set(ids.filter((x): x is string => typeof x === "string" && x in HEAT_BY_ID))] : [];
}

/** Gold multiplier for a set of heats (1 = none). */
export function heatGold(ids: string[]): number {
  return 1 + cleanHeat(ids).reduce((a, id) => a + HEAT_BY_ID[id]!.gold, 0);
}

/** Heat applies to campaign chapters and Endless (not the daily, Boss Rush or Siege Lord). */
export function heatAllowed(chapterId: number): boolean {
  return (chapterId >= 1 && chapterId <= 10) || chapterId === 99;
}
