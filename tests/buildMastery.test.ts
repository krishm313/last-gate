import { describe, expect, it } from "vitest";
import { BUILD_MASTERY, createCamp, PRE_MASTERY, spawnEnemy, step, type Camp } from "../src/camp/sim";
import { STEP, WALL_Y } from "../src/camp/world";

const still = { move: { x: 0, y: 0 } };
function camp(): Camp {
  const c = createCamp(1);
  c.phase = "wave";
  c.hero.dead = true;
  return c;
}

describe("building masteries", () => {
  it("catapult, mage and spikes each gain a level past their old max", () => {
    const c = createCamp(1);
    for (const kind of ["catapult", "mage", "spikes"] as const) {
      const p = c.plots.find((q) => q.kind === kind)!;
      expect(p.maxLevel).toBe(PRE_MASTERY[kind]! + 1);
    }
  });
  it("Firestorm Mastery: a catapult boulder sets the splash ablaze", () => {
    const run = (level: number) => {
      const c = camp();
      const p = c.plots.find((q) => q.kind === "catapult")!;
      p.locked = false;
      p.level = level;
      const e = spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 500, lane: null }, { x: p.x, y: WALL_Y - 120 });
      e.stunTime = 99;
      for (let i = 0; i < 6 / STEP && e.burnTime <= 0; i++) step(c, still);
      return e.burnTime;
    };
    expect(run(3)).toBe(0);
    expect(run(4)).toBeGreaterThan(0);
  });
  it("Storm Mastery: the mage's first target is stunned (never a boss)", () => {
    const c = camp();
    const p = c.plots.find((q) => q.kind === "mage")!;
    p.locked = false;
    p.level = 4;
    p.cooldown = 0;
    const e = spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 500, lane: null }, { x: p.x, y: WALL_Y - 100 });
    let stunned = false;
    for (let i = 0; i < 4 / STEP && !stunned; i++) {
      step(c, still);
      stunned = e.stunTime > 0;
    }
    expect(stunned).toBe(true);
    expect(BUILD_MASTERY.mageStun).toBeGreaterThan(0);
  });
});
