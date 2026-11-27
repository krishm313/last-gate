import { describe, expect, it } from "vitest";
import { BLOSSOM_PASS } from "../src/core/chapters";
import { planWave } from "../src/core/waves";
import { createCamp, drainEvents, spawnEnemy, step, TWIN, type CampInput } from "../src/camp/sim";

// Chapter 12 (batch 5, slice 3): the Twin Generals arrive together; the survivor takes vengeance.
const idle: CampInput = { move: { x: 0, y: 0 } };

describe("Twin Generals (ch12)", () => {
  it("the finale spawns both generals side by side, announced as the Twin Generals", () => {
    const last = BLOSSOM_PASS.waves.length;
    const plan = planWave(BLOSSOM_PASS, last, 1);
    const bosses = plan.spawns.filter((s) => s.enemy === "jadegeneral" || s.enemy === "crimsongeneral");
    expect(bosses.map((s) => s.enemy).sort()).toEqual(["crimsongeneral", "jadegeneral"]);
    expect(bosses[0]!.at).toBe(bosses[1]!.at);
    expect(bosses[0]!.lane).not.toBe(bosses[1]!.lane);
    expect(plan.boss2).toBe("crimsongeneral");
  });
  it("when one falls the other gains vengeance (once), and the shared bar keeps the fallen share", () => {
    const c = createCamp(12, BLOSSOM_PASS, {});
    c.phase = "wave";
    c.queue = [];
    c.hero.x = 40; c.hero.y = 1150;
    for (const p of c.plots) p.level = 0;
    const jade = spawnEnemy(c, { at: 0, enemy: "jadegeneral", hpMult: 1, lane: 0.3 });
    const crimson = spawnEnemy(c, { at: 0, enemy: "crimsongeneral", hpMult: 1, lane: 0.7 });
    jade.y = crimson.y = 300;
    step(c, idle);
    drainEvents(c);
    jade.hp = 0;
    step(c, idle);
    const evs = drainEvents(c);
    expect(evs.some((e) => e.type === "vengeance")).toBe(true);
    expect(crimson.vengeance).toBe(true);
    expect(crimson.enraged).toBe(true);
    expect(crimson.twinLost).toBe(jade.maxHp);
    expect(TWIN.speed).toBeGreaterThan(1);
  });
});
