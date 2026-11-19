import { type Rng, weighted } from "../core/rng";

export type Rarity = "common" | "rare" | "epic" | "legendary";

/** Run modifiers changed by blessings. All multipliers start at 1, additive values at 0. */
export interface CampMods {
  heroDamage: number;
  heroRate: number;
  heroSpeed: number;
  heroHp: number;
  heroMultishot: number;
  carry: number;
  towerDamage: number;
  towerRate: number;
  towerRange: number;
  wallHp: number;
  income: number;
  drops: number;
  burn: number;
  /** Inferno: multiplies burning at use, so the result doesn't depend on blessing pick order. */
  burnMult: number;
  slow: number;
  hallDamage: number;
  repairAfterWave: number;
  magnet: number;
  rerolls: number;
  allyPower: number;
  catapultDamage: number;
  logsPerTrip: number;
  forgeSpeed: number;
  /** Shatter: damage multiplier against slowed foes. */
  slowedBonus: number;
  /** Thermal Shock: burning ticks this much harder on slowed foes. */
  thermal: number;
}

export function baseMods(): CampMods {
  return {
    heroDamage: 1, heroRate: 1, heroSpeed: 1, heroHp: 1, heroMultishot: 0, carry: 0, towerDamage: 1, towerRate: 1,
    towerRange: 1, wallHp: 1, income: 1, drops: 1, burn: 0, burnMult: 1, slow: 0, hallDamage: 1, repairAfterWave: 0, magnet: 1, rerolls: 1,
    allyPower: 1, catapultDamage: 1, logsPerTrip: 0, forgeSpeed: 1, slowedBonus: 1, thermal: 1,
  };
}

export interface Blessing {
  id: string;
  name: string;
  desc: string;
  icon: string;
  rarity: Rarity;
  max: number;
  /** Combo: only offered once every listed blessing is owned. */
  requires?: string | string[];
  /** Only offered once this building exists in the camp. */
  needsBuilding?: string;
  apply: (m: CampMods) => void;
}

export const BLESSINGS: Blessing[] = [
  { id: "sharp", name: "Sharp Arrows", desc: "Hero damage +30%", icon: "🗡️", rarity: "common", max: 5, apply: (m) => { m.heroDamage *= 1.3; } },
  { id: "quick", name: "Quick Draw", desc: "Hero attack speed +20%", icon: "⚔️", rarity: "common", max: 5, apply: (m) => { m.heroRate *= 1.2; } },
  { id: "boots", name: "Swift Boots", desc: "Move 15% faster", icon: "👢", rarity: "common", max: 3, apply: (m) => { m.heroSpeed *= 1.15; } },
  { id: "pockets", name: "Deep Pockets", desc: "Carry +20 coins, wider coin magnet", icon: "🎒", rarity: "common", max: 4, apply: (m) => { m.carry += 20; m.magnet *= 1.25; } },
  { id: "drills", name: "Tower Drills", desc: "Towers +25% damage", icon: "🎯", rarity: "common", max: 5, apply: (m) => { m.towerDamage *= 1.25; } },
  { id: "walls", name: "Thick Timber", desc: "Wall max HP +25%", icon: "🧱", rarity: "common", max: 4, apply: (m) => { m.wallHp *= 1.25; } },
  { id: "tax", name: "Tax Collector", desc: "Hall income +40%", icon: "📜", rarity: "common", max: 4, apply: (m) => { m.income *= 1.4; } },
  { id: "bounty", name: "Bounty", desc: "Enemies drop 30% more coins", icon: "💰", rarity: "common", max: 3, apply: (m) => { m.drops *= 1.3; } },
  { id: "vigor", name: "Vigor", desc: "Hero HP +40%", icon: "❤️", rarity: "common", max: 3, apply: (m) => { m.heroHp *= 1.4; } },
  { id: "eagle", name: "Eagle Towers", desc: "Towers +15% range, +15% fire rate", icon: "🦅", rarity: "rare", max: 3, apply: (m) => { m.towerRange *= 1.15; m.towerRate *= 1.15; } },
  { id: "split", name: "Split Shot", desc: "Hero shoots +1 extra target", icon: "🔱", rarity: "rare", max: 3, apply: (m) => { m.heroMultishot += 1; } },
  { id: "masons", name: "Masons", desc: "Wall repairs 30% after each night", icon: "🛠️", rarity: "rare", max: 2, apply: (m) => { m.repairAfterWave += 0.3; } },
  { id: "guard", name: "Hall Guard", desc: "Hall archers deal double damage", icon: "🛡️", rarity: "rare", max: 2, apply: (m) => { m.hallDamage *= 2; } },
  { id: "lucky", name: "Lucky Charm", desc: "+2 rerolls", icon: "🍀", rarity: "rare", max: 2, apply: (m) => { m.rerolls += 2; } },
  { id: "soldiers", name: "Hardy Soldiers", desc: "Barracks soldiers +60% HP and damage", icon: "⛑️", rarity: "rare", max: 2, needsBuilding: "barracks", apply: (m) => { m.allyPower *= 1.6; } },
  { id: "boulders", name: "Heavy Boulders", desc: "Catapults +40% damage, bigger splash", icon: "🪨", rarity: "rare", max: 2, needsBuilding: "catapult", apply: (m) => { m.catapultDamage *= 1.4; } },
  { id: "woodsmen", name: "Woodsmen", desc: "Woodcutters bring 2 more logs per trip", icon: "🪓", rarity: "common", max: 2, needsBuilding: "lumber", apply: (m) => { m.logsPerTrip += 2; } },
  { id: "smith", name: "Master Smith", desc: "The forge works twice as fast", icon: "⚒️", rarity: "common", max: 1, needsBuilding: "forge", apply: (m) => { m.forgeSpeed *= 2; } },
  { id: "fire", name: "Fire Arrows", desc: "All arrows set enemies ablaze", icon: "🔥", rarity: "epic", max: 2, apply: (m) => { m.burn += 0.5; } },
  { id: "frost", name: "Frost Arrows", desc: "All arrows slow enemies by 35%", icon: "❄️", rarity: "epic", max: 1, apply: (m) => { m.slow = 0.35; } },
  { id: "volley", name: "Volley Fire", desc: "Towers fire 40% faster", icon: "🌧️", rarity: "epic", max: 2, requires: "eagle", apply: (m) => { m.towerRate *= 1.4; } },
  { id: "inferno", name: "Inferno", desc: "Burning doubled", icon: "☄️", rarity: "legendary", max: 1, requires: "fire", apply: (m) => { m.burnMult = 2; } },
  // Combos: pairs of blessings that unlock a stronger one.
  { id: "shatter", name: "Shatter", desc: "Slowed enemies take +35% damage", icon: "💎", rarity: "epic", max: 1, requires: ["frost", "drills"], apply: (m) => { m.slowedBonus = 1.35; } },
  { id: "thermal", name: "Thermal Shock", desc: "Burning hits slowed enemies 3× harder", icon: "🌋", rarity: "legendary", max: 1, requires: ["fire", "frost"], apply: (m) => { m.thermal = 3; } },
  { id: "trove", name: "Treasure Trove", desc: "Hall income +60%, drops +30%", icon: "👑", rarity: "epic", max: 1, requires: ["tax", "bounty"], apply: (m) => { m.income *= 1.6; m.drops *= 1.3; } },
  { id: "bulwark", name: "Bulwark", desc: "Wall max HP +40%, repairs 25% after each night", icon: "🏰", rarity: "epic", max: 1, requires: ["walls", "masons"], apply: (m) => { m.wallHp *= 1.4; m.repairAfterWave += 0.25; } },
  { id: "deadeye", name: "Deadeye", desc: "Hero +50% damage, +1 extra target", icon: "🎯", rarity: "epic", max: 1, requires: ["sharp", "split"], apply: (m) => { m.heroDamage *= 1.5; m.heroMultishot += 1; } },
];

/** The blessings a combo needs (empty for a normal blessing). */
export function comboParts(b: Blessing): string[] {
  return b.requires === undefined ? [] : Array.isArray(b.requires) ? b.requires : [b.requires];
}

export const BLESSING_BY_ID: Record<string, Blessing> = Object.fromEntries(BLESSINGS.map((b) => [b.id, b]));

export function rollBlessings(rng: Rng, wave: number, owned: Record<string, number>, n = 3, built: Set<string> = new Set()): Blessing[] {
  const pool = BLESSINGS.filter(
    (b) => (owned[b.id] ?? 0) < b.max && (!b.requires || comboParts(b).every((r) => (owned[r] ?? 0) > 0)) && (!b.needsBuilding || built.has(b.needsBuilding)),
  );
  const w: Record<Rarity, number> = { common: Math.max(30, 64 - wave * 3), rare: 26 + wave, epic: 8 + wave * 1.5, legendary: 8 + wave };
  const out: Blessing[] = [];
  while (out.length < n && pool.length) {
    const b = weighted(rng, pool, (x) => w[x.rarity]);
    out.push(b);
    pool.splice(pool.indexOf(b), 1);
  }
  return out;
}
