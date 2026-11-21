import { describe, expect, it } from "vitest";
import { createCamp, drainEvents, scaleOdds, step, BLOOD_SURGE, WEATHER } from "../src/camp/sim";
import { CHAPTER_BY_ID } from "../src/core/chapters";
import { chapterOnDifficulty } from "../src/core/difficulty";
import { diffClears } from "../src/core/achievements";
import { newSave } from "../src/core/meta";
import { STEP } from "../src/camp/world";

const still = { move: { x: 0, y: 0 } };

describe("Hard / Nightmare rules", () => {
  it("Hard brings foul weather, Nightmare also a Blood Moon surge; Normal and Endless unchanged", () => {
    const ch = CHAPTER_BY_ID[4]!;
    expect(chapterOnDifficulty(ch, "normal").weatherMult).toBeUndefined();
    expect(chapterOnDifficulty(ch, "hard").weatherMult).toBeGreaterThan(1);
    expect(chapterOnDifficulty(ch, "hard").bloodEvery).toBeUndefined();
    expect(chapterOnDifficulty(ch, "nightmare").bloodEvery).toBe(3);
    const o = scaleOdds(WEATHER.odds, 1.8);
    expect(o.rain + o.fog + o.storm).toBeLessThanOrEqual(0.8500001);
    expect(o.rain).toBeGreaterThan(WEATHER.odds.rain);
  });

  it("the surge rises partway through every 3rd non-boss Nightmare night", () => {
    const ch = chapterOnDifficulty(CHAPTER_BY_ID[4]!, "nightmare");
    const c = createCamp(5, ch);
    c.wave = 2;
    c.timer = 0.001;
    step(c, still);
    expect(c.wave).toBe(3);
    if (c.bossNight) return;
    drainEvents(c);
    for (let i = 0; i < (BLOOD_SURGE.at + 0.5) / STEP; i++) step(c, still);
    expect(c.bloodmoon).toBeGreaterThan(0);
    expect(drainEvents(c).some((e) => e.type === "bloodmoon")).toBe(true);
  });

  it("counts campaign clears per difficulty for the new trophies", () => {
    const s = newSave();
    s.diffCleared = { 1: 2, 2: 1, 3: 2, 98: 2 };
    expect(diffClears(s, 1)).toBe(3);
    expect(diffClears(s, 2)).toBe(2);
  });
});
