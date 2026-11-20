import { describe, expect, it } from "vitest";
import { burnRate, createLanterns, driftSpeed, LANTERN, lanternReward, lanternStars, stepLanterns, tapLantern } from "../src/mini/lanterns";

const DT = 1 / 60;
const run = (s: ReturnType<typeof createLanterns>, secs: number) => { for (let i = 0; i < Math.round(secs / DT); i++) stepLanterns(s, DT); };

describe("Ghost Lanterns", () => {
  it("tapping a wraith banishes it and scores; a low lantern refills on tap", () => {
    const s = createLanterns(1);
    s.spawnIn = 99;
    s.wraiths.push({ id: 90, x: 100, y: 300, target: 1, gone: -1 });
    expect(tapLantern(s, 104, 302)).toBe("wraith");
    expect(s.score).toBe(2);
    s.lamps[2]!.oil = 0.2;
    expect(tapLantern(s, LANTERN.xs[2], LANTERN.y)).toBe("lamp");
    expect(s.lamps[2]!.oil).toBe(1);
    expect(s.score).toBe(3);
    expect(tapLantern(s, 180, 60)).toBe("miss");
    expect(s.combo).toBe(0);
  });

  it("a wraith that reaches its lantern snuffs it; lanterns burn out; all dark ends the watch", () => {
    const s = createLanterns(2);
    s.spawnIn = 99;
    s.wraiths.push({ id: 91, x: LANTERN.xs[0], y: LANTERN.y - 30, target: 0, gone: -1 });
    run(s, 1);
    expect(s.lamps[0]!.lit).toBe(false);
    s.lamps[1]!.oil = 0.01;
    run(s, 0.5);
    expect(s.lamps[1]!.lit).toBe(false);
    s.lamps[2]!.lit = false;
    s.lamps[3]!.oil = 0.01;
    run(s, 0.5);
    expect(s.lost && s.over).toBe(true);
  });

  it("gets harder over the round, is deterministic, and ends after 60 s", () => {
    expect(burnRate(60)).toBeGreaterThan(burnRate(0));
    expect(driftSpeed(60)).toBeGreaterThan(driftSpeed(0));
    const go = () => { const s = createLanterns(9); for (let i = 0; i < 60 * 30; i++) { stepLanterns(s, DT); const w = s.wraiths.find((k) => k.gone < 0); if (w && i % 20 === 0) tapLantern(s, w.x, w.y); } return [s.score, s.nextId, s.lamps.map((l) => l.lit)]; };
    expect(go()).toEqual(go());
    const t = createLanterns(4);
    for (let i = 0; i < 60 * 61 && !t.over; i++) { stepLanterns(t, DT); for (const l of t.lamps) { l.oil = 1; l.lit = true; } t.wraiths = []; }
    expect(t.over && !t.lost).toBe(true);
  });

  it("stars and rewards", () => {
    expect(lanternStars(149)).toBe(0);
    expect(lanternStars(300)).toBe(2);
    expect(lanternReward(300, 0)).toEqual({ gold: 100 + 60 + 120, stars: 2, newStars: 2 });
  });
});
