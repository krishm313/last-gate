import { describe, expect, it } from "vitest";
import { createDragon, DRAGON, dragonReward, dragonStars, fuseAt, steerTo, stepDragon } from "../src/mini/dragon";

const DT = 1 / 60;
const run = (s: ReturnType<typeof createDragon>, secs: number) => { for (let i = 0; i < Math.round(secs / DT); i++) stepDragon(s, DT); };

describe("Dragon Dodge", () => {
  it("the King runs toward the finger and stays in the courtyard", () => {
    const s = createDragon(1);
    s.blastIn = 99;
    steerTo(s, -500, 0);
    run(s, 3);
    expect(s.x).toBe(DRAGON.x0);
    expect(s.y).toBe(DRAGON.y0);
  });

  it("fire burns only once its fuse runs out, then a moment of safety", () => {
    const s = createDragon(2);
    s.blastIn = 99; s.coinIn = 99; s.lineIn = 99;
    s.blasts.push({ id: 90, kind: "spot", x: s.x, y: s.y, r: 50, fuse: 0.5, t: 0, fired: false });
    run(s, 0.4);
    expect(s.lives).toBe(DRAGON.lives);
    run(s, 0.2);
    expect(s.lives).toBe(DRAGON.lives - 1);
    s.blasts.push({ id: 91, kind: "line", x: 180, y: s.y, r: 26, fuse: 0.1, t: 0, fired: false });
    run(s, 0.2);
    expect(s.lives).toBe(DRAGON.lives - 1); // still flashing from the first burn
  });

  it("walking out of a mark in time is safe; coins pay; three burns end it", () => {
    const s = createDragon(3);
    s.blastIn = 99; s.coinIn = 99; s.lineIn = 99;
    s.blasts.push({ id: 92, kind: "spot", x: s.x, y: s.y, r: 40, fuse: 0.8, t: 0, fired: false });
    steerTo(s, s.x + 150, s.y);
    run(s, 1);
    expect(s.lives).toBe(DRAGON.lives);
    s.coins.push({ id: 93, x: s.x, y: s.y - 10, t: 0 });
    const before = s.score;
    run(s, 0.05);
    expect(s.score).toBe(before + DRAGON.coin);
    s.lives = 1;
    s.blasts.push({ id: 94, kind: "spot", x: s.x, y: s.y, r: 40, fuse: 0.05, t: 0, fired: false });
    run(s, 0.1);
    expect(s.lost && s.over).toBe(true);
  });

  it("marks come quicker later, and the round is deterministic", () => {
    expect(fuseAt(60)).toBeLessThan(fuseAt(0));
    const go = () => { const s = createDragon(9); for (let i = 0; i < 60 * 40; i++) { if (i % 40 === 0) steerTo(s, 60 + (i % 240), 200 + (i % 300)); stepDragon(s, DT); } return [s.score, s.lives, s.nextId]; };
    expect(go()).toEqual(go());
  });

  it("stars and rewards", () => {
    expect(dragonStars(59)).toBe(0);
    expect(dragonStars(120)).toBe(2);
    expect(dragonReward(120, 0)).toEqual({ gold: 120 + 60 + 120, stars: 2, newStars: 2 });
  });
});
