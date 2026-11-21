import { describe, expect, it } from "vitest";
import { CHAPTER_BY_ID } from "../src/core/chapters";
import { newSave, sanitizeSave } from "../src/core/meta";
import { campSetupFromSave, petFor } from "../src/camp/meta";
import { createCamp, drainEvents, spawnEnemy, step, type CampInput } from "../src/camp/sim";

const idle: CampInput = { move: { x: 0, y: 0 } };

describe("C10 companion pets", () => {
  it("pick survives a save round-trip, needs its stars, and the bot's fresh save has none", () => {
    const s = newSave();
    for (let i = 1; i <= 5; i++) s.stars[i] = 3;
    s.pet = "falcon";
    const back = sanitizeSave(JSON.parse(JSON.stringify(s)));
    expect(petFor(back)).toBe("falcon");
    const poor = newSave();
    poor.pet = "falcon";
    expect(petFor(poor)).toBe("none");
    expect(campSetupFromSave(newSave()).pet).toBe("none");
    expect(createCamp(1, CHAPTER_BY_ID[1]!, campSetupFromSave(newSave())).pet).toBeNull();
  });
  it("hound fetches a coin lying out of the King's reach", () => {
    const c = createCamp(1, CHAPTER_BY_ID[2]!, { pet: "hound" });
    c.hero.x = 360; c.hero.y = 820; c.hero.coins = 0;
    c.coins.push({ id: c.nextId++, x: 360 + 200, y: 900, vx: 0, vy: 0, z: 0, vz: 0, homing: false });
    let fetched = false;
    for (let i = 0; i < 60 * 5; i++) { c.hero.x = 360; c.hero.y = 820; step(c, idle); if (drainEvents(c).some((e) => e.type === "petFetch")) fetched = true; }
    expect(fetched).toBe(true);
    expect(c.coins.length).toBe(0); // (the courier also brings coins in, so check the coin itself was collected)
  });
  it("falcon dives at a foe near the King and hurts it", () => {
    const c = createCamp(1, CHAPTER_BY_ID[2]!, { pet: "falcon" });
    c.phase = "wave"; c.queue = [];
    c.hero.x = 60; c.hero.y = 1100; // out of the hero's own reach of the foe? the falcon reaches further
    const e = spawnEnemy(c, { at: 0, enemy: "footman", hpMult: 50, lane: null }, { x: 60, y: 880 });
    const hp0 = e.hp;
    let struck = false;
    for (let i = 0; i < 60 * 6; i++) { c.hero.x = 60; c.hero.y = 1100; e.y = 880; step(c, idle); if (drainEvents(c).some((v) => v.type === "petStrike")) struck = true; }
    expect(struck).toBe(true);
    expect(e.hp).toBeLessThan(hp0);
  });
});
