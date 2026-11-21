import { describe, expect, it } from "vitest";
import { applyBlessing, createCamp, drainEvents, spawnEnemy, step, type Camp } from "../src/camp/sim";
import { STEP, WALL_Y } from "../src/camp/world";
import { BLESSINGS, rollBlessings } from "../src/camp/blessings";
import { createRng } from "../src/core/rng";

const still = { move: { x: 0, y: 0 }, callWave: false, ability: false };
function run(c: Camp, seconds: number): void {
  for (let i = 0; i < seconds / STEP; i++) step(c, still);
}
const RULES = ["ricochet", "thorns", "wildfire", "cull", "banner", "goldvolley", "blades", "maiden"];

describe("rule-changing blessings", () => {
  it("stay out of daily runs (classic pool), so a day's challenge is unchanged", () => {
    for (const id of RULES) expect(BLESSINGS.find((b) => b.id === id)?.newer).toBe(true);
    const rng = createRng(5);
    for (let i = 0; i < 200; i++) for (const b of rollBlessings(rng, 8, {}, 3, new Set(), true)) expect(RULES).not.toContain(b.id);
  });

  it("Thorn Walls: a foe hammering the wall takes damage back", () => {
    const hp = (thorns: boolean) => {
      const c = createCamp(1);
      c.phase = "wave";
      c.hero.x = 20;
      c.hero.y = 1400;
      c.hero.dead = true;
      if (thorns) applyBlessing(c, "thorns");
      const e = spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 50, lane: null }, { x: 300, y: WALL_Y - 30 });
      run(c, 6);
      return e.hp;
    };
    expect(hp(true)).toBeLessThan(hp(false));
  });

  it("Ricochet: a hero arrow bounces to a second foe", () => {
    const c = createCamp(1);
    c.phase = "wave";
    applyBlessing(c, "ricochet");
    c.hero.x = 300;
    c.hero.y = WALL_Y + 60;
    const a = spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 50, lane: null }, { x: 300, y: WALL_Y - 120 });
    const b = spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 50, lane: null }, { x: 340, y: WALL_Y - 150 });
    drainEvents(c);
    let bounced = false;
    for (let i = 0; i < 3 / STEP && !bounced; i++) {
      step(c, still);
      bounced = drainEvents(c).some((ev) => ev.type === "rule" && ev.rule === "ricochet");
    }
    expect(bounced).toBe(true);
    run(c, 1);
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it("Culling Blade: a hero arrow finishes a weakened foe", () => {
    const c = createCamp(1);
    c.phase = "wave";
    applyBlessing(c, "cull");
    c.hero.x = 300;
    c.hero.y = WALL_Y + 60;
    const e = spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 200, lane: null }, { x: 300, y: WALL_Y - 100 });
    e.hp = e.maxHp * 0.149;
    drainEvents(c);
    let culled = false;
    for (let i = 0; i < 4 / STEP && !culled; i++) {
      step(c, still);
      culled = drainEvents(c).some((ev) => ev.type === "rule" && ev.rule === "cull");
    }
    expect(culled).toBe(true);
    expect(c.enemies.includes(e)).toBe(false);
  });

  it("Wildfire: a burning foe's death sets its neighbour ablaze", () => {
    const c = createCamp(1);
    c.phase = "wave";
    c.mods.wildfire = 1;
    c.hero.dead = true;
    const a = spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 1, lane: null }, { x: 300, y: WALL_Y - 200 });
    const b = spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 50, lane: null }, { x: 330, y: WALL_Y - 200 });
    a.burnDps = 10;
    a.burnTime = 2;
    a.hp = 0.01;
    step(c, still);
    expect(b.burnTime).toBeGreaterThan(0);
    expect(drainEvents(c).some((ev) => ev.type === "rule" && ev.rule === "wildfire")).toBe(true);
  });

  it("Rallying Banner: a tower next to the hero fires faster", () => {
    const shots = (banner: boolean) => {
      const c = createCamp(1);
      c.phase = "wave";
      const t = c.plots.find((p) => p.kind === "tower")!;
      t.level = 1;
      t.locked = false;
      c.hero.x = t.x;
      c.hero.y = t.y + 30;
      c.mods.heroRate = 0.0001; // keep the hero's own arrows out of the count
      if (banner) applyBlessing(c, "banner");
      spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 500, lane: null }, { x: t.x, y: WALL_Y - 60 });
      drainEvents(c);
      let n = 0;
      for (let i = 0; i < 6 / STEP; i++) {
        step(c, still);
        n += drainEvents(c).filter((ev) => ev.type === "shoot" && ev.owner === "tower").length;
      }
      return n;
    };
    expect(shots(true)).toBeGreaterThan(shots(false) * 1.3);
  });

  it("Golden Volley: grabbing enough coins looses a ring of arrows", () => {
    const c = createCamp(1);
    c.phase = "wave";
    applyBlessing(c, "goldvolley");
    c.mods.coinVolley = 3;
    for (let i = 0; i < 3; i++) spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 50, lane: null }, { x: c.hero.x + 40 * i - 40, y: c.hero.y - 150 });
    for (let i = 0; i < 4; i++) c.coins.push({ id: 9000 + i, x: c.hero.x + 5, y: c.hero.y, vx: 0, vy: 0, z: 0, vz: 0, homing: true });
    drainEvents(c);
    let volley = false;
    for (let i = 0; i < 1 / STEP && !volley; i++) {
      step(c, still);
      volley = drainEvents(c).some((ev) => ev.type === "rule" && ev.rule === "volley");
    }
    expect(volley).toBe(true);
  });
});
