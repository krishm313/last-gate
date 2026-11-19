import { todayString } from "./daily";
import { weekNumber } from "./quests";

/**
 * Endless weekly twist: one of these rules applies to every Endless siege for a week (Monday to
 * Sunday, local time), so the mode plays differently from week to week.
 */
export interface EndlessTwist {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** Multipliers / settings applied to the run. */
  enemyHp?: number;
  drops?: number;
  wallHp?: number;
  towerDamage?: number;
  heroDamage?: number;
  eliteChance?: number;
  weatherOdds?: { rain: number; fog: number; storm: number };
}

export const ENDLESS_TWISTS: EndlessTwist[] = [
  { id: "iron", name: "Iron Horde", icon: "🪖", desc: "Foes +30% HP, but drop 30% more coins", enemyHp: 1.3, drops: 1.3 },
  { id: "gold", name: "Gold Rush", icon: "💰", desc: "Coins ×1.6, foes +20% HP", drops: 1.6, enemyHp: 1.2 },
  { id: "storm", name: "Storm Season", icon: "⛈️", desc: "Storms roll in most nights — lightning strikes your foes", weatherOdds: { rain: 0.1, fog: 0.05, storm: 0.55 } },
  { id: "glass", name: "Glass Walls", icon: "🧊", desc: "Walls −30% HP, towers +25% damage", wallHp: 0.7, towerDamage: 1.25 },
  { id: "elite", name: "Elite Week", icon: "👑", desc: "Elite foes from night 1 (12%) · coins +20%", eliteChance: 0.12, drops: 1.2 },
  { id: "hero", name: "Hero's Week", icon: "🗡️", desc: "Your hero +40% damage, towers −20%", heroDamage: 1.4, towerDamage: 0.8 },
];

/** The twist for the week containing `date` (YYYY-MM-DD). */
export function endlessTwistFor(date = todayString()): EndlessTwist {
  const w = weekNumber(date);
  const n = ENDLESS_TWISTS.length;
  return ENDLESS_TWISTS[((w % n) + n) % n]!;
}

/** Applies a twist to an Endless run's setup and chapter (returns the adjusted chapter). */
export function applyEndlessTwist<C extends { weatherOdds?: { rain: number; fog: number; storm: number } }>(
  t: EndlessTwist,
  setup: { enemyHpMult?: number; eliteChance?: number; mods?: { drops: number; wallHp: number; towerDamage: number; heroDamage: number } },
  chapter: C,
): C {
  if (t.enemyHp) setup.enemyHpMult = (setup.enemyHpMult ?? 1) * t.enemyHp;
  if (t.eliteChance) setup.eliteChance = Math.max(setup.eliteChance ?? 0, t.eliteChance);
  const m = setup.mods;
  if (m) {
    if (t.drops) m.drops *= t.drops;
    if (t.wallHp) m.wallHp *= t.wallHp;
    if (t.towerDamage) m.towerDamage *= t.towerDamage;
    if (t.heroDamage) m.heroDamage *= t.heroDamage;
  }
  return t.weatherOdds ? { ...chapter, weatherOdds: t.weatherOdds } : chapter;
}
