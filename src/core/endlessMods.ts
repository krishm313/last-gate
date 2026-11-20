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
  /** Seconds between free tides during each night. */
  tideEvery?: number;
  /** A boss every N nights instead of every 5th. */
  bossEvery?: number;
  /** Extra run-mod multipliers (keys of CampMods, e.g. allyPower, heroSpeed). */
  mods?: Record<string, number>;
  /** First Monday this twist can come up (the week in progress always keeps its twist). */
  since?: string;
}

export const ENDLESS_TWISTS: EndlessTwist[] = [
  { id: "iron", name: "Iron Horde", icon: "🪖", desc: "Foes +30% HP, but drop 30% more coins", enemyHp: 1.3, drops: 1.3 },
  { id: "gold", name: "Gold Rush", icon: "💰", desc: "Coins ×1.6, foes +20% HP", drops: 1.6, enemyHp: 1.2 },
  { id: "storm", name: "Storm Season", icon: "⛈️", desc: "Storms roll in most nights — lightning strikes your foes", weatherOdds: { rain: 0.1, fog: 0.05, storm: 0.55 } },
  { id: "glass", name: "Glass Walls", icon: "🧊", desc: "Walls −30% HP, towers +25% damage", wallHp: 0.7, towerDamage: 1.25 },
  { id: "elite", name: "Elite Week", icon: "👑", desc: "Elite foes from night 1 (12%) · coins +20%", eliteChance: 0.12, drops: 1.2 },
  { id: "tidal", name: "Tidal Week", icon: "🌊", desc: "The tide rolls in every 14s at night — it slows you and the horde alike · coins +15%", tideEvery: 14, drops: 1.15, since: "2026-11-23" },
  { id: "hero", name: "Hero's Week", icon: "🗡️", desc: "Your hero +40% damage, towers −20%", heroDamage: 1.4, towerDamage: 0.8 },
  { id: "warlords", name: "Warlords' Week", icon: "⚔️", desc: "A boss every 3rd night instead of every 5th · coins +25%", bossEvery: 3, drops: 1.25, since: "2026-12-07" },
  { id: "mist", name: "Mist Week", icon: "🌫️", desc: "Fog most nights cuts tower range — hero +25% damage · coins +10%", weatherOdds: { rain: 0.05, fog: 0.6, storm: 0 }, heroDamage: 1.25, drops: 1.1, since: "2026-11-30" },
  { id: "legion", name: "Legion Week", icon: "🛡️", desc: "Soldiers & militia +70% HP and damage · foes +15% HP", mods: { allyPower: 1.7 }, enemyHp: 1.15, since: "2026-12-14" },
  { id: "swift", name: "Swift Week", icon: "💨", desc: "Your hero runs 30% faster and shoots 20% faster · foes +15% HP", mods: { heroSpeed: 1.3, heroRate: 1.2 }, enemyHp: 1.15, since: "2026-12-21" },
];

/** The twist for the week containing `date` (YYYY-MM-DD). */
export function endlessTwistFor(date = todayString()): EndlessTwist {
  const w = weekNumber(date);
  // Newer twists join from a Monday (`since`), so the week in progress always keeps its twist.
  const list = ENDLESS_TWISTS.filter((t) => !t.since || date >= t.since);
  const n = list.length;
  return list[((w % n) + n) % n]!;
}

/** Applies a twist to an Endless run's setup and chapter (returns the adjusted chapter). */
export function applyEndlessTwist<C extends { weatherOdds?: { rain: number; fog: number; storm: number }; bossEvery?: number }>(
  t: EndlessTwist,
  setup: { enemyHpMult?: number; eliteChance?: number; tideEvery?: number; mods?: { drops: number; wallHp: number; towerDamage: number; heroDamage: number } },
  chapter: C,
): C {
  if (t.enemyHp) setup.enemyHpMult = (setup.enemyHpMult ?? 1) * t.enemyHp;
  if (t.eliteChance) setup.eliteChance = Math.max(setup.eliteChance ?? 0, t.eliteChance);
  if (t.tideEvery) setup.tideEvery = t.tideEvery;
  const m = setup.mods;
  if (m) {
    if (t.drops) m.drops *= t.drops;
    if (t.wallHp) m.wallHp *= t.wallHp;
    if (t.towerDamage) m.towerDamage *= t.towerDamage;
    if (t.heroDamage) m.heroDamage *= t.heroDamage;
    const all = m as unknown as Record<string, number>;
    for (const [k, v] of Object.entries(t.mods ?? {})) if (typeof all[k] === "number") all[k] *= v;
  }
  let out = chapter;
  if (t.weatherOdds) out = { ...out, weatherOdds: t.weatherOdds };
  if (t.bossEvery) out = { ...out, bossEvery: t.bossEvery };
  return out;
}
