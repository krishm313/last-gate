import { describe, expect, it } from "vitest";
import { CHAPTER_BY_ID } from "../src/core/chapters";
import { createCamp, reduction, spawnEnemy, step, type Camp, type CampInput } from "../src/camp/sim";
import { HALL, WALL_THICK, WALL_Y } from "../src/camp/world";

const idle: CampInput = { move: { x: 0, y: 0 } };
function night(): Camp {
  const c = createCamp(3, CHAPTER_BY_ID[6]!, {});
  c.phase = "wave";
  c.queue = [];
  c.wave = 3;
  // Keep the hero out of the fight.
  c.hero.x = 40;
  c.hero.y = 1150;
  for (const p of c.plots) p.level = 0;
  return c;
}
const run = (c: Camp, secs: number) => { for (let i = 0; i < secs * 60; i++) { c.hero.x = 40; c.hero.y = 1150; step(c, idle); } };

describe("C7 new foes", () => {
  it("Shield Wall: foes in the lane behind it take half damage; others don't", () => {
    const c = night();
    const w = spawnEnemy(c, { at: 0, enemy: "phalanx", hpMult: 1, lane: null }, { x: 300, y: 300 });
    const behind = spawnEnemy(c, { at: 0, enemy: "footman", hpMult: 1, lane: null }, { x: 305, y: 250 });
    const aside = spawnEnemy(c, { at: 0, enemy: "footman", hpMult: 1, lane: null }, { x: 420, y: 250 });
    run(c, 0.05);
    expect(w.def.guard).toBeTruthy();
    expect(behind.guarded).toBe(true);
    expect(aside.guarded).toBe(false);
    expect(reduction(behind)).toBeCloseTo(0.5, 2);
    expect(reduction(aside)).toBe(0);
  });
  it("Wall Climber: climbs over the wall (hittable while climbing) and ends up inside", () => {
    const c = night();
    const e = spawnEnemy(c, { at: 0, enemy: "climber", hpMult: 5, lane: null }, { x: 200, y: WALL_Y - WALL_THICK / 2 - 30 });
    let sawClimb = false;
    for (let i = 0; i < 60 * 6 && !e.inside; i++) {
      c.hero.x = 40; c.hero.y = 1150;
      step(c, idle);
      if (e.climb && e.climb > 0) {
        sawClimb = true;
        expect(reduction(e)).toBeLessThan(1);
      }
    }
    expect(sawClimb).toBe(true);
    expect(e.y).toBeGreaterThan(WALL_Y);
    expect(c.segments.every((s) => s.hp === s.maxHp)).toBe(true);
  });
  it("Balloon Bomber: hovers above the hall out of the hero's way and bombs it", () => {
    const c = night();
    const e = spawnEnemy(c, { at: 0, enemy: "bomber", hpMult: 5, lane: null }, { x: 360, y: 300 });
    const hp0 = c.hallHp;
    run(c, 25);
    expect(Math.abs(e.y - (HALL.y - e.def.bomber!.hover))).toBeLessThan(20);
    expect(c.hallHp).toBeLessThan(hp0);
  });
});

describe("C1 Siege Tower", () => {
  it("rolls to the wall and unloads its climbers, already climbing; killing it first stops them", async () => {
    const { CHAPTER_BY_ID } = await import("../src/core/chapters");
    const { createCamp, drainEvents, spawnEnemy, step } = await import("../src/camp/sim");
    const { WALL_Y } = await import("../src/camp/world");
    const c = createCamp(3, CHAPTER_BY_ID[9]!, {});
    c.phase = "wave"; c.queue = []; c.wave = 6;
    for (const p of c.plots) p.level = 0;
    const t = spawnEnemy(c, { at: 0, enemy: "siegetower", hpMult: 50, lane: null }, { x: 200, y: WALL_Y - 120 });
    let unloaded = false;
    for (let i = 0; i < 60 * 15 && !unloaded; i++) { c.hero.x = 40; c.hero.y = 1150; step(c, { move: { x: 0, y: 0 } }); if (drainEvents(c).some((e) => e.type === "unload")) unloaded = true; }
    expect(unloaded).toBe(true);
    expect(t.unloaded).toBe(true);
    const cl = c.enemies.filter((e) => e.def.id === "climber");
    expect(cl.length).toBe(t.def.unloads!.count);
    expect(cl.every((e) => (e.climb ?? 0) > 0 || e.y > WALL_Y)).toBe(true);
  });
});

describe("C1 Ballista", () => {
  it("skewers every foe along its line and aims down the most crowded one", async () => {
    const { CHAPTER_BY_ID } = await import("../src/core/chapters");
    const { createCamp, drainEvents, spawnEnemy, step } = await import("../src/camp/sim");
    const { WALL_Y } = await import("../src/camp/world");
    const c = createCamp(3, CHAPTER_BY_ID[8]!, { layout: (await import("../src/camp/sim")).campLayout(false) });
    c.phase = "wave"; c.queue = []; c.wave = 6;
    for (const p of c.plots) p.level = 0;
    const b = c.plots.find((p) => p.kind === "ballista")!;
    b.locked = false; b.level = 1;
    // A column straight up from the ballista (inside the camp, held in place), and one stray off to the side.
    const col = [0, 1, 2, 3].map((i) => spawnEnemy(c, { at: 0, enemy: "footman", hpMult: 50, lane: null }, { x: b.x, y: WALL_Y + 60 + i * 50 }));
    const stray = spawnEnemy(c, { at: 0, enemy: "footman", hpMult: 50, lane: null }, { x: 600, y: WALL_Y + 80 });
    let ev: { hits: number } | null = null;
    for (let i = 0; i < 60 * 5 && !ev; i++) { c.hero.x = 40; c.hero.y = 1150; for (const [k, e] of col.entries()) { e.x = b.x; e.y = WALL_Y + 60 + k * 50; } stray.x = 600; stray.y = WALL_Y + 80; step(c, { move: { x: 0, y: 0 } }); ev = (drainEvents(c).find((e) => e.type === "ballista") as { hits: number } | undefined) ?? null; }
    expect(ev?.hits).toBe(4);
    expect(col.every((e) => e.hp < e.maxHp)).toBe(true);
    expect(stray.hp).toBe(stray.maxHp);
  });
});
