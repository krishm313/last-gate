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
    // The newest flairs come from clearing chapters 8 and 9.
    const late = newSave();
    late.flair = "bloodmoon";
    expect(activeFlair(late)).toBe("none");
    late.stars[9] = 1;
    expect(activeFlair(late)).toBe("bloodmoon");
    late.flair = "seafoam";
    expect(activeFlair(late)).toBe("none");
    late.stars[8] = 2;
    expect(activeFlair(late)).toBe("seafoam");
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

describe("new armory upgrades", () => {
  it("Arcanum and Field Works feed the run setup", () => {
    const s = newSave();
    s.perms.arcanum = 3;
    s.perms.fieldworks = 2;
    const m = campSetupFromSave(s).mods!;
    expect(m.mageDamage).toBeCloseTo(1.24);
    expect(m.spikeDamage).toBeCloseTo(1.2);
    expect(m.healerPower).toBeCloseTo(1.1);
    expect(sanitizeSave({ perms: { arcanum: 99 } }).perms.arcanum).toBe(5);
  });
});

describe("skill capstones", () => {
  it("unlock after tier 3 with the extra points and reach the run", () => {
    const s = newSave();
    const p = s.heroes.ranger;
    p.xp = 400; // 12 points
    for (const id of ["edge", "aim", "focus"]) learnSkill(p, id);
    expect(canLearn(p, "executioner")).toBe(true);
    expect(canLearn(p, "bulwark")).toBe(false); // guard tier 3 not learned
    learnSkill(p, "executioner");
    for (const id of ["tough", "mortar", "rally", "bulwark"]) learnSkill(p, id);
    const m = campSetupFromSave(s).mods!;
    expect(m.bossDamage).toBeCloseTo(1.2);
    expect(m.hallArmor).toBeCloseTo(0.85);
    expect(skillPoints(400)).toBe(12);
  });
});

describe("the Lancer", async () => {
  const { createCamp, spawnEnemy, step, drainEvents, heroRange } = await import("../src/camp/sim");
  it("reaches farther, and Piercing Lance skewers a whole line of foes", () => {
    const s = newSave();
    s.stars = { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3 }; // 18 stars
    const setup = campSetupFromSave(s, "lancer");
    expect(setup.ability).toBe("lance");
    const c = createCamp(3, undefined, setup);
    expect(heroRange(c)).toBeCloseTo(heroRange(createCamp(3, undefined, campSetupFromSave(s, "ranger"))) * 1.3);
    c.phase = "wave";
    c.queue = [];
    // Three foes in a column straight above the hero, one off to the side.
    const line = [80, 180, 300].map((dy) => spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 50, lane: null }, { x: c.hero.x, y: c.hero.y - dy }));
    const side = spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 50, lane: null }, { x: c.hero.x + 200, y: c.hero.y - 40 });
    const hp = line.map((e) => e.hp);
    const sideHp = side.hp;
    c.abilityCharge = 1;
    drainEvents(c);
    step(c, { move: { x: 0, y: 0 }, ability: true } as never);
    const ev = drainEvents(c).find((e) => e.type === "lance");
    expect(ev && ev.type === "lance" && ev.n).toBe(3);
    line.forEach((e, i) => expect(e.hp).toBeLessThan(hp[i]!));
    expect(side.hp).toBeGreaterThan(sideHp - 1); // at most a stray hero arrow, not the lance
  });

  it("keeps its charge when no foe is in reach", () => {
    const s = newSave();
    s.stars = { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3 };
    const c = createCamp(3, undefined, campSetupFromSave(s, "lancer"));
    c.phase = "wave";
    c.queue = [];
    spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 50, lane: null }, { x: c.hero.x, y: c.hero.y - 900 });
    c.abilityCharge = 1;
    drainEvents(c);
    step(c, { move: { x: 0, y: 0 }, ability: true } as never);
    const evs = drainEvents(c);
    expect(evs.some((e) => e.type === "noTarget")).toBe(true);
    expect(evs.some((e) => e.type === "lance")).toBe(false);
    expect(c.abilityCharge).toBe(1);
  });
});
