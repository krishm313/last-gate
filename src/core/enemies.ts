/** Enemy roster. Pure data: tune numbers here, not in the simulation. */
export type EnemyId =
  | "footman"
  | "runner"
  | "shield"
  | "brute"
  | "crossbow"
  | "mob"
  | "goblin"
  | "shaman"
  | "ram"
  | "bat"
  | "sapper"
  | "thief"
  | "knight"
  | "wraith"
  | "ogre"
  | "troll"
  | "warlord"
  | "frostwyrm"
  | "magma"
  | "drowned"
  | "bloodlord"
  | "hag"
  | "golem"
  | "dragon"
  | "colossus"
  | "banner"
  | "raven"
  | "imp"
  | "tunneler";

export type Behavior =
  /** Walks to the wall and hits the gate. */
  | "melee"
  /** Stops at `stopY` and fires bolts at the gate. */
  | "ranged"
  /** Heals nearby allies while walking. */
  | "healer"
  /** Summons minions (bosses). */
  | "summoner";

export interface EnemyDef {
  id: EnemyId;
  name: string;
  /** Base HP at wave 1 (scaled by the wave director). */
  hp: number;
  /** Pixels per second. */
  speed: number;
  radius: number;
  /** Damage dealt to the gate per attack (melee) or per bolt (ranged). */
  gateDamage: number;
  /** Seconds between attacks. */
  attackInterval: number;
  gold: number;
  color: string;
  /** Spawn budget cost, in footman units. */
  cost: number;
  behavior: Behavior;
  /** Frontal shield: arrows coming almost straight up deal reduced damage. */
  shield?: boolean;
  /** Multiplier on how strongly slows affect this enemy (0 = immune). */
  slowResist?: number;
  /** Ranged: the y at which it stops to shoot. */
  stopY?: number;
  /** Healer: fraction of max HP healed per pulse, pulse range. */
  heal?: { frac: number; range: number; interval: number };
  /** On death, spawns these. */
  splitsInto?: { enemy: EnemyId; count: number };
  /** Summoner: minions per pulse and pulse interval; `enraged` used under 50% HP. */
  summon?: { enemy: EnemyId; count: number; interval: number; enraged: EnemyId };
  /** Permanent damage reduction 0..1. */
  armor?: number;
  /** Periodic damage reduction: `reduction` applies for `on` seconds, then `off` seconds without. */
  armorCycle?: { on: number; off: number; reduction: number };
  /** Regenerates this fraction of max HP per second. */
  regen?: number;
  /** Ranged enemies that strafe side to side once in position. */
  strafe?: number;
  /** Bolt visual for ranged attackers. */
  boltKind?: "bolt" | "fireball" | "frost";
  /** Runs sideways across the field and escapes off the far edge (treasure goblin). */
  crossing?: boolean;
  /** Flying: ignores crowding and sways widely. */
  flying?: boolean;
  /** Explodes against the gate on arrival, dealing gateDamage once. */
  kamikaze?: boolean;
  boss?: boolean;
  /** Rallying aura: other foes within `radius` move `speed` faster and gain `armor` reduction. */
  aura?: { radius: number; speed: number; armor: number };
  /** Dives at the nearest archer tower and stuns it for this many seconds (then is spent). */
  towerHunter?: number;
  /** Dives at a support building (catapult, mage, healer, spikes, watchtower, forge) and sets it ablaze for this many seconds. */
  arsonist?: number;
  /** At the wall it digs under for this many seconds (can't be hit), then surfaces inside the camp. */
  tunneler?: number;
  /** Phase 2 (below half HP): every `every` s a frost nova freezes towers within `radius` for `stun` s. */
  frostNova?: { every: number; radius: number; stun: number };
  /** Distinct second-phase move once enraged (below half HP). */
  phase2?: { kind: "slam" | "warcry" | "boulders" | "curse" | "eruption" | "tide" | "bloodmoon"; every: number; radius: number; power: number };
}

const base = { behavior: "melee" as Behavior, attackInterval: 1 };

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  tunneler: { ...base, id: "tunneler", name: "Tunneler", hp: 34, speed: 40, radius: 11, gateDamage: 6, gold: 3, color: "#6a4a2a", cost: 3, tunneler: 3 },
  imp: { ...base, id: "imp", name: "Fire Imp", hp: 18, speed: 96, radius: 9, gateDamage: 3, gold: 2, color: "#ff6a1a", cost: 2, flying: true, arsonist: 5 },
  raven: { ...base, id: "raven", name: "War Raven", hp: 20, speed: 88, radius: 9, gateDamage: 3, gold: 2, color: "#2a2438", cost: 2, flying: true, towerHunter: 3.5 },
  banner: { ...base, id: "banner", name: "Banner-bearer", hp: 40, speed: 38, radius: 12, gateDamage: 4, gold: 3, color: "#c83a3a", cost: 3, aura: { radius: 120, speed: 0.3, armor: 0.25 } },
  footman: { ...base, id: "footman", name: "Footman", hp: 22, speed: 46, radius: 11, gateDamage: 5, gold: 1, color: "#b8423a", cost: 1 },
  runner: { ...base, id: "runner", name: "Runner", hp: 12, speed: 96, radius: 9, gateDamage: 3, attackInterval: 0.6, gold: 1, color: "#e0803a", cost: 1 },
  shield: { ...base, id: "shield", name: "Shieldbearer", hp: 42, speed: 36, radius: 13, gateDamage: 6, gold: 2, color: "#7d8899", cost: 2, shield: true },
  brute: { ...base, id: "brute", name: "Brute", hp: 120, speed: 25, radius: 18, gateDamage: 18, attackInterval: 1.4, gold: 4, color: "#7a3b6e", cost: 4, slowResist: 0.6 },
  crossbow: { ...base, id: "crossbow", name: "Crossbowman", hp: 18, speed: 44, radius: 10, gateDamage: 6, attackInterval: 2.2, gold: 2, color: "#4f6b3a", cost: 2, behavior: "ranged", stopY: 300 },
  mob: { ...base, id: "mob", name: "Goblin Mob", hp: 50, speed: 34, radius: 15, gateDamage: 8, gold: 1, color: "#5f8f3a", cost: 3, splitsInto: { enemy: "goblin", count: 3 } },
  goblin: { ...base, id: "goblin", name: "Goblin", hp: 11, speed: 72, radius: 7, gateDamage: 3, attackInterval: 0.7, gold: 0, color: "#8cc04a", cost: 0 },
  shaman: { ...base, id: "shaman", name: "Shaman", hp: 34, speed: 32, radius: 11, gateDamage: 4, gold: 3, color: "#3aa0a0", cost: 3, behavior: "healer", heal: { frac: 0.15, range: 95, interval: 2.4 } },
  ram: { ...base, id: "ram", name: "Battering Ram", hp: 170, speed: 40, radius: 20, gateDamage: 40, attackInterval: 2, gold: 6, color: "#8a6a3a", cost: 6, slowResist: 0.3 },
  bat: { ...base, id: "bat", name: "Bat Swarm", hp: 9, speed: 70, radius: 8, gateDamage: 2, attackInterval: 0.5, gold: 1, color: "#3a2a4a", cost: 0.6, flying: true },
  sapper: { ...base, id: "sapper", name: "Sapper", hp: 26, speed: 58, radius: 11, gateDamage: 45, gold: 2, color: "#2a2a2a", cost: 3, kamikaze: true },
  thief: { ...base, id: "thief", name: "Treasure Goblin", hp: 60, speed: 95, radius: 10, gateDamage: 0, gold: 12, color: "#d8b030", cost: 0, crossing: true },
  knight: { ...base, id: "knight", name: "Black Knight", hp: 70, speed: 34, radius: 14, gateDamage: 12, attackInterval: 1.2, gold: 4, color: "#2e3440", cost: 4, armor: 0.4 },
  wraith: { ...base, id: "wraith", name: "Wraith", hp: 30, speed: 52, radius: 11, gateDamage: 7, gold: 3, color: "#8a9ac0", cost: 2.5, armorCycle: { on: 1.4, off: 1.8, reduction: 1 } },
  ogre: { ...base, id: "ogre", name: "Ogre Champion", hp: 600, speed: 20, radius: 28, gateDamage: 30, attackInterval: 1.5, gold: 25, color: "#6a7a3a", cost: 0, slowResist: 0.4, boss: true, phase2: { kind: "slam", every: 5, radius: 130, power: 18 } },
  troll: { ...base, id: "troll", name: "Marsh Troll", hp: 700, speed: 22, radius: 26, gateDamage: 30, attackInterval: 1.4, gold: 30, color: "#4a7a5a", cost: 0, slowResist: 0.5, boss: true, regen: 0.015 },
  hag: {
    ...base, id: "hag", name: "The Swamp Hag", hp: 1600, speed: 16, radius: 26, gateDamage: 35, attackInterval: 1.4, gold: 80, color: "#4a5a2a",
    cost: 0, slowResist: 0.4, boss: true, behavior: "summoner", heal: { frac: 0.08, range: 150, interval: 3 }, phase2: { kind: "curse", every: 0, radius: 320, power: 0.15 },
    summon: { enemy: "bat", count: 5, interval: 5.5, enraged: "goblin" },
  },
  golem: {
    ...base, id: "golem", name: "The Siege Golem", hp: 1800, speed: 14, radius: 34, gateDamage: 60, attackInterval: 1.8, gold: 110, color: "#7a7468",
    cost: 0, slowResist: 0.2, boss: true, armorCycle: { on: 2.6, off: 3.6, reduction: 0.7 }, phase2: { kind: "boulders", every: 6, radius: 420, power: 1.8 },
  },
  dragon: {
    ...base, id: "dragon", name: "The Bone Dragon", hp: 1400, speed: 30, radius: 30, gateDamage: 14, attackInterval: 3, gold: 140, color: "#d8d0b8",
    cost: 0, slowResist: 0.3, boss: true, flying: true, behavior: "ranged", stopY: 170, strafe: 70, boltKind: "fireball",
    summon: { enemy: "bat", count: 4, interval: 7, enraged: "wraith" },
  },
  colossus: {
    ...base, id: "colossus", name: "The Iron Colossus", hp: 2600, speed: 12, radius: 38, gateDamage: 60, attackInterval: 2, gold: 220, color: "#4a4e58",
    cost: 0, slowResist: 0.15, boss: true, armor: 0.2, behavior: "summoner", summon: { enemy: "ram", count: 1, interval: 9, enraged: "sapper" },
  },
  frostwyrm: {
    ...base, id: "frostwyrm", name: "The Frost Wyrm", hp: 3200, speed: 28, radius: 32, gateDamage: 24, attackInterval: 2.4, gold: 240, color: "#9ad4ff",
    cost: 0, slowResist: 0.35, boss: true, flying: true, behavior: "ranged", stopY: 170, strafe: 70, boltKind: "frost",
    summon: { enemy: "raven", count: 4, interval: 7, enraged: "wraith" },
    frostNova: { every: 5.5, radius: 340, stun: 3.2 },
  },
  magma: {
    ...base, id: "magma", name: "The Magma Titan", hp: 3000, speed: 13, radius: 38, gateDamage: 70, attackInterval: 2, gold: 260, color: "#c84a1a",
    cost: 0, slowResist: 0.2, boss: true, armor: 0.25, behavior: "summoner", summon: { enemy: "brute", count: 1, interval: 10, enraged: "sapper" },
    phase2: { kind: "eruption", every: 6, radius: 300, power: 16 },
  },
  drowned: {
    ...base, id: "drowned", name: "The Drowned King", hp: 3200, speed: 14, radius: 36, gateDamage: 65, attackInterval: 2, gold: 280, color: "#2a7a8a",
    cost: 0, slowResist: 0.2, boss: true, armor: 0.2, behavior: "summoner", summon: { enemy: "shield", count: 2, interval: 9, enraged: "wraith" },
    phase2: { kind: "tide", every: 7, radius: 0, power: 0.5 },
  },
  warlord: {
    ...base, id: "warlord", name: "The Warlord", hp: 1300, speed: 15, radius: 32, gateDamage: 45, attackInterval: 1.6, gold: 60, color: "#5a1a1a",
    cost: 0, slowResist: 0.3, boss: true, behavior: "summoner", summon: { enemy: "footman", count: 3, interval: 5.5, enraged: "runner" }, phase2: { kind: "warcry", every: 10, radius: 260, power: 6 },
  },
  bloodlord: {
    ...base, id: "bloodlord", name: "The Blood Moon Warlord", hp: 3400, speed: 15, radius: 36, gateDamage: 70, attackInterval: 1.8, gold: 320, color: "#8a1a2a",
    cost: 0, slowResist: 0.25, boss: true, armor: 0.2, behavior: "summoner", summon: { enemy: "knight", count: 2, interval: 8, enraged: "runner" },
    // Phase 2: the moon flares every 12 s — every foe on the field runs wild for 5 s.
    phase2: { kind: "bloodmoon", every: 12, radius: 0, power: 5 },
  },
};

/** Short, player-facing traits derived from an enemy's stats (wave preview, info toasts). */
export function enemyTraits(d: EnemyDef): string[] {
  const t: string[] = [];
  if (d.boss) t.push("boss");
  if (d.flying) t.push("flies over the wall");
  if (d.behavior === "ranged") t.push("shoots from range");
  if (d.behavior === "healer") t.push("heals allies");
  if (d.aura) t.push("rallies nearby foes");
  if (d.towerHunter) t.push("dives at towers");
  if (d.tunneler) t.push("digs under the wall");
  if (d.arsonist) t.push("sets buildings ablaze");
  if (d.frostNova) t.push("freezes towers when hurt");
  if (d.phase2?.kind === "eruption") t.push("erupts lava when hurt");
  if (d.phase2?.kind === "tide") t.push("calls the tide when hurt");
  if (d.behavior === "summoner") t.push("summons minions");
  if (d.kamikaze) t.push("explodes on the wall");
  if (d.shield) t.push("shielded front");
  if (d.armor || d.armorCycle) t.push("armoured");
  if (d.regen) t.push("regenerates");
  if (d.splitsInto) t.push("splits when killed");
  if (d.crossing) t.push("runs off with coins");
  if (d.speed >= 60 && !d.flying) t.push("fast");
  return t;
}
