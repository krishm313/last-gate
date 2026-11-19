import { describe, expect, it } from "vitest";
import { CHAPTERS } from "../src/core/chapters";
import { applyRun, buyPerm, chapterUnlocked, heroUnlocked, newSave, PERMS, permCost, sanitizeSave, starsFor } from "../src/core/meta";
import { planWave } from "../src/core/waves";

describe("meta progression", () => {
  it("buying a permanent upgrade costs gold and raises its level", () => {
    const s = newSave();
    s.gold = 1000;
    const cost = permCost(PERMS[0]!, 0);
    expect(buyPerm(s, PERMS[0]!.id)).toBe(true);
    expect(s.gold).toBe(1000 - cost);
    expect(s.perms[PERMS[0]!.id]).toBe(1);
  });

  it("can't buy without gold or past max", () => {
    const s = newSave();
    expect(buyPerm(s, "walls")).toBe(false);
    s.gold = 1e9;
    s.perms.barracks = 2;
    expect(buyPerm(s, "barracks")).toBe(false);
  });

  it("stars: clear = 1, ≥50% gate = 2, ≥80% = 3", () => {
    expect(starsFor(false, 1)).toBe(0);
    expect(starsFor(true, 0.1)).toBe(1);
    expect(starsFor(true, 0.6)).toBe(2);
    expect(starsFor(true, 0.9)).toBe(3);
  });

  it("winning a chapter unlocks the next and pays a first-clear bonus once", () => {
    const s = newSave();
    expect(chapterUnlocked(s, 2)).toBe(false);
    const r1 = applyRun(s, { chapter: 1, won: true, wave: 10, gateFrac: 0.9, goldFromKills: 100 });
    expect(chapterUnlocked(s, 2)).toBe(true);
    expect(r1.firstClear).toBe(true);
    expect(r1.stars).toBe(3);
    const r2 = applyRun(s, { chapter: 1, won: true, wave: 10, gateFrac: 0.9, goldFromKills: 100 });
    expect(r2.firstClear).toBe(false);
    expect(r2.winBonus).toBeLessThan(r1.winBonus);
    expect(s.stars[1]).toBe(3);
  });

  it("losing still pays gold, and stars never go down", () => {
    const s = newSave();
    applyRun(s, { chapter: 1, won: true, wave: 10, gateFrac: 0.9, goldFromKills: 0 });
    const before = s.gold;
    applyRun(s, { chapter: 1, won: false, wave: 6, gateFrac: 0, goldFromKills: 50 });
    expect(s.gold).toBeGreaterThan(before);
    expect(s.stars[1]).toBe(3);
  });

  it("heroes unlock with stars", () => {
    const s = newSave();
    expect(heroUnlocked(s, "ranger")).toBe(true);
    expect(heroUnlocked(s, "knight")).toBe(false);
    s.stars = { 1: 3 };
    expect(heroUnlocked(s, "knight")).toBe(true);
  });

  it("sanitizeSave survives garbage and clamps values", () => {
    expect(sanitizeSave(null).gold).toBe(0);
    expect(sanitizeSave("nope").hero).toBe("ranger");
    const s = sanitizeSave({ gold: -5, stars: { 1: 9 }, perms: { walls: 99, bogus: 3 }, hero: "pyro" });
    expect(s.gold).toBe(0);
    expect(s.stars[1]).toBe(3);
    expect(s.perms.walls).toBe(10);
    expect(s.hero).toBe("ranger"); // pyro needs 6 stars, save has 3 → falls back
  });
});

describe("chapters", () => {
  it("every chapter has 10 waves with mini-boss on 5 and boss on 10", () => {
    for (const ch of CHAPTERS) {
      expect(ch.waves.length).toBe(10);
      expect(planWave(ch, 5, 1).boss).not.toBeNull();
      expect(planWave(ch, 10, 1).boss).not.toBeNull();
    }
  });

  it("later chapters are tougher", () => {
    for (let i = 1; i < CHAPTERS.length; i++) expect(CHAPTERS[i]!.hpMult).toBeGreaterThan(CHAPTERS[i - 1]!.hpMult);
  });
});

describe("camp setup from meta", () => {
  it("perms and heroes change the camp's starting conditions", async () => {
    const { campSetupFromSave } = await import("../src/camp/meta");
    const s = newSave();
    const base = campSetupFromSave(s);
    s.perms.walls = 3;
    s.perms.fletching = 2;
    const up = campSetupFromSave(s);
    expect(up.mods!.wallHp).toBeGreaterThan(base.mods!.wallHp);
    expect(up.mods!.heroDamage).toBeGreaterThan(base.mods!.heroDamage);
    expect(campSetupFromSave(s, "pyro").mods!.burn).toBeGreaterThan(0);
    expect(campSetupFromSave(s, "knight").ability).toBe("shieldBash");
  });
});

describe("endless mode", () => {
  it("unlocks after chapter 1, rotates bosses every 5 waves, and never ends in victory", async () => {
    const { ENDLESS } = await import("../src/core/chapters");
    const s = newSave();
    expect(chapterUnlocked(s, ENDLESS.id)).toBe(false);
    s.stars[1] = 1;
    expect(chapterUnlocked(s, ENDLESS.id)).toBe(true);
    const bosses = [5, 10, 15, 40].map((w) => planWave(ENDLESS, w, 1).boss);
    expect(bosses.every((b) => b !== null)).toBe(true);
    expect(new Set(bosses).size).toBeGreaterThan(1);
    expect(planWave(ENDLESS, 7, 1).boss).toBeNull();
    const r = applyRun(s, { chapter: ENDLESS.id, won: false, wave: 12, gateFrac: 0, goldFromKills: 0 });
    expect(r.gold).toBeLessThan(1000); // not scaled by the id 99
  });
});

describe("daily challenge", () => {
  it("is the same for a given date and varies across dates", async () => {
    const { dailyFor } = await import("../src/core/daily");
    expect(dailyFor("2026-11-14")).toEqual(dailyFor("2026-11-14"));
    const days = Array.from({ length: 20 }, (_, i) => dailyFor(`2026-12-${String(i + 1).padStart(2, "0")}`));
    expect(new Set(days.map((d) => d.twist.id)).size).toBeGreaterThan(2);
    for (const d of days) {
      expect(d.chapterId).toBeGreaterThanOrEqual(1);
      expect(d.chapterId).toBeLessThanOrEqual(3);
    }
  });

  it("start blessings and enemy HP twists apply to the camp", async () => {
    const { createCamp } = await import("../src/camp/sim");
    const c = createCamp(1, undefined, { startBlessings: ["fire"], enemyHpMult: 1.5 });
    expect(c.owned.fire).toBe(1);
    expect(c.mods.burn).toBeGreaterThan(0);
    expect(c.enemyHpMult).toBe(1.5);
    expect(c.events.length).toBe(0);
  });
});

describe("achievements", () => {
  it("can be claimed once when the goal is met, paying gold", async () => {
    const { claim, claimable } = await import("../src/core/achievements");
    const s = newSave();
    expect(claimable(s).length).toBe(0);
    s.stats.wavesHeld = 1;
    expect(claimable(s).map((a) => a.id)).toContain("first-wave");
    expect(claim(s, "first-wave")).toBe(30);
    expect(s.gold).toBe(30);
    expect(claim(s, "first-wave")).toBe(0);
    expect(claim(s, "veteran")).toBe(0);
  });

  it("Untouchable unlocks after 10 flawless waves", async () => {
    const { claim, claimable } = await import("../src/core/achievements");
    const s = newSave();
    s.stats.flawlessWaves = 9;
    expect(claimable(s).map((a) => a.id)).not.toContain("untouchable");
    s.stats.flawlessWaves = 10;
    expect(claim(s, "untouchable")).toBe(200);
  });

  it("sanitizeSave keeps stats and claimed lists", () => {
    const s = sanitizeSave({ stats: { kills: 12, bad: -3 }, claimed: ["first-wave", 5] });
    expect(s.stats.kills).toBe(12);
    expect(s.stats.bad).toBe(0);
    expect(s.claimed).toEqual(["first-wave"]);
  });
});

describe("save backup codes", () => {
  it("round-trip a save and reject junk", async () => {
    const { exportSave, importSave } = await import("../src/ui/save");
    const s = newSave();
    s.gold = 1234;
    s.stars[1] = 3;
    s.perms.walls = 4;
    s.hero = "ranger";
    const code = exportSave(s);
    expect(code.startsWith("LG1:")).toBe(true);
    const back = importSave(code)!;
    expect(back.gold).toBe(1234);
    expect(back.stars[1]).toBe(3);
    expect(back.perms.walls).toBe(4);
    expect(importSave("hello")).toBeNull();
    expect(importSave("LG1:!!!notbase64")).toBeNull();
  });
});

describe("daily streak", () => {
  it("grows on consecutive days, ignores same-day repeats, resets after a gap", async () => {
    const { recordDailyWin, liveDailyStreak } = await import("../src/core/daily");
    const stats: Record<string, number> = {};
    expect(recordDailyWin(stats, "2026-11-12")).toBe(1);
    expect(recordDailyWin(stats, "2026-11-13")).toBe(2);
    expect(recordDailyWin(stats, "2026-11-13")).toBe(2);
    expect(recordDailyWin(stats, "2026-11-14")).toBe(3);
    expect(liveDailyStreak(stats, "2026-11-15")).toBe(3); // yesterday's clear keeps it alive
    expect(liveDailyStreak(stats, "2026-11-16")).toBe(0); // missed a day
    expect(recordDailyWin(stats, "2026-11-17")).toBe(1);
    expect(stats.dailyBestStreak).toBe(3);
  });

  it("handles month and year boundaries", async () => {
    const { recordDailyWin } = await import("../src/core/daily");
    const stats: Record<string, number> = {};
    recordDailyWin(stats, "2026-12-31");
    expect(recordDailyWin(stats, "2027-01-01")).toBe(2);
  });
});

describe("timeToNextDaily", () => {
  it("counts down to local midnight", async () => {
    const { timeToNextDaily } = await import("../src/core/daily");
    expect(timeToNextDaily(new Date(2026, 10, 14, 18, 48, 0))).toBe("5h 12m");
    expect(timeToNextDaily(new Date(2026, 10, 14, 23, 30, 0))).toBe("30m");
    expect(timeToNextDaily(new Date(2026, 10, 14, 23, 59, 59))).toBe("1m");
  });
});

describe("enemyTraits", () => {
  it("summarises what makes an enemy special", async () => {
    const { ENEMIES, enemyTraits } = await import("../src/core/enemies");
    expect(enemyTraits(ENEMIES.bat)).toContain("flies over the wall");
    for (const def of Object.values(ENEMIES)) expect(Array.isArray(enemyTraits(def))).toBe(true);
    expect(Object.values(ENEMIES).filter((d) => d.boss).every((d) => enemyTraits(d).includes("boss"))).toBe(true);
  });
});

describe("sanitizeSave hardening", () => {
  it("drops stars for chapters that don't exist and clamps gold", () => {
    const s = sanitizeSave({ gold: 1e308, stars: { 1: 99, 17: 3, 0: 2 }, best: { 99: 12, 42: 5 } });
    expect(s.gold).toBeLessThanOrEqual(9_999_999);
    expect(s.stars).toEqual({ 1: 3 });
    expect(s.best).toEqual({ 99: 12 });
  });
});

describe("Royal Legacy (Armory capstone)", () => {
  it("stays locked until every other upgrade is maxed", () => {
    const s = newSave();
    s.gold = 1e6;
    expect(buyPerm(s, "legacy")).toBe(false);
    for (const p of PERMS) if (!p.capstone) s.perms[p.id] = p.max - (p.id === "walls" ? 1 : 0);
    expect(buyPerm(s, "legacy")).toBe(false); // walls one short
    s.perms.walls = PERMS.find((p) => p.id === "walls")!.max;
    expect(buyPerm(s, "legacy")).toBe(true);
    expect(s.perms.legacy).toBe(1);
  });
});
