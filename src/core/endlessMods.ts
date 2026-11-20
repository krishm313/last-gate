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
}

export const ENDLESS_TWISTS: EndlessTwist[] = [
  { id: "iron", name: "Iron Horde", icon: "🪖", desc: "Foes +30% HP, but drop 30% more coins", enemyHp: 1.3, drops: 1.3 },
  { id: "gold", name: "Gold Rush", icon: "💰", desc: "Coins ×1.6, foes +20% HP", drops: 1.6, enemyHp: 1.2 },
  { id: "storm", name: "Storm Season", icon: "⛈️", desc: "Storms roll in most nights — lightning strikes your foes", weatherOdds: { rain: 0.1, fog: 0.05, storm: 0.55 } },
  { id: "glass", name: "Glass Walls", icon: "🧊", desc: "Walls −30% HP, towers +25% damage", wallHp: 0.7, towerDamage: 1.25 },
  { id: "elite", name: "Elite Week", icon: "👑", desc: "Elite foes from night 1 (12%) · coins +20%", eliteChance: 0.12, drops: 1.2 },
  { id: "tidal", name: "Tidal Week", icon: "🌊", desc: "The tide rolls in every 14s at night — it slows you and the horde alike · coins +15%", tideEvery: 14, drops: 1.15 },
  { id: "hero", name: "Hero's Week", icon: "🗡️", desc: "Your hero +40% damage, towers −20%", heroDamage: 1.4, towerDamage: 0.8 },
  { id: "warlords", name: "Warlords' Week", icon: "⚔️", desc: "A boss every 3rd night instead of every 5th · coins +25%", bossEvery: 3, drops: 1.25 },
  { id: "mist", name: "Mist Week", icon: "🌫️", desc: "Fog most nights cuts tower range — hero +25% damage · coins +10%", weatherOdds: { rain: 0.05, fog: 0.6, storm: 0 }, heroDamage: 1.25, drops: 1.1 },
];

/** The twist for the week containing `date` (YYYY-MM-DD). */
export function endlessTwistFor(date = todayString()): EndlessTwist {
  const w = weekNumber(date);
  // Newer twists join from a Monday, so the week in progress always keeps its twist:
  // Tidal Week from 23 Nov 2026, Mist Week from 30 Nov 2026.
  // Warlords' Week from 7 Dec 2026.
  const list = ENDLESS_TWISTS.filter((t) => (t.id !== "tidal" || date >= "2026-11-23") && (t.id !== "mist" || date >= "2026-11-30") && (t.id !== "warlords" || date >= "2026-12-07"));
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
  }
  let out = chapter;
  if (t.weatherOdds) out = { ...out, weatherOdds: t.weatherOdds };
  if (t.bossEvery) out = { ...out, bossEvery: t.bossEvery };
  return out;
}
