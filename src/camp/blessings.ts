import { type Rng, weighted } from "../core/rng";

export type Rarity = "common" | "rare" | "epic" | "legendary";

/** Run modifiers changed by blessings. All multipliers start at 1, additive values at 0. */
export interface CampMods {
  heroDamage: number;
  heroRate: number;
  heroSpeed: number;
  heroHp: number;
  heroMultishot: number;
  /** Hero attack range multiplier (the Lancer). */
  heroRange: number;
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
  ballistaDamage: number;
  logsPerTrip: number;
  forgeSpeed: number;
  /** Shatter: damage multiplier against slowed foes. */
  slowedBonus: number;
  /** Thermal Shock: burning ticks this much harder on slowed foes. */
  thermal: number;
  /** Arcane Focus: Mage Tower damage multiplier and extra chain hops. */
  mageDamage: number;
  mageChains: number;
  /** Field Medic: Healer's Tent radius and heal multiplier. */
  healerPower: number;
  /** Cruel Stakes: spike trap damage multiplier. */
  spikeDamage: number;
  /** Bounty Hunter: coin multiplier for elites and bosses. */
  bigGold: number;
  /** Hawkeye (combo): crit chance for towers in the Watchtower's reach (0 = off). */
  hawkeye: number;
  /** Skill capstones: damage vs bosses, hall damage taken. */
  bossDamage: number;
  hallArmor: number;
  /** Rule-changers. Ricochet: extra bounces per hero arrow (0 = off). */
  ricochet: number;
  /** Thorns: foes striking the wall take this × their blow back (0 = off). */
  thorns: number;
  /** Iron Maiden (combo): foes striking the wall are slowed. */
  thornSlow: number;
  /** Wildfire: burning foes spread fire to neighbours when they fall. */
  wildfire: number;
  /** Culling Blade: hero arrows finish non-boss foes below this HP fraction. */
  cull: number;
  /** Rallying Banner: towers near the hero fire this much faster (1 = off). */
  banner: number;
  /** Golden Volley: every N coins picked up fires a ring of hero arrows (0 = off). */
  coinVolley: number;
}

export function baseMods(): CampMods {
  return {
    heroDamage: 1, heroRate: 1, heroSpeed: 1, heroHp: 1, heroMultishot: 0, heroRange: 1, carry: 0, towerDamage: 1, towerRate: 1,
    towerRange: 1, wallHp: 1, income: 1, drops: 1, burn: 0, burnMult: 1, slow: 0, hallDamage: 1, repairAfterWave: 0, magnet: 1, rerolls: 1,
    allyPower: 1, catapultDamage: 1, ballistaDamage: 1, logsPerTrip: 0, forgeSpeed: 1, slowedBonus: 1, thermal: 1, mageDamage: 1, mageChains: 0, healerPower: 1, spikeDamage: 1, bigGold: 1, hawkeye: 0, bossDamage: 1, hallArmor: 1,
    ricochet: 0, thorns: 0, thornSlow: 0, wildfire: 0, cull: 0, banner: 1, coinVolley: 0,
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
  /** Newer blessings stay out of daily runs, so a day's challenge plays the same for everyone. */
  newer?: boolean;
  /** Rule-changer: never in the regular three; offered as the extra ✨ card on rule nights. */
  rule?: boolean;
  /** War Banner blessing: only offered (and often) on runs flying this banner. */
  banner?: string;
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
  { id: "arcane", name: "Arcane Focus", desc: "Mage Tower +30% damage, lightning hops to 1 more foe", icon: "🔮", rarity: "rare", max: 2, needsBuilding: "mage", apply: (m) => { m.mageDamage *= 1.3; m.mageChains += 1; } },
  { id: "medic", name: "Field Medic", desc: "Healer's Tent reaches 30% farther and heals 40% more", icon: "💚", rarity: "common", max: 2, needsBuilding: "healer", apply: (m) => { m.healerPower *= 1.3; } },
  { id: "stakes", name: "Cruel Stakes", desc: "Spike trap deals 60% more damage", icon: "🪤", rarity: "common", max: 2, needsBuilding: "spikes", apply: (m) => { m.spikeDamage *= 1.6; } },
  { id: "kingslayer", name: "Kingslayer", desc: "+20% damage to bosses", icon: "⚔️", rarity: "rare", max: 2, newer: true, apply: (m) => { m.bossDamage *= 1.2; } },
  { id: "stonehall", name: "Stone Hall", desc: "The hall takes 15% less damage", icon: "🏯", rarity: "rare", max: 2, newer: true, apply: (m) => { m.hallArmor *= 0.85; } },
  { id: "bastion", name: "Last Bastion", desc: "Bosses take +25% damage, the hall 20% less; hero HP +25%", icon: "⚜️", rarity: "legendary", max: 1, requires: ["kingslayer", "stonehall"], newer: true, apply: (m) => { m.bossDamage *= 1.25; m.hallArmor *= 0.8; m.heroHp *= 1.25; } },
  { id: "hawkeye", name: "Hawkeye", desc: "Towers the Watchtower watches over: +10% damage and 15% critical hits", icon: "👁️", rarity: "legendary", max: 1, requires: "eagle", needsBuilding: "watch", apply: (m) => { m.hawkeye = 0.15; } },
  { id: "hunter", name: "Bounty Hunter", desc: "Bosses and elites drop double coins", icon: "🏹", rarity: "rare", max: 1, apply: (m) => { m.bigGold *= 2; } },
  { id: "smith", name: "Master Smith", desc: "The forge works twice as fast", icon: "⚒️", rarity: "common", max: 1, needsBuilding: "forge", apply: (m) => { m.forgeSpeed *= 2; } },
  { id: "fire", name: "Fire Arrows", desc: "All arrows set enemies ablaze", icon: "🔥", rarity: "epic", max: 2, apply: (m) => { m.burn += 0.5; } },
  { id: "frost", name: "Frost Arrows", desc: "All arrows slow enemies by 35%", icon: "❄️", rarity: "epic", max: 1, apply: (m) => { m.slow = 0.35; } },
  { id: "volley", name: "Volley Fire", desc: "Towers fire 40% faster", icon: "🌧️", rarity: "epic", max: 2, requires: "eagle", apply: (m) => { m.towerRate *= 1.4; } },
  { id: "inferno", name: "Inferno", desc: "Burning doubled", icon: "☄️", rarity: "legendary", max: 1, requires: "fire", apply: (m) => { m.burnMult = 2; } },
  // War Banner blessings: each banner brings one of its own that deepens its strategy.
  { id: "bulwark", banner: "bastion", name: "Bulwark", desc: "Walls +15% HP and strike attackers back ×2", icon: "🏰", rarity: "epic", max: 1, apply: (m) => { m.wallHp *= 1.15; m.thorns += 2; } },
  { id: "apex", banner: "hunter", name: "Apex Predator", desc: "Hero +20% damage, +10% speed, much wider coin magnet", icon: "🐺", rarity: "epic", max: 1, apply: (m) => { m.heroDamage *= 1.2; m.heroSpeed *= 1.1; m.magnet *= 1.5; } },
  { id: "treasury", banner: "hoard", name: "Royal Treasury", desc: "Hall income +40%, carry +30 coins", icon: "👑", rarity: "epic", max: 1, apply: (m) => { m.income *= 1.4; m.carry += 30; } },
  { id: "siegecraft", banner: "engineers", name: "Siegecraft", desc: "Catapults and Mage Tower +35% damage; lightning hops 1 more", icon: "⚙️", rarity: "epic", max: 1, apply: (m) => { m.catapultDamage *= 1.35; m.mageDamage *= 1.35; m.mageChains += 1; } },
  { id: "brothers", banner: "levy", name: "Shield Brothers", desc: "Soldiers +40% HP and damage", icon: "🛡️", rarity: "epic", max: 1, apply: (m) => { m.allyPower *= 1.4; } },
  { id: "ironbolts", banner: "bolts", name: "Iron-Shod Bolts", desc: "Ballista bolts +40% damage", icon: "🎯", rarity: "epic", max: 1, needsBuilding: "ballista", apply: (m) => { m.ballistaDamage *= 1.4; } },
  { id: "pyrerite", banner: "pyre", name: "Pyre Rite", desc: "Burning deals 50% more", icon: "🕯️", rarity: "epic", max: 1, apply: (m) => { m.burnMult *= 1.5; } },
  // Rule-changers: each one changes how a run plays, not just a number.
  { id: "ricochet", rule: true, name: "Ricochet", desc: "Your arrows bounce to 1 more foe (60% damage)", icon: "↪️", rarity: "epic", max: 1, newer: true, apply: (m) => { m.ricochet += 1; } },
  { id: "thorns", rule: true, name: "Thorn Walls", desc: "Foes that strike the wall take the blow back ×3", icon: "🌵", rarity: "rare", max: 2, newer: true, apply: (m) => { m.thorns += 3; } },
  { id: "wildfire", rule: true, name: "Wildfire", desc: "Burning foes set their neighbours ablaze when they fall", icon: "🔥", rarity: "epic", max: 1, requires: "fire", newer: true, apply: (m) => { m.wildfire = 1; } },
  { id: "cull", rule: true, name: "Culling Blade", desc: "Your arrows finish off foes under 15% HP (not bosses)", icon: "🪓", rarity: "rare", max: 1, newer: true, apply: (m) => { m.cull = 0.15; } },
  { id: "banner", rule: true, name: "Rallying Banner", desc: "Towers near you fire 50% faster — stand where it matters", icon: "🚩", rarity: "epic", max: 1, newer: true, apply: (m) => { m.banner = 1.5; } },
  { id: "goldvolley", rule: true, name: "Golden Volley", desc: "Every 25 coins you grab looses a ring of arrows around you", icon: "🌟", rarity: "epic", max: 1, newer: true, apply: (m) => { m.coinVolley = 25; } },
  { id: "blades", rule: true, name: "Storm of Blades", desc: "Ricochets bounce 2 more times", icon: "🌪️", rarity: "legendary", max: 1, requires: ["ricochet", "split"], newer: true, apply: (m) => { m.ricochet += 2; } },
  { id: "maiden", rule: true, name: "Iron Maiden", desc: "Thorns hit twice as hard and slow attackers by 40%", icon: "⛓️", rarity: "legendary", max: 1, requires: ["thorns", "walls"], newer: true, apply: (m) => { m.thorns *= 2; m.thornSlow = 0.4; } },
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

/** Every third night (not in daily runs) the pick adds a fourth, rule-changing card. */
export function ruleNight(wave: number, classic: boolean): boolean {
  return !classic && wave > 0 && wave % 3 === 0;
}

/** Blessings the Wandering Merchant could sell right now (regular ones the run could still take). */
export function merchantPool(owned: Record<string, number>, built: Set<string>): Blessing[] {
  return BLESSINGS.filter((b) => !b.rule && !b.banner && !b.requires && (owned[b.id] ?? 0) < b.max && (!b.needsBuilding || built.has(b.needsBuilding)) && b.id !== "lucky");
}

export function rollBlessings(rng: Rng, wave: number, owned: Record<string, number>, n = 3, built: Set<string> = new Set(), classic = false, forceRule = false, banner = "none"): Blessing[] {
  const ok = (b: Blessing) =>
    (!b.banner || b.banner === banner) && !(classic && b.newer) && (owned[b.id] ?? 0) < b.max && (!b.requires || comboParts(b).every((r) => (owned[r] ?? 0) > 0)) && (!b.needsBuilding || built.has(b.needsBuilding));
  const pool = BLESSINGS.filter((b) => !b.rule && ok(b));
  const w: Record<Rarity, number> = { common: Math.max(30, 64 - wave * 3), rare: 26 + wave, epic: 8 + wave * 1.5, legendary: 8 + wave };
  const out: Blessing[] = [];
  while (out.length < n && pool.length) {
    const b = weighted(rng, pool, (x) => w[x.rarity] * (x.banner ? 3 : 1));
    out.push(b);
    pool.splice(pool.indexOf(b), 1);
  }
  // Rule night: one of the three cards becomes a rule-changer (combos weigh in once their parts are
  // owned). It replaces the last card rather than adding a fourth: less to read mid-game.
  if (ruleNight(wave, classic) || (forceRule && !classic)) {
    const rules = BLESSINGS.filter((b) => b.rule && ok(b));
    if (rules.length) {
      const r = weighted(rng, rules, (x) => (x.requires ? 3 : 1));
      if (out.length >= n) out[out.length - 1] = r;
      else out.push(r);
    }
  }
  return out;
}
