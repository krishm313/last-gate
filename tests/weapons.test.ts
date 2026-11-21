import { describe, expect, it } from "vitest";
import { CHAPTER_BY_ID } from "../src/core/chapters";
import { newSave, sanitizeSave } from "../src/core/meta";
import { WEAPON_BY_ID } from "../src/core/weapons";
import { campSetupFromSave, weaponFor } from "../src/camp/meta";
import { createCamp, drainEvents, spawnEnemy, step, type CampInput } from "../src/camp/sim";

const idle: CampInput = { move: { x: 0, y: 0 } };
const starsSave = (n: number) => { const s = newSave(); for (let i = 1; i <= 10 && n > 0; i++) { s.stars[i] = Math.min(3, n); n -= 3; } return s; };

describe("C9 hero weapons", () => {
  it("the pick survives a save round-trip and only applies once unlocked by stars", () => {
    const s = starsSave(30);
    s.weapon = "staff";
    const back = sanitizeSave(JSON.parse(JSON.stringify(s)));
    expect(back.weapon).toBe("staff");
    expect(weaponFor(back)).toBe("staff");
    const poor = starsSave(5);
    poor.weapon = "staff";
    expect(weaponFor(poor)).toBe("own");
    expect(sanitizeSave({ ...poor, weapon: "laser" }).weapon).toBeUndefined();
    expect(campSetupFromSave(back).weapon).toBe("staff");
  });
  it("a fresh save (and the balance bot) keeps the hero's own attack", () => {
    expect(campSetupFromSave(newSave()).weapon).toBe("own");
  });
  for (const id of ["crossbow", "staff"] as const) {
    it(`${id}: shots carry the weapon and do their extra hit`, () => {
      const c = createCamp(2, CHAPTER_BY_ID[3]!, { weapon: id });
      c.phase = "wave";
      c.queue = [];
      c.hero.x = 360; c.hero.y = 640;
      const a = spawnEnemy(c, { at: 0, enemy: "footman", hpMult: 20, lane: null }, { x: 360, y: 520 });
      spawnEnemy(c, { at: 0, enemy: "footman", hpMult: 20, lane: null }, { x: 362, y: 470 });
      spawnEnemy(c, { at: 0, enemy: "footman", hpMult: 20, lane: null }, { x: 390, y: 515 });
      let extra = false, tagged = false;
      for (let i = 0; i < 60 * 4; i++) {
        c.hero.x = 360; c.hero.y = 640;
        step(c, idle);
        if (c.arrows.some((r) => r.owner === "hero" && r.weapon === id)) tagged = true;
        if (drainEvents(c).some((e) => e.type === (id === "crossbow" ? "pierce" : "orbBurst"))) extra = true;
      }
      expect(a.def.id).toBe("footman");
      expect(tagged).toBe(true);
      expect(extra).toBe(true);
    });
  }
  it("trade-offs: slower weapons hit harder per shot", () => {
    expect(WEAPON_BY_ID.crossbow.rate).toBeLessThan(1);
    expect(WEAPON_BY_ID.crossbow.damage).toBeGreaterThan(1.5);
    expect(WEAPON_BY_ID.staff.rate).toBeLessThan(1);
  });
});
