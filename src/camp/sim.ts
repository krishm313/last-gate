import { WEAPON_BY_ID, type WeaponId } from "../core/weapons";
import { CHAPTERS } from "../core/chapters";
import { ENEMIES, type EnemyDef, type EnemyId } from "../core/enemies";
import { chance, createRng, range, type Rng } from "../core/rng";
import { enemyHp, planWave, type ChapterDef, type Spawn } from "../core/waves";
import type { AbilityId } from "../core/heroes";
import { merchantPool, BLESSING_BY_ID, baseMods, rollBlessings, type Blessing, type CampMods } from "./blessings";
import {
  FOREST_Y, GATE_SEGMENTS, HALL, HERO_SPAWN, INCOME_PILE, MAP_H, MAP_W, SEGMENTS, SPAWN_Y, STEP,
  WALL_THICK, WALL_Y, segmentCenter, segmentIndexAt,
} from "./world";

export interface Vec {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------------------------
// Tuning

export const CAMP = {
  heroSpeed: 175,
  heroHp: 160,
  heroRegen: 6,
  heroRange: 175,
  heroDamage: 11,
  heroFireRate: 2.2,
  heroRespawn: 5,
  carryCap: 40,
  magnet: 85,
  pickupRange: 26,
  hallHp: 900,
  /** Camp-mode enemy HP multiplier (on top of chapter/wave scaling): base + per-wave ramp. */
  enemyHp: 1.15,
  enemyHpPerWave: 0.21,
  /** The hall's own archers shoot anything that gets close. */
  hallRange: 230,
  hallDamage: 10,
  hallRate: 1.6,
  segmentHp: 250,
  fortifyMult: 1.4,
  gateHp: 320,
  incomeEvery: 1.0,
  /** Coins per second the courier carries from the hall's pile to the King. */
  courierRate: 6,
  /** Coins dropped per point of enemy gold value. */
  dropMult: 1.5,
  incomeCap: 30,
  logCap: 20,
  bowCap: 10,
  lumberCap: 30,
  chopTime: 1.6,
  workerSpeed: 90,
  firstIntermission: 22,
  intermission: 18,
  /** Seconds between coins paid into a plot, at the start and at full speed. */
  paySlow: 0.11,
  payFast: 0.025,
  /** After a level completes, standing on the plot waits this long before paying into the next
   *  level (so finishing a build doesn't silently drain your purse into an upgrade you didn't mean). */
  upgradePause: 1.1,
  plotHalf: 34,
  arrowSpeed: 620,
};

/** Camp-mode per-chapter enemy HP tuning (the chapter tables are shared with the old gate mode). */
export const CAMP_CHAPTER_HP: Record<number, number> = { 1: 1, 2: 1.4, 3: 1.45, 4: 2.85, 5: 2.0, 6: 1.9, 7: 2.5, 8: 2.0, 9: 2.45, 10: 2.6, 98: 2.3, 99: 1 };

export const TOWER_LEVELS = [
  // level 1..4
  { damage: 9, range: 250, rate: 1.1, archers: 1 },
  { damage: 14, range: 270, rate: 1.35, archers: 2 },
  { damage: 21, range: 290, rate: 1.6, archers: 2 },
  { damage: 30, range: 310, rate: 1.9, archers: 3 },
  // level 5: Spec Mastery (the tower's Fire / Frost / Volley path, deepened)
  { damage: 34, range: 320, rate: 2.0, archers: 3 },
];
/** Spec Mastery (tower level 5): what each path gains. */
export const MASTERY_SPEC = { fireBurn: 2, fireTime: 1.5, frostSlow: 0.6, frostDmg: 1, volleyExtra: 4, volleyDmg: 0.65 };

// ---------------------------------------------------------------------------------------------
// State

export interface Enemy {
  id: number;
  def: EnemyDef;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attackTimer: number;
  flash: number;
  sway: number;
  hpMult: number;
  burnTime: number;
  burnDps: number;
  slowTime: number;
  slowPct: number;
  stunTime: number;
  abilityTimer: number;
  healTimer: number;
  age: number;
  enraged: boolean;
  /** Snare Field: seconds left rooted by the Warden (takes extra damage meanwhile). */
  snared?: number;
  /** Standing in acid: seconds left of the damage-taken bonus. */
  corroded?: number;
  /** Elite modifier (if any) and the Shielded elite's remaining shield. */
  elite?: EliteMod;
  shield?: number;
  /** Rallied by a Warlord's war cry for this many more seconds. */
  warcry?: number;
  /** Seconds until the boss's next phase-2 move. */
  phaseTimer?: number;
  /** Frost Wyrm: seconds until the next frost nova (phase 2). */
  novaTimer?: number;
  /** Inside a Banner-bearer's rallying aura this step (faster, tougher). */
  rallied?: boolean;
  /** Shadowstalker: seconds until its next blink. */
  blinkT?: number;
  /** Tunneler: seconds left digging under the wall (untargetable), and whether it has dug yet. */
  burrow?: number;
  dug?: boolean;
  /** Wall Climber: seconds left scaling the wall (hittable). */
  climb?: number;
  /** Behind a Shield Wall this step (takes less damage). */
  guarded?: boolean;
  /** What it is currently hitting, for rendering lunges. */
  attacking: boolean;
  inside: boolean;
  /** Sappers that blew themselves up (no gold). */
  exploded: boolean;
  /** Crossing enemies: x they run toward. */
  targetX?: number;
}

export type PlotKind = "tower" | "repair" | "fortify" | "lumber" | "forge" | "hall" | "catapult" | "barracks" | "spikes" | "mage" | "healer" | "watch";

export interface Plot {
  id: string;
  kind: PlotKind;
  label: string;
  x: number;
  y: number;
  level: number;
  maxLevel: number;
  /** Cost of each successive level (index = current level). Repeatable plots use the last cost × growth. */
  costs: number[];
  paid: number;
  /** Logs needed per level (0 = none) and logs paid so far. */
  logCosts: number[];
  paidLogs: number;
  /** Tower runtime state. */
  cooldown: number;
  facing: number;
  fired: number;
  /** Towers: bows delivered from the forge (each adds damage). */
  bows: number;
  /** Hidden until unlocked (by upgrading the hall, or reaching `unlockWave`). */
  locked: boolean;
  /** Becomes available after this many waves have been held. */
  unlockWave?: number;
  /** Archer towers: specialisation chosen on reaching level 3 (unset until chosen). */
  spec?: TowerSpec;
  /** Seconds left of a War Raven's stun (the tower doesn't shoot). */
  stun?: number;
  /** Set ablaze by a Fire Imp: the building stops working until it burns out or the hero stamps it out. */
  fire?: number;
}

/** Spike trap: a strip of stakes in front of the gate that wounds and slows foes walking through. */
export const SPIKES = { x0: 300, x1: 420, y0: WALL_Y - 78, y1: WALL_Y - 18, dps: [10, 16, 24, 30], slow: [0.25, 0.3, 0.35, 0.45] };
/** Building masteries (top levels a balance bot never buys): catapult flames, mage stun. */
export const BUILD_MASTERY = { catapultBurn: 0.35, catapultBurnTime: 3, mageStun: 0.5 };
/** The level each building topped out at before its mastery level (the balance bot stops here). */
export const PRE_MASTERY: Partial<Record<PlotKind, number>> = { tower: 4, catapult: 3, mage: 3, spikes: 3, barracks: 3, healer: 3, watch: 2 };
/** Barracks Veterans (mastery): the garrison's soldiers are tougher, hit harder and get up sooner. */
export const VETERANS = { hp: 1.6, damage: 1.5, respawn: 4 };
function veterans(c: Camp): boolean {
  return c.plots.some((p) => p.kind === "barracks" && p.level > (PRE_MASTERY.barracks ?? 99));
}

/** Mage tower: chain lightning that ignores armour (level 1..3). */
export const MAGE_LEVELS = [
  { damage: 24, range: 300, every: 2.4, chains: 2 },
  { damage: 34, range: 320, every: 2.0, chains: 3 },
  { damage: 48, range: 340, every: 1.7, chains: 4 },
  // level 4: Storm Mastery — the first foe struck is stunned for a moment
  { damage: 52, range: 350, every: 1.6, chains: 5 },
];
export const MAGE = { hop: 110, falloff: 0.8 };
/** Banner-bearer aura (kept in one place so the sim and the renderer agree). */
export const RALLY = { radius: 120, speed: 0.3, armor: 0.25 };
/** Blood moon flare: foes move faster and attack more often; the hall's archers fire harder. */
export const BLOODMOON = { speed: 1.35, attack: 1.25, hall: 1.25 };
/** Healer's tent: heals the King and soldiers within its radius, and slowly mends the whole wall. */
export const HEALER_LEVELS = [
  { radius: 200, heal: 6, wall: 0.004 },
  { radius: 230, heal: 10, wall: 0.007 },
  { radius: 260, heal: 15, wall: 0.011 },
  // level 4: Sanctum Mastery
  { radius: 300, heal: 21, wall: 0.016 },
];

/** Night weather: rolled per night from the seed (deterministic), from night 3 on, never on breathers. */
export type Weather = "clear" | "rain" | "fog" | "storm";
export const WEATHER = {
  rain: { towerRange: 0.85, burn: 0.5 },
  fog: { towerRange: 0.75, heroRange: 0.8 },
  storm: { every: 3.2, damage: 34, stun: 0.6 },
  /** Chance of each weather on an eligible night. */
  odds: { rain: 0.15, fog: 0.12, storm: 0.13 },
};
export const WEATHER_INFO: Record<Weather, { name: string; icon: string; desc: string }> = {
  clear: { name: "Clear", icon: "🌙", desc: "" },
  rain: { name: "Rain", icon: "🌧️", desc: "Towers −15% range · fire burns weaker" },
  fog: { name: "Fog", icon: "🌫️", desc: "Towers −25% range · the King sees less" },
  storm: { name: "Storm", icon: "⛈️", desc: "Lightning strikes your foes!" },
};
export function rollWeather(seed: number, wave: number, breather: boolean, odds: { rain: number; fog: number; storm: number } = WEATHER.odds): Weather {
  if (wave < 3 || breather) return "clear";
  // Hash (seed, wave) to [0,1) without touching the run's RNG stream.
  let h = (seed * 374761393 + wave * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  const u = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  const o = odds;
  return u < o.rain ? "rain" : u < o.rain + o.fog ? "fog" : u < o.rain + o.fog + o.storm ? "storm" : "clear";
}
/** Night events: some nights bring a twist (announced at nightfall). */
export type NightEvent = "treasure" | "elite" | "swarm";
export const NIGHT_EVENT_INFO: Record<NightEvent, { icon: string; name: string; desc: string }> = {
  treasure: { icon: "💰", name: "Treasure Night", desc: "Foes drop double coins — and goblins are out" },
  elite: { icon: "🎖️", name: "Elite Raid", desc: "Fewer foes, but many elites — hold for a big dawn bonus" },
  swarm: { icon: "🐀", name: "Swarm Night", desc: "Twice the foes, each half as tough" },
};
export const NIGHT_EVENTS = { chance: 0.25, eliteChance: 0.2, eliteBonus: (wave: number) => 10 + 3 * wave, treasureGold: 2, swarmHp: 0.5, thiefAt: 14 };

/** Daytime visitors: a Cursed Shrine (opt-in Elite Raid) or a Wandering Merchant selling one blessing. */
export type VisitorKind = "shrine" | "merchant";
export interface Visitor {
  kind: VisitorKind;
  x: number;
  y: number;
  /** Merchant: coins paid so far / the price; shrine: seconds stood on it. */
  paid: number;
  price: number;
  stand: number;
  /** Merchant: time banked toward the next coin. */
  acc: number;
  /** Merchant: the blessing on sale. */
  offer: string | null;
  done: boolean;
}
export const VISITOR = { chance: 0.3, spot: { x: 360, y: 872 }, radius: 36, shrineHold: 1.3, payEvery: 0.07 };
const RARITY_PRICE: Record<string, [number, number]> = { common: [8, 1.5], rare: [12, 2], epic: [16, 3], legendary: [22, 4] };

function hash01(seed: number, wave: number, salt: number): number {
  let h = (seed * 2654435761 + wave * 40503 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 15), 2654435761);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Tomorrow's visitor (or none), hashed from (seed, wave) — never touches the run's RNG. */
export function rollVisitor(c: Camp): Visitor | null {
  if (c.reverse || c.classicBlessings || c.chapter.id === 98 || c.wave < 2) return null;
  if (!c.chapter.endless && c.wave >= c.chapter.waves.length - 1) return null; // not before the final night
  const u = hash01(c.seed, c.wave, 7);
  if (u >= VISITOR.chance) return null;
  const base = { x: VISITOR.spot.x, y: VISITOR.spot.y, paid: 0, stand: 0, acc: 0, done: false };
  if (u < VISITOR.chance * 0.45) return { ...base, kind: "shrine", price: 0, offer: null };
  const pool = merchantPool(c.owned, new Set(c.plots.filter((p) => p.level > 0).map((p) => p.kind)));
  if (!pool.length) return null;
  const b = pool[Math.floor(hash01(c.seed, c.wave, 11) * pool.length)]!;
  const [p0, pw] = RARITY_PRICE[b.rarity]!;
  return { ...base, kind: "merchant", price: Math.round(p0 + pw * c.wave), offer: b.id };
}

/** Tonight's event (or none), hashed from (seed, wave) so it never touches the run's RNG stream. */
export function rollNightEvent(seed: number, wave: number, ok: boolean): NightEvent | null {
  if (!ok || wave < 3) return null;
  let h = (seed * 2246822519 + wave * 3266489917) | 0;
  h = Math.imul(h ^ (h >>> 15), 2654435761);
  const u = ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  if (u >= NIGHT_EVENTS.chance) return null;
  const k = u / NIGHT_EVENTS.chance;
  // (Elite Raid is opt-in only: the Cursed Shrine.)
  return k < 0.55 ? "treasure" : "swarm";
}

/** Bad-weather odds scaled (Hard / Nightmare), never past 85% in total. */
export function scaleOdds(o: { rain: number; fog: number; storm: number }, k: number): { rain: number; fog: number; storm: number } {
  if (k === 1) return o;
  const sum = (o.rain + o.fog + o.storm) * k;
  const f = sum > 0.85 ? (0.85 / sum) * k : k;
  return { rain: o.rain * f, fog: o.fog * f, storm: o.storm * f };
}
/** Nightmare's Blood Moon surge: when it strikes in the night and how long it lasts. */
export const BLOOD_SURGE = { at: 10, secs: 16 };

/** Multiplier on tower / mage range from tonight's weather. */
export function weatherRange(c: Camp): number {
  return c.weather === "rain" ? WEATHER.rain.towerRange : c.weather === "fog" ? WEATHER.fog.towerRange : 1;
}

/** Elite foes (Hard / Nightmare, deep Endless): one modifier each, tougher, richer. */
export type EliteMod = "swift" | "armored" | "vampiric" | "splitting" | "shielded";
export const ELITE_MODS: EliteMod[] = ["swift", "armored", "vampiric", "splitting", "shielded"];
export const ELITE_INFO: Record<EliteMod, { name: string; icon: string; color: string }> = {
  swift: { name: "Swift", icon: "💨", color: "#7ae0ff" },
  armored: { name: "Armored", icon: "🛡️", color: "#c8ccd8" },
  vampiric: { name: "Vampiric", icon: "🩸", color: "#ff4a5a" },
  splitting: { name: "Splitting", icon: "🧬", color: "#8aef6a" },
  shielded: { name: "Shielded", icon: "🔷", color: "#6aa0ff" },
};
export const ELITE = { hp: 1.6, gold: 3, speed: 1.4, armor: 0.35, vampHeal: 0.06, splitHp: 0.3, shield: 0.3 };
/** Elite chance for a spawn: the run's setting, rising in Endless past night 10. */
export function eliteChance(c: Camp): number {
  const endless = c.chapter.endless && c.wave > 10 ? Math.min(0.2, 0.05 + 0.01 * (c.wave - 10)) : 0;
  return Math.max(c.eliteChance, endless) + (c.nightEvent === "elite" ? NIGHT_EVENTS.eliteChance : 0);
}

/** Tower specialisations, offered when a tower reaches level 3. */
export type TowerSpec = "fire" | "frost" | "volley";
export const TOWER_SPEC_LEVEL = 3;
export const TOWER_SPECS: Record<TowerSpec, { name: string; icon: string; desc: string; short: string }> = {
  fire: { name: "Fire Archers", icon: "🔥", desc: "Arrows set foes ablaze: burning damage over time.", short: "Burns foes" },
  frost: { name: "Frost Archers", icon: "❄️", desc: "Arrows chill foes: they move 40% slower.", short: "Slows foes" },
  volley: { name: "Volley Archers", icon: "🏹", desc: "Each shot also hits 2 more foes nearby.", short: "Hits 3 at once" },
};
/** Tuning for the specialisations. */
/** Building draft (pick which new building opens first). Off: the owner found two prompts per dawn
 *  too much to read mid-game ("it was better before") — everything unlocks together again. */
export const BUILD_DRAFT = false;

/** Rule-changing blessings: tuning. */
export const RICOCHET = { range: 110, damage: 0.6 };
export const THORNS = { scale: 1 };
export const WILDFIRE = { range: 55, dps: 0.8 };
export const BANNER_R = 130;
export const SPEC = { fireBurn: 0.45, fireTime: 3, frostSlow: 0.4, frostTime: 1.6, frostDmg: 0.9, volleyExtra: 2, volleyDmg: 0.55 };

export interface Coin {
  id: number;
  x: number;
  y: number;
  /** Pop-out velocity when dropped. */
  vx: number;
  vy: number;
  z: number;
  vz: number;
  /** Being pulled to the hero. */
  homing: boolean;
}

export interface Arrow {
  id: number;
  x: number;
  y: number;
  target: number;
  damage: number;
  owner: "hero" | "tower";
  life: number;
  angle: number;
  /** Fired by a specialised tower: applies its effect on hit. */
  spec?: TowerSpec;
  /** Hawkeye: chance this tower arrow crits (towers normally can't). */
  crit?: number;
  /** Fired by a Spec-Mastery tower (its path's effect is stronger). */
  master?: boolean;
  /** The King's weapon that fired it (crossbow bolts pierce, staff orbs burst). */
  weapon?: WeaponId;
  /** Ricochet: bounces left, and the foes already hit (no bouncing back). */
  bounce?: number;
  hit?: number[];
}

export interface Bolt {
  x: number;
  y: number;
  vy: number;
  damage: number;
  kind: "bolt" | "fireball" | "frost";
  /** The wall segment it will hit. */
  seg: number;
}

export interface Hero {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  coins: number;
  logs: number;
  bows: number;
  cooldown: number;
  facing: number;
  /** Seconds since last damage (regen kicks in after a while). */
  sinceHit: number;
  dead: boolean;
  respawn: number;
  moving: boolean;
  /** Time spent continuously paying into the current plot (accelerates payment). */
  payTime: number;
  payTimer: number;
  payingPlot: string | null;
}

export type CampEvent =
  | { type: "shoot"; owner: "hero" | "tower" | "enemy" | "catapult"; x: number; y: number }
  | { type: "hit"; x: number; y: number; damage: number; crit: boolean; owner: string; eid?: number }
  | { type: "kill"; x: number; y: number; enemy: EnemyDef; gold: number; eid: number; elite?: boolean }
  | { type: "coinPickup"; x: number; y: number }
  /** A coin sent from the hall's pile straight to the King (wherever he is). */
  | { type: "courier"; x: number; y: number }
  | { type: "coinSpend"; from: Vec; to: Vec }
  | { type: "logSpend"; from: Vec; to: Vec }
  | { type: "logPickup"; x: number; y: number }
  | { type: "chop"; x: number; y: number }
  | { type: "logsDelivered"; n: number }
  | { type: "forged"; x: number; y: number }
  | { type: "bowDeliver"; from: Vec; to: Vec }
  | { type: "build"; plot: string; kind: PlotKind; level: number; x: number; y: number }
  /** A tower reached the specialisation level: the player picks Fire / Frost / Volley. */
  | { type: "specChoice"; plot: string }
  | { type: "specHit"; spec: TowerSpec; x: number; y: number }
  /** Building draft resolved (the chosen kind opens now). */
  | { type: "buildChosen"; kind: PlotKind }
  /** Visitors: arrived at dawn, accepted (shrine) / bought (merchant), left at nightfall. */
  | { type: "visitor"; kind: VisitorKind; action: "arrive" | "accept" | "buy" | "leave"; x: number; y: number; id?: string }
  /** A rule-changing blessing fired (for its visual): ricochet, thorns, wildfire, cull, volley. */
  | { type: "rule"; rule: "ricochet" | "thorns" | "wildfire" | "cull" | "volley"; x: number; y: number }
  | { type: "spikeHit"; x: number; y: number }
  | { type: "towerStunned"; plot: string; x: number; y: number; frozen?: boolean }
  | { type: "frostNova"; x: number; y: number; r: number }
  | { type: "ablaze"; plot: string; x: number; y: number }
  | { type: "fireOut"; x: number; y: number }
  | { type: "eliteSpawn"; x: number; y: number; mod: EliteMod; name: string }
  | { type: "shieldBreak"; x: number; y: number }
  | { type: "bossSlam"; x: number; y: number; r: number }
  | { type: "warcry"; x: number; y: number; r: number }
  | { type: "bloodmoon"; x: number; y: number }
  | { type: "graverise"; x: number; y: number; spots: Vec[] }
  | { type: "curse"; x: number; y: number; r: number }
  | { type: "tide"; y: number; h: number }
  | { type: "eruption"; x: number; y: number; pools: { x: number; y: number; r: number }[] }
  /** Boss signatures: the Bone Dragon's fire breath across the wall (x0..x1), the Colossus's quake, the Troll's bog spit. */
  | { type: "breath"; x: number; y: number; x0: number; x1: number }
  /** The King's weapon: a crossbow bolt punching through (from → to), a staff orb bursting. */
  | { type: "pierce"; x: number; y: number; tx: number; ty: number }
  | { type: "orbBurst"; x: number; y: number; r: number }
  | { type: "quake"; x: number; y: number; r: number }
  | { type: "bog"; x: number; y: number; pools: { x: number; y: number; r: number }[] }
  | { type: "boulderThrow"; x: number; y: number; tx: number; ty: number; dur: number }
  | { type: "burrow"; x: number; y: number }
  | { type: "blink"; x0: number; y0: number; x: number; y: number }
  | { type: "flask"; x: number; y: number }
  | { type: "acidSplash"; x: number; y: number; r: number; n: number }
  | { type: "emerge"; x: number; y: number }
  /** Wall Climber starts up the wall / drops over it inside the camp. */
  | { type: "climb"; x: number; y: number }
  | { type: "climbOver"; x: number; y: number }
  /** Balloon Bomber lets a bomb go: it falls from (x, y) onto (tx, ty). */
  | { type: "bombDrop"; x: number; y: number; tx: number; ty: number }
  /** Mage tower bolt: the chain's path from the crystal through each foe struck. */
  | { type: "mageZap"; points: Vec[] }
  /** Healer's tent mended someone (throttled): green motes rise from each point. */
  | { type: "tentHeal"; points: Vec[] }
  | { type: "specChosen"; plot: string; spec: TowerSpec; x: number; y: number }
  | { type: "wallHit"; seg: number; x: number; y: number; damage: number }
  | { type: "wallBreak"; seg: number; x: number; y: number }
  | { type: "hallHit"; x: number; y: number; damage: number }
  | { type: "heroHit"; x: number; y: number; damage: number }
  | { type: "heroDown"; x: number; y: number }
  | { type: "heroRespawn" }
  | { type: "summon"; x: number; y: number }
  | { type: "heal"; x: number; y: number; r: number }
  | { type: "enrage"; x: number; y: number; name: string }
  | { type: "bossSpawn"; name: string; x: number; y: number }
  | { type: "sapper"; x: number; y: number }
  | { type: "waveStart"; wave: number; breather: boolean; boss: string | null; intro: string | null; weather: Weather; event?: NightEvent }
  /** Storm weather: a lightning bolt strikes a foe. */
  | { type: "stormBolt"; x: number; y: number }
  | { type: "earlyBonus"; coins: number }
  | { type: "waveClear"; wave: number; bonus: number }
  | { type: "offers" }
  | { type: "ability"; id: AbilityId; x: number; y: number }
  | { type: "abilityReady" }
  | { type: "levelUp"; level: number; x: number; y: number }
  | { type: "allyDown"; x: number; y: number }
  | { type: "plotUnlocked"; label: string; x: number; y: number }
  | { type: "thief"; x: number; y: number }
  | { type: "thiefEscaped" }
  | { type: "boom"; x: number; y: number; r: number; kind: "nova" | "bash" | "boulder" | "firestorm" | "snare"; n?: number }
  | { type: "lance"; x: number; y: number; x2: number; y2: number; n: number }
  | { type: "noTarget"; x: number; y: number; text?: string }
  | { type: "deploy"; id: EnemyId; lane: number; count: number }
  | { type: "sanctuary"; x: number; y: number; healed: number }
  | { type: "callToArms"; x: number; y: number; n: number }
  | { type: "blessing"; id: string }
  | { type: "won" }
  | { type: "lost" };

export type Phase = "build" | "pick" | "wave" | "won" | "lost";

export interface CampInput {
  /** Desired movement direction, length 0..1. */
  move: Vec;
  /** Start the next wave now (during build phase). */
  callWave?: boolean;
  /** Use the hero ability (ignored unless charged). */
  ability?: boolean;
}

export interface Camp {
  /** This run's camp layout (mirrored pads and their drop-off spots). */
  lay: CampLayout;
  /** The King's weapon this run. */
  weapon: WeaponId;
  /** Tonight has a boss (no Nightmare Blood Moon surge on those). */
  bossNight?: boolean;
  /** Building draft waiting on the player (kinds to choose from), else null. */
  buildChoice: PlotKind[] | null;
  /** Today's visitor in camp (build phase only). */
  visitor: Visitor | null;
  /** The shrine was accepted: tonight is an Elite Raid, and the next pick adds a rule card. */
  cursed: boolean;
  shrineReward: boolean;
  /** Set by the balance bot each step: visitors are a player's choice, so the bot never triggers them. */
  botDriven?: boolean;
  /** Tonight's event (null on ordinary nights). */
  nightEvent: NightEvent | null;
  /** Treasure Night: whether the mid-night goblin has run yet. */
  eventThief: boolean;
  /** Golden Volley: coins picked up toward the next ring of arrows. */
  coinVolley: number;
  seed: number;
  rng: Rng;
  chapter: ChapterDef;
  time: number;
  phase: Phase;
  /** Seconds until the next wave (build phase). */
  timer: number;
  wave: number;
  waveTime: number;
  queue: Spawn[];
  hero: Hero;
  workers: Worker[];
  allies: Ally[];
  lumberPile: number;
  forgeLogs: number;
  forgeBows: number;
  forgeTimer: number;
  hallHp: number;
  hallMaxHp: number;
  segments: { hp: number; maxHp: number }[];
  plots: Plot[];
  enemies: Enemy[];
  coins: Coin[];
  arrows: Arrow[];
  bolts: Bolt[];
  /** Boulders lobbed by the Siege Golem (phase 2): land on a tower and stun it. */
  lobs: { x: number; y: number; plot: string; t: number; dur: number; stun: number }[];
  /** Lava pools from the Magma Titan's eruptions: burn whoever stands in them (hero, soldiers, foes). */
  pools: { x: number; y: number; r: number; t: number; dur: number; dps: number; /** Marsh Troll's bog: slows instead of burning. */ bog?: number }[];
  /** Drowned King's tides: a band of water (y..y+h) that slows everyone wading through it. */
  tides: { y: number; h: number; t: number; dur: number; slow: number }[];
  incomePile: number;
  incomeTimer: number;
  /** Royal courier: time banked toward the next coin sent from the hall's pile to the King. */
  courierTimer: number;
  /** Throttle for the spike trap's hit event. */
  spikeFx: number;
  /** Throttle for the healer's heal event. */
  healFx: number;
  /** Tonight's weather (always clear by day). */
  weather: Weather;
  /** Storm: seconds to the next lightning strike. */
  stormTimer: number;
  hallCooldown: number;
  /** Palisade level: 0 wood, 1 banded, 2 stone, 3 stone + battlements. */
  wallLevel: number;
  mods: CampMods;
  heroLook: string;
  /** Cosmetic trail / halo around the hero (render only). */
  heroFlair: string;
  heroVet: boolean;
  crit: number;
  ability: AbilityId;
  abilityCooldown: number;
  /** Hero mastery: ability strength multiplier. */
  abilityPower: number;
  /** 0..1, usable at 1 (charges during waves). */
  abilityCharge: number;
  overclock: number;
  /** Blood moon flare: seconds left of every foe running wild (the Blood Moon Warlord's phase 2). */
  bloodmoon: number;
  enemyHpMult: number;
  /** Share of fresh spawns that become elites (difficulty). */
  eliteChance: number;
  tideEvery: number;
  classicBlessings: boolean;
  /** Siege Lord state (null in a normal run). */
  reverse: ReverseState | null;
  tideTimer: number;
  heroLevel: number;
  heroXp: number;
  /** Run stats for the end screen / loss tips. */
  runStats: { breaches: number; flyerHallDamage: number; heroDeaths: number; bosses: number; dmg: Record<string, number>; stuns?: number; fires?: number; burnTime?: number; tunnelers?: number; casts?: number; flares?: number };
  strikes: { x: number; y: number; t: number; total: number; damage: number; radius?: number; fromX?: number; fromY?: number; burn?: boolean }[];
  /** Acid pools (the Alchemist): `delay` until the flask lands, then `t` seconds left. */
  acid: { x: number; y: number; r: number; t: number; delay: number; dps: number; fromX: number; fromY: number }[];
  owned: Record<string, number>;
  offers: Blessing[];
  rerollsUsed: number;
  nextId: number;
  kills: number;
  goldEarned: number;
  events: CampEvent[];
}

function makePlot(id: string, kind: PlotKind, label: string, x: number, y: number, costs: number[], maxLevel: number, logCosts: number[] = []): Plot {
  return { id, kind, label, x, y, level: 0, maxLevel, costs, paid: 0, logCosts, paidLogs: 0, cooldown: 0.5, facing: -Math.PI / 2, fired: 9, bows: 0, locked: false };
}

/** Lumber: a grove of choppable trees along the camp's west edge, and the log pile by the lumber camp. */
export const GROVE = [700, 770, 840, 910, 980, 1050, 1120].map((y, i) => ({ x: 46 + (i % 2) * 22, y }));
export const LUMBER_PILE = { x: 236, y: 860 };
/** Forge: drop logs at the input, collect bows from the output. */
export const FORGE_IN = { x: 520, y: 935 };
export const FORGE_OUT = { x: 640, y: 935 };
/** Per-run camp layout: half of all runs mirror the inner camp left↔right (lumber camp, forge, barracks,
 *  catapults, Mage Tower, healer, watchtower, the wood grove and every drop-off spot), so runs don't all
 *  look and route the same. Towers, the wall, the gate, the spike field and the hall are symmetric about
 *  the road and stay put; the towers, the hero's spawn and the enemy lanes mirror with it, so it is
 *  an exact reflection and balance-neutral. (Shuffling the front-row pads was tried and dropped: where the Mage Tower and
 *  Spike Trap stand changes what they hit and how often they burn — not balance-neutral.) */
export interface CampLayout {
  mirror: boolean;
  lumberPile: Vec;
  forgeIn: Vec;
  forgeOut: Vec;
  grove: Vec[];
  incomePile: Vec;
  heroSpawn: Vec;
}
export function campLayout(mirror: boolean): CampLayout {
  const m = (v: Vec): Vec => (mirror ? { x: MAP_W - v.x, y: v.y } : { x: v.x, y: v.y });
  return { mirror, lumberPile: m(LUMBER_PILE), forgeIn: m(FORGE_IN), forgeOut: m(FORGE_OUT), grove: GROVE.map(m), incomePile: m(INCOME_PILE), heroSpawn: m(HERO_SPAWN) };
}
/** The layout a run gets, hashed from its seed (never touches the run's RNG). Chapter 1 (where new
 *  players learn the camp), daily runs and Siege Lord keep the classic layout. */
export function layoutFor(seed: number, chapterId: number, classic: boolean): CampLayout {
  return campLayout(!classic && chapterId !== 1 && hash01(seed, 0, 31) >= 0.5);
}
/** Apply a layout to freshly made plots (in place). */
function applyLayout(plots: Plot[], lay: CampLayout): void {
  if (lay.mirror) for (const p of plots) p.x = MAP_W - p.x;
  // (Enemy lanes mirror too — see spawnEnemy — so a mirrored run plays exactly like the classic one, reflected.)
}
export const BOWS_PER_TOWER = 10;
export const BOW_DAMAGE = 0.06;

/** Allied soldier from the barracks: guards a post behind the gate and fights anything that gets in. */
export interface Ally {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  cooldown: number;
  postX: number;
  postY: number;
  /** Seconds until respawn while dead (0 = alive). */
  respawn: number;
  facing: number;
  swinging: number;
  /** Militia summoned by the Marshal: seconds left before they march off (no respawn). */
  temp?: number;
}

/** The Marshal's Call to Arms: militia summoned beside him. */
export const MILITIA = { count: 4, life: 12, hp: 70 };

export const BARRACKS = { x: 620, y: 715 };
/**
 * Siege Lord (reverse mode): the player commands the horde. Each "push" lasts REVERSE.push seconds;
 * between pushes the defenders get their usual build phase. Take the hall within REVERSE.pushes.
 */
export const REVERSE = { push: 45, pushes: 8, startChest: 20, income: 4, cap: 80, wallBounty: 10, unitHp: 1.4, repairLull: 8 };
/** War cards: what a card sends, how many, and its cost from the War Chest. */
/** `unlock`: how many sieges must be won (with stars) before the card joins the deck. */
export const WAR_CARDS: { id: EnemyId; count: number; cost: number; unlock?: number; hp?: number }[] = [
  { id: "footman", count: 3, cost: 3 },
  { id: "runner", count: 3, cost: 3 },
  { id: "shield", count: 2, cost: 4 },
  { id: "crossbow", count: 2, cost: 4 },
  { id: "brute", count: 1, cost: 4 },
  { id: "bat", count: 3, cost: 4, hp: 2.2 },
  { id: "sapper", count: 1, cost: 5 },
  { id: "ram", count: 1, cost: 7 },
  { id: "raven", count: 3, cost: 3, unlock: 1, hp: 2 },
  { id: "tunneler", count: 2, cost: 6, unlock: 2 },
  { id: "imp", count: 3, cost: 5, unlock: 3 },
  { id: "shaman", count: 1, cost: 7, unlock: 4 },
  { id: "knight", count: 2, cost: 8, unlock: 5 },
  { id: "stalker", count: 2, cost: 6, unlock: 6 },
];
/** Is this war card in the deck, given how many sieges have been won? */
export function cardOpen(card: { unlock?: number }, won: number): boolean {
  return (card.unlock ?? 0) <= won;
}
/** The three sieges: the defenders' upgrade level and hero rise (campaign bot plays them). */
export const SIEGES: { name: string; chapter: number; perm: number; hero: "ranger" | "knight" | "cleric" | "marshal" | "alchemist"; needs?: number; hordeHp?: number }[] = [
  { name: "Raid on the Border Keep", chapter: 1, perm: 0, hero: "ranger" },
  { name: "The Keep Stands Ready", chapter: 1, perm: 2, hero: "ranger" },
  { name: "The Captain's Last Stand", chapter: 1, perm: 3, hero: "knight" },
  /** On Frostpeak's snow (needs chapter 6 cleared); the chapter's horde strength helps the attacker, so the walls are much stronger. */
  { name: "The Frost Citadel", chapter: 6, perm: 6, hero: "cleric", needs: 6, hordeHp: 0.99 },
  /** The finale on the Hollow Throne's ground: max-level walls under the Marshal; the horde is a touch frailer there. */
  { name: "The Hollow Keep", chapter: 10, perm: 10, hero: "marshal", needs: 10, hordeHp: 1 },
  /** On the Bloodmoon Moors after the Hollow Keep: the Alchemist's acid melts clumped pushes, so the walls are lower (L8) and the horde a bit tougher. */
  // (hordeHp retuned when the castle stopped repairing mid-push: Frost Citadel 1 → 0.99, Hollow Keep 0.96 → 1, Alchemist 1.08 → 1.01.)
  { name: "The Alchemist's Tower", chapter: 9, perm: 8, hero: "alchemist", needs: 10, hordeHp: 1.01 },
];
/** Stars for a taken hall: by push 8 / 6 / 4. */
export function siegeStars(push: number): number {
  return push <= 4 ? 3 : push <= 6 ? 2 : push <= REVERSE.pushes ? 1 : 0;
}
/** Lane x positions where the horde can be sent in (left, middle, right). */
export const LANES_X = [MAP_W * 0.2, MAP_W * 0.5, MAP_W * 0.8];
export interface ReverseState {
  chest: number;
  /** Set when the siege ends: the player took the hall ("win") or ran out of pushes ("lose"). */
  result: "win" | "lose" | null;
  deployed: number;
  broken: number;
  /** Sieges already won (opens the later war cards). */
  won: number;
  /** Health multiplier on the horde's units (late sieges hand the attacker a handicap). */
  hordeHp: number;
}

/** Siege Lord: send a war card down a lane. Returns false if it can't be afforded or it isn't a push. */
export function deploy(c: Camp, id: EnemyId, lane: number): boolean {
  const r = c.reverse;
  const card = WAR_CARDS.find((k) => k.id === id);
  if (!r || !card || !cardOpen(card, r.won) || c.phase !== "wave" || r.chest < card.cost) return false;
  r.chest -= card.cost;
  const x = LANES_X[Math.max(0, Math.min(2, Math.floor(lane)))]!;
  for (let i = 0; i < card.count; i++) spawnEnemy(c, { at: 0, enemy: id, hpMult: REVERSE.unitHp * (card.hp ?? 1) * r.hordeHp, lane: null }, { x: x + (i - (card.count - 1) / 2) * 22, y: SPAWN_Y - i * 8 });
  r.deployed += card.count;
  c.events.push({ type: "deploy", id, lane, count: card.count });
  return true;
}

/** The Cleric's Sanctuary: share of max HP restored to the hall and to each standing wall section. */
export const SANCTUARY = { hall: 0.05, wall: 0.12 };
/** The Lancer's Piercing Lance: a line this long and this wide (plus the foe's radius). */
export const LANCE = { length: 480, width: 30, damage: 4.5, push: 60 };
/** The Warden's Snare Field. */
export const SNARE = { radius: 240, time: 3, bossTime: 1, vuln: 1.3 };
/** The Alchemist's Acid Flask: flight time, pool radius and life, damage per second (× hero damage), damage-taken bonus inside. */
export const ACID = { flight: 0.55, radius: 95, life: 5, dps: 2.6, vuln: 1.25 };
/** Watchtower: archer towers within reach shoot farther and faster, and fog/rain don't shorten them. */
export const WATCH = { x: 480, y: 935 };
export const WATCH_LEVELS = [
  { radius: 340, range: 0.25, rate: 0.15 },
  { radius: 420, range: 0.4, rate: 0.25 },
  // level 3: Eagle Eye Mastery
  { radius: 500, range: 0.5, rate: 0.32 },
];
/** The Watchtower's boost for an archer tower (none if it isn't built or the tower is out of reach). */
export function watchBoost(c: Camp, t: Plot): { range: number; rate: number; clear: boolean } {
  const w = c.plots.find((q) => q.kind === "watch");
  if (!w || w.level === 0 || onFire(w)) return { range: 1, rate: 1, clear: false };
  const st = WATCH_LEVELS[w.level - 1]!;
  if ((t.x - w.x) ** 2 + (t.y - w.y) ** 2 > st.radius ** 2) return { range: 1, rate: 1, clear: false };
  return { range: 1 + st.range, rate: 1 + st.rate, clear: true };
}
export const ALLY = { hp: 90, damage: 9, rate: 1.1, speed: 95, reach: 20, aggro: 230, respawn: 8 };

export interface Worker {
  id: number;
  x: number;
  y: number;
  state: "toTree" | "chop" | "toPile";
  t: number;
  tree: number;
  carrying: boolean;
}

/** Starting conditions from meta progression (permanent upgrades + hero). */
export interface CampSetup {
  mods?: CampMods;
  startCoins?: number;
  /** Tower plot ids that start already built at level 1. */
  prebuilt?: string[];
  /** Hero colour/look id for rendering. */
  heroLook?: string;
  heroFlair?: string;
  /** Wearing the hero's Veteran look (render only). */
  heroVet?: boolean;
  critChance?: number;
  ability?: AbilityId;
  abilityCooldown?: number;
  /** Hero mastery: ability strength multiplier (1 = normal). */
  abilityPower?: number;
  /** Extra enemy HP multiplier (daily twists). */
  enemyHpMult?: number;
  eliteChance?: number;
  /** Tidal Week (Endless twist): a tide rolls in every this many seconds of night (0 = never). */
  tideEvery?: number;
  /** Blessings granted at the start of the run. */
  startBlessings?: string[];
  /** Daily runs: offer only the classic blessing pool (keeps a day's offers the same for everyone). */
  classicBlessings?: boolean;
  /** Siege Lord (reverse mode): the player sends the horde; the defence is played by the bot. */
  reverse?: boolean;
  /** The King's weapon (default: the hero's own attack). */
  weapon?: WeaponId;
  /** Force a camp layout (tests, tools); default: hashed from the seed. */
  layout?: CampLayout;
  /** Siege Lord: sieges already won (opens the later war cards). */
  siegesWon?: number;
  /** Siege Lord: health multiplier on the horde's units (default 1). */
  hordeHp?: number;
}

export function createCamp(seed: number, chapter: ChapterDef = CHAPTERS[0]!, setup: CampSetup = {}): Camp {
  const mods = setup.mods ?? baseMods();
  const segments = Array.from({ length: SEGMENTS }, (_, i) => {
    const maxHp = Math.round((GATE_SEGMENTS.includes(i) ? CAMP.gateHp : CAMP.segmentHp) * mods.wallHp);
    return { hp: maxHp, maxHp };
  });
  const towerY = WALL_Y + 42;
  const plots: Plot[] = [
    makePlot("tower-1", "tower", "Archer Tower", 90, towerY, [10, 35, 80, 150, 260], 5, [0, 0, 6, 12, 20]),
    makePlot("tower-2", "tower", "Archer Tower", 250, towerY, [20, 45, 95, 170, 280], 5, [0, 0, 6, 12, 20]),
    makePlot("tower-3", "tower", "Archer Tower", 470, towerY, [20, 45, 95, 170, 280], 5, [0, 0, 6, 12, 20]),
    makePlot("tower-4", "tower", "Archer Tower", 630, towerY, [30, 55, 110, 190, 300], 5, [0, 0, 6, 12, 20]),
    { ...makePlot("lumber", "lumber", "Lumber Camp", 150, 850, [15, 40, 80], 3), locked: true, unlockWave: 1 },
    { ...makePlot("forge", "forge", "Forge", 580, 850, [30, 70], 2, [0, 8]), locked: true, unlockWave: 3 },
    { ...makePlot("barracks", "barracks", "Barracks", BARRACKS.x, BARRACKS.y, [35, 60, 100, 170], 4, [4, 8, 12, 18]), locked: true, unlockWave: 2 },
    { ...makePlot("cat-1", "catapult", "Catapult", 230, WALL_Y + 215, [45, 80, 140, 220], 4, [6, 10, 16, 22]), locked: true, unlockWave: 4 },
    { ...makePlot("cat-2", "catapult", "Catapult", 490, WALL_Y + 215, [45, 80, 140, 220], 4, [6, 10, 16, 22]), locked: true, unlockWave: 4 },
    { ...makePlot("hall", "hall", "Upgrade Hall", HALL.x - 130, HALL.y + 70, [60, 150], 2, [6, 16]), locked: true, unlockWave: 5 },
    { ...makePlot("tower-5", "tower", "Archer Tower", 170, towerY, [40, 70, 120, 200, 310], 5, [0, 0, 8, 14, 20]), locked: true },
    { ...makePlot("tower-6", "tower", "Archer Tower", 550, towerY, [40, 70, 120, 200, 310], 5, [0, 0, 8, 14, 20]), locked: true },
    makePlot("repair", "repair", "Repair Wall", 310, WALL_Y + 158, [15], 999),
    { ...makePlot("fortify", "fortify", "Fortify Wall", 410, WALL_Y + 158, [40, 90, 170], 3, [5, 10, 15]), locked: true, unlockWave: 3 },
    { ...makePlot("spikes", "spikes", "Spike Trap", 530, WALL_Y + 158, [30, 55, 90, 150], 4, [4, 8, 12, 18]), locked: true, unlockWave: 3 },
    { ...makePlot("mage", "mage", "Mage Tower", 110, WALL_Y + 158, [50, 85, 140, 230], 4, [0, 0, 0, 18]), locked: true, unlockWave: 4 },
    { ...makePlot("healer", "healer", "Healer's Tent", 250, 960, [40, 75, 120, 190], 4, [0, 0, 0, 16]), locked: true, unlockWave: 5 },
    { ...makePlot("watch", "watch", "Watchtower", WATCH.x, WATCH.y, [60, 110, 180], 3, [6, 12, 18]), locked: true, unlockWave: 5 },
  ];
  for (const id of setup.prebuilt ?? []) {
    const p = plots.find((q) => q.id === id);
    if (p && p.level === 0) p.level = 1;
  }
  const lay = setup.layout ?? layoutFor(seed, chapter.id, !!setup.reverse || !!setup.classicBlessings);
  applyLayout(plots, lay);
  const camp: Camp = {
    lay,
    weapon: setup.weapon ?? "own",
    seed,
    rng: createRng(seed),
    chapter,
    time: 0,
    phase: "build",
    timer: CAMP.firstIntermission,
    wave: 0,
    waveTime: 0,
    queue: [],
    hero: {
      x: lay.heroSpawn.x, y: lay.heroSpawn.y, hp: CAMP.heroHp * mods.heroHp, maxHp: CAMP.heroHp * mods.heroHp, coins: setup.startCoins ?? 12, logs: 0, bows: 0, cooldown: 0, facing: -Math.PI / 2,
      sinceHit: 99, dead: false, respawn: 0, moving: false, payTime: 0, payTimer: 0, payingPlot: null,
    },
    workers: [],
    allies: [],
    lumberPile: 0,
    forgeLogs: 0,
    forgeBows: 0,
    forgeTimer: 0,
    hallHp: CAMP.hallHp,
    hallMaxHp: CAMP.hallHp,
    segments,
    plots,
    enemies: [],
    coins: [],
    arrows: [],
    bolts: [],
    lobs: [],
    pools: [],
    tides: [],
    incomePile: 6,
    incomeTimer: 0,
    courierTimer: 0,
    spikeFx: 0,
    healFx: 0,
    weather: "clear",
    stormTimer: 0,
    hallCooldown: 0,
    wallLevel: 0,
    mods,
    heroLook: setup.heroLook ?? "hero",
    heroFlair: setup.heroFlair ?? "none",
    heroVet: setup.heroVet ?? false,
    ability: setup.ability ?? "arrowRain",
    abilityCooldown: setup.abilityCooldown ?? 18,
    abilityPower: setup.abilityPower ?? 1,
    abilityCharge: 0.6,
    overclock: 0,
    bloodmoon: 0,
    enemyHpMult: setup.enemyHpMult ?? 1,
    eliteChance: setup.eliteChance ?? 0,
    tideEvery: setup.tideEvery ?? 0,
    classicBlessings: setup.classicBlessings ?? false,
    reverse: setup.reverse ? { chest: REVERSE.startChest, result: null, deployed: 0, broken: 0, won: setup.siegesWon ?? 0, hordeHp: setup.hordeHp ?? 1 } : null,
    tideTimer: setup.tideEvery ?? 0,
    heroLevel: 1,
    heroXp: 0,
    runStats: { breaches: 0, flyerHallDamage: 0, heroDeaths: 0, bosses: 0, dmg: {} },
    coinVolley: 0,
    nightEvent: null,
    eventThief: false,
    visitor: null,
    buildChoice: null,
    cursed: false,
    shrineReward: false,
    strikes: [],
    acid: [],
    crit: setup.critChance ?? 0.08,
    owned: {},
    offers: [],
    rerollsUsed: 0,
    nextId: 1,
    kills: 0,
    goldEarned: 0,
    events: [],
  };
  for (const id of setup.startBlessings ?? []) applyBlessing(camp, id);
  camp.events = [];
  return camp;
}

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return Math.round(14 * 1.4 ** (level - 1));
}

/** Hero damage multiplier from in-run levels. */
export function levelDamage(c: Camp): number {
  return 1 + 0.05 * (c.heroLevel - 1);
}

function gainXp(c: Camp, xp: number): void {
  c.heroXp += xp;
  while (c.heroXp >= xpToNext(c.heroLevel)) {
    c.heroXp -= xpToNext(c.heroLevel);
    c.heroLevel += 1;
    c.hero.hp = Math.min(c.hero.maxHp, c.hero.hp + c.hero.maxHp * 0.3);
    c.events.push({ type: "levelUp", level: c.heroLevel, x: c.hero.x, y: c.hero.y });
  }
}

export function carryCap(c: Camp): number {
  return CAMP.carryCap + c.mods.carry;
}

export function plotLogCost(p: Plot): number {
  return p.logCosts[p.level] ?? 0;
}

export function plotCost(p: Plot): number {
  if (p.level < p.costs.length) return p.costs[p.level]!;
  // Repeatable plots get pricier each time.
  return Math.round(p.costs[p.costs.length - 1]! * 1.35 ** (p.level - p.costs.length + 1));
}

export function plotMaxed(p: Plot): boolean {
  return p.level >= p.maxLevel;
}

/** The repair plot only takes payment while some wall segment is damaged or broken. */
export function repairNeeded(c: Camp): boolean {
  return c.segments.some((s) => s.hp < s.maxHp);
}

export function wallIntact(c: Camp, seg: number): boolean {
  return c.segments[seg]!.hp > 0;
}

// ---------------------------------------------------------------------------------------------
// Hero

/** The hero's attack range (the Lancer reaches farther). */
export function heroRange(c: Camp): number {
  return CAMP.heroRange * c.mods.heroRange * WEAPON_BY_ID[c.weapon].range;
}

function heroAttackTarget(c: Camp): Enemy | null {
  const h = c.hero;
  let best: Enemy | null = null;
  let bestD = (heroRange(c) * (c.weather === "fog" ? WEATHER.fog.heroRange : 1)) ** 2;
  for (const e of c.enemies) {
    if (e.burrow && e.burrow > 0) continue;
    const d = (e.x - h.x) ** 2 + (e.y - h.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** Can the hero stand at this point? The wall blocks except at the gate (and at breaches). */
function heroPassable(c: Camp, x: number, y: number): boolean {
  if (Math.abs(y - WALL_Y) > WALL_THICK / 2 + 10) return true;
  const seg = segmentIndexAt(x);
  return GATE_SEGMENTS.includes(seg) || !wallIntact(c, seg);
}

function updateHero(c: Camp, input: CampInput): void {
  const h = c.hero;
  if (h.dead) {
    h.respawn -= STEP;
    if (h.respawn <= 0) {
      h.dead = false;
      h.hp = h.maxHp;
      h.x = c.lay.heroSpawn.x;
      h.y = c.lay.heroSpawn.y;
      c.events.push({ type: "heroRespawn" });
    }
    return;
  }
  const len = Math.hypot(input.move.x, input.move.y);
  h.moving = len > 0.05;
  if (h.moving) {
    const k = Math.min(1, len);
    const spd = CAMP.heroSpeed * c.mods.heroSpeed * tideSlow(c, h.y) * bogSlow(c, h.x, h.y);
    const vx = (input.move.x / len) * k * spd * STEP;
    const vy = (input.move.y / len) * k * spd * STEP;
    // Side bounds keep the hero out of the trunks of the tree line down both edges.
    const nx = Math.max(30, Math.min(MAP_W - 30, h.x + vx));
    // Bottom bound keeps the hero above the Call-wave button even with the camera at the map's bottom edge.
    const ny = Math.max(FOREST_Y - 120, Math.min(MAP_H - 100, h.y + vy));
    // Slide along the wall if the full move is blocked.
    if (heroPassable(c, nx, ny)) {
      h.x = nx;
      h.y = ny;
    } else if (heroPassable(c, nx, h.y)) h.x = nx;
    else if (heroPassable(c, h.x, ny)) h.y = ny;
    if (Math.hypot(h.x - HALL.x, h.y - HALL.y) < HALL.r + 12) {
      const a = Math.atan2(h.y - HALL.y, h.x - HALL.x);
      h.x = HALL.x + Math.cos(a) * (HALL.r + 12);
      h.y = HALL.y + Math.sin(a) * (HALL.r + 12);
    }
  }

  h.maxHp = Math.round(CAMP.heroHp * c.mods.heroHp * (1 + 0.05 * (c.heroLevel - 1)));
  h.sinceHit += STEP;
  if (h.sinceHit > 3) h.hp = Math.min(h.maxHp, h.hp + CAMP.heroRegen * c.mods.heroHp * STEP);

  // Auto-attack.
  h.cooldown -= STEP;
  const t = heroAttackTarget(c);
  if (t) {
    h.facing = Math.atan2(t.y - h.y, t.x - h.x);
    if (h.cooldown <= 0) {
      const wpn = WEAPON_BY_ID[c.weapon];
      h.cooldown = 1 / (CAMP.heroFireRate * c.mods.heroRate * wpn.rate);
      const dmg = heroShotDamage(c) * wpn.damage;
      fireArrow(c, h, t, dmg, "hero");
      // Split shot: extra arrows at the next-nearest enemies.
      if (c.mods.heroMultishot > 0) {
        const others = c.enemies
          .filter((e) => e !== t && (e.x - h.x) ** 2 + (e.y - h.y) ** 2 < heroRange(c) ** 2)
          .sort((a, b) => (a.x - h.x) ** 2 + (a.y - h.y) ** 2 - ((b.x - h.x) ** 2 + (b.y - h.y) ** 2));
        for (const o of others.slice(0, c.mods.heroMultishot)) fireArrow(c, h, o, dmg, "hero");
      }
    }
  } else if (h.moving) h.facing = Math.atan2(input.move.y, input.move.x);

  // Pick up the hall's income pile.
  if (c.incomePile > 0 && Math.hypot(h.x - c.lay.incomePile.x, h.y - c.lay.incomePile.y) < 50 && h.coins < carryCap(c)) {
    const take = Math.min(c.incomePile, carryCap(c) - h.coins);
    c.incomePile -= take;
    h.coins += take;
    for (let i = 0; i < Math.min(take, 8); i++) c.events.push({ type: "coinPickup", x: c.lay.incomePile.x, y: c.lay.incomePile.y });
  }

  if (c.lumberPile > 0 && Math.hypot(h.x - c.lay.lumberPile.x, h.y - c.lay.lumberPile.y) < 50 && h.logs < CAMP.logCap) {
    const take = Math.min(c.lumberPile, CAMP.logCap - h.logs);
    c.lumberPile -= take;
    h.logs += take;
    for (let i = 0; i < Math.min(take, 6); i++) c.events.push({ type: "logPickup", x: c.lay.lumberPile.x, y: c.lay.lumberPile.y });
  }

  updateForgeHauling(c);
  updatePaying(c);
  if (c.phase === "build") updateVisitor(c);
}

/** Buildings a Fire Imp goes for, and whether a building is on fire (out of action). */
export const ARSON_TARGETS: PlotKind[] = ["catapult", "mage", "healer", "spikes", "watch", "forge"];
export function onFire(p: Plot | undefined): boolean {
  return !!p && (p.fire ?? 0) > 0;
}
/** Burning buildings tick down; the hero standing on one stamps the fire out. */
function updateFires(c: Camp): void {
  for (const p of c.plots) {
    if (!p.fire || p.fire <= 0) continue;
    p.fire -= STEP;
    c.runStats.burnTime = (c.runStats.burnTime ?? 0) + STEP;
    if (!c.hero.dead && Math.abs(c.hero.x - p.x) < CAMP.plotHalf && Math.abs(c.hero.y - p.y) < CAMP.plotHalf) {
      p.fire = 0;
      c.events.push({ type: "fireOut", x: p.x, y: p.y - 10 });
    }
    if (p.fire < 0) p.fire = 0;
  }
}

function forgeLevel(c: Camp): number {
  return c.plots.find((p) => p.kind === "forge")?.level ?? 0;
}

/** Hero drops logs at the forge, picks up bows, and arms towers by walking past them. */
function updateForgeHauling(c: Camp): void {
  const h = c.hero;
  if (forgeLevel(c) === 0) return;
  if (h.logs > 0 && Math.hypot(h.x - c.lay.forgeIn.x, h.y - c.lay.forgeIn.y) < 40 && c.forgeLogs < 20) {
    const n = Math.min(h.logs, 20 - c.forgeLogs);
    h.logs -= n;
    c.forgeLogs += n;
    for (let i = 0; i < Math.min(n, 6); i++) c.events.push({ type: "logSpend", from: { x: h.x, y: h.y - 20 }, to: c.lay.forgeIn });
  }
  if (c.forgeBows > 0 && Math.hypot(h.x - c.lay.forgeOut.x, h.y - c.lay.forgeOut.y) < 40 && h.bows < CAMP.bowCap) {
    const n = Math.min(c.forgeBows, CAMP.bowCap - h.bows);
    c.forgeBows -= n;
    h.bows += n;
    for (let i = 0; i < Math.min(n, 6); i++) c.events.push({ type: "logPickup", x: c.lay.forgeOut.x, y: c.lay.forgeOut.y });
  }
  if (h.bows > 0) {
    for (const p of c.plots) {
      if (p.kind !== "tower" || p.level === 0 || p.bows >= BOWS_PER_TOWER) continue;
      if (Math.hypot(h.x - p.x, h.y - p.y) > 60) continue;
      const n = Math.min(h.bows, BOWS_PER_TOWER - p.bows);
      h.bows -= n;
      p.bows += n;
      for (let i = 0; i < n; i++) c.events.push({ type: "bowDeliver", from: { x: h.x, y: h.y - 20 }, to: { x: p.x, y: p.y - 40 } });
      if (h.bows === 0) break;
    }
  }
}

function updateForge(c: Camp): void {
  const lvl = forgeLevel(c);
  if (lvl === 0 || c.forgeLogs <= 0 || c.forgeBows >= 15 || onFire(c.plots.find((p) => p.kind === "forge"))) return;
  c.forgeTimer += STEP * c.mods.forgeSpeed;
  const every = lvl >= 2 ? 1.8 : 3;
  if (c.forgeTimer >= every) {
    c.forgeTimer -= every;
    c.forgeLogs -= 1;
    c.forgeBows += 1;
    c.events.push({ type: "forged", x: c.lay.forgeOut.x, y: c.lay.forgeOut.y });
  }
}

/** Siege Lord: the castle may only repair in the first REVERSE.repairLull seconds of each push. */
export function siegeRepairLocked(c: Camp): boolean {
  return !!c.reverse && c.phase === "wave" && c.waveTime >= REVERSE.repairLull;
}

function updatePaying(c: Camp): void {
  const h = c.hero;
  const plot = c.plots.find((p) => !p.locked && Math.abs(p.x - h.x) < CAMP.plotHalf && Math.abs(p.y - h.y) < CAMP.plotHalf);
  const needCoins = plot ? plotCost(plot) - plot.paid : 0;
  const needLogs = plot ? plotLogCost(plot) - plot.paidLogs : 0;
  // Siege Lord: the defenders can't mend the wall mid-push — a breach you open stays open until the
  // next push begins (they repair in the first few seconds of each push, the lull).
  const siegeLock = !!plot && plot.kind === "repair" && siegeRepairLocked(c);
  if (!plot || siegeLock || plotMaxed(plot) || (plot.kind === "repair" && !repairNeeded(c)) || ((h.coins <= 0 || needCoins <= 0) && (h.logs <= 0 || needLogs <= 0))) {
    h.payTime = 0;
    h.payingPlot = null;
    return;
  }
  if (h.payingPlot !== plot.id) {
    h.payingPlot = plot.id;
    h.payTime = 0;
    h.payTimer = 0.25; // small grace so walking across a plot doesn't spend
  }
  h.payTime += STEP;
  h.payTimer -= STEP;
  while (h.payTimer <= 0 && !plotMaxed(plot)) {
    const wantCoin = plot.paid < plotCost(plot) && h.coins > 0;
    const wantLog = plot.paidLogs < plotLogCost(plot) && h.logs > 0;
    if (!wantCoin && !wantLog) break;
    const speedUp = Math.min(1, h.payTime / 2);
    h.payTimer += CAMP.paySlow + (CAMP.payFast - CAMP.paySlow) * speedUp;
    // Alternate resources so both bars fill together.
    if (wantCoin && (!wantLog || plot.paid / plotCost(plot) <= plot.paidLogs / plotLogCost(plot))) {
      h.coins -= 1;
      plot.paid += 1;
      c.events.push({ type: "coinSpend", from: { x: h.x, y: h.y - 20 }, to: { x: plot.x, y: plot.y } });
    } else {
      h.logs -= 1;
      plot.paidLogs += 1;
      c.events.push({ type: "logSpend", from: { x: h.x, y: h.y - 20 }, to: { x: plot.x, y: plot.y } });
    }
    if (plot.paid >= plotCost(plot) && plot.paidLogs >= plotLogCost(plot)) {
      completePlot(c, plot);
      // Breathe before the next level: the build pops, and a player who only wanted this level has
      // time to step off. Staying put means "keep going" (the pay ramp restarts slow).
      // (Not for Siege Lord's defending bot: the pause is for a player's finger, and the sieges are
      // tuned to the bot spending without it.)
      if (!c.reverse) {
        h.payTime = 0;
        h.payTimer = CAMP.upgradePause;
        break;
      }
    }
  }
}

function completePlot(c: Camp, p: Plot): void {
  p.paid = 0;
  p.paidLogs = 0;
  p.level += 1;
  if (p.kind === "repair") {
    for (const s of c.segments) s.hp = s.maxHp;
  }
  if (p.kind === "fortify") {
    c.wallLevel = p.level;
    // Stronger wall: raise max HP and fully rebuild.
    for (const s of c.segments) {
      s.maxHp = Math.round(s.maxHp * CAMP.fortifyMult);
      s.hp = s.maxHp;
    }
  }
  if (p.kind === "hall") {
    c.hallMaxHp += 450;
    c.hallHp = Math.min(c.hallMaxHp, c.hallHp + 450);
    c.mods.income *= 1.35;
    c.mods.hallDamage *= 1.6;
    // The first hall upgrade opens two more tower slots on the wall.
    if (p.level === 1)
      for (const q of c.plots)
        if (q.locked && !q.unlockWave) {
          q.locked = false;
          c.events.push({ type: "plotUnlocked", label: q.label, x: q.x, y: q.y });
        }
  }
  if (p.kind === "barracks" && p.level <= (PRE_MASTERY.barracks ?? 99)) {
    const i = c.allies.length;
    const postX = 345 + (i % 3) * 15 - 15 + (i - 1) * 8;
    c.allies.push({ id: c.nextId++, x: p.x, y: p.y, hp: ALLY.hp, maxHp: ALLY.hp, cooldown: 0, postX, postY: WALL_Y + 45 + (i % 2) * 14, respawn: 0, facing: -Math.PI / 2, swinging: 0 });
  }
  if (p.kind === "lumber") {
    c.workers.push({ id: c.nextId++, x: p.x, y: p.y, state: "toTree", t: 0, tree: c.workers.length % c.lay.grove.length, carrying: false });
  }
  c.events.push({ type: "build", plot: p.id, kind: p.kind, level: p.level, x: p.x, y: p.y });
  if (p.kind === "tower" && p.level === TOWER_SPEC_LEVEL && !p.spec) c.events.push({ type: "specChoice", plot: p.id });
}

/** Give a tower its specialisation (once; it can't be changed). Returns false if not allowed. */
export function chooseTowerSpec(c: Camp, plotId: string, spec: TowerSpec): boolean {
  const p = c.plots.find((q) => q.id === plotId);
  if (!p || p.kind !== "tower" || p.level < TOWER_SPEC_LEVEL || p.spec) return false;
  p.spec = spec;
  c.events.push({ type: "specChosen", plot: p.id, spec, x: p.x, y: p.y });
  return true;
}

/** Towers at the specialisation level that haven't picked one yet. */
export function towersAwaitingSpec(c: Camp): Plot[] {
  return c.plots.filter((p) => p.kind === "tower" && p.level >= TOWER_SPEC_LEVEL && !p.spec);
}

function updateAllies(c: Camp): void {
  // Summoned militia march off when their time is up (or when they fall).
  if (c.allies.some((a) => a.temp !== undefined && (a.temp <= 0 || a.hp <= 0))) c.allies = c.allies.filter((a) => a.temp === undefined || (a.temp > 0 && a.hp > 0));
  const vet = veterans(c);
  for (const a of c.allies) {
    a.swinging = Math.max(0, a.swinging - STEP);
    if (a.temp !== undefined) a.temp -= STEP;
    else a.maxHp = Math.round(ALLY.hp * c.mods.allyPower * (vet ? VETERANS.hp : 1));
    if (a.respawn > 0) {
      a.respawn -= STEP;
      if (a.respawn <= 0) {
        a.hp = a.maxHp;
        const bk = c.plots.find((q) => q.kind === "barracks");
        a.x = bk?.x ?? BARRACKS.x;
        a.y = bk?.y ?? BARRACKS.y;
      }
      continue;
    }
    // Engage enemies that are inside the camp or pushing through a breach, near our post.
    let target: Enemy | null = null;
    let best = ALLY.aggro ** 2;
    for (const e of c.enemies) {
      if (e.def.flying && e.def.behavior === "ranged") continue;
      const inReach = e.y > WALL_Y - (a.temp !== undefined ? 40 : 10) || !wallIntact(c, segmentIndexAt(e.x));
      if (!inReach) continue;
      const d = (e.x - a.postX) ** 2 + (e.y - a.postY) ** 2;
      if (d < best) {
        best = d;
        target = e;
      }
    }
    const goal = target ?? { x: a.postX, y: a.postY };
    const dx = goal.x - a.x;
    const dy = goal.y - a.y;
    const d = Math.hypot(dx, dy);
    const reach = target ? ALLY.reach + target.def.radius : 3;
    if (d > reach) {
      const step = Math.min(d - reach, ALLY.speed * STEP);
      const nx = a.x + (dx / d) * step;
      const ny = a.y + (dy / d) * step;
      // Allies respect the wall like the hero does.
      if (heroPassable(c, nx, ny)) {
        a.x = nx;
        a.y = ny;
      }
      a.facing = Math.atan2(dy, dx);
    } else if (target) {
      a.facing = Math.atan2(dy, dx);
      a.cooldown -= STEP;
      if (a.cooldown <= 0) {
        a.cooldown = 1 / ALLY.rate;
        a.swinging = 0.25;
        damageEnemy(c, target, ALLY.damage * c.mods.towerDamage * c.mods.allyPower * towerScale(c) * (vet && a.temp === undefined ? VETERANS.damage : 1), "tower", false, "soldiers");
      }
    }
  }
}

function damageAlly(c: Camp, a: Ally, raw: number): void {
  a.hp -= raw;
  if (a.hp <= 0) {
    a.hp = 0;
    a.respawn = a.temp !== undefined ? 0 : veterans(c) ? VETERANS.respawn : ALLY.respawn;
    c.events.push({ type: "allyDown", x: a.x, y: a.y });
  }
}

function updateWorkers(c: Camp): void {
  for (const w of c.workers) {
    const tree = c.lay.grove[w.tree]!;
    const go = (tx: number, ty: number): boolean => {
      const d = Math.hypot(tx - w.x, ty - w.y);
      if (d < 4) return true;
      const sp = Math.min(d, CAMP.workerSpeed * STEP);
      w.x += ((tx - w.x) / d) * sp;
      w.y += ((ty - w.y) / d) * sp;
      return false;
    };
    if (w.state === "toTree") {
      if (go(tree.x + 22, tree.y + 6)) {
        w.state = "chop";
        w.t = CAMP.chopTime;
      }
    } else if (w.state === "chop") {
      w.t -= STEP;
      if (w.t <= 0) {
        w.carrying = true;
        w.state = "toPile";
        c.events.push({ type: "chop", x: tree.x, y: tree.y });
      }
    } else if (go(c.lay.lumberPile.x + 10, c.lay.lumberPile.y)) {
      if (w.carrying && c.lumberPile < CAMP.lumberCap) {
        const before = c.lumberPile;
        c.lumberPile = Math.min(CAMP.lumberCap, c.lumberPile + 3 + c.mods.logsPerTrip);
        c.events.push({ type: "logsDelivered", n: c.lumberPile - before });
      }
      w.carrying = false;
      w.state = "toTree";
      // Spread workers over the grove.
      w.tree = (w.tree + c.workers.length) % c.lay.grove.length;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Towers & arrows

function fireArrow(c: Camp, from: Vec, target: Enemy, damage: number, owner: "hero" | "tower", spec?: TowerSpec, crit?: number, master = false): void {
  const a: Arrow = { id: c.nextId++, x: from.x, y: from.y - 10, target: target.id, damage, owner, life: 2, angle: Math.atan2(target.y - from.y, target.x - from.x), spec, ...(crit ? { crit } : {}), ...(master ? { master } : {}) };
  if (owner === "hero" && c.mods.ricochet > 0) a.bounce = c.mods.ricochet;
  if (owner === "hero" && c.weapon !== "own") a.weapon = c.weapon;
  c.arrows.push(a);
  c.events.push({ type: "shoot", owner, x: from.x, y: from.y });
}

/** One hero arrow's base damage. */
function heroShotDamage(c: Camp): number {
  return CAMP.heroDamage * c.mods.heroDamage * levelDamage(c);
}

/** Golden Volley: a ring of hero arrows at the nearest foes around the hero. */
function goldenVolley(c: Camp): void {
  const h = c.hero;
  const R = 240;
  const near = c.enemies
    .filter((e) => e.y >= SPAWN_Y + 10 && !(e.burrow && e.burrow > 0) && (e.x - h.x) ** 2 + (e.y - h.y) ** 2 < R * R)
    .sort((a, b) => (a.x - h.x) ** 2 + (a.y - h.y) ** 2 - ((b.x - h.x) ** 2 + (b.y - h.y) ** 2))
    .slice(0, 8);
  c.events.push({ type: "rule", rule: "volley", x: h.x, y: h.y });
  for (const e of near) fireArrow(c, h, e, heroShotDamage(c) * 1.5, "hero");
}

/** Tower damage scales gently with the chapter so towers stay relevant later on. */
function towerScale(c: Camp): number {
  return c.chapter.hpMult ** 0.6;
}

function updateTowers(c: Camp): void {
  for (const p of c.plots) {
    if (p.kind !== "tower" || p.level === 0) continue;
    if (p.stun && p.stun > 0) {
      p.stun -= STEP;
      continue;
    }
    const st = TOWER_LEVELS[p.level - 1]!;
    const wb = watchBoost(c, p);
    const range = st.range * c.mods.towerRange * (wb.clear ? 1 : weatherRange(c)) * wb.range;
    p.fired += STEP;
    // Rallying Banner: towers near the (living) hero fire faster.
    const rally = c.mods.banner > 1 && !c.hero.dead && (c.hero.x - p.x) ** 2 + (c.hero.y - p.y) ** 2 < BANNER_R * BANNER_R ? c.mods.banner : 1;
    p.cooldown -= STEP * c.mods.towerRate * wb.rate * rally * (c.overclock > 0 ? 2.5 : 1);
    if (p.cooldown > 0) continue;
    // Nearest enemy to the wall within range.
    let best: Enemy | null = null;
    for (const e of c.enemies) {
      if (e.y < SPAWN_Y + 10 || (e.burrow && e.burrow > 0)) continue;
      if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 > range ** 2) continue;
      if (!best || Math.abs(e.y - WALL_Y) < Math.abs(best.y - WALL_Y)) best = e;
    }
    if (!best) {
      p.cooldown = 0;
      continue;
    }
    p.facing = Math.atan2(best.y - p.y, best.x - p.x);
    p.cooldown += 1 / st.rate;
    p.fired = 0;
    // Hawkeye (combo): towers the Watchtower watches over hit harder and can crit.
    const hawk = wb.clear && c.mods.hawkeye > 0;
    const dmg = st.damage * c.mods.towerDamage * towerScale(c) * (1 + BOW_DAMAGE * p.bows) * (hawk ? 1.1 : 1);
    const from = { x: p.x, y: p.y - 18 };
    const master = p.level >= 5;
    fireArrow(c, from, best, p.spec === "frost" ? dmg * (master ? MASTERY_SPEC.frostDmg : SPEC.frostDmg) : dmg, "tower", p.spec, hawk ? c.mods.hawkeye : undefined, master);
    if (p.spec === "volley") {
      // Volley: the same shot also looses arrows at the nearest other foes in range.
      const others = c.enemies
        .filter((e) => e !== best && e.y >= SPAWN_Y + 10 && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= range ** 2)
        .sort((a, b) => (a.x - best!.x) ** 2 + (a.y - best!.y) ** 2 - ((b.x - best!.x) ** 2 + (b.y - best!.y) ** 2))
        .slice(0, master ? MASTERY_SPEC.volleyExtra : SPEC.volleyExtra);
      for (const o of others) fireArrow(c, from, o, dmg * (master ? MASTERY_SPEC.volleyDmg : SPEC.volleyDmg), "tower", "volley", undefined, master);
    }
  }
}

function updateHallDefense(c: Camp): void {
  c.hallCooldown -= STEP * (c.overclock > 0 ? 2.5 : 1);
  if (c.hallCooldown > 0) return;
  let best: Enemy | null = null;
  let bestD = CAMP.hallRange ** 2;
  for (const e of c.enemies) {
    const d = (e.x - HALL.x) ** 2 + (e.y - HALL.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  if (!best) {
    c.hallCooldown = 0;
    return;
  }
  c.hallCooldown = 1 / CAMP.hallRate;
  fireArrow(c, { x: HALL.x, y: HALL.y - 60 }, best, CAMP.hallDamage * c.mods.hallDamage * towerScale(c) * (c.bloodmoon > 0 ? BLOODMOON.hall : 1), "tower");
}

export function abilityReady(c: Camp): boolean {
  return c.abilityCharge >= 1 && c.phase === "wave" && !c.hero.dead;
}

function useAbility(c: Camp): void {
  const h = c.hero;
  const P = c.abilityPower;
  const dmg = CAMP.heroDamage * c.mods.heroDamage * levelDamage(c) * P;
  c.abilityCharge = 0;
  switch (c.ability) {
    case "arrowRain": {
      // Arrows rain on enemies near the hero (or anywhere if none are near).
      const near = c.enemies.filter((e) => Math.hypot(e.x - h.x, e.y - h.y) < 340);
      const pool = near.length ? near : c.enemies;
      // (Mastery: more arrows, each at normal strength.)
      for (let i = 0, n = Math.round(30 * P); i < n; i++) {
        const e = pool.length ? pool[Math.floor(range(c.rng, 0, pool.length))]! : null;
        const t = 0.3 + range(c.rng, 0, 1.1);
        const x = e ? e.x + range(c.rng, -10, 10) : h.x + range(c.rng, -150, 150);
        const y = e ? e.y + (e.attacking ? 0 : enemySpeed(c, e) * t) : h.y - range(c.rng, 60, 260);
        c.strikes.push({ x, y, t, total: t, damage: (dmg / P) * 2.5 });
      }
      break;
    }
    case "shieldBash":
      for (const e of c.enemies) {
        const d = Math.hypot(e.x - h.x, e.y - h.y);
        if (d > 210 || d === 0) continue;
        damageEnemy(c, e, dmg * 3, "hero");
        const push = e.def.boss ? 20 : 80;
        const wasNorth = e.y < WALL_Y;
        e.x += ((e.x - h.x) / d) * push;
        e.y += ((e.y - h.y) / d) * push;
        // The knockback can't carry a walker through an intact wall section (either direction).
        if (!e.def.flying && wallIntact(c, segmentIndexAt(e.x))) {
          const edge = WALL_THICK / 2 + e.def.radius;
          if (wasNorth) e.y = Math.min(e.y, WALL_Y - edge);
          else e.y = Math.max(e.y, WALL_Y + edge);
        }
        e.stunTime = e.def.boss ? 0.6 : 1.8;
      }
      c.events.push({ type: "boom", x: h.x, y: h.y, r: 210, kind: "bash" });
      break;
    case "fireNova":
      for (const e of c.enemies) {
        if (Math.hypot(e.x - h.x, e.y - h.y) > 150) continue;
        damageEnemy(c, e, dmg * 7, "hero");
        e.burnDps = Math.max(e.burnDps, dmg * 1.5);
        e.burnTime = 3;
      }
      c.events.push({ type: "boom", x: h.x, y: h.y, r: 150, kind: "nova" });
      break;
    case "overclock":
      c.overclock = 5 * P;
      break;
    case "snare": {
      // Snare Field: vines root everything near the Warden; rooted foes are easier to hurt.
      let n = 0;
      for (const e of c.enemies) {
        if (e.def.flying || Math.hypot(e.x - h.x, e.y - h.y) > SNARE.radius) continue;
        e.stunTime = Math.max(e.stunTime, (e.def.boss ? SNARE.bossTime : SNARE.time) * P);
        e.snared = SNARE.time * P;
        n++;
      }
      c.events.push({ type: "boom", x: h.x, y: h.y, r: SNARE.radius, kind: "snare", n });
      break;
    }
    case "acidFlask": {
      // Aim at the foe with the most others around it (ground foes only — acid pools on the ground).
      let best: Enemy | null = null, bestN = -1;
      for (const e of c.enemies) {
        if (e.def.flying || e.y < SPAWN_Y + 10) continue;
        let n = 0;
        for (const o of c.enemies) if (!o.def.flying && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < ACID.radius ** 2) n++;
        if (n > bestN) { bestN = n; best = e; }
      }
      const tx = best ? best.x : h.x, ty = best ? best.y + (best.attacking ? 0 : enemySpeed(c, best) * ACID.flight) : h.y - 160;
      c.acid.push({ x: tx, y: ty, r: ACID.radius, t: ACID.life, delay: ACID.flight, dps: dmg * ACID.dps, fromX: h.x, fromY: h.y - 20 });
      c.events.push({ type: "flask", x: tx, y: ty });
      break;
    }
    case "callToArms": {
      // Militia fall in around the Marshal and hold that spot (they reach over the wall at the gate).
      const nMil = Math.round(MILITIA.count * P);
      for (let i = 0; i < nMil; i++) {
        const a = (i / nMil) * Math.PI * 2 + Math.PI / 4;
        const px = Math.max(60, Math.min(MAP_W - 60, h.x + Math.cos(a) * 54));
        const py = Math.max(WALL_Y + 24, h.y + Math.sin(a) * 36);
        const hp = Math.round(MILITIA.hp * c.mods.allyPower);
        c.allies.push({ id: c.nextId++, x: h.x, y: h.y, hp, maxHp: hp, cooldown: i * 0.15, postX: px, postY: py, respawn: 0, facing: -Math.PI / 2, swinging: 0, temp: MILITIA.life });
      }
      c.events.push({ type: "callToArms", x: h.x, y: h.y, n: nMil });
      break;
    }
    case "sanctuary": {
      // Heal everything on our side; keep the charge if nothing is hurt.
      let healed = 0;
      const mend = (hp: number, max: number, amt: number) => { const n = Math.min(max - hp, amt); healed += n; return hp + n; };
      c.hallHp = mend(c.hallHp, c.hallMaxHp, c.hallMaxHp * SANCTUARY.hall * P);
      for (const sg of c.segments) if (sg.hp > 0) sg.hp = mend(sg.hp, sg.maxHp, sg.maxHp * SANCTUARY.wall * P);
      h.hp = mend(h.hp, h.maxHp, h.maxHp);
      for (const a of c.allies) if (a.respawn <= 0) a.hp = mend(a.hp, a.maxHp, a.maxHp);
      if (healed < 1) {
        c.abilityCharge = 1;
        c.events.push({ type: "noTarget", x: h.x, y: h.y, text: "All is well" });
        return;
      }
      c.events.push({ type: "sanctuary", x: h.x, y: h.y, healed: Math.round(healed) });
      break;
    }
    case "lance": {
      // Aim through whichever foe in reach lines up the most others behind it.
      const live = c.enemies.filter((e) => !(e.burrow && e.burrow > 0));
      const onLine = (dx: number, dy: number, e: Enemy): boolean => {
        const t = (e.x - h.x) * dx + (e.y - h.y) * dy;
        if (t < 0 || t > LANCE.length) return false;
        return Math.abs((e.x - h.x) * dy - (e.y - h.y) * dx) < LANCE.width + e.def.radius;
      };
      let dir = { x: 0, y: -1 };
      let best = -1;
      for (const a of live) {
        const d = Math.hypot(a.x - h.x, a.y - h.y);
        if (d === 0 || d > LANCE.length) continue;
        const dx = (a.x - h.x) / d, dy = (a.y - h.y) / d;
        let n = 0;
        for (const e of live) if (onLine(dx, dy, e)) n++;
        if (n > best) { best = n; dir = { x: dx, y: dy }; }
      }
      if (best < 0) {
        // Nothing in reach: keep the charge rather than throw the lance at empty grass.
        c.abilityCharge = 1;
        c.events.push({ type: "noTarget", x: h.x, y: h.y });
        return;
      }
      let n = 0;
      for (const e of live) {
        if (!onLine(dir.x, dir.y, e)) continue;
        n++;
        damageEnemy(c, e, dmg * LANCE.damage, "hero");
        if (e.def.boss) continue;
        const wasNorth = e.y < WALL_Y;
        e.x += dir.x * LANCE.push;
        e.y += dir.y * LANCE.push;
        if (!e.def.flying && wallIntact(c, segmentIndexAt(e.x))) {
          const edge = WALL_THICK / 2 + e.def.radius;
          if (wasNorth) e.y = Math.min(e.y, WALL_Y - edge);
          else e.y = Math.max(e.y, WALL_Y + edge);
        }
        e.stunTime = Math.max(e.stunTime, 0.6);
      }
      c.events.push({ type: "lance", x: h.x, y: h.y, x2: h.x + dir.x * LANCE.length, y2: h.y + dir.y * LANCE.length, n });
      break;
    }
  }
  c.events.push({ type: "ability", id: c.ability, x: h.x, y: h.y });
  c.runStats.casts = (c.runStats.casts ?? 0) + 1;
}

export const CATAPULT_LEVELS = [
  { damage: 26, radius: 46, interval: 3.6 },
  { damage: 40, radius: 52, interval: 3.2 },
  { damage: 60, radius: 58, interval: 2.8 },
  // level 4: Firestorm Mastery — boulders burst into flame (burning everyone in the splash)
  { damage: 66, radius: 62, interval: 2.7 },
];

/** Catapults lob boulders at the densest enemy cluster outside the wall. */
function updateCatapults(c: Camp): void {
  for (const p of c.plots) {
    if (p.kind !== "catapult" || p.level === 0 || onFire(p)) continue;
    const st = CATAPULT_LEVELS[p.level - 1]!;
    p.fired += STEP;
    p.cooldown -= STEP * c.mods.towerRate * (c.overclock > 0 ? 2.5 : 1);
    if (p.cooldown > 0) continue;
    let best: Enemy | null = null;
    let bestN = 0;
    for (const e of c.enemies) {
      if (e.def.flying || e.y < 60 || Math.hypot(e.x - p.x, e.y - p.y) > 520) continue;
      let n = 0;
      for (const o of c.enemies) if (!o.def.flying && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < st.radius ** 2) n += o.def.boss ? 3 : 1;
      if (n > bestN) {
        bestN = n;
        best = e;
      }
    }
    if (!best) {
      p.cooldown = 0;
      continue;
    }
    const flight = 1;
    const ty = best.y + (best.attacking ? 0 : enemySpeed(c, best) * flight);
    c.strikes.push({ x: best.x, y: ty, t: flight, total: flight, damage: st.damage * c.mods.towerDamage * c.mods.catapultDamage * towerScale(c), radius: st.radius * Math.sqrt(c.mods.catapultDamage), fromX: p.x, fromY: p.y - 20, ...(p.level >= 4 ? { burn: true } : {}) });
    p.facing = Math.atan2(ty - p.y, best.x - p.x);
    p.cooldown += st.interval;
    p.fired = 0;
    c.events.push({ type: "shoot", owner: "catapult", x: p.x, y: p.y });
  }
}

function updateAcid(c: Camp): void {
  for (const p of c.acid) {
    if (p.delay > 0) {
      p.delay -= STEP;
      if (p.delay <= 0) {
        const n = c.enemies.filter((e) => !e.def.flying && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= (p.r + e.def.radius * 0.5) ** 2).length;
        c.events.push({ type: "acidSplash", x: p.x, y: p.y, r: p.r, n });
      }
      continue;
    }
    p.t -= STEP;
    for (const e of c.enemies) {
      if (e.def.flying || (e.burrow && e.burrow > 0) || (e.x - p.x) ** 2 + (e.y - p.y) ** 2 > (p.r + e.def.radius * 0.5) ** 2) continue;
      e.corroded = 0.25;
      const d = p.dps * STEP * (1 - reduction(e));
      e.hp -= d;
      credit(c, "hero", d);
    }
  }
  c.acid = c.acid.filter((p) => p.delay > 0 || p.t > 0);
}

function updateStrikes(c: Camp): void {
  for (const st of c.strikes) {
    st.t -= STEP;
    if (st.t > 0) continue;
    if (st.radius) {
      for (const e of c.enemies) {
        if (e.def.flying || (e.x - st.x) ** 2 + (e.y - st.y) ** 2 >= (st.radius + e.def.radius) ** 2) continue;
        damageEnemy(c, e, st.damage, "tower", false, "catapults");
        // Firestorm Mastery: the splash sets everyone in it ablaze.
        if (st.burn) {
          e.burnDps = Math.max(e.burnTime > 0 ? e.burnDps : 0, st.damage * BUILD_MASTERY.catapultBurn);
          e.burnTime = Math.max(e.burnTime, BUILD_MASTERY.catapultBurnTime);
        }
      }
      c.events.push({ type: "boom", x: st.x, y: st.y, r: st.radius, kind: st.burn ? "firestorm" : "boulder" });
      continue;
    }
    let best: Enemy | null = null;
    let bd = 26 * 26;
    for (const e of c.enemies) {
      const d = (e.x - st.x) ** 2 + (e.y - st.y) ** 2;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (best) damageEnemy(c, best, st.damage, "hero");
  }
  c.strikes = c.strikes.filter((s) => s.t > 0);
}

/** Crossbow bolts punch through into the nearest foe behind the one hit; staff orbs burst on foes close by. */
function heroWeaponHit(c: Camp, a: Arrow, t: Enemy): void {
  const w = WEAPON_BY_ID[a.weapon!];
  if (w.pierce) {
    const dx = Math.cos(a.angle), dy = Math.sin(a.angle);
    let next: Enemy | null = null, bd = Infinity;
    for (const e of c.enemies) {
      if (e === t || e.hp <= 0 || (e.burrow && e.burrow > 0)) continue;
      const rx = e.x - t.x, ry = e.y - t.y;
      const along = rx * dx + ry * dy, across = Math.abs(rx * dy - ry * dx);
      if (along > 0 && along < 90 && across < 22 + e.def.radius && along < bd) { bd = along; next = e; }
    }
    if (next) {
      damageEnemy(c, next, a.damage * w.pierce, "hero");
      c.events.push({ type: "pierce", x: t.x, y: t.y, tx: next.x, ty: next.y });
    }
  }
  if (w.splash) {
    const r2 = w.splash.radius ** 2;
    for (const e of c.enemies) {
      if (e === t || e.hp <= 0 || (e.burrow && e.burrow > 0) || (e.x - t.x) ** 2 + (e.y - t.y) ** 2 > r2) continue;
      damageEnemy(c, e, a.damage * w.splash.share, "hero");
    }
    c.events.push({ type: "orbBurst", x: t.x, y: t.y - t.def.radius * 0.5, r: w.splash.radius });
  }
}

/** Damage multiplier for arrows a Shieldbearer takes on its shield (head-on). */
const SHIELD_BLOCK = 0.6;

function updateArrows(c: Camp): void {
  for (const a of c.arrows) {
    a.life -= STEP;
    const t = c.enemies.find((e) => e.id === a.target);
    if (t) a.angle = Math.atan2(t.y - a.y, t.x - a.x);
    a.x += Math.cos(a.angle) * CAMP.arrowSpeed * STEP;
    a.y += Math.sin(a.angle) * CAMP.arrowSpeed * STEP;
    if (t && (t.x - a.x) ** 2 + (t.y - a.y) ** 2 < (t.def.radius + 4) ** 2) {
      const crit = a.owner === "hero" ? chance(c.rng, c.crit) : !!a.crit && chance(c.rng, a.crit);
      // Shieldbearers block arrows that hit them head-on (flying almost straight up the map).
      const blocked = t.def.shield && Math.sin(a.angle) < -0.85 ? SHIELD_BLOCK : 1;
      damageEnemy(c, t, a.damage * (crit ? 2 : 1) * blocked, a.owner, crit);
      if (a.weapon) heroWeaponHit(c, a, t);
      if (a.owner === "hero") {
        // Culling Blade: hero arrows finish off weakened (non-boss) foes.
        if (c.mods.cull > 0 && !t.def.boss && t.hp > 0 && t.hp < t.maxHp * c.mods.cull) {
          credit(c, "hero", t.hp);
          t.hp = 0;
          c.events.push({ type: "rule", rule: "cull", x: t.x, y: t.y - t.def.radius });
        }
        // Ricochet: bounce on to the nearest foe not yet hit by this arrow.
        if (a.bounce && a.bounce > 0) {
          const hit = [...(a.hit ?? []), t.id];
          let next: Enemy | null = null, bd = RICOCHET.range ** 2;
          for (const e of c.enemies) {
            if (hit.includes(e.id) || e.hp <= 0 || (e.burrow && e.burrow > 0)) continue;
            const d = (e.x - t.x) ** 2 + (e.y - t.y) ** 2;
            if (d < bd) { bd = d; next = e; }
          }
          if (next) {
            c.arrows.push({ id: c.nextId++, x: t.x, y: t.y, target: next.id, damage: a.damage * RICOCHET.damage, owner: "hero", life: 1, angle: Math.atan2(next.y - t.y, next.x - t.x), bounce: a.bounce - 1, hit });
            c.events.push({ type: "rule", rule: "ricochet", x: t.x, y: t.y });
          }
        }
      }
      if (c.mods.burn > 0) {
        t.burnDps = Math.max(t.burnTime > 0 ? t.burnDps : 0, a.damage * c.mods.burn * c.mods.burnMult);
        t.burnTime = 2.5;
      }
      if (c.mods.slow > 0) {
        t.slowPct = c.mods.slow;
        t.slowTime = 1.5;
      }
      if (a.spec) c.events.push({ type: "specHit", spec: a.spec, x: t.x, y: t.y - t.def.radius * 0.6 });
      if (a.spec === "fire") {
        t.burnDps = Math.max(t.burnTime > 0 ? t.burnDps : 0, a.damage * SPEC.fireBurn * (a.master ? MASTERY_SPEC.fireBurn : 1) * (c.weather === "rain" ? WEATHER.rain.burn : 1));
        t.burnTime = Math.max(t.burnTime, SPEC.fireTime + (a.master ? MASTERY_SPEC.fireTime : 0));
      } else if (a.spec === "frost") {
        t.slowPct = Math.max(t.slowTime > 0 ? t.slowPct : 0, a.master ? MASTERY_SPEC.frostSlow : SPEC.frostSlow);
        t.slowTime = Math.max(t.slowTime, SPEC.frostTime);
      }
      a.life = 0;
    }
    if (!t && a.life > 0.3) a.life = 0.3; // target died: let it fly a moment, then vanish
  }
  c.arrows = c.arrows.filter((a) => a.life > 0);
}

/** Damage cut for foes sheltering behind a Shield Wall. */
const GUARD_CUT = 0.5;
/** Current damage reduction from armour and armour cycles (1 = immune). */
export function reduction(e: Enemy): number {
  if (e.burrow && e.burrow > 0) return 1;
  let r = e.def.armor ?? 0;
  if (e.rallied) r = 1 - (1 - r) * (1 - RALLY.armor);
  if (e.guarded) r = 1 - (1 - r) * (1 - GUARD_CUT);
  if (e.elite === "armored") r = 1 - (1 - r) * (1 - ELITE.armor);
  const cyc = e.def.armorCycle;
  if (cyc && e.age % (cyc.on + cyc.off) >= cyc.off) r = 1 - (1 - r) * (1 - cyc.reduction);
  return r;
}

/** Run stats: damage dealt by each source (end-of-run breakdown). */
export function credit(c: Camp, src: string, dmg: number): void {
  if (dmg > 0) c.runStats.dmg[src] = (c.runStats.dmg[src] ?? 0) + dmg;
}
const SRC: Record<string, string> = { tower: "towers", hero: "hero", catapult: "catapults" };

function damageEnemy(c: Camp, e: Enemy, base: number, owner: string, crit = false, src?: string): void {
  const red = reduction(e);
  if (red >= 1) return;
  const dmg = base * (1 - red) * (e.slowTime > 0 ? c.mods.slowedBonus : 1) * (e.snared && e.snared > 0 ? SNARE.vuln : 1) * (e.corroded && e.corroded > 0 ? ACID.vuln : 1) * (e.def.boss ? c.mods.bossDamage : 1);
  if (e.shield && e.shield > 0) {
    // The Shielded elite's barrier soaks damage first.
    e.shield -= dmg;
    if (e.shield <= 0) {
      e.hp += e.shield;
      e.shield = 0;
      c.events.push({ type: "shieldBreak", x: e.x, y: e.y });
    }
  } else e.hp -= dmg;
  e.flash = 0.08;
  credit(c, src ?? SRC[owner] ?? owner, dmg);
  c.events.push({ type: "hit", x: e.x, y: e.y, damage: Math.round(dmg), crit, owner, eid: e.id });
}

// ---------------------------------------------------------------------------------------------
// Enemies

export function spawnEnemy(c: Camp, s: Spawn, at?: Vec): Enemy {
  const def = ENEMIES[s.enemy];
  const hp = enemyHp(s.enemy, s.hpMult * (CAMP.enemyHp + CAMP.enemyHpPerWave * Math.max(0, c.wave - 1)) * (CAMP_CHAPTER_HP[c.chapter.id] ?? 1) * c.enemyHpMult);
  // The first waves come down the middle so a new player can meet them at the gate.
  const spread = c.wave <= 2 ? 170 : MAP_W / 2 - 50;
  const x0 = at ? at.x : s.lane === null ? range(c.rng, MAP_W / 2 - spread, MAP_W / 2 + spread) : MAP_W / 2 - spread + 2 * spread * s.lane;
  const x = !at && c.lay.mirror ? MAP_W - x0 : x0;
  const e: Enemy = {
    id: c.nextId++, def, x, y: at ? at.y : SPAWN_Y - range(c.rng, 0, 30), hp, maxHp: hp,
    attackTimer: def.attackInterval * range(c.rng, 0.3, 1), flash: 0, sway: range(c.rng, 0, Math.PI * 2), hpMult: s.hpMult,
    burnTime: 0, burnDps: 0, slowTime: 0, slowPct: 0, stunTime: 0,
    abilityTimer: def.summon?.interval ?? 0, healTimer: def.heal?.interval ?? 0, age: 0, enraged: false, attacking: false, inside: false, exploded: false,
  };
  // Elites: only fresh wave spawns (not summons / splits), never bosses or the treasure goblin.
  const ec = !at && !def.boss && !def.crossing ? eliteChance(c) : 0;
  if (ec > 0 && chance(c.rng, ec)) {
    e.elite = ELITE_MODS[Math.floor(range(c.rng, 0, ELITE_MODS.length))]!;
    e.hp = e.maxHp = e.maxHp * ELITE.hp;
    if (e.elite === "shielded") e.shield = e.maxHp * ELITE.shield;
    c.events.push({ type: "eliteSpawn", x: e.x, y: Math.max(e.y, 120), mod: e.elite, name: def.name });
  }
  c.enemies.push(e);
  if (def.boss) c.events.push({ type: "bossSpawn", name: def.name, x: e.x, y: Math.max(e.y, 120) });
  return e;
}

export function enemySpeed(c: Camp, e: Enemy): number {
  if (e.stunTime > 0) return 0;
  const slow = e.slowTime > 0 ? e.slowPct * (e.def.slowResist ?? 1) : 0;
  return e.def.speed * c.chapter.speedMult * (e.elite === "swift" ? ELITE.speed : 1) * (e.def.boss ? 1 : tideSlow(c, e.y)) * (1 - slow) * (e.enraged ? 1.5 : 1) * (e.rallied ? 1 + RALLY.speed : 1) * (c.bloodmoon > 0 && !e.def.boss ? BLOODMOON.speed : 1);
}

function moveToward(c: Camp, e: Enemy, tx: number, ty: number): number {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.5) return 0;
  const s = Math.min(d, enemySpeed(c, e) * STEP);
  e.x += (dx / d) * s;
  e.y += (dy / d) * s;
  return d;
}

function damageWall(c: Camp, seg: number, raw: number): void {
  const s = c.segments[seg]!;
  if (s.hp <= 0) return;
  const dmg = raw * c.chapter.gateDamageMult;
  s.hp = Math.max(0, s.hp - dmg);
  const x = segmentCenter(seg);
  c.events.push({ type: "wallHit", seg, x, y: WALL_Y, damage: Math.round(dmg) });
  if (s.hp <= 0) {
    c.runStats.breaches += 1;
    c.events.push({ type: "wallBreak", seg, x, y: WALL_Y });
    if (c.reverse) { c.reverse.chest = Math.min(REVERSE.cap, c.reverse.chest + REVERSE.wallBounty); c.reverse.broken += 1; }
  }
}

function damageHero(c: Camp, raw: number): void {
  const h = c.hero;
  if (h.dead) return;
  h.hp -= raw;
  h.sinceHit = 0;
  c.events.push({ type: "heroHit", x: h.x, y: h.y, damage: Math.round(raw) });
  if (h.hp <= 0) {
    h.dead = true;
    h.respawn = CAMP.heroRespawn;
    // Drop half the carried coins where the hero fell.
    const drop = Math.floor(h.coins / 2);
    h.coins -= drop;
    dropCoins(c, h.x, h.y, drop);
    c.runStats.heroDeaths += 1;
    c.events.push({ type: "heroDown", x: h.x, y: h.y });
  }
}

function damageHall(c: Camp, raw: number, x: number, y: number): void {
  const dmg = raw * c.chapter.gateDamageMult * c.mods.hallArmor;
  c.hallHp -= dmg;
  c.events.push({ type: "hallHit", x, y, damage: Math.round(dmg) });
}

/** The nearest breach in the wall to x, if any (segment index). */
function nearestBreach(c: Camp, x: number, maxDist: number): number | null {
  let best: number | null = null;
  let bestD = maxDist;
  for (let i = 0; i < SEGMENTS; i++) {
    if (wallIntact(c, i)) continue;
    const d = Math.abs(segmentCenter(i) - x);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function enemyAbilities(c: Camp, e: Enemy): void {
  const def = e.def;
  if (def.boss && !e.enraged && e.hp < e.maxHp * 0.5) {
    e.enraged = true;
    c.events.push({ type: "enrage", x: e.x, y: e.y, name: def.name });
    if (def.phase2?.kind === "curse") {
      // The Hag's curse: every foe near her is mended at once as she turns.
      const p2 = def.phase2;
      for (const o of c.enemies) if (o.hp > 0 && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 <= p2.radius ** 2) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * p2.power);
      c.events.push({ type: "curse", x: e.x, y: e.y, r: p2.radius });
    }
  }
  // (Never brings back a foe already brought to 0 this step: it still falls.)
  if (def.regen && e.hp > 0) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * def.regen * STEP);
  if (e.y < 0 || e.stunTime > 0) return;
  if (def.heal) {
    e.healTimer -= STEP;
    if (e.healTimer <= 0) {
      e.healTimer += def.heal.interval;
      let healed = false;
      for (const o of c.enemies) {
        if (o === e || o.hp <= 0 || o.hp >= o.maxHp || (o.x - e.x) ** 2 + (o.y - e.y) ** 2 > def.heal.range ** 2) continue;
        o.hp = Math.min(o.maxHp, o.hp + o.maxHp * def.heal.frac);
        healed = true;
      }
      if (healed) c.events.push({ type: "heal", x: e.x, y: e.y, r: def.heal.range });
    }
  }
  if (def.summon) {
    e.abilityTimer -= STEP;
    if (e.abilityTimer <= 0) {
      e.abilityTimer += def.summon.interval * (e.enraged ? 0.75 : 1);
      const minion = e.enraged ? def.summon.enraged : def.summon.enemy;
      for (let i = 0; i < def.summon.count; i++) {
        const a = (i / def.summon.count) * Math.PI * 2 + c.time;
        spawnEnemy(c, { at: 0, enemy: minion, hpMult: e.hpMult * 0.6, lane: null }, { x: e.x + Math.cos(a) * (def.radius + 16), y: e.y + Math.sin(a) * 16 });
      }
      c.events.push({ type: "summon", x: e.x, y: e.y });
    }
  }
  // Second phase moves of the original bosses.
  const p2 = def.phase2;
  if (p2 && e.enraged && p2.every > 0) {
    e.phaseTimer = (e.phaseTimer ?? 1.5) - STEP;
    if (e.phaseTimer <= 0) {
      e.phaseTimer += p2.every;
      bossPhaseMove(c, e, p2);
    }
  }
  // Second phase: the Frost Wyrm's nova freezes every archer tower in reach.
  if (def.frostNova && e.enraged) {
    e.novaTimer = (e.novaTimer ?? 1.2) - STEP;
    if (e.novaTimer <= 0) {
      e.novaTimer += def.frostNova.every;
      const r2 = def.frostNova.radius ** 2;
      c.events.push({ type: "frostNova", x: e.x, y: e.y, r: def.frostNova.radius });
      for (const p of c.plots) {
        if (p.kind !== "tower" || p.level === 0 || (p.x - e.x) ** 2 + (p.y - 30 - e.y) ** 2 > r2) continue;
        p.stun = Math.max(p.stun ?? 0, def.frostNova.stun);
        c.events.push({ type: "towerStunned", plot: p.id, x: p.x, y: p.y - 30, frozen: true });
      }
    }
  }
}

function bossPhaseMove(c: Camp, e: Enemy, p2: NonNullable<EnemyDef["phase2"]>): void {
  const near = (x: number, y: number) => (x - e.x) ** 2 + (y - e.y) ** 2 <= p2.radius ** 2;
  if (p2.kind === "slam") {
    // Ground slam: hurts the hero and soldiers close by.
    if (near(c.hero.x, c.hero.y) && c.hero.hp > 0) damageHero(c, p2.power);
    for (const a of c.allies) if (a.respawn <= 0 && near(a.x, a.y)) damageAlly(c, a, p2.power);
    c.events.push({ type: "bossSlam", x: e.x, y: e.y, r: p2.radius });
  } else if (p2.kind === "warcry") {
    // War cry: every foe in earshot is rallied (faster, tougher) for a while.
    for (const o of c.enemies) if (o !== e && !o.def.boss && near(o.x, o.y)) o.warcry = p2.power;
    c.events.push({ type: "warcry", x: e.x, y: e.y, r: p2.radius });
  } else if (p2.kind === "bloodmoon") {
    c.bloodmoon = p2.power;
    c.runStats.flares = (c.runStats.flares ?? 0) + 1;
    c.events.push({ type: "bloodmoon", x: e.x, y: e.y });
  } else if (p2.kind === "graverise") {
    // Grave Rise: wraiths claw up out of the ground in a band ahead of the wall, spread across it.
    const spots: Vec[] = [];
    for (let i = 0; i < p2.power; i++) {
      const x = Math.max(70, Math.min(MAP_W - 70, MAP_W * ((i + 0.5) / p2.power) + range(c.rng, -40, 40)));
      const y = WALL_Y - range(c.rng, 140, 260);
      spots.push({ x, y });
      spawnEnemy(c, { at: 0, enemy: "wraith", hpMult: e.hpMult * 0.5, lane: null }, { x, y });
    }
    c.events.push({ type: "graverise", x: e.x, y: e.y, spots });
  } else if (p2.kind === "tide") {
    // The tide: a band of water across the field, centred between the boss and the hero.
    const h = 170;
    const cy = Math.max(WALL_Y - 120, Math.min(WALL_Y + 260, (e.y + c.hero.y) / 2));
    c.tides.push({ y: cy - h / 2, h, t: 0, dur: 4, slow: p2.power });
    // The water douses any building fire it covers.
    for (const p of c.plots) if ((p.fire ?? 0) > 0 && p.y > cy - h / 2 && p.y < cy + h / 2) { p.fire = 0; c.events.push({ type: "fireOut", x: p.x, y: p.y - 10 }); }
    c.events.push({ type: "tide", y: cy - h / 2, h });
  } else if (p2.kind === "eruption") {
    // Eruption: three lava pools — one under the hero if close, the rest just inside the wall ahead.
    const spots: Vec[] = [];
    if (c.hero.hp > 0 && (c.hero.x - e.x) ** 2 + (c.hero.y - e.y) ** 2 <= (p2.radius * 1.5) ** 2) spots.push({ x: c.hero.x, y: c.hero.y });
    while (spots.length < 3) spots.push({ x: Math.max(60, Math.min(MAP_W - 60, e.x + range(c.rng, -p2.radius * 0.7, p2.radius * 0.7))), y: WALL_Y + range(c.rng, 30, 160) });
    const made = spots.map((q) => ({ x: q.x, y: q.y, r: 48 }));
    for (const q of made) c.pools.push({ ...q, t: 0, dur: 5, dps: p2.power });
    c.events.push({ type: "eruption", x: e.x, y: e.y, pools: made });
  } else if (p2.kind === "breath") {
    // Fire breath: a sheet of flame down onto the wall in front of the dragon — scorches the wall
    // sections under it and smokes out the archer towers there for a moment.
    const x0 = Math.max(0, e.x - p2.radius), x1 = Math.min(MAP_W, e.x + p2.radius);
    for (let i = segmentIndexAt(x0); i <= segmentIndexAt(x1); i++) damageWall(c, i, p2.power);
    for (const p of c.plots) {
      if (p.kind !== "tower" || p.level === 0 || p.x < x0 || p.x > x1) continue;
      p.stun = Math.max(p.stun ?? 0, 1.6);
      c.events.push({ type: "towerStunned", plot: p.id, x: p.x, y: p.y - 30 });
    }
    c.events.push({ type: "breath", x: e.x, y: e.y, x0, x1 });
  } else if (p2.kind === "quake") {
    // Quake: the ground heaves around the Colossus — towers in reach are rocked still, the wall cracks.
    for (const p of c.plots) {
      if (p.kind !== "tower" || p.level === 0 || !near(p.x, p.y)) continue;
      p.stun = Math.max(p.stun ?? 0, p2.power);
      c.events.push({ type: "towerStunned", plot: p.id, x: p.x, y: p.y - 30 });
    }
    for (let i = 0; i < SEGMENTS; i++) if (Math.abs(segmentCenter(i) - e.x) < p2.radius && Math.abs(WALL_Y - e.y) < p2.radius) damageWall(c, i, 25);
    c.events.push({ type: "quake", x: e.x, y: e.y, r: p2.radius });
  } else if (p2.kind === "bog") {
    // Bog spit: three pools of sucking marsh — one where the King stands if he's close — that slow
    // anyone wading through (not the troll's kin: foes ignore it).
    const spots: Vec[] = [];
    if (c.hero.hp > 0 && (c.hero.x - e.x) ** 2 + (c.hero.y - e.y) ** 2 <= (p2.radius * 1.6) ** 2) spots.push({ x: c.hero.x, y: c.hero.y });
    while (spots.length < 3) spots.push({ x: Math.max(60, Math.min(MAP_W - 60, e.x + range(c.rng, -p2.radius * 0.8, p2.radius * 0.8))), y: WALL_Y + range(c.rng, 30, 180) });
    const made = spots.map((q) => ({ x: q.x, y: q.y, r: 52 }));
    for (const q of made) c.pools.push({ ...q, t: 0, dur: 6, dps: 0, bog: p2.power });
    c.events.push({ type: "bog", x: e.x, y: e.y, pools: made });
  } else if (p2.kind === "boulders") {
    // Boulder toss at the nearest archer tower in reach: lands after a short flight and stuns it.
    let t: Plot | null = null, best = Infinity;
    for (const p of c.plots) {
      if (p.kind !== "tower" || p.level === 0) continue;
      const d = (p.x - e.x) ** 2 + (p.y - e.y) ** 2;
      if (d <= p2.radius ** 2 && d < best) { best = d; t = p; }
    }
    if (t) {
      const dur = 0.9;
      c.lobs.push({ x: e.x, y: e.y - 20, plot: t.id, t: 0, dur, stun: p2.power });
      c.events.push({ type: "boulderThrow", x: e.x, y: e.y - 20, tx: t.x, ty: t.y - 30, dur });
    }
  }
}

/** Slow factor from the Marsh Troll's bog pools at a spot (1 = clear ground). */
export function bogSlow(c: Camp, x: number, y: number): number {
  let k = 1;
  for (const l of c.pools) if (l.bog && (x - l.x) ** 2 + (y - l.y) ** 2 <= l.r * l.r) k = Math.min(k, 1 - l.bog);
  return k;
}
/** Slow factor from tides at a height (1 = dry). */
export function tideSlow(c: Camp, y: number): number {
  let k = 1;
  for (const t of c.tides) if (y >= t.y && y <= t.y + t.h) k = Math.min(k, 1 - t.slow);
  return k;
}
function updateTides(c: Camp): void {
  // Tidal Week: the sea comes in on its own during the night, across a random band near the wall.
  if (c.tideEvery > 0 && c.phase === "wave") {
    c.tideTimer -= STEP;
    if (c.tideTimer <= 0) {
      c.tideTimer += c.tideEvery;
      const h = 150, cy = WALL_Y + range(c.rng, -100, 200);
      c.tides.push({ y: cy - h / 2, h, t: 0, dur: 4, slow: 0.5 });
      c.events.push({ type: "tide", y: cy - h / 2, h });
    }
  }
  if (!c.tides.length) return;
  for (const t of c.tides) t.t += STEP;
  c.tides = c.tides.filter((t) => t.t < t.dur);
}

function updatePools(c: Camp): void {
  if (!c.pools.length) return;
  for (const l of c.pools) {
    l.t += STEP;
    const r2 = l.r * l.r;
    const h = c.hero;
    if (l.bog) continue; // (slows — see bogSlow — but doesn't burn)
    if (h.hp > 0 && !h.dead && (h.x - l.x) ** 2 + (h.y - l.y) ** 2 <= r2) damageHero(c, l.dps * STEP);
    for (const a of c.allies) if (a.respawn <= 0 && (a.x - l.x) ** 2 + (a.y - l.y) ** 2 <= r2) damageAlly(c, a, l.dps * STEP);
    // The lava doesn't care whose side you're on: walkers crossing it burn too (bosses shrug it off).
    for (const e of c.enemies) if (!e.def.flying && !e.def.boss && (e.x - l.x) ** 2 + (e.y - l.y) ** 2 <= r2) { e.hp -= l.dps * 1.5 * STEP; credit(c, "lava", l.dps * 1.5 * STEP); }
  }
  c.pools = c.pools.filter((l) => l.t < l.dur);
}

function updateLobs(c: Camp): void {
  for (const l of c.lobs) {
    l.t += STEP;
    if (l.t < l.dur) continue;
    const p = c.plots.find((q) => q.id === l.plot);
    if (p && p.level > 0) {
      p.stun = Math.max(p.stun ?? 0, l.stun);
      c.events.push({ type: "towerStunned", plot: p.id, x: p.x, y: p.y - 30 });
    }
  }
  c.lobs = c.lobs.filter((l) => l.t < l.dur);
}

function attackTick(c: Camp, e: Enemy, hit: () => void): void {
  e.attacking = true;
  e.attackTimer -= STEP * (c.bloodmoon > 0 && !e.def.boss ? BLOODMOON.attack : 1);
  if (e.attackTimer <= 0) {
    e.attackTimer += e.def.attackInterval;
    hit();
    if (e.elite === "vampiric") e.hp = Math.min(e.maxHp, e.hp + e.maxHp * ELITE.vampHeal);
  }
}

function updateEnemy(c: Camp, e: Enemy): void {
  const def = e.def;
  const h = c.hero;
  e.attacking = false;
  const heroD = h.dead ? Infinity : Math.hypot(h.x - e.x, h.y - e.y);
  const reach = def.radius + 14;

  // Tunneler underground: crawl beneath the wall, then surface inside the camp.
  if (e.burrow && e.burrow > 0) {
    const endY = WALL_Y + WALL_THICK / 2 + def.radius + 18;
    e.y += (endY - (WALL_Y - WALL_THICK / 2 - def.radius)) / (def.tunneler ?? 3) * STEP;
    e.burrow -= STEP;
    if (e.burrow <= 0) {
      e.y = endY;
      c.events.push({ type: "emerge", x: e.x, y: e.y });
      c.runStats.tunnelers = (c.runStats.tunnelers ?? 0) + 1;
    }
    return;
  }

  // Wall Climber on the wall: scales it (arrows and the hero can still hit it), then drops inside.
  if (e.climb && e.climb > 0) {
    const startY = WALL_Y - WALL_THICK / 2 - def.radius;
    const endY = WALL_Y + WALL_THICK / 2 + def.radius + 14;
    e.y += ((endY - startY) / (def.climber ?? 2.4)) * STEP * (e.slowTime > 0 ? 1 - e.slowPct * 0.5 : 1);
    e.climb -= STEP;
    if (e.climb <= 0 || e.y >= endY) {
      e.climb = 0;
      e.y = endY;
      c.events.push({ type: "climbOver", x: e.x, y: e.y });
    }
    return;
  }

  if (def.crossing) {
    // Treasure goblin: dash across and vanish off the far side.
    if (moveToward(c, e, e.targetX ?? MAP_W + 40, e.y + Math.sin(c.time * 6 + e.sway) * 3) < 6) {
      e.hp = 0;
      e.exploded = true;
      c.events.push({ type: "thiefEscaped" });
    }
    return;
  }

  // Shadowstalkers blink forward through the field (not once they're at the wall, and not while stunned or snared).
  if (def.blink && !e.inside && e.stunTime <= 0 && !(e.snared && e.snared > 0)) {
    const front = WALL_Y - WALL_THICK / 2 - def.radius;
    if (e.y < front - 30) {
      e.blinkT = (e.blinkT ?? def.blink.every) - STEP;
      if (e.blinkT <= 0) {
        const y0 = e.y;
        e.y = Math.min(front - 4, e.y + def.blink.dist);
        e.blinkT = def.blink.every;
        c.events.push({ type: "blink", x0: e.x, y0, x: e.x, y: e.y });
      }
    }
  }

  // Enemies that meet an allied soldier stop to fight it.
  if (!def.flying && !def.kamikaze && def.behavior !== "ranged") {
    for (const a of c.allies) {
      if (a.respawn > 0) continue;
      const d = Math.hypot(a.x - e.x, a.y - e.y);
      if (d < def.radius + 16) {
        attackTick(c, e, () => damageAlly(c, a, def.gateDamage));
        return;
      }
    }
  }

  // Fire Imps dive at the nearest support building and set it ablaze (spent on impact).
  if (def.arsonist) {
    let t: Plot | null = null, best = Infinity;
    for (const p of c.plots) {
      if (!ARSON_TARGETS.includes(p.kind) || p.level === 0 || (p.fire ?? 0) > 0) continue;
      const d = (p.x - e.x) ** 2 + (p.y - e.y) ** 2;
      if (d < best) { best = d; t = p; }
    }
    if (t) {
      if (moveToward(c, e, t.x, t.y - 20) < def.radius + 8) {
        t.fire = def.arsonist;
        e.hp = 0;
        e.exploded = true;
        c.events.push({ type: "ablaze", plot: t.id, x: t.x, y: t.y - 20 });
        c.runStats.fires = (c.runStats.fires ?? 0) + 1;
      }
      return;
    }
  }
  // War Ravens dive at the nearest archer tower and stun it (spent on impact).
  if (def.towerHunter) {
    let t: Plot | null = null, best = Infinity;
    for (const p of c.plots) {
      if (p.kind !== "tower" || p.level === 0) continue;
      const d = (p.x - e.x) ** 2 + (p.y - 30 - e.y) ** 2;
      if (d < best) { best = d; t = p; }
    }
    if (t) {
      if (moveToward(c, e, t.x, t.y - 30) < def.radius + 8) {
        t.stun = Math.max(t.stun ?? 0, def.towerHunter);
        e.hp = 0;
        e.exploded = true;
        c.events.push({ type: "towerStunned", plot: t.id, x: t.x, y: t.y - 30 });
        c.runStats.stuns = (c.runStats.stuns ?? 0) + 1;
      }
      return;
    }
  }

  // Anything that bumps into the hero fights the hero — but a walker can't reach through a standing
  // wall: with the wall between them (foe outside, hero inside, segment intact) it batters the wall.
  // (Siege Lord only for now: in the campaign the hero holding the gate is part of the tuned balance.)
  const walledOff = !!c.reverse && !def.flying && e.y < WALL_Y && h.y > WALL_Y && wallIntact(c, segmentIndexAt(e.x));
  if (!def.kamikaze && !def.bomber && def.behavior !== "ranged" && !walledOff && heroD < (def.flying ? 160 : 70)) {
    if (heroD > reach) moveToward(c, e, h.x, h.y);
    else attackTick(c, e, () => damageHero(c, def.gateDamage));
    return;
  }

  if (def.bomber) {
    // Balloon Bomber: drifts over the wall to a spot above the hall and drops bombs on it from there —
    // out of the wall towers' reach, so the King has to go up and pop it.
    const hx = HALL.x + Math.sin(e.age * 0.45 + e.sway) * 90;
    const hy = HALL.y - def.bomber.hover;
    if (Math.hypot(hx - e.x, hy - e.y) > 14) moveToward(c, e, hx, hy);
    else
      attackTick(c, e, () => {
        const tx = HALL.x + Math.sin(e.age * 3.1 + e.id) * 26, ty = HALL.y - 12;
        c.events.push({ type: "bombDrop", x: e.x, y: e.y - def.radius * 0.2, tx, ty });
        damageHall(c, def.gateDamage, tx, ty);
        c.runStats.flyerHallDamage += def.gateDamage;
      });
    return;
  }
  if (def.flying && def.behavior !== "ranged") {
    // Flyers ignore the wall and go for the hall (ranged flyers like the dragon strafe and shoot instead).
    if (Math.hypot(HALL.x - e.x, HALL.y - e.y) > HALL.r + def.radius) moveToward(c, e, HALL.x, HALL.y);
    else
      attackTick(c, e, () => {
        damageHall(c, def.gateDamage, e.x, e.y);
        c.runStats.flyerHallDamage += def.gateDamage;
      });
    return;
  }

  const outside = e.y < WALL_Y;
  if (outside) {
    if (def.behavior === "ranged") {
      // Close enough that towers on the wall can reach them (otherwise a wave could stall forever).
      const stopY = WALL_Y - (def.boss ? 175 : 145);
      // (Tolerance matters: moveToward stops within half a pixel, so "e.y < stopY" alone could never end.)
      if (e.y < stopY - 1) {
        moveToward(c, e, e.x, stopY);
        return;
      }
      if (def.strafe) e.x = Math.max(40, Math.min(MAP_W - 40, MAP_W / 2 + Math.sin(e.age * 0.6 + e.sway) * def.strafe * 3));
      const seg = segmentIndexAt(e.x);
      attackTick(c, e, () => {
        c.bolts.push({ x: e.x, y: e.y + def.radius, vy: def.boltKind === "fireball" ? 240 : def.boltKind === "frost" ? 270 : 320, damage: def.gateDamage, kind: def.boltKind ?? "bolt", seg });
        c.events.push({ type: "shoot", owner: "enemy", x: e.x, y: e.y });
      });
      return;
    }
    // Head for a breach if one is close, otherwise batter the wall straight ahead.
    const breach = nearestBreach(c, e.x, 160);
    const seg = breach ?? segmentIndexAt(e.x);
    const wallFront = WALL_Y - WALL_THICK / 2 - def.radius;
    if (breach !== null) {
      moveToward(c, e, segmentCenter(breach) + Math.sin(e.sway) * 12, WALL_Y + 30);
      return;
    }
    if (e.y < wallFront - 1) {
      moveToward(c, e, e.x + Math.sin(c.time * 2 + e.sway) * 2, wallFront);
      return;
    }
    if (def.climber && !e.dug) {
      e.dug = true;
      e.climb = def.climber;
      c.events.push({ type: "climb", x: e.x, y: e.y });
      return;
    }
    if (def.tunneler && !e.dug) {
      e.dug = true;
      e.burrow = def.tunneler;
      c.events.push({ type: "burrow", x: e.x, y: e.y });
      return;
    }
    if (def.kamikaze) {
      damageWall(c, seg, def.gateDamage * 2.5);
      c.events.push({ type: "sapper", x: e.x, y: e.y });
      e.hp = 0;
      e.exploded = true;
      return;
    }
    attackTick(c, e, () => {
      damageWall(c, seg, def.gateDamage);
      // Thorn Walls: the blow comes back (scaled like tower damage so it stays relevant later).
      if (c.mods.thorns > 0) {
        damageEnemy(c, e, def.gateDamage * c.mods.thorns * THORNS.scale * towerScale(c), "thorns");
        if (c.mods.thornSlow > 0) {
          e.slowPct = Math.max(e.slowTime > 0 ? e.slowPct : 0, c.mods.thornSlow);
          e.slowTime = Math.max(e.slowTime, 1.5);
        }
        c.events.push({ type: "rule", rule: "thorns", x: e.x, y: WALL_Y });
      }
    });
    return;
  }

  // Inside the camp: go for the hall.
  e.inside = true;
  if (Math.hypot(HALL.x - e.x, HALL.y - e.y) > HALL.r + def.radius + 2) moveToward(c, e, HALL.x, HALL.y);
  else if (def.kamikaze) {
    damageHall(c, def.gateDamage * 2, e.x, e.y);
    c.events.push({ type: "sapper", x: e.x, y: e.y });
    e.hp = 0;
    e.exploded = true;
  } else attackTick(c, e, () => damageHall(c, def.gateDamage, e.x, e.y));
}

function updateRally(c: Camp): void {
  const bearers = c.enemies.filter((e) => e.def.aura && e.hp > 0);
  // Shield Walls: foes marching in the lane behind one (outside the wall) shelter behind its shields.
  const walls = c.enemies.filter((e) => e.def.guard && e.hp > 0 && e.y < WALL_Y);
  for (const e of c.enemies) {
    e.guarded = false;
    if (!walls.length || e.def.flying || e.def.guard || e.def.boss) continue;
    for (const w of walls) {
      const g = w.def.guard!;
      const dy = w.y - e.y;
      if (dy > 4 && dy < g.depth && Math.abs(w.x - e.x) < g.width) { e.guarded = true; break; }
    }
  }
  for (const e of c.enemies) {
    e.rallied = false;
    if (e.warcry && e.warcry > 0) {
      e.warcry -= STEP;
      e.rallied = true;
      continue;
    }
    if (!bearers.length || e.def.boss) continue;
    for (const b of bearers) {
      if (b === e) continue;
      if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 <= b.def.aura!.radius ** 2) { e.rallied = true; break; }
    }
  }
}

function updateEnemies(c: Camp): void {
  if (c.bloodmoon > 0) c.bloodmoon = Math.max(0, c.bloodmoon - STEP);
  updateRally(c);
  for (const e of c.enemies) {
    e.age += STEP;
    e.flash = Math.max(0, e.flash - STEP);
    if (e.snared) e.snared = Math.max(0, e.snared - STEP);
    if (e.corroded) e.corroded = Math.max(0, e.corroded - STEP);
    if (e.burnTime > 0) {
      e.burnTime -= STEP;
      const burn = e.burnDps * STEP * (e.slowTime > 0 ? c.mods.thermal : 1);
      e.hp -= burn;
      credit(c, "fire", burn);
    }
    if (e.slowTime > 0) e.slowTime -= STEP;
    if (e.stunTime > 0) {
      e.stunTime -= STEP;
      continue;
    }
    enemyAbilities(c, e);
    updateEnemy(c, e);
  }
  separate(c);
}

function separate(c: Camp): void {
  const es = c.enemies;
  for (let i = 0; i < es.length; i++) {
    const a = es[i]!;
    if (a.burrow && a.burrow > 0) continue;
    for (let j = i + 1; j < es.length; j++) {
      const b = es[j]!;
      if (a.def.flying !== b.def.flying || (b.burrow && b.burrow > 0)) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = (a.def.radius + b.def.radius) * 0.9;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = ((min - d) / d) * 0.5;
      const wa = a.def.boss ? 0.1 : b.def.boss ? 1.9 : 1;
      a.x -= dx * push * wa;
      a.y -= dy * push * wa;
      b.x += dx * push * (2 - wa);
      b.y += dy * push * (2 - wa);
    }
    // Walkers can't pass through intact wall.
    if (!a.def.flying && Math.abs(a.y - WALL_Y) < WALL_THICK / 2 + a.def.radius) {
      const seg = segmentIndexAt(a.x);
      if (wallIntact(c, seg)) a.y = a.y < WALL_Y ? Math.min(a.y, WALL_Y - WALL_THICK / 2 - a.def.radius) : Math.max(a.y, WALL_Y + WALL_THICK / 2 + a.def.radius);
    }
    if (!a.def.crossing) a.x = Math.max(a.def.radius, Math.min(MAP_W - a.def.radius, a.x));
  }
}

function updateBolts(c: Camp): void {
  for (const b of c.bolts) {
    b.y += b.vy * STEP;
    if (b.y >= WALL_Y - WALL_THICK / 2) {
      if (wallIntact(c, b.seg)) damageWall(c, b.seg, b.damage);
      b.y = 1e9;
    }
  }
  c.bolts = c.bolts.filter((b) => b.y < 1e8);
}

// ---------------------------------------------------------------------------------------------
// Coins

function dropCoins(c: Camp, x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const a = range(c.rng, 0, Math.PI * 2);
    const s = range(c.rng, 40, 110);
    c.coins.push({ id: c.nextId++, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, z: 0, vz: range(c.rng, 120, 220), homing: false });
  }
}

function updateCoins(c: Camp): void {
  const h = c.hero;
  for (const k of c.coins) {
    if (k.z > 0 || k.vz > 0) {
      k.vz -= 600 * STEP;
      k.z = Math.max(0, k.z + k.vz * STEP);
      if (k.z === 0) k.vz = 0;
      k.x += k.vx * STEP;
      k.y += k.vy * STEP;
      k.vx *= 0.96;
      k.vy *= 0.96;
      continue;
    }
    if (h.dead || h.coins >= carryCap(c)) {
      k.homing = false;
      continue;
    }
    const d = Math.hypot(h.x - k.x, h.y - k.y);
    if (d < CAMP.magnet * c.mods.magnet || k.homing) {
      k.homing = true;
      const sp = Math.max(380, d * 2.2) * STEP;
      k.x += ((h.x - k.x) / d) * Math.min(d, sp);
      k.y += ((h.y - k.y) / d) * Math.min(d, sp);
      if (d < CAMP.pickupRange) {
        h.coins += 1;
        k.vz = -1; // mark collected
        c.events.push({ type: "coinPickup", x: k.x, y: k.y });
        if (c.mods.coinVolley > 0 && ++c.coinVolley >= c.mods.coinVolley) {
          c.coinVolley = 0;
          goldenVolley(c);
        }
      }
    }
  }
  c.coins = c.coins.filter((k) => k.vz !== -1);
}

function updateMage(c: Camp): void {
  for (const p of c.plots) {
    if (p.kind !== "mage" || p.level === 0 || onFire(p)) continue;
    const st = MAGE_LEVELS[p.level - 1]!;
    p.fired += STEP;
    p.cooldown -= STEP * (c.overclock > 0 ? 2.5 : 1);
    if (p.cooldown > 0) continue;
    const from = { x: p.x, y: p.y - 46 };
    // Strike the foe nearest the wall within range, then hop to the nearest unstruck foe each time.
    let cur: Enemy | null = null;
    for (const e of c.enemies) {
      if (e.y < SPAWN_Y + 10 || (e.burrow && e.burrow > 0) || (e.x - p.x) ** 2 + (e.y - p.y) ** 2 > (st.range * weatherRange(c)) ** 2) continue;
      if (!cur || Math.abs(e.y - WALL_Y) < Math.abs(cur.y - WALL_Y)) cur = e;
    }
    if (!cur) {
      p.cooldown = 0;
      continue;
    }
    p.cooldown = st.every;
    p.fired = 0;
    const struck = new Set<Enemy>();
    const points: Vec[] = [from];
    let dmg = st.damage * towerScale(c) * c.mods.mageDamage;
    for (let i = 0; i <= st.chains + c.mods.mageChains && cur; i++) {
      // Storm Mastery: the first foe struck is stunned for a moment (bosses shrug it off).
      if (i === 0 && p.level >= 4 && !cur.def.boss) cur.stunTime = Math.max(cur.stunTime, BUILD_MASTERY.mageStun);
      struck.add(cur);
      points.push({ x: cur.x, y: cur.y - cur.def.radius * 0.6 });
      // Arcane: armour doesn't help.
      cur.hp -= dmg;
      credit(c, "mage", dmg);
      cur.flash = 0.1;
      c.events.push({ type: "hit", x: cur.x, y: cur.y, damage: Math.round(dmg), crit: false, owner: "tower", eid: cur.id });
      dmg *= MAGE.falloff;
      let next: Enemy | null = null, best = MAGE.hop ** 2;
      for (const e of c.enemies) {
        if (struck.has(e) || e.hp <= 0) continue;
        const d = (e.x - cur.x) ** 2 + (e.y - cur.y) ** 2;
        if (d < best) { best = d; next = e; }
      }
      cur = next;
    }
    c.events.push({ type: "mageZap", points });
  }
}

function updateHealer(c: Camp): void {
  const p = c.plots.find((q) => q.kind === "healer");
  if (!p || p.level === 0 || onFire(p)) return;
  const base = HEALER_LEVELS[p.level - 1]!;
  const k = c.mods.healerPower;
  // Field Medic: farther reach (×k) and stronger heals (×(1 + (k−1)·1.33)).
  const st = { ...base, radius: base.radius * k, heal: base.heal * (1 + (k - 1) * 1.33) };
  const r2 = st.radius ** 2;
  const healed: Vec[] = [];
  const h = c.hero;
  if (!h.dead && h.hp < h.maxHp && (h.x - p.x) ** 2 + (h.y - p.y) ** 2 <= r2) {
    h.hp = Math.min(h.maxHp, h.hp + st.heal * STEP);
    healed.push({ x: h.x, y: h.y });
  }
  for (const a of c.allies) {
    if (a.respawn > 0 || a.hp >= a.maxHp || (a.x - p.x) ** 2 + (a.y - p.y) ** 2 > r2) continue;
    a.hp = Math.min(a.maxHp, a.hp + st.heal * STEP);
    healed.push({ x: a.x, y: a.y });
  }
  // The wall is mended a little everywhere (broken sections need the Repair plot).
  for (const sg of c.segments) if (sg.hp > 0 && sg.hp < sg.maxHp) sg.hp = Math.min(sg.maxHp, sg.hp + sg.maxHp * st.wall * STEP);
  c.healFx -= STEP;
  if (healed.length && c.healFx <= 0) {
    c.healFx = 0.6;
    c.events.push({ type: "tentHeal", points: healed });
  }
}

function updateStorm(c: Camp): void {
  if (c.weather !== "storm" || c.phase !== "wave") return;
  c.stormTimer -= STEP;
  if (c.stormTimer > 0) return;
  c.stormTimer = WEATHER.storm.every;
  const foes = c.enemies.filter((e) => e.y > SPAWN_Y + 20 && !(e.burrow && e.burrow > 0));
  if (!foes.length) return;
  const e = foes[Math.floor(range(c.rng, 0, foes.length))]!;
  e.hp -= WEATHER.storm.damage * towerScale(c);
  credit(c, "storm", WEATHER.storm.damage * towerScale(c));
  e.stunTime = Math.max(e.stunTime, WEATHER.storm.stun);
  e.flash = 0.15;
  c.events.push({ type: "stormBolt", x: e.x, y: e.y });
  c.events.push({ type: "hit", x: e.x, y: e.y, damage: Math.round(WEATHER.storm.damage * towerScale(c)), crit: false, owner: "tower", eid: e.id });
}

function updateSpikes(c: Camp): void {
  const p = c.plots.find((q) => q.kind === "spikes");
  if (!p || p.level === 0 || onFire(p)) return;
  const lv = p.level - 1;
  const dps = SPIKES.dps[lv]! * towerScale(c) * c.mods.spikeDamage;
  c.spikeFx -= STEP;
  let fxAt: Enemy | null = null;
  for (const e of c.enemies) {
    if (e.def.flying || e.x < SPIKES.x0 || e.x > SPIKES.x1 || e.y < SPIKES.y0 || e.y > SPIKES.y1) continue;
    const sd = dps * STEP * (1 - Math.min(1, reduction(e)));
    e.hp -= sd;
    credit(c, "spikes", sd);
    e.slowPct = Math.max(e.slowTime > 0 ? e.slowPct : 0, SPIKES.slow[lv]!);
    e.slowTime = Math.max(e.slowTime, 0.3);
    fxAt ??= e;
  }
  // A throttled event so the stakes can flash and spatter where foes are caught.
  if (fxAt && c.spikeFx <= 0) {
    c.spikeFx = 0.35;
    c.events.push({ type: "spikeHit", x: fxAt.x, y: fxAt.y });
  }
}

function updateIncome(c: Camp): void {
  c.incomeTimer += STEP;
  while (c.incomeTimer >= CAMP.incomeEvery / c.mods.income) {
    c.incomeTimer -= CAMP.incomeEvery / c.mods.income;
    if (c.incomePile < CAMP.incomeCap) c.incomePile += 1;
  }
  // Royal courier: the hall sends its coins straight to the King, wherever he is (no walk back to
  // the hall to collect). Coins only wait in the pile while he's full or fallen.
  const h = c.hero;
  if (c.incomePile > 0 && !h.dead && h.coins < carryCap(c)) {
    c.courierTimer += STEP;
    while (c.courierTimer >= 1 / CAMP.courierRate && c.incomePile > 0 && h.coins < carryCap(c)) {
      c.courierTimer -= 1 / CAMP.courierRate;
      c.incomePile -= 1;
      h.coins += 1;
      c.events.push({ type: "courier", x: c.lay.incomePile.x, y: c.lay.incomePile.y });
    }
  } else c.courierTimer = 0;
}

function reap(c: Camp): void {
  for (let pass = 0; pass < 4; pass++) {
    const dead = c.enemies.filter((e) => e.hp <= 0);
    if (!dead.length) return;
    c.enemies = c.enemies.filter((e) => e.hp > 0);
    for (const e of dead) {
      // Enemies that removed themselves (a sapper blowing up on the wall/hall, an escaped treasure goblin)
      // were not killed by the player: no kill, XP, coins, streak or kill event.
      if (e.exploded) continue;
      const gold = Math.max(1, Math.round(e.def.gold * CAMP.dropMult * c.mods.drops * (e.elite ? ELITE.gold : 1) * (e.elite || e.def.boss ? c.mods.bigGold : 1) * (c.nightEvent === "treasure" ? NIGHT_EVENTS.treasureGold : 1)));
      c.kills += 1;
      c.goldEarned += gold;
      gainXp(c, e.def.boss ? 15 : Math.max(1, Math.round(e.def.cost)));
      if (e.def.boss) c.runStats.bosses += 1;
      if (gold) dropCoins(c, e.x, e.y, gold);
      // Wildfire: a burning foe's fall sets its neighbours ablaze.
      if (c.mods.wildfire > 0 && e.burnTime > 0 && e.burnDps > 0) {
        let spread = 0;
        for (const o of c.enemies) {
          if (o.hp <= 0 || (o.x - e.x) ** 2 + (o.y - e.y) ** 2 > WILDFIRE.range ** 2) continue;
          o.burnDps = Math.max(o.burnTime > 0 ? o.burnDps : 0, e.burnDps * WILDFIRE.dps);
          o.burnTime = Math.max(o.burnTime, 2.5);
          spread++;
        }
        if (spread) c.events.push({ type: "rule", rule: "wildfire", x: e.x, y: e.y });
      }
      c.events.push({ type: "kill", x: e.x, y: e.y, enemy: e.def, gold, eid: e.id, ...(e.elite ? { elite: true } : {}) });
      if (e.elite === "splitting") {
        for (let i = 0; i < 2; i++) {
          const k = spawnEnemy(c, { at: 0, enemy: e.def.id, hpMult: e.hpMult, lane: null }, { x: e.x + (i ? 12 : -12), y: e.y - 4 });
          k.hp = k.maxHp = e.maxHp * ELITE.splitHp;
        }
      }
      if (e.def.splitsInto) {
        const { enemy, count } = e.def.splitsInto;
        for (let i = 0; i < count; i++) spawnEnemy(c, { at: 0, enemy, hpMult: e.hpMult, lane: null }, { x: e.x + (i - 1) * 14, y: e.y });
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------

/** Some waves bring a treasure goblin dashing across the field. */
function maybeSpawnThief(c: Camp): void {
  if (c.wave < 2 || !chance(c.rng, 0.35)) return;
  spawnThief(c);
}

/** Send a treasure goblin across the field (also used by the debug/QA hook). */
export function spawnThief(c: Camp): void {
  const left = chance(c.rng, 0.5);
  const y = range(c.rng, WALL_Y - 230, WALL_Y - 110);
  const e = spawnEnemy(c, { at: 0, enemy: "thief", hpMult: 1 + c.wave * 0.25, lane: null }, { x: left ? -20 : MAP_W + 20, y });
  e.targetX = left ? MAP_W + 30 : -30;
  c.events.push({ type: "thief", x: e.x, y });
}

function startWave(c: Camp): void {
  c.wave += 1;
  c.weather = rollWeather(c.seed, c.wave, !!c.chapter.waves[c.wave - 1]?.breather, scaleOdds(c.chapter.weatherOdds ?? WEATHER.odds, c.chapter.weatherMult ?? 1));
  c.stormTimer = WEATHER.storm.every;
  const plan = planWave(c.chapter, c.wave, c.seed);
  c.queue = c.reverse ? [] : plan.spawns.slice();
  // Night events: never in dailies, Siege Lord or Boss Rush, nor on boss, breather or final nights.
  const finalNight = !c.chapter.endless && c.wave >= c.chapter.waves.length;
  c.nightEvent = rollNightEvent(c.seed, c.wave, !c.reverse && !c.classicBlessings && c.chapter.id !== 98 && !plan.boss && !plan.breather && !finalNight);
  if (c.cursed) {
    // The shrine's bargain: an Elite Raid tonight (on top of any boss), a rule card at dawn.
    c.nightEvent = "elite";
    c.cursed = false;
    c.shrineReward = true;
  }
  if (c.visitor) {
    c.events.push({ type: "visitor", kind: c.visitor.kind, action: "leave", x: c.visitor.x, y: c.visitor.y });
    c.visitor = null;
  }
  c.eventThief = false;
  c.bossNight = !!plan.boss;
  // Elite Raid: fewer foes, but far more of them elite.
  if (c.nightEvent === "elite") c.queue = c.queue.filter((sp, i) => ENEMIES[sp.enemy].boss || i % 5 !== 4);
  if (c.nightEvent === "swarm") {
    // Each foe comes as a pair at half strength (same total HP, twice the bodies).
    c.queue = c.queue.flatMap((sp) => (ENEMIES[sp.enemy].boss ? [sp] : [
      { ...sp, hpMult: sp.hpMult * NIGHT_EVENTS.swarmHp },
      { ...sp, at: sp.at + 0.35, hpMult: sp.hpMult * NIGHT_EVENTS.swarmHp, lane: sp.lane === null ? null : Math.min(1, Math.max(0, sp.lane + 0.06)) },
    ])).sort((a, b) => a.at - b.at);
  }
  c.waveTime = 0;
  c.phase = "wave";
  c.events.push({
    type: "waveStart", wave: c.wave, breather: plan.breather, weather: c.weather,
    boss: plan.boss ? ENEMIES[plan.boss].name : null, intro: plan.intro ? ENEMIES[plan.intro].name : null,
    ...(c.nightEvent ? { event: c.nightEvent } : {}),
  });
}

export function step(c: Camp, input: CampInput): void {
  if (c.phase === "won" || c.phase === "lost" || c.phase === "pick") return;
  c.time += STEP;

  if (c.phase === "build") {
    c.timer -= STEP;
    if (input.callWave && c.timer > 1) {
      // Calling the wave early pays a small bonus straight into the income pile.
      const bonus = Math.floor(c.timer / 2);
      c.incomePile += bonus;
      if (bonus > 0) c.events.push({ type: "earlyBonus", coins: bonus });
      c.timer = 0;
    }
    if (c.timer <= 0) startWave(c);
  } else {
    c.waveTime += STEP;
    while (c.queue.length && c.queue[0]!.at <= c.waveTime) spawnEnemy(c, c.queue.shift()!);
    if (c.reverse) c.reverse.chest = Math.min(REVERSE.cap, c.reverse.chest + REVERSE.income * STEP);
    else if (c.waveTime >= 6 && c.waveTime - STEP < 6) maybeSpawnThief(c);
    // Nightmare: every Nth non-boss night, a Blood Moon surge rises partway through.
    const be = c.chapter.bloodEvery;
    if (be && !c.reverse && !c.bossNight && c.wave % be === 0 && c.waveTime >= BLOOD_SURGE.at && c.waveTime - STEP < BLOOD_SURGE.at) {
      c.bloodmoon = Math.max(c.bloodmoon, BLOOD_SURGE.secs);
      c.events.push({ type: "bloodmoon", x: MAP_W / 2, y: FOREST_Y + 80 });
    }
    // Treasure Night: a goblin is guaranteed (on top of the usual chance).
    if (c.nightEvent === "treasure" && !c.eventThief && c.waveTime >= NIGHT_EVENTS.thiefAt) {
      c.eventThief = true;
      spawnThief(c);
    }
    if (c.abilityCharge < 1) {
      c.abilityCharge = Math.min(1, c.abilityCharge + STEP / c.abilityCooldown);
      if (c.abilityCharge >= 1) c.events.push({ type: "abilityReady" });
    }
    if (input.ability && abilityReady(c)) useAbility(c);
  }
  c.overclock = Math.max(0, c.overclock - STEP);

  updateIncome(c);
  updateSpikes(c);
  updateStorm(c);
  updateHealer(c);
  updateWorkers(c);
  updateAllies(c);
  updateForge(c);
  updateHero(c, input);
  updateFires(c);
  updateTowers(c);
  updateMage(c);
  updateCatapults(c);
  updateHallDefense(c);
  updateEnemies(c);
  updateBolts(c);
  updateLobs(c);
  updatePools(c);
  updateTides(c);
  updateArrows(c);
  updateStrikes(c);
  updateAcid(c);
  reap(c);
  updateCoins(c);

  if (c.hallHp <= 0) {
    c.hallHp = 0;
    c.phase = "lost";
    if (c.reverse) c.reverse.result = "win"; // Siege Lord: the hall fell — the horde wins
    c.events.push({ type: "lost" });
    return;
  }
  // Siege Lord: one continuous siege. Every REVERSE.push seconds the next push begins (your horde
  // stays on the field; the defenders' buildings unlock as usual); after the last push, the defenders win.
  if (c.reverse) {
    if (c.phase === "wave" && c.waveTime >= REVERSE.push) {
      if (c.wave >= REVERSE.pushes) {
        c.phase = "won";
        c.reverse.result = "lose";
        c.events.push({ type: "won" });
        return;
      }
      c.wave += 1;
      c.waveTime = 0;
      c.incomePile += 4 + c.wave; // the defenders' between-push income
      for (const p of c.plots) {
        if (p.locked && p.unlockWave && c.wave >= p.unlockWave) {
          p.locked = false;
          c.events.push({ type: "plotUnlocked", label: p.label, x: p.x, y: p.y });
        }
      }
      c.events.push({ type: "waveStart", wave: c.wave, breather: false, weather: c.weather, boss: null, intro: null });
    }
    return;
  }
  if (c.phase === "wave" && c.queue.length === 0 && c.enemies.length === 0) {
    // Sweep up: every coin left on the field flies to the hero.
    for (const k of c.coins) if (k.z === 0) k.homing = true;
    // Holding a wave pays a bonus into the hall's coin pile.
    const bonus = 4 + c.wave + (c.nightEvent === "elite" ? NIGHT_EVENTS.eliteBonus(c.wave) : 0);
    c.incomePile += bonus;
    c.events.push({ type: "waveClear", wave: c.wave, bonus });
    c.nightEvent = null;
    c.bolts = [];
    c.strikes = [];
    c.acid = [];
    if (!c.chapter.endless && c.wave >= c.chapter.waves.length) {
      c.phase = "won";
      c.events.push({ type: "won" });
      return;
    }
    if (c.mods.repairAfterWave > 0) for (const sg of c.segments) if (sg.hp > 0) sg.hp = Math.min(sg.maxHp, sg.hp + sg.maxHp * c.mods.repairAfterWave);
    // New buildings become available as the run goes on. When several kinds open on the same dawn,
    // the player drafts which comes first (the rest open the next dawn); the balance bot, dailies and
    // Siege Lord keep the fixed order.
    const due = c.plots.filter((p) => p.locked && p.unlockWave && c.wave >= p.unlockWave);
    const kinds = [...new Set(due.map((p) => p.kind))];
    if (BUILD_DRAFT && kinds.length >= 2 && !c.botDriven && !c.classicBlessings && !c.reverse) {
      // At most three to choose from (anything beyond opens straight away).
      c.buildChoice = kinds.slice(0, 3);
      for (const p of due) if (!c.buildChoice.includes(p.kind)) unlockPlot(c, p);
    } else for (const p of due) unlockPlot(c, p);
    c.offers = rollBlessings(c.rng, c.wave, c.owned, 3, builtKinds(c), c.classicBlessings, c.shrineReward);
    c.shrineReward = false;
    if (c.offers.length || c.buildChoice) {
      c.phase = "pick";
      c.events.push({ type: "offers" });
    } else beginBuild(c);
  }
}

function beginBuild(c: Camp): void {
  c.phase = "build";
  c.weather = "clear";
  c.timer = CAMP.intermission;
  c.visitor = rollVisitor(c);
  if (c.visitor) c.events.push({ type: "visitor", kind: c.visitor.kind, action: "arrive", x: c.visitor.x, y: c.visitor.y, ...(c.visitor.offer ? { id: c.visitor.offer } : {}) });
}

/** Standing on today's visitor: hold to accept the shrine, or pay the merchant coin by coin. */
function updateVisitor(c: Camp): void {
  const v = c.visitor, h = c.hero;
  if (!v || v.done || c.botDriven || h.dead) return;
  if ((h.x - v.x) ** 2 + (h.y - v.y) ** 2 > VISITOR.radius ** 2) {
    v.stand = 0;
    return;
  }
  v.stand += STEP;
  if (v.kind === "shrine") {
    if (v.stand >= VISITOR.shrineHold) {
      v.done = true;
      c.cursed = true;
      c.events.push({ type: "visitor", kind: "shrine", action: "accept", x: v.x, y: v.y });
    }
    return;
  }
  // Merchant: a short grace (walking past doesn't spend), then a coin every payEvery seconds.
  if (v.stand < 0.3) return;
  v.acc += STEP;
  while (v.acc >= VISITOR.payEvery && v.paid < v.price && h.coins > 0) {
    v.acc -= VISITOR.payEvery;
    h.coins -= 1;
    v.paid += 1;
    c.events.push({ type: "coinSpend", from: { x: h.x, y: h.y - 20 }, to: { x: v.x, y: v.y - 10 } });
  }
  if (v.paid >= v.price && v.offer) {
    v.done = true;
    applyBlessing(c, v.offer);
    c.events.push({ type: "visitor", kind: "merchant", action: "buy", x: v.x, y: v.y, id: v.offer });
  }
}

function builtKinds(c: Camp): Set<string> {
  return new Set(c.plots.filter((p) => p.level > 0).map((p) => p.kind));
}

export function rerollsLeft(c: Camp): number {
  return Math.max(0, c.mods.rerolls - c.rerollsUsed);
}

export function rerollBlessings(c: Camp): boolean {
  if (c.phase !== "pick" || rerollsLeft(c) <= 0) return false;
  c.rerollsUsed += 1;
  c.offers = rollBlessings(c.rng, c.wave, c.owned, 3, builtKinds(c), c.classicBlessings);
  c.events.push({ type: "offers" });
  return true;
}

export function applyBlessing(c: Camp, id: string): void {
  const b = BLESSING_BY_ID[id];
  if (!b) throw new Error(`unknown blessing ${id}`);
  const wallBefore = c.mods.wallHp;
  b.apply(c.mods);
  c.owned[id] = (c.owned[id] ?? 0) + 1;
  if (c.mods.wallHp !== wallBefore) {
    const k = c.mods.wallHp / wallBefore;
    for (const sg of c.segments) {
      sg.maxHp = Math.round(sg.maxHp * k);
      if (sg.hp > 0) sg.hp = Math.round(sg.hp * k);
    }
  }
  c.events.push({ type: "blessing", id });
}

function unlockPlot(c: Camp, p: Plot): void {
  p.locked = false;
  c.events.push({ type: "plotUnlocked", label: p.label, x: p.x, y: p.y });
}

/** Building draft: open `kind` now; the other drafted kinds open next dawn. */
export function chooseBuilding(c: Camp, kind: PlotKind): boolean {
  if (c.phase !== "pick" || !c.buildChoice?.includes(kind)) return false;
  for (const p of c.plots) {
    if (!p.locked || !c.buildChoice.includes(p.kind)) continue;
    if (p.kind === kind) unlockPlot(c, p);
    else p.unlockWave = c.wave + 1;
  }
  c.buildChoice = null;
  c.events.push({ type: "buildChosen", kind });
  if (!c.offers.length) beginBuild(c);
  return true;
}

export function chooseBlessing(c: Camp, id: string): boolean {
  if (c.phase !== "pick" || c.buildChoice || !c.offers.some((o) => o.id === id)) return false;
  applyBlessing(c, id);
  c.offers = [];
  beginBuild(c);
  return true;
}

export function drainEvents(c: Camp): CampEvent[] {
  const e = c.events;
  c.events = [];
  return e;
}

