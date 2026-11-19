import { describe, expect, it } from "vitest";
import { comboMult, createRange, hitPoints, RANGE, rangeReward, shoot, starsFor, stepRange } from "../src/mini/archery";

const DT = 1 / 60;

describe("Archery Range", () => {
  it("scores bullseyes, rings and ravens with a combo multiplier", () => {
    expect(hitPoints("board", true, 1)).toBe(3);
    expect(hitPoints("board", false, 1)).toBe(1);
    expect(hitPoints("raven", false, 1)).toBe(5);
    expect(comboMult(2)).toBe(1);
    expect(comboMult(3)).toBe(2);
    expect(comboMult(30)).toBe(3);
    expect(hitPoints("board", true, 6)).toBe(9);
  });

  it("gives stars at the thresholds and pays new star tiers once", () => {
    expect(starsFor(29)).toBe(0);
    expect(starsFor(60)).toBe(2);
    expect(starsFor(150)).toBe(3);
    expect(rangeReward(65, 0)).toEqual({ gold: 65 + 60 + 120, stars: 2, newStars: 2 });
    expect(rangeReward(65, 2)).toEqual({ gold: 65, stars: 2, newStars: 0 });
  });

  it("an arrow aimed at a target hits it and scores; shots wait for the reload", () => {
    const s = createRange(1);
    s.targets.push({ id: 99, kind: "board", x: RANGE.bowX, y: 300, vx: 0, vy: 0, r: 30, life: 30, hit: false });
    s.spawnTimer = 99;
    // Pull straight down (full draw) to shoot straight up.
    expect(shoot(s, 0, RANGE.fullDraw)).toBe(true);
    expect(shoot(s, 0, RANGE.fullDraw)).toBe(false); // reloading
    for (let i = 0; i < 60 && s.hits === 0; i++) stepRange(s, DT);
    expect(s.hits).toBe(1);
    expect(s.score).toBeGreaterThanOrEqual(1);
    // A target right in the arrow's path (no gravity drift yet) is a bullseye.
    const b = createRange(1);
    b.spawnTimer = 99;
    b.targets.push({ id: 98, kind: "board", x: RANGE.bowX, y: RANGE.bowY - 60, vx: 0, vy: 0, r: 30, life: 30, hit: false });
    shoot(b, 0, RANGE.fullDraw);
    for (let i = 0; i < 30 && b.hits === 0; i++) stepRange(b, DT);
    expect(b.score).toBe(3);
  });

  it("a miss breaks the combo, and the round ends after 60 s", () => {
    const s = createRange(2);
    s.combo = 5;
    shoot(s, 150, 20); // flat and sideways: flies off the side
    for (let i = 0; i < 120; i++) stepRange(s, DT);
    expect(s.combo).toBe(0);
    for (let i = 0; i < 60 * 61; i++) stepRange(s, DT);
    expect(s.over).toBe(true);
    expect(s.left).toBe(0);
  });

  it("is deterministic for a seed and keeps targets coming", () => {
    const run = () => {
      const s = createRange(7);
      for (let i = 0; i < 60 * 30; i++) {
        if (i % 40 === 0) shoot(s, 10, RANGE.fullDraw);
        stepRange(s, DT);
      }
      return [s.score, s.shots, s.targets.length, s.nextId];
    };
    expect(run()).toEqual(run());
    const s = createRange(3);
    for (let i = 0; i < 60 * 25; i++) stepRange(s, DT);
    expect(s.targets.length).toBeGreaterThan(1);
    expect(s.targets.some((t) => t.kind === "raven") || s.nextId > 10).toBe(true);
  });
});
