import { ENEMIES, type EnemyId } from "./enemies";
import { createRng, next, weighted } from "./rng";

/** One enemy to spawn, `at` seconds after the wave starts. */
export interface Spawn {
  at: number;
  enemy: EnemyId;
  /** HP multiplier applied on top of the base HP. */
  hpMult: number;
  /** Normalised horizontal position 0..1, or null for random. */
  lane: number | null;
}

export interface WaveDef {
  /** Relative weights of enemies filling the wave budget. */
  mix: Partial<Record<EnemyId, number>>;
  /** A new enemy, introduced alone as an opening group before the mix arrives. */
  intro?: EnemyId;
  /** Boss (or mini-boss) that arrives mid-wave. */
  boss?: EnemyId;
  /** Extra HP multiplier for this wave's boss (e.g. a final boss reused as a mid-chapter mini-boss). */
  bossHpMult?: number;
  breather?: boolean;
}

export interface ChapterDef {
  id: number;
  name: string;
  /** One-line flavour shown on the chapter card. */
  blurb: string;
  /** Multiplier on all enemy HP for this chapter. */
  hpMult: number;
  /** Affix: multipliers applied to every enemy in the chapter. */
  speedMult: number;
  gateDamageMult: number;
  /** Human-readable affixes for the chapter card. */
  affixes: string[];
  /** Battlefield palette. */
  ground: [string, string];
  /** Endless: waves cycle forever with a rotating boss every 5 waves; there is no victory. */
  /** Night weather odds for this chapter (defaults to the global odds). */
  weatherOdds?: { rain: number; fog: number; storm: number };
  endless?: boolean;
  /** Multiplier on every wave's enemy budget (default 1), e.g. Boss Rush's full escorts. */
  budgetMult?: number;
  waves: WaveDef[];
}

export interface WavePlan {
  number: number;
  spawns: Spawn[];
  breather: boolean;
  boss: EnemyId | null;
  intro: EnemyId | null;
}

/** Difficulty knobs; see PLAN.md §4 "Difficulty model". */
export const DIFFICULTY = {
  hpGrowth: 1.2,
  /** Spawn budget (in footman units) for wave 1, and growth per wave. */
  baseBudget: 10,
  budgetPerWave: 3.4,
  baseInterval: 0.95,
  intervalDecay: 0.93,
  minInterval: 0.3,
  breatherBudgetMult: 0.6,
  introGroup: 3,
};

export const WAVES_PER_RUN = 10;

export function planWave(chapter: ChapterDef, wave: number, seed = 1): WavePlan {
  const d = DIFFICULTY;
  const def = chapter.endless ? endlessWave(chapter, wave) : chapter.waves[Math.min(wave, chapter.waves.length) - 1]!;
  const rng = createRng((seed ^ (wave * 0x9e3779b1)) >>> 0);
  const breather = !!def.breather;
  let budget = d.baseBudget + d.budgetPerWave * (wave - 1);
  if (breather) budget *= d.breatherBudgetMult;
  if (def.boss) budget *= wave >= chapter.waves.length ? 0.5 : 0.7;
  budget *= chapter.budgetMult ?? 1;
  const interval = Math.max(d.minInterval, d.baseInterval * d.intervalDecay ** (wave - 1));
  const hpMult = chapter.hpMult * d.hpGrowth ** (wave - 1);

  const spawns: Spawn[] = [];
  let t = 0.6;
  if (def.intro) {
    // Introduce the new enemy alone, spread across the field, so the player learns what it does.
    for (let i = 0; i < d.introGroup; i++) {
      spawns.push({ at: t, enemy: def.intro, hpMult, lane: (i + 0.5) / d.introGroup });
      budget -= ENEMIES[def.intro].cost;
    }
    t += 4;
  }
  const mixIds = Object.keys(def.mix) as EnemyId[];
  let i = 0;
  while (budget > 0) {
    const enemy = weighted(rng, mixIds, (id) => def.mix[id] ?? 0);
    spawns.push({ at: t, enemy, hpMult, lane: null });
    budget -= ENEMIES[enemy].cost;
    // Every few enemies a tight cluster arrives to create pressure spikes.
    const cluster = i % 6 >= 4;
    t += (cluster ? interval * 0.35 : interval) * (0.6 + ENEMIES[enemy].cost * 0.4) * (0.85 + next(rng) * 0.3);
    i++;
  }
  if (def.boss) {
    // Bosses arrive a third of the way through, with the rest of the wave flowing around them.
    const at = spawns.length ? spawns[Math.floor(spawns.length / 3)]!.at : 1;
    // Bosses scale more gently with chapter than the rank and file, or they become HP sponges.
    const bossMult = chapter.hpMult ** 0.6 * d.hpGrowth ** ((wave - 1) * 0.5) * (def.bossHpMult ?? 1);
    spawns.push({ at, enemy: def.boss, hpMult: bossMult, lane: 0.5 });
    spawns.sort((a, b) => a.at - b.at);
  }
  return { number: wave, spawns, breather, boss: def.boss ?? null, intro: def.intro ?? null };
}

const ENDLESS_BOSSES: EnemyId[] = ["ogre", "warlord", "troll", "hag", "golem", "dragon", "colossus", "frostwyrm", "magma", "drowned", "bloodlord"];

/** Endless waves: cycle the template list; every 5th wave brings the next boss in rotation. */
function endlessWave(chapter: ChapterDef, wave: number): WaveDef {
  const base = chapter.waves[(wave - 1) % chapter.waves.length]!;
  if (wave % 5 !== 0) return { ...base, boss: undefined, breather: wave % 10 === 4 };
  return { ...base, boss: ENDLESS_BOSSES[(wave / 5 - 1) % ENDLESS_BOSSES.length]!, breather: false };
}

export function enemyHp(enemy: EnemyId, hpMult: number): number {
  return Math.round(ENEMIES[enemy].hp * hpMult);
}
