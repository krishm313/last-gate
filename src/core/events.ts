import type { EnemyDef } from "./enemies";

export interface Vec {
  x: number;
  y: number;
}

/** Event vocabulary understood by the shared SFX / FX layers. */
export type GameEvent =
  | { type: "shoot"; owner: "hero" | "archer" | "tower" | "enemy"; x: number; y: number }
  | { type: "hit"; x: number; y: number; damage: number; crit: boolean; owner: string }
  | { type: "kill"; x: number; y: number; enemy: Pick<EnemyDef, "radius" | "boss" | "color">; gold: number }
  | { type: "gateHit"; x: number; damage: number; source: string }
  | { type: "zap"; points: Vec[] }
  | { type: "boom"; x: number; y: number; r: number; kind: "shatter" | "wildfire" | "plague" | "boulder" | "nova" }
  | { type: "block"; x: number; y: number }
  | { type: "immune"; x: number; y: number }
  | { type: "heal"; x: number; y: number; r: number }
  | { type: "summon"; x: number; y: number }
  | { type: "enrage"; x: number; y: number; name: string }
  | { type: "bossSpawn"; name: string }
  | { type: "sapper"; x: number; y: number }
  | { type: "tower"; kind: "catapult" | "mage" | "ballista"; x: number; y: number }
  | { type: "ability"; id: string; x: number; y: number }
  | { type: "abilityReady" }
  | { type: "waveStart"; wave: number; breather: boolean; boss: string | null; intro: string | null }
  | { type: "waveClear"; wave: number }
  | { type: "offers" }
  | { type: "upgrade"; id: string }
  | { type: "won" }
  | { type: "lost" };
