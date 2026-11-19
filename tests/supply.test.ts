import { describe, expect, it } from "vitest";
import { createRun, ROAD, roadSpeed, steer, stepRun, supplyReward, supplyStars } from "../src/mini/supply";

const DT = 1 / 60;

describe("Supply Run", () => {
  it("steers between three lanes and speeds up over the run", () => {
    const s = createRun(1);
    steer(s, -1);
    steer(s, -1);
    expect(s.lane).toBe(0);
    steer(s, 1);
    expect(s.lane).toBe(1);
    expect(roadSpeed(ROAD.time)).toBeGreaterThan(roadSpeed(0));
  });

  it("collects pickups, and hazards cost a life (with a moment of safety after a hit)", () => {
    const s = createRun(2);
    s.spawnIn = 99;
    s.things.push({ id: 90, kind: "crate", lane: 1, y: ROAD.wagonY - 60, done: false });
    for (let i = 0; i < 30; i++) stepRun(s, DT);
    expect(s.score).toBeGreaterThanOrEqual(15);
    s.things.push({ id: 91, kind: "rock", lane: 1, y: ROAD.wagonY - 60, done: false }, { id: 92, kind: "log", lane: 1, y: ROAD.wagonY - 70, done: false });
    for (let i = 0; i < 30; i++) stepRun(s, DT);
    expect(s.hp).toBe(ROAD.hp - 1); // the second hazard lands inside the safety window
  });

  it("three hits crash the wagon; otherwise the run ends after 90 s", () => {
    const s = createRun(3);
    s.spawnIn = 99;
    s.hp = 1;
    s.things.push({ id: 93, kind: "goblin", lane: 1, y: ROAD.wagonY - 50, done: false });
    for (let i = 0; i < 30; i++) stepRun(s, DT);
    expect(s.crashed && s.over).toBe(true);
    const t = createRun(4);
    t.hp = 999;
    for (let i = 0; i < 60 * 91; i++) stepRun(t, DT);
    expect(t.over).toBe(true);
    expect(t.left).toBe(0);
  });

  it("always leaves a free lane in each row, and is deterministic", () => {
    const s = createRun(5);
    for (let i = 0; i < 60 * 60; i++) {
      stepRun(s, DT);
      s.hp = 3;
      const rows = new Map<number, Set<number>>();
      for (const th of s.things) if (th.kind === "rock" || th.kind === "log" || th.kind === "goblin") {
        const key = Math.round(th.y);
        if (!rows.has(key)) rows.set(key, new Set());
        rows.get(key)!.add(th.lane);
      }
      for (const lanes of rows.values()) expect(lanes.size).toBeLessThan(3);
    }
    const run = () => { const r = createRun(9); for (let i = 0; i < 60 * 40; i++) { if (i % 50 === 0) steer(r, i % 100 ? 1 : -1); stepRun(r, DT); } return [r.score, r.hp, r.nextId]; };
    expect(run()).toEqual(run());
  });

  it("stars and rewards", () => {
    expect(supplyStars(149)).toBe(0);
    expect(supplyStars(320)).toBe(2);
    expect(supplyReward(320, 0)).toEqual({ gold: 80 + 60 + 120, stars: 2, newStars: 2 });
    expect(supplyReward(320, 2).gold).toBe(80);
  });
});
