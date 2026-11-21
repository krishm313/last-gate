import { describe, expect, it } from "vitest";
import { BUILD_DRAFT, chooseBlessing, chooseBuilding, createCamp, step, type Camp } from "../src/camp/sim";
import { CHAPTER_BY_ID } from "../src/core/chapters";

const still = { move: { x: 0, y: 0 } };
/** Clear night `wave` instantly. */
function clearNight(c: Camp, wave: number): void {
  c.wave = wave;
  c.phase = "wave";
  c.queue = [];
  c.enemies = [];
  step(c, still);
}

describe.skipIf(!BUILD_DRAFT)("building draft", () => {
  it("several kinds opening at once become a choice; the chosen opens now, the rest next dawn", () => {
    const c = createCamp(3, CHAPTER_BY_ID[3]);
    clearNight(c, 3);
    expect(c.phase).toBe("pick");
    const kinds = c.buildChoice!;
    expect(kinds.length).toBeGreaterThanOrEqual(2);
    for (const p of c.plots) if (kinds.includes(p.kind)) expect(p.locked).toBe(true);
    // Blessings wait until the building is chosen.
    expect(chooseBlessing(c, c.offers[0]!.id)).toBe(false);
    expect(chooseBuilding(c, kinds[1]!)).toBe(true);
    for (const p of c.plots) {
      if (p.kind === kinds[1]) expect(p.locked).toBe(false);
      else if (kinds.includes(p.kind)) expect(p.locked && p.unlockWave === 4).toBe(true);
    }
    expect(chooseBlessing(c, c.offers[0]!.id)).toBe(true);
    // Next dawn the deferred ones open (alongside night 4's own).
    c.phase = "wave";
    clearNight(c, 4);
    if (c.buildChoice) chooseBuilding(c, c.buildChoice[0]!);
    for (const p of c.plots) if (kinds.includes(p.kind)) expect(p.locked && p.unlockWave === 5 ? true : !p.locked || p.unlockWave === 5).toBe(true);
  });

  it("the balance bot, dailies and Siege Lord keep the fixed unlock order", () => {
    const bot = createCamp(3, CHAPTER_BY_ID[3]);
    bot.botDriven = true;
    clearNight(bot, 3);
    expect(bot.buildChoice).toBeNull();
    const daily = createCamp(3, CHAPTER_BY_ID[3], { classicBlessings: true });
    clearNight(daily, 3);
    expect(daily.buildChoice).toBeNull();
  });
});

describe("building draft switched off", () => {
  it("new buildings all open together and the dawn has one pick", () => {
    if (BUILD_DRAFT) return;
    const c = createCamp(3, CHAPTER_BY_ID[3]);
    clearNight(c, 3);
    expect(c.buildChoice).toBeNull();
    expect(c.plots.filter((p) => p.unlockWave === 3).every((p) => !p.locked)).toBe(true);
  });
});
