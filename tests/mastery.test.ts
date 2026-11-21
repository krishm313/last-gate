import { describe, expect, it } from "vitest";
import { heroWins, MASTERY, mastered, masteryGoals } from "../src/core/mastery";
import { newSave } from "../src/core/meta";
import { campSetupFromSave } from "../src/camp/meta";
import { createCamp, drainEvents, spawnEnemy, step } from "../src/camp/sim";
import { WALL_Y } from "../src/camp/world";

const masterOf = (hero: "ranger" | "marshal") => {
  const s = newSave();
  s.heroes[hero].xp = MASTERY.nights;
  s.stats[`wins_${hero}`] = MASTERY.wins;
  s.stats[hero === "ranger" ? "ab_arrowRain" : "ab_callToArms"] = MASTERY.casts;
  return s;
};

describe("hero mastery", () => {
  it("needs all three goals", () => {
    const s = masterOf("ranger");
    expect(mastered(s, "ranger")).toBe(true);
    s.stats.ab_arrowRain = MASTERY.casts - 1;
    expect(mastered(s, "ranger")).toBe(false);
    expect(masteryGoals(s, "ranger").filter((g) => g.cur >= g.goal).length).toBe(2);
  });
  it("counts wins from history for older saves", () => {
    const s = newSave();
    s.history = [{ date: "", hero: "knight", won: true, nights: 10, kills: 1, minutes: 1, chapter: 1, gold: 1 }, { date: "", hero: "knight", won: false, nights: 3, kills: 1, minutes: 1, chapter: 1, gold: 1 }] as typeof s.history;
    expect(heroWins(s, "knight")).toBe(1);
  });
  it("the capstone empowers the ability and speeds its charge", () => {
    const base = campSetupFromSave(newSave(), "ranger");
    const m = campSetupFromSave(masterOf("ranger"), "ranger");
    expect(m.abilityPower).toBe(MASTERY.power);
    expect(m.abilityCooldown!).toBeCloseTo(base.abilityCooldown! * MASTERY.cooldown);
    const c = createCamp(1, undefined, m);
    c.phase = "wave";
    c.abilityCharge = 1;
    spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 50, lane: null }, { x: c.hero.x, y: WALL_Y - 100 });
    step(c, { move: { x: 0, y: 0 }, ability: true });
    expect(c.strikes.length).toBe(42);
    const mm = createCamp(1, undefined, campSetupFromSave(masterOf("marshal"), "marshal"));
    mm.phase = "wave";
    mm.abilityCharge = 1;
    drainEvents(mm);
    step(mm, { move: { x: 0, y: 0 }, ability: true });
    const ev = drainEvents(mm).find((e) => e.type === "callToArms");
    expect(ev && ev.type === "callToArms" && ev.n).toBe(6);
  });
});
