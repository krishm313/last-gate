import { describe, expect, it } from "vitest";
import { climbSpeed, createWatch, stepWatch, tap, WATCH_GAME, watchReward, watchStars } from "../src/mini/wallwatch";

const DT = 1 / 60;

describe("Wall Watch", () => {
  it("tapping a climber knocks it off and scores; brutes take two taps", () => {
    const s = createWatch(1);
    s.spawnIn = 99;
    s.climbers.push({ id: 50, kind: "goblin", ladder: 2, y: 400, hp: 1, fall: -1, over: false });
    expect(tap(s, WATCH_GAME.ladders[2], 400)).toBe("goblin");
    expect(s.score).toBe(1);
    s.climbers.push({ id: 51, kind: "brute", ladder: 0, y: 300, hp: 2, fall: -1, over: false });
    tap(s, WATCH_GAME.ladders[0], 300);
    expect(s.climbers.find((c) => c.id === 51)!.fall).toBe(-1);
    tap(s, WATCH_GAME.ladders[0], 324);
    expect(s.climbers.find((c) => c.id === 51)!.fall).toBeGreaterThanOrEqual(0);
    expect(tap(s, 5, 5)).toBe("miss");
  });

  it("tapping a builder costs points; a builder who reaches the top repairs the wall", () => {
    const s = createWatch(2);
    s.spawnIn = 99;
    s.climbers.push({ id: 52, kind: "builder", ladder: 1, y: 400, hp: 1, fall: -1, over: false });
    expect(tap(s, WATCH_GAME.ladders[1], 400)).toBe("builder");
    expect(s.score).toBe(-5);
    s.climbers.push({ id: 53, kind: "builder", ladder: 3, y: WATCH_GAME.top + 2, hp: 1, fall: -1, over: false });
    for (let i = 0; i < 10; i++) stepWatch(s, DT);
    expect(s.score).toBe(-2);
    expect(s.lives).toBe(WATCH_GAME.lives);
  });

  it("three goblins over the wall end the watch; otherwise it ends after 60 s", () => {
    const s = createWatch(3);
    s.spawnIn = 99;
    for (let i = 0; i < 3; i++) s.climbers.push({ id: 60 + i, kind: "goblin", ladder: i, y: WATCH_GAME.top + 1, hp: 1, fall: -1, over: false });
    for (let i = 0; i < 10; i++) stepWatch(s, DT);
    expect(s.lost && s.over).toBe(true);
    const t = createWatch(4);
    for (let i = 0; i < 60 * 61 && !t.over; i++) { stepWatch(t, DT); t.lives = 3; }
    expect(t.over && !t.lost).toBe(true);
    expect(climbSpeed(60)).toBeGreaterThan(climbSpeed(0));
  });

  it("is deterministic", () => {
    const run = () => { const s = createWatch(9); for (let i = 0; i < 60 * 30; i++) { stepWatch(s, DT); const c = s.climbers.find((k) => k.fall < 0); if (i % 20 === 0 && c) tap(s, WATCH_GAME.ladders[c.ladder]!, c.y); } return [s.score, s.lives, s.nextId]; };
    expect(run()).toEqual(run());
  });

  it("stars and rewards", () => {
    expect(watchStars(119)).toBe(0);
    expect(watchStars(230)).toBe(2);
    expect(watchReward(230, 0)).toEqual({ gold: 77 + 60 + 120, stars: 2, newStars: 2 });
    expect(watchReward(-10, 0).gold).toBe(0);
  });
});
