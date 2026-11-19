import { describe, expect, it } from "vitest";
import { campSetupFromSave } from "../src/camp/meta";
import { grantHeroXp, newSave, sanitizeSave } from "../src/core/meta";
import { canLearn, freePoints, learnSkill, resetSkills, skillPoints, SKILL_THRESHOLDS } from "../src/core/skills";

describe("hero skill trees", () => {
  it("earns points from nights survived", () => {
    expect(skillPoints(0)).toBe(0);
    expect(skillPoints(5)).toBe(1);
    expect(skillPoints(1e6)).toBe(SKILL_THRESHOLDS.length);
    const s = newSave();
    expect(grantHeroXp(s, "ranger", 4)).toBe(0);
    expect(grantHeroXp(s, "ranger", 12)).toBe(2); // 16 xp: thresholds 5 and 15
    expect(s.heroes.knight.xp).toBe(0);
  });

  it("learns branches in order with available points, and resets", () => {
    const s = newSave();
    const p = s.heroes.ranger;
    p.xp = 30; // 3 points
    expect(canLearn(p, "aim")).toBe(false); // tier 2 needs tier 1
    expect(learnSkill(p, "edge")).toBe(true);
    expect(learnSkill(p, "aim")).toBe(true);
    expect(learnSkill(p, "tough")).toBe(true);
    expect(freePoints(p)).toBe(0);
    expect(learnSkill(p, "focus")).toBe(false); // out of points
    resetSkills(p);
    expect(freePoints(p)).toBe(3);
  });

  it("applies learned skills to the run setup", () => {
    const s = newSave();
    const base = campSetupFromSave(s);
    s.heroes.ranger.xp = 50;
    for (const id of ["edge", "aim", "focus", "purse"]) learnSkill(s.heroes.ranger, id);
    const k = campSetupFromSave(s);
    expect(k.mods!.heroDamage).toBeCloseTo(base.mods!.heroDamage * 1.08);
    expect(k.critChance).toBeCloseTo(base.critChance! + 0.04);
    expect(k.abilityCooldown).toBeCloseTo(base.abilityCooldown! * 0.85);
    expect(k.mods!.carry).toBe(base.mods!.carry + 10);
    // Another hero's skills don't leak.
    expect(campSetupFromSave(s, "knight").critChance).toBeCloseTo(campSetupFromSave(newSave(), "knight").critChance!);
  });

  it("sanitizes edited saves: no skipped tiers, no extra points", () => {
    const s = sanitizeSave({ heroes: { ranger: { xp: 15, skills: ["focus", "aim", "edge", "tough", "mint"] }, bogus: { xp: 9 } } });
    expect(s.heroes.ranger.skills).toEqual(["edge", "tough"]); // 2 points, only legal picks
    expect(sanitizeSave({}).heroes.pyro).toEqual({ xp: 0, skills: [] });
  });

  it("old saves credit the nights already survived to the current hero", () => {
    const s = sanitizeSave({ version: 1, hero: "ranger", stats: { wavesHeld: 40 } });
    expect(s.heroes.ranger.xp).toBe(40);
    expect(s.heroes.knight.xp).toBe(0);
    // Once heroes exist in the save, no more crediting.
    const again = sanitizeSave(JSON.parse(JSON.stringify(s)));
    expect(again.heroes.ranger.xp).toBe(40);
  });
});

describe("hero flair", async () => {
  const { activeFlair } = await import("../src/core/flair");
  it("only wears unlocked flair and reaches the run setup", () => {
    const s = newSave();
    s.flair = "ember";
    expect(activeFlair(s)).toBe("none"); // chapter 4 not cleared
    expect(campSetupFromSave(s).heroFlair).toBe("none");
    s.stars[4] = 1;
    expect(activeFlair(s)).toBe("ember");
    expect(campSetupFromSave(s).heroFlair).toBe("ember");
    expect(sanitizeSave({ flair: 42 }).flair).toBe("none");
  });
});

describe("the Warden", async () => {
  const { createCamp, spawnEnemy, step, drainEvents } = await import("../src/camp/sim");
  it("Snare Field roots nearby walkers and makes them take more damage", () => {
    const s = newSave();
    s.stars = { 1: 3, 2: 3, 3: 3, 4: 3, 5: 2 }; // 14 stars
    const setup = campSetupFromSave(s, "warden");
    expect(setup.ability).toBe("snare");
    expect(setup.mods!.heroMultishot).toBe(campSetupFromSave(s, "ranger").mods!.heroMultishot + 1);
    const c = createCamp(3, undefined, setup);
    c.phase = "wave";
    c.queue = [];
    const e = spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 1, lane: null }, { x: c.hero.x + 100, y: c.hero.y - 60 });
    c.abilityCharge = 1;
    drainEvents(c);
    step(c, { move: { x: 0, y: 0 }, ability: true } as never);
    expect(drainEvents(c).some((ev) => ev.type === "boom" && ev.kind === "snare")).toBe(true);
    expect(e.stunTime).toBeGreaterThan(2);
    expect(e.snared).toBeGreaterThan(2);
  });
});
