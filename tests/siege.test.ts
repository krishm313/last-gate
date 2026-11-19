import { describe, expect, it } from "vitest";
import { campBotStep } from "../src/camp/bot";
import { createCamp, deploy, drainEvents, REVERSE, WAR_CARDS } from "../src/camp/sim";
import { STEP } from "../src/camp/world";

/** Run the defenders' bot until the first push starts (a short build phase first). */
function toFirstPush(seed = 5) {
  const c = createCamp(seed, undefined, { reverse: true });
  for (let i = 0; i < 60 * 60 && c.phase !== "wave"; i++) campBotStep(c);
  return c;
}

describe("Siege Lord (reverse mode)", () => {
  it("sends nobody on its own: pushes start empty and the War Chest pays for cards", () => {
    const c = toFirstPush();
    expect(c.phase).toBe("wave");
    expect(c.enemies.length).toBe(0);
    const chest = c.reverse!.chest;
    const card = WAR_CARDS.find((k) => k.id === "footman")!;
    expect(deploy(c, "footman", 1)).toBe(true);
    expect(c.enemies.length).toBe(card.count);
    expect(c.reverse!.chest).toBeCloseTo(chest - card.cost);
    c.reverse!.chest = 1;
    expect(deploy(c, "ram", 0)).toBe(false); // can't afford
  });

  it("refills the chest during a push, and a push ends on the clock (not when the field is clear)", () => {
    const c = toFirstPush();
    c.reverse!.chest = 0;
    for (let i = 0; i < Math.round(10 / STEP); i++) campBotStep(c);
    expect(c.reverse!.chest).toBeCloseTo(Math.min(REVERSE.cap, REVERSE.income * 10), 0);
    expect(c.phase).toBe("wave"); // empty field, but the push runs its full length
    for (let i = 0; i < Math.round((REVERSE.push - 9) / STEP) && c.phase === "wave"; i++) campBotStep(c);
    expect(c.phase).not.toBe("wave");
    expect(c.wave).toBe(1);
  });

  it("pays a bounty for a broken wall section, and taking the hall is a win", () => {
    const c = toFirstPush();
    c.reverse!.chest = 0;
    for (const sg of c.segments) sg.hp = 1;
    deploy(c, "footman", 0); // can't afford — chest is empty
    c.reverse!.chest = 10;
    // Break a section directly through the sim's damage path by parking a brute at it.
    expect(deploy(c, "brute", 0)).toBe(true);
    c.enemies[0]!.hp = c.enemies[0]!.maxHp = 1e6; // make sure it reaches the wall
    let broke = false;
    for (let i = 0; i < Math.round(REVERSE.push / STEP) && !broke; i++) {
      campBotStep(c);
      broke = drainEvents(c).some((e) => e.type === "wallBreak");
    }
    expect(broke).toBe(true);
    expect(c.reverse!.broken).toBeGreaterThan(0);
    c.hallHp = 1;
    c.phase = "wave";
    deploy(c, "footman", 1);
    c.hallHp = 0;
    campBotStep(c);
    expect(c.reverse!.result).toBe("win");
  });

  it("the defenders win if the hall stands after the last push", () => {
    const c = toFirstPush();
    c.wave = REVERSE.pushes;
    for (let i = 0; i < Math.round((REVERSE.push + 1) / STEP) && !c.reverse!.result; i++) campBotStep(c);
    expect(c.reverse!.result).toBe("lose");
    expect(c.phase).toBe("won");
  });
});

describe("siege ladder", async () => {
  const { SIEGES, siegeStars } = await import("../src/camp/sim");
  it("has three sieges with rising defences, and stars by push", () => {
    expect(SIEGES.length).toBe(3);
    for (let i = 1; i < SIEGES.length; i++) expect(SIEGES[i]!.perm).toBeGreaterThan(SIEGES[i - 1]!.perm);
    expect([3, 4, 5, 6, 7, 8, 9].map(siegeStars)).toEqual([3, 3, 2, 2, 1, 1, 0]);
  });
});
