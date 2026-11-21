import { describe, expect, it } from "vitest";
import { createCamp, drainEvents, MASTERY_SPEC, spawnEnemy, SPEC, step, TOWER_LEVELS } from "../src/camp/sim";
import { STEP, WALL_Y } from "../src/camp/world";

function volleyShots(level: number): number {
  const c = createCamp(1);
  c.phase = "wave";
  c.hero.dead = true;
  const t = c.plots.find((p) => p.kind === "tower")!;
  t.level = level;
  t.spec = "volley";
  for (let i = 0; i < 8; i++) spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 500, lane: null }, { x: t.x - 70 + i * 20, y: WALL_Y - 80 }).stunTime = 99;
  drainEvents(c);
  let best = 0;
  for (let i = 0; i < 3 / STEP; i++) {
    step(c, { move: { x: 0, y: 0 } });
    best = Math.max(best, drainEvents(c).filter((e) => e.type === "shoot" && e.owner === "tower").length);
  }
  return best;
}

describe("tower Spec Mastery (level 5)", () => {
  it("is a 5th level on every archer tower, a little stronger than level 4", () => {
    const c = createCamp(1);
    for (const p of c.plots.filter((q) => q.kind === "tower")) expect(p.maxLevel).toBe(5);
    expect(TOWER_LEVELS[4]!.damage).toBeGreaterThan(TOWER_LEVELS[3]!.damage);
  });
  it("Volley Mastery looses more arrows per shot", () => {
    expect(volleyShots(4)).toBe(1 + SPEC.volleyExtra);
    expect(volleyShots(5)).toBe(1 + MASTERY_SPEC.volleyExtra);
  });
  it("Fire Mastery burns harder and longer", () => {
    const burn = (level: number) => {
      const c = createCamp(1);
      c.phase = "wave";
      c.hero.dead = true;
      const t = c.plots.find((p) => p.kind === "tower")!;
      t.level = level;
      t.spec = "fire";
      const e = spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 500, lane: null }, { x: t.x, y: WALL_Y - 80 });
      e.stunTime = 99;
      for (let i = 0; i < 2 / STEP && e.burnTime <= 0; i++) step(c, { move: { x: 0, y: 0 } });
      return { dps: e.burnDps, time: e.burnTime };
    };
    const a = burn(4), b = burn(5);
    expect(b.dps).toBeGreaterThan(a.dps * 1.8);
    expect(b.time).toBeGreaterThan(a.time + 1);
  });
});
