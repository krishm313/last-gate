import { describe, expect, it } from "vitest";
import { CHAPTERS } from "../src/core/chapters";
import { ENEMIES, type EnemyId } from "../src/core/enemies";
import { planWave as plan } from "../src/core/waves";
import { createCamp, drainEvents, step, type Camp, type Enemy } from "../src/camp/sim";
import { HALL, STEP, WALL_Y } from "../src/camp/world";

const CHAPTER_1 = CHAPTERS[0]!;
const planWave = (w: number, seed: number) => plan(CHAPTER_1, w, seed);

/** A camp mid-wave with nothing queued, hero parked far away, ready for hand-placed enemies. */
function arena(): Camp {
  const c = createCamp(1);
  c.phase = "wave";
  c.wave = 1;
  c.hero.x = 20;
  c.hero.y = 1280;
  return c;
}

function place(c: Camp, id: EnemyId, x: number, y: number): Enemy {
  const def = ENEMIES[id];
  const e: Enemy = {
    id: c.nextId++, def, x, y, hp: def.hp * 20, maxHp: def.hp * 20, attackTimer: def.attackInterval, flash: 0, sway: 0, hpMult: 1,
    burnTime: 0, burnDps: 0, slowTime: 0, slowPct: 0, stunTime: 0, abilityTimer: def.summon?.interval ?? 0, healTimer: def.heal?.interval ?? 0,
    age: 0, enraged: false, attacking: false, inside: false, exploded: false,
  };
  c.enemies.push(e);
  return e;
}

function run(c: Camp, seconds: number) {
  for (let i = 0; i < seconds / STEP; i++) {
    step(c, { move: { x: 0, y: 0 } });
    c.hero.hp = c.hero.maxHp;
  }
}

describe("camp enemy behaviours", () => {
  it("footmen walk to the wall and batter the segment in front of them", () => {
    const c = arena();
    place(c, "footman", 100, 300);
    run(c, 12);
    expect(c.segments[1]!.hp).toBeLessThan(c.segments[1]!.maxHp);
    expect(c.enemies[0]!.y).toBeLessThan(WALL_Y);
  });

  it("crossbowmen stop within tower range and shoot the wall (regression: waves stalled)", () => {
    const c = arena();
    const cb = place(c, "crossbow", 360, 200);
    run(c, 12);
    expect(cb.y).toBeGreaterThan(WALL_Y - 200);
    expect(cb.y).toBeLessThan(WALL_Y - 100);
    expect(drainEvents(c).some((e) => e.type === "wallHit")).toBe(true);
  });

  it("bats fly over the wall to the hall", () => {
    const c = arena();
    place(c, "bat", 360, 300);
    run(c, 15);
    expect(c.hallHp).toBeLessThan(c.hallMaxHp);
  });

  it("the Bone Dragon strafes and breathes fire instead of flying to the hall (regression)", () => {
    const c = arena();
    const d = place(c, "dragon", 360, 100);
    run(c, 20);
    expect(d.y).toBeLessThan(WALL_Y - 100);
    expect(Math.hypot(d.x - HALL.x, d.y - HALL.y)).toBeGreaterThan(300);
  });

  it("goblin mobs split into goblins on death", () => {
    const c = arena();
    const mob = place(c, "mob", 360, 300);
    mob.hp = 0;
    run(c, STEP);
    expect(c.enemies.filter((e) => e.def.id === "goblin").length).toBe(3);
  });

  it("sappers blow up a wall segment and drop no coins", () => {
    const c = arena();
    place(c, "sapper", 100, WALL_Y - 40);
    run(c, 3);
    expect(c.enemies.length).toBe(0);
    expect(c.segments[1]!.hp).toBeLessThan(c.segments[1]!.maxHp);
    expect(c.coins.length).toBe(0);
  });

  it("broken segments let enemies into the camp", () => {
    const c = arena();
    c.segments[1]!.hp = 0;
    const e = place(c, "footman", 90, 400);
    run(c, 10);
    expect(e.y).toBeGreaterThan(WALL_Y);
  });
});

describe("chapter 1 waves", () => {
  it("introduce new enemies alone first and put bosses on waves 5 and 10", () => {
    const w2 = planWave(2, 1);
    expect(w2.intro).toBe("runner");
    expect(w2.spawns.slice(0, 3).every((s) => s.enemy === "runner")).toBe(true);
    expect(planWave(5, 1).spawns.some((s) => s.enemy === "ogre")).toBe(true);
    expect(planWave(10, 1).spawns.some((s) => s.enemy === "warlord")).toBe(true);
    expect(CHAPTER_1.waves.length).toBe(10);
  });

  it("wave plans are deterministic per seed and get harder", () => {
    expect(planWave(7, 123)).toEqual(planWave(7, 123));
    for (let w = 2; w <= 10; w++) expect(planWave(w, 1).spawns[0]!.hpMult).toBeGreaterThan(planWave(w - 1, 1).spawns[0]!.hpMult);
  });
});
