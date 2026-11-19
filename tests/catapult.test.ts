import { describe, expect, it } from "vitest";
import { CAT, catReward, catStars, createCatapult, flightTime, lob, stepCatapult } from "../src/mini/catapult";

const DT = 1 / 60;
const run = (s: ReturnType<typeof createCatapult>, secs: number) => { for (let i = 0; i < Math.round(secs / DT); i++) stepCatapult(s, DT); };

describe("Catapult Toss", () => {
  it("stones take longer to land the farther they go, and the catapult reloads", () => {
    expect(flightTime(180, 150)).toBeGreaterThan(flightTime(180, 450));
    const s = createCatapult(1);
    expect(lob(s, 180, 300)).toBe(true);
    expect(lob(s, 180, 300)).toBe(false); // reloading
    run(s, CAT.reload + 0.05);
    expect(lob(s, 100, 300)).toBe(true);
  });

  it("a stone splashes where it lands: rams break in one hit, towers take three", () => {
    const s = createCatapult(2);
    s.spawnIn = 99;
    s.engines.push({ id: 90, kind: "ram", x: 100, y: 300, vy: 0, hp: 1, maxHp: 1, r: 16, dead: -1 });
    s.engines.push({ id: 91, kind: "tower", x: 260, y: 300, vy: 0, hp: 3, maxHp: 3, r: 24, dead: -1 });
    lob(s, 110, 305);
    run(s, flightTime(110, 305) + 0.05);
    expect(s.engines.find((e) => e.id === 90)?.dead ?? 1).toBeGreaterThanOrEqual(0);
    expect(s.score).toBe(2);
    for (let i = 0; i < 3; i++) { s.reload = 0; lob(s, 260, 300); run(s, flightTime(260, 300) + 0.05); }
    expect(s.score).toBe(2 + 1 + 1 + 5 * 2); // ram, two cracks, then the kill on a 3-hit combo (×2)
  });

  it("three engines at the wall lose the round; otherwise it ends after 60 s", () => {
    const s = createCatapult(3);
    s.spawnIn = 99;
    for (let i = 0; i < 3; i++) s.engines.push({ id: 60 + i, kind: "ram", x: 60 + i * 100, y: CAT.wallY - 12, vy: 50, hp: 1, maxHp: 1, r: 16, dead: -1 });
    run(s, 0.5);
    expect(s.lost && s.over).toBe(true);
    const t = createCatapult(4);
    for (let i = 0; i < 60 * 61 && !t.over; i++) { stepCatapult(t, DT); t.lives = 3; }
    expect(t.over && !t.lost).toBe(true);
  });

  it("is deterministic", () => {
    const go = () => { const s = createCatapult(9); for (let i = 0; i < 60 * 30; i++) { stepCatapult(s, DT); const e = s.engines.find((k) => k.dead < 0); if (e && i % 30 === 0) lob(s, e.x, e.y + 30); } return [s.score, s.lives, s.nextId]; };
    expect(go()).toEqual(go());
  });

  it("stars and rewards", () => {
    expect(catStars(99)).toBe(0);
    expect(catStars(210)).toBe(2);
    expect(catReward(210, 0)).toEqual({ gold: 70 + 60 + 120, stars: 2, newStars: 2 });
    expect(catReward(210, 2).gold).toBe(70);
  });
});
